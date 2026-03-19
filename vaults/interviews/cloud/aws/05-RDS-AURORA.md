# Amazon RDS & Aurora

RDS (Relational Database Service) is a managed service that handles the undifferentiated heavy lifting of running relational databases: provisioning, patching, backups, failover, and replication. You pick the engine, instance size, and storage -- AWS operates the rest. **Aurora** is Amazon's cloud-native relational engine, compatible with MySQL and PostgreSQL but re-architected for the cloud with a distributed storage layer that provides significantly better performance, availability, and scalability than standard RDS instances.

---

## Supported Engines

| Engine         | RDS | Aurora                  |
| -------------- | --- | ----------------------- |
| **PostgreSQL** | Yes | Yes (Aurora PostgreSQL) |
| **MySQL**      | Yes | Yes (Aurora MySQL)      |
| **MariaDB**    | Yes | No                      |
| **Oracle**     | Yes | No                      |
| **SQL Server** | Yes | No                      |

Choose Aurora when you want PostgreSQL or MySQL compatibility with higher performance and availability. Choose standard RDS when you need Oracle, SQL Server, MariaDB, or want to avoid Aurora's pricing model.

---

## What Makes Aurora Different

Aurora is not just "RDS but faster." It has a fundamentally different architecture:

- **Distributed storage layer**: Data is automatically replicated **6 copies across 3 Availability Zones**
- **Storage auto-scales**: Grows in 10 GB increments up to 128 TB, no pre-provisioning needed
- **5x MySQL throughput, 3x PostgreSQL throughput** (AWS benchmarks -- real gains are workload-dependent, but the architecture genuinely helps)
- **Continuous backup to S3**: No performance impact from backups
- **Instant crash recovery**: Redo log replay happens at the storage layer, not the database instance
- **Up to 15 read replicas** (vs 5 for standard RDS) with sub-10ms replica lag

### Aurora Storage Architecture

```
                    Writer Instance
                         |
         +-----------+---+---+-----------+
         |           |       |           |
    +---------+ +---------+ +---------+
    |  AZ-1   | |  AZ-2   | |  AZ-3   |
    | Copy 1  | | Copy 3  | | Copy 5  |
    | Copy 2  | | Copy 4  | | Copy 6  |
    +---------+ +---------+ +---------+
         |           |           |
    Reader Replicas (up to 15)
```

Writes succeed as long as 4 of 6 copies acknowledge. Reads succeed with 3 of 6. This means Aurora can tolerate losing an entire AZ plus one additional copy and still serve reads.

---

## Instance Classes

| Class Family        | Use Case                                    | Example        |
| ------------------- | ------------------------------------------- | -------------- |
| **db.r6g / db.r7g** | Memory-optimized (production workloads)     | db.r7g.2xlarge |
| **db.m6g / db.m7g** | General purpose (balanced workloads)        | db.m7g.xlarge  |
| **db.t4g / db.t3**  | Burstable (dev/test, low-traffic)           | db.t4g.medium  |
| **db.x2g**          | Memory-intensive (large in-memory datasets) | db.x2g.xlarge  |

**Graviton instances (g suffix)** offer ~20% better price-performance than Intel equivalents. Use them unless your engine or extension has an ARM compatibility issue.

---

## High Availability

### Multi-AZ Deployments (Standard RDS)

- **Synchronous** standby replica in a different AZ
- Automatic failover on primary failure (~60 seconds for DNS propagation)
- Standby is **not** available for read traffic -- it is purely for failover
- One-click enable; increases cost by ~2x

### Multi-AZ for Aurora

- Aurora is inherently Multi-AZ because of the 6-copy storage layer
- Add Aurora Replicas in different AZs for both read scaling and failover
- Failover promotes a replica in **~30 seconds** (faster than standard RDS)
- Use **failover tiers** (priority 0-15) to control which replica gets promoted

### Read Replicas

| Feature             | RDS Read Replicas              | Aurora Replicas                  |
| ------------------- | ------------------------------ | -------------------------------- |
| Max count           | 5                              | 15                               |
| Replication         | Asynchronous (binlog/WAL)      | Shared storage layer (~10ms lag) |
| Failover target     | Manual promotion               | Automatic failover               |
| Cross-region        | Yes                            | Yes (Aurora Global Database)     |
| Independent scaling | Yes (different instance class) | Yes                              |

```bash
# Create an Aurora read replica
aws rds create-db-instance \
  --db-instance-identifier my-aurora-reader \
  --db-cluster-identifier my-aurora-cluster \
  --engine aurora-mysql \
  --db-instance-class db.r7g.large
```

---

## Storage

### Standard RDS Storage

| Type          | Use Case                              | IOPS                                    |
| ------------- | ------------------------------------- | --------------------------------------- |
| **gp3**       | General purpose, most workloads       | Baseline 3,000 IOPS, scalable to 16,000 |
| **io1 / io2** | I/O-intensive (OLTP, large databases) | Up to 256,000 IOPS                      |
| **magnetic**  | Legacy, do not use                    | Low                                     |

**Storage auto-scaling**: RDS can automatically increase storage when usage exceeds a threshold. Set a max limit to control costs.

### Aurora Storage

Aurora storage is completely different -- it is a shared, distributed, log-structured storage system. You do not choose a storage type. It auto-scales from 10 GB to 128 TB. You pay only for what you use.

---

## Backups and Recovery

### Automated Backups

- Retention period: 1-35 days (default 7)
- Continuous, incremental backups to S3
- No performance impact for Aurora; slight I/O impact for standard RDS during backup window

### Manual Snapshots

- Persist until you explicitly delete them (not subject to retention period)
- Can be shared across accounts or copied across Regions
- Use for pre-migration or pre-major-upgrade safety nets

### Point-in-Time Recovery (PITR)

Restore to any second within the backup retention window. Creates a **new** DB instance (does not restore in-place).

```bash
# Restore to a specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier my-db \
  --target-db-instance-identifier my-db-restored \
  --restore-time "2024-06-15T10:30:00Z"

# Take a manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier my-db \
  --db-snapshot-identifier my-db-pre-migration

# List snapshots
aws rds describe-db-snapshots --db-instance-identifier my-db
```

---

## Parameter Groups and Option Groups

### Parameter Groups

Database configuration (e.g., `max_connections`, `shared_buffers`, `innodb_buffer_pool_size`). Applied at the cluster level (Aurora) or instance level (RDS).

```bash
# Create a custom parameter group
aws rds create-db-parameter-group \
  --db-parameter-group-name my-pg16-params \
  --db-parameter-group-family postgres16 \
  --description "Custom PostgreSQL 16 parameters"

# Modify a parameter
aws rds modify-db-parameter-group \
  --db-parameter-group-name my-pg16-params \
  --parameters "ParameterName=max_connections,ParameterValue=500,ApplyMethod=pending-reboot"
```

Some parameters require a reboot; others apply immediately. Always check `ApplyMethod`.

### Option Groups

Engine-specific features (Oracle TDE, SQL Server native backup, etc.). Less commonly used with PostgreSQL/MySQL.

---

## RDS Proxy

A fully managed database proxy that sits between your application and RDS/Aurora.

**Why use it:**

- **Connection pooling**: Reuses database connections. Critical for Lambda (each invocation opens a new connection)
- **IAM authentication**: Authenticate to the database using IAM roles instead of passwords
- **Faster failover**: Reduces failover time by maintaining connections to the standby and transparently routing traffic

```
Lambda Functions (100s of concurrent) --> RDS Proxy --> Aurora (max_connections = 500)
```

Without RDS Proxy, 1,000 concurrent Lambda invocations = 1,000 database connections = dead database.

```bash
aws rds create-db-proxy \
  --db-proxy-name my-proxy \
  --engine-family POSTGRESQL \
  --auth Description="IAM auth",AuthScheme=SECRETS,SecretArn=arn:aws:secretsmanager:...,IAMAuth=REQUIRED \
  --role-arn arn:aws:iam::123456789012:role/rds-proxy-role \
  --vpc-subnet-ids subnet-abc subnet-def
```

---

## Aurora Serverless v2

Scales compute capacity up and down automatically based on workload. You set a minimum and maximum ACU (Aurora Capacity Unit) range.

| Feature                 | Detail                             |
| ----------------------- | ---------------------------------- |
| Scaling granularity     | 0.5 ACU increments                 |
| Min ACU                 | 0.5 (effectively scales near zero) |
| Max ACU                 | 256                                |
| Scale-up time           | Seconds                            |
| Mixing with provisioned | Yes, same cluster can have both    |

**Good for:** Dev/test environments, unpredictable workloads, off-hours scaling. **Not ideal for:** Consistently high, latency-sensitive production loads where provisioned instances give more predictable performance.

```bash
aws rds create-db-cluster \
  --db-cluster-identifier my-serverless-cluster \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.04.0 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16 \
  --master-username admin \
  --master-user-password "$(aws secretsmanager get-random-password --output text)"
```

---

## Performance Insights

Built-in performance monitoring that helps you identify the SQL queries and wait events consuming the most database resources.

- **Top SQL**: See which queries consume the most CPU, I/O, or time
- **Wait events**: Understand what the database is waiting on (lock contention, I/O, network)
- **DB load**: Visualize active sessions vs. max vCPUs
- Free tier retains 7 days of data; paid tier retains up to 2 years

Enable it -- there is no reason not to. The overhead is negligible.

```bash
aws rds modify-db-instance \
  --db-instance-identifier my-db \
  --enable-performance-insights \
  --performance-insights-retention-period 731
```

---

## Security

### Encryption at Rest

- Uses AWS KMS (customer-managed or AWS-managed key)
- Must be enabled at creation time -- **you cannot encrypt an existing unencrypted instance in-place**
- Workaround: take a snapshot, copy it with encryption, restore from the encrypted snapshot

### Encryption in Transit

- SSL/TLS connections -- enforce via parameter group (`rds.force_ssl = 1` for PostgreSQL)
- Download the RDS CA bundle and configure your client to verify it

### IAM Database Authentication

- Authenticate to MySQL and PostgreSQL using IAM roles instead of passwords
- Short-lived tokens (15-minute lifetime)
- Best combined with RDS Proxy for connection management

```bash
# Generate an IAM auth token
aws rds generate-db-auth-token \
  --hostname my-db.cluster-xxxxx.us-east-1.rds.amazonaws.com \
  --port 5432 \
  --username iam_user
```

### Network Isolation

- Always deploy in a **private subnet** within a VPC
- Use **security groups** to restrict access to specific CIDR blocks or other security groups
- Never expose RDS to the public internet in production

---

## Common CLI Commands

```bash
# Create a standard RDS instance
aws rds create-db-instance \
  --db-instance-identifier my-postgres \
  --engine postgres \
  --engine-version 16.3 \
  --db-instance-class db.r7g.large \
  --allocated-storage 100 \
  --storage-type gp3 \
  --master-username admin \
  --master-user-password "$DB_PASSWORD" \
  --multi-az \
  --vpc-security-group-ids sg-xxxxx

# Describe instances
aws rds describe-db-instances --db-instance-identifier my-postgres

# Modify an instance (e.g., scale up)
aws rds modify-db-instance \
  --db-instance-identifier my-postgres \
  --db-instance-class db.r7g.xlarge \
  --apply-immediately

# Create a snapshot
aws rds create-db-snapshot \
  --db-instance-identifier my-postgres \
  --db-snapshot-identifier my-postgres-snapshot

# Delete an instance (skip final snapshot for dev)
aws rds delete-db-instance \
  --db-instance-identifier my-dev-db \
  --skip-final-snapshot

# Reboot (applies pending parameter changes)
aws rds reboot-db-instance --db-instance-identifier my-postgres
```

---

## Common Gotchas

| Gotcha                                        | Detail                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage auto-scaling cannot shrink**        | Once storage grows, it never decreases. Over-provisioning is permanent.                                                                                                                                                         |
| **Multi-AZ failover takes ~60s**              | DNS TTL propagation. Your app must handle transient connection errors and retry.                                                                                                                                                |
| **Maintenance windows**                       | AWS applies patches during your maintenance window. Set it to low-traffic hours. Defer if needed, but do not skip indefinitely.                                                                                                 |
| **Major version upgrades need planning**      | Test on a snapshot clone first. Some upgrades require downtime. Aurora blue/green deployments help.                                                                                                                             |
| **Cannot encrypt an existing instance**       | Must snapshot -> copy with encryption -> restore. Plan encryption from day one.                                                                                                                                                 |
| **Read replica lag**                          | Standard RDS replicas use async replication. Under write-heavy loads, lag can be minutes. Aurora replicas share storage, so lag is typically <10ms.                                                                             |
| **max_connections scales with instance size** | Tiny instances (db.t4g.micro) may have max_connections as low as 40. Know your limits before deploying.                                                                                                                         |
| **Aurora I/O costs**                          | Aurora charges per million I/O requests. For very I/O-intensive workloads, this can exceed the cost savings from not provisioning storage. Aurora I/O-Optimized pricing eliminates per-I/O charges for a higher instance price. |
| **Blue/Green deployments**                    | Use RDS Blue/Green Deployments for major upgrades. It creates a staging environment that mirrors production, lets you test, then switches over with minimal downtime.                                                           |
| **Snapshot restore creates a new instance**   | PITR and snapshot restores always create a new endpoint. Your app config must be updated (or use RDS Proxy / Route 53 CNAME).                                                                                                   |
