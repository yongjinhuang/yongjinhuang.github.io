# Data Model: Event Sourcing & CQRS

Event sourcing stores every state change as an immutable event rather than overwriting current state. CQRS (Command Query Responsibility Segregation) separates the write model (events) from the read model (projections). This data model captures the foundational tables needed to implement both patterns, including snapshot optimization and projection checkpoint tracking.

---

## Table Responsibilities

| Table | Purpose | Why It Exists |
|-------|---------|---------------|
| **events** | Append-only log of all state changes | The single source of truth; every mutation is an immutable fact |
| **snapshots** | Periodic aggregate state captures | Avoids replaying thousands of events to rebuild current state |
| **read_projections** | Denormalized read-optimized views | Serves queries without touching the event store; tailored per use case |
| **projection_checkpoints** | Tracks each projection's processing position | Enables reliable, resumable projection rebuilds after failures |

---

## Detailed Field Descriptions

### events (append-only)

| Field | Type | Description |
|-------|------|-------------|
| event_id | UUID (PK) | Globally unique event identifier |
| aggregate_type | VARCHAR | Type of aggregate (e.g., Order, Account, Inventory) |
| aggregate_id | UUID | The specific aggregate instance this event belongs to |
| version | INT | Per-aggregate sequence number; used for optimistic concurrency |
| event_type | VARCHAR | Descriptive event name (e.g., OrderPlaced, ItemAdded, PaymentReceived) |
| schema_version | INT | Version of the event payload schema; enables backward-compatible evolution |
| payload_json | JSONB | The event data itself (what changed) |
| metadata_json | JSONB | Contextual data: user_id, correlation_id, causation_id, IP address |
| global_position | BIGINT | Monotonically increasing sequence across ALL events; used by projections |
| occurred_at | TIMESTAMP | When the event actually happened (business time, not insert time) |

**Why version + global_position?** `version` is scoped to one aggregate and enforces ordering within it (optimistic concurrency). `global_position` is system-wide and tells projections "process events in this exact order." Two different concerns, two different sequences.

**Why schema_version?** Events are immutable -- you cannot change old events when the schema evolves. The schema_version tells deserializers which format to expect, enabling upcasting from old formats.

### snapshots

| Field | Type | Description |
|-------|------|-------------|
| snapshot_id | UUID (PK) | Unique snapshot identifier |
| aggregate_type | VARCHAR | Type of aggregate being snapshotted |
| aggregate_id | UUID | Which aggregate instance |
| version | INT | The aggregate version at snapshot time |
| state_json | JSONB | Full serialized aggregate state at this version |
| schema_version | INT | Schema version of the state representation |

**Why snapshots?** Without them, rebuilding an aggregate with 10,000 events means replaying all 10,000 on every command. A snapshot at version 9,950 means you only replay 50 events. Snapshots are created every N events (typically 100-500).

### read_projections (example: order_summary)

| Field | Type | Description |
|-------|------|-------------|
| order_id | UUID (PK) | The aggregate ID being projected |
| customer_id | UUID | Denormalized from OrderPlaced event |
| status | VARCHAR | Current order status, updated by each status-change event |
| item_count | INT | Running count, incremented by ItemAdded/ItemRemoved events |
| total_amount | DECIMAL | Running total, updated by pricing events |
| last_event_version | INT | The aggregate version this projection reflects |

**Why denormalized?** Read projections exist to serve queries fast. A single row with pre-computed fields eliminates joins. You build different projections for different query patterns (e.g., order_summary for dashboards, order_timeline for detailed history).

### projection_checkpoints

| Field | Type | Description |
|-------|------|-------------|
| projection_name | VARCHAR (PK) | Unique name of the projection (e.g., "order_summary_v2") |
| last_processed_position | BIGINT | The global_position of the last event this projection consumed |
| status | ENUM | running, paused, rebuilding, failed |
| updated_at | TIMESTAMP | Last checkpoint update time |

**Why track checkpoints?** If a projection crashes at global_position 50,000, it resumes from 50,000 instead of reprocessing from the beginning. Also enables monitoring -- if a projection falls behind, you can alert.

---

## ER Diagram

```
+-------------------------+
|     events              |
|     (append-only)       |
+-------------------------+
| event_id (PK)           |
| aggregate_type          |
| aggregate_id            |
| version                 |
| event_type              |
| schema_version          |
| payload_json            |
| metadata_json           |
| global_position (UNIQUE)|
| occurred_at             |
+-----------+-------------+
            |
            | Grouped by (aggregate_type + aggregate_id)
            |
+-----------+-------------+         +--------------------------+
|     snapshots           |         |  projection_checkpoints  |
+-------------------------+         +--------------------------+
| snapshot_id (PK)        |         | projection_name (PK)     |
| aggregate_type          |         | last_processed_position  |
| aggregate_id            |         | status                   |
| version                 |         | updated_at               |
| state_json              |         +-----------+--------------+
| schema_version          |                     |
+-------------------------+                     | Tracks position in
                                                | global_position
            +-----------------------------------+
            |
            v
+-------------------------+
|   read_projections      |
|   (order_summary)       |
+-------------------------+
| order_id (PK)           |
| customer_id             |
| status                  |
| item_count              |
| total_amount            |
| last_event_version      |
+-------------------------+
```

### Relationship Summary

```
events ────> snapshots           (snapshots capture aggregate state at a point in time)
events ────> read_projections    (projections are built by consuming events)
projection_checkpoints 1───1 read_projections  (one checkpoint per projection)
```

Note: These are not traditional FK relationships. Event sourcing uses aggregate_type + aggregate_id as a logical grouping, and projections consume events via global_position, not foreign keys.

---

## Data Flow

### Write Path (Command Side)

1. **Command received** -- A command (e.g., PlaceOrder) arrives at the command handler.

2. **Load aggregate** -- The system loads the aggregate by:
   - Finding the latest snapshot for (aggregate_type, aggregate_id)
   - Loading all events with version > snapshot.version
   - Replaying those events on top of the snapshot state

3. **Validate command** -- Business rules are checked against current aggregate state. For example, "cannot add item to a cancelled order."

4. **Generate events** -- If valid, the command produces one or more new events (e.g., OrderPlaced, InventoryReserved).

5. **Append events** -- New events are appended to the `events` table with an optimistic concurrency check: the INSERT includes a condition that the next version does not already exist. If another writer snuck in, the write fails and the command is retried.

6. **Snapshot decision** -- If the aggregate's event count since last snapshot exceeds the threshold (e.g., 100), a new snapshot is written.

7. **Publish events** -- Successfully appended events are published to subscribers (message bus, CDC, or polling).

### Read Path (Query Side)

8. **Event consumption** -- The projection engine reads `projection_checkpoints` to find its last processed `global_position`.

9. **Process new events** -- It fetches events with global_position > last_processed_position, processes them in order, and updates the `read_projections` tables.

10. **Checkpoint update** -- After processing a batch, `projection_checkpoints.last_processed_position` is updated atomically with the projection writes (same transaction for consistency).

11. **Serve queries** -- API queries read directly from `read_projections`. These are eventually consistent with the write side (typical lag: milliseconds to low seconds).

---

## Interview Discussion Points

**Q: Why not just use a regular database with UPDATE?**
Event sourcing preserves the complete history of every change. You can rebuild any past state, create new projections retroactively, and audit every mutation. With UPDATE, the previous state is lost forever.

**Q: What is the consistency model?**
The write side is strongly consistent (optimistic concurrency on aggregate version). The read side is eventually consistent. The lag between write and read is typically milliseconds but can grow under load. If strong consistency is required for a specific query, read directly from the event store.

**Q: How do you handle schema evolution?**
Events are immutable, so you cannot change old events. Instead, each event carries a `schema_version`. When reading old events, an "upcaster" transforms them to the latest schema format before processing. New event types can be added freely; projections ignore event types they do not handle.

**Q: What happens when you need a new projection?**
You create the projection logic, set its checkpoint to global_position=0, and let it replay all historical events. This "rebuild from scratch" capability is a key advantage of event sourcing -- you can answer questions about historical data that you did not anticipate when designing the system.

**Q: How do you handle the events table growing unbounded?**
Three strategies: (1) Snapshots reduce the number of events you replay per aggregate. (2) Archival: move old events to cold storage after all projections have processed them. (3) Compaction: for some aggregates, you can periodically replace N events with a single "state-set" event (losing granular history but saving space).
