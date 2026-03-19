# SQS & SNS (Messaging)

Amazon SQS (Simple Queue Service) is a fully managed message queue that decouples producers from consumers. Amazon SNS (Simple Notification Service) is a fully managed pub/sub service for fan-out messaging. Together they form the backbone of asynchronous, event-driven architectures on AWS. If you are building microservices, SQS and SNS are the first tools you reach for.

---

## SQS Overview

SQS eliminates the complexity of managing your own message broker. You send messages, consumers poll for them, process them, and delete them. No server provisioning, no capacity planning for the queue itself.

### Queue Types

| Feature       | Standard Queue                      | FIFO Queue                         |
| ------------- | ----------------------------------- | ---------------------------------- |
| Throughput    | Nearly unlimited                    | 300 msg/s (3,000 with batching)    |
| Ordering      | Best-effort                         | Strict within message group        |
| Delivery      | At-least-once (possible duplicates) | Exactly-once processing            |
| Name suffix   | Any                                 | Must end in `.fifo`                |
| Deduplication | None built-in                       | Content-based or explicit dedup ID |
| Cost          | Lower                               | ~25% more expensive                |

**Use Standard** when throughput matters more than ordering. **Use FIFO** when you need strict ordering or exactly-once semantics (financial transactions, command sequences).

### Message Lifecycle

```
Producer --> [SQS Queue] --> Consumer polls --> Message becomes invisible
                                             --> Consumer processes
                                             --> Consumer deletes message
```

1. **Send** - Producer sends a message (up to 256KB body)
2. **Receive** - Consumer calls `ReceiveMessage`; message becomes invisible to other consumers
3. **Process** - Consumer does work
4. **Delete** - Consumer calls `DeleteMessage` with the receipt handle
5. **If not deleted** - After visibility timeout expires, message reappears in the queue

### Visibility Timeout

When a consumer receives a message, it becomes invisible to other consumers for the duration of the visibility timeout.

- Default: **30 seconds**
- Range: 0 seconds to 12 hours
- If your processing takes longer than the timeout, another consumer will pick up the same message (duplicate processing)
- Extend it mid-flight with `ChangeMessageVisibility` if you need more time

```bash
# Change visibility timeout for a specific message
aws sqs change-message-visibility \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --receipt-handle "AQEBwJ...==" \
  --visibility-timeout 120
```

### Dead-Letter Queues (DLQ)

Messages that fail processing repeatedly get moved to a DLQ after exceeding `maxReceiveCount`.

```json
{
  "deadLetterTargetArn": "arn:aws:sqs:us-east-1:123456789012:my-dlq",
  "maxReceiveCount": 3
}
```

- Set `maxReceiveCount` to the number of retries before moving to DLQ
- DLQ must be the same type as the source queue (Standard -> Standard, FIFO -> FIFO)
- Monitor DLQ depth with CloudWatch `ApproximateNumberOfMessagesVisible`
- Use DLQ redrive to move messages back to the source queue after fixing the bug

### Long Polling vs Short Polling

|                 | Short Polling                      | Long Polling                               |
| --------------- | ---------------------------------- | ------------------------------------------ |
| Behavior        | Returns immediately, even if empty | Waits up to `WaitTimeSeconds`              |
| Empty responses | Many                               | Fewer                                      |
| Cost            | Higher (more API calls)            | Lower                                      |
| Latency         | Higher average                     | Lower (returns as soon as message arrives) |

**Always use long polling.** Set `WaitTimeSeconds` to 20 (max) at the queue level or per-request.

```bash
# Receive with long polling
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --wait-time-seconds 20
```

### Batch Operations

Send, receive, and delete up to **10 messages** per batch call. This reduces API calls and cost.

```bash
# Send a batch of messages
aws sqs send-message-batch \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --entries '[
    {"Id":"1","MessageBody":"first"},
    {"Id":"2","MessageBody":"second"},
    {"Id":"3","MessageBody":"third"}
  ]'
```

### Message Attributes and Body

- **Body**: Up to 256KB of text (string). For larger payloads, store in S3 and send a pointer.
- **Message attributes**: Up to 10 key-value metadata pairs (name, type, value). Do not count toward body size limit but count toward total message size.
- **System attributes**: `SentTimestamp`, `ApproximateReceiveCount`, `ApproximateFirstReceiveTimestamp`, etc.

### Delay Queues and Message Timers

- **Delay queue**: All messages in the queue are invisible for a configured delay (0 to 15 minutes). Set `DelaySeconds` on the queue.
- **Message timer**: Per-message delay. Set `DelaySeconds` on individual `SendMessage` calls. Overrides queue-level delay for Standard queues; not supported on FIFO queues.

---

## SNS Overview

SNS is a pub/sub service. You publish a message to a **topic**, and all **subscribers** receive it. This is the fan-out pattern: one event triggers multiple downstream actions.

### Topic Types

| Feature       | Standard Topic                               | FIFO Topic                            |
| ------------- | -------------------------------------------- | ------------------------------------- |
| Throughput    | Nearly unlimited                             | 300 publishes/s (3,000 with batching) |
| Ordering      | No guarantee                                 | Strict within message group           |
| Deduplication | None                                         | Content-based or message dedup ID     |
| Subscribers   | SQS, Lambda, HTTP/S, Email, SMS, mobile push | SQS FIFO only                         |

### Subscription Protocols

| Protocol                | Use Case                                        |
| ----------------------- | ----------------------------------------------- |
| SQS                     | Decouple processing, fan-out to multiple queues |
| Lambda                  | Serverless event processing                     |
| HTTP/HTTPS              | Webhook integrations                            |
| Email/Email-JSON        | Notifications to humans                         |
| SMS                     | Text message alerts                             |
| Kinesis Data Firehose   | Stream events to S3, Redshift                   |
| Mobile push (APNs, FCM) | Push notifications to devices                   |

### SNS + SQS Fan-Out Pattern

The most common pattern in AWS messaging. Publish once to an SNS topic, and multiple SQS queues each receive a copy.

```
                        +--> [SQS: OrderProcessing]
                        |
[Producer] --> [SNS] ---+--> [SQS: Analytics]
                        |
                        +--> [SQS: Notifications]
```

Each queue processes independently. If one consumer is slow or fails, it does not affect the others.

### Message Filtering

Subscription filter policies let subscribers receive only a subset of messages. Filters are applied on message attributes, so the subscriber does not need to discard unwanted messages.

```json
{
  "eventType": ["order_placed"],
  "region": ["us-east-1", "us-west-2"]
}
```

This subscriber only receives messages where `eventType` is `order_placed` AND `region` is `us-east-1` or `us-west-2`.

---

## Common CLI Commands

```bash
# --- SQS ---

# Create a standard queue
aws sqs create-queue --queue-name my-queue

# Create a FIFO queue
aws sqs create-queue --queue-name my-queue.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true

# Send a message
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --message-body '{"orderId":"12345"}'

# Receive messages (long polling)
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --max-number-of-messages 10 \
  --wait-time-seconds 20

# Delete a message
aws sqs delete-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue \
  --receipt-handle "AQEBwJ...=="

# Purge all messages from a queue
aws sqs purge-queue \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/my-queue

# --- SNS ---

# Create a topic
aws sns create-topic --name my-topic

# Subscribe an SQS queue to a topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:my-topic \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789012:my-queue

# Publish a message
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789012:my-topic \
  --message '{"orderId":"12345"}' \
  --message-attributes '{"eventType":{"DataType":"String","StringValue":"order_placed"}}'

# List subscriptions for a topic
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:123456789012:my-topic
```

---

## Common Gotchas

1. **SQS message retention**: Max 14 days (default 4 days). Messages not consumed are lost after retention period.
2. **FIFO throughput**: 300 msg/s without batching, 3,000 with batching. If you need more, use Standard queues.
3. **Standard queue duplicates**: At-least-once means your consumer MUST be idempotent. Use a deduplication table or idempotency key.
4. **SNS HTTP retries**: SNS retries failed HTTP/S deliveries with exponential backoff up to ~23 days by default. Configure a DLQ on the subscription to capture permanent failures.
5. **SQS message ordering**: Standard queues provide best-effort ordering only. If you need strict order, use FIFO with a single message group ID (but this limits throughput).
6. **Large messages**: For payloads over 256KB, use the SQS Extended Client Library to store the body in S3 and send a pointer.
7. **Visibility timeout too short**: If your consumer takes longer than the visibility timeout, the message reappears and gets processed by another consumer. Set the timeout to at least 6x your average processing time.
8. **SNS to SQS permissions**: The SQS queue needs a resource policy allowing `sqs:SendMessage` from the SNS topic ARN. This is a frequent source of "messages not arriving" bugs.
9. **FIFO message group ID**: All messages with the same group ID are delivered in order. Different group IDs are processed in parallel. Choose your group ID carefully based on your ordering requirements.
10. **DLQ monitoring**: Always set up CloudWatch alarms on your DLQ. Unmonitored DLQs are a silent data loss vector.
