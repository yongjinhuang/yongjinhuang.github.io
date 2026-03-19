# Data Model: Chat System (WhatsApp)

A chat system requires real-time message delivery, offline support, and read receipts at massive scale. The data model splits across PostgreSQL for user/conversation metadata and Cassandra for messages and read status. Cassandra is chosen for messages because chat data is partitioned naturally by conversation, append-heavy, and requires high write throughput across global datacenters.

## Table Responsibilities

| Table                    | Purpose                                  | Storage    | Key Characteristic                                   |
| ------------------------ | ---------------------------------------- | ---------- | ---------------------------------------------------- |
| **users**                | User profiles and authentication         | PostgreSQL | Low-write, frequently joined                         |
| **conversations**        | Conversation metadata (group name, type) | PostgreSQL | Relatively static after creation                     |
| **conversation_members** | Membership and roles in conversations    | PostgreSQL | Updated on join/leave/mute                           |
| **messages**             | Message content and metadata             | Cassandra  | Partitioned by conversation, ordered by time DESC    |
| **message_status**       | Per-user delivery/read receipts          | Cassandra  | Partitioned by (conversation, user) for fast lookups |
| **user_conversations**   | Each user's conversation list (inbox)    | Cassandra  | Partitioned by user, ordered by last activity        |

## Detailed Field Descriptions

### users (PostgreSQL)

| Field          | Type                   | Description                                                                                                                     |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| user_id        | BIGINT, PK (Snowflake) | Globally unique, time-sortable ID. Snowflake IDs embed timestamp + worker + sequence, avoiding coordination across datacenters. |
| username       | VARCHAR(50), UNIQUE    | Login handle. Unique constraint prevents duplicates.                                                                            |
| display_name   | VARCHAR(100)           | Displayed in chat UI. Can contain spaces and special characters unlike username.                                                |
| email          | VARCHAR(255)           | For account recovery and notifications.                                                                                         |
| phone          | VARCHAR(20), UNIQUE    | Primary identifier for WhatsApp-style systems. Phone verification prevents spam.                                                |
| avatar_url     | VARCHAR(500)           | CDN URL to profile picture. Stored as URL, not blob, to keep the database lean.                                                 |
| public_key     | TEXT                   | End-to-end encryption public key. Each device registers a key; the server never sees plaintext messages.                        |
| status_message | VARCHAR(200)           | "Hey there! I am using WhatsApp" equivalent.                                                                                    |

**Why Snowflake IDs?** Auto-increment IDs require a single coordinator, which is a bottleneck at global scale. Snowflake IDs are generated independently on each server while remaining globally unique and roughly time-ordered.

### conversations (PostgreSQL)

| Field           | Type                       | Description                                                                                                |
| --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| conversation_id | BIGINT, PK                 | Unique conversation identifier.                                                                            |
| type            | ENUM('direct','group')     | Direct messages have exactly 2 members. Groups can have up to 1024. Different UI and business rules apply. |
| name            | VARCHAR(100), NULLABLE     | Group name. Null for direct messages (UI shows the other user's name instead).                             |
| avatar_url      | VARCHAR(500), NULLABLE     | Group avatar. Null for direct messages.                                                                    |
| creator_id      | BIGINT, FK → users.user_id | Who created the conversation. For direct messages, the user who initiated.                                 |

### conversation_members (PostgreSQL)

| Field           | Type                   | Description                                                                                   |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| conversation_id | BIGINT, PK (composite) | FK → conversations. Part of composite primary key.                                            |
| user_id         | BIGINT, PK (composite) | FK → users. Together with conversation_id, ensures a user appears only once per conversation. |
| role            | ENUM('admin','member') | Admins can add/remove members, change group settings. Creator is auto-admin.                  |
| nickname        | VARCHAR(100), NULLABLE | Per-group display name override.                                                              |
| joined_at       | TIMESTAMP              | When the user joined. Messages before this time are hidden from the user.                     |
| muted_until     | TIMESTAMP, NULLABLE    | Suppresses push notifications until this time. Null means not muted.                          |

**Why composite PK instead of a surrogate key?** The composite key (conversation_id, user_id) naturally prevents duplicate memberships and serves as the most common lookup pattern.

### messages (Cassandra)

| Field           | Type                                        | Description                                                                                                              |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| conversation_id | BIGINT, PARTITION KEY                       | All messages for a conversation live on the same Cassandra node. Enables efficient range scans for "load more messages." |
| message_id      | BIGINT, CLUSTERING KEY DESC                 | Snowflake ID, sorted descending. DESC ordering means the latest messages are read first without a full scan.             |
| sender_id       | BIGINT                                      | Who sent the message. Not a FK in Cassandra (no joins), denormalized from users.                                         |
| message_type    | ENUM('text','image','video','file','voice') | Determines how the client renders the message. Media types include a URL in metadata.                                    |
| content         | TEXT                                        | Message text for text messages. For media, this is a caption. Encrypted end-to-end in production.                        |
| metadata        | MAP<TEXT, TEXT>                             | Flexible key-value store for media_url, file_size, dimensions, duration, etc. Avoids schema changes for new media types. |
| reply_to_id     | BIGINT, NULLABLE                            | References another message_id for threaded replies. Client fetches the referenced message for preview.                   |
| is_deleted      | BOOLEAN                                     | Soft delete for "delete for everyone." Content is cleared but the tombstone remains so other clients know to remove it.  |
| created_at      | TIMESTAMP                                   | When the message was created. Redundant with Snowflake ID timestamp but useful for TTL and display.                      |

**Why Cassandra for messages?** Messages are partitioned by conversation (natural partition key), append-heavy (writes far exceed updates), and need high availability across regions. Cassandra's log-structured merge tree is optimized for this workload.

**Why DESC clustering?** Users always see the most recent messages first. DESC ordering means "load page 1" reads the first N rows sequentially from disk without scanning past old messages.

### message_status (Cassandra)

| Field           | Type                              | Description                                                                                                   |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| conversation_id | BIGINT, PARTITION KEY (composite) | First part of composite partition key.                                                                        |
| user_id         | BIGINT, PARTITION KEY (composite) | Together with conversation_id, partitions status by "which user in which conversation."                       |
| message_id      | BIGINT, CLUSTERING KEY            | Which message this status refers to. Enables range scans: "all unread messages for user X in conversation Y." |
| status          | ENUM('sent','delivered','read')   | Progression: sent → delivered (reached device) → read (user opened). Only moves forward, never backward.      |
| updated_at      | TIMESTAMP                         | When the status last changed. Used for "last seen" indicators.                                                |

**Why partition by (conversation_id, user_id)?** The query "how many unread messages does user X have in conversation Y" needs to scan message_status for that specific partition. This key makes it a single-partition query.

### user_conversations (Cassandra)

| Field                | Type                           | Description                                                                                                                                      |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| user_id              | BIGINT, PARTITION KEY          | Each user's inbox lives on one partition.                                                                                                        |
| last_message_at      | TIMESTAMP, CLUSTERING KEY DESC | Sorts conversations by most recent activity. DESC means opening the app immediately shows the most active chats.                                 |
| conversation_id      | BIGINT                         | Which conversation this entry refers to.                                                                                                         |
| last_message_preview | TEXT                           | Truncated preview of the last message (e.g., "Hey, are you coming to..."). Denormalized to avoid fetching the messages table for the inbox view. |
| unread_count         | INT                            | Number of unread messages. Denormalized counter, updated on new message and on read receipt.                                                     |

**Why denormalize `last_message_preview` and `unread_count`?** The inbox screen is the most viewed page. Without denormalization, rendering it would require joining conversations → messages → message_status, which is impossible in Cassandra and expensive even in a relational DB at scale.

## ER Diagram

```
PostgreSQL Tables:
┌──────────────────────┐       ┌──────────────────────────┐
│       users           │       │    conversations          │
│──────────────────────│       │──────────────────────────│
│ user_id (PK)          │       │ conversation_id (PK)      │
│ username              │       │ type                      │
│ display_name          │       │ name                      │
│ email                 │       │ avatar_url                │
│ phone                 │       │ creator_id (FK)           │
│ avatar_url            │       └──────────────────────────┘
│ public_key            │                │
│ status_message        │                │ 1
└──────────────────────┘                │
         │                               │
         │ 1                             │
         │          ┌────────────────────┘
         │          │
         │     *    ▼    *
         └───┬──────────────────────────┐
             │  conversation_members     │
             │──────────────────────────│
             │ conversation_id (PK,FK)   │
             │ user_id (PK,FK)           │
             │ role                      │
             │ nickname                  │
             │ joined_at                 │
             │ muted_until              │
             └──────────────────────────┘

Cassandra Tables:
┌───────────────────────┐    ┌───────────────────────┐
│      messages          │    │   message_status       │
│───────────────────────│    │───────────────────────│
│ conversation_id (PK)   │    │ conversation_id (PK)   │
│ message_id (CK DESC)  │    │ user_id (PK)           │
│ sender_id              │    │ message_id (CK)        │
│ message_type           │    │ status                 │
│ content                │    │ updated_at             │
│ metadata               │    └───────────────────────┘
│ reply_to_id            │
│ is_deleted             │    ┌───────────────────────┐
│ created_at             │    │  user_conversations    │
└───────────────────────┘    │───────────────────────│
                              │ user_id (PK)           │
                              │ last_message_at (CK)   │
                              │ conversation_id        │
                              │ last_message_preview   │
                              │ unread_count           │
                              └───────────────────────┘

Relationships (logical, not enforced in Cassandra):
  users 1───* conversation_members *───1 conversations
  conversations 1───* messages
  (conversation, user) 1───* message_status
  users 1───* user_conversations
```

## Data Flow

### Sending a Message

```
1. User A types message, client encrypts with User B's public key
         │
         ▼
2. Client sends via WebSocket to connected Chat Server
         │
         ▼
3. Chat Server generates Snowflake message_id
         │
         ▼
4. Write to Cassandra (parallel):
   ├─ INSERT into messages (conversation_id, message_id, content...)
   ├─ UPDATE user_conversations for ALL members:
   │    set last_message_at = now, last_message_preview, unread_count++
   └─ INSERT message_status (sender → 'sent')
         │
         ▼
5. Publish event to Kafka topic: chat.messages.{conversation_id}
         │
         ▼
6. Fan-out Service reads Kafka, looks up conversation_members
         │
         ▼
7. For each member:
   ├─ If online: Route to their WebSocket server → deliver via WS
   │    └─ On receipt: update message_status → 'delivered'
   └─ If offline: Send push notification (APNs/FCM)
         │
         ▼
8. User B opens conversation:
   ├─ Client sends 'read' receipt via WebSocket
   ├─ Update message_status → 'read'
   └─ Reset unread_count in user_conversations
```

### Loading the Inbox

```
1. User opens app
         │
         ▼
2. Query user_conversations WHERE user_id = X
   (single partition scan, sorted by last_message_at DESC)
         │
         ▼
3. Return conversation list with previews and unread counts
   (no joins needed — everything is denormalized)
         │
         ▼
4. User taps a conversation
         │
         ▼
5. Query messages WHERE conversation_id = Y
   LIMIT 50 (first page, most recent due to DESC clustering)
         │
         ▼
6. Scroll up → query next page with message_id < last_seen_id
```

**Why Kafka between Chat Server and Fan-out?** The sending user's Chat Server should not be responsible for delivering to all recipients. Kafka decouples the write path from the delivery path, allowing independent scaling of each. It also provides durability: if the fan-out service crashes, messages are not lost.

**Why separate `messages` from `message_status`?** A message is written once but its status is updated per-recipient (sent → delivered → read). Mixing them would cause write amplification: every status update would rewrite the full message row in Cassandra.
