# Message Queues & Event-Driven Architecture Overview

Message queues are the backbone of distributed systems. They decouple services, absorb traffic spikes, enable async processing, and make systems resilient to failures. As a backend engineer, understanding messaging patterns, delivery guarantees, and when to pick which queue is a must for system design interviews.

---

## Messaging Landscape

### Traditional Message Queues

| System | One-Liner | Best For |
| ------ | --------- | -------- |
| **RabbitMQ** | Feature-rich AMQP broker with flexible routing | Complex routing, task queues, RPC |
| **ActiveMQ** | Java-based, JMS-compliant | Enterprise Java applications |

### Event Streaming Platforms

| System | One-Liner | Best For |
| ------ | --------- | -------- |
| **Apache Kafka** | Distributed log with replay and stream processing | Event sourcing, high-throughput streaming |
| **Apache Pulsar** | Multi-tenant streaming with tiered storage | Multi-tenancy, geo-replication |
| **Redpanda** | Kafka-compatible, no JVM, simpler ops | Kafka workloads with simpler operations |

### Cloud-Managed Queues

| Service | One-Liner | Best For |
| ------- | --------- | -------- |
| **AWS SQS** | Fully managed queue (standard + FIFO) | AWS-native apps, simple decoupling |
| **AWS SNS** | Pub/sub fan-out notifications | Event fan-out to multiple consumers |
| **Google Pub/Sub** | Global pub/sub with exactly-once | GCP apps, high-throughput pub/sub |
| **Azure Service Bus** | Enterprise messaging with sessions | Azure apps, complex workflows |
| **Cloudflare Queues** | Edge-native queue for Workers | Cloudflare Workers ecosystem |

### Lightweight / Modern

| System | One-Liner | Best For |
| ------ | --------- | -------- |
| **NATS** | Ultra-lightweight pub/sub (core) | Microservices, IoT, low-latency |
| **NATS JetStream** | NATS + persistence and replay | Persistent messaging without Kafka complexity |
| **Redis Streams** | Append-only log built into Redis | Simple streaming with existing Redis |

---

## Decision Framework

```
Need event replay / stream processing?
  Yes -> Kafka, Pulsar, NATS JetStream
  No  -> Do you need complex routing?
           Yes -> RabbitMQ
           No  -> Do you want managed?
                    Yes -> SQS (AWS), Pub/Sub (GCP), Service Bus (Azure)
                    No  -> NATS (lightweight), Redis Streams (simple)
```

---

## Delivery Guarantees Comparison

| System | At-Most-Once | At-Least-Once | Exactly-Once |
| ------ | ------------ | ------------- | ------------ |
| Kafka | Yes | Yes (default) | Yes (idempotent producer + transactions) |
| RabbitMQ | Yes (no ack) | Yes (manual ack) | No (use idempotency) |
| SQS Standard | No | Yes | No |
| SQS FIFO | No | Yes | Yes (deduplication) |
| Google Pub/Sub | No | Yes (default) | Yes (exactly-once delivery) |
| NATS Core | Yes | No | No |
| NATS JetStream | Yes | Yes | No (use idempotency) |

---

## Table of Contents

| # | File | Topic | Key Concepts |
| - | ---- | ----- | ------------ |
| 1 | [01-MESSAGING-FUNDAMENTALS.md](01-MESSAGING-FUNDAMENTALS.md) | Fundamentals | Delivery guarantees, ordering, backpressure, idempotency |
| 2 | [02-KAFKA.md](02-KAFKA.md) | Apache Kafka | Topics, partitions, consumer groups, exactly-once, Kafka Streams |
| 3 | [03-RABBITMQ.md](03-RABBITMQ.md) | RabbitMQ | AMQP, exchanges, queues, bindings, quorum queues |
| 4 | [04-CLOUD-QUEUES.md](04-CLOUD-QUEUES.md) | Cloud Queues | SQS, SNS, Google Pub/Sub, Azure Service Bus |
| 5 | [05-NATS-PULSAR.md](05-NATS-PULSAR.md) | Modern Alternatives | NATS, JetStream, Pulsar, Redis Streams |
| 6 | [06-EVENT-DRIVEN-PATTERNS.md](06-EVENT-DRIVEN-PATTERNS.md) | Patterns | Event sourcing, saga, outbox, CQRS, choreography vs orchestration |
