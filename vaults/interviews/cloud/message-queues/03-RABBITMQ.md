# RabbitMQ Deep Dive

RabbitMQ is the most widely deployed open-source message broker. It implements AMQP (Advanced Message Queuing Protocol) and offers flexible routing through exchanges and bindings. While Kafka dominates event streaming, RabbitMQ is the go-to for task queues, RPC patterns, and complex message routing.

---

## Table of Contents

1. [AMQP Model](#amqp-model)
2. [Exchanges](#exchanges)
3. [Queues and Bindings](#queues-and-bindings)
4. [Message Acknowledgement](#message-acknowledgement)
5. [Clustering and High Availability](#clustering-and-high-availability)
6. [Quorum Queues vs Classic Mirrored](#quorum-queues-vs-classic-mirrored)
7. [Dead Letter Exchanges](#dead-letter-exchanges)
8. [Comparison with Kafka](#comparison-with-kafka)
9. [Common Interview Questions](#common-interview-questions)

---

## AMQP Model

```
Producer -> Exchange -> Binding -> Queue -> Consumer

+-----------+     +----------+     routing key     +-------+     +-----------+
| Producer  | --> | Exchange | ---- "orders.*" --> | Queue | --> | Consumer  |
+-----------+     +----------+                     +-------+     +-----------+
                       |           routing key     +-------+     +-----------+
                       +-------- "payments.*" ---> | Queue | --> | Consumer  |
                                                   +-------+     +-----------+
```

### Key Concepts

| Concept | Description |
| ------- | ----------- |
| **Connection** | TCP connection between app and RabbitMQ |
| **Channel** | Virtual connection within a connection (multiplexed) |
| **Exchange** | Receives messages and routes to queues based on rules |
| **Queue** | Buffer that stores messages |
| **Binding** | Rule that links an exchange to a queue |
| **Routing Key** | Key attached to message, used by exchange for routing |
| **Virtual Host (vhost)** | Logical grouping (namespace) for isolation |

---

## Exchanges

### Direct Exchange

```
Routing key must EXACTLY match binding key.

Exchange "orders" (direct)
  |
  +-- binding key "create" --> Queue "order-create"
  +-- binding key "cancel" --> Queue "order-cancel"

Message with routing_key="create" -> Queue "order-create"
Message with routing_key="cancel" -> Queue "order-cancel"
Message with routing_key="update" -> dropped (no matching binding)
```

### Topic Exchange

```
Routing key pattern matching with wildcards.
  * = exactly one word
  # = zero or more words

Exchange "events" (topic)
  |
  +-- "order.*"         --> Queue A  (order.created, order.cancelled)
  +-- "*.created"       --> Queue B  (order.created, user.created)
  +-- "payment.#"       --> Queue C  (payment.processed, payment.failed, payment.refund.initiated)

Message "order.created" -> Queue A AND Queue B
Message "payment.refund.initiated" -> Queue C only
```

### Fanout Exchange

```
Broadcasts to ALL bound queues. Ignores routing key.

Exchange "notifications" (fanout)
  |
  +-- Queue "email-service"     (gets ALL messages)
  +-- Queue "push-service"      (gets ALL messages)
  +-- Queue "sms-service"       (gets ALL messages)
```

### Headers Exchange

```
Routes based on message headers (not routing key).

Exchange "import" (headers)
  |
  +-- headers: { format: "json", source: "api" }   --> Queue A
  +-- headers: { format: "csv" }                    --> Queue B

x-match: "all" = ALL headers must match
x-match: "any" = ANY header must match
```

### Exchange Type Summary

| Type | Routing | Use Case |
| ---- | ------- | -------- |
| **Direct** | Exact key match | Task routing by type |
| **Topic** | Pattern matching (* and #) | Event routing with hierarchy |
| **Fanout** | Broadcast to all queues | Notifications, pub/sub |
| **Headers** | Header attribute matching | Complex routing without key |

---

## Queues and Bindings

### Queue Properties

| Property | Description |
| -------- | ----------- |
| **Durable** | Survives broker restart (metadata + messages if persistent) |
| **Exclusive** | Only accessible by declaring connection, deleted when connection closes |
| **Auto-delete** | Deleted when last consumer disconnects |
| **Max length** | Maximum number of messages (oldest dropped or dead-lettered) |
| **Max length bytes** | Maximum total size of messages |
| **TTL** | Message time-to-live (per-queue or per-message) |
| **Priority** | 0-255 priority levels (higher = processed first) |

### Prefetch (QoS)

```
channel.basicQos(prefetchCount=10)

Without prefetch: RabbitMQ sends ALL messages to consumer -> OOM risk
With prefetch=10: Consumer gets max 10 unacked messages at a time

Optimal prefetch depends on:
  - Processing time per message
  - Network latency
  - Desired throughput

Rule of thumb: Start with prefetch=20-50, tune based on monitoring
```

---

## Message Acknowledgement

### Consumer Acknowledgement

```
Auto-ack (acknowledge on delivery):
  Broker sends message -> immediately removed from queue
  Risk: message lost if consumer crashes before processing

Manual ack (acknowledge after processing):
  Broker sends message -> consumer processes -> consumer ACKs
  If consumer crashes before ACK: message redelivered

  channel.basicAck(deliveryTag, multiple=false)   // success
  channel.basicNack(deliveryTag, requeue=true)     // failure, requeue
  channel.basicReject(deliveryTag, requeue=false)  // failure, discard/DLQ
```

### Publisher Confirms

```
Without confirms: Producer sends message, hopes for the best
With confirms: Broker ACKs back to producer when message is persisted

channel.confirmSelect()
channel.basicPublish(exchange, routingKey, props, body)
channel.waitForConfirms()  // blocks until broker ACKs

Or async:
channel.addConfirmListener(
  (deliveryTag, multiple) -> { /* ACK callback */ },
  (deliveryTag, multiple) -> { /* NACK callback - retry! */ }
)
```

---

## Clustering and High Availability

### Clustering

```
+--------+     +--------+     +--------+
| Node 1 | <-> | Node 2 | <-> | Node 3 |
+--------+     +--------+     +--------+

Cluster shares:
  - Exchange and binding metadata (replicated to all nodes)
  - Queue metadata (replicated to all nodes)
  - Queue DATA: depends on queue type (see below)
```

### Classic Mirrored Queues (Deprecated)

```
Queue mirrored across nodes:
  Node 1: Master queue (receives writes)
  Node 2: Mirror (replicates from master)
  Node 3: Mirror (replicates from master)

Problems:
  - Synchronization is blocking (slow for large queues)
  - Network partition handling is complex
  - Performance degrades with more mirrors

DEPRECATED in RabbitMQ 3.13. Use Quorum Queues instead.
```

---

## Quorum Queues vs Classic Mirrored

Quorum queues are the recommended HA queue type, based on Raft consensus.

| Feature | Quorum Queue | Classic Mirrored | Classic (non-replicated) |
| ------- | ------------ | ---------------- | ------------------------ |
| **Algorithm** | Raft consensus | Custom sync | None |
| **Data safety** | Majority quorum | All mirrors ACK | Single node |
| **Performance** | Good | Degrades with mirrors | Best |
| **Network partition** | Well-defined (leader election) | Split-brain risk | N/A |
| **Poison message** | Built-in delivery limit | No | No |
| **Priority** | No | Yes | Yes |
| **Lazy mode** | Always (disk-first) | Optional | Optional |
| **Status** | Recommended | Deprecated | Use for non-critical |

### Quorum Queue Internals

```
Quorum queue "orders" (3 replicas):
  Node 1: Leader  (accepts publishes, serves consumers)
  Node 2: Follower (replicates from leader)
  Node 3: Follower (replicates from leader)

Write path:
  Producer -> Leader -> replicate to followers -> majority ACK -> confirm to producer

If leader dies:
  Followers elect new leader (Raft) -> automatic failover
  No data loss (committed = majority acknowledged)
```

---

## Dead Letter Exchanges

Messages are dead-lettered when:
1. Consumer rejects with `requeue=false`
2. Message TTL expires
3. Queue max-length exceeded

```
Queue "orders" (with DLX config)
  x-dead-letter-exchange: "dlx"
  x-dead-letter-routing-key: "orders.failed"
       |
       v (on rejection/expiry)
Exchange "dlx" (direct)
  |
  +-- "orders.failed" --> Queue "orders-dlq"
```

### Delayed Retry Pattern

```
Main Queue -> Consumer fails -> DLQ with TTL
                                 |
                                 v (after TTL expires)
                              Retry Exchange -> Main Queue (retry)

Configure:
  DLQ: x-message-ttl=60000 (60 second delay)
       x-dead-letter-exchange="" (default exchange)
       x-dead-letter-routing-key="main-queue"
```

---

## Comparison with Kafka

| Feature | RabbitMQ | Kafka |
| ------- | -------- | ----- |
| **Model** | Message broker (push to consumer) | Distributed log (consumer pulls) |
| **Message lifecycle** | Deleted after ACK | Retained (time/size-based) |
| **Replay** | No (message gone after ACK) | Yes (seek to any offset) |
| **Routing** | Flexible (exchanges, bindings, patterns) | Topic + partition key only |
| **Ordering** | Per-queue (FIFO) | Per-partition |
| **Throughput** | ~50K msg/s per queue | ~1M msg/s per topic |
| **Latency** | Lower per-message | Higher (batching) |
| **Consumer model** | Push (prefetch) | Pull (poll) |
| **Stream processing** | No (use external) | Kafka Streams, ksqlDB |
| **Protocol** | AMQP, MQTT, STOMP | Custom (Kafka protocol) |
| **Best for** | Task queues, RPC, complex routing | Event streaming, CDC, replay |

### When to Choose RabbitMQ

- Complex routing requirements (topic exchange patterns)
- Request-reply (RPC) patterns
- Task queues with priority
- Low-latency per-message processing
- Multiple protocol support (AMQP, MQTT, STOMP)
- Simpler operations (no ZooKeeper/KRaft)

### When to Choose Kafka

- Event sourcing and replay
- High-throughput streaming (millions msg/s)
- CDC pipelines (Debezium)
- Stream processing (Kafka Streams, Flink)
- Long-term message retention
- Multiple consumer groups reading same data

---

## Common Interview Questions

1. **Explain the exchange types in RabbitMQ.** Direct: exact routing key match. Topic: pattern matching with wildcards. Fanout: broadcast to all bound queues. Headers: route by message headers.

2. **What are quorum queues?** Raft-based replicated queues that replace classic mirrored queues. Writes require majority acknowledgement. Automatic leader election on failure. Recommended for production.

3. **How does RabbitMQ handle message ordering?** Messages in a single queue are FIFO ordered. With multiple consumers, each consumer gets messages in order, but different consumers process different messages (order preserved per-consumer). Prefetch can affect perceived ordering.

4. **What is the difference between acknowledgement modes?** Auto-ack: message removed on delivery (fast, not safe). Manual ack: consumer explicitly ACKs after processing (safe, slower). Manual with prefetch gives the best balance.

5. **How do you implement delayed retries?** Use dead letter exchanges with TTL. Failed message goes to a DLQ with a TTL. When TTL expires, the DLQ dead-letters back to the main queue. Chain multiple DLQs for exponential backoff.

6. **How do you handle poison messages?** Quorum queues have a built-in delivery limit. After N redeliveries, the message is dead-lettered. For classic queues, track delivery count in headers and reject to DLQ after threshold.

7. **What happens during a network partition?** Depends on partition handling mode. `pause-minority`: minority side pauses (safe). `autoheal`: automatically pick a winner (may lose data). Quorum queues handle partitions via Raft leader election.
