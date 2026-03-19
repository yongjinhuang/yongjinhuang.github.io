# GCP Messaging: Pub/Sub, Cloud Tasks & Workflows

Google Cloud Pub/Sub is a global, serverless messaging service for event-driven architectures. Combined with Cloud Tasks for task queuing and Workflows for orchestration, GCP provides a complete asynchronous processing stack.

---

## Table of Contents

1. [Cloud Pub/Sub](#cloud-pubsub)
2. [Cloud Tasks](#cloud-tasks)
3. [Cloud Workflows](#cloud-workflows)
4. [Comparison with AWS](#comparison-with-aws)
5. [Common Interview Questions](#common-interview-questions)

---

## Cloud Pub/Sub

### Architecture

```
Publisher -> Topic -> Subscription A -> Subscriber A (pull/push)
                  -> Subscription B -> Subscriber B (pull/push)

Each subscription = independent delivery channel
Within a subscription: messages load-balanced across subscribers
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Throughput** | Millions of messages/sec |
| **Delivery** | At-least-once (default), exactly-once (per subscription) |
| **Ordering** | Via ordering keys (messages with same key delivered in order) |
| **Retention** | 7 days (default), up to 31 days |
| **Max message** | 10 MB |
| **Dead letter** | Built-in DLQ (dead letter topics) |
| **Filtering** | Attribute-based subscription filtering |
| **Schema** | Avro and Protocol Buffer schema validation |
| **Global** | Single global topic, publish/subscribe from any region |
| **Seek** | Replay messages by timestamp or snapshot |

### Exactly-Once Delivery

```
Pub/Sub tracks ACK IDs per subscription.
If a message is redelivered and ACKed again: deduplication kicks in.

Enable: set exactly_once_delivery on subscription

Caveats:
  - Higher latency (dedup processing)
  - Only within Pub/Sub (your consumer still needs to be idempotent
    for application-level exactly-once)
```

### Pull vs Push

| Mode | How | Best For |
| ---- | --- | -------- |
| **Pull** | Subscriber polls for messages (StreamingPull recommended) | Batch processing, high throughput, control over processing rate |
| **Push** | Pub/Sub sends POST to subscriber's HTTPS endpoint | Cloud Run, Cloud Functions, serverless |

### Ordering Keys

```python
# Messages with the same ordering_key are delivered in order
publisher.publish(topic, data=b"event1", ordering_key="user-123")
publisher.publish(topic, data=b"event2", ordering_key="user-123")
# event1 delivered before event2 (within same subscription)

# Messages with different ordering_keys have no ordering guarantee
publisher.publish(topic, data=b"eventA", ordering_key="user-456")
# No guarantee relative to user-123 events
```

### Pub/Sub vs Kafka

| Feature | Pub/Sub | Kafka |
| ------- | ------- | ----- |
| **Management** | Fully managed (serverless) | Self-managed or Confluent Cloud |
| **Throughput** | Very high (auto-scales) | Very high (manual scaling) |
| **Ordering** | Per ordering key | Per partition |
| **Replay** | Seek by timestamp/snapshot | Seek by offset |
| **Exactly-once** | Built-in (per subscription) | Idempotent producer + transactions |
| **Retention** | 7-31 days | Configurable (unlimited) |
| **Stream processing** | Dataflow (Apache Beam) | Kafka Streams, ksqlDB |
| **Global** | Automatic (single global topic) | Manual (MirrorMaker) |
| **Cost** | Per message + per GB | Per broker + per GB |

---

## Cloud Tasks

Managed task queue for asynchronous task execution with guaranteed delivery.

```
App -> Cloud Tasks Queue -> Target (Cloud Run, HTTP endpoint)
  - Rate limiting
  - Retry with exponential backoff
  - Scheduled delivery (future timestamp)
  - Deduplication
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Targets** | HTTP/S endpoints, Cloud Run, App Engine |
| **Rate limiting** | Max dispatches per second per queue |
| **Retry** | Configurable backoff (min/max delay, max attempts) |
| **Scheduling** | Schedule task for future execution (up to 30 days) |
| **Deduplication** | Task name-based dedup window |
| **Max task size** | 1 MB |

### Cloud Tasks vs Pub/Sub

| Feature | Cloud Tasks | Pub/Sub |
| ------- | ----------- | ------- |
| **Model** | Task queue (one consumer per task) | Pub/sub (fan-out) |
| **Rate control** | Built-in rate limiting | No (consumer controls rate) |
| **Scheduling** | Deliver at specific time | Immediate only |
| **Deduplication** | Task name-based | Exactly-once option |
| **Use case** | Background jobs, rate-limited API calls | Event streaming, fan-out |

---

## Cloud Workflows

Orchestrate services with declarative YAML/JSON workflows.

```yaml
main:
  steps:
    - createOrder:
        call: http.post
        args:
          url: https://order-service/api/orders
          body: ${order}
        result: orderResult

    - chargePayment:
        call: http.post
        args:
          url: https://payment-service/api/charge
          body:
            orderId: ${orderResult.body.id}
            amount: ${order.total}
        result: paymentResult

    - checkPayment:
        switch:
          - condition: ${paymentResult.body.status == "success"}
            next: shipOrder
          - condition: ${paymentResult.body.status == "failed"}
            next: cancelOrder

    - shipOrder:
        call: http.post
        args:
          url: https://shipping-service/api/ship
          body:
            orderId: ${orderResult.body.id}

    - cancelOrder:
        call: http.post
        args:
          url: https://order-service/api/cancel
          body:
            orderId: ${orderResult.body.id}
```

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Language** | YAML/JSON | ASL (Amazon States Language) |
| **Pricing** | Per step execution | Per state transition |
| **Max duration** | 1 year | 1 year (Standard) |
| **Error handling** | try/retry/except blocks | Catch/Retry |
| **Parallel** | parallel step type | Parallel state |
| **Connectors** | HTTP, GCP APIs, Cloud Functions, Cloud Run | Lambda, ECS, SNS, SQS, etc. |

---

## Comparison with AWS

| GCP | AWS | Notes |
| --- | --- | ----- |
| Pub/Sub | SNS + SQS | Pub/Sub combines both: fan-out (topic) + load balancing (subscription) |
| Cloud Tasks | SQS (with rate limiting) | Tasks has built-in rate control and scheduling |
| Cloud Workflows | Step Functions | Similar concept, different syntax |
| Eventarc | EventBridge | Event routing from GCP services |
| Dataflow | Kinesis Data Analytics / Managed Flink | Stream processing (Apache Beam) |

---

## Common Interview Questions

1. **How does Pub/Sub differ from SQS + SNS?** Pub/Sub combines both models: a topic (like SNS) with subscriptions (like SQS queues). Each subscription gets all messages. Within a subscription, messages are load-balanced. No need to wire SNS to SQS manually.

2. **How does Pub/Sub handle ordering?** Via ordering keys. Messages with the same ordering key within a subscription are delivered in publish order. Different ordering keys have no ordering guarantee. Similar to Kafka partition keys but without explicit partitions.

3. **When would you use Cloud Tasks vs Pub/Sub?** Cloud Tasks for: task queues with rate limiting, scheduled delivery, and one-consumer-per-task semantics. Pub/Sub for: event streaming, fan-out to multiple consumers, and high-throughput messaging.

4. **What is exactly-once delivery in Pub/Sub?** Pub/Sub deduplicates ACKs per subscription. If a message is delivered twice and ACKed both times, only the first ACK counts. This prevents duplicate processing within Pub/Sub, but your application should still be idempotent.

5. **How do Cloud Workflows compare to Step Functions?** Both are serverless orchestration services. Workflows uses YAML/JSON syntax; Step Functions uses Amazon States Language (JSON). Both support branching, parallel execution, error handling, and long-running workflows.
