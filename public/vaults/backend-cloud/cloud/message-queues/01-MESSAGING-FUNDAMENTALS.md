# Messaging Fundamentals

Before diving into specific systems, you need to understand the core concepts that apply to all message queues and event streaming platforms. These fundamentals come up in every system design interview.

---

## Table of Contents

1. [Point-to-Point vs Pub/Sub](#point-to-point-vs-pubsub)
2. [Delivery Guarantees](#delivery-guarantees)
3. [Ordering Guarantees](#ordering-guarantees)
4. [Backpressure](#backpressure)
5. [Dead Letter Queues](#dead-letter-queues)
6. [Message Serialization](#message-serialization)
7. [Idempotency](#idempotency)
8. [Common Interview Questions](#common-interview-questions)

---

## Point-to-Point vs Pub/Sub

### Point-to-Point (Queue)

```
Producer -> [Queue] -> Consumer

One message consumed by exactly ONE consumer.
Multiple consumers = competing consumers (load balancing).

+-----------+     +-------+     +-----------+
| Producer  | --> | Queue | --> | Consumer A|  (gets msg 1, 3, 5)
+-----------+     +-------+     +-----------+
                      |         +-----------+
                      +-------> | Consumer B|  (gets msg 2, 4, 6)
                                +-----------+
```

Use case: task distribution, work queues, job processing.

### Pub/Sub (Topic)

```
Publisher -> [Topic] -> Subscriber A (gets ALL messages)
                    -> Subscriber B (gets ALL messages)

One message delivered to ALL subscribers.

+-----------+     +-------+     +-----------+
| Publisher | --> | Topic | --> | Sub A     |  (gets msg 1, 2, 3)
+-----------+     +-------+     +-----------+
                      |         +-----------+
                      +-------> | Sub B     |  (gets msg 1, 2, 3)
                                +-----------+
```

Use case: event broadcasting, notifications, event-driven architecture.

### Consumer Groups (Kafka-style hybrid)

```
Publisher -> [Topic] -> Consumer Group A -> Consumer A1 (partition 0)
                                        -> Consumer A2 (partition 1)
                    -> Consumer Group B -> Consumer B1 (all partitions)

Each group gets ALL messages, but within a group, messages are
distributed (like a queue).
```

This is the most common pattern in modern systems -- it gives you both pub/sub (multiple groups) and load balancing (within a group).

---

## Delivery Guarantees

### At-Most-Once

```
Producer -> send message -> Broker
                            |
                            v
                         Consumer receives -> process -> done
                         (no acknowledgement)

If consumer crashes during processing: message LOST
If broker crashes before delivery: message LOST
```

**Implementation:** Fire-and-forget. No acks, no retries.
**Use case:** Metrics, logs, non-critical events where losing some data is acceptable.

### At-Least-Once

```
Producer -> send message -> Broker -> deliver to Consumer
                                      |
                                      v
                                   Consumer processes
                                      |
                                      v
                                   Consumer ACKs -> Broker deletes message

If consumer crashes before ACK: Broker redelivers (DUPLICATE!)
```

**Implementation:** Consumer acknowledges after processing. Broker redelivers unacknowledged messages.
**Use case:** Most production systems. Requires idempotent consumers.

### Exactly-Once

```
The "holy grail" of messaging. Three approaches:

1. Idempotent consumer (at-least-once + deduplication)
   Producer sends with dedup ID -> Consumer checks if already processed

2. Transactional messaging (Kafka)
   Producer + Consumer in same transaction boundary

3. Stream processing (Kafka Streams, Flink)
   Internal offset + state management guarantees exactly-once
```

**Reality:** True exactly-once between independent systems is extremely hard. Most "exactly-once" systems actually implement "effectively-once" (at-least-once + idempotent processing).

---

## Ordering Guarantees

### No Ordering

Messages may arrive in any order. Simplest, highest throughput.

### Partition-Level Ordering (Kafka, SQS FIFO)

```
Topic with 3 partitions:
  Partition 0: [msg1, msg4, msg7]  -- ordered within partition
  Partition 1: [msg2, msg5, msg8]  -- ordered within partition
  Partition 2: [msg3, msg6, msg9]  -- ordered within partition

Messages with same key go to same partition -> ordered relative to each other
Messages with different keys -> no ordering guarantee between them
```

**Key design:** Choose partition key carefully.
- `user_id` -> all events for a user are ordered
- `order_id` -> all events for an order are ordered
- Random -> no ordering but even distribution

### Global Ordering

All messages in strict global order. Only achievable with a single partition/queue -- limits throughput to one consumer.

---

## Backpressure

What happens when producers are faster than consumers?

```
Producer (1000 msg/s) -> Queue (growing) -> Consumer (500 msg/s)
                          [msg][msg][msg][msg][msg]...
                          Queue grows unbounded -> OOM or disk full
```

### Backpressure Strategies

| Strategy | How | Example |
| -------- | --- | ------- |
| **Bounded queue** | Reject/block when queue is full | RabbitMQ max-length |
| **Drop oldest** | Discard oldest messages | Kafka log retention |
| **Drop newest** | Reject new messages | TCP flow control |
| **Rate limiting** | Throttle producer | API rate limits |
| **Scale consumers** | Add more consumers | Auto-scaling |
| **Spillover** | Overflow to secondary storage | Kafka tiered storage |

---

## Dead Letter Queues

Messages that cannot be processed after multiple attempts are sent to a DLQ for inspection.

```
Main Queue -> Consumer -> fails
                       -> retry 1 -> fails
                       -> retry 2 -> fails
                       -> retry 3 -> fails
                       -> Dead Letter Queue

DLQ -> Alert (PagerDuty/Slack)
    -> Manual inspection
    -> Reprocess after fix
```

### DLQ Best Practices

1. **Always have a DLQ** -- unprocessable messages should not block the queue
2. **Alert on DLQ depth** -- if messages land in DLQ, something is wrong
3. **Include metadata** -- original timestamp, failure reason, retry count
4. **Have a replay mechanism** -- ability to reprocess DLQ messages after fixing the bug
5. **Set DLQ retention** -- don't keep DLQ messages forever

---

## Message Serialization

| Format | Size | Schema | Human-Readable | Speed | Use Case |
| ------ | ---- | ------ | -------------- | ----- | -------- |
| **JSON** | Large | Implicit | Yes | Slow | APIs, debugging, simple systems |
| **Protobuf** | Small | Required (.proto) | No | Fast | Microservices, high-throughput |
| **Avro** | Small | Required (JSON schema) | No | Fast | Kafka (schema registry), data pipelines |
| **MessagePack** | Small | Implicit | No | Fast | Drop-in JSON replacement |
| **Thrift** | Small | Required (.thrift) | No | Fast | Legacy Facebook systems |

### Schema Registry (Kafka)

```
Producer -> Schema Registry (register schema v1) -> Kafka (data + schema ID)
                                                        |
Consumer <- Schema Registry (fetch schema v1)    <------+

Benefits:
- Schema evolution (add fields, deprecate fields)
- Backward/forward compatibility enforcement
- Consumers can read old data with new schema
```

---

## Idempotency

Since at-least-once delivery means duplicates, consumers must be idempotent.

### Strategies

```
1. Idempotency Key
   Message: { id: "msg-123", action: "charge", amount: 50 }
   Consumer: IF NOT EXISTS (SELECT 1 FROM processed WHERE msg_id = 'msg-123')
             THEN process AND INSERT INTO processed (msg_id)

2. Database Upsert
   INSERT INTO balances (user_id, amount) VALUES (123, 50)
   ON CONFLICT (user_id) DO UPDATE SET amount = 50;
   -- Same result regardless of how many times executed

3. Conditional Update
   UPDATE orders SET status = 'shipped'
   WHERE id = 123 AND status = 'processing';
   -- Only succeeds once (status changes after first execution)

4. Deduplication Window
   Keep a cache of recently processed message IDs (Redis SET with TTL)
   If message ID exists in cache -> skip
```

---

## Common Interview Questions

1. **What is the difference between a message queue and an event stream?** A queue: message consumed once, then deleted. A stream (Kafka): messages persisted in a log, multiple consumers can read, replay from any offset. Queues are for tasks; streams are for events.

2. **How do you guarantee exactly-once processing?** You can't truly in a distributed system between independent services. Use "effectively-once": at-least-once delivery + idempotent consumers. Kafka provides exactly-once within its ecosystem using idempotent producers and transactions.

3. **How do you handle message ordering?** Use a partition key that groups related messages. All messages with the same key go to the same partition and are processed in order. Trade-off: fewer partitions = more ordering, less parallelism.

4. **What happens when a consumer is slow?** Messages queue up (backpressure). Solutions: scale consumers horizontally, increase partition count, implement rate limiting on producers, use bounded queues, or drop non-critical messages.

5. **How do you handle poison messages?** Messages that always fail processing. Set a max retry count, then move to DLQ. Log the failure reason. Alert the team. Fix the bug and replay from DLQ.

6. **When would you use pub/sub vs point-to-point?** Pub/sub: when multiple independent services need to react to the same event (order placed -> billing, shipping, analytics). Point-to-point: when work should be processed by exactly one consumer (job queue, task distribution).

7. **How do you choose between JSON, Protobuf, and Avro?** JSON for simplicity and debugging. Protobuf for high-throughput microservices (compact, fast, schema-enforced). Avro for Kafka ecosystems (schema registry, schema evolution, compact).

8. **What is backpressure and how do you handle it?** When producers outpace consumers. Handle by: scaling consumers, bounding queue size, rate-limiting producers, or dropping low-priority messages. Never let a queue grow unbounded.
