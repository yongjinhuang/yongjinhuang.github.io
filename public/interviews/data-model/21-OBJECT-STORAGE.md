# Data Model: Object Storage (Amazon S3)

An object storage system stores arbitrary binary objects (files) organized into buckets (namespaces) with rich metadata, versioning, and lifecycle management. The data model separates metadata (object name, size, permissions) from data (the actual bytes), enabling independent scaling of the metadata tier and the data tier. Objects are split into chunks and erasure-coded across multiple data nodes for durability, achieving 99.999999999% (11 nines) durability without triple replication.

## Table Responsibilities

| Table | Purpose | Storage | Key Characteristic |
|-------|---------|---------|-------------------|
| **buckets** | Namespace containers with policies | PostgreSQL | Low-volume, rich configuration |
| **object_metadata** | Object index with location pointers | PostgreSQL (sharded by bucket) | The core lookup table; separates metadata from data |
| **multipart_uploads** | In-progress large file uploads | PostgreSQL | Tracks multipart upload sessions |
| **multipart_parts** | Individual parts of a multipart upload | PostgreSQL | Assembled into final object on completion |

## Detailed Field Descriptions

### buckets

| Field | Type | Description |
|-------|------|-------------|
| bucket_name | VARCHAR(63), PK | Globally unique bucket name (like a domain name). Used as the first path component in the API URL: `s3://bucket_name/key`. Constrained to DNS-compatible characters for virtual-hosted-style URLs. |
| owner_account | BIGINT, FK -> accounts | AWS account that owns this bucket. Used for billing (storage and request costs) and IAM policy evaluation. |
| region | VARCHAR(20), NOT NULL | Physical region where data is stored (e.g., "us-east-1"). Data sovereignty laws may require data to stay in a specific region. Also determines latency for nearby clients. |
| versioning_enabled | BOOLEAN, DEFAULT false | Whether object versioning is active. When enabled, overwriting an object creates a new version instead of replacing it. This enables rollback and prevents accidental data loss. |
| default_encryption | VARCHAR(20) | Encryption algorithm for objects in this bucket (e.g., "AES-256", "aws:kms"). Applied automatically to all new objects. Ensures compliance with encryption-at-rest requirements. |
| acl_json | JSONB | Access control list defining who can read/write/list the bucket. JSONB because ACLs can be complex (multiple grantees with different permissions). |
| lifecycle_rules_json | JSONB | Automated data management rules (e.g., "move to Glacier after 90 days", "delete after 365 days"). JSONB because rules are complex (multiple rules with different filters and actions). |
| replication_config_json | JSONB, NULLABLE | Cross-region replication settings. Specifies destination bucket and which objects to replicate (prefix filter). Null if replication is not configured. |

**Why globally unique bucket names?** S3-style APIs support virtual-hosted-style URLs (`bucket-name.s3.amazonaws.com`), which requires the bucket name to be DNS-compatible and globally unique. This design simplifies routing: given a bucket name, the system can determine the owning region and account without any lookup.

**Why JSONB for lifecycle_rules?** Lifecycle rules are highly variable: one bucket might have "transition objects with prefix logs/ to Glacier after 30 days and delete after 365 days" while another has no rules. JSONB accommodates this variability without schema changes and supports complex rule structures (multiple rules, filters, transitions).

### object_metadata

| Field | Type | Description |
|-------|------|-------------|
| bucket_name | VARCHAR(63), PK (composite) | Which bucket this object belongs to. Part of the composite primary key. |
| key | VARCHAR(1024), PK (composite) | Object key (path). Combined with bucket_name, forms the unique object identifier. Keys can contain slashes to simulate directory structures ("photos/2024/vacation/sunset.jpg"). |
| version_id | VARCHAR(64), PK (composite) | Version identifier. For non-versioned buckets, always "null". For versioned buckets, a unique string per version. Part of the composite PK to allow multiple versions of the same key. |
| is_delete_marker | BOOLEAN, DEFAULT false | In versioned buckets, deleting an object creates a delete marker (a version with no data) rather than actually removing data. GET requests see the delete marker and return 404, but the data is still recoverable by specifying a prior version_id. |
| size_bytes | BIGINT | Object size. Used for storage billing, Content-Length response header, and multipart download range calculations. |
| etag | VARCHAR(32) | MD5 hash of the object content (or hash-of-hashes for multipart uploads). Used for cache validation (If-None-Match) and data integrity verification. |
| content_type | VARCHAR(255) | MIME type (e.g., "image/jpeg", "application/pdf"). Returned in the Content-Type response header so browsers handle the file correctly. |
| storage_class | ENUM('STANDARD', 'IA', 'GLACIER', 'DEEP_ARCHIVE') | Storage tier determining cost and access latency. STANDARD: low-latency, higher cost. GLACIER: minutes-to-hours retrieval, 90% cheaper. Lifecycle rules can automatically transition objects between classes. |
| last_modified | TIMESTAMP, INDEX | When the object was last written. Returned in response headers and used for conditional requests (If-Modified-Since). |
| user_metadata_json | JSONB | User-defined key-value metadata (x-amz-meta-* headers). JSONB because metadata keys and values are entirely user-defined. |
| checksum | VARCHAR(64) | User-provided checksum (SHA-256 or CRC32C) for end-to-end data integrity verification. Compared against the uploaded data to detect corruption during transit. |
| data_location_json | JSONB | Internal mapping to physical storage: which data nodes hold which chunks of this object. Contains an array of {chunk_index, data_node_ids[], fragment_ids[]}. This is the bridge between the metadata tier and the data tier. |

**Why composite PK (bucket_name, key, version_id)?** An object is uniquely identified by where it lives (bucket), what it is called (key), and which version it is. This composite key enables both versioned and non-versioned access patterns with the same schema. For non-versioned lookups, query with version_id = "null". For versioned lookups, specify the version_id.

**Why `data_location_json` as JSONB?** After erasure coding, an object's data is scattered across many data nodes as coded fragments. The number and location of fragments depends on the erasure coding scheme (e.g., RS(10,4) produces 14 fragments on 14 different nodes). JSONB flexibly represents this variable-length mapping. During a GET, the system reads any 10 of the 14 fragments to reconstruct the original data.

**Why `is_delete_marker` instead of actual deletion?** In versioned buckets, users expect "delete" to be undoable. A delete marker is a lightweight tombstone that hides the object without destroying data. Users can "undelete" by removing the delete marker. This also enables compliance use cases where regulations require data retention even after user deletion.

### multipart_uploads

| Field | Type | Description |
|-------|------|-------------|
| upload_id | UUID, PK | Unique identifier for this multipart upload session. Returned to the client on InitiateMultipartUpload; used to associate subsequent UploadPart requests. |
| bucket_name | VARCHAR(63), FK -> buckets | Destination bucket. |
| key | VARCHAR(1024) | Destination object key. The final object will be stored at this key when the upload is completed. |
| initiated_at | TIMESTAMP | When the upload was started. Used for cleanup: abandoned uploads (no activity for 7 days) are automatically aborted and their parts garbage-collected. |
| storage_class | ENUM('STANDARD', 'IA', 'GLACIER') | Storage class for the final assembled object. Must be specified at initiation because it affects how parts are stored. |

**Why multipart uploads?** Large objects (>5GB) cannot be uploaded in a single HTTP request due to timeouts and memory constraints. Multipart uploads allow the client to upload the object in independent parts (5MB-5GB each), which can be uploaded in parallel and retried independently on failure. This is essential for reliability on large files.

### multipart_parts

| Field | Type | Description |
|-------|------|-------------|
| upload_id | UUID, FK -> multipart_uploads, PK (composite) | Which multipart upload this part belongs to. |
| part_number | INT, PK (composite) | Part sequence number (1-10000). Parts are assembled in order by part_number when the upload is completed. The 10000 limit with 5GB max per part allows objects up to 50TB. |
| etag | VARCHAR(32) | MD5 hash of the part data. Returned on UploadPart response and required on CompleteMultipartUpload request. Ensures the client confirms exactly which parts to assemble. |
| size | BIGINT | Part size in bytes. Used to compute the final object size and for billing. |
| data_location_json | JSONB | Where this part's data is physically stored (same format as object_metadata.data_location_json). Each part is independently erasure-coded and distributed. |
| uploaded_at | TIMESTAMP | When this part was uploaded. Used for cleanup of abandoned uploads. |

**Why require the client to send ETags on CompleteMultipartUpload?** This is a confirmation step. The client tells the server "assemble parts 1, 2, 3 with these specific ETags." If a part was corrupted during upload or the client uploaded the wrong data, the ETag mismatch would catch it before assembling a corrupted object. This is an end-to-end integrity check.

## ER Diagram

```
┌──────────────────────┐
│       buckets         │
│──────────────────────│
│ bucket_name (PK)      │
│ owner_account         │
│ region                │
│ versioning_enabled    │
│ default_encryption    │
│ acl_json              │
│ lifecycle_rules_json  │
│ replication_config    │
└──────────────────────┘
     │              │
     │ 1            │ 1
     │              │
     │ *            │ *
     │    ┌──────────────────────┐
     │    │  multipart_uploads    │
     │    │──────────────────────│
     │    │ upload_id (PK)        │
     │    │ bucket_name (FK)      │
     │    │ key                   │
     │    │ initiated_at          │
     │    │ storage_class         │
     │    └──────────────────────┘
     │              │
     │              │ 1
     │              │
     │              │ *
     │    ┌──────────────────────┐
     │    │  multipart_parts      │
     │    │──────────────────────│
     │    │ upload_id (FK, PK)    │
     │    │ part_number (PK)      │
     │    │ etag                  │
     │    │ size                  │
     │    │ data_location_json    │──► physical data nodes
     │    │ uploaded_at           │
     │    └──────────────────────┘
     │
┌──────────────────────┐
│   object_metadata     │
│──────────────────────│
│ bucket_name (PK, FK)  │
│ key (PK)              │
│ version_id (PK)       │
│ is_delete_marker      │
│ size_bytes            │
│ etag                  │
│ content_type          │
│ storage_class         │
│ last_modified         │
│ user_metadata_json    │
│ checksum              │
│ data_location_json ───│──► physical data nodes
└──────────────────────┘     (chunk locations after
                              erasure coding)

Relationships:
  buckets 1───* object_metadata    (one bucket contains many objects)
  buckets 1───* multipart_uploads  (one bucket has many in-progress uploads)
  multipart_uploads 1───* multipart_parts (one upload has many parts)
```

## Data Flow

### PUT Object (Write Path)

```
1. Client sends PUT request: bucket_name, key, data, metadata
         │
         ▼
2. Validate: bucket exists, caller authorized (ACL + IAM policy),
   object size within limits
         │
         ▼
3. Compute checksum of incoming data (verify against client-provided
   checksum if present)
         │
         ▼
4. Split data into chunks (e.g., 64MB each for large objects)
         │
         ▼
5. For each chunk, apply erasure coding:
   RS(10, 4) → 10 data fragments + 4 parity fragments = 14 total
         │
         ▼
6. Write 14 fragments to 14 different data nodes
   (spread across failure domains: different racks, AZs)
         │
         ▼
7. Wait for write quorum (e.g., 11 of 14 ACKs)
         │
         ▼
8. Build data_location_json:
   [{chunk: 0, nodes: [n1, n2, ..., n14], fragments: [f1, ..., f14]},
    {chunk: 1, ...}]
         │
         ▼
9. INSERT object_metadata (or new version if versioning enabled)
         │
         ▼
10. If versioning enabled: previous version remains accessible
    If not: previous version's data marked for garbage collection
         │
         ▼
11. Return 200 OK with ETag
```

### GET Object (Read Path)

```
1. Client sends GET request: bucket_name, key [, version_id]
         │
         ▼
2. Lookup object_metadata by (bucket_name, key, version_id)
         │
    ┌────┴──────────────┐
    │Found? Not a       │
    │delete marker?     │
    ├─No────────────────┤──► Return 404 Not Found
    │ Yes               │
    └────┬──────────────┘
         ▼
3. Parse data_location_json → list of chunks and fragment locations
         │
         ▼
4. For each chunk: read any K of N fragments (e.g., 10 of 14)
   from data nodes in parallel
         │
    ┌────┴──────────────┐
    │All K fragments    │
    │available?         │
    ├─Yes───────────────┤──► Decode directly
    │ No (some failed)  │
    └────┬──────────────┘
         ▼
5. Reconstruct missing fragments using erasure coding
   (can tolerate up to 4 missing fragments with RS(10,4))
         │
         ▼
6. Assemble chunks into complete object data
         │
         ▼
7. Stream response to client with Content-Type, ETag,
   Content-Length headers from object_metadata
```

### DELETE Object

```
1. Client sends DELETE request: bucket_name, key
         │
         ▼
2. Check authorization
         │
    ┌────┴─────────────────┐
    │Versioning enabled?   │
    ├─Yes──────────────────┤
    │                      ▼
    │     INSERT delete marker as new version
    │     (data still accessible via version_id)
    │
    ├─No───────────────────┤
    │                      ▼
    │     Mark object_metadata as deleted
    │     (logical delete)
    └──────────┬───────────┘
               ▼
3. Return 204 No Content
         │
         ▼
4. Async garbage collector (background):
   - Find deleted/superseded objects
   - Delete data fragments from data nodes
   - Remove object_metadata entries
   - Reclaim storage
```

**Why erasure coding instead of triple replication?** Triple replication stores 3 copies = 3x storage overhead for 2-failure tolerance. RS(10,4) erasure coding stores 14 fragments of a 10-fragment object = 1.4x storage overhead for 4-failure tolerance. At exabyte scale, the difference between 3x and 1.4x overhead is enormous (petabytes of saved storage). The trade-off is CPU cost for encoding/decoding and slightly higher read latency (must read 10 fragments and decode vs. reading 1 replica).

**Why a write quorum instead of waiting for all fragments?** Waiting for all 14 data nodes to ACK would mean a single slow node delays the entire write. A quorum of 11 ensures sufficient durability (11 of 14 fragments stored) while tolerating 3 slow or temporarily unavailable nodes. The remaining fragments are repaired asynchronously by a background process.

**Why garbage collection instead of immediate deletion?** Immediate deletion would require synchronously contacting all data nodes holding fragments, which is slow and error-prone (some nodes may be temporarily unreachable). Marking metadata as deleted is instant and atomic. The async garbage collector handles actual data cleanup, retrying failed deletions and reclaiming storage in bulk.
