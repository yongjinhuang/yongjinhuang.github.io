# Data Model: Message Queue (Kafka)

Kafka is a distributed append-only log that achieves high throughput by treating messages as sequential writes to disk. The data model is fundamentally different from traditional databases: there are no tables with rows, just ordered logs of records partitioned for parallelism. Understanding the data model means understanding topics, partitions, offsets, and consumer groups — the core abstractions that enable Kafka's performance characteristics.

## Table Responsibilities

| Structure | Purpose | Storage | Key Characteristic |
|-----------|---------|---------|-------------------|
| **topics** | Logical stream categories | Broker metadata (ZooKeeper/KRaft) | Configuration container |
| **partitions** | Ordered, append-only logs | Disk (log segments) | Unit of parallelism and ordering |
| **records** | Individual messages | Within partition log segments | Immutable once written |
| **consumer_groups** | Coordinate parallel consumption | Internal topic `__consumer_offsets` | Track progress per partition |
| **consumer_offsets** | Committed read positions | Internal topic `__consumer_offsets` | Enable resume after crash |

## Detailed Field Descriptions

### topics

| Field | Type | Description |
|-------|------|-------------|
| topic_name | STRING, PK | Logical name (e.g., `user.events`, `order.created`). Naming convention typically uses dots or dashes as namespace separators. |
| partition_count | INT | Number of partitions. Determines maximum consumer parallelism: you can have at most N consumers (in a group) for N partitions. Cannot be decreased after creation. |
| replication_factor | INT | Number of copies across brokers (typically 3). Ensures durability: the cluster survives `replication_factor - 1` broker failures without data loss. |
| retention_ms | BIGINT | How long to keep records (e.g., 604800000 = 7 days). After this, old log segments are deleted. -1 means infinite retention. |
| retention_bytes | BIGINT | Max bytes per partition before old segments are deleted. -1 means no size limit. Used alongside retention_ms (whichever triggers first). |
| cleanup_policy | ENUM('delete','compact','delete,compact') | `delete`: remove old segments by time/size. `compact`: keep only the latest value per key (like a changelog). `delete,compact`: both. |

**Why is partition_count important?** It is the most critical configuration. Too few partitions: throughput bottleneck (each partition is a single ordered stream). Too many: more file handles, longer leader elections, higher end-to-end latency. Rule of thumb: start with `max(expected_throughput_MB / 10, num_consumers)`.

**Why `compact` cleanup policy?** For topics representing state (e.g., user profiles), you only care about the latest value per key. Compaction removes older records with the same key, keeping the topic's size bounded while preserving the current state of every key.

### partitions (Append-Only Log on Disk)

| Field | Type | Description |
|-------|------|-------------|
| topic | STRING | Which topic this partition belongs to. |
| partition_id | INT | Partition number within the topic (0-indexed). |
| log_segments | FILE[] | Sequence of segment files on disk (e.g., `00000000000000000000.log`, `00000000000000089312.log`). Each file name is the base offset of the first record in that segment. Typically 1GB each. |
| index_files | FILE[] | Sparse offset-to-byte-position index (e.g., `00000000000000000000.index`). Maps every Nth offset to its byte position in the log file. Enables O(1) offset lookup via binary search + small scan. |
| timeindex | FILE[] | Timestamp-to-offset index. Enables "fetch records from timestamp X" without scanning the entire log. Used for consumer time-based seeking. |

**Why segment files instead of one big file?** Segmentation enables efficient cleanup: delete or compact old segments without rewriting the active segment. It also keeps file sizes manageable for OS page cache and enables parallel I/O.

**Why sparse indexes?** A dense index (every offset) would be as large as the data itself. Sparse indexes (every 4KB of data by default) use minimal space while adding at most a small sequential scan after the binary search.

### records

| Field | Type | Description |
|-------|------|-------------|
| key | BYTES, NULLABLE | Message key. Used for two purposes: (1) partition assignment via `hash(key) % partitions` ensures same-key records go to the same partition (ordering guarantee), (2) log compaction keeps the latest value per key. |
| value | BYTES | Message payload. Kafka treats it as opaque bytes. The application chooses serialization (JSON, Avro, Protobuf). Avro with Schema Registry is common for schema evolution. |
| timestamp | BIGINT | Epoch milliseconds. Either create-time (set by producer) or log-append-time (set by broker). Used for time-based retention and time-index seeking. |
| offset | BIGINT | Monotonically increasing sequence number within the partition. Auto-assigned by the broker on append. The offset is the record's "address" — consumers track their position by offset. |
| headers | MAP<STRING, BYTES> | Optional metadata key-value pairs. Used for tracing (correlation IDs), routing, or content-type hints without parsing the value. |

**Why is the key critical for ordering?** Kafka only guarantees ordering within a partition. If you need all events for user 123 processed in order, hash the user_id as the key. All user-123 events go to the same partition and are consumed in order.

### consumer_groups

| Field | Type | Description |
|-------|------|-------------|
| group_id | STRING | Unique name for the consumer group (e.g., `order-processing-service`). Multiple groups can independently consume the same topic. |
| topic | STRING | Which topic this group consumes. A group can subscribe to multiple topics. |
| partition_assignments | MAP<consumer_id, partition_id[]> | Which consumer in the group reads which partitions. Rebalanced automatically when consumers join or leave. Each partition is assigned to exactly one consumer in the group. |
| committed_offset | MAP<partition_id, BIGINT> | Last processed offset per partition. Stored in `__consumer_offsets`. On restart, the consumer resumes from this offset. |

**Why consumer groups?** They enable horizontal scaling of consumption. A topic with 12 partitions can be consumed by 12 consumers in a group, each reading 1 partition. Adding a 13th consumer is pointless (it would be idle). Removing consumers triggers rebalancing so remaining consumers pick up the orphaned partitions.

### consumer_offsets (Internal Topic: `__consumer_offsets`)

| Field | Type | Description |
|-------|------|-------------|
| group_id | STRING | (Part of composite key) Which consumer group. |
| topic | STRING | (Part of composite key) Which topic. |
| partition | INT | (Part of composite key) Which partition. |
| offset | BIGINT | The committed offset. Records at or before this offset have been processed. |
| metadata | STRING | Optional consumer-provided metadata (e.g., processing state). |
| timestamp | BIGINT | When the offset was committed. Used for monitoring consumer lag. |

**Why store offsets in a Kafka topic?** Kafka avoids external dependencies (like ZooKeeper for offset storage, which was the old approach). Storing offsets in a compacted internal topic leverages Kafka's own replication and durability. The topic is partitioned by group_id hash for scalability.

## ER Diagram

```
┌──────────────────────┐
│       topics          │
│──────────────────────│
│ topic_name (PK)       │
│ partition_count       │
│ replication_factor    │
│ retention_ms          │
│ retention_bytes       │
│ cleanup_policy        │
└──────────────────────┘
         │ 1
         │
         │          *
┌────────┴─────────────┐
│     partitions        │
│──────────────────────│
│ topic + partition_id  │
│ log_segments[]        │
│ index_files[]         │
│ timeindex[]           │
└──────────────────────┘
         │ 1
         │
         │          *
┌────────┴─────────────┐
│      records          │
│──────────────────────│
│ key (bytes)           │
│ value (bytes)         │
│ timestamp             │
│ offset (auto)         │
│ headers               │
└──────────────────────┘

┌──────────────────────┐       ┌──────────────────────┐
│   consumer_groups     │       │  consumer_offsets     │
│──────────────────────│       │  (__consumer_offsets)  │
│ group_id              │1     *│──────────────────────│
│ topic                 │───────│ group_id              │
│ partition_assignments │       │ topic                 │
│ committed_offsets     │       │ partition             │
└──────────────────────┘       │ offset                │
                                │ metadata              │
                                │ timestamp             │
                                └──────────────────────┘

Relationships:
  topics     1───* partitions       (one topic has many partitions)
  partitions 1───* records          (one partition has many records)
  consumer_groups 1───* consumer_offsets (one group tracks offsets per partition)

Note: These are not database tables. Topics/partitions are
log files on disk. Consumer offsets are records in a special
internal Kafka topic. The "ER diagram" shows logical relationships.
```

## Data Flow

### Producing a Record

```
1. Application creates a record:
   {key: "user-123", value: {event: "purchase", amount: 99.99}}
         │
         ▼
2. Producer serializes key and value (e.g., Avro via Schema Registry)
         │
         ▼
3. Partitioner determines target partition:
   ├─ Key is non-null: hash(key) % partition_count
   │   (e.g., hash("user-123") % 12 = partition 7)
   └─ Key is null: round-robin across partitions
         │
         ▼
4. Record added to producer's batch buffer for partition 7
   (batching: linger.ms=5, batch.size=16KB — whichever triggers first)
         │
         ▼
5. Batch sent to partition leader broker (single network call for many records)
         │
         ▼
6. Leader broker:
   ├─ Append batch to active log segment file (sequential write)
   ├─ Update in-memory index
   └─ Replicate to ISR (In-Sync Replicas) followers
         │
         ▼
7. Followers write to their log and ACK the leader
         │
         ▼
8. Leader ACKs the producer based on acks setting:
   ├─ acks=0: no ACK (fire-and-forget, fastest, data loss risk)
   ├─ acks=1: ACK after leader write (fast, risk on leader crash)
   └─ acks=all: ACK after all ISR replicas write (safest, slower)
```

### Consuming Records

```
1. Consumer in group "order-service" polls partition 7
   (sends: fetch request with last_committed_offset + 1)
         │
         ▼
2. Broker locates records on disk:
   ├─ Binary search index file for target offset
   ├─ Seek to byte position in log segment
   └─ Sequential read from disk (OS page cache makes this fast)
         │
         ▼
3. Zero-copy transfer:
   sendfile() syscall copies directly from page cache to network socket
   (skips user-space copy, ~10x throughput improvement)
         │
         ▼
4. Consumer receives batch of records
         │
         ▼
5. Consumer processes each record:
   ├─ Deserialize
   ├─ Execute business logic
   └─ Handle errors (dead-letter queue for poison pills)
         │
         ▼
6. Consumer commits offset:
   ├─ Auto-commit (every 5s by default) — at-least-once, risk of reprocessing
   └─ Manual commit (after processing) — exactly-once with idempotent writes
         │
         ▼
7. Offset written to __consumer_offsets topic
   (compacted, so only latest offset per group+topic+partition is kept)
```

**Why sequential disk writes?** Kafka's key insight is that sequential disk I/O (100-200 MB/s on spinning disks) approaches network speed and far exceeds random I/O (100-200 IOPS). By only appending to the end of log files, Kafka achieves database-impossible write throughput.

**Why zero-copy?** Traditional data transfer: disk → kernel buffer → user buffer → kernel socket buffer → NIC. Zero-copy (sendfile): disk → kernel buffer → NIC. Eliminating two memory copies and two context switches dramatically improves throughput for large batch reads.

**Why consumer groups instead of traditional message queues?** In a traditional queue, consuming a message deletes it. In Kafka, records are retained for a configurable period and consumers track their own position (offset). This means multiple consumer groups can independently read the same data (e.g., one for real-time processing, one for analytics), and consumers can "rewind" to reprocess old data.
