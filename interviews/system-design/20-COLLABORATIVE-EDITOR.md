# Design a Collaborative Editor (Google Docs)

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Operational Transform (OT)](#5-operational-transform-ot)
6. [CRDT: Conflict-free Replicated Data Types](#6-crdt-conflict-free-replicated-data-types)
7. [OT vs CRDT Decision Matrix](#7-ot-vs-crdt-decision-matrix)
8. [Real-time Sync Protocol](#8-real-time-sync-protocol)
9. [Conflict Resolution with Concrete Examples](#9-conflict-resolution-with-concrete-examples)
10. [Cursor and Selection Presence](#10-cursor-and-selection-presence)
11. [Document Versioning and Revision History](#11-document-versioning-and-revision-history)
12. [Undo/Redo in Collaborative Context](#12-undoredo-in-collaborative-context)
13. [Permission Model](#13-permission-model)
14. [Offline Editing and Sync on Reconnect](#14-offline-editing-and-sync-on-reconnect)
15. [Rich Text: Formatting Operations](#15-rich-text-formatting-operations)
16. [Scaling Strategy](#16-scaling-strategy)
17. [Common Interview Follow-ups](#17-common-interview-follow-ups)

---

## 1. Requirements Clarification

### Functional Requirements

| Feature                 | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Real-time co-editing    | Multiple users edit the same document simultaneously with changes visible in < 500ms |
| Rich text formatting    | Bold, italic, underline, headings, lists, tables, inline images                      |
| Cursor presence         | See other users' cursors and text selections in real time                            |
| Comment and suggestion  | Inline comments, threaded replies, and suggested edits with accept/reject            |
| Revision history        | Full version history; restore any past version; see diff between versions            |
| Undo / Redo             | Per-user undo stack that does not undo collaborators' changes                        |
| Sharing and permissions | Owner, editor, commenter, viewer roles per document and per link                     |
| Offline editing         | Continue editing while offline; sync when connection resumes                         |
| Export                  | Export to DOCX, PDF, plain text, HTML                                                |
| Search                  | Full-text search across all documents the user has access to                         |

### Non-Functional Requirements

| Property            | Target                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Local latency       | < 100ms: user's own keystroke appears instantly (optimistic local apply) |
| Remote sync latency | < 500ms for collaborators to see changes under normal network conditions |
| Consistency         | Eventual convergence: all clients must reach identical state             |
| Availability        | 99.99% uptime (< 53 min/year downtime)                                   |
| Offline support     | Unbounded offline editing; merge on reconnect without data loss          |
| Durability          | Zero data loss; every operation persisted before acknowledged            |
| Scalability         | 100M documents, 10M DAU, 30M concurrent WebSocket connections            |

### Scale Estimation

```
Users and Documents:
  Total documents:           100M
  Daily active users (DAU):  10M
  Peak concurrent sessions:  3M
  Avg editors per document:  3 concurrent

Operation Volume:
  Active users:              3M (peak)
  Ops per user per minute:   50 keystrokes/min ≈ 1 op/sec
  Peak operations/sec:       3M ops/sec (total system)
  Ops per WebSocket server:  ~10K connections per server
  WebSocket servers needed:  3M / 10K = 300 servers

Storage:
  Avg document size:         100 KB (text + formatting)
  Avg operation size:        200 bytes
  Operations per doc/day:    ~5,000
  Daily new ops storage:     100M docs x 5K ops x 200B = 100 TB/day (too much)
  Active docs (1%):          1M active docs generate ops daily
  Daily op storage:          1M x 5K x 200B = 1 TB/day

Snapshots:
  Snapshot every 500 ops:    Reduces replay cost
  Snapshot size:             100 KB
  New snapshots/day:         1M active docs x 10 snapshots = 10 snapshots
  Snapshot storage/day:      10M x 100 KB = 1 TB/day

Bandwidth:
  3M concurrent users sending 1 op/sec at 200B = 600 MB/s inbound
  Each op fanned out to avg 3 collaborators = 1.8 GB/s outbound
```

---

## 2. API Design

### REST Endpoints

```
# Document lifecycle
POST   /v1/documents                          Create new document
GET    /v1/documents/{docId}                  Get document metadata
PATCH  /v1/documents/{docId}                  Update metadata (title, etc.)
DELETE /v1/documents/{docId}                  Soft-delete document

# Document content (for initial load)
GET    /v1/documents/{docId}/content          Get latest snapshot + pending ops
GET    /v1/documents/{docId}/content?rev={n}  Get snapshot at revision n

# Revision history
GET    /v1/documents/{docId}/revisions            List named versions
POST   /v1/documents/{docId}/revisions            Create named version (bookmark)
GET    /v1/documents/{docId}/revisions/{revId}    Get specific revision content
POST   /v1/documents/{docId}/revisions/{revId}/restore  Restore to revision

# Permissions / sharing
GET    /v1/documents/{docId}/permissions          List access control entries
POST   /v1/documents/{docId}/permissions          Grant access to user or link
PATCH  /v1/documents/{docId}/permissions/{permId} Change role
DELETE /v1/documents/{docId}/permissions/{permId} Revoke access

# Comments
GET    /v1/documents/{docId}/comments              List all comments
POST   /v1/documents/{docId}/comments              Create a comment
POST   /v1/documents/{docId}/comments/{id}/replies Reply to comment
PATCH  /v1/documents/{docId}/comments/{id}         Resolve / reopen comment
DELETE /v1/documents/{docId}/comments/{id}         Delete comment

# Export
POST   /v1/documents/{docId}/export          Body: { format: "docx"|"pdf"|"txt" }
GET    /v1/exports/{exportId}                Poll status; get download URL when ready
```

### WebSocket Protocol

The WebSocket connection is the main channel for collaborative editing. All real-time events flow through it.

```
# Connection
WS  wss://collab.example.com/v1/documents/{docId}/session
    Query params: ?token={jwt}&clientId={uuid}&rev={lastKnownRev}

# Client -> Server messages (JSON)
{
  "type": "op",
  "clientId": "abc-123",
  "rev": 42,               # revision client is based on
  "ops": [                 # array of operations
    {
      "type": "insert",
      "pos": 15,
      "chars": "Hello",
      "attrs": { "bold": true }
    }
  ]
}

{
  "type": "cursor",
  "clientId": "abc-123",
  "selection": { "anchor": 20, "head": 25 }
}

{
  "type": "ack",
  "seq": 7               # acknowledge received server broadcast
}

{
  "type": "ping"
}

# Server -> Client messages
{
  "type": "op",
  "authorId": "user-789",
  "authorName": "Alice",
  "rev": 43,             # new server revision after applying this op
  "ops": [ ... ]         # transformed ops
}

{
  "type": "cursor",
  "clientId": "user-789",
  "selection": { "anchor": 10, "head": 10 },
  "color": "#FF5733"
}

{
  "type": "ack",
  "rev": 43              # server acknowledges client op, tells client new rev
}

{
  "type": "snapshot",    # sent on reconnect if client is too far behind
  "rev": 500,
  "content": { ... }
}

{
  "type": "presence",    # who else is in the doc
  "users": [
    { "userId": "user-789", "name": "Alice", "color": "#FF5733" }
  ]
}

{
  "type": "pong"
}
```

---

## 3. Data Model

### Document Table

```sql
documents (
  doc_id        UUID         PRIMARY KEY,
  owner_id      UUID         NOT NULL REFERENCES users(user_id),
  title         VARCHAR(500) NOT NULL DEFAULT 'Untitled Document',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,                   -- soft delete
  latest_rev    INT          NOT NULL DEFAULT 0,
  snapshot_rev  INT          NOT NULL DEFAULT 0,-- rev of most recent snapshot
  word_count    INT,
  is_template   BOOLEAN      NOT NULL DEFAULT false
)
```

### Operations Log (append-only)

```sql
document_ops (
  doc_id        UUID         NOT NULL REFERENCES documents(doc_id),
  rev           INT          NOT NULL,          -- server-assigned revision number
  client_id     VARCHAR(64)  NOT NULL,          -- who sent it
  user_id       UUID         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ops_json      JSONB        NOT NULL,           -- array of operations
  client_rev    INT          NOT NULL,           -- client's rev when op was submitted
  PRIMARY KEY (doc_id, rev)
)
-- Partition by doc_id hash for horizontal scale
-- Index on (doc_id, rev) for sequential replay
```

### Snapshots

```sql
document_snapshots (
  doc_id        UUID         NOT NULL,
  rev           INT          NOT NULL,
  content_json  JSONB        NOT NULL,   -- full document state at this rev
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  byte_size     INT          NOT NULL,
  PRIMARY KEY (doc_id, rev)
)
-- Store in object storage (S3) for large docs; table holds metadata + small docs
```

### Permissions

```sql
permissions (
  perm_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID         NOT NULL REFERENCES documents(doc_id),
  principal_type VARCHAR(16) NOT NULL,  -- 'user' | 'group' | 'link' | 'domain'
  principal_id  VARCHAR(256),           -- user_id, group_id, or link token
  role          VARCHAR(16)  NOT NULL,  -- 'owner' | 'editor' | 'commenter' | 'viewer'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID         NOT NULL,
  expires_at    TIMESTAMPTZ,
  UNIQUE (doc_id, principal_type, principal_id)
)
```

### Named Revisions (Version History)

```sql
named_revisions (
  revision_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID         NOT NULL,
  rev           INT          NOT NULL,     -- which server rev this points to
  name          VARCHAR(255),             -- user-provided name (optional)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID         NOT NULL,
  is_auto       BOOLEAN      NOT NULL DEFAULT true, -- auto vs manual
  UNIQUE (doc_id, rev)
)
```

### Operation Schema (JSONB detail)

```json
{
  "ops": [
    {
      "type": "retain",
      "count": 10
    },
    {
      "type": "insert",
      "chars": "Hello, ",
      "attrs": {
        "bold": true,
        "fontSize": 14
      }
    },
    {
      "type": "delete",
      "count": 3
    },
    {
      "type": "format",
      "count": 5,
      "attrs": {
        "italic": true
      }
    }
  ]
}
```

This is Delta format (used by Quill.js / ProseMirror), which encodes an operation as a sequence of retain/insert/delete with optional attribute objects. It is composable and invertible.

---

## 4. High-Level Architecture

### System Components

```
+------------------+       +------------------+       +------------------+
|   Browser /      |       |   Browser /      |       |   Browser /      |
|   Client A       |       |   Client B       |       |   Client C       |
|                  |       |                  |       |                  |
|  Local Doc State |       |  Local Doc State |       |  Local Doc State |
|  OT/CRDT Engine  |       |  OT/CRDT Engine  |       |  OT/CRDT Engine  |
|  Pending Op Queue|       |  Pending Op Queue|       |  Pending Op Queue|
+--------+---------+       +--------+---------+       +--------+---------+
         |  WebSocket                |  WebSocket                | WebSocket
         |                          |                           |
+--------v--------------------------v---------------------------v---------+
|                           Load Balancer (L7)                           |
|                     Sticky sessions by doc_id                          |
+--------+----------------------------------+---------------------------+-+
         |                                  |                           |
+--------v---------+              +---------v--------+       +----------v-------+
|  Collab Server 1 |              |  Collab Server 2 |       |  Collab Server N |
|                  |              |                  |       |                  |
| - WS Manager     |              | - WS Manager     |       | - WS Manager     |
| - OT Transform   |              | - OT Transform   |       | - OT Transform   |
| - Op Sequencer   |              | - Op Sequencer   |       | - Op Sequencer   |
| - Presence Mgr   |              | - Presence Mgr   |       | - Presence Mgr   |
+--------+---------+              +---------+--------+       +----------+-------+
         |                                  |                           |
         +----------------------------------+---------------------------+
                                            |
              +-----------------------------+-----------------------------+
              |                             |                             |
   +----------v----------+    +-------------v-----------+   +------------v--------+
   |    Message Broker   |    |    Op Storage (DB)      |   |   Snapshot Store    |
   |    (Kafka/Redis Pub) |    |    (PostgreSQL /        |   |   (S3 / GCS)        |
   |                     |    |     Spanner)             |   |                     |
   | Topics:             |    |                         |   | - doc_snapshots/    |
   | - doc.{docId}.ops   |    | - document_ops          |   |   {docId}/{rev}.json|
   | - doc.{docId}.cursor|    | - document_snapshots    |   |                     |
   +---------------------+    | - named_revisions       |   +---------------------+
                              +-------------+-----------+
                                            |
                              +-------------v-----------+
                              |    Search / Analytics   |
                              |    (Elasticsearch)      |
                              |                         |
                              | - Full-text doc search  |
                              | - Activity analytics    |
                              +-------------------------+
```

### Request Flow for an Edit Operation

```
Client A types "H"
       |
       | 1. Apply locally (optimistic, immediate)
       v
  Local doc = "Hello H"   (instant, 0ms)
       |
       | 2. Send op over WebSocket
       v
  { type:"op", rev:42, ops:[{type:"insert",pos:6,chars:"H"}] }
       |
       v
+------+-------+
| Collab Server|
|              |
| 3. Lock doc  |  (distributed lock or single-writer per doc)
|    revision  |
|              |
| 4. Transform |  against any ops submitted since rev=42
|    incoming  |
|    op        |
|              |
| 5. Assign    |  rev = 43
|    new rev   |
|              |
| 6. Persist   |  write to document_ops (rev=43)
|    to DB     |  (synchronous, before ack)
|              |
| 7. Ack to    |  { type:"ack", rev:43 }
|    Client A  |
|              |
| 8. Fan out   |  broadcast transformed op to Clients B, C
|    to peers  |
+--------------+

Client B and C receive:
  { type:"op", authorId:"A", rev:43, ops:[...transformed...] }
  -> Apply to local state
  -> Update local rev to 43
```

### Document Loading Flow

```
Client opens document
       |
       v
GET /v1/documents/{docId}/content
       |
       v
  API Server checks permissions
       |
       v
  Load latest snapshot (rev=500)
  + all ops from rev=500 to rev=current (e.g., rev=543)
       |
       v
  Return { snapshot, ops[], latestRev: 543 }
       |
       v
  Client replays 43 ops on top of snapshot
       |
       v
  Client opens WebSocket: ?rev=543
       |
       v
  Client is now live and synchronized
```

---

## 5. Operational Transform (OT)

### Core Concept

OT allows concurrent operations to be transformed against each other so that all clients converge to the same document state. Every operation is defined relative to a specific document state (revision). When two operations are submitted concurrently, one must be transformed to account for the other.

### Operation Types

```
Insert(pos, chars)   — insert chars at position pos
Delete(pos, count)   — delete count chars starting at pos
Retain(count)        — keep count chars unchanged (used in Delta format)
Format(pos, count, attrs) — apply formatting to range
```

### The Transform Function

The heart of OT is `transform(op1, op2) -> (op1', op2')` such that:

```
apply(apply(doc, op1), op2') == apply(apply(doc, op2), op1')
```

This is the convergence property. If it holds, all clients will reach the same state regardless of the order they apply operations.

#### Example: Two Concurrent Inserts

```
Initial document:  "AC"
                    01   (positions)

Client A: Insert("B", pos=1)   -- wants to insert B between A and C
Client B: Insert("X", pos=1)   -- wants to insert X between A and C

Without transform, both clients sending their raw ops would produce:
  Client A applies A then B: "AC" -> "ABC" -> "AXBC"   (applies B's op at pos=1 on "ABC")
  Client B applies B then A: "AC" -> "AXC" -> "ABXC"   (applies A's op at pos=1 on "AXC")

These diverge! "AXBC" != "ABXC"
```

The transform function must produce consistent results:

```
transform(Insert("B", pos=1), Insert("X", pos=1)):
  -> If we decide "A wins over B" (e.g., by userId tie-break or client order):
     op1' = Insert("B", pos=2)   -- B must shift right because X was inserted at 1
     op2' = Insert("X", pos=1)   -- X stays at pos=1

Result:
  Both clients: "AC"
    -> apply Insert("X", pos=1) -> "AXC"
    -> apply Insert("B", pos=2) -> "AXBC"

  OR:
    -> apply Insert("B", pos=1) -> "ABC"
    -> apply Insert("B" transformed pos=2) is wrong above...
```

Let's be more precise:

```python
def transform_insert_insert(op1, op2):
    """
    op1 = Insert(pos=p1, chars=c1)
    op2 = Insert(pos=p2, chars=c2)
    Returns (op1', op2') such that they can be applied in either order.
    """
    p1, c1 = op1.pos, op1.chars
    p2, c2 = op2.pos, op2.chars

    if p1 < p2:
        # op1 inserts before op2's position; op2 must shift right by len(c1)
        op1_prime = Insert(p1, c1)               # unchanged
        op2_prime = Insert(p2 + len(c1), c2)     # shifted right
    elif p1 > p2:
        # op2 inserts before op1's position; op1 must shift right by len(c2)
        op1_prime = Insert(p1 + len(c2), c1)     # shifted right
        op2_prime = Insert(p2, c2)               # unchanged
    else:
        # Same position: use tie-breaking rule (e.g., lexicographic userId)
        # Convention: op1 wins if userId_A < userId_B
        if user_a < user_b:
            op1_prime = Insert(p1, c1)           # unchanged
            op2_prime = Insert(p2 + len(c1), c2) # B shifts right
        else:
            op1_prime = Insert(p1 + len(c2), c1) # A shifts right
            op2_prime = Insert(p2, c2)           # unchanged

    return op1_prime, op2_prime
```

#### Example: Insert vs Delete

```
Initial document:  "Hello World"
                    01234567890

Client A: Insert("!", pos=11)   -- appends "!"
Client B: Delete(pos=6, count=5) -- deletes "World"

After Client A's op, Client B's delete should still delete "World":
  transform(Delete(6,5), Insert(11,"!")):
    Insert is at pos=11 which is >= 6+5=11 (boundary)
    -> Delete position unchanged: Delete(6, 5)

After Client B's op, Client A's insert needs adjustment:
  transform(Insert(11,"!"), Delete(6,5)):
    Insert pos=11 is after Delete start=6
    11 >= 6: shift left by min(count, pos-start) = min(5, 11-6) = 5
    -> Insert(11-5, "!") = Insert(6, "!")

Result on both clients:
  "Hello World" -> delete "World" -> "Hello " -> insert "!" at 6 -> "Hello !"
  "Hello World" -> insert "!" at 11 -> "Hello World!" -> delete "World" -> "Hello !"
```

### Server-Canonical Ordering (Jupiter Protocol)

Google Docs uses a client-server OT architecture based on the Jupiter protocol:

```
+----------+                                    +----------+
|  Client  |                                    |  Server  |
|          |                                    |          |
| State:   |                                    | State:   |
|  doc_c   |                                    |  doc_s   |
|  rev=n   |                                    |  rev=n   |
|          |                                    |          |
|   user   |                                    |          |
|  types   |                                    |          |
|          |                                    |          |
| op_c     |-------- Send(op_c, clientRev=n) -->|          |
| (insert  |                                    | Receive  |
|  "A"     |                                    | op_c     |
|  at 5)   |                                    |          |
|          |                                    | Meanwhile|
|          |<------- Broadcast(op_s, rev=n+1) --| server   |
|          |         (another user's op)        | got op_s |
|          |                                    | from B   |
|          |                                    |          |
| Client   |                                    | Server   |
| receives |                                    | receives |
| op_s     |                                    | op_c     |
|          |                                    |          |
| Must     |                                    | Must     |
| transform|                                    | transform|
| op_s     |                                    | op_c     |
| against  |                                    | against  |
| pending  |                                    | op_s     |
| op_c     |                                    | (op_c was|
|          |                                    | based on |
|          |                                    | old rev) |
```

The server is the single source of truth for operation ordering. Every op gets a global sequence number. Clients must transform incoming server ops against their own pending (unacknowledged) operations.

```
Client-side algorithm:

pending_ops = []          # ops sent but not yet acked
server_rev  = 42          # last rev received from server

function sendOp(op):
    op.clientRev = server_rev
    pending_ops.append(op)
    ws.send(op)

function onServerOp(serverOp, newRev):
    # Transform serverOp against all pending ops
    transformed = serverOp
    for i, pending in enumerate(pending_ops):
        pending_ops[i], transformed = transform(pending, transformed)
    # Apply transformed serverOp to local doc
    applyToDoc(transformed)
    server_rev = newRev

function onAck(newRev):
    pending_ops.pop(0)   # oldest pending op was acknowledged
    server_rev = newRev
```

---

## 6. CRDT: Conflict-free Replicated Data Types

### Core Concept

CRDTs are data structures that can be replicated across multiple nodes and merged without conflicts. No central server is needed for convergence. Every merge is commutative, associative, and idempotent.

```
Property         | Meaning
-----------------|------------------------------------------------------------
Commutative      | merge(A, B) == merge(B, A)  — order doesn't matter
Associative      | merge(merge(A,B), C) == merge(A, merge(B,C))
Idempotent       | merge(A, A) == A  — applying same op twice is safe
```

### CRDT Types for Text Editing

#### RGA (Replicated Growable Array)

Each character is assigned a unique, immutable identifier. Instead of positions (which shift), characters reference their left neighbor by ID.

```
Insert "H" after START  -> { id: (t=1, uid=A), char: "H", after: START }
Insert "i" after (1,A)  -> { id: (t=2, uid=A), char: "i", after: (1,A) }
Insert "!" after (2,A)  -> { id: (t=3, uid=A), char: "!", after: (2,A) }

Document: H(1,A) -> i(2,A) -> !(3,A)  =>  "Hi!"

Concurrent insert "." at same position as "!":
User B: Insert "." after (2,A) -> { id: (t=3, uid=B), char: ".", after: (2,A) }

Both (3,A) and (3,B) have after=(2,A), same position.
Tie-break by uid: A > B lexicographically, so A's "!" comes first.
Result: H -> i -> ! -> .  =>  "Hi!."   (same on all clients)
```

#### Yjs (YATA Algorithm)

Yjs is the most widely-used CRDT library. It uses YATA (Yet Another Transformation Approach), an RGA variant optimized for text. Key features:

```
- O(1) amortized insertion (uses doubly-linked list + skip list)
- Structural sharing for efficient snapshots
- Awareness protocol built in (cursor positions as CRDT)
- Works with ProseMirror, CodeMirror, Monaco, Quill
```

#### Logoot / LSEQ

Instead of relative positions (RGA), Logoot assigns a globally unique fractional position to each character. Positions are fractions between 0 and 1:

```
"AC"   ->   A(0.25)  C(0.75)

Insert B between A and C:
  User A: B gets position 0.5   -> A(0.25) B(0.5) C(0.75)
  User B concurrent insert of X:
    X also gets a position between 0.25 and 0.75, e.g., X(0.375)

Both clients can sort by position to get consistent order:
  A(0.25) X(0.375) B(0.5) C(0.75)  ->  "AXBC"
```

Problem: positions grow unboundedly with many insertions. LSEQ uses a variable-depth tree to manage this.

### CRDT Advantages and Disadvantages

```
Advantages:
  + No central server required for convergence
  + Natural offline support: merge on reconnect
  + Peer-to-peer architectures possible
  + No transform function needed (no OT cp2 requirement)

Disadvantages:
  - Larger metadata overhead per character (unique IDs)
  - Tombstones for deletes consume memory
  - Garbage collection is complex
  - Some CRDT types produce non-intuitive merge results
    (e.g., interleaving concurrent inserts)
  - Undo/redo is harder to implement correctly
```

---

## 7. OT vs CRDT Decision Matrix

| Dimension                | Operational Transform (OT)        | CRDT (e.g., Yjs)                     |
| ------------------------ | --------------------------------- | ------------------------------------ |
| Server requirement       | Central server REQUIRED           | Can work P2P or server-assisted      |
| Complexity of core logic | High (transform function is hard) | Medium (data structure complexity)   |
| Merge correctness        | Correct if cp2 property holds     | Provably correct by construction     |
| Metadata overhead        | Low (ops are compact)             | Higher (each char has unique ID)     |
| Undo/redo                | Straightforward (invert op)       | Complex (requires extra bookkeeping) |
| Offline support          | Harder (need server to transform) | Natural (merge on reconnect)         |
| Adoption                 | Google Docs, Quip, CKEditor       | Notion, Linear, Figma, VS Code       |
| Performance (large docs) | Good (ops are small deltas)       | Can degrade without GC               |
| Rich text support        | Well-studied (Delta format)       | Excellent (Yjs Y.XmlFragment)        |
| Network partitions       | Must buffer and retry             | Naturally handles disconnections     |

### When to Choose OT

```
Choose OT when:
  - You have a central server and always-online requirement
  - You need very low metadata overhead
  - Your team has deep OT expertise (or uses an OT library)
  - You want simpler undo/redo semantics
  - Building something like Google Docs (client-server model)
```

### When to Choose CRDT

```
Choose CRDT when:
  - Offline-first is a primary requirement
  - You want P2P collaboration (no server roundtrip)
  - You're building local-first software (CRDTs + sync on demand)
  - You want provable convergence without implementing transform
  - Building something like Figma, Linear, or a multiplayer game
```

### Google Docs' Actual Approach

Google Docs uses OT with a central server based on the Jupiter protocol. Key aspects:

```
1. Central server assigns global revision numbers
2. Server transforms and sequences all operations
3. Clients have one pending op at a time (simplified OT)
4. Client can "pipeline" (send next op before ack) with care
5. Server uses document-level locks (one shard = one doc)
6. In practice: 1 server process owns all sessions for a doc
```

---

## 8. Real-time Sync Protocol

### WebSocket Connection Management

```
+----------+                +-------------+             +----------+
|  Client  |                | Load Balancer|             |  Collab  |
|          |                | (sticky)     |             |  Server  |
+----+-----+                +------+-------+             +----+-----+
     |                             |                          |
     | HTTP Upgrade to WebSocket   |                          |
     +----------------------------->                          |
     |                             | Route to server          |
     |                             | with docId affinity      |
     |                             +------------------------->|
     |                             |                          |
     |<=========== WS Connected ========================== ---|
     |                             |                          |
     | Send: { type:"join",        |                          |
     |   docId, rev:543, token }   |                          |
     +=============================================>          |
     |                             |                          |
     |                             |         Validate token   |
     |                             |         Check permission |
     |                             |         Load doc state   |
     |                             |                          |
     |<====== { type:"welcome",    |                          |
     |   users:[...], rev:543 } ===|                          |
     |                             |                          |
     |  [EDITING BEGINS]           |                          |
     |                             |                          |
     | Heartbeat ping every 30s    |                          |
     +=============================================>          |
     |<============================================ pong      |

Reconnect handling:
  - Client stores lastKnownRev
  - On reconnect: connect with ?rev=lastKnownRev
  - Server sends ops from lastKnownRev+1 to current
  - If gap too large (> threshold): server sends snapshot
```

### Connection Affinity and Fan-out

A single document's WebSocket connections must all route to the same server (or servers that share state via pub/sub):

```
Option A: Single-server per document (simple)
+-----------------------------------+
|         Load Balancer             |
|    Hash(docId) -> Server index    |
+-----+------------+----------------+
      |            |
+-----v--+    +----v---+
| Server |    | Server |
|  S1    |    |  S2    |
| Docs:  |    | Docs:  |
| A,B,C  |    | D,E,F  |
+--------+    +--------+

Problem: If S1 has a hot doc (thousands of editors), S1 is overloaded.

Option B: Pub/Sub fan-out (scalable)
+----------+    +----------+    +----------+
| Server 1 |    | Server 2 |    | Server 3 |
| (ws A,B) |    | (ws C,D) |    | (ws E,F) |
+----+-----+    +----+-----+    +----+-----+
     |               |               |
     |    Subscribe to doc.{docId}   |
     +---------------+---------------+
                     |
              +------v------+
              | Redis PubSub|
              |  or Kafka   |
              |             |
              | When S1     |
              | applies op  |
              | -> publish  |
              |   to topic  |
              | S2, S3 fan  |
              |   out to    |
              |   their WS  |
              +-------------+
```

### Reconnection and Gap Fill

```
Client disconnects at rev=200, reconnects at rev=215.

Case 1: Gap is small (< 100 ops)
  Server queries: SELECT * FROM document_ops WHERE doc_id=X AND rev > 200
  Sends ops 201..215 over WebSocket
  Client replays ops on its state

Case 2: Gap is large (> 100 ops) or client was offline for days
  Server sends latest snapshot (e.g., rev=500)
  Client discards local state, rebuilds from snapshot
  Any local pending ops must be re-transformed or discarded
  (in practice: warn user "document was reset due to long offline period")

Case 3: Client has pending ops from before disconnect
  Client retains pending ops in localStorage
  On reconnect, client re-sends pending ops with original clientRev
  Server transforms them against everything that happened since clientRev
  Server acks with new server revs
```

---

## 9. Conflict Resolution with Concrete Examples

### Scenario 1: Concurrent Insert at Same Position

```
Initial document: "cat"
                   012

User A (at pos 1): Insert("r")    -> wants "cart"
User B (at pos 1): Insert("o")    -> wants "coat"

Both users submit simultaneously. Server receives A's op first.

Server processes A's op (clientRev=0):
  No pending ops to transform against.
  Apply: "cat" -> "cart"  (rev=1)
  Ack A with rev=1
  Broadcast to B: Insert("r", pos=1) at rev=1

Server receives B's op (clientRev=0):
  B's op is based on rev=0, but server is now at rev=1.
  Must transform B's op against A's op.
  transform(Insert("o",1), Insert("r",1)):
    Same position. Tie-break: A's userId < B's userId -> A wins.
    B's op shifts right: Insert("o", pos=2)
  Apply transformed op: "cart" -> "coart" ... wait, that's wrong.

Let me redo:
  "cart" + Insert("o", pos=2) = "caort"   (inserting o at index 2)

Hmm, let's trace carefully:
  "c a r t"
   0 1 2 3
  Insert "o" at pos=2: "c a o r t" -> "caort"

User B's local state (before receiving server events):
  "cat" -> Insert("o", pos=1) -> "coat"
  Then receives server broadcast: Insert("r", pos=1)
  Transforms: Insert("r",1) against pending Insert("o",1)
  Since A won tie-break, B's pending op shifted right to pos=2.
  So server broadcast Insert("r",pos=1) is applied first:
    "coat" ... wait, B already applied locally.

Correct client-side view:
  B locally applied Insert("o",1): state = "coat"
  B's pending: [Insert("o",1) with clientRev=0]

  Server ack arrives for A's op: Insert("r",1), rev=1
  Client B transforms this against pending ops:
    transform(server: Insert("r",1), pending: Insert("o",1)):
      They have same position. A wins. Server op stays at pos=1, pending shifts to pos=2.

  Transformed server op: Insert("r", pos=1)
  B applies to local state "coat": Insert("r", pos=1) -> "coart"...

  Hmm, apply Insert("r",1) to "coat":
    "c o a t"
     0 1 2 3
    Insert "r" at pos=1: "c r o a t" -> "croat"

  And B's pending becomes Insert("o", pos=2).

  When server acks B's transformed op (Insert("o",2) at rev=2):
  Both A and B must have "croat".
  Server applies Insert("o",2) to "cart":
    "c a r t"
     0 1 2 3
    Insert "o" at pos=2: "c a o r t" -> "caort"  <- WRONG, server has "cart" after A's op

  Final state on server (rev=2): "caort"
  Final state on client B: apply Insert("r",1) to "coat" = "croat"

  DIVERGENCE. The transform function must handle this correctly.

The correct tie-breaking ensures both clients see the same ordering.
In practice, OT libraries (ShareDB, etc.) handle this correctly.
The key insight: tie-breaking must be deterministic and the same on both client and server.
```

### Scenario 2: Insert Then Delete Overlap

```
Initial document: "Hello World"
                   01234567890

User A: Delete(6, 5)   -- deletes "World"  -> "Hello "
User B: Insert("!", 11) -- appends "!"     -> "Hello World!"

Server receives A's delete first (rev=1):
  Apply: "Hello World" -> "Hello "
  Broadcast to B.

Server receives B's insert (clientRev=0):
  Transform Insert(11,"!") against Delete(6,5):
    Insert pos=11. Delete covers [6..10].
    pos 11 > 6+5=11 (exactly at boundary)
    Chars deleted before insert pos: min(5, 11-6) = 5
    Transformed insert pos: 11 - 5 = 6
  Apply Insert("!",6) to "Hello ": "Hello !"

Client B already applied Insert("!",11) locally -> "Hello World!"
Receives server broadcast of Delete(6,5):
  Must transform Delete(6,5) against pending Insert("!",11):
    Insert at 11 > Delete end 11, so delete is unaffected.
    Transformed: Delete(6,5) unchanged.
  Apply Delete(6,5) to "Hello World!": "Hello !"

Both clients converge to: "Hello !"
```

### Scenario 3: Formatting Conflict

```
Initial: "hello" with no formatting

User A: Bold positions [0,5)    -- bolds "hello"
User B: Color positions [2,5) red -- colors "llo" red

Both are non-destructive attribute operations.
They can be merged by union of attributes:

Result: "he" is bold, "llo" is bold AND red.

Most editors handle this with a "last-writer-wins" per attribute key.
Since "bold" and "color" are different keys, no conflict.
If both users tried to set different colors, last write wins per server ordering.
```

---

## 10. Cursor and Selection Presence

### Presence Protocol

Cursors are ephemeral (not part of the persistent document) but must be kept synchronized. They use a separate lightweight channel.

```
Client sends cursor update on every cursor move:
{
  "type": "cursor",
  "clientId": "abc-123",
  "selection": {
    "anchor": 42,   // start of selection (or cursor position if no selection)
    "head": 55      // end of selection (== anchor for cursor with no selection)
  },
  "timestamp": 1709500000000
}

Server:
  1. Receives cursor update
  2. Stores in Redis (TTL = 30 seconds, refreshed on each update)
  3. Broadcasts to all other clients in same document session
  4. Does NOT persist to database (ephemeral)

Other clients receive:
{
  "type": "cursor",
  "userId": "user-789",
  "displayName": "Alice",
  "color": "#FF5733",      // assigned on join, stable per session
  "selection": { "anchor": 42, "head": 55 }
}
```

### Cursor Position Adjustment After Remote Op

When a remote operation is applied, all locally-tracked cursor positions (including other users' cursors) must be updated:

```python
def adjust_cursor_for_op(cursor_pos, op):
    """
    Adjust a cursor position after applying an operation.
    """
    if op.type == "insert":
        if cursor_pos > op.pos:
            return cursor_pos + len(op.chars)
        elif cursor_pos == op.pos:
            # Cursor is exactly at insert position.
            # Convention: cursor stays put (insert appears before cursor).
            return cursor_pos
        else:
            return cursor_pos
    elif op.type == "delete":
        if cursor_pos <= op.pos:
            return cursor_pos
        elif cursor_pos <= op.pos + op.count:
            # Cursor was inside deleted range; move to start of deletion.
            return op.pos
        else:
            return cursor_pos - op.count
    return cursor_pos
```

### Presence Architecture

```
+----------+         +---------------+        +----------+
| Client A |         | Collab Server |        | Client B |
|          |         |               |        |          |
| User moves|        |               |        |          |
| cursor   |-------->| Receive cursor|        |          |
|          | WS msg  | update from A |        |          |
|          |         |               |        |          |
|          |         | Publish to    |        |          |
|          |         | Redis:        |        |          |
|          |         | presence:docX |        |          |
|          |         |   -> A@pos42  |        |          |
|          |         |               |        |          |
|          |         | Fan-out to    |------->| Receive  |
|          |         | all sessions  | WS msg | cursor   |
|          |         | for docX      |        | from A   |
|          |         |               |        | at pos42 |
|          |         |               |        |          |
|          |         +---------------+        | Display  |
|          |                                  | A's      |
|          |                                  | cursor   |

Redis presence store:
  Key: presence:{docId}
  Type: Hash
  Fields: {clientId} -> { userId, pos, timestamp, color }
  TTL: 60 seconds (refreshed by heartbeat)
```

### Heartbeat and Timeout

```
Client sends heartbeat every 15 seconds:
  { "type": "ping" }

Server responds:
  { "type": "pong" }

Server also broadcasts presence list every 30 seconds to all clients.

If a client is not seen for 60 seconds:
  Remove from presence:docId hash
  Broadcast { "type": "user_left", "userId": "..." } to remaining clients
```

---

## 11. Document Versioning and Revision History

### Automatic vs Named Revisions

```
Auto-save revisions (system creates):
  - Every N operations (e.g., N=100)
  - Every M minutes of activity (e.g., M=5)
  - On document close / all editors disconnect

Named revisions (user creates):
  - User explicitly clicks "Save version"
  - Before risky bulk edits
  - These are kept indefinitely; auto-revisions are pruned after 30 days
```

### Storage Strategy: Append-Only Log + Snapshots

```
                   Ops log (append-only)
Rev:  1   2   3 ... 100  101 ... 200  201 ... 300  301 ... current
      |               |               |               |
      |               |               |               |
    Snap            Snap            Snap            Snap
   (rev=0)        (rev=100)      (rev=200)       (rev=300)

To get document at rev=250:
  1. Load snapshot at rev=200 (nearest before 250)
  2. Replay ops 201..250 on top of snapshot
  3. Return result

To show diff between rev=100 and rev=300:
  1. Materialize doc at rev=100 (from snapshot)
  2. Materialize doc at rev=300 (from snapshot)
  3. Compute text diff (Myers algorithm)
  4. Return unified diff format

Snapshot trigger:
  - Every 100 ops: create snapshot
  - Background job: take snapshot, store in S3
  - Update document_snapshots table
```

### Revision History UI Data

```
GET /v1/documents/{docId}/revisions

Response:
{
  "revisions": [
    {
      "revisionId": "rev-uuid-1",
      "rev": 543,
      "name": "Final version",       // user-named
      "isAuto": false,
      "createdAt": "2024-01-15T10:30:00Z",
      "createdBy": { "userId": "...", "displayName": "Alice" },
      "wordCount": 1250,
      "charCount": 7500
    },
    {
      "revisionId": "rev-uuid-2",
      "rev": 501,
      "name": null,                  // auto revision
      "isAuto": true,
      "createdAt": "2024-01-15T09:00:00Z",
      "createdBy": null,
      ...
    }
  ]
}
```

---

## 12. Undo/Redo in Collaborative Context

### The Problem

In a single-user editor, undo reverts the last action. In a collaborative editor, this gets complicated:

```
State:  "Hello"

User A types " World"   -> "Hello World"
User B types "!"        -> "Hello World!"

User A presses Ctrl+Z (undo).

What should happen?
  Option 1: Undo A's last op " World" -> "Hello!"   (B's "!" stays)
  Option 2: Undo the last op in global order -> undoes "!" (wrong! undoes B's work)

Correct behavior: Each user has their OWN undo stack.
  User A's undo should only undo User A's operations.
  User B's "!" should remain.
```

### Per-User Undo Stacks

```
Each user maintains:
  undoStack: [op1, op2, op3]   // ops they've performed, most recent last
  redoStack: [op4, op5]        // ops they've undone

When user presses Ctrl+Z:
  1. Pop op3 from undoStack
  2. Compute inverse of op3 (e.g., Insert becomes Delete, and vice versa)
  3. The inverse op must be transformed against ALL ops that have happened
     since op3 was applied (including other users' ops)
  4. Submit the transformed inverse as a new operation
  5. Push op3 to redoStack

Why transform the inverse?
  If User A inserted "World" at pos=6 (rev=10),
  and since then User B inserted "!" at pos=11 (rev=11),
  the inverse of A's op is Delete("World", pos=6, count=5).
  But this must be transformed against B's Insert("!",11):
    Insert is after Delete end -> Delete is unaffected.
  Submit Delete("World",6,5) -> "Hello!"
```

### Undo Stack Pruning

Over time, the undo stack accumulates many ops. If User B has made 1000 changes since User A's oldest undoable op, transforming becomes expensive. Solutions:

```
1. Limit undo history depth (e.g., 200 ops per user)
2. Mark ops as "un-undoable" if they've been transformed too many times
3. Use OT-based selective undo libraries (e.g., "any-undo" papers)
4. CRDT approach: inverse ops are first-class, no transform needed
   (Yjs implements this via undoManager that tracks origin)
```

---

## 13. Permission Model

### Roles

```
+----------+----------+-------------------+------------------------+
| Role     | View Doc | Comment on Doc    | Edit Doc Content       |
+----------+----------+-------------------+------------------------+
| Owner    |    YES   |        YES        |          YES           |
| Editor   |    YES   |        YES        |          YES           |
| Commenter|    YES   |        YES        |          NO            |
| Viewer   |    YES   |        NO         |          NO            |
+----------+----------+-------------------+------------------------+

Additional owner-only actions:
  - Change permissions of others
  - Delete document
  - Transfer ownership
  - Disable link sharing
```

### Permission Inheritance and Link Sharing

```
Document has:
  - Direct access: specific users or groups granted roles
  - Link sharing: anyone with link gets a role (view/comment/edit)
  - Domain sharing: all users in example.com get a role
  - Public: anyone on the internet can view

Resolution order (most specific wins):
  1. User is owner -> OWNER
  2. User has direct permission -> use that role
  3. User's group has permission -> use that role
  4. User's domain matches domain sharing -> use that role
  5. Link sharing is on -> use link role
  6. Document is public -> VIEWER
  7. Otherwise -> ACCESS DENIED
```

### Permission Checking in WebSocket Handler

```
On WebSocket connect:
  1. Validate JWT token
  2. Extract userId from token
  3. Query permissions table for (docId, userId)
  4. Determine effective role
  5. If role is NONE -> close WebSocket with 403

On receiving "op" message:
  1. Check role is EDITOR or OWNER
  2. If role is COMMENTER or VIEWER -> reject op, send error

On receiving "comment" message:
  1. Check role is EDITOR, COMMENTER, or OWNER
  2. If role is VIEWER -> reject

Cache permissions in Redis:
  Key: perm:{docId}:{userId}
  Value: role
  TTL: 5 minutes (invalidated on permission change)
```

---

## 14. Offline Editing and Sync on Reconnect

### Offline Architecture

The client stores all pending operations in durable local storage (IndexedDB for browsers):

```
+------------------+
|  Browser         |
|                  |
|  IndexedDB:      |
|  - doc state     |
|    (snapshot)    |
|  - pending ops   |
|    [op1, op2...] |
|  - last rev: 200 |
|                  |
|  In memory:      |
|  - applied ops   |
|  - undo stack    |
+------------------+

While offline:
  - User types normally
  - Ops applied to local state immediately
  - Ops appended to IndexedDB pending queue
  - No WebSocket communication

On reconnect:
  1. Open WebSocket: ?rev=200 (last known server rev)
  2. Server responds with ops 201..current (or snapshot if too large)
  3. Client must:
     a. Transform pending ops against received server ops
     b. Apply received server ops to local state
     c. Re-send transformed pending ops to server
  4. Server acks each pending op with new server revs
  5. Client removes acked ops from pending queue
```

### Conflict Resolution on Reconnect

```
Client was offline from rev=200 to current server rev=250.
Client has 10 pending ops (all based on rev=200).

Step 1: Receive server ops 201..250 (50 ops)
Step 2: Transform each pending op against the 50 server ops
         pending[0] = transform(pending[0], serverOps[0..49])
         pending[1] = transform(pending[1], serverOps[0..49], pending[0])
         ... etc.
Step 3: Apply server ops 201..250 to local state
Step 4: Send transformed pending ops to server one by one
         Server acks each with a new rev

If there is a fundamental conflict (e.g., user tried to edit text that was deleted):
  The transform function should handle this gracefully.
  Typically: ops on deleted content become no-ops.

Merge notification:
  Show user: "Your changes were merged with 5 other edits made while you were offline."
```

### Service Worker for Offline Detection

```javascript
// service-worker.js
self.addEventListener('fetch', (event) => {
  if (isDocumentApiRequest(event.request)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Network failed: return cached version
        return caches.match(event.request);
      })
    );
  }
});

// In the client app
window.addEventListener('online', () => {
  collabEngine.reconnect();
});

window.addEventListener('offline', () => {
  collabEngine.enterOfflineMode();
});
```

---

## 15. Rich Text: Formatting Operations

### The Delta Format

Rich text requires encoding both content (characters) and attributes (formatting). The Delta format (Quill.js, used by many editors) represents documents as a sequence of ops:

```
Document: "Hello World" where "Hello" is bold and "World" is italic

Delta representation:
[
  { insert: "Hello", attributes: { bold: true } },
  { insert: " " },
  { insert: "World", attributes: { italic: true } }
]

An edit operation is also a Delta with retain/insert/delete:
  User selects "World" and makes it bold:
  [
    { retain: 6 },                              // skip "Hello "
    { retain: 5, attributes: { bold: true } }  // format "World"
  ]

Insert "!" at end:
  [
    { retain: 11 },   // skip all existing content
    { insert: "!" }
  ]

Delete "Hello":
  [
    { delete: 5 },
    { retain: 6 }
  ]
```

### Composing Deltas

Two deltas can be composed (when op2 is applied after op1):

```
compose(op1, op2) -> op3
such that: apply(apply(doc, op1), op2) == apply(doc, op3)

This is used for:
  - Compressing many small ops into one (for network efficiency)
  - Creating the inverse of a compound op for undo
  - Compacting ops in storage
```

### Transforming Attribute Operations

```
User A: Bold positions [0,10)    -> { retain:0, retain:10 attrs:{bold:true} }
User B: Delete positions [5,10)  -> { retain:5, delete:5 }

Transform A's format against B's delete:
  A's retain:10 now only covers [0,5) of surviving text (5 chars deleted after pos 5)
  Result: retain:5 attrs:{bold:true}

Transform B's delete against A's format:
  Format doesn't change positions, so delete is unchanged.
  Result: retain:5, delete:5

Both clients: bold "Hello" (first 5 chars), "World" is gone.
```

### Block-Level Formatting

Documents have block-level structure (paragraphs, headings, lists) in addition to inline formatting:

```
Block structure encoded as "newline with attributes":
[
  { insert: "My Heading", attributes: { bold: true, fontSize: 24 } },
  { insert: "\n", attributes: { header: 1 } },    // paragraph marker
  { insert: "Some paragraph text" },
  { insert: "\n" },                                // regular paragraph
  { insert: "• List item 1" },
  { insert: "\n", attributes: { list: "bullet" } }, // list item
  { insert: "• List item 2" },
  { insert: "\n", attributes: { list: "bullet" } }
]

Transforming block ops requires special care:
  - Deleting a newline merges two paragraphs
  - Must merge block attributes correctly
  - Table cells are especially complex (nested structure)
```

---

## 16. Scaling Strategy

### Document-Level Sharding

```
Each document is served by one primary Collab Server (or a small cluster).
Shard assignment:
  server_index = hash(doc_id) % num_servers

Load Balancer routes all WebSocket connections for a docId to the same server.

+---------------------+
| Load Balancer       |
| Hash(docId) % N     |
+----+----+----+------+
     |    |    |
  S1   S2   S3   ...
  Docs: Docs: Docs:
  A,D,G B,E,H C,F,I

Hot document problem:
  Doc X has 10,000 concurrent editors.
  All traffic for X goes to one server -> bottleneck.

Solution: Read replicas for documents with many viewers.
  - Primary server: receives writes, applies OT, broadcasts to replicas
  - Replica servers: forward ops to primary, receive broadcasts, fan out to viewer WS
  - Writers still connect to primary; viewers can connect to any replica
```

### Database Sharding

```
Shard document_ops and document_snapshots by doc_id:
  shard = hash(doc_id) % num_db_shards

Within a shard, operations for a doc_id are sequential (partitioned by doc_id, rev).

Hot spot handling:
  - VIP docs (e.g., company-wide announcements with 10K editors): dedicated shard
  - Consistent hashing with virtual nodes allows rebalancing

PostgreSQL partitioning:
  CREATE TABLE document_ops (
    doc_id UUID NOT NULL,
    rev    INT  NOT NULL,
    ...
    PRIMARY KEY (doc_id, rev)
  ) PARTITION BY HASH (doc_id);

  CREATE TABLE document_ops_0 PARTITION OF document_ops
    FOR VALUES WITH (modulus 8, remainder 0);
  -- ... 8 partitions total
```

### Caching Layer

```
Redis cluster caches:
  1. Recent ops for hot documents (last 1000 ops)
     Key: ops:{docId}:recent  (Redis list, capped at 1000)
     Purpose: serve reconnect gap-fill without hitting DB

  2. Latest snapshot metadata
     Key: snap:{docId}:latest
     Value: { rev, s3_key, byte_size }
     TTL: 5 minutes

  3. Permission cache
     Key: perm:{docId}:{userId}
     Value: role string
     TTL: 5 minutes, invalidated on permission change

  4. Presence
     Key: presence:{docId}
     Type: Hash {clientId -> serialized cursor state}
     TTL: per field, refreshed on each cursor update

  5. Document session lock
     Key: lock:{docId}
     Type: SET NX with TTL=30s
     Purpose: ensure only one server at a time is the primary for a doc
     (with pub/sub fallback if primary fails)
```

### Snapshot Compaction Job

```
Background job (runs every hour):

1. Find documents where:
   ops since last snapshot > 100

2. For each such doc:
   a. Load snapshot at last_snapshot_rev
   b. Load ops from last_snapshot_rev+1 to current_rev
   c. Apply all ops to snapshot
   d. Write new snapshot to S3
   e. Update document_snapshots table
   f. Mark old ops < (current_rev - 30_days_worth) for deletion

3. Prune old auto-revisions:
   Delete named_revisions WHERE is_auto=true AND created_at < now() - 30 days
   Keep all user-named revisions forever
```

### Global Architecture with Multiple Regions

```
+------------------+         +------------------+         +------------------+
| Region: US-East  |         | Region: EU-West  |         | Region: AP-East  |
|                  |         |                  |         |                  |
| Load Balancer    |         | Load Balancer    |         | Load Balancer    |
| Collab Servers   |         | Collab Servers   |         | Collab Servers   |
| Redis (presence) |         | Redis (presence) |         | Redis (presence) |
|                  |         |                  |         |                  |
| Primary DB shard |         |                  |         |                  |
| (for US docs)    |         |                  |         |                  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         |     Cross-region sync      |                            |
         +----------------------------+----------------------------+
                                      |
                          +-----------v----------+
                          | Global Op Log        |
                          | (Spanner / CockroachDB|
                          |  with global strong   |
                          |  consistency)         |
                          +----------------------+

Documents are "homed" to a region.
  - If document owner is in US, doc is homed to US-East.
  - EU users editing a US doc: their WS connects to EU servers,
    which proxy to US-East for op ordering.
  - Added ~100ms latency for EU users on US-homed docs.
  - For global collaboration: accept the latency or use async CRDT sync.
```

---

## 17. Common Interview Follow-ups

### Q: How does Google Docs handle the Jupiter protocol limitation of one pending op?

Traditional OT requires the client to wait for an ack before sending the next op. Google Docs improves on this:

```
Technique: Operation pipelining with revision tracking.

Client can send multiple ops without waiting for acks,
but must track:
  - which ops are unacknowledged (pending)
  - the revision each pending op was based on

Server processes them in order, acking each one.
Client adjusts pending ops as acks arrive.

This is safe because:
  - Server processes in order (FIFO per client connection)
  - Server transforms each against current server state
  - Client can reconstruct server's view by replaying acks
```

### Q: How do you handle a document with 1 million characters (very large doc)?

```
Challenges:
  1. Loading: 1M chars * 2 bytes = 2MB minimum
  2. OT/CRDT operations on large documents
  3. Network: sending full doc on load

Solutions:
  1. Chunked loading:
     - Load only visible viewport (e.g., 50KB around scroll position)
     - Lazy load sections as user scrolls

  2. Document partitioning:
     - Internally split doc into "segments" (e.g., per page or per 10K chars)
     - Each segment has its own op log and lock
     - Cross-segment ops require distributed transaction

  3. Streaming snapshots:
     - Snapshot stored in S3 as multi-part file
     - Client downloads via range requests

  4. Compression:
     - Snapshots and ops compressed with Brotli/gzip
     - Delta compression: send diff from last snapshot
```

### Q: How do you implement Suggested Edits (Track Changes)?

```
Suggested edits are regular operations annotated with a "suggestion" flag.
They are stored in the op log like any other op but rendered differently.

Data model:
{
  "type": "insert",
  "chars": "proposed text",
  "attrs": {
    "suggestion": {
      "suggestionId": "sugg-uuid",
      "authorId": "user-123",
      "createdAt": "..."
    }
  }
}

When suggestion is ACCEPTED:
  - Remove the suggestion attribute, keep the content
  - This is a new op that strips the "suggestion" attribute

When suggestion is REJECTED:
  - Delete the suggested chars (send a delete op)
  - Other users see the deletion

Suggestion ops participate in OT/CRDT like regular ops.
The rendering layer decides how to display them (strikethrough vs. green text).
```

### Q: How does the permission model interact with the real-time engine?

```
Permissions can change while editors are active:
  - Owner revokes editor's access while editor is typing

Solution:
  1. Collab server subscribes to permission change events
     (published by API server to a Kafka topic)
  2. On permission change event for docId:
     a. Look up all active WebSocket connections for docId on this server
     b. For each connection: recheck user's effective role
     c. If role is now VIEWER or NONE: reject subsequent op messages
     d. If role is now NONE: close WebSocket with 403 after short grace period
  3. Cache TTL of 5 minutes means max 5-min lag for revocation
     (acceptable for most use cases; shorter TTL for higher security)
```

### Q: What if two users simultaneously rename the document?

```
Document title is not part of the op log.
Title is a simple metadata field in the documents table.

Approach: last-write-wins for title.
  - Title changes go through REST API (PATCH /documents/{docId})
  - Use optimistic locking (version column) to detect conflicts
  - Inform user if their title was overwritten
  - Alternative: treat title as a one-character CRDT text field

Why not OT for title?
  - Title is short, simple, and rarely edited concurrently
  - Full OT infrastructure for a 256-char field is overkill
  - LWW is acceptable for metadata (not document body)
```

### Q: How do you handle comments as the document changes?

```
Comments are anchored to a text range (anchor + head position).
As the document changes, these positions must be updated.

Approach: Store comment anchor as an op-log reference, not an absolute position.

On comment creation:
  Record: { commentId, docRev: 543, anchor: 10, head: 20 }

To resolve comment position at current rev (600):
  Replay ops from rev=543 to rev=600, adjusting anchor/head at each step.
  Cache the resolved position.

When the anchored text is deleted:
  Mark comment as "orphaned" (text was deleted).
  Show in sidebar with note "The text this comment referred to was deleted."

Alternatively (simpler):
  Embed comment anchors as invisible CRDT nodes in the document text.
  The CRDT preserves them through all operations.
  This is how Notion and Linear handle it.
```

### Q: How do you test a distributed collaborative editor?

```
Testing layers:

1. Unit tests for OT/CRDT transform functions:
   Property-based testing (QuickCheck style):
     - Generate random pairs of ops
     - Verify convergence: apply(apply(doc, op1), transform(op2,op1)) ==
                           apply(apply(doc, op2), transform(op1,op2))
   Cover all op type combinations: insert-insert, insert-delete, etc.

2. Integration tests for the server:
   - Simulate N clients sending concurrent ops
   - Verify all clients converge to same final state
   - Test reconnect and gap-fill flows

3. Chaos/fault injection tests:
   - Drop random WebSocket messages
   - Kill Collab Server mid-session
   - Partition DB briefly
   - Verify no data loss, correct convergence

4. Load tests:
   - 100 concurrent editors on same document
   - 10K documents with 3 editors each
   - Measure convergence latency (p50, p99)
   - Measure WebSocket server CPU at capacity

5. Fuzz testing the transform function:
   Generate malformed or adversarial ops.
   Verify no panics, no data corruption.
```

### Q: How do you implement spell-check and grammar suggestions?

```
Spell/grammar checking runs on the client side (for privacy and latency):
  - Use browser's built-in spell-check (contenteditable attribute)
  - Or: run LanguageTool WebAssembly module locally
  - Underlines are local UI decoration, not stored in the document

For AI grammar suggestions (like Gemini in Google Docs):
  1. Client sends selected text to AI API (separate service)
  2. AI returns suggested replacement
  3. Suggested replacement is inserted as a "suggestion" op (see above)
  4. Other users can see and accept/reject AI suggestions just like human suggestions
```

### Q: How does export to DOCX work at scale?

```
Export is a background job (not synchronous):

1. Client calls POST /v1/documents/{docId}/export { format: "docx" }
2. API server enqueues export job to a queue
3. Return immediately: { exportId: "exp-123", status: "queued" }

Export worker:
  1. Dequeue job
  2. Load document snapshot + apply pending ops -> get final state
  3. Convert Delta format to DOCX using a library (e.g., pandoc, docx.js)
  4. Upload DOCX to S3
  5. Update export job status to "complete" with S3 URL

Client polls:
  GET /v1/exports/exp-123
  -> { status: "complete", downloadUrl: "https://s3.../doc.docx?sig=..." }
  Or uses webhook/WebSocket notification.

Scale:
  - Export workers are stateless, easily scalable
  - Large documents (> 10MB) may take 30+ seconds
  - Pre-generate common exports on document save (background, for popular docs)
```

---

## Summary: Key Design Decisions

| Decision              | Choice                              | Rationale                                        |
| --------------------- | ----------------------------------- | ------------------------------------------------ |
| Concurrency algorithm | OT (server-canonical ordering)      | Well-understood, works with central server model |
| Operation format      | Delta (retain/insert/delete/format) | Composable, invertible, supports rich text       |
| Transport             | WebSocket (persistent)              | Low latency, server-push, stateful session       |
| Database              | PostgreSQL (sharded by doc_id)      | ACID, good for sequential op log, easy to shard  |
| Snapshot storage      | S3 / object store                   | Cheap, durable, scales to any doc size           |
| Presence              | Redis (ephemeral, TTL-based)        | Fast, no persistence needed for cursors          |
| Fan-out               | Redis Pub/Sub or Kafka              | Decouple WebSocket servers from each other       |
| Offline support       | IndexedDB + transform on reconnect  | Works in browsers, handles gaps via replay       |
| Undo/redo             | Per-user undo stack + transform     | Users only undo their own changes                |
| Permissions           | Role hierarchy with caching         | Flexible, fast to check, invalidated on change   |
| Versioning            | Append-only op log + snapshots      | Efficient storage, supports any-point-in-time    |
