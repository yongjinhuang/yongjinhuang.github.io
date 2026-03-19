# Design a Distributed Message Queue (Kafka)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [Message Queue vs Event Streaming](#2-message-queue-vs-event-streaming)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Core Concepts Deep Dive](#4-core-concepts-deep-dive)
5. [Data Model](#5-data-model)
6. [Replication & Fault Tolerance](#6-replication--fault-tolerance)
7. [Delivery Semantics](#7-delivery-semantics)
8. [Performance Optimizations](#8-performance-optimizations)
9. [Message Ordering](#9-message-ordering)
10. [Scaling](#10-scaling)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Common Interview Follow-ups](#12-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Requirement             | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| Publish messages        | Producers send messages to named topics                          |
| Subscribe to topics     | Consumers read messages from one or more topics                  |
| Topic-based routing     | Messages are organized into logical topics                       |
| Message retention       | Messages persist for a configurable duration (e.g., 7 days)      |
| Message replay          | Consumers can re-read old messages by resetting offset           |
| Consumer groups         | Multiple consumers share work; each message delivered once/group |
| Ordering guarantees     | Messages within a partition are strictly ordered                 |
| At-least-once delivery  | Default delivery guarantee with consumer acknowledgment          |
| Exactly-once (optional) | Transactional support for critical workloads                     |

### Non-Functional Requirements

| Requirement  | Target                                                          |
| ------------ | --------------------------------------------------------------- |
| Throughput   | Millions of messages per second (aggregate across cluster)      |
| Latency      | < 10ms for 99th percentile end-to-end (producer to consumer)    |
| Durability   | No message loss once acknowledged (replication factor >= 3)     |
| Availability | 99.99% uptime; survive single broker failure with zero downtime |
| Scalability  | Horizontal scaling by adding brokers and partitions             |
| Ordering     | Strict ordering within a partition                              |
| Retention    | Configurable; default 7 days; support infinite retention        |

### Scale Estimates

```
Daily data volume:       1 TB/day
Messages per second:     1,000,000 (peak)
Average message size:    1 KB
Messages per day:        1 TB / 1 KB = ~1 billion messages/day
Retention period:        7 days
Total storage:           7 TB raw * 3 replicas = 21 TB
```

### Back-of-Envelope Calculations

```
Write throughput:
  1,000,000 msgs/sec * 1 KB = 1 GB/sec aggregate write throughput
  With 3x replication: 3 GB/sec total disk write throughput

Brokers needed (write-heavy):
  Single broker disk throughput: ~200 MB/sec (SSD sequential write)
  Brokers for write: 3 GB/sec / 200 MB/sec = 15 brokers minimum
  With headroom (60% utilization): ~25 brokers

Partitions:
  Target: 1,000,000 msgs/sec
  Single partition throughput: ~10,000 msgs/sec (producer side)
  Partitions needed: 1,000,000 / 10,000 = 100 partitions minimum
  With headroom: ~200-300 partitions across all topics

Network bandwidth:
  Ingress: 1 GB/sec
  Egress: 1 GB/sec * N consumer groups (fan-out)
  If 5 consumer groups: 5 GB/sec egress
  Per-broker egress (25 brokers): 200 MB/sec per broker

Memory (page cache):
  Hot data = last 30 minutes of data
  30 min * 60 sec * 1 GB/sec = 1.8 TB
  Per broker: 1.8 TB / 25 = ~72 GB
  Target: 128 GB RAM per broker (good page cache coverage)
```

---

## 2. Message Queue vs Event Streaming

### Traditional Message Queue (e.g., RabbitMQ, ActiveMQ)

```
Producer --> [ Queue ] --> Consumer
                |
                v
         (message deleted
          after consumption)
```

- Messages are deleted after successful consumption
- Supports complex routing (fanout, topic, headers, direct exchange)
- Push-based delivery to consumers
- Per-message acknowledgment
- Best for task distribution and RPC patterns

### Event Streaming Platform (e.g., Kafka, Pulsar)

```
Producer --> [ Append-Only Log ] --> Consumer A (offset 5)
                                 --> Consumer B (offset 2)
                                 --> Consumer C (offset 8)
```

- Messages are retained regardless of consumption (log-based)
- Consumers track their own position (offset) in the log
- Pull-based delivery (consumers poll for new data)
- Supports replay by resetting consumer offset
- Best for event sourcing, stream processing, data pipelines

### Comparison Table

| Feature            | Traditional MQ (RabbitMQ)       | Event Streaming (Kafka)        |
| ------------------ | ------------------------------- | ------------------------------ |
| Message lifecycle  | Deleted after consumption       | Retained for configured period |
| Delivery model     | Push to consumers               | Pull by consumers              |
| Replay capability  | No (message gone)               | Yes (reset offset)             |
| Routing complexity | Rich (exchanges, bindings)      | Simple (topic + partition key) |
| Consumer groups    | Competing consumers             | Consumer groups with offsets   |
| Ordering           | Per-queue (not guaranteed)      | Per-partition (guaranteed)     |
| Throughput         | ~50K msgs/sec per node          | ~1M+ msgs/sec per node         |
| Latency            | Sub-millisecond                 | Single-digit milliseconds      |
| Protocol           | AMQP, STOMP, MQTT               | Custom binary protocol         |
| Backpressure       | Queue depth / consumer prefetch | Consumer-controlled pull rate  |
| Message priorities | Yes (built-in)                  | No (must be designed around)   |
| Dead letter queue  | Built-in                        | Must implement manually        |
| Exactly-once       | Via transactions                | Idempotent producer + EOS      |
| Storage            | In-memory + optional disk       | Always disk (append-only log)  |

### When to Use Which

```
Use Traditional MQ when:
  - You need complex routing logic (fanout, topic exchange, headers)
  - Task distribution among workers (competing consumers)
  - Request-reply / RPC patterns
  - Message priority is important
  - Messages should be deleted after processing
  - Sub-millisecond latency is critical

Use Event Streaming when:
  - You need message replay / reprocessing
  - High throughput (millions msgs/sec) is required
  - Event sourcing or CQRS architecture
  - Multiple independent consumers need same data
  - Stream processing (aggregations, joins, windowing)
  - Data pipeline / ETL workloads
  - Audit log / compliance requirements
```

---

## 3. High-Level Architecture

### Kafka-like Architecture

```
                         ┌─────────────────────────────────────────┐
                         │           Coordination Layer             │
                         │     (ZooKeeper / KRaft Controller)       │
                         │                                         │
                         │  - Broker membership & health           │
                         │  - Topic/partition metadata             │
                         │  - Leader election                      │
                         │  - ACLs and quotas                      │
                         └────────────┬────────────────────────────┘
                                      │ metadata
                                      │
    ┌──────────┐          ┌───────────┴───────────────────────────────────┐
    │Producer 1│──────┐   │                 Broker Cluster                 │
    ├──────────┤      │   │                                               │
    │Producer 2│──────┤   │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
    ├──────────┤      ├──>│  │Broker 1 │  │Broker 2 │  │Broker 3 │      │
    │Producer 3│──────┤   │  │         │  │         │  │         │      │
    └──────────┘      │   │  │ TopicA  │  │ TopicA  │  │ TopicA  │      │
                      │   │  │ P0(L)   │  │ P0(F)   │  │ P0(F)   │      │
                      │   │  │ P1(F)   │  │ P1(L)   │  │ P1(F)   │      │
                      │   │  │ P2(F)   │  │ P2(F)   │  │ P2(L)   │      │
                      │   │  │         │  │         │  │         │      │
                      │   │  │ TopicB  │  │ TopicB  │  │ TopicB  │      │
                      │   │  │ P0(F)   │  │ P0(L)   │  │ P0(F)   │      │
                      │   │  └─────────┘  └─────────┘  └─────────┘      │
                      │   │                                               │
                      │   │  (L) = Leader    (F) = Follower              │
                      │   │  Replication factor = 3                       │
                      │   └───────────┬───────────────────────────────────┘
                      │               │
                      │               │
                      │   ┌───────────┴────────────────────────────┐
                      │   │            Consumer Groups              │
                      │   │                                        │
                      │   │  Group "analytics"    Group "search"   │
                      │   │  ┌────────────┐       ┌────────────┐  │
                      │   │  │Consumer A  │       │Consumer D  │  │
                      │   │  │ (P0, P1)   │       │ (P0)       │  │
                      │   │  ├────────────┤       ├────────────┤  │
                      │   │  │Consumer B  │       │Consumer E  │  │
                      │   │  │ (P2)       │       │ (P1, P2)   │  │
                      │   │  └────────────┘       └────────────┘  │
                      │   └────────────────────────────────────────┘
                      │
              ┌───────┴────────┐
              │  Schema Registry│ (optional)
              │  (Avro/Protobuf)│
              └────────────────┘
```

### Component Responsibilities

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ Component    │ Responsibility                                       │
├──────────────┼──────────────────────────────────────────────────────┤
│ Producer     │ Serialize, partition, batch, compress, send messages │
│ Broker       │ Store messages, serve reads, replicate, manage state │
│ Consumer     │ Poll messages, deserialize, process, commit offsets  │
│ ZK / KRaft   │ Cluster metadata, leader election, configuration    │
│ Schema Reg.  │ Schema storage, compatibility checks, serialization │
└──────────────┴──────────────────────────────────────────────────────┘
```

### Request Flow: Producing a Message

```
1. Producer serializes message (key + value)
2. Partitioner selects target partition
     - If key is present: hash(key) % num_partitions
     - If key is null: round-robin or sticky partition
3. Message added to per-partition batch buffer
4. Background sender thread transmits batch to partition leader
5. Leader broker:
   a. Validates message (CRC, size, authorization)
   b. Appends to local log segment
   c. Replicates to follower brokers (ISR)
6. Based on acks setting:
   - acks=0: No acknowledgment (fire and forget)
   - acks=1: Leader acknowledges after local write
   - acks=all: Leader acknowledges after all ISR replicas confirm
7. Producer receives acknowledgment (or retries on failure)
```

### Request Flow: Consuming a Message

```
1. Consumer sends FetchRequest to partition leader
     - Includes: topic, partition, offset, max_bytes
2. Leader broker:
   a. Looks up offset in index file
   b. Reads data from log segment (often served from page cache)
   c. Uses zero-copy (sendfile) to transfer data to socket
3. Consumer receives FetchResponse with batch of messages
4. Consumer deserializes and processes messages
5. Consumer commits offset:
   - Auto-commit: Periodic background commit (default 5 sec)
   - Manual commit: Application-controlled after processing
6. Committed offset stored in __consumer_offsets internal topic
```

---

## 4. Core Concepts Deep Dive

### 4.1 Topics & Partitions

A **topic** is a logical channel for organizing messages. A **partition** is the unit
of parallelism and ordering within a topic.

```
Topic: "user-events" (3 partitions, replication factor = 3)

  Partition 0                    Partition 1                    Partition 2
  ┌───┬───┬───┬───┬───┬───┐    ┌───┬───┬───┬───┬───┐         ┌───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │    │ 0 │ 1 │ 2 │ 3 │ 4 │         │ 0 │ 1 │ 2 │ 3 │
  └───┴───┴───┴───┴───┴───┘    └───┴───┴───┴───┴───┘         └───┴───┴───┴───┘
  offset ──────────────────>    offset ──────────────>         offset ────────>
  (append-only, immutable)      (append-only, immutable)       (append-only)

  Leader: Broker 1               Leader: Broker 2              Leader: Broker 3
  Followers: Broker 2, 3         Followers: Broker 1, 3        Followers: Broker 1, 2
```

**Key Properties of Partitions:**

- Each partition is an ordered, immutable sequence of messages
- Each message within a partition gets a unique, monotonically increasing **offset**
- Partitions are distributed across brokers for load balancing
- A single partition cannot span multiple brokers (unit of placement)
- Ordering is guaranteed only within a single partition
- Partitions can be added but never removed (adding invalidates key-based routing)

**Partition Count Guidelines:**

```
Desired throughput:       T msgs/sec
Single partition throughput: p msgs/sec (~10,000 for producer, ~50,000 for consumer)
Minimum partitions:       max(T/p_producer, T/p_consumer)

Example:
  Target: 500,000 msgs/sec
  Producer side: 500,000 / 10,000 = 50 partitions
  Consumer side: 500,000 / 50,000 = 10 partitions
  Recommended:   50 partitions (limited by producer throughput)
  With headroom: 60-80 partitions
```

**Partition Assignment Strategies:**

| Strategy    | Description                                        | Use Case                    |
| ----------- | -------------------------------------------------- | --------------------------- |
| Round-robin | Distribute evenly across partitions                | No ordering requirement     |
| Key-based   | hash(key) % partitions; same key -> same partition | Ordering per entity         |
| Custom      | Application-defined partitioner                    | Geography, priority, etc.   |
| Sticky      | Batch to same partition until batch full           | Improve batching efficiency |

### 4.2 Producers

#### Producer Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                   Producer                       │
                    │                                                  │
  send(record) ──> │  ┌────────────┐   ┌────────────┐                │
                    │  │ Serializer │──>│Partitioner │                │
                    │  │ (key+value)│   │            │                │
                    │  └────────────┘   └─────┬──────┘                │
                    │                         │                        │
                    │         ┌────────────────┼────────────────┐      │
                    │         v                v                v      │
                    │  ┌──────────┐     ┌──────────┐    ┌──────────┐ │
                    │  │ Batch P0 │     │ Batch P1 │    │ Batch P2 │ │
                    │  │ (buffer) │     │ (buffer) │    │ (buffer) │ │
                    │  └────┬─────┘     └────┬─────┘    └────┬─────┘ │
                    │       └────────────────┬┘───────────────┘       │
                    │                        v                         │
                    │               ┌────────────────┐                │
                    │               │  Sender Thread  │                │
                    │               │  (background)   │                │
                    │               └────────┬───────┘                │
                    └────────────────────────┼─────────────────────────┘
                                             │
                              Network ───────┴──────── Network
                                │                          │
                           ┌────┴────┐              ┌──────┴──┐
                           │Broker 1 │              │Broker 2  │
                           │(P0 lead)│              │(P1 lead) │
                           └─────────┘              └──────────┘
```

#### Batching and Compression

```
Producer Configuration:

  batch.size = 16384            # Max bytes per batch (16 KB default)
  linger.ms = 5                 # Wait up to 5ms to fill batch
  compression.type = lz4        # Compress entire batch
  buffer.memory = 33554432      # Total buffer memory (32 MB)

Batching flow:
  Record 1 ─┐
  Record 2 ─┤
  Record 3 ─┼──> Batch (compressed) ──> Single network request
  Record 4 ─┤
  Record 5 ─┘

Compression comparison:
  ┌─────────────┬───────────┬───────────────┬─────────────────┐
  │ Algorithm   │ Ratio     │ Compress Speed│ Decompress Speed│
  ├─────────────┼───────────┼───────────────┼─────────────────┤
  │ none        │ 1.0x      │ N/A           │ N/A             │
  │ gzip        │ ~0.35x    │ Slow          │ Medium          │
  │ snappy      │ ~0.45x    │ Fast          │ Very Fast       │
  │ lz4         │ ~0.40x    │ Very Fast     │ Very Fast       │
  │ zstd        │ ~0.33x    │ Medium        │ Fast            │
  └─────────────┴───────────┴───────────────┴─────────────────┘

  Recommended: lz4 for most workloads (best speed/ratio balance)
               zstd for storage-sensitive workloads (best ratio)
```

#### Acknowledgment Modes

```
acks=0 (Fire and Forget)
  Producer ──send──> Broker
  (no waiting, no retry, highest throughput, possible message loss)

  Throughput: ~2,000,000 msgs/sec
  Durability: None
  Use case:   Metrics, logs where loss is acceptable

acks=1 (Leader Acknowledgment)
  Producer ──send──> Leader Broker ──ack──> Producer
                         │
                         └──async replicate──> Followers
  (leader confirms write, followers may lag)

  Throughput: ~1,000,000 msgs/sec
  Durability: Survives follower failure; leader failure may lose data
  Use case:   Most general-purpose workloads

acks=all / acks=-1 (Full ISR Acknowledgment)
  Producer ──send──> Leader Broker ──replicate──> All ISR Followers
                         │                              │
                         │<─────────ack─────────────────┘
                         │
                         └──────────ack──> Producer
  (all in-sync replicas confirm)

  Throughput: ~500,000 msgs/sec
  Durability: Survives any single broker failure; strongest guarantee
  Use case:   Financial transactions, critical events
```

#### Key Producer Configurations

```properties
# Reliability
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
enable.idempotence=true

# Performance
batch.size=65536
linger.ms=10
compression.type=lz4
buffer.memory=67108864

# Timeouts
delivery.timeout.ms=120000
request.timeout.ms=30000
```

### 4.3 Consumers & Consumer Groups

#### Consumer Group Concept

A consumer group is a set of consumers that cooperatively consume from a topic.
Each partition is assigned to exactly one consumer within a group.

```
Topic "orders" has 6 partitions: P0, P1, P2, P3, P4, P5

Consumer Group A (3 consumers):
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  Consumer A1 ◄── P0, P1    (2 partitions)              │
  │  Consumer A2 ◄── P2, P3    (2 partitions)              │
  │  Consumer A3 ◄── P4, P5    (2 partitions)              │
  │                                                         │
  │  Each message delivered to exactly ONE consumer         │
  └─────────────────────────────────────────────────────────┘

Consumer Group B (2 consumers) - independent of Group A:
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  Consumer B1 ◄── P0, P1, P2    (3 partitions)         │
  │  Consumer B2 ◄── P3, P4, P5    (3 partitions)         │
  │                                                         │
  │  Each message delivered to exactly ONE consumer         │
  └─────────────────────────────────────────────────────────┘

Both groups receive ALL messages (independent consumption).
Within each group, messages are load-balanced across consumers.
```

#### Scaling Consumers Within a Group

```
6 Partitions: P0, P1, P2, P3, P4, P5

1 Consumer:    C1 ◄── P0, P1, P2, P3, P4, P5  (all partitions)

2 Consumers:   C1 ◄── P0, P1, P2
               C2 ◄── P3, P4, P5

3 Consumers:   C1 ◄── P0, P1
               C2 ◄── P2, P3
               C3 ◄── P4, P5

6 Consumers:   C1 ◄── P0
               C2 ◄── P1
               C3 ◄── P2
               C4 ◄── P3
               C5 ◄── P4
               C6 ◄── P5

7 Consumers:   C1 ◄── P0    (one consumer is IDLE!)
               C2 ◄── P1
               C3 ◄── P2
               C4 ◄── P3
               C5 ◄── P4
               C6 ◄── P5
               C7 ◄── (nothing - wasted resource)

RULE: Max useful consumers = number of partitions
```

#### Rebalancing Protocol

```
Rebalance triggers:
  1. Consumer joins group
  2. Consumer leaves group (graceful shutdown or crash)
  3. Topic partition count changes
  4. Consumer heartbeat timeout (session.timeout.ms exceeded)

Rebalance flow (Eager):
  ┌──────────┐        ┌──────────────┐        ┌──────────┐
  │Consumer 1│        │Group Leader  │        │Consumer 2│
  │          │        │(Coordinator) │        │          │
  └────┬─────┘        └──────┬───────┘        └────┬─────┘
       │   JoinGroup         │                      │
       │────────────────────>│  JoinGroup            │
       │                     │<─────────────────────│
       │                     │                      │
       │  Revoke ALL         │    Revoke ALL        │
       │  partitions         │    partitions        │
       │                     │                      │
       │   SyncGroup         │                      │
       │────────────────────>│  SyncGroup            │
       │                     │<─────────────────────│
       │                     │                      │
       │  Assignment         │    Assignment        │
       │<────────────────────│─────────────────────>│
       │  (P0, P1)           │    (P2, P3)          │
       │                     │                      │

Rebalance strategies:
  ┌─────────────────┬────────────────────────────────────────────────┐
  │ Strategy        │ Description                                     │
  ├─────────────────┼────────────────────────────────────────────────┤
  │ Eager           │ Revoke all, reassign all (causes downtime)     │
  │ Cooperative     │ Incremental; only revoke partitions that move  │
  │ Static          │ Fixed assignment via group.instance.id         │
  └─────────────────┴────────────────────────────────────────────────┘
```

#### Offset Management

```
Offset = position of a consumer in a partition

Partition 0:
  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │
  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
                    ^               ^       ^
                    │               │       │
              committed         current   log end
              offset (3)       position    offset
                                (7)

  Committed offset: Last offset confirmed as processed
  Current position: Where consumer is currently reading
  Log end offset:   Latest message in partition (high watermark)
  Lag = log_end_offset - committed_offset = 9 - 3 = 6

Auto-commit:
  enable.auto.commit=true
  auto.commit.interval.ms=5000
  - Commits periodically in background
  - Risk: crash between commit -> reprocess messages (at-least-once)

Manual commit:
  enable.auto.commit=false
  consumer.commitSync()  / consumer.commitAsync()
  - Application controls when offset is committed
  - Can commit after processing for at-least-once
  - Can commit before processing for at-most-once

Offset storage:
  Stored in internal topic: __consumer_offsets (50 partitions)
  Key:   (group_id, topic, partition)
  Value: (offset, metadata, timestamp)
```

### 4.4 Message Storage

#### Append-Only Log Structure

```
Topic "payments", Partition 0

Directory: /data/kafka-logs/payments-0/

  ┌──────────────────────────────────────────────────────┐
  │                     Partition 0                       │
  │                                                      │
  │  Segment 0            Segment 1           Segment 2  │
  │  (offsets 0-999)     (offsets 1000-1999)  (active)   │
  │                                                      │
  │  ┌──────────────┐   ┌──────────────┐   ┌──────────┐ │
  │  │00000000.log  │   │00001000.log  │   │00002000. │ │
  │  │00000000.index│   │00001000.index│   │log       │ │
  │  │00000000.time │   │00001000.time │   │00002000. │ │
  │  │index         │   │index         │   │index     │ │
  │  └──────────────┘   └──────────────┘   │00002000. │ │
  │   (immutable)        (immutable)       │timeindex │ │
  │                                        └──────────┘ │
  │                                         (active,    │
  │                                          writable)  │
  └──────────────────────────────────────────────────────┘

File naming: base_offset.{log, index, timeindex}
  00000000000000000000.log       # Messages with offsets 0+
  00000000000000001000.log       # Messages with offsets 1000+
```

#### Segment Files

```
Log segment (.log):
  ┌─────────────────────────────────────────────────────────┐
  │ Record Batch 1                                          │
  │ ┌─────────────────────────────────────────────────────┐ │
  │ │ Base Offset: 0                                      │ │
  │ │ Batch Length: 256 bytes                              │ │
  │ │ Magic: 2 (message format v2)                        │ │
  │ │ CRC: 0x3A2B1C4D                                     │ │
  │ │ Compression: lz4                                     │ │
  │ │ Records:                                             │ │
  │ │   Record 0: {key: "user-123", value: "...", ts: ..} │ │
  │ │   Record 1: {key: "user-456", value: "...", ts: ..} │ │
  │ │   Record 2: {key: "user-789", value: "...", ts: ..} │ │
  │ └─────────────────────────────────────────────────────┘ │
  │ Record Batch 2                                          │
  │ ┌─────────────────────────────────────────────────────┐ │
  │ │ Base Offset: 3                                      │ │
  │ │ ...                                                  │ │
  │ └─────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘

Segment configuration:
  log.segment.bytes=1073741824     # 1 GB per segment
  log.roll.ms=604800000            # Roll every 7 days
  log.retention.hours=168          # Delete after 7 days
  log.retention.bytes=-1           # No size limit (use time-based)
  log.cleanup.policy=delete        # delete or compact
```

#### Index Files for Fast Lookup

```
Offset Index (.index):
  Maps offset -> physical position in .log file
  Sparse index (not every offset, every 4KB of data by default)

  ┌──────────┬──────────────────┐
  │ Offset   │ Physical Position│
  ├──────────┼──────────────────┤
  │ 0        │ 0                │
  │ 15       │ 4096             │
  │ 32       │ 8192             │
  │ 48       │ 12288            │
  │ ...      │ ...              │
  └──────────┴──────────────────┘

Lookup algorithm (finding offset 37):
  1. Binary search segment files by name -> segment starting at 00000000032
  2. Binary search .index -> offset 32 at position 8192
  3. Sequential scan .log from position 8192 until offset 37

Timestamp Index (.timeindex):
  Maps timestamp -> offset (for time-based lookup)

  ┌──────────────┬──────────┐
  │ Timestamp    │ Offset   │
  ├──────────────┼──────────┤
  │ 1700000000   │ 0        │
  │ 1700000100   │ 15       │
  │ 1700000200   │ 32       │
  └──────────────┴──────────┘
```

#### Zero-Copy Optimization

```
Traditional data transfer (4 copies):
  Disk ──DMA──> Kernel Buffer ──CPU──> User Buffer ──CPU──> Socket Buffer ──DMA──> NIC
  (4 copies, 2 context switches between kernel and user space)

Zero-copy transfer (2 copies):
  Disk ──DMA──> Kernel Buffer ──DMA──> NIC
  (2 copies, 0 context switches to user space)

  Uses Linux sendfile() system call
  Java: FileChannel.transferTo()

  Impact: ~65% reduction in CPU usage for consumer reads
           ~3x improvement in throughput for large reads
```

---

## 5. Data Model

### Message Format (Kafka Record)

```
Record (Message v2 format):
  ┌──────────────────────────────────────────────────────────┐
  │ Field             │ Size      │ Description               │
  ├───────────────────┼───────────┼───────────────────────────┤
  │ length            │ varint    │ Total record size          │
  │ attributes        │ int8      │ Unused (reserved)          │
  │ timestamp_delta   │ varint    │ Delta from batch timestamp │
  │ offset_delta      │ varint    │ Delta from batch base offset│
  │ key_length        │ varint    │ Key size (-1 if null)      │
  │ key               │ bytes     │ Message key (optional)     │
  │ value_length      │ varint    │ Value size (-1 if null)    │
  │ value             │ bytes     │ Message payload            │
  │ headers_count     │ varint    │ Number of headers          │
  │ headers[]         │ varies    │ Key-value header pairs     │
  └──────────────────────────────────────────────────────────┘

Record Batch (wraps multiple records):
  ┌──────────────────────────────────────────────────────────┐
  │ base_offset        │ int64    │ First offset in batch      │
  │ batch_length       │ int32    │ Total batch size           │
  │ partition_leader_  │ int32    │ Leader epoch for fencing   │
  │ epoch              │          │                            │
  │ magic              │ int8     │ Format version (2)         │
  │ crc                │ int32    │ CRC of remaining fields    │
  │ attributes         │ int16    │ Compression, timestamp type│
  │ last_offset_delta  │ int32    │ Offset delta of last record│
  │ first_timestamp    │ int64    │ Timestamp of first record  │
  │ max_timestamp      │ int64    │ Max timestamp in batch     │
  │ producer_id        │ int64    │ For idempotent producers   │
  │ producer_epoch     │ int16    │ Producer epoch             │
  │ base_sequence      │ int32    │ First sequence number      │
  │ records_count      │ int32    │ Number of records          │
  │ records[]          │ varies   │ The actual records         │
  └──────────────────────────────────────────────────────────┘
```

### Topic Metadata

```json
{
  "topic": "user-events",
  "partitions": [
    {
      "partition": 0,
      "leader": 1,
      "replicas": [1, 2, 3],
      "isr": [1, 2, 3],
      "leader_epoch": 5
    },
    {
      "partition": 1,
      "leader": 2,
      "replicas": [2, 3, 1],
      "isr": [2, 3, 1],
      "leader_epoch": 3
    },
    {
      "partition": 2,
      "leader": 3,
      "replicas": [3, 1, 2],
      "isr": [3, 1, 2],
      "leader_epoch": 7
    }
  ],
  "config": {
    "retention.ms": 604800000,
    "segment.bytes": 1073741824,
    "cleanup.policy": "delete",
    "min.insync.replicas": 2,
    "compression.type": "producer"
  }
}
```

### Consumer Group Offsets

```
Internal topic: __consumer_offsets

Key:   [group_id, topic, partition]
Value: [offset, leader_epoch, metadata, commit_timestamp]

Example entry:
  Key:   ["analytics-group", "user-events", 0]
  Value: {
    "offset": 15432,
    "leader_epoch": 5,
    "metadata": "",
    "commit_timestamp": 1700000500000
  }

Compacted topic:
  - Old entries for same key are garbage collected
  - Only latest offset per (group, topic, partition) is retained
  - 50 partitions by default (offsets.topic.num.partitions)
```

### Broker Metadata (KRaft)

```
KRaft metadata records (stored in __cluster_metadata topic):

  BrokerRegistration:
    { broker_id: 1, host: "broker1.example.com", port: 9092,
      rack: "us-east-1a", endpoints: [...], features: {...} }

  TopicRecord:
    { topic_name: "user-events", topic_id: "uuid-abc-123" }

  PartitionRecord:
    { topic_id: "uuid-abc-123", partition: 0,
      leader: 1, replicas: [1,2,3], isr: [1,2,3],
      leader_epoch: 5, partition_epoch: 8 }

  PartitionChangeRecord:
    { topic_id: "uuid-abc-123", partition: 0,
      isr: [1,3], leader: 1, leader_epoch: 6 }
```

---

## 6. Replication & Fault Tolerance

### Leader-Follower Replication Per Partition

```
Topic "orders", Partition 0, Replication Factor = 3

  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Broker 1 (LEADER)                                          │
  │  ┌──────────────────────────────────────────┐               │
  │  │ P0: [0][1][2][3][4][5][6][7][8][9]      │               │
  │  │                               ^          │               │
  │  │                          LEO = 10        │               │
  │  │                          HW  = 8         │               │
  │  └──────────────────────────────────────────┘               │
  │       │ replicate               │ replicate                 │
  │       v                         v                           │
  │  Broker 2 (FOLLOWER, ISR)  Broker 3 (FOLLOWER, ISR)       │
  │  ┌──────────────────────┐  ┌──────────────────────┐        │
  │  │ P0: [0][1]...[7][8] │  │ P0: [0][1]...[7]    │        │
  │  │              ^       │  │              ^       │        │
  │  │         LEO = 9     │  │         LEO = 8     │        │
  │  └──────────────────────┘  └──────────────────────┘        │
  │                                                              │
  │  LEO = Log End Offset (latest offset on this replica)       │
  │  HW  = High Watermark (min(LEO) across all ISR replicas)   │
  │                                                              │
  │  Consumers can only read up to HW (offset 8)               │
  │  This prevents reading uncommitted (unreplicated) data      │
  └──────────────────────────────────────────────────────────────┘
```

### In-Sync Replicas (ISR)

```
ISR = set of replicas that are "caught up" to the leader

A replica is in ISR if:
  1. It has fetched from leader within replica.lag.time.max.ms (default 30s)
  2. It is alive and connected to ZK/KRaft

ISR shrink scenario:
  Time 0: ISR = [1, 2, 3]    (all replicas caught up)
  Time 1: Broker 3 becomes slow (network issue)
  Time 2: Broker 3 lag exceeds replica.lag.time.max.ms
  Time 3: ISR = [1, 2]       (Broker 3 removed from ISR)
  Time 4: Broker 3 catches up
  Time 5: ISR = [1, 2, 3]    (Broker 3 re-added to ISR)

  min.insync.replicas = 2 (recommended for replication factor 3)
  - With acks=all, requires at least 2 replicas to acknowledge
  - If ISR drops below min.insync.replicas, producer gets
    NotEnoughReplicasException (prevents under-replicated writes)
```

### Leader Election Process

```
Scenario: Broker 1 (leader of P0) crashes

  Before crash:
    ISR(P0) = [Broker 1 (L), Broker 2, Broker 3]

  Step 1: Controller detects Broker 1 failure
    - ZK: Session timeout / ephemeral node disappears
    - KRaft: Heartbeat timeout

  Step 2: Controller selects new leader from ISR
    - Preference: First replica in ISR list
    - New leader: Broker 2

  Step 3: Controller updates metadata
    - ISR(P0) = [Broker 2 (L), Broker 3]
    - Leader epoch incremented: 5 -> 6

  Step 4: Controller notifies all brokers of new leader
    - Producers redirect writes to Broker 2
    - Consumers redirect fetches to Broker 2
    - Broker 3 starts fetching from Broker 2

  Step 5: Broker 1 comes back online
    - Truncates log to HW (removes any unreplicated messages)
    - Starts fetching from new leader (Broker 2)
    - Eventually re-joins ISR

  Election types:
    Clean election:  New leader chosen from ISR (no data loss)
    Unclean election: No ISR replicas available; choose any replica
                      (unclean.leader.election.enable=true)
                      RISK: DATA LOSS (the chosen replica may be behind)
```

### Handling Broker Failures

```
┌──────────────────┬────────────────────────────────────────────────┐
│ Failure Type     │ Recovery Action                                 │
├──────────────────┼────────────────────────────────────────────────┤
│ Single follower  │ Removed from ISR; rejoins when caught up.      │
│ crash            │ No impact on reads/writes.                     │
├──────────────────┼────────────────────────────────────────────────┤
│ Leader crash     │ New leader elected from ISR.                   │
│                  │ Brief unavailability during election (<1 sec). │
│                  │ No data loss if min.insync.replicas met.       │
├──────────────────┼────────────────────────────────────────────────┤
│ Multiple broker  │ If ISR has quorum, new leader elected.         │
│ crash            │ If ISR empty, partition unavailable             │
│                  │ (unless unclean election enabled).             │
├──────────────────┼────────────────────────────────────────────────┤
│ Disk failure     │ Broker marked as dead. All leader partitions   │
│                  │ re-elected. Data re-replicated to other brokers│
│                  │ once replacement broker joins.                 │
├──────────────────┼────────────────────────────────────────────────┤
│ Network partition│ Broker removed from ISR after lag timeout.     │
│                  │ Rejoin ISR when network heals and caught up.   │
└──────────────────┴────────────────────────────────────────────────┘
```

---

## 7. Delivery Semantics

### The Three Guarantees

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AT-MOST-ONCE                                │
│                                                                     │
│  Producer: acks=0, no retries                                      │
│  Consumer: commit offset BEFORE processing                          │
│                                                                     │
│  Flow:                                                              │
│    1. Consumer reads message at offset 5                            │
│    2. Consumer commits offset 6 (next to read)                     │
│    3. Consumer processes message                                    │
│    4. If crash at step 3: message lost (already committed past it) │
│                                                                     │
│  Guarantee: Message delivered 0 or 1 times                         │
│  Data loss: Possible                                                │
│  Duplicates: None                                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        AT-LEAST-ONCE                                │
│                                                                     │
│  Producer: acks=all, retries enabled                                │
│  Consumer: commit offset AFTER processing                           │
│                                                                     │
│  Flow:                                                              │
│    1. Consumer reads message at offset 5                            │
│    2. Consumer processes message                                    │
│    3. Consumer commits offset 6                                     │
│    4. If crash at step 3: message reprocessed (offset not committed)│
│                                                                     │
│  Guarantee: Message delivered 1 or more times                      │
│  Data loss: None                                                    │
│  Duplicates: Possible (consumer must be idempotent)                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         EXACTLY-ONCE                                │
│                                                                     │
│  Producer: Idempotent producer (enable.idempotence=true)           │
│  Consumer: Transactional consumer + atomic offset commit           │
│                                                                     │
│  Producer side (idempotent):                                       │
│    - Each producer gets a unique Producer ID (PID)                 │
│    - Each message gets a monotonic sequence number                 │
│    - Broker deduplicates by (PID, sequence) pair                  │
│    - Retries do NOT create duplicates                              │
│                                                                     │
│  Consumer side (transactional):                                    │
│    - Read message from input topic                                 │
│    - Process and produce to output topic                           │
│    - Commit input offset and output message atomically             │
│    - Uses two-phase commit protocol                                │
│                                                                     │
│  Guarantee: Message processed exactly once end-to-end              │
│  Data loss: None                                                    │
│  Duplicates: None                                                   │
│  Cost: ~20% throughput reduction                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Comparison Table

| Semantic      | Producer Config            | Consumer Config        | Data Loss | Duplicates | Throughput | Use Case           |
| ------------- | -------------------------- | ---------------------- | --------- | ---------- | ---------- | ------------------ |
| At-most-once  | acks=0, no retries         | Commit before process  | Yes       | No         | Highest    | Metrics, logs      |
| At-least-once | acks=all, retries=MAX      | Commit after process   | No        | Yes        | High       | Most applications  |
| Exactly-once  | Idempotent + transactional | Transactional consumer | No        | No         | Medium     | Financial, billing |

### Idempotent Producer Deep Dive

```
Without idempotent producer:
  Producer ──msg(seq=1)──> Broker (writes)
  Producer ◄──ack lost──── Broker
  Producer ──msg(seq=1)──> Broker (writes DUPLICATE!)

  Partition log: [msg1, msg1]  <-- DUPLICATE

With idempotent producer (enable.idempotence=true):
  Producer ──msg(PID=5, seq=1)──> Broker (writes, stores PID+seq)
  Producer ◄──ack lost───────── Broker
  Producer ──msg(PID=5, seq=1)──> Broker (detects duplicate, discards)

  Partition log: [msg1]  <-- NO DUPLICATE

  Broker maintains: { PID: 5, last_sequence: { partition_0: 1 } }
  If incoming seq <= stored seq for same PID: discard as duplicate
  If incoming seq > stored seq + 1: OutOfOrderSequenceException
```

### Exactly-Once Semantics (Transactional)

```
Transactional processing pattern (consume-transform-produce):

  Input Topic           Processing              Output Topic
  ┌───────────┐                                 ┌───────────┐
  │ msg A     │──read──>  transform(A) ──write──>│ result A  │
  │ msg B     │──read──>  transform(B) ──write──>│ result B  │
  └───────────┘                                 └───────────┘
                              │
                              └──commit offsets + output atomically──>
                                (all or nothing via 2PC)

  __consumer_offsets:  offset atomically updated
  __transaction_state: tracks ongoing transactions

Configuration:
  # Producer
  enable.idempotence=true
  transactional.id=my-transaction-id

  # Consumer
  isolation.level=read_committed
  # Only see messages from committed transactions
```

---

## 8. Performance Optimizations

### Why Kafka Is Fast

```
┌───────────────────────────────────────────────────────────────────┐
│                  Traditional Message Broker                       │
│                                                                   │
│  Write: Random I/O to B-tree index + data file                   │
│  Read:  Random I/O lookup in index, then read data               │
│  Result: ~100 MB/sec per disk (random I/O limited)               │
│                                                                   │
│  Disk seek time: ~10ms (HDD), ~0.1ms (SSD)                      │
│  Random IOPS: ~200 (HDD), ~100,000 (SSD)                        │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                       Kafka                                       │
│                                                                   │
│  Write: Sequential append to end of log file                     │
│  Read:  Sequential read from log file (often from page cache)    │
│  Result: ~600 MB/sec per disk (sequential I/O)                   │
│                                                                   │
│  Sequential disk throughput: ~600 MB/sec (HDD), ~3 GB/sec (SSD) │
│  6x faster than random I/O on HDD, ~30x on SSD                  │
└───────────────────────────────────────────────────────────────────┘
```

### Sequential I/O

```
Traditional approach (random writes):
  ┌────────────────────────────────────────────┐
  │ Disk                                       │
  │    ┌──┐   ┌──┐         ┌──┐               │
  │    │A │   │C │         │B │               │
  │    └──┘   └──┘         └──┘               │
  │  Seek ──> Write ──> Seek ──> Write ──>... │
  │  Disk head jumps around (slow)             │
  └────────────────────────────────────────────┘

Kafka approach (sequential append):
  ┌────────────────────────────────────────────┐
  │ Disk                                       │
  │  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┐            │
  │  │A │B │C │D │E │F │G │H │  │<-- append  │
  │  └──┴──┴──┴──┴──┴──┴──┴──┴──┘   here     │
  │  Always writing to the end (fast)          │
  │  No seeking, no fragmentation              │
  └────────────────────────────────────────────┘

  Key insight: Sequential disk I/O is faster than random memory access
  in many cases. This is why Kafka uses disk, not in-memory storage.
```

### Page Cache Utilization

```
Linux Page Cache:
  ┌─────────────────────────────────────────────────────────┐
  │                     RAM (128 GB)                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │              OS Page Cache (~100 GB)               │  │
  │  │                                                    │  │
  │  │  Recently written data   Recently read data        │  │
  │  │  (warm producer data)    (hot consumer data)       │  │
  │  │                                                    │  │
  │  │  When consumer reads data that was just produced:  │  │
  │  │  -> Served directly from page cache                │  │
  │  │  -> ZERO disk I/O for real-time consumers          │  │
  │  └───────────────────────────────────────────────────┘  │
  │  ┌─────────────────────┐                                │
  │  │  JVM Heap (~6 GB)   │ (Kafka process)                │
  │  └─────────────────────┘                                │
  │  ┌─────────────────────┐                                │
  │  │  OS + other (~22 GB)│                                │
  │  └─────────────────────┘                                │
  └─────────────────────────────────────────────────────────┘

  Kafka deliberately does NOT cache data in JVM heap:
    - Avoids GC pauses
    - Avoids double-buffering (JVM heap + OS cache)
    - OS page cache is managed by kernel (LRU, efficient)
    - Survives Kafka process restarts (cache is in OS, not process)
```

### Zero-Copy Transfer

```
Without zero-copy (traditional):
  ┌──────┐  DMA   ┌────────────┐  CPU   ┌────────────┐  CPU   ┌──────────┐  DMA   ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──copy──>│ User Buf   │──copy──>│Socket Buf│──copy──>│ NIC │
  └──────┘    1    └────────────┘    2    └────────────┘    3    └──────────┘    4    └─────┘
                    Context switch         Context switch
                    (kernel->user)         (user->kernel)

  4 data copies, 2 context switches

With zero-copy (Kafka uses sendfile()):
  ┌──────┐  DMA   ┌────────────┐  DMA   ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──copy──>│ NIC │
  └──────┘    1    └────────────┘    2    └─────┘

  2 data copies, 0 context switches to user space
  sendfile() tells the kernel to pipe data directly from file to socket

  With DMA scatter-gather (modern NICs):
  ┌──────┐  DMA   ┌────────────┐  DMA gather  ┌─────┐
  │ Disk │──copy──>│ Kernel Buf │──(no copy)───>│ NIC │
  └──────┘    1    └────────────┘               └─────┘

  Effectively 1 copy (DMA from disk to kernel buffer, NIC reads from there)
```

### Batching (Producer and Consumer)

```
Producer batching:
  Without batching:
    msg1 -> [network roundtrip] -> ack
    msg2 -> [network roundtrip] -> ack
    msg3 -> [network roundtrip] -> ack
    Total: 3 roundtrips, 3 syscalls, low throughput

  With batching (batch.size=64KB, linger.ms=5):
    msg1 ─┐
    msg2 ─┼─> [batch] -> [1 network roundtrip] -> ack
    msg3 ─┘
    Total: 1 roundtrip, 1 syscall, high throughput

Consumer batching:
  fetch.min.bytes=1048576     # Wait until 1 MB of data available
  fetch.max.wait.ms=500       # Or wait at most 500ms
  max.poll.records=500        # Return at most 500 records per poll

  Consumer polls once -> receives batch of messages -> processes batch
  Amortizes network overhead across many messages
```

### Performance Summary

```
┌──────────────────────┬──────────────────────────────────────────────┐
│ Optimization         │ Impact                                       │
├──────────────────────┼──────────────────────────────────────────────┤
│ Sequential I/O       │ 6x faster than random I/O (HDD)             │
│ Page cache           │ Near-zero latency for real-time consumers    │
│ Zero-copy            │ 65% CPU reduction, 3x throughput for reads   │
│ Batching             │ Amortizes network/syscall overhead           │
│ Compression          │ 50-70% reduction in network/disk I/O        │
│ Partition parallelism│ Linear scaling with partition count          │
│ Sparse indexing      │ O(log n) offset lookup without full index    │
│ Leader-only reads    │ Avoids consistency complexity                │
└──────────────────────┴──────────────────────────────────────────────┘

Typical benchmark numbers (per broker, single partition):
  Producer (acks=1, no compression):  ~800,000 msgs/sec, ~80 MB/sec
  Producer (acks=all, lz4):           ~400,000 msgs/sec, ~40 MB/sec
  Consumer (single partition):        ~900,000 msgs/sec, ~90 MB/sec

Cluster aggregate (25 brokers, 100 partitions):
  Producer: ~10,000,000 msgs/sec
  Consumer: ~20,000,000 msgs/sec (bounded by partition count)
```

---

## 9. Message Ordering

### Per-Partition Ordering Guarantee

```
Kafka guarantees: messages within a single partition are strictly ordered.

Producer sends: A, B, C, D, E (in order) to Partition 0

  Partition 0:
  ┌───┬───┬───┬───┬───┐
  │ A │ B │ C │ D │ E │
  └───┴───┴───┴───┴───┘
  offset: 0   1   2   3   4

  Consumer reads: A, B, C, D, E (guaranteed same order)

But across partitions, NO ordering guarantee:
  P0: [A, C, E]
  P1: [B, D, F]

  Consumer may read: B, A, C, D, E, F (interleaved, unordered globally)
```

### Key-Based Partitioning for Entity Ordering

```
Use case: All events for user-123 must be in order

  Producer uses key = "user-123":
    hash("user-123") % 3 = 1  -> always goes to Partition 1

  P0: [user-456 events]
  P1: [user-123 events]  <-- all user-123 events are ordered here
  P2: [user-789 events]

  As long as partition count does not change, same key -> same partition
  WARNING: Adding partitions changes hash mapping, breaking ordering!
```

### Global Ordering (Single Partition Trade-off)

```
If you need GLOBAL ordering across all messages:

  Option: Use a single partition
    Topic "transactions" (1 partition)
    ┌───┬───┬───┬───┬───┬───┬───┬───┐
    │ A │ B │ C │ D │ E │ F │ G │ H │
    └───┴───┴───┴───┴───┴───┴───┴───┘
    Globally ordered: A < B < C < D < E < F < G < H

  Trade-offs:
    + Perfect global ordering
    - Max 1 consumer (no parallelism within group)
    - Limited throughput (~10,000-50,000 msgs/sec)
    - Single point of failure (one partition leader)
    - Not horizontally scalable

  When acceptable:
    - Low-volume topics (config changes, admin events)
    - Strict ordering > throughput (financial ledger)
```

### Causal Ordering Patterns

```
Pattern 1: Causal ordering via partitioning
  Events: UserCreated -> OrderPlaced -> OrderShipped
  Key: user_id (all events for same user go to same partition)
  Result: Per-user causal ordering guaranteed

Pattern 2: Causal ordering across entities
  Problem: Order depends on both user and product
  Solution: Use sequence numbers or vector clocks in message headers

  Message: {
    key: "order-456",
    value: { ... },
    headers: {
      "causal-deps": "user-123:5,product-789:3"
    }
  }

  Consumer: Buffer messages until all causal dependencies are met
  Complexity: Significant application-level logic required

Pattern 3: Single-writer pattern
  One producer per partition -> natural causal ordering
  Example: Each microservice instance owns specific partitions
  Avoids out-of-order issues from concurrent producers

Ordering + Retries:
  max.in.flight.requests.per.connection=1  (safest, slow)
  OR
  enable.idempotence=true + max.in.flight.requests.per.connection=5
  (idempotent producer reorders correctly even with in-flight requests)
```

---

## 10. Scaling

### Adding Partitions

```
Current: Topic "events" with 6 partitions

  kafka-topics.sh --alter --topic events --partitions 12

  Before:                          After:
  P0 [###########]               P0  [###########]  (existing data)
  P1 [###########]               P1  [###########]  (existing data)
  P2 [###########]               P2  [###########]  (existing data)
  P3 [###########]               P3  [###########]  (existing data)
  P4 [###########]               P4  [###########]  (existing data)
  P5 [###########]               P5  [###########]  (existing data)
                                  P6  []             (empty, new)
                                  P7  []             (empty, new)
                                  P8  []             (empty, new)
                                  P9  []             (empty, new)
                                  P10 []             (empty, new)
                                  P11 []             (empty, new)

  Implications:
    + Higher parallelism (more consumers can participate)
    + Higher throughput capacity
    - Key-based routing BROKEN: hash(key) % 12 != hash(key) % 6
    - Existing data stays in old partitions (not rebalanced)
    - Cannot decrease partition count (irreversible operation)
    - Triggers consumer group rebalance

  Recommendation: Over-provision partitions initially
    Start with more partitions than currently needed
    Typical: 3x expected peak consumer count
```

### Adding Brokers and Partition Reassignment

```
Current: 3 brokers, 12 partitions

  Broker 1: P0, P3, P6, P9    (4 partitions, leader)
  Broker 2: P1, P4, P7, P10   (4 partitions, leader)
  Broker 3: P2, P5, P8, P11   (4 partitions, leader)

Add Broker 4:
  Broker 4: (empty - receives NO partitions automatically!)

  Must manually reassign partitions:
  kafka-reassign-partitions.sh --reassignment-json-file plan.json --execute

  plan.json:
  {
    "partitions": [
      {"topic": "events", "partition": 9,  "replicas": [4, 1, 2]},
      {"topic": "events", "partition": 10, "replicas": [4, 2, 3]},
      {"topic": "events", "partition": 11, "replicas": [4, 3, 1]}
    ]
  }

  After reassignment:
  Broker 1: P0, P3, P6         (3 partitions)
  Broker 2: P1, P4, P7         (3 partitions)
  Broker 3: P2, P5, P8         (3 partitions)
  Broker 4: P9, P10, P11       (3 partitions) <-- balanced

  Data migration happens in background (throttled to avoid impacting traffic)
  kafka-reassign-partitions.sh --throttle 50000000  # 50 MB/sec limit
```

### Consumer Scaling

```
Scaling consumers within a consumer group:

  Partition count = maximum useful consumers

  Topic with 6 partitions:
  ┌────────────────────────────────────────────────────────────┐
  │ Consumers │ Assignment                │ Throughput          │
  ├───────────┼───────────────────────────┼─────────────────────┤
  │ 1         │ C1: P0,P1,P2,P3,P4,P5    │ 1x (bottleneck)    │
  │ 2         │ C1: P0,P1,P2 / C2: P3,P4,P5 │ ~2x             │
  │ 3         │ C1: P0,P1 / C2: P2,P3 / C3: P4,P5 │ ~3x      │
  │ 6         │ C1:P0/C2:P1/C3:P2/C4:P3/C5:P4/C6:P5│ 6x (max)│
  │ 7         │ Same as 6, C7 is idle     │ 6x (wasted C7)    │
  │ 12        │ Same as 6, 6 idle         │ 6x (wasted 6)     │
  └────────────────────────────────────────────────────────────┘

  To scale beyond partition count:
    Option A: Increase partitions (changes key routing)
    Option B: Internal parallelism (thread pool per consumer)
    Option C: Additional consumer groups (for different processing)

  Consumer lag monitoring:
    kafka-consumer-groups.sh --describe --group my-group

    GROUP      TOPIC      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
    my-group   events     0          15432           15500           68
    my-group   events     1          22100           22100           0
    my-group   events     2          18700           19200           500
```

### Multi-Cluster Replication (MirrorMaker)

```
Cross-datacenter replication:

  DC-East (Primary)                    DC-West (Replica)
  ┌──────────────────────┐            ┌──────────────────────┐
  │  Kafka Cluster A     │            │  Kafka Cluster B     │
  │                      │            │                      │
  │  Topic: orders       │ ──MM2──>  │  Topic: orders       │
  │  Topic: payments     │ ──MM2──>  │  Topic: payments     │
  │  Topic: user-events  │ ──MM2──>  │  Topic: user-events  │
  │                      │            │                      │
  └──────────────────────┘            └──────────────────────┘
         │                                     │
    MirrorMaker 2 (MM2)                   Consumers read
    - Replicates topics                   from local cluster
    - Preserves offsets                   (low latency)
    - Handles schema

  Replication patterns:
    Active-Passive:  One primary, one DR (disaster recovery)
    Active-Active:   Both clusters accept writes (complex conflict resolution)
    Hub-and-Spoke:   Central cluster aggregates from regional clusters
    Fan-out:         Central cluster replicates to regional clusters

  MirrorMaker 2 features:
    - Built on Kafka Connect (distributed, scalable)
    - Automatic topic discovery and creation
    - Offset translation (maps source offsets to destination offsets)
    - Heartbeats and checkpoints for monitoring
    - Configurable replication policies
```

---

## 11. Deployment Architecture

### Production Cluster Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Production Kafka Cluster                           │
│                                                                             │
│  ┌──── Availability Zone 1 ──────┐  ┌──── Availability Zone 2 ──────┐     │
│  │                                │  │                                │     │
│  │  ┌────────────┐ ┌────────────┐│  │  ┌────────────┐ ┌────────────┐│     │
│  │  │  Broker 1  │ │  Broker 2  ││  │  │  Broker 3  │ │  Broker 4  ││     │
│  │  │  32 cores  │ │  32 cores  ││  │  │  32 cores  │ │  32 cores  ││     │
│  │  │  128GB RAM │ │  128GB RAM ││  │  │  128GB RAM │ │  128GB RAM ││     │
│  │  │  12x 2TB   │ │  12x 2TB   ││  │  │  12x 2TB   │ │  12x 2TB   ││     │
│  │  │  SSD JBOD  │ │  SSD JBOD  ││  │  │  SSD JBOD  │ │  SSD JBOD  ││     │
│  │  │  10Gbps NIC│ │  10Gbps NIC││  │  │  10Gbps NIC│ │  10Gbps NIC││     │
│  │  └────────────┘ └────────────┘│  │  └────────────┘ └────────────┘│     │
│  │                                │  │                                │     │
│  │  ┌────────────┐               │  │  ┌────────────┐               │     │
│  │  │ KRaft      │               │  │  │ KRaft      │               │     │
│  │  │ Controller │               │  │  │ Controller │               │     │
│  │  │ (voter)    │               │  │  │ (voter)    │               │     │
│  │  └────────────┘               │  │  └────────────┘               │     │
│  └────────────────────────────────┘  └────────────────────────────────┘     │
│                                                                             │
│  ┌──── Availability Zone 3 ──────┐                                         │
│  │                                │  ┌──────────────────────────────────┐   │
│  │  ┌────────────┐ ┌────────────┐│  │     Monitoring & Management     │   │
│  │  │  Broker 5  │ │  Broker 6  ││  │                                  │   │
│  │  │  32 cores  │ │  32 cores  ││  │  ┌─────────┐  ┌──────────────┐ │   │
│  │  │  128GB RAM │ │  128GB RAM ││  │  │Prometheus│  │ Grafana      │ │   │
│  │  │  12x 2TB   │ │  12x 2TB   ││  │  │ + JMX   │  │ Dashboards   │ │   │
│  │  │  SSD JBOD  │ │  SSD JBOD  ││  │  │Exporter  │  │              │ │   │
│  │  │  10Gbps NIC│ │  10Gbps NIC││  │  └─────────┘  └──────────────┘ │   │
│  │  └────────────┘ └────────────┘│  │                                  │   │
│  │                                │  │  ┌─────────┐  ┌──────────────┐ │   │
│  │  ┌────────────┐               │  │  │ Cruise  │  │ Schema       │ │   │
│  │  │ KRaft      │               │  │  │ Control │  │ Registry     │ │   │
│  │  │ Controller │               │  │  │ (auto-  │  │ (Avro/Proto) │ │   │
│  │  │ (voter)    │               │  │  │ balance)│  │              │ │   │
│  │  └────────────┘               │  │  └─────────┘  └──────────────┘ │   │
│  └────────────────────────────────┘  └──────────────────────────────────┘   │
│                                                                             │
│  Replication factor: 3 (one replica per AZ)                                │
│  min.insync.replicas: 2                                                    │
│  KRaft: 3 controllers (one per AZ, quorum-based leader election)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Datacenter Setup

```
                    ┌────────────────────────────────────┐
                    │          Global DNS / LB            │
                    │   (route producers to nearest DC)   │
                    └───────────┬────────────┬───────────┘
                                │            │
              ┌─────────────────┘            └──────────────────┐
              │                                                  │
  ┌───────────┴──────────────┐            ┌──────────────────────┴──┐
  │    DC-East (Primary)      │            │    DC-West (Active DR)   │
  │                           │            │                          │
  │  Kafka Cluster            │            │  Kafka Cluster           │
  │  6 Brokers, 3 AZs        │  ◄──MM2──► │  6 Brokers, 3 AZs       │
  │                           │            │                          │
  │  Topics:                  │            │  Topics (replicated):    │
  │  - orders                 │            │  - dc-east.orders        │
  │  - payments               │            │  - dc-east.payments      │
  │  - user-events            │            │  - dc-west.orders        │
  │                           │            │  - dc-west.payments      │
  │  Schema Registry          │            │  Schema Registry         │
  │  (primary)                │            │  (follower)              │
  └───────────────────────────┘            └──────────────────────────┘

  Active-Active considerations:
    1. Topic naming: prefix with datacenter name to avoid conflicts
    2. Conflict resolution: last-writer-wins or application-level merge
    3. Offset translation: MM2 maintains offset mapping between clusters
    4. Consumer failover: Consumer reads from local cluster, fails over to remote

  Latency budget:
    Intra-DC:     < 1ms  (same AZ), < 2ms  (cross AZ)
    Cross-DC:     ~30ms  (same region), ~100ms (cross region)
    Replication:  Asynchronous (eventual consistency between DCs)

  RPO/RTO targets:
    Active-Passive: RPO = replication lag (~seconds), RTO = ~minutes
    Active-Active:  RPO = 0 (each DC has own data), RTO = ~seconds
```

### Hardware Recommendations

```
┌────────────────┬─────────────────────────────────────────────────────┐
│ Component      │ Recommendation                                      │
├────────────────┼─────────────────────────────────────────────────────┤
│ CPU            │ 16-32 cores (Kafka is I/O bound, not CPU bound)    │
│ Memory         │ 128 GB (mostly for OS page cache, JVM heap ~6 GB) │
│ Disk           │ 12x 2TB SSD in JBOD (no RAID, Kafka handles       │
│                │ redundancy via replication)                         │
│ Network        │ 10 Gbps NIC minimum (25 Gbps for high throughput)  │
│ OS             │ Linux (ext4 or XFS filesystem)                     │
│ JVM            │ Java 17+, G1GC, 6 GB heap                          │
└────────────────┴─────────────────────────────────────────────────────┘

JVM settings:
  -Xmx6g -Xms6g
  -XX:+UseG1GC
  -XX:MaxGCPauseMillis=20
  -XX:InitiatingHeapOccupancyPercent=35

OS tuning:
  vm.swappiness=1                         # Minimize swapping
  vm.dirty_background_ratio=5             # Start flushing at 5% dirty
  vm.dirty_ratio=60                       # Block at 60% dirty
  net.core.wmem_max=2097152               # Socket send buffer
  net.core.rmem_max=2097152               # Socket receive buffer
  fs.file-max=1000000                     # Max open files
  net.ipv4.tcp_max_syn_backlog=4096       # TCP backlog
```

### Key Broker Configurations for Production

```properties
# Broker identity
broker.id=1
listeners=PLAINTEXT://broker1:9092,SSL://broker1:9093
advertised.listeners=PLAINTEXT://broker1.example.com:9092

# Log storage
log.dirs=/data/kafka-logs-1,/data/kafka-logs-2,/data/kafka-logs-3
log.retention.hours=168
log.retention.bytes=-1
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000

# Replication
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
replica.lag.time.max.ms=30000

# Performance
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# Topic defaults
num.partitions=12
auto.create.topics.enable=false
delete.topic.enable=true

# ZK/KRaft
# For KRaft mode:
process.roles=broker
controller.quorum.voters=100@controller1:9093,101@controller2:9093,102@controller3:9093
```

---

## 12. Common Interview Follow-ups

### How to Handle Poison Pills (Bad Messages)?

```
A "poison pill" is a malformed message that causes consumer to crash repeatedly.

Detection:
  - Consumer crashes, restarts, reads same message, crashes again (infinite loop)
  - Offset never advances past the bad message

Solutions:

  1. Try-Catch with Skip:
     while (true) {
       records = consumer.poll(100);
       for (record : records) {
         try {
           process(record);
         } catch (Exception e) {
           log.error("Bad message at offset {}: {}", record.offset(), e);
           // Skip the message, continue processing
         }
       }
       consumer.commitSync();
     }

  2. Retry with Dead Letter Queue (DLQ):
     for (record : records) {
       int retries = 0;
       while (retries < MAX_RETRIES) {
         try {
           process(record);
           break;
         } catch (RetryableException e) {
           retries++;
           backoff(retries);
         } catch (NonRetryableException e) {
           producer.send("dead-letter-topic", record);  // Send to DLQ
           break;
         }
       }
       if (retries >= MAX_RETRIES) {
         producer.send("dead-letter-topic", record);    // Exhausted retries
       }
     }

  3. Circuit Breaker Pattern:
     - Track error rate per partition
     - If error rate exceeds threshold, pause partition consumption
     - Alert operations team for manual investigation
```

### How to Implement Dead Letter Queue?

```
Dead Letter Queue (DLQ) pattern:

  Main Topic ──> Consumer ──> Process
                    │                │
                    │ (on failure)   │ (on success)
                    v                v
              DLQ Topic          Output Topic

Implementation:
  ┌─────────────────────────────────────────────────────────────┐
  │  DLQ Topic: "orders.dead-letter"                            │
  │                                                             │
  │  Message in DLQ includes:                                   │
  │  {                                                          │
  │    "original_topic": "orders",                              │
  │    "original_partition": 3,                                 │
  │    "original_offset": 45231,                                │
  │    "original_key": "order-789",                             │
  │    "original_value": { ... },                               │
  │    "error_message": "Invalid payment method",               │
  │    "error_class": "ValidationException",                    │
  │    "retry_count": 3,                                        │
  │    "failed_at": "2024-01-15T10:30:00Z",                    │
  │    "consumer_group": "order-processor",                     │
  │    "consumer_id": "consumer-2"                              │
  │  }                                                          │
  │                                                             │
  │  DLQ monitoring:                                            │
  │    - Alert on DLQ message count > threshold                 │
  │    - Dashboard showing DLQ depth over time                  │
  │    - Automatic retry after fixed delay (optional)           │
  │                                                             │
  │  DLQ processing options:                                    │
  │    A. Manual review and replay                              │
  │    B. Automated retry with exponential backoff              │
  │    C. Route to human workflow for resolution                │
  └─────────────────────────────────────────────────────────────┘

Multi-level DLQ:
  Main Topic -> Retry Topic 1 (1 min delay)
                    -> Retry Topic 2 (10 min delay)
                         -> Retry Topic 3 (1 hour delay)
                              -> Final DLQ (manual intervention)
```

### How to Handle Message Schema Evolution?

```
Problem: Producer updates message format; consumer breaks.

Solution: Schema Registry + compatibility rules

  ┌──────────┐     ┌─────────────────┐     ┌──────────┐
  │ Producer │────>│ Schema Registry │<────│ Consumer │
  │          │     │                 │     │          │
  │ Register │     │ - Store schemas │     │ Fetch    │
  │ schema   │     │ - Check compat. │     │ schema   │
  │ on write │     │ - Version mgmt  │     │ on read  │
  └──────────┘     └─────────────────┘     └──────────┘

Compatibility modes:
  ┌──────────────────┬────────────────────────────────────────────────┐
  │ Mode             │ Allowed Changes                                │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ BACKWARD         │ New schema can read old data                  │
  │                  │ (delete fields, add optional fields)          │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ FORWARD          │ Old schema can read new data                  │
  │                  │ (add fields, delete optional fields)          │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ FULL             │ Both backward and forward compatible          │
  │                  │ (add/delete optional fields only)             │
  ├──────────────────┼────────────────────────────────────────────────┤
  │ NONE             │ No compatibility checks (dangerous)           │
  └──────────────────┴────────────────────────────────────────────────┘

Schema evolution example (Avro):
  Version 1:
    { "name": "User", "fields": [
      {"name": "id", "type": "string"},
      {"name": "email", "type": "string"}
    ]}

  Version 2 (BACKWARD compatible - added optional field):
    { "name": "User", "fields": [
      {"name": "id", "type": "string"},
      {"name": "email", "type": "string"},
      {"name": "phone", "type": ["null", "string"], "default": null}
    ]}

  New consumer (v2 schema) reads old data (v1): phone = null (default)
  Old consumer (v1 schema) reads new data (v2): phone field ignored

Serialization format comparison:
  ┌────────────┬────────────┬──────────────┬────────────────┐
  │ Format     │ Schema Reg │ Size         │ Speed          │
  ├────────────┼────────────┼──────────────┼────────────────┤
  │ JSON       │ Optional   │ Large        │ Slow           │
  │ Avro       │ Required   │ Compact      │ Fast           │
  │ Protobuf   │ Optional   │ Compact      │ Very Fast      │
  │ Thrift     │ Optional   │ Compact      │ Fast           │
  └────────────┴────────────┴──────────────┴────────────────┘
```

### How to Implement Priority Queues?

```
Kafka does NOT natively support message priorities.

Workaround patterns:

  Pattern 1: Separate topics per priority level
    ┌─────────────────────┐
    │ orders.high         │──> Consumer (high priority, polled first)
    │ orders.medium       │──> Consumer (medium, polled when high empty)
    │ orders.low          │──> Consumer (low, polled when others empty)
    └─────────────────────┘

    Consumer logic:
      while (true) {
        records = highPriorityConsumer.poll(0);  // non-blocking
        if (records.isEmpty()) {
          records = mediumPriorityConsumer.poll(0);
        }
        if (records.isEmpty()) {
          records = lowPriorityConsumer.poll(100);  // blocking wait
        }
        process(records);
      }

  Pattern 2: Priority header + consumer-side sorting
    Producer sets header: priority = HIGH | MEDIUM | LOW
    Consumer reads batch, sorts by priority, processes high first
    Risk: batch boundaries may split priority groups

  Pattern 3: Use RabbitMQ for priority use case
    If priority is a hard requirement, consider a traditional MQ
    that natively supports priority queues (RabbitMQ supports 0-255)

  Recommendation: Pattern 1 is most common in practice
    Simple, predictable, no complex consumer logic
    Trade-off: More topics to manage
```

### How to Ensure Exactly-Once Processing?

```
End-to-end exactly-once requires BOTH producer and consumer cooperation:

  Producer side:
    enable.idempotence=true          # Dedup retries on broker
    transactional.id=my-txn-id       # For multi-partition atomicity

  Consumer side (option A - transactional):
    isolation.level=read_committed
    # Consume -> Process -> Produce to output + commit offset atomically

  Consumer side (option B - idempotent consumer):
    # Store processed message ID in external store (DB, Redis)
    # On reprocessing, check if already processed -> skip

    process(record):
      messageId = record.headers().get("message-id")
      if (deduplicationStore.exists(messageId)):
        return  // Already processed, skip
      result = transform(record)
      atomically:
        outputStore.save(result)
        deduplicationStore.add(messageId)
        consumer.commitSync()

  Consumer side (option C - idempotent operations):
    # Design operations to be naturally idempotent
    # e.g., "set balance to $100" instead of "add $10 to balance"
    # Reprocessing same message has no additional effect

  Exactly-once overhead:
    - ~20% throughput reduction (producer side, due to sequence tracking)
    - Additional storage for transaction coordinator state
    - Increased latency for transactional commits (~50ms)
    - More complex failure handling and recovery
```

### Kafka vs RabbitMQ vs SQS Comparison

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Feature          │ Kafka            │ RabbitMQ         │ Amazon SQS       │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Model            │ Distributed log  │ Message broker   │ Managed queue    │
│ Protocol         │ Custom binary    │ AMQP 0.9.1       │ HTTP REST API    │
│ Message lifecycle│ Retained (log)   │ Deleted on ack   │ Deleted on ack   │
│ Replay           │ Yes (by offset)  │ No               │ No               │
│ Ordering         │ Per-partition    │ Per-queue         │ FIFO queues only │
│ Throughput       │ Millions/sec     │ ~50K/sec         │ ~3K/sec (FIFO)   │
│                  │                  │                  │ ~unlimited (std)  │
│ Latency          │ ~5ms p99         │ ~1ms p99         │ ~10-50ms         │
│ Delivery         │ At-least-once    │ At-least-once    │ At-least-once    │
│                  │ Exactly-once     │ (w/ confirms)    │ (FIFO: exactly-  │
│                  │ (w/ transactions)│                  │  once)           │
│ Routing          │ Topic+partition  │ Exchange+binding │ Queue name       │
│                  │                  │ (flexible)       │                  │
│ Consumer groups  │ Built-in         │ Competing        │ N/A (inherent)   │
│                  │                  │ consumers        │                  │
│ Priority queue   │ No (workaround)  │ Yes (0-255)      │ No               │
│ Dead letter      │ Manual           │ Built-in         │ Built-in         │
│ Message TTL      │ Topic-level      │ Per-message      │ Queue-level      │
│ Clustering       │ Built-in         │ Mirrored queues  │ Managed (AWS)    │
│ Ops complexity   │ High             │ Medium           │ None (managed)   │
│ Cost model       │ Self-hosted /    │ Self-hosted /    │ Pay-per-request  │
│                  │ Confluent Cloud  │ CloudAMQP       │                  │
│ Best for         │ Event streaming, │ Task queues,     │ Simple queuing,  │
│                  │ data pipelines,  │ RPC, routing,    │ serverless,      │
│                  │ stream processing│ low latency      │ AWS integration  │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Choose when...   │ High throughput, │ Complex routing, │ Managed service, │
│                  │ replay needed,   │ priorities,      │ low ops burden,  │
│                  │ event sourcing,  │ flexible ack,    │ AWS ecosystem,   │
│                  │ stream processing│ request-reply    │ moderate scale   │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### Additional Interview Questions and Brief Answers

```
Q: How does Kafka handle backpressure?
A: Consumer-controlled pull model. Consumers poll at their own rate.
   If consumer is slow, lag increases but producer is not blocked.
   Use consumer.pause()/resume() for fine-grained flow control.
   Monitor consumer lag and alert when it exceeds thresholds.

Q: How does log compaction work?
A: cleanup.policy=compact keeps only the latest value per key.
   Background thread removes older records with same key.
   Used for changelogs, KTable materialization, config topics.
   Tombstone (null value) marks key for deletion after delete.retention.ms.

Q: What happens when a consumer group has more consumers than partitions?
A: Extra consumers sit idle. Max parallelism = partition count.
   Those idle consumers serve as hot standbys for failover.
   On rebalance (if active consumer dies), idle consumer takes over.

Q: How do you monitor Kafka in production?
A: Key metrics via JMX + Prometheus:
   - Under-replicated partitions (> 0 is a problem)
   - Consumer lag per group (should be near zero or decreasing)
   - Request latency (produce/fetch p99)
   - Active controller count (must be exactly 1)
   - ISR shrink/expand rate
   - Log flush latency
   - Network handler idle ratio

Q: How do you handle Kafka upgrades with zero downtime?
A: Rolling restart strategy:
   1. Upgrade one broker at a time
   2. Set inter.broker.protocol.version to old version
   3. After all brokers upgraded, bump protocol version
   4. Rolling restart again to activate new protocol
   5. Repeat for log.message.format.version if needed

Q: How does Kafka Streams differ from consumer API?
A: Kafka Streams is a client library for stream processing:
   - Stateful operations (aggregations, joins, windowing)
   - Built-in state stores (RocksDB backed)
   - Exactly-once processing semantics
   - No separate cluster needed (runs in your application)
   - Alternative to Flink/Spark Streaming for Kafka-centric workloads
```

---

## Summary: Interview Checklist

```
When designing a distributed message queue in an interview:

[ ] Clarify requirements (throughput, latency, ordering, durability)
[ ] Back-of-envelope calculations (storage, bandwidth, broker count)
[ ] Choose between traditional MQ vs event streaming
[ ] Design topic/partition scheme (key-based routing)
[ ] Explain replication model (leader-follower, ISR, acks)
[ ] Discuss delivery semantics (at-least-once vs exactly-once)
[ ] Explain storage model (append-only log, segments, indexes)
[ ] Discuss performance optimizations (zero-copy, batching, page cache)
[ ] Address ordering guarantees and trade-offs
[ ] Describe consumer group mechanics and rebalancing
[ ] Plan for scaling (partitions, brokers, multi-DC)
[ ] Discuss operational concerns (monitoring, upgrades, schema evolution)
[ ] Address failure scenarios (broker crash, network partition, poison pills)
```
