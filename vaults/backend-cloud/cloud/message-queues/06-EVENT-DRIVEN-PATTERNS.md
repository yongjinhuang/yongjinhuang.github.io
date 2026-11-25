# Event-Driven Architecture Patterns

Event-driven architecture (EDA) patterns are the most commonly asked messaging topics in system design interviews. This guide covers the patterns that connect messaging systems to application architecture.

---

## Table of Contents

1. [Event Sourcing](#event-sourcing)
2. [CQRS](#cqrs)
3. [Saga Pattern](#saga-pattern)
4. [Transactional Outbox](#transactional-outbox)
5. [Choreography vs Orchestration](#choreography-vs-orchestration)
6. [Event Schema Evolution](#event-schema-evolution)
7. [Common Interview Questions](#common-interview-questions)

---

## Event Sourcing

Store state as a sequence of events, not as current state.

```
Traditional (State Sourcing):
  Account { id: 1, balance: 150 }
  UPDATE accounts SET balance = 150 WHERE id = 1;
  -- Previous states are lost

Event Sourcing:
  Event 1: AccountCreated { id: 1, balance: 0 }
  Event 2: MoneyDeposited { amount: 200 }
  Event 3: MoneyWithdrawn { amount: 50 }
  Current state = replay: 0 + 200 - 50 = 150
  -- Complete history preserved
```

### Architecture

```
Command -> Aggregate -> Events -> Event Store (append-only)
                                      |
                                      v
                              +--Projections--+
                              | Read Model A  |  (SQL table for queries)
                              | Read Model B  |  (Elasticsearch for search)
                              | Read Model C  |  (Redis for leaderboard)
                              +---------------+
```

### Benefits

- Complete audit trail (every change recorded)
- Temporal queries (state at any point in time)
- Replay into new read models (add analytics later)
- Natural fit for event-driven microservices
- Debug by replaying events

### Challenges

- **Complexity**: More moving parts than CRUD
- **Event schema evolution**: Events are immutable; changing schema requires versioning
- **Replay performance**: Millions of events = slow rebuild (use snapshots)
- **Eventual consistency**: Projections are async; read models may be stale

### Snapshots

```
Events: E1, E2, ..., E10000, [SNAPSHOT @ E10000], E10001, E10002

Rebuild state:
  1. Load snapshot (state at E10000)
  2. Replay E10001, E10002 only
  -- Instead of replaying all 10,000+ events
```

---

## CQRS

Command Query Responsibility Segregation: separate the write model from the read model.

```
+--------+     Command     +--Write Model--+
| Client | -------------> | Normalized    |
|        |                | (optimized    |
|        |                |  for writes)  |
|        |                +-------+-------+
|        |                        |
|        |                   Events / CDC
|        |                        |
|        |                        v
|        |     Query       +--Read Model---+
|        | <------------- | Denormalized  |
+--------+                | (optimized    |
                          |  for reads)   |
                          +--------------+
```

### When CQRS Makes Sense

| Use CQRS | Don't Use CQRS |
| --------- | -------------- |
| Read and write models differ significantly | Simple CRUD with same read/write shape |
| Different databases for read/write | Small application, single team |
| 100:1+ read-to-write ratio | Strong consistency required everywhere |
| Complex domain logic on writes | Operational simplicity is the priority |

### CQRS Without Event Sourcing

You can use CQRS without event sourcing:

```
Write: PostgreSQL (normalized, ACID transactions)
  |
  v (CDC / Debezium)
Read: Elasticsearch (denormalized, fast search)
      Redis (cached aggregations)
```

---

## Saga Pattern

Manage distributed transactions across multiple microservices without a distributed lock.

### The Problem

```
Order Service -> Payment Service -> Inventory Service -> Shipping Service

If Inventory fails after Payment succeeds:
  Need to refund payment (compensating transaction)
```

### Choreography Saga

Each service listens for events and reacts:

```
Order Service: publishes "OrderCreated"
  |
  v
Payment Service: listens for "OrderCreated" -> charges payment -> publishes "PaymentCompleted"
  |
  v
Inventory Service: listens for "PaymentCompleted" -> reserves stock -> publishes "StockReserved"
  |
  v
Shipping Service: listens for "StockReserved" -> creates shipment -> publishes "ShipmentCreated"

FAILURE: Inventory out of stock -> publishes "StockReservationFailed"
  |
  v
Payment Service: listens for "StockReservationFailed" -> refunds payment -> publishes "PaymentRefunded"
  |
  v
Order Service: listens for "PaymentRefunded" -> marks order as cancelled
```

### Orchestration Saga

A central orchestrator coordinates the steps:

```
+--Saga Orchestrator--+
| 1. Create order     |
| 2. Charge payment   | --> Payment Service
| 3. Reserve stock    | --> Inventory Service
| 4. Create shipment  | --> Shipping Service
+---------------------+

If step 3 fails:
  Orchestrator runs compensations:
  - Reverse step 2: Refund payment
  - Reverse step 1: Cancel order
```

### Choreography vs Orchestration

| Aspect | Choreography | Orchestration |
| ------ | ------------ | ------------- |
| **Coordination** | Decentralized (events) | Centralized (orchestrator) |
| **Coupling** | Loose (services don't know each other) | Orchestrator knows all services |
| **Visibility** | Hard to trace (distributed events) | Easy to trace (single coordinator) |
| **Complexity** | Simple for few steps, complex for many | Handles complex workflows well |
| **Failure handling** | Each service handles its own compensation | Orchestrator manages all compensations |
| **Best for** | 2-4 services, simple flows | 5+ services, complex flows, visibility needed |

---

## Transactional Outbox

Solve: "How do I atomically update a database AND publish an event?"

### The Problem

```
1. Update database (succeeds)
2. Publish to Kafka (fails -- network issue)
Result: Database updated but event not published -> inconsistency

OR:
1. Publish to Kafka (succeeds)
2. Update database (fails)
Result: Event published but database not updated -> inconsistency
```

### The Solution

```
+--Within Single DB Transaction--+
| 1. UPDATE orders SET status='paid' WHERE id=123         |
| 2. INSERT INTO outbox (event_type, payload)             |
|    VALUES ('OrderPaid', '{"order_id": 123}')            |
| COMMIT                                                   |
+----------------------------------------------------------+

Separately (CDC / polling):
  Debezium reads outbox table changes -> publishes to Kafka
  OR
  Polling job reads outbox table -> publishes to Kafka -> marks as published
```

### Implementation Options

| Method | How | Pros | Cons |
| ------ | --- | ---- | ---- |
| **CDC (Debezium)** | Read WAL/binlog of outbox table | No polling, low latency, reliable | Extra infrastructure (Debezium + Kafka Connect) |
| **Polling publisher** | SELECT * FROM outbox WHERE published = false | Simple, no extra infra | Polling delay, DB load |
| **Listen/Notify (PG)** | PostgreSQL NOTIFY on outbox insert | Low latency, simple | Unreliable (fire-and-forget) |

### Outbox Table Schema

```sql
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,          -- "OrderPaid"
    aggregate_id TEXT NOT NULL,        -- "order-123"
    payload JSONB NOT NULL,            -- event data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ           -- NULL until published
);

CREATE INDEX idx_outbox_unpublished ON outbox(created_at) WHERE published_at IS NULL;
```

---

## Choreography vs Orchestration

### When to Use Each

```
Choreography (decentralized):
  Service A --event--> Service B --event--> Service C

  Use when:
  - Simple, linear flows
  - Services are truly independent
  - Teams are autonomous
  - Low coupling is critical

Orchestration (centralized):
  Orchestrator --command--> Service A
               --command--> Service B
               --command--> Service C

  Use when:
  - Complex flows with branching/conditions
  - Need visibility into flow state
  - Centralized error handling
  - Business process involves many steps
```

### Hybrid Approach

Most production systems use both:

```
Domain-level: Choreography
  OrderService publishes "OrderCreated"
  Multiple services react independently

Within a service: Orchestration
  PaymentService orchestrates: validate card -> charge -> create receipt
```

---

## Event Schema Evolution

Events are immutable -- you can't change published events. But schemas evolve.

### Strategies

| Strategy | How | Example |
| -------- | --- | ------- |
| **Versioned events** | New event type for breaking changes | `OrderCreatedV1`, `OrderCreatedV2` |
| **Additive only** | Only add fields, never remove | Add `currency` field, keep `amount` |
| **Schema registry** | Central schema with compatibility checks | Confluent Schema Registry (Avro) |
| **Upcasting** | Transform old events to new format on read | Read V1, convert to V2 in-memory |

### Compatibility Types (Schema Registry)

| Type | Rule | Consumer Impact |
| ---- | ---- | --------------- |
| **Backward** | New schema can read old data | Safe to deploy new consumers first |
| **Forward** | Old schema can read new data | Safe to deploy new producers first |
| **Full** | Both backward and forward | Deploy in any order |
| **None** | No compatibility check | Breaking changes allowed |

---

## Common Interview Questions

1. **What is event sourcing and when would you use it?** Store all changes as immutable events. Rebuild state by replaying events. Use for: audit trails, temporal queries, financial systems, collaborative editing. Don't use for: simple CRUD, small teams, when eventual consistency is unacceptable.

2. **Explain the saga pattern.** A way to manage distributed transactions without two-phase commit. Each service performs its step and publishes an event. If a step fails, compensating transactions undo previous steps. Choreography (event-driven) or orchestration (coordinator).

3. **What is the transactional outbox pattern?** Write the event to an outbox table in the same database transaction as the business change. A separate process (CDC or polling) reads the outbox and publishes to the message broker. Guarantees atomicity without distributed transactions.

4. **Choreography vs orchestration?** Choreography: services react to events independently (loose coupling, hard to trace). Orchestration: central coordinator directs services (visible flow, tighter coupling). Use choreography for simple flows, orchestration for complex ones.

5. **How do you handle event schema changes?** Use additive-only changes (add fields, never remove). For breaking changes, version events (V1, V2). Use a schema registry for compatibility enforcement. Upcast old events to new format on read.

6. **How do you guarantee exactly-once in an event-driven system?** You can't across independent systems. Use idempotent consumers (dedup key + idempotency table). Within Kafka: idempotent producer + transactions + read_committed consumers.

7. **What is the dual-write problem?** Writing to a database and a message broker in two separate operations. If one fails, the system is inconsistent. Solution: transactional outbox pattern.

8. **How do you debug event-driven systems?** Correlation IDs across all events, centralized logging, distributed tracing (Jaeger/Zipkin), dead letter queue monitoring, event replay in test environments.
