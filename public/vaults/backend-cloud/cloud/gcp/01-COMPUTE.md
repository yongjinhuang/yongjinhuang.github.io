# GCP Compute Services

GCP offers a range of compute options from raw VMs to fully serverless containers. Cloud Run is GCP's standout -- the best serverless container platform with scale-to-zero and excellent developer experience.

---

## Table of Contents

1. [Compute Engine](#compute-engine)
2. [Cloud Run](#cloud-run)
3. [Cloud Functions](#cloud-functions)
4. [GKE (Google Kubernetes Engine)](#gke)
5. [Comparison](#comparison)
6. [Common Interview Questions](#common-interview-questions)

---

## Compute Engine

Virtual machines in GCP's infrastructure.

### Key Features

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **Machine types** | Predefined (e2, n2, c3, m3) or custom (any CPU/memory) | Instance types (fixed) |
| **Preemptible VMs** | Up to 80% cheaper, can be reclaimed anytime (max 24h) | Spot Instances |
| **Spot VMs** | Like preemptible but no 24h max (can run longer) | Spot Instances |
| **Live migration** | VMs migrate between hosts with no downtime (unique to GCP) | Not available |
| **Sole-tenant nodes** | Dedicated physical server | Dedicated Hosts |
| **Managed Instance Groups (MIGs)** | Auto-scaling, auto-healing, rolling updates | Auto Scaling Groups |

### Live Migration (GCP Advantage)

```
Problem: Host needs maintenance (security patch, hardware issue)

AWS approach: Stop instance -> maintenance -> restart (downtime)
GCP approach: VM live-migrated to another host (zero downtime)

How it works:
  1. Pre-copy: memory pages copied to destination host
  2. Iterative copy: dirty pages re-copied
  3. Switchover: brief pause (<1s), final state transferred
  4. VM resumes on new host
```

---

## Cloud Run

Serverless containers that scale to zero. GCP's best serverless product.

```
Container image -> Cloud Run -> Auto-scales 0 to N instances
                                 |
                                 v
                   Handles HTTP, gRPC, WebSockets, streaming
                   Scale to zero when no traffic (pay nothing)
```

### Key Features

| Feature | Details |
| ------- | ------- |
| **Scale to zero** | No traffic = no instances = no cost |
| **Auto-scaling** | 0 to 1000 instances (configurable) |
| **Cold start** | ~200-500ms (container startup) |
| **Concurrency** | Up to 1000 concurrent requests per instance |
| **CPU** | Up to 8 vCPUs per instance |
| **Memory** | Up to 32 GB per instance |
| **Timeout** | Up to 60 minutes (HTTP), 24 hours (jobs) |
| **GPU** | Supported (NVIDIA L4, A100) |
| **VPC** | Direct VPC egress, serverless VPC connector |
| **Traffic splitting** | Gradual rollouts (10% to new revision, 90% to old) |

### Cloud Run vs AWS Equivalents

| Feature | Cloud Run | Fargate | Lambda |
| ------- | --------- | ------- | ------ |
| **Scale to zero** | Yes | No (min 1 task) | Yes |
| **Container** | Any OCI container | Any OCI container | Runtime-specific |
| **Cold start** | ~200-500ms | ~30s | ~100-500ms |
| **Max timeout** | 60 min / 24h (jobs) | No limit | 15 min |
| **Concurrency** | 1000 req/instance | 1 task/container | 1 req/invocation |
| **WebSockets** | Yes | Yes | No |
| **GPU** | Yes | No | No |

### Cloud Run Jobs

For batch processing (not HTTP-triggered):

```
Cloud Run Job -> runs container to completion -> exits
  - Parallel tasks: split work across N instances
  - Retries on failure
  - Scheduled via Cloud Scheduler
  - Up to 24 hours per execution
```

---

## Cloud Functions

Event-driven serverless functions (like AWS Lambda).

### Generations

| Feature | 1st Gen | 2nd Gen |
| ------- | ------- | ------- |
| **Runtime** | Custom | Built on Cloud Run |
| **Concurrency** | 1 request per instance | Up to 1000 per instance |
| **Timeout** | 9 minutes | 60 minutes |
| **Instance size** | Up to 8 GB | Up to 32 GB |
| **Triggers** | HTTP, Pub/Sub, Cloud Storage, Firestore | Same + Eventarc (any event) |
| **Traffic splitting** | No | Yes |

**Note:** 2nd Gen Cloud Functions are essentially Cloud Run with a function-based interface. For new projects, consider using Cloud Run directly.

---

## GKE

Google Kubernetes Engine -- the most mature managed Kubernetes service (Google invented Kubernetes).

### GKE vs EKS

| Feature | GKE | EKS |
| ------- | --- | --- |
| **Control plane** | Free | $0.10/hour (~$73/month) |
| **Node auto-provisioning** | Autopilot (fully managed) | Karpenter (community) |
| **Upgrades** | Automatic with rollback | Manual or managed add-on |
| **Networking** | VPC-native (default) | VPC CNI (manual config) |
| **Logging** | Built-in (Cloud Logging) | CloudWatch (manual config) |
| **GPU** | Native support | Native support |
| **Multi-cluster** | Anthos / Fleet | EKS Connector |

### GKE Modes

```
GKE Standard:
  You manage: nodes, node pools, scaling, security patches
  Control: full (like EKS)

GKE Autopilot:
  Google manages: nodes, scaling, security, patches
  You manage: just your pods
  Billing: per pod resources (not per node)
  Like: Fargate for Kubernetes
```

---

## Comparison

| Criteria | Compute Engine | Cloud Run | Cloud Functions | GKE |
| -------- | -------------- | --------- | --------------- | --- |
| **Abstraction** | IaaS (VM) | CaaS (container) | FaaS (function) | CaaS (K8s) |
| **Scale to zero** | No | Yes | Yes | No (Autopilot: yes for pods) |
| **Cold start** | N/A | ~200-500ms | ~200-500ms | N/A |
| **Max resources** | 416 vCPU, 12 TB RAM | 8 vCPU, 32 GB | 8 vCPU, 32 GB | Node-limited |
| **Stateful** | Yes | No (use volumes for persistence) | No | Yes |
| **Networking** | Full VPC | VPC connector/direct | VPC connector | Full VPC |
| **Best for** | Legacy, stateful, custom OS | HTTP APIs, microservices | Event handlers, webhooks | Complex microservices |

---

## Common Interview Questions

1. **What is Cloud Run and how does it differ from Lambda?** Cloud Run runs any OCI container that listens on a port. It scales to zero, handles up to 1000 concurrent requests per instance, supports WebSockets, and has 60-minute timeout. Lambda runs function handlers, one invocation per instance, 15-minute timeout.

2. **What is live migration and why is it unique to GCP?** GCP migrates running VMs between physical hosts without downtime. Uses iterative memory copying with a brief (<1s) switchover. AWS does not offer this -- maintenance requires stopping instances.

3. **GKE Standard vs Autopilot?** Standard: you manage nodes, more control, node-level billing. Autopilot: Google manages nodes, you deploy pods only, per-pod billing, more opinionated but less operational burden.

4. **When would you use Cloud Run vs GKE?** Cloud Run for simple HTTP services, microservices, and APIs that benefit from scale-to-zero. GKE for complex microservice architectures, stateful workloads, or when you need full Kubernetes control (custom operators, service mesh, etc.).

5. **What is the difference between preemptible VMs and spot VMs?** Both are deeply discounted (60-91% off). Preemptible has a 24-hour max lifetime. Spot VMs have no max lifetime but can still be reclaimed. Use for batch processing, CI/CD, and fault-tolerant workloads.
