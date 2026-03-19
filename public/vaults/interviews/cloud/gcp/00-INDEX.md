# Google Cloud Platform (GCP) Overview for Engineers

GCP is the third-largest cloud provider, known for its data analytics (BigQuery), Kubernetes (GKE -- Google invented K8s), and globally distributed database (Spanner). This guide covers the services that matter for backend engineer interviews, with AWS equivalents for context.

---

## Service Map

### Compute

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **Compute Engine** | Virtual machines | EC2 |
| **Cloud Run** | Serverless containers (auto-scaling to zero) | Fargate + App Runner |
| **Cloud Functions** | Event-driven serverless functions | Lambda |
| **GKE** | Managed Kubernetes | EKS |
| **App Engine** | PaaS (legacy, still used) | Elastic Beanstalk |

### Storage

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **Cloud Storage** | Object storage (4 classes) | S3 |
| **Persistent Disk** | Block storage for VMs | EBS |
| **Filestore** | Managed NFS | EFS |

### Databases

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **Cloud SQL** | Managed PostgreSQL/MySQL/SQL Server | RDS |
| **Cloud Spanner** | Globally distributed SQL (TrueTime) | No equivalent (Aurora Global is closest) |
| **Firestore** | Serverless document database | DynamoDB |
| **Bigtable** | Wide-column NoSQL (HBase compatible) | DynamoDB / Keyspaces |
| **Memorystore** | Managed Redis/Memcached | ElastiCache |
| **AlloyDB** | PostgreSQL-compatible, Spanner-grade HA | Aurora PostgreSQL |

### Analytics

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **BigQuery** | Serverless data warehouse | Redshift Serverless / Athena |
| **Dataflow** | Stream/batch processing (Apache Beam) | Kinesis Data Analytics / EMR |
| **Dataproc** | Managed Spark/Hadoop | EMR |
| **Pub/Sub** | Global messaging / event streaming | SNS + SQS / Kinesis |

### Networking

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **VPC** | Virtual private network | VPC |
| **Cloud Load Balancing** | Global/regional L4/L7 load balancing | ALB/NLB + Global Accelerator |
| **Cloud CDN** | Content delivery network | CloudFront |
| **Cloud DNS** | Managed DNS | Route 53 |
| **Cloud Armor** | WAF + DDoS protection | WAF + Shield |

### AI/ML

| GCP Service | One-Liner | AWS Equivalent |
| ----------- | --------- | -------------- |
| **Vertex AI** | ML platform (training, serving, MLOps) | SageMaker |
| **Gemini API** | Google's LLM API | Bedrock (Claude, etc.) |

---

## Table of Contents

| # | File | Topic | Key Concepts |
| - | ---- | ----- | ------------ |
| 1 | [01-COMPUTE.md](01-COMPUTE.md) | Compute | Compute Engine, Cloud Run, Functions, GKE |
| 2 | [02-CLOUD-STORAGE.md](02-CLOUD-STORAGE.md) | Storage | Storage classes, lifecycle, signed URLs |
| 3 | [03-DATABASES.md](03-DATABASES.md) | Databases | Cloud SQL, Spanner, Firestore, Bigtable |
| 4 | [04-NETWORKING.md](04-NETWORKING.md) | Networking | VPC, Load Balancing, CDN, Cloud Armor |
| 5 | [05-MESSAGING.md](05-MESSAGING.md) | Messaging | Pub/Sub, Cloud Tasks, Workflows |
| 6 | [06-BIGQUERY.md](06-BIGQUERY.md) | BigQuery | Columnar, slots, partitioning, cost optimization |
| 7 | [07-IAM-SECURITY.md](07-IAM-SECURITY.md) | IAM & Security | IAM, service accounts, KMS, VPC Service Controls |

---

## GCP vs AWS Key Differences

| Aspect | GCP | AWS |
| ------ | --- | --- |
| **Networking** | Global VPC by default (subnets span regions) | Regional VPCs (subnets per AZ) |
| **Load balancing** | Global by default (single anycast IP) | Regional by default (need Global Accelerator) |
| **Kubernetes** | GKE (best managed K8s, Google invented it) | EKS (good but more operational) |
| **Data warehouse** | BigQuery (serverless, separate storage/compute) | Redshift (provisioned clusters) |
| **Distributed DB** | Spanner (globally consistent, TrueTime) | No equivalent |
| **Serverless containers** | Cloud Run (excellent DX, scale to zero) | Fargate (no scale-to-zero natively) |
| **IAM** | Resource hierarchy (org > folder > project) | Flat accounts (use Organizations + SCPs) |
| **Pricing** | Sustained use discounts (automatic) | Reserved instances (manual commitment) |
| **Billing** | Per-project | Per-account |
