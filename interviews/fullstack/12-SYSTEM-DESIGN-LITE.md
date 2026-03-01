# System Design Lite

## Overview

Full-stack interviews increasingly include system design questions, but at a different scope than dedicated system design interviews. You will not be asked to design YouTube or Twitter from scratch. Instead, you will be asked to design features or systems at the scale of a typical product team: a blog platform, a task management app, a real-time notification feature. The expectation is that you can think beyond code -- reasoning about data models, APIs, architecture trade-offs, and scaling strategies while keeping the design practical and implementable.

This guide covers how to structure your answer, three complete design walkthroughs (blog platform, task management app, real-time chat), the common components you should reach for, and how to discuss trade-offs.

---

## Core Concepts

### 1. How to Structure Your Answer

Use a consistent framework so the interviewer can follow your thinking. Spend about 5 minutes on each step in a 30-minute design question.

**Step 1: Clarify Requirements (3-5 minutes)**

Ask questions to narrow the scope. Interviewers deliberately leave things vague to see if you can clarify.

- **Functional requirements:** What can users do? (CRUD, search, real-time updates)
- **Non-functional requirements:** How many users? How fast must it be? What is the availability target?
- **Constraints:** Are we building for mobile, web, or both? Do we need offline support?
- **Out of scope:** What are we explicitly NOT building?

**Step 2: Data Model (5 minutes)**

Define the core entities and their relationships. Start with the database schema.

- What are the main tables/collections?
- What are the relationships (one-to-one, one-to-many, many-to-many)?
- What indexes do we need for the query patterns?

**Step 3: API Design (5 minutes)**

Define the REST (or GraphQL) API endpoints.

- What are the endpoints? (CRUD + any special operations)
- What are the request/response shapes?
- How is authentication handled?
- What about pagination, filtering, sorting?

**Step 4: Architecture (5-10 minutes)**

Draw the high-level architecture.

- Client (browser/mobile) -> API gateway / load balancer -> application servers -> database
- What additional components do we need? (cache, queue, CDN, search index)
- How do components communicate?

**Step 5: Scaling and Trade-offs (5-10 minutes)**

Discuss what happens as the system grows.

- What is the bottleneck first? (Usually the database)
- How do we scale reads? (Caching, read replicas, CDN)
- How do we scale writes? (Sharding, write-behind, queues)
- What are the trade-offs of each decision?

### 2. Common Components to Reach For

These are the building blocks of most web architectures. Know when and why to use each.

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **CDN** | Cache static assets close to users | Images, JS/CSS bundles, static pages |
| **Load Balancer** | Distribute traffic across servers | Multiple application instances |
| **Application Cache (Redis)** | Cache frequently-read data | Session storage, hot data, rate limiting |
| **Message Queue (RabbitMQ/SQS)** | Decouple producers from consumers | Email sending, background jobs, event processing |
| **Search Index (Elasticsearch)** | Full-text search, faceted search | Product search, log search, content search |
| **Object Storage (S3)** | Store files and media | User uploads, backups, static assets |
| **Database Read Replicas** | Scale read queries | Read-heavy workloads |
| **Database Sharding** | Scale write queries and data volume | Data too large for one database |
| **WebSocket Server** | Real-time bidirectional communication | Chat, live updates, notifications |
| **Task Queue (Celery/Bull)** | Background job processing | Report generation, data processing |

### 3. Trade-off Discussions

Interviewers want to see that you can reason about trade-offs, not just pick the "right" answer.

**Common trade-offs in system design:**

| Decision | Option A | Option B |
|----------|----------|----------|
| SQL vs NoSQL | Strong consistency, rich queries, ACID | Flexible schema, horizontal scaling, eventual consistency |
| Cache | Fast reads, less DB load | Stale data, cache invalidation complexity |
| Sync vs Async | Simple, immediate feedback | Decoupled, resilient, handles spikes |
| Monolith vs Services | Simple, fast to build | Independent scaling, team autonomy |
| Polling vs WebSocket | Simple, stateless | Real-time, lower latency, stateful connections |
| Normalize vs Denormalize | Less storage, single source of truth | Faster reads, more complex writes |
| Consistency vs Availability | All users see the same data | System remains available during partitions |

---

## Practical Scenarios

### Design 1: Blog Platform

**Requirements Clarification:**

- Users can create, edit, and delete blog posts
- Posts support rich text (markdown), images, and tags
- Users can comment on posts
- Homepage shows a feed of recent posts
- Full-text search across posts
- Assume 100K registered users, 1K posts/day, 10K daily active readers

**Data Model:**

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE NOT NULL,
    content TEXT NOT NULL,           -- Markdown content
    excerpt VARCHAR(500),            -- Auto-generated or manual
    cover_image_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'draft',  -- draft, published, archived
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_status_published ON posts(status, published_at DESC)
    WHERE status = 'published';
CREATE INDEX idx_posts_slug ON posts(slug);

-- Tags (many-to-many)
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(60) UNIQUE NOT NULL
);

CREATE TABLE post_tags (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- Comments
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    parent_id UUID REFERENCES comments(id),  -- For nested replies
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON comments(post_id, created_at);
```

**API Design:**

```
# Posts
GET    /api/posts                    -- List published posts (paginated, filterable by tag)
GET    /api/posts/:slug              -- Get single post by slug
POST   /api/posts                    -- Create post (auth required)
PUT    /api/posts/:id                -- Update post (author only)
DELETE /api/posts/:id                -- Delete post (author only)
POST   /api/posts/:id/publish        -- Publish a draft

# Comments
GET    /api/posts/:postId/comments   -- List comments for a post
POST   /api/posts/:postId/comments   -- Add comment (auth required)
DELETE /api/comments/:id             -- Delete comment (author or post author)

# Search
GET    /api/search?q=query&tag=tag   -- Full-text search

# Users
GET    /api/users/:username          -- Public profile
GET    /api/users/:username/posts    -- Posts by user
```

**Architecture:**

```
                    ┌──────────┐
                    │   CDN    │ (images, static assets)
                    └────┬─────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
┌───┴───┐          ┌─────┴─────┐         ┌───┴───┐
│Browser│          │ Mobile App│         │  RSS  │
└───┬───┘          └─────┬─────┘         └───┬───┘
    │                    │                    │
    └────────┬───────────┘                    │
             │                                │
      ┌──────┴──────┐                         │
      │Load Balancer│ ◄───────────────────────┘
      └──────┬──────┘
             │
      ┌──────┴──────┐
      │  API Server │ (Node.js / Go)
      │  (x2-3)     │
      └──┬───┬───┬──┘
         │   │   │
    ┌────┘   │   └────┐
    │        │        │
┌───┴───┐ ┌──┴──┐ ┌───┴────────┐
│Postgres│ │Redis│ │Elasticsearch│
│  (DB)  │ │Cache│ │  (Search)  │
└────────┘ └─────┘ └────────────┘
                        ▲
                        │ (async sync via queue)
                   ┌────┴────┐
                   │  Queue  │
                   │(RabbitMQ)│
                   └─────────┘
```

**Key decisions and trade-offs:**

1. **Markdown stored as-is, rendered on read.** Alternative: pre-render and cache HTML. Trade-off: storing markdown is simpler and allows re-rendering with updated styles, but costs CPU on every read. Solution: cache rendered HTML in Redis.

2. **Elasticsearch for search.** When a post is published or updated, enqueue a job to index it in Elasticsearch. There is a brief delay between publishing and searchability (eventual consistency), but search quality is much better than SQL `LIKE` queries.

3. **CDN for images.** Users upload images to object storage (S3). The CDN caches and serves them from edge locations close to readers. This is much cheaper and faster than serving from the application server.

4. **Redis for caching.** Cache the homepage feed, popular posts, and tag listings. Invalidate on write. Cache TTL of 5 minutes is a good default -- blog content is not highly time-sensitive.

**Scaling discussion:**

At 100K users and 1K posts/day, a single Postgres instance is more than sufficient. The first bottleneck will be read traffic on popular posts. Solution: Redis cache + CDN. If the platform grows to millions of users, add Postgres read replicas for non-cached queries.

---

### Design 2: Task Management App

**Requirements Clarification:**

- Users create projects and add tasks to them
- Tasks have title, description, status, priority, assignee, due date
- Users can reorder tasks (drag-and-drop)
- Users can filter and sort tasks
- Real-time updates: when one user changes a task, others see it immediately
- Assume team size of 5-50 users per project, up to 10K projects total

**Data Model:**

```sql
-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project membership
CREATE TABLE project_members (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',  -- owner, admin, member, viewer
    PRIMARY KEY (project_id, user_id)
);

-- Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'todo',  -- todo, in_progress, review, done
    priority VARCHAR(10) DEFAULT 'medium',  -- low, medium, high, urgent
    assignee_id UUID REFERENCES users(id),
    reporter_id UUID NOT NULL REFERENCES users(id),
    due_date DATE,
    position FLOAT NOT NULL,  -- For ordering within a status column
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

-- Activity log
CREATE TABLE task_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,  -- created, status_changed, assigned, etc.
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_task ON task_activities(task_id, created_at DESC);
```

**API Design:**

```
# Projects
GET    /api/projects                         -- List user's projects
POST   /api/projects                         -- Create project
GET    /api/projects/:id                     -- Get project details
PUT    /api/projects/:id                     -- Update project
DELETE /api/projects/:id                     -- Delete project

# Tasks
GET    /api/projects/:projectId/tasks        -- List tasks (filterable, sortable)
POST   /api/projects/:projectId/tasks        -- Create task
GET    /api/tasks/:id                        -- Get task detail
PUT    /api/tasks/:id                        -- Update task
DELETE /api/tasks/:id                        -- Delete task
PATCH  /api/tasks/:id/move                   -- Move task (change status and/or position)

# Real-time
WS     /ws/projects/:projectId               -- WebSocket for live updates

# Activity
GET    /api/tasks/:id/activities             -- Task activity history
```

**Handling Drag-and-Drop Ordering:**

The `position` field uses floating-point numbers to allow insertion between existing tasks without rewriting all positions.

```typescript
// When moving a task between two others:
// Task A has position 1.0
// Task B has position 2.0
// Insert between them: new position = 1.5

// API handler
async function moveTask(taskId: string, body: MoveTaskInput) {
  const { status, afterTaskId, beforeTaskId } = body;

  let newPosition: number;

  if (!afterTaskId && !beforeTaskId) {
    // Moving to the top
    const firstTask = await db.tasks.findFirst({
      where: { projectId, status },
      orderBy: { position: 'asc' },
    });
    newPosition = firstTask ? firstTask.position / 2 : 1000;
  } else if (!beforeTaskId) {
    // Moving to the bottom
    const afterTask = await db.tasks.findUnique({ where: { id: afterTaskId } });
    newPosition = afterTask.position + 1000;
  } else if (!afterTaskId) {
    // Moving to the top
    const beforeTask = await db.tasks.findUnique({ where: { id: beforeTaskId } });
    newPosition = beforeTask.position / 2;
  } else {
    // Moving between two tasks
    const afterTask = await db.tasks.findUnique({ where: { id: afterTaskId } });
    const beforeTask = await db.tasks.findUnique({ where: { id: beforeTaskId } });
    newPosition = (afterTask.position + beforeTask.position) / 2;
  }

  const updatedTask = await db.tasks.update({
    where: { id: taskId },
    data: { status, position: newPosition, updatedAt: new Date() },
  });

  // Broadcast to WebSocket subscribers
  broadcastToProject(updatedTask.projectId, {
    type: 'task.moved',
    task: updatedTask,
  });

  return updatedTask;
}
```

**Real-Time Architecture:**

```
Browser ──WebSocket──► WS Server ──pub/sub──► Redis
                                                │
Browser ──WebSocket──► WS Server ───────────────┘
                                                │
Browser ──WebSocket──► WS Server ───────────────┘
```

Each WebSocket server subscribes to a Redis Pub/Sub channel per project. When a task is updated (via any server), the update is published to Redis, which fans it out to all connected servers, which push it to connected clients.

```typescript
// Real-time update flow
// 1. Client updates task via REST API
// 2. API server saves to database
// 3. API server publishes event to Redis
// 4. All WS servers subscribed to that project receive the event
// 5. WS servers push the event to connected clients

// WebSocket server
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';

const subscriber = new Redis();
const publisher = new Redis();

// Map of projectId -> Set of WebSocket connections
const projectSubscriptions = new Map<string, Set<WebSocket>>();

function handleConnection(ws: WebSocket, projectId: string) {
  // Add to subscription
  if (!projectSubscriptions.has(projectId)) {
    projectSubscriptions.set(projectId, new Set());
    subscriber.subscribe(`project:${projectId}`);
  }
  projectSubscriptions.get(projectId).add(ws);

  ws.on('close', () => {
    const subs = projectSubscriptions.get(projectId);
    subs?.delete(ws);
    if (subs?.size === 0) {
      projectSubscriptions.delete(projectId);
      subscriber.unsubscribe(`project:${projectId}`);
    }
  });
}

// Receive events from Redis and broadcast to WebSocket clients
subscriber.on('message', (channel, message) => {
  const projectId = channel.replace('project:', '');
  const clients = projectSubscriptions.get(projectId);
  if (clients) {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
});

// Called from REST API after task update
function broadcastToProject(projectId: string, event: object) {
  publisher.publish(`project:${projectId}`, JSON.stringify(event));
}
```

**Scaling discussion:**

At 10K projects with 5-50 users each, a single Postgres instance and a few WebSocket servers behind a load balancer is sufficient. The first bottleneck will be WebSocket connections if many users are online simultaneously. Each WebSocket server can handle ~10K connections, so 3-5 servers cover the initial load. Redis Pub/Sub handles cross-server message routing efficiently.

---

### Design 3: Real-Time Chat Feature

**Requirements Clarification:**

- One-on-one and group chat (up to 50 members per group)
- Messages: text, images, file attachments
- Read receipts and typing indicators
- Message history with infinite scroll
- Online/offline status (presence)
- Assume 50K daily active users, average 100 messages/user/day

**Data Model:**

```sql
-- Conversations (both 1:1 and group)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL,  -- 'direct' or 'group'
    name VARCHAR(200),          -- Group name (null for direct)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation membership
CREATE TABLE conversation_members (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),  -- For read receipts
    PRIMARY KEY (conversation_id, user_id)
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT,
    message_type VARCHAR(20) DEFAULT 'text',  -- text, image, file
    attachment_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

-- Partition messages by time for performance
-- In production, consider partitioning by conversation_id or date range

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);
```

**API Design:**

```
# Conversations
GET    /api/conversations                         -- List user's conversations
POST   /api/conversations                         -- Create conversation
GET    /api/conversations/:id                     -- Get conversation details

# Messages (REST for history, WebSocket for real-time)
GET    /api/conversations/:id/messages?before=cursor  -- Message history (cursor pagination)
POST   /api/conversations/:id/messages             -- Send message (also via WebSocket)

# Real-time (all via WebSocket)
WS     /ws/chat

# WebSocket message types (client -> server):
# { type: "message", conversationId: "...", content: "Hello" }
# { type: "typing", conversationId: "..." }
# { type: "read", conversationId: "...", messageId: "..." }

# WebSocket message types (server -> client):
# { type: "new_message", message: { ... } }
# { type: "typing", conversationId: "...", userId: "..." }
# { type: "read_receipt", conversationId: "...", userId: "...", messageId: "..." }
# { type: "presence", userId: "...", status: "online" | "offline" }
```

**Architecture:**

```
┌────────┐     ┌────────────┐     ┌──────────────┐
│ Client │────►│   Nginx    │────►│  API Server  │──► Postgres
│        │     │   (LB)     │     │  (REST)      │
└───┬────┘     └────────────┘     └──────────────┘
    │
    │          ┌────────────┐     ┌──────────────┐
    └─────────►│   Nginx    │────►│  WS Server   │──► Redis (Pub/Sub)
               │   (LB)     │     │  (x3-5)      │
               └────────────┘     └──────┬───────┘
                                         │
                                    ┌────┴────┐
                                    │  Redis  │
                                    │(Presence│
                                    │+ PubSub)│
                                    └─────────┘
```

**Presence System:**

```typescript
// presence.ts -- Track who is online using Redis

const PRESENCE_TTL = 60; // seconds

async function setOnline(userId: string) {
  await redis.setex(`presence:${userId}`, PRESENCE_TTL, 'online');
}

async function setOffline(userId: string) {
  await redis.del(`presence:${userId}`);
}

async function isOnline(userId: string): Promise<boolean> {
  const status = await redis.get(`presence:${userId}`);
  return status === 'online';
}

async function getOnlineUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of userIds) {
    pipeline.get(`presence:${id}`);
  }
  const results = await pipeline.exec();

  return userIds.filter((_, i) => results[i][1] === 'online');
}

// Heartbeat: client sends a ping every 30 seconds
// If no heartbeat received, presence key expires after 60 seconds
function handleHeartbeat(ws: WebSocket, userId: string) {
  setOnline(userId);
}
```

**Message Flow:**

```
1. Client sends message via WebSocket
2. WS server validates and saves to Postgres
3. WS server publishes to Redis Pub/Sub: channel = conversation:{id}
4. All WS servers subscribed to that conversation receive the message
5. WS servers push to all connected members of that conversation
6. If a member is offline, message is stored in Postgres (they'll load it on reconnect)
7. Push notification sent to offline users via a background job
```

**Cursor-based pagination for message history:**

```typescript
// Message history with cursor pagination
async function getMessages(conversationId: string, before?: string, limit = 50) {
  const whereClause = before
    ? 'AND m.created_at < (SELECT created_at FROM messages WHERE id = $3)'
    : '';

  const params = before
    ? [conversationId, limit, before]
    : [conversationId, limit];

  const messages = await db.query(`
    SELECT m.id, m.content, m.message_type, m.attachment_url,
           m.created_at, m.sender_id, u.username, u.avatar_url
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = $1 ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT $2
  `, params);

  const hasMore = messages.length === limit;
  const nextCursor = hasMore ? messages[messages.length - 1].id : null;

  return {
    messages: messages.reverse(), // Return in chronological order
    hasMore,
    nextCursor,
  };
}
```

**Scaling discussion:**

At 50K DAU with 100 messages/user/day, that is 5M messages/day or ~58 messages/second. A single Postgres instance handles this easily. The bottleneck will be WebSocket connections. With ~50K concurrent connections across 5 WS servers, each handles ~10K connections, which is comfortable for most WebSocket libraries.

For further scale (millions of users), partition messages by conversation_id or time range. Consider using a dedicated message store (Cassandra or ScyllaDB) optimized for time-series append patterns.

---

## Interview Questions

### Question 1: How do you decide between SQL and NoSQL for a new project?

**Answer:**

Start with SQL (PostgreSQL) unless you have a specific reason not to. SQL databases provide:

- Strong consistency and ACID transactions
- Rich query capabilities (JOINs, aggregations, window functions)
- Well-understood tooling and operational practices
- Flexible enough for most use cases

Choose NoSQL when:

- **Document store (MongoDB):** Your data is naturally document-shaped, schema varies per record, and you rarely need cross-document joins. Example: content management where each content type has different fields.
- **Key-value store (Redis, DynamoDB):** You need extremely low latency for simple lookups, caching, or session storage.
- **Wide-column store (Cassandra, ScyllaDB):** You need massive write throughput and can model your queries upfront. Example: event logging, time-series data, IoT sensor data.
- **Graph database (Neo4j):** Your core queries traverse relationships (social networks, recommendation engines, fraud detection).

In practice, most full-stack applications use SQL as the primary database with Redis for caching and session storage. This covers 90% of use cases.

### Question 2: How do you handle pagination in an API?

**Answer:**

Two approaches:

**Offset-based pagination:**

```
GET /api/posts?page=3&limit=20
```

The server runs `SELECT * FROM posts LIMIT 20 OFFSET 40`. Simple to implement, allows jumping to any page, but has two problems: performance degrades on high offsets (the database must scan and discard `offset` rows), and results shift when new items are inserted.

**Cursor-based pagination:**

```
GET /api/posts?limit=20&cursor=eyJpZCI6MTAwfQ==
```

The cursor encodes the position (e.g., the ID or timestamp of the last item returned). The server runs `SELECT * FROM posts WHERE created_at < $cursor ORDER BY created_at DESC LIMIT 20`. No offset penalty, stable results regardless of insertions, but cannot jump to an arbitrary page.

**When to use which:**

- Offset: Admin interfaces, tables with small datasets, when users need page numbers
- Cursor: Infinite scroll, feeds, real-time data, large datasets, mobile apps

### Question 3: When would you add a cache, and what caching strategy would you use?

**Answer:**

Add a cache when you observe repeated reads of the same data that is expensive to compute or slow to fetch. Do not add caching preemptively -- measure first.

**Common strategies:**

**Cache-aside (lazy loading):**
1. Check cache. If hit, return cached value.
2. If miss, read from database, write to cache with a TTL, return value.
- Pros: Simple, only caches what is actually requested
- Cons: First request is always slow (cache miss), data can become stale until TTL expires

**Write-through:**
1. Write to cache and database simultaneously on every write.
- Pros: Cache is always up to date
- Cons: Every write is slower (two writes), cache may store data that is never read

**Write-behind (write-back):**
1. Write to cache immediately, asynchronously write to database.
- Pros: Fastest writes
- Cons: Risk of data loss if cache crashes before database write

**Cache invalidation:**
The hardest problem. Options:
- TTL-based: Set a time-to-live. Accept staleness within the TTL window.
- Event-based: Invalidate or update cache when the underlying data changes (via application logic or database triggers).
- Versioned keys: Include a version number in the cache key. Bump the version to invalidate.

For most full-stack applications, cache-aside with TTL-based expiration is the right starting point.

### Question 4: How do you design an API for a feature that needs real-time updates?

**Answer:**

Three approaches, in order of complexity:

**Polling:** Client sends a request every N seconds. Simple, works everywhere, but wasteful (most responses are "no change") and has latency equal to the polling interval.

**Server-Sent Events (SSE):** Server pushes data to the client over a single HTTP connection. Simple, works with HTTP/2 multiplexing, automatic reconnection built into the browser API. Good for one-way data flow (notifications, live scores, stock prices).

**WebSockets:** Full-duplex bidirectional communication over a single TCP connection. Required when the client also needs to send frequent messages (chat, collaborative editing, gaming).

**Decision:**

- Notifications, live dashboards, activity feeds: SSE (simpler, one-way)
- Chat, collaborative editing, real-time multiplayer: WebSocket (bidirectional)
- Infrequent updates, simple requirements: Polling (simplest)

For WebSocket at scale, use Redis Pub/Sub to coordinate messages across multiple WebSocket server instances. Each server subscribes to channels for its connected users. When a message is published, Redis fans it out to all subscribed servers.

### Question 5: Walk me through designing a notification system.

**Answer:**

**Requirements:** Users receive notifications for mentions, replies, and system announcements. Notifications can be delivered via in-app, email, and push. Users can mark notifications as read.

**Data model:**

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,        -- mention, reply, system
    title VARCHAR(200) NOT NULL,
    body TEXT,
    data JSONB,                        -- Flexible payload (link, entity IDs)
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at)
    WHERE read_at IS NULL;
```

**Architecture:**

1. An event occurs (user is mentioned in a comment)
2. The application publishes a `UserMentioned` event to a message queue
3. A notification worker consumes the event and:
   a. Creates a notification record in the database
   b. Pushes to WebSocket/SSE for in-app real-time delivery
   c. Enqueues an email notification (with a delay for batching)
   d. Sends a push notification to mobile devices (via FCM/APNs)
4. User preferences determine which channels are enabled

**Key design decisions:**

- Use a message queue to decouple notification generation from delivery
- Batch email notifications (e.g., collect mentions over 5 minutes, send one email)
- Allow users to configure notification preferences per type and channel
- Use SSE (not WebSocket) for the in-app notification stream (one-way data)
- Store unread count in Redis for fast badge updates

### Question 6: How do you handle file uploads in a full-stack application?

**Answer:**

**Never upload files through your API server to your database.** Instead, upload directly to object storage (S3, GCS) using presigned URLs.

**Flow:**

1. Client requests a presigned upload URL from the API server
2. API server generates a presigned URL with constraints (max size, allowed content types, expiration)
3. Client uploads directly to S3 using the presigned URL (API server is not involved)
4. Client notifies the API server that the upload is complete, providing the S3 key
5. API server validates the upload (checks it exists, verifies content type via file magic bytes) and records the metadata

**Why this approach:**

- API server is not a bottleneck for large file transfers
- Scales naturally (S3 handles the load)
- Reduces API server memory usage (no large file buffers)
- Supports resumable uploads for large files

```typescript
// Generate presigned upload URL
async function getUploadUrl(req, res) {
  const { filename, contentType } = req.body;

  const key = `uploads/${req.user.id}/${randomUUID()}/${sanitizeFilename(filename)}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  res.json({
    uploadUrl,
    key,
    expiresIn: 300,
  });
}
```

---

## Code Examples

### Example 1: Complete REST API with Pagination, Filtering, and Sorting

```typescript
// routes/posts.ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../database';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  tag: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at', 'title']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

router.get('/api/posts', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const offset = (query.page - 1) * query.limit;

  let whereConditions = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.status) {
    whereConditions = [...whereConditions, `p.status = $${paramIndex}`];
    params.push(query.status);
    paramIndex++;
  }

  if (query.tag) {
    whereConditions = [...whereConditions, `EXISTS (
      SELECT 1 FROM post_tags pt
      JOIN tags t ON pt.tag_id = t.id
      WHERE pt.post_id = p.id AND t.slug = $${paramIndex}
    )`];
    params.push(query.tag);
    paramIndex++;
  }

  if (query.search) {
    whereConditions = [...whereConditions,
      `(p.title ILIKE $${paramIndex} OR p.excerpt ILIKE $${paramIndex})`
    ];
    params.push(`%${query.search}%`);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) FROM posts p WHERE ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count);

  const postsResult = await db.query(
    `SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_url,
            p.status, p.published_at, p.created_at,
            u.username as author_username, u.avatar_url as author_avatar
     FROM posts p
     JOIN users u ON p.author_id = u.id
     WHERE ${whereClause}
     ORDER BY p.${query.sort} ${query.order}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, query.limit, offset],
  );

  res.json({
    data: postsResult.rows,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

export default router;
```

### Example 2: Optimistic UI Update Pattern (Frontend)

```typescript
// hooks/useUpdateTask.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Task {
  id: string;
  title: string;
  status: string;
  position: number;
}

interface UpdateTaskInput {
  taskId: string;
  updates: Partial<Task>;
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, updates }: UpdateTaskInput) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },

    // Optimistic update: update the UI immediately before the server responds
    onMutate: async ({ taskId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', projectId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks', projectId]);

      // Optimistically update to the new value
      queryClient.setQueryData<Task[]>(['tasks', projectId], (old) => {
        if (!old) return old;
        return old.map(task =>
          task.id === taskId ? { ...task, ...updates } : task
        );
      });

      return { previousTasks };
    },

    // If the mutation fails, roll back to the previous value
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', projectId], context.previousTasks);
      }
    },

    // After success or error, refetch to ensure cache is consistent
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}
```

### Example 3: Rate-Limited API Client with Retry

```typescript
// lib/api-client.ts
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      // Retry on rate limit (429) and server errors (5xx)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(
              retryConfig.baseDelayMs * Math.pow(2, attempt),
              retryConfig.maxDelayMs,
            );
        await sleep(delay);
        continue;
      }

      if (response.status >= 500 && attempt < retryConfig.maxRetries) {
        const delay = Math.min(
          retryConfig.baseDelayMs * Math.pow(2, attempt),
          retryConfig.maxDelayMs,
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < retryConfig.maxRetries) {
        const delay = Math.min(
          retryConfig.baseDelayMs * Math.pow(2, attempt),
          retryConfig.maxDelayMs,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Quick Reference

### System Design Answer Framework

```
1. REQUIREMENTS (3-5 min)
   - Functional: What can users do?
   - Non-functional: Scale, latency, availability
   - Constraints: Platform, compliance, budget
   - Out of scope: What are we NOT building?

2. DATA MODEL (5 min)
   - Core entities and relationships
   - Database choice and justification
   - Key indexes for query patterns

3. API DESIGN (5 min)
   - RESTful endpoints
   - Request/response shapes
   - Auth, pagination, error handling

4. ARCHITECTURE (5-10 min)
   - High-level component diagram
   - Data flow for key operations
   - Additional components (cache, queue, CDN)

5. SCALING & TRADE-OFFS (5-10 min)
   - Current bottlenecks
   - Scaling strategies
   - Trade-offs of each decision
```

### When to Use What

| Need | Solution |
|------|----------|
| Fast reads of hot data | Redis cache |
| Full-text search | Elasticsearch |
| Background jobs | Message queue + workers |
| File storage | Object storage (S3) + CDN |
| Real-time one-way | Server-Sent Events |
| Real-time bidirectional | WebSocket + Redis Pub/Sub |
| Scale reads | Database read replicas + cache |
| Scale writes | Sharding or write-optimized store |

### Database Decision Quick Guide

| Requirement | Choose |
|-------------|--------|
| Transactions, JOINs, complex queries | PostgreSQL |
| Document-shaped data, flexible schema | MongoDB |
| Key-value lookups, caching | Redis |
| Time-series, high write throughput | Cassandra, TimescaleDB |
| Graph traversal | Neo4j |
| Full-text search | Elasticsearch |

### Pagination Quick Reference

| Type | URL | Best For |
|------|-----|----------|
| Offset | `?page=3&limit=20` | Admin tables, small datasets |
| Cursor | `?cursor=abc123&limit=20` | Feeds, infinite scroll, large datasets |
| Keyset | `?after_id=100&limit=20` | Simple cursor based on primary key |

### Estimation Cheat Sheet

| Metric | Approximate Value |
|--------|-------------------|
| 1 day | ~100K seconds |
| 1 million requests/day | ~12 requests/second |
| 1 GB stored | ~1 billion characters of text |
| Average web page | ~2-3 MB |
| Average API response | ~1-10 KB |
| Redis read latency | < 1ms |
| Database read latency | 1-10ms |
| Cross-region network latency | 50-150ms |
| CDN cache hit latency | 10-50ms |

### Key Takeaways

1. **Start simple.** A monolith with Postgres, Redis, and a CDN handles more scale than you think.
2. **Clarify requirements first.** The design for 1K users is different from 1M users. Ask.
3. **Design for the data model.** Most system design problems are really data modeling problems.
4. **Cache the right things.** Cache frequently-read, rarely-written data. Use TTL to manage staleness.
5. **Push work to the background.** If the user does not need to wait for it, use a queue.
6. **Use presigned URLs for file uploads.** Never proxy large files through your API server.
7. **Trade-offs matter more than the "right" answer.** Every design decision has pros and cons. Articulate them.
8. **Draw a diagram.** Even a simple box-and-arrow diagram makes your thinking 10x clearer to the interviewer.
