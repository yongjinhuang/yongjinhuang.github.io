# Microsoft Azure Overview for Engineers

Azure is the second-largest cloud provider, dominant in enterprises with existing Microsoft ecosystems. Its standout services are Cosmos DB (multi-model globally distributed database), Azure AD/Entra ID (identity platform), and tight integration with Microsoft 365 and GitHub. This guide covers the services that matter for backend engineer interviews.

---

## Service Map

### Compute

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **Virtual Machines** | IaaS VMs | EC2 / Compute Engine |
| **App Service** | PaaS web hosting (managed) | Elastic Beanstalk / App Engine |
| **Azure Functions** | Serverless functions | Lambda / Cloud Functions |
| **AKS** | Managed Kubernetes | EKS / GKE |
| **Container Apps** | Serverless containers (Dapr) | Fargate / Cloud Run |
| **Container Instances** | Single-container hosting | Fargate (single task) |

### Storage

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **Blob Storage** | Object storage | S3 / Cloud Storage |
| **Azure Files** | Managed file shares (SMB/NFS) | EFS / Filestore |
| **Managed Disks** | Block storage for VMs | EBS / Persistent Disk |
| **Queue Storage** | Simple message queue | SQS (basic) |
| **Table Storage** | NoSQL key-value (legacy) | DynamoDB (basic) |

### Databases

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **Azure SQL** | Managed SQL Server | RDS SQL Server |
| **Cosmos DB** | Multi-model globally distributed DB | DynamoDB + Spanner concepts |
| **Azure Database for PostgreSQL/MySQL** | Managed open-source DBs | RDS / Cloud SQL |
| **Azure Cache for Redis** | Managed Redis | ElastiCache / Memorystore |

### Messaging

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **Service Bus** | Enterprise messaging (AMQP) | SQS + SNS / Pub/Sub |
| **Event Hubs** | Event streaming (Kafka-compatible) | Kinesis / Pub/Sub |
| **Event Grid** | Event routing (reactive) | EventBridge / Eventarc |
| **Queue Storage** | Simple HTTP-based queue | SQS |

### Networking

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **VNet** | Virtual network | VPC |
| **Application Gateway** | L7 load balancer + WAF | ALB / HTTP(S) LB |
| **Azure Load Balancer** | L4 load balancer | NLB / Network LB |
| **Front Door** | Global CDN + WAF + LB | CloudFront + WAF / Cloud CDN |
| **Traffic Manager** | DNS-based traffic routing | Route 53 routing |

### Identity & Security

| Azure Service | One-Liner | AWS / GCP Equivalent |
| ------------- | --------- | -------------------- |
| **Entra ID (Azure AD)** | Identity platform (SSO, MFA, B2C) | Cognito + IAM Identity Center |
| **RBAC** | Role-based access control | IAM |
| **Key Vault** | Secrets, keys, certificates | Secrets Manager + KMS |
| **Managed Identity** | Passwordless identity for services | IAM Roles / Service Accounts |

---

## Table of Contents

| # | File | Topic | Key Concepts |
| - | ---- | ----- | ------------ |
| 1 | [01-COMPUTE.md](01-COMPUTE.md) | Compute | VMs, App Service, Functions, AKS, Container Apps |
| 2 | [02-STORAGE.md](02-STORAGE.md) | Storage | Blob Storage, tiers, lifecycle management |
| 3 | [03-DATABASES.md](03-DATABASES.md) | Databases | Azure SQL, Cosmos DB, consistency levels |
| 4 | [04-NETWORKING.md](04-NETWORKING.md) | Networking | VNet, Load Balancing, Front Door |
| 5 | [05-MESSAGING.md](05-MESSAGING.md) | Messaging | Service Bus, Event Hubs, Event Grid |
| 6 | [06-IDENTITY-SECURITY.md](06-IDENTITY-SECURITY.md) | Identity | Entra ID, RBAC, Key Vault, Managed Identity |

---

## Azure vs AWS vs GCP Key Differences

| Aspect | Azure | AWS | GCP |
| ------ | ----- | --- | --- |
| **Identity** | Entra ID (enterprise SSO) | IAM + Cognito | Cloud Identity + IAM |
| **Enterprise** | Strongest (Microsoft ecosystem) | Strong | Growing |
| **Hybrid** | Azure Arc, Azure Stack | Outposts | Anthos |
| **Multi-model DB** | Cosmos DB (5 consistency levels) | None (separate services) | Spanner + Firestore |
| **Serverless containers** | Container Apps (Dapr built-in) | Fargate / App Runner | Cloud Run |
| **Event streaming** | Event Hubs (Kafka-compatible) | Kinesis / MSK | Pub/Sub |
| **Pricing** | Reserved instances + hybrid benefit | Reserved instances | Sustained use discounts |
