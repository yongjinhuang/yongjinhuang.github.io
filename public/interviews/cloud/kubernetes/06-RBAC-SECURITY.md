# Kubernetes RBAC and Security — Deep-Dive

Security in Kubernetes is not a single feature — it is a layered defense spanning authentication, authorization, admission control, runtime security, network segmentation, and supply chain integrity. Most production security incidents stem from default configurations that are too permissive. This guide covers the full stack.

---

## Mental Model

Think of Kubernetes security as **concentric rings**, each providing a layer of defense:

```
┌──────────────────────────────────────────────────────────┐
│  Ring 1: AUTHENTICATION (Who are you?)                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Ring 2: AUTHORIZATION (What can you do?)           │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Ring 3: ADMISSION CONTROL (Is this allowed?) │  │  │
│  │  │  ┌────────────────────────────────────────┐  │  │  │
│  │  │  │  Ring 4: RUNTIME SECURITY               │  │  │  │
│  │  │  │  (Container isolation, seccomp, AppArmor│  │  │  │
│  │  │  │   network policies, pod security)       │  │  │  │
│  │  │  └────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Every API request passes through rings 1-3 in order. Ring 4 operates at runtime on the nodes.

---

## 1. Authentication

Authentication determines **who you are**. Kubernetes does not have a built-in user database — it delegates authentication to external systems.

### 1.1 Authentication Methods

| Method | How It Works | Used By |
|--------|-------------|---------|
| **X.509 client certificates** | Client presents a cert signed by the cluster CA. CN = username, O = group | kubectl (kubeconfig), kubelet |
| **Bearer tokens** | Token in Authorization header | ServiceAccounts, bootstrap tokens |
| **OIDC tokens** | JWT tokens from an identity provider (Google, Okta, Dex) | Human users in production |
| **Webhook token review** | API server calls external webhook to validate token | Custom authentication systems |
| **ServiceAccount tokens** | JWT tokens bound to a ServiceAccount, auto-mounted in pods | Pod-to-API-server communication |

### 1.2 ServiceAccount Tokens (Bound Tokens, 1.24+)

Since Kubernetes 1.24, ServiceAccount tokens are **bound** — they are audience-limited, time-limited, and bound to a specific pod.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: production
automountServiceAccountToken: false    # Disable auto-mount (security best practice)
```

```yaml
# Explicitly request a projected token with audience and expiration
spec:
  containers:
  - name: app
    image: my-app:v1
    volumeMounts:
    - name: token
      mountPath: /var/run/secrets/kubernetes.io/serviceaccount
  volumes:
  - name: token
    projected:
      sources:
      - serviceAccountToken:
          path: token
          expirationSeconds: 3600      # 1 hour (auto-rotated by kubelet)
          audience: api                 # Token valid only for this audience
```

### 1.3 OIDC Authentication

The recommended method for human users in production:

```
User → Identity Provider (Okta, Google, Dex)
         │
         v
      OAuth2/OIDC flow → ID token (JWT)
         │
         v
kubectl config set-credentials with OIDC token
         │
         v
API server validates JWT:
  - Signature (using IdP's public key)
  - Issuer (--oidc-issuer-url)
  - Audience (--oidc-client-id)
  - Claims mapping (--oidc-username-claim, --oidc-groups-claim)
```

```bash
# API server OIDC flags
--oidc-issuer-url=https://accounts.google.com
--oidc-client-id=my-k8s-client
--oidc-username-claim=email
--oidc-groups-claim=groups
```

---

## 2. Authorization (RBAC)

RBAC (Role-Based Access Control) is the default and recommended authorization mode. It grants permissions to identities (users, groups, service accounts) based on roles.

### 2.1 The RBAC Model

```
WHO                    CAN DO WHAT                ON WHAT
(Subject)              (Verbs)                    (Resources)
    │                      │                          │
    v                      v                          v
User / Group /        get, list, watch,          pods, services,
ServiceAccount        create, update,            deployments,
                      patch, delete,             secrets, etc.
                      deletecollection
    │                      │                          │
    └──────────┬───────────┘──────────────────────────┘
               │
               v
         Role / ClusterRole
               │
               v
    RoleBinding / ClusterRoleBinding
```

### 2.2 Role vs ClusterRole

| Resource | Scope | Binds With |
|----------|-------|-----------|
| **Role** | Namespace-scoped | RoleBinding |
| **ClusterRole** | Cluster-scoped | ClusterRoleBinding (cluster-wide) OR RoleBinding (namespace-scoped) |

**Key insight:** A ClusterRole bound with a RoleBinding grants permissions only in the RoleBinding's namespace. This pattern is used extensively — define a ClusterRole once, reuse it across namespaces with RoleBindings.

### 2.3 RBAC Examples

```yaml
# Role: allow read access to pods in production namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: production
rules:
- apiGroups: [""]               # "" = core API group (pods, services, etc.)
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log"]       # Sub-resource: pod logs
  verbs: ["get"]

---
# RoleBinding: grant pod-reader to user jane in production namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: jane-pod-reader
  namespace: production
subjects:
- kind: User
  name: jane@example.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

---
# ClusterRole: allow managing deployments cluster-wide
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: deployment-manager
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments/scale"]
  verbs: ["update", "patch"]

---
# ClusterRoleBinding: grant cluster-wide
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ops-team-deployment-manager
subjects:
- kind: Group
  name: ops-team
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: deployment-manager
  apiGroup: rbac.authorization.k8s.io
```

### 2.4 Default ClusterRoles

| ClusterRole | Permissions |
|------------|-------------|
| `cluster-admin` | Full access to everything (superuser) |
| `admin` | Full access within a namespace (no resource quotas or namespace itself) |
| `edit` | Read/write most resources in a namespace (no roles, no resource quotas) |
| `view` | Read-only access to most resources (no secrets, no roles) |

```bash
# Check what a user/SA can do
kubectl auth can-i create pods --as=jane@example.com
kubectl auth can-i get secrets --as=system:serviceaccount:production:my-app
kubectl auth can-i '*' '*' --as=system:serviceaccount:kube-system:admin  # Is superuser?

# List all permissions for a user
kubectl auth can-i --list --as=jane@example.com

# Check in a specific namespace
kubectl auth can-i create deployments -n production --as=jane@example.com
```

### 2.5 ServiceAccount RBAC

```yaml
# ServiceAccount for a monitoring application
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: monitoring

---
# ClusterRole: read metrics from all namespaces
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus-reader
rules:
- apiGroups: [""]
  resources: ["pods", "nodes", "endpoints", "services"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["nodes/metrics"]
  verbs: ["get"]
- nonResourceURLs: ["/metrics", "/metrics/cadvisor"]
  verbs: ["get"]

---
# ClusterRoleBinding: grant cluster-wide
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus-reader-binding
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: monitoring
roleRef:
  kind: ClusterRole
  name: prometheus-reader
  apiGroup: rbac.authorization.k8s.io
```

### 2.6 Aggregated ClusterRoles

ClusterRoles can be automatically combined using aggregation rules:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-custom
  labels:
    rbac.authorization.k8s.io/aggregate-to-view: "true"   # Auto-added to "view" role
rules:
- apiGroups: ["monitoring.coreos.com"]
  resources: ["prometheusrules", "servicemonitors"]
  verbs: ["get", "list", "watch"]
```

Any ClusterRole with the label `rbac.authorization.k8s.io/aggregate-to-view: "true"` has its rules automatically merged into the built-in `view` ClusterRole. This is how operators extend default roles.

---

## 3. Admission Controllers

Admission controllers are the **last line of defense** before data is persisted to etcd. They can mutate or reject requests.

### 3.1 Built-in Admission Controllers

| Controller | Type | What It Does |
|-----------|------|-------------|
| `NamespaceLifecycle` | Validating | Prevents operations in non-existent or terminating namespaces |
| `LimitRanger` | Mutating | Applies default resource requests/limits from LimitRange |
| `ServiceAccount` | Mutating | Auto-mounts service account tokens, creates default SA |
| `ResourceQuota` | Validating | Enforces namespace resource quotas |
| `PodSecurity` | Validating | Enforces pod security standards (Privileged/Baseline/Restricted) |
| `NodeRestriction` | Validating | Limits kubelet to modifying only its own node and pods |
| `MutatingAdmissionWebhook` | Mutating | Calls external webhooks that can modify objects |
| `ValidatingAdmissionWebhook` | Validating | Calls external webhooks that can reject objects |

### 3.2 Dynamic Admission Webhooks

External tools hook into the admission pipeline via webhooks:

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: pod-policy
webhooks:
- name: pod-policy.example.com
  clientConfig:
    service:
      name: pod-policy-webhook
      namespace: kube-system
      path: "/validate"
    caBundle: <base64-CA-cert>
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  failurePolicy: Fail              # Fail closed (reject if webhook is down)
  # failurePolicy: Ignore          # Fail open (allow if webhook is down)
  sideEffects: None
  admissionReviewVersions: ["v1"]
```

### 3.3 OPA Gatekeeper / Kyverno

Policy engines that implement complex admission policies:

**OPA Gatekeeper** uses Rego language:

```yaml
# ConstraintTemplate: define the policy
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
  - target: admission.k8s.gatekeeper.sh
    rego: |
      package k8srequiredlabels
      violation[{"msg": msg}] {
        provided := input.review.object.metadata.labels
        required := input.parameters.labels[_]
        not provided[required]
        msg := sprintf("Missing required label: %v", [required])
      }

---
# Constraint: apply the policy
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-team-label
spec:
  match:
    kinds:
    - apiGroups: ["apps"]
      kinds: ["Deployment"]
  parameters:
    labels:
    - "team"
    - "env"
```

**Kyverno** uses YAML-native policies (no Rego):

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: Enforce    # or Audit
  rules:
  - name: check-labels
    match:
      any:
      - resources:
          kinds:
          - Deployment
    validate:
      message: "Deployment must have 'team' and 'env' labels"
      pattern:
        metadata:
          labels:
            team: "?*"
            env: "?*"
```

---

## 4. Pod Security

### 4.1 Pod Security Admission (PSA)

PSA replaced PodSecurityPolicy (removed in 1.25). It enforces three security levels at the namespace level:

| Level | Description | Allows |
|-------|-------------|--------|
| **Privileged** | Unrestricted | Everything (no restrictions) |
| **Baseline** | Minimal restrictions | Most standard workloads (no privileged, no host network/PID/IPC) |
| **Restricted** | Heavily restricted | Must run as non-root, drop all capabilities, read-only root filesystem |

```yaml
# Apply Restricted enforcement to a namespace
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/warn: restricted        # Warn on violations
    pod-security.kubernetes.io/audit: restricted       # Audit log violations
```

**Modes:**
- `enforce`: Reject pods that violate the policy
- `warn`: Allow but show a warning to the user
- `audit`: Allow but record in audit log

### 4.2 Security Contexts

Fine-grained security settings applied per-pod or per-container:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:                    # Pod-level security context
    runAsNonRoot: true                # Reject containers that run as root
    runAsUser: 1000                   # Run as UID 1000
    runAsGroup: 3000                  # Run as GID 3000
    fsGroup: 2000                     # Supplemental group for volume mounts
    seccompProfile:
      type: RuntimeDefault            # Apply default seccomp profile

  containers:
  - name: app
    image: my-app:v1
    securityContext:                  # Container-level security context
      allowPrivilegeEscalation: false # Prevent setuid/setgid
      readOnlyRootFilesystem: true    # Read-only root fs (write to volumes only)
      capabilities:
        drop:
        - ALL                         # Drop all Linux capabilities
        add:
        - NET_BIND_SERVICE            # Only add what is needed
      seccompProfile:
        type: RuntimeDefault
```

### 4.3 Key Security Context Fields

| Field | What It Does | Recommended Value |
|-------|-------------|-------------------|
| `runAsNonRoot` | Reject if container runs as UID 0 | `true` |
| `runAsUser` | Set the UID | Non-zero (e.g., 1000) |
| `readOnlyRootFilesystem` | Prevent writing to container filesystem | `true` |
| `allowPrivilegeEscalation` | Prevent gaining more privileges than parent | `false` |
| `capabilities.drop` | Remove Linux capabilities | `["ALL"]` |
| `seccompProfile.type` | Syscall filtering | `RuntimeDefault` |
| `privileged` | Full host access | `false` (never true in production) |

---

## 5. Network Security

### 5.1 Default Deny Pattern

```yaml
# Deny all ingress and egress in a namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

Then whitelist specific traffic:

```yaml
# Allow frontend to receive traffic from ingress controller
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-frontend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
```

### 5.2 Namespace Isolation

```yaml
# Only allow traffic between pods in the same namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: namespace-isolation
  namespace: team-a
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector: {}            # Any pod in same namespace
  egress:
  - to:
    - podSelector: {}            # Any pod in same namespace
  - to:                          # Allow DNS
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

---

## 6. Supply Chain Security

### 6.1 Image Security

```
┌─────────────────────────────────────────────────────────────┐
│                    IMAGE SUPPLY CHAIN                         │
│                                                              │
│  1. Build image from trusted base                            │
│     → Use minimal base (distroless, alpine, scratch)        │
│     → Pin image digest, not just tag                        │
│                                                              │
│  2. Scan for vulnerabilities                                 │
│     → Trivy, Grype, Snyk in CI pipeline                     │
│     → Block images with CRITICAL/HIGH CVEs                  │
│                                                              │
│  3. Sign images                                              │
│     → cosign (sigstore) for keyless or key-based signing    │
│     → Notary v2 for OCI-native signatures                   │
│                                                              │
│  4. Store in private registry                                │
│     → ECR, GCR, Harbor with access controls                 │
│     → Enable vulnerability scanning on push                 │
│                                                              │
│  5. Enforce in cluster                                       │
│     → Admission policy: only allow images from trusted       │
│       registries                                             │
│     → Verify signatures before admission                     │
│     → Deny images with :latest tag                          │
└─────────────────────────────────────────────────────────────┘
```

**Kyverno policy: only allow images from trusted registry:**

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-image-registries
spec:
  validationFailureAction: Enforce
  rules:
  - name: validate-registries
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "Images must come from registry.example.com"
      pattern:
        spec:
          containers:
          - image: "registry.example.com/*"
          initContainers:
          - image: "registry.example.com/*"
```

### 6.2 Image Digest Pinning

```yaml
# BAD: Mutable tag (could change underneath you)
image: nginx:1.25

# BETTER: Specific patch version
image: nginx:1.25.3

# BEST: Digest pinning (immutable reference)
image: nginx@sha256:6a59f1cbb8d28ac484176d52c473494859a512ddba3ea62a547258cf16c9b3cc
```

### 6.3 SBOM (Software Bill of Materials)

Generate and attach SBOMs to container images for supply chain transparency:

```bash
# Generate SBOM with syft
syft registry.example.com/my-app:v1 -o spdx-json > sbom.json

# Attach SBOM to image with cosign
cosign attach sbom --sbom sbom.json registry.example.com/my-app:v1

# Sign image with cosign
cosign sign registry.example.com/my-app:v1
```

---

## 7. Secrets Encryption at Rest

### 7.1 EncryptionConfiguration

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources:
  - secrets
  - configmaps                 # Optionally encrypt ConfigMaps too
  providers:
  # Providers are tried in order. First is used for writing.
  - aescbc:                    # AES-CBC encryption (recommended for self-managed)
      keys:
      - name: key1
        secret: <base64-32-byte-key>
  - secretbox:                 # XSalsa20-Poly1305 (faster than AES-CBC)
      keys:
      - name: key1
        secret: <base64-32-byte-key>
  - kms:                       # KMS envelope encryption (recommended for cloud)
      apiVersion: v2
      name: aws-kms
      endpoint: unix:///var/run/kmsplugin/socket.sock
  - identity: {}               # Unencrypted (fallback for reading old data)
```

**KMS envelope encryption** is the best approach for cloud:
1. K8s generates a random DEK (Data Encryption Key) for each secret
2. The DEK encrypts the secret data
3. The DEK itself is encrypted by the cloud KMS key (KEK)
4. Both encrypted secret and encrypted DEK are stored in etcd
5. Decryption: KMS decrypts DEK, DEK decrypts secret

---

## 8. Audit Logging

### 8.1 Audit Policy

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
# Log all secret access at RequestResponse level
- level: RequestResponse
  resources:
  - group: ""
    resources: ["secrets"]
  # Do not log service account token reads (too noisy)
  omitStages:
  - RequestReceived

# Log all changes to RBAC
- level: RequestResponse
  resources:
  - group: "rbac.authorization.k8s.io"
    resources: ["roles", "rolebindings", "clusterroles", "clusterrolebindings"]

# Log pod creation/deletion
- level: Metadata
  resources:
  - group: ""
    resources: ["pods"]
  verbs: ["create", "delete"]

# Log everything else at Metadata level
- level: Metadata
  omitStages:
  - RequestReceived
```

**Audit levels:**

| Level | What Is Logged |
|-------|---------------|
| `None` | Nothing |
| `Metadata` | Request metadata (user, timestamp, resource, verb) but not body |
| `Request` | Metadata + request body |
| `RequestResponse` | Metadata + request body + response body |

### 8.2 Audit Backends

```bash
# Log to file
--audit-log-path=/var/log/kubernetes/audit.log
--audit-log-maxage=30
--audit-log-maxbackup=10
--audit-log-maxsize=100

# Webhook (send to external system like Elasticsearch, Splunk)
--audit-webhook-config-file=/etc/kubernetes/audit-webhook.yaml
```

---

## 9. CIS Kubernetes Benchmark — Key Items

The CIS Benchmark is the industry-standard security checklist for Kubernetes.

| Area | Key Recommendations |
|------|-------------------|
| **API Server** | Enable RBAC, disable anonymous auth, use HTTPS, enable audit logging |
| **etcd** | Encrypt at rest, restrict access (client cert auth), backup regularly |
| **Controller Manager** | Use service account credentials, rotate signing key |
| **Scheduler** | Bind to localhost, use HTTPS |
| **kubelet** | Disable anonymous auth, enable authorization (webhook), rotate certs |
| **Pods** | Run as non-root, read-only filesystem, drop all capabilities, no privileged |
| **Network** | Default deny NetworkPolicies, separate control plane network |
| **Secrets** | Encrypt at rest, external secret manager, RBAC restriction |

```bash
# Run CIS benchmark with kube-bench
kube-bench run --targets master
kube-bench run --targets node
kube-bench run --targets etcd
```

---

## 10. Common Gotchas

### 10.1 Default ServiceAccount Has Too Much Access

Every namespace gets a `default` ServiceAccount that is auto-mounted into every pod. By default, it has no RBAC permissions, but some clusters or operators grant it broad access. Always create dedicated ServiceAccounts and set `automountServiceAccountToken: false` on the default SA.

### 10.2 ClusterRoleBinding Grants Cluster-Wide Access

A common mistake: intending to grant namespace-scoped access but using ClusterRoleBinding instead of RoleBinding. Always double-check the binding type.

### 10.3 RBAC Does Not Apply to etcd

RBAC controls API server access. If someone has direct etcd access (network or filesystem), they can read/modify ALL data, bypassing RBAC entirely. Protect etcd with network isolation and mutual TLS.

### 10.4 Wildcard Rules Are Dangerous

```yaml
# DON'T: This grants everything
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

Audit all ClusterRoles with wildcard permissions. Only `cluster-admin` should have full access.

### 10.5 Pod Security Admission Is Namespace-Level Only

PSA applies per-namespace. There is no way to apply it to specific pods within a namespace. If one pod needs privileged access, the ENTIRE namespace must be set to Privileged level. Solution: separate that pod into its own namespace.

### 10.6 NetworkPolicy Requires CNI Support

Applying a NetworkPolicy on a cluster with Flannel (which does not support NetworkPolicies) silently does nothing. The policy resource is accepted, but it has no effect. Verify your CNI supports NetworkPolicies.

### 10.7 Secret Access via Pod Exec

Anyone with `pods/exec` permission can exec into a pod and read any mounted secrets. This effectively gives them secret read access, even without explicit `secrets` RBAC permissions.

### 10.8 Image Tag Mutability

The tag `my-app:v1` can point to different images at different times if someone pushes a new image with the same tag. Use digest pinning for critical workloads.

### 10.9 Admission Webhook Failures Can Block Everything

A ValidatingWebhook with `failurePolicy: Fail` that becomes unavailable (pod crash, network issue) blocks ALL matched operations. Critical cluster operations can stall. Set appropriate timeouts and consider `failurePolicy: Ignore` for non-critical policies, or use `namespaceSelector` to exclude `kube-system`.

### 10.10 ServiceAccount Token Files Are World-Readable

By default, the projected ServiceAccount token is mounted with mode 0644. Any container in the pod can read it. Use `defaultMode: 0400` and ensure only necessary containers have access.

---

## 11. Interview Questions

### Q1: "Design a multi-tenant Kubernetes cluster with proper security isolation."

**Deep answer:** Multi-tenancy requires isolation at multiple layers: (1) Namespace isolation: each tenant gets one or more namespaces. Use namespace-scoped RBAC — tenants can only access their namespaces. (2) Network isolation: default-deny NetworkPolicies in every tenant namespace. Tenants can only communicate within their namespace unless explicitly allowed. Use Cilium or Calico for enforcement. (3) Resource isolation: ResourceQuota per namespace (CPU, memory, pods, PVCs). LimitRange for default pod limits. Priority classes to prevent tenants from preempting each other. (4) Pod security: enforce the Restricted PSA level in all tenant namespaces. No privileged containers, no host namespace access. (5) Secret isolation: RBAC restricts secret access to the namespace. External Secrets Operator with separate secret stores per tenant. (6) Admission policies: Kyverno/Gatekeeper enforces tenant policies (must have labels, image from approved registry, resource limits required). (7) Audit: full audit logging with per-tenant log segregation. (8) Runtime: consider gVisor or Kata Containers for stronger container isolation. (9) Control plane: dedicated API server for critical tenants or separate virtual clusters (vCluster) for strong isolation. (10) RBAC: tenant admins get `admin` ClusterRole in their namespace via RoleBinding. Platform team has `cluster-admin`.

### Q2: "Explain the Kubernetes authentication and authorization chain."

**Deep answer:** Every API request flows through a strict pipeline. First, authentication: the API server tries each configured authenticator in order — X.509 client certificates (checking CN/O fields), bearer tokens (ServiceAccount tokens or bootstrap tokens), OIDC tokens (validating JWT signature, issuer, audience, and extracting username/groups from claims), or webhook token review (calling an external service). At least one authenticator must succeed; if all fail, the request returns 401. Second, authorization: the API server consults authorization modules in order — typically RBAC and Node. RBAC checks if any Role/ClusterRole binding grants the authenticated identity the requested verb on the requested resource. Node authorization handles kubelet-specific requests. If no authorizer approves, the request returns 403. Third, admission: the request passes through mutating admission controllers (which can modify the object), then validating admission controllers (which can reject it). Only after all three stages does the object get persisted to etcd.

### Q3: "How would you implement least-privilege RBAC for a development team?"

**Deep answer:** Start by understanding what the team actually needs. Developers typically need: read access to pods, logs, events (debugging); create/update/delete for deployments, services, configmaps, and their own application resources; NO access to secrets (use external secret manager), RBAC roles, or cluster-level resources. Implementation: (1) Create a ClusterRole `developer` with specific resource/verb combinations. (2) Bind it with a RoleBinding in the team's namespace only — never ClusterRoleBinding. (3) Use OIDC groups from the identity provider to manage membership. (4) Create a separate `developer-readonly` ClusterRole for production namespaces — same team, more restricted access. (5) Disable automountServiceAccountToken on all ServiceAccounts. (6) Create application-specific ServiceAccounts with the minimum permissions each application needs. (7) Use `kubectl auth can-i --list` to audit effective permissions. (8) Review RBAC bindings quarterly with `kubectl get rolebindings,clusterrolebindings -A`.

### Q4: "What is Pod Security Admission and how does it compare to PodSecurityPolicy?"

**Deep answer:** PodSecurityPolicy (PSP) was a cluster-level admission controller that enforced security standards on pods. It was removed in Kubernetes 1.25 because of fundamental design flaws: PSPs were hard to reason about (which policy applies to which pod was confusing), the binding model was tied to RBAC in unintuitive ways, and there was no dry-run or audit mode. Pod Security Admission (PSA) replaced it with a simpler model: three predefined security levels (Privileged, Baseline, Restricted) applied at the namespace level via labels. The levels are not customizable — they are fixed profiles that cover the most common security requirements. This simplicity is intentional: instead of complex per-pod policies, you standardize on a level per namespace. PSA supports three modes (enforce, warn, audit) that can be mixed — e.g., enforce Baseline but warn/audit Restricted, allowing teams to gradually adopt stricter standards. For custom policies beyond the three levels, use Kyverno or OPA Gatekeeper alongside PSA.

### Q5: "How do you secure the Kubernetes supply chain?"

**Deep answer:** Supply chain security protects against compromised or vulnerable software entering the cluster. (1) Base images: use minimal, trusted base images (distroless, scratch, alpine). Pin specific versions, never use :latest. (2) Build process: build in a clean CI environment, use multi-stage Dockerfiles, never install unnecessary tools. (3) Vulnerability scanning: integrate Trivy or Grype in CI — fail the pipeline on CRITICAL vulnerabilities. Scan on push to registry. Continuous scanning of running images for newly discovered CVEs. (4) Image signing: sign all images with cosign (sigstore) in CI. In the cluster, validate signatures with a Kyverno policy or sigstore policy controller before admission. (5) Registry security: private registry (ECR, Harbor) with IAM-based access. Enable immutable tags if supported. (6) Admission policies: restrict image sources to approved registries, require image digests (not tags), verify signatures. (7) SBOM: generate SBOMs during build, attach to images, store for audit. (8) Runtime monitoring: Falco detects anomalous container behavior (unexpected processes, network connections, file access).

### Q6: "Walk through how you would investigate a suspected security breach in a Kubernetes cluster."

**Deep answer:** (1) Contain: cordon the suspected node (`kubectl cordon`). Apply a deny-all NetworkPolicy to the suspected namespace. Do NOT delete pods — they contain evidence. (2) Collect evidence: audit logs — who accessed what and when. Container logs — application and sidecar logs. Process listings from suspected pods (`kubectl exec -- ps aux`). Network connections (`kubectl exec -- netstat -anp`). Filesystem changes (`kubectl exec -- find / -newer /etc/hostname`). (3) Analyze: check RBAC — was there privilege escalation? Were any ClusterRoleBindings created recently? Check admission logs — were any policies bypassed? Check for pods with privileged containers, host mounts, or host networking. Check for unauthorized ServiceAccount token usage. (4) Remediate: rotate all credentials (ServiceAccount tokens, secrets, certificates). Revoke compromised RBAC bindings. Patch any exploited vulnerability. (5) Harden: enable audit logging if not already active. Enforce Restricted PSA. Deploy runtime monitoring (Falco). Review and tighten RBAC. Enable admission policies that prevent the attack vector.

---

## 12. Quick Reference

| Security Layer | Mechanism | Tools |
|---------------|-----------|-------|
| Authentication | X.509, OIDC, ServiceAccount tokens | Dex, Keycloak, cloud IAM |
| Authorization | RBAC (Role, ClusterRole, Bindings) | kubectl auth can-i |
| Admission | PSA, Webhooks | OPA Gatekeeper, Kyverno |
| Pod Security | SecurityContext, seccomp, capabilities | Pod Security Admission |
| Network | NetworkPolicies | Calico, Cilium |
| Secrets | Encryption at rest, external vaults | ESO, Sealed Secrets, Vault |
| Supply Chain | Image scanning, signing | Trivy, cosign, sigstore |
| Runtime | Syscall monitoring, anomaly detection | Falco, KubeArmor |
| Audit | Audit logging | ELK, Splunk, cloud logging |

| PSA Level | Root Allowed | Privileged | Host Network | Capabilities |
|-----------|-------------|-----------|-------------|-------------|
| **Privileged** | Yes | Yes | Yes | Any |
| **Baseline** | Yes | No | No | Subset (NET_BIND_SERVICE, etc.) |
| **Restricted** | No | No | No | Drop ALL, add only NET_BIND_SERVICE |
