# Kubernetes Cluster Architecture — Deep-Dive

A Kubernetes cluster is a distributed system with a clear separation between the **control plane** (brain) and the **data plane** (muscle). Understanding this architecture at depth — not just "what are the components" but how they interact, fail, and recover — is what separates surface-level knowledge from real expertise.

---

## Mental Model

Think of Kubernetes as a **database-backed control loop system**:

```
                         ┌─────────────────────────────────┐
                         │        CONTROL PLANE             │
                         │                                  │
  kubectl ──────────────>│  kube-apiserver                  │
  (HTTP REST)            │       │                          │
                         │       ├── authn ── authz ── admission
                         │       │                          │
                         │       v                          │
                         │     etcd (source of truth)       │
                         │       ^                          │
                         │       │                          │
                         │  kube-controller-manager          │
                         │  (watch etcd → reconcile)        │
                         │                                  │
                         │  kube-scheduler                  │
                         │  (watch unscheduled pods → bind) │
                         │                                  │
                         │  cloud-controller-manager         │
                         │  (cloud-specific reconciliation) │
                         └────────────┬─────────────────────┘
                                      │
                              ┌───────┴───────┐
                              │   DATA PLANE   │
                         ┌────┴────┐     ┌────┴────┐
                         │  Node 1  │     │  Node 2  │
                         │ kubelet  │     │ kubelet  │
                         │kube-proxy│     │kube-proxy│
                         │ runtime  │     │ runtime  │
                         └──────────┘     └──────────┘
```

**Key insight:** The kube-apiserver is the ONLY component that talks to etcd. Every other component (scheduler, controllers, kubelet) communicates exclusively through the API server. This is a deliberate design decision — it enforces a single point of authentication, authorization, and audit logging.

---

## 1. Control Plane Components

### 1.1 kube-apiserver

The API server is the **front door** to the entire cluster. It is a REST API server that exposes the Kubernetes API. Everything — kubectl, controllers, kubelet, external tools — talks to the API server via HTTPS.

**What it does:**

- Serves the Kubernetes REST API (CRUD on all resources)
- Authenticates and authorizes every request
- Runs admission controllers (mutating and validating)
- Persists state to etcd
- Serves as the hub for watch notifications (list-watch pattern)

**API structure:**

```
/api/v1/                          # Core API group (pods, services, configmaps)
/apis/apps/v1/                    # apps group (deployments, statefulsets)
/apis/batch/v1/                   # batch group (jobs, cronjobs)
/apis/networking.k8s.io/v1/       # networking (ingress, networkpolicy)
/apis/rbac.authorization.k8s.io/  # RBAC (roles, bindings)
```

**The list-watch pattern** is how the entire system stays synchronized:

```
1. Controller starts: GET /api/v1/pods?watch=true
2. API server sends current state + resourceVersion
3. API server streams changes as they happen:
   {"type":"ADDED","object":{"kind":"Pod",...}}
   {"type":"MODIFIED","object":{"kind":"Pod",...}}
   {"type":"DELETED","object":{"kind":"Pod",...}}
4. Controller acts on each event
5. If connection drops, controller reconnects from last resourceVersion
```

**HA deployment:** Run 3+ API server instances behind a load balancer. They are stateless — all state is in etcd.

```bash
# Inspect the API server configuration (kubeadm cluster)
kubectl -n kube-system get pod kube-apiserver-controlplane -o yaml

# Key flags to understand:
# --etcd-servers=https://127.0.0.1:2379
# --service-cluster-ip-range=10.96.0.0/12
# --enable-admission-plugins=NodeRestriction,MutatingAdmissionWebhook,...
# --authorization-mode=Node,RBAC
# --tls-cert-file, --tls-private-key-file
```

### 1.2 etcd

etcd is a **distributed, strongly consistent key-value store** that serves as the single source of truth for the entire cluster. If etcd is lost and unrecoverable, the cluster is gone.

**How data is stored:**

```
/registry/pods/default/nginx-abc123
/registry/deployments/default/web
/registry/services/specs/default/my-service
/registry/secrets/default/my-secret
/registry/configmaps/kube-system/coredns
```

Every Kubernetes resource is stored as a serialized Protocol Buffers object under `/registry/<resource-type>/<namespace>/<name>`.

**Raft consensus protocol:**

etcd uses Raft to maintain consistency across multiple nodes. Here is how it works:

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  etcd-1   │     │  etcd-2   │     │  etcd-3   │
  │ (LEADER)  │────>│(FOLLOWER) │     │(FOLLOWER) │
  │           │────>│           │     │           │
  │           │────────────────────>│           │
  └──────────┘     └──────────┘     └──────────┘

  Write flow:
  1. Client sends write to leader
  2. Leader appends to its log
  3. Leader replicates log entry to followers
  4. Majority (2 of 3) acknowledge
  5. Leader commits and responds to client
  6. Followers commit on next heartbeat
```

**Why 3 or 5 nodes:**

- 3 nodes: tolerates 1 failure (quorum = 2)
- 5 nodes: tolerates 2 failures (quorum = 3)
- 7 nodes: tolerates 3 failures but higher write latency — rarely used
- Even numbers are NEVER recommended (split-brain risk with no benefit)

**Performance requirements:**

- Disk latency: < 10ms for 99th percentile (SSD strongly recommended)
- Network latency: < 10ms between etcd members
- Database size: default limit 2GB (can increase to 8GB, but reconsider your approach)

```bash
# etcd health check
etcdctl endpoint health --cluster \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Backup etcd (CRITICAL for disaster recovery)
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-snapshot.db \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Verify backup
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-snapshot.db --write-table

# Restore from backup (destructive — all members must be stopped)
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restore

# Check etcd database size
etcdctl endpoint status --write-table
# +------------------+---------+-----------+---------+-----------+
# |     ENDPOINT     |   ID    |  VERSION  | DB SIZE | IS LEADER |
# +------------------+---------+-----------+---------+-----------+
# | https://...:2379 | 8e9e... |   3.5.9   |  45 MB  |    true   |
# +------------------+---------+-----------+---------+-----------+

# Defragment etcd (reclaim space after compaction)
etcdctl defrag --cluster
```

**etcd compaction and snapshots:**

- Kubernetes automatically compacts etcd (removes old revisions)
- Default: retains 5 minutes of history
- Snapshots are periodic disk writes of the entire database
- Both are essential to prevent etcd from running out of space

### 1.3 kube-scheduler

The scheduler watches for newly created pods that have no node assigned (spec.nodeName is empty) and selects a node for them to run on.

**Scheduling pipeline:**

```
Unscheduled Pod
      │
      v
┌─────────────────────────────────────────────────────┐
│ 1. FILTERING (Predicates)                           │
│    Remove nodes that cannot run the pod:            │
│    - NodeSelector / Node Affinity                   │
│    - Taints and tolerations                         │
│    - Resource requests (CPU, memory, GPU)           │
│    - PodAffinity / PodAntiAffinity                  │
│    - Volume topology constraints                    │
│    - Max pods per node                              │
│    Result: list of feasible nodes                   │
└────────────────────┬────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────┐
│ 2. SCORING (Priorities)                             │
│    Rank feasible nodes 0-100 on each priority:      │
│    - LeastRequestedPriority (spread load)           │
│    - MostRequestedPriority (bin-packing)            │
│    - BalancedResourceAllocation (CPU/mem ratio)     │
│    - NodeAffinityPriority                           │
│    - PodTopologySpreadPriority                      │
│    - ImageLocalityPriority (image already cached)   │
│    Result: nodes ranked by total weighted score     │
└────────────────────┬────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────┐
│ 3. BINDING                                          │
│    - Select highest-scoring node                    │
│    - Create Binding object (pod → node)             │
│    - API server updates pod.spec.nodeName           │
│    - kubelet on that node picks it up               │
└─────────────────────────────────────────────────────┘
```

**Scheduling Profiles (1.18+):** You can configure multiple profiles in a single scheduler, each with different plugins for different use cases (e.g., one profile for batch jobs that prefers bin-packing, another for services that prefers spreading).

**Custom schedulers:** You can run your own scheduler alongside the default one. Pods specify which scheduler to use via `spec.schedulerName`.

```yaml
# Pod requesting a custom scheduler
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  schedulerName: my-custom-scheduler
  containers:
    - name: app
      image: nginx
```

### 1.4 kube-controller-manager

The controller manager runs **dozens of independent control loops** (controllers), each watching specific resource types and reconciling state. It is a single binary that embeds all built-in controllers.

**The control loop pattern (the heart of Kubernetes):**

```
while true:
    desired = read desired state from API server
    actual  = observe actual state (from API server / kubelet reports)
    if desired != actual:
        take action to move actual → desired
    sleep(sync period)
```

**Key controllers and what they do:**

| Controller        | Watches          | Creates/Manages         |
| ----------------- | ---------------- | ----------------------- |
| Deployment        | Deployments      | ReplicaSets             |
| ReplicaSet        | ReplicaSets      | Pods                    |
| StatefulSet       | StatefulSets     | Pods + PVCs             |
| DaemonSet         | DaemonSets       | Pods (one per node)     |
| Job               | Jobs             | Pods                    |
| CronJob           | CronJobs         | Jobs                    |
| Node              | Nodes            | Node status, eviction   |
| EndpointSlice     | Services + Pods  | EndpointSlices          |
| ServiceAccount    | Namespaces       | Default ServiceAccounts |
| Namespace         | Namespaces       | Cleanup on deletion     |
| PV Binder         | PVCs             | PV-PVC bindings         |
| Garbage Collector | Owner references | Cascading deletions     |

**Leader election:** In HA setups, only one controller manager instance is active (the leader). Others are on standby. Leader election uses a Lease object in kube-system.

```bash
# Check which instance is the current leader
kubectl -n kube-system get lease kube-controller-manager -o yaml
# holderIdentity shows the current leader
```

### 1.5 cloud-controller-manager

Separates cloud-specific logic from core Kubernetes controllers. It runs controllers that interact with the cloud provider API:

- **Node controller**: Checks if a cloud VM still exists when a node becomes unresponsive
- **Route controller**: Sets up routes in the cloud network for pod CIDR
- **Service controller**: Creates/updates/deletes cloud load balancers for LoadBalancer services

This separation allows cloud providers to develop and release their controllers independently from Kubernetes core.

---

## 2. Node Components

### 2.1 kubelet

The kubelet is an **agent that runs on every node**. It is NOT a pod — it runs as a systemd service directly on the host. It ensures that containers described in PodSpecs are running and healthy.

**What the kubelet does:**

- Registers the node with the API server
- Watches the API server for pods assigned to its node
- Pulls container images via the container runtime
- Starts/stops containers via the CRI (Container Runtime Interface)
- Reports node and pod status back to the API server
- Executes liveness, readiness, and startup probes
- Manages volumes (mount/unmount)
- Runs static pods (from local manifest directory)
- Handles resource enforcement (cgroups), eviction (disk/memory pressure)

**CRI (Container Runtime Interface):**

```
kubelet ──── CRI gRPC ────> containerd ──── OCI ────> runc (creates container)
                              or
kubelet ──── CRI gRPC ────> CRI-O ──── OCI ────> runc (creates container)
```

Since Kubernetes 1.24, Docker is no longer supported as a runtime. containerd and CRI-O are the standard runtimes. They both use runc under the hood to actually create containers via Linux namespaces and cgroups.

**Static pods:** Defined by files on a node's filesystem (typically `/etc/kubernetes/manifests/`). The kubelet watches this directory and manages these pods directly, without the API server. The control plane components themselves (API server, controller manager, scheduler, etcd) run as static pods in kubeadm clusters.

```bash
# Check kubelet status
systemctl status kubelet

# View kubelet logs
journalctl -u kubelet -f

# kubelet configuration
cat /var/lib/kubelet/config.yaml
# Key settings:
#   clusterDNS: [10.96.0.10]
#   clusterDomain: cluster.local
#   evictionHard:
#     memory.available: 100Mi
#     nodefs.available: 10%
#   maxPods: 110
```

### 2.2 kube-proxy

kube-proxy maintains **network rules on each node** that implement Services. When you create a Service, kube-proxy ensures that traffic to the Service's ClusterIP is forwarded to the correct pod endpoints.

**Three modes:**

| Mode                   | Mechanism                  | Performance                                   | When to Use                     |
| ---------------------- | -------------------------- | --------------------------------------------- | ------------------------------- |
| **iptables** (default) | iptables NAT rules         | O(n) rules, random backend selection          | Default, works everywhere       |
| **IPVS**               | Linux IPVS (kernel module) | O(1) lookup, multiple algorithms (rr, lc, sh) | Large clusters (1000+ services) |
| **nftables** (1.31+)   | nftables rules             | Modern replacement for iptables               | New clusters on modern kernels  |

```bash
# Check kube-proxy mode
kubectl -n kube-system get cm kube-proxy -o yaml | grep mode

# View iptables rules created by kube-proxy (on a node)
iptables -t nat -L KUBE-SERVICES -n
```

**eBPF replacement:** Cilium can replace kube-proxy entirely using eBPF programs attached to the kernel. This eliminates iptables overhead and provides better performance at scale.

### 2.3 Container Runtime

The container runtime is responsible for pulling images, creating containers, and managing their lifecycle. It implements the CRI interface.

| Runtime             | Description                              | Used By                                   |
| ------------------- | ---------------------------------------- | ----------------------------------------- |
| **containerd**      | Industry standard, extracted from Docker | Most K8s distributions, EKS, GKE, AKS     |
| **CRI-O**           | Purpose-built for Kubernetes             | OpenShift, some bare-metal deployments    |
| **gVisor (runsc)**  | Sandboxed runtime (application kernel)   | GKE Sandbox, security-sensitive workloads |
| **Kata Containers** | Lightweight VM-based isolation           | High-security, multi-tenant environments  |

---

## 3. API Request Lifecycle

When you run `kubectl apply -f deployment.yaml`, here is exactly what happens:

```
┌──────────────────────────────────────────────────────────────┐
│                    API REQUEST LIFECYCLE                      │
│                                                              │
│  kubectl apply -f deployment.yaml                            │
│       │                                                      │
│       v                                                      │
│  1. kubectl reads YAML, determines:                          │
│     - API group: apps/v1                                     │
│     - Resource: deployments                                  │
│     - Verb: PATCH (apply uses server-side apply)             │
│       │                                                      │
│       v                                                      │
│  2. HTTPS request to API server:                             │
│     PATCH /apis/apps/v1/namespaces/default/deployments/web   │
│       │                                                      │
│       v                                                      │
│  3. AUTHENTICATION: Who are you?                             │
│     - X.509 client certificate?                              │
│     - Bearer token?                                          │
│     - OIDC token?                                            │
│     → Result: authenticated identity                         │
│       │                                                      │
│       v                                                      │
│  4. AUTHORIZATION: Are you allowed?                          │
│     - RBAC: does any RoleBinding grant this verb on          │
│       this resource to this identity?                        │
│     → Result: allowed or denied                              │
│       │                                                      │
│       v                                                      │
│  5. MUTATING ADMISSION CONTROLLERS:                          │
│     - Add default values (e.g., default service account)     │
│     - Inject sidecars (Istio, Vault)                         │
│     - Set resource defaults (LimitRanger)                    │
│     → Result: potentially modified object                    │
│       │                                                      │
│       v                                                      │
│  6. SCHEMA VALIDATION:                                       │
│     - Is the resource valid per the OpenAPI schema?          │
│       │                                                      │
│       v                                                      │
│  7. VALIDATING ADMISSION CONTROLLERS:                        │
│     - ResourceQuota: do you have budget?                     │
│     - PodSecurity: does the pod spec meet policy?            │
│     - Custom webhooks: OPA/Gatekeeper, Kyverno              │
│     → Result: approved or rejected                           │
│       │                                                      │
│       v                                                      │
│  8. PERSIST TO etcd:                                         │
│     - Object serialized as protobuf                          │
│     - Written to /registry/deployments/default/web           │
│       │                                                      │
│       v                                                      │
│  9. RESPONSE sent back to kubectl                            │
│       │                                                      │
│       v                                                      │
│  10. WATCH NOTIFICATIONS fire:                               │
│      - Deployment controller: "new Deployment, create RS"    │
│      - Other watchers notified                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. How a Deployment Rollout Actually Works

This is one of the most asked interview questions. Let us trace every step:

```
kubectl apply -f deployment.yaml (replicas: 3, image: app:v2)
│
├─ API server persists Deployment object to etcd
│
├─ Deployment controller (watching Deployments) notices the change:
│  │
│  ├─ Current ReplicaSet (app:v1) has 3 pods running
│  │
│  ├─ Desired image changed to app:v2
│  │
│  ├─ Creates NEW ReplicaSet (app:v2) with replicas=0
│  │
│  ├─ Rolling update begins (default: maxSurge=25%, maxUnavailable=25%)
│  │  For 3 replicas: maxSurge=1, maxUnavailable=1
│  │
│  ├─ Scale up new RS to 1 (now: 3 old + 1 new = 4 total, 1 surge)
│  │
│  └─ Scale down old RS to 2 (now: 2 old + 1 new = 3 total)
│     │
│     ├─ Repeat: scale up new to 2, scale down old to 1
│     │
│     ├─ Repeat: scale up new to 3, scale down old to 0
│     │
│     └─ Rollout complete
│
├─ ReplicaSet controller (watching ReplicaSets) notices new RS:
│  │
│  └─ Creates Pod objects (spec.nodeName is empty)
│
├─ Scheduler (watching unscheduled Pods) notices new pods:
│  │
│  ├─ Runs filtering: which nodes can run this pod?
│  │
│  ├─ Runs scoring: which node is the best fit?
│  │
│  └─ Creates Binding: assigns pod to a node (sets spec.nodeName)
│
├─ kubelet (watching for pods on its node) notices new pod:
│  │
│  ├─ Pulls container image (if not cached)
│  │
│  ├─ Creates sandbox (pause container, sets up networking)
│  │
│  ├─ Starts init containers (sequentially)
│  │
│  ├─ Starts app containers (in parallel)
│  │
│  ├─ Runs startup probe (if defined)
│  │
│  ├─ Begins liveness and readiness probes
│  │
│  └─ Reports pod status back to API server
│
├─ EndpointSlice controller notices pod is Ready:
│  │
│  └─ Adds pod IP to EndpointSlice for the Service
│
└─ kube-proxy / CNI updates routing rules:
   │
   └─ Traffic now reaches the new pod
```

**Key ownership chain:**

```
Deployment
  └── owns → ReplicaSet (old)   [scaled to 0]
  └── owns → ReplicaSet (new)   [scaled to 3]
                └── owns → Pod 1
                └── owns → Pod 2
                └── owns → Pod 3
```

Deleting the Deployment cascades down: ReplicaSets are garbage collected, which cascades to Pods. This is managed by the garbage collector controller via ownerReferences.

---

## 5. Node Lifecycle

```
Node starts kubelet
      │
      v
kubelet registers with API server
      │
      v
Node controller sets conditions:
  - Ready: True
  - MemoryPressure: False
  - DiskPressure: False
  - PIDPressure: False
  - NetworkUnavailable: False
      │
      v
Scheduler considers node for pod placement
      │
      v
If heartbeat stops (node-monitor-grace-period: 40s default):
  - Node status: Ready → Unknown
      │
      v
If Unknown persists (pod-eviction-timeout: 5m default):
  - Node controller taints node: node.kubernetes.io/unreachable
  - Pods are evicted (rescheduled to other nodes)
```

---

## 6. Taints and Tolerations

Taints are applied to nodes, tolerations are applied to pods. They work together to **repel** pods from nodes unless the pod explicitly tolerates the taint.

```bash
# Taint a node
kubectl taint nodes node1 key=value:NoSchedule

# Remove a taint
kubectl taint nodes node1 key=value:NoSchedule-
```

**Taint effects:**

| Effect             | Behavior                                                 |
| ------------------ | -------------------------------------------------------- |
| `NoSchedule`       | New pods without toleration will not be scheduled here   |
| `PreferNoSchedule` | Scheduler tries to avoid but may place if no alternative |
| `NoExecute`        | Existing pods without toleration are evicted             |

**Built-in taints (set automatically by Kubernetes):**

```
node.kubernetes.io/not-ready           # Node is not ready
node.kubernetes.io/unreachable         # Node is unreachable
node.kubernetes.io/memory-pressure     # Node has memory pressure
node.kubernetes.io/disk-pressure       # Node has disk pressure
node.kubernetes.io/pid-pressure        # Node has PID pressure
node.kubernetes.io/unschedulable       # Node is cordoned
node.kubernetes.io/network-unavailable # Node network not configured
```

Control plane nodes are tainted with `node-role.kubernetes.io/control-plane:NoSchedule` to prevent workload pods from running on them.

---

## 7. Admission Controllers

Admission controllers intercept requests to the API server **after** authentication and authorization but **before** persistence to etcd.

**Order:** Mutating → Schema Validation → Validating

| Controller                 | Type       | What It Does                                    |
| -------------------------- | ---------- | ----------------------------------------------- |
| NamespaceLifecycle         | Validating | Rejects requests to non-existent namespaces     |
| LimitRanger                | Mutating   | Sets default resource requests/limits           |
| ServiceAccount             | Mutating   | Adds default SA and token mount                 |
| ResourceQuota              | Validating | Enforces namespace resource quotas              |
| PodSecurity                | Validating | Enforces pod security standards                 |
| MutatingAdmissionWebhook   | Mutating   | Calls external webhooks that can modify objects |
| ValidatingAdmissionWebhook | Validating | Calls external webhooks that can reject objects |
| NodeRestriction            | Validating | Limits what kubelets can modify                 |

**Dynamic admission webhooks** are how external tools (Istio sidecar injection, Vault agent injection, OPA Gatekeeper) hook into the API request lifecycle.

---

## 8. Common Gotchas

### 8.1 etcd is the Single Point of Failure

If etcd is lost and you have no backup, the cluster state is irrecoverable. Back up etcd regularly and test your restore procedure. Many teams learn this the hard way.

### 8.2 API Server Overload from Too Many Watches

Each watch is a long-lived HTTP connection. Thousands of controllers, operators, and custom tools watching resources can overload the API server. Use informers with shared caches, not raw watches.

### 8.3 Scheduler Cannot See Runtime Metrics

The scheduler makes decisions based on **requested** resources, not **actual** usage. A node can be "full" according to the scheduler (all CPU requested) but actually idle, or vice versa. This is why right-sizing resource requests matters enormously.

### 8.4 etcd Performance Degrades on Slow Disks

etcd is extremely sensitive to disk latency. Running etcd on network-attached spinning disks will cause leader elections, write timeouts, and cluster instability. Always use local SSDs.

### 8.5 Controller Manager Leader Election Gap

During leader election (when the leader crashes), there is a brief period (default lease duration: 15s) where no controller is processing changes. Understand this gap exists; do not assume instant reconciliation.

### 8.6 Static Pod Confusion

Static pods cannot be managed by Deployments or ReplicaSets. They appear in `kubectl get pods` but deleting them via kubectl does nothing — the kubelet recreates them immediately from the manifest file.

### 8.7 kubelet Certificate Rotation

kubelet client and serving certificates expire (typically 1 year). If certificate rotation is not configured, nodes will lose API server communication on expiry. Ensure `rotateCertificates: true` is set.

### 8.8 Default Namespace Trap

Resources without a namespace specification go to `default`. In production, always specify namespaces explicitly. Many incidents start with resources accidentally deployed to the wrong namespace.

### 8.9 API Deprecation Surprise

Kubernetes aggressively deprecates APIs. A manifest that works on 1.25 may fail on 1.26 because an API version was removed. Always check the deprecation guide before upgrading.

### 8.10 etcd Quorum Loss

If more than half of etcd members go down simultaneously (e.g., 2 of 3), the cluster becomes read-only. No writes (no new pods, no updates) until quorum is restored. This is why multi-AZ etcd distribution matters.

---

## 9. Interview Questions

### Q1: "Walk me through what happens when you run `kubectl apply -f deployment.yaml`"

**Deep answer:** kubectl reads the YAML file, determines the API group (apps/v1), resource (deployments), and verb (PATCH for server-side apply). It sends an HTTPS request to the API server. The API server processes it through a pipeline: (1) Authentication — verifies the client identity via X.509 cert, bearer token, or OIDC. (2) Authorization — checks RBAC rules to see if this identity can create/update deployments in this namespace. (3) Mutating admission — webhooks and built-in controllers may modify the object (e.g., add default service account, inject sidecars). (4) Schema validation — ensures the object conforms to the OpenAPI schema. (5) Validating admission — webhooks and built-in controllers check constraints (resource quotas, pod security standards). (6) Object is serialized and persisted to etcd. (7) Response returned to kubectl. (8) The Deployment controller, watching via the list-watch pattern, notices the new/updated Deployment and begins the reconciliation loop: creating a new ReplicaSet if the template changed, or scaling existing ones. The ReplicaSet controller then creates Pods. The scheduler assigns each Pod to a node. The kubelet on each node pulls the image and starts the containers. The EndpointSlice controller adds ready pods to the service endpoints. The whole flow is asynchronous — each component acts independently.

### Q2: "How does the Kubernetes scheduler decide which node to place a pod on?"

**Deep answer:** The scheduler runs a two-phase pipeline. Phase 1 is Filtering: it eliminates nodes that cannot run the pod. This includes checking resource availability (do requests fit?), node selectors, node affinity, taints/tolerations, pod affinity/anti-affinity, volume topology, and max pods per node. Phase 2 is Scoring: feasible nodes are scored 0-100 on multiple priorities — LeastRequestedPriority (spread load), BalancedResourceAllocation (balance CPU/memory usage ratio), ImageLocalityPriority (prefer nodes that already have the image cached), PodTopologySpreadPriority (honor topology spread constraints), and more. Each priority has a configurable weight. The scores are summed and the highest-scoring node wins. In case of a tie, a random selection is made. Since 1.18, the scheduler framework allows plugins at multiple extension points (PreFilter, Filter, PostFilter, PreScore, Score, Reserve, Permit, PreBind, Bind, PostBind), making it fully extensible.

### Q3: "Explain etcd's role and how you would handle etcd failure in production."

**Deep answer:** etcd is the only persistent state store in Kubernetes. It stores all cluster state — every pod, service, secret, configmap, RBAC rule. It uses the Raft consensus protocol for consistency across members. In production, you run 3 or 5 etcd members spread across availability zones. For disaster recovery: (1) Automated periodic snapshots using `etcdctl snapshot save`, stored off-cluster (S3, GCS). (2) Monitor etcd health metrics: leader changes, proposal failures, fsync latency, database size. (3) If a single member fails: replace it using `etcdctl member add` without cluster downtime. (4) If quorum is lost: restore from the latest snapshot using `etcdctl snapshot restore` — this creates a new single-member cluster, then add members back. (5) Never run etcd on network-attached storage — use local SSDs. (6) Set up compaction and defragmentation to manage database size. The key insight is that etcd backup is the single most critical operational task in Kubernetes.

### Q4: "What is the difference between the control plane and data plane? How do they communicate?"

**Deep answer:** The control plane is the brain — it makes all decisions about what should be running and where. It consists of the API server, etcd, scheduler, and controller manager. The data plane is the muscle — it does the actual work of running containers. It consists of kubelets and kube-proxy on each worker node. Communication is through the API server — always. The kubelet on each node watches the API server for pods assigned to its node and reports status back. kube-proxy watches for Service changes and updates routing rules. There is no direct communication between control plane components and nodes except through the API server, which serves as the authentication and authorization boundary. The API server can also initiate connections to kubelets (for `kubectl exec`, `kubectl logs`, metrics), but even these are proxied through the API server.

### Q5: "How would you design a highly available Kubernetes control plane?"

**Deep answer:** (1) Run 3 API server instances behind a load balancer (they are stateless). (2) Run 3 or 5 etcd members on dedicated machines with local SSDs, spread across availability zones. (3) Run 3 controller-manager and scheduler instances — only one is active (leader election), others are standby. (4) Use stacked etcd topology (etcd on same machines as control plane) for simplicity, or external etcd topology for isolation. (5) Load balancer should health-check the API servers on the `/readyz` endpoint. (6) Ensure certificates have adequate validity and rotation is configured. (7) Monitor all control plane components: API server request latency, etcd leader elections, scheduler queue depth, controller manager work queue length. (8) Back up etcd to external storage every 30 minutes minimum. (9) Keep the control plane in a separate failure domain from worker nodes. (10) Test failure scenarios: kill one API server, kill one etcd member, simulate network partition.

### Q6: "What are admission controllers and why do they matter?"

**Deep answer:** Admission controllers are plugins that intercept API requests after authentication and authorization but before persistence. They come in two flavors: mutating (can modify the request object) and validating (can only accept or reject). They execute in order: mutating first, then validating. This is critical because it means validating controllers see the final, mutated object. Built-in examples: LimitRanger sets default resource limits, ServiceAccount adds the default service account, ResourceQuota enforces namespace budgets, PodSecurity enforces security standards. Dynamic admission webhooks allow external tools to hook in — this is how Istio injects sidecar proxies, how Vault injects secrets, and how OPA Gatekeeper enforces custom policies. In production, admission controllers are your last line of defense before something gets written to etcd. They are also the mechanism for policy-as-code: you can reject any deployment that does not have resource limits, or any pod that runs as root.

---

## 10. Quick Reference

| Component                | Runs On                      | Stateless? | HA Method                          | Failure Impact                        |
| ------------------------ | ---------------------------- | ---------- | ---------------------------------- | ------------------------------------- |
| kube-apiserver           | Control plane                | Yes        | Load balancer + multiple instances | No API access                         |
| etcd                     | Control plane (or dedicated) | No         | Raft consensus (3 or 5 members)    | No state persistence                  |
| kube-scheduler           | Control plane                | Yes        | Leader election                    | No new pod scheduling                 |
| kube-controller-manager  | Control plane                | Yes        | Leader election                    | No reconciliation                     |
| cloud-controller-manager | Control plane                | Yes        | Leader election                    | No cloud resource management          |
| kubelet                  | Every node                   | Yes        | One per node                       | Node's pods are not managed           |
| kube-proxy               | Every node                   | Yes        | One per node                       | Service routing breaks on that node   |
| Container runtime        | Every node                   | Yes        | One per node                       | Cannot create containers on that node |
