# Pods, Containers, and Workload Resources — Deep-Dive

A Pod is the **atomic unit of scheduling** in Kubernetes. It is not a container — it is a group of one or more containers that share a network namespace, an IPC namespace, and optionally volumes. Understanding pods at depth, including their lifecycle, resource management, and the workload controllers that manage them, is fundamental to operating Kubernetes effectively.

---

## Mental Model

Think of a Pod as a **lightweight VM** that runs one or more processes (containers):

```
┌────────────────────────────── Pod ──────────────────────────────┐
│                                                                  │
│  Network namespace: all containers share ONE IP address          │
│  (containers talk to each other via localhost)                   │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Container 1 │  │ Container 2 │  │ Container 3 │                │
│  │  (app)      │  │  (sidecar)  │  │  (log agent)│                │
│  │ :8080       │  │ :15001      │  │ :9090       │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │              Shared Volumes                     │              │
│  │  /data   /config   /logs                       │              │
│  └────────────────────────────────────────────────┘              │
│                                                                  │
│  Pause container (infra container):                              │
│  Holds the network namespace alive even if other containers      │
│  crash and restart.                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Why multi-container pods exist:** When containers must share the same network interface (localhost communication), the same filesystem, or must start/stop together. The most common patterns are sidecar (e.g., Envoy proxy), adapter (e.g., log format converter), and ambassador (e.g., proxy to external service).

---

## 1. Pod Lifecycle

### 1.1 Pod Phases

| Phase | Meaning |
|-------|---------|
| `Pending` | Pod accepted by API server, but not yet running. Waiting for scheduling, image pull, or volume mount. |
| `Running` | At least one container is running, starting, or restarting. |
| `Succeeded` | All containers terminated successfully (exit code 0). Will not restart. |
| `Failed` | All containers terminated, at least one with non-zero exit code. |
| `Unknown` | Pod state cannot be determined (usually node communication failure). |

### 1.2 Pod Conditions (more granular than phase)

```bash
kubectl get pod my-pod -o jsonpath='{.status.conditions}' | jq .
```

| Condition | Meaning |
|-----------|---------|
| `PodScheduled` | Pod has been scheduled to a node |
| `ContainersReady` | All containers in the pod are ready |
| `Initialized` | All init containers have completed |
| `Ready` | Pod is ready to serve traffic (added to service endpoints) |

### 1.3 Container States

Each container within a pod has its own state:

| State | Meaning |
|-------|---------|
| `Waiting` | Container not yet running (pulling image, waiting for volume, crash backoff) |
| `Running` | Container executing |
| `Terminated` | Container finished execution (success or failure) |

```bash
# Detailed pod status including container states
kubectl describe pod my-pod
# Look for the "Containers:" section and each container's "State:"

# Container state in JSON
kubectl get pod my-pod -o jsonpath='{.status.containerStatuses[*].state}'
```

### 1.4 Complete Pod Startup Sequence

```
Pod created in API server
      │
      v
Scheduler assigns node (spec.nodeName set)
      │
      v
kubelet sees pod, starts processing:
      │
      ├─ 1. Create sandbox (pause container)
      │     - Allocates network namespace
      │     - CNI plugin assigns IP address
      │     - Sets up networking (veth pairs, routes)
      │
      ├─ 2. Pull secrets (imagePullSecrets)
      │
      ├─ 3. Run init containers (SEQUENTIALLY)
      │     - init-1 → must complete → init-2 → must complete → ...
      │     - If init container fails: pod restarts based on restartPolicy
      │
      ├─ 4. Start sidecar containers (restartPolicy: Always, K8s 1.28+)
      │     - Started before regular containers
      │     - Run for the lifetime of the pod
      │
      ├─ 5. Start regular containers (IN PARALLEL)
      │     - Pull image (if not cached)
      │     - Execute postStart lifecycle hook (if defined)
      │     - Run startup probe (if defined)
      │       - Container not killed by liveness probe during startup
      │       - failureThreshold * periodSeconds = max startup time
      │
      ├─ 6. Startup probe passes → start liveness + readiness probes
      │
      └─ 7. Readiness probe passes → pod added to service endpoints
```

### 1.5 Pod Shutdown Sequence

```
Pod deletion requested (kubectl delete, scale down, node drain)
      │
      v
1. Pod status set to "Terminating"
2. Pod removed from service endpoints (EndpointSlice update)
3. preStop lifecycle hook executed (if defined)
4. SIGTERM sent to all containers (PID 1 in each container)
5. Grace period countdown begins (default: 30 seconds)
6. If containers still running after grace period → SIGKILL
7. Pod removed from API server
```

**Critical detail:** Steps 2 and 3-4 happen IN PARALLEL. This means there is a race condition: traffic may still arrive at the pod while it is shutting down. This is why a `preStop` hook with a small sleep (e.g., 5-10 seconds) is important for graceful shutdown.

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]  # Allow time for endpoints to update
```

---

## 2. Init Containers

Init containers run **before** any regular containers start. They must complete successfully (exit 0) before the next init container runs.

**Use cases:**
- Wait for a dependency to be available (database, service)
- Clone a git repo or download configuration
- Run database migrations
- Generate configuration files
- Set up filesystem permissions

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  initContainers:
  - name: wait-for-db
    image: busybox
    command: ['sh', '-c', 'until nc -z postgres-svc 5432; do sleep 2; done']
  - name: run-migrations
    image: my-app:v1
    command: ['./migrate', '--up']
  containers:
  - name: app
    image: my-app:v1
    ports:
    - containerPort: 8080
```

**Init container restart behavior:**
- If an init container fails, the kubelet restarts the pod's init containers from the beginning (not from where it left off)
- If `restartPolicy: Never`, the pod moves to Failed phase
- Init containers do not support `livenessProbe`, `readinessProbe`, or `startupProbe` — they must exit on their own

---

## 3. Sidecar Containers (Native, K8s 1.28+)

Before 1.28, sidecars were just regular containers in the pod spec. The problem: there was no way to guarantee a sidecar started before the app container or kept running while the app was alive.

**Native sidecars** are init containers with `restartPolicy: Always`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  initContainers:
  - name: envoy-proxy
    image: envoy:latest
    restartPolicy: Always    # This makes it a sidecar
    ports:
    - containerPort: 15001
  containers:
  - name: app
    image: my-app:v1
    ports:
    - containerPort: 8080
```

**Benefits over regular multi-container pods:**
- Sidecar starts BEFORE regular containers (guaranteed startup order)
- Sidecar keeps running even if the main container finishes (important for Jobs)
- Sidecar is terminated AFTER regular containers stop (clean shutdown order)
- Sidecar failures are handled like init container failures

**Common sidecar patterns:**
- Service mesh proxy (Envoy, Linkerd proxy)
- Log collection (Fluent Bit)
- Vault agent (secret injection)
- Config sync agents

---

## 4. Container Probes — Deep-Dive

Probes are the mechanism by which the kubelet determines if a container is healthy and ready to serve traffic. Getting probes right is critical for production stability.

### 4.1 Probe Types

| Probe | Purpose | Failure Action |
|-------|---------|----------------|
| **startupProbe** | Is the app finished starting up? | Kill and restart container |
| **livenessProbe** | Is the app alive and not deadlocked? | Kill and restart container |
| **readinessProbe** | Is the app ready to serve traffic? | Remove from service endpoints (no restart) |

### 4.2 Probe Mechanisms

| Mechanism | How It Works | When to Use |
|-----------|-------------|-------------|
| **httpGet** | GET request, success = 200-399 status code | Most web services |
| **tcpSocket** | TCP connect, success = connection established | Databases, non-HTTP services |
| **grpc** | gRPC health check protocol | gRPC services |
| **exec** | Run command in container, success = exit code 0 | Custom health checks |

### 4.3 Probe Configuration Parameters

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10    # Wait before first probe (default: 0)
  periodSeconds: 10          # How often to probe (default: 10)
  timeoutSeconds: 3          # Probe timeout (default: 1)
  failureThreshold: 3        # Failures before action (default: 3)
  successThreshold: 1        # Successes to be considered healthy (default: 1)
```

**Total time before container is killed by liveness probe:**
`initialDelaySeconds + (failureThreshold * periodSeconds)` = 10 + (3 * 10) = 40 seconds

### 4.4 Probe Strategy Recommendations

```
For SLOW-STARTING apps (JVM, ML models):
  startupProbe:
    httpGet:
      path: /healthz
      port: 8080
    failureThreshold: 30       # 30 * 10s = 300s (5 min) max startup time
    periodSeconds: 10

For LIVENESS (is the process stuck?):
  livenessProbe:
    httpGet:
      path: /healthz           # Simple, fast endpoint
      port: 8080
    periodSeconds: 10
    failureThreshold: 3
    timeoutSeconds: 3

For READINESS (can it serve traffic?):
  readinessProbe:
    httpGet:
      path: /ready             # Checks dependencies, connection pools, caches
      port: 8080
    periodSeconds: 5
    failureThreshold: 3
    timeoutSeconds: 3
```

### 4.5 Common Probe Mistakes

| Mistake | Consequence |
|---------|-------------|
| Liveness probe checks external dependency (DB) | DB goes down → all pods restart → cascade failure |
| No startup probe for slow-starting app | Liveness probe kills app before it finishes starting |
| Readiness probe identical to liveness probe | No way to temporarily remove from LB without restart |
| Timeout too short for heavy health check | Intermittent probe failures under load |
| No probes at all | K8s has no idea if the app is healthy |

**Golden rule:** Liveness probes should check if the process is alive and not deadlocked. Readiness probes should check if the process can actually serve requests (connections to DB, cache warmed up, etc.).

---

## 5. Pod Resource Management

### 5.1 Requests vs Limits

```yaml
resources:
  requests:              # Guaranteed minimum — used for SCHEDULING
    cpu: "250m"          # 250 millicores = 0.25 CPU
    memory: "256Mi"      # 256 mebibytes
  limits:                # Maximum allowed — used for ENFORCEMENT
    cpu: "500m"          # Throttled if exceeded (not killed)
    memory: "512Mi"      # OOM-killed if exceeded
```

**CPU behavior:**
- Requests: guaranteed CPU time via CFS (Completely Fair Scheduler)
- Limits: CPU throttling (container is throttled, not killed) — some teams set no CPU limit to avoid throttling

**Memory behavior:**
- Requests: used by scheduler to find a node with enough allocatable memory
- Limits: enforced by cgroups — if container exceeds memory limit, it is OOM-killed

### 5.2 QoS Classes

Kubernetes assigns a Quality of Service class to each pod based on its resource configuration:

| QoS Class | Condition | OOM Priority (killed first → last) |
|-----------|-----------|-------------------------------------|
| **BestEffort** | No requests or limits set on ANY container | Killed first (highest OOM score) |
| **Burstable** | At least one container has requests OR limits | Killed second |
| **Guaranteed** | Every container has requests = limits for BOTH CPU and memory | Killed last (lowest OOM score) |

```yaml
# Guaranteed QoS
resources:
  requests:
    cpu: "500m"
    memory: "256Mi"
  limits:
    cpu: "500m"       # Must equal request
    memory: "256Mi"   # Must equal request
```

**Production recommendation:** Critical services (databases, core APIs) should be Guaranteed. Batch jobs and less critical services can be Burstable.

### 5.3 LimitRange and ResourceQuota

```yaml
# LimitRange: per-pod/container defaults and constraints within a namespace
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:              # Default limits (if not specified)
      cpu: "500m"
      memory: "256Mi"
    defaultRequest:       # Default requests (if not specified)
      cpu: "100m"
      memory: "128Mi"
    max:                  # Maximum allowed
      cpu: "2"
      memory: "2Gi"
    min:                  # Minimum allowed
      cpu: "50m"
      memory: "64Mi"

---
# ResourceQuota: total resource budget for a namespace
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: production
spec:
  hard:
    requests.cpu: "20"
    requests.memory: "40Gi"
    limits.cpu: "40"
    limits.memory: "80Gi"
    pods: "100"
    services: "20"
    persistentvolumeclaims: "30"
```

---

## 6. Workload Resources

### 6.1 Deployment

The most common workload. Manages stateless applications via ReplicaSets.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  revisionHistoryLimit: 10        # How many old ReplicaSets to keep
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1                 # Max pods over desired count during update
      maxUnavailable: 0           # Max pods unavailable during update (zero-downtime)
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.25
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            memory: "256Mi"
```

**Rolling update mechanics:**
- With `maxSurge: 1, maxUnavailable: 0` and 3 replicas: scale up new RS to 1 (total=4), then scale down old to 2 (total=3), repeat until complete
- With `maxSurge: 0, maxUnavailable: 1` and 3 replicas: scale down old to 2, scale up new to 1 (total=3), repeat. Saves resources but briefly reduces capacity.

```bash
# Rollout commands
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web                   # Rollback to previous
kubectl rollout undo deployment/web --to-revision=3   # Rollback to specific
kubectl rollout pause deployment/web                  # Pause rollout
kubectl rollout resume deployment/web                 # Resume rollout
```

### 6.2 StatefulSet

For **stateful** workloads that need stable identity, ordered deployment, and persistent storage.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless    # Required: headless service for DNS
  replicas: 3
  podManagementPolicy: OrderedReady # Sequential start (default), or Parallel
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0                  # Only update pods >= partition ordinal
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:            # Each pod gets its OWN PVC
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

**StatefulSet guarantees:**

| Feature | Deployment | StatefulSet |
|---------|-----------|-------------|
| Pod names | Random suffix (web-7d9f8b6c4-x2k9l) | Ordinal index (postgres-0, postgres-1, postgres-2) |
| DNS | Not individually addressable | `postgres-0.postgres-headless.ns.svc.cluster.local` |
| Startup order | All at once | Sequential (0 → 1 → 2) unless `Parallel` |
| Shutdown order | All at once | Reverse sequential (2 → 1 → 0) |
| Storage | Shared (or no) PVC | Dedicated PVC per pod (survives reschedule) |
| Updates | Rolling (any order) | Reverse ordinal (2 → 1 → 0) |

**Partition updates:** Setting `partition: 2` means only pods with ordinal >= 2 are updated. This enables canary releases for stateful workloads.

### 6.3 DaemonSet

Ensures a pod runs on **every node** (or a subset based on node selectors/tolerations). Used for node-level agents.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentbit
spec:
  selector:
    matchLabels:
      app: fluentbit
  template:
    metadata:
      labels:
        app: fluentbit
    spec:
      tolerations:
      - operator: Exists          # Tolerate ALL taints (run everywhere)
      containers:
      - name: fluentbit
        image: fluent/fluent-bit:latest
        volumeMounts:
        - name: varlog
          mountPath: /var/log
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
```

**Common DaemonSet use cases:**
- Log collection (Fluent Bit, Fluentd)
- Node monitoring (Prometheus Node Exporter, Datadog agent)
- Network plugins (Calico, Cilium)
- Storage plugins (CSI node drivers)
- Security agents (Falco)

### 6.4 Job

Runs a pod to **completion** (not continuously like Deployments).

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: data-import
spec:
  completions: 10               # Total number of successful completions needed
  parallelism: 3                # Max pods running concurrently
  backoffLimit: 4               # Max retries before marking as failed
  activeDeadlineSeconds: 3600   # Hard timeout (1 hour)
  ttlSecondsAfterFinished: 86400 # Auto-delete after 24 hours
  template:
    spec:
      restartPolicy: Never      # Required: Never or OnFailure (not Always)
      containers:
      - name: importer
        image: my-importer:v1
        command: ["./import", "--batch"]
```

**Completion modes:**
- `NonIndexed` (default): completions pods must succeed, any pod can fulfill any completion
- `Indexed` (1.24+): each pod gets an index (JOB_COMPLETION_INDEX env var), useful for parallel processing of different data chunks

### 6.5 CronJob

Creates Jobs on a schedule.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 2 * * *"           # 2:00 AM daily (cron format)
  concurrencyPolicy: Forbid       # Don't start new if previous still running
  startingDeadlineSeconds: 600    # Skip run if it can't start within 10 min
  successfulJobsHistoryLimit: 3   # Keep last 3 successful jobs
  failedJobsHistoryLimit: 1       # Keep last 1 failed job
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: backup-tool:v1
            command: ["./backup.sh"]
```

**ConcurrencyPolicy options:**

| Policy | Behavior |
|--------|----------|
| `Allow` (default) | Multiple jobs can run concurrently |
| `Forbid` | Skip new run if previous is still active |
| `Replace` | Kill running job and start new one |

---

## 7. Pod Disruption Budgets (PDB)

PDBs define the minimum number of pods that must remain available during voluntary disruptions (node drain, cluster upgrade, deployment updates).

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  minAvailable: 2          # OR use maxUnavailable: 1
  selector:
    matchLabels:
      app: web
```

**Voluntary vs Involuntary disruptions:**

| Voluntary (respects PDB) | Involuntary (ignores PDB) |
|---------------------------|---------------------------|
| `kubectl drain` | Node hardware failure |
| Cluster autoscaler scale-down | Kernel panic |
| Deployment rolling update | OOM kill |
| Node upgrade | Container runtime crash |

**PDB blocks `kubectl drain`** if removing a pod would violate the budget. The drain waits until it is safe.

---

## 8. Pod Topology Spread Constraints

Control how pods are spread across topology domains (zones, nodes, regions).

```yaml
apiVersion: v1
kind: Pod
spec:
  topologySpreadConstraints:
  - maxSkew: 1                              # Max difference between zones
    topologyKey: topology.kubernetes.io/zone  # Spread across zones
    whenUnsatisfiable: DoNotSchedule         # Hard constraint
    labelSelector:
      matchLabels:
        app: web
  - maxSkew: 2                              # Max difference between nodes
    topologyKey: kubernetes.io/hostname       # Spread across nodes
    whenUnsatisfiable: ScheduleAnyway        # Soft constraint (best effort)
    labelSelector:
      matchLabels:
        app: web
```

**Example:** With 3 zones and 6 replicas, `maxSkew: 1` ensures each zone gets 2 pods (6/3 = 2, max difference of 1).

---

## 9. Pod Affinity and Anti-Affinity

```yaml
affinity:
  podAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchExpressions:
        - key: app
          operator: In
          values: ["cache"]
      topologyKey: kubernetes.io/hostname
      # "Schedule me on the SAME node as a cache pod"

  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app: web
        topologyKey: topology.kubernetes.io/zone
        # "TRY to schedule me in a DIFFERENT zone than other web pods"
```

**`required` vs `preferred`:**
- `requiredDuringSchedulingIgnoredDuringExecution`: hard constraint — pod stays unscheduled if not satisfiable
- `preferredDuringSchedulingIgnoredDuringExecution`: soft constraint — best effort, with configurable weight

---

## 10. Common Gotchas

### 10.1 restartPolicy: Always Does Not Apply to Jobs

Jobs require `restartPolicy: Never` or `OnFailure`. Using `Always` (the default for pods) causes a validation error.

### 10.2 Init Container Failures Reset the Entire Chain

If the third init container fails, the pod restarts ALL init containers from the first. There is no resumption.

### 10.3 Resource Limits Are NOT Defaults

If you do not set resource requests/limits, your pod has BestEffort QoS and is first to be evicted under memory pressure. Use LimitRange to set namespace defaults.

### 10.4 Liveness Probe Resets Readiness

When a liveness probe fails and the container restarts, the readiness probe must pass again before traffic is sent. This creates a brief period of reduced capacity.

### 10.5 volumeClaimTemplates PVCs Are Not Deleted

When you delete a StatefulSet or scale it down, the PVCs created by `volumeClaimTemplates` are NOT deleted. This is by design (data safety) but can leave orphaned PVCs consuming storage.

### 10.6 terminationGracePeriodSeconds Includes preStop Hook

The grace period countdown starts when the pod begins terminating, NOT after preStop completes. If your preStop hook takes 25 seconds and the grace period is 30 seconds, the container only has 5 seconds to handle SIGTERM.

### 10.7 Empty CPU Limits Can Cause Noisy Neighbors

Without CPU limits, one container can consume all available CPU on a node, starving other containers. However, WITH CPU limits, containers may be throttled even when the node has spare capacity. Choose your trade-off deliberately.

### 10.8 Horizontal Pod Autoscaler Fights Manual Scaling

If HPA is configured for a Deployment, do not manually set replicas — the HPA will override it. Remove HPA before manual scaling.

### 10.9 CronJob Schedule Drift

CronJob uses UTC. If your schedule is "0 2 * * *" and you expected local time, jobs run at the wrong hour. Also, if `startingDeadlineSeconds` is not set and the controller misses a schedule (controller restart), the job silently does not run.

### 10.10 Pod Priority Can Cause Preemption Cascades

High-priority pods can preempt lower-priority pods, which may themselves preempt even lower-priority pods. This cascade can destabilize the cluster if priorities are not designed carefully.

---

## 11. Interview Questions

### Q1: "When would you use a StatefulSet vs a Deployment? Explain the differences in detail."

**Deep answer:** Use a Deployment for stateless workloads where any pod is interchangeable — web servers, API services, workers processing from a queue. Use a StatefulSet when your application requires one or more of: (1) Stable network identity — each pod gets a predictable DNS name like `pod-0.svc` instead of a random hash, essential for databases that need to know their peers. (2) Stable persistent storage — each pod gets its own PVC that follows it across rescheduling, critical for data that must survive pod restarts. (3) Ordered deployment and scaling — pods are created sequentially (0, 1, 2) and terminated in reverse, important for databases that need a primary before replicas. (4) Ordered rolling updates — updates proceed from highest ordinal to lowest, allowing you to update replicas before the primary. The trade-offs: StatefulSets are harder to operate (PVCs must be manually cleaned up, scaling requires more care, updates are slower), and they create a coupling between the pod and its storage/identity that makes migration harder. For many stateful workloads, consider whether a managed database service is more appropriate than running it yourself on Kubernetes.

### Q2: "Explain the three types of container probes and how you would configure them for a Java Spring Boot application."

**Deep answer:** For a Spring Boot app (notoriously slow to start): (1) startupProbe — checks Spring's actuator `/actuator/health/liveness` endpoint with a high failureThreshold (e.g., 60) and periodSeconds: 5, giving the app up to 5 minutes to start. Without this, the liveness probe would kill the container during JVM warmup. (2) livenessProbe — checks `/actuator/health/liveness` which verifies the JVM is responsive and not deadlocked. Keep this endpoint simple — no database checks. If this fails 3 times, the container is restarted. (3) readinessProbe — checks `/actuator/health/readiness` which includes connection pool status, cache warmup, and dependency checks. If this fails, the pod is removed from service endpoints but NOT restarted, allowing it to recover. The critical distinction: liveness answers "is the process alive?" and readiness answers "can it serve traffic?" Making liveness depend on external services is the single most common probe mistake — it causes cascading restarts when a dependency fails.

### Q3: "A deployment with 10 replicas has maxSurge: 25% and maxUnavailable: 25%. Describe the rollout process."

**Deep answer:** With 10 replicas, 25% surge = 2 extra pods (ceil), 25% unavailable = 2 pods can be down (floor). The rollout proceeds: (1) Scale up new ReplicaSet to 2 (total: 12, surge=2). (2) Scale down old RS to 8 (total: 10). (3) Scale up new RS to 4 (total: 12). (4) Scale down old RS to 6 (total: 10). This continues until all 10 pods are new. At any point, there are at least 8 available pods (10 - maxUnavailable) and at most 12 total pods (10 + maxSurge). The Deployment controller tracks ReplicaSet readiness — it will not scale down old pods until new pods pass their readiness probes. If new pods never become ready (bad image, crash loop), the rollout stalls and can be rolled back with `kubectl rollout undo`.

### Q4: "How does Kubernetes handle pod eviction under memory pressure?"

**Deep answer:** When a node's available memory drops below the kubelet's eviction threshold (default: 100Mi for hard eviction), the kubelet starts evicting pods. Eviction order is based on QoS class and actual memory usage relative to requests: (1) BestEffort pods are evicted first (no requests/limits). (2) Burstable pods that exceed their memory requests are evicted next, sorted by how much they exceed. (3) Guaranteed pods are evicted last, only if they exceed their limits (which equals their requests). The OOM killer (kernel level) uses oom_score_adj values set by kubelet: BestEffort gets 1000 (always killed first), Guaranteed gets -997 (nearly never killed), Burstable gets a score proportional to memory request relative to node capacity. There is also soft eviction (with a grace period) that sends SIGTERM and waits, vs hard eviction that kills immediately.

### Q5: "How would you set up a CronJob that must run exactly once per day, handle failures gracefully, and not overlap with previous runs?"

**Deep answer:** Set `concurrencyPolicy: Forbid` to prevent overlapping runs. Set `startingDeadlineSeconds` to a reasonable window (e.g., 600 seconds) so that if the CronJob controller misses the exact schedule time, it still starts within 10 minutes. Set `backoffLimit: 3` on the Job template so it retries on failure. Set `activeDeadlineSeconds` to an upper bound on execution time to prevent runaway jobs. Set `failedJobsHistoryLimit: 3` and `successfulJobsHistoryLimit: 3` to keep history for debugging but not clutter the namespace. Use `restartPolicy: OnFailure` so the container retries in-place rather than creating new pods. Add monitoring to alert if the CronJob has not completed successfully in the last 25 hours (1 day + buffer). One important caveat: if the CronJob controller is down for longer than `startingDeadlineSeconds`, the run is permanently skipped — there is no catch-up mechanism unless you build it into your application logic.

---

## 12. Quick Reference

| Workload | Use Case | Scaling | Update Strategy | Storage |
|----------|----------|---------|-----------------|---------|
| **Deployment** | Stateless apps | Horizontal (replicas) | RollingUpdate, Recreate | Shared or no PVC |
| **StatefulSet** | Stateful apps | Ordinal scaling | RollingUpdate (reverse ordinal) | Per-pod PVC |
| **DaemonSet** | Node-level agents | One per node (auto) | RollingUpdate, OnDelete | Usually hostPath |
| **Job** | Batch processing | Parallelism | N/A (run to completion) | Usually none |
| **CronJob** | Scheduled tasks | Schedule-based | N/A | Usually none |

| QoS Class | Requests | Limits | Eviction Order |
|-----------|----------|--------|----------------|
| **BestEffort** | None | None | First (highest OOM score) |
| **Burstable** | Some | Some (or unequal) | Second |
| **Guaranteed** | Set | Set (equal to requests) | Last (lowest OOM score) |
