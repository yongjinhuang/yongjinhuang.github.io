# Design a Unique ID Generator (Snowflake / ULID)

A unique ID generator produces identifiers that are globally unique, often time-sortable, and
suitable for distributed systems where no single node can coordinate assignment. Systems like
Twitter's Snowflake, Discord's IDs, and MongoDB's ObjectIDs are real-world examples. This is
one of the most nuanced system design problems because correctness guarantees (uniqueness,
monotonicity, clock safety) interact deeply with distributed systems concerns.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [ID Generation Schemes](#5-id-generation-schemes)
6. [Twitter Snowflake Deep Dive](#6-twitter-snowflake-deep-dive)
7. [UUID Deep Dive](#7-uuid-deep-dive)
8. [ULID and TSID](#8-ulid-and-tsid)
9. [Clock Synchronization and Drift](#9-clock-synchronization-and-drift)
10. [Worker ID Assignment](#10-worker-id-assignment)
11. [Database Auto-Increment and Ticket Servers](#11-database-auto-increment-and-ticket-servers)
12. [Monotonicity and K-Sortability](#12-monotonicity-and-k-sortability)
13. [Collision Probability Math](#13-collision-probability-math)
14. [Scaling Strategy](#14-scaling-strategy)
15. [Trade-offs and Alternatives](#15-trade-offs-and-alternatives)
16. [Common Interview Follow-ups](#16-common-interview-follow-ups)

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| #   | Requirement         | Details                                                             |
| --- | ------------------- | ------------------------------------------------------------------- |
| F1  | Generate unique IDs | Each generated ID must be globally unique across all nodes          |
| F2  | Time-ordered        | IDs generated later should sort after earlier IDs (k-sortable)      |
| F3  | Numeric             | IDs should fit in a 64-bit integer (compatible with most databases) |
| F4  | High throughput     | Support generating IDs at very high rates per node                  |
| F5  | Low latency         | Generation must be near-instantaneous, no network round-trips       |
| F6  | Decentralized       | No central coordination required at ID generation time              |
| F7  | Embeddable metadata | Extract datacenter, machine, and timestamp from the ID itself       |

### 1.2 Non-Functional Requirements

| #   | Requirement  | Target                                               |
| --- | ------------ | ---------------------------------------------------- |
| NF1 | Throughput   | 100,000+ IDs/second per node                         |
| NF2 | Latency      | p99 < 1 ms for ID generation                         |
| NF3 | Uniqueness   | Zero collisions guaranteed under normal operation    |
| NF4 | Ordering     | Time-sortable (k-sorted) across the cluster          |
| NF5 | Availability | 99.999% (< 5 min downtime/year)                      |
| NF6 | Clock safety | Handle NTP clock drift and backward jumps gracefully |
| NF7 | Compactness  | IDs must fit in 64 bits (long/int64)                 |

### 1.3 Scale Estimation

**Assumptions:**

```
Peak ID generation rate     : 100,000 IDs/sec across the fleet
Number of datacenters       : 4 (us-east, us-west, eu-west, ap-southeast)
Machines per datacenter     : 8 generator nodes
Total generator nodes       : 4 * 8 = 32 nodes
IDs per node per second     : 100,000 / 32 = ~3,125 IDs/sec
IDs per node per ms         : ~3 IDs/ms (well within 12-bit sequence = 4,096/ms)

Bit space exhaustion:
  Snowflake timestamp bits  : 41 bits
  Epoch offset (2010-01-01) : custom epoch
  Max timestamp value       : 2^41 ms = 2,199,023,255,552 ms = ~69.7 years
  Exhaustion year           : 2010 + 69.7 = ~2079

64-bit space (unsigned):
  Max IDs total             : 2^63 - 1 = 9,223,372,036,854,775,807
  At 100K IDs/sec           : 9.2 * 10^18 / 100,000 = 2.9 billion seconds
  That is                   : ~92 years of continuous generation at peak rate
```

**Back-of-Envelope Summary:**

```
+----------------------------------+---------------------+
| Metric                           | Value               |
+----------------------------------+---------------------+
| Peak generation rate             | 100,000 IDs/sec     |
| Per-node peak rate               | 3,125 IDs/sec       |
| Sequence space per ms per node   | 4,096 (12 bits)     |
| Max nodes in Snowflake layout    | 1,024 (10 bits)     |
| Max IDs per ms (all nodes)       | 1,024 * 4,096 = 4M  |
| Timestamp lifespan               | ~69.7 years         |
| ID size                          | 64 bits (8 bytes)   |
+----------------------------------+---------------------+
```

---

## 2. API Design

The ID generator exposes a simple HTTP interface for services that cannot embed the library
directly. High-performance services embed the generator as a library to avoid network overhead.

### 2.1 Generate a Single ID

```
GET /api/v1/id
Authorization: Bearer <service-token>

Response: 200 OK
{
  "id": "1541815603606036480",
  "id_hex": "0x1563A9FE38E40500",
  "timestamp_ms": 1709290800123,
  "datacenter_id": 2,
  "machine_id": 5,
  "sequence": 0,
  "generated_at": "2026-03-01T12:00:00.123Z"
}
```

### 2.2 Generate a Batch of IDs

```
POST /api/v1/ids/batch
Content-Type: application/json
Authorization: Bearer <service-token>

Request Body:
{
  "count": 100,
  "type": "snowflake"
}

Response: 200 OK
{
  "ids": [
    "1541815603606036480",
    "1541815603606036481",
    "1541815603606036482",
    ...
  ],
  "count": 100,
  "generated_at": "2026-03-01T12:00:00.123Z",
  "generator_node": "idgen-dc2-m5"
}
```

### 2.3 Decode an ID (Introspection)

```
GET /api/v1/id/decode/{id}
Authorization: Bearer <service-token>

Response: 200 OK
{
  "id": "1541815603606036480",
  "components": {
    "sign_bit": 0,
    "timestamp_ms": 1709290800123,
    "timestamp_offset_ms": 1247816400123,
    "datacenter_id": 2,
    "machine_id": 5,
    "sequence": 0
  },
  "human_readable": {
    "generated_at": "2026-03-01T12:00:00.123Z",
    "datacenter": "us-east-2",
    "machine": "idgen-dc2-m5",
    "ids_in_same_ms": 1
  }
}
```

### 2.4 Health and Node Info

```
GET /api/v1/health
Authorization: Bearer <service-token>

Response: 200 OK
{
  "status": "healthy",
  "node_id": 45,
  "datacenter_id": 2,
  "machine_id": 5,
  "current_timestamp_ms": 1709290800123,
  "sequence": 37,
  "ids_generated_total": 4827391024,
  "ids_generated_last_sec": 8241,
  "clock_last_synced": "2026-03-01T11:59:00.000Z",
  "ntp_offset_ms": 0.3
}
```

---

## 3. Data Model

### 3.1 Generator Node Registry

Tracks all registered generator nodes and their assigned worker IDs.

```sql
CREATE TABLE id_generator_nodes (
    node_id         INT         PRIMARY KEY,          -- Composite: (datacenter_id << 5) | machine_id
    datacenter_id   SMALLINT    NOT NULL,              -- 0-31 (5 bits)
    machine_id      SMALLINT    NOT NULL,              -- 0-31 (5 bits)
    hostname        VARCHAR(255) NOT NULL,
    ip_address      VARCHAR(45) NOT NULL,
    registered_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
    last_heartbeat  TIMESTAMP   NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active | retired | failed
    lease_expires   TIMESTAMP,                         -- For lease-based assignment
    UNIQUE (datacenter_id, machine_id)
);
```

### 3.2 ID Generation Audit Log (Optional)

For debugging and incident investigation; not written in the hot path.

```sql
CREATE TABLE id_generation_events (
    event_id        BIGINT      PRIMARY KEY,
    node_id         INT         NOT NULL,
    generated_id    BIGINT      NOT NULL,
    generated_at_ms BIGINT      NOT NULL,             -- Unix milliseconds
    sequence        INT         NOT NULL,
    batch_size      INT         NOT NULL DEFAULT 1,
    client_service  VARCHAR(255),
    logged_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Partition by day for retention management
-- Index for lookup by generated_id
CREATE INDEX idx_generated_id ON id_generation_events(generated_id);
```

### 3.3 In-Memory Generator State

The per-node in-memory state maintained by each generator process.

```
+-------------------------------+
| Generator Node State          |
+-------------------------------+
| datacenter_id  : uint8        | -- 5 bits, 0-31
| machine_id     : uint8        | -- 5 bits, 0-31
| last_timestamp : int64        | -- Unix ms of last generated ID
| sequence       : int32        | -- 12 bits, 0-4095
| mutex          : sync.Mutex   | -- Ensures atomicity
+-------------------------------+
```

### 3.4 ZooKeeper / etcd Lease Node Schema

```
/id-generator/
  workers/
    dc1/
      machine-0  -> { "hostname": "idgen-01", "ip": "10.0.1.1", "expires": 1709290860000 }
      machine-1  -> { "hostname": "idgen-02", "ip": "10.0.1.2", "expires": 1709290860000 }
    dc2/
      machine-0  -> { "hostname": "idgen-11", "ip": "10.0.2.1", "expires": 1709290860000 }
  config/
    epoch        -> 1262304000000    -- Custom epoch: 2010-01-01T00:00:00Z in ms
    max_sequence -> 4095
    version      -> "2.1.0"
```

---

## 4. High-Level Architecture

### 4.1 Library-Embedded Generation (Recommended)

```
+------------------------------------------------------------------+
|                         Client Services                          |
|                                                                  |
|  +-----------------+    +-----------------+    +-------------+   |
|  | Order Service   |    | User Service    |    | Feed Service|   |
|  | [Snowflake Lib] |    | [Snowflake Lib] |    |[Snowflake L]|   |
|  | node_id=5       |    | node_id=6       |    | node_id=7   |   |
|  +-----------------+    +-----------------+    +-------------+   |
|         |                      |                     |           |
+---------|----------------------|---------------------|-----------|+
          |                      |                     |
          +----------------------+---------------------+
                                 |
                    (Coordinator for worker ID assignment)
                                 |
                    +------------+------------+
                    |                         |
             +------+------+         +--------+------+
             |   ZooKeeper  |         |  etcd Cluster |
             |   Cluster    |         |  (alternative) |
             |              |         |               |
             | /id-gen/     |         | /id-gen/      |
             | workers/dc1  |         | workers/dc2   |
             |   machine-0  |         |   machine-0   |
             |   machine-1  |         |   machine-1   |
             +--------------+         +---------------+
```

### 4.2 Centralized Generator Service (Fallback / HTTP API)

```
+------------------+    +------------------+    +------------------+
|   Service A      |    |   Service B      |    |   Service C      |
|  (cannot embed   |    |  (mobile app     |    |  (lambda func)   |
|   library)       |    |   backend)       |    |                  |
+--------+---------+    +--------+---------+    +---------+--------+
         |                       |                        |
         +----------+------------+------------------------+
                    |
            +-------+--------+
            |   Load Balancer |
            |  (L4 / L7)     |
            +-------+--------+
                    |
         +----------+----------+
         |                     |
+--------+--------+   +--------+--------+
| ID Generator    |   | ID Generator    |
| Node A          |   | Node B          |
| dc=1, machine=0 |   | dc=1, machine=1 |
|                 |   |                 |
| [Snowflake Lib] |   | [Snowflake Lib] |
| In-memory state |   | In-memory state |
| last_ts=1709... |   | last_ts=1709... |
| sequence=42     |   | sequence=7      |
+--------+--------+   +--------+--------+
         |                     |
         +---------+-----------+
                   |
         +---------+-----------+
         |    ZooKeeper        |
         |    (Worker ID       |
         |     Assignment)     |
         +---------------------+
```

### 4.3 Multi-Datacenter Deployment

```
+==============================================================+
||                 GLOBAL ID GENERATION FLEET                 ||
+==============================================================+

 US-EAST Datacenter (DC 0)       EU-WEST Datacenter (DC 1)
+----------------------------+  +----------------------------+
| +--------+  +--------+     |  | +--------+  +--------+     |
| |IDGen M0|  |IDGen M1|     |  | |IDGen M0|  |IDGen M1|     |
| |dc=0 m=0|  |dc=0 m=1|     |  | |dc=1 m=0|  |dc=1 m=1|     |
| +--------+  +--------+     |  | +--------+  +--------+     |
|                             |  |                             |
| ZooKeeper (dc0-zk)          |  | ZooKeeper (dc1-zk)          |
+----------------------------+  +----------------------------+

 AP-SOUTHEAST Datacenter (DC 2)  US-WEST Datacenter (DC 3)
+----------------------------+  +----------------------------+
| +--------+  +--------+     |  | +--------+  +--------+     |
| |IDGen M0|  |IDGen M1|     |  | |IDGen M0|  |IDGen M1|     |
| |dc=2 m=0|  |dc=2 m=1|     |  | |dc=3 m=0|  |dc=3 m=1|     |
| +--------+  +--------+     |  | +--------+  +--------+     |
|                             |  |                             |
| ZooKeeper (dc2-zk)          |  | ZooKeeper (dc3-zk)          |
+----------------------------+  +----------------------------+

Key properties:
  - Each datacenter manages its own ZooKeeper for worker ID leases
  - Datacenters are fully independent; no cross-DC coordination needed
  - The datacenter_id portion of the ID guarantees global uniqueness
  - No inter-datacenter network calls in the hot path
```

---

## 5. ID Generation Schemes

### 5.1 Scheme Comparison Table

| Scheme                 | Size    | Format     | Time-Ordered    | Globally Unique     | Coordination          | DB Performance        |
| ---------------------- | ------- | ---------- | --------------- | ------------------- | --------------------- | --------------------- |
| DB Auto-Increment      | 64-bit  | Integer    | Yes (per shard) | No (multi-shard)    | Required              | Excellent             |
| UUID v4                | 128-bit | Hex string | No              | Yes (probabilistic) | None                  | Poor (random inserts) |
| UUID v7                | 128-bit | Hex string | Yes             | Yes (probabilistic) | None                  | Good                  |
| Ticket Server (Flickr) | 64-bit  | Integer    | Partial         | Yes                 | Required (central DB) | Good                  |
| Twitter Snowflake      | 64-bit  | Integer    | Yes (k-sorted)  | Yes (guaranteed)    | Startup only          | Excellent             |
| ULID                   | 128-bit | Base32     | Yes (k-sorted)  | Yes (probabilistic) | None                  | Good                  |
| TSID                   | 64-bit  | Integer    | Yes (k-sorted)  | Yes (guaranteed)    | Startup only          | Excellent             |
| MongoDB ObjectID       | 96-bit  | Hex string | Yes             | Yes (probabilistic) | None                  | Good                  |

### 5.2 Decision Matrix for Interview

```
Are IDs required to fit in 64 bits?
  |
  +-- YES --> Is global uniqueness guaranteed (not probabilistic) required?
  |             |
  |             +-- YES --> Twitter Snowflake or TSID
  |             |
  |             +-- NO  --> Database auto-increment (if single shard)
  |                         or Ticket Server (if multi-shard tolerable)
  |
  +-- NO  --> Is time-ordering required?
                |
                +-- YES --> ULID or UUID v7
                |
                +-- NO  --> UUID v4 (simplest, zero coordination)
```

---

## 6. Twitter Snowflake Deep Dive

### 6.1 Bit Layout (64-bit Integer)

```
 63      62                  22           17          12          0
  +-------+------------------+------------+-----------+-----------+
  |  Sign |    Timestamp     | Datacenter |  Machine  | Sequence  |
  |  bit  |    (41 bits)     |  (5 bits)  |  (5 bits) | (12 bits) |
  +-------+------------------+------------+-----------+-----------+
     1 bit      41 bits          5 bits      5 bits     12 bits
                                  |               |          |
                         0-31 DCs (32)     0-31 machines  0-4095 per ms
```

**Bit field details:**

```
+-------------+--------+--------------------------------------------------+
| Field       | Bits   | Description                                      |
+-------------+--------+--------------------------------------------------+
| Sign        | 1      | Always 0 (ensures positive signed 64-bit int)    |
| Timestamp   | 41     | Milliseconds since custom epoch (2010-01-01)     |
|             |        | Max: 2^41 ms = 69.7 years                        |
| Datacenter  | 5      | 0-31, identifies the datacenter (32 total)       |
| Machine     | 5      | 0-31, identifies the node within datacenter      |
| Sequence    | 12     | 0-4095, monotonic counter within same millisecond |
+-------------+--------+--------------------------------------------------+

Combined worker bits: 5 + 5 = 10 bits = 1,024 unique nodes total
Sequence per ms:      12 bits = 4,096 IDs per node per millisecond
Peak per node:        4,096,000 IDs/second (theoretical max)
```

### 6.2 Bit Manipulation

```
Custom Epoch (ms since 2010-01-01T00:00:00Z):
  EPOCH = 1262304000000

To generate an ID:
  timestamp_offset = current_time_ms - EPOCH
  id = (timestamp_offset << 22) | (datacenter_id << 17) | (machine_id << 12) | sequence

To extract fields from an ID:
  timestamp_offset = id >> 22
  current_time_ms  = timestamp_offset + EPOCH
  datacenter_id    = (id >> 17) & 0x1F      -- mask 5 bits
  machine_id       = (id >> 12) & 0x1F      -- mask 5 bits
  sequence         = id & 0xFFF             -- mask 12 bits
```

### 6.3 Reference Implementation (Go)

```go
package snowflake

import (
    "errors"
    "sync"
    "time"
)

const (
    epoch         = int64(1262304000000) // 2010-01-01T00:00:00Z in ms
    sequenceBits  = 12
    machineBits   = 5
    datacenterBits= 5
    maxSequence   = -1 ^ (-1 << sequenceBits)   // 4095
    maxMachineID  = -1 ^ (-1 << machineBits)    // 31
    maxDatacenterID = -1 ^ (-1 << datacenterBits) // 31
    machineShift  = sequenceBits                 // 12
    datacenterShift = sequenceBits + machineBits // 17
    timestampShift = datacenterShift + datacenterBits // 22
)

type Generator struct {
    mu           sync.Mutex
    lastTimestamp int64
    sequence     int64
    datacenterID int64
    machineID    int64
}

func NewGenerator(datacenterID, machineID int64) (*Generator, error) {
    if datacenterID < 0 || datacenterID > maxDatacenterID {
        return nil, errors.New("datacenter ID out of range")
    }
    if machineID < 0 || machineID > maxMachineID {
        return nil, errors.New("machine ID out of range")
    }
    return &Generator{
        datacenterID:  datacenterID,
        machineID:     machineID,
        lastTimestamp: -1,
        sequence:      0,
    }, nil
}

func (g *Generator) NextID() (int64, error) {
    g.mu.Lock()
    defer g.mu.Unlock()

    now := currentMillis()

    if now < g.lastTimestamp {
        // Clock moved backward — refuse to generate to avoid duplicates
        drift := g.lastTimestamp - now
        if drift <= 5 {
            // Small drift: wait for clock to catch up
            time.Sleep(time.Duration(drift+1) * time.Millisecond)
            now = currentMillis()
        } else {
            // Large drift: hard error — operator intervention required
            return 0, fmt.Errorf("clock moved backward by %d ms", drift)
        }
    }

    if now == g.lastTimestamp {
        // Same millisecond: increment sequence
        g.sequence = (g.sequence + 1) & maxSequence
        if g.sequence == 0 {
            // Sequence exhausted: wait for next millisecond
            now = g.waitNextMillis(now)
        }
    } else {
        // New millisecond: reset sequence
        g.sequence = 0
    }

    g.lastTimestamp = now

    id := ((now - epoch) << timestampShift) |
          (g.datacenterID << datacenterShift) |
          (g.machineID << machineShift) |
          g.sequence

    return id, nil
}

func (g *Generator) waitNextMillis(lastTs int64) int64 {
    ts := currentMillis()
    for ts <= lastTs {
        ts = currentMillis()
    }
    return ts
}

func currentMillis() int64 {
    return time.Now().UnixNano() / int64(time.Millisecond)
}
```

### 6.4 Sequence Exhaustion Within a Millisecond

```
Timeline within a single millisecond (t = 1709290800123):

ms=1709290800123, seq=0    -> ID: ...123_00_05_0000
ms=1709290800123, seq=1    -> ID: ...123_00_05_0001
ms=1709290800123, seq=2    -> ID: ...123_00_05_0002
...
ms=1709290800123, seq=4094 -> ID: ...123_00_05_4094
ms=1709290800123, seq=4095 -> ID: ...123_00_05_4095  <-- sequence maxed
ms=1709290800123, seq=?    -> WAIT for next millisecond (busy spin)

ms=1709290800124, seq=0    -> ID: ...124_00_05_0000  <-- new ms, reset
ms=1709290800124, seq=1    -> ID: ...124_00_05_0001

Maximum per-node throughput:
  4,096 IDs/ms = 4,096,000 IDs/second (theoretical)
  Practical limit: ~500,000-1,000,000 IDs/sec (system call overhead)
```

---

## 7. UUID Deep Dive

### 7.1 UUID Versions Comparison

| Version | Format         | Timestamp         | Randomness | Time-Ordered | Use Case                     |
| ------- | -------------- | ----------------- | ---------- | ------------ | ---------------------------- |
| v1      | time-based     | 100ns since 1582  | 48-bit MAC | Yes          | Legacy systems               |
| v3      | name-based     | None              | MD5 hash   | No           | Deterministic namespaced IDs |
| v4      | random         | None              | 122 bits   | No           | General purpose, stateless   |
| v5      | name-based     | None              | SHA-1 hash | No           | Deterministic namespaced IDs |
| v6      | reordered v1   | 100ns (reordered) | 48-bit MAC | Yes          | Improved v1                  |
| v7      | Unix timestamp | Unix ms epoch     | 74 bits    | Yes          | Modern, DB-friendly          |

### 7.2 UUID Structure

```
UUID v4 (random):
+----8---+-4--+-4--+-4--+----12----+
|xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx|
+--------+----+----+----+------------+
         |    |    |    |
         |    |    |    +-- 48 bits random
         |    |    +------- 4-bit variant (8,9,a,b)
         |    +------------ 4-bit version (4)
         +----------------- 48 bits random

Total random bits: 122 bits (4 version + 2 variant bits are fixed)
Collision probability: Birthday problem at n=2^61 = 2.3 quintillion IDs

UUID v7 (Unix timestamp + random):
+----8---+-4--+-4--+-4--+----12----+
|tttttttt-tttt-7xxx-yxxx-xxxxxxxxxxxx|
+--------+----+----+----+------------+
         |    |    |    |
         |    |    |    +-- 48 bits random
         |    |    +------- 4-bit variant
         |    +------------ 4-bit version (7)
         +----------------- 48 bits Unix timestamp (ms precision)

Time bits: 48 bits -> millisecond precision until year 10889
Random bits: 74 bits -> high collision resistance
Time-ordered: Yes, lexicographically sortable
```

### 7.3 Why UUID v4 Hurts Database Performance

```
B-Tree Index with Sequential IDs (Snowflake):
+----------+    +----------+    +----------+
|  Page 1  |    |  Page 2  |    |  Page 3  |
| ID 1000  |--->| ID 2000  |--->| ID 3000  |
| ID 1001  |    | ID 2001  |    | ID 3001  |
| ID 1002  |    | ID 2002  |    | ID 3002  |
+----------+    +----------+    +----------+
New ID 3003 -> always appends to the last page -> HOT PAGE
Result: Minimal page splits, good cache locality, fast inserts

B-Tree Index with Random UUID v4:
+----------+    +----------+    +----------+
|  Page 1  |    |  Page 2  |    |  Page 3  |
| 3a8f...  |--->| 7c12...  |--->| f4ab...  |
| 5b22...  |    | 9e77...  |    | b3d1...  |
| 1d94...  |    | 2a63...  |    | e8c9...  |
+----------+    +----------+    +----------+
New ID f1a9... -> must insert into Page 3, splitting if full
New ID 4c33... -> must insert into Page 1, splitting if full
Result: Random page splits across the entire tree
        Buffer pool thrashing (cold pages evicted, then needed again)
        Write amplification from frequent page splits
        INSERT becomes O(log n) with high constant factor

Benchmark (PostgreSQL, 10M rows):
  UUID v4 inserts:      ~35,000 rows/sec
  UUID v7 inserts:      ~85,000 rows/sec
  Snowflake ID inserts: ~120,000 rows/sec
  BIGSERIAL inserts:    ~150,000 rows/sec
```

---

## 8. ULID and TSID

### 8.1 ULID (Universally Unique Lexicographically Sortable Identifier)

```
ULID Structure (128 bits, 26 characters in Crockford Base32):

  01AN4Z07BY      79KA1307SR9X4MV3
  |-----------|   |---------------|
  48-bit timestamp  80-bit random
  Millisecond       Cryptographically
  precision         random

Format: TTTTTTTTTTRRRRRRRRRRRRRRRRR (26 chars)
  T = timestamp chars (10 chars = 48 bits)
  R = random chars    (16 chars = 80 bits)

Example: 01HQWJK3T4XVZGMB5NPYQR78AB

Properties:
  - Lexicographically sortable (same millisecond: random suffix)
  - Case-insensitive (Crockford Base32 avoids ambiguous chars: I, L, O, U)
  - URL-safe
  - 128-bit (2x Snowflake, but string-encoded rather than integer)
  - No worker ID assignment needed
  - Monotonicity within same ms: increment random suffix
```

**ULID Generation in Pseudocode:**

```python
import os
import time

ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford Base32

class ULIDGenerator:
    def __init__(self):
        self.last_ms = 0
        self.last_random = 0

    def generate(self):
        now_ms = int(time.time() * 1000)

        if now_ms == self.last_ms:
            # Same millisecond: increment random to guarantee monotonicity
            self.last_random += 1
            if self.last_random >= (1 << 80):
                # Random component overflow: wait for next ms
                while int(time.time() * 1000) == self.last_ms:
                    pass
                now_ms = int(time.time() * 1000)
                self.last_random = int.from_bytes(os.urandom(10), 'big')
        else:
            # New millisecond: fresh random component
            self.last_random = int.from_bytes(os.urandom(10), 'big')

        self.last_ms = now_ms

        return self._encode_timestamp(now_ms) + self._encode_random(self.last_random)

    def _encode_timestamp(self, ms):
        result = []
        for _ in range(10):
            result.append(ENCODING[ms & 0x1F])
            ms >>= 5
        return ''.join(reversed(result))

    def _encode_random(self, rand):
        result = []
        for _ in range(16):
            result.append(ENCODING[rand & 0x1F])
            rand >>= 5
        return ''.join(reversed(result))
```

### 8.2 TSID (Time-Sorted ID)

TSID is a 64-bit ID format similar to Snowflake but without requiring a datacenter bit.
It is commonly used with JVM-based systems via the `f4b6a3/tsid-creator` library.

```
TSID Layout (64 bits):

 63      42                   0
  +-------+-------------------+
  |  Time |   Random / Node   |
  | 42 b  |      22 bits      |
  +-------+-------------------+

Timestamp: 42 bits = milliseconds since 2020-01-01T00:00:00Z
  Max duration: 2^42 ms = ~139 years (until ~2159)
  More future-proof than Snowflake's 41-bit timestamp

Node / Random: 22 bits
  Option A: All random (no worker registration, probabilistic uniqueness)
  Option B: Split into node_id (N bits) + sequence (22-N bits)
    With 10-bit node + 12-bit sequence: identical to Snowflake structure
    With 20-bit node + 2-bit sequence: supports 1M nodes, 4 IDs/ms/node

String encoding: Base32 Crockford (13 chars)
  Example: 0AWE1ZAM2SS0N
```

### 8.3 MongoDB ObjectID (for reference)

```
ObjectID Structure (96 bits = 12 bytes):

+--------+--------+--------+--------+
|4 bytes |3 bytes |2 bytes |3 bytes |
|Unix ts |Machine |PID     |Counter |
|(secs)  |Hash    |        |(random)|
+--------+--------+--------+--------+

Timestamp: 4 bytes = Unix seconds (not milliseconds!)
  - Only second precision; same-second IDs are not ordered by time
  - Exhausts in year 2106

Machine hash: 3 bytes = MD5 of hostname (collision risk for similar hostnames)
PID: 2 bytes = process ID (collides if same machine, multiple processes)
Counter: 3 bytes = monotonic counter (reset per process start)

Weakness: Not truly globally unique in adversarial conditions.
Strength: Zero coordination needed, embeds generation context.
```

---

## 9. Clock Synchronization and Drift

### 9.1 The Clock Problem

```
The Core Problem: Physical Clocks Are Not Perfectly Synchronized

 Node A (fast clock)              Node B (slow clock)
 time=1000 ms                     time=998 ms

 Generate ID at t=1000            Generate ID at t=998

 ID_A = (1000 << 22) | ...        ID_B = (998 << 22) | ...
 ID_A > ID_B

 But ID_A was generated AFTER ID_B!
 K-sort ordering violated.

 Even worse: clock backward jump
 t=1000: Generate ID with timestamp=1000
 t=997 : NTP corrects clock backward by 3ms
 t=997 : Generate ID with timestamp=997

 New ID has LOWER timestamp than previous ID.
 If sequence resets to 0: DUPLICATE possible!
 (same timestamp + same sequence + same node = duplicate)
```

### 9.2 NTP Behavior and Slewing

```
NTP Clock Adjustment Strategies:

1. SLEW (gradual adjustment, safe):
   NTP adjusts clock rate (not jump) by up to 500 ppm
   A 10ms drift takes 20 seconds to correct
   Clock never goes backward
   Linux default: slew for small offsets

2. STEP (instantaneous jump, dangerous for ID gen):
   NTP abruptly sets clock to correct time
   Can jump BACKWARD by any amount
   Triggered when offset > 128ms (ntpd) or > 1s (chronyd)
   Risk: ID generator produces IDs with past timestamps

3. PANIC (reject and stop):
   NTP refuses to adjust if offset > 1000s (default)
   Requires manual intervention

Recommendation for ID generators:
  - Use chrony with makestep disabled after first sync
  - Use SO_TIMESTAMPING for kernel-level time
  - Monitor NTP sync quality (stratum, offset, jitter)
  - Alert if offset > 5ms
```

### 9.3 Clock Drift Mitigation Strategies

```
Strategy 1: Refuse to Generate (Hard Safety)
+-------------------------------------------+
| if current_time < last_timestamp:         |
|   return ERROR("clock moved backward")    |
+-------------------------------------------+
  Pros: Absolute safety guarantee
  Cons: Availability impact during NTP corrections

Strategy 2: Wait-for-Clock (Small Drift)
+-------------------------------------------+
| if current_time < last_timestamp:         |
|   drift = last_timestamp - current_time   |
|   if drift <= THRESHOLD (e.g., 5ms):      |
|     sleep(drift + 1ms)                    |
|     current_time = now()                  |
|   else:                                   |
|     return ERROR("large clock drift")     |
+-------------------------------------------+
  Pros: Transparent to caller for small drifts
  Cons: Adds latency up to threshold duration

Strategy 3: Logical Clock (Always Monotonic)
+-------------------------------------------+
| last_timestamp = max(last_timestamp + 1,  |
|                      current_time)        |
+-------------------------------------------+
  Pros: Always monotonic, never blocks
  Cons: IDs drift from wall clock during corrections
        Sequence may "borrow" future timestamps

Strategy 4: Guard Bits
+-------------------------------------------+
| Dedicate 3 bits to a "guard" counter      |
| Increment guard on each clock reset        |
| Guard bits encode "generation" of node    |
+-------------------------------------------+
  Pros: Survives multiple clock resets
  Cons: Reduces available sequence or machine bits

Production Recommendation (Discord approach):
  1. Small drift (< 5ms): wait-for-clock
  2. Medium drift (5-500ms): log warning, continue with last_timestamp
  3. Large drift (> 500ms): alert on-call, pause generation
  4. Monitor ntpstat, alert if sync lost for > 60s
```

### 9.4 Logical Clocks (Lamport and Hybrid)

```
Lamport Clock (ordering without wall time):
  Each node maintains a counter L
  On send: L = L + 1; attach L to message
  On receive: L = max(L, L_received) + 1
  Guarantees: if A happens-before B, then L(A) < L(B)
  Limitation: L(A) < L(B) does NOT mean A happens-before B

Hybrid Logical Clock (HLC):
  Combines physical time with Lamport counter
  State: (physical_time_ms, logical_counter)

  On send/local event:
    pt = max(wall_clock_ms, physical_time_ms)
    if pt == physical_time_ms:
      logical_counter += 1
    else:
      physical_time_ms = pt
      logical_counter = 0

  On receive(message with (pt_m, lc_m)):
    pt = max(wall_clock_ms, physical_time_ms, pt_m)
    if pt == physical_time_ms == pt_m:
      logical_counter = max(logical_counter, lc_m) + 1
    elif pt == physical_time_ms:
      logical_counter += 1
    elif pt == pt_m:
      logical_counter = lc_m + 1
    else:
      logical_counter = 0
    physical_time_ms = pt

  HLC in IDs:
    - Stays close to wall clock (within epsilon)
    - Strictly monotonic across causally related events
    - Used in CockroachDB for MVCC timestamps
```

---

## 10. Worker ID Assignment

### 10.1 The Worker ID Problem

In Snowflake, each node needs a unique (datacenter_id, machine_id) pair assigned before
it can generate IDs. Without coordination, two nodes might claim the same pair and generate
duplicate IDs. The 10-bit worker space (1,024 nodes) must be managed safely.

### 10.2 ZooKeeper-Based Assignment

```
Startup sequence:

+------------------+          +---------------------+
|   ID Generator   |          |   ZooKeeper Cluster |
|   Node Startup   |          |                     |
+--------+---------+          +----------+----------+
         |                               |
         | 1. List /id-gen/workers/dc0/  |
         |------------------------------>|
         |                               |
         | 2. Find unoccupied machine ID |
         |<------------------------------|
         |                               |
         | 3. Create EPHEMERAL node:     |
         |    /id-gen/workers/dc0/m5     |
         |    with own IP/hostname       |
         |------------------------------>|
         |                               |
         | 4. ZK creates node if unique  |
         |    Returns: OK or CONFLICT    |
         |<------------------------------|
         |                               |
         | If CONFLICT: retry with m6    |
         | If OK: start generating       |

On crash/shutdown:
  - EPHEMERAL ZK node is deleted automatically
  - Machine ID becomes available for reuse
  - Prevents ghost worker IDs

Code sketch:
  func claimWorkerID(zk *ZooKeeper, datacenterID int) (int, error) {
    for machineID := 0; machineID <= 31; machineID++ {
      path := fmt.Sprintf("/id-gen/workers/dc%d/m%d", datacenterID, machineID)
      data := nodeMetadata{Hostname: hostname(), IP: myIP(), StartedAt: time.Now()}
      err := zk.CreateEphemeral(path, marshal(data))
      if err == nil {
        return machineID, nil   // Successfully claimed
      }
      if err != ErrNodeExists {
        return 0, err           // Unexpected error
      }
      // ErrNodeExists: try next machineID
    }
    return 0, errors.New("all machine IDs in use")
  }
```

### 10.3 etcd Lease-Based Assignment

```
etcd uses time-bounded leases instead of ephemeral nodes.

  func claimWithLease(etcd *etcdClient, datacenterID int) (int, context.CancelFunc, error) {
    // Create a 30-second lease
    lease, err := etcd.Grant(ctx, 30)

    for machineID := 0; machineID <= 31; machineID++ {
      key := fmt.Sprintf("/id-gen/workers/dc%d/m%d", datacenterID, machineID)

      // Atomic: only set if key does not exist
      txn := etcd.Txn(ctx).
        If(clientv3.Compare(clientv3.CreateRevision(key), "=", 0)).
        Then(clientv3.OpPut(key, nodeMetadata(), clientv3.WithLease(lease.ID))).
        Commit()

      if txn.Succeeded {
        // Start background goroutine to renew lease every 10 seconds
        cancel := startLeaseRenewal(etcd, lease.ID, 10*time.Second)
        return machineID, cancel, nil
      }
    }
    return 0, nil, errors.New("all machine IDs in use")
  }

Lease renewal failure:
  - etcd lease expires if renewal fails (node crash, network partition)
  - After TTL, the key is deleted automatically
  - Another node can claim the machine ID
  - Gap: the original node may still be generating IDs for up to 30 seconds
    after lease expiry if it is network-partitioned but not crashed.
  - Mitigation: nodes should monitor their own lease status and stop
    generating IDs if lease renewal fails.
```

### 10.4 Environment Variable / Config Map Assignment

For Kubernetes deployments, worker IDs can be assigned via the downward API or ConfigMaps,
avoiding ZooKeeper complexity for small clusters.

```yaml
# Kubernetes StatefulSet: Pod index as machine ID
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: id-generator
spec:
  serviceName: id-generator
  replicas: 8
  template:
    spec:
      containers:
        - name: id-generator
          env:
            - name: POD_INDEX
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['apps.kubernetes.io/pod-index']
            - name: DATACENTER_ID
              value: '2'
            - name: MACHINE_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['apps.kubernetes.io/pod-index']
          # Pod 0 -> machine_id=0, Pod 1 -> machine_id=1, etc.
```

---

## 11. Database Auto-Increment and Ticket Servers

### 11.1 Database Auto-Increment

```
Single-Database Auto-Increment:

+--------+    INSERT    +------------------+
| Client |------------>| Database         |
|        |<------------| (Auto-Increment) |
+--------+  id=100001  | id | data        |
                       |----|-------------|
                       |  1 | ...         |
                       |  2 | ...         |
                       |  3 | ...         |
                       +------------------+

Pros:
  - Simple, built into every RDBMS
  - Perfectly sequential, no gaps (usually)
  - Zero application-level code

Cons:
  - Single point of failure
  - Write bottleneck (all inserts serialize on ID generation)
  - Cannot shard: shard A and shard B both start at 1
  - Reveals business metrics (competitor can deduce order volume from IDs)
  - Cannot generate IDs offline or in application layer

Multi-Shard Auto-Increment (MySQL solution):
  Shard A: auto_increment_increment=2, auto_increment_offset=1 -> 1, 3, 5, 7...
  Shard B: auto_increment_increment=2, auto_increment_offset=2 -> 2, 4, 6, 8...

  With 3 shards (increment=3):
  Shard A: offset=1 -> 1, 4, 7, 10...
  Shard B: offset=2 -> 2, 5, 8, 11...
  Shard C: offset=3 -> 3, 6, 9, 12...

  Problem: Adding a 4th shard requires reconfiguring all shards (disruptive).
  Problem: IDs are not monotonically increasing across shards.
```

### 11.2 Ticket Server (Flickr Approach)

```
Architecture:

+----------+    +----------+    +----------+
| App Srv 1|    | App Srv 2|    | App Srv 3|
+----+-----+    +----+-----+    +----+-----+
     |               |               |
     +---------------+---------------+
                     |
              +------+------+
              | Ticket DB A | (Active)
              |             |
              | REPLACE INTO|
              | Tickets SET |
              | id=LAST_INSERT_ID(id+1) |
              +------+------+
                     |
              +------+------+
              | Ticket DB B | (Standby / Hot failover)
              +------+------+

Flickr's actual SQL trick:
  -- Tickets64 table (one row per entity type)
  CREATE TABLE Tickets64 (
    id        BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
    stub      CHAR(1)    NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY stub (stub)
  ) ENGINE=MyISAM;

  -- Generate next ID (atomic on MySQL)
  REPLACE INTO Tickets64 (stub) VALUES ('a');
  SELECT LAST_INSERT_ID();

Pros:
  - Simple: standard MySQL, no new infrastructure
  - Sequential IDs (no gaps within a server)
  - Two-server setup provides failover
  - Works for multiple entity types (one table per type)

Cons:
  - Write bottleneck: all ID generation routes through ticket DB
  - Latency: every ID requires a DB round-trip (~1-5ms)
  - Single point of failure (even with hot standby, failover takes seconds)
  - Not time-ordered: ID 1001 may be generated before ID 1000 is written
  - ID exhaustion attack: adversary can drain the sequence by making requests
  - Capacity: a MySQL ticket server handles ~30,000-50,000 IDs/sec max

When to use:
  - Low-throughput systems (< 10,000 IDs/sec)
  - Strict sequential requirement with gaps unacceptable
  - Simpler infrastructure preferred over ZooKeeper/etcd
```

### 11.3 Segment-Based Ticket Server (Optimization)

```
To reduce per-ID database round-trips, fetch segments of IDs in bulk:

+----------+                     +------------------+
| App Srv  |  Fetch segment 1000 | Ticket DB        |
|          |-------------------->| current=50000    |
| In-memory|<--------------------| Returns: [50001, |
| Buffer:  |   [50001..51000]    |  51000]          |
| 50001    |                     | Sets current=    |
| 50002    |                     | 51000            |
| ...      |                     +------------------+
| 51000    |
+----------+

App server uses local buffer; only refetches when segment exhausted.

DB hit frequency: 1 round-trip per 1000 IDs (instead of per ID)
At 100,000 IDs/sec: 100 DB round-trips/sec (very manageable)

Trade-off: Up to 1000 IDs wasted if app server crashes mid-segment.
  Gaps are acceptable in practice (not used for sequential invoices, etc.)
```

---

## 12. Monotonicity and K-Sortability

### 12.1 Definitions

```
Strictly Sequential: IDs form a gapless sequence 1, 2, 3, 4, 5...
  - Requires central coordination
  - Reveals business information
  - Hard to achieve in distributed systems

Monotonic: Each new ID from a given node is greater than the previous
  - Snowflake guarantees this PER NODE
  - Not guaranteed ACROSS nodes (ID from node A may be < ID from node B
    even if generated after, due to clock skew)

K-Sorted: IDs are sortable within some bound K
  - "All IDs generated within K milliseconds will sort correctly"
  - Snowflake with < 1ms clock skew is practically k-sorted for k=1ms
  - With NTP, typical skew is < 10ms, so k=10ms in practice

Globally Ordered: Every ID, regardless of which node generated it,
  sorts in strict generation order.
  - Impossible in distributed systems without coordination (CAP theorem)
  - Requires a Paxos/Raft consensus round per ID (too slow)
```

### 12.2 Monotonicity Guarantees by Scheme

```
+-----------------------+----------+-------------+-------------------+
| Scheme                | Per-Node | Cross-Node  | After Clock Jump  |
|                       | Monotonic| Monotonic   | Monotonic?        |
+-----------------------+----------+-------------+-------------------+
| DB Auto-Increment     | Yes      | Yes         | Yes (DB handles)  |
| Ticket Server         | Yes      | Yes         | Yes               |
| UUID v4               | No       | No          | N/A (no time)     |
| UUID v7               | Yes*     | No          | Yes* (new random) |
| Snowflake (strict)    | Yes      | No          | No (error/wait)   |
| Snowflake (logical)   | Yes      | No          | Yes (borrow ts)   |
| ULID                  | Yes*     | No          | Yes* (increment)  |
+-----------------------+----------+-------------+-------------------+
* Within same millisecond window
```

### 12.3 Database Index Behavior with K-Sorted IDs

```
B-Tree Insertion Pattern with Snowflake IDs:

Time t=0ms: All nodes generate IDs with timestamp=0
  Node 0: IDs 0..4095   (bits: 000_00000_00000_000000000000)
  Node 1: IDs 4096..8191 (bits: 000_00000_00001_000000000000)
  ...
  Node 31: IDs 126976.. (bits: 000_00000_11111_000000000000)

These IDs from the same millisecond have overlapping ranges, but
they are all numerically close to each other and will cluster in
nearby B-Tree pages.

Time t=1ms: New batch of IDs
  All 1ms IDs are greater than all 0ms IDs (timestamp portion dominates)
  B-Tree gets a new "hot zone" at the right edge, but prior pages are cold.

Compared to UUID v4: Cold page reads/writes happen across the entire tree.
Compared to Snowflake: Cold page reads happen only within the last ~10ms window.

Result for B-Tree databases (PostgreSQL, MySQL InnoDB):
  - Write amplification: low (mostly append to right side)
  - Cache efficiency: good (only recent pages are hot)
  - Fragmentation: minimal
  - VACUUM/ANALYZE: less work (sequential deletes/updates cluster)
```

---

## 13. Collision Probability Math

### 13.1 Birthday Problem Basics

```
In a space of N possible values, how many must we generate before
the probability of a collision reaches p?

n ≈ sqrt(2N * ln(1/(1-p)))

For p = 0.5 (50% collision probability):
  n ≈ 1.177 * sqrt(N)
```

### 13.2 UUID v4 Collision Analysis

```
UUID v4 has 122 random bits:
  N = 2^122 = 5.3 * 10^36

For 50% collision probability:
  n ≈ 1.177 * sqrt(2^122)
  n ≈ 1.177 * 2^61
  n ≈ 2.7 * 10^18

At 1 billion UUIDs/sec:
  Time to 50% collision = 2.7 * 10^18 / 10^9 = 2.7 * 10^9 seconds
                        = ~85 years

Practical conclusion: UUID v4 collisions are astronomically unlikely
in real systems (billions of UUIDs generated, not 10^18).

For p = 1 in 1 trillion (10^-12) at 10^9 UUIDs/sec:
  n ≈ sqrt(2 * 5.3*10^36 * 10^-12) ≈ 3.3 * 10^12 UUIDs
  Time = 3.3 * 10^12 / 10^9 = 3,300 seconds = ~55 minutes

Even at extremely high rates, UUID v4 is practically safe.
```

### 13.3 Snowflake Collision Analysis

```
Snowflake guarantees ZERO collisions when:
  1. Worker IDs are unique (guaranteed by ZooKeeper/etcd)
  2. Clock does not move backward (enforced by algorithm)
  3. Sequence space is not exhausted (4,096/ms max)

Conditions for a collision (all must be true simultaneously):
  - Two nodes have the same (datacenter_id, machine_id)     [prevented by coordination]
  - Both generate at the same millisecond                   [common]
  - Both have the same sequence counter                     [prevented by atomicity]

If worker ID uniqueness fails (both nodes claim machine_id=5):
  Same-ms, same-sequence ID probability:
  P(same seq) = 1 / 4096 per ID pair = 0.024%
  At 3,000 IDs/sec per node: ~1 collision per 1.4 seconds

This is why worker ID uniqueness is CRITICAL.

Snowflake sequence overflow risk:
  4,096 IDs/ms per node = 4,096,000 IDs/sec per node
  At 100,000 IDs/sec peak: sequence exhaustion chance = ~2.4%
  (handled by waiting for next millisecond, not a collision risk)
```

### 13.4 64-Bit Space Exhaustion Timeline

```
Snowflake timestamp field: 41 bits
  2^41 milliseconds = 2,199,023,255,552 ms
                    = 2,199,023,255 seconds
                    = 36,650,387 minutes
                    = 610,839 hours
                    = 25,451 days
                    = 69.7 years

With epoch at 2010-01-01:
  Exhaustion date = 2010 + 69.7 = ~2079

After exhaustion:
  - Timestamp wraps to 0 (if unsigned arithmetic used naively)
  - All generated IDs appear to be from 2010
  - Sorting is broken; uniqueness holds if sequence/worker still differ

Mitigation options for post-2079:
  1. Change epoch to current date (requires migrating existing IDs)
  2. Extend to 63-bit integer (keep sign bit = 0) with 42-bit timestamp
  3. Shift to 128-bit IDs (ULID, UUID v7) - 48-bit timestamp exhausts in 2^48 ms = year 10889
  4. Migrate to a new ID scheme proactively (systems rarely live 70 years)

If generating 10K IDs/sec, 64-bit unsigned space (not Snowflake):
  Total space: 2^64 = 1.84 * 10^19
  At 10,000 IDs/sec: 1.84 * 10^19 / 10^4 = 1.84 * 10^15 seconds
                   = 58.4 million years
  The timestamp layout is the binding constraint (69.7 years), not the bit space.
```

---

## 14. Scaling Strategy

### 14.1 Horizontal Scaling

```
Scaling the ID Generator Fleet

+------------------------------+
| Current: 32 nodes (4 DC * 8)|
| Capacity: 4096 IDs/ms/node  |
| = 131,072 IDs/ms fleet-wide |
| = 131 million IDs/sec max   |
+------------------------------+

Adding more nodes:
  1. Provision new VM/container
  2. Node contacts ZooKeeper/etcd at startup
  3. Receives next available (datacenter_id, machine_id) pair
  4. Begins generating immediately
  5. No coordination needed with existing nodes

Removing nodes:
  1. Drain: stop accepting new ID generation requests
  2. Complete in-flight requests
  3. Deregister from ZooKeeper (EPHEMERAL node deleted)
  4. Machine ID becomes available
  5. No impact on other nodes

Bottleneck at > 1,024 nodes:
  - Snowflake's 10 worker bits support 1,024 unique nodes
  - If you need more: increase worker bits by reducing sequence bits
  - Trade-off: fewer IDs per ms per node, more total nodes
  - Alternative: TSID with 20-bit worker space (1,048,576 nodes)
```

### 14.2 Per-Region Sharding

```
Assign datacenter_id ranges by region to simplify management:

+----------------------+----------------------+
| Datacenter ID Range  | Region               |
+----------------------+----------------------+
| 0-7   (8 DCs)       | us-east              |
| 8-15  (8 DCs)       | us-west              |
| 16-23 (8 DCs)       | eu-west              |
| 24-31 (8 DCs)       | ap-southeast         |
+----------------------+----------------------+

Within each datacenter:
  machine_id=0..31 (32 nodes per datacenter)

Each region operates independently.
No cross-region coordination for ID generation.
Regional ZooKeeper manages machine IDs within its datacenter range.
```

### 14.3 High Availability Design

```
+========================================================+
|              ID Generator HA Design                    |
+========================================================+

 Per Node:
 - Process restarts: < 1 second (ZK lease not yet expired)
 - New machine claim: < 100ms (ZK ephemeral create)
 - Impact: brief pause in ID generation from that node

 Load Balancer Health Checks:
 - HTTP GET /health every 5 seconds
 - Remove node from pool if 2 consecutive failures
 - Traffic redistributed to remaining nodes instantly

 ZooKeeper Cluster:
 - 5-node quorum (tolerates 2 failures)
 - Multi-AZ deployment
 - Only consulted at startup (not in hot path)
 - If ZK unavailable: existing nodes keep running; new nodes cannot start

 Graceful degradation:
 - If sequence exhausted: wait up to 1ms (not an error to client)
 - If clock drift < 5ms: wait for clock (not an error)
 - If clock drift 5-500ms: log warning, continue with last timestamp
 - If clock drift > 500ms: return error, trigger alert

 Circuit Breaker for ID Generator Service:
 - If HTTP service unavailable: embedded library fallback
 - Or: pre-provisioned offline cache (pull 10K IDs on startup)
```

### 14.4 Observability and Monitoring

```
Key Metrics to Export:
  - ids_generated_total (counter)
  - ids_generated_per_second (gauge)
  - sequence_per_millisecond_max (histogram)
  - clock_drift_ms (gauge)
  - ntp_sync_offset_ms (gauge)
  - worker_id_claim_duration_seconds (histogram)
  - sequence_exhaustion_events_total (counter)
  - clock_backward_events_total (counter)

Alerts:
  - sequence_exhaustion_events > 0 per minute: generator near capacity
  - clock_backward_events > 0: NTP or VM migration issue
  - ntp_sync_offset_ms > 10: clock sync degraded
  - ids_generated_per_second < expected: generator node down
  - All nodes in datacenter offline: total DC outage
```

---

## 15. Trade-offs and Alternatives

### 15.1 Full Comparison

```
+----------------+----------+----------+--------+----------+--------+----------+
| Approach       | Unique   | Ordered  | 64-bit | Coord.   | Latency| Throughput|
+----------------+----------+----------+--------+----------+--------+----------+
| DB auto-incr   | Yes*     | Yes      | Yes    | Yes/req  | 1-5ms  | ~50K/s   |
| Ticket server  | Yes      | Partial  | Yes    | Yes/req  | 1-5ms  | ~50K/s   |
| UUID v4        | Probable | No       | No     | None     | <0.1ms | >10M/s   |
| UUID v7        | Probable | Yes      | No     | None     | <0.1ms | >10M/s   |
| Snowflake      | Yes**    | Yes      | Yes    | Startup  | <0.1ms | ~4M/s    |
| ULID           | Probable | Yes      | No     | None     | <0.1ms | >5M/s    |
| TSID           | Yes**    | Yes      | Yes    | Startup  | <0.1ms | ~4M/s    |
+----------------+----------+----------+--------+----------+--------+----------+
* Per shard only
** Guaranteed when worker IDs are unique
```

### 15.2 When to Choose Each Approach

```
Choose DB Auto-Increment when:
  - Single database, never needs sharding
  - Strict sequential requirement (audit logs, invoice numbers)
  - Simplicity is paramount

Choose Ticket Server when:
  - Multi-server but low throughput (< 50K IDs/sec)
  - Cannot change database schema to use Snowflake
  - Failover is acceptable (seconds, not ms)

Choose UUID v4 when:
  - Simplest possible implementation
  - IDs are never used in database primary keys
  - Time-ordering not required
  - No ZooKeeper/etcd infrastructure available

Choose UUID v7 when:
  - 128-bit IDs are acceptable
  - Time-ordering required but ZooKeeper not available
  - Modern systems; RFC 9562 compliance desired

Choose Snowflake when:
  - Must fit in 64-bit integer (DB compatibility, storage efficiency)
  - Time-ordering and k-sortability required
  - High throughput required (> 100K IDs/sec)
  - Can provision ZooKeeper or etcd for startup coordination
  - Used by: Twitter, Discord, Instagram, Mastodon

Choose ULID when:
  - 128-bit acceptable but UUID format undesirable
  - Human-readable encoded IDs preferred
  - No coordination infrastructure available
  - Used by: many modern web apps
```

### 15.3 Instagram's Approach

Instagram solved the problem with a Postgres function that avoids external coordination:

```sql
-- Instagram's ID generation function (simplified)
-- Shard ID is assigned per Postgres instance
CREATE OR REPLACE FUNCTION next_id(OUT result BIGINT) AS $$
DECLARE
  our_epoch BIGINT := 1314220021721;  -- Custom epoch ms
  seq_id    BIGINT;
  now_ms    BIGINT;
  shard_id  INT := 5;  -- Hardcoded per DB instance
BEGIN
  SELECT nextval('global_id_sequence') % 1024 INTO seq_id;
  SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) INTO now_ms;

  result := (now_ms - our_epoch) << 23;  -- 41 bits timestamp
  result := result | (shard_id << 10);   -- 13 bits shard
  result := result | (seq_id);           -- 10 bits sequence
END;
$$ LANGUAGE PLPGSQL;
```

Differences from Snowflake: Shard ID hardcoded per database instance, not dynamically
assigned. Simpler but requires manual configuration when adding Postgres shards.

### 15.4 Discord's Snowflake Variation

```
Discord uses a custom Snowflake epoch (2015-01-01T00:00:00Z):

  DISCORD_EPOCH = 1420070400000  -- ms since 2015-01-01

Discord IDs encode:
  42 bits: timestamp (ms since Discord epoch, not 41 bits)
  10 bits: internal worker ID
  12 bits: process increment

With 42-bit timestamp: exhausts in 2^42 ms / 86400000 / 365.25 = 139.5 years
  Exhaustion: ~2154 (much safer margin than Twitter's 2079)

The extra timestamp bit comes at the cost of 1 bit from elsewhere in the layout.
Discord chose to merge datacenter+machine into a single 10-bit "worker ID".
```

---

## 16. Common Interview Follow-ups

### Q1: What happens when a Snowflake node's clock drifts backward?

**Answer:**

The generator detects this in the `if current_time < last_timestamp` check. The standard
approaches are (1) hard error for large drifts (> 5ms) to prevent duplicates, or (2) wait
for the clock to catch up for small drifts (≤ 5ms). The key insight is that Snowflake must
never use a timestamp earlier than the last generated ID's timestamp, because doing so could
produce an ID with the same (timestamp, sequence) as a previously generated ID. The sequence
counter alone is not sufficient: if we reset it to 0 at a past timestamp, we can collide.

### Q2: How would you handle a Snowflake node running for longer than 69.7 years?

**Answer:**

The 41-bit timestamp field exhausts in 69.7 years from the custom epoch. Mitigation
strategies include: (1) choose a recent epoch to push exhaustion as far as possible,
(2) plan a migration to a wider timestamp format (e.g., 42-bit = 139 years, 48-bit = 8,925
years) before exhaustion, (3) use ULID or UUID v7 which have 48-bit timestamps exhausting
in year 10889. In practice, most ID schemes will be replaced long before their timestamp
exhausts, as system architecture evolves on a 5-10 year cycle.

### Q3: Can two Snowflake nodes ever generate the same ID?

**Answer:**

Yes, if their (datacenter_id, machine_id) pair is the same. This is why worker ID
assignment via ZooKeeper or etcd is critical. If ZooKeeper is unavailable at startup,
a new node should fail to start rather than guess a worker ID. There is a brief window
during a network partition when a node might continue generating with an expired lease
while another node claims the same worker ID. This is the primary availability-vs-safety
trade-off in the system.

### Q4: Why not just use UUID v4 everywhere?

**Answer:**

UUID v4 has three main problems: (1) it is 128 bits, requiring two 64-bit integers or
a VARCHAR(36) string in databases, doubling index memory compared to a 64-bit Snowflake
ID; (2) random inserts cause B-Tree page splits across the entire index range, causing
write amplification and poor cache locality compared to time-ordered IDs; (3) you cannot
extract metadata (generation time, node) from the ID itself. For user-facing opaque IDs
where these concerns do not apply, UUID v4 is perfectly valid.

### Q5: How do you ensure monotonicity within the same millisecond?

**Answer:**

Within a single millisecond, the sequence counter (12 bits in standard Snowflake)
increments atomically for each ID generated. The sequence is protected by a mutex (or
atomic compare-and-swap) so that concurrent calls to `NextID()` never see the same
(timestamp, sequence) pair. When the sequence reaches 4,095, the generator busy-waits
for the next millisecond before continuing. This guarantees strict monotonicity from a
single node; across nodes, IDs from the same millisecond are ordered by worker ID,
which may not reflect causal ordering.

### Q6: What is k-sortability and why does it matter for databases?

**Answer:**

K-sortability means that IDs generated within a window of K time units will sort in
approximately the same order as their generation order. Snowflake IDs are k-sorted for
K equal to the maximum clock skew across nodes (typically < 10ms with NTP). This matters
for databases because time-ordered IDs cluster recent data into a narrow range of B-Tree
pages. Queries for recent data (the common case) hit a small number of hot pages, which
stay in the buffer pool. Random UUIDs spread recent data across the entire tree, requiring
many cold page fetches. K-sortability also means index fragmentation is low, and range
scans over time ranges are efficient.

### Q7: What is the maximum throughput of a single Snowflake node?

**Answer:**

Theoretically, a single Snowflake node can generate 4,096 IDs per millisecond = 4,096,000
IDs per second. In practice, system call overhead (getting the current time) and mutex
contention reduce this to approximately 500,000–1,000,000 IDs/second. If higher throughput
is needed from a single process: (1) batch generation (return N IDs at once, increment
sequence by N atomically), (2) use multiple generator goroutines/threads each with their
own machine ID, (3) use lock-free atomic operations instead of a mutex.

### Q8: How would you extract the generation time from a Snowflake ID?

**Answer:**

```python
EPOCH = 1262304000000  # 2010-01-01T00:00:00Z in ms

def decode_snowflake(id: int) -> dict:
    timestamp_ms = (id >> 22) + EPOCH
    datacenter_id = (id >> 17) & 0x1F   # bits 17-21
    machine_id    = (id >> 12) & 0x1F   # bits 12-16
    sequence      = id & 0xFFF           # bits 0-11

    from datetime import datetime, timezone
    generated_at = datetime.fromtimestamp(
        timestamp_ms / 1000,
        tz=timezone.utc
    )

    return {
        "timestamp_ms":   timestamp_ms,
        "generated_at":   generated_at.isoformat(),
        "datacenter_id":  datacenter_id,
        "machine_id":     machine_id,
        "sequence":       sequence,
    }

# Example:
# decode_snowflake(1541815603606036480)
# -> { "timestamp_ms": 1709290800123,
#      "generated_at": "2026-03-01T12:00:00.123Z",
#      "datacenter_id": 2, "machine_id": 5, "sequence": 0 }
```

### Q9: What are the security implications of time-ordered IDs?

**Answer:**

Time-ordered IDs leak creation time to anyone who can observe them. An attacker can
determine: (1) exactly when a record was created, (2) the approximate generation rate
by observing consecutive IDs (Instagram order volume, Twitter tweet rate), (3) the
datacenter and machine that created the record (from Snowflake's bit fields). Mitigations
include: (1) use UUIDs for user-facing IDs and internal Snowflake IDs for database primary
keys, with a mapping layer between them; (2) XOR the Snowflake ID with a per-tenant secret
before exposing externally (preserves ordering within tenant, hides structure); (3) use
HMAC-SHA256 to create an opaque token from the internal ID. Never expose raw Snowflake IDs
in public APIs if the business metrics encoded within them are sensitive.

### Q10: How does Snowflake handle a deployment across 5+ datacenters?

**Answer:**

With 5-bit datacenter IDs, Snowflake supports up to 32 datacenters (2^5 = 32). For 5
datacenters this is straightforward: assign datacenter_id 0-4. For more than 32 datacenters,
options are: (1) steal bits from the machine ID (e.g., 6-bit datacenter + 4-bit machine =
64 DCs, 16 machines per DC, same total 1,024 nodes); (2) switch to TSID with a 20-bit
worker space (1,048,576 unique nodes); (3) move to 128-bit IDs (ULID/UUID v7) which have
no practical worker limit since they use randomness rather than assigned IDs. The bit
layout is a configurable constant in Snowflake; the canonical Twitter layout is one choice,
not the only one.

---

## Summary Cheat Sheet

```
+=========================================================+
|          UNIQUE ID GENERATOR - INTERVIEW CHEAT SHEET    |
+=========================================================+

Snowflake Layout (memorize this!):
  [1 sign][41 timestamp][5 datacenter][5 machine][12 sequence]
  = 64 bits total
  Epoch: custom (e.g., 2010-01-01)
  Timestamp lifespan: 69.7 years
  Max nodes: 1,024 (32 DC x 32 machines)
  Max IDs/ms/node: 4,096

Key Guarantees:
  Uniqueness: guaranteed when worker IDs are unique
  Monotonicity: guaranteed per node (not cross-node)
  K-sortability: guaranteed within clock skew window

Clock Drift Handling:
  Small (< 5ms): wait for clock to catch up
  Large (> 5ms): return error, alert on-call

Worker ID Assignment:
  ZooKeeper: ephemeral node, auto-released on crash
  etcd: time-bounded lease with renewal goroutine
  K8s: StatefulSet pod ordinal (simple, no extra infra)

When to use what:
  64-bit + guaranteed unique + ordered -> Snowflake / TSID
  128-bit + ordered + no coordination  -> ULID / UUID v7
  Simplest possible                    -> UUID v4
  Low-throughput sequential            -> Ticket Server

Collision math (birthday problem):
  UUID v4 (122 random bits): safe for ~2.7 * 10^18 IDs
  Snowflake: zero collisions (by construction, not probability)

64-bit exhaustion at 10K IDs/sec:
  Timestamp constraint: ~69.7 years (binding)
  Total bit space: ~58 million years (not binding)
+=========================================================+
```
