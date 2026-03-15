# Data Model: Collaborative Editor (Google Docs)

A collaborative editor allows multiple users to simultaneously edit a document with real-time visibility of each other's changes. The data model must support an append-only operation log for conflict resolution (Operational Transformation or CRDT), periodic snapshots for fast document loading, and fine-grained access control. The core challenge is that concurrent edits from different clients can arrive in different orders, and the system must converge to the same final state regardless of arrival order.

## Table Responsibilities

| Table | Purpose | Storage | Key Characteristic |
|-------|---------|---------|-------------------|
| **documents** | Document metadata and ownership | PostgreSQL | Low-volume, transactional |
| **document_ops** | Append-only log of edit operations | PostgreSQL (partitioned by doc_id) | Heart of the system: enables OT/CRDT conflict resolution |
| **document_snapshots** | Periodic full-document state captures | PostgreSQL + S3 | Avoids replaying entire op history on document open |
| **permissions** | Access control for documents | PostgreSQL | Supports user, group, and public sharing |
| **named_revisions** | Named checkpoints (version history) | PostgreSQL | User-facing "Version History" feature |

## Detailed Field Descriptions

### documents

| Field | Type | Description |
|-------|------|-------------|
| doc_id | UUID, PK | Unique document identifier. UUID for URL safety and to prevent enumeration attacks (sequential IDs let attackers guess document URLs). |
| owner_id | BIGINT, FK -> users | Document creator. Has permanent admin-level access that cannot be revoked. Used for billing (storage quotas) and ownership transfer. |
| title | VARCHAR(512) | Document title. Stored separately from content because it appears in dashboards, search results, and sharing dialogs without loading the full document. |
| created_at | TIMESTAMP | Document creation time. Used for "Recent documents" sorting. |
| updated_at | TIMESTAMP, INDEX | Last edit time. Updated on every op. Indexed for "Last modified" sorting in the document list. |
| latest_revision | BIGINT | Revision number of the most recent operation. Incremented with every accepted op. Used for optimistic concurrency: clients send their known revision with each op, and the server detects conflicts by comparing. |
| snapshot_revision | BIGINT | Revision number of the latest snapshot. When loading a document, the server loads the snapshot and replays ops from `snapshot_revision + 1` to `latest_revision`. The closer these are, the faster the load. |

**Why track both `latest_revision` and `snapshot_revision`?** Loading a document requires reconstructing its current state. Without snapshots, this means replaying every operation since document creation (potentially millions of ops for a heavily edited document). Snapshotting periodically (e.g., every 100 ops) limits replay to at most 100 operations. The gap between `latest_revision` and `snapshot_revision` directly determines load time.

### document_ops (Append-Only)

| Field | Type | Description |
|-------|------|-------------|
| doc_id | UUID, FK -> documents | Which document this operation modifies. Partition key for co-locating all ops for a document on the same storage partition. |
| revision | BIGINT, PK (within doc) | Server-assigned sequential revision number. Each document has its own revision counter starting at 1. The server assigns revisions in the order operations are accepted, creating a total order. |
| client_id | VARCHAR(64) | Which client instance sent this operation. Used for cursor positioning and to distinguish "my ops" from "their ops" in the UI (your cursor is blue, theirs is green). |
| user_id | BIGINT, FK -> users | Which user made the edit. Used for "who changed this?" attribution in version history and audit logs. |
| ops_json | JSONB | The operation payload in Delta format. Contains an array of actions: `retain(n)` (skip n characters), `insert(text, attributes)`, `delete(n)`, `format(n, attributes)`. JSONB because operation structure varies. |
| client_revision | BIGINT | The revision the client believed was current when it generated this op. The server uses the gap between `client_revision` and the actual `latest_revision` to determine which concurrent ops need to be transformed against. |
| created_at | TIMESTAMP | When the server accepted this operation. Used for time-based version history display. |

**Why append-only?** Operations are never updated or deleted because the entire collaboration model depends on a consistent, ordered history. If an operation were modified or removed, all subsequent transformations would be invalidated, potentially corrupting the document. The append-only constraint also simplifies replication and backup.

**Why `client_revision`?** This is the key to Operational Transformation. When client A sends an op based on revision 5, but the server is already at revision 7 (because clients B and C sent ops), the server must transform A's op against revisions 6 and 7 before applying it as revision 8. Without `client_revision`, the server would not know which ops to transform against.

**Why Delta format (retain/insert/delete)?** Delta format is position-based and composable. Two deltas can be combined into one, and a delta can be transformed against another delta. This mathematical property is what makes OT work. Alternative representations (like "replace text at line 5, column 10") are harder to transform correctly.

### document_snapshots

| Field | Type | Description |
|-------|------|-------------|
| doc_id | UUID, FK -> documents | Which document this snapshot represents. |
| revision | BIGINT, PK (within doc) | The revision number at which this snapshot was taken. Multiple snapshots exist per document (one every N revisions). |
| content_json | JSONB / TEXT | Full document state at this revision. For small documents, stored inline as JSONB. For large documents (>1MB), stored in S3 with a reference URL. |
| byte_size | INT | Size of the snapshot in bytes. Used for storage monitoring and deciding when to externalize to S3. |
| created_at | TIMESTAMP | When the snapshot was created. Used for garbage collection of old snapshots (keep only the last M snapshots). |

**Why not snapshot after every operation?** Snapshotting is expensive: serializing the full document state on every keystroke would add significant latency and storage. Snapshotting every 100-500 ops strikes a balance: document load requires replaying at most 100-500 ops (fast), and storage grows linearly with snapshot frequency rather than with total ops.

**Why keep multiple snapshots?** Users can browse "Version History" and restore any previous version. Multiple snapshots provide natural restore points. The system can also garbage-collect very old snapshots while keeping the ops log intact for complete audit history.

### permissions

| Field | Type | Description |
|-------|------|-------------|
| perm_id | BIGINT, PK | Unique permission entry identifier. |
| doc_id | UUID, FK -> documents, INDEX | Which document this permission applies to. Indexed for "who has access to this document?" queries. |
| principal_type | ENUM('user', 'group', 'anyone') | What kind of entity is being granted access. `anyone` enables "share with anyone with the link" functionality. |
| principal_id | BIGINT, NULLABLE | The user or group ID being granted access. Null when `principal_type = 'anyone'` (no specific principal). |
| role | ENUM('owner', 'editor', 'commenter', 'viewer') | What level of access is granted. Editors can modify content. Commenters can add comments but not edit. Viewers are read-only. |
| expires_at | TIMESTAMP, NULLABLE | Optional expiration for temporary access (e.g., "share with contractor for 30 days"). Null means permanent access. |

**Why separate from documents table?** A document can have dozens of permission entries (individual users, groups, public link). Embedding this in the documents table would complicate queries and violate normalization. A separate table also enables efficient "list all documents I have access to" queries by indexing on (principal_type, principal_id).

### named_revisions

| Field | Type | Description |
|-------|------|-------------|
| revision_id | BIGINT, PK | Unique revision identifier. |
| doc_id | UUID, FK -> documents, INDEX | Which document this revision belongs to. |
| revision | BIGINT | Links to document_ops.revision. This is the exact point in the op history that this named revision captures. |
| name | VARCHAR(255) | User-provided name (e.g., "Final Draft", "Pre-review version") or auto-generated ("March 15, 2024 3:42 PM"). |
| is_auto | BOOLEAN | Whether this revision was auto-created by the system (e.g., every 30 minutes of editing) or manually created by the user. Auto-revisions can be garbage-collected more aggressively. |
| created_at | TIMESTAMP | When the revision was named/captured. Displayed in the version history UI. |

**Why not just use snapshots for version history?** Snapshots are an implementation detail for performance (fast document loading). Named revisions are a user-facing feature for document management. Their lifecycles differ: snapshots can be garbage-collected freely, but named revisions (especially user-created ones) should be preserved indefinitely.

## ER Diagram

```
┌──────────────────────┐
│     permissions       │
│──────────────────────│
│ perm_id (PK)          │
│ doc_id (FK)           │
│ principal_type        │
│ principal_id          │
│ role                  │
│ expires_at            │
└──────────────────────┘
          │ *
          │
          │
          │ 1
┌──────────────────────┐       ┌──────────────────────┐
│     documents         │       │   named_revisions     │
│──────────────────────│       │──────────────────────│
│ doc_id (PK)           │  1    │ revision_id (PK)      │
│ owner_id (FK)         │──────►│ doc_id (FK)           │
│ title                 │  *    │ revision              │
│ created_at            │       │ name                  │
│ updated_at            │       │ is_auto               │
│ latest_revision       │       │ created_at            │
│ snapshot_revision     │       └──────────────────────┘
└──────────────────────┘
     │              │
     │ 1            │ 1
     │              │
     │ *            │ *
┌──────────────┐  ┌──────────────────────┐
│ document_ops  │  │ document_snapshots    │
│ (append-only) │  │──────────────────────│
│──────────────│  │ doc_id (FK)           │
│ doc_id (FK)   │  │ revision (PK in doc)  │
│ revision (PK) │  │ content_json          │
│ client_id     │  │ byte_size             │
│ user_id (FK)  │  │ created_at            │
│ ops_json      │  └──────────────────────┘
│ client_rev.   │
│ created_at    │
└──────────────┘

Relationships:
  documents 1───* document_ops        (one document has many operations)
  documents 1───* document_snapshots  (one document has periodic snapshots)
  documents 1───* permissions         (one document has many permission entries)
  documents 1───* named_revisions     (one document has many named versions)
```

## Data Flow

### Loading a Document (Read Path)

```
1. Client opens document with doc_id
         │
         ▼
2. Check permissions: does user have viewer/editor access?
         │
    ┌────┴──────┐
    │Authorized?│
    ├─No────────┤──► Return 403 Forbidden
    │ Yes       │
    └────┬──────┘
         ▼
3. Fetch documents row → get snapshot_revision, latest_revision
         │
         ▼
4. Load document_snapshots at snapshot_revision
   (full document state at that point)
         │
         ▼
5. Fetch document_ops from (snapshot_revision + 1) to latest_revision
         │
         ▼
6. Apply each op sequentially to the snapshot content
   → produces current document state
         │
         ▼
7. Return document content + latest_revision to client
         │
         ▼
8. Client establishes WebSocket connection for real-time updates
```

### Editing (Write Path - OT)

```
1. Client makes a local edit → generates op in Delta format
         │
         ▼
2. Apply op optimistically to local document (instant UI feedback)
         │
         ▼
3. Send op to server via WebSocket:
   { doc_id, ops_json, client_revision }
         │
         ▼
4. Server receives op and acquires document-level lock
         │
         ▼
5. Compare client_revision with latest_revision
         │
    ┌────┴─────────────────────┐
    │client_rev == latest_rev? │
    ├─Yes──────────────────────┤──► Op applies cleanly (no conflicts)
    │ No (concurrent edits)    │
    └────┬─────────────────────┘
         ▼
6. Transform the incoming op against all ops from
   (client_revision + 1) to latest_revision
   (Operational Transformation)
         │
         ▼
7. Assign next revision number, append to document_ops
         │
         ▼
8. Update documents.latest_revision
         │
         ▼
9. Release document lock
         │
         ▼
10. Send ACK to originating client with assigned revision
          │
          ▼
11. Broadcast transformed op to all other connected clients
          │
          ▼
12. Other clients receive op → transform against their
    pending local ops → apply to local document
```

### Snapshotting (Background)

```
13. Background job checks: latest_revision - snapshot_revision > 100?
          │
     ┌────┴──┐
     │ Yes?  │
     ├─No────┤──► Skip (not enough new ops)
     │ Yes   │
     └───┬───┘
         ▼
14. Load current snapshot + replay ops to latest_revision
          │
          ▼
15. Serialize full document state as content_json
          │
          ▼
16. INSERT into document_snapshots
    Update documents.snapshot_revision
```

**Why a document-level lock during op processing?** OT requires strict sequential processing of operations for a single document. If two ops are processed concurrently, the revision number assignment would race. A per-document lock (not a global lock) allows different documents to be processed in parallel while ensuring sequential consistency within each document. The lock is held for microseconds (just the transform + append), so contention is minimal even for heavily edited documents.

**Why broadcast the transformed op, not the original?** The originating client sent an op based on their local state. The server transformed it to account for concurrent edits. If the original op were broadcast, other clients would apply it incorrectly because their state has already incorporated the concurrent edits. The transformed op is correct relative to the current server state, which all other clients are synced to.
