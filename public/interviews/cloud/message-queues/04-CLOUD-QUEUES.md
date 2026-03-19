# Cloud-Managed Message Queues

Cloud-managed queues remove the operational burden of running your own messaging infrastructure. This guide covers AWS SQS/SNS, Google Pub/Sub, and Azure Service Bus -- the services you will encounter in system design interviews and production.

---

## Table of Contents

1. [AWS SQS](#aws-sqs)
2. [AWS SNS](#aws-sns)
3. [SQS + SNS Fan-Out Pattern](#sqs--sns-fan-out-pattern)
4. [Google Cloud Pub/Sub](#google-cloud-pubsub)
5. [Azure Service Bus](#azure-service-bus)
6. [Comparison Table](#comparison-table)
7. [Common Interview Questions](#common-interview-questions)

---

## AWS SQS

### Standard Queue vs FIFO Queue

| Feature | Standard | FIFO |
| ------- | -------- | ---- |
| **Throughput** | Unlimited | 3,000 msg/s (with batching) or 300 msg/s (without) |
| **Ordering** | Best-effort | Strict FIFO per message group |
| **Delivery** | At-least-once (possible duplicates) | Exactly-once (5-min dedup window) |
| **Deduplication** | No | Content-based or explicit dedup ID |
| **Queue name** | Any | Must end with `.fifo` |

### Key Concepts

```
Producer -> SQS Queue -> Consumer

Message lifecycle:
  1. Producer sends message -> message stored in queue
  2. Consumer polls queue -> receives message
  3. Message becomes INVISIBLE (visibility timeout)
  4. Consumer processes message
  5. Consumer deletes message (ACK)
  6. If not deleted within visibility timeout -> message reappears (retry)
```

### Configuration

| Setting | Default | Description |
| ------- | ------- | ----------- |
| **Visibility timeout** | 30s | Time message is hidden after receive |
| **Message retention** | 4 days (max 14) | How long unprocessed messages are kept |
| **Max message size** | 256 KB | For larger payloads, use S3 + reference |
| **Long polling** | Disabled | Wait up to 20s for messages (reduces empty responses) |
| **Delay queue** | 0s (max 15 min) | Delay before message becomes visible |
| **Redrive policy** | None | After N receives, move to DLQ |

### Long Polling vs Short Polling

```
Short polling (default):
  Consumer: "Any messages?" -> SQS: "No" (immediate response)
  Consumer: "Any messages?" -> SQS: "No"
  Consumer: "Any messages?" -> SQS: "Yes, here's one"
  Problem: Many empty responses, wasted API calls ($)

Long polling (WaitTimeSeconds=20):
  Consumer: "Any messages?" -> SQS: (waits up to 20s) -> "Yes, here's one"
  Fewer API calls, lower cost, lower latency
```

### SQS + Lambda

```
SQS Queue -> Lambda (event source mapping)

Lambda polls SQS, receives batch (1-10 messages), processes.
On success: messages automatically deleted.
On failure: messages return to queue after visibility timeout.
After maxReceiveCount: messages go to DLQ.
```

---

## AWS SNS

SNS is a pub/sub service for fan-out. One message published to a topic is delivered to all subscribers.

```
Publisher -> SNS Topic -> SQS Queue A (billing service)
                       -> SQS Queue B (shipping service)
                       -> Lambda function (analytics)
                       -> HTTP/HTTPS endpoint
                       -> Email/SMS
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Subscribers** | SQS, Lambda, HTTP/S, email, SMS, Kinesis Firehose |
| **Message filtering** | Filter by message attributes (subscriber only gets matching) |
| **Fan-out** | One message to many subscribers |
| **FIFO topics** | Ordered delivery to FIFO SQS queues |
| **Max message** | 256 KB |
| **Delivery** | At-least-once |

### Message Filtering

```json
// SNS subscription filter policy
// Subscriber A only gets "order" events with status "completed"
{
  "event_type": ["order"],
  "status": ["completed"]
}

// Message attributes on publish:
{
  "event_type": { "DataType": "String", "StringValue": "order" },
  "status": { "DataType": "String", "StringValue": "completed" }
}
```

---

## SQS + SNS Fan-Out Pattern

The most common messaging pattern in AWS:

```
Service A publishes event
     |
     v
+----------+
| SNS Topic|  "order-events"
+----------+
  |    |    |
  v    v    v
+---+ +---+ +---+
|SQS| |SQS| |SQS|  Each service has its own queue
| A | | B | | C |  (independent processing, retry, DLQ)
+---+ +---+ +---+
  |    |    |
  v    v    v
Billing  Shipping  Analytics
```

**Why not just SNS?** SNS delivery to HTTP/Lambda is fire-and-forget. If the subscriber is down, the message is lost (after retries). With SQS as a buffer, messages persist until processed. Each service can process at its own pace.

---

## Google Cloud Pub/Sub

### Architecture

```
Publisher -> Topic -> Subscription A -> Subscriber A (pull or push)
                  -> Subscription B -> Subscriber B (pull or push)

Each subscription gets ALL messages (like SNS)
Within a subscription, messages are load-balanced across subscribers (like SQS)
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Delivery** | At-least-once (default), exactly-once (per subscription) |
| **Ordering** | Via ordering keys (like Kafka partition keys) |
| **Dead letter** | Built-in DLQ support |
| **Message retention** | 7 days (default), up to 31 days |
| **Max message** | 10 MB |
| **Throughput** | Millions of messages/sec |
| **Global** | Single global topic, consumers anywhere |
| **Filtering** | Attribute-based filtering |

### Exactly-Once Delivery

Google Pub/Sub is one of the few managed services offering exactly-once delivery:

```
Subscriber receives message with ACK ID
  -> process message
  -> ACK with ACK ID
  -> Pub/Sub deduplicates: if ACK ID already processed, no redeliver

Note: "exactly-once" means each message delivered exactly once per subscription.
The subscriber still needs to be idempotent for application-level safety.
```

### Pull vs Push

| Mode | How | Best For |
| ---- | --- | -------- |
| **Pull** | Subscriber polls for messages | Batch processing, variable-rate consumers |
| **Push** | Pub/Sub sends to subscriber endpoint (HTTP) | Real-time, serverless (Cloud Functions) |

---

## Azure Service Bus

### Key Features

| Feature | Details |
| ------- | ------- |
| **Queues** | Point-to-point (like SQS) |
| **Topics + Subscriptions** | Pub/sub (like SNS + SQS) |
| **Sessions** | Ordered, stateful processing per session ID |
| **Transactions** | Cross-entity transactions |
| **Scheduled messages** | Deliver at a specific time |
| **Dead letter** | Built-in DLQ per queue/subscription |
| **Duplicate detection** | Time-window-based dedup |
| **Max message** | 256 KB (Standard), 100 MB (Premium) |
| **Protocol** | AMQP 1.0, HTTP, custom SDK |

### Sessions (Unique to Service Bus)

```
Session = ordered, stateful processing per session ID

Messages with session_id = "order-123":
  -> All delivered to same consumer, in order
  -> Consumer can maintain state for that session
  -> If consumer fails, session is reassigned

Use case: Order processing (all events for one order processed by one consumer in order)
         Shopping cart (all cart events for one user)
```

### Comparison with SQS

| Feature | SQS | Service Bus |
| ------- | --- | ----------- |
| **Protocol** | HTTP | AMQP 1.0 + HTTP |
| **Sessions** | No (use FIFO group ID) | Yes (full session state) |
| **Transactions** | No | Yes (cross-entity) |
| **Max message** | 256 KB | 256 KB (Standard), 100 MB (Premium) |
| **FIFO** | FIFO queue variant | Sessions |
| **Scheduled** | Delay queue (max 15 min) | Scheduled messages (any future time) |
| **Dead letter** | Separate DLQ | Built-in sub-queue |

---

## Comparison Table

| Feature | SQS | SNS | Google Pub/Sub | Azure Service Bus |
| ------- | --- | --- | -------------- | ----------------- |
| **Model** | Queue | Pub/sub | Topic + Subscription | Queue + Topic |
| **Delivery** | At-least-once / Exactly-once (FIFO) | At-least-once | At-least-once / Exactly-once | At-least-once |
| **Ordering** | FIFO variant | FIFO topics | Ordering keys | Sessions |
| **Max message** | 256 KB | 256 KB | 10 MB | 256 KB / 100 MB |
| **Retention** | 14 days | N/A (immediate) | 31 days | 14 days |
| **Throughput** | Unlimited (standard) | High | Very high | High |
| **Dead letter** | Yes | No (use SQS) | Yes | Yes |
| **Protocol** | HTTP | HTTP | gRPC + HTTP | AMQP + HTTP |
| **Pricing** | $0.40/M requests | $0.50/M publishes | $0.04/M (10KB msg) | ~$0.05/M operations |

---

## Common Interview Questions

1. **When would you use SQS vs SNS?** SQS for point-to-point task processing. SNS for fan-out to multiple consumers. Most common: SNS -> multiple SQS queues (fan-out with buffering).

2. **Explain SQS visibility timeout.** After a consumer receives a message, it becomes invisible for the timeout period. If the consumer processes and deletes it before timeout, done. If not, the message reappears for another consumer to try.

3. **What is the difference between SQS Standard and FIFO?** Standard: unlimited throughput, at-least-once, best-effort ordering. FIFO: 3K msg/s, exactly-once (dedup), strict ordering per message group ID.

4. **How does Google Pub/Sub achieve exactly-once?** Each message has a unique ACK ID. When a subscriber ACKs, Pub/Sub records it. If the message is redelivered and ACKed again with the same ID, the duplicate is suppressed.

5. **When would you choose Azure Service Bus over SQS?** When you need: AMQP protocol support, session-based ordered processing, cross-entity transactions, or scheduled delivery at arbitrary future times.

6. **How do you handle messages larger than 256 KB in SQS?** Use the SQS Extended Client Library: store the payload in S3, send a reference (S3 key) as the SQS message. Consumer retrieves from S3.

7. **What is the SNS fan-out pattern?** Publish one message to an SNS topic. Multiple SQS queues subscribe. Each service processes independently from its own queue with its own retry/DLQ policy.
