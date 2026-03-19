# Message Queues & Async Processing

## Overview

Modern full-stack applications cannot afford to process every operation synchronously within an HTTP request-response cycle. Sending emails, processing payments, generating reports, resizing images, and syncing data with external systems are all operations that should happen asynchronously. Message queues decouple producers from consumers, enabling systems to handle load spikes gracefully, retry failed operations, and scale individual components independently.

For full-stack engineers, understanding message queues and asynchronous patterns is critical because these systems are the backbone of reliable, scalable architectures. In interviews, these topics test your understanding of distributed systems, fault tolerance, data consistency, and system design trade-offs.

---

## Core Concepts

### Why Async Processing

Synchronous processing means the client waits for the entire operation to complete before receiving a response. This creates problems at scale:

**Problems with synchronous-only architectures:**

- Long response times when operations are slow (sending email, calling external APIs)
- Cascading failures when downstream services are unavailable
- Inability to handle traffic spikes (every request needs immediate processing)
- Wasted resources when the user does not need the result immediately
- Tight coupling between services

**What async processing solves:**

- **Responsiveness**: Return a 202 Accepted immediately; process in the background
- **Resilience**: If a downstream service is down, queue the work and retry later
- **Scalability**: Process messages at your own pace; add more consumers when needed
- **Decoupling**: Producers do not need to know about consumers, and vice versa
- **Load leveling**: Smooth out traffic spikes by buffering work in the queue

### Message Queue Concepts

**Producer**: The component that sends (publishes) messages to the queue. It does not need to know who will process the message or when.

**Consumer**: The component that receives (subscribes to) and processes messages from the queue. Multiple consumers can process from the same queue.

**Message**: The unit of data passed through the queue. Contains a payload (the data), metadata (headers, timestamps), and routing information.

**Topic**: A named channel for messages. Producers publish to a topic; consumers subscribe to a topic. Similar to a "category" or "subject."

**Partition**: A subdivision of a topic. Messages within a partition are ordered. Partitions enable parallel consumption by distributing messages across consumers.

**Queue**: A FIFO (first-in, first-out) data structure. Messages are delivered to one consumer (point-to-point). Once consumed, the message is removed.

**Exchange** (RabbitMQ concept): A routing layer between producers and queues. Determines which queue(s) receive a message based on routing rules.

**Consumer group**: A set of consumers that cooperatively process messages from a topic. Each message is delivered to exactly one consumer in the group.

**Offset**: A position marker in a partition. Consumers track their offset to know which messages they have processed.

### Apache Kafka

Kafka is a distributed event streaming platform designed for high-throughput, fault-tolerant message processing.

**Architecture:**

```
Producers -> Brokers (Cluster) -> Consumers
              |
              v
          Topics -> Partitions -> Segments (on disk)
```

**Key concepts:**

- **Broker**: A Kafka server. A cluster has multiple brokers for fault tolerance.
- **Topic**: A logical channel for messages. Has one or more partitions.
- **Partition**: An ordered, immutable sequence of messages. Each partition is replicated across brokers.
- **Consumer group**: Consumers that share the workload of processing a topic. Each partition is assigned to exactly one consumer in a group.
- **Offset**: The position of a consumer within a partition. Consumers commit offsets to track progress.
- **Replication factor**: Number of copies of each partition across brokers.

**Delivery semantics:**

- **At-most-once**: Messages may be lost but never delivered twice. Consumer commits offset before processing.
- **At-least-once**: Messages are never lost but may be delivered multiple times. Consumer commits offset after processing.
- **Exactly-once**: Messages are delivered exactly once. Requires idempotent producers and transactional consumers.

**When to use Kafka:**

- High-throughput event streaming (millions of messages per second)
- Event sourcing and event-driven architectures
- Log aggregation and metrics collection
- Stream processing (Kafka Streams, Flink)
- Data pipeline between systems (CDC, ETL)

**When NOT to use Kafka:**

- Simple task queues (use RabbitMQ or SQS instead)
- Low volume messaging (Kafka overhead is not justified)
- When you need complex routing logic (RabbitMQ excels here)
- When you need message priority queues

### RabbitMQ

RabbitMQ is a traditional message broker that implements AMQP (Advanced Message Queuing Protocol).

**Architecture:**

```
Producers -> Exchange -> Bindings -> Queues -> Consumers
```

**Exchange types:**

- **Direct**: Routes messages to queues by exact routing key match
- **Fanout**: Routes messages to all bound queues (broadcast)
- **Topic**: Routes messages by routing key pattern matching (wildcards)
- **Headers**: Routes messages based on header attributes

**Key features:**

- **Message acknowledgment**: Consumers explicitly acknowledge message processing
- **Message persistence**: Messages can be stored on disk for durability
- **Dead letter exchanges**: Failed messages are routed to a DLX for inspection
- **Priority queues**: Messages can have priority levels
- **TTL**: Messages can expire after a set time
- **Prefetch count**: Controls how many unacknowledged messages a consumer can hold

**When to use RabbitMQ:**

- Task queues and work distribution
- Complex routing logic (topic-based, header-based)
- Request-reply patterns (RPC over messaging)
- When you need message priority
- When exactly-once is not required (at-least-once with idempotent consumers)
- Lower throughput use cases (tens of thousands of messages per second)

### Event-Driven Architecture

Event-driven architecture (EDA) is a design pattern where system components communicate through events.

**Event types:**

- **Domain events**: Something that happened in the business domain (OrderPlaced, UserRegistered, PaymentCompleted)
- **Integration events**: Events shared between bounded contexts or services
- **Command events**: Requests to perform an action (ProcessPayment, SendEmail)

**Benefits:**

- Loose coupling: services do not directly call each other
- Extensibility: new consumers can subscribe without modifying producers
- Auditability: events provide a natural audit log
- Temporal decoupling: producer and consumer do not need to be available simultaneously

**Challenges:**

- Eventual consistency: consumers process events asynchronously
- Event ordering: events may arrive out of order
- Debugging: tracing a request across multiple services is harder
- Schema evolution: events must be versioned to handle changes

### CQRS (Command Query Responsibility Segregation)

CQRS separates the write model (commands) from the read model (queries).

**Why CQRS:**

- Read and write workloads often have different characteristics
- Reads can be optimized with denormalized views
- Writes can be optimized with event sourcing
- Scales reads and writes independently

**How it works:**

1. Commands (writes) go through the command model and are persisted as events
2. Events are published to consumers that build read-optimized projections
3. Queries (reads) are served from the read model (projections)

**Example:**

- Write: `PlaceOrder` command -> validate -> persist -> publish `OrderPlaced` event
- Read: `OrderPlaced` event -> update `OrderSummaryView` projection -> serve via `GET /orders`

**Trade-offs:**

- Increased complexity (two models instead of one)
- Eventual consistency between write and read models
- More infrastructure to manage (event store, projections)

### Saga Pattern

The saga pattern manages distributed transactions across multiple services without using traditional two-phase commits.

**Two types of sagas:**

**Choreography-based saga:**

- Each service listens for events and publishes events
- No central coordinator
- Services react autonomously to events
- Simpler for small numbers of steps

```
OrderService -> publishes OrderCreated
PaymentService -> listens for OrderCreated -> processes payment -> publishes PaymentCompleted
InventoryService -> listens for PaymentCompleted -> reserves stock -> publishes StockReserved
ShippingService -> listens for StockReserved -> creates shipment -> publishes ShipmentCreated
```

**Orchestration-based saga:**

- A central orchestrator (saga coordinator) directs the workflow
- Orchestrator tells each service what to do and when
- Easier to understand and debug for complex workflows

```
SagaOrchestrator:
  1. Tell PaymentService to process payment
  2. If success, tell InventoryService to reserve stock
  3. If success, tell ShippingService to create shipment
  4. If any step fails, execute compensating transactions
```

**Compensating transactions:**
When a step in a saga fails, you must undo the work done by previous steps:

- If payment fails: no compensation needed (first step)
- If inventory reservation fails: refund payment
- If shipping fails: release inventory, refund payment

### Dead Letter Queues (DLQ)

A dead letter queue captures messages that cannot be successfully processed.

**When messages go to DLQ:**

- Consumer throws an unrecoverable error
- Message exceeds the maximum retry count
- Message TTL expires
- Message is rejected by the consumer

**What to do with DLQ messages:**

1. Set up monitoring alerts when DLQ depth increases
2. Inspect messages to understand failure patterns
3. Fix the bug in the consumer
4. Replay messages from DLQ back to the original queue
5. Archive or discard messages that are no longer relevant

### Retry Strategies

Failed messages should be retried with appropriate strategies.

**Immediate retry:**

- Retry immediately a fixed number of times
- Good for transient errors (network blip)
- Bad for persistent errors (overwhelms the failing service)

**Fixed delay retry:**

- Wait a fixed time between retries (e.g., 5 seconds)
- Simple to implement
- Does not adapt to the nature of the failure

**Exponential backoff:**

- Increase the delay exponentially: 1s, 2s, 4s, 8s, 16s...
- Reduces load on failing services
- Prevents thundering herd when service recovers

**Exponential backoff with jitter:**

- Add randomness to the backoff delay
- Prevents multiple consumers from retrying at the same time
- Formula: `min(cap, base * 2^attempt + random(0, base))`

**Retry budget:**

- Limit the total number of retries per time window
- Prevents retry amplification (where retries cause more retries)
- Example: "no more than 10% of requests should be retries"

### Idempotent Consumers

An idempotent consumer can process the same message multiple times without side effects beyond the first processing.

**Why idempotency matters:**

- At-least-once delivery means messages may be delivered more than once
- Network failures can cause duplicate message delivery
- Consumer crashes after processing but before acknowledging

**Implementation strategies:**

- **Idempotency key**: Store a unique message ID in the database. Before processing, check if the ID already exists. If it does, skip processing.
- **Upsert operations**: Use INSERT ... ON CONFLICT DO UPDATE instead of INSERT
- **Conditional updates**: Use WHERE clauses to prevent duplicate state transitions (e.g., `UPDATE orders SET status = 'paid' WHERE status = 'pending'`)
- **Deduplication window**: Track processed message IDs for a time window (e.g., 24 hours)

### Background Job Processing

Background job processors manage async work outside of message queues.

**Celery (Python):**

- Distributed task queue
- Supports multiple brokers (Redis, RabbitMQ)
- Task routing, scheduling, rate limiting
- Canvas: chain, group, chord for complex workflows
- Result backend for task results

**Bull / BullMQ (Node.js):**

- Redis-based queue
- Job scheduling (cron-like)
- Rate limiting and concurrency control
- Job progress tracking
- Priority queues
- Sandboxed processors (separate processes)

**Sidekiq (Ruby):**

- Redis-based background job processor
- Multi-threaded for efficiency
- Built-in retry with exponential backoff
- Web UI for monitoring

**Common patterns across all:**

- Enqueue a job with a payload
- Worker picks up the job and processes it
- On success, the job is marked complete
- On failure, the job is retried according to the retry policy
- After max retries, the job goes to a dead letter queue

---

## Practical Scenarios

### Scenario 1: Order Processing Pipeline

An e-commerce order involves multiple steps: payment, inventory, shipping, and notifications.

**Approach:**

1. User places order -> API returns 202 Accepted with order ID
2. Publish `OrderCreated` event to Kafka
3. PaymentService consumes the event, processes payment
4. On success, publishes `PaymentCompleted`
5. InventoryService reserves stock, publishes `StockReserved`
6. ShippingService creates shipment, publishes `ShipmentCreated`
7. NotificationService sends email/push at each step
8. If any step fails, execute compensating transactions (saga pattern)
9. Dead letter queue captures permanently failed messages

### Scenario 2: Email Notification System

You need to send transactional emails (welcome, password reset, order confirmation) without blocking API responses.

**Approach:**

1. API endpoint publishes a message to an email queue (RabbitMQ or SQS)
2. Email worker consumes messages and sends via email provider (SendGrid, SES)
3. Use exponential backoff for retries (email providers may rate-limit)
4. Track idempotency keys to prevent duplicate emails
5. Dead letter queue for permanently failed emails (invalid addresses)
6. Monitor queue depth and processing latency
7. Scale workers horizontally based on queue depth

### Scenario 3: Real-Time Analytics Pipeline

You need to process millions of clickstream events for real-time dashboards.

**Approach:**

1. Client sends events to an API endpoint
2. API publishes events to Kafka (high-throughput)
3. Stream processor (Kafka Streams or Flink) aggregates events in real-time
4. Aggregated results are written to a time-series database (InfluxDB, TimescaleDB)
5. Dashboard queries the read-optimized store
6. Kafka retains raw events for 7 days for reprocessing
7. Batch jobs process historical data for long-term analytics

### Scenario 4: Image Processing Pipeline

Users upload images that need to be resized into multiple formats.

**Approach:**

1. Upload API saves the original image to S3
2. S3 event triggers a Lambda function (or publishes to SQS)
3. Worker generates thumbnails, medium, and large versions
4. Worker uploads processed images to S3
5. Worker updates the database with image URLs
6. If processing fails, retry with exponential backoff
7. After max retries, send to DLQ and notify the user
8. Use concurrency limits to prevent overwhelming S3

---

## Interview Questions

### Q1: When would you use a message queue versus a direct API call?

**Answer:**

**Use a message queue when:**

- The operation does not need to complete before responding to the user (sending emails, generating reports, processing images)
- The downstream service may be temporarily unavailable (decoupling)
- You need to handle traffic spikes by buffering work (load leveling)
- Multiple services need to react to the same event (fan-out)
- You need guaranteed delivery with retry semantics
- The operation is expensive and should be rate-limited

**Use a direct API call when:**

- The response depends on the result of the operation (user login, search)
- Latency must be minimal (real-time data)
- The operation is simple and fast
- Strong consistency is required (balance check before payment)
- You need synchronous error handling

**Hybrid approach:**
Many systems use both. For example, an order API validates input and checks inventory synchronously, then publishes an event for asynchronous payment processing, email notifications, and analytics.

### Q2: Compare Kafka and RabbitMQ. When would you choose one over the other?

**Answer:**

**Kafka:**

- Designed for high-throughput event streaming
- Messages are persisted on disk and retained for a configurable period
- Consumer groups enable parallel processing with partition assignment
- Supports exactly-once semantics
- Pull-based consumption (consumers control their pace)
- Messages are not deleted after consumption (log-based)
- Better for: event sourcing, log aggregation, stream processing, data pipelines

**RabbitMQ:**

- Designed for traditional message queuing
- Messages are deleted after acknowledgment
- Rich routing capabilities (exchanges, bindings, routing keys)
- Push-based delivery (broker sends to consumers)
- Supports message priority
- Built-in dead letter exchanges
- Better for: task queues, RPC patterns, complex routing, lower throughput use cases

**Decision framework:**

| Factor             | Kafka                     | RabbitMQ                 |
| ------------------ | ------------------------- | ------------------------ |
| Throughput         | Millions/sec              | Tens of thousands/sec    |
| Message retention  | Configurable (days/weeks) | Until consumed           |
| Routing complexity | Simple (topic-based)      | Rich (exchange types)    |
| Ordering guarantee | Per partition             | Per queue                |
| Replay capability  | Yes (offset-based)        | No (once consumed, gone) |
| Protocol           | Custom binary             | AMQP (standard)          |

### Q3: Explain the saga pattern and when you would use it.

**Answer:**

The saga pattern manages distributed transactions across multiple services. Instead of a single ACID transaction spanning multiple databases, a saga is a sequence of local transactions where each step publishes an event that triggers the next step.

**When to use sagas:**

- When a business transaction spans multiple microservices
- When you cannot use a distributed two-phase commit (which you should avoid in microservices)
- When you need to maintain consistency across service boundaries

**Choreography vs. Orchestration:**

Choreography: each service reacts to events and publishes its own events. No central coordinator. Simple for 2-3 step workflows. Becomes hard to understand and debug with many steps because the flow is implicit.

Orchestration: a central saga coordinator directs the workflow. It tells each service what to do and handles compensation on failure. Easier to understand and maintain for complex workflows. The orchestrator becomes a single point of failure (mitigated by making it highly available).

**Compensating transactions** are the key challenge. Each step must have a corresponding compensation action that undoes its work:

- Payment processed -> Compensation: refund payment
- Inventory reserved -> Compensation: release reservation
- Shipment created -> Compensation: cancel shipment

**Important considerations:**

- Compensating transactions may not be perfectly reversible (a sent email cannot be unsent)
- Design compensations carefully; some are "semantic" (issue a credit) rather than "exact" (undo)
- Keep compensating transactions idempotent (they may be triggered more than once)

### Q4: How do you ensure exactly-once processing in a distributed system?

**Answer:**

True exactly-once delivery is impossible in distributed systems (due to the Two Generals Problem). What we achieve in practice is "effectively exactly-once" through a combination of at-least-once delivery and idempotent processing.

**At-least-once delivery:**

- The message broker guarantees every message is delivered at least once
- Messages may be delivered more than once due to network issues or consumer failures
- Achieved by not acknowledging a message until it is fully processed

**Idempotent processing:**

- The consumer can process the same message multiple times without side effects
- Implementation: store a unique message ID in the database within the same transaction as the business logic
- Before processing, check if the message ID already exists

**Pattern:**

```
1. Receive message with ID "msg-123"
2. BEGIN TRANSACTION
3. Check: SELECT 1 FROM processed_messages WHERE id = 'msg-123'
4. If exists: skip processing, acknowledge message
5. If not exists: process business logic
6. INSERT INTO processed_messages (id) VALUES ('msg-123')
7. COMMIT TRANSACTION
8. Acknowledge message to the broker
```

**Kafka's exactly-once semantics:**
Kafka provides exactly-once within the Kafka ecosystem using idempotent producers (dedup at broker level) and transactional consumers (atomic read-process-write). This does not extend outside Kafka -- you still need idempotent consumers for external side effects.

### Q5: What is a dead letter queue and how do you handle it?

**Answer:**

A dead letter queue (DLQ) is a separate queue where messages that cannot be successfully processed are sent after exhausting all retry attempts.

**Messages end up in the DLQ when:**

- The consumer throws an unrecoverable error (invalid data, business rule violation)
- The maximum retry count is exceeded
- The message TTL expires before being consumed
- The message is explicitly rejected by the consumer (negative acknowledgment)

**Handling DLQ messages:**

1. **Monitoring**: Alert when the DLQ depth exceeds a threshold. A growing DLQ indicates a systematic problem.

2. **Inspection**: Examine DLQ messages to identify failure patterns. Group by error type to prioritize fixes.

3. **Fix and replay**: Fix the consumer bug, then replay messages from the DLQ back to the original queue. Most message brokers support this operation.

4. **Manual resolution**: For messages that cannot be replayed (e.g., the window for action has passed), resolve them manually or mark them as acknowledged.

5. **Archival**: Move old DLQ messages to cold storage for audit purposes. Do not let the DLQ grow unbounded.

**DLQ best practices:**

- Always set up a DLQ for every queue
- Include metadata in DLQ messages (original queue, error message, retry count, timestamp)
- Set up alerts on DLQ depth
- Build tooling to inspect and replay DLQ messages
- Regularly review and process DLQ messages (do not ignore them)

### Q6: How do you design an idempotent consumer?

**Answer:**

An idempotent consumer produces the same result regardless of how many times it processes the same message.

**Strategy 1: Idempotency key in database**

```
BEGIN TRANSACTION
  SELECT 1 FROM processed_messages WHERE idempotency_key = ?
  IF EXISTS: return (already processed)
  ELSE:
    -- Execute business logic
    INSERT INTO processed_messages (idempotency_key, processed_at)
    -- Commit business logic + idempotency record atomically
COMMIT
```

**Strategy 2: Conditional database updates**

```sql
-- Only transitions from pending to paid (idempotent)
UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'
-- Returns 0 rows affected if already paid
```

**Strategy 3: Upsert operations**

```sql
INSERT INTO user_preferences (user_id, theme)
VALUES (?, ?)
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme
```

**Strategy 4: Natural idempotency**
Some operations are naturally idempotent:

- Setting a value (SET, not INCREMENT)
- Deleting a resource (deleting twice has the same effect)
- Upserting data

**Strategy 5: Deduplication window**
Track processed message IDs in Redis with a TTL:

```
SET processed:msg-123 1 EX 86400  # 24-hour dedup window
```

Before processing, check if the key exists. This is cheaper than a database check but has a finite dedup window.

### Q7: Explain CQRS and when it makes sense to use it.

**Answer:**

CQRS (Command Query Responsibility Segregation) separates the data model for writes (commands) from the data model for reads (queries).

**How it works:**

- **Command side**: Handles writes. Validates commands, persists events or records, and publishes events.
- **Query side**: Handles reads. Maintains denormalized projections optimized for specific query patterns.
- Events flow from the command side to the query side, which updates its projections.

**When CQRS makes sense:**

- Read and write workloads have very different characteristics (read-heavy, write-heavy, or different query patterns)
- You need to scale reads and writes independently
- Complex queries require denormalized views that differ significantly from the write model
- Combined with event sourcing for full audit trail and temporal queries

**When CQRS is overkill:**

- Simple CRUD applications
- Read and write models are nearly identical
- Team is small and the added complexity is not justified
- Strong consistency is required (CQRS introduces eventual consistency)

**Example:**
An e-commerce system where the write model is a normalized Order with OrderItems. The read model includes: `OrderSummaryView` (denormalized for the order list page), `OrderDetailView` (denormalized for the order detail page), and `SalesAnalyticsView` (aggregated for the admin dashboard). Each view is optimized for its specific query pattern, whereas a single normalized model would require expensive JOINs.

### Q8: How do you handle ordering guarantees in a message queue?

**Answer:**

**The challenge:**
In distributed systems, messages may arrive out of order due to partitioning, retries, and consumer failures. Some business operations require ordering (e.g., "create user" must be processed before "update user").

**Kafka ordering:**
Kafka guarantees ordering within a partition. To ensure related messages are ordered:

- Use a partition key that groups related messages (e.g., user ID)
- All messages with the same key go to the same partition
- One consumer per partition ensures sequential processing

**RabbitMQ ordering:**
RabbitMQ guarantees FIFO order within a single queue with a single consumer. With multiple consumers, ordering is not guaranteed. Solutions:

- Use a single consumer (limits throughput)
- Use consistent hashing exchange to route related messages to the same queue

**Application-level ordering:**
When infrastructure-level ordering is insufficient:

- Include a sequence number in each message
- Consumer buffers out-of-order messages and processes them in sequence
- Use version numbers in the database (optimistic concurrency control)

**Design around ordering:**

- Make operations commutative when possible (order does not matter)
- Use event timestamps to determine the "latest" state
- Design events to carry complete state rather than incremental changes
- Accept eventual consistency and design the UI to handle it

---

## Code Examples

### Kafka Producer and Consumer (Node.js)

```typescript
// kafka/producer.ts
import { Kafka, CompressionTypes } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
});

interface OrderEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly items: ReadonlyArray<{
    readonly productId: string;
    readonly quantity: number;
    readonly price: number;
  }>;
  readonly total: number;
  readonly timestamp: string;
}

export const publishOrderCreated = async (event: OrderEvent): Promise<void> => {
  await producer.connect();

  await producer.send({
    topic: 'orders.created',
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          'event-type': 'OrderCreated',
          'event-version': '1',
          'correlation-id': event.orderId,
        },
      },
    ],
  });
};
```

```typescript
// kafka/consumer.ts
import { Kafka, EachMessagePayload } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const consumer = kafka.consumer({
  groupId: 'payment-service-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

interface ProcessedMessage {
  readonly messageId: string;
  readonly processedAt: Date;
}

const processedMessages = new Map<string, ProcessedMessage>();

const handleOrderCreated = async (
  payload: EachMessagePayload
): Promise<void> => {
  const { topic, partition, message } = payload;
  const messageId = `${topic}-${partition}-${message.offset}`;

  // Idempotency check
  if (processedMessages.has(messageId)) {
    return;
  }

  const event = JSON.parse(message.value?.toString() ?? '{}');

  try {
    // Process payment
    const paymentResult = await processPayment({
      orderId: event.orderId,
      userId: event.userId,
      amount: event.total,
    });

    // Publish payment result
    await publishPaymentCompleted({
      orderId: event.orderId,
      paymentId: paymentResult.id,
      status: 'completed',
    });

    // Mark as processed
    processedMessages.set(messageId, {
      messageId,
      processedAt: new Date(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Payment processing failed';
    throw new Error(`Failed to process order ${event.orderId}: ${message}`);
  }
};

export const startConsumer = async (): Promise<void> => {
  await consumer.connect();
  await consumer.subscribe({
    topic: 'orders.created',
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: handleOrderCreated,
  });
};
```

### RabbitMQ with Exchange Routing (Node.js)

```typescript
// rabbitmq/setup.ts
import amqplib, { Channel, Connection } from 'amqplib';

interface RabbitMQConnection {
  readonly connection: Connection;
  readonly channel: Channel;
}

export const setupRabbitMQ = async (): Promise<RabbitMQConnection> => {
  const connection = await amqplib.connect(
    process.env.RABBITMQ_URL ?? 'amqp://localhost'
  );
  const channel = await connection.createChannel();

  // Set up exchange
  await channel.assertExchange('order-events', 'topic', {
    durable: true,
  });

  // Set up queues with DLQ
  await channel.assertExchange('order-events-dlx', 'topic', {
    durable: true,
  });

  await channel.assertQueue('order-events-dlq', {
    durable: true,
  });

  await channel.bindQueue('order-events-dlq', 'order-events-dlx', '#');

  // Payment processing queue
  await channel.assertQueue('payment-processing', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'order-events-dlx',
      'x-dead-letter-routing-key': 'payment.failed',
      'x-message-ttl': 300000, // 5 minutes
    },
  });

  await channel.bindQueue(
    'payment-processing',
    'order-events',
    'order.created'
  );

  // Email notification queue
  await channel.assertQueue('email-notifications', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'order-events-dlx',
      'x-dead-letter-routing-key': 'email.failed',
    },
  });

  await channel.bindQueue('email-notifications', 'order-events', 'order.*');

  // Prefetch: process one message at a time
  await channel.prefetch(1);

  return { connection, channel };
};
```

```typescript
// rabbitmq/publisher.ts
import { Channel } from 'amqplib';

export const publishOrderEvent = async (
  channel: Channel,
  routingKey: string,
  event: Record<string, unknown>
): Promise<void> => {
  const message = Buffer.from(JSON.stringify(event));

  channel.publish('order-events', routingKey, message, {
    persistent: true,
    contentType: 'application/json',
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
    headers: {
      'x-retry-count': 0,
    },
  });
};
```

```typescript
// rabbitmq/consumer.ts
import { Channel, ConsumeMessage } from 'amqplib';

const MAX_RETRIES = 3;

export const startPaymentConsumer = async (channel: Channel): Promise<void> => {
  await channel.consume(
    'payment-processing',
    async (msg: ConsumeMessage | null) => {
      if (msg === null) {
        return;
      }

      const retryCount = Number(msg.properties.headers?.['x-retry-count'] ?? 0);

      try {
        const event = JSON.parse(msg.content.toString());

        await processPayment(event);

        // Acknowledge on success
        channel.ack(msg);
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          // Retry with exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;

          setTimeout(() => {
            channel.publish('order-events', 'order.created', msg.content, {
              ...msg.properties,
              headers: {
                ...msg.properties.headers,
                'x-retry-count': retryCount + 1,
              },
            });
            channel.ack(msg);
          }, delay);
        } else {
          // Send to DLQ (reject without requeue)
          channel.nack(msg, false, false);
        }
      }
    }
  );
};
```

### BullMQ Background Jobs (Node.js)

```typescript
// jobs/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

// Define queues
export const emailQueue = new Queue('emails', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const imageQueue = new Queue('image-processing', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

```typescript
// jobs/email-worker.ts
import { Worker, Job } from 'bullmq';

interface EmailJobData {
  readonly to: string;
  readonly subject: string;
  readonly template: string;
  readonly variables: Record<string, string>;
}

const emailWorker = new Worker<EmailJobData>(
  'emails',
  async (job: Job<EmailJobData>) => {
    const { to, subject, template, variables } = job.data;

    // Update progress
    await job.updateProgress(10);

    // Render template
    const html = await renderTemplate(template, variables);
    await job.updateProgress(50);

    // Send email
    const result = await emailProvider.send({
      to,
      subject,
      html,
    });
    await job.updateProgress(100);

    return {
      messageId: result.messageId,
      sentAt: new Date().toISOString(),
    };
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000, // 100 emails per minute
    },
  }
);

emailWorker.on('completed', (job) => {
  // Log success
});

emailWorker.on('failed', (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    // All retries exhausted, alert team
  }
});
```

```typescript
// jobs/enqueue.ts
import { emailQueue, imageQueue } from './queue';

// Enqueue an email job
export const sendWelcomeEmail = async (
  userId: string,
  email: string,
  name: string
): Promise<string> => {
  const job = await emailQueue.add(
    'welcome-email',
    {
      to: email,
      subject: `Welcome, ${name}!`,
      template: 'welcome',
      variables: { name, userId },
    },
    {
      jobId: `welcome-${userId}`, // Idempotency key
      priority: 1,
    }
  );

  return job.id ?? '';
};

// Enqueue an image processing job
export const processUploadedImage = async (
  imageId: string,
  s3Key: string
): Promise<string> => {
  const job = await imageQueue.add(
    'resize-image',
    {
      imageId,
      s3Key,
      sizes: [
        { width: 150, height: 150, suffix: 'thumb' },
        { width: 600, height: 400, suffix: 'medium' },
        { width: 1200, height: 800, suffix: 'large' },
      ],
    },
    {
      jobId: `resize-${imageId}`,
    }
  );

  return job.id ?? '';
};

// Schedule a recurring job
export const scheduleReports = async (): Promise<void> => {
  await emailQueue.add(
    'daily-report',
    { template: 'daily-summary' },
    {
      repeat: {
        pattern: '0 8 * * *', // Every day at 8 AM
      },
    }
  );
};
```

### Saga Orchestrator Pattern (TypeScript)

```typescript
// sagas/order-saga.ts
interface SagaStep<T> {
  readonly name: string;
  readonly execute: (context: T) => Promise<T>;
  readonly compensate: (context: T) => Promise<T>;
}

interface SagaResult<T> {
  readonly success: boolean;
  readonly context: T;
  readonly failedStep?: string;
  readonly error?: string;
}

const executeSaga = async <T>(
  steps: ReadonlyArray<SagaStep<T>>,
  initialContext: T
): Promise<SagaResult<T>> => {
  const completedSteps: SagaStep<T>[] = [];
  let context = initialContext;

  for (const step of steps) {
    try {
      context = await step.execute(context);
      completedSteps.push(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Compensate completed steps in reverse order
      for (const completedStep of [...completedSteps].reverse()) {
        try {
          context = await completedStep.compensate(context);
        } catch (compensateError) {
          // Log compensation failure (requires manual intervention)
          const compMessage =
            compensateError instanceof Error
              ? compensateError.message
              : 'Unknown compensation error';
          throw new Error(
            `Compensation failed for ${completedStep.name}: ${compMessage}`
          );
        }
      }

      return {
        success: false,
        context,
        failedStep: step.name,
        error: message,
      };
    }
  }

  return { success: true, context };
};

// Define order saga steps
interface OrderContext {
  readonly orderId: string;
  readonly userId: string;
  readonly amount: number;
  readonly paymentId?: string;
  readonly reservationId?: string;
  readonly shipmentId?: string;
}

const orderSagaSteps: ReadonlyArray<SagaStep<OrderContext>> = [
  {
    name: 'processPayment',
    execute: async (ctx) => {
      const payment = await paymentService.charge({
        userId: ctx.userId,
        amount: ctx.amount,
        orderId: ctx.orderId,
      });
      return { ...ctx, paymentId: payment.id };
    },
    compensate: async (ctx) => {
      if (ctx.paymentId) {
        await paymentService.refund(ctx.paymentId);
      }
      return { ...ctx, paymentId: undefined };
    },
  },
  {
    name: 'reserveInventory',
    execute: async (ctx) => {
      const reservation = await inventoryService.reserve(ctx.orderId);
      return { ...ctx, reservationId: reservation.id };
    },
    compensate: async (ctx) => {
      if (ctx.reservationId) {
        await inventoryService.release(ctx.reservationId);
      }
      return { ...ctx, reservationId: undefined };
    },
  },
  {
    name: 'createShipment',
    execute: async (ctx) => {
      const shipment = await shippingService.create(ctx.orderId);
      return { ...ctx, shipmentId: shipment.id };
    },
    compensate: async (ctx) => {
      if (ctx.shipmentId) {
        await shippingService.cancel(ctx.shipmentId);
      }
      return { ...ctx, shipmentId: undefined };
    },
  },
];

// Execute the saga
export const processOrder = async (
  orderId: string,
  userId: string,
  amount: number
): Promise<SagaResult<OrderContext>> => {
  return executeSaga(orderSagaSteps, {
    orderId,
    userId,
    amount,
  });
};
```

---

## Quick Reference

### Message Queue Comparison

| Feature        | Kafka          | RabbitMQ       | AWS SQS     |
| -------------- | -------------- | -------------- | ----------- |
| Throughput     | Very High      | High           | Medium      |
| Ordering       | Per partition  | Per queue      | FIFO mode   |
| Retention      | Configurable   | Until consumed | 14 days max |
| Replay         | Yes            | No             | No          |
| Routing        | Simple         | Rich           | Simple      |
| Protocol       | Custom         | AMQP           | HTTP        |
| Managed option | MSK, Confluent | CloudAMQP      | Native AWS  |

### Delivery Guarantees

| Guarantee     | Message Loss | Duplicates | Use Case               |
| ------------- | ------------ | ---------- | ---------------------- |
| At-most-once  | Possible     | Never      | Metrics, logs          |
| At-least-once | Never        | Possible   | Most applications      |
| Exactly-once  | Never        | Never      | Financial transactions |

### Retry Strategy Cheat Sheet

```
Immediate:     attempt 1 -> attempt 2 -> attempt 3 -> DLQ
Fixed delay:   attempt 1 -> 5s -> attempt 2 -> 5s -> attempt 3 -> DLQ
Exponential:   attempt 1 -> 1s -> attempt 2 -> 2s -> attempt 3 -> 4s -> DLQ
Exp + jitter:  attempt 1 -> 1.3s -> attempt 2 -> 2.7s -> attempt 3 -> 5.1s -> DLQ
```

### Idempotency Patterns

| Pattern            | Pros               | Cons                            |
| ------------------ | ------------------ | ------------------------------- |
| DB idempotency key | Durable, precise   | Requires DB write per message   |
| Conditional update | Natural, efficient | Limited to state transitions    |
| Redis dedup window | Fast, simple       | Finite window, not durable      |
| Upsert             | Natural for writes | Not suitable for all operations |

### Event-Driven Architecture Checklist

```
[ ] Events are named in past tense (OrderCreated, not CreateOrder)
[ ] Events carry enough data for consumers to process independently
[ ] Events are versioned for schema evolution
[ ] Consumers are idempotent
[ ] Dead letter queues are configured
[ ] Retry policies are defined
[ ] Monitoring and alerting are set up
[ ] Consumer lag is tracked
[ ] Event schema registry is in place
[ ] Compensating transactions are defined for sagas
```

### Common Queue Patterns

```
Point-to-point:    1 producer -> Queue -> 1 consumer
Pub/Sub:           1 producer -> Topic -> N consumers
Fan-out:           1 producer -> Exchange -> N queues -> N consumers
Work queue:        N producers -> Queue -> N consumers (competing)
Request/Reply:     Producer -> Queue -> Consumer -> Reply Queue -> Producer
Priority:          Producer -> Priority Queue -> Highest-first consumer
Delay:             Producer -> Delay Queue -> Wait -> Processing Queue
```

### Monitoring Metrics

```
- Queue depth (number of messages waiting)
- Consumer lag (how far behind consumers are)
- Processing rate (messages per second)
- Error rate (failed message percentage)
- DLQ depth (messages that failed permanently)
- Consumer count (number of active consumers)
- Message age (how long oldest message has been waiting)
- Processing duration (time to handle one message)
```
