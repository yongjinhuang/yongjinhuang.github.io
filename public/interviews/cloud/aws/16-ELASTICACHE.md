# ElastiCache (Redis & Memcached)

Amazon ElastiCache is a fully managed in-memory data store and cache service. It deploys, operates, and scales Redis or Memcached clusters in your VPC, eliminating the operational burden of patching, monitoring, failover, and backups. Use it to reduce database load, accelerate response times, and build real-time features like leaderboards, session stores, and rate limiters.

---

## Redis vs Memcached

| Feature             | Redis                                                       | Memcached                      |
| ------------------- | ----------------------------------------------------------- | ------------------------------ |
| **Data structures** | Strings, hashes, lists, sets, sorted sets, streams, bitmaps | Strings only                   |
| **Persistence**     | RDB snapshots + AOF                                         | None                           |
| **Replication**     | Primary-replica with auto failover                          | None                           |
| **Cluster mode**    | Hash-slot sharding (16,384 slots)                           | Client-side consistent hashing |
| **Threading**       | Single-threaded event loop (I/O threads since Redis 6)      | Multi-threaded                 |
| **Pub/Sub**         | Yes                                                         | No                             |
| **Lua scripting**   | Yes                                                         | No                             |
| **Transactions**    | MULTI/EXEC                                                  | No                             |

**Rule of thumb:** Use Redis unless you need multi-threaded performance for simple key-value blobs and do not care about persistence or data structures.

---

## Cluster Architecture

### Cluster Mode Disabled (Redis)

One primary node + up to 5 read replicas in a single shard. Single write endpoint, single reader endpoint (load-balanced). All data must fit on one node. Good for datasets under ~200 GiB.

### Cluster Mode Enabled (Redis)

Data partitioned across multiple shards using hash slots (0-16383). Up to 500 nodes (e.g., 250 shards x 2 nodes). Configuration endpoint handles slot routing. Online resharding without downtime. Required when dataset exceeds single-node memory or you need write scaling.

**You cannot switch between cluster-mode-disabled and cluster-mode-enabled on an existing cluster.** Plan this before your first deployment.

### Node Types

| Family            | Examples                           | Optimized For                        |
| ----------------- | ---------------------------------- | ------------------------------------ |
| **R (memory)**    | cache.r7g.large, cache.r7g.4xlarge | Large datasets, sorted sets, streams |
| **M (general)**   | cache.m7g.large                    | Balanced compute/memory              |
| **T (burstable)** | cache.t4g.micro, cache.t4g.medium  | Dev/test, low-traffic                |

Provision 25-30% more memory than your dataset for Redis overhead (fragmentation, replication buffers). ElastiCache reserves ~25% of node memory internally.

---

## Replication and Failover

**Redis Multi-AZ:** Primary and replicas in different AZs. If the primary fails, the replica with least replication lag is promoted. DNS updated in 30-60 seconds. Failed node replaced and rejoins as a replica.

**Memcached:** No replication. Node dies, data is gone. Your application must handle cache misses.

---

## Backup and Restore (Redis Only)

| Feature               | Details                                           |
| --------------------- | ------------------------------------------------- |
| **Automatic backups** | Daily snapshots, 1-35 day retention               |
| **Manual snapshots**  | On-demand, retained until deleted                 |
| **Restore**           | Creates a new cluster from the snapshot           |
| **Export**            | Copy snapshots to S3 for cross-region or archival |

Snapshots cause brief latency spikes. Schedule during off-peak hours.

---

## Redis Features

**Sorted Sets:** Leaderboards, priority queues, sliding-window rate limiting. `ZADD`, `ZREVRANGE`, `ZRANK`.

**Pub/Sub:** Fire-and-forget messaging. Messages not persisted -- if no subscriber is listening, the message is lost.

**Lua Scripting:** Execute atomic operations server-side, eliminating race conditions without distributed locks.

**Streams:** Append-only log with consumer groups. Lightweight Kafka built into Redis. `XADD`, `XREADGROUP`, `XACK`.

---

## ElastiCache Serverless

Auto-scales based on demand. No capacity planning. Pay per ECPU (compute) + per GB-hr (storage). Costs more per operation at steady state but saves money for spiky or low-traffic workloads. Eliminates under-provisioning risk.

```bash
aws elasticache create-serverless-cache \
  --serverless-cache-name my-cache \
  --engine redis \
  --subnet-ids subnet-abc123 subnet-def456 \
  --security-group-ids sg-0abc123
```

---

## Caching Patterns

**Cache-Aside (Lazy Loading):** App checks cache, on miss queries DB and writes result to cache. Only requested data is cached. Stale until TTL expires.

**Write-Through:** App writes to DB and cache simultaneously. Always consistent. Increases write latency. Caches data that may never be read.

**Write-Behind:** App writes to cache only; background process flushes to DB. Fastest writes but risk of data loss if cache node fails before DB write.

**Recommended:** Cache-aside for reads + write-through for writes. Add write-behind only when write throughput is a proven bottleneck.

---

## TTL Strategies

| Strategy   | TTL        | Use Case                                    |
| ---------- | ---------- | ------------------------------------------- |
| **Short**  | 30s - 5min | Frequently changing data (sessions, prices) |
| **Medium** | 5min - 1hr | User profiles, product details              |
| **Long**   | 1hr - 24hr | Config, translations                        |

Always set a TTL. Add jitter to prevent thundering herd: `TTL = base_ttl + random(0, jitter_seconds)`.

---

## Connection Management

Redis is single-threaded. Every connection consumes ~10 KB. Use connection pooling. Set max connections per client to 50-100. Total connections across all clients must stay below `maxclients` (default 65,000). Monitor `CurrConnections` in CloudWatch. Set socket timeout to 1-5 seconds with retry on timeout.

---

## Security

ElastiCache clusters are **VPC-only** with no public endpoints.

| Layer                     | Redis                                        | Memcached     |
| ------------------------- | -------------------------------------------- | ------------- |
| **In-transit encryption** | TLS                                          | TLS           |
| **At-rest encryption**    | AES-256 (KMS)                                | AES-256 (KMS) |
| **Authentication**        | Redis AUTH or IAM auth (Redis 7+)            | SASL          |
| **Access control**        | Redis ACLs (user-level command restrictions) | None          |

---

## Common CLI Commands

```bash
# Create a Redis replication group with Multi-AZ
aws elasticache create-replication-group \
  --replication-group-id my-redis \
  --replication-group-description "Production Redis" \
  --engine redis --engine-version 7.1 \
  --cache-node-type cache.r7g.large \
  --num-cache-clusters 3 \
  --multi-az-enabled --automatic-failover-enabled \
  --transit-encryption-enabled --at-rest-encryption-enabled

# Create a Memcached cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id my-memcached \
  --engine memcached \
  --cache-node-type cache.t4g.medium \
  --num-cache-nodes 3

# Describe clusters
aws elasticache describe-cache-clusters --show-cache-node-info
aws elasticache describe-replication-groups --replication-group-id my-redis

# Scale: add replicas
aws elasticache increase-replica-count \
  --replication-group-id my-redis --new-replica-count 3 --apply-immediately

# Scale: change node type
aws elasticache modify-replication-group \
  --replication-group-id my-redis \
  --cache-node-type cache.r7g.xlarge --apply-immediately

# Scale: add shards (cluster-mode-enabled)
aws elasticache modify-replication-group-shard-configuration \
  --replication-group-id my-redis --node-group-count 6 --apply-immediately

# Snapshots
aws elasticache create-snapshot \
  --replication-group-id my-redis --snapshot-name my-backup
aws elasticache describe-snapshots --replication-group-id my-redis

# Delete
aws elasticache delete-cache-cluster --cache-cluster-id my-memcached
```

---

## Common Gotchas

**Eviction policy:** Default is `noeviction` -- writes fail with OOM when memory is full. Set `volatile-lru` or `allkeys-lru` for caching workloads.

**Thundering herd / cache stampede:** Popular key expires, hundreds of requests hit DB simultaneously. Fix with mutex lock (`SET key value NX EX 5`), early recompute, or stale-while-revalidate.

**Hot key problem:** One key overwhelms a single shard. Fix with read replicas, key replication (`key:1`, `key:2` with random suffix), or local application-level caching.

**Redis single-threaded bottleneck:** Long-running commands (`KEYS *`, `SORT` on large sets) block everything. Use `SCAN` instead of `KEYS`. Paginate range queries.

**Memcached no persistence:** Node restart = total data loss. If your app cannot tolerate a full cache miss storm, use Redis.

**maxmemory:** A `cache.r7g.large` with 13 GiB total gives ~9.8 GiB usable `maxmemory` after Redis reserves. Plan capacity accordingly.
