# Kubernetes (K8s) Interview Preparation — Deep-Dive Reference

Kubernetes is the **industry-standard container orchestration platform**. It automates deployment, scaling, and management of containerized applications. This guide goes deep — not surface-level overviews, but the internals, trade-offs, and real-world production patterns that interviewers at top companies expect you to know.

---

## File Index

| # | File | Topic | Key Areas |
|---|------|-------|-----------|
| 00 | INDEX.md | This file | Overview, K8s timeline, certifications |
| 01 | ARCHITECTURE.md | Cluster Architecture | Control plane, etcd, API server lifecycle, scheduler internals |
| 02 | PODS-WORKLOADS.md | Pods & Workloads | Pod internals, init/sidecar containers, probes, Deployments, StatefulSets, DaemonSets, Jobs |
| 03 | SERVICES-NETWORKING.md | Services & Networking | CNI, Service types, kube-proxy, DNS, Ingress, Gateway API, NetworkPolicies |
| 04 | STORAGE.md | Storage | Volumes, PV/PVC, StorageClass, CSI, StatefulSet storage, snapshots |
| 05 | CONFIGURATION.md | Configuration | ConfigMaps, Secrets, external secret management, Kustomize, Helm |
| 06 | RBAC-SECURITY.md | Security | Authentication, RBAC, admission controllers, Pod Security, supply chain |
| 07 | OBSERVABILITY.md | Observability | Metrics, logging, tracing, debugging, autoscaling, troubleshooting |
| 08 | PRODUCTION-PATTERNS.md | Production Patterns | HA, GitOps, multi-cluster, upgrades, zero-downtime, cost optimization |
| 09 | HELM-OPERATORS.md | Helm & Operators | Helm deep-dive, CRDs, Operator pattern, operator frameworks |

---

## Mental Model: What Kubernetes Actually Is

At its core, Kubernetes is a **declarative, reconciliation-based control system**. You tell it what you want (desired state), and it continuously works to make reality match your declaration. That is the single most important concept.

```
You declare:  "I want 3 replicas of my web app, each with 512Mi memory"
     |
     v
Kubernetes: "I see 2 running. Let me create 1 more."
     |
     v
(Pod crashes)
     |
     v
Kubernetes: "I see 2 running. Let me create 1 more."  <-- reconciliation loop
```

Everything in Kubernetes — controllers, operators, the scheduler — follows this pattern: **observe current state, compare to desired state, take action to converge**.

---

## Kubernetes Version Timeline

Kubernetes releases every ~4 months. Each minor release is supported for approximately 14 months (12 months standard + 2 months maintenance).

| Version | Release Date | Key Features |
|---------|-------------|--------------|
| **1.0** | Jul 2015 | Initial release, donated to CNCF |
| **1.5** | Dec 2016 | StatefulSets (beta), PodDisruptionBudgets |
| **1.7** | Jun 2017 | RBAC GA, CRD (replacing ThirdPartyResource) |
| **1.9** | Dec 2017 | Workloads API GA (Deployments, StatefulSets, DaemonSets, ReplicaSets) |
| **1.13** | Dec 2018 | CoreDNS default, kubeadm GA |
| **1.16** | Sep 2019 | CRD GA, deprecated extensions/v1beta1 APIs |
| **1.19** | Aug 2020 | Ingress GA, extended support window (1 year) |
| **1.20** | Dec 2020 | Dockershim deprecation announced |
| **1.21** | Apr 2021 | CronJob GA, immutable Secrets/ConfigMaps |
| **1.22** | Aug 2021 | PodSecurity admission (replacing PodSecurityPolicy), server-side apply GA |
| **1.24** | May 2022 | Dockershim removed, bound service account tokens default |
| **1.25** | Aug 2022 | PodSecurityPolicy removed, ephemeral containers GA, cgroups v2 support |
| **1.26** | Dec 2022 | Dynamic resource allocation (alpha), CEL for admission |
| **1.27** | Apr 2023 | In-place pod resource resize (alpha), VolumeAttributesClass (alpha) |
| **1.28** | Aug 2023 | Sidecar containers (native), recovery from non-graceful node shutdown GA |
| **1.29** | Dec 2023 | KMS v2 GA, load balancer IP mode |
| **1.30** | Apr 2024 | Contextual logging GA, node swap support (beta) |
| **1.31** | Aug 2024 | AppArmor support GA, nftables kube-proxy backend |
| **1.32** | Dec 2024 | Structured authorization, auto-remove PVCs from StatefulSets |

**Rule of thumb:** Production clusters should run N-1 or N-2 (where N is the latest release). Never skip more than one minor version when upgrading.

---

## Certification Paths

| Certification | Focus | Format | Duration | Passing |
|--------------|-------|--------|----------|---------|
| **CKA** (Certified Kubernetes Administrator) | Cluster setup, networking, storage, troubleshooting, security | Performance-based (live cluster tasks) | 2 hours | 66% |
| **CKAD** (Certified Kubernetes Application Developer) | Pod design, services, configuration, observability | Performance-based (live cluster tasks) | 2 hours | 66% |
| **CKS** (Certified Kubernetes Security Specialist) | Cluster hardening, system hardening, supply chain, runtime security | Performance-based (live cluster tasks) | 2 hours | 67% |
| **KCNA** (Kubernetes and Cloud Native Associate) | Foundational knowledge, cloud native concepts | Multiple choice | 90 minutes | 75% |
| **KCSA** (Kubernetes and Cloud Native Security Associate) | Security foundations, platform security, compliance | Multiple choice | 90 minutes | 75% |

### Recommended Order

```
KCNA (optional, if new to K8s)
  |
  v
CKAD (if you're a developer)     CKA (if you're an operator/SRE)
  |                                 |
  v                                 v
CKA (understand the full stack)   CKAD (understand app patterns)
  |                                 |
  v                                 v
  +---------> CKS (security) <-----+
```

**Exam tips:**
- All exams allow access to the official Kubernetes documentation (kubernetes.io/docs)
- Practice with `kubectl` until it is muscle memory
- Master imperative commands for speed: `kubectl run`, `kubectl create`, `kubectl expose`
- Use `kubectl explain <resource>` during the exam to quickly check field names
- Bookmark key docs pages before the exam

---

## Essential kubectl Commands You Must Know

```bash
# Cluster info
kubectl cluster-info
kubectl get nodes -o wide
kubectl api-resources            # List ALL resource types (invaluable reference)
kubectl api-versions             # List all API groups/versions

# Resource exploration
kubectl explain pod.spec.containers.livenessProbe   # Built-in docs
kubectl get pods -A -o wide                         # All namespaces
kubectl get events --sort-by=.lastTimestamp          # Recent events

# Imperative shortcuts (exam speed)
kubectl run nginx --image=nginx --port=80 --dry-run=client -o yaml
kubectl create deploy web --image=nginx --replicas=3 --dry-run=client -o yaml
kubectl expose deploy web --port=80 --target-port=8080 --type=ClusterIP
kubectl create configmap my-config --from-literal=key=value
kubectl create secret generic my-secret --from-literal=password=s3cr3t

# Debugging
kubectl describe pod <name>       # Events section is gold
kubectl logs <pod> -c <container> --previous --since=1h
kubectl exec -it <pod> -- /bin/sh
kubectl port-forward svc/web 8080:80
kubectl top pod --sort-by=memory
kubectl auth can-i create pods --as=system:serviceaccount:default:mysa

# Context and namespace management
kubectl config get-contexts
kubectl config use-context my-cluster
kubectl config set-context --current --namespace=production
```

---

## How to Use This Guide

1. **Read sequentially** if you are new to Kubernetes — the files build on each other.
2. **Use as reference** if you are experienced — jump to specific topics you need to review.
3. **Practice the interview questions** at the end of each file — they are designed to test depth, not just recall.
4. **Run the commands** on a real cluster (minikube, kind, or a cloud provider) — reading alone is not enough.

---

## Quick Reference: K8s Resource Hierarchy

```
Cluster
├── Nodes (machines)
│   ├── kubelet
│   ├── kube-proxy
│   └── Container Runtime
├── Namespaces (logical isolation)
│   ├── Pods (smallest deployable unit)
│   │   ├── Containers (1+)
│   │   ├── Init Containers
│   │   ├── Sidecar Containers
│   │   └── Volumes
│   ├── Workload Controllers
│   │   ├── Deployment → ReplicaSet → Pod
│   │   ├── StatefulSet → Pod (with stable identity)
│   │   ├── DaemonSet → Pod (one per node)
│   │   ├── Job → Pod (run to completion)
│   │   └── CronJob → Job (scheduled)
│   ├── Services (stable network endpoint)
│   │   ├── ClusterIP
│   │   ├── NodePort
│   │   ├── LoadBalancer
│   │   └── ExternalName
│   ├── Configuration
│   │   ├── ConfigMap
│   │   ├── Secret
│   │   └── ServiceAccount
│   ├── Storage
│   │   ├── PersistentVolumeClaim
│   │   └── StorageClass
│   └── Policy
│       ├── NetworkPolicy
│       ├── LimitRange
│       ├── ResourceQuota
│       └── PodDisruptionBudget
└── Cluster-scoped Resources
    ├── Node
    ├── PersistentVolume
    ├── ClusterRole / ClusterRoleBinding
    ├── Namespace
    ├── CustomResourceDefinition
    └── IngressClass / StorageClass
```
