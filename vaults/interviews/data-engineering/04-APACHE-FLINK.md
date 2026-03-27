# Apache Flink

A comprehensive guide to Apache Flink, the distributed stream processing framework for
stateful computations over unbounded and bounded data streams. Covers architecture, time
semantics, watermarks, windows, state management, checkpointing, and exactly-once guarantees.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [DataStream API](#3-datastream-api)
4. [Time Semantics](#4-time-semantics)
5. [Watermarks](#5-watermarks)
6. [Windows](#6-windows)
7. [State Management](#7-state-management)
8. [Checkpointing](#8-checkpointing)
9. [Table API & Flink SQL](#9-table-api--flink-sql)
10. [Flink vs Spark Comparison](#10-flink-vs-spark-comparison)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Quick Reference](#12-quick-reference)

---

## 1. Overview

Apache Flink is a framework for **stateful computations over data streams**. It treats
batch as a special case of streaming (bounded streams), providing a single engine for both.

**Key differentiators:**
- True stream processing (not micro-batch)
- Event-time processing with watermarks
- Exactly-once state consistency via checkpointing
- Millisecond latency
- Scalable to thousands of nodes

**Flink 2.0 (March 2025)**: Disaggregated state management for cloud-native environments.
**Flink 2.2**: ML_PREDICT for LLM inference, VECTOR_SEARCH for real-time similarity.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│                    FLINK CLUSTER                      │
│                                                       │
│  ┌─────────────────┐                                  │
│  │   JOB MANAGER   │  Coordinates execution           │
│  │  ┌────────────┐ │  Schedules tasks                 │
│  │  │ Dispatcher │ │  Manages checkpoints              │
│  │  │ ResourceMgr│ │  Handles failure recovery         │
│  │  │ JobMaster  │ │                                   │
│  │  └────────────┘ │                                   │
│  └────────┬────────┘                                  │
│           │                                            │
│   ┌───────┴───────┬───────────────┐                    │
│   ▼               ▼               ▼                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │TASK MGR │  │TASK MGR │  │TASK MGR │               │
│  │┌──┬──┐  │  │┌──┬──┐  │  │┌──┬──┐  │               │
│  ││S1│S2│  │  ││S3│S4│  │  ││S5│S6│  │               │
│  │└──┴──┘  │  │└──┴──┘  │  │└──┴──┘  │               │
│  │  Slots  │  │  Slots  │  │  Slots  │               │
│  └─────────┘  └─────────┘  └─────────┘               │
└──────────────────────────────────────────────────────┘
```

**JobManager**: Central coordinator -- dispatches jobs, manages resources, coordinates checkpoints.
**TaskManagers**: Worker processes with fixed number of **task slots** (unit of parallelism).
**Slots**: Each slot runs one parallel slice of the operator pipeline.

---

## 3. DataStream API

```java
// Java example
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

DataStream<String> stream = env.addSource(new FlinkKafkaConsumer<>(...));

stream
    .map(value -> parseEvent(value))
    .keyBy(event -> event.getUserId())
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .aggregate(new CountAggregator())
    .addSink(new FlinkKafkaProducer<>(...));

env.execute("Event Processing Job");
```

**Source → Transformation → Sink** pipeline:
- **Sources**: Kafka, files, sockets, custom
- **Transformations**: map, flatMap, filter, keyBy, window, reduce, aggregate, process
- **Sinks**: Kafka, JDBC, files, Elasticsearch, custom

---

## 4. Time Semantics

| Time Type | Definition | Deterministic | Late Data | Use Case |
|-----------|-----------|---------------|-----------|----------|
| **Event Time** | When event occurred (in data) | Yes | Handled via watermarks | Correct results on out-of-order data |
| **Processing Time** | System clock when processed | No | Cannot handle | Lowest latency, simplest |
| **Ingestion Time** | When event enters Flink | Partially | Limited | Middle ground |

### Event Time Is Almost Always Preferred

```java
env.setStreamTimeCharacteristic(TimeCharacteristic.EventTime);
```

Event time gives **correct, reproducible results** regardless of processing delays,
reprocessing, or out-of-order arrival. The cost is added complexity (watermarks).

---

## 5. Watermarks

A watermark with timestamp `t` asserts: **all events with timestamps < t have arrived**.

```
Event Stream:    [3] [1] [5] [2] [W:5] [7] [4] [W:7] [8]
                                   ↑                ↑
                              Watermark=5      Watermark=7
                              (events <5        (events <7
                               are complete)     are complete)
```

### BoundedOutOfOrderness

The most common watermark strategy:

```java
WatermarkStrategy
    .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
    .withTimestampAssigner((event, timestamp) -> event.getTimestamp());
```

Events arriving more than 5 seconds after the watermark are considered **late**.

### Handling Late Data

```java
// Side output for late events
OutputTag<Event> lateTag = new OutputTag<Event>("late-events"){};

SingleOutputStreamOperator<Result> result = stream
    .keyBy(...)
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .allowedLateness(Time.minutes(1))     // Allow 1 min late
    .sideOutputLateData(lateTag)          // Capture later ones
    .aggregate(...);

DataStream<Event> lateStream = result.getSideOutput(lateTag);
```

---

## 6. Windows

### Window Types

```
TUMBLING (fixed, non-overlapping)
|----5min----|----5min----|----5min----|
|  window 1  |  window 2  |  window 3  |

SLIDING (fixed, overlapping)
|--------10min--------|
     |--------10min--------|
          |--------10min--------|
(slide = 5min)

SESSION (dynamic, activity-based)
|--events--|  gap  |--events--|  gap  |--events--|
| session 1|       | session 2|       | session 3|

GLOBAL (all events in one window)
|------------------------all events------------------------|
(requires custom trigger)
```

### Configuration

```java
// Tumbling: 5-minute windows
.window(TumblingEventTimeWindows.of(Time.minutes(5)))

// Sliding: 10-minute windows, sliding every 5 minutes
.window(SlidingEventTimeWindows.of(Time.minutes(10), Time.minutes(5)))

// Session: 30-minute inactivity gap
.window(EventTimeSessionWindows.withGap(Time.minutes(30)))
```

### Triggers & Evictors

**Triggers** control when a window function fires (default: watermark passes window end).
**Evictors** optionally remove elements from the window before/after firing.

---

## 7. State Management

### Keyed State

Partitioned by key -- access restricted to current event's key.

| State Type | Description | Use Case |
|-----------|-------------|----------|
| `ValueState<T>` | Single value | Running count, latest value |
| `ListState<T>` | List of values | Event buffer, history |
| `MapState<K,V>` | Key-value pairs | Lookup tables per key |
| `ReducingState<T>` | Auto-reducing | Running aggregations |
| `AggregatingState<IN,OUT>` | Custom aggregation | Complex aggregations |

```java
public class CountFunction extends KeyedProcessFunction<String, Event, Result> {
    private ValueState<Long> countState;

    @Override
    public void open(Configuration parameters) {
        countState = getRuntimeContext().getState(
            new ValueStateDescriptor<>("count", Long.class));
    }

    @Override
    public void processElement(Event event, Context ctx, Collector<Result> out) throws Exception {
        Long count = countState.value();
        count = (count == null) ? 1L : count + 1;
        countState.update(count);
        out.collect(new Result(event.getKey(), count));
    }
}
```

### State Backends

| Backend | Storage | Size Limit | Performance | Use Case |
|---------|---------|-----------|-------------|----------|
| **HashMapStateBackend** | JVM heap | Limited by RAM | Fastest | Small state |
| **EmbeddedRocksDBStateBackend** | Disk + memory | Terabytes | Slower (serialization) | Large state |

### Disaggregated State (Flink 2.0)

Separates state storage from compute for cloud-native deployments. State stored in
remote object storage, with local caching. Achieves 75-120% throughput of local backends.

---

## 8. Checkpointing

### Chandy-Lamport Algorithm

Flink uses a variant of the Chandy-Lamport algorithm for consistent distributed snapshots.

```
Source 1 ──[barrier]──> Op A ──[barrier]──> Sink 1
Source 2 ──[barrier]──> Op B ──[barrier]──> Sink 2

1. JobManager injects checkpoint barriers at sources
2. Barriers flow downstream with data
3. When operator receives barriers from ALL inputs:
   a. Snapshot operator state
   b. Forward barrier downstream
4. When all sinks acknowledge → checkpoint complete
```

### Barrier Alignment

```
Input 1: ──data──|barrier|──data──
Input 2: ──data──data──|barrier|──

Operator waits for barrier from ALL inputs before snapshotting.
Data from input 1 arriving after its barrier is buffered
until input 2's barrier arrives.
```

### Unaligned Checkpoints

Skip barrier alignment -- checkpoint in-flight data along with state. Much faster under
backpressure. Trade-off: larger checkpoint size.

### Configuration

```java
env.enableCheckpointing(60000);  // Every 60 seconds
env.getCheckpointConfig().setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
env.getCheckpointConfig().setMinPauseBetweenCheckpoints(30000);
env.getCheckpointConfig().setTolerableCheckpointFailureNumber(3);
```

### Savepoints

Manually-triggered checkpoints for operational tasks:
- Application upgrades
- Flink version upgrades
- A/B testing
- Rescaling parallelism
- Migration between clusters

### Exactly-Once Guarantees

**Internal exactly-once**: Checkpointing ensures state consistency.
**End-to-end exactly-once**: Requires source replay + sink two-phase commit.
Kafka sink supports this via transactional producer coordinated with Flink checkpoints.

---

## 9. Table API & Flink SQL

```sql
-- Flink SQL on streaming data
CREATE TABLE orders (
    order_id BIGINT,
    product STRING,
    amount DECIMAL(10,2),
    order_time TIMESTAMP(3),
    WATERMARK FOR order_time AS order_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'orders',
    'format' = 'json'
);

SELECT
    TUMBLE_START(order_time, INTERVAL '1' HOUR) AS window_start,
    product,
    SUM(amount) AS total_amount,
    COUNT(*) AS order_count
FROM orders
GROUP BY
    TUMBLE(order_time, INTERVAL '1' HOUR),
    product;
```

**Dynamic Tables**: Tables that change over time. Streams and tables are dual concepts --
a stream can be converted to a table and vice versa.

---

## 10. Flink vs Spark Comparison

| Aspect | Apache Flink | Apache Spark |
|--------|-------------|--------------|
| **Processing Model** | True streaming | Micro-batch (default) |
| **Latency** | Milliseconds | ~100ms (micro-batch) |
| **State Management** | First-class, built-in | Limited (stateful operators) |
| **Exactly-Once** | Native (Chandy-Lamport) | Checkpoint-based |
| **Windowing** | Rich (tumbling, sliding, session, global) | Basic (tumbling, sliding) |
| **Watermarks** | Native, flexible | Supported in Structured Streaming |
| **Batch Processing** | Streaming engine handles batch | Native, optimized |
| **SQL Support** | Flink SQL (dynamic tables) | Spark SQL (mature, extensive) |
| **Ecosystem** | Growing | Massive (MLlib, GraphX, etc.) |
| **Adoption** | Strong in streaming-first orgs | Dominant in batch + ML |
| **Learning Curve** | Steeper | Gentler |
| **Best For** | Real-time streaming, CEP | Batch processing, ML, SQL analytics |

**When to choose Flink**: Millisecond-latency requirements, complex event processing,
large stateful streaming, event-time processing is critical.

**When to choose Spark**: Batch-heavy workloads, ML pipelines, SQL analytics,
larger ecosystem needs, team familiarity.

---

## 11. Common Interview Questions

**Q: How does Flink achieve exactly-once processing?**
Through checkpointing (Chandy-Lamport algorithm). Barriers flow through the stream; operators snapshot state when all barriers arrive. For end-to-end exactly-once, requires replayable sources and transactional sinks (e.g., Kafka two-phase commit).

**Q: What is the difference between event time and processing time?**
Event time is when the event occurred (embedded in data), giving deterministic results. Processing time is the system clock, simpler but non-deterministic. Event time is preferred for correctness.

**Q: How do watermarks work?**
Watermarks assert that all events before timestamp t have arrived. They flow through the stream like special markers. Late events (after watermark) can be handled via allowed lateness or side outputs.

**Q: Compare tumbling, sliding, and session windows.**
Tumbling: fixed-size, non-overlapping. Sliding: fixed-size, overlapping (size + slide). Session: dynamic, based on activity gaps. Global: all events, custom trigger.

**Q: What are state backends and when would you use RocksDB?**
HashMapStateBackend stores state in JVM heap (fast, limited by RAM). EmbeddedRocksDBStateBackend stores on disk (slower but handles terabytes). Use RocksDB when state exceeds available memory.

**Q: What is the difference between aligned and unaligned checkpoints?**
Aligned: operator waits for barriers from all inputs before snapshotting (can add latency under backpressure). Unaligned: checkpoints in-flight data too, faster under backpressure but larger checkpoint size.

**Q: How does Flink differ from Spark Streaming?**
Flink is true streaming (processes events individually). Spark Structured Streaming uses micro-batches (~100ms granularity). Flink has richer windowing, native watermarks, and first-class state management.

**Q: What are savepoints and how do they differ from checkpoints?**
Both are consistent snapshots. Checkpoints are automatic, periodic, used for failure recovery. Savepoints are manual, used for operational tasks (upgrades, rescaling, migration).

---

## 12. Quick Reference

### Key Concepts

| Concept | Description |
|---------|-------------|
| Watermark | Assertion that events before timestamp t have arrived |
| Checkpoint | Automatic distributed snapshot for fault tolerance |
| Savepoint | Manual snapshot for operational tasks |
| Keyed State | State partitioned by key (ValueState, MapState, etc.) |
| Event Time | Time when event occurred (in the data) |
| Barrier | Marker injected into stream for checkpoint coordination |

### Checkpointing Config

```java
env.enableCheckpointing(60000);
env.getCheckpointConfig().setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
env.getCheckpointConfig().setCheckpointStorage("s3://bucket/checkpoints");
```
