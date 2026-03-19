# Modern Messaging: NATS, Pulsar, and Redis Streams

Beyond Kafka and RabbitMQ, a new generation of messaging systems has emerged. NATS offers ultra-lightweight messaging, Pulsar provides multi-tenant streaming with tiered storage, and Redis Streams adds log-based messaging to your existing Redis deployment.

---

## Table of Contents

1. [NATS](#nats)
2. [NATS JetStream](#nats-jetstream)
3. [Apache Pulsar](#apache-pulsar)
4. [Redis Streams](#redis-streams)
5. [Comparison](#comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## NATS

NATS Core is an ultra-lightweight pub/sub messaging system. Written in Go, it focuses on simplicity, performance, and operational ease.

### Architecture

```
+----------------------------------------------------------+
|                    NATS Cluster                           |
|  +--------+     +--------+     +--------+                |
|  | Server |<--->| Server |<--->| Server |  Full mesh     |
|  +--------+     +--------+     +--------+                |
+----------------------------------------------------------+
     ^                 ^                ^
     |                 |                |
+---------+      +---------+      +---------+
| Pub     |      | Sub     |      | Sub     |
| (Go)    |      | (Node)  |      | (Rust)  |
+---------+      +---------+      +---------+
```

### Core Pub/Sub

```
Subject-based addressing:
  "orders.created"       -- specific event
  "orders.*"             -- wildcard: orders.created, orders.cancelled
  "orders.>"             -- deep wildcard: orders.us.east.created

Publish:
  nats.publish("orders.created", data)

Subscribe:
  nats.subscribe("orders.*", (msg) => process(msg))
```

### Key Properties

| Property | Details |
| -------- | ------- |
| **Delivery** | At-most-once (fire-and-forget) |
| **Persistence** | None (messages exist only in transit) |
| **Latency** | Microseconds |
| **Throughput** | Millions of msg/s |
| **Protocol** | Text-based (simple, human-readable) |
| **Binary** | Single binary, zero config to start |
| **Clustering** | Full mesh, auto-discovery |

### Request-Reply Pattern

```
Requester -> NATS -> Responder
          <- reply <-

nats.request("api.users.get", { id: 123 })
  -> response: { name: "Alice" }

Built-in timeout and load balancing across multiple responders.
```

---

## NATS JetStream

JetStream adds persistence, replay, and exactly-once to NATS Core.

```
NATS Core: at-most-once, no persistence
JetStream: at-least-once, persistent, replay from any point

+----------------------------------------------------------+
| JetStream                                                 |
|  +--Stream "ORDERS"------+                                |
|  | Subject: orders.>     |                                |
|  | [msg1][msg2][msg3]..  |  <-- Persistent, replicated   |
|  +-----+---------+-------+                                |
|        |         |                                        |
|  +-----v---+ +---v-------+                                |
|  |Consumer | |Consumer   |                                |
|  |"billing"| |"shipping" |  <-- Independent cursors       |
|  +---------+ +-----------+                                |
+----------------------------------------------------------+
```

### Streams and Consumers

```
Stream: stores messages
  - Retention: limits (time, count, bytes) or interest (delete when all consumers ACK)
  - Replicas: 1-5 for HA
  - Subjects: which NATS subjects to capture

Consumer: reads messages from a stream
  - Durable: survives restart (named, offset tracked)
  - Ephemeral: temporary (deleted on disconnect)
  - Pull: consumer requests messages
  - Push: stream delivers to consumer
  - Ack policy: explicit, none, all
  - Replay: instant or original timing
```

### JetStream vs Kafka

| Feature | JetStream | Kafka |
| ------- | --------- | ----- |
| **Simplicity** | Single binary, built into NATS | Multi-component (brokers, KRaft/ZK) |
| **Protocol** | NATS (text-based) | Kafka protocol (binary) |
| **Multi-tenancy** | Accounts and JetStream domains | Topic ACLs |
| **Stream processing** | No built-in (use external) | Kafka Streams, ksqlDB |
| **Ecosystem** | Growing | Massive (Connect, Schema Registry) |
| **Throughput** | High (~500K msg/s) | Very high (~1M+ msg/s) |
| **Operations** | Minimal | More complex |
| **Best for** | Microservices, edge, IoT | Enterprise streaming, data pipelines |

---

## Apache Pulsar

Apache Pulsar is a distributed messaging and streaming platform with built-in multi-tenancy, tiered storage, and geo-replication.

### Architecture (Separating Compute and Storage)

```
+----------------------------------------------------------+
|                    Pulsar Cluster                          |
|                                                           |
|  Brokers (stateless compute):                             |
|  +--------+     +--------+     +--------+                 |
|  | Broker |     | Broker |     | Broker |                 |
|  +--------+     +--------+     +--------+                 |
|       |              |              |                      |
|  BookKeeper (distributed storage):                        |
|  +--------+     +--------+     +--------+                 |
|  | Bookie |     | Bookie |     | Bookie |                 |
|  +--------+     +--------+     +--------+                 |
|                      |                                    |
|  Tiered Storage:     v                                    |
|  +---------------------------+                            |
|  | S3 / GCS / Azure Blob    |  <-- Offload old data      |
|  +---------------------------+                            |
+----------------------------------------------------------+
```

### Key Differentiators

| Feature | Pulsar | Kafka |
| ------- | ------ | ----- |
| **Architecture** | Separate compute (brokers) and storage (BookKeeper) | Brokers = compute + storage |
| **Scaling** | Scale brokers and storage independently | Scale together |
| **Multi-tenancy** | Built-in (tenant/namespace/topic) | Topic-level ACLs |
| **Geo-replication** | Built-in cross-cluster replication | MirrorMaker 2 (operational overhead) |
| **Tiered storage** | Built-in (offload to S3/GCS) | Kafka 3.0+ (limited) |
| **Topic types** | Persistent + Non-persistent | Persistent only |
| **Queuing model** | Shared subscription (like SQS) + Exclusive + Failover | Consumer groups only |
| **Protocol** | Binary (Pulsar protocol) + Kafka-compatible | Kafka protocol |

### Subscription Types

```
Exclusive: One consumer per subscription (like a dedicated reader)
Shared: Multiple consumers, round-robin (like SQS, for parallelism)
Failover: One active consumer, others on standby (HA)
Key_Shared: Keyed distribution (like Kafka consumer groups)
```

### When Pulsar Over Kafka

- Multi-tenant environment (shared cluster, isolated tenants)
- Geo-replication is a first-class requirement
- Need independent storage scaling (long retention + fast reads)
- Need both queuing (shared subscription) and streaming in one system
- Tiered storage for cost-effective long retention

---

## Redis Streams

Redis Streams add a log-based data structure to Redis, enabling simple event streaming without deploying Kafka.

### Key Commands

```redis
-- Produce
XADD orders * user_id 123 product "Widget" total 29.99
-- Returns: "1704067200000-0" (auto-generated ID: timestamp-sequence)

-- Consume (simple read)
XREAD COUNT 10 BLOCK 5000 STREAMS orders 0
-- Reads up to 10 messages, blocks up to 5 seconds if empty

-- Consumer group (like Kafka consumer group)
XGROUP CREATE orders billing $ MKSTREAM
XREADGROUP GROUP billing consumer-1 COUNT 10 BLOCK 5000 STREAMS orders >
-- > means: only new messages (not previously delivered)

-- Acknowledge
XACK orders billing "1704067200000-0"

-- Check pending (unacked) messages
XPENDING orders billing - + 10

-- Claim stuck messages (consumer crash recovery)
XCLAIM orders billing consumer-2 60000 "1704067200000-0"
-- Claim if idle > 60 seconds
```

### When to Use Redis Streams

| Good For | Bad For |
| -------- | ------- |
| Simple event streaming (small scale) | High-throughput streaming (use Kafka) |
| You already use Redis | Long-term message retention |
| Real-time notifications | Complex routing (use RabbitMQ) |
| Activity feeds | Exactly-once processing |
| Task queues with visibility | Multi-datacenter replication |

---

## Comparison

| Feature | NATS Core | JetStream | Pulsar | Redis Streams |
| ------- | --------- | --------- | ------ | ------------- |
| **Delivery** | At-most-once | At-least-once | At-least-once / Effectively-once | At-least-once |
| **Persistence** | No | Yes (replicated) | Yes (BookKeeper) | Yes (Redis persistence) |
| **Ordering** | No | Per-stream | Per-partition | Per-stream |
| **Throughput** | Very high | High | Very high | Moderate |
| **Latency** | Microseconds | Milliseconds | Milliseconds | Microseconds |
| **Operations** | Minimal | Simple | Moderate (BookKeeper) | Simple (Redis) |
| **Multi-tenancy** | Accounts | Accounts | Built-in | N/A |
| **Geo-replication** | Leaf nodes, gateways | Streams across clusters | Built-in | Redis Cluster |
| **Best for** | Microservices, IoT | Simple persistent messaging | Enterprise multi-tenant | Simple streaming, existing Redis |

---

## Common Interview Questions

1. **When would you choose NATS over Kafka?** NATS for lightweight microservices communication where message persistence is not required (request-reply, event notification). JetStream when you want Kafka-like persistence with simpler operations. Kafka for enterprise-grade streaming, large ecosystem, stream processing.

2. **What is Pulsar's key architectural advantage?** Separating compute (brokers) and storage (BookKeeper). This allows independent scaling of each, unlike Kafka where brokers handle both. Adding storage capacity doesn't require rebalancing all data.

3. **How do Redis Streams compare to Kafka?** Redis Streams are simpler, lower latency, and require no additional infrastructure if you already use Redis. But Kafka offers higher throughput, longer retention, better durability, stream processing, and a larger ecosystem.

4. **What is NATS request-reply?** Built-in RPC pattern. Requester publishes to a subject with a reply-to inbox. Responder processes and replies to the inbox. NATS routes the response back. Multiple responders = automatic load balancing.

5. **When would you choose Pulsar over Kafka?** Multi-tenant environments, built-in geo-replication needs, need for both queuing and streaming in one system, or when you need independent storage scaling with tiered storage.
