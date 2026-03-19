# Data Model: Key-Value Store (DynamoDB/Cassandra)

A distributed key-value store provides high availability and horizontal scalability by partitioning data across a ring of nodes using consistent hashing. The data model covers the application-facing key-value pairs, the cluster topology that determines data placement, and the conflict resolution mechanisms (vector clocks, hinted handoff) that maintain consistency in the face of network partitions and node failures.

## Table Responsibilities

| Structure         | Purpose                             | Storage                  | Key Characteristic                      |
| ----------------- | ----------------------------------- | ------------------------ | --------------------------------------- |
| **kv_pairs**      | Application data (key-value pairs)  | Distributed across nodes | Replicated to N nodes, versioned        |
| **ring_topology** | Consistent hash ring mapping        | Each node's metadata     | Determines data placement               |
| **cluster_nodes** | Node health and datacenter info     | Gossip protocol state    | Decentralized, no single coordinator    |
| **hint_store**    | Temporary storage for failed writes | Local to each node       | Enables hinted handoff for availability |

## Detailed Field Descriptions

### kv_pairs

| Field          | Type              | Description                                                                                                                                                                                                      |
| -------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| key            | BYTES, PK         | The lookup key. Hashed (e.g., MD5, Murmur3) to determine position on the consistent hash ring. The raw key bytes are stored alongside the hash for exact matching.                                               |
| value          | BYTES             | The stored data. Opaque to the storage engine. Can be JSON, Protobuf, or any serialized format. Size limits vary (DynamoDB: 400KB, Cassandra: 2GB theoretical but <1MB recommended).                             |
| version_vector | MAP<node_id, INT> | Vector clock for conflict detection. Each node increments its own counter on write. Two versions are concurrent if neither dominates the other. Example: `{A:2, B:1}` vs `{A:1, B:2}` are concurrent (conflict). |
| ttl            | INT, NULLABLE     | Time-to-live in seconds. After expiry, the key is tombstoned (marked for deletion) and eventually garbage collected via compaction. Null means no expiration.                                                    |
| created_at     | TIMESTAMP         | When the key was first written. Used for debugging and auditing.                                                                                                                                                 |
| updated_at     | TIMESTAMP         | When the value was last modified. Used alongside version_vector for last-write-wins conflict resolution (when vector clocks are not used).                                                                       |

**Why vector clocks instead of timestamps?** Timestamps require synchronized clocks across nodes, which is impractical in distributed systems (clock skew). Vector clocks capture causal ordering without clock synchronization. If `{A:3, B:2}` vs `{A:3, B:1}`, the first clearly happened after the second. If `{A:3, B:1}` vs `{A:1, B:3}`, they are concurrent and the application must resolve the conflict.

**Why limit value size?** Large values cause hot partitions (one node handles disproportionate I/O), increase replication latency, and cause memory pressure during compaction. The system works best with small values (<100KB).

### ring_topology

| Field            | Type                       | Description                                                                                                                                |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| virtual_node_id  | INT, PK                    | Identifier for a virtual node (vnode) on the hash ring. Each physical node owns multiple vnodes (typically 128-256) for even distribution. |
| physical_node_id | STRING, FK → cluster_nodes | Which physical node owns this vnode. When a node joins, its vnodes are spread evenly around the ring.                                      |
| hash_range_start | BIGINT                     | Start of the hash range this vnode is responsible for (inclusive).                                                                         |
| hash_range_end   | BIGINT                     | End of the hash range (exclusive). A key with hash H belongs to this vnode if `hash_range_start <= H < hash_range_end`.                    |

**Why virtual nodes?** Without vnodes, adding a new physical node only takes over one range from one neighbor, causing uneven distribution. With vnodes (e.g., 256 per physical node), the new node takes small ranges from many neighbors, maintaining balance. It also helps when nodes have different hardware capacities — assign more vnodes to larger machines.

### cluster_nodes

| Field      | Type                               | Description                                                                                                                                                          |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node_id    | STRING, PK                         | Unique node identifier (typically UUID). Persists across restarts.                                                                                                   |
| host       | VARCHAR                            | IP address or hostname.                                                                                                                                              |
| port       | INT                                | Service port for client and inter-node communication.                                                                                                                |
| status     | ENUM('active','leaving','joining') | Current lifecycle state. `joining`: receiving data from existing nodes. `leaving`: transferring data to remaining nodes. Only `active` nodes serve reads and writes. |
| datacenter | VARCHAR                            | Datacenter identifier (e.g., `us-east-1`, `eu-west-1`). Used for rack-aware replication: replicas are placed in different datacenters for disaster recovery.         |
| rack       | VARCHAR                            | Rack within the datacenter. Rack-aware placement ensures replicas survive rack-level failures (power, switch).                                                       |

**Why datacenter and rack awareness?** Placing all 3 replicas on the same rack means a single top-of-rack switch failure loses all copies. Rack-aware placement guarantees replicas span racks. Datacenter-aware placement provides cross-region durability.

### hint_store

| Field           | Type              | Description                                                                                                                                                                      |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| target_node_id  | STRING            | The node that should have received this write but was unavailable. When the target comes back online, hints are replayed to it.                                                  |
| key             | BYTES             | The key that was written.                                                                                                                                                        |
| value           | BYTES             | The value that was written.                                                                                                                                                      |
| version         | MAP<node_id, INT> | Version vector at the time of the write. Ensures the replayed hint does not overwrite a newer version.                                                                           |
| timestamp       | TIMESTAMP         | When the hint was created. Hints older than a threshold (e.g., 3 hours) are discarded — the node is assumed permanently failed and full repair (anti-entropy) is needed instead. |
| hint_created_at | TIMESTAMP         | Same as timestamp. Used for hint expiration and garbage collection.                                                                                                              |

**Why hinted handoff?** When a replica node is temporarily down, the write could fail (reducing availability) or be lost (reducing durability). Hinted handoff lets another node temporarily store the write and replay it when the target recovers. This maintains availability without sacrificing durability for short outages.

**Why expire hints?** If a node is down for days, accumulated hints could be massive. Expiring old hints forces the system to use full anti-entropy repair (Merkle tree comparison) for long outages, which is more efficient than replaying millions of individual hints.

## ER Diagram

```
┌──────────────────────────┐
│      cluster_nodes        │
│──────────────────────────│
│ node_id (PK)              │
│ host                      │
│ port                      │
│ status                    │
│ datacenter                │
│ rack                      │
└──────────────────────────┘
         │ 1
         │
         │          *
┌────────┴─────────────────┐
│     ring_topology         │
│──────────────────────────│
│ virtual_node_id (PK)      │
│ physical_node_id (FK)     │
│ hash_range_start          │
│ hash_range_end            │
└──────────────────────────┘
         │
         │ determines placement of
         ▼
┌──────────────────────────┐
│       kv_pairs            │
│──────────────────────────│
│ key (PK)                  │
│ value (bytes)             │
│ version_vector            │
│ ttl                       │
│ created_at                │
│ updated_at                │
└──────────────────────────┘

┌──────────────────────────┐
│      hint_store           │
│──────────────────────────│
│ target_node_id            │
│ key                       │
│ value                     │
│ version                   │
│ timestamp                 │
│ hint_created_at           │
└──────────────────────────┘

Consistent Hash Ring (visual):

           Node A
            ╱  ╲
      ┌────╱────╲────┐
      │   ╱      ╲   │
 Node D──╱── Ring ──╲──Node B
      │   ╲      ╱   │
      └────╲────╱────┘
            ╲  ╱
           Node C

  Key "user:123" → hash → position on ring
  → Stored on next N nodes clockwise (N = replication factor)

Relationships:
  cluster_nodes 1───* ring_topology  (one physical node owns many vnodes)
  ring_topology determines kv_pairs placement (hash → vnode → node)
  hint_store references target cluster_node (for replay on recovery)
```

## Data Flow

### Write Path (Quorum Write, W = 2 of N = 3)

```
1. Client writes: PUT key="user:123", value={name: "Alice"}
         │
         ▼
2. Client (or coordinator node) hashes key:
   hash("user:123") → position on ring
         │
         ▼
3. Find N=3 replica nodes by walking ring clockwise:
   Node A (primary), Node B (replica 1), Node C (replica 2)
         │
         ▼
4. Send write request to ALL 3 nodes simultaneously
         │
         ├─ Node A: write to local storage, increment version_vector[A]
         ├─ Node B: write to local storage, increment version_vector[B]
         └─ Node C: unavailable (network partition)
              │
              ▼
         Node D stores hint for Node C (hinted handoff)
         │
         ▼
5. Wait for W=2 ACKs (got 2: A and B)
         │
         ▼
6. Return success to client
   (write succeeded despite Node C being down — AP system)
         │
         ▼
7. Later: Node C recovers
   ├─ Node D replays hint → Node C gets the write
   └─ Anti-entropy (Merkle tree) catches anything hints missed
```

### Read Path (Quorum Read, R = 2 of N = 3)

```
1. Client reads: GET key="user:123"
         │
         ▼
2. Hash key → find 3 replica nodes (A, B, C)
         │
         ▼
3. Send read request to ALL 3 nodes
         │
         ▼
4. Wait for R=2 responses:
   ├─ Node A returns: value={name:"Alice"}, version={A:3, B:2}
   └─ Node B returns: value={name:"Bob"},   version={A:2, B:3}
         │
         ▼
5. Compare version vectors:
   {A:3, B:2} vs {A:2, B:3}
   Neither dominates → CONFLICT (concurrent writes)
         │
    ┌────┴──────────────────────────┐
    │ Resolution strategy:          │
    ├─ Last-Write-Wins (LWW):      │
    │   Use updated_at timestamp    │
    │   Simple but loses data       │
    ├─ Application-level merge:     │
    │   Return both versions to     │
    │   client, let app merge       │
    │   (e.g., CRDT, union sets)    │
    └───────────────────────────────┘
         │
         ▼
6. Read repair: send latest version to stale replicas
   (piggyback consistency fix on the read)
```

### Rebalancing (Node Join)

```
1. New Node E joins the cluster
         │
         ▼
2. Gossip protocol propagates membership change
   (all nodes learn about E within seconds)
         │
         ▼
3. Node E is assigned virtual nodes on the ring
   ├─ Takes over hash ranges from existing nodes
   └─ Ranges are small (vnodes), so impact is spread across many nodes
         │
         ▼
4. Data migration:
   ├─ For each vnode assigned to E:
   │   Previous owner streams relevant key-value pairs to E
   └─ Reads/writes continue during migration
       (coordinator routes to old or new owner based on progress)
         │
         ▼
5. Migration complete → E status changes to 'active'
   ├─ E starts serving reads and writes for its ranges
   └─ Previous owners delete migrated data
```

**Why W + R > N for consistency?** If N=3, W=2, R=2, then W+R=4 > 3. This guarantees at least one node in the read set has the latest write (pigeonhole principle). This provides strong consistency with quorum overlap. If W=1, R=1, you get eventual consistency (faster but stale reads possible).

**Why not use a central coordinator?** A coordinator is a single point of failure. Dynamo-style systems are fully decentralized: any node can serve any request by hashing the key and routing to the correct replicas. The gossip protocol keeps all nodes informed of cluster topology without a central authority.

**Why read repair?** Even with quorum reads, some replicas may be stale (e.g., they missed a write due to a temporary partition). Read repair opportunistically fixes stale replicas during normal read operations, reducing the need for expensive full anti-entropy scans.
