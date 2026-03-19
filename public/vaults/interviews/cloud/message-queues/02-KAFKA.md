# Apache Kafka Deep Dive

Kafka is the dominant event streaming platform, used by LinkedIn (its creator), Netflix, Uber, Airbnb, and thousands of companies. It is not a traditional message queue -- it is a **distributed commit log** that enables event sourcing, stream processing, and real-time data pipelines.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Topics and Partitions](#topics-and-partitions)
4. [Producers](#producers)
5. [Consumer Groups](#consumer-groups)
6. [Replication and ISR](#replication-and-isr)
7. [Exactly-Once Semantics](#exactly-once-semantics)
8. [Log Compaction](#log-compaction)
9. [Kafka Streams](#kafka-streams)
10. [Kafka Connect](#kafka-connect)
11. [KRaft Mode](#kraft-mode)
12. [Performance Tuning](#performance-tuning)
13. [Common Interview Questions](#common-interview-questions)

---

## Core Concepts

```
+--Producer--+     +----Kafka Cluster----+     +--Consumer Group--+
| App writes | --> | Topic: "orders"     | --> | Service A        |
| events     |     | Partition 0: [1][2] |     |  Consumer A1 (P0)|
+------------+     | Partition 1: [3][4] |     |  Consumer A2 (P1)|
                   | Partition 2: [5][6] |     +------------------+
                   +---------------------+     +--Consumer Group--+
                                               | Service B        |
                                               |  Consumer B1(all)|
                                               +------------------+
```

| Concept | Description |
| ------- | ----------- |
| **Topic** | Named feed of messages (like a table) |
| **Partition** | Ordered, immutable sequence of records within a topic |
| **Offset** | Sequential ID of a record within a partition |
| **Broker** | A Kafka server that stores partitions |
| **Producer** | Writes records to topics |
| **Consumer** | Reads records from topics |
| **Consumer Group** | Set of consumers that share the work of reading a topic |

---

## Architecture

```
+----------------------------------------------------------+
|                    Kafka Cluster                          |
|                                                           |
|  Broker 1              Broker 2              Broker 3     |
|  +--------+            +--------+            +--------+   |
|  | T:orders|           | T:orders|           | T:orders|  |
|  | P0(L)  |           | P0(F)  |           | P1(L)  |   |
|  | P1(F)  |           | P2(L)  |           | P2(F)  |   |
|  +--------+            +--------+            +--------+   |
|  L = Leader, F = Follower                                 |
|                                                           |
|  +----------------------------------------------------+  |
|  | KRaft Controller (replaces ZooKeeper)               |  |
|  | Manages metadata, leader election, cluster config   |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
```

### How Data Flows

```
Producer writes to partition leader:
  Producer -> Broker 1 (P0 Leader) -> append to log -> replicate to Broker 2 (P0 Follower)

Consumer reads from partition leader:
  Consumer -> Broker 1 (P0 Leader) -> read from offset 42

  (Kafka 2.4+: consumers can read from closest replica with rack-aware config)
```

---

## Topics and Partitions

### Partition Strategy

```
Topic: "orders" with 6 partitions

Producer sends: { key: "user-123", value: { order_id: "abc" } }
  -> hash("user-123") % 6 = partition 3
  -> All events for user-123 go to partition 3 (ordered!)

Producer sends: { key: null, value: { ... } }
  -> Round-robin across partitions (no ordering guarantee)
```

### How Many Partitions?

```
Rule of thumb:
  partitions = max(T/P, T/C)

  T = target throughput (MB/s)
  P = throughput per producer partition (~10 MB/s)
  C = throughput per consumer partition (~25 MB/s)

  Example: 100 MB/s target
    Producer: 100/10 = 10 partitions
    Consumer: 100/25 = 4 partitions
    Answer: 10 partitions (take the max)

More partitions:
  + More parallelism (more consumers)
  + Higher throughput
  - More file handles and memory per broker
  - Longer leader election time
  - Higher end-to-end latency

Start with: num_partitions = 2 * expected_consumer_count
```

### Retention

```
# Time-based retention (default: 7 days)
log.retention.hours=168

# Size-based retention
log.retention.bytes=1073741824  # 1 GB per partition

# Compact (keep latest value per key)
log.cleanup.policy=compact
```

---

## Producers

### Key Configuration

| Config | Default | Description |
| ------ | ------- | ----------- |
| `acks` | `all` (Kafka 3.0+) | `0`: fire-and-forget, `1`: leader ACK, `all`: all ISR ACK |
| `retries` | MAX_INT | Number of retries on failure |
| `enable.idempotence` | `true` (3.0+) | Prevents duplicate writes on retry |
| `batch.size` | 16 KB | Max batch size before sending |
| `linger.ms` | 0 | Wait time to fill batch (trade latency for throughput) |
| `compression.type` | none | `gzip`, `snappy`, `lz4`, `zstd` |
| `max.in.flight.requests` | 5 | Max unacked requests per connection |

### Producer Guarantees

```
acks=0:   Fire and forget. Fastest. Messages can be lost.
acks=1:   Leader writes to local log, ACKs. Message lost if leader crashes
          before replication.
acks=all: All ISR replicas ACK. Safest. Combined with min.insync.replicas=2,
          guarantees no data loss even if one broker dies.
```

---

## Consumer Groups

```
Topic: "orders" (4 partitions: P0, P1, P2, P3)

Consumer Group "billing":
  Consumer B1 -> reads P0, P1
  Consumer B2 -> reads P2, P3

Consumer Group "shipping":
  Consumer S1 -> reads P0, P1, P2, P3 (single consumer gets all)

Rules:
  - Each partition assigned to exactly ONE consumer in a group
  - One consumer can read from MULTIPLE partitions
  - Max useful consumers = number of partitions
  - Adding a consumer beyond partition count = idle consumer
```

### Rebalancing

When a consumer joins, leaves, or crashes, partitions are redistributed.

```
Before: B1 -> [P0, P1, P2, P3]   (one consumer, all partitions)
Add B2: B1 -> [P0, P1], B2 -> [P2, P3]   (rebalanced)
B1 dies: B2 -> [P0, P1, P2, P3]   (rebalanced, B2 takes over)
```

| Strategy | How | Trade-off |
| -------- | --- | --------- |
| **Eager** | Revoke all partitions, reassign | Simpler, but causes a "stop-the-world" pause |
| **Cooperative Sticky** | Only move partitions that need to move | Minimal disruption, preferred |

### Offset Management

```
Consumer reads messages -> processes -> commits offset

Auto-commit (default):
  offsets committed every 5 seconds automatically
  Risk: processing may fail after auto-commit -> message lost

Manual commit:
  consumer.commitSync()  -- after successful processing
  Safer: only commit after processing succeeds
```

### Consumer Lag

```
Consumer lag = latest offset - committed offset

Topic "orders" P0:
  Latest offset:    1000
  Committed offset: 950
  Lag: 50 messages

High lag = consumer is falling behind = potential issue
Monitor with: kafka-consumer-groups.sh --describe --group billing
```

---

## Replication and ISR

### In-Sync Replicas (ISR)

```
Partition 0: Leader (Broker 1), Follower (Broker 2), Follower (Broker 3)

ISR = { Broker 1, Broker 2, Broker 3 }  -- all caught up

Broker 3 falls behind by > replica.lag.time.max.ms (30s):
ISR = { Broker 1, Broker 2 }  -- Broker 3 removed from ISR

With acks=all + min.insync.replicas=2:
  - Producer write succeeds if >= 2 ISR replicas ACK
  - If ISR drops below 2: producer gets NotEnoughReplicasException
```

### Leader Election

```
Broker 1 (Leader) crashes:
  1. Controller detects failure (via heartbeat timeout)
  2. Controller selects new leader from ISR (e.g., Broker 2)
  3. Broker 2 becomes leader
  4. Producers and consumers redirected to Broker 2

unclean.leader.election.enable = false (default):
  Only ISR members can become leader (no data loss)

unclean.leader.election.enable = true:
  Any replica can become leader (may lose data, but maintains availability)
```

---

## Exactly-Once Semantics

### Idempotent Producer

```
enable.idempotence = true

Producer assigns sequence number to each message per partition.
Broker deduplicates: if sequence number already seen, discard.

Handles: network retries producing duplicates
Does NOT handle: application-level retries (restart producer)
```

### Transactional Producer

```java
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

Atomic write: either ALL messages in the transaction are committed, or NONE.
Combined with `isolation.level = read_committed` on consumers, this provides exactly-once processing within Kafka.

---

## Log Compaction

Instead of deleting old messages by time/size, keep the **latest value for each key**.

```
Before compaction:
  offset 0: key=A, value=1
  offset 1: key=B, value=2
  offset 2: key=A, value=3
  offset 3: key=C, value=4
  offset 4: key=B, value=5

After compaction:
  offset 2: key=A, value=3   (latest for A)
  offset 3: key=C, value=4   (latest for C)
  offset 4: key=B, value=5   (latest for B)
```

Use cases: changelog topics (Kafka Streams state stores), database CDC, configuration.

---

## Kafka Streams

Lightweight stream processing library (not a separate cluster).

```java
StreamsBuilder builder = new StreamsBuilder();

KStream<String, Order> orders = builder.stream("orders");

// Filter, transform, aggregate
KTable<String, Long> orderCounts = orders
    .filter((key, order) -> order.getStatus().equals("completed"))
    .groupByKey()
    .count();

// Write results to output topic
orderCounts.toStream().to("order-counts");
```

| Feature | Kafka Streams | Apache Flink |
| ------- | ------------- | ------------ |
| **Deployment** | Library (runs in your app) | Separate cluster |
| **Complexity** | Simple | Complex |
| **State** | RocksDB (local) | Managed (checkpointed) |
| **Exactly-once** | Yes (within Kafka) | Yes (broader) |
| **Windowing** | Tumbling, hopping, sliding, session | All + custom |
| **Scale** | By partition count | By parallelism config |

---

## Kafka Connect

Pre-built connectors for moving data in/out of Kafka.

```
Source Connectors (into Kafka):
  PostgreSQL (Debezium) -> Kafka
  MySQL (Debezium) -> Kafka
  S3 files -> Kafka
  REST API -> Kafka

Sink Connectors (out of Kafka):
  Kafka -> Elasticsearch
  Kafka -> S3
  Kafka -> PostgreSQL
  Kafka -> Snowflake
```

---

## KRaft Mode

Kafka 3.3+ replaces ZooKeeper with KRaft (Kafka Raft).

| Aspect | ZooKeeper | KRaft |
| ------ | --------- | ----- |
| **Metadata** | External ZooKeeper cluster | Internal Kafka controllers |
| **Operations** | Two systems to manage | Single system |
| **Scalability** | ZK bottleneck at ~200K partitions | Millions of partitions |
| **Recovery** | Slow (full metadata reload) | Fast (incremental) |
| **Status** | Deprecated (removed in Kafka 4.0) | Default since 3.3 |

---

## Performance Tuning

### Producer Tuning

| Goal | Config | Value |
| ---- | ------ | ----- |
| Max throughput | `linger.ms=100`, `batch.size=1MB`, `compression=lz4` | Batch more, compress |
| Min latency | `linger.ms=0`, `acks=1` | Send immediately |
| No data loss | `acks=all`, `min.insync.replicas=2`, `enable.idempotence=true` | Wait for all replicas |

### Consumer Tuning

| Goal | Config | Value |
| ---- | ------ | ----- |
| Max throughput | `fetch.min.bytes=1MB`, `max.poll.records=1000` | Fetch in bulk |
| Min latency | `fetch.min.bytes=1`, `fetch.max.wait.ms=100` | Fetch immediately |
| Avoid rebalance | `session.timeout.ms=45s`, `heartbeat.interval.ms=15s` | Longer timeout |

---

## Common Interview Questions

1. **How does Kafka guarantee ordering?** Ordering is guaranteed within a partition. Use a partition key to route related messages to the same partition. No global ordering across partitions (would require single partition).

2. **What happens when a broker dies?** Controller detects failure, elects new leaders for affected partitions from ISR. Producers and consumers are redirected. With `replication.factor=3` and `min.insync.replicas=2`, no data loss.

3. **Explain consumer groups.** A group of consumers that share the work of reading a topic. Each partition is assigned to one consumer in the group. This provides both pub/sub (multiple groups) and load balancing (within a group).

4. **How does Kafka achieve exactly-once?** Idempotent producer (dedup via sequence numbers) + transactional producer (atomic writes) + `read_committed` consumers. This works within the Kafka ecosystem; between Kafka and external systems, you need idempotent consumers.

5. **What is consumer lag and why does it matter?** The difference between the latest offset and the consumer's committed offset. High lag means the consumer is falling behind. Causes: slow processing, too few consumers, consumer crashes. Monitor and alert on lag.

6. **How do you choose the number of partitions?** Based on target throughput and consumer count. More partitions = more parallelism but more overhead. Cannot decrease partitions (only increase). Start with 2x expected consumer count.

7. **What is log compaction?** Instead of deleting old messages by time, keep the latest value for each key. Used for changelogs, CDC, and maintaining the latest state per entity.

8. **Compare Kafka with RabbitMQ.** Kafka: distributed log, replay, high throughput, stream processing. RabbitMQ: traditional queue, flexible routing, lower latency per message, simpler for task queues. Kafka for events/streaming; RabbitMQ for tasks/commands.
