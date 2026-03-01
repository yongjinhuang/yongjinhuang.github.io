# Instant Messaging & Real-time Chat

## What Is It?

Instant messaging (IM) is the ability for users to exchange text, images, videos, and files in real time through your application. It covers everything from a simple 1:1 conversation between two people to large group chats with hundreds of participants, complete with read receipts, typing indicators, presence status, and push notifications. At the protocol level, real-time chat relies on persistent connections -- typically WebSockets -- so that messages arrive instantly without the client constantly polling the server. From a business perspective, chat is one of the stickiest features you can build. Once users start communicating inside your product, they have a strong reason to keep coming back.

Whether you're building a standalone messaging app, adding customer support chat to an e-commerce site, or embedding team communication into a SaaS product, the underlying patterns are remarkably similar. The differences lie in scale, compliance requirements, and how much you invest in features like end-to-end encryption, message search, and moderation. The core challenge is always the same: deliver messages reliably, instantly, and in order -- across unreliable networks, multiple devices, and potentially millions of concurrent users.

## Why Should You Care?

Chat is everywhere. Slack, Discord, WhatsApp, Intercom, Zendesk -- users expect real-time messaging as a baseline feature in most digital products. If your product involves any form of collaboration, marketplace transactions, customer support, or community interaction, chat will come up in planning conversations sooner or later.

For developers, building a chat system touches almost every part of the stack: persistent connections, message storage and indexing, push notification infrastructure, media upload pipelines, presence tracking, encryption, and moderation. Understanding how these pieces fit together makes you effective in system design interviews and in production.

For product and business teams, chat directly impacts engagement metrics, support resolution time, and user retention. A poorly built chat system -- one with lost messages, delayed notifications, or no moderation tools -- can damage trust faster than almost any other feature. And the numbers back this up: apps with in-product messaging see 2-3x higher retention rates, and customer support chat typically resolves issues 40-60% faster than email.

The build vs buy decision is also significant. Managed chat SDKs (Stream, Sendbird, PubNub) can get you to production in days, but they charge per monthly active user and you give up control over your data. Building from scratch gives you full control but requires significant engineering investment in infrastructure you'll need to maintain forever. Most teams start with a managed solution and only consider building custom when they hit scale, cost, or customization limits.

## How It Works (The Business Flow)

### The Message Lifecycle

```
Sender types → Typing indicator broadcast → Message sent
    → Server receives → Store in database → Deliver to recipient(s)
        → Delivery confirmation → Recipient reads → Read receipt sent back
```

### Step 1: Connection Establishment

When a user opens your app, the client establishes a persistent WebSocket connection to your messaging server. This connection stays open as long as the user is active. The server tracks which users are connected and on which devices. If the user has multiple devices (phone, laptop, tablet), each device maintains its own connection. The server uses this connection map for real-time delivery and presence tracking.

The connection is authenticated -- the client sends a token (usually a JWT) during the WebSocket handshake. The server validates this token before accepting the connection. Without authentication at the connection level, anyone could subscribe to other users' messages.

For environments where WebSockets are blocked (certain corporate firewalls, older proxies), fall back to Server-Sent Events (SSE) or long-polling. These are slower but universally supported.

### Step 2: Sending a Message

The sender composes a message and hits send. The client generates a temporary client-side ID (for optimistic UI updates) and transmits the message over the WebSocket. The server receives it, assigns a permanent server-side message ID and timestamp, stores it in the message database, and then fans out the message to all recipients. In a 1:1 chat, there is one recipient. In a group chat, the server iterates through the member list and delivers to each connected member.

Each message carries a delivery state that progresses through a clear pipeline: **pending** (client generated, not yet sent) to **sent** (server received and stored) to **delivered** (arrived on recipient's device) to **read** (recipient viewed). The sender's UI updates at each stage.

### Step 3: Delivery and Read Receipts

Once the recipient's device receives the message, it sends a delivery acknowledgment back to the server. The server updates the message status from "sent" to "delivered" and notifies the sender. When the recipient actually views the message (the chat window is open and the message is visible on screen), a read receipt is sent. The familiar pattern: one checkmark (sent), two checkmarks (delivered), blue checkmarks (read).

In group chats, read receipts get more complex. You need to track per-member read status. Most implementations track a "read up to" cursor per user per conversation rather than individual read receipts per message -- this dramatically reduces storage and network overhead.

### Step 4: Offline Handling and Push Notifications

If a recipient is offline (no active WebSocket connection), the server queues the message and fires a push notification through APNs (Apple) or FCM (Google). When the user comes back online, the client syncs all missed messages from the server. This sync uses a cursor or timestamp-based approach -- "give me everything after my last received message ID."

Push notification content should be carefully managed. Show enough to be useful (sender name, message preview) without exposing sensitive content on a lock screen. Many apps let users configure notification privacy -- showing "New message from Alice" instead of the actual message text.

### Step 5: Media Sharing

When a user sends an image, video, or file, the client uploads the media to object storage (S3, GCS, or a CDN). Once uploaded, the client sends a message containing the media URL and metadata (file type, dimensions, thumbnail URL, file size). The server stores and delivers this message like any text message. Recipients download the media from the CDN.

For images, generating thumbnails server-side before delivery avoids forcing clients to download full-resolution files in the chat list. For videos, generate a preview thumbnail and consider transcoding to web-friendly formats. Set file size limits (typically 25-100 MB for chat) and validate file types server-side to prevent abuse.

### Step 6: Presence and Typing Indicators

Presence (online/offline/away) is tracked via the WebSocket connection. When a connection drops, the server marks the user as offline after a brief grace period (typically 30-60 seconds, to handle brief network hiccups). Typing indicators are lightweight events sent over the WebSocket when a user starts and stops typing. These are ephemeral -- they are never stored in the database, only broadcast to the other participants in the conversation.

Typing indicators should include debouncing logic on the client: send a "started typing" event when the user begins, then a "stopped typing" event after 3-5 seconds of inactivity. Without debouncing, you flood the WebSocket with unnecessary events.

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **WebSocket** | A persistent, bidirectional connection between client and server. The backbone of real-time chat. Unlike HTTP, the server can push data to the client without the client asking |
| **Presence** | A user's online status -- online, offline, away, do not disturb. Derived from active connections and user-set preferences |
| **Typing Indicator** | An ephemeral signal broadcast to chat participants when someone is composing a message. Never persisted |
| **Read Receipt** | Confirmation that a recipient has seen a message. Triggered when the message becomes visible in the recipient's viewport |
| **Delivery Receipt** | Confirmation that a message reached the recipient's device, even if they haven't opened the chat yet |
| **Fan-out** | The process of distributing a single message to multiple recipients in a group chat. Can be fan-out-on-write (push to all at send time) or fan-out-on-read (recipients pull when they open the chat) |
| **Message Queue** | A buffer (e.g., Kafka, RabbitMQ, Redis Streams) that decouples message ingestion from delivery. Absorbs traffic spikes and ensures no messages are lost |
| **Push Notification** | An alert sent to a user's device when they're not actively using the app. Delivered via APNs (iOS) or FCM (Android/web) |
| **End-to-End Encryption (E2EE)** | Encryption where only the sender and recipient can read the message. The server sees only ciphertext. Used by Signal, WhatsApp, and iMessage |
| **Idempotency Key** | A unique identifier (usually the client-generated message ID) that prevents duplicate messages if the client retries a send due to network issues |
| **Thread / Reply** | A message linked to a parent message, creating a sub-conversation within a chat. Reduces noise in busy group chats |
| **Conversation / Channel** | The container for a set of messages and participants. Can be 1:1 (direct message) or group (multiple members) |
| **Message Retention Policy** | Rules governing how long messages are stored. Important for compliance (HIPAA, GDPR) and storage cost management |
| **Webhook** | An HTTP callback triggered by chat events (new message, user joined). Used to integrate bots and external services |
| **SSE (Server-Sent Events)** | A one-way persistent connection from server to client. Simpler than WebSockets but only supports server-to-client push |
| **Long-Polling** | The client sends a request that the server holds open until new data is available. A fallback when WebSockets and SSE are unavailable |

## Common Patterns

### Pattern 1: Fan-out on Write for Small Groups, Fan-out on Read for Large Channels

In a 1:1 chat or small group (under 100 members), write the message to each recipient's inbox at send time. This makes reads fast -- each user just queries their own inbox. For large channels (thousands of members), this approach creates too many writes. Instead, store the message once in the channel and let recipients read from the channel when they open it.

Most production systems use a hybrid: fan-out-on-write for direct messages and small groups, fan-out-on-read for large public channels. Slack, Discord, and Teams all use variations of this pattern.

### Pattern 2: Optimistic UI with Server Reconciliation

Display the message in the sender's chat window immediately, before the server confirms. Assign it a temporary client ID and a "sending" state. When the server responds with the permanent ID and timestamp, reconcile the temporary entry. If the send fails, show a retry button. This pattern makes chat feel instant even on slow networks. Every major messaging app uses it.

### Pattern 3: End-to-End Encryption with the Signal Protocol

For sensitive communication, encrypt messages on the sender's device so only the intended recipient can decrypt them. The Signal Protocol (used by Signal, WhatsApp, and others) uses a double-ratchet algorithm that provides forward secrecy -- even if a key is compromised, past messages remain encrypted. The trade-off: the server cannot index or search message content, which limits features like server-side search, link previews, and content moderation. E2EE also complicates multi-device support because keys must be securely shared across a user's devices.

### Pattern 4: Bot and Automation Integration

Bots participate in conversations just like human users. They connect via WebSocket or receive events via webhooks. Common bot patterns include command-based bots (respond to /slash commands), event-driven bots (auto-respond to keywords or new member joins), and scheduled bots (send daily summaries or reminders). Bots should have clear visual indicators so users know they're not talking to a person. Many businesses use bots for onboarding flows, FAQ responses, ticket creation, order status lookups, and appointment scheduling.

### Pattern 5: Chat Moderation Pipeline

In any community or marketplace chat, you need moderation. Build a pipeline: incoming messages pass through automated filters (profanity, spam, link blocking, phone number detection), then flagged messages go to a moderation queue for human review. For real-time chat, automated filters must be fast (under 50ms) to avoid delaying message delivery. Store moderation decisions for audit trails. Give moderators tools to mute users, ban accounts, delete messages, and shadow-ban repeat offenders with a single click.

Consider a tiered approach: auto-block obvious violations (slurs, known spam patterns), auto-flag borderline content for human review, and let everything else through. This keeps the moderation queue manageable while still catching the worst content in real time.

### Pattern 6: Message Search with Full-Text Indexing

Users expect to search their chat history. Store messages in a search-optimized index (Elasticsearch, OpenSearch, or PostgreSQL full-text search). Index message text, sender, timestamp, and conversation ID. Support filters like "messages from Alice in the last 30 days" and "messages with attachments." For E2EE chats, search must happen client-side since the server can't read message content -- this means building a local index on the device, which is significantly more limited.

### Pattern 7: Conversation Pagination and Lazy Loading

Chat history can span years and millions of messages. Never load an entire conversation at once. Load the most recent N messages (typically 20-50) when the user opens a chat, then load older messages in pages as the user scrolls up. Use cursor-based pagination (not offset-based) for consistent performance regardless of conversation size.

### Pattern 8: Unread Count and Badge Management

Every chat app needs unread counts -- both per-conversation and a global total. Maintain a counter per user per conversation that increments on new messages and resets when the user reads the conversation. The global badge count (the red number on the app icon) is the sum of all per-conversation unread counts. Keep these counters in a fast store like Redis, not computed on the fly from the message database. Badge counts drive push notification badges on iOS and Android, so they need to stay in sync across your entire system.

## Common Pitfalls

1. **Not handling message ordering correctly.** Network delays mean messages can arrive out of order. Use server-assigned timestamps or sequence numbers for ordering, not client timestamps. Display messages in server-determined order, not arrival order.

2. **Duplicate messages on retry.** If a client retries a failed send, the server may process it twice. Use idempotency keys (client-generated message IDs) so the server can detect and discard duplicates.

3. **Presence storms at scale.** If 10,000 users are online and one goes offline, broadcasting that status change to everyone who can see it creates a thundering herd of updates. Batch presence updates, use probabilistic presence (update every 30 seconds instead of instantly), or limit presence visibility to active conversations only.

4. **Unbounded group sizes without fan-out strategy changes.** Fan-out-on-write for a group with 50,000 members means 50,000 write operations per message. This kills your database. Switch to fan-out-on-read or a pub/sub model for large groups.

5. **Ignoring push notification fatigue.** Sending a push for every single message in a group chat will get your app uninstalled. Batch notifications, respect mute settings, and implement smart notification rules (e.g., only notify for mentions or direct messages in muted groups).

6. **Storing media inline in the message database.** Never store binary media (images, videos, files) in your message store. Upload to object storage, store the URL in the message. Your message database should stay lean and fast.

7. **No message retention or deletion policy.** Messages accumulate forever if you let them. Define retention policies based on business and compliance needs. Give users the ability to delete their own messages. For regulated industries (healthcare, finance), you may need to retain messages for years but restrict access.

8. **Skipping rate limiting on message sends.** Without rate limits, a single abusive user or a buggy client can flood a chat with thousands of messages per second, overwhelming your server and ruining the experience for everyone else.

9. **Building E2EE without understanding the UX trade-offs.** End-to-end encryption breaks server-side search, link previews, content moderation, and message backup/restore. Decide early whether E2EE is a requirement, because retrofitting it changes your entire architecture.

10. **Neglecting multi-device sync.** Users expect their chat history to be consistent across phone, tablet, and desktop. Each device needs to sync from a central source of truth, handle conflicts (e.g., a message deleted on one device), and manage encryption keys across devices if using E2EE.

11. **Not designing for reconnection gracefully.** Mobile users constantly lose and regain connectivity. Your client needs robust reconnection logic: exponential backoff on reconnect attempts, a sync mechanism to catch up on missed messages, and UI that clearly indicates connection status without alarming the user.

12. **Unread counts drifting out of sync.** If your unread badge says 3 but the user sees no new messages, trust is broken. Unread counters must be updated atomically with message delivery and reset atomically when the user reads the conversation. Use Redis counters, not database queries, for this.

## Quick Reference

| Decision | Recommendation |
|----------|---------------|
| Protocol for real-time delivery | WebSockets for persistent connections; fall back to SSE or long-polling for restrictive networks |
| Message storage | Partitioned by conversation ID. Use a time-series-friendly schema. PostgreSQL for small scale, Cassandra or ScyllaDB for massive scale |
| Push notifications | FCM for Android/web, APNs for iOS. Use a unified service like Firebase or Amazon SNS |
| Media handling | Upload to S3/GCS/CDN, store URL in message. Generate thumbnails server-side. Enforce file size and type limits |
| Search | Elasticsearch or OpenSearch for server-side. SQLite FTS for client-side (E2EE chats) |
| Encryption | Signal Protocol for E2EE. TLS for transport encryption (non-negotiable baseline) |
| Presence tracking | Redis or in-memory store with TTL-based expiry. Batch updates for large user bases |
| Moderation | Automated filters (fast, inline) plus human review queue for flagged content |
| Build vs buy | Use a managed SDK (Stream, Sendbird, PubNub) to ship fast; build custom only when you need full control over data and UX |
| Bot integration | Webhook-based for simple bots, WebSocket-based for interactive real-time bots |
| Read receipts in groups | Track per-user "read up to" cursor, not per-message receipts |
| Message ordering | Server-assigned sequence numbers per conversation, not client timestamps |

| Scale Consideration | Typical Threshold |
|---------------------|-------------------|
| WebSocket connections per server | 50,000 - 100,000 with proper tuning |
| Messages per second (single server) | 10,000 - 50,000 depending on fan-out strategy |
| Message storage per user per year | 50 MB - 500 MB (text only), 5 - 50 GB (with media) |
| Push notification delivery time | Under 1 second for FCM/APNs in normal conditions |
| Acceptable message delivery latency | Under 300ms for a good user experience |
| Typing indicator broadcast frequency | Debounce to at most once every 2-3 seconds |
| Group size threshold for fan-out switch | Around 100-500 members, depending on message volume |

| Build vs Buy Option | Best For |
|---------------------|----------|
| **Stream Chat** | High-quality SDKs, strong React/React Native support, quick integration |
| **Sendbird** | Enterprise features, compliance certifications, global infrastructure |
| **PubNub** | Real-time infrastructure beyond just chat (IoT, gaming, live events) |
| **Firebase Realtime DB / Firestore** | Prototypes and small-scale apps, tight integration with Google ecosystem |
| **Custom (WebSocket + your stack)** | Full control over data, UX, and costs at scale. Highest engineering investment |
| **Matrix (open protocol)** | Self-hosted, federated, open-source. Good for privacy-focused or government use cases |

| Feature | Implementation Complexity |
|---------|--------------------------|
| 1:1 text messaging | Low -- WebSocket + message store |
| Group chat (small groups) | Medium -- fan-out, member management |
| Read receipts | Medium -- per-user cursor tracking |
| Typing indicators | Low -- ephemeral WebSocket events |
| Presence (online/offline) | Medium -- connection tracking + grace periods |
| Push notifications | Medium -- APNs/FCM integration, notification preferences |
| Media sharing | Medium -- object storage, thumbnails, file validation |
| Message search | High -- full-text index, query optimization |
| End-to-end encryption | Very High -- key management, multi-device, protocol implementation |
| Moderation pipeline | High -- real-time filters, review queue, audit trails |
| Bots and automation | Medium -- webhook/WebSocket bot API, command parsing |
