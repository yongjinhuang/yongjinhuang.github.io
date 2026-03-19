# Event-Driven Architecture & Message Queues

## Introduction

Event-driven architecture (EDA) has become the dominant paradigm for building scalable, decoupled backend systems in 2026. Understanding EDA is no longer optional -- it is foundational to modern backend engineering. From microservice communication to real-time analytics pipelines, events are the connective tissue of distributed systems.

This guide goes deep on the patterns, platforms, and pitfalls. We cover not just the "what" but the "why" and "when" -- the architectural trade-offs that interviewers probe to separate senior engineers from those who have only read the Kafka quickstart.

---

## Event-Driven Patterns Taxonomy

Before diving into tools, understand the four fundamental patterns:

```
+------------------------------------------------------------------+
|           EVENT-DRIVEN PATTERNS SPECTRUM                          |
+------------------------------------------------------------------+
|                                                                  |
|  SIMPLE                                            COMPLEX       |
|  <------------------------------------------------------->      |
|                                                                  |
|  1. Event         2. Event-Carried    3. Event        4. CQRS   |
|     Notification     State Transfer      Sourcing                |
|                                                                  |
|  "Something        "Here is what      "Record every   "Separate |
|   happened"         changed"           state change"   read and  |
|                                                        write"    |
|                                                                  |
|  Low coupling      Medium coupling    High complexity  Highest   |
|  Receiver must     Receiver is        Full audit trail complexity|
|  query back        self-sufficient    Temporal queries Optimized |
|                                                        reads     |
+------------------------------------------------------------------+
```

### Pattern 1: Event Notification

The simplest pattern. A service emits a lightweight notification that something happened. Consumers must call back to the source for details.

```
+----------+    { "type": "order.created",    +----------+
|  Orders  | -->   "orderId": "abc-123" }  --> | Shipping |
|  Service |                                   | Service  |
+----------+                                   +----+-----+
                                                    |
                                          GET /orders/abc-123
                                                    |
                                               +----v-----+
                                               |  Orders  |
                                               |   API    |
                                               +----------+
```

**Pros**: Minimal coupling, small message size, source is authority.
**Cons**: Temporal coupling (receiver needs source to be available), N+1 query problem at scale.

### Pattern 2: Event-Carried State Transfer

The event contains all the data the consumer needs. No callback required.

```typescript
// Event-carried state transfer: the event IS the data
interface OrderCreatedEvent {
  type: 'order.created';
  timestamp: string;
  data: {
    orderId: string;
    customerId: string;
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    shippingAddress: {
      street: string;
      city: string;
      country: string;
      postalCode: string;
    };
    totalAmount: number;
    currency: string;
  };
}
```

**Pros**: No temporal coupling, consumers build local caches, resilient to source outages.
**Cons**: Larger messages, data duplication across services, eventual consistency.

### Pattern 3: Event Sourcing

Instead of storing current state, store the sequence of events that led to the current state. The event log IS the source of truth.

```
+------------------------------------------------------------------+
|              EVENT SOURCING MODEL                                 |
+------------------------------------------------------------------+
|                                                                  |
|  Traditional (State):                                            |
|  +------------------+                                            |
|  | Account #12345   |  <-- Only current state                   |
|  | Balance: $500    |                                            |
|  | Status: Active   |                                            |
|  +------------------+                                            |
|                                                                  |
|  Event Sourced:                                                  |
|  +------------------+------------------+------------------+      |
|  | AccountCreated   | MoneyDeposited   | MoneyWithdrawn   |      |
|  | id: 12345        | amount: $1000    | amount: $500     |      |
|  | owner: "Alice"   | balance: $1000   | balance: $500    |      |
|  | time: T1         | time: T2         | time: T3         |      |
|  +------------------+------------------+------------------+      |
|                                                                  |
|  Current state = fold(events) = $500                             |
|  State at T2   = fold(events[0..1]) = $1000                     |
|                                                                  |
+------------------------------------------------------------------+
```

### Pattern 4: CQRS (Command Query Responsibility Segregation)

Separate the write model (commands) from the read model (queries). Often combined with event sourcing.

```
+------------------------------------------------------------------+
|                    CQRS ARCHITECTURE                              |
+------------------------------------------------------------------+
|                                                                  |
|  WRITE SIDE                        READ SIDE                     |
|  +-------------+                   +-------------+               |
|  | Command API |                   | Query API   |               |
|  +------+------+                   +------+------+               |
|         |                                 |                      |
|  +------v------+                   +------v------+               |
|  | Command     |                   | Read Model  |               |
|  | Handler     |                   | (Denormalized|              |
|  +------+------+                   |  Projections)|              |
|         |                          +------^------+               |
|  +------v------+                          |                      |
|  | Domain      |    Events         +------+------+               |
|  | Model       +---publish-------->| Projection  |               |
|  +------+------+                   | Builder     |               |
|         |                          +-------------+               |
|  +------v------+                                                 |
|  | Event Store |                                                 |
|  +-------------+                                                 |
|                                                                  |
|  Optimized for     Eventual         Optimized for                |
|  consistency       consistency       query performance            |
|                                                                  |
+------------------------------------------------------------------+
```

**When to use CQRS:**

- Read and write patterns differ dramatically (e.g., 1000:1 read-to-write ratio)
- You need different data models for reading vs writing
- You need to scale reads and writes independently

**When NOT to use CQRS:**

- Simple CRUD applications
- Tight consistency requirements
- Small team that cannot maintain two models

---

## Apache Kafka Deep Dive

### Architecture

Kafka is the backbone of most production event-driven systems. Understanding its internals is essential.

```
+------------------------------------------------------------------+
|                    KAFKA ARCHITECTURE                              |
+------------------------------------------------------------------+
|                                                                  |
|  PRODUCERS                    KAFKA CLUSTER                      |
|  +--------+                   +----------------------------+     |
|  |Producer|--+                | BROKER 1       BROKER 2    |     |
|  +--------+  |                | +---------+  +---------+   |     |
|  +--------+  |   Produce      | |Topic A  |  |Topic A  |   |     |
|  |Producer|--+--------------->| |Part 0*  |  |Part 1*  |   |     |
|  +--------+  |                | |Part 1(r)|  |Part 0(r)|   |     |
|  +--------+  |                | +---------+  +---------+   |     |
|  |Producer|--+                |                            |     |
|  +--------+                   | BROKER 3                   |     |
|                               | +---------+                |     |
|                               | |Topic A  |                |     |
|                               | |Part 0(r)|                |     |
|                               | |Part 1(r)|                |     |
|                               | +---------+                |     |
|                               +----------------------------+     |
|                                         |                        |
|  CONSUMERS                              |                        |
|  +------------------+                   |                        |
|  | Consumer Group 1 |<-- Consume -------+                        |
|  | +------+ +------+|                                            |
|  | |C1    | |C2    ||  C1 reads Part 0                           |
|  | |Part 0| |Part 1||  C2 reads Part 1                           |
|  | +------+ +------+|                                            |
|  +------------------+                                            |
|  +------------------+                                            |
|  | Consumer Group 2 |<-- Independent consumption                 |
|  | +------+         |                                            |
|  | |C1    |         |  Single consumer reads all partitions      |
|  | |P0+P1 |         |                                            |
|  | +------+         |                                            |
|  +------------------+                                            |
|                                                                  |
|  * = Partition Leader    (r) = Replica (follower)                |
+------------------------------------------------------------------+
```

**Key concepts:**

- **Topic**: A named stream of records, analogous to a table in a database
- **Partition**: A topic is split into partitions for parallelism. Each partition is an ordered, immutable log
- **Consumer Group**: A group of consumers that cooperatively consume from a topic. Each partition is assigned to exactly one consumer within the group
- **Replication Factor**: Each partition is replicated across N brokers for durability. One replica is the leader; others are followers (ISR = In-Sync Replicas)

### ZooKeeper vs KRaft

```
+------------------------------------------------------------------+
|              KAFKA METADATA MANAGEMENT                            |
+------------------------------------------------------------------+
|                                                                  |
|  LEGACY (ZooKeeper):                 MODERN (KRaft, 2023+):     |
|  +----------+   +----------+         +----------+                |
|  | ZooKeeper|   | ZooKeeper|         | Broker 1 |                |
|  | Node 1   |   | Node 2   |         | (Controller|              |
|  +----+-----+   +----+-----+         |  + Broker) |              |
|       |              |                +----------+                |
|       +------+-------+               +----------+                |
|              |                        | Broker 2 |                |
|  +---+---+---+---+---+---+           | (Controller|              |
|  | B1  | | B2  | | B3  |             |  + Broker) |              |
|  +-----+ +-----+ +-----+             +----------+                |
|                                       +----------+                |
|  Problems:                            | Broker 3 |                |
|  - Separate system to manage          | (Broker   |              |
|  - Scaling limits (~200K partitions)  |  only)    |              |
|  - Slow controller failover           +----------+                |
|  - Complex operations                                            |
|                                       Benefits:                  |
|                                       - Single system            |
|                                       - Millions of partitions   |
|                                       - Fast failover (seconds)  |
|                                       - Raft-based consensus     |
|                                                                  |
+------------------------------------------------------------------+
```

KRaft (Kafka Raft) replaced ZooKeeper starting in Kafka 3.3+ and is the only supported mode as of Kafka 4.0 (2024). In KRaft, a subset of brokers act as **controllers** that manage cluster metadata using the Raft consensus protocol. This eliminates the operational burden of ZooKeeper and removes the partition count ceiling.

### Exactly-Once Semantics (EOS)

This is a common interview deep-dive. Kafka achieves exactly-once through two mechanisms:

```
+------------------------------------------------------------------+
|              EXACTLY-ONCE SEMANTICS                               |
+------------------------------------------------------------------+
|                                                                  |
|  1. IDEMPOTENT PRODUCER (within a single partition)              |
|                                                                  |
|  Producer assigns sequence numbers to each message.              |
|  Broker deduplicates by (ProducerID, PartitionID, SeqNum).       |
|                                                                  |
|  Producer                    Broker                              |
|  | -- msg(seq=1) -----------> | Accepted                        |
|  | -- msg(seq=2) -----------> | Accepted                        |
|  | -- msg(seq=2) -----------> | Duplicate, ignored               |
|  | -- msg(seq=4) -----------> | OutOfOrderSequence error         |
|                                                                  |
|  2. TRANSACTIONS (across partitions and topics)                  |
|                                                                  |
|  Producer       Transaction       Broker                         |
|  |              Coordinator       |                              |
|  |-- beginTx -------->|          |                               |
|  |-- produce(topicA) ----------->|  Msg written but not visible  |
|  |-- produce(topicB) ----------->|  Msg written but not visible  |
|  |-- commitTx -------->|         |                               |
|  |              |-- commit ------>|  All msgs now visible         |
|  |              |                 |  (read_committed consumers)   |
|                                                                  |
|  Consumer setting: isolation.level = "read_committed"            |
|  Only sees messages from committed transactions.                 |
|                                                                  |
+------------------------------------------------------------------+
```

### Compacted Topics

Log compaction retains only the latest value for each key, making topics function like a key-value store:

```
BEFORE COMPACTION:
  Offset: 0    1    2    3    4    5    6    7
  Key:    A    B    A    C    B    A    C    B
  Value:  v1   v1   v2   v1   v2   v3   v2   v3

AFTER COMPACTION:
  Offset: 5    6    7
  Key:    A    C    B
  Value:  v3   v2   v3

  (Latest value for each key is retained)
```

**Use cases**: CDC (change data capture), materialized views, configuration distribution, user profile caches.

### Schema Registry and Schema Evolution

```
+------------------------------------------------------------------+
|              SCHEMA REGISTRY ARCHITECTURE                         |
+------------------------------------------------------------------+
|                                                                  |
|  Producer                Schema Registry           Consumer      |
|  +--------+              +-------------+           +--------+    |
|  |Serialize|-- register ->| Schema Store|<- lookup -|Deserialize|
|  |with     |  schema     | (Avro/Proto/ |  schema  |with     |  |
|  |schema ID|             |  JSON Schema)|          |schema ID|  |
|  +----+----+              +-------------+           +----+----+  |
|       |                                                  |       |
|  [schemaId|payload] -----> Kafka Topic ----> [schemaId|payload]  |
|                                                                  |
|  COMPATIBILITY MODES:                                            |
|  +------------------+------------------------------------------+ |
|  | BACKWARD         | New schema can read old data             | |
|  | FORWARD          | Old schema can read new data             | |
|  | FULL             | Both backward and forward                | |
|  | BACKWARD_TRANS.  | Backward across all versions             | |
|  | FORWARD_TRANS.   | Forward across all versions              | |
|  | FULL_TRANSITIVE  | Full across all versions                 | |
|  | NONE             | No compatibility checking                | |
|  +------------------+------------------------------------------+ |
|                                                                  |
|  SAFE SCHEMA CHANGES:                                            |
|  - Add optional field (backward compatible)                      |
|  - Add field with default (backward compatible)                  |
|  - Remove optional field (forward compatible)                    |
|  - NEVER rename or change field types                            |
|                                                                  |
+------------------------------------------------------------------+
```

### Kafka Producer/Consumer in TypeScript

```typescript
import { Kafka, Partitioners, logLevel } from 'kafkajs';

// ── Kafka Client Setup ──────────────────────────────────────
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['kafka-1:9092', 'kafka-2:9092', 'kafka-3:9092'],
  logLevel: logLevel.WARN,
  ssl: true,
  sasl: {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_USERNAME!,
    password: process.env.KAFKA_PASSWORD!,
  },
  retry: {
    initialRetryTime: 100,
    retries: 8,
    maxRetryTime: 30000,
  },
});

// ── Producer with Exactly-Once ──────────────────────────────
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  idempotent: true, // Enable idempotent producer
  transactionalId: 'order-service-tx', // Enable transactions
  maxInFlightRequests: 5,
});

async function publishOrderEvent(order: Order): Promise<void> {
  const transaction = await producer.transaction();

  try {
    // Publish to orders topic
    await transaction.send({
      topic: 'orders',
      messages: [
        {
          key: order.id,
          value: JSON.stringify({
            type: 'order.created',
            timestamp: new Date().toISOString(),
            data: order,
          }),
          headers: {
            'correlation-id': order.correlationId,
            'content-type': 'application/json',
          },
        },
      ],
    });

    // Publish to analytics topic in the same transaction
    await transaction.send({
      topic: 'order-analytics',
      messages: [
        {
          key: order.customerId,
          value: JSON.stringify({
            type: 'order.metric',
            amount: order.totalAmount,
            region: order.region,
          }),
        },
      ],
    });

    await transaction.commit();
  } catch (error) {
    await transaction.abort();
    throw new Error(`Failed to publish order event: ${error}`);
  }
}

// ── Consumer with Consumer Group ────────────────────────────
const consumer = kafka.consumer({
  groupId: 'shipping-service',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576, // 1MB
  readUncommitted: false, // Only read committed messages (EOS)
});

async function startConsumer(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({
    topics: ['orders'],
    fromBeginning: false,
  });

  await consumer.run({
    autoCommit: false, // Manual commit for at-least-once guarantee
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      const event = JSON.parse(message.value!.toString());

      try {
        // Process with idempotency check
        const processed = await isAlreadyProcessed(
          message.headers?.['correlation-id']?.toString()
        );

        if (!processed) {
          await handleOrderCreated(event.data);
          await markAsProcessed(
            message.headers?.['correlation-id']?.toString()
          );
        }

        // Manual offset commit after successful processing
        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);

        // Keep heartbeat alive for long-running processing
        await heartbeat();
      } catch (error) {
        // Don't commit offset -- message will be redelivered
        console.error(`Failed to process message: ${error}`);
        // Optionally publish to dead letter topic
        await publishToDeadLetter(topic, message, error);
      }
    },
  });
}
```

---

## Modern Alternatives to Kafka

### NATS and JetStream

```
+------------------------------------------------------------------+
|                    NATS ECOSYSTEM                                  |
+------------------------------------------------------------------+
|                                                                  |
|  CORE NATS (Fire-and-forget)                                     |
|  +-----------------------------------------------------------+  |
|  | - At-most-once delivery                                    |  |
|  | - Subject-based routing (orders.*, orders.region.us)       |  |
|  | - Request/Reply pattern built-in                           |  |
|  | - Extremely low latency (<1ms)                             |  |
|  | - No persistence -- pure pub/sub                           |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  JETSTREAM (Persistent streaming, built on Core NATS)            |
|  +-----------------------------------------------------------+  |
|  | - At-least-once and exactly-once delivery                  |  |
|  | - Streams: ordered, persistent message storage             |  |
|  | - Consumers: pull-based or push-based subscription         |  |
|  | - Key-Value store (built on streams)                       |  |
|  | - Object store (large blobs)                               |  |
|  | - Deduplication via message IDs                            |  |
|  | - Retention: limits, interest, work-queue                  |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  WHEN TO CHOOSE:                                                 |
|  +------------------+-------------------+---------------------+  |
|  |                  | NATS JetStream    | Kafka               |  |
|  +------------------+-------------------+---------------------+  |
|  | Operations       | Single binary     | Complex (brokers,   |  |
|  |                  | Zero config       | Schema Registry,    |  |
|  |                  |                   | Connect, etc.)      |  |
|  | Latency          | Sub-millisecond   | Single-digit ms     |  |
|  | Throughput       | Good (millions/s) | Excellent (billions)|  |
|  | Ecosystem        | Growing           | Massive             |  |
|  | Ordering         | Per-stream        | Per-partition        |  |
|  | Replay           | Yes               | Yes                 |  |
|  | Best for         | Cloud-native,     | Data pipelines,     |  |
|  |                  | microservices     | event sourcing,     |  |
|  |                  |                   | analytics           |  |
|  +------------------+-------------------+---------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

### Redis Streams

Redis Streams provide a lightweight message queue with consumer groups, built into Redis:

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Produce
async function publishEvent(stream: string, event: Record<string, string>) {
  const id = await redis.xadd(stream, '*', ...Object.entries(event).flat());
  return id;
}

// Consume with consumer group
async function consumeEvents(stream: string, group: string, consumer: string) {
  // Create consumer group (idempotent with MKSTREAM)
  try {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
  } catch {
    // Group already exists
  }

  while (true) {
    const results = await redis.xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      '10',
      'BLOCK',
      '5000',
      'STREAMS',
      stream,
      '>'
    );

    if (results) {
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          await processMessage(fields);
          await redis.xack(stream, group, id);
        }
      }
    }
  }
}
```

**Redis Streams vs Kafka**: Redis Streams work well for moderate throughput (<100K msg/s), when you already have Redis in your stack, and for simpler use cases. Kafka wins for high-throughput data pipelines, long-term retention, and complex stream processing.

### Amazon EventBridge & CloudEvents

**EventBridge** is AWS's serverless event bus -- zero infrastructure, pay-per-event, with built-in schema discovery and content-based routing. Ideal for AWS-native architectures.

**CloudEvents** is a CNCF specification for describing events in a common format:

```json
{
  "specversion": "1.0",
  "type": "com.example.order.created",
  "source": "/orders/service",
  "id": "A234-1234-1234",
  "time": "2026-01-15T17:31:00Z",
  "datacontenttype": "application/json",
  "data": {
    "orderId": "abc-123",
    "amount": 49.99
  }
}
```

CloudEvents provides interoperability across event systems -- the same event format works across Kafka, NATS, HTTP, and cloud event buses.

---

## Message Queue Patterns

### Dead Letter Queues and Retry

```
+------------------------------------------------------------------+
|              RETRY WITH DEAD LETTER QUEUE                         |
+------------------------------------------------------------------+
|                                                                  |
|  Main Queue          Retry Logic            Dead Letter Queue    |
|  +---------+         +------------+          +---------+         |
|  | Message |-------->| Attempt 1  |          |         |         |
|  +---------+    fail | Wait 1s    |          |         |         |
|                      | Attempt 2  |          |         |         |
|                 fail | Wait 4s    |          |         |         |
|                      | Attempt 3  |          |         |         |
|                 fail | Wait 16s   |          |         |         |
|                      | Attempt 4  |          |         |         |
|                 fail | Wait 64s   |          |         |         |
|                      | Attempt 5  |  fail    |         |         |
|                      +-----+------+--------->| Message |         |
|                            |                 | + error |         |
|                        success               | + meta  |         |
|                            |                 +---------+         |
|                            v                      |              |
|                       Processing                  v              |
|                       Complete              Manual review         |
|                                             or alerting          |
|                                                                  |
|  Backoff: delay = baseDelay * 2^(attempt-1) * (1 + jitter)      |
|  Jitter prevents thundering herd when many messages fail         |
|                                                                  |
+------------------------------------------------------------------+
```

```typescript
interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterFactor: number;
}

function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = clampedDelay * config.jitterFactor * Math.random();
  return clampedDelay + jitter;
}

async function processWithRetry<T>(
  handler: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await handler();
    } catch (error) {
      if (attempt === config.maxRetries) {
        throw new Error(`Exhausted ${config.maxRetries} retries: ${error}`);
      }
      const delay = calculateBackoff(attempt, config);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
```

### The Outbox Pattern

The outbox pattern solves the dual-write problem: how do you atomically update a database AND publish an event? You cannot -- unless you make the event part of the database transaction.

```
+------------------------------------------------------------------+
|              OUTBOX PATTERN                                        |
+------------------------------------------------------------------+
|                                                                  |
|  THE PROBLEM (Dual Write):                                       |
|                                                                  |
|  Service                                                         |
|  | 1. INSERT INTO orders (...) -- succeeds                       |
|  | 2. kafka.produce("order.created") -- FAILS!                   |
|  |    Database has order, but no event published.                |
|  |    System is now inconsistent.                                |
|                                                                  |
|  THE SOLUTION (Outbox):                                          |
|                                                                  |
|  Service              Database              Message Relay         |
|  |                    +----------+          +----------+          |
|  | BEGIN TX           |          |          |          |          |
|  | INSERT orders ---->| orders   |          |          |          |
|  | INSERT outbox ---->| outbox   |          |          |          |
|  | COMMIT TX          |          |          |          |          |
|  |                    +-----+----+          |          |          |
|  |                          |               |          |          |
|  |                    Poll/CDC (Debezium)    |          |          |
|  |                          +-------------->| Publish  |          |
|  |                                          | to Kafka |          |
|  |                                          +----------+          |
|                                                                  |
+------------------------------------------------------------------+
```

```sql
-- Outbox table schema
CREATE TABLE outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(255) NOT NULL,   -- e.g., 'Order'
  aggregate_id   VARCHAR(255) NOT NULL,   -- e.g., order ID
  event_type     VARCHAR(255) NOT NULL,   -- e.g., 'order.created'
  payload        JSONB NOT NULL,          -- event data
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,            -- NULL until published
  retry_count    INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished
  ON outbox (created_at)
  WHERE published_at IS NULL;
```

```typescript
// Transactional outbox write
async function createOrder(
  tx: Transaction,
  orderData: CreateOrderInput
): Promise<Order> {
  // 1. Write the business entity
  const order = await tx.query(
    `INSERT INTO orders (customer_id, total_amount, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [orderData.customerId, orderData.totalAmount]
  );

  // 2. Write the event to the outbox (same transaction)
  await tx.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [
      'Order',
      order.rows[0].id,
      'order.created',
      JSON.stringify({
        orderId: order.rows[0].id,
        customerId: orderData.customerId,
        totalAmount: orderData.totalAmount,
        items: orderData.items,
      }),
    ]
  );

  return order.rows[0];
}

// Outbox relay (polling approach)
async function outboxRelay(producer: KafkaProducer): Promise<void> {
  const unpublished = await db.query(
    `SELECT * FROM outbox
     WHERE published_at IS NULL
     ORDER BY created_at ASC
     LIMIT 100
     FOR UPDATE SKIP LOCKED`
  );

  for (const event of unpublished.rows) {
    await producer.send({
      topic: `${event.aggregate_type.toLowerCase()}.events`,
      messages: [
        {
          key: event.aggregate_id,
          value: JSON.stringify({
            type: event.event_type,
            aggregateId: event.aggregate_id,
            payload: event.payload,
            timestamp: event.created_at,
          }),
        },
      ],
    });

    await db.query(`UPDATE outbox SET published_at = NOW() WHERE id = $1`, [
      event.id,
    ]);
  }
}
```

### Idempotency Keys

Every consumer must be idempotent -- processing the same message twice must produce the same result.

```typescript
// Idempotency store (Redis-backed)
async function ensureIdempotent(
  idempotencyKey: string,
  handler: () => Promise<void>
): Promise<void> {
  // Try to acquire the idempotency lock
  const acquired = await redis.set(
    `idempotency:${idempotencyKey}`,
    'processing',
    'EX',
    3600, // 1-hour TTL
    'NX' // Only set if not exists
  );

  if (!acquired) {
    // Already processed or in progress
    return;
  }

  try {
    await handler();
    await redis.set(
      `idempotency:${idempotencyKey}`,
      'completed',
      'EX',
      86400 // Keep for 24 hours
    );
  } catch (error) {
    // Remove key so message can be retried
    await redis.del(`idempotency:${idempotencyKey}`);
    throw error;
  }
}
```

---

## Event Sourcing Deep Dive

### Event Store Design

```
+------------------------------------------------------------------+
|              EVENT STORE SCHEMA                                    |
+------------------------------------------------------------------+
|                                                                  |
|  events table:                                                   |
|  +----------------+----------------+---------------------------+ |
|  | Column         | Type           | Purpose                   | |
|  +----------------+----------------+---------------------------+ |
|  | event_id       | UUID           | Globally unique ID        | |
|  | stream_id      | VARCHAR        | Aggregate identifier      | |
|  | stream_version | INT            | Sequence within stream    | |
|  | event_type     | VARCHAR        | e.g., 'AccountDebited'    | |
|  | data           | JSONB          | Event payload             | |
|  | metadata       | JSONB          | Correlation ID, user, etc | |
|  | created_at     | TIMESTAMPTZ    | Event timestamp           | |
|  +----------------+----------------+---------------------------+ |
|  UNIQUE(stream_id, stream_version) -- Optimistic concurrency    |
|                                                                  |
|  snapshots table:                                                |
|  +----------------+----------------+---------------------------+ |
|  | stream_id      | VARCHAR        | Same aggregate ID         | |
|  | version        | INT            | Version at snapshot time  | |
|  | state          | JSONB          | Serialized aggregate state| |
|  | created_at     | TIMESTAMPTZ    | Snapshot timestamp        | |
|  +----------------+----------------+---------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### Event Sourcing Implementation

```typescript
// ── Domain Events ───────────────────────────────────────────
interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly streamId: string;
  readonly data: Record<string, unknown>;
  readonly metadata: {
    readonly correlationId: string;
    readonly userId?: string;
    readonly timestamp: string;
  };
}

interface AccountCreated extends DomainEvent {
  eventType: 'AccountCreated';
  data: { ownerId: string; currency: string };
}

interface MoneyDeposited extends DomainEvent {
  eventType: 'MoneyDeposited';
  data: { amount: number; reference: string };
}

interface MoneyWithdrawn extends DomainEvent {
  eventType: 'MoneyWithdrawn';
  data: { amount: number; reference: string };
}

type AccountEvent = AccountCreated | MoneyDeposited | MoneyWithdrawn;

// ── Aggregate ───────────────────────────────────────────────
interface AccountState {
  readonly id: string;
  readonly ownerId: string;
  readonly balance: number;
  readonly currency: string;
  readonly status: 'active' | 'frozen' | 'closed';
  readonly version: number;
}

function applyEvent(
  state: AccountState | null,
  event: AccountEvent
): AccountState {
  switch (event.eventType) {
    case 'AccountCreated':
      return {
        id: event.streamId,
        ownerId: event.data.ownerId,
        balance: 0,
        currency: event.data.currency,
        status: 'active',
        version: 1,
      };

    case 'MoneyDeposited':
      if (!state) throw new Error('Cannot deposit to non-existent account');
      return {
        ...state,
        balance: state.balance + event.data.amount,
        version: state.version + 1,
      };

    case 'MoneyWithdrawn':
      if (!state) throw new Error('Cannot withdraw from non-existent account');
      if (state.balance < event.data.amount) {
        throw new Error('Insufficient funds');
      }
      return {
        ...state,
        balance: state.balance - event.data.amount,
        version: state.version + 1,
      };

    default:
      return state!;
  }
}

// ── Event Store ─────────────────────────────────────────────
class EventStore {
  constructor(private readonly db: Pool) {}

  async appendEvents(
    streamId: string,
    expectedVersion: number,
    events: ReadonlyArray<AccountEvent>
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Optimistic concurrency check
      const current = await client.query(
        `SELECT COALESCE(MAX(stream_version), 0) as version
         FROM events WHERE stream_id = $1`,
        [streamId]
      );

      if (current.rows[0].version !== expectedVersion) {
        throw new Error(
          `Concurrency conflict: expected version ${expectedVersion}, ` +
            `got ${current.rows[0].version}`
        );
      }

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        await client.query(
          `INSERT INTO events (event_id, stream_id, stream_version,
                               event_type, data, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            event.eventId,
            streamId,
            expectedVersion + i + 1,
            event.eventType,
            JSON.stringify(event.data),
            JSON.stringify(event.metadata),
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadStream(streamId: string): Promise<ReadonlyArray<AccountEvent>> {
    const result = await this.db.query(
      `SELECT * FROM events
       WHERE stream_id = $1
       ORDER BY stream_version ASC`,
      [streamId]
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      streamId: row.stream_id,
      data: row.data,
      metadata: row.metadata,
    }));
  }

  async loadStreamWithSnapshot(streamId: string): Promise<AccountState | null> {
    // Try loading from snapshot first
    const snapshot = await this.db.query(
      `SELECT * FROM snapshots
       WHERE stream_id = $1
       ORDER BY version DESC LIMIT 1`,
      [streamId]
    );

    let state: AccountState | null = null;
    let fromVersion = 0;

    if (snapshot.rows.length > 0) {
      state = snapshot.rows[0].state;
      fromVersion = snapshot.rows[0].version;
    }

    // Load events after snapshot
    const events = await this.db.query(
      `SELECT * FROM events
       WHERE stream_id = $1 AND stream_version > $2
       ORDER BY stream_version ASC`,
      [streamId, fromVersion]
    );

    for (const row of events.rows) {
      state = applyEvent(state, {
        eventId: row.event_id,
        eventType: row.event_type,
        streamId: row.stream_id,
        data: row.data,
        metadata: row.metadata,
      });
    }

    return state;
  }
}
```

### Projections (Building Read Models)

```
+------------------------------------------------------------------+
|              PROJECTION PIPELINE                                  |
+------------------------------------------------------------------+
|                                                                  |
|  Event Store -----> Projection Engine -----> Read Database        |
|                                                                  |
|  events:                                     account_summary:    |
|  | AccountCreated |                          | id | balance |    |
|  | MoneyDeposited |  Apply each event        | owner | status|   |
|  | MoneyWithdrawn |  to build read model     +------+--------+   |
|  | MoneyDeposited |                                              |
|                                              daily_transactions: |
|                                              | date | count |    |
|                                              | total_volume |    |
|                                                                  |
|  SYNC PROJECTION: Updated in same TX as event write              |
|  + Strong consistency  - Slower writes  - Coupling               |
|                                                                  |
|  ASYNC PROJECTION: Updated via event subscription                |
|  + Fast writes  + Decoupled  - Eventually consistent             |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Saga Pattern: Orchestration vs Choreography

```
+------------------------------------------------------------------+
|              SAGA PATTERNS                                        |
+------------------------------------------------------------------+
|                                                                  |
|  CHOREOGRAPHY (Event-driven, no central coordinator)             |
|                                                                  |
|  Order Svc       Payment Svc      Inventory Svc    Shipping Svc |
|  |                |                |                |            |
|  |--OrderCreated->|                |                |            |
|  |                |--PaymentOK---->|                |            |
|  |                |                |--Reserved----->|            |
|  |                |                |                |--Shipped-->|
|  |                                                               |
|  If Payment fails:                                               |
|  |                |--PaymentFail-->|                |            |
|  |<-OrderCancelled|                |                |            |
|  (Each service knows its compensating action)                    |
|                                                                  |
|  ORCHESTRATION (Central saga coordinator)                        |
|                                                                  |
|            +-------------+                                       |
|            | Saga        |                                       |
|            | Orchestrator|                                       |
|            +------+------+                                       |
|                   |                                              |
|   1. Create Order | 2. Charge    3. Reserve     4. Ship         |
|   +--------+     | +--------+   +--------+     +--------+      |
|   | Order  |<----+ |Payment |   |Inventory|    |Shipping|      |
|   | Svc    |     +>| Svc    |   | Svc    |     | Svc    |      |
|   +--------+       +--------+   +--------+     +--------+      |
|                                                                  |
|  If step 3 fails, orchestrator calls:                           |
|  - Refund payment (compensate step 2)                           |
|  - Cancel order (compensate step 1)                             |
|                                                                  |
|  COMPARISON:                                                     |
|  +-------------------+------------------+---------------------+  |
|  |                   | Choreography     | Orchestration       |  |
|  +-------------------+------------------+---------------------+  |
|  | Coupling          | Loose            | Tighter (to orch.)  |  |
|  | Visibility        | Hard to trace    | Central dashboard   |  |
|  | Complexity        | Grows with steps | Linear growth       |  |
|  | Single point of   | No               | Yes (orchestrator)  |  |
|  | failure           |                  |                     |  |
|  | Best for          | Simple sagas     | Complex business    |  |
|  |                   | (2-3 steps)      | workflows           |  |
|  +-------------------+------------------+---------------------+  |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Interview Q&As

### Q1: How would you design an event-driven system that guarantees no message is lost AND no message is processed twice?

**Answer**: This requires exactly-once processing semantics, which is achieved through a combination of at-least-once delivery with idempotent consumers.

**No message loss (at-least-once delivery):**

1. **Producer side**: Use Kafka's `acks=all` so messages are not acknowledged until written to all in-sync replicas. Enable retries with idempotent producer (`enable.idempotence=true`) to prevent duplicates from retries.
2. **Consumer side**: Disable auto-commit (`enable.auto.commit=false`). Only commit offsets after successful processing. If the consumer crashes before committing, the message will be redelivered.

**No duplicate processing (idempotency):**

1. Include a unique idempotency key in each message (e.g., a UUID or a business key like `order-123-v1`).
2. Before processing, check an idempotency store (Redis or a database table) to see if this key has been processed.
3. Process the message and record the idempotency key atomically (same database transaction if possible).
4. If the check finds the key already exists, skip processing.

**For cross-service transactions**, use the outbox pattern to ensure database writes and event publishing are atomic. The outbox relay publishes events from the outbox table, and consumers use idempotency keys to handle duplicates.

**For Kafka specifically**, enable transactional producers with `transactional.id` and set consumers to `isolation.level=read_committed` for end-to-end exactly-once within Kafka. For exactly-once from Kafka to an external system, you still need application-level idempotency.

### Q2: Explain the outbox pattern. When would you use it versus Kafka transactions?

**Answer**: The outbox pattern solves the **dual-write problem**: needing to atomically update a database and publish a message. Since a database transaction and a Kafka produce are two different systems, you cannot wrap them in a single ACID transaction.

**Outbox approach**: Write the event to an "outbox" table in the same database transaction as the business data. A separate process (either polling or CDC via Debezium) reads the outbox table and publishes events to Kafka. This guarantees that if the business data is committed, the event will eventually be published.

**Kafka transactions** only guarantee atomicity within Kafka -- you can atomically produce to multiple topics and commit consumer offsets. They do NOT span external databases.

**Use outbox when**: Your source of truth is a relational database and you need to publish events about database changes. This is the most common scenario.

**Use Kafka transactions when**: You are doing stream processing within Kafka (consume from topic A, produce to topic B, commit offset -- all atomically). The consume-transform-produce pattern.

**CDC (Change Data Capture) vs polling for outbox relay**: CDC (via Debezium) captures changes from the database's WAL (write-ahead log), providing near-real-time event publishing with no polling overhead. Polling is simpler to implement but adds latency and database load. For production systems handling thousands of events per second, CDC is strongly preferred.

### Q3: When would you choose event sourcing over a traditional CRUD approach?

**Answer**: Event sourcing is not a default choice -- it adds significant complexity. Choose it when the benefits justify the costs.

**Choose event sourcing when:**

- **Audit requirements are non-negotiable**: Financial systems, healthcare, compliance-heavy domains where you must know exactly what happened and when
- **Temporal queries are needed**: "What was the account balance at 3pm last Tuesday?" is trivial with event sourcing (replay events up to that timestamp) but requires complex temporal tables in CRUD
- **Business logic depends on history**: Insurance claims processing, where the sequence of events matters for adjudication, not just the final state
- **You need to rebuild state differently**: Multiple read models (projections) derived from the same event stream -- e.g., one for real-time dashboards, one for regulatory reporting

**Avoid event sourcing when:**

- Simple CRUD is sufficient (most web applications)
- Team is not experienced with eventual consistency
- The domain does not have complex business rules that benefit from event replay
- You cannot tolerate eventual consistency between write and read models

**Key trade-offs**: Event sourcing gives you a complete audit log, temporal queries, and the ability to retroactively create new projections. But it requires managing eventual consistency, building projections, handling schema evolution of events, and it makes simple queries like "show me all accounts with balance > $1000" indirect (you need a projection, not a direct query against the event store).

### Q4: How do you handle schema evolution in an event-driven system?

**Answer**: Schema evolution is one of the hardest operational challenges in event-driven systems. Events are immutable -- once published, you cannot change them. New consumers must read old events, and old consumers must handle new events.

**Strategy 1: Schema Registry with compatibility rules**
Use Confluent Schema Registry (or Apicurio) with Avro or Protobuf. Set compatibility mode to `FULL_TRANSITIVE` (both backward and forward compatible across all versions). Safe changes: adding optional fields with defaults, removing optional fields. Unsafe changes: renaming fields, changing types, removing required fields.

**Strategy 2: Event versioning**
Include a version in the event type: `order.created.v1`, `order.created.v2`. Consumers subscribe to the version they understand. A version adapter service can upcast v1 events to v2 format for new consumers. This is explicit but creates more topics/types to manage.

**Strategy 3: Tolerant reader pattern**
Consumers ignore unknown fields and use defaults for missing fields. This is implicit and works well for simple evolution but breaks down for structural changes.

**For event sourcing specifically**: Old events in the store must remain readable forever. Use an "upcaster" pattern: when loading events, pass them through a chain of upcasters that transform old event formats to the current format before applying them to the aggregate.

### Q5: Compare choreography and orchestration sagas. When would you choose each?

**Answer**: Both patterns coordinate distributed transactions across services without a global ACID transaction.

**Choreography**: Each service listens for events and reacts independently. Order service publishes "OrderCreated," payment service hears it and publishes "PaymentProcessed," inventory service hears that and publishes "InventoryReserved." No central coordinator.

**Best for**: Simple workflows with 2-3 steps, teams that value loose coupling, systems where new services should be addable without modifying existing ones. The event-driven nature means you can add a "LoyaltyPointsService" that listens to "OrderCreated" without touching the order service.

**Orchestration**: A central saga orchestrator directs the workflow. It sends commands to each service in sequence and handles responses. If step 3 fails, the orchestrator explicitly calls compensating actions for steps 1 and 2.

**Best for**: Complex workflows with 4+ steps, workflows with conditional logic (if premium customer, skip payment verification), when you need clear visibility into saga state (which step are we on? what failed?), and when compensating actions have specific ordering requirements.

**The key trade-off**: Choreography distributes knowledge (and risk) across services -- no single point of failure, but hard to understand and debug the overall flow. Orchestration centralizes knowledge in the orchestrator -- easy to understand and monitor, but the orchestrator is a single point of failure and a coupling point. In practice, many teams start with choreography for simple flows and introduce orchestration when the number of steps or conditional branches makes choreography unmanageable.

---

## Key Takeaways

1. **Choose the right event pattern**: Most systems need event-carried state transfer, not event sourcing. Only use event sourcing when audit trails, temporal queries, or event replay justify the complexity.
2. **Outbox pattern is essential**: Any system that writes to a database and publishes events must use the outbox pattern (or CDC) to avoid inconsistencies. This is table stakes in 2026.
3. **Idempotency is not optional**: Every message consumer must be idempotent. Use idempotency keys stored in your database or Redis.
4. **Schema evolution must be planned from day one**: Use a schema registry with compatibility rules. Retrofitting schema management is painful.
5. **Kafka is not always the answer**: For simple pub/sub, consider NATS. For low-volume event buses, consider Redis Streams or EventBridge. Kafka's operational complexity is only justified at scale.
6. **Choreography vs orchestration is not binary**: Many production systems use choreography for simple event propagation and orchestration for complex business workflows, within the same architecture.
