# Kubernetes Production Patterns — Deep-Dive

Running Kubernetes in production is fundamentally different from running it in development. The gap is not in features — it is in reliability, security, operational maturity, and cost discipline. This guide covers the patterns, strategies, and hard-won lessons that separate toy clusters from production-grade platforms.

---

## Mental Model

Production Kubernetes is about managing **five tensions**:

```
Reliability ←──────→ Cost
  "Never go down"      "Don't waste money"

Speed ←──────────→ Safety
  "Ship fast"          "Don't break things"

Flexibility ←────→ Standardization
  "Let teams choose"   "Enforce consistency"
```

Every decision — from cluster architecture to deployment strategy — involves choosing where you sit on these spectrums.

---

## 1. Cluster Architecture

### 1.1 Control Plane HA

```
┌──────────────────────────────────────────────────────────────┐
│                    PRODUCTION CONTROL PLANE                    │
│                                                              │
│  AZ-a                  AZ-b                  AZ-c            │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │ API Server   │     │ API Server   │     │ API Server   │ │
│  │ Controller   │     │ Controller   │     │ Controller   │ │
│  │ Scheduler    │     │ Scheduler    │     │ Scheduler    │ │
│  │ etcd         │     │ etcd         │     │ etcd         │ │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘ │
│         │                    │                    │          │
│         └────────────────────┼────────────────────┘          │
│                              │                               │
│                     Load Balancer                             │
│                    (health checks /readyz)                    │
└──────────────────────────────────────────────────────────────┘
```

**Minimum production setup:**

- 3 control plane nodes across 3 AZs
- 3 etcd members (or 5 for critical clusters)
- Load balancer in front of API servers
- Dedicated control plane nodes (no workloads)

### 1.2 Node Pool Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      NODE POOLS                              │
│                                                              │
│  System Pool (dedicated to cluster infra):                   │
│  ├── 3x m5.xlarge (4 vCPU, 16 GiB)                        │
│  ├── Taints: CriticalAddonsOnly                             │
│  ├── Runs: CoreDNS, metrics-server, kube-proxy, CNI         │
│  └── Always On-Demand (never spot)                          │
│                                                              │
│  General Workload Pool:                                      │
│  ├── Auto-scaled: 3-50 nodes                                │
│  ├── Mix of m5.2xlarge (8 vCPU, 32 GiB)                   │
│  ├── 70% On-Demand, 30% Spot                               │
│  └── All AZs                                                │
│                                                              │
│  High-Memory Pool (databases, caches):                       │
│  ├── r5.2xlarge (8 vCPU, 64 GiB)                          │
│  ├── Taints: workload-type=memory:NoSchedule               │
│  ├── Always On-Demand                                       │
│  └── WaitForFirstConsumer volumes                           │
│                                                              │
│  GPU Pool (ML workloads):                                    │
│  ├── p3.2xlarge (1 GPU, 8 vCPU, 61 GiB)                  │
│  ├── Taints: nvidia.com/gpu=true:NoSchedule                │
│  ├── Spot with fallback to On-Demand                        │
│  └── Karpenter for just-in-time provisioning               │
│                                                              │
│  Spot Pool (batch, non-critical):                            │
│  ├── Mixed instance types (m5.xlarge, m5a.xlarge, m6i.xlarge)│
│  ├── 100% Spot                                              │
│  └── Tolerations for spot interruption                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Namespace Strategy

| Strategy        | Pattern                        | Best For                     |
| --------------- | ------------------------------ | ---------------------------- |
| Per-team        | `team-a`, `team-b`             | Small orgs, strong ownership |
| Per-environment | `dev`, `staging`, `production` | Simple apps, single team     |
| Per-app-per-env | `app1-prod`, `app1-staging`    | Microservices, isolation     |
| Per-tenant      | `tenant-acme`, `tenant-globex` | Multi-tenant SaaS            |

**Recommended: Per-team with environment labels:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: payments-team
  labels:
    team: payments
    env: production
    cost-center: cc-payments
    pod-security.kubernetes.io/enforce: restricted
```

Each namespace gets: ResourceQuota, LimitRange, NetworkPolicies (default deny), RBAC bindings for the owning team.

---

## 2. Resource Management

### 2.1 Request/Limit Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                REQUEST/LIMIT BEST PRACTICES                   │
│                                                              │
│  CPU:                                                        │
│    requests: Set based on steady-state usage (p50)           │
│    limits:   OMIT (controversial but recommended by many)    │
│              CPU limits cause throttling even when the node   │
│              has spare capacity. Throttling causes latency.  │
│              If you must set: 2-5x request.                  │
│                                                              │
│  Memory:                                                     │
│    requests: Set based on steady-state usage (p90)           │
│    limits:   Set to 1.2-2x requests                          │
│              Memory limits are hard — exceeding = OOM kill.  │
│              Set them, but not too close to requests.        │
│                                                              │
│  For Guaranteed QoS (critical workloads):                    │
│    requests = limits for both CPU and memory                 │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Priority Classes and Preemption

```yaml
# Critical system components (never preempted)
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: system-critical
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: 'System-critical pods (monitoring, ingress)'

---
# Production workloads
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: production-high
value: 100000
globalDefault: false
preemptionPolicy: PreemptLowerPriority

---
# Default for all workloads
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: default
value: 10000
globalDefault: true

---
# Batch/non-critical (can be preempted)
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: batch-low
value: 1000
preemptionPolicy: Never # Never preempt others
```

---

## 3. Deployment Strategies

### 3.1 Rolling Update (Default)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 25% # Allow 25% extra pods during update
    maxUnavailable: 0 # Zero-downtime (never reduce below desired)
```

**Best for:** Most stateless services. Simple, built-in, no extra tooling.

### 3.2 Blue-Green Deployment

```
┌─────────────┐                    ┌─────────────┐
│   Blue (v1)  │ ◄── Service ──── │ Ingress/LB   │
│  (3 replicas)│                    │              │
└─────────────┘                    └──────────────┘

Deploy v2:
┌─────────────┐
│  Green (v2)  │   (deployed, tested, NOT receiving traffic)
│  (3 replicas)│
└─────────────┘

Switch:
┌─────────────┐                    ┌─────────────┐
│  Green (v2)  │ ◄── Service ──── │ Ingress/LB   │
│  (3 replicas)│    (selector      │              │
└─────────────┘     updated)       └──────────────┘

┌─────────────┐
│   Blue (v1)  │   (kept for rollback, then decommissioned)
│  (3 replicas)│
└─────────────┘
```

**Implementation:** Two Deployments (blue, green). Service selector switches between them. Rollback = switch selector back.

**Best for:** Stateless services where you need instant rollback. Requires 2x resources during transition.

### 3.3 Canary Deployment

```
Traffic split:
  90% ──> v1 (stable)
  10% ──> v2 (canary)

Monitor error rates, latency for v2.
If healthy: gradually increase to 25%, 50%, 100%.
If unhealthy: immediately route 100% back to v1.
```

**With Argo Rollouts:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 10 # 10% traffic to canary
        - pause: { duration: 5m } # Wait 5 min, check metrics
        - setWeight: 30
        - pause: { duration: 5m }
        - setWeight: 60
        - pause: { duration: 5m }
        - setWeight: 100 # Full rollout
      canaryService: web-canary
      stableService: web-stable
      trafficRouting:
        nginx:
          stableIngress: web-ingress
      analysis:
        templates:
          - templateName: success-rate
        startingStep: 1
        args:
          - name: service-name
            value: web-canary
```

**With Flagger (automated canary):**

Flagger integrates with service meshes (Istio, Linkerd) or Ingress controllers (NGINX, Contour) to automatically shift traffic based on metrics analysis.

### 3.4 Progressive Delivery Comparison

| Strategy       | Rollback Speed          | Resource Overhead  | Complexity | Risk   |
| -------------- | ----------------------- | ------------------ | ---------- | ------ |
| Rolling Update | Minutes (undo)          | Minimal (maxSurge) | Low        | Medium |
| Blue-Green     | Instant (switch)        | 2x during deploy   | Medium     | Low    |
| Canary         | Instant (revert weight) | +10-20%            | High       | Lowest |

---

## 4. GitOps

### 4.1 GitOps Principles

```
Git repository = Single source of truth for desired cluster state

┌────────────┐    push     ┌──────────────┐    sync    ┌──────────────┐
│ Developer   │ ──────────>│ Git Repo      │ ──────────>│ K8s Cluster   │
│             │            │ (manifests)   │            │ (actual state)│
└────────────┘            └──────────────┘            └──────────────┘
                                 ^                            │
                                 │         drift              │
                                 └────── detection ───────────┘
```

**The two GitOps tools:**

| Feature           | ArgoCD                                  | Flux                             |
| ----------------- | --------------------------------------- | -------------------------------- |
| UI                | Rich web UI                             | CLI-first (optional UI)          |
| Architecture      | Centralized (single ArgoCD manages all) | Decentralized (Flux per cluster) |
| Multi-cluster     | Built-in                                | Via Kustomize controller         |
| Drift detection   | Visual diff in UI                       | Events and alerts                |
| Sync strategy     | Auto or manual sync                     | Auto or manual                   |
| Helm support      | Native                                  | HelmRelease CRD                  |
| Kustomize support | Native                                  | Kustomize controller             |
| RBAC              | Project-based, SSO integration          | Kubernetes-native RBAC           |

### 4.2 ArgoCD App-of-Apps Pattern

```yaml
# Root application that manages all other applications
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/k8s-config
    targetRevision: main
    path: apps # Directory containing Application manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true # Auto-fix drift
```

```
apps/
├── team-a-app.yaml              # Application CR for team A's services
├── team-b-app.yaml              # Application CR for team B's services
├── monitoring.yaml              # Application CR for Prometheus stack
├── ingress.yaml                 # Application CR for ingress controller
└── cert-manager.yaml            # Application CR for cert-manager
```

### 4.3 GitOps Directory Structure

```
k8s-config/
├── apps/                        # ArgoCD Application manifests (app-of-apps)
├── base/                        # Base manifests per service
│   ├── api-service/
│   │   ├── kustomization.yaml
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   └── web-service/
│       ├── kustomization.yaml
│       └── ...
├── overlays/                    # Environment-specific overlays
│   ├── development/
│   │   ├── kustomization.yaml
│   │   └── patches/
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── patches/
│   └── production/
│       ├── kustomization.yaml
│       └── patches/
├── infrastructure/              # Cluster infrastructure (CRDs, operators)
│   ├── cert-manager/
│   ├── external-secrets/
│   ├── prometheus/
│   └── ingress-nginx/
└── clusters/                    # Cluster-specific configuration
    ├── us-east-1/
    └── eu-west-1/
```

---

## 5. Multi-Cluster

### 5.1 Why Multi-Cluster

| Reason           | Description                                           |
| ---------------- | ----------------------------------------------------- |
| **Blast radius** | Limit the impact of cluster-level failures            |
| **Compliance**   | Data residency requirements (EU data in EU cluster)   |
| **Latency**      | Deploy close to users (US, EU, APAC clusters)         |
| **Isolation**    | Separate production from staging, or tenant isolation |
| **Upgrades**     | Canary cluster upgrades before rolling to all         |
| **Scale**        | Single cluster limits (~5,000 nodes, ~150,000 pods)   |

### 5.2 Multi-Cluster Patterns

```
Pattern 1: Replicated (each cluster is independent)
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ US-East  │  │ EU-West  │  │ AP-South │
  │ (full    │  │ (full    │  │ (full    │
  │  stack)  │  │  stack)  │  │  stack)  │
  └─────────┘  └─────────┘  └─────────┘
  Global LB routes users to nearest cluster.
  Each cluster is self-contained.

Pattern 2: Federated (centrally managed, workloads distributed)
  ┌──────────────────────────┐
  │ Management Cluster       │
  │ (ArgoCD, Flux, policies) │
  └────────┬─────────────────┘
           │
     ┌─────┼─────────┐
     v     v         v
  ┌─────┐ ┌─────┐ ┌─────┐
  │ Wkld │ │ Wkld │ │ Wkld │
  │ Cl-1 │ │ Cl-2 │ │ Cl-3 │
  └─────┘ └─────┘ └─────┘

Pattern 3: Service Mesh Multi-Cluster
  Istio/Linkerd spans clusters.
  Services can call across clusters transparently.
  mTLS between clusters.
```

---

## 6. Backup and Disaster Recovery

### 6.1 What to Back Up

| Component          | Backup Method              | Frequency        | RPO      |
| ------------------ | -------------------------- | ---------------- | -------- |
| etcd               | `etcdctl snapshot save`    | Every 30 min     | 30 min   |
| K8s resources      | Velero                     | Daily            | 24 hours |
| Persistent Volumes | CSI VolumeSnapshots        | Hourly           | 1 hour   |
| Application data   | App-level backup (pg_dump) | Daily            | 24 hours |
| Git repos          | Git remote                 | Real-time (push) | 0        |
| Secrets vault      | Vault replication / backup | Real-time        | 0        |

### 6.2 Velero

```bash
# Install Velero
velero install \
  --provider aws \
  --bucket my-velero-backup \
  --secret-file ./credentials-velero \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1

# Create a backup
velero backup create production-backup \
  --include-namespaces production \
  --include-resources deployments,services,configmaps,secrets,pvc

# Schedule regular backups
velero schedule create nightly \
  --schedule="0 2 * * *" \
  --include-namespaces production \
  --ttl 720h                              # Retain for 30 days

# Restore
velero restore create --from-backup production-backup \
  --namespace-mappings production:production-restored

# Check backup status
velero backup describe production-backup
velero backup logs production-backup
```

### 6.3 Disaster Recovery Tiers

| Tier       | Strategy                                  | RTO       | RPO        | Cost    |
| ---------- | ----------------------------------------- | --------- | ---------- | ------- |
| **Tier 1** | Active-Active multi-cluster               | Minutes   | 0          | Highest |
| **Tier 2** | Warm standby (scaled-down backup cluster) | 15-30 min | 30 min     | Medium  |
| **Tier 3** | Cold restore (rebuild from backups)       | 1-4 hours | 1-24 hours | Lowest  |

---

## 7. Cost Optimization

### 7.1 Right-Sizing Pods

```bash
# Use VPA in recommendation mode to find actual resource usage
kubectl describe vpa <name>
# Target recommendation shows what the pod actually needs

# Common finding:
# Requested: 1 CPU, 2Gi memory
# Actual usage: 0.2 CPU, 400Mi memory
# Waste: 80% CPU, 80% memory
```

**Systematic right-sizing:**

1. Deploy VPA in recommendation mode for all workloads
2. After 7 days, compare recommendations to current requests
3. Adjust requests to target recommendation (add 20% buffer)
4. Repeat quarterly

### 7.2 Cluster Autoscaler / Karpenter

```yaml
# Karpenter NodePool (AWS)
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ['on-demand', 'spot'] # Use spot when possible
        - key: kubernetes.io/arch
          operator: In
          values: ['amd64']
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ['m', 'c', 'r'] # General, compute, memory
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ['4'] # 5th gen or newer
  limits:
    cpu: '1000' # Max total CPU
    memory: '2000Gi' # Max total memory
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s # Aggressive consolidation
```

### 7.3 Spot/Preemptible Instance Strategy

```
DO:
  ✓ Use for stateless workloads (web servers, workers)
  ✓ Diversify across instance types (m5, m5a, m6i, m6a)
  ✓ Use PodDisruptionBudgets to survive spot terminations
  ✓ Handle graceful shutdown (preStop hook + SIGTERM)
  ✓ Spread across AZs for availability

DON'T:
  ✗ Use for databases or stateful workloads
  ✗ Use for control plane components
  ✗ Rely on a single instance type
  ✗ Ignore the 2-minute termination warning
```

### 7.4 Cost Visibility

| Tool                   | What It Does                                          |
| ---------------------- | ----------------------------------------------------- |
| **Kubecost**           | Real-time cost allocation per namespace/team/workload |
| **OpenCost**           | Open-source cost monitoring (CNCF project)            |
| **Cloud billing tags** | Map K8s namespaces/labels to cloud billing            |

---

## 8. Upgrade Strategy

### 8.1 Upgrade Order

```
1. Read the changelog and deprecation guide
   └── Check for API removals that affect your manifests

2. Test in staging cluster first
   └── Apply same upgrade, run integration tests

3. Upgrade control plane
   └── API server, controller manager, scheduler, etcd
   └── In managed K8s: one click (EKS, GKE, AKS)

4. Upgrade add-ons
   └── CoreDNS, kube-proxy, CNI, CSI drivers
   └── Check compatibility matrix

5. Upgrade nodes (rolling)
   └── Cordon → Drain → Upgrade → Uncordon
   └── Or: replace node (launch new, drain old)

6. Verify
   └── kubectl get nodes (all Ready, correct version)
   └── Run smoke tests
   └── Check monitoring for anomalies
```

### 8.2 Node Drain Process

```bash
# Cordon: mark node as unschedulable
kubectl cordon node-1
# Node node-1 cordoned

# Drain: evict all pods (respects PDBs)
kubectl drain node-1 \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --grace-period=60 \
  --timeout=300s

# After upgrade, uncordon
kubectl uncordon node-1
```

**Critical details:**

- Drain respects PodDisruptionBudgets — it waits if removing a pod would violate the budget
- DaemonSet pods are not evicted (they are managed by the DaemonSet controller)
- Pods without controllers (bare pods) are lost — always use Deployments/StatefulSets
- Set appropriate timeouts to prevent stuck drains

### 8.3 Version Skew Policy

| Component  | Allowed Skew from API Server                  |
| ---------- | --------------------------------------------- |
| kubelet    | N-2 (can be up to 2 minor versions behind)    |
| kube-proxy | Same minor as kubelet                         |
| kubectl    | +/- 1 (one version ahead or behind)           |
| etcd       | Specific version requirements per K8s release |

**Never skip minor versions when upgrading.** 1.26 → 1.28 is NOT supported. You must go 1.26 → 1.27 → 1.28.

---

## 9. Zero-Downtime Deployment Checklist

```
┌─────────────────────────────────────────────────────────────┐
│              ZERO-DOWNTIME DEPLOYMENT CHECKLIST               │
│                                                              │
│  [ ] Readiness probe configured and tested                   │
│      (pod is not added to endpoints until it passes)         │
│                                                              │
│  [ ] PodDisruptionBudget set (minAvailable or maxUnavailable)│
│      (prevents too many pods going down during updates)      │
│                                                              │
│  [ ] preStop hook with sleep (5-10 seconds)                  │
│      (allows time for endpoints to be updated before         │
│       the container starts shutting down)                    │
│                                                              │
│  [ ] Application handles SIGTERM gracefully                  │
│      (finishes in-flight requests, closes connections)       │
│                                                              │
│  [ ] terminationGracePeriodSeconds is long enough            │
│      (preStop time + app shutdown time + buffer)             │
│                                                              │
│  [ ] Rolling update configured                               │
│      maxSurge > 0, maxUnavailable: 0 for strict zero-DT     │
│                                                              │
│  [ ] Multiple replicas across zones                          │
│      (single replica = single point of failure)              │
│                                                              │
│  [ ] Connection draining in load balancer                    │
│      (cloud LB deregistration delay)                        │
│                                                              │
│  [ ] Health check grace period on LB                         │
│      (don't route traffic until new pods are truly ready)    │
│                                                              │
│  [ ] Database migrations are backward-compatible             │
│      (old code must work with new schema during rollout)     │
└─────────────────────────────────────────────────────────────┘
```

**The preStop race condition explained:**

```
Without preStop:
  t=0: Pod terminating signal
  t=0: SIGTERM sent to container     ← App starts shutting down
  t=0: Endpoints removal initiated   ← But still in progress...
  t=0-2s: Traffic still arriving!    ← Requests hit shutting-down pod → 5xx

With preStop sleep(10):
  t=0:  Pod terminating signal
  t=0:  preStop starts (sleep 10)
  t=0:  Endpoints removal initiated
  t=2s: Endpoints updated across all nodes
  t=5s: kube-proxy rules updated
  t=10s: preStop finishes
  t=10s: SIGTERM sent to container   ← No more traffic arriving
  t=10s: App gracefully shuts down   ← Zero errors
```

---

## 10. Service Mesh in Production

### 10.1 When You Need a Service Mesh

| You NEED a mesh when:                      | You DON'T need a mesh when:            |
| ------------------------------------------ | -------------------------------------- |
| mTLS between all services is required      | You have < 10 services                 |
| Fine-grained traffic control (canary, A/B) | Simple load balancing suffices         |
| L7 observability without code changes      | Prometheus + Grafana covers your needs |
| Cross-service authorization policies       | Kubernetes NetworkPolicies suffice     |
| Multi-cluster service discovery            | Single cluster                         |

### 10.2 Service Mesh Overhead

| Metric          | Without Mesh | With Istio Sidecar |
| --------------- | ------------ | ------------------ |
| Memory per pod  | 0            | +50-100 MB (Envoy) |
| Latency per hop | 0            | +1-5 ms            |
| CPU per pod     | 0            | +10-50m            |
| Network payload | Original     | +TLS overhead      |

**Rule of thumb:** If the mesh overhead is < 5% of your total resource usage and the features justify it, proceed. If overhead is significant relative to your workloads, reconsider.

---

## 11. Common Gotchas

### 11.1 No PDB Means Node Drain Takes Everything Down

Without PodDisruptionBudgets, a node drain evicts ALL pods on the node simultaneously. If all replicas of a service happen to be on one node, the service goes down completely. Always create PDBs for production services.

### 11.2 Spot Instance Termination Handling

Spot instances get a 2-minute warning before termination. If your pod's graceful shutdown takes longer, data may be lost. Set `terminationGracePeriodSeconds` appropriately and handle SIGTERM.

### 11.3 etcd Backup Is Not Tested

Having etcd backups is not enough — you must TEST the restore procedure. Many teams discover their backup is corrupt or the restore process is broken only during an actual disaster. Run restore drills quarterly.

### 11.4 Cluster Autoscaler vs Scheduling

The Cluster Autoscaler adds nodes when pods are Pending. But adding a node takes 2-5 minutes (boot, join, CNI). During this time, pods wait. Over-provision slightly to handle burst traffic, or use Karpenter (30-90 seconds).

### 11.5 ConfigMap/Secret Changes Don't Trigger Rollouts

Updating a ConfigMap referenced by a Deployment does NOT trigger a rolling update. Old pods keep the old config. Use ConfigMap hash annotations, Kustomize configMapGenerator, or Reloader to detect changes.

### 11.6 DNS-Based Service Discovery Caching

gRPC clients and some HTTP clients resolve DNS once and cache the result. For ClusterIP services, this is fine (the VIP is stable). For headless services, the client holds a stale pod IP after the pod moves. Use client-side service discovery or reconnect logic.

### 11.7 Resource Quota Blocks Deployments

If a ResourceQuota is exhausted and a Deployment tries to create pods, the pods stay in a `FailedCreate` event on the ReplicaSet. This is easy to miss because the Deployment status may not clearly show the issue. Check ReplicaSet events.

### 11.8 Ingress Controller as Single Point of Failure

The Ingress controller is itself a Deployment. If it goes down, ALL external traffic stops. Run at least 2 replicas across AZs, set PDB minAvailable: 1, and use pod anti-affinity.

### 11.9 Certificate Expiry

TLS certificates (cluster CA, API server, etcd, kubelet, webhook) expire. If not auto-rotated, they silently break authentication. Monitor certificate expiry dates and automate rotation with cert-manager.

### 11.10 ArgoCD Sync Loops

If a mutating webhook modifies resources after ArgoCD applies them (e.g., adds default values), ArgoCD sees drift and re-syncs endlessly. Use `ignoreDifferences` in the Application spec to exclude webhook-added fields.

---

## 12. Interview Questions

### Q1: "Design a production-ready Kubernetes setup for a company with 50 microservices."

**Deep answer:** (1) Cluster architecture: 3 clusters — production (multi-AZ), staging, management (ArgoCD, monitoring). Production cluster: 3 control plane nodes, auto-scaled worker node pools (general, high-memory, spot). (2) Namespace per team (5-10 teams), each with ResourceQuota, LimitRange, default-deny NetworkPolicies, Restricted PSA. (3) GitOps with ArgoCD: app-of-apps pattern, Kustomize overlays per environment, automated sync for staging, manual approval for production. (4) Deployment: Argo Rollouts for canary deployments, PDBs on all services, readiness probes and preStop hooks for zero-downtime. (5) Security: OIDC for human auth, IRSA/Workload Identity for service-to-cloud auth, External Secrets Operator for secrets, Kyverno for admission policies (image registry restriction, required labels, resource limits). (6) Observability: Prometheus + Grafana + AlertManager for metrics, Fluent Bit + Loki for logs, OpenTelemetry + Tempo for traces. Alert on error rates, latency, pod restarts, resource exhaustion. (7) Networking: Cilium (eBPF, Network Policies, Hubble observability), Ingress NGINX with cert-manager for TLS. (8) Cost: Kubecost for allocation, VPA in recommendation mode for right-sizing, spot instances for non-critical workloads, Karpenter for efficient node scaling.

### Q2: "How do you achieve zero-downtime deployments in Kubernetes?"

**Deep answer:** Four requirements must ALL be met: (1) Multiple replicas spread across AZs — single replica = SPOF. (2) Readiness probes that accurately reflect when a pod can serve traffic — the pod is not added to service endpoints until it passes. (3) Rolling update with maxUnavailable: 0 — ensures the old pods are not removed until new pods are Ready. (4) Graceful shutdown: preStop hook with a sleep (5-10s) to allow endpoint propagation, then the app handles SIGTERM by completing in-flight requests, closing connections, and exiting cleanly. terminationGracePeriodSeconds must be long enough for the entire shutdown sequence. Additionally: PodDisruptionBudgets prevent too many pods being evicted at once during node drains. Database migrations must be backward-compatible (old code works with new schema). Load balancer connection draining ensures in-flight connections complete before the target is deregistered.

### Q3: "Explain GitOps and how ArgoCD works."

**Deep answer:** GitOps is an operational model where the desired state of infrastructure is declared in a Git repository, and an agent continuously reconciles the actual cluster state to match. ArgoCD is a GitOps controller for Kubernetes. It watches a Git repository containing K8s manifests (YAML, Kustomize, Helm charts). When someone pushes a change, ArgoCD detects the diff between the Git state and the cluster state. In auto-sync mode, it applies the changes. In manual mode, it shows the diff and waits for approval. Key features: the web UI shows real-time sync status, drift detection, and a visual resource tree. App-of-apps pattern: a root Application CR manages other Application CRs, enabling one-click management of hundreds of services. Sync waves and hooks control the order of operations (CRDs before operators, infrastructure before apps). Health checks verify resources are not just applied but actually healthy. Self-heal automatically reverts manual changes to cluster resources back to the Git-declared state.

### Q4: "How would you handle a Kubernetes cluster upgrade from 1.28 to 1.30?"

**Deep answer:** You cannot skip minor versions, so this is a two-step upgrade: 1.28 → 1.29, then 1.29 → 1.30. For each step: (1) Read the release changelog and deprecation guide. Check if any API versions used in your manifests are removed. Run `kubectl deprecations` or `pluto detect-all-in-cluster`. (2) Upgrade staging cluster first. Run full integration test suite. (3) In production: upgrade control plane first (in managed K8s, this is usually a button click with zero downtime). (4) Upgrade add-ons: CoreDNS, kube-proxy, CNI plugin, CSI drivers, cert-manager — check each one's compatibility matrix with the new K8s version. (5) Upgrade nodes in a rolling fashion: for each node group, launch new nodes with the new kubelet version, cordon and drain old nodes (kubectl drain respects PDBs), verify workloads are healthy on new nodes, then terminate old nodes. (6) Verify: all nodes Ready, correct version, monitoring shows no anomalies, run smoke tests. (7) Wait at least 1 week before proceeding to the next minor version upgrade to catch any delayed issues.

### Q5: "How do you manage costs in a Kubernetes cluster?"

**Deep answer:** Cost management has three dimensions: visibility, optimization, and governance. Visibility: deploy Kubecost or OpenCost to attribute costs to namespaces, teams, and workloads using Kubernetes labels. Map to cloud billing using tags. Share monthly reports with team leads. Optimization: (1) Right-size pods — use VPA recommendations to identify over-provisioned workloads (typical waste: 60-80% of requested resources). (2) Use spot instances for fault-tolerant workloads (30-70% savings). (3) Use Karpenter or Cluster Autoscaler to remove idle nodes. Karpenter's consolidation feature actively bin-packs workloads onto fewer nodes. (4) Set cluster autoscaler to scale down aggressively (scale-down-utilization-threshold: 0.5). (5) Review storage: delete unattached PVs, right-size PVCs, use appropriate storage tiers. Governance: (1) ResourceQuota per namespace caps maximum spend. (2) Require resource requests on all pods (admission policy). (3) Priority classes ensure non-critical workloads are preempted first. (4) Implement namespace-level cost budgets and alert when teams approach their budget.

---

## 13. Quick Reference

| Area          | Recommendation                                                     |
| ------------- | ------------------------------------------------------------------ |
| Control plane | 3+ nodes, 3 AZs, dedicated machines                                |
| etcd          | Local SSDs, backup every 30 min, test restore quarterly            |
| Node pools    | Separate system, workload, and specialty pools                     |
| Namespaces    | Per-team, with ResourceQuota + LimitRange + NetworkPolicies        |
| Deployments   | Rolling update, maxUnavailable: 0, readiness probes, preStop hooks |
| Security      | Restricted PSA, OIDC auth, external secrets, image signing         |
| Observability | Prometheus, Fluent Bit + Loki, OpenTelemetry                       |
| GitOps        | ArgoCD app-of-apps, Kustomize overlays, manual prod approval       |
| Upgrades      | Never skip versions, staging first, rolling node replacement       |
| Cost          | VPA recommendations, spot instances, Karpenter, Kubecost           |

| Deployment Strategy    | Rollback | Resources        | Complexity | Best For                |
| ---------------------- | -------- | ---------------- | ---------- | ----------------------- |
| Rolling Update         | Minutes  | Low overhead     | Low        | Most services           |
| Blue-Green             | Instant  | 2x during deploy | Medium     | Quick rollback needed   |
| Canary (Argo Rollouts) | Instant  | 10-20% extra     | High       | Risk-sensitive services |
