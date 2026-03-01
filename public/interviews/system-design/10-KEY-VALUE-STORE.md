# Design a Distributed Key-Value Store

A distributed key-value store is a non-relational database where unique identifiers (keys) are
mapped to their associated values, and the data is spread across many machines. Systems like
Amazon DynamoDB, Apache Cassandra, and Riak are production examples. This guide walks through
every major design decision from scratch.

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| Operation | Signature | Description |
|-----------|-----------|-------------|
| **Put** | `put(key, value)` | Insert or update a key-value pair |
| **Get** | `get(key) -> value` | Retrieve the value for a given key |
| **Delete** | `delete(key)` | Remove a key-value pair |

Additional functional needs:

- **Automatic scaling**: Add or remove nodes without downtime.
- **Tunable consistency**: Let the caller choose between strong and eventual consistency per request.
- **Versioning**: Handle concurrent writes through conflict detection and resolution.
- **TTL support**: Keys can expire after a configurable time-to-live.

### 1.2 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Availability** | 99.99% uptime (< 52 min downtime/year) |
| **Latency** | p99 read/write < 10 ms within a datacenter |
| **Scalability** | Linear horizontal scale to hundreds of nodes |
| **Partition Tolerance** | Continue operating during network partitions |
| **Durability** | No acknowledged write is ever lost |

### 1.3 Scale Estimates

- **Total key-value pairs**: Billions (10^9 - 10^12)
- **Average key size**: 16 - 256 bytes
- **Average value size**: 1 KB (max 10 KB)
- **Total data**: 10 TB - 1 PB
- **QPS**: 100K reads/sec, 50K writes/sec

### 1.4 CAP Theorem Trade-offs

The CAP theorem states that a distributed system can provide at most **two** of three guarantees
simultaneously:

```
                    Consistency (C)
                         /\
                        /  \
                       /    \
                      / CP   \
                     /  systems\
                    /    (HBase)\
                   /____________\
                  /              \
    Availability / AP systems    \
        (A)     / (Dynamo, Cass.) \
               /   CA systems     \
              /   (single-node     \
             /     RDBMS - not     \
            /      distributed)     \
           /________________________\
                Partition Tolerance (P)
```

**Our choice: AP with tunable consistency.**

In a distributed environment, network partitions (P) are inevitable. We therefore choose between:

- **CP**: Sacrifice availability during partitions. Reject writes if quorum is unreachable.
- **AP**: Sacrifice strict consistency. Accept writes even during partitions; reconcile later.

We favor **AP** by default (like Dynamo) but allow **tunable consistency** so callers can opt
into CP behavior per request when needed (e.g., financial transactions).

---

## 2. Single Server Key-Value Store

Before distributing, let us understand the single-server baseline.

### 2.1 In-Memory Hash Table

The simplest key-value store is an in-memory hash map:

```
┌───────────────────────────────────────┐
│           In-Memory Hash Map          │
│                                       │
│   key_1  ──►  value_1                 │
│   key_2  ──►  value_2                 │
│   key_3  ──►  value_3                 │
│   ...                                 │
│   key_n  ──►  value_n                 │
│                                       │
│   O(1) average get/put/delete         │
└───────────────────────────────────────┘
```

**Pseudocode:**

```python
class SingleServerKVStore:
    def __init__(self):
        self.store = {}        # in-memory hash map
        self.wal = WAL()       # write-ahead log on disk

    def put(self, key, value):
        self.wal.append("PUT", key, value)   # durability
        self.store[key] = value              # fast access

    def get(self, key):
        return self.store.get(key, None)

    def delete(self, key):
        self.wal.append("DELETE", key)
        del self.store[key]
```

### 2.2 Limitations

| Limitation | Explanation |
|------------|-------------|
| **Memory** | All data must fit in RAM. A server with 256 GB RAM at 1 KB/value holds ~250M keys. |
| **Durability** | Without a WAL, a crash loses everything. |
| **Availability** | Single point of failure. One server down = total outage. |
| **Throughput** | Vertical scaling has hard limits (CPU, NIC, disk I/O). |

### 2.3 Persistence: Write-Ahead Log

A **write-ahead log (WAL)** appends every mutation to disk before applying it in memory.
On crash recovery, the WAL is replayed to rebuild state.

```
Client Request
      │
      ▼
┌─────────────┐     ┌────────────────────────┐
│  Append to  │────►│  WAL on Disk           │
│  WAL first  │     │  [PUT k1 v1]           │
└─────┬───────┘     │  [PUT k2 v2]           │
      │             │  [DEL k1]              │
      ▼             │  [PUT k3 v3]           │
┌─────────────┐     │  ...                   │
│  Apply to   │     └────────────────────────┘
│  Hash Map   │
└─────────────┘
```

### 2.4 Why We Need Distribution

To serve billions of keys with high availability and low latency, we **must** distribute the
data across many machines. The rest of this guide focuses on the design decisions that make
distribution work.

---

## 3. Data Partitioning

### 3.1 Why Consistent Hashing?

Naive partitioning (`hash(key) % N`) causes massive data movement when nodes are added or
removed. If `N` changes from 4 to 5, nearly **all** keys must be remapped.

**Consistent hashing** minimizes data movement: only `K/N` keys (on average) need to move
when a node joins or leaves.

### 3.2 Basic Consistent Hashing

Map both **keys** and **nodes** onto the same circular hash space (0 to 2^128 - 1).

```
                        0 / 2^128
                          │
                     ┌────┴────┐
                    /           \
                  N1              k3
                 /                 \
                │                   │
               k1                  N2
                │                   │
                 \                 /
                  k4             k2
                    \           /
                     └────┬────┘
                          │
                         N3

  Walk clockwise from key to find its owning node:
    k1 → N1    (k1 is between N3 and N1 clockwise)
    k2 → N3    (k2 is between N2 and N3 clockwise)
    k3 → N2    (k3 is between N1 and N2 clockwise)
    k4 → N3    (k4 is between N2 and N3 clockwise)
```

**Algorithm:**

1. Hash each node ID to a position on the ring: `pos = hash(node_id)`.
2. Hash each key to a position: `pos = hash(key)`.
3. Walk clockwise from the key's position; the first node encountered owns that key.

### 3.3 Virtual Nodes

With few physical nodes, the distribution can be skewed. **Virtual nodes** solve this by
mapping each physical node to multiple positions on the ring.

```
Physical Node    Virtual Nodes on Ring
─────────────    ─────────────────────
  Node A     →   A_0, A_1, A_2, ..., A_199
  Node B     →   B_0, B_1, B_2, ..., B_199
  Node C     →   C_0, C_1, C_2, ..., C_199
```

```
                        0
                        │
                   ┌────┴────┐
                  /           \
               A_0             B_1
               /                 \
              │                   │
            C_2                  A_1
              │                   │
               \                 /
               B_0             C_0
                  \           /
                   └────┬────┘
                        │
                       A_2

  Keys are distributed more evenly because each
  physical node covers many small arcs.
```

**Benefits of virtual nodes:**

| Benefit | Explanation |
|---------|-------------|
| **Even distribution** | Each node covers many small arcs instead of one large arc |
| **Heterogeneous hardware** | Powerful nodes get more virtual nodes |
| **Smooth rebalancing** | Adding a node spreads load across many existing nodes |

**Typical count:** 100-200 virtual nodes per physical node.

### 3.4 Adding / Removing Nodes

**Adding Node D:**

```
Before:                          After:
   ┌──────┐                        ┌──────┐
  A│      │B                      A│      │B
   │      │                        │  D   │
   │      │                        │ ↗    │
  C│      │                       C│      │
   └──────┘                        └──────┘

Only keys in the arc between D's predecessor and D
need to move to D. All other keys stay put.

Data movement = K / N  (on average)
```

**Removing Node B:**

Only B's keys move to B's successor. Other keys are unaffected.

### 3.5 Hot Spot Handling

If a particular key is extremely popular (celebrity tweet, viral video metadata):

1. **Read replicas**: Replicate the hot key to additional nodes.
2. **Client-side caching**: Cache the hot key in the application tier.
3. **Key splitting**: Append a random suffix (`hot_key_0`, `hot_key_1`, ..., `hot_key_99`)
   and scatter reads across 100 keys. The client randomly picks a suffix on each read.

---

## 4. Data Replication

### 4.1 Replication Factor N

Each key-value pair is replicated on **N** nodes (typically N = 3) for durability and
availability. If one or two nodes fail, data is still accessible.

### 4.2 Replica Placement on the Hash Ring

After locating the primary node for a key (via consistent hashing), the next **N-1 unique
physical nodes** clockwise on the ring also store replicas.

```
                        0
                        │
                   ┌────┴────┐
                  /           \
               Node A          Node B
               /  (replica 1)    \  (primary)
              │                   │
              │       key X       │
              │     hash(X) ──►   │
              │                   │
               \                 /
              Node D          Node C
                  \  (replica 2) /
                   └────┬────┘
                        │

  key X maps to Node B (primary).
  Replicas: Node C (next clockwise), Node D (next).
  N = 3 total copies.

  NOTE: If virtual nodes for the same physical node
  appear consecutively, we skip them and pick the
  next distinct physical node.
```

### 4.3 Sloppy Quorum and Hinted Handoff

In a strict quorum, if the designated replicas are unreachable, writes fail. A **sloppy
quorum** relaxes this:

- If a designated replica is down, the write goes to the **next healthy node** on the ring.
- That healthy node stores the data with a **hint** indicating the intended recipient.
- When the intended node recovers, the hinted data is **handed off** (transferred back).

```
Normal operation:
  key X → [B, C, D]   (N=3 replicas)

Node C is down:
  key X → [B, E, D]   (E holds data with hint "for C")
                ▲
                │
          hinted handoff

When C recovers:
  E transfers C's data back to C
  E deletes the hinted copy
```

This mechanism improves **write availability** at the cost of temporarily having replicas on
non-ideal nodes.

---

## 5. Consistency Models

### 5.1 Strong Consistency

Every read returns the most recent write. Requires coordination (e.g., Raft, Paxos) which
adds latency and reduces availability during partitions.

### 5.2 Eventual Consistency

If no new updates are made, all replicas will eventually converge to the same value. Reads
may return stale data temporarily. This is the default for AP systems.

### 5.3 Quorum Consensus

With **N** replicas, define:
- **W** = number of replicas that must acknowledge a write
- **R** = number of replicas that must respond to a read

**Consistency guarantee:** If `W + R > N`, at least one node in the read set has the latest
write (pigeon-hole principle).

```
┌───────────────────────────────────────────────────────────────┐
│                    Quorum Configurations                      │
├──────────────┬───────┬───────┬────────────────────────────────┤
│ Config       │   W   │   R   │ Characteristics               │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Fast writes  │   1   │   N   │ Write to 1, read from all.    │
│              │       │       │ Low write latency.             │
│              │       │       │ High read latency.             │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Fast reads   │   N   │   1   │ Write to all, read from 1.    │
│              │       │       │ Low read latency.              │
│              │       │       │ High write latency.            │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Balanced     │ N/2+1 │ N/2+1 │ Majority quorum.              │
│ (typical)    │       │       │ Good balance of latency.       │
│              │       │       │ Tolerates up to N/2 failures.  │
├──────────────┼───────┼───────┼────────────────────────────────┤
│ Eventual     │   1   │   1   │ No consistency guarantee.      │
│              │       │       │ Fastest but may read stale.    │
└──────────────┴───────┴───────┴────────────────────────────────┘

Example with N = 3:
  Balanced: W=2, R=2   →  W + R = 4 > 3  ✓ consistent
  Fast write: W=1, R=3 →  W + R = 4 > 3  ✓ consistent
  Eventual: W=1, R=1   →  W + R = 2 < 3  ✗ may be stale
```

### 5.4 Vector Clocks for Conflict Resolution

When replicas receive concurrent writes, we need a mechanism to detect and resolve conflicts.
**Vector clocks** track the causal history of each value.

A vector clock is a list of `(node, counter)` pairs. Each node increments its own counter on
every write.

**How vector clocks work:**

```
1. Initial state:
   All replicas have value v0 with clock []

2. Client A writes v1 through Node A:
   Clock: [A:1]

3. Client B reads v1 [A:1], writes v2 through Node B:
   Clock: [A:1, B:1]    (B saw A:1, incremented B)

4. Client C reads v1 [A:1], writes v3 through Node C:
   Clock: [A:1, C:1]    (C saw A:1, incremented C)

5. Conflict detected!
   [A:1, B:1] and [A:1, C:1] are concurrent.
   Neither dominates the other.
```

**Vector Clock Progression Diagram:**

```
  Client A              Node A              Node B              Node C
     │                    │                    │                    │
     │── put(k, v1) ────►│                    │                    │
     │                    │ clock: [A:1]       │                    │
     │                    │── replicate ──────►│                    │
     │                    │── replicate ───────────────────────────►│
     │                    │                    │                    │
     │                    │                    │                    │
  Client B                │                    │                    │
     │                    │                    │                    │
     │── get(k) ─────────────────────────────►│                    │
     │◄─ v1 [A:1] ───────────────────────────│                    │
     │── put(k, v2) ─────────────────────────►│                    │
     │                    │                    │ clock: [A:1, B:1]  │
     │                    │                    │                    │
  Client C                │                    │                    │
     │                    │                    │                    │
     │── get(k) ──────────────────────────────────────────────────►│
     │◄─ v1 [A:1] ────────────────────────────────────────────────│
     │── put(k, v3) ──────────────────────────────────────────────►│
     │                    │                    │  clock: [A:1, C:1] │
     │                    │                    │                    │
  CONFLICT: [A:1, B:1] vs [A:1, C:1]  — neither dominates
```

**Dominance rules:**

- Clock X **dominates** clock Y if every component of X >= corresponding component of Y,
  and at least one is strictly greater.
- If neither dominates, the writes are **concurrent** and must be resolved.

```
[A:2, B:1] dominates [A:1, B:1]     → keep [A:2, B:1], discard other
[A:1, B:1] vs [A:1, C:1]            → CONFLICT (concurrent)
```

**Conflict resolution strategies:**

| Strategy | Description | Used By |
|----------|-------------|---------|
| **Last-writer-wins (LWW)** | Use wall-clock timestamp; highest wins | Cassandra |
| **Application-level** | Return all versions; let app merge | Riak, DynamoDB |
| **CRDTs** | Conflict-free data structures auto-merge | Riak (optional) |

**Pseudocode for vector clock comparison:**

```python
def compare(clock_a, clock_b):
    """
    Returns:
      'BEFORE'     if clock_a < clock_b  (a happened before b)
      'AFTER'      if clock_a > clock_b  (a happened after b)
      'CONCURRENT' if neither dominates
    """
    a_less = False
    b_less = False
    all_nodes = set(clock_a.keys()) | set(clock_b.keys())

    for node in all_nodes:
        ca = clock_a.get(node, 0)
        cb = clock_b.get(node, 0)
        if ca < cb:
            a_less = True
        elif ca > cb:
            b_less = True

    if a_less and not b_less:
        return 'BEFORE'
    if b_less and not a_less:
        return 'AFTER'
    if a_less and b_less:
        return 'CONCURRENT'
    return 'EQUAL'
```

---

## 6. Handling Failures

### 6.1 Failure Detection: Gossip Protocol

In a decentralized system with no leader, nodes must **discover failures** without a single
point of coordination. The **gossip protocol** (also called epidemic protocol) achieves this.

**How gossip works:**

1. Each node maintains a **membership list**: `{node_id: heartbeat_counter, timestamp}`.
2. Periodically (e.g., every 1 second), each node increments its own heartbeat counter.
3. Each node randomly picks **a few peers** and sends its membership list.
4. On receiving a gossip message, the node **merges** the lists (keeping higher heartbeats).
5. If a node's heartbeat has not increased for a **threshold** duration (e.g., 10 seconds),
   it is marked as **suspected**.
6. After a longer timeout, the suspected node is marked as **failed**.

```
┌─────────┐  gossip   ┌─────────┐  gossip   ┌─────────┐
│ Node A  │◄─────────►│ Node B  │◄─────────►│ Node C  │
│         │           │         │           │         │
│ Members:│           │ Members:│           │ Members:│
│ A: 42   │           │ A: 40   │           │ A: 38   │
│ B: 30   │           │ B: 31   │           │ B: 29   │
│ C: 55   │           │ C: 53   │           │ C: 56   │
│ D: 18   │           │ D: 18   │           │ D: 18   │
└─────────┘           └─────────┘           └─────────┘
     │                                           │
     │              gossip                       │
     └───────────────────────────────────────────┘

After gossip round, each node converges:
  A: 42, B: 31, C: 56, D: 18

If D's counter stays at 18 for > 10 seconds:
  → D is suspected, then marked failed.
```

**Gossip convergence time:** O(log N) rounds to propagate information to all N nodes.

### 6.2 Temporary Failures: Sloppy Quorum + Hinted Handoff

(Covered in Section 4.3 above.)

When a node is temporarily unreachable:

1. Redirect writes to an alternate node (sloppy quorum).
2. The alternate stores the data with a forwarding hint.
3. When the original node recovers, data is handed back.

This ensures writes are not rejected during brief outages.

### 6.3 Permanent Failures: Anti-Entropy with Merkle Trees

When a node is permanently lost and replaced, or when replicas drift due to missed hinted
handoffs, we need a mechanism to efficiently synchronize data. **Merkle trees** (hash trees)
make this efficient.

**How Merkle trees work:**

A Merkle tree is a binary tree where:
- **Leaf nodes** contain hashes of individual data blocks (key ranges).
- **Internal nodes** contain hashes of their children.
- The **root hash** summarizes the entire dataset.

```
                    Root: H(AB+CD)
                   /              \
              H(AB)                H(CD)
             /     \              /     \
          H(A)    H(B)         H(C)    H(D)
           │       │            │       │
        ┌──┴──┐ ┌──┴──┐    ┌──┴──┐ ┌──┴──┐
        │ k1  │ │ k2  │    │ k3  │ │ k4  │
        │ k5  │ │ k6  │    │ k7  │ │ k8  │
        │ k9  │ │ k10 │    │ k11 │ │ k12 │
        └─────┘ └─────┘    └─────┘ └─────┘
        Range A  Range B    Range C  Range D
```

**Comparing trees to find inconsistencies:**

Two replicas each build a Merkle tree over the same key ranges. They compare:

```
  Replica 1                           Replica 2
  Root: 0xABCD                        Root: 0xABCE    ← mismatch!
       /      \                            /      \
  H(AB): 0x1234  H(CD): 0x5678       H(AB): 0x1234  H(CD): 0x5679  ← mismatch!
    /   \          /   \                /   \          /   \
 H(A)   H(B)   H(C)   H(D)         H(A)   H(B)   H(C)   H(D)
 0xAA   0xBB   0xCC   0xDD         0xAA   0xBB   0xCC   0xDE
                                                          ↑
                                               Mismatch! Only Range D
                                               needs synchronization.
```

**Advantage:** Instead of transferring all data, only the differing ranges need to be synced.
With millions of keys, this reduces network transfer dramatically.

**Steps:**

1. Each replica builds a Merkle tree over its key ranges.
2. Compare root hashes. If equal, replicas are in sync.
3. If different, recursively compare children until the differing leaf ranges are identified.
4. Synchronize only those ranges.

**Complexity:** O(log N) comparisons to find O(1) differing ranges.

### 6.4 Data Center Outage: Cross-DC Replication

For disaster recovery, replicate data across multiple data centers:

- Each key has replicas in **at least 2 data centers**.
- Writes are replicated asynchronously across DCs to avoid cross-DC latency on the write path.
- During a DC outage, traffic is routed to the surviving DC.

(See Section 11 for the full multi-DC architecture diagram.)

---

## 7. Storage Engine Deep Dive

### 7.1 LSM Tree (Log-Structured Merge-Tree)

The LSM tree is the dominant storage engine for write-heavy key-value stores (Cassandra,
RocksDB, LevelDB, HBase). It converts random writes into sequential I/O.

**Architecture:**

```
                       Write Path
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                      MemTable                            │
│                (In-Memory Sorted Tree)                   │
│                  e.g., Red-Black Tree                    │
│                                                          │
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐              │
│   │ a  │──│ d  │──│ f  │──│ k  │──│ z  │              │
│   │ =1 │  │ =4 │  │ =6 │  │ =11│  │ =26│              │
│   └────┘  └────┘  └────┘  └────┘  └────┘              │
│                                                          │
│   When MemTable reaches threshold (e.g., 64 MB):        │
│   → Freeze as Immutable MemTable                        │
│   → Create new MemTable for incoming writes             │
│   → Flush Immutable MemTable to disk as SSTable         │
└──────────────────────────────────────────────────────────┘
                          │
                          │ flush
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    SSTable (Level 0)                      │
│            (Sorted String Table on Disk)                 │
│                                                          │
│   ┌──────────────────────────────────────┐              │
│   │  Index Block  │  Data Blocks (sorted) │              │
│   │  a → offset 0 │  [a=1][d=4][f=6]     │              │
│   │  k → offset 48│  [k=11][z=26]        │              │
│   └──────────────────────────────────────┘              │
│                                                          │
│   ┌──────────────────────────────────────┐              │
│   │  Bloom Filter (in memory)            │              │
│   │  Quickly answers: "Is key X in this  │              │
│   │  SSTable?" with no false negatives   │              │
│   └──────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────┘
                          │
                          │ compaction
                          ▼
┌──────────────────────────────────────────────────────────┐
│                SSTables (Levels 1, 2, ...)               │
│                                                          │
│   Level 0:  [SST-1] [SST-2] [SST-3]  (may overlap)     │
│                  │       │       │                        │
│                  └───────┼───────┘                        │
│                     compaction                            │
│                          │                                │
│   Level 1:  [SST-A]──[SST-B]──[SST-C]  (no overlap)    │
│                          │                                │
│                     compaction                            │
│                          │                                │
│   Level 2:  [SST-X]─[SST-Y]─[SST-Z]─[SST-W]           │
│             (10x larger than Level 1)                    │
└──────────────────────────────────────────────────────────┘
```

**Write path:**

1. Append to **Write-Ahead Log** (WAL) on disk for durability.
2. Insert into **MemTable** (in-memory balanced tree).
3. Acknowledge write to client immediately.
4. When MemTable exceeds threshold, freeze it and flush to a new **SSTable** on disk.
5. Background **compaction** merges SSTables to remove duplicates and tombstones.

**Read path:**

1. Check **MemTable** (most recent data).
2. Check **Bloom filters** for each SSTable (quickly skip SSTables that do not contain the key).
3. Search SSTables from newest to oldest, using the index block for binary search.
4. Return the first (newest) value found.

**Compaction strategies:**

| Strategy | Description | Trade-off |
|----------|-------------|-----------|
| **Size-tiered** | Merge SSTables of similar size | Higher space amplification, better write throughput |
| **Leveled** | Each level is 10x larger; strict non-overlap within levels | Lower space amplification, more compaction I/O |

### 7.2 B-Tree (Comparison)

B-Trees are the traditional storage engine for read-heavy workloads (MySQL InnoDB, PostgreSQL).

```
                    B-Tree (order 4)
                    ┌───────────┐
                    │  10 │ 20  │
                    └──┬──┴──┬──┘
                   /   │      \
         ┌────────┐ ┌────────┐ ┌────────┐
         │ 3 │ 7  │ │12 │ 15│ │ 25│ 30 │
         └────────┘ └────────┘ └────────┘
            │          │           │
          (leaf      (leaf       (leaf
          pages)     pages)      pages)
```

### 7.3 LSM vs B-Tree Comparison

| Characteristic | LSM Tree | B-Tree |
|---------------|----------|--------|
| **Write throughput** | Higher (sequential I/O) | Lower (random I/O) |
| **Read throughput** | Lower (check multiple levels) | Higher (single tree traversal) |
| **Write amplification** | Higher (compaction rewrites) | Lower |
| **Space amplification** | Higher (temporary duplicates) | Lower (in-place updates) |
| **Best for** | Write-heavy workloads | Read-heavy, range-scan workloads |
| **Used by** | Cassandra, RocksDB, LevelDB | MySQL, PostgreSQL |

**For our key-value store, we choose LSM trees** because key-value workloads are typically
write-heavy, and LSM trees provide superior write throughput.

---

## 8. Write & Read Paths

### 8.1 Write Path (Detailed)

```
  Client
    │
    │  put(key, value)
    │
    ▼
┌────────────────┐
│  Coordinator   │  (any node can be coordinator)
│  Node          │
└───────┬────────┘
        │
        │  1. Determine replica nodes via consistent hashing
        │
        ├──────────────────────────┬──────────────────────────┐
        ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  Replica 1   │          │  Replica 2   │          │  Replica 3   │
│              │          │              │          │              │
│ ┌──────────┐ │          │ ┌──────────┐ │          │ ┌──────────┐ │
│ │1. Append │ │          │ │1. Append │ │          │ │1. Append │ │
│ │   WAL    │ │          │ │   WAL    │ │          │ │   WAL    │ │
│ └────┬─────┘ │          │ └────┬─────┘ │          │ └────┬─────┘ │
│      │       │          │      │       │          │      │       │
│ ┌────▼─────┐ │          │ ┌────▼─────┐ │          │ ┌────▼─────┐ │
│ │2. Write  │ │          │ │2. Write  │ │          │ │2. Write  │ │
│ │ MemTable │ │          │ │ MemTable │ │          │ │ MemTable │ │
│ └────┬─────┘ │          │ └────┬─────┘ │          │ └────┬─────┘ │
│      │       │          │      │       │          │      │       │
│ ┌────▼─────┐ │          │ ┌────▼─────┐ │          │ ┌────▼─────┐ │
│ │3. Send   │ │          │ │3. Send   │ │          │ │3. Send   │ │
│ │   ACK    │ │          │ │   ACK    │ │          │ │   ACK    │ │
│ └──────────┘ │          │ └──────────┘ │          │ └──────────┘ │
│              │          │              │          │              │
│ (Background) │          │ (Background) │          │ (Background) │
│ 4. Flush to  │          │ 4. Flush to  │          │ 4. Flush to  │
│    SSTable   │          │    SSTable   │          │    SSTable   │
└──────────────┘          └──────────────┘          └──────────────┘
        │                          │                          │
        │         ACK              │          ACK             │
        └──────────┬───────────────┘──────────────────────────┘
                   │
                   ▼
           Coordinator waits for W ACKs (e.g., W=2 of 3)
           Then responds SUCCESS to client
```

**Steps:**

1. Client sends `put(key, value)` to any node (the **coordinator**).
2. Coordinator determines the N replica nodes using consistent hashing.
3. Coordinator forwards the write to all N replicas in parallel.
4. Each replica:
   a. Appends the mutation to its **WAL** (sequential disk write).
   b. Inserts into its **MemTable** (in-memory).
   c. Sends **ACK** back to the coordinator.
5. Coordinator waits for **W** acknowledgments, then responds to the client.
6. In the background, when the MemTable is full, it is flushed to an **SSTable** on disk.

### 8.2 Read Path (Detailed)

```
  Client
    │
    │  get(key)
    │
    ▼
┌────────────────┐
│  Coordinator   │
│  Node          │
└───────┬────────┘
        │
        │  Send read request to R replicas
        │
        ├──────────────────────────┬──────────────────┐
        ▼                          ▼                  ▼
┌──────────────┐          ┌──────────────┐    ┌──────────────┐
│  Replica 1   │          │  Replica 2   │    │  Replica 3   │
│              │          │              │    │              │
│ 1. MemTable  │          │ 1. MemTable  │    │ 1. MemTable  │
│    found? ───┼─► Yes    │    found? ───┼─►  │    found? ── │
│    return    │  No ↓    │    return    │    │    return    │
│              │          │              │    │              │
│ 2. Bloom     │          │ 2. Bloom     │    │ 2. Bloom     │
│    filter    │          │    filter    │    │    filter    │
│    check     │          │    check     │    │    check     │
│    SST-1: No │          │              │    │              │
│    SST-2: Yes│          │              │    │              │
│         ↓    │          │              │    │              │
│ 3. Binary    │          │              │    │              │
│    search    │          │              │    │              │
│    SST-2     │          │              │    │              │
│    index     │          │              │    │              │
│         ↓    │          │              │    │              │
│ 4. Read data │          │              │    │              │
│    block     │          │              │    │              │
└──────┬───────┘          └──────┬───────┘    └──────┬───────┘
       │                         │                    │
       │     value + clock       │                    │
       └─────────┬───────────────┘────────────────────┘
                 │
                 ▼
         Coordinator collects R responses
         Picks value with highest vector clock
         (Triggers read repair if values differ)
         Returns value to client
```

**Steps:**

1. Client sends `get(key)` to any node (the coordinator).
2. Coordinator sends the read to **R** replicas in parallel.
3. Each replica searches locally:
   a. Check **MemTable** (newest data, in-memory).
   b. If not found, check **Bloom filter** for each SSTable (oldest to newest is wrong; check newest first).
   c. For SSTables where the Bloom filter says "maybe yes," do a binary search on the index block.
   d. Read the data block and return the value.
4. Coordinator collects R responses, picks the one with the **latest vector clock**.
5. If responses disagree, trigger a **read repair**: send the newest value to stale replicas.

---

## 9. System Architecture

### 9.1 Full Architecture Diagram

```
                              ┌──────────┐
                              │  Client  │
                              └────┬─────┘
                                   │
                          ┌────────▼─────────┐
                          │   Load Balancer   │
                          └────────┬─────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │   Node A    │       │   Node B    │       │   Node C    │
     │ (Coord.)    │       │ (Coord.)    │       │ (Coord.)    │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Request     │       │ Request     │       │ Request     │
     │ Handler     │       │ Handler     │       │ Handler     │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Consistent  │       │ Consistent  │       │ Consistent  │
     │ Hash Ring   │       │ Hash Ring   │       │ Hash Ring   │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Storage     │       │ Storage     │       │ Storage     │
     │ Engine      │       │ Engine      │       │ Engine      │
     │ (LSM Tree)  │       │ (LSM Tree)  │       │ (LSM Tree)  │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Replication  │       │ Replication  │       │ Replication  │
     │ Manager     │       │ Manager     │       │ Manager     │
     ├─────────────┤       ├─────────────┤       ├─────────────┤
     │ Failure     │       │ Failure     │       │ Failure     │
     │ Detector    │       │ Detector    │       │ Detector    │
     │ (Gossip)    │       │ (Gossip)    │       │ (Gossip)    │
     └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
            │                      │                      │
            │    Gossip Protocol   │    Gossip Protocol    │
            ◄──────────────────────►──────────────────────►
            │                      │                      │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │   Node D    │       │   Node E    │       │   Node F    │
     │   (same     │       │   (same     │       │   (same     │
     │   structure)│       │   structure)│       │   structure)│
     └─────────────┘       └─────────────┘       └─────────────┘
```

### 9.2 Key Design Properties

| Property | Implementation |
|----------|---------------|
| **No single point of failure** | Every node is equal (leaderless/peer-to-peer) |
| **Any node can coordinate** | Client can contact any node; that node becomes coordinator |
| **Decentralized failure detection** | Gossip protocol; no master to fail |
| **Decentralized membership** | Gossip-based membership list |
| **Horizontal scaling** | Add nodes; consistent hashing redistributes minimal data |

### 9.3 Node Components

Each node runs the following components:

```
┌─────────────────────────────────────────────┐
│                  Node                        │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         Request Handler              │   │
│  │  - Accept client requests            │   │
│  │  - Route to correct replicas         │   │
│  │  - Collect quorum responses          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         Storage Engine (LSM)         │   │
│  │  ┌─────────┐  ┌──────────────────┐  │   │
│  │  │MemTable │  │   WAL            │  │   │
│  │  └────┬────┘  └──────────────────┘  │   │
│  │       │                              │   │
│  │  ┌────▼────────────────────────┐    │   │
│  │  │  SSTables + Bloom Filters   │    │   │
│  │  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │       Gossip / Failure Detector       │   │
│  │  - Membership list                    │   │
│  │  - Heartbeat counters                 │   │
│  │  - Suspicion / failure marking        │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │       Anti-Entropy / Repair           │   │
│  │  - Merkle tree comparison             │   │
│  │  - Read repair                        │   │
│  │  - Hinted handoff queue               │   │
│  └──────────────────────────────────────┘   │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 10. Tunable Consistency

### 10.1 Configuration Parameters

The system exposes three parameters that clients can set **per request**:

| Parameter | Description | Default |
|-----------|-------------|---------|
| **N** | Number of replicas | 3 |
| **W** | Write quorum (ACKs needed for write success) | 2 |
| **R** | Read quorum (responses needed for read success) | 2 |

### 10.2 Use Case Examples

**Strong consistency for banking:**

```
N = 3, W = 2, R = 2    →  W + R = 4 > 3  ✓

  put("balance:user123", 500)
  → Must get ACK from 2/3 replicas before success
  → Read must query 2/3 replicas
  → At least 1 replica overlaps → guaranteed latest value

  Trade-off: Higher latency (wait for slower replica)
             Lower availability (need 2/3 up for writes)
```

**High availability for social media:**

```
N = 3, W = 1, R = 1    →  W + R = 2 < 3  (eventual consistency)

  put("likes:post456", 10042)
  → Write succeeds as soon as 1 replica ACKs
  → Read returns from fastest replica (may be stale)

  Trade-off: May show slightly stale like counts
             But writes never fail (even if 2/3 nodes down)
```

**Write-heavy logging / telemetry:**

```
N = 3, W = 1, R = 3

  → Writes are fast (1 ACK)
  → Reads are consistent (query all 3, guaranteed latest)
  → Good for "write once, read rarely" workloads
```

### 10.3 Consistency Decision Tree

```
Is strong consistency required?
  │
  ├── YES → Set W + R > N
  │         │
  │         ├── Read-heavy?  → W = N, R = 1
  │         ├── Write-heavy? → W = 1, R = N
  │         └── Balanced?    → W = ⌈(N+1)/2⌉, R = ⌈(N+1)/2⌉
  │
  └── NO  → Eventual consistency acceptable
            │
            ├── Maximize availability → W = 1, R = 1
            └── Best-effort fresh    → W = 1, R = 2
```

---

## 11. Deployment Architecture

### 11.1 Multi-Datacenter Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Global Load Balancer                        │
│                    (Route to nearest DC)                            │
└───────────────┬────────────────────────────┬────────────────────────┘
                │                            │
     ┌──────────▼──────────┐      ┌──────────▼──────────┐
     │   Data Center 1     │      │   Data Center 2     │
     │   (US-East)         │      │   (EU-West)         │
     │                     │      │                     │
     │  ┌───┐ ┌───┐ ┌───┐ │      │  ┌───┐ ┌───┐ ┌───┐ │
     │  │N1 │ │N2 │ │N3 │ │      │  │N4 │ │N5 │ │N6 │ │
     │  └─┬─┘ └─┬─┘ └─┬─┘ │      │  └─┬─┘ └─┬─┘ └─┬─┘ │
     │    │     │     │    │      │    │     │     │    │
     │    └─────┼─────┘    │      │    └─────┼─────┘    │
     │     Gossip/Repl.    │      │     Gossip/Repl.    │
     │                     │      │                     │
     └──────────┬──────────┘      └──────────┬──────────┘
                │                            │
                │   Cross-DC Async           │
                │   Replication              │
                └────────────────────────────┘

     ┌──────────────────────────────────────────────────┐
     │          Data Center 3 (AP-Tokyo)                │
     │                                                   │
     │  ┌───┐ ┌───┐ ┌───┐                              │
     │  │N7 │ │N8 │ │N9 │                              │
     │  └─┬─┘ └─┬─┘ └─┬─┘                              │
     │    └─────┼─────┘                                  │
     │     Gossip/Repl.                                  │
     │                                                   │
     └──────────────────┬───────────────────────────────┘
                        │
           Cross-DC Async Replication
           to DC1 and DC2
```

### 11.2 Replication Across Data Centers

| Aspect | Implementation |
|--------|---------------|
| **Intra-DC replication** | Synchronous (low latency within DC) |
| **Cross-DC replication** | Asynchronous (avoid cross-DC latency penalty on writes) |
| **Conflict resolution** | Last-writer-wins or vector clocks (depending on config) |
| **Replica placement** | Ensure N replicas span at least 2 DCs |
| **Consistency** | LOCAL_QUORUM (quorum within local DC) or EACH_QUORUM (quorum in each DC) |

### 11.3 Failure Scenarios

```
Scenario 1: Single node failure
  → Sloppy quorum + hinted handoff
  → No data loss, no downtime

Scenario 2: Rack failure
  → Replicas on other racks serve requests
  → Anti-entropy repairs when rack recovers

Scenario 3: Entire DC failure
  → Global load balancer routes to surviving DCs
  → Cross-DC replicas serve all requests
  → When DC recovers, anti-entropy synchronizes
```

---

## 12. Comparison with Real Systems

### 12.1 Feature Comparison

```
┌──────────────────┬──────────────┬──────────────┬──────────────┐
│ Feature          │  DynamoDB    │  Cassandra   │  Riak        │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Architecture     │ Managed      │ Self-hosted  │ Self-hosted  │
│                  │ (AWS)        │ (or managed) │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Data Model       │ Key-value +  │ Wide-column  │ Key-value    │
│                  │ document     │              │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Partitioning     │ Consistent   │ Consistent   │ Consistent   │
│                  │ hashing      │ hashing      │ hashing      │
│                  │ (virtual     │ (vnodes or   │ (vnodes)     │
│                  │  partitions) │  tokens)     │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Replication      │ 3 replicas   │ Configurable │ Configurable │
│                  │ across AZs   │ N (default 3)│ N (default 3)│
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Consistency      │ Eventually   │ Tunable      │ Tunable      │
│                  │ consistent   │ (W, R, N)    │ (W, R, N)    │
│                  │ or strong    │              │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Conflict         │ Last-writer  │ Last-writer  │ Vector       │
│ Resolution       │ -wins (LWW)  │ -wins (LWW)  │ clocks +     │
│                  │              │              │ siblings     │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Storage Engine   │ B-Tree       │ LSM Tree     │ Bitcask /    │
│                  │ (custom)     │              │ LevelDB      │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Failure          │ Internal     │ Gossip       │ Gossip       │
│ Detection        │ (managed)    │ (Phi Accrual)│              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Anti-Entropy     │ Internal     │ Merkle trees │ Merkle trees │
│                  │ (managed)    │ + read repair│ + AAE        │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Membership       │ Managed      │ Gossip       │ Gossip       │
│                  │              │ (Snitch)     │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ CAP Choice       │ AP (default) │ AP (default) │ AP           │
│                  │ CP (opt-in)  │ CP (opt-in)  │              │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Multi-DC         │ Global       │ Yes          │ Yes          │
│                  │ Tables       │ (NetworkTopo │ (multi-DC    │
│                  │              │  Strategy)   │  replication)│
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Query Language   │ PartiQL /    │ CQL          │ HTTP API /   │
│                  │ API          │              │ Erlang API   │
└──────────────────┴──────────────┴──────────────┴──────────────┘
```

### 12.2 Design Decision Summary

| Decision | DynamoDB | Cassandra | Riak | Our Design |
|----------|----------|-----------|------|------------|
| Leader election | None (leaderless) | None (leaderless) | None (leaderless) | None (leaderless) |
| Write path | In-memory + journal | MemTable + CommitLog | Write-back cache | MemTable + WAL |
| Read repair | Yes | Yes | Yes | Yes |
| Hinted handoff | Yes | Yes | Yes | Yes |
| Merkle trees | Yes | Yes | Yes (AAE) | Yes |
| Bloom filters | Yes | Yes | Yes | Yes |

---

## 13. Common Interview Follow-ups

### 13.1 How to Handle Range Queries?

Standard consistent hashing distributes keys randomly, destroying sort order. To support
range queries:

**Option A: Ordered partitioning**

- Use the key itself (not its hash) to determine partition boundaries.
- Each node owns a contiguous key range: `[a-f] → Node1, [g-m] → Node2, ...`
- Advantage: Natural range scans.
- Disadvantage: Risk of hot spots if keys are not uniformly distributed.
- Used by: HBase, early DynamoDB.

**Option B: Composite keys**

- Partition by a hash of the "partition key" but sort within each partition by a "sort key."
- Example: `partition_key = user_id, sort_key = timestamp`
- Range queries within a partition are efficient; cross-partition ranges require scatter-gather.
- Used by: DynamoDB, Cassandra.

```
Table: user_events
  Partition key: user_id (hashed for distribution)
  Sort key: timestamp (sorted within partition)

  Range query: "All events for user_123 between t1 and t2"
  → Route to single partition → efficient local range scan
```

### 13.2 How to Implement TTL (Time-to-Live)?

```
Approach 1: Lazy expiration
  - Store TTL alongside value: {value, created_at, ttl}
  - On read: if (now - created_at > ttl), return NOT_FOUND and delete
  - Pro: No background work
  - Con: Expired keys consume space until read

Approach 2: Active expiration
  - Background thread scans for expired keys periodically
  - Uses a TTL index (sorted by expiry time) for efficiency
  - Pro: Reclaims space proactively
  - Con: Background CPU and I/O cost

Approach 3: Compaction-based (LSM stores)
  - During SSTable compaction, skip entries past their TTL
  - Natural cleanup with no extra mechanism
  - Used by: Cassandra (with tombstones and gc_grace_seconds)

Best practice: Combine lazy (for correctness) + compaction-based (for cleanup).
```

**Pseudocode:**

```python
def get_with_ttl(self, key):
    entry = self.store.get(key)
    if entry is None:
        return None

    if entry.ttl > 0 and time.now() - entry.created_at > entry.ttl:
        self.delete(key)  # lazy cleanup
        return None

    return entry.value
```

### 13.3 How to Handle Large Values?

Values exceeding the typical 10 KB limit (e.g., images, documents):

```
Strategy 1: Chunking
  ┌──────────────────────────────┐
  │  Large value (5 MB)          │
  │                              │
  │  Split into 512 chunks:      │
  │  key_chunk_0  (10 KB)        │
  │  key_chunk_1  (10 KB)        │
  │  ...                         │
  │  key_chunk_511 (10 KB)       │
  │                              │
  │  Metadata key:               │
  │  key_meta = {chunks: 512,    │
  │              size: 5MB}      │
  └──────────────────────────────┘

Strategy 2: External storage
  - Store the value in an object store (S3, GCS)
  - Store the reference (URL/path) in the KV store
  - Trade-off: Extra hop for reads, but KV store stays lean

Strategy 3: Dedicated large-object tier
  - Separate storage tier optimized for large blobs
  - KV store holds pointer to blob tier
  - Used by: DynamoDB (400 KB limit, S3 for larger)
```

### 13.4 How to Implement Transactions?

Distributed key-value stores typically sacrifice transactions for performance. Options:

**Lightweight transactions (compare-and-set):**

```python
def compare_and_set(key, expected_value, new_value):
    """Atomic conditional update. Requires consensus (Paxos/Raft)."""
    current = get(key)
    if current == expected_value:
        put(key, new_value)
        return True
    return False

# Example: atomic counter increment
while True:
    current = get("counter")
    if compare_and_set("counter", current, current + 1):
        break  # success
    # else retry (optimistic concurrency)
```

**Multi-key transactions (2PC or Percolator):**

```
Coordinator
     │
     │  Phase 1: PREPARE
     │  → Lock key_A on Node1
     │  → Lock key_B on Node2
     │  ← Both respond OK
     │
     │  Phase 2: COMMIT
     │  → Commit key_A on Node1
     │  → Commit key_B on Node2
     │  ← Both respond OK
     │
     │  If any PREPARE fails → ABORT all

Trade-off: 2PC blocks if coordinator fails.
           Use 3PC or Paxos-based commit for fault tolerance.
```

Used by: Google Spanner (TrueTime + 2PC), CockroachDB, FoundationDB.

### 13.5 How to Handle Clock Skew?

Wall clocks across machines are never perfectly synchronized. This causes problems for
last-writer-wins (LWW) conflict resolution.

**Solutions:**

| Approach | Description | Used By |
|----------|-------------|---------|
| **NTP** | Network Time Protocol; keeps clocks within ~1-10 ms | Most systems |
| **Vector clocks** | Logical clocks; no dependency on wall time | Riak, Dynamo |
| **Hybrid logical clocks (HLC)** | Physical + logical component; monotonic within each node | CockroachDB, Cassandra |
| **TrueTime** | GPS + atomic clocks; bounded uncertainty interval | Google Spanner |

**Hybrid Logical Clock (HLC):**

```
HLC = (physical_time, logical_counter)

Rules:
  1. On local event: HLC = (max(HLC.pt, now()), 0)
     If now() == HLC.pt: increment logical counter instead
  2. On send: attach HLC to message
  3. On receive(msg):
     HLC.pt = max(HLC.pt, msg.HLC.pt, now())
     if all three equal: HLC.lc = max(HLC.lc, msg.HLC.lc) + 1
     else: HLC.lc = 0

Benefits:
  - Always monotonically increasing
  - Closely tracks physical time
  - Captures causal ordering
```

---

## 14. Summary of Key Design Decisions

```
┌────────────────────────┬──────────────────────────────────────┐
│ Design Decision        │ Our Choice                           │
├────────────────────────┼──────────────────────────────────────┤
│ Data partitioning      │ Consistent hashing + virtual nodes   │
├────────────────────────┼──────────────────────────────────────┤
│ Data replication       │ N=3, placed on hash ring successor   │
│                        │ nodes across racks/DCs               │
├────────────────────────┼──────────────────────────────────────┤
│ Consistency model      │ Tunable: W + R > N for strong,       │
│                        │ W=1/R=1 for eventual                 │
├────────────���───────────┼──────────────────────────────────────┤
│ Conflict resolution    │ Vector clocks + app-level resolution │
├────────────────────────┼──────────────────────────────────────┤
│ Failure detection      │ Gossip protocol                      │
├────────────────────────┼──────────────────────────────────────┤
│ Temp failure handling  │ Sloppy quorum + hinted handoff       │
├────────────────────────┼──────────────────────────────────────┤
│ Perm failure handling  │ Anti-entropy with Merkle trees       │
├────────────────────────┼──────────────────────────────────────┤
│ Storage engine         │ LSM tree (MemTable + WAL + SSTables) │
├────────────────────────┼──────────────────────────────────────┤
│ Architecture           │ Leaderless (peer-to-peer)            │
├────────────────────────┼──────────────────────────────────────┤
│ Membership management  │ Gossip-based                         │
├────────────────────────┼──────────────────────────────────────┤
│ Multi-DC support       │ Async cross-DC replication            │
├────────────────────────┼──────────────────────────────────────┤
│ CAP trade-off          │ AP by default, CP opt-in per request │
└────────────────────────┴──────────────────────────────────────┘
```

---

## 15. Quick Reference: Interview Checklist

Use this checklist to ensure you cover all major points during an interview:

```
□ Clarify requirements (functional, non-functional, scale)
□ Discuss CAP theorem and justify AP vs CP choice
□ Data partitioning with consistent hashing + virtual nodes
□ Data replication (N replicas, placement on ring)
□ Consistency model (quorum: W + R > N)
□ Conflict resolution (vector clocks vs LWW)
□ Failure detection (gossip protocol)
□ Temporary failures (sloppy quorum + hinted handoff)
□ Permanent failures (Merkle trees for anti-entropy)
□ Storage engine (LSM tree: MemTable → WAL → SSTable)
□ Write path (WAL → MemTable → ACK → background flush)
□ Read path (MemTable → Bloom filter → SSTable)
□ System architecture (leaderless, any-node coordinator)
□ Multi-DC deployment (async cross-DC replication)
□ Tunable consistency examples (banking vs social media)
□ Handle follow-ups (range queries, TTL, large values, transactions, clock skew)
```

---

## 16. Further Reading

| Resource | Description |
|----------|-------------|
| **Dynamo Paper** (2007) | Amazon's foundational paper on distributed KV stores |
| **Cassandra Paper** (2010) | Facebook's wide-column store inspired by Dynamo + BigTable |
| **DDIA Chapter 5-6** | "Designing Data-Intensive Applications" by Martin Kleppmann |
| **Riak Documentation** | Excellent practical guide to distributed KV concepts |
| **RocksDB Wiki** | Deep dive into LSM tree implementation details |
| **Google Spanner Paper** (2012) | TrueTime and globally consistent transactions |
