# Azure Compute Services

Azure offers compute from raw VMs to fully serverless containers. Container Apps (with built-in Dapr) and Azure Functions with Durable Functions are Azure's standout serverless offerings.

---

## Table of Contents

1. [Virtual Machines](#virtual-machines)
2. [App Service](#app-service)
3. [Azure Functions](#azure-functions)
4. [AKS](#aks)
5. [Container Apps](#container-apps)
6. [Comparison](#comparison)
7. [Common Interview Questions](#common-interview-questions)

---

## Virtual Machines

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **VM families** | B (burstable), D (general), E (memory), F (compute), N (GPU) | t3, m6i, r6i, c6i, p4d |
| **Scale Sets (VMSS)** | Auto-scaling VM groups with LB | Auto Scaling Groups |
| **Spot VMs** | Up to 90% discount, evictable | Spot Instances |
| **Reserved** | 1-3 year commitment, up to 72% savings | Reserved Instances |
| **Hybrid Benefit** | Use existing Windows Server/SQL licenses | No equivalent |
| **Availability Sets** | Fault/update domain distribution within a datacenter | Placement Groups |
| **Availability Zones** | Physically separate datacenters within a region | Availability Zones |

### Azure Hybrid Benefit

```
Unique to Azure: bring your existing Windows Server or SQL Server licenses
  On-prem Windows Server license -> use on Azure VMs (save ~40%)
  SA (Software Assurance) -> also covers Azure SQL

This is a major cost advantage for enterprises migrating from on-prem Windows.
```

---

## App Service

Fully managed PaaS for web apps, APIs, and mobile backends.

| Feature | Details |
| ------- | ------- |
| **Runtimes** | .NET, Java, Node.js, Python, PHP, Ruby, Go |
| **Scaling** | Auto-scale based on metrics or schedule |
| **Deployment** | Git push, GitHub Actions, Azure DevOps, containers |
| **Custom domains** | Free managed SSL certificates |
| **Slots** | Deployment slots for staging/production swap (zero-downtime) |
| **Networking** | VNet integration, private endpoints |
| **WebSockets** | Supported |
| **Always On** | Keep app warm (prevent cold starts) |

### Deployment Slots

```
Production Slot: app.azurewebsites.net     (live traffic)
Staging Slot:    app-staging.azurewebsites.net  (test traffic)

Deploy to staging -> verify -> SWAP slots
  - Zero downtime deployment
  - Instant rollback (swap back)
  - Slot-specific app settings (different DB connections)
```

---

## Azure Functions

Serverless compute triggered by events.

### Hosting Plans

| Plan | Scaling | Max Timeout | Cold Start | Best For |
| ---- | ------- | ----------- | ---------- | -------- |
| **Consumption** | 0 to 200 instances | 10 min (default, 230 max) | Yes | Event-driven, low/variable traffic |
| **Premium** | Pre-warmed instances | 60 min | Minimal | Production workloads, VNet |
| **Dedicated (App Service)** | Manual/auto-scale | No limit | No | Always-on, predictable load |
| **Flex Consumption** | 0 to 1000 | 30 min | Minimal | High-scale event processing |

### Durable Functions

Stateful serverless workflows (unique to Azure).

```javascript
// Orchestrator function (defines the workflow)
const df = require("durable-functions");

module.exports = df.orchestrator(function* (context) {
    // Fan-out: run 3 activities in parallel
    const tasks = [];
    tasks.push(context.df.callActivity("ProcessOrder", order1));
    tasks.push(context.df.callActivity("ProcessOrder", order2));
    tasks.push(context.df.callActivity("ProcessOrder", order3));

    // Fan-in: wait for all to complete
    const results = yield context.df.Task.all(tasks);

    // Human interaction: wait for approval (up to 72 hours)
    const approved = yield context.df.waitForExternalEvent("ApprovalEvent", 72 * 60 * 60);

    if (approved) {
        yield context.df.callActivity("ShipOrder", results);
    }
});
```

| Pattern | Description |
| ------- | ----------- |
| **Function chaining** | Sequential activity execution |
| **Fan-out/fan-in** | Parallel execution, aggregate results |
| **Async HTTP APIs** | Long-running operations with status polling |
| **Monitor** | Periodic polling with flexible intervals |
| **Human interaction** | Wait for external events (approvals) |
| **Aggregator** | Stateful entity pattern (like Durable Objects) |

---

## AKS

Azure Kubernetes Service -- managed Kubernetes.

| Feature | AKS | EKS | GKE |
| ------- | --- | --- | --- |
| **Control plane** | Free | $0.10/hr ($73/mo) | Free (Standard) |
| **Node auto-scaling** | Cluster autoscaler + KEDA | Karpenter | Autopilot |
| **Networking** | Azure CNI or kubenet | VPC CNI | VPC-native |
| **Ingress** | Application Gateway Ingress | ALB Ingress | GKE Ingress |
| **Identity** | Azure AD + Managed Identity | IAM Roles for SA | Workload Identity |
| **Service mesh** | Istio add-on, Open Service Mesh | App Mesh | Istio (GKE Enterprise) |

---

## Container Apps

Serverless container platform built on Kubernetes (with Dapr and KEDA).

```
Container Image -> Container Apps -> Auto-scales 0 to N
                                      |
                                      Dapr (built-in):
                                        - Service-to-service invocation
                                        - State management
                                        - Pub/sub messaging
                                        - Input/output bindings
```

| Feature | Container Apps | Cloud Run | Fargate |
| ------- | -------------- | --------- | ------- |
| **Scale to zero** | Yes | Yes | No (min 1) |
| **Dapr** | Built-in | No | No |
| **KEDA** | Built-in (event-driven scaling) | N/A | N/A |
| **Revisions** | Traffic splitting | Traffic splitting | No |
| **Microservices** | Service discovery, Dapr | Manual config | Service Connect |
| **Best for** | Microservices with Dapr | HTTP APIs, simple services | Any container workload |

---

## Comparison

| Service | Abstraction | Scale to Zero | Best For |
| ------- | ----------- | ------------- | -------- |
| **VMs** | IaaS | No | Full control, legacy apps |
| **App Service** | PaaS | No | Web apps, deployment slots |
| **Functions** | FaaS | Yes (Consumption) | Event handlers, short tasks |
| **AKS** | CaaS (K8s) | No (pods can) | Complex microservices |
| **Container Apps** | CaaS (serverless) | Yes | Microservices with Dapr |

---

## Common Interview Questions

1. **What are Durable Functions?** Stateful serverless workflows unique to Azure Functions. Support patterns like chaining, fan-out/fan-in, human interaction (wait for external events), and monitoring. State is managed by the Durable Task Framework, not your code.

2. **Container Apps vs AKS?** Container Apps for simpler microservices that benefit from Dapr and KEDA without managing Kubernetes. AKS for complex architectures needing full K8s control (custom operators, service mesh, fine-grained networking).

3. **What is Azure Hybrid Benefit?** Enterprises can apply existing Windows Server/SQL Server licenses to Azure VMs, saving up to 40%. Unique to Azure and a major cost advantage for Microsoft shops migrating to cloud.

4. **What are deployment slots in App Service?** Separate environments (staging, production) under the same App Service plan. Deploy to staging, test, then swap with production (zero-downtime). Can have slot-specific settings. Instant rollback by swapping back.

5. **How does Azure Functions pricing work?** Consumption plan: pay per execution (first 1M free) + per GB-s of compute. Premium plan: pre-warmed instances, per vCPU/memory/hour. Dedicated: App Service plan pricing (always running).
