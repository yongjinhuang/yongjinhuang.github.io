# 设计对象存储系统 (Amazon S3)

对象存储系统为任意二进制数据提供持久、可扩展且高可用的存储。Amazon S3 是最典型的例子，存储着数万亿个对象并每秒处理数百万个请求。本指南从第一性原理出发，涵盖每个主要的设计决策。

---

## 1. 需求澄清

### 1.1 功能需求

| 功能                 | 描述                                                   |
| -------------------- | ------------------------------------------------------ |
| **Bucket 管理**      | 创建、删除和列出 bucket；bucket 是全局唯一的命名空间   |
| **对象 CRUD**        | 通过 bucket + key 标识的对象进行 PUT、GET、DELETE 操作 |
| **列出对象**         | 使用 prefix/delimiter 过滤和分页列出 bucket 中的对象   |
| **Multipart Upload** | 并行分片上传大对象（> 5 GB）                           |
| **版本控制**         | 保留同一 object key 的多个版本；delete marker          |
| **访问控制**         | Bucket policy、ACL、基于 IAM 的权限                    |
| **生命周期策略**     | 根据对象年龄自动转换或过期对象                         |
| **Pre-signed URL**   | 用于未认证上传/下载的限时 URL                          |
| **跨区域复制**       | 异步将对象复制到另一个 region                          |
| **存储类别**         | Standard、Infrequent Access、Glacier/Archive 层        |
| **数据完整性**       | 上传和静态存储时验证 checksum（MD5、CRC32）            |
| **事件通知**         | 向队列/Lambda 发布事件（ObjectCreated、ObjectDeleted） |

### 1.2 非功能需求

| 需求           | 目标                                                           |
| -------------- | -------------------------------------------------------------- |
| **持久性**     | 99.999999999%（11 个 9）- 每 1000 亿个对象最多丢失 1 个        |
| **可用性**     | 99.99%（Standard 类）/ 99.9%（IA 类）                          |
| **吞吐量**     | 每个 bucket prefix 100,000+ 请求/秒                            |
| **对象大小**   | 每个对象 1 字节到 5 TB                                         |
| **首字节延迟** | Standard 类 < 100 ms                                           |
| **可扩展性**   | EB 级别的总存储                                                |
| **一致性**     | 新对象的 read-after-write；所有操作的强一致性（现代 S3 2020+） |
| **安全性**     | 静态加密（SSE-S3、SSE-KMS）和传输加密（TLS）                   |

### 1.3 规模估算

**存储规模**

- 存储对象数：1 万亿（10^12）
- 平均对象大小：1 MB
- 总存储量：1 PB = 10^15 字节
- 存储增长：10 PB/年

**请求规模**

- 峰值 100,000 请求/秒
- 读写比：70/30
- 读取：70,000/秒
- 写入：30,000/秒

**带宽**

- 平均对象读取大小：100 KB
- 读取带宽：70,000 x 100 KB = 7 GB/秒
- 写入带宽：30,000 x 100 KB = 3 GB/秒
- 总网络 I/O：~10 GB/秒

**元数据规模**

- 每个对象约 1 KB 的元数据（bucket、key、size、ETag、时间戳、ACL、storage class）
- 1 万亿对象 x 1 KB = 1 PB 元数据
- 元数据必须建立索引以支持快速查找：需要具有数十亿行的分布式数据库

**数据节点容量**

- 每个数据节点存储 100 TB（10 x 10 TB HDD）
- 100 PB 原始数据需要：1,000 个数据节点
- 使用 RS(10,4) erasure coding：1,000 x 1.4 倍开销 = 1,400 个物理节点
- （对比 3 倍复制需要 3,000 个节点）

---

## 2. API 设计

### 2.1 Bucket 操作

```
PUT /                    创建 bucket（bucket 名称在 Host header 中）
DELETE /                 删除 bucket（必须为空）
GET /                    列出 bucket（针对已认证用户）
GET /?lifecycle          获取生命周期策略
PUT /?lifecycle          设置生命周期策略
GET /?versioning         获取版本控制状态
PUT /?versioning         启用/暂停版本控制
GET /?replication        获取复制配置
PUT /?replication        设置复制配置
```

### 2.2 对象操作

**上传（PUT Object）**

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

**下载（GET Object）**

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

**删除（DELETE Object）**

```
DELETE /{bucket}/{key}
DELETE /{bucket}/{key}?versionId=xxx   (specific version)

Response 204 No Content
x-amz-version-id: ...                  (delete marker version ID if versioning enabled)
x-amz-delete-marker: true
```

**列出对象**

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

### 2.3 Multipart Upload 协议

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

### 2.4 Pre-signed URL

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

## 3. 数据模型

### 3.1 Bucket 元数据

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

### 3.2 对象元数据

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

### 3.3 进行中的 Multipart Upload

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

### 3.4 ACL 模型

```json
{
  "bucket": "my-bucket",
  "owner": "account-123",
  "grants": [
    {
      "grantee": { "type": "CanonicalUser", "id": "account-123" },
      "permission": "FULL_CONTROL"
    },
    {
      "grantee": {
        "type": "Group",
        "uri": "http://acs.amazonaws.com/groups/global/AllUsers"
      },
      "permission": "READ"
    }
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

## 4. 高层架构

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

## 5. 深入分析：存储类型对比

### 对象存储 vs 块存储 vs 文件存储

| 维度         | 对象存储 (S3)                | 块存储 (EBS)               | 文件存储 (EFS/NFS)               |
| ------------ | ---------------------------- | -------------------------- | -------------------------------- |
| **访问模式** | REST API (HTTP GET/PUT)      | 原始磁盘 I/O (iSCSI/NVMe)  | POSIX 文件系统 (read/write/seek) |
| **粒度**     | 整个对象（不可变）           | 固定大小块 (512B-4KB)      | 文件和目录                       |
| **更新语义** | 全量替换；无原地编辑         | 随机读/写                  | 字节范围读/写                    |
| **命名空间** | bucket 内的扁平 key          | 块地址偏移                 | 层级路径                         |
| **可扩展性** | EB 级别，几乎无限            | 每卷 TB 级别               | PB 级别（分布式 NFS）            |
| **持久性**   | 99.999999999%                | 99.999%（带 snapshot）     | 99.999999999% (EFS)              |
| **延迟**     | ms (首字节 100ms)            | us (< 1ms)                 | ms (1-10ms)                      |
| **使用场景** | 备份、媒体、数据湖、静态网站 | 数据库、操作系统卷、虚拟机 | 共享文件访问、ML 训练数据        |
| **元数据**   | 丰富的用户自定义元数据       | 最少（仅块元数据）         | POSIX 文件属性                   |

**关键洞察**：对象存储牺牲了随机写能力和低延迟，换取了大规模可扩展性、高持久性和简单的 HTTP API。这是根本的权衡。

---

## 6. 深入分析：数据平面 - 对象如何存储

### 6.1 写入路径

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

**大对象分块**：

- 大于 64 MB 的对象被拆分为 64 MB 的块
- 每个块独立进行 erasure coding
- 块清单存储在元数据中：`[chunk0_location, chunk1_location, ...]`
- 支持并行读取（range request）和并行写入

### 6.2 读取路径

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

**Range request 优化**：

- `GET /bucket/key` 带 `Range: bytes=5000000-10000000`
- API 层将字节范围转换为特定的块
- 仅获取相关块，而非整个对象
- 对于视频流和大型归档访问至关重要

### 6.3 数据节点内部结构

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

## 7. 深入分析：Erasure Coding

### 7.1 什么是 Erasure Coding？

Erasure coding 是一种前向纠错技术，将数据拆分为 `k` 个数据分片和 `m` 个奇偶校验分片，使得 `k+m` 个分片中的任意 `k` 个都能重建原始数据。

**S3 风格的 RS(10,4)** - Reed-Solomon，10 个数据分片，4 个奇偶校验分片：

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

- 容忍任意 4 个节点故障仍可重建数据
- 存储开销：14/10 = 1.4x
- 对比 3 倍复制：3.0x 开销
```

### 7.2 存储效率对比

| 方法     | 开销  | 容错能力         | 重建成本         | CPU 成本 |
| -------- | ----- | ---------------- | ---------------- | -------- |
| 无冗余   | 1.0x  | 0 次故障         | 不适用           | 无       |
| 3 倍复制 | 3.0x  | 2 次故障（任意） | 复制 1 个副本    | 低       |
| RS(6,3)  | 1.5x  | 3 次故障         | 从 6 个分片重建  | 中等     |
| RS(10,4) | 1.4x  | 4 次故障         | 从 10 个分片重建 | 高       |
| RS(14,2) | 1.14x | 2 次故障         | 从 14 个分片重建 | 更高     |

**S3 在可用区内使用 RS(10,4)** + 跨可用区的地理复制。

### 7.3 Reed-Solomon 数学原理（简化版）

```
Data shards:   [d0, d1, d2, ..., d9]  as GF(2^8) field elements

Generator matrix G:  (14 x 10)
[  I_10  ]   <- identity matrix: data shards pass through unchanged
[ P_4x10 ]   <- Vandermonde-based parity matrix

Parity shards = P_4x10 * [d0..d9]^T

Reconstruction: if 4 shards lost, build 10x10 submatrix from surviving rows,
invert it (Gaussian elimination in GF(2^8)), multiply by known shards.
```

### 7.4 分片放置策略

```
To tolerate AZ failure AND rack failure:

Shard placement for RS(10,4), 3 AZs:
AZ-1: d0, d1, d2, d3, p0   (5 shards across 5 different racks)
AZ-2: d4, d5, d6, d7, p1   (5 shards across 5 different racks)
AZ-3: d8, d9, p2, p3        (4 shards across 4 different racks)

Can lose entire AZ-3 (4 shards) and still reconstruct from AZ-1 + AZ-2 (10 shards).
```

---

## 8. 深入分析：元数据服务

### 8.1 命名空间管理

元数据服务负责：

1. **对象命名空间**：映射 `(bucket, key, version) -> 物理位置`
2. **Bucket 命名空间**：bucket 名称的全局唯一性
3. **列举**：基于 prefix 的高效 key 枚举

### 8.2 分片策略

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

### 8.3 一致性：Read-After-Write

**经典 S3（2020 年之前）**：覆盖写 PUT 和 DELETE 的最终一致性

- 原因：带有缓存层的分布式元数据；可能出现陈旧读取

**现代 S3（2020 年 12 月以后）**：所有操作的强 read-after-write 一致性

- 实现方式：fencing token / 带版本检查的条件写入
- 每次写入递增一个单调版本号；读取拒绝返回陈旧版本

```
Strong consistency mechanism:
PUT /bucket/key          -> write version V5 to metadata shard leader
                        -> replicate to followers
GET /bucket/key          -> read from leader OR follower with V >= V5
                        -> if follower is behind, forward to leader
                        -> guaranteed to see V5 or later
```

### 8.4 元数据缓存

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

## 9. 深入分析：一致性模型

### 9.1 一致性保证（现代 S3）

| 操作                 | 一致性保证                                          |
| -------------------- | --------------------------------------------------- |
| PUT 新对象           | Read-after-write：立即可见                          |
| PUT 覆盖写           | 强一致性：始终返回最新版本                          |
| DELETE 对象          | 强一致性：DELETE 完成后对象不可见                   |
| PUT 后 LIST          | List 反映新对象                                     |
| DELETE 后 LIST       | List 不包含已删除对象                               |
| 并发 PUT（相同 key） | 以墙上时钟为准的 last-writer-wins；两次写入均被确认 |

### 9.2 如何实现强一致性

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

### 9.3 并发写入冲突解决

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

## 10. 深入分析：版本控制

### 10.1 启用版本控制的 Bucket

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

### 10.2 版本存储开销

```
Strategy: Each version is a full copy of the object data.
- Storage cost grows linearly with versions
- Lifecycle policy: expire noncurrent versions after N days
- MFA Delete: require MFA to permanently delete versions (for compliance)
```

---

## 11. 深入分析：生命周期策略

### 11.1 转换规则

```json
{
  "Rules": [
    {
      "ID": "archive-old-objects",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
```

### 11.2 生命周期服务实现

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

### 11.3 存储类别

| 类别                 | 最短存储期 | 最小大小 | 检索时间   | 使用场景               |
| -------------------- | ---------- | -------- | ---------- | ---------------------- |
| STANDARD             | 无         | 无       | ms         | 频繁访问的数据         |
| STANDARD_IA          | 30 天      | 128 KB   | ms         | 月度访问，成本敏感     |
| ONE_ZONE_IA          | 30 天      | 128 KB   | ms         | 可复现的数据，单可用区 |
| INTELLIGENT_TIERING  | 无         | 无       | ms / 小时  | 未知访问模式           |
| GLACIER_INSTANT      | 90 天      | 128 KB   | ms         | 需要即时检索的归档     |
| GLACIER_FLEXIBLE     | 90 天      | 40 KB    | 分钟-小时  | 归档                   |
| GLACIER_DEEP_ARCHIVE | 180 天     | 40 KB    | 12-48 小时 | 长期合规性存储         |

---

## 12. 深入分析：Pre-signed URL

### 12.1 Pre-signed URL 工作原理

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

### 12.2 Pre-signed URL 生成（服务端）

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

## 13. 深入分析：跨区域复制

### 13.1 CRR 架构

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

### 13.2 CRR 配置

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

## 14. 深入分析：数据完整性

### 14.1 Checksum 策略

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

### 14.2 Bitrot 检测（数据清洗）

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

### 14.3 实现 11 个 9 的持久性

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

## 15. 深入分析：垃圾回收

### 15.1 为什么需要 GC

为保持性能，对象采用惰性删除：

- DELETE 请求：在元数据中标记为已删除，不会立即释放数据节点
- 覆盖写：旧数据块在新版本提交后变为孤儿数据
- Multipart 中止：已上传的分片需要清理

### 15.2 GC 算法

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

### 15.3 Tombstone 传播

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

## 16. 扩展策略

### 16.1 元数据扩展

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

### 16.2 数据节点扩展

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

### 16.3 API 层扩展

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

### 16.4 Multipart Upload 可扩展性

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

## 17. 成本优化

### 17.1 存储效率

| 策略                                | 节省                     |
| ----------------------------------- | ------------------------ |
| Erasure coding RS(10,4) vs 3 倍复制 | 存储成本降低 53%         |
| 块级别去重                          | 备份工作负载节省 10-30%  |
| 压缩（zstd）用于可压缩数据          | 日志、JSON 压缩比 2-5 倍 |
| Intelligent-Tiering 自动分类        | 混合访问数据节省 30-50%  |
| 生命周期策略转为 Glacier            | 归档数据成本降低 80%     |

### 17.2 计算效率

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

### 17.3 网络优化

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

## 18. 权衡分析

### 18.1 一致性 vs 可用性

| 选择                      | 权衡                                               |
| ------------------------- | -------------------------------------------------- |
| **强一致性（现代 S3）**   | 略高延迟（leader 往返）；leader 不可用导致读取错误 |
| **最终一致性（经典 S3）** | 更低延迟；写入/删除后可能出现陈旧读取；脑裂场景    |

**决策**：现代 S3 选择了强一致性，因为用户最大的痛点是缓存失效 bug，而非多出的微秒级延迟。

### 18.2 Erasure Coding vs 复制

| 权衡       | Erasure Coding (RS)                  | 3 倍复制              |
| ---------- | ------------------------------------ | --------------------- |
| 存储开销   | 1.4x                                 | 3.0x                  |
| 读取延迟   | 更高（需要 k 个分片 + EC 解码）      | 更低（读取 1 个副本） |
| 写入延迟   | 更高（计算 parity + 写入 14 个节点） | 更低（写入 3 个节点） |
| 重建时间   | 更长（网络密集型重建）               | 更快（简单复制）      |
| 小对象成本 | 低效（100B 对象 -> 14 x 100B 分片）  | 更高效                |

**S3 实际做法**：对小对象（低于某阈值）使用 3 倍复制；对大对象使用 erasure coding。同时跨可用区复制，可用区内使用 EC。

### 18.3 元数据架构

| 方案                         | 优点                        | 缺点                     |
| ---------------------------- | --------------------------- | ------------------------ |
| **关系型数据库（分片）**     | ACID、SQL 查询、易上手      | 难以水平扩展             |
| **分布式 KV 存储**           | 易扩展、快速点查询          | 无范围扫描、弱一致性选项 |
| **宽列存储（Cassandra）**    | 按 key 范围扫描、可调一致性 | 操作复杂、默认最终一致性 |
| **专用元数据数据库（自研）** | 针对对象存储工作负载优化    | 工程成本高               |

**S3 方案**：自研分布式元数据服务，采用 Raft 共识，针对 (bucket, key, version) 访问模式优化。

### 18.4 同步 vs 异步复制

| 复制模式                             | 持久性 | 写入延迟       | 使用场景     |
| ------------------------------------ | ------ | -------------- | ------------ |
| 同步（所有 AZ 确认后才返回）         | 最高   | 额外 ~50-100ms | 金融记录     |
| 同步（3 个 AZ 中 2 个确认）          | 高     | 额外 ~10-20ms  | 标准数据     |
| 异步（1 个 AZ 确认后返回，稍后复制） | 最终   | 最小           | 高吞吐量摄入 |

**S3 Standard**：同步写入 3 个可用区后才返回 200 OK。这就是为什么持久性达到 11 个 9。

---

## 19. 常见面试追问

### Q1：S3 在写入期间如何处理数据节点故障？

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

### Q2：如何实现 bucket 级别的速率限制？

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

### Q3：版本控制如何影响存储成本？

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

### Q4：如何为 10 亿个 key 设计 LIST 操作？

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

### Q5：如何处理"热点" key（惊群效应）？

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

### Q6：S3 如何实现大对象的低延迟？

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

### Q7：如何添加服务端加密？

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

### Q8：如何设计 S3 Select（服务端查询）？

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

## 20. 总结：设计原则

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
