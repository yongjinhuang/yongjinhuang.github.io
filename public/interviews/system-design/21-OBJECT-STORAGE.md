# Design an Object Storage System (Amazon S3)

An object storage system provides durable, scalable, and highly available storage for arbitrary binary data. Amazon S3 is the canonical example, storing trillions of objects and handling millions of requests per second. This guide covers every major design decision from first principles.

---

## 1. Requirements Clarification

### 1.1 Functional Requirements

| Feature | Description |
|---------|-------------|
| **Bucket Management** | Create, delete, and list buckets; buckets are globally unique namespaces |
| **Object CRUD** | PUT, GET, DELETE objects identified by a bucket + key |
| **List Objects** | List objects in a bucket with prefix/delimiter filtering and pagination |
| **Multipart Upload** | Upload large objects (> 5 GB) in parallel parts |
| **Versioning** | Keep multiple versions of the same object key; delete markers |
| **Access Control** | Bucket policies, ACLs, IAM-based permissions |
| **Lifecycle Policies** | Automatically transition or expire objects based on age |
| **Pre-signed URLs** | Time-limited URLs for unauthenticated upload/download |
| **Cross-Region Replication** | Asynchronously replicate objects to another region |
| **Storage Classes** | Standard, Infrequent Access, Glacier/Archive tiers |
| **Data Integrity** | Checksums (MD5, CRC32) verified on upload and at rest |
| **Event Notifications** | Publish events (ObjectCreated, ObjectDeleted) to queues/lambdas |

### 1.2 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Durability** | 99.999999999% (11 nines) - at most 1 object lost per 100 billion |
| **Availability** | 99.99% (Standard class) / 99.9% (IA class) |
| **Throughput** | 100,000+ requests/sec per bucket prefix |
| **Object Size** | 1 byte to 5 TB per object |
| **First-byte Latency** | < 100 ms for Standard class |
| **Scalability** | Exabyte-scale total storage |
| **Consistency** | Read-after-write for new objects; strong consistency for all operations (modern S3 2020+) |
| **Security** | Encryption at rest (SSE-S3, SSE-KMS) and in transit (TLS) |

### 1.3 Scale Estimation

**Storage Scale**
- Objects stored: 1 trillion (10^12)
- Average object size: 1 MB
- Total storage: 1 PB = 10^15 bytes
- Storage growth: 10 PB/year

**Request Scale**
- 100,000 requests/sec at peak
- Read/write ratio: 70/30
- Reads: 70,000/sec
- Writes: 30,000/sec

**Bandwidth**
- Average object read size: 100 KB
- Read bandwidth: 70,000 × 100 KB = 7 GB/sec
- Write bandwidth: 30,000 × 100 KB = 3 GB/sec
- Total network I/O: ~10 GB/sec

**Metadata Scale**
- Each object has ~1 KB of metadata (bucket, key, size, ETag, timestamps, ACL, storage class)
- 1 trillion objects × 1 KB = 1 PB of metadata
- Metadata must be indexed for fast lookup: requires distributed DB with billions of rows

**Data Node Capacity**
- Each data node holds 100 TB (10 × 10 TB HDDs)
- For 100 PB of raw data: 1,000 data nodes
- With RS(10,4) erasure coding: 1,000 × 1.4 overhead = 1,400 physical nodes
- (vs 3,000 nodes for 3× replication)

---

## 2. API Design

### 2.1 Bucket Operations

```
PUT /                    Create bucket (bucket name in Host header)
DELETE /                 Delete bucket (must be empty)
GET /                    List buckets (for authenticated user)
GET /?lifecycle          Get lifecycle policy
PUT /?lifecycle          Set lifecycle policy
GET /?versioning         Get versioning status
PUT /?versioning         Enable/suspend versioning
GET /?replication        Get replication configuration
PUT /?replication        Set replication configuration
```

### 2.2 Object Operations

**Upload (PUT Object)**
```
PUT /{bucket}/{key}
Host: {bucket}.s3.amazonaws.com
Content-Length: 12345
Content-Type: image/jpeg
Content-MD5: rL0Y20zC+Fzt72VPzMSk2A==   (base64 of MD5)
x-amz-storage-class: STANDARD
x-amz-server-side-encryption: AES256
x-amz-meta-custom-field: value           (user-defined metadata)

<object bytes>

Response 200 OK:
ETag: "d41d8cd98f00b204e9800998ecf8427e"
x-amz-version-id: 3/L4kqtJlcpXroDTDmJ+rmSpXd3dIbrHY+MTRCxf3vjVBH40Nr8X8gdRQBpUMLUo
```

**Download (GET Object)**
```
GET /{bucket}/{key}
Host: {bucket}.s3.amazonaws.com
Range: bytes=0-1048575              (optional: range request)
If-None-Match: "etag..."            (optional: conditional get)

Response 200 OK (or 206 Partial Content for range):
Content-Length: 12345
Content-Type: image/jpeg
ETag: "d41d8cd98f00b204e9800998ecf8427e"
x-amz-version-id: ...

<object bytes>
```

**Delete (DELETE Object)**
```
DELETE /{bucket}/{key}
DELETE /{bucket}/{key}?versionId=xxx   (specific version)

Response 204 No Content
x-amz-version-id: ...                  (delete marker version ID if versioning enabled)
x-amz-delete-marker: true
```

**List Objects**
```
GET /{bucket}?list-type=2
  &prefix=images/2024/
  &delimiter=/
  &max-keys=1000
  &continuation-token=...

Response:
{
  "IsTruncated": false,
  "Contents": [
    { "Key": "images/2024/photo.jpg", "Size": 12345, "ETag": "...", "LastModified": "..." }
  ],
  "CommonPrefixes": [
    { "Prefix": "images/2024/01/" }   // virtual folders from delimiter
  ],
  "NextContinuationToken": "..."
}
```

### 2.3 Multipart Upload Protocol

```
Step 1 - Initiate:
POST /{bucket}/{key}?uploads
Response: { "UploadId": "VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5tMnRzIHVwbG9hZA" }

Step 2 - Upload Parts (parallel, each 5 MB - 5 GB):
PUT /{bucket}/{key}?partNumber=1&uploadId=xxx  -> ETag: "part1-etag"
PUT /{bucket}/{key}?partNumber=2&uploadId=xxx  -> ETag: "part2-etag"
PUT /{bucket}/{key}?partNumber=3&uploadId=xxx  -> ETag: "part3-etag"

Step 3 - Complete:
POST /{bucket}/{key}?uploadId=xxx
{
  "Parts": [
    { "PartNumber": 1, "ETag": "part1-etag" },
    { "PartNumber": 2, "ETag": "part2-etag" },
    { "PartNumber": 3, "ETag": "part3-etag" }
  ]
}
Response: { "Location": "...", "ETag": "final-combined-etag" }

Abort (cleanup on failure):
DELETE /{bucket}/{key}?uploadId=xxx
```

### 2.4 Pre-signed URLs

```
# Server generates:
GET https://{bucket}.s3.amazonaws.com/{key}
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKID/20240101/us-east-1/s3/aws4_request
  &X-Amz-Date=20240101T000000Z
  &X-Amz-Expires=3600
  &X-Amz-SignedHeaders=host
  &X-Amz-Signature=<HMAC-SHA256 of canonical request>

# Client uses this URL directly - no AWS credentials needed
# Pre-signed PUT URL allows direct upload to S3 from browser
```

---

## 3. Data Model

### 3.1 Bucket Metadata

```sql
-- Stored in a distributed SQL database (CockroachDB / Spanner style)
CREATE TABLE buckets (
    bucket_name     VARCHAR(63) PRIMARY KEY,     -- globally unique
    owner_account   VARCHAR(64) NOT NULL,
    region          VARCHAR(32) NOT NULL,
    creation_date   TIMESTAMP NOT NULL,
    versioning      ENUM('disabled','enabled','suspended') DEFAULT 'disabled',
    default_encryption VARCHAR(32),             -- 'AES256' or 'aws:kms'
    kms_key_id      VARCHAR(2048),
    acl             JSONB,                       -- canned ACL or full policy
    policy          JSONB,                       -- bucket policy (JSON)
    lifecycle       JSONB,                       -- lifecycle rules
    replication     JSONB,                       -- CRR configuration
    logging         JSONB,                       -- access logging config
    tags            JSONB,
    INDEX idx_owner (owner_account)
);
```

### 3.2 Object Metadata

```sql
-- Partitioned by (bucket_name, key) across metadata shards
-- Using consistent hashing to distribute hot buckets
CREATE TABLE object_metadata (
    bucket_name     VARCHAR(63) NOT NULL,
    key             VARCHAR(1024) NOT NULL,
    version_id      VARCHAR(32) NOT NULL DEFAULT 'null',  -- 'null' when versioning off
    is_delete_marker BOOLEAN DEFAULT FALSE,
    size            BIGINT,                      -- bytes
    etag            VARCHAR(64),                 -- MD5 or multipart ETag
    content_type    VARCHAR(256),
    content_encoding VARCHAR(64),
    storage_class   ENUM('STANDARD','IA','GLACIER','DEEP_ARCHIVE') DEFAULT 'STANDARD',
    last_modified   TIMESTAMP NOT NULL,
    expiration_date TIMESTAMP,                   -- set by lifecycle policy
    server_side_encryption VARCHAR(32),
    kms_key_id      VARCHAR(2048),
    user_metadata   JSONB,                       -- x-amz-meta-* headers
    checksum_crc32  VARCHAR(16),
    checksum_sha256 VARCHAR(64),
    -- Physical location pointer(s) for data
    data_location   JSONB,   -- { "nodes": [...], "chunk_map": [...] }
    part_count      INT,                         -- for multipart objects
    PRIMARY KEY (bucket_name, key, version_id),
    INDEX idx_bucket_prefix (bucket_name, key)   -- for LIST operations
);
```

### 3.3 In-Progress Multipart Uploads

```sql
CREATE TABLE multipart_uploads (
    upload_id       VARCHAR(64) PRIMARY KEY,
    bucket_name     VARCHAR(63) NOT NULL,
    key             VARCHAR(1024) NOT NULL,
    initiated_at    TIMESTAMP NOT NULL,
    storage_class   VARCHAR(32),
    metadata        JSONB,
    INDEX idx_bucket_key (bucket_name, key)
);

CREATE TABLE multipart_parts (
    upload_id       VARCHAR(64) NOT NULL,
    part_number     INT NOT NULL,               -- 1 to 10,000
    etag            VARCHAR(64),
    size            BIGINT,
    data_location   JSONB,
    uploaded_at     TIMESTAMP,
    PRIMARY KEY (upload_id, part_number),
    FOREIGN KEY (upload_id) REFERENCES multipart_uploads(upload_id)
);
```

### 3.4 ACL Model

```json
{
  "bucket": "my-bucket",
  "owner": "account-123",
  "grants": [
    { "grantee": { "type": "CanonicalUser", "id": "account-123" }, "permission": "FULL_CONTROL" },
    { "grantee": { "type": "Group", "uri": "http://acs.amazonaws.com/groups/global/AllUsers" }, "permission": "READ" }
  ],
  "policy": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::my-bucket/*"
      }
    ]
  }
}
```

---

## 4. High-Level Architecture

```
+------------------------------- Client ---------------------------------+
|  Web Browser / SDK / CLI                                               |
+------------------------------------------------------------------------+
          |                                           |
          | HTTPS                                     | HTTPS (pre-signed URL)
          v                                           v
+--------------------+                    +----------------------+
|   Load Balancer    |                    |  Transfer Accel Edge |
|  (Anycast / Route  |                    |  (CloudFront POP /   |
|   53 GeoDNS)       |                    |   AWS Global Accel)  |
+--------------------+                    +----------------------+
          |                                           |
          v                                           v
+------------------------------------------------------------------+
|                        API Gateway Layer                         |
|  +----------------+  +----------------+  +------------------+   |
|  | Auth / AuthZ   |  | Rate Limiter   |  |  Request Router  |   |
|  | (SigV4 verify) |  | (token bucket) |  |  (bucket -> shard|   |
|  +----------------+  +----------------+  +------------------+   |
+------------------------------------------------------------------+
          |                           |
          | metadata ops              | data ops
          v                           v
+---------------------+    +---------------------------+
|   Metadata Service  |    |       Data Service        |
|  +---------------+  |    |  +--------------------+   |
|  | Metadata DB   |  |    |  | Data Node Manager  |   |
|  | (sharded,     |  |    |  +--------------------+   |
|  |  consistent   |  |    |  | Erasure Coding Svc |   |
|  |  hashing)     |  |    |  +--------------------+   |
|  +---------------+  |    |  | Replication Ctrl   |   |
|  | Version Store |  |    |  +--------------------+   |
|  +---------------+  |    +---------------------------+
|  | Namespace Svc |  |              |
|  +---------------+  |    +---------+---------+
+---------------------+    |                   |
                           v                   v
                  +----------------+  +----------------+
                  |  Data Node 1   |  |  Data Node N   |
                  |  (10 TB HDDs)  |  |  (10 TB HDDs)  |
                  |  chunk store   |  |  chunk store   |
                  +----------------+  +----------------+

Supporting Services:
+------------------+  +------------------+  +------------------+
| Garbage Collector|  |  Scrubbing Svc   |  |  Lifecycle Svc   |
| (async delete    |  |  (bitrot detect) |  |  (expire/tier)   |
|  orphaned chunks)|  |                  |  |                  |
+------------------+  +------------------+  +------------------+
+------------------+  +------------------+
|  Event Bus       |  |  CRR Replicator  |
|  (SNS/SQS/Lambda)|  |  (cross-region)  |
+------------------+  +------------------+
```

---

## 5. Deep Dive: Storage Types Comparison

### Object vs Block vs File Storage

| Dimension | Object Storage (S3) | Block Storage (EBS) | File Storage (EFS/NFS) |
|-----------|---------------------|---------------------|------------------------|
| **Access Pattern** | REST API (HTTP GET/PUT) | Raw disk I/O (iSCSI/NVMe) | POSIX filesystem (read/write/seek) |
| **Granularity** | Whole object (immutable) | Fixed-size blocks (512B-4KB) | Files and directories |
| **Update Semantics** | Full replace; no in-place edit | Random read/write | Byte-range read/write |
| **Namespace** | Flat key within bucket | Block address offset | Hierarchical path |
| **Scalability** | Exabytes, virtually unlimited | Terabytes per volume | Petabytes (distributed NFS) |
| **Durability** | 99.999999999% | 99.999% (with snapshots) | 99.999999999% (EFS) |
| **Latency** | ms (100ms first byte) | us (< 1ms) | ms (1-10ms) |
| **Use Cases** | Backups, media, data lake, static web | Databases, OS volumes, VMs | Shared file access, ML training data |
| **Metadata** | Rich user-defined metadata | Minimal (block metadata only) | POSIX file attributes |

**Key insight**: Object storage sacrifices random-write ability and low latency in exchange for massive scalability, high durability, and a simple HTTP API. This is the fundamental trade-off.

---

## 6. Deep Dive: Data Plane - How Objects Are Stored

### 6.1 Write Path

```
Client                API Gateway         Metadata Svc       Data Nodes
  |                        |                   |                  |
  |-- PUT /bucket/key ---> |                   |                  |
  |   (with body)          |                   |                  |
  |                        |-- AuthZ check ---> |                  |
  |                        |<-- OK + quota ---- |                  |
  |                        |                   |                  |
  |                        |-- pick placement --+                  |
  |                        |   (consistent hash on bucket+key)    |
  |                        |                                      |
  |                        |-- stream chunks --> Data Node 1      |
  |                        |-- stream chunks --> Data Node 5      |
  |                        |-- stream chunks --> Data Node 9      |
  |                        |   (EC shards written in parallel)    |
  |                        |                                      |
  |                        |<---------- acks from all nodes ------+
  |                        |                   |                  |
  |                        |-- write metadata -+                  |
  |                        |   (location, ETag, size, version)   |
  |                        |<-- metadata committed -----------    |
  |                        |                                      |
  |<-- 200 OK + ETag --    |                                      |
```

**Chunking large objects**:
- Objects > 64 MB are split into 64 MB chunks
- Each chunk is independently erasure-coded
- Chunk manifest stored in metadata: `[chunk0_location, chunk1_location, ...]`
- Enables parallel reads (range requests) and parallel writes

### 6.2 Read Path

```
Client                API Gateway         Metadata Svc       Data Nodes
  |                        |                   |                  |
  |-- GET /bucket/key ---> |                   |                  |
  |                        |-- lookup -------> |                  |
  |                        |<-- location map --+                  |
  |                        |   { nodes: [1,5,9,...], chunk_map }  |
  |                        |                                      |
  |                        |-- read from Data Node 1 (primary) -->|
  |                        |<-- chunk data ----------------------- |
  |                        |   (reconstruct from k shards if needed)
  |                        |                                      |
  |<-- stream response --- |                                      |
```

**Range request optimization**:
- `GET /bucket/key` with `Range: bytes=5000000-10000000`
- API layer translates byte range to specific chunks
- Only fetch the relevant chunks, not the whole object
- Critical for video streaming and large archive access

### 6.3 Data Node Internal Structure

```
Data Node
+---------------------------------------------------+
|  Chunk Store                                      |
|  +---------------------------------------------+ |
|  | chunk_id  -> file location on local disk    | |
|  |   e.g., /data/vol3/ab/cd/abcd1234.chunk     | |
|  +---------------------------------------------+ |
|                                                   |
|  Local Index (RocksDB / LevelDB)                  |
|  +---------------------------------------------+ |
|  | chunk_id -> { offset, size, checksum }      | |
|  +---------------------------------------------+ |
|                                                   |
|  Write-Ahead Log (WAL)                            |
|  (ensures durability before ack)                  |
|                                                   |
|  Disk Layout: 10 x 10TB HDDs, JBOD               |
|  (No RAID; EC replaces RAID for durability)       |
+---------------------------------------------------+
```

---

## 7. Deep Dive: Erasure Coding

### 7.1 What is Erasure Coding?

Erasure coding is a forward error-correction technique that splits data into `k` data shards and `m` parity shards, such that any `k` of the `k+m` shards can reconstruct the original data.

**S3-style RS(10,4)** - Reed-Solomon with 10 data shards, 4 parity shards:

```
Original object: 100 MB

Split into 10 data shards:        d0  d1  d2  d3  d4  d5  d6  d7  d8  d9
                                  10MB each

Compute 4 parity shards (XOR-like): p0  p1  p2  p3
                                    10MB each

14 shards total, each 10MB, stored on 14 DIFFERENT nodes or disks
+----+----+----+----+----+----+----+----+----+----++----+----+----+----+
| d0 | d1 | d2 | d3 | d4 | d5 | d6 | d7 | d8 | d9 || p0 | p1 | p2 | p3 |
+----+----+----+----+----+----+----+----+----+----++----+----+----+----+
 N1   N2   N3   N4   N5   N6   N7   N8   N9  N10   N11  N12  N13  N14

- Tolerate ANY 4 node failures and still reconstruct the data
- Storage overhead: 14/10 = 1.4x
- Compare to 3x replication: 3.0x overhead
```

### 7.2 Storage Efficiency Comparison

| Method | Overhead | Fault Tolerance | Rebuild Cost | CPU Cost |
|--------|----------|-----------------|--------------|----------|
| No redundancy | 1.0x | 0 failures | N/A | None |
| 3x Replication | 3.0x | 2 failures (any) | Copy 1 replica | Low |
| RS(6,3) | 1.5x | 3 failures | Reconstruct from 6 | Medium |
| RS(10,4) | 1.4x | 4 failures | Reconstruct from 10 | High |
| RS(14,2) | 1.14x | 2 failures | Reconstruct from 14 | Higher |

**S3 uses RS(10,4) within an availability zone** + geographic replication across AZs.

### 7.3 Reed-Solomon Math (Simplified)

```
Data shards:   [d0, d1, d2, ..., d9]  as GF(2^8) field elements

Generator matrix G:  (14 x 10)
[  I_10  ]   <- identity matrix: data shards pass through unchanged
[ P_4x10 ]   <- Vandermonde-based parity matrix

Parity shards = P_4x10 * [d0..d9]^T

Reconstruction: if 4 shards lost, build 10x10 submatrix from surviving rows,
invert it (Gaussian elimination in GF(2^8)), multiply by known shards.
```

### 7.4 Shard Placement Policy

```
To tolerate AZ failure AND rack failure:

Shard placement for RS(10,4), 3 AZs:
AZ-1: d0, d1, d2, d3, p0   (5 shards across 5 different racks)
AZ-2: d4, d5, d6, d7, p1   (5 shards across 5 different racks)
AZ-3: d8, d9, p2, p3        (4 shards across 4 different racks)

Can lose entire AZ-3 (4 shards) and still reconstruct from AZ-1 + AZ-2 (10 shards).
```

---

## 8. Deep Dive: Metadata Service

### 8.1 Namespace Management

The metadata service is responsible for:
1. **Object namespace**: mapping `(bucket, key, version) -> physical location`
2. **Bucket namespace**: global uniqueness of bucket names
3. **Listing**: efficient prefix-based enumeration of keys

### 8.2 Sharding Strategy

```
Metadata is sharded using consistent hashing on (bucket_name + key):

+----------+  +----------+  +----------+  +----------+
| Shard 0  |  | Shard 1  |  | Shard 2  |  | Shard N  |
| hash 0-  |  | hash 25- |  | hash 50- |  | hash 75- |
| 24%      |  | 49%      |  | 74%      |  | 99%      |
+----------+  +----------+  +----------+  +----------+

Virtual nodes (vnodes): each physical shard owns 150 virtual nodes on ring
-> smooth redistribution when shards are added/removed

Hot key problem: "s3://hot-bucket/popular-key" -> always same shard
Solution: Add random suffix for listing; or shard by (bucket, hash(key) % num_partitions)
```

### 8.3 Consistency: Read-After-Write

**Classic S3 (pre-2020)**: eventual consistency for overwrite PUT and DELETE
- Reason: distributed metadata with caching layers; stale reads possible

**Modern S3 (Dec 2020+)**: strong read-after-write consistency for all operations
- Implemented via: fencing tokens / conditional writes with version checks
- Every write increments a monotonic version; reads refuse to serve stale version

```
Strong consistency mechanism:
PUT /bucket/key          -> write version V5 to metadata shard leader
                        -> replicate to followers
GET /bucket/key          -> read from leader OR follower with V >= V5
                        -> if follower is behind, forward to leader
                        -> guaranteed to see V5 or later
```

### 8.4 Metadata Caching

```
+-------------------+
|   API Gateway     |
|                   |
| Metadata Cache    |   TTL: 1 second for mutable metadata
| (in-process)      |   TTL: 60 seconds for bucket config
+-------------------+
         |
         | cache miss
         v
+-------------------+
|  Metadata Service |
|  (leader shard)   |   Linearizable reads from Raft leader
+-------------------+
         |
         | Raft replication
         v
+-------------------+
|  Metadata Follower|   Can serve stale reads with version check
+-------------------+
```

---

## 9. Deep Dive: Consistency Model

### 9.1 Consistency Guarantees (Modern S3)

| Operation | Consistency Guarantee |
|-----------|----------------------|
| PUT new object | Read-after-write: immediately visible |
| PUT overwrite | Strong consistency: latest version always returned |
| DELETE object | Strong consistency: object not visible after DELETE completes |
| LIST after PUT | List reflects the new object |
| LIST after DELETE | List does not include deleted object |
| Concurrent PUTs (same key) | Last-writer-wins by wall clock; both writes acknowledged |

### 9.2 How Strong Consistency is Achieved

```
Metadata write path uses 2-phase commit:
1. Write to metadata leader (Raft group) -> get version V
2. Data is written to data nodes (acknowledged)
3. Metadata is committed with pointer to data
4. Read returns version V or newer

Read protocol:
1. Read from metadata leader
2. Leader holds a "read lock" until log is applied up to its last committed entry
3. No stale reads possible from leader

For followers (if reads are served from follower):
- Follower checks: "is my applied version >= this object's write version?"
- If not, redirect to leader (or wait for catch-up)
```

### 9.3 Concurrent Write Conflict Resolution

```
T1: PUT /bucket/key (writer A, arrives at t=100ms) -> ETag: "aaa"
T2: PUT /bucket/key (writer B, arrives at t=101ms) -> ETag: "bbb"

Both acknowledged. Last write wins (t=101ms):
- GET /bucket/key returns ETag "bbb"
- But if using versioning:
  - Both versions stored: version-id-1 (ETag "aaa"), version-id-2 (ETag "bbb")
  - GET returns latest (version-id-2)
  - GET?versionId=version-id-1 returns version "aaa"
```

---

## 10. Deep Dive: Versioning

### 10.1 Version-Enabled Buckets

```
Bucket: my-bucket (versioning: enabled)

Object: my-bucket/photo.jpg

Timeline:
t=1: PUT photo.jpg (v1)   -> version-id: abc123,  is_latest: true
t=2: PUT photo.jpg (v2)   -> version-id: def456,  is_latest: true  (abc123 is_latest: false)
t=3: DELETE photo.jpg     -> version-id: ghi789,  is_delete_marker: true, is_latest: true

Metadata table state:
+------------------+----------+---------+--------------------+-----------+
| key              | ver_id   | is_del  | is_latest          | data_loc  |
+------------------+----------+---------+--------------------+-----------+
| photo.jpg        | ghi789   | TRUE    | TRUE               | NULL      |
| photo.jpg        | def456   | FALSE   | FALSE              | node:xyz  |
| photo.jpg        | abc123   | FALSE   | FALSE              | node:abc  |
+------------------+----------+---------+--------------------+-----------+

GET photo.jpg               -> 404 (current version is delete marker)
GET photo.jpg?versionId=def456 -> 200, returns v2 content
DELETE photo.jpg?versionId=ghi789 -> removes delete marker, restores access
```

### 10.2 Version Storage Overhead

```
Strategy: Each version is a full copy of the object data.
- Storage cost grows linearly with versions
- Lifecycle policy: expire noncurrent versions after N days
- MFA Delete: require MFA to permanently delete versions (for compliance)
```

---

## 11. Deep Dive: Lifecycle Policies

### 11.1 Transition Rules

```json
{
  "Rules": [
    {
      "ID": "archive-old-objects",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
```

### 11.2 Lifecycle Service Implementation

```
Lifecycle Daemon (runs daily):

1. Scan metadata DB for objects where:
   - (CURRENT_TIME - last_modified) > transition_threshold AND
   - storage_class != target_class

2. For each eligible object:
   a. Read data from current storage tier
   b. Write to new storage tier (e.g., Glacier = tape or cold HDD pool)
   c. Update metadata: storage_class = 'GLACIER', data_location = new_ptr
   d. Optionally delete from old tier after verification

3. Expiration: set expiration_date in metadata; GC picks these up

Performance: Process 10M objects/day = 115 objects/sec (batch processing)
```

### 11.3 Storage Classes

| Class | Min Duration | Min Size | Retrieval Time | Use Case |
|-------|-------------|---------|----------------|----------|
| STANDARD | None | None | ms | Frequently accessed data |
| STANDARD_IA | 30 days | 128 KB | ms | Monthly access, cost-sensitive |
| ONE_ZONE_IA | 30 days | 128 KB | ms | Reproducible data, single AZ |
| INTELLIGENT_TIERING | None | None | ms / hours | Unknown access patterns |
| GLACIER_INSTANT | 90 days | 128 KB | ms | Archive with instant retrieval |
| GLACIER_FLEXIBLE | 90 days | 40 KB | minutes-hours | Archive |
| GLACIER_DEEP_ARCHIVE | 180 days | 40 KB | 12-48 hours | Long-term compliance |

---

## 12. Deep Dive: Pre-signed URLs

### 12.1 How Pre-signed URLs Work

```
Architecture:
+--------+    request presigned URL     +----------+
| Client | ---------------------------> | App      |
|        |                             | Server   |
|        | <-- presigned URL --------- |          |
|        |                             | (has IAM |
|        |                             |  creds)  |
+--------+                             +----------+
    |
    | PUT/GET directly (no proxy through app server)
    v
+--------+
|   S3   |
+--------+

Benefits:
- Offload bandwidth from app server
- Time-limited access (1s to 7 days)
- No credentials exposed to client
- Works for both upload and download
```

### 12.2 Pre-signed URL Generation (Server-Side)

```python
import hmac, hashlib, urllib.parse, datetime

def generate_presigned_url(bucket, key, method, expires_seconds, secret_key, access_key, region):
    now = datetime.datetime.utcnow()
    date_str = now.strftime('%Y%m%d')
    datetime_str = now.strftime('%Y%m%dT%H%M%SZ')

    credential_scope = f"{date_str}/{region}/s3/aws4_request"
    credential = f"{access_key}/{credential_scope}"

    canonical_querystring = (
        f"X-Amz-Algorithm=AWS4-HMAC-SHA256"
        f"&X-Amz-Credential={urllib.parse.quote(credential, safe='')}"
        f"&X-Amz-Date={datetime_str}"
        f"&X-Amz-Expires={expires_seconds}"
        f"&X-Amz-SignedHeaders=host"
    )

    canonical_request = (
        f"{method}\n/{bucket}/{key}\n{canonical_querystring}\n"
        f"host:{bucket}.s3.amazonaws.com\n\nhost\nUNSIGNED-PAYLOAD"
    )

    string_to_sign = (
        f"AWS4-HMAC-SHA256\n{datetime_str}\n{credential_scope}\n"
        + hashlib.sha256(canonical_request.encode()).hexdigest()
    )

    signing_key = hmac.new(
        hmac.new(hmac.new(hmac.new(
            f"AWS4{secret_key}".encode(), date_str.encode(), hashlib.sha256).digest(),
            region.encode(), hashlib.sha256).digest(),
            b"s3", hashlib.sha256).digest(),
        b"aws4_request", hashlib.sha256).digest()

    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    return (f"https://{bucket}.s3.amazonaws.com/{key}"
            f"?{canonical_querystring}&X-Amz-Signature={signature}")
```

---

## 13. Deep Dive: Cross-Region Replication

### 13.1 CRR Architecture

```
Source Region (us-east-1)          Destination Region (eu-west-1)
+------------------------+         +------------------------+
|  PUT /bucket/key       |         |  Destination Bucket    |
|         |              |         |                        |
|   API Gateway          |         |   API Gateway          |
|         |              |         |         ^              |
|   Metadata Svc         |         |   Metadata Svc         |
|   (writes change log)  |         |         |              |
|         |              |         |         |              |
|   Replication Log      |         |         |              |
|   (Kinesis / WAL)      |         |         |              |
|         |              |         |         |              |
|   CRR Worker +---------+---------+-> PUT with same key    |
|   (reads log,|         |  VPN/   |   and version-id       |
|    replicates)|        | TLS     |                        |
+------------------------+         +------------------------+

Replication guarantees:
- Asynchronous (no impact on source PUT latency)
- Order preserved per key (sequence number in log)
- At-least-once delivery; idempotent destination writes
- RTO: typically < 15 minutes; replication time control (RTC) for SLA
```

### 13.2 CRR Configuration

```json
{
  "ReplicationConfiguration": {
    "Role": "arn:aws:iam::account:role/replication-role",
    "Rules": [
      {
        "Status": "Enabled",
        "Filter": { "Prefix": "critical/" },
        "Destination": {
          "Bucket": "arn:aws:s3:::backup-bucket-eu",
          "ReplicationTime": { "Status": "Enabled", "Time": { "Minutes": 15 } },
          "Metrics": { "Status": "Enabled" },
          "StorageClass": "STANDARD_IA"
        },
        "DeleteMarkerReplication": { "Status": "Enabled" }
      }
    ]
  }
}
```

---

## 14. Deep Dive: Data Integrity

### 14.1 Checksum Strategy

```
Write path checksums:
1. Client computes MD5 (or CRC32C/SHA256) and sends in Content-MD5 header
2. API layer computes MD5 of received bytes, compares to header
3. If mismatch: 400 Bad Request (client retry)
4. If match: store ETag = MD5 in metadata

Each EC shard also has its own CRC32C checksum:
+----------+----------+
| shard    | CRC32C   |
| data     | checksum |
+----------+----------+
On read: verify CRC32C before returning shard to EC decoder
```

### 14.2 Bitrot Detection (Scrubbing)

```
Bitrot: silent data corruption on disk (cosmic rays, aging HDDs)
Detection strategy: periodic background scrubbing

Scrubbing Daemon (per data node):
1. Every 24-48 hours, read every stored chunk
2. Recompute checksum, compare to stored checksum
3. On mismatch:
   a. Log the corrupted chunk ID
   b. Notify data node manager
   c. Reconstruct from EC parity on other nodes
   d. Overwrite corrupted chunk with correct data
   e. Increment corruption counter metric

Rate limiting: scrub at 50 MB/sec per node (stays under disk IOPS budget)
Full scrub cycle: 100 TB / 50 MB/s = ~23 days per node
```

### 14.3 Achieving 11 Nines Durability

```
Durability calculation for RS(10,4) across 3 AZs:

Assumptions:
- Annual disk failure rate: 0.5% (MTTF = 200 years)
- Annual bit error rate: 1 per 10^15 bits read
- 14 disks per object (RS shards)
- Can tolerate any 4 disk failures

P(single disk failure in 1 year) = 0.005
P(>4 disks fail out of 14 in 1 year) = C(14,5) * 0.005^5 * 0.995^9
                                      ≈ 2002 * 3.1e-11 * 0.956 ≈ 6e-8

P(data loss per object per year) ≈ 1e-10 (10^-10)
= 99.9999999% durability per object per year

With additional geographic replication (3 AZs):
P(data loss) ≈ (1e-10)^3 ≈ 1e-30 (well beyond 11 nines)

S3's claim of 99.999999999% (11 nines) is conservative and backed by:
1. RS erasure coding within AZ
2. Geographic replication across AZs
3. Continuous bitrot scrubbing
4. End-to-end checksums on every read/write
```

---

## 15. Deep Dive: Garbage Collection

### 15.1 Why GC is Needed

Objects are deleted lazily to maintain performance:
- DELETE request: marks metadata as deleted, does NOT immediately free data nodes
- Overwrite: old data chunks become orphaned when new version is committed
- Multipart abort: uploaded parts need cleanup

### 15.2 GC Algorithm

```
Garbage Collection Service:

Phase 1 - Mark (identify garbage):
1. Scan metadata DB for:
   - Objects with deletion_time set (soft delete)
   - Old versions past retention period
   - Aborted multipart uploads (upload_id not in active table)
2. Build list of chunk_ids to delete

Phase 2 - Sweep (free data nodes):
1. For each chunk_id:
   a. Remove chunk file from data node
   b. Update local index on data node (remove entry)
   c. Mark chunk_id as freed in metadata
2. Update storage quota for bucket/account

Safeguards:
- Only delete chunks NOT referenced by any live object version
- Use reference counting or epoch-based deletion to avoid TOCTOU
- Chunk deletion is idempotent (safe to retry)

GC frequency: run every 24 hours or when free space < 20%
GC lag: deleted data may persist up to 24h (acceptable, not a durability issue)
```

### 15.3 Tombstone Propagation

```
For eventual consistency (classic S3):

PUT /bucket/key at t=0  -> metadata shard A, data nodes 1,2,3
DELETE /bucket/key at t=1 -> metadata shard A writes tombstone
GET /bucket/key at t=2   -> metadata shard B (replica) may not have tombstone yet
                          -> returns stale data for up to T seconds (T = replication lag)

Modern S3 strong consistency:
- All reads go through metadata leader or version-checked follower
- Tombstone committed to Raft log before DELETE returns 204
- No stale reads possible
```

---

## 16. Scaling Strategy

### 16.1 Metadata Scaling

```
Challenge: 1 trillion objects, 1 KB metadata each = 1 PB of metadata

Solution: Multi-level sharding

Level 1: Bucket sharding
- Each bucket is a separate namespace
- Different buckets land on different metadata shards

Level 2: Key sharding within bucket
- Hash(bucket+key) % num_shards determines the shard
- 1000 shards x 1 TB each = 1 PB metadata capacity
- Add shards by splitting: each split doubles capacity

Level 3: Caching
- Hot metadata (recently accessed objects): in-memory LRU cache
- Reduces metadata DB load by 90%+ for popular objects

Level 4: Read replicas
- Each shard has 3-5 read replicas for high availability
- Reads distributed across replicas (with version check)
```

### 16.2 Data Node Scaling

```
Horizontal scaling: add nodes to the cluster

Consistent hashing ring for data node selection:
- New objects assigned to nodes with available capacity
- Rebalancing is gradual: migrate 1-2% of data per hour per new node

Capacity planning:
- Current: 1,400 data nodes x 100 TB = 140 PB (with RS overhead)
- Add 100 nodes/quarter as data grows
- Automation: when cluster utilization > 70%, trigger auto-scaling

Multi-rack and multi-AZ placement:
- EC shards spread across racks (fault domain isolation)
- Cross-AZ replication for geo-redundancy
```

### 16.3 API Layer Scaling

```
API Gateway: stateless, scale horizontally

Load balancing:
- GeoDNS: route to nearest regional endpoint
- Anycast IP: network-level routing to nearest PoP
- L7 LB: distribute within region across API servers

Throttling:
- Per-bucket: default 5,500 PUT/sec, 5,500 GET/sec per prefix
- Randomize key prefixes to spread load: add hash prefix
  e.g., "2024/01/photo.jpg" -> "a3b1/2024/01/photo.jpg"

Request queuing:
- Sudden spike: admission queue absorbs burst
- Priority: reads > writes (reads are user-facing, writes can buffer)
```

### 16.4 Multipart Upload Scalability

```
Large object upload (5 TB file, 5 GB parts, 1000 parts):

Upload throughput per part: 500 MB/s (fast network)
Sequential upload: 1000 parts x 10s/part = 10,000 seconds (~2.8 hours)
Parallel upload (10 concurrent): ~280 seconds (under 5 minutes)

Part storage: each part stored independently on data nodes
Assembly: "complete multipart" operation just updates metadata with part pointers
No data movement at assembly time: metadata-only operation in O(1)
```

---

## 17. Cost Optimization

### 17.1 Storage Efficiency

| Strategy | Savings |
|----------|---------|
| Erasure coding RS(10,4) vs 3x replication | 53% less storage cost |
| Deduplication at chunk level | 10-30% for backup workloads |
| Compression (zstd) for compressible data | 2-5x for logs, JSON |
| Intelligent-Tiering auto-classification | 30-50% for mixed-access data |
| Lifecycle policies to Glacier | 80% cost reduction for archival |

### 17.2 Compute Efficiency

```
Hot path (frequent small objects):
- In-memory metadata cache: reduce metadata DB queries by 90%
- Connection pooling: reuse connections to data nodes
- Zero-copy sendfile: kernel bypass for data reads (no userspace copy)

Cold path (rare large objects):
- Batch GC: amortize GC overhead over many objects
- Scrubbing at off-peak hours: reduce I/O contention
- Tiered storage: automatically move to cheap HDD/tape for cold data
```

### 17.3 Network Optimization

```
Data transfer cost reduction:
- Transfer Acceleration: use AWS backbone instead of public internet
- VPC Endpoints: keep traffic within AWS network (no egress charges)
- CloudFront CDN: cache popular objects at edge (99% cache hit = 99% egress savings)
- S3 Select: server-side query pushdown (only return matching rows from CSV/JSON)
  Client receives 10 KB instead of 10 MB: 99.9% bandwidth savings for analytics

Request optimization:
- Conditional GETs (If-None-Match): return 304 Not Modified if ETag matches
  (eliminates data transfer for unchanged objects)
```

---

## 18. Trade-offs

### 18.1 Consistency vs Availability

| Choice | Trade-off |
|--------|-----------|
| **Strong consistency (modern S3)** | Slightly higher latency (leader round trip); leader unavailability causes read errors |
| **Eventual consistency (classic S3)** | Lower latency; stale reads possible after write/delete; split-brain scenarios |

**Decision**: Modern S3 chose strong consistency because users' biggest pain point was cache invalidation bugs, not the microseconds of extra latency.

### 18.2 Erasure Coding vs Replication

| Trade-off | Erasure Coding (RS) | 3x Replication |
|-----------|---------------------|----------------|
| Storage overhead | 1.4x | 3.0x |
| Read latency | Higher (need k shards + EC decode) | Lower (read 1 replica) |
| Write latency | Higher (compute parity + write 14 nodes) | Lower (write 3 nodes) |
| Rebuild time | Longer (network-intensive reconstruction) | Faster (simple copy) |
| Small object cost | Inefficient (100B object → 14 x 100B shards) | More efficient |

**S3's actual approach**: Use 3x replication for small objects (< some threshold); erasure coding for large objects. Also replication across AZs, EC within AZ.

### 18.3 Metadata Architecture

| Approach | Pros | Cons |
|----------|------|------|
| **Relational DB (sharded)** | ACID, SQL queries, familiar | Hard to scale horizontally |
| **Distributed KV store** | Scales easily, fast point lookups | No range scans, weak consistency options |
| **Wide-column (Cassandra)** | Range scans on keys, tunable consistency | Complex operations, eventual consistency by default |
| **Dedicated metadata DB (custom)** | Optimized for object storage workload | High engineering cost |

**S3 approach**: Custom distributed metadata service with Raft consensus, optimized for the (bucket, key, version) access pattern.

### 18.4 Synchronous vs Asynchronous Replication

| Replication Mode | Durability | Write Latency | Use Case |
|-----------------|------------|---------------|----------|
| Synchronous (all AZs before ack) | Highest | ~50-100ms extra | Financial records |
| Synchronous (2 of 3 AZs) | High | ~10-20ms extra | Standard data |
| Asynchronous (ack after 1 AZ, replicate later) | Eventual | Minimal | High-throughput ingest |

**S3 Standard**: Synchronous write to 3 AZs before 200 OK. This is why durability is 11 nines.

---

## 19. Common Interview Follow-ups

### Q1: How does S3 handle a data node failure during a write?

```
Scenario: Client PUTs an object; data node N5 crashes mid-write.

Protocol:
1. API gateway streams data to 14 EC nodes in parallel
2. Node N5 fails (connection reset/timeout)
3. Write coordinator detects failure:
   a. If < 4 nodes failed: continue, choose replacement node N15
   b. Restream the N5 shard to N15
   c. If all 14 acks received: proceed to metadata write
4. If > 4 nodes fail simultaneously: abort write, return 503 to client
5. Client retries (with exponential backoff)

Client sees: transparent retry; eventual success once cluster stabilizes
```

### Q2: How do you implement bucket-level rate limiting?

```
Token Bucket per bucket prefix:

+------------------+     +------------------+     +------------------+
| Prefix: "img/"   |     | Prefix: "logs/"  |     | Prefix: "data/"  |
| Tokens: 5500/s   |     | Tokens: 5500/s   |     | Tokens: 5500/s   |
| Refill: 5500/s   |     | Refill: 5500/s   |     | Refill: 5500/s   |
+------------------+     +------------------+     +------------------+

Implementation: Redis with Lua script (atomic decrement)
- Key: "bucket:{name}:prefix:{prefix}:tokens"
- On each request: DECR tokens; if tokens < 0, return 503 SlowDown
- Background job: periodically refill tokens

Guidance to users: randomize key prefix with hash to spread across 5500 prefixes
each prefix gets 5500 req/sec -> total: 5500 * 5500 = 30M req/sec per bucket
```

### Q3: How does versioning affect storage costs?

```
Problem: Versioning stores all previous versions indefinitely.

Example: log file updated every minute for 1 year
  -> 525,600 versions of same key
  -> each 1 MB -> 525 GB for one key!

Mitigations:
1. NoncurrentVersionExpiration lifecycle rule: delete versions older than 30 days
2. AbortIncompleteMultipartUpload: clean up stale multipart uploads
3. Object Lock (WORM): prevents accidental deletion but not accumulation
4. Cost monitoring: S3 Storage Lens shows version overhead per bucket

Best practice: enable versioning + lifecycle together
```

### Q4: How would you design the LIST operation for 1 billion keys?

```
Problem: LIST /bucket with prefix "2024/" when bucket has 1B keys.

Naive: scan all metadata rows for bucket -> O(N) scan -> too slow

Solution: B-tree or LSM-tree index on (bucket, key) in metadata DB

+-----------+---------+---------+
| bucket    | key     | ver_id  |  <- sorted by (bucket, key)
+-----------+---------+---------+
| my-bucket | 2024/01 | v1      |
| my-bucket | 2024/02 | v1      |
| my-bucket | 2024/03 | v1      |
| my-bucket | 2025/01 | v1      |
+-----------+---------+---------+

Range scan: SELECT * FROM metadata WHERE bucket='my-bucket' AND key >= '2024/' AND key < '2025/' LIMIT 1000

Pagination: cursor-based (continuation token = last returned key)
Virtualization of folders (delimiter='/'): in-memory grouping of keys by delimiter
Performance: O(log N) seek + O(results) scan

Scaling: if 1B keys across 1000 shards, each shard has 1M keys
  -> LIST fans out to relevant shards (by prefix range)
  -> Merge-sort results
```

### Q5: How do you handle a "hot" key (thundering herd)?

```
Scenario: celebrity tweets a link -> 10M clients GET /bucket/key simultaneously

Solutions:

1. CloudFront CDN (primary mitigation):
   - Cache popular objects at edge PoPs worldwide
   - 10M requests served by CDN, 0 reach S3 origin
   - Cache-Control: public, max-age=3600 set by application

2. Request coalescing at API gateway:
   - If same key in flight: collapse concurrent requests into 1 backend fetch
   - Broadcast result to all waiters
   - "Collapse" reduces backend fan-in

3. Read replicas for hot objects:
   - Data node manager detects hot chunk_id (> 10K req/sec)
   - Automatically creates temporary extra replicas on new nodes
   - Load balance reads across all replicas

4. S3 prefix randomization:
   - Inject hash prefix: "a1b2/popular-object.jpg"
   - Distribute load across multiple metadata shards
```

### Q6: How does S3 achieve low latency for large objects?

```
Techniques:

1. Parallel chunk reads:
   GET /bucket/file.mp4 (10 GB)
   -> Metadata lookup: 14 chunks, each 64 MB on different nodes
   -> Fetch chunks in parallel from all nodes
   -> Stream to client as chunks arrive (pipeline)

2. TCP connection to data nodes:
   - Persistent connections (keep-alive) from API tier to data nodes
   - Reduces connection setup overhead

3. Network proximity:
   - Transfer Acceleration uses AWS global network (fiber backbone)
   - Edge PoPs accept upload/download, route over AWS backbone to region

4. Byte-range reads:
   - S3 Select for column-oriented data: push down predicate to storage
   - Only read relevant columns from Parquet/CSV

5. Read-ahead:
   - Data node prefetches next chunk as current chunk is being sent
   - Eliminates disk seek latency for sequential reads
```

### Q7: How would you add server-side encryption?

```
Encryption hierarchy:

Data Encryption Key (DEK):
- Unique per object (or per chunk for large objects)
- AES-256-GCM symmetric key
- Generated randomly at write time

Key Encryption Key (KEK):
- Per-bucket or per-account
- Stored in AWS KMS (Hardware Security Module)
- SSE-S3: AWS manages KEK
- SSE-KMS: Customer chooses KMS key (audit trail, cross-account)
- SSE-C: Customer provides KEK in request header

Write path encryption:
1. Generate DEK
2. Encrypt object data with DEK (in memory, before writing to disk)
3. Encrypt DEK with KEK (call KMS)
4. Store encrypted DEK in object metadata
5. Discard plaintext DEK

Read path decryption:
1. Fetch encrypted DEK from metadata
2. Decrypt DEK via KMS (audit log entry created)
3. Decrypt object data with DEK (in memory, after reading from disk)
4. Stream plaintext to client over TLS

HSM cost: KMS call per object read/write (~$0.03 per 10,000 API calls)
Caching DEK for large objects (multiple chunks): reduce KMS calls
```

### Q8: How would you design S3 Select (server-side query)?

```
S3 Select: run SQL-like query on S3 object, return only matching rows

Use case: 10 GB CSV file, only need rows where country='US'
Without S3 Select: download 10 GB, filter locally
With S3 Select: download only matching rows (<< 10 GB)

Architecture:
+--------+    SELECT s.name FROM S3Object s    +----------+
| Client | ---------------------------------> | S3 Select|
|        |    WHERE s.country = 'US'           | Engine   |
|        |                                    |          |
|        | <-- matching rows (10 MB) --------- | reads    |
|        |                                    | chunks,  |
+--------+                                    | filters  |
                                              | in-place |
                                              +----------+

Implementation:
- Query plan compiled to bytecode (columnar filter pushdown)
- For Parquet: skip non-relevant row groups using column statistics
- For CSV: scan line-by-line, emit matching lines
- Streaming response: rows sent as they are found (no buffer entire result)
- Multiple workers for parallel chunk processing
```

---

## 20. Summary: Design Principles

```
Principle 1: Separate data plane from control plane
  - Metadata service (control) and data nodes (data) evolve independently
  - Failure of metadata service doesn't lose data (data nodes survive independently)

Principle 2: Accept durability tradeoff (never available-first)
  - S3 prioritizes durability over availability
  - Writes are rejected (503) rather than risk losing data

Principle 3: Make writes idempotent
  - PUT with same content = same result; safe to retry
  - Upload ID for multipart = client-assigned idempotency key

Principle 4: Garbage collect asynchronously
  - DELETE is O(1) operation (just update metadata)
  - Actual data reclamation happens in background GC

Principle 5: Optimize for the common case
  - Most objects: < 1 MB (optimize metadata lookup speed)
  - Some objects: > 1 GB (optimize streaming and parallelism)
  - Different code paths for each

Principle 6: Erasure coding beats replication at scale
  - At exabyte scale, 2.1 PB saved per EB of data (1.4x vs 3x overhead)
  - EC complexity is engineering cost; justified by massive savings
```

---

*Last updated: 2026-03-01*
