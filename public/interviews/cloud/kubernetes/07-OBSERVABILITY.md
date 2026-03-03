# Kubernetes Observability — Deep-Dive

Observability is your ability to understand the internal state of a system from its external outputs. In Kubernetes, this means metrics (what is happening), logs (what happened), and traces (how requests flow). Equally important is the skill of debugging — systematically diagnosing problems using kubectl and cluster telemetry.

---

## Mental Model

```
                    THE THREE PILLARS

 METRICS                LOGS                  TRACES
 (numbers over time)    (event records)        (request flow)

 "CPU is at 90%"        "Connection refused    "Request took 2.3s:
  "5xx rate is 3%"       at 14:32:01"            50ms in API →
  "Queue depth: 150"     "OOM killed PID 1"      200ms in DB →
                                                 2s in payment svc"
      │                      │                       │
      v                      v                       v
 Prometheus              Fluent Bit/              OpenTelemetry
 Metrics Server          Fluentd → Loki/ELK       → Jaeger/Tempo
      │                      │                       │
      v                      v                       v
 Grafana dashboards      Grafana/Kibana           Grafana/Jaeger UI
 AlertManager            search & filter          request waterfall
```

**Key insight:** Metrics tell you SOMETHING is wrong. Logs tell you WHAT happened. Traces tell you WHERE in the request chain the problem occurred. You need all three.

---

## 1. Metrics

### 1.1 Metrics Server

The Metrics Server is a lightweight, in-cluster component that collects resource metrics (CPU, memory) from kubelets. It powers `kubectl top` and the Horizontal Pod Autoscaler.

```bash
# Install Metrics Server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Node metrics
kubectl top nodes
# NAME     CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-1   850m         42%    6.2Gi           78%
# node-2   320m         16%    3.1Gi           39%

# Pod metrics
kubectl top pods -n production --sort-by=memory
# NAME                   CPU(cores)   MEMORY(bytes)
# api-server-7d9f8-abc   450m         512Mi
# worker-5c8b9-def       120m         256Mi

# Container-level metrics
kubectl top pods -n production --containers
```

**Limitation:** Metrics Server provides only current CPU/memory usage. It does not store history. For historical metrics, alerting, and dashboards, you need Prometheus.

### 1.2 Prometheus

Prometheus is the standard for Kubernetes metrics. It uses a **pull model** — Prometheus scrapes /metrics endpoints from your services.

```
┌─────────────────────────────────────────────────────┐
│                   Prometheus                         │
│                                                      │
│  ServiceMonitor CRDs ──> Prometheus discovers        │
│                          targets to scrape           │
│                                                      │
│  Scrapes /metrics from:                              │
│  ├── kube-state-metrics (resource object states)     │
│  ├── node-exporter (node hardware/OS metrics)        │
│  ├── cAdvisor (container metrics via kubelet)        │
│  ├── API server /metrics                             │
│  ├── etcd /metrics                                   │
│  ├── CoreDNS /metrics                                │
│  └── Application /metrics (custom instrumentation)   │
│                                                      │
│  Stores in time-series DB (TSDB)                     │
│  Evaluates PrometheusRules → fires alerts            │
│  Serves PromQL queries → Grafana dashboards          │
└─────────────────────────────────────────────────────┘
```

**ServiceMonitor (prometheus-operator):**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: api-server-metrics
  namespace: production
  labels:
    release: prometheus            # Must match Prometheus operator selector
spec:
  selector:
    matchLabels:
      app: api-server
  endpoints:
  - port: metrics
    interval: 15s
    path: /metrics
```

### 1.3 Key Metrics to Monitor

**Node-level:**

| Metric | PromQL | Alert Threshold |
|--------|--------|----------------|
| CPU utilization | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` | > 80% sustained |
| Memory utilization | `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100` | > 85% |
| Disk utilization | `(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100` | > 80% |
| Disk I/O latency | `rate(node_disk_io_time_seconds_total[5m])` | > 100ms |

**Pod/Container-level:**

| Metric | PromQL | Alert Threshold |
|--------|--------|----------------|
| Container CPU | `rate(container_cpu_usage_seconds_total[5m])` | > 80% of limit |
| Container memory | `container_memory_working_set_bytes` | > 80% of limit |
| Pod restarts | `kube_pod_container_status_restarts_total` | > 3 in 10 min |
| OOM kills | `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}` | Any |

**API Server:**

| Metric | PromQL | Alert Threshold |
|--------|--------|----------------|
| Request latency | `histogram_quantile(0.99, rate(apiserver_request_duration_seconds_bucket[5m]))` | p99 > 1s |
| Error rate | `rate(apiserver_request_total{code=~"5.."}[5m])` | > 1% |
| Request rate | `rate(apiserver_request_total[5m])` | Spike > 2x baseline |

**etcd:**

| Metric | PromQL | Alert Threshold |
|--------|--------|----------------|
| Leader changes | `rate(etcd_server_leader_changes_seen_total[1h])` | > 3/hour |
| Proposal failures | `rate(etcd_server_proposals_failed_total[5m])` | > 0 sustained |
| Disk fsync | `histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))` | p99 > 10ms |
| DB size | `etcd_mvcc_db_total_size_in_bytes` | > 4GB |

### 1.4 Alerting with PrometheusRule

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: pod-alerts
  namespace: monitoring
spec:
  groups:
  - name: pod.rules
    rules:
    - alert: PodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping"
        description: "Pod has restarted {{ $value }} times in the last 15 minutes"

    - alert: PodOOMKilled
      expr: kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} > 0
      for: 0m
      labels:
        severity: critical
      annotations:
        summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} was OOM killed"
```

---

## 2. Logging

### 2.1 How Container Logging Works

```
Application writes to stdout/stderr
      │
      v
Container runtime captures output
      │
      v
kubelet writes to /var/log/pods/<namespace>_<pod>_<uid>/<container>/0.log
      │
      v
/var/log/containers/<pod>_<namespace>_<container>-<id>.log (symlink)
      │
      v
Log collector DaemonSet (Fluent Bit / Fluentd) reads the files
      │
      v
Ships to centralized store (Loki, Elasticsearch, CloudWatch)
```

### 2.2 kubectl Log Commands

```bash
# Basic logs
kubectl logs my-pod
kubectl logs my-pod -c my-container          # Specific container
kubectl logs my-pod --all-containers          # All containers

# Previous instance (after restart)
kubectl logs my-pod --previous                # Logs from crashed container

# Streaming
kubectl logs my-pod -f                        # Follow (stream)

# Time-based
kubectl logs my-pod --since=1h                # Last hour
kubectl logs my-pod --since-time=2024-01-15T10:00:00Z

# Line limits
kubectl logs my-pod --tail=100                # Last 100 lines

# All pods matching a label
kubectl logs -l app=web --all-containers --max-log-requests=10
```

### 2.3 Log Aggregation Stack

**Option A: Loki + Grafana (lightweight)**

```
Fluent Bit (DaemonSet) ──> Loki (stores logs) ──> Grafana (query/visualize)
                           (LogQL queries)
```

Loki indexes only labels (pod, namespace, container), not log content. This makes it extremely storage-efficient but requires label-based queries.

**Option B: Elasticsearch + Kibana (ELK/EFK, full-text search)**

```
Fluent Bit (DaemonSet) ──> Elasticsearch (stores + indexes logs) ──> Kibana
                           (full-text search, aggregations)
```

Elasticsearch indexes log content, enabling powerful full-text search. But it uses significantly more storage and compute.

### 2.4 Structured Logging Best Practices

```json
// Application log output (structured JSON)
{
  "timestamp": "2024-01-15T14:32:01.234Z",
  "level": "ERROR",
  "message": "Failed to process order",
  "service": "order-service",
  "trace_id": "abc123def456",
  "order_id": "ORD-789",
  "error": "connection refused",
  "duration_ms": 2340
}
```

Structured logs (JSON) are machine-parseable and can be queried efficiently. Unstructured logs (plain text) require regex parsing, which is fragile and slow.

---

## 3. Distributed Tracing

### 3.1 OpenTelemetry

OpenTelemetry (OTel) is the standard for instrumenting applications to emit metrics, logs, and traces.

```
Service A ────────────> Service B ────────────> Service C
  span: "api-request"    span: "db-query"        span: "payment"
  trace_id: abc123       trace_id: abc123         trace_id: abc123
  duration: 500ms        duration: 50ms           duration: 300ms
```

Each service passes the trace context (trace_id, span_id) in HTTP headers. The tracing backend (Jaeger, Tempo) assembles spans into a trace waterfall.

### 3.2 OTel Collector in Kubernetes

```yaml
# Deploy OpenTelemetry Collector as a DaemonSet
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otel-collector
  namespace: observability
spec:
  selector:
    matchLabels:
      app: otel-collector
  template:
    spec:
      containers:
      - name: collector
        image: otel/opentelemetry-collector-contrib:latest
        ports:
        - containerPort: 4317       # gRPC OTLP receiver
        - containerPort: 4318       # HTTP OTLP receiver
        volumeMounts:
        - name: config
          mountPath: /etc/otelcol
      volumes:
      - name: config
        configMap:
          name: otel-collector-config
```

---

## 4. kubectl Debugging Toolkit

### 4.1 The Debugging Hierarchy

When something is wrong, follow this order:

```
1. kubectl get events --sort-by=.lastTimestamp -n <ns>
   → What happened recently? (scheduling failures, image pulls, OOM kills)

2. kubectl describe <resource> <name> -n <ns>
   → Detailed status + Events section (gold mine for debugging)

3. kubectl logs <pod> [-c container] [--previous] -n <ns>
   → What did the application output?

4. kubectl exec -it <pod> -- /bin/sh
   → Get inside the container, inspect filesystem, test connectivity

5. kubectl debug <pod> --image=busybox -it
   → Ephemeral debug container (no need to modify pod spec)

6. kubectl port-forward <pod> <local>:<remote>
   → Test connectivity to a specific pod/service locally

7. kubectl top pod/node
   → Resource consumption (CPU, memory)

8. kubectl auth can-i <verb> <resource> --as=<identity>
   → Permission debugging
```

### 4.2 Ephemeral Debug Containers

Debug containers are temporary containers added to a running pod for troubleshooting. The pod's spec is not modified permanently.

```bash
# Attach a debug container to a running pod
kubectl debug my-pod -it --image=busybox --target=my-container
# --target shares the PID namespace with the specified container

# Debug a node
kubectl debug node/my-node -it --image=ubuntu
# Creates a privileged pod on the node with host access

# Copy a pod and add a debug container (for pods with no shell)
kubectl debug my-pod -it --image=busybox --copy-to=debug-pod --share-processes
```

### 4.3 Useful Debugging Commands Inside Containers

```bash
# DNS resolution
nslookup my-service.default.svc.cluster.local
dig +short my-service.default.svc.cluster.local

# Network connectivity
curl -v http://my-service:8080/health
wget -qO- http://my-service:8080/health
nc -zv my-service 8080                     # TCP connectivity test

# Check environment variables (ConfigMap/Secret injection)
env | sort

# Check mounted volumes
ls -la /etc/config/
cat /var/run/secrets/kubernetes.io/serviceaccount/token

# Process information
ps aux
cat /proc/1/status

# DNS configuration
cat /etc/resolv.conf
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5
```

---

## 5. Common Troubleshooting Scenarios

### 5.1 Pod Stuck in Pending

```bash
kubectl describe pod <pod-name>
# Look for Events section:
```

| Event Message | Cause | Fix |
|--------------|-------|-----|
| `Insufficient cpu/memory` | No node has enough allocatable resources | Add nodes, reduce requests, or clean up pods |
| `0/3 nodes are available: 3 node(s) had taint...` | Pod does not tolerate node taints | Add tolerations or remove taints |
| `no persistent volumes available` | PVC not bound (no matching PV or StorageClass) | Check PVC status, StorageClass, provisioner |
| `0/3 nodes are available: 3 node(s) didn't match Pod's node affinity` | Node affinity/selector eliminates all nodes | Fix affinity rules or add matching nodes |
| `pod has unbound immediate PersistentVolumeClaims` | PVC stuck in Pending | Check PVC events, StorageClass |

### 5.2 Pod Stuck in CrashLoopBackOff

```bash
# Check what the container outputs before crashing
kubectl logs <pod> --previous

# Check exit code
kubectl describe pod <pod> | grep -A5 "Last State"
# Exit Code 1:   Application error
# Exit Code 137:  OOM killed (128 + SIGKILL=9) or external kill
# Exit Code 139:  Segfault (128 + SIGSEGV=11)
# Exit Code 143:  Graceful termination (128 + SIGTERM=15)
```

| Exit Code | Cause | Fix |
|-----------|-------|-----|
| 1 | Application error | Check logs, fix application code |
| 137 | OOM killed or killed by system | Increase memory limit, fix memory leak |
| 139 | Segmentation fault | Application bug (null pointer, buffer overflow) |
| 0 (but CrashLoop) | Container exits immediately | Command/entrypoint is wrong, add sleep or fix |

### 5.3 Pod Stuck in ImagePullBackOff

```bash
kubectl describe pod <pod>
# Events:
#   Failed to pull image "my-registry/my-app:v1": unauthorized
#   Failed to pull image "my-app:v99": not found
```

| Event | Cause | Fix |
|-------|-------|-----|
| `unauthorized` | Missing or wrong imagePullSecrets | Create docker-registry secret, reference in pod |
| `not found` / `manifest unknown` | Wrong image name or tag | Verify image exists in registry |
| `request canceled while waiting for connection` | Registry unreachable | Check network, DNS, firewall |
| `toomanyrequests` | Docker Hub rate limit | Use private registry or authenticated pulls |

### 5.4 Service Not Reachable

```bash
# Step 1: Check endpoints
kubectl get endpoints <service>
# Empty = selector mismatch or no ready pods

# Step 2: Check if pods are Ready
kubectl get pods -l <service-selector> -o wide
# If not Ready → readiness probe failing

# Step 3: Test direct pod connectivity
kubectl exec debug-pod -- curl <pod-ip>:<port>
# Works? → Issue is in service/kube-proxy
# Fails? → Issue is in the pod/application

# Step 4: Test DNS
kubectl exec debug-pod -- nslookup <service>

# Step 5: Check NetworkPolicies
kubectl get netpol -n <namespace>

# Step 6: Check kube-proxy
kubectl -n kube-system logs <kube-proxy-pod>
```

### 5.5 Node NotReady

```bash
kubectl describe node <node>
# Check Conditions:
#   Ready: False / Unknown
#   MemoryPressure: True / False
#   DiskPressure: True / False

# Check kubelet on the node
ssh node-1
systemctl status kubelet
journalctl -u kubelet --since "10 minutes ago"
```

| Condition | Cause | Fix |
|-----------|-------|-----|
| Ready: Unknown | kubelet stopped sending heartbeats | SSH into node, check kubelet status |
| MemoryPressure: True | Node running low on memory | Evict pods, add memory, check for leaks |
| DiskPressure: True | Disk > 85% full | Clean up images (`crictl rmi --prune`), logs, or expand disk |
| NetworkUnavailable: True | CNI plugin failure | Check CNI pods, restart if needed |

### 5.6 Deployment Rollout Stuck

```bash
kubectl rollout status deployment/web
# Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...

kubectl describe deployment web
# Check Events and Conditions
```

| Cause | Symptom | Fix |
|-------|---------|-----|
| PDB blocking | "Cannot evict pod, would violate PDB" | Temporarily relax PDB or fix unhealthy pods |
| Resource quota exceeded | "exceeded quota" in events | Increase quota or reduce resource requests |
| Image pull failure | New pods in ImagePullBackOff | Fix image reference or registry access |
| Readiness probe failing | New pods never become Ready | Fix probe or application |
| Insufficient resources | New pods stuck in Pending | Add capacity or reduce requests |

---

## 6. Autoscaling

### 6.1 Horizontal Pod Autoscaler (HPA)

Scales the number of pod replicas based on observed metrics.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70      # Scale when avg CPU > 70% of request
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods                      # Custom metric from Prometheus
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60      # Wait 60s before scaling up
      policies:
      - type: Percent
        value: 100                        # Max double replicas per period
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300     # Wait 5 min before scaling down
      policies:
      - type: Percent
        value: 10                         # Max reduce by 10% per period
        periodSeconds: 60
```

**HPA scaling algorithm:**

```
desiredReplicas = ceil(currentReplicas * (currentMetricValue / desiredMetricValue))

Example:
  currentReplicas = 5
  currentCPU = 90%
  targetCPU = 70%
  desiredReplicas = ceil(5 * (90/70)) = ceil(6.43) = 7
```

### 6.2 Vertical Pod Autoscaler (VPA)

Adjusts pod CPU/memory requests and limits based on historical usage.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  updatePolicy:
    updateMode: "Off"          # "Off" = recommendations only (safest)
                               # "Auto" = restart pods with new resources
                               # "Initial" = set on pod creation only
  resourcePolicy:
    containerPolicies:
    - containerName: web
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 2
        memory: 2Gi
```

```bash
# View VPA recommendations
kubectl describe vpa web-vpa
# Recommendation:
#   Container: web
#     Lower Bound:   cpu: 150m,  memory: 200Mi
#     Target:        cpu: 300m,  memory: 450Mi
#     Upper Bound:   cpu: 800m,  memory: 1.2Gi
#     Uncapped Target: cpu: 300m, memory: 450Mi
```

**VPA limitations:**
- Cannot be used simultaneously with HPA on the same metric (CPU/memory)
- `Auto` mode requires pod restarts to apply new resource values
- May cause service disruption if many pods restart at once (use PDB)

### 6.3 Cluster Autoscaler / Karpenter

| Feature | Cluster Autoscaler | Karpenter (AWS) |
|---------|-------------------|-----------------|
| Scaling trigger | Pending pods (unschedulable) | Pending pods |
| Scale-down | Underutilized nodes removed | Consolidation (bin-packing) |
| Node selection | Pre-defined node groups/pools | Dynamic (chooses instance type) |
| Speed | 2-5 min to add node | 30-90 sec to add node |
| Flexibility | Limited to configured groups | Selects from full instance catalog |
| Spot/Preemptible | Supported | First-class support |

---

## 7. Common Gotchas

### 7.1 kubectl top Requires Metrics Server

`kubectl top` returns "error: Metrics API not available" if Metrics Server is not installed. It is not installed by default in many distributions.

### 7.2 Prometheus Memory Usage

Prometheus stores ALL scraped metrics in memory. With many targets, high cardinality (unique label combinations), and long retention, Prometheus can consume tens of gigabytes of RAM. Set appropriate scrape intervals and retention limits.

### 7.3 Log Volume from Verbose Applications

Applications that log every request at INFO level can generate gigabytes of logs per day. This overwhelms log aggregation systems and increases costs. Implement log level configuration and reduce verbosity in production.

### 7.4 HPA Flapping

If the metric oscillates around the threshold, HPA continuously scales up and down. Use `stabilizationWindowSeconds` in the behavior section to dampen oscillation. The default scale-down stabilization is 5 minutes.

### 7.5 VPA and HPA Conflict

Running VPA in Auto mode and HPA on CPU simultaneously creates a conflict: HPA adds replicas to reduce per-pod CPU usage, VPA increases per-pod CPU requests because usage was high. They fight each other. Use VPA in recommendation-only mode alongside HPA.

### 7.6 --previous Only Shows the Last Instance

`kubectl logs --previous` shows logs from the PREVIOUS container instance, not all historical logs. If the pod has restarted 5 times, you only see the 4th instance's logs. For complete history, use centralized logging.

### 7.7 Events Are Short-Lived

Kubernetes events have a TTL (default: 1 hour). If you check events 2 hours after an incident, they may already be gone. Ship events to persistent storage (event exporter to Elasticsearch/Loki).

### 7.8 OOM Kill Not Always in Logs

When a container is OOM-killed, it receives SIGKILL (cannot be caught). The container may produce NO logs before dying. Check `kubectl describe pod` for `OOMKilled` in the container's last termination reason, not in logs.

### 7.9 Pod Metrics Lag Behind Reality

Metrics Server scrapes kubelet every 15 seconds by default. HPA evaluates every 15 seconds. Combined with scrape/evaluation delays, there can be 30-60 seconds of lag between a load spike and HPA response. Account for this in capacity planning.

### 7.10 Debug Containers Are Not Cleaned Up

Ephemeral debug containers (`kubectl debug`) remain in the pod's container list until the pod is deleted. They do not consume resources once terminated, but they can clutter `kubectl describe` output.

---

## 8. Interview Questions

### Q1: "A service is returning 5xx errors intermittently — walk me through debugging it in Kubernetes."

**Deep answer:** (1) Scope the problem: `kubectl get pods -l app=<service> -o wide` — are all pods Running and Ready? Any recent restarts? (2) Check events: `kubectl get events --sort-by=.lastTimestamp -n <ns>` — any OOM kills, scheduling failures, or volume issues? (3) Check pod metrics: `kubectl top pods -l app=<service>` — is any pod at its CPU/memory limit? CPU throttling or OOM risk? (4) Check logs: `kubectl logs -l app=<service> --since=30m` — look for error patterns, stack traces, connection refused messages. (5) Check endpoints: `kubectl get endpoints <service>` — are all healthy pods in the endpoint list? A readiness probe failure would remove them. (6) Check individual pod connectivity: `kubectl exec debug-pod -- curl <pod-ip>:8080/health` for each pod — is one specific pod returning errors? (7) Check downstream dependencies: exec into a pod and test connectivity to databases, external APIs. (8) If intermittent: it might be one unhealthy pod that occasionally receives traffic. Check if the readiness probe is too lenient. Or it might be connection/resource exhaustion under load — check connection pool settings, file descriptor limits, and resource limits.

### Q2: "How would you set up monitoring and alerting for a production Kubernetes cluster?"

**Deep answer:** Deploy the kube-prometheus-stack (Prometheus Operator + Grafana + AlertManager + default rules). This gives you out-of-the-box monitoring for all K8s components. Layer 1 — Infrastructure: node metrics (CPU, memory, disk, network) via node-exporter, container metrics via cAdvisor/kubelet. Alert on node NotReady, disk pressure, memory pressure. Layer 2 — K8s control plane: API server latency and error rates, etcd leader changes and fsync duration, scheduler queue depth, controller manager work queue. Alert on API server errors > 1%, etcd leader changes > 3/hour. Layer 3 — Application: require all services to expose /metrics (Prometheus client libraries). Create ServiceMonitors. Alert on error rate > 1%, latency p99 > SLA, pod restarts > 3 in 10 minutes. Layer 4 — Custom business metrics: queue depth, active users, order processing rate. Layer 5 — Alerting: route critical alerts (pager), warning alerts (Slack), info alerts (dashboard only). Use alert grouping and inhibition to prevent alert storms.

### Q3: "Explain the difference between HPA and VPA. When would you use each?"

**Deep answer:** HPA scales HORIZONTALLY — adds more pods when metrics (CPU, memory, custom metrics) exceed targets. It is best for stateless services that can distribute load across replicas. HPA responds quickly (seconds to add pods, assuming nodes are available) and is the primary autoscaling mechanism. VPA scales VERTICALLY — adjusts resource requests/limits per pod. It is best for workloads that cannot scale horizontally (single-instance databases, ML training) or for right-sizing resource requests based on actual usage. VPA in recommendation mode is invaluable for initial sizing — deploy, let VPA observe for a few days, then set requests based on recommendations. In practice: use HPA for all stateless services. Use VPA in Off/recommendation mode to inform resource request decisions. Use VPA in Auto mode only for workloads that cannot scale horizontally. Never use HPA on CPU/memory and VPA in Auto mode simultaneously on the same deployment — they conflict.

### Q4: "How do you handle logging at scale in Kubernetes?"

**Deep answer:** At scale (hundreds of pods, GBs/day of logs): (1) Standardize on structured JSON logging across all services. This eliminates complex log parsing and enables efficient querying. (2) Deploy Fluent Bit as a DaemonSet (not Fluentd — Fluent Bit is 10x lighter). It reads container log files from each node. (3) Use Loki for storage if you primarily search by labels (pod, namespace, severity). Use Elasticsearch if you need full-text search. Loki is much cheaper to operate. (4) Implement log levels (ERROR, WARN, INFO, DEBUG) and set INFO as default in production. Never run DEBUG in production unless actively debugging. (5) Set retention policies: 7 days hot, 30 days warm, 90 days archive. (6) Filter out noise: health check logs, metrics scrape logs. (7) Add correlation IDs (trace_id) to all log lines for cross-service debugging. (8) Set per-namespace log quotas if needed (Fluent Bit filters). (9) Monitor the log pipeline itself — alert on Fluent Bit buffer overflow or Loki/ES ingestion failures. (10) Cost: at scale, logging is often the highest observability cost. Aggressively sample verbose services.

### Q5: "A deployment rollout is stuck at 1 out of 3 replicas updated. How do you diagnose and fix it?"

**Deep answer:** (1) `kubectl rollout status deployment/web` confirms it is stuck. (2) `kubectl describe deployment web` — check the Conditions section. Look for `Progressing: False` with a reason like `ProgressDeadlineExceeded`. (3) `kubectl get pods -l app=web` — identify the new pods (from the new ReplicaSet). (4) Check the new pod's status: if Pending → scheduling issue (check `describe pod` events). If CrashLoopBackOff → application error (check `logs --previous`). If ImagePullBackOff → wrong image or missing credentials. If Running but not Ready → readiness probe failing. (5) If a PDB is blocking: `kubectl get pdb` — if minAvailable is too high and some old pods are not healthy, the rollout cannot proceed because it cannot remove old pods. (6) Fix the root cause. If the new image is broken: `kubectl rollout undo deployment/web` to rollback immediately. If it is a configuration issue: fix the ConfigMap/Secret and restart. (7) Prevent recurrence: set `progressDeadlineSeconds` (default 600s) so stuck rollouts are detected. Add appropriate health probes. Test images in staging before production.

### Q6: "Describe how you would use Prometheus to monitor a microservices application."

**Deep answer:** (1) Instrument each service with a Prometheus client library (Go, Java, Python, Node.js). Expose standard metrics: request count (labeled by method, path, status code), request duration histogram, active connections, error count. Use RED method: Rate, Errors, Duration. (2) Create a ServiceMonitor per service so Prometheus auto-discovers scrape targets. Set appropriate scrape intervals (15-30s for most services, 60s for less critical). (3) Create recording rules for frequently used queries (e.g., pre-compute error rates per service). (4) Build Grafana dashboards: overview dashboard (all services error rate + latency), per-service dashboard (detailed metrics), infrastructure dashboard (nodes, pods). (5) Create PrometheusRules for alerting: error rate > 1% for 5 minutes (warning), error rate > 5% for 2 minutes (critical), p99 latency > SLA for 10 minutes. (6) Configure AlertManager routes: critical → PagerDuty, warning → Slack, info → dashboard. (7) Monitor Prometheus itself: scrape duration, target down count, storage usage. (8) For high-cardinality metrics (per-user, per-request-ID), use exemplars linking to traces instead of high-cardinality labels.

---

## 9. Quick Reference

| Tool | Type | Purpose |
|------|------|---------|
| **Metrics Server** | Metrics | kubectl top, HPA (current metrics only) |
| **Prometheus** | Metrics | Scraping, storage, alerting, PromQL |
| **Grafana** | Visualization | Dashboards for metrics, logs, traces |
| **AlertManager** | Alerting | Route and deduplicate Prometheus alerts |
| **Fluent Bit** | Logging | Lightweight log collector (DaemonSet) |
| **Loki** | Logging | Log storage (label-indexed, cheap) |
| **Elasticsearch** | Logging | Log storage (full-text indexed, powerful) |
| **OpenTelemetry** | Tracing | Instrumentation + collection standard |
| **Jaeger / Tempo** | Tracing | Trace storage and visualization |

| Troubleshooting Step | Command |
|---------------------|---------|
| Recent events | `kubectl get events --sort-by=.lastTimestamp` |
| Pod details + events | `kubectl describe pod <name>` |
| Container logs | `kubectl logs <pod> -c <container>` |
| Previous instance logs | `kubectl logs <pod> --previous` |
| Interactive shell | `kubectl exec -it <pod> -- /bin/sh` |
| Debug container | `kubectl debug <pod> -it --image=busybox` |
| Port forward | `kubectl port-forward <pod> 8080:80` |
| Resource usage | `kubectl top pod --sort-by=cpu` |
| RBAC check | `kubectl auth can-i <verb> <resource>` |
| API resources | `kubectl api-resources` |
