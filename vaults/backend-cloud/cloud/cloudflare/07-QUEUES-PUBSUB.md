# Cloudflare Queues & Pub/Sub

Cloudflare Queues is a message queue built for Workers, enabling asynchronous processing at the edge. It fills the gap between synchronous request-response and event-driven architectures in the Cloudflare ecosystem.

---

## Table of Contents

1. [Cloudflare Queues](#cloudflare-queues)
2. [How Queues Work](#how-queues-work)
3. [Producer and Consumer](#producer-and-consumer)
4. [Batching and Retry](#batching-and-retry)
5. [Dead Letter Queues](#dead-letter-queues)
6. [Patterns](#patterns)
7. [Comparison with Other Queues](#comparison-with-other-queues)
8. [Common Interview Questions](#common-interview-questions)

---

## Cloudflare Queues

### Why Queues at the Edge?

```
Without Queues:
  Worker receives request -> does ALL work synchronously -> responds
  Problem: Slow operations block the response (sending email, processing image, etc.)

With Queues:
  Worker receives request -> sends message to Queue -> responds immediately
  Queue consumer Worker -> processes message asynchronously
```

### Key Properties

| Property | Details |
| -------- | ------- |
| **Delivery** | At-least-once (messages may be delivered more than once) |
| **Ordering** | Best-effort (not strictly ordered) |
| **Max message size** | 128 KB |
| **Max batch size** | 100 messages or 256 KB |
| **Retention** | 4 days (messages auto-deleted after) |
| **Visibility timeout** | Configurable (default 30 seconds) |
| **Concurrency** | Multiple consumer Workers can process in parallel |
| **Pricing** | $0.40/million operations |

---

## How Queues Work

```
+------------------+     +------------------+     +------------------+
| Producer Worker  | --> | Queue            | --> | Consumer Worker  |
| (sends messages) |     | (stores messages)|     | (processes batch)|
+------------------+     +------------------+     +------------------+
     ^                                                     |
     |                                                     v
  HTTP Request                                    Side effects:
  from user                                       - Write to D1/R2
                                                  - Call external API
                                                  - Send notification
```

### Message Lifecycle

```
1. Producer sends message -> Queue stores message (PENDING)
2. Consumer receives batch -> Messages become INVISIBLE
3. Consumer processes successfully -> Messages ACKNOWLEDGED (deleted)
   OR
3. Consumer fails/times out -> Messages become VISIBLE again (retry)
4. After max retries -> Messages sent to Dead Letter Queue
```

---

## Producer and Consumer

### Producer (wrangler.toml)

```toml
[[queues.producers]]
queue = "my-queue"
binding = "MY_QUEUE"
```

```javascript
// Producer Worker
export default {
  async fetch(request, env) {
    const body = await request.json();

    // Send single message
    await env.MY_QUEUE.send({
      type: "process-image",
      imageId: body.imageId,
      userId: body.userId,
    });

    // Send batch
    await env.MY_QUEUE.sendBatch([
      { body: { type: "send-email", to: "a@co.com" } },
      { body: { type: "send-email", to: "b@co.com" } },
      { body: { type: "send-email", to: "c@co.com" } },
    ]);

    return new Response("Accepted", { status: 202 });
  },
};
```

### Consumer (wrangler.toml)

```toml
[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_batch_timeout = 30  # seconds
max_retries = 3
dead_letter_queue = "my-dlq"
```

```javascript
// Consumer Worker
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const { type, ...data } = message.body;

        switch (type) {
          case "process-image":
            await processImage(data, env);
            break;
          case "send-email":
            await sendEmail(data, env);
            break;
        }

        // Acknowledge individual message
        message.ack();
      } catch (error) {
        // Message will be retried
        message.retry();
      }
    }
  },
};
```

---

## Batching and Retry

### Batch Configuration

| Parameter | Default | Description |
| --------- | ------- | ----------- |
| `max_batch_size` | 10 | Max messages per batch (up to 100) |
| `max_batch_timeout` | 5s | Max wait time to fill a batch (up to 60s) |
| `max_retries` | 3 | Retries before sending to DLQ |
| `retry_delay` | Exponential | Backoff between retries |

### How Batching Works

```
Messages arrive:  M1  M2  M3  M4  M5 ... (over time)

Batch triggered when:
  1. max_batch_size reached (e.g., 10 messages)
     OR
  2. max_batch_timeout elapsed (e.g., 5 seconds since first message)

Whichever comes first!
```

### Retry Behavior

```
Attempt 1: Process message -> fails
  Wait: ~1 second
Attempt 2: Process message -> fails
  Wait: ~2 seconds
Attempt 3: Process message -> fails
  Wait: ~4 seconds
Attempt 4 (max_retries = 3): -> sent to Dead Letter Queue
```

---

## Dead Letter Queues

Messages that fail all retry attempts are sent to a DLQ for inspection.

```toml
# Main queue with DLQ
[[queues.consumers]]
queue = "orders"
dead_letter_queue = "orders-dlq"
max_retries = 3

# DLQ consumer (for alerting/manual processing)
[[queues.consumers]]
queue = "orders-dlq"
max_retries = 0  # Don't retry DLQ messages
```

```javascript
// DLQ consumer -- alert and log
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      // Log failed message for debugging
      console.error("DLQ message:", JSON.stringify(message.body));

      // Alert
      await fetch("https://hooks.slack.com/webhook", {
        method: "POST",
        body: JSON.stringify({
          text: `Failed to process: ${JSON.stringify(message.body)}`,
        }),
      });

      message.ack(); // Remove from DLQ after alerting
    }
  },
};
```

---

## Patterns

### Fan-Out

```
API Worker -> Queue A -> Image processor
          -> Queue B -> Email sender
          -> Queue C -> Analytics logger

// One event triggers multiple independent processes
await Promise.all([
  env.IMAGE_QUEUE.send({ imageId, action: "resize" }),
  env.EMAIL_QUEUE.send({ userId, template: "welcome" }),
  env.ANALYTICS_QUEUE.send({ event: "user_signup", userId }),
]);
```

### Delayed Processing

```javascript
// Send with delay (content-type scheduled)
await env.MY_QUEUE.send(
  { type: "send-reminder", userId: 123 },
  { delaySeconds: 3600 } // Process in 1 hour
);
```

### Rate-Limited External API Calls

```javascript
// Consumer processes messages at controlled rate
export default {
  async queue(batch, env) {
    // Process one message at a time to respect rate limits
    for (const message of batch.messages) {
      const response = await fetch("https://api.external.com/send", {
        method: "POST",
        body: JSON.stringify(message.body),
      });

      if (response.status === 429) {
        // Rate limited -- retry all remaining messages
        message.retry({ delaySeconds: 60 });
        continue;
      }

      message.ack();
    }
  },
};
```

---

## Comparison with Other Queues

| Feature | Cloudflare Queues | AWS SQS | Google Pub/Sub | RabbitMQ |
| ------- | ----------------- | ------- | -------------- | -------- |
| **Delivery** | At-least-once | At-least-once (standard) / Exactly-once (FIFO) | At-least-once | At-least-once / At-most-once |
| **Ordering** | Best-effort | FIFO available | Ordering keys | FIFO per queue |
| **Max message** | 128 KB | 256 KB | 10 MB | Configurable |
| **Retention** | 4 days | 14 days | 7 days (default) | Configurable |
| **DLQ** | Yes | Yes | Yes | Yes |
| **Batching** | Yes (100 max) | Yes (10 max) | Yes (1000 max) | No (prefetch) |
| **Edge location** | All PoPs | Regional | Regional | Self-hosted |
| **Pricing** | $0.40/M ops | $0.40/M requests | $0.04/M (ingestion) | Self-hosted |
| **Best for** | Workers ecosystem | AWS apps | GCP apps, high throughput | Complex routing |

---

## Common Interview Questions

1. **What delivery guarantee does Cloudflare Queues provide?** At-least-once. Messages may be delivered more than once, so consumers must be idempotent (processing the same message twice should have the same effect as once).

2. **How do you handle message ordering?** Cloudflare Queues provides best-effort ordering. If strict ordering is required, use a single consumer with batch size 1, or add a sequence number to messages and reorder in the consumer.

3. **What happens when a consumer fails?** The message becomes visible again after the visibility timeout and is redelivered. After max_retries (default 3), the message is sent to the dead letter queue.

4. **How does batching work?** Consumer receives a batch when either max_batch_size is reached or max_batch_timeout elapses (whichever comes first). Each message in the batch can be individually acknowledged or retried.

5. **How do you make consumers idempotent?** Use a unique message ID or idempotency key. Before processing, check if the operation was already completed (e.g., check D1 or KV). If already processed, skip and acknowledge.

6. **Compare Cloudflare Queues to AWS SQS.** Both provide at-least-once delivery. SQS has FIFO queues for strict ordering, longer retention (14 days), and larger messages (256 KB). Cloudflare Queues runs at the edge, integrates natively with Workers, and has similar pricing.
