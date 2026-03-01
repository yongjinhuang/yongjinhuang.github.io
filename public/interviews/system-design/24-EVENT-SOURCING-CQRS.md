# Design an Event Sourcing & CQRS System

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Notes |
|---|-------------|-------|
| 1 | Accept commands that mutate aggregate state | CreateOrder, AddItem, PayOrder, CancelOrder |
| 2 | Persist every state change as an immutable event | Append-only event log |
| 3 | Reconstruct current state by replaying events | No mutable state stored directly |
| 4 | Serve queries from read-optimized projections | Separate query side (CQRS) |
| 5 | Support event replay to rebuild any projection | Historical and new projections |
| 6 | Enforce aggregate-level optimistic concurrency | Version number per aggregate |
| 7 | Publish events to downstream consumers | Event streaming / pub-sub |
| 8 | Support snapshot optimization | Avoid replaying all events on large aggregates |
| 9 | Coordinate distributed transactions via Sagas | Long-running process managers |
| 10 | Support event schema evolution | Backward-compatible event versioning |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Write latency (event append) | < 10ms p99 |
| 2 | Read latency (projected views) | < 50ms p99 |
| 3 | Event throughput | 100,000 events/sec |
| 4 | Durability | Zero event loss (at-least-once delivery) |
| 5 | Write-side consistency | Strong (linearizable per aggregate) |
| 6 | Read-side consistency | Eventual (acceptable read lag < 1s) |
| 7 | Availability | 99.99% uptime |
| 8 | Scalability | Horizontal scaling on read side |
| 9 | Auditability | Full history preserved indefinitely |
| 10 | Idempotency | Exactly-once event processing on read side |

### Out of Scope

- Cross-aggregate transactions (use Sagas instead)
- Real-time UI push notifications (separate concern)
- Multi-region active-active writes (covered in scaling section)

---

### Scale Estimation

```
Assumptions:
  - 10M active users/day
  - Average 50 commands/user/day
  - Each event payload: ~1 KB average

Daily event volume:
  10M * 50 = 500M events/day
  500M / 86,400s = ~5,800 events/sec (average)
  Peak factor 17x -> ~100,000 events/sec (peak)

Storage growth:
  500M events/day * 1KB = 500 GB/day
  1 year = 500 GB * 365 = ~180 TB/year
  With 3x replication = ~540 TB/year

Snapshot optimization:
  Snapshot every 100 events
  Snapshot size: ~5KB
  500M / 100 = 5M snapshots/day = 25 GB/day

Read model (projected views):
  100 aggregate types * avg 10M active aggregates = 1B rows
  Average read model row: 2KB -> ~2 TB for active read models

Network bandwidth (event publishing):
  100,000 events/sec * 1KB = ~100 MB/s outbound to consumers
```

---

## 2. API Design

### Command API (Write Side)

All commands go through the Command Service. Each command targets a specific aggregate instance.

```
POST /commands/orders
Content-Type: application/json

{
  "commandType": "CreateOrder",
  "aggregateId": "order-uuid-1234",       // optional: server generates if absent
  "expectedVersion": -1,                  // -1 means aggregate must not exist
  "payload": {
    "customerId": "cust-5678",
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "req-abc",
    "causationId": null,
    "userId": "user-999",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

Response 202 Accepted:
{
  "aggregateId": "order-uuid-1234",
  "newVersion": 0,
  "eventId": "evt-aaa111"
}

Response 409 Conflict (optimistic concurrency violation):
{
  "error": "CONCURRENCY_CONFLICT",
  "currentVersion": 3,
  "expectedVersion": 2
}
```

```
POST /commands/orders/{aggregateId}/items
{
  "commandType": "AddItem",
  "expectedVersion": 0,
  "payload": {
    "productId": "prod-xyz",
    "quantity": 2,
    "unitPrice": 29.99
  }
}
```

```
POST /commands/orders/{aggregateId}/payment
{
  "commandType": "PayOrder",
  "expectedVersion": 3,
  "payload": {
    "paymentMethod": "CREDIT_CARD",
    "transactionId": "txn-888"
  }
}
```

```
DELETE /commands/orders/{aggregateId}
{
  "commandType": "CancelOrder",
  "expectedVersion": 4,
  "payload": {
    "reason": "CustomerRequest"
  }
}
```

### Query API (Read Side)

Queries hit the read model directly. No event reconstruction at query time.

```
GET /queries/orders/{orderId}
Response 200:
{
  "orderId": "order-uuid-1234",
  "customerId": "cust-5678",
  "status": "PAID",
  "items": [...],
  "total": 59.98,
  "createdAt": "2024-01-15T10:30:00Z",
  "paidAt": "2024-01-15T10:35:00Z",
  "_version": 4,
  "_lastEventId": "evt-bbb222"
}
```

```
GET /queries/orders?customerId=cust-5678&status=PAID&page=1&limit=20
Response 200:
{
  "data": [...],
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

```
GET /queries/orders/{orderId}/history
Response 200:
{
  "aggregateId": "order-uuid-1234",
  "events": [
    { "version": 0, "type": "OrderCreated", "timestamp": "...", "payload": {...} },
    { "version": 1, "type": "ItemAdded", "timestamp": "...", "payload": {...} },
    { "version": 2, "type": "ItemAdded", "timestamp": "...", "payload": {...} },
    { "version": 3, "type": "OrderPaid", "timestamp": "...", "payload": {...} }
  ]
}
```

```
GET /queries/projections/{projectionName}/status
Response 200:
{
  "projectionName": "OrderSummaryProjection",
  "status": "RUNNING",
  "lastProcessedEventId": "evt-bbb222",
  "lastProcessedPosition": 98450231,
  "lag": 12,
  "lagMs": 450
}
```

---

## 3. Data Model

### Event Store Schema

```sql
-- Core event store table (append-only, NEVER update or delete)
CREATE TABLE events (
    -- Unique event identifier (UUID v4 or ULID)
    event_id        UUID            NOT NULL,

    -- Aggregate identity
    aggregate_type  VARCHAR(100)    NOT NULL,  -- e.g., 'Order', 'Account'
    aggregate_id    UUID            NOT NULL,

    -- Sequence within this aggregate (0-based, monotonically increasing)
    version         BIGINT          NOT NULL,

    -- Event type name (used for deserialization)
    event_type      VARCHAR(200)    NOT NULL,  -- e.g., 'OrderCreated', 'ItemAdded'

    -- Schema version for upcasting
    event_schema_version INT        NOT NULL DEFAULT 1,

    -- Event payload (JSON or binary)
    payload         JSONB           NOT NULL,

    -- Cross-cutting metadata
    metadata        JSONB           NOT NULL,
    -- metadata includes: correlationId, causationId, userId, ipAddress

    -- Global ordering position (assigned by event store, monotonically increasing)
    global_position BIGSERIAL       NOT NULL,

    -- Wall clock time (informational only, not used for ordering)
    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Ensure exactly one event per aggregate version (prevents duplicates)
    CONSTRAINT pk_events PRIMARY KEY (event_id),
    CONSTRAINT uq_aggregate_version UNIQUE (aggregate_type, aggregate_id, version)
);

-- Efficient replay by aggregate
CREATE INDEX idx_events_aggregate
    ON events (aggregate_type, aggregate_id, version ASC);

-- Global ordered replay for projections
CREATE INDEX idx_events_global_position
    ON events (global_position ASC);

-- Efficient lookup by event type (for selective projections)
CREATE INDEX idx_events_type
    ON events (event_type, global_position ASC);
```

### Snapshot Schema

```sql
-- Snapshots for aggregate state optimization
CREATE TABLE snapshots (
    snapshot_id     UUID            NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type  VARCHAR(100)    NOT NULL,
    aggregate_id    UUID            NOT NULL,

    -- The version number this snapshot represents
    version         BIGINT          NOT NULL,

    -- Serialized aggregate state
    state           JSONB           NOT NULL,

    -- Snapshot schema version for migration
    state_schema_version INT        NOT NULL DEFAULT 1,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_snapshots PRIMARY KEY (snapshot_id),
    CONSTRAINT uq_snapshot_version UNIQUE (aggregate_type, aggregate_id, version)
);

-- Get latest snapshot for an aggregate
CREATE INDEX idx_snapshots_aggregate_version
    ON snapshots (aggregate_type, aggregate_id, version DESC);
```

### Read Model Projection Schema (Order Summary Example)

```sql
-- Order summary read model (built by projection, optimized for queries)
CREATE TABLE order_summary (
    order_id        UUID            PRIMARY KEY,
    customer_id     UUID            NOT NULL,
    status          VARCHAR(50)     NOT NULL,  -- CREATED, CONFIRMED, PAID, CANCELLED
    item_count      INT             NOT NULL DEFAULT 0,
    total_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    currency        CHAR(3)         NOT NULL,
    created_at      TIMESTAMPTZ,
    confirmed_at    TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancellation_reason VARCHAR(500),

    -- Track which event version built this projection
    last_event_version BIGINT       NOT NULL,
    last_event_id   UUID            NOT NULL,

    -- Global position of last processed event (for lag tracking)
    checkpoint_position BIGINT      NOT NULL
);

CREATE INDEX idx_order_summary_customer
    ON order_summary (customer_id, created_at DESC);

CREATE INDEX idx_order_summary_status
    ON order_summary (status, created_at DESC);

-- Order items read model (denormalized for query performance)
CREATE TABLE order_items (
    order_id        UUID            NOT NULL,
    line_item_id    UUID            NOT NULL,
    product_id      UUID            NOT NULL,
    product_name    VARCHAR(500),
    quantity        INT             NOT NULL,
    unit_price      DECIMAL(10,2)   NOT NULL,
    line_total      DECIMAL(12,2)   NOT NULL,
    CONSTRAINT pk_order_items PRIMARY KEY (order_id, line_item_id)
);

-- Projection checkpoint tracking
CREATE TABLE projection_checkpoints (
    projection_name     VARCHAR(200)    PRIMARY KEY,
    last_position       BIGINT          NOT NULL DEFAULT 0,
    last_event_id       UUID,
    status              VARCHAR(50)     NOT NULL DEFAULT 'RUNNING',
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### Concrete Event Examples

```json
// Event 1: OrderCreated (version 0)
{
  "event_id": "evt-aaa111",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 0,
  "event_type": "OrderCreated",
  "event_schema_version": 1,
  "payload": {
    "customerId": "cust-5678",
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "req-abc",
    "causationId": null,
    "userId": "user-999"
  },
  "global_position": 98450001,
  "occurred_at": "2024-01-15T10:30:00Z"
}

// Event 2: ItemAdded (version 1)
{
  "event_id": "evt-bbb222",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 1,
  "event_type": "ItemAdded",
  "event_schema_version": 1,
  "payload": {
    "lineItemId": "item-001",
    "productId": "prod-xyz",
    "quantity": 2,
    "unitPrice": 29.99
  },
  "metadata": { "correlationId": "req-def", "causationId": "evt-aaa111", "userId": "user-999" },
  "global_position": 98450002,
  "occurred_at": "2024-01-15T10:31:00Z"
}

// Event 3: ItemAdded (version 2)
{
  "event_id": "evt-ccc333",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 2,
  "event_type": "ItemAdded",
  "event_schema_version": 1,
  "payload": {
    "lineItemId": "item-002",
    "productId": "prod-abc",
    "quantity": 1,
    "unitPrice": 49.99
  },
  "metadata": { "correlationId": "req-ghi", "causationId": "evt-aaa111", "userId": "user-999" },
  "global_position": 98450003,
  "occurred_at": "2024-01-15T10:32:00Z"
}

// Event 4: OrderPaid (version 3)
{
  "event_id": "evt-ddd444",
  "aggregate_type": "Order",
  "aggregate_id": "order-uuid-1234",
  "version": 3,
  "event_type": "OrderPaid",
  "event_schema_version": 1,
  "payload": {
    "paymentMethod": "CREDIT_CARD",
    "transactionId": "txn-888",
    "amountPaid": 109.97
  },
  "metadata": { "correlationId": "req-jkl", "causationId": "evt-ccc333", "userId": "user-999" },
  "global_position": 98450010,
  "occurred_at": "2024-01-15T10:35:00Z"
}
```

---

## 4. High-Level Architecture

### Overall System Architecture

```
+------------------+      Commands      +------------------+
|                  | -----------------> |                  |
|   Client Apps    |                    |  Command Service  |
|  (Web / Mobile)  |                    |  (Write Side)    |
|                  | <----------------- |                  |
+------------------+    202 Accepted    +--------+---------+
         |                                       |
         |        Queries                        | Validate + Apply
         |                                       | Invariants
         v                                       v
+------------------+              +-----------------------------+
|                  |              |                             |
|   Query Service  |              |       Event Store           |
|  (Read Side)     |              |  (Append-Only Log)          |
|                  |              |  PostgreSQL / EventStoreDB  |
+--------+---------+              |  / Apache Kafka             |
         |                        +-------------+---------------+
         |                                      |
         v                                      | Events Published
+------------------+                            v
|  Read Models /   |           +----------------+----------------+
|  Projections     | <-------- |     Event Bus / Message Broker  |
|  (PostgreSQL /   |           |     (Kafka / RabbitMQ)          |
|   Redis /        |           +----------------+----------------+
|   Elasticsearch) |                            |
+------------------+                            |
                               +----------------+--------------+
                               |                               |
                    +----------+--------+          +-----------+---------+
                    |                   |          |                     |
                    |  Projection       |          |  Saga Coordinator   |
                    |  Builders         |          |  (Process Manager)  |
                    |  (Subscriptions)  |          |                     |
                    +-------------------+          +---------------------+
```

### Command Processing Flow

```
Client                Command Service           Event Store           Event Bus
  |                         |                        |                    |
  |--[POST /commands/]----->|                        |                    |
  |                         |                        |                    |
  |                         |--[Load Snapshot]------>|                    |
  |                         |<--[Snapshot v=50]------|                    |
  |                         |                        |                    |
  |                         |--[Load Events v51+]--->|                    |
  |                         |<--[Events 51..55]------|                    |
  |                         |                        |                    |
  |                         |--[Reconstruct State]   |                    |
  |                         |  (apply events to      |                    |
  |                         |   snapshot)            |                    |
  |                         |                        |                    |
  |                         |--[Validate Command]    |                    |
  |                         |  (check invariants)    |                    |
  |                         |                        |                    |
  |                         |--[Append Event]------->|                    |
  |                         |  version=56            |                    |
  |                         |<--[OK, position=N]-----|                    |
  |                         |                        |                    |
  |                         |                        |--[Publish Event]-->|
  |                         |                        |                    |
  |<--[202 Accepted]--------|                        |                    |
  |   {version: 56}         |                        |                    |
```

### Read Side / Projection Flow

```
Event Store          Event Bus           Projection Builder      Read Model DB
    |                    |                       |                     |
    |--[New Event]------>|                       |                     |
    |                    |--[Deliver to subs]--->|                     |
    |                    |                       |                     |
    |                    |                       |--[Load checkpoint]->|
    |                    |                       |<--[position=N-1]----|
    |                    |                       |                     |
    |                    |                       |--[Handle Event]-    |
    |                    |                       |  Update read model  |
    |                    |                       |--[Upsert rows]----->|
    |                    |                       |--[Save checkpoint]->|
    |                    |                       |<--[ACK]-------------|
    |                    |<--[ACK to bus]--------|                     |
```

---

## 5. Deep Dive Sections

### 5.1 Event Sourcing Fundamentals

Event Sourcing is an architectural pattern where the state of an aggregate is derived entirely from a sequence of events, rather than storing the current state directly.

**Core Principle: The Event Log IS the Source of Truth**

```
Traditional CRUD:                    Event Sourcing:
+------------------+                 +----------------------------------+
| orders table     |                 | events table                     |
+------------------+                 +----------------------------------+
| id | status|total|                 | pos | type        | payload      |
|----|-------|-----|                 |-----|-------------|--------------|
| 1  | PAID  |110  |  <-- current    |  1  | OrderCreated| {cust:5678}  |
+------------------+                 |  2  | ItemAdded   | {qty:2,p:30} |
                                     |  3  | ItemAdded   | {qty:1,p:50} |
 History: GONE                       |  4  | OrderPaid   | {txn:888}    |
                                     +----------------------------------+
                                      Current state = REPLAY of events
```

**State Reconstruction Algorithm**

```python
def load_aggregate(aggregate_id: str) -> Order:
    # Step 1: Try to load the latest snapshot
    snapshot = snapshot_store.get_latest(aggregate_id)

    if snapshot:
        # Start from snapshot state
        order = Order.from_snapshot(snapshot.state)
        start_version = snapshot.version + 1
    else:
        # Start from empty state
        order = Order()
        start_version = 0

    # Step 2: Load events after the snapshot version
    events = event_store.load(
        aggregate_id=aggregate_id,
        from_version=start_version
    )

    # Step 3: Apply each event in order
    for event in events:
        order.apply(event)

    return order

class Order:
    def apply(self, event: Event) -> None:
        # Dispatch to the correct event handler
        handler_name = f"on_{event.event_type}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(event.payload)
        self.version = event.version

    def on_OrderCreated(self, payload):
        self.customer_id = payload['customerId']
        self.currency = payload['currency']
        self.status = 'CREATED'
        self.items = []
        self.total = 0

    def on_ItemAdded(self, payload):
        self.items.append({
            'line_item_id': payload['lineItemId'],
            'product_id': payload['productId'],
            'quantity': payload['quantity'],
            'unit_price': payload['unitPrice']
        })
        self.total += payload['quantity'] * payload['unitPrice']

    def on_OrderPaid(self, payload):
        self.status = 'PAID'
        self.transaction_id = payload['transactionId']
```

**Benefits of Event Sourcing**

```
+----------------------------------+------------------------------------------+
| Benefit                          | Explanation                              |
+----------------------------------+------------------------------------------+
| Complete audit trail             | Every change is recorded with who/when   |
| Time-travel queries              | Reconstruct state at any point in time   |
| Event-driven integration         | Publish events to downstream systems     |
| Debugging by replay              | Reproduce bugs by replaying event stream |
| New projections on demand        | Build new views from historical events   |
| Temporal decoupling              | Consumers process at their own pace      |
+----------------------------------+------------------------------------------+
```

---

### 5.2 CQRS Pattern: Command Side vs Query Side

CQRS (Command Query Responsibility Segregation) separates the write model (commands) from the read model (queries). This allows each side to be optimized independently.

```
+============================================================+
|                   CQRS ARCHITECTURE                        |
+============================================================+

  WRITE SIDE (Command)              READ SIDE (Query)
  +----------------------+          +----------------------+
  |                      |          |                      |
  |  Command Handlers    |          |  Query Handlers      |
  |  - Validate input    |          |  - No business logic |
  |  - Load aggregate    |          |  - Simple DB selects |
  |  - Check invariants  |          |  - Optimized indexes |
  |  - Emit events       |          |  - Cached results    |
  |                      |          |                      |
  +----------+-----------+          +----------+-----------+
             |                                 ^
             | Events                          | Read Model
             v                                 |
  +----------+-----------+          +----------+-----------+
  |                      |          |                      |
  |    Event Store       +--------->+  Projection Engine   |
  |  (Source of Truth)   | Events   |  (Event Handlers)    |
  |                      |          |                      |
  +----------------------+          +----------+-----------+
                                               |
                                               | Upserts
                                               v
                                    +----------+-----------+
                                    |                      |
                                    |   Read Database      |
                                    |  (Denormalized,      |
                                    |   Query-Optimized)   |
                                    |                      |
                                    +----------------------+
```

**Command Model (Normalized for Consistency)**
```
  Aggregate root enforces all invariants.
  Complex object graph, but only queried to process commands.
  Strong consistency guaranteed within an aggregate.
```

**Query Model (Denormalized for Performance)**
```
  Flat, query-optimized structures.
  Multiple views of the same data for different use cases.
  Eventual consistency acceptable (read lag typically < 1s).
  Can use different databases per projection:
    - PostgreSQL for relational queries
    - Redis for counters and leaderboards
    - Elasticsearch for full-text search
    - ClickHouse for analytics
```

---

### 5.3 Event Store Design

The event store is the most critical component. It must provide:

```
REQUIREMENTS:
  1. Append-only writes (no update, no delete)
  2. Strong ordering per aggregate (version number)
  3. Global ordering for projection processing
  4. Optimistic concurrency control (version check)
  5. Efficient range reads by aggregate
  6. Global position-based reads for subscriptions

TECHNOLOGIES:
  +---------------------+--------------------------------------------------+
  | EventStoreDB        | Purpose-built, native event sourcing support     |
  | Apache Kafka        | High-throughput, partition-per-aggregate-type    |
  | PostgreSQL          | Reliable, with UNIQUE constraint for concurrency |
  | DynamoDB            | Serverless, conditional writes for concurrency   |
  | Apache Cassandra    | High-write throughput, eventual consistency      |
  +---------------------+--------------------------------------------------+
```

**Optimistic Concurrency with PostgreSQL**

```sql
-- Append event with version check (prevents lost updates)
INSERT INTO events (
    event_id, aggregate_type, aggregate_id,
    version, event_type, payload, metadata
)
VALUES (
    $1, $2, $3,
    (
        -- expected_version + 1 must equal next available version
        SELECT COALESCE(MAX(version), -1) + 1
        FROM events
        WHERE aggregate_type = $2 AND aggregate_id = $3
        -- If this returns a version != expected_version + 1,
        -- the UNIQUE constraint on (aggregate_type, aggregate_id, version)
        -- will raise a conflict error
    ),
    $4, $5, $6
)
ON CONFLICT ON CONSTRAINT uq_aggregate_version DO NOTHING
RETURNING version;

-- If 0 rows returned -> concurrency conflict -> retry or fail
```

**EventStoreDB Append Pattern**

```csharp
// EventStoreDB native client (C#)
var eventData = new EventData(
    Uuid.NewUuid(),
    "OrderCreated",
    JsonSerializer.SerializeToUtf8Bytes(payload),
    JsonSerializer.SerializeToUtf8Bytes(metadata)
);

// StreamRevision.None = must not exist
// StreamRevision.Any = no concurrency check
// new StreamRevision(5) = expect version 5
await client.AppendToStreamAsync(
    streamName: $"Order-{orderId}",
    expectedRevision: new StreamRevision(expectedVersion),
    events: new[] { eventData }
);
```

---

### 5.4 Aggregate Pattern

An aggregate is a cluster of domain objects that is treated as a single unit. The aggregate root enforces all business invariants.

```
+----------------------------------------+
|         Order Aggregate                |
|                                        |
|  Root: Order                           |
|  +----------------------------------+  |
|  | id: UUID                         |  |
|  | customerId: UUID                  |  |
|  | status: OrderStatus              |  |
|  | items: List<LineItem>            |  |
|  | version: int                     |  |
|  +----------------------------------+  |
|                                        |
|  Children: LineItem[]                  |
|  +----------------------------------+  |
|  | lineItemId: UUID                 |  |
|  | productId: UUID                  |  |
|  | quantity: int                    |  |
|  | unitPrice: decimal               |  |
|  +----------------------------------+  |
|                                        |
|  INVARIANTS:                           |
|  - Cannot add items to PAID order      |
|  - Cannot pay empty order              |
|  - Total must match sum of items       |
|  - Cannot cancel already-paid order   |
+----------------------------------------+
```

**Command Handler + Aggregate Pattern**

```python
class OrderCommandHandler:
    def __init__(self, event_store, snapshot_store):
        self.event_store = event_store
        self.snapshot_store = snapshot_store

    def handle_add_item(self, command: AddItemCommand):
        # 1. Load aggregate (snapshot + events)
        order = self._load_order(command.aggregate_id)

        # 2. Validate expected version (optimistic concurrency)
        if order.version != command.expected_version:
            raise ConcurrencyConflictError(order.version, command.expected_version)

        # 3. Execute business logic (returns events, does not mutate)
        new_events = order.add_item(
            product_id=command.product_id,
            quantity=command.quantity,
            unit_price=command.unit_price
        )

        # 4. Persist events
        self.event_store.append(
            aggregate_id=command.aggregate_id,
            events=new_events,
            expected_version=command.expected_version
        )

        # 5. Maybe create snapshot
        if (order.version + len(new_events)) % SNAPSHOT_FREQUENCY == 0:
            final_state = order.apply_all(new_events)
            self.snapshot_store.save(final_state.to_snapshot())

class Order:
    def add_item(self, product_id, quantity, unit_price) -> List[Event]:
        # Guard: enforce invariants BEFORE emitting event
        if self.status != OrderStatus.CREATED:
            raise InvalidOperationError(
                f"Cannot add items to order in status {self.status}"
            )
        if quantity <= 0:
            raise ValidationError("Quantity must be positive")

        # Return event (do not apply yet)
        return [Event(
            event_type="ItemAdded",
            payload={
                "lineItemId": str(uuid4()),
                "productId": product_id,
                "quantity": quantity,
                "unitPrice": float(unit_price)
            }
        )]
```

---

### 5.5 Projections: Building Read-Optimized Views

A projection is an event handler that consumes the event stream and maintains a read-optimized view.

```python
class OrderSummaryProjection:
    """
    Subscribes to all Order events and maintains the order_summary table.
    Processes events in global_position order.
    """

    HANDLED_EVENTS = {
        'OrderCreated', 'ItemAdded', 'OrderConfirmed',
        'OrderPaid', 'OrderCancelled'
    }

    def __init__(self, db, checkpoint_store):
        self.db = db
        self.checkpoint_store = checkpoint_store

    def run(self):
        checkpoint = self.checkpoint_store.get('OrderSummaryProjection')
        start_position = checkpoint.last_position + 1

        # Subscribe to event stream from checkpoint
        for event in self.event_store.subscribe_from(start_position):
            if event.event_type in self.HANDLED_EVENTS:
                self._handle(event)
            self._save_checkpoint(event.global_position)

    def _handle(self, event: Event):
        handler = getattr(self, f'on_{event.event_type}', None)
        if handler:
            handler(event)

    def on_OrderCreated(self, event):
        self.db.execute("""
            INSERT INTO order_summary
                (order_id, customer_id, status, currency,
                 item_count, total_amount, created_at,
                 last_event_version, last_event_id, checkpoint_position)
            VALUES ($1, $2, 'CREATED', $3, 0, 0, $4, $5, $6, $7)
            ON CONFLICT (order_id) DO NOTHING
        """, [
            event.aggregate_id,
            event.payload['customerId'],
            event.payload['currency'],
            event.occurred_at,
            event.version,
            event.event_id,
            event.global_position
        ])

    def on_ItemAdded(self, event):
        self.db.execute("""
            UPDATE order_summary SET
                item_count = item_count + $2,
                total_amount = total_amount + ($3 * $4),
                last_event_version = $5,
                last_event_id = $6,
                checkpoint_position = $7
            WHERE order_id = $1
        """, [
            event.aggregate_id,
            event.payload['quantity'],
            event.payload['quantity'],
            event.payload['unitPrice'],
            event.version,
            event.event_id,
            event.global_position
        ])

    def on_OrderPaid(self, event):
        self.db.execute("""
            UPDATE order_summary SET
                status = 'PAID',
                paid_at = $2,
                last_event_version = $3,
                last_event_id = $4,
                checkpoint_position = $5
            WHERE order_id = $1
        """, [
            event.aggregate_id,
            event.occurred_at,
            event.version,
            event.event_id,
            event.global_position
        ])
```

**Multiple Projections from Same Event Stream**

```
Event Stream (global order):
  pos=1: OrderCreated (order-A)
  pos=2: ItemAdded (order-A)
  pos=3: OrderCreated (order-B)
  pos=4: OrderPaid (order-A)
  pos=5: ItemAdded (order-B)

Projection 1: OrderSummary       (checkpoint at pos=4)
  +-------------------+
  | order-A: PAID,$60 |
  | order-B: CREATED  |
  +-------------------+

Projection 2: CustomerOrderCount (checkpoint at pos=5)
  +--------------------+
  | cust-X: 2 orders   |
  +--------------------+

Projection 3: Analytics/Revenue  (checkpoint at pos=4)
  +---------------------+
  | Jan-2024: $60       |
  +---------------------+

Each projection has its OWN checkpoint and processes independently.
```

---

### 5.6 Snapshot Optimization

Without snapshots, loading a high-version aggregate requires replaying all events from the beginning.

```
WITHOUT SNAPSHOTS (version=10,000):
  Load 10,000 events from DB -> Apply 10,000 events -> Current state
  Cost: O(N) where N = event count

WITH SNAPSHOTS (snapshot at v=9,900, then 100 more events):
  Load 1 snapshot + 100 events -> Apply 100 events -> Current state
  Cost: O(S) where S = snapshot frequency

SNAPSHOT FREQUENCY OPTIMIZATION:
  +------------------+------------------+------------------+
  | Frequency        | Load time saved  | Storage overhead |
  +------------------+------------------+------------------+
  | Every 10 events  | 90%              | High (many snaps)|
  | Every 100 events | 99%              | Medium           |
  | Every 1000 events| 99.9%            | Low              |
  +------------------+------------------+------------------+
  Recommendation: Every 100-500 events depending on aggregate complexity
```

**Snapshot Creation Strategy**

```python
class SnapshotStrategy:
    SNAPSHOT_THRESHOLD = 100  # Create snapshot every 100 events

    def should_snapshot(self, aggregate: Aggregate) -> bool:
        # Snapshot if version crossed a threshold boundary
        return aggregate.version % self.SNAPSHOT_THRESHOLD == 0

    def create_snapshot(self, aggregate: Aggregate) -> Snapshot:
        return Snapshot(
            aggregate_type=aggregate.__class__.__name__,
            aggregate_id=aggregate.id,
            version=aggregate.version,
            state=aggregate.to_dict(),
            state_schema_version=aggregate.SCHEMA_VERSION
        )

class Order:
    SCHEMA_VERSION = 2  # Increment when state shape changes

    def to_dict(self) -> dict:
        return {
            'customerId': self.customer_id,
            'status': self.status.value,
            'currency': self.currency,
            'items': [item.to_dict() for item in self.items],
            'total': float(self.total)
        }

    @classmethod
    def from_snapshot(cls, snapshot: Snapshot) -> 'Order':
        # Handle schema migrations if snapshot is old version
        state = cls._migrate_snapshot(snapshot.state, snapshot.state_schema_version)
        order = cls()
        order.customer_id = state['customerId']
        order.status = OrderStatus(state['status'])
        order.currency = state['currency']
        order.items = [LineItem.from_dict(i) for i in state['items']]
        order.total = Decimal(str(state['total']))
        order.version = snapshot.version
        return order
```

---

### 5.7 Eventual Consistency: Read Model Lag

The read model lags behind the write model. This is acceptable for most use cases but requires careful handling.

```
Timeline:
  T=0ms:  Command received by Command Service
  T=5ms:  Event appended to Event Store
  T=5ms:  Event published to Kafka
  T=10ms: Projection Builder receives event
  T=15ms: Projection Builder updates Read Model DB
  T=15ms: Read Model is now consistent

  Client reads at T=12ms:
    -> Sees OLD state (read model not yet updated)
    -> This is the "eventual consistency window" (~15ms typical)

STRATEGIES TO HANDLE READ LAG:

1. Read Your Own Writes (RYOW):
   - Return updated state in command response
   - Client uses returned state for immediate feedback
   - Avoids the need to query the read model immediately

2. Optimistic UI:
   - Client applies expected change locally
   - Reconciles when server confirms

3. Versioned reads:
   GET /queries/orders/{id}?minVersion=56
   -> Query service waits until read model version >= 56
   -> Polling or server-sent events to signal readiness

4. Explicit consistency tokens:
   POST /commands/orders -> returns { eventId: "evt-xxx" }
   GET /queries/orders/{id}?afterEvent=evt-xxx
   -> Returns 202 with Retry-After if not yet consistent
```

---

### 5.8 Saga Pattern: Distributed Transaction Coordination

Sagas coordinate multi-step business processes across aggregate boundaries or services using events.

```
+=========================================================+
|              ORDER FULFILLMENT SAGA                     |
+=========================================================+

   OrderCreated
        |
        v
   [1. Reserve Inventory]
        |
   +----+----+
   |         |
  OK        FAIL
   |         |
   v         v
[2. Charge] [Compensate: Cancel Order]
   |
   +----+----+
   |         |
  OK        FAIL
   |         |
   v         v
[3. Ship]  [Compensate: Refund + Release Inventory]
   |
   v
[4. Complete]


SAGA STATE MACHINE:
  STARTED
    -> INVENTORY_RESERVED (on InventoryReserved)
    -> PAYMENT_CHARGED (on PaymentCharged)
    -> SHIPPED (on OrderShipped)
    -> COMPLETED (on ShipmentDelivered)

COMPENSATION STATES (on failure):
  INVENTORY_RESERVED -> CANCELLING -> CANCELLED
  PAYMENT_CHARGED -> REFUNDING -> INVENTORY_RELEASING -> CANCELLED
```

**Saga Coordinator Implementation**

```python
class OrderFulfillmentSaga:
    """
    Choreography-based Saga: each service listens for events
    and reacts by publishing commands/events.

    Orchestration-based Saga: central coordinator sends commands.
    """

    class State(Enum):
        STARTED = "STARTED"
        INVENTORY_RESERVED = "INVENTORY_RESERVED"
        PAYMENT_CHARGED = "PAYMENT_CHARGED"
        SHIPPED = "SHIPPED"
        COMPLETED = "COMPLETED"
        COMPENSATING = "COMPENSATING"
        FAILED = "FAILED"

    def handle_order_created(self, event):
        saga = self._create_saga(event.aggregate_id)
        # Send command to inventory service
        self.command_bus.send(ReserveInventoryCommand(
            saga_id=saga.id,
            order_id=event.aggregate_id,
            items=event.payload['items']
        ))
        self._transition(saga, self.State.STARTED)

    def handle_inventory_reserved(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        if saga.state != self.State.STARTED:
            return  # Idempotent: already processed

        self.command_bus.send(ChargePaymentCommand(
            saga_id=saga.id,
            order_id=saga.order_id,
            amount=event.payload['totalAmount']
        ))
        self._transition(saga, self.State.INVENTORY_RESERVED)

    def handle_inventory_reservation_failed(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        # Compensate: cancel the order
        self.command_bus.send(CancelOrderCommand(
            order_id=saga.order_id,
            reason="InventoryUnavailable"
        ))
        self._transition(saga, self.State.FAILED)

    def handle_payment_failed(self, event):
        saga = self._load_saga(event.payload['sagaId'])
        # Compensate: release reserved inventory
        self.command_bus.send(ReleaseInventoryCommand(
            saga_id=saga.id,
            order_id=saga.order_id
        ))
        self._transition(saga, self.State.COMPENSATING)
```

---

### 5.9 Event Schema Evolution: Versioning and Upcasting

Events are immutable. When the schema changes, you must upcast old events to the new format.

```
PROBLEM: Event schema changes over time

  OrderCreated v1 (old):               OrderCreated v2 (new):
  {                                     {
    "customerId": "cust-5678",             "customerId": "cust-5678",
    "currency": "USD"                      "currency": "USD",
  }                                        "deliveryAddress": {     <- NEW FIELD
                                             "street": null,        <- Optional,
                                             "city": null           <- backward compat
                                           }
                                         }

UPCASTER CHAIN:
  Read event from store
        |
        v
  +------------------+
  | Is schema v1?    |--YES--> Upcast to v2 -> Upcast to v3 -> current
  +------------------+
        |
       NO
        v
  +------------------+
  | Is schema v2?    |--YES--> Upcast to v3 -> current
  +------------------+
        |
       NO
        v
  Already current version -> use as-is
```

**Upcaster Implementation**

```python
class EventUpcasterChain:
    """
    Chain of responsibility pattern for event migration.
    Events are upcasted lazily when read, not eagerly rewritten.
    """
    def __init__(self):
        self.upcasters: Dict[str, List[Upcaster]] = {}

    def register(self, event_type: str, from_version: int, upcaster: Callable):
        key = f"{event_type}:v{from_version}"
        self.upcasters.setdefault(key, []).append(upcaster)

    def upcast(self, event: RawEvent) -> Event:
        current_version = event.schema_version
        payload = event.payload

        while True:
            key = f"{event.event_type}:v{current_version}"
            upcasters = self.upcasters.get(key, [])
            if not upcasters:
                break
            for upcaster in upcasters:
                payload = upcaster(payload)
            current_version += 1

        return Event(
            event_id=event.event_id,
            event_type=event.event_type,
            schema_version=current_version,
            payload=payload
        )

# Register upcasters
chain = EventUpcasterChain()

def upcast_order_created_v1_to_v2(payload: dict) -> dict:
    """Add deliveryAddress field (optional, defaults to None)"""
    return {
        **payload,
        "deliveryAddress": payload.get("deliveryAddress", {
            "street": None,
            "city": None,
            "country": None
        })
    }

chain.register("OrderCreated", from_version=1, upcaster=upcast_order_created_v1_to_v2)

def upcast_order_created_v2_to_v3(payload: dict) -> dict:
    """Split name into firstName/lastName"""
    full_name = payload.pop("customerName", "")
    parts = full_name.split(" ", 1)
    return {
        **payload,
        "customerFirstName": parts[0] if parts else "",
        "customerLastName": parts[1] if len(parts) > 1 else ""
    }

chain.register("OrderCreated", from_version=2, upcaster=upcast_order_created_v2_to_v3)
```

**Event Versioning Strategies**

```
STRATEGY 1: Weak Schema (no upcasting needed)
  - All fields optional in event payload
  - Consumers handle missing fields gracefully
  - Simple but can hide mistakes

STRATEGY 2: Upcasting (recommended)
  - Old events are upcasted in memory when read
  - New fields added with default values
  - Old schema versions preserved in storage

STRATEGY 3: Event Migration (expensive)
  - Rewrite old events with new schema
  - Breaks immutability principle
  - Only for critical bug fixes

STRATEGY 4: Parallel Event Types
  - Introduce OrderCreatedV2 event type
  - Both projections handle both types
  - Clean break but code duplication
```

---

### 5.10 Idempotent Event Processing

Exactly-once processing guarantees on the read side.

```
PROBLEM: At-least-once delivery means events may be delivered multiple times.
  Event published at T=0
  Projection processes at T=5ms, crashes before saving checkpoint
  Event redelivered at T=10ms
  Projection processes again -> DUPLICATE!

  If on_ItemAdded increments a counter, we get double increment!

SOLUTION 1: Idempotency via last_event_id

  Before processing event:
    Check if event_id already processed (via last_event_id column)
    If already processed: skip (idempotent)
    If not processed: update read model + update checkpoint atomically

  def handle_event_idempotently(event):
      existing = db.query("SELECT last_event_id FROM order_summary WHERE order_id = ?", [order_id])
      if existing and existing.last_event_id == event.event_id:
          return  # Already processed, skip

      db.execute("UPDATE order_summary SET ..., last_event_id = ? WHERE order_id = ?",
                 [event.event_id, order_id])

SOLUTION 2: Database-level idempotency with UPSERT

  def on_ItemAdded(event):
      # Use the event_id as idempotency key
      db.execute("""
          INSERT INTO order_items (order_id, line_item_id, ...)
          VALUES (?, ?, ...)
          ON CONFLICT (order_id, line_item_id) DO NOTHING
      """, [...])  -- Idempotent: second insert is ignored

SOLUTION 3: Transactional outbox (for event publishing)

  Write side atomically:
    BEGIN TRANSACTION
      INSERT INTO events (...)        -- Append event to event store
      INSERT INTO outbox (event_id)   -- Mark for publishing
    COMMIT

  Outbox poller:
    SELECT * FROM outbox WHERE published = FALSE ORDER BY id
    Publish each event to Kafka
    UPDATE outbox SET published = TRUE WHERE event_id = ?
```

---

### 5.11 Event Replay: Rebuilding Projections

One of the most powerful features of Event Sourcing is the ability to rebuild any projection by replaying events.

```
USE CASES FOR REPLAY:
  1. New projection (e.g., new analytics view from day-one data)
  2. Bug fix in projection code -> rebuild from scratch
  3. Time-travel debugging: what was the state at T=2024-01-01?
  4. A/B testing different projection algorithms
  5. Disaster recovery: rebuild read model from event log

REPLAY STRATEGIES:

STRATEGY A: In-place rebuild (downtime acceptable)
  1. Stop projection consumer
  2. Truncate read model table
  3. Replay all events from position 0
  4. Restart consumer at latest position
  5. Total downtime = replay duration

STRATEGY B: Blue-green projection (zero downtime)
  1. Create new "shadow" projection table
  2. Replay all events into shadow table
  3. Once caught up, atomic swap (RENAME TABLE)
  4. Delete old table
  5. Zero downtime

  +------------------+     replay      +---------------------+
  | order_summary    |  <-- still live | order_summary_new   |
  | (production)     |                 | (shadow, rebuilding)|
  +------------------+                 +---------------------+
          |                                      |
          |     swap when caught up              |
          +<-------------------------------------+

STRATEGY C: Versioned projections
  CREATE TABLE order_summary_v2 (...)  -- new schema
  Replay into v2 while v1 serves traffic
  Switch query service to use v2
  Drop v1

TIME-TRAVEL QUERY:
  def state_at(aggregate_id: str, timestamp: datetime) -> Order:
      events = event_store.load(
          aggregate_id=aggregate_id,
          until_timestamp=timestamp  -- stop replaying at this point
      )
      order = Order()
      for event in events:
          order.apply(event)
      return order
```

---

### 5.12 Comparison: Event Sourcing vs Traditional CRUD

```
+----------------------+---------------------------+---------------------------+
| Dimension            | Traditional CRUD          | Event Sourcing            |
+----------------------+---------------------------+---------------------------+
| Storage model        | Current state only        | Full event history        |
| Storage cost         | Low (current state)       | High (grows with history) |
| Auditability         | Requires audit log tables | Built-in, complete        |
| Time-travel queries  | Impossible (data lost)    | Native support            |
| Query flexibility    | High (SQL joins)          | Limited on write side     |
| Read performance     | Fast (direct query)       | Fast with projections     |
| Write performance    | Fast (single UPDATE)      | Fast (INSERT only)        |
| Complexity           | Low                       | High                      |
| Debugging            | Hard (current state only) | Easy (full event history) |
| Integration          | Point-in-time snapshots   | Event-driven, real-time   |
| Schema migration     | ALTER TABLE               | Event upcasting           |
| Concurrency          | Pessimistic/optimistic    | Optimistic (version)      |
| Business alignment   | Table-centric             | Domain event-centric      |
| Team learning curve  | Low                       | High                      |
+----------------------+---------------------------+---------------------------+
```

---

### 5.13 When NOT to Use Event Sourcing

Event Sourcing adds significant complexity. Avoid it when:

```
RED FLAGS (don't use Event Sourcing):
  1. Simple CRUD applications with no audit requirements
     -> A blog post editor does not need event history

  2. High-frequency state updates without business meaning
     -> GPS location updates every second -> just store last known location

  3. Large object storage
     -> Storing file content as events is impractical

  4. Team unfamiliar with DDD/ES concepts
     -> Learning curve is steep; wrong implementation causes severe bugs

  5. Query-heavy systems with complex joins
     -> Traditional relational DB with good indexes may be simpler

  6. Short-lived data (TTL-based)
     -> Session data, temporary caches -> use Redis

  7. Regulatory requirements to delete data (GDPR)
     -> Immutable log makes right-to-erasure complex
     -> Solution: crypto-shredding (encrypt PII, delete encryption key)

GREENFLAGS (use Event Sourcing):
  1. Audit trail is a business requirement (finance, healthcare, legal)
  2. Complex business workflows with rollback/compensation needs
  3. Event-driven integration between microservices
  4. Need to rebuild projections (analytics, reporting flexibility)
  5. Temporal queries (state at a given point in time)
  6. High write throughput (append-only is fast)
  7. Collaborative editing (operational transforms on events)
```

---

### 5.14 Domain-Driven Design (DDD) Connection

Event Sourcing and CQRS fit naturally within DDD's building blocks.

```
DDD BUILDING BLOCKS MAPPED TO EVENT SOURCING:
+-------------------+------------------------------------------------------+
| DDD Concept       | Event Sourcing Role                                  |
+-------------------+------------------------------------------------------+
| Bounded Context   | Service boundary; has its own event store / schema   |
| Aggregate         | Consistency boundary; emits domain events            |
| Domain Event      | The event stored in the event log                    |
| Value Object      | Immutable data in event payloads                     |
| Repository        | Replaced by event-sourced aggregate repository      |
| Application Svc   | Command handler; orchestrates aggregate + event store|
| Domain Service    | Complex domain logic spanning aggregates             |
| Anti-Corruption   | Translates events between bounded contexts           |
| Layer (ACL)       |                                                      |
+-------------------+------------------------------------------------------+

BOUNDED CONTEXT EXAMPLE:
  Order Bounded Context emits:    -> OrderConfirmed (contains order items)
  Inventory Bounded Context:      <- listens, reserves stock
  Fulfillment Bounded Context:    <- listens to InventoryReserved, ships

  Events crossing context boundaries go through integration events
  (may be renamed/transformed to match each context's ubiquitous language)

  +-------------------+   OrderConfirmed    +---------------------+
  |  Order Context    | ------------------> |  Inventory Context  |
  |                   |                     |  (sees: StockReserve|
  |  Order aggregate  |                     |   Request from Order)|
  +-------------------+                     +---------------------+
                                                     |
                                             StockReserved
                                                     v
                                            +---------------------+
                                            |  Fulfillment Context|
                                            +---------------------+
```

---

## 6. Scaling Strategy

### Event Store Partitioning

```
PARTITIONING STRATEGY FOR KAFKA-BACKED EVENT STORE:

  Partition key = aggregate_id
  -> All events for the same aggregate go to the same partition
  -> Ordering guaranteed within a partition
  -> Different aggregates can be processed in parallel

  +------------------+  Partition 0: order-A, order-D, order-G
  | Kafka Topic:     |  Partition 1: order-B, order-E, order-H
  | "order-events"   |  Partition 2: order-C, order-F, order-I
  +------------------+

  Consumers:
    Projection Builder 0 -> reads partition 0
    Projection Builder 1 -> reads partition 1
    Projection Builder 2 -> reads partition 2

  Scaling: add partitions + projection builder instances
  Limitation: repartitioning requires re-processing (blue-green approach)

EVENTSTORE DB CLUSTERING:
  Leader: handles all writes (append events)
  Followers: replicate events, serve subscription reads
  Read replicas: serve global position subscriptions for projections

  +----------+    Raft consensus    +----------+
  |  Leader  | <------------------> | Follower |
  |  (writes)|                      | (reads)  |
  +----------+                      +----------+
       |                                  |
       | Replication                      |
       v                                  v
  +----------+                      +----------+
  | Follower |                      | Follower |
  | (reads)  |                      | (reads)  |
  +----------+                      +----------+
```

### Read Replica Scaling

```
READ SIDE SCALING:
  Projections write to PostgreSQL primary
  Multiple read replicas serve query traffic

  +------------------+
  | Projection Builder|
  +--------+---------+
           |  WRITE
           v
  +------------------+     Async Replication
  | PostgreSQL Primary| -------------------> +------------------+
  +------------------+                       | Read Replica 1   |
                                             +------------------+
                           Async Replication
                        -------------------> +------------------+
                                             | Read Replica 2   |
                                             +------------------+

  Query Service routes reads to replicas (round-robin or by region)

REDIS CACHE LAYER:
  Frequently accessed aggregates cached in Redis
  Cache key: "order:{order_id}:summary"
  TTL: 60 seconds (acceptable staleness)
  Cache invalidated on projection update

  Query flow:
    1. Check Redis cache -> HIT: return cached
    2. MISS: query PostgreSQL replica
    3. Populate Redis cache
    4. Return result

ELASTICSEARCH FOR FULL-TEXT SEARCH:
  OrderSearchProjection writes to Elasticsearch index
  Supports: full-text search on order notes, customer name
  Scales independently from transactional read models
```

### Write Side Scaling

```
COMMAND SIDE SCALING:
  Stateless command handlers -> horizontally scalable
  Event store is the bottleneck -> optimize it

  +---------------+   +---------------+   +---------------+
  | Command Svc 1 |   | Command Svc 2 |   | Command Svc 3 |
  +-------+-------+   +-------+-------+   +-------+-------+
          |                   |                   |
          +-------------------+-------------------+
                              |
                              v
                   +----------+-----------+
                   |    Event Store       |
                   |  (Leader: all writes)|
                   +----------------------+

  Load balancer distributes commands across Command Service instances.
  Each instance independently loads aggregate, validates, appends event.
  Optimistic concurrency prevents conflicts (retry on 409 Conflict).

SHARDING BY AGGREGATE TYPE:
  OrderEventStore -> handles Order aggregates
  InventoryEventStore -> handles Product/Stock aggregates
  AccountEventStore -> handles Account aggregates

  Each event store can be independently sized and scaled.
```

---

## 7. Real-World Examples

### Banking Ledger (Classic Event Sourcing Use Case)

```
Account Aggregate Events:
  AccountOpened       -> { accountId, customerId, currency, initialBalance }
  MoneyDeposited      -> { amount, transactionId, description }
  MoneyWithdrawn      -> { amount, transactionId, description }
  MoneyTransferred    -> { amount, toAccountId, transactionId }
  AccountFrozen       -> { reason, frozenBy }
  AccountClosed       -> { reason, finalBalance }

Current Balance = SUM of all deposit/transfer-in events
                - SUM of all withdrawal/transfer-out events

CRITICAL PROPERTIES:
  - Cannot delete or modify events (regulatory requirement)
  - Audit trail is complete and immutable
  - Reconstruction at any point in time (for disputes)
  - Snapshots every 1000 events (typical account has many transactions)

COMPLIANCE:
  - Event log satisfies SOX audit requirements
  - No "magic" balance updates; every cent accounted for
  - Regulators can trace any balance to its source events
```

### E-Commerce Order Management

```
Order Lifecycle Events:
  OrderCreated        -> Customer places order
  ItemAdded           -> Line items added to cart
  ItemRemoved         -> Customer removes item
  CouponApplied       -> Discount applied
  OrderConfirmed      -> Inventory reserved, payment authorized
  PaymentCharged      -> Payment captured
  OrderShipped        -> Fulfillment partner shipped order
  ShipmentDelivered   -> Customer received order
  ReturnInitiated     -> Customer started return
  RefundIssued        -> Payment refunded

READ MODELS:
  - OrderSummary: status, total, items (customer portal)
  - OrdersByCustomer: list view (customer history)
  - OrderFulfillmentView: picking list (warehouse)
  - OrderAnalytics: revenue by day (ClickHouse)
  - SupportView: full event history with metadata (support team)
```

### Audit & Compliance System

```
Any business entity that needs full audit trail:
  - User account changes (security audit)
  - HR records (compliance)
  - Medical records (HIPAA)
  - Configuration changes (SOC2)

UserAccountEvents:
  UserRegistered    -> Initial signup
  EmailChanged      -> Audit: who changed it, when, from where
  PasswordChanged   -> Security audit
  RoleGranted       -> Who granted which role
  RoleRevoked       -> Privilege reduction audit
  LoginSucceeded    -> Access audit
  LoginFailed       -> Security incident tracking
  AccountLocked     -> Security response
  AccountDeleted    -> Crypto-shredding: delete encryption key for PII

GDPR / Right to Erasure:
  Solution: Crypto-shredding
  - PII fields in events are encrypted with a per-user key
  - Store encryption key separately (KMS)
  - On deletion request: delete encryption key
  - Events remain (immutable) but PII becomes unreadable gibberish
```

---

## 8. Trade-offs and Anti-patterns

### Trade-offs

```
+---------------------------+---------------------------+---------------------------+
| Concern                   | Benefit                   | Cost                      |
+---------------------------+---------------------------+---------------------------+
| Storage                   | Complete history           | Growing indefinitely      |
| Consistency               | Strong on write side       | Eventual on read side     |
| Queries                   | Flexible (new projections) | Complex projection mgmt   |
| Debugging                 | Full event replay          | Complex tooling needed    |
| Integration               | Event-driven naturally     | Schema evolution burden   |
| Concurrency               | Optimistic locking         | Retry logic required      |
| Team complexity           | DDD alignment              | High learning curve       |
| Testing                   | Deterministic replay       | More test scenarios       |
+---------------------------+---------------------------+---------------------------+
```

### Anti-patterns to Avoid

```
ANTI-PATTERN 1: Storing state changes as events (not domain events)
  BAD: "OrderStatusChangedToPaid"  -- technical mutation, not domain concept
  GOOD: "OrderPaid"                -- business domain event

ANTI-PATTERN 2: Large event payloads
  BAD: Including entire product catalog in ItemAdded event
  GOOD: Include only what changed: productId, quantity, unitPrice
  Rule: Events should contain the minimum data to reconstruct state change

ANTI-PATTERN 3: Querying the event store directly for reads
  BAD: SELECT SUM(payload->>'amount') FROM events WHERE event_type='MoneyDeposited'
  GOOD: Use projections to maintain pre-computed read models
  Reason: Event store is optimized for append/replay, not aggregation queries

ANTI-PATTERN 4: Aggregates spanning multiple aggregate roots
  BAD: OrderAggregate directly modifies InventoryAggregate
  GOOD: OrderAggregate emits OrderConfirmed, Inventory saga handles reservation
  Reason: Cross-aggregate transactions break consistency boundaries

ANTI-PATTERN 5: Putting business logic in projections
  BAD: Projection calculates discount based on complex rules
  GOOD: Discount calculated in aggregate, stored in event payload
  Reason: Projections are dumb event handlers, not business logic

ANTI-PATTERN 6: Not handling projection failures gracefully
  BAD: Projection crashes, loses checkpoint, replays from beginning
  GOOD: Idempotent projection handlers, durable checkpoint storage
  Result: Safe to replay events multiple times

ANTI-PATTERN 7: Ignoring event ordering at global level
  BAD: Two projections consuming Kafka with different partition assignments
  GOOD: Design projections to be order-insensitive within a time window,
        or use a single ordered partition per event type

ANTI-PATTERN 8: Using Event Sourcing without CQRS
  Event-sourced state reconstruction is expensive for reads.
  Always pair with CQRS to maintain separate read models.

ANTI-PATTERN 9: Mutable events ("soft delete")
  BAD: UPDATE events SET payload = '...' WHERE event_id = '...'
  GOOD: Append a correcting event (OrderItemQuantityCorrected)
  Reason: Events are the source of truth; mutating them destroys history

ANTI-PATTERN 10: Aggregate with thousands of events and no snapshots
  BAD: Loading BankAccount with 50,000 transactions replays all 50,000 events
  GOOD: Snapshot every 100 events; load only recent events from snapshot
```

---

## 9. Common Interview Follow-ups

### Q: How do you handle a bug in a projection that corrupted the read model?

```
ANSWER:
  1. Stop the buggy projection consumer
  2. Identify the position where the bug was introduced
  3. Fix the projection code
  4. Create a new "shadow" read model table
  5. Replay all events from position 0 into shadow table
  6. Once shadow catches up with production, atomic swap
  7. Restart consumer pointing to new table

  The beauty of Event Sourcing: the event log is unchanged.
  We can always rebuild any projection from scratch.
```

### Q: How do you implement "read your own writes" consistency?

```
ANSWER:
  Option 1: Return updated state in command response
    Command handler reconstructs final state after event append
    Client uses returned state directly (no query needed)

  Option 2: Consistency token
    Command returns: { eventId: "evt-xxx", position: 98450010 }
    Query: GET /orders/{id}?afterPosition=98450010
    Query service polls until projection checkpoint >= 98450010
    Or use websocket/SSE to notify when ready

  Option 3: Versioned reads
    Client stores last known version from command response
    Query: GET /orders/{id}?minVersion=56
    Query service returns 202 if read model version < 56
    Client retries with exponential backoff
```

### Q: How do you handle the "thundering herd" on aggregate load?

```
ANSWER:
  When many concurrent commands target the same aggregate:
  1. Request coalescing: deduplicate concurrent loads
  2. Aggregate cache: keep recently used aggregates in memory (with TTL)
  3. Command queue per aggregate: serialize commands for hot aggregates
  4. Shard aggregates across command service instances by aggregate_id

  Hot aggregate pattern (e.g., shared shopping cart):
  -> Consider whether it's truly one aggregate or should be split
  -> Use eventual consistency (e.g., inventory uses reservation windows)
```

### Q: How do you deal with GDPR right to erasure with immutable events?

```
ANSWER: Crypto-shredding
  1. Encrypt all PII fields in event payloads using a per-user key
     { "customerName": encrypt("John Doe", key=user_encryption_key) }

  2. Store encryption keys in a separate KMS (key management service)
     Table: user_encryption_keys (user_id, encryption_key, created_at)

  3. On GDPR erasure request:
     DELETE FROM user_encryption_keys WHERE user_id = ?

  4. Old events remain in the event store (immutable) but all PII
     fields are now encrypted with a deleted key -> unreadable gibberish

  5. Read models containing PII are updated normally (delete the rows)

  Alternative: Store PII in a separate "personal data store" keyed by
  userId, reference only userId in events. On erasure, delete PII store.
```

### Q: What's the difference between Event Sourcing and Change Data Capture?

```
ANSWER:
  +------------------+---------------------------+---------------------------+
  | Dimension        | Event Sourcing            | Change Data Capture (CDC) |
  +------------------+---------------------------+---------------------------+
  | Intent           | Domain events as truth    | Technical DB changes      |
  | Granularity      | Business domain events    | Row-level DB changes      |
  | Semantic         | Rich domain meaning       | Low-level (INSERT/UPDATE) |
  | Schema           | Designed for consumers    | Mirrors DB schema         |
  | Storage          | Event store (primary)     | DB is primary, CDC is     |
  |                  |                           | secondary (Debezium)      |
  | Use case         | New systems, DDD          | Legacy migration, replication|
  +------------------+---------------------------+---------------------------+

  CDC (e.g., Debezium) is useful for migrating existing CRUD systems to
  event-driven architecture without full Event Sourcing adoption.
```

### Q: How do you test an Event Sourcing system?

```
ANSWER:
  UNIT TESTS (aggregate behavior):
    Given: [list of past events]
    When: [command]
    Then: [list of new events emitted]

    def test_cannot_pay_empty_order():
        order = Order()
        order.apply(OrderCreated(customerId="cust-1"))
        # No items added

        with pytest.raises(InvalidOperationError):
            order.pay(paymentMethod="CREDIT_CARD")

  PROJECTION TESTS:
    Given: [list of events]
    When: projection processes events
    Then: read model contains expected state

    def test_order_summary_shows_paid_after_payment():
        projection = OrderSummaryProjection(test_db)
        projection.on_OrderCreated(mock_event("OrderCreated", {...}))
        projection.on_OrderPaid(mock_event("OrderPaid", {...}))

        result = test_db.query("SELECT status FROM order_summary WHERE order_id = ?")
        assert result.status == "PAID"

  SAGA TESTS:
    Given: initial saga state
    When: [triggering event]
    Then: [expected command sent] + [new saga state]

  INTEGRATION TESTS:
    Fire command -> verify event appended -> verify projection updated
    Use in-memory or test-scoped event store
```

### Q: How does Axon Framework implement Event Sourcing and CQRS?

```
ANSWER: Axon Framework (Java) provides:

  @Aggregate
  public class OrderAggregate {
      @AggregateIdentifier
      private String orderId;
      private OrderStatus status;

      @CommandHandler
      public OrderAggregate(CreateOrderCommand cmd) {
          // Validate
          // Emit event (Axon handles persistence)
          apply(new OrderCreatedEvent(cmd.getOrderId(), cmd.getCustomerId()));
      }

      @EventSourcingHandler
      public void on(OrderCreatedEvent event) {
          // Apply: update internal state
          this.orderId = event.getOrderId();
          this.status = OrderStatus.CREATED;
      }
  }

  @Component
  public class OrderSummaryProjection {
      @EventHandler
      public void on(OrderCreatedEvent event, @Timestamp Instant timestamp) {
          // Update read model
          repository.save(new OrderSummary(event.getOrderId(), ...));
      }
  }

  Axon handles:
    - Event store (Axon Server or PostgreSQL)
    - Command routing to correct aggregate instance
    - Optimistic locking (version tracking)
    - Snapshot creation
    - Projection subscriptions and checkpointing
    - Saga state machine management
```

### Q: How do you monitor an Event Sourcing system in production?

```
ANSWER: Key metrics to track:

  WRITE SIDE:
    - Command processing latency (p50, p99)
    - Concurrency conflict rate (409 responses)
    - Event append throughput (events/sec)
    - Aggregate load time (snapshot effectiveness)

  EVENT STORE:
    - Event store disk usage growth rate
    - Replication lag (leader to followers)
    - Event append latency

  READ SIDE:
    - Projection lag (current position vs event store head)
    - Projection consumer lag in Kafka terms
    - Read model query latency
    - Cache hit rate (Redis)

  SAGAS:
    - Saga duration (time from start to completion)
    - Compensating transaction rate (failure indicator)
    - Stuck saga count (sagas not progressing)

  ALERTS:
    - Projection lag > 5,000 events -> consumer may be stuck
    - Concurrency conflict rate > 5% -> aggregate hotspot
    - Saga duration > SLA threshold -> investigate compensation
    - Event store disk > 80% capacity -> increase storage
```

---

## 10. Summary Diagram: Full System

```
+==============================================================================+
|                    EVENT SOURCING + CQRS SYSTEM                              |
+==============================================================================+

  WRITE SIDE                                 READ SIDE
  +------------------+                       +------------------+
  |  Command API     |                       |  Query API       |
  |  POST /commands/ |                       |  GET /queries/   |
  +--------+---------+                       +--------+---------+
           |                                          |
           v                                          v
  +------------------+                       +------------------+
  |  Command Handler |                       |  Query Handler   |
  |  1. Load agg     |                       |  Simple DB reads |
  |  2. Validate     |                       |  No business     |
  |  3. Apply cmd    |                       |  logic           |
  |  4. Emit events  |                       +--------+---------+
  +--------+---------+                                |
           |                                          |
           v                                          |
  +------------------+        Events         +--------+---------+
  |  Event Store     +---------------------->+ Read Model DB    |
  |  (Append-Only)   |                       |  (PostgreSQL/    |
  |  - Order events  |        +------------> |   Redis/ES)      |
  |  - Snapshots     |        |              +------------------+
  +------------------+        |
           |                  |        +------------------+
           |  Publish         |        | Projection       |
           v                  +--------+ Builder          |
  +------------------+                |  - Subscribes    |
  |  Event Bus       |                |  - Handles events|
  |  (Kafka)         +--------------->+  - Updates DB    |
  +------------------+                |  - Checkpoints   |
           |                          +------------------+
           |
           v
  +------------------+
  |  Saga Coordinator|
  |  - State machine |
  |  - Compensation  |
  |  - Cross-service |
  +------------------+

  TECHNOLOGIES:
    Event Store:    EventStoreDB | Apache Kafka | PostgreSQL
    Event Bus:      Apache Kafka | RabbitMQ
    Read Models:    PostgreSQL | Redis | Elasticsearch | ClickHouse
    Orchestration:  Axon Framework | custom implementation
    Monitoring:     Prometheus + Grafana (lag, throughput, errors)
```
