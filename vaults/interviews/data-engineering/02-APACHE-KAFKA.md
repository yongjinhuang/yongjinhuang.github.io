# Apache Kafka

Apache Kafka is a distributed event streaming platform designed for high-throughput, fault-tolerant, and real-time data processing. Originally developed at LinkedIn and later open-sourced through the Apache Software Foundation, Kafka serves as the backbone for event-driven architectures, real-time analytics, data integration, and stream processing. This guide covers Kafka's architecture, core APIs, operational concerns, and performance tuning from a data engineering interview perspective.

---

## Table of Contents

1. [What Is Apache Kafka?](#1-what-is-apache-kafka)
2. [Core Architecture](#2-core-architecture)
3. [Topics, Partitions, and Replicas](#3-topics-partitions-and-replicas)
4. [Producers](#4-producers)
5. [Consumers and Consumer Groups](#5-consumers-and-consumer-groups)
6. [Kafka Streams](#6-kafka-streams)
7. [Kafka Connect](#7-kafka-connect)
8. [Schema Registry](#8-schema-registry)
9. [Exactly-Once Semantics](#9-exactly-once-semantics)
10. [Performance Tuning](#10-performance-tuning)
11. [Operational Concerns](#11-operational-concerns)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. What Is Apache Kafka?

Kafka is a distributed commit log that provides:

- **Publish/Subscribe messaging**: Producers publish messages, consumers subscribe to topics
- **Durable storage**: Messages are persisted to disk with configurable retention
- **Stream processing**: Built-in stream processing via Kafka Streams
- **Scalability**: Horizontal scaling through partitioning
- **Fault tolerance**: Replication across brokers

### Key Use Cases

| Use Case | Example |
|----------|---------|
| Messaging | Replacing RabbitMQ, ActiveMQ |
| Activity tracking | Clickstream, user events |
| Log aggregation | Centralized log collection |
| Stream processing | Real-time analytics, fraud detection |
| Event sourcing | Building event-driven microservices |
| CDC (Change Data Capture) | Database change streaming via Debezium |
| Commit log | Distributed system coordination |

---

## 2. Core Architecture

### Cluster Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      KAFKA CLUSTER                          │
│                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │
│  │ Broker 0│   │ Broker 1│   │ Broker 2│   │ Broker 3│   │
│  │         │   │         │   │         │   │         │   │
│  │ Topic-A │   │ Topic-A │   │ Topic-A │   │ Topic-B │   │
│  │ Part-0  │   │ Part-1  │   │ Part-2  │   │ Part-0  │   │
│  │ (Leader)│   │ (Leader)│   │ (Leader)│   │ (Leader)│   │
│  │         │   │         │   │         │   │         │   │
│  │ Topic-A │   │ Topic-B │   │ Topic-B │   │ Topic-A │   │
│  │ Part-1  │   │ Part-0  │   │ Part-0  │   │ Part-0  │   │
│  │(Replica)│   │(Replica)│   │(Replica)│   │(Replica)│   │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          ZooKeeper / KRaft Controller               │   │
│  │  - Broker metadata     - Leader election            │   │
│  │  - Topic config        - Cluster membership         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ▲                                    │
         │                                    ▼
   ┌──────────┐                        ┌──────────┐
   │ Producers│                        │ Consumers│
   └──────────┘                        └──────────┘
```

### ZooKeeper vs KRaft

| Feature | ZooKeeper Mode | KRaft Mode (KIP-500) |
|---------|---------------|---------------------|
| Metadata store | External ZK ensemble | Internal Raft consensus |
| Dependency | Requires ZK cluster | Self-contained |
| Scalability | ZK can be bottleneck | Better scaling |
| Operations | Two systems to manage | Single system |
| Status | Deprecated (Kafka 3.5+) | Production-ready (Kafka 3.3+) |
| Migration | Legacy clusters | New default |

### Broker Responsibilities

- Store log segments for assigned partitions
- Serve produce and fetch requests
- Replicate data to follower replicas
- Handle leader election (via controller)
- Manage consumer group coordination (group coordinator)

---

## 3. Topics, Partitions, and Replicas

### Topics and Partitions

```
Topic: "orders" (3 partitions, replication factor 2)

Partition 0:  [msg0] [msg3] [msg6] [msg9]  ...  ──> Offset increases
Partition 1:  [msg1] [msg4] [msg7] [msg10] ...
Partition 2:  [msg2] [msg5] [msg8] [msg11] ...

Each partition is an ordered, immutable sequence of records.
Records within a partition have a sequential offset.
```

### Partition Distribution and Replication

```
Partition 0:
  Broker 0: Leader    ◄── Produces/Consumes go here
  Broker 1: Follower  ◄── Replicates from leader (ISR member)

Partition 1:
  Broker 1: Leader
  Broker 2: Follower

Partition 2:
  Broker 2: Leader
  Broker 0: Follower
```

### In-Sync Replicas (ISR)

The ISR is the set of replicas that are fully caught up with the leader.

```
Leader Partition 0 (Broker 0):
  High Watermark (HW) = 100   ◄── Consumers can read up to here
  Log End Offset (LEO) = 105   ◄── Latest message written

Follower (Broker 1):
  LEO = 103                    ◄── Slightly behind, but within replica.lag.time.max.ms
  Status: IN-SYNC (ISR)

Follower (Broker 2):
  LEO = 80                     ◄── Too far behind
  Status: OUT OF SYNC (not in ISR)
```

**Key configs:**
- `replica.lag.time.max.ms`: Max time a follower can lag before being removed from ISR (default: 30000)
- `min.insync.replicas`: Minimum ISR size for a write to succeed when acks=all (e.g., 2)
- `unclean.leader.election.enable`: Allow out-of-sync replica to become leader (data loss risk)

### Choosing Partition Count

| Factor | Guidance |
|--------|----------|
| Throughput | More partitions = more parallelism |
| Consumer parallelism | Partitions >= number of consumers in a group |
| Ordering | Messages with same key go to same partition |
| Overhead | Each partition has memory and file handle cost |
| Rebalancing | More partitions = slower rebalancing |
| Rule of thumb | Start with 6-12, scale based on throughput |

---

## 4. Producers

### Producer Architecture

```
┌─────────────────────────────────────────────────────┐
│                    PRODUCER                          │
│                                                      │
│  Application ──> Serializer ──> Partitioner ──>     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           Record Accumulator                  │   │
│  │                                               │   │
│  │  Batch for Partition 0: [msg1, msg4, msg7]   │   │
│  │  Batch for Partition 1: [msg2, msg5]         │   │
│  │  Batch for Partition 2: [msg3, msg6, msg8]   │   │
│  └──────────────────────────────────────────────┘   │
│                      │                               │
│                      ▼                               │
│             Sender Thread                            │
│             (background)                             │
│                      │                               │
│                      ▼                               │
│         Network Client (per broker)                  │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
              Kafka Brokers
```

### Producer Acknowledgments (acks)

| Setting | Behavior | Durability | Latency | Throughput |
|---------|----------|------------|---------|------------|
| `acks=0` | Fire and forget | Lowest (may lose) | Lowest | Highest |
| `acks=1` | Leader acknowledges | Medium | Medium | High |
| `acks=all` | All ISR acknowledge | Highest | Highest | Lower |

### Idempotent Producer

Prevents duplicate messages caused by producer retries.

```
Without idempotency:
  Producer ──send──> Broker (writes msg)
  Producer ◄──ack lost──
  Producer ──retry──> Broker (writes DUPLICATE msg)

With idempotency (enable.idempotence=true):
  Producer ──send(PID=1, seq=0)──> Broker (writes msg)
  Producer ◄──ack lost──
  Producer ──retry(PID=1, seq=0)──> Broker (detects duplicate, skips)
```

**Key config:**
```properties
enable.idempotence=true          # Enables idempotent producer
max.in.flight.requests.per.connection=5  # Max 5 with idempotency
acks=all                         # Required for idempotency
retries=2147483647               # Max retries (default with idempotency)
```

### Partitioning Strategies

```java
// Default: Key-based hashing (murmur2)
producer.send(new ProducerRecord<>("orders", orderId, orderJson));
// orderId determines partition: hash(orderId) % numPartitions

// Round-robin (null key)
producer.send(new ProducerRecord<>("logs", null, logMessage));

// Sticky partitioning (Kafka 2.4+, default for null keys)
// Batches messages to same partition until batch is full

// Custom partitioner
public class GeoPartitioner implements Partitioner {
    public int partition(String topic, Object key, byte[] keyBytes,
                        Object value, byte[] valueBytes, Cluster cluster) {
        String region = extractRegion(key);
        return regionToPartition(region, cluster.partitionCountForTopic(topic));
    }
}
```

---

## 5. Consumers and Consumer Groups

### Consumer Group Model

```
Topic: "orders" (4 partitions)

Consumer Group "order-processing":
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Consumer A  │  │ Consumer B  │  │ Consumer C  │
│             │  │             │  │             │
│ Partition 0 │  │ Partition 1 │  │ Partition 2 │
│ Partition 3 │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘

Consumer Group "analytics":
┌─────────────┐  ┌─────────────┐
│ Consumer X  │  │ Consumer Y  │
│             │  │             │
│ Partition 0 │  │ Partition 2 │
│ Partition 1 │  │ Partition 3 │
└─────────────┘  └─────────────┘

Key rules:
- Each partition is consumed by exactly ONE consumer per group
- A consumer can consume from multiple partitions
- If consumers > partitions, some consumers sit idle
- Different consumer groups independently consume all messages
```

### Offset Management

```
Partition 0:
  [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11]
                    ▲              ▲              ▲
                    │              │              │
               Last Committed   Current       Log End
               Offset (3)      Position (7)   Offset (11)

Offset commit strategies:
- auto.commit (default, every 5s): At-least-once, may reprocess
- Manual sync commit: Precise, blocks until committed
- Manual async commit: Non-blocking, best effort
```

```java
// Auto commit
props.put("enable.auto.commit", "true");
props.put("auto.commit.interval.ms", "5000");

// Manual commit
props.put("enable.auto.commit", "false");

while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        process(record);
    }
    consumer.commitSync(); // or commitAsync()
}
```

### Consumer Rebalancing

Rebalancing occurs when the group membership changes (consumer joins/leaves/crashes).

```
Before rebalance (3 consumers, 4 partitions):
  C1: [P0, P1]    C2: [P2]    C3: [P3]

C3 crashes!

Rebalancing triggered...
  - All consumers stop consuming
  - Partitions reassigned

After rebalance (2 consumers, 4 partitions):
  C1: [P0, P1]    C2: [P2, P3]
```

**Rebalancing strategies:**

| Strategy | Behavior | Impact |
|----------|----------|--------|
| Eager (default < 2.4) | Stop all, reassign all | Full stop-the-world |
| Cooperative Sticky (2.4+) | Incremental reassignment | Minimal disruption |
| Static membership | Uses group.instance.id | Avoids rebalance on restart |

**Key configs:**
```properties
session.timeout.ms=45000         # Time before consumer considered dead
heartbeat.interval.ms=3000       # Heartbeat frequency
max.poll.interval.ms=300000      # Max time between polls
max.poll.records=500             # Max records per poll
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

---

## 6. Kafka Streams

Kafka Streams is a client library for building stream processing applications on top of Kafka.

### Architecture

```
┌──────────────────────────────────────────────┐
│              Kafka Streams App                │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │           Topology                   │     │
│  │                                     │     │
│  │  Source ──> Process ──> Process ──> Sink  │
│  │  (Topic)   (filter)   (map)   (Topic)    │
│  └─────────────────────────────────────┘     │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Stream   │  │ Stream   │  │ Stream   │   │
│  │ Task 0   │  │ Task 1   │  │ Task 2   │   │
│  │ (Part-0) │  │ (Part-1) │  │ (Part-2) │   │
│  │          │  │          │  │          │   │
│  │ State    │  │ State    │  │ State    │   │
│  │ Store    │  │ Store    │  │ Store    │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│  State stores backed by:                     │
│  - RocksDB (default, persistent)             │
│  - In-memory                                 │
│  - Changelog topics (for fault tolerance)    │
└──────────────────────────────────────────────┘
```

### KStream vs KTable

```
KStream (record stream - all inserts):
  Time ──>
  (key=A, val=1) (key=B, val=2) (key=A, val=3) (key=B, val=4)

  Represents: an unbounded stream of events
  Each record is independent

KTable (changelog stream - upserts):
  Time ──>
  (key=A, val=1) (key=B, val=2) (key=A, val=3) (key=B, val=4)

  Current state:
    A = 3  (latest value for key A)
    B = 4  (latest value for key B)

  Represents: a table that changes over time
```

### Joins

| Join Type | KStream-KStream | KStream-KTable | KTable-KTable |
|-----------|----------------|----------------|---------------|
| Inner | Windowed only | Yes | Yes |
| Left | Windowed only | Yes | Yes |
| Outer | Windowed only | No | Yes |
| Requirement | Same key | Same key | Same key |

```java
// KStream-KTable join
KStream<String, Order> orders = builder.stream("orders");
KTable<String, Customer> customers = builder.table("customers");

KStream<String, EnrichedOrder> enriched = orders.join(
    customers,
    (order, customer) -> new EnrichedOrder(order, customer)
);
```

### Windowing

```
Tumbling Window (fixed, non-overlapping):
|----window 1----|----window 2----|----window 3----|
  events here       events here       events here

Sliding Window (overlapping):
|----window 1----|
     |----window 2----|
          |----window 3----|

Session Window (gap-based):
|--session 1--|  gap  |---session 2---|  gap  |--session 3--|
  activity              activity               activity

Hopping Window (fixed, overlapping):
|--------window 1--------|
     |--------window 2--------|
          |--------window 3--------|
  Advance: 5s    Size: 15s
```

```java
// Tumbling window: count orders per minute
orders
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(1)))
    .count()
    .toStream();

// Session window: count user actions per session (30s inactivity gap)
actions
    .groupByKey()
    .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofSeconds(30)))
    .count();
```

---

## 7. Kafka Connect

Kafka Connect is a framework for streaming data between Kafka and external systems.

### Architecture

```
┌──────────────────────────────────────────────────┐
│              KAFKA CONNECT CLUSTER                │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │       │
│  │          │  │          │  │          │       │
│  │ Task 1a  │  │ Task 1b  │  │ Task 2a  │       │
│  │ Task 2b  │  │ Task 3a  │  │ Task 3b  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  Connectors:                                      │
│  1. Source: MySQL CDC ──> Kafka                   │
│  2. Sink: Kafka ──> Elasticsearch                 │
│  3. Sink: Kafka ──> S3                            │
└──────────────────────────────────────────────────┘
```

### Source vs Sink Connectors

```
Source Connectors (External ──> Kafka):
┌──────────┐    ┌───────────┐    ┌─────────┐
│ Database │───>│  Source    │───>│  Kafka  │
│ Files    │    │ Connector │    │  Topics │
│ APIs     │    │           │    │         │
└──────────┘    └───────────┘    └─────────┘

Sink Connectors (Kafka ──> External):
┌─────────┐    ┌───────────┐    ┌──────────┐
│  Kafka  │───>│   Sink    │───>│ Database │
│  Topics │    │ Connector │    │ S3       │
│         │    │           │    │ Elastic  │
└─────────┘    └───────────┘    └──────────┘
```

### Popular Connectors

| Connector | Type | Use Case |
|-----------|------|----------|
| Debezium (MySQL/Postgres/MongoDB) | Source | CDC, real-time replication |
| JDBC Source/Sink | Both | Database integration |
| S3 Sink | Sink | Data lake storage |
| Elasticsearch Sink | Sink | Search indexing |
| BigQuery Sink | Sink | Data warehouse loading |
| FileStream | Both | File-based testing |

### Single Message Transforms (SMTs)

```json
{
  "transforms": "addTimestamp,maskPII",
  "transforms.addTimestamp.type": "org.apache.kafka.connect.transforms.InsertField$Value",
  "transforms.addTimestamp.timestamp.field": "processed_at",
  "transforms.maskPII.type": "org.apache.kafka.connect.transforms.MaskField$Value",
  "transforms.maskPII.fields": "ssn,credit_card"
}
```

---

## 8. Schema Registry

Schema Registry provides a centralized repository for schemas, enabling schema evolution and compatibility checks.

```
┌──────────┐    ┌─────────────────┐    ┌──────────┐
│ Producer │───>│ Schema Registry │◄───│ Consumer │
│          │    │                 │    │          │
│ Serialize│    │ - Store schemas │    │Deserialize│
│ with     │    │ - Version mgmt │    │ with      │
│ schema ID│    │ - Compatibility │    │ schema ID │
└──────────┘    └─────────────────┘    └──────────┘
                        │
                   Schemas stored
                   in _schemas topic
```

### Supported Formats

| Format | Binary | Schema Evolution | Human Readable | Size |
|--------|--------|-----------------|----------------|------|
| Avro | Yes | Excellent | No | Small |
| Protobuf | Yes | Good | No | Small |
| JSON Schema | No | Good | Yes | Large |

### Compatibility Modes

| Mode | Rule | Use Case |
|------|------|----------|
| BACKWARD | New schema can read old data | Default. Add optional fields |
| FORWARD | Old schema can read new data | Remove optional fields |
| FULL | Both backward and forward | Add/remove optional fields only |
| NONE | No checks | Development only |

```
BACKWARD compatible changes:
  v1: { name: string, age: int }
  v2: { name: string, age: int, email: string (default: "") }
  ✓ v2 consumer can read v1 data (email defaults to "")

FORWARD compatible changes:
  v1: { name: string, age: int, email: string }
  v2: { name: string, age: int }
  ✓ v1 consumer can read v2 data (ignores missing email)
```

---

## 9. Exactly-Once Semantics

### Delivery Guarantees

```
At-most-once:
  Producer ──> Broker: Fire and forget (acks=0)
  May lose messages, never duplicates

At-least-once:
  Producer ──> Broker: Retry on failure (acks=all)
  Never loses, may duplicate

Exactly-once:
  Producer ──> Broker: Idempotent + transactional
  Never loses, never duplicates
```

### Transactional Producer

```java
Properties props = new Properties();
props.put("transactional.id", "order-processor-1");
props.put("enable.idempotence", "true");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("output-topic", key, value));
    producer.sendOffsetsToTransaction(offsets, consumerGroupId);
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

### End-to-End Exactly-Once

```
Consumer ──read──> Process ──write──> Producer
    │                                    │
    └──── Atomic: commit offsets + ──────┘
          produce output in one
          transaction

Requires:
1. Idempotent producer (enable.idempotence=true)
2. Transactional producer (transactional.id set)
3. Consumer with isolation.level=read_committed
4. Kafka Streams: processing.guarantee=exactly_once_v2
```

---

## 10. Performance Tuning

### Producer Tuning

| Config | Default | Tuning Guidance |
|--------|---------|-----------------|
| `batch.size` | 16384 (16 KB) | Increase for throughput (e.g., 64 KB) |
| `linger.ms` | 0 | Increase to allow batching (e.g., 5-100 ms) |
| `compression.type` | none | Use `lz4` or `zstd` for throughput |
| `buffer.memory` | 33554432 (32 MB) | Increase if producer blocks |
| `max.in.flight.requests.per.connection` | 5 | 1 for strict ordering, 5 with idempotency |
| `acks` | all | `1` for lower latency |

### Consumer Tuning

| Config | Default | Tuning Guidance |
|--------|---------|-----------------|
| `fetch.min.bytes` | 1 | Increase for throughput (e.g., 1 KB) |
| `fetch.max.wait.ms` | 500 | Balance with min.bytes |
| `max.poll.records` | 500 | Reduce if processing is slow |
| `max.partition.fetch.bytes` | 1048576 (1 MB) | Increase for large messages |
| `session.timeout.ms` | 45000 | Balance with heartbeat |

### Broker Tuning

| Config | Default | Tuning Guidance |
|--------|---------|-----------------|
| `num.io.threads` | 8 | Match to disk count |
| `num.network.threads` | 3 | Match to CPU cores |
| `log.flush.interval.messages` | Long.MAX | OS page cache handles flushing |
| `log.segment.bytes` | 1 GB | Smaller for faster cleanup |
| `num.partitions` | 1 | Set per topic, not globally |

### Throughput vs Latency

```
High Throughput Config:
  batch.size=65536
  linger.ms=50
  compression.type=lz4
  acks=1
  buffer.memory=67108864

Low Latency Config:
  batch.size=16384
  linger.ms=0
  compression.type=none
  acks=1
  fetch.min.bytes=1
```

---

## 11. Operational Concerns

### Retention Policies

| Policy | Config | Behavior |
|--------|--------|----------|
| Time-based | `log.retention.hours=168` | Delete segments older than 7 days |
| Size-based | `log.retention.bytes=1073741824` | Delete when partition exceeds 1 GB |
| Compaction | `log.cleanup.policy=compact` | Keep latest value per key |
| Both | `log.cleanup.policy=compact,delete` | Compact + time-based delete |

### Log Compaction

```
Before compaction:
  Offset:  0    1    2    3    4    5    6    7    8
  Key:     A    B    A    C    B    A    C    A    B
  Value:   1    2    3    4    5    6    7    8    9

After compaction:
  Offset:  5    6    7    8
  Key:     A    C    A    B
  Value:   6    7    8    9

Only the LATEST value for each key is retained.
Useful for: changelogs, KTable state, configuration topics
```

### Monitoring Metrics

| Metric | What It Tells You |
|--------|------------------|
| `UnderReplicatedPartitions` | Replicas falling behind (broker health) |
| `ActiveControllerCount` | Should be exactly 1 per cluster |
| `OfflinePartitionsCount` | Partitions without a leader (outage) |
| `RequestHandlerAvgIdlePercent` | Broker load (< 0.3 = overloaded) |
| `BytesInPerSec` / `BytesOutPerSec` | Throughput |
| `consumer_lag` | Consumer falling behind producer |
| `request-latency-avg` | P50/P99 request latency |

### Consumer Lag Monitoring

```
Producer rate: 10,000 msg/s
Consumer rate:  8,000 msg/s

Lag = (10,000 - 8,000) * time = growing!

Tools for monitoring lag:
- kafka-consumer-groups.sh --describe
- Burrow (LinkedIn open source)
- Kafka Exporter + Prometheus + Grafana
```

---

## 12. Common Interview Questions

**Q: How does Kafka guarantee message ordering?**
A: Kafka guarantees ordering within a single partition only. Messages with the same key are routed to the same partition (via hash), ensuring they are consumed in order. Cross-partition ordering is not guaranteed. With idempotent producers (max.in.flight.requests.per.connection <= 5), ordering is preserved even with retries.

**Q: What happens when a Kafka broker goes down?**
A: If the broker hosted leader partitions, the controller triggers leader election. A new leader is chosen from the ISR. Producers and consumers are redirected to the new leader. Follower replicas continue replicating. If `min.insync.replicas` cannot be met, writes with `acks=all` will fail. Data is not lost if replication factor > 1 and ISR was healthy.

**Q: How would you handle a slow consumer?**
A: Strategies include: (1) Increase partitions and add more consumers to the group; (2) Optimize processing logic or make it async; (3) Increase `max.poll.records` or `max.poll.interval.ms`; (4) Use parallel processing within the consumer; (5) Consider a separate error/dead-letter topic for failed messages; (6) Monitor consumer lag and set alerts.

**Q: Explain the difference between Kafka and traditional message queues (RabbitMQ).**
A: Kafka is a distributed log: messages are persisted, consumers track offsets, and messages can be re-read. RabbitMQ is a traditional message broker: messages are deleted after acknowledgment, supports complex routing (exchanges, queues), and uses push-based delivery. Kafka excels at high-throughput streaming and event sourcing; RabbitMQ excels at task queues and complex routing patterns.

**Q: How does Kafka achieve exactly-once semantics?**
A: Three mechanisms: (1) Idempotent producer prevents duplicates via producer ID and sequence numbers; (2) Transactional producer allows atomic writes across multiple partitions; (3) Consumer with `isolation.level=read_committed` only reads committed transactions. In Kafka Streams, `processing.guarantee=exactly_once_v2` combines all three.

**Q: How would you design a Kafka-based CDC pipeline?**
A: Use Debezium source connector to capture changes from the source database (MySQL/Postgres). Changes are published to Kafka topics (one per table). Use Schema Registry for schema management. Apply SMTs for filtering/transformation. Use sink connectors to write to target systems (data warehouse, search index). Monitor with consumer lag metrics and set up dead-letter queues for failed records. Consider log compaction for the CDC topics to maintain the latest state.

**Q: What is the impact of increasing the number of partitions?**
A: More partitions enable higher parallelism and throughput. However, they increase: (1) end-to-end latency slightly; (2) memory usage on brokers (each partition has buffers); (3) rebalancing time when consumers join/leave; (4) number of file handles on brokers; (5) leader election time during broker failures. Partitions cannot be reduced once created.

---

## 13. Quick Reference

### Kafka CLI Commands

```bash
# Create topic
kafka-topics.sh --create --topic orders \
  --bootstrap-server localhost:9092 \
  --partitions 6 --replication-factor 3

# Describe topic
kafka-topics.sh --describe --topic orders \
  --bootstrap-server localhost:9092

# Produce messages
kafka-console-producer.sh --topic orders \
  --bootstrap-server localhost:9092

# Consume messages
kafka-console-consumer.sh --topic orders \
  --bootstrap-server localhost:9092 \
  --from-beginning --group my-consumer-group

# Consumer group status
kafka-consumer-groups.sh --describe --group my-consumer-group \
  --bootstrap-server localhost:9092

# Reset offsets
kafka-consumer-groups.sh --reset-offsets \
  --group my-consumer-group --topic orders \
  --to-earliest --execute \
  --bootstrap-server localhost:9092
```

### Configuration Cheat Sheet

```
PRODUCER (high throughput):
  acks=all
  enable.idempotence=true
  batch.size=65536
  linger.ms=20
  compression.type=lz4
  retries=MAX_INT

CONSUMER (reliable):
  enable.auto.commit=false
  auto.offset.reset=earliest
  isolation.level=read_committed
  max.poll.records=500
  session.timeout.ms=45000

TOPIC (production):
  partitions=12
  replication.factor=3
  min.insync.replicas=2
  retention.ms=604800000 (7 days)
  cleanup.policy=delete
```

### Kafka Ecosystem at a Glance

```
┌─────────────────────────────────────────────┐
│              KAFKA ECOSYSTEM                │
│                                             │
│  Core:        Kafka Brokers, KRaft          │
│  Streaming:   Kafka Streams, ksqlDB         │
│  Integration: Kafka Connect, MirrorMaker 2  │
│  Schema:      Schema Registry (Avro/Proto)  │
│  Monitoring:  Cruise Control, Burrow        │
│  Security:    SASL, SSL/TLS, ACLs           │
│  Managed:     Confluent Cloud, AWS MSK,     │
│               Azure Event Hubs, Aiven       │
└─────────────────────────────────────────────┘
```
