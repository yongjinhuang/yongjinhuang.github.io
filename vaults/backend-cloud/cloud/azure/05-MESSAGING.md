# Azure Messaging: Service Bus, Event Hubs & Event Grid

Azure has three complementary messaging services: Service Bus for enterprise messaging, Event Hubs for event streaming (Kafka-compatible), and Event Grid for reactive event routing.

---

## Table of Contents

1. [Azure Service Bus](#azure-service-bus)
2. [Event Hubs](#event-hubs)
3. [Event Grid](#event-grid)
4. [Comparison](#comparison)
5. [Common Interview Questions](#common-interview-questions)

---

## Azure Service Bus

Enterprise message broker supporting queues (point-to-point) and topics (pub/sub).

### Key Features

| Feature | Details |
| ------- | ------- |
| **Protocol** | AMQP 1.0, HTTP, custom SDKs |
| **Queues** | Point-to-point (one consumer per message) |
| **Topics** | Pub/sub with subscription filters |
| **Sessions** | Ordered, stateful processing per session ID |
| **Transactions** | Cross-entity atomic operations |
| **Scheduled messages** | Deliver at specific future time |
| **Dead letter** | Built-in DLQ per queue/subscription |
| **Duplicate detection** | Time-window deduplication |
| **Max message** | 256 KB (Standard), 100 MB (Premium) |
| **Batching** | Client-side batching for throughput |

### Sessions (Unique to Service Bus)

```
Messages with session_id = "order-123":
  -> All routed to same consumer, in strict FIFO order
  -> Consumer can maintain state for that session
  -> If consumer disconnects, session reassigned to another consumer

Use cases:
  - Order processing (all events for one order, in sequence)
  - Multi-step workflows (steps must execute in order)
  - User activity processing (all actions per user session)
```

### Topic Subscription Filters

```
Topic: "orders"
  Subscription A (billing): filter by SqlFilter("amount > 100")
  Subscription B (shipping): filter by SqlFilter("region = 'US'")
  Subscription C (audit): no filter (gets ALL messages)

Message: { amount: 150, region: "US" }
  -> Subscription A: YES (amount > 100)
  -> Subscription B: YES (region = US)
  -> Subscription C: YES (no filter)
```

---

## Event Hubs

High-throughput event streaming platform, Kafka-compatible.

```
+--Event Hub Namespace--+
| +--Event Hub (topic)--+|
| | Partition 0: [e1][e2]||
| | Partition 1: [e3][e4]||
| | Partition 2: [e5][e6]||
| +---------------------+|
+------------------------+

Consumer groups:
  Group A: read all partitions (analytics)
  Group B: read all partitions (billing)
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Throughput** | Millions of events/sec |
| **Partitions** | 1-32 (Standard), 1-100 (Premium/Dedicated) |
| **Retention** | 1-90 days (Standard), up to unlimited (Dedicated) |
| **Capture** | Auto-capture to Azure Blob Storage or Data Lake |
| **Kafka compatible** | Use Kafka clients with Event Hubs endpoint |
| **Schema Registry** | Avro, JSON Schema (built-in) |
| **Pricing** | Throughput units (TU) or processing units (PU) |

### Event Hubs vs Kafka

| Feature | Event Hubs | Kafka |
| ------- | ---------- | ----- |
| **Management** | Fully managed | Self-managed |
| **Protocol** | AMQP + Kafka compatible | Kafka protocol |
| **Partitions** | Up to 100 | Unlimited |
| **Retention** | Up to 90 days (Standard) | Unlimited |
| **Stream processing** | Azure Stream Analytics | Kafka Streams |
| **Capture** | Built-in to Blob/Data Lake | Kafka Connect to S3 |
| **Pricing** | Per TU/hour + per event | Per broker |

### Kafka Compatibility

```
Use any Kafka client library with Event Hubs:
  bootstrap.servers = <namespace>.servicebus.windows.net:9093
  security.protocol = SASL_SSL
  sasl.mechanism = PLAIN
  sasl.jaas.config = ... (using Event Hubs connection string)

Topic = Event Hub name
Consumer Group = Kafka consumer group
Partition = Event Hub partition
```

---

## Event Grid

Serverless event routing for reactive architectures.

```
Event Source -> Event Grid -> Event Handler

Sources:                          Handlers:
  Azure Blob Storage              Azure Functions
  Azure Resource Manager          Logic Apps
  Custom topics                   Webhooks (HTTP)
  IoT Hub                        Service Bus
  Cosmos DB (change feed)         Event Hubs
                                  Storage Queues
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Delivery** | At-least-once |
| **Latency** | Sub-second event delivery |
| **Filtering** | Event type, subject, data fields |
| **Dead letter** | Failed events stored in Blob Storage |
| **Retry** | Exponential backoff (up to 24 hours) |
| **Throughput** | 10 million events/sec per topic |
| **Pricing** | $0.60 per million operations (first 100K free) |

### Event Grid vs Service Bus vs Event Hubs

```
Event Grid: REACT to events (blob created, resource changed)
  -> Low latency, stateless routing, serverless triggers

Service Bus: PROCESS messages (commands, tasks, workflows)
  -> Queuing, sessions, transactions, dead letter

Event Hubs: STREAM events (telemetry, logs, clickstream)
  -> High throughput, replay, analytics, Kafka compatible
```

---

## Comparison

| Feature | Service Bus | Event Hubs | Event Grid |
| ------- | ----------- | ---------- | ---------- |
| **Model** | Queue + pub/sub | Event streaming | Event routing |
| **Protocol** | AMQP + HTTP | AMQP + Kafka | HTTP (webhooks) |
| **Ordering** | FIFO (sessions) | Per partition | Best-effort |
| **Delivery** | At-least-once | At-least-once | At-least-once |
| **Max message** | 100 MB (Premium) | 1 MB | 1 MB |
| **Retention** | 14 days | 90 days | 24 hours (retry) |
| **Replay** | No | Yes (offset-based) | No |
| **Sessions** | Yes | No | No |
| **Transactions** | Yes | No | No |
| **Throughput** | Moderate | Very high | Very high |
| **AWS equiv** | SQS + SNS | Kinesis | EventBridge |
| **Best for** | Enterprise messaging | Data streaming | Reactive events |

---

## Common Interview Questions

1. **When do you use Service Bus vs Event Hubs vs Event Grid?** Service Bus for command/task processing with ordering, sessions, and transactions. Event Hubs for high-throughput streaming and analytics (Kafka workloads). Event Grid for reactive event routing (trigger functions on blob upload, resource changes).

2. **What are Service Bus sessions?** Sessions group related messages by a session ID. All messages with the same session ID are processed by one consumer in FIFO order. The consumer can maintain state per session. If the consumer disconnects, the session is reassigned.

3. **How is Event Hubs Kafka-compatible?** Event Hubs exposes a Kafka protocol endpoint. Any Kafka client can connect by pointing bootstrap servers to the Event Hubs namespace. Event Hub = topic, partition = partition, consumer group = consumer group.

4. **What is Event Grid's delivery guarantee?** At-least-once with retry. Failed deliveries are retried with exponential backoff for up to 24 hours. After that, events go to a dead letter location (Blob Storage). Handlers must be idempotent.

5. **How does Service Bus compare to SQS?** Service Bus supports AMQP (richer protocol), sessions (ordered stateful processing), transactions (cross-entity), and larger messages (100 MB vs 256 KB). SQS is simpler and cheaper for basic queuing.
