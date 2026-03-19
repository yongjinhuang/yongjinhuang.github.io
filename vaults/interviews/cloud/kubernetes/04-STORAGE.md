# Kubernetes Storage — Deep-Dive

Storage in Kubernetes is fundamentally about solving one problem: **pods are ephemeral, but data must survive**. When a pod is killed, rescheduled, or crashes, its filesystem is destroyed. Kubernetes provides a layered storage abstraction — volumes, persistent volumes, storage classes, and CSI drivers — to decouple data lifecycle from pod lifecycle.

---

## Mental Model

Think of Kubernetes storage as a **three-layer abstraction**:

```
Application Developer              Cluster Administrator           Infrastructure
(consumes storage)                 (provisions storage)            (provides storage)
        │                                  │                            │
        v                                  v                            v
PersistentVolumeClaim (PVC) ────> PersistentVolume (PV) ────> Actual Disk
  "I need 100Gi fast SSD"          "Here is a 100Gi EBS vol"     (AWS EBS, GCE PD,
                                                                   NFS, Ceph, etc.)
        │
        │ With dynamic provisioning:
        v
StorageClass ──> CSI Driver ──> Creates actual disk automatically
  "fast-ssd"     (ebs.csi.aws.com)
```

The developer never touches the infrastructure. They just say "I need storage with these characteristics" and Kubernetes handles the rest.

---

## 1. Volume Types

### 1.1 emptyDir

A scratch space that exists for the **lifetime of the pod** (not the container). Useful for sharing data between containers in the same pod.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: shared-data
spec:
  containers:
    - name: writer
      image: busybox
      command: ['sh', '-c', 'echo "hello" > /data/message; sleep 3600']
      volumeMounts:
        - name: shared
          mountPath: /data
    - name: reader
      image: busybox
      command: ['sh', '-c', 'cat /data/message; sleep 3600']
      volumeMounts:
        - name: shared
          mountPath: /data
  volumes:
    - name: shared
      emptyDir: {} # Default: uses node disk
      # emptyDir:
      #   medium: Memory      # Uses tmpfs (RAM) — faster, limited by memory
      #   sizeLimit: 1Gi      # Limit size (evicted if exceeded)
```

**Use cases:** Cache directory, checkpoint directory, shared data between init container and app container, scratch space for computation.

**Gotcha:** emptyDir on disk counts against the node's ephemeral storage. If a pod's ephemeral storage (emptyDir + container writable layers + logs) exceeds its limit, the pod is evicted.

### 1.2 hostPath

Mounts a file or directory from the **host node's filesystem** into a pod.

```yaml
volumes:
  - name: host-data
    hostPath:
      path: /var/log/containers
      type: DirectoryOrCreate # Directory, DirectoryOrCreate, File, FileOrCreate, etc.
```

**WARNING:** hostPath is dangerous in production:

- Pod is tied to a specific node (not portable)
- Can access ANY host file (security risk)
- Data does not survive node failure
- Used legitimately by DaemonSets (log collectors, monitoring agents) that need node-level access

### 1.3 configMap and secret Volumes

Mount ConfigMap or Secret data as files in the pod filesystem.

```yaml
volumes:
  - name: config
    configMap:
      name: app-config
      items: # Optional: mount specific keys
        - key: config.yaml
          path: config.yaml # File name in the mount path
  - name: certs
    secret:
      secretName: tls-certs
      defaultMode: 0400 # File permissions (read-only for owner)
```

**Hot-reload behavior:** When a ConfigMap or Secret is updated, the mounted files are eventually updated too (kubelet sync period, default ~1 minute). However, environment variables sourced from ConfigMap/Secret are NOT updated — the pod must be restarted.

### 1.4 projected Volume

Combines multiple volume sources into a single mount point.

```yaml
volumes:
  - name: all-config
    projected:
      sources:
        - configMap:
            name: app-config
        - secret:
            name: app-secret
        - serviceAccountToken:
            path: token
            expirationSeconds: 3600
            audience: api
        - downwardAPI:
            items:
              - path: labels
                fieldRef:
                  fieldPath: metadata.labels
```

### 1.5 downwardAPI Volume

Exposes pod metadata as files.

```yaml
volumes:
  - name: podinfo
    downwardAPI:
      items:
        - path: 'labels'
          fieldRef:
            fieldPath: metadata.labels
        - path: 'cpu_limit'
          resourceFieldRef:
            containerName: app
            resource: limits.cpu
```

---

## 2. PersistentVolume (PV) and PersistentVolumeClaim (PVC)

### 2.1 The Binding Model

```
┌──────────────────┐        ┌──────────────────┐         ┌──────────────────┐
│       PVC         │        │        PV         │         │   Actual Storage  │
│                   │ bind   │                   │ backed  │                   │
│  "I need 100Gi   │───────>│  "I am a 100Gi   │────────>│  AWS EBS volume   │
│   RWO, fast-ssd" │        │   RWO, EBS vol"  │         │  vol-0abc123      │
│                   │        │                   │         │                   │
│  Namespace-scoped │        │  Cluster-scoped   │         │  Cloud-scoped     │
└──────────────────┘        └──────────────────┘         └──────────────────┘
```

**PVCs are namespace-scoped. PVs are cluster-scoped.** A PVC "claims" a PV that satisfies its requirements.

### 2.2 Access Modes

| Mode             | Abbreviation | Description                                  |
| ---------------- | ------------ | -------------------------------------------- |
| ReadWriteOnce    | RWO          | Single node read-write (most block storage)  |
| ReadOnlyMany     | ROX          | Multiple nodes read-only                     |
| ReadWriteMany    | RWX          | Multiple nodes read-write (NFS, EFS, CephFS) |
| ReadWriteOncePod | RWOP         | Single pod read-write (1.27+ GA, strictest)  |

**Critical detail:** RWO means one NODE, not one POD. Multiple pods on the same node CAN share an RWO volume. Use RWOP if you truly need single-pod access.

### 2.3 Reclaim Policies

| Policy    | Behavior                                              | Use Case                       |
| --------- | ----------------------------------------------------- | ------------------------------ |
| `Retain`  | PV is kept after PVC deletion (manual cleanup needed) | Production data (safety first) |
| `Delete`  | PV and underlying storage are deleted with PVC        | Dev/test (automatic cleanup)   |
| `Recycle` | DEPRECATED — do not use                               |                                |

### 2.4 PV/PVC Example

```yaml
# Static provisioning: Admin creates PV manually
apiVersion: v1
kind: PersistentVolume
metadata:
  name: database-pv
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: '' # Empty = do not match any StorageClass
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0abc123def # Pre-existing EBS volume ID

---
# Developer creates PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-pvc
  namespace: production
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
  storageClassName: '' # Bind to a PV with no StorageClass

---
# Pod uses PVC
apiVersion: v1
kind: Pod
metadata:
  name: database
spec:
  containers:
    - name: postgres
      image: postgres:16
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: database-pvc
```

### 2.5 PV Lifecycle States

```
Available ──> Bound ──> Released ──> Available (after reclaim)
                          │
                          └──> Failed (reclaim failed)
```

```bash
# Check PV/PVC status
kubectl get pv
# NAME           CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM
# database-pv    100Gi      RWO            Retain           Bound    production/database-pvc

kubectl get pvc -n production
# NAME            STATUS   VOLUME         CAPACITY   ACCESS MODES   STORAGECLASS
# database-pvc    Bound    database-pv    100Gi      RWO
```

---

## 3. StorageClass and Dynamic Provisioning

With dynamic provisioning, the cluster automatically creates PVs when a PVC requests storage from a StorageClass.

### 3.1 StorageClass Definition

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: 'true' # Default SC
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: '5000'
  throughput: '250' # MB/s
  encrypted: 'true'
  kmsKeyId: 'arn:aws:kms:...'
reclaimPolicy: Delete # PV deleted when PVC is deleted
allowVolumeExpansion: true # Allow resizing PVCs
volumeBindingMode: WaitForFirstConsumer # See below
mountOptions:
  - noatime
```

### 3.2 Volume Binding Modes

| Mode                   | Behavior                                           | When to Use                                                                    |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Immediate`            | PV is provisioned immediately when PVC is created  | When storage is accessible from any node                                       |
| `WaitForFirstConsumer` | PV is provisioned when a pod actually uses the PVC | Zone-aware storage (EBS, GCE PD) — ensures volume is in the same AZ as the pod |

**Critical:** Always use `WaitForFirstConsumer` with zone-aware storage (AWS EBS, GCE PD). Otherwise, the volume might be created in AZ-a but the pod gets scheduled to AZ-b, and the pod is stuck Pending forever.

### 3.3 Common StorageClasses

```yaml
# AWS EBS (gp3, high performance)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
volumeBindingMode: WaitForFirstConsumer

---
# AWS EFS (shared filesystem, RWX)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: shared-efs
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: fs-0abc123
  directoryPerms: '700'

---
# GKE Persistent Disk (SSD)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ssd-regional
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-ssd
  replication-type: regional-pd
volumeBindingMode: WaitForFirstConsumer

---
# NFS (on-premises)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs
provisioner: nfs.csi.k8s.io
parameters:
  server: nfs-server.example.com
  share: /exported/path
```

---

## 4. CSI (Container Storage Interface)

CSI is the standard interface between Kubernetes and storage providers. It replaced the old "in-tree" volume plugins that were compiled into Kubernetes itself.

### 4.1 CSI Architecture

```
┌────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                     │
│                                                        │
│  ┌─────────────────────────────────────┐              │
│  │  CSI Controller Plugin               │              │
│  │  (Deployment, 1-3 replicas)          │              │
│  │                                      │              │
│  │  ├── external-provisioner            │              │
│  │  │   (watches PVCs, calls CSI        │              │
│  │  │    CreateVolume)                  │              │
│  │  ├── external-attacher              │              │
│  │  │   (attaches volume to node)      │              │
│  │  ├── external-snapshotter           │              │
│  │  │   (handles VolumeSnapshot)       │              │
│  │  ├── external-resizer              │              │
│  │  │   (handles volume expansion)     │              │
│  │  └── CSI driver container           │              │
│  │      (storage vendor code)          │              │
│  └─────────────────────────────────────┘              │
│                                                        │
│  ┌─────────────────────────────────────┐              │
│  │  CSI Node Plugin                     │              │
│  │  (DaemonSet, runs on every node)     │              │
│  │                                      │              │
│  │  ├── node-driver-registrar          │              │
│  │  │   (registers CSI driver with      │              │
│  │  │    kubelet)                       │              │
│  │  └── CSI driver container           │              │
│  │      (mounts/unmounts volumes)      │              │
│  └─────────────────────────────────────┘              │
└────────────────────────────────────────────────────────┘
```

### 4.2 Volume Lifecycle with CSI

```
PVC created
      │
      v
external-provisioner watches PVC, calls CSI CreateVolume
      │
      v
CSI driver creates actual storage (e.g., AWS EBS API call)
      │
      v
PV created and bound to PVC
      │
      v
Pod scheduled to a node
      │
      v
external-attacher calls CSI ControllerPublishVolume
(attaches EBS volume to EC2 instance)
      │
      v
kubelet calls CSI NodeStageVolume (formats if needed)
      │
      v
kubelet calls CSI NodePublishVolume (mounts to pod path)
      │
      v
Container sees mounted filesystem at specified mountPath
```

### 4.3 Common CSI Drivers

| Driver                  | Storage Backend     | Access Modes  | Features                         |
| ----------------------- | ------------------- | ------------- | -------------------------------- |
| `ebs.csi.aws.com`       | AWS EBS             | RWO           | Snapshots, encryption, resizing  |
| `efs.csi.aws.com`       | AWS EFS             | RWX           | Shared filesystem, access points |
| `pd.csi.storage.gke.io` | GCE Persistent Disk | RWO, ROX      | Regional PDs, snapshots          |
| `disk.csi.azure.com`    | Azure Managed Disk  | RWO           | Snapshots, encryption            |
| `file.csi.azure.com`    | Azure Files         | RWX           | SMB/NFS shares                   |
| `nfs.csi.k8s.io`        | NFS servers         | RWX           | Any NFS server                   |
| `rook-ceph.ceph.com`    | Ceph (via Rook)     | RWO, RWX, ROX | Block, file, object              |

---

## 5. StatefulSet Storage

StatefulSets use `volumeClaimTemplates` to create a **dedicated PVC per pod**.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless
  replicas: 3
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
            - name: wal
              mountPath: /var/lib/postgresql/wal
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ['ReadWriteOnce']
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 100Gi
    - metadata:
        name: wal
      spec:
        accessModes: ['ReadWriteOnce']
        storageClassName: ultra-fast-ssd # Higher IOPS for WAL
        resources:
          requests:
            storage: 20Gi
```

**What happens:**

```
StatefulSet: postgres (replicas: 3)

Pod: postgres-0 ──> PVC: data-postgres-0 ──> PV: pv-abc123
                    PVC: wal-postgres-0  ──> PV: pv-def456

Pod: postgres-1 ──> PVC: data-postgres-1 ──> PV: pv-ghi789
                    PVC: wal-postgres-1  ──> PV: pv-jkl012

Pod: postgres-2 ──> PVC: data-postgres-2 ──> PV: pv-mno345
                    PVC: wal-postgres-2  ──> PV: pv-pqr678
```

**If postgres-1 crashes and gets rescheduled to a different node:**

- The PVC `data-postgres-1` persists (it is not deleted)
- The PV is detached from old node and attached to new node
- Pod restarts with the same data

**If the StatefulSet is deleted:**

- Pods are deleted
- PVCs are NOT deleted (data safety by design)
- PVs remain bound to the PVCs
- Manual cleanup: `kubectl delete pvc data-postgres-0 data-postgres-1 data-postgres-2`
- Since K8s 1.27+: `persistentVolumeClaimRetentionPolicy` can auto-delete PVCs

```yaml
# Auto-cleanup PVCs (1.27+)
spec:
  persistentVolumeClaimRetentionPolicy:
    whenDeleted: Delete # Delete PVCs when StatefulSet is deleted
    whenScaled: Retain # Keep PVCs when scaling down (safety)
```

---

## 6. Volume Snapshots

### 6.1 Creating a Snapshot

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: ebs-snapshot-class
driver: ebs.csi.aws.com
deletionPolicy: Delete
parameters:
  tagSpecification_1: 'Name=k8s-snapshot'

---
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: database-snapshot
spec:
  volumeSnapshotClassName: ebs-snapshot-class
  source:
    persistentVolumeClaimName: database-pvc
```

### 6.2 Restoring from a Snapshot

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-pvc-restored
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 100Gi
  dataSource:
    name: database-snapshot
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
```

```bash
# Check snapshot status
kubectl get volumesnapshot
# NAME                READYTOUSE   SOURCEPVC        RESTORESIZE   SNAPSHOTCLASS
# database-snapshot   true         database-pvc     100Gi         ebs-snapshot-class
```

---

## 7. Volume Expansion

With `allowVolumeExpansion: true` on the StorageClass:

```bash
# Expand a PVC (online expansion supported by most CSI drivers)
kubectl patch pvc database-pvc -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'

# Check expansion status
kubectl get pvc database-pvc
# STATUS: FileSystemResizePending → Bound (after filesystem resize)
```

**Gotcha:** You can only INCREASE PVC size, never decrease. For EBS, there is a 6-hour cooldown between size changes (AWS limitation, not K8s).

---

## 8. Ephemeral Volumes

### 8.1 Generic Ephemeral Volumes

Like dynamic PVCs but tied to the pod lifecycle — automatically created and deleted with the pod.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: data-processor
spec:
  containers:
    - name: processor
      image: data-processor:v1
      volumeMounts:
        - name: scratch
          mountPath: /scratch
  volumes:
    - name: scratch
      ephemeral:
        volumeClaimTemplate:
          spec:
            accessModes: ['ReadWriteOnce']
            storageClassName: fast-ssd
            resources:
              requests:
                storage: 50Gi
```

**Use case:** Batch jobs that need fast temporary storage larger than emptyDir, without leaving orphan PVCs.

### 8.2 CSI Ephemeral Volumes

Provided by CSI drivers that support ephemeral inline volumes. Useful for secrets injection (Secrets Store CSI driver).

```yaml
volumes:
  - name: secrets
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: aws-secrets
```

---

## 9. Storage Performance

### 9.1 Key Metrics

| Metric         | What It Measures          | Impact                            |
| -------------- | ------------------------- | --------------------------------- |
| **IOPS**       | I/O operations per second | Database transaction throughput   |
| **Throughput** | MB/s read/write           | Large file transfers, backups     |
| **Latency**    | Time per I/O operation    | Query response time, write commit |

### 9.2 Storage Tier Comparison

| Storage Type | IOPS          | Throughput       | Latency | Access Mode      | Use Case            |
| ------------ | ------------- | ---------------- | ------- | ---------------- | ------------------- |
| Local NVMe   | 100k+         | 3+ GB/s          | <0.1ms  | RWO (node-local) | etcd, high-perf DB  |
| AWS gp3      | 3,000-16,000  | 125-1,000 MB/s   | 1-2ms   | RWO              | General purpose     |
| AWS io2      | Up to 256,000 | 4,000 MB/s       | <1ms    | RWO              | Critical databases  |
| AWS EFS      | Burst-based   | Up to 10 GB/s    | 1-10ms  | RWX              | Shared config, CMS  |
| GCE PD SSD   | Up to 100,000 | Up to 2,400 MB/s | <1ms    | RWO              | Databases           |
| NFS          | Varies        | Varies           | 1-50ms  | RWX              | Legacy, shared data |

### 9.3 Performance Tuning Tips

```yaml
# Use separate volumes for data and WAL (databases)
volumeMounts:
  - name: data
    mountPath: /var/lib/postgresql/data
  - name: wal
    mountPath: /var/lib/postgresql/wal # Higher IOPS storage class

# Mount options for performance
mountOptions:
  - noatime # Disable access time updates
  - nodiratime # Disable directory access time updates
  - nobarrier # Disable write barriers (risk: data loss on power failure)
```

---

## 10. Patterns and Anti-Patterns

### 10.1 Running Databases on Kubernetes

**When it makes sense:**

- Development and staging environments
- Databases with Kubernetes operators (CloudNativePG, Vitess, CockroachDB)
- Team has strong K8s operational expertise
- Need rapid database provisioning

**When to use managed databases instead:**

- Critical production data (RDS, Cloud SQL, Aurora)
- Team lacks K8s storage expertise
- Need cross-region replication managed by the provider
- Compliance requirements that managed services satisfy

**If you DO run databases on K8s:**

```
DO:
  ✓ Use StatefulSets with volumeClaimTemplates
  ✓ Use WaitForFirstConsumer binding mode
  ✓ Separate data and WAL on different volumes
  ✓ Configure PodDisruptionBudgets
  ✓ Automated backups (snapshots + logical backups)
  ✓ Test restore procedures regularly
  ✓ Use pod anti-affinity to spread replicas across AZs
  ✓ Set Guaranteed QoS (requests = limits)

DON'T:
  ✗ Use emptyDir or hostPath for data
  ✗ Ignore backup testing
  ✗ Use Deployment instead of StatefulSet
  ✗ Forget to set resource limits
  ✗ Assume storage will survive AZ failure without replication
```

### 10.2 Backup Strategy

```
Tier 1: Volume Snapshots (CSI)
  - Frequency: Every 1-4 hours
  - RPO: 1-4 hours
  - Fast restore (minutes)
  - Same region/zone

Tier 2: Logical Backups (pg_dump, mysqldump)
  - Frequency: Daily
  - Stored in object storage (S3/GCS)
  - Cross-region
  - Slower restore (hours)

Tier 3: Velero (Cluster-level backup)
  - Backs up K8s resources + PV snapshots
  - Frequency: Daily
  - Disaster recovery (entire namespace/cluster)
```

---

## 11. Common Gotchas

### 11.1 WaitForFirstConsumer vs Immediate

Using `Immediate` binding with zone-aware storage (EBS) can create a volume in AZ-a while the pod is scheduled to AZ-b. The pod is stuck Pending forever. Always use `WaitForFirstConsumer`.

### 11.2 PVC Stuck in Pending

Most common causes: no StorageClass matches, StorageClass provisioner is not installed, resource quota exceeded, volume binding mode is WaitForFirstConsumer and no pod is using it yet.

```bash
kubectl describe pvc <name>
# Check Events section for the specific reason
```

### 11.3 Cannot Delete PVC Because Pod Is Using It

PVCs with `finalizers: [kubernetes.io/pvc-protection]` cannot be deleted while a pod is using them. Delete the pod first, then the PVC.

### 11.4 Volume Expansion Requires Pod Restart (Sometimes)

Some CSI drivers require the pod to be restarted for filesystem expansion. Others support online expansion. Check your driver's documentation.

### 11.5 RWO Does Not Mean Single-Pod

ReadWriteOnce means single-NODE. Multiple pods on the same node can mount the same RWO volume simultaneously, potentially corrupting data. Use ReadWriteOncePod (RWOP) for true single-pod access.

### 11.6 StatefulSet PVCs Are Orphaned on Delete

Deleting a StatefulSet does NOT delete its PVCs. You must delete them manually. This is intentional (data safety) but catches people off guard with storage costs.

### 11.7 hostPath Is Not Portable

Pods using hostPath are tied to a specific node. If the pod is rescheduled to another node, it gets different (or missing) data. Only use hostPath for DaemonSets that genuinely need node-local access.

### 11.8 Snapshot Consistency Requires Application Quiescing

A volume snapshot captures the disk state at a point in time, but if the application has data in memory buffers, the snapshot may be inconsistent. For databases, freeze writes or use application-level snapshot features before taking a volume snapshot.

### 11.9 EBS Volume Stuck in Attaching

If a node crashes without cleanly detaching its EBS volumes, the volumes can be stuck in "attaching" state for up to 6 minutes (AWS force-detach timeout). During this time, the replacement pod cannot start. This is a known pain point for EBS-backed StatefulSets.

### 11.10 NFS Performance and Locking

NFS performance degrades significantly under high I/O. NFS file locking is unreliable across pods. Avoid NFS for databases or any workload with heavy write I/O.

---

## 12. Interview Questions

### Q1: "How do you run a database on Kubernetes? What are the trade-offs?"

**Deep answer:** Use a StatefulSet with volumeClaimTemplates for per-replica persistent storage. Separate data and write-ahead log on different volumes with different performance characteristics. Use a headless service for replica discovery. Set WaitForFirstConsumer binding mode so volumes are co-located with pods. Configure PodDisruptionBudgets to prevent multiple replicas going down during maintenance. Use pod anti-affinity to spread replicas across AZs. Set Guaranteed QoS with requests equal to limits. Implement automated backups at two levels: CSI volume snapshots (hourly, fast restore) and logical backups to object storage (daily, cross-region). Trade-offs versus managed databases: you get more control, portability, and faster provisioning, but you own the operational burden — upgrades, failover, backup testing, performance tuning, and 3 AM pages. For production-critical data, managed databases (RDS, Cloud SQL) are usually the safer choice unless you have a dedicated platform team with deep K8s storage expertise.

### Q2: "Explain the difference between Immediate and WaitForFirstConsumer volume binding modes."

**Deep answer:** With Immediate binding, the PV is provisioned and bound to the PVC as soon as the PVC is created, before any pod references it. This works for storage accessible from any node (NFS, EFS) but fails with zone-aware storage (EBS, GCE PD). The volume might be created in AZ-a, but the scheduler later places the pod in AZ-b — the pod cannot mount the volume and stays Pending. WaitForFirstConsumer delays provisioning until a pod actually references the PVC. The scheduler considers storage topology constraints during scheduling, ensuring the volume is created in the same zone as the pod. This is essential for any zone-scoped block storage and should be the default in most production clusters.

### Q3: "What happens to storage when a StatefulSet pod is rescheduled?"

**Deep answer:** The PVC persists — it is not deleted. The PV is detached from the old node (ControllerUnpublishVolume) and attached to the new node (ControllerPublishVolume). The kubelet on the new node stages and mounts the volume. The pod starts with the same data it had before. This is the fundamental guarantee of StatefulSets: stable storage identity. However, there is a recovery time — detaching from the old node (especially if the node is unresponsive, which can take minutes for force-detach), creating the new pod, attaching to the new node, mounting, and starting the application. For EBS, this can be 2-6 minutes total. During this time, that replica is unavailable.

### Q4: "How would you implement a backup strategy for persistent data in Kubernetes?"

**Deep answer:** Three tiers: (1) CSI VolumeSnapshots every 1-4 hours for fast point-in-time recovery (RPO: hours, RTO: minutes). These are storage-level snapshots (e.g., EBS snapshots) and are fast to create and restore. (2) Application-level logical backups (pg_dump, mysqldump) daily, stored in object storage (S3) in a different region for disaster recovery. Slower to restore but provides cross-region protection. (3) Velero for cluster-level backup — backs up Kubernetes resource definitions and PV data together. Useful for namespace migration or full disaster recovery. For all tiers: test restores regularly (untested backups are not backups), monitor backup jobs for failures, encrypt backups at rest and in transit, implement retention policies to manage storage costs.

### Q5: "What is CSI and why did Kubernetes move from in-tree volume plugins to CSI?"

**Deep answer:** CSI is a standard gRPC interface between container orchestrators and storage providers. Before CSI, every storage provider (AWS EBS, GCE PD, Ceph, etc.) had their code compiled directly into the Kubernetes binary (in-tree plugins). This had three problems: (1) Storage vendors had to submit code to the K8s repository and follow the K8s release cycle — a new storage feature meant waiting 3-4 months for the next K8s release. (2) Bug fixes in storage drivers required upgrading the entire cluster. (3) The Kubernetes binary grew enormous with all storage plugins. CSI solves this by defining a standard interface. Storage vendors develop their own CSI driver as a separate binary, deployed as pods (controller Deployment + node DaemonSet). They can release independently, fix bugs without K8s upgrades, and add features on their own timeline. The CSI architecture has a controller plugin (handles provisioning, attaching, snapshots) and a node plugin (handles mounting/unmounting on each node).

---

## 13. Quick Reference

| Volume Type | Persistence        | Scope     | Use Case                               |
| ----------- | ------------------ | --------- | -------------------------------------- |
| `emptyDir`  | Pod lifetime       | Pod       | Scratch space, inter-container sharing |
| `hostPath`  | Node lifetime      | Node      | DaemonSet node access (logs, sockets)  |
| `configMap` | ConfigMap lifetime | Namespace | Configuration files                    |
| `secret`    | Secret lifetime    | Namespace | Credentials, TLS certs                 |
| `PVC`       | Until PVC deleted  | Namespace | Persistent application data            |
| `ephemeral` | Pod lifetime       | Pod       | Temporary fast storage                 |

| Binding Mode           | When PV Is Provisioned | Use With                            |
| ---------------------- | ---------------------- | ----------------------------------- |
| `Immediate`            | When PVC is created    | NFS, EFS, any zone-agnostic storage |
| `WaitForFirstConsumer` | When pod uses the PVC  | EBS, GCE PD, any zone-aware storage |

| Access Mode      | Short | Single Node | Multi-Node | Single Pod                         |
| ---------------- | ----- | ----------- | ---------- | ---------------------------------- |
| ReadWriteOnce    | RWO   | Yes         | No         | No (multiple pods on same node OK) |
| ReadOnlyMany     | ROX   | Yes         | Yes        | No                                 |
| ReadWriteMany    | RWX   | Yes         | Yes        | No                                 |
| ReadWriteOncePod | RWOP  | Yes         | No         | Yes (strictest)                    |
