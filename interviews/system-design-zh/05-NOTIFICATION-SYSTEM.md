# 设计通知系统

## 1. 需求澄清

### 功能需求

| 需求 | 描述 |
|---|---|
| 多渠道投递 | Push 通知 (iOS/Android)、SMS、邮件、应用内通知 |
| 实时通知 | 在触发事件后数秒内投递 |
| 定时通知 | 支持未来时间点投递 |
| 用户偏好 | 按渠道开启/关闭、免打扰时段、频率上限 |
| 模板系统 | 可复用模板，支持变量替换和本地化 |
| 通知分组 | 将相关通知批量合并为摘要 |
| 投递追踪 | 追踪已发送、已投递、已打开、已点击状态 |
| 优先级别 | 不同紧急程度对应不同 SLA |

### 非功能需求

| 需求 | 目标 |
|---|---|
| 延迟 | 软实时，P0/P1 < 5 秒 |
| 投递保证 | 至少一次投递 |
| 可用性 | 99.99% 正常运行时间 |
| 可扩展性 | 每天数十亿条通知 |
| 容错性 | 无单点故障 |
| 幂等性 | 防止重复通知 |
| 可观测性 | 端到端追踪和指标 |

### 规模估算

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

### 粗略计算

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

## 2. 通知类型与渠道

### 渠道概览

#### Push 通知 (APNs / FCM)

Push 通知通过 Apple Push Notification Service (APNs) 投递到 iOS 设备，通过 Firebase Cloud Messaging (FCM) 投递到 Android 设备。

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

通过电信运营商发送的短文本消息。用于 OTP、安全警报和关键事务消息。

```
Constraints:
  - 160 characters (GSM-7) or 70 characters (UCS-2/Unicode)
  - Concatenated messages: up to 1600 characters (10 segments)
  - Country-specific regulations (TCPA, GDPR)
  - Sender ID or short code registration required
```

#### 邮件 (SendGrid / SES)

支持 HTML、附件和追踪像素的富内容通知。

```
Components:
  - Subject line
  - HTML body (with plain-text fallback)
  - Headers (List-Unsubscribe, Reply-To)
  - Tracking pixel for open tracking
  - Click-tracking URL rewriting
```

#### 应用内通知

通过 WebSocket 或 SSE 连接在应用 UI 内实时显示的通知。

```
Delivery methods:
  - WebSocket (persistent bidirectional connection)
  - Server-Sent Events (unidirectional, simpler)
  - Long polling (fallback)

Stored in notification feed for later retrieval.
```

### 渠道对比表

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

*  Push 在提供商侧免费；基础设施成本另计。
** 仅当用户在应用内活跃时。
```

### 渠道选择策略

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

## 3. 高层设计

### 系统架构图

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

### 组件职责

| 组件 | 职责 |
|---|---|
| Notification Service API | 接收通知请求、校验、去重、渲染模板、路由到队列 |
| Priority Queue (Kafka) | 解耦生产者与消费者、支持背压、按分区有序投递 |
| Channel Workers | 从队列消费、按渠道格式化载荷、调用第三方 API |
| Template Engine | 使用变量渲染模板、处理本地化 |
| User Preference Store | 存储开启/关闭、免打扰时段、频率上限（缓存在 Redis 中） |
| Delivery Tracker | 记录每条通知的投递尝试、成功、失败 |
| WebSocket Server | 维持持久连接，用于应用内实时投递 |

---

## 4. 数据模型

### 实体关系

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

### SQL Schema 定义

```sql
-- Users 表（与通知相关的核心用户数据）
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

-- 用于 Push 通知的设备令牌
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

-- 用户通知偏好
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

-- 通知模板
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

-- 通知表（主记录）
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

-- 按月分区以便管理
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

-- 投递日志（追踪每次投递尝试）
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

## 5. 详细设计

### 5.1 通知流程

#### 逐步流程

```
1. 事件触发
   某个服务（如消息服务）产生一个通知事件。

2. API 请求
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

3. 校验与去重
   - 校验请求 schema
   - 检查 idempotency_key 是否与近期通知重复
   - 如果重复，返回已有通知 ID

4. 用户偏好检查
   - 从 Redis 缓存加载用户偏好（回退到数据库）
   - 过滤掉已关闭的渠道
   - 根据用户时区检查免打扰时段
   - 验证频率上限是否已超出

5. 模板渲染
   - 为用户的区域设置和每个渠道加载模板
   - 将变量替换到模板中
   - 验证渲染输出（长度限制等）

6. 优先级分配与路由
   - 根据通知优先级分配到优先级队列
   - 将消息发布到相应的 Kafka topic

7. 队列消费
   - Worker 按优先级顺序从队列消费
   - P0 以最高并发量消费

8. 渠道特定投递
   - 为目标提供商格式化载荷
   - 调用第三方 API（APNs、FCM、Twilio、SendGrid）
   - 在 delivery_log 中记录投递尝试

9. 投递追踪
   - 更新通知状态（sent -> delivered -> opened -> clicked）
   - 处理来自提供商的投递回执 webhook

10. 分析
    - 将指标发送到时序数据库
    - 更新聚合计数器
```

#### 时序图

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

#### API 契约

```
POST /api/v1/notifications

Request:
{
  "user_id": "uuid",
  "user_ids": ["uuid"],              // 用于批量发送（与 user_id 互斥）
  "template": "template_name",
  "channels": ["push", "email"],     // 可选，默认为所有已启用渠道
  "priority": 1,                     // 0-3
  "category": "social",
  "variables": {                     // 模板变量
    "key": "value"
  },
  "payload": {                       // 额外数据
    "deep_link": "app://path",
    "image_url": "https://..."
  },
  "idempotency_key": "unique_key",
  "scheduled_at": "2026-03-01T10:00:00Z"  // 可选，用于定时投递
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

### 5.2 优先级系统

#### 优先级别

```
┌──────────┬───────────────────────────┬──────────┬──────────────────┬───────────────┐
│ 优先级   │ 示例                      │ SLA      │ 队列             │ 重试策略      │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P0       │ OTP、安全警报、           │ < 1s     │ notifications.p0 │ 3次，立即     │
│ 关键     │ 欺诈警告                  │          │ (dedicated)      │ 重试          │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P1       │ 私信、@提及、             │ < 5s     │ notifications.p1 │ 5次，指数     │
│ 高       │ 订单确认                  │          │                  │ 退避          │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P2       │ 点赞、评论、关注、        │ < 30s    │ notifications.p2 │ 3次，指数     │
│ 中       │ 好友请求                  │          │                  │ 退避          │
├──────────┼───────────────────────────┼──────────┼──────────────────┼───────────────┤
│ P3       │ 营销、摘要、              │ < 5min   │ notifications.p3 │ 2次，延迟     │
│ 低       │ 推荐                      │          │ (batch-friendly) │               │
└──────────┴───────────────────────────┴──────────┴──────────────────┴───────────────┘
```

#### 每个优先级的队列架构

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

#### Worker 分配策略

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

### 5.3 模板系统

#### 模板存储与版本管理

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

#### 变量替换

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

#### 各渠道模板示例

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

#### 本地化支持

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

### 5.4 用户偏好

#### 按渠道开启/关闭

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

#### 免打扰时段

```
免打扰时段逻辑：

  用户时区：America/New_York (UTC-5)
  免打扰时段：22:00 - 08:00

  时间线：
  ─────────────────────────────────────────────────────
  00:00    08:00         22:00    24:00
    │ QUIET  │   ACTIVE    │ QUIET  │
  ─────────────────────────────────────────────────────

  通知在 23:30 UTC 到达：
    → 转换为用户时间：18:30 EST → ACTIVE → 立即发送

  通知在 04:00 UTC 到达：
    → 转换为用户时间：23:00 EST → QUIET → 延迟到 08:00 EST

  例外：P0（关键）通知绕过免打扰时段。
```

#### 频率上限

```
频率上限示例：

  全局：     每天最多 20 条跨所有渠道
  Push：     每天最多 10 条 Push 通知
  邮件：     每天最多 3 封邮���
  营销：     每周最多 1 条营销通知

  基于 Redis 的实现：

  Key:   freq:{user_id}:{channel}:{category}:{date}
  Value: count (integer)
  TTL:   24 hours (auto-cleanup)

  发送前：
    INCR freq:user_123:push:social:2026-03-01
    If result > cap → reject
    Else → proceed with delivery
```

---

## 6. 可靠性与投递保证

### 至少一次投递

```
系统通过以下方式保证至少一次投递：

1. 持久化消息队列（Kafka，replication factor 3）
2. Consumer offset 管理（仅在成功投递后提交）
3. 对暂时性失败的重试机制
4. 对永久性失败的死信队列

流程：
  Producer ──► Kafka (acks=all) ──► Consumer ──► Provider
                                        │
                                   成功时：
                                   commit offset
                                        │
                                   失败时：
                                   不提交 commit
                                   消息重新投递
```

### 去重（幂等键）

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

### 指数退避重试

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

### 死信队列

```
失败通知流程：

  Main Queue ──► Worker ──► Provider
                   │
              所有重试
              已耗尽？
                   │
              ┌────┴────┐
              │  是      │ 否 → 重试
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
  │ (人工审查        │    │
  │  + 告警)         │    │
  └──────────────────┘    │

DLQ 包含：
  - 原始通知载荷
  - 所有尝试的错误信息
  - 每次尝试的时间戳
  - 提供商响应码
  - Worker 实例 ID
```

### 投递追踪与回执

```
通知生命周期状态：

  pending ──► queued ──► sending ──► sent ──► delivered ──► opened ──► clicked
                                       │                       │
                                       └──► failed ◄──────────┘
                                       │                    (bounce)
                                       └──► cancelled

用于投递回执的 Webhook 处理：

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

  APNs：使用 APNs feedback service 检测无效令牌。
```

---

## 7. 速率限制与节流

### 每用户速率限制

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

### 每渠道速率限制（提供商限制）

```
提供商速率限制（必须遵守）：

┌────────────┬────────────────────────────────────────────┐
│ 提供商     │ 速率限制                                   │
├────────────┼────────────────────────────────────────────┤
│ APNs       │ 无严格限制，但高流量时会节流。             │
│            │ 建议：每个 topic < 100K/sec                │
├────────────┼────────────────────────────────────────────┤
│ FCM        │ 每项目 1,000 msg/sec（可申请增加）。       │
│            │ Batch API：500 messages/call               │
├────────────┼────────────────────────────────────────────┤
│ Twilio     │ 每个电话号码 1 msg/sec (SMS)               │
│            │ 每个 messaging service 100 msg/sec         │
├────────────┼────────────────────────────────────────────┤
│ SendGrid   │ 取决于套餐。典型值：10K-100K/sec           │
├────────────┼────────────────────────────────────────────┤
│ AWS SES    │ 默认：14 emails/sec（可申请增加到           │
│            │ 1000+/sec）                                │
├────────────┼────────────────────────────────────────────┤
│ AWS SNS    │ SMS：因国家而异 (1-20 msg/sec)             │
│            │ 软限制：20 SMS/sec (US)                    │
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

### 频率上限

```
每用户每日/每周上限：

  全局每日上限：       50 notifications/day
  Push 每日上限：      20/day
  邮件每日上限：       5/day
  营销每周上限：       3/week
  社交每日上限：       30/day

  实现：

  Redis keys:
    freq:daily:{user_id}:{channel}    TTL: end of day (user TZ)
    freq:weekly:{user_id}:marketing   TTL: end of week
    freq:daily:{user_id}:global       TTL: end of day

  发送前：
    1. INCR freq:daily:{user_id}:global
    2. If > 50 → drop (log reason)
    3. INCR freq:daily:{user_id}:{channel}
    4. If > channel_cap → drop
    5. INCR freq:{period}:{user_id}:{category}
    6. If > category_cap → drop
    7. Proceed with delivery

  超出上限时的选项：
    a) 静默丢弃（记录日志用于分析）
    b) 排队等待摘要投递
    c) 降级到较不打扰的渠道
```

---

## 8. 扩展性

### Kafka 分区策略

```
按 user_id 分区以确保每个用户的顺序性：

  Topic: notifications.p1
  Partitions: 12
  Partition key: user_id

  分区分配：
    hash(user_id) % num_partitions → partition number

  这保证了：
    ✓ 同一用户的所有通知进入同一分区
    ✓ 每用户有序投递
    ✓ 均匀分布（假设用户 ID 分布均匀）

  扩展分区：
    100M notifications/day = ~1,157/sec average, ~11,570/sec peak

    按每分区 1,000 messages/sec 吞吐量：
      P0: 16 partitions → 16,000 msg/sec capacity
      P1: 12 partitions → 12,000 msg/sec capacity
      P2:  8 partitions →  8,000 msg/sec capacity
      P3:  4 partitions →  4,000 msg/sec capacity
      Total: 40 partitions → 40,000 msg/sec capacity

  热分区缓解：
    - 如果单个用户产生大量消息（如名人被提及），
      使用复合键：user_id + notification_type
    - 或将高流量用户路由到专用溢出 topic
```

### Worker 自动扩缩

```
基于队列深度和消费者延迟的自动扩缩：

  监控的指标：
    - Consumer group lag（消息积压量）
    - 每条消息的平均处理时间
    - 每个 Worker 的错误率

  扩缩规则：

  ┌─────────────┬──────────────────────┬──────────────────────────────┐
  │ 指标        │ 阈值                 │ 动作                         │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Lag         │ > 10,000 (P0)        │ 扩容 50%                     │
  │             │ > 50,000 (P1)        │ 扩容 50%                     │
  │             │ > 200,000 (P2/P3)    │ 扩容 25%                     │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ Lag         │ < 100 持续 10 分钟   │ 缩容 25%                     │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ 错误率      │ 每 Worker > 10%      │ 对该 Worker 触发熔断         │
  │             │ 全集群 > 30%         │ 告警 + 暂停消费              │
  ├─────────────┼──────────────────────┼──────────────────────────────┤
  │ 延迟        │ p99 > 2x SLA         │ 扩容 25%                     │
  └─────────────┴──────────────────────┴──────────────────────────────┘

  Kubernetes HPA 配置（概念性）：
    minReplicas: 4
    maxReplicas: 64
    metrics:
      - kafka consumer lag
      - CPU utilization (secondary)
    scaleUpPeriod: 30s
    scaleDownPeriod: 300s
    scaleDownStabilization: 600s
```

### 数据库分片

```
通知表的分片策略：

  主分片键：user_id
  分片数量：16 shards（可扩展）

  分片分配：
    shard_id = consistent_hash(user_id) % num_shards

  优点：
    ✓ 用户的通知共置（查询高效）
    ✓ 均匀分布
    ✓ 每个分片独立扩展

  每个分片的 Schema：
    notifications_shard_00
    notifications_shard_01
    ...
    notifications_shard_15

  每个分片进一步按 created_at（按月）分区：
    notifications_shard_00_2026_01
    notifications_shard_00_2026_02
    ...

  查询路由：
    SELECT * FROM notifications WHERE user_id = ?
    → 路由到分片：consistent_hash(user_id) % 16
    → 在分片内：查询正确的月度分区

  跨分片查询（管理/分析）：
    → 并行扇出到所有分片
    → 聚合结果
    → 或者使用包含全量数据的只读副本进行分析
```

```
投递日志分片：

  分片键：notification_id（与通知共置）
  保留期：主存储 30 天，归档到冷存储

  冷存储 (S3/GCS)：
    分区依据：date/channel/status
    格式：Parquet（列式存储，分析高效）
    保留期：1 年
```

### 用户偏好缓存

```
缓存层级：

  L1：进程内缓存（Worker 本地）
      大小：10K 最近活跃用户
      TTL：60 秒
      淘汰策略：LRU

  L2：Redis 集群
      大小：全部 10M 用户（~10 GB）
      TTL：1 小时
      失效方式：偏好更新时写透

  L3：PostgreSQL（数据源）
      在 L2 缓存未命中时查询

  缓存键格式：
    user_prefs:{user_id}

  缓存值 (JSON)：
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

  失效流程：
    用户更新偏好
    → 写入 PostgreSQL
    → 删除 Redis key（惰性重新加载）
    → 发布失效事件到 Kafka
    → 所有 Worker 清除该用户的 L1 缓存
```

---

## 9. 监控与分析

### 关键指标

```
投递指标：
┌──────────────────────┬──────────────────────────────────────────────┐
│ 指标                 │ 描述                                         │
├──────────────────────┼──────────────────────────────────────────────┤
│ delivery_rate        │ 成功投递的通知百分比                         │
│ open_rate            │ 已投递通知中被打开的百分比                   │
│ click_rate           │ 已打开通知中有点击行为的百分比               │
│ bounce_rate          │ 退信/退回的通知百分比（邮件/SMS）            │
│ opt_out_rate         │ 收到通知后选择退出的用户百分比               │
│ unsubscribe_rate     │ 每个通知活动的退订量                         │
└──────────────────────┴──────────────────────────────────────────────┘

延迟指标：
┌──────────────────────┬──────────────────────────────────────────────┐
│ 指标                 │ 目标                                         │
├──────────────────────┼──────────────────────────────────────────────┤
│ e2e_latency_p50      │ < 500ms (P0), < 2s (P1)                    │
│ e2e_latency_p95      │ < 1s (P0), < 5s (P1)                       │
│ e2e_latency_p99      │ < 3s (P0), < 10s (P1)                      │
│ queue_wait_time_p95  │ < 100ms (P0), < 1s (P1)                    │
│ provider_latency_p95 │ < 500ms (push), < 2s (email), < 3s (SMS)   │
└──────────────────────┴──────────────────────────────────────────────┘

系统健康指标：
┌──────────────────────┬──────────────────────────────────────────────┐
│ 指标                 │ 告警阈值                                     │
├──────────────────────┼──────────────────────────────────────────────┤
│ queue_depth          │ > 100K (P0), > 500K (P1)                   │
│ consumer_lag         │ 持续增长超过 5 分钟                          │
│ error_rate           │ 每渠道 > 5%                                  │
│ dlq_growth           │ > 100 messages/hour                         │
│ provider_errors      │ 每提供商 > 1%                                │
│ worker_cpu           │ 持续 > 80%                                   │
│ redis_memory         │ > 80% 容量                                   │
└──────────────────────┴──────────────────────────────────────────────┘
```

### 每渠道错误追踪

```
错误分类：

  Push：
    - InvalidToken（移除设备令牌，停止重试）
    - ExpiredToken（刷新令牌，重试）
    - PayloadTooLarge（记录日志，不重试）
    - ServiceUnavailable（退避重试）
    - TopicDisabled（记录日志，告警）

  SMS：
    - InvalidNumber（标记用户电话无效）
    - CarrierBlocked（尝试备用运营商）
    - RateLimited（退避，重试）
    - InsufficientFunds（告警运维团队）
    - Unreachable（退避重试）

  邮件：
    - HardBounce（标记邮箱无效，停止发送）
    - SoftBounce（最多重试 3 次）
    - SpamComplaint（自动取消用户订阅）
    - Throttled（退避，重试）
    - InvalidAddress（标记无效）

错误处理代码：

  function classifyError(channel, errorCode):
    if isRetryable(channel, errorCode):
      return { action: 'RETRY', delay: calculateBackoff() }
    if isTokenInvalid(channel, errorCode):
      return { action: 'INVALIDATE_TOKEN' }
    if isPermanentFailure(channel, errorCode):
      return { action: 'DLQ', alert: errorCode.severity === 'HIGH' }
    return { action: 'LOG_AND_SKIP' }
```

### 通知内容 A/B 测试

```
A/B 测试框架：

  实验定义：
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

  分配：
    variant = variants[hash(user_id + experiment_id) % total_weight]

  追踪：
    对每条通知记录：
      - experiment_id
      - variant_id
      - delivered (boolean)
      - opened (boolean)
      - clicked (boolean)
      - timestamp

  分析（每日任务）：
    - 计算每个变体的 open_rate
    - 运行统计显著性检验（卡方检验）
    - 当显著性 > 95% 时自动推广优胜方案
```

### 仪表板

```
实时仪表板面板：

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

## 10. 部署架构

### 多区域部署

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
        │     每个区域包含：                        │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Notification Service (API)        │  │              │
        │  │   ├── ALB 后 3+ 实例                │  │              │
        │  │   └── Auto-scaling group            │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Kafka Cluster                     │  │              │
        │  │   ├── 6 brokers                     │  │              │
        │  │   ├── 跨区域复制                     │  │              │
        │  │   │   (MirrorMaker 2)               │  │              │
        │  │   └── 3 天保留期                     │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   Worker Fleet                      │  │              │
        │  │   ├── Push workers (8-64)           │  │              │
        │  │   ├── Email workers (4-32)          │  │              │
        │  │   ├── SMS workers (4-16)            │  │              │
        │  │   └── In-app workers (4-32)         │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        │  ┌─────────────────────────────────────┐  │              │
        │  │   数据存储                           │  │              │
        │  │   ├── PostgreSQL (主/副本)           │  │              │
        │  │   ├── Redis cluster (6 nodes)       │  │              │
        │  │   └── S3/GCS (模板、归档)            │  │              │
        │  └─────────────────────────────────────┘  │              │
        │                                           │              │
        └───────────────────────────────────────────┘              │
                                                                   │
                              跨区域复制                            │
                    ┌─────────────────────────────────────────────┘
                    │
                    ▼
        ┌─────────────────────────────────────┐
        │   跨区域同步                         │
        │   ├── Kafka MirrorMaker 2           │
        │   │   （异步复制）                   │
        │   ├── PostgreSQL 逻辑               │
        │   │   复制（用户偏好）               │
        │   ├── Redis cluster 跨区域同步      │
        │   └── 模板通过 S3                    │
        │       跨区域复制同步                 │
        └─────────────────────────────────────┘
```

### 故障切换策略

```
故障切换场景及处理方式：

1. 单个 Worker 故障
   ─────────────────────
   检测：健康检查失败（Kubernetes liveness probe）
   动作：Pod 自动重启
   影响：Kafka 将分区重新分配给剩余 Worker
   RTO：< 30 秒

2. 提供商故障（如 FCM 宕机）
   ──────────────────────────────────
   检测：某提供商 60 秒内错误率 > 50%
   动作：熔断器打开
              → 消息排队到重试 topic
              → 发送告警给值班人员
              → 如果有备用提供商则切换
   影响：受影响渠道投递延迟
   RTO：提供商恢复后自动恢复

3. Kafka Broker 故障
   ─────────────────────
   检测：ISR（In-Sync Replicas）数量下降
   动作：自动选举 leader（replication factor 3）
   影响：短暂的消费中断（< 10 秒）
   RTO：< 10 秒

4. 整个区域故障
   ────────────────────
   检测：Global LB 的健康检查失败
   动作：Route53 故障切换到备用区域
              → 备用区域 Kafka 已有复制数据
              → 备用区域 Worker 接管
   影响：部分通知可能重复（至少一次投递）
   RTO：< 60 秒（DNS 传播）

5. 数据库故障
   ─────────────────
   检测：连接主库超时
   动作：将只读副本提升为主库
              → 更新连接字符串
              → 切换期间 Worker 使用缓存的偏好
   影响：偏好短暂处于只读状态
   RTO：< 120 秒

熔断器配置：

  ┌─────────────────────────────────────────────────────────┐
  │                   CIRCUIT BREAKER                       │
  │                                                         │
  │  状态：CLOSED ──► OPEN ──► HALF-OPEN ──► CLOSED        │
  │                                                         │
  │  CLOSED → OPEN：                                        │
  │    触发条件：60 秒窗口内失败率 > 50%                     │
  │    或：> 100 次连续失败                                  │
  │                                                         │
  │  OPEN → HALF-OPEN：                                     │
  │    等待：30 秒冷却期                                     │
  │    动作：允许 5 个探测请求通过                            │
  │                                                         │
  │  HALF-OPEN → CLOSED：                                   │
  │    触发条件：5 个探测请求中 4 个成功                      │
  │                                                         │
  │  HALF-OPEN → OPEN：                                     │
  │    触发条件：5 个探测请求中 2 个失败                      │
  └─────────────────────────────────────────────────────────┘
```

---

## 11. 常见面试追问

### 如何处理通知风暴（病毒式事件）？

```
问题：一个病毒式帖子在几秒内产生数百万条通知。
         例如：名人发帖 → 1000万粉丝每人收到一条通知。

解决方案：

1. 检测
   - 监控队列深度增长率
   - 当单个事件产生 > 100K 通知时告警
   - 尽早识别"扇出"事件

2. 背压
   - Kafka 天然提供背压机制
   - Worker 以可持续的速率消费
   - 优先级队列确保 P0/P1 不被 P2/P3 饿死

3. 渐进式扇出
   不一次性产生 1000万条消息：

   事件：名人发帖
     → 向 "fan-out" topic 产生 1 条消息
     → Fan-out Worker 分批读取粉丝列表（每次 1000 个）
     → 限流分批产生通知
     → 总扇出耗时 5-10 分钟，而非瞬间涌入

   ┌────────┐    ┌──────────┐    ┌──────────────┐    ┌─────────┐
   │ Event  │───>│ Fan-out  │───>│  Batch 1     │───>│ Workers │
   │        │    │ Queue    │    │  (1K users)   │    │         │
   │        │    │          │───>│  Batch 2     │───>│         │
   │        │    │          │    │  (1K users)   │    │         │
   │        │    │          │───>│  ...         │───>│         │
   │        │    │          │    │  Batch 10K   │    │         │
   └────────┘    └──────────┘    └──────────────┘    └─────────┘

4. 智能降级
   - 如果队列深度 > 阈值，自动将 P3 降级为摘要
   - 将同一事件的多条通知合并为一条
   - "Alice 和其他 4,999 人赞了你的帖子"

5. 自动扩缩
   - Kubernetes HPA 根据队列深度扩展 Worker
   - 为预期的病毒式事件预配容量
   - 使用 Spot/可抢占实例应对突发流量
```

### 如何实现摘要/批量处理？

```
摘要系统：将多条通知聚合为一条摘要。

摘要类型：
  - 基于时间：每 15 分钟 / 1 小时 / 每天
  - 基于数量：累计 5 条未读通知后
  - 混合型：    以先到者为准

架构：

  ┌───────────────────────────────────────────────────────┐
  │                  DIGEST SYSTEM                        │
  │                                                       │
  │  通知到达                                             │
  │       │                                               │
  │       ▼                                               │
  │  该用户是否符合摘要条件？                              │
  │  （偏好 + 类别检查）                                   │
  │       │                                               │
  │  ┌────┴────┐                                          │
  │  │  是     │  否 → 立即发送                            │
  │  ▼         │                                          │
  │  添加到摘要缓冲区（Redis sorted set）                  │
  │  Key: digest:{user_id}:{category}                     │
  │  Score: timestamp                                     │
  │  Value: notification payload                          │
  │       │                                               │
  │  检查触发条件：                                        │
  │  ┌────┴────────────────────┐                          │
  │  │ 数量 >= 阈值？          │ ──是──► 刷新摘要          │
  │  │ 距首条的时间            │                          │
  │  │   >= 间隔？             │ ──是──► 刷新摘要          │
  │  │ 两者都不满足？          │ ──否──► 等待              │
  │  └────────────────────────┘                           │
  │                                                       │
  │  刷新摘要：                                            │
  │    1. 读取缓冲区中所有项目                              │
  │    2. 渲染摘要模板                                      │
  │    3. 作为单条通知发送                                  │
  │    4. 清空缓冲区                                        │
  └───────────────────────────────────────────────────────┘

  定时任务（每 5 分钟）：
    - 扫描所有年龄 > max_interval 的摘要缓冲区
    - 刷新任何超出时间阈值的缓冲区

  摘要模板示例（邮件）：
    Subject: "5 new activities on your post"
    Body:
      - Alice liked your post (2 min ago)
      - Bob commented: "Great!" (5 min ago)
      - Carol shared your post (10 min ago)
      - 2 more activities...
      [View all activity →]
```

### 如何追踪通知效果？

```
追踪管道：

  1. 投递追踪（服务端）
     - 记录：queued → sent → delivered → failed
     - 来源：提供商 API 响应 + webhooks

  2. 打开追踪
     邮件：1x1 追踪像素
       <img src="https://track.example.com/open?id=notif_123" />
     Push：用户点击通知打开应用
       → 应用上报：POST /api/v1/notifications/notif_123/opened
     应用内：组件可见性观察器

  3. 点击追踪
     邮件：URL 重写
       原始：https://example.com/product/456
       追踪：https://track.example.com/click?id=notif_123&url=...
     Push：Deep link handler 上报点击
     应用内：onClick handler

  4. 转化追踪
     将通知关联到下游行为：
       notification_id → 用户打开应用 → 完成购买
       归因窗口：通知投递后 24 小时

  5. 聚合
     每日批处理任务按以下维度聚合：
       - 模板
       - 渠道
       - 类别
       - 用户分群
       - 时间段

  关键指标：
    CTR（点击率）= clicks / delivered
    转化率 = conversions / delivered
    退出率 = 24 小时内退出数 / delivered
    每通知收入 = 归因收入 / delivered
```

### 如何处理退订？

```
退订流程：

  1. 一键退订（邮件，法律要求）
     Email header: List-Unsubscribe: <https://example.com/unsub?token=xxx>
     Email header: List-Unsubscribe-Post: List-Unsubscribe=One-Click

     点击后：
       → 验证 token
       → 更新 user_preferences：channel=email, category=X, enabled=false
       → 使 Redis 缓存失效
       → 返回确认页面
       → 记录退订事件用于分析

  2. 细粒度偏好页面
     https://example.com/notification-preferences?token=xxx

     显示：
       ┌──────────────────────────────────────────┐
       │  通知偏好                                │
       │                                          │
       │  Push 通知                               │
       │  ├── 消息              [ON]  [OFF]       │
       │  ├── 社交动态          [ON]  [OFF]       │
       │  ├── 营销              [ON]  [OFF]       │
       │  └── 产品更新          [ON]  [OFF]       │
       │                                          │
       │  邮件                                    │
       │  ├── 消息              [ON]  [OFF]       │
       │  ├── 社交动态          [ON]  [OFF]       │
       │  ├── 每周摘要          [ON]  [OFF]       │
       │  └── 营销              [ON]  [OFF]       │
       │                                          │
       │  SMS                                     │
       │  ├── 安全警报          [ON]  [always on] │
       │  └── 营销              [ON]  [OFF]       │
       │                                          │
       │  [退订全部]                               │
       └──────────────────────────────────────────┘

  3. 合规性
     - CAN-SPAM：必须在 10 个工作日内执行退订
     - GDPR：必须提供便捷的退出机制
     - TCPA：SMS 营销需要明确同意
     - 实现：同步处理退订（立即生效）

  4. 重新参与
     退订后，定期提供重新订阅的机会：
       - 30 天后应用内提示
       - "你正在错过..." （但绝不通过已退订的渠道发送）
```

### 如何实现带图片的富通知？

```
各渠道的富通知支持：

1. iOS 富 Push（Notification Service Extension）
   载荷：
   {
     "aps": {
       "alert": { "title": "New photo", "body": "Alice shared a photo" },
       "mutable-content": 1
     },
     "media_url": "https://cdn.example.com/images/thumb_123.jpg",
     "media_type": "image"
   }

   iOS Notification Service Extension 会在展示前
   下载图片并附加到通知上。

   要求：
     - 图片必须 < 10 MB
     - 支持格式：JPEG、PNG、GIF
     - 必须使用 HTTPS
     - 推荐缩略图：最大 1038 x 1038 像素

2. Android 富 Push（FCM BigPictureStyle）
   载荷：
   {
     "message": {
       "notification": {
         "title": "New photo",
         "body": "Alice shared a photo",
         "image": "https://cdn.example.com/images/thumb_123.jpg"
       }
     }
   }

   要求：
     - 图片由系统自动下载
     - 推荐：2:1 宽高比
     - 最大尺寸：1 MB（推荐 200 KB）

3. 邮件富内容
   - 通过 CID 或托管 URL 内联图片
   - 响应式 HTML 模板
   - 预览文本（preheader text）
   - 兼容暗色模式的样式

4. 图片处理管道
   当通知需要图片时：
     1. 在通知载荷中提供源图片 URL
     2. 图片处理服务创建缩略图：
        - Push iOS：1038x1038
        - Push Android：800x400
        - 邮件：600px 宽
     3. 上传到 CDN 并设置缓存头
     4. 在通知载荷中包含 CDN URL
     5. 在 CDN 上设置 TTL（与通知相关性窗口匹配）

   ┌──────────┐    ┌──────────┐    ┌─────┐    ┌──────────┐
   │ Source   │───>│ Image    │───>│ CDN │───>│ Device   │
   │ Image    │    │ Resizer  │    │     │    │ renders  │
   └──────────┘    └──────────┘    └─────┘    └──────────┘
```

---

## 面试总结清单

```
设计通知系统时，需要涵盖以下方面：

  [x] 需求与规模估算
  [x] 多渠道支持（Push、SMS、邮件、应用内）
  [x] 基于消息队列的异步架构
  [x] 基于优先级的处理
  [x] 带本地化的模板系统
  [x] 用户偏好和免打扰时段
  [x] 至少一次投递与去重
  [x] 指数退避重试 + 死信队列
  [x] 速率限制（每用户 + 每提供商）
  [x] 频率上限
  [x] 带分区/分片的数据库设计
  [x] 偏好缓存策略
  [x] 监控与分析
  [x] 多区域部署
  [x] 故障切换与熔断器

需要讨论的关键权衡取舍：
  - 至少一次 vs 精确一次投递
  - 延迟 vs 成本（SMS 昂贵但可靠）
  - Push vs Pull 应用内通知
  - 即时 vs 批量/摘要投递
  - 单队列 vs 优先级队列
  - 单体通知服务 vs 按渠道的微服务
```
