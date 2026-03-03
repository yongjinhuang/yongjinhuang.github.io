# Kubernetes Configuration — Deep-Dive

Configuration management in Kubernetes spans from simple key-value pairs (ConfigMaps) to secure secret management (external vaults), to full application packaging (Helm charts). Getting this right is what separates a demo cluster from a production-grade platform.

---

## Mental Model

```
             Configuration Sources
             ┌────────────────────────────────┐
             │                                │
             │  ConfigMap     Secret           │
             │  (plain text)  (base64,         │
             │                NOT encrypted)   │
             │                                │
             │  External Secrets Operator      │
             │  (AWS Secrets Manager, Vault)   │
             │                                │
             │  Downward API                   │
             │  (pod metadata → env/files)     │
             └────────┬───────────────────────┘
                      │
              ┌───────┴───────┐
              │               │
              v               v
         Env Vars        Volume Mounts
      (injected at        (files in
       pod start,          pod filesystem,
       NOT updated)        auto-updated)
```

**Key insight:** Environment variables sourced from ConfigMaps/Secrets are set at pod creation and never updated. Volume-mounted ConfigMaps/Secrets are eventually updated by the kubelet (sync period ~1 minute). This distinction drives many architectural decisions.

---

## 1. ConfigMaps

### 1.1 Creating ConfigMaps

```bash
# From literal values
kubectl create configmap app-config \
  --from-literal=DATABASE_HOST=postgres \
  --from-literal=LOG_LEVEL=info

# From a file
kubectl create configmap nginx-config \
  --from-file=nginx.conf=/path/to/nginx.conf

# From an entire directory (each file becomes a key)
kubectl create configmap configs \
  --from-file=/path/to/config-dir/

# From an env file (KEY=VALUE format)
kubectl create configmap env-config \
  --from-env-file=.env
```

```yaml
# Declarative ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  DATABASE_HOST: "postgres.production.svc.cluster.local"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
  config.yaml: |
    server:
      port: 8080
      timeout: 30s
    features:
      caching: true
      rateLimit: 100
binaryData:                    # For binary content (base64 encoded in YAML)
  logo.png: <base64-data>
```

### 1.2 Consuming ConfigMaps

**As environment variables:**

```yaml
spec:
  containers:
  - name: app
    image: my-app:v1
    env:
    # Individual key
    - name: DB_HOST
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: DATABASE_HOST
          optional: false          # Pod fails to start if key missing

    # All keys from a ConfigMap as env vars
    envFrom:
    - configMapRef:
        name: app-config
        optional: false
      prefix: "APP_"              # Optional prefix: APP_DATABASE_HOST, APP_LOG_LEVEL
```

**As volume mount (files):**

```yaml
spec:
  containers:
  - name: app
    image: my-app:v1
    volumeMounts:
    - name: config-volume
      mountPath: /etc/config       # Each key becomes a file
      readOnly: true
  volumes:
  - name: config-volume
    configMap:
      name: app-config
      items:                       # Optional: select specific keys
      - key: config.yaml
        path: config.yaml          # /etc/config/config.yaml
      - key: LOG_LEVEL
        path: log-level            # /etc/config/log-level
      defaultMode: 0644            # File permissions
```

### 1.3 Immutable ConfigMaps

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-v2
immutable: true                    # Cannot be modified after creation
data:
  config.yaml: |
    version: 2
```

**Benefits of immutable ConfigMaps:**
- Protects against accidental changes
- Performance: kubelet does not need to watch for updates
- Scale: reduces API server load (no watches for this ConfigMap)
- Versioning: create new ConfigMaps with version suffix, update Deployment to reference new version

### 1.4 Size Limit

ConfigMaps have a **1 MiB** size limit. For larger configuration, use a PersistentVolume or an init container that downloads config from external storage.

---

## 2. Secrets

### 2.1 Secret Types

| Type | Usage |
|------|-------|
| `Opaque` (default) | Arbitrary key-value data |
| `kubernetes.io/tls` | TLS certificate and private key |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/service-account-token` | ServiceAccount token (legacy, auto-generated) |
| `kubernetes.io/basic-auth` | Username and password |
| `kubernetes.io/ssh-auth` | SSH private key |

### 2.2 Creating Secrets

```bash
# Opaque secret from literals
kubectl create secret generic db-creds \
  --from-literal=username=admin \
  --from-literal=password='s3cr3t!@#'

# TLS secret from certificate files
kubectl create secret tls tls-cert \
  --cert=./server.crt \
  --key=./server.key

# Docker registry secret
kubectl create secret docker-registry regcred \
  --docker-server=https://registry.example.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=user@example.com
```

```yaml
# Declarative Secret (values must be base64 encoded)
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
data:
  username: YWRtaW4=          # echo -n "admin" | base64
  password: czNjcjN0IUAj      # echo -n "s3cr3t!@#" | base64

---
# Using stringData (plaintext, auto-encoded to base64)
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
stringData:
  username: admin
  password: "s3cr3t!@#"
```

### 2.3 Consuming Secrets

Identical to ConfigMaps — as environment variables or volume mounts:

```yaml
spec:
  containers:
  - name: app
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-creds
          key: password
    volumeMounts:
    - name: certs
      mountPath: /etc/tls
      readOnly: true
  volumes:
  - name: certs
    secret:
      secretName: tls-cert
      defaultMode: 0400       # Read-only for owner
  imagePullSecrets:            # For private registries
  - name: regcred
```

---

## 3. Secret Management — The Real Problem

### 3.1 Why K8s Secrets Are Insecure by Default

```
Problem 1: base64 is NOT encryption
  $ echo "czNjcjN0IUAj" | base64 -d
  s3cr3t!@#
  # Anyone who can read the Secret object can decode it

Problem 2: Stored unencrypted in etcd by default
  $ etcdctl get /registry/secrets/default/db-creds
  # Returns the Secret in plaintext (protobuf)

Problem 3: Accessible to anyone with RBAC read access to secrets
  # A pod's service account with get/list secrets permission
  # can read ALL secrets in the namespace

Problem 4: Secrets in YAML files end up in git repos
  # "I'll just commit this Secret manifest..."
  # Now it's in git history forever
```

### 3.2 Encryption at Rest

Configure the API server to encrypt Secrets in etcd:

```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources:
  - secrets
  providers:
  - aescbc:                        # AES-CBC encryption
      keys:
      - name: key1
        secret: <base64-encoded-32-byte-key>
  - identity: {}                   # Fallback: unencrypted (for reading old secrets)
```

```bash
# API server flag
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml

# After enabling, re-encrypt all existing secrets
kubectl get secrets --all-namespaces -o json | kubectl replace -f -
```

**Managed K8s:** EKS, GKE, and AKS encrypt etcd at rest by default using their KMS services.

### 3.3 External Secret Management

```
┌──────────────────────────────────────────────────────────┐
│                    EXTERNAL SECRETS FLOW                   │
│                                                          │
│  1. Secret stored in external vault                       │
│     (AWS Secrets Manager, HashiCorp Vault, etc.)         │
│                                                          │
│  2. ExternalSecret resource references the vault          │
│                                                          │
│  3. External Secrets Operator fetches and creates         │
│     a native K8s Secret                                  │
│                                                          │
│  4. Pod consumes the K8s Secret normally                  │
│                                                          │
│  5. Operator periodically syncs (detects rotation)        │
│                                                          │
│  Vault ──> ExternalSecret CR ──> Operator ──> K8s Secret │
└──────────────────────────────────────────────────────────┘
```

**External Secrets Operator (ESO):**

```yaml
# SecretStore: how to connect to the vault
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa    # IRSA for AWS auth

---
# ExternalSecret: which secret to fetch
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-creds
  namespace: production
spec:
  refreshInterval: 1h               # Sync frequency
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: db-creds                   # K8s Secret name to create
    creationPolicy: Owner
  data:
  - secretKey: username              # Key in K8s Secret
    remoteRef:
      key: production/database       # Path in Secrets Manager
      property: username             # JSON property
  - secretKey: password
    remoteRef:
      key: production/database
      property: password
```

**Sealed Secrets (Bitnami):**

```
Developer                  Cluster
   │                          │
   │ kubeseal encrypt ──────> │ SealedSecret CR
   │ (public key)             │     │
   │                          │     v
   │                          │ Sealed Secrets Controller
   │                          │ (decrypts with private key)
   │                          │     │
   │                          │     v
   │                          │ K8s Secret (in-cluster only)
```

Sealed Secrets can be safely committed to git — they can only be decrypted by the controller's private key in the cluster.

```bash
# Encrypt a secret for git storage
kubeseal --format=yaml < secret.yaml > sealed-secret.yaml
# sealed-secret.yaml is safe to commit
```

**HashiCorp Vault:**
- Vault Agent Injector: sidecar that fetches secrets and writes to a shared volume
- CSI Secrets Store Driver: mounts Vault secrets as a volume
- Direct API: application fetches secrets from Vault API directly

### 3.4 Production Secret Management Checklist

```
[ ] Encryption at rest enabled for etcd
[ ] External secret manager for production secrets
[ ] No secrets in git (use Sealed Secrets or external refs)
[ ] RBAC: restrict secret access to necessary service accounts
[ ] Audit logging enabled for secret access
[ ] Secret rotation automated (not manual)
[ ] Image pull secrets managed centrally
[ ] No secrets in container environment (prefer volume mounts)
[ ] Secret values never logged (check application logging)
```

---

## 4. Environment Variable Patterns

### 4.1 Downward API

Expose pod and container metadata as environment variables:

```yaml
env:
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: POD_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: POD_IP
  valueFrom:
    fieldRef:
      fieldPath: status.podIP
- name: NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
- name: CPU_LIMIT
  valueFrom:
    resourceFieldRef:
      containerName: app
      resource: limits.cpu
- name: MEMORY_REQUEST
  valueFrom:
    resourceFieldRef:
      containerName: app
      resource: requests.memory
```

### 4.2 Dependent Environment Variables

```yaml
env:
- name: DB_HOST
  value: "postgres"
- name: DB_PORT
  value: "5432"
- name: DB_URL
  value: "postgresql://$(DB_HOST):$(DB_PORT)/mydb"    # References other env vars
```

---

## 5. Configuration Hot-Reload

### 5.1 Volume-Mounted ConfigMaps

When a ConfigMap is updated, the kubelet updates the mounted files. The delay depends on:
- kubelet sync period (default: ~60 seconds)
- ConfigMap cache TTL
- Total delay: up to ~2 minutes

**How it works internally:**

```
ConfigMap update in API server
      │
      v
kubelet sync loop detects change
      │
      v
kubelet updates symlink:
  /etc/config/ → ..data (symlink)
  ..data → ..2024_01_15_10_30_00.123456 (atomic swap)
  ..2024_01_15_10_30_00.123456/config.yaml (actual file)
```

The symlink swap is atomic — the application never sees a partially written file.

### 5.2 Application Patterns for Reload

```
Option 1: File watcher in application
  - Application watches /etc/config/ for changes
  - Reloads configuration without restart
  - Best for: application-level config (feature flags, log levels)

Option 2: Sidecar that signals the application
  - Sidecar watches for file changes
  - Sends SIGHUP or HTTP reload endpoint to main container
  - Best for: applications that support reload signals (nginx, envoy)

Option 3: Reloader (stakater/reloader)
  - Controller watches ConfigMaps/Secrets
  - Triggers rolling restart of Deployments/StatefulSets
  - Best for: applications that cannot hot-reload

Option 4: Immutable ConfigMaps + Deployment update
  - Create new ConfigMap with version suffix
  - Update Deployment to reference new ConfigMap
  - Rolling update ensures zero-downtime
  - Best for: critical config changes that need controlled rollout
```

---

## 6. Kustomize

Kustomize is a template-free configuration management tool built into kubectl. It uses overlays to customize base configurations.

### 6.1 Directory Structure

```
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
├── overlays/
│   ├── development/
│   │   ├── kustomization.yaml
│   │   ├── replica-count.yaml
│   │   └── dev-config.env
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── staging-patch.yaml
│   └── production/
│       ├── kustomization.yaml
│       ├── production-patch.yaml
│       └── hpa.yaml
```

### 6.2 Base kustomization.yaml

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- deployment.yaml
- service.yaml

commonLabels:
  app: my-app

configMapGenerator:
- name: app-config
  literals:
  - LOG_LEVEL=info
  - CACHE_TTL=300
```

### 6.3 Production Overlay

```yaml
# overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- ../../base
- hpa.yaml

namespace: production

namePrefix: prod-

commonLabels:
  env: production

replicas:
- name: my-app
  count: 5

images:
- name: my-app
  newTag: v2.1.0

patches:
- path: production-patch.yaml
  target:
    kind: Deployment
    name: my-app

configMapGenerator:
- name: app-config
  behavior: merge
  literals:
  - LOG_LEVEL=warn
  - CACHE_TTL=3600
```

```bash
# Preview the output
kubectl kustomize overlays/production/

# Apply directly
kubectl apply -k overlays/production/

# Diff before applying
kubectl diff -k overlays/production/
```

### 6.4 Kustomize Features

| Feature | Description |
|---------|-------------|
| `resources` | Base manifests to include |
| `patches` | Strategic merge or JSON patches to modify resources |
| `configMapGenerator` | Generate ConfigMaps with content hash suffix |
| `secretGenerator` | Generate Secrets with content hash suffix |
| `namePrefix`/`nameSuffix` | Add prefix/suffix to all resource names |
| `namespace` | Set namespace for all resources |
| `commonLabels` | Add labels to all resources |
| `commonAnnotations` | Add annotations to all resources |
| `images` | Override image names/tags |
| `replicas` | Override replica counts |
| `components` | Reusable sets of patches |

**Content hash suffix:** ConfigMap and Secret generators append a hash of the content to the name (e.g., `app-config-m9d7f8g`). When the content changes, the name changes, which triggers a Deployment rolling update. This ensures pods always use the correct config version.

---

## 7. Helm

Helm is the package manager for Kubernetes. It uses **charts** (packages) that contain templated manifests and default values.

### 7.1 Chart Structure

```
my-chart/
├── Chart.yaml              # Chart metadata (name, version, dependencies)
├── values.yaml             # Default configuration values
├── values.schema.json      # JSON schema for validating values (optional)
├── charts/                 # Dependency charts
├── crds/                   # Custom Resource Definitions (installed first)
├── templates/              # Templated K8s manifests
│   ├── _helpers.tpl        # Named templates (partials)
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── serviceaccount.yaml
│   ├── NOTES.txt           # Post-install usage instructions
│   └── tests/
│       └── test-connection.yaml
└── .helmignore             # Files to exclude from chart
```

### 7.2 Template Syntax

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-chart.fullname" . }}
  labels:
    {{- include "my-chart.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "my-chart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      labels:
        {{- include "my-chart.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        ports:
        - containerPort: {{ .Values.service.targetPort }}
        {{- if .Values.resources }}
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
        {{- end }}
        {{- if .Values.livenessProbe.enabled }}
        livenessProbe:
          httpGet:
            path: {{ .Values.livenessProbe.path }}
            port: {{ .Values.service.targetPort }}
          initialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}
        {{- end }}
```

### 7.3 Values and Overrides

```yaml
# values.yaml (defaults)
replicaCount: 1

image:
  repository: my-app
  tag: ""                    # Default to Chart.appVersion
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    memory: 256Mi

livenessProbe:
  enabled: true
  path: /healthz
  initialDelaySeconds: 10
```

```bash
# Install with default values
helm install my-release my-chart/

# Override values via command line
helm install my-release my-chart/ \
  --set replicaCount=3 \
  --set image.tag=v2.0.0

# Override values via file
helm install my-release my-chart/ -f production-values.yaml

# Multiple value files (later files override earlier)
helm install my-release my-chart/ \
  -f base-values.yaml \
  -f production-values.yaml \
  -f secrets-values.yaml
```

### 7.4 Helm Lifecycle

```bash
# Install a chart
helm install my-release bitnami/postgresql -n database --create-namespace

# List releases
helm list -A

# Upgrade (change values or chart version)
helm upgrade my-release bitnami/postgresql \
  --set auth.postgresPassword=newpass \
  --reuse-values                          # Keep existing values

# Rollback to previous revision
helm rollback my-release 1

# View release history
helm history my-release

# Uninstall
helm uninstall my-release -n database

# Template (dry-run, see generated manifests)
helm template my-release my-chart/ -f values.yaml

# Diff (requires helm-diff plugin)
helm diff upgrade my-release my-chart/ -f values.yaml
```

### 7.5 Helm Hooks

```yaml
# Job that runs before upgrade
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    "helm.sh/hook": pre-upgrade
    "helm.sh/hook-weight": "5"           # Lower runs first
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: my-app:v2
        command: ["./migrate", "--up"]
```

| Hook | When It Runs |
|------|-------------|
| `pre-install` | Before any resources are installed |
| `post-install` | After all resources are installed |
| `pre-upgrade` | Before any resources are upgraded |
| `post-upgrade` | After all resources are upgraded |
| `pre-delete` | Before any resources are deleted |
| `post-delete` | After all resources are deleted |
| `pre-rollback` | Before rollback |
| `post-rollback` | After rollback |

### 7.6 Helm OCI Registries

Since Helm 3.8+, charts can be stored in OCI-compliant registries (same as container images):

```bash
# Push chart to OCI registry
helm push my-chart-1.0.0.tgz oci://registry.example.com/charts

# Install from OCI registry
helm install my-release oci://registry.example.com/charts/my-chart --version 1.0.0
```

---

## 8. Common Gotchas

### 8.1 base64 Is Not Encryption

`echo -n "secret" | base64` is encoding, not encryption. Anyone who can read the Secret object can decode it instantly. Do not treat Kubernetes Secrets as secure without additional measures (encryption at rest, RBAC, external vaults).

### 8.2 Environment Variables Are Not Updated

ConfigMap/Secret changes are NOT reflected in environment variables of running pods. The pod must be restarted. Volume mounts ARE updated (after a delay). This catches teams who expect env vars to auto-update.

### 8.3 ConfigMap/Secret Name Length

ConfigMap and Secret names are used in volume mount paths and must comply with DNS subdomain naming (max 253 characters, lowercase, alphanumeric, hyphens, dots).

### 8.4 Helm Values Override Ordering

Multiple `-f` files apply in order — later files win. But `--set` always wins over file values. This can cause confusion when values do not match expectations.

### 8.5 Kustomize ConfigMapGenerator Triggers Rolling Updates

When ConfigMapGenerator content changes, the name hash changes, which changes the Deployment pod template, which triggers a rolling update. This is usually desired but can cause unexpected restarts if you are just "updating a config."

### 8.6 Secret Size Limit

Secrets have a 1 MiB size limit (same as ConfigMaps). Large TLS certificates or multiple certificates may exceed this. Split into multiple Secrets if needed.

### 8.7 Helm Release Secrets Consume etcd Space

Helm stores release metadata as Secrets in the release namespace. Each revision creates a new Secret. With many revisions across many releases, this can significantly increase etcd size. Set `--history-max` to limit retained revisions.

### 8.8 Mounted ConfigMap Replaces Entire Directory

If you mount a ConfigMap to `/etc/config`, all existing files in `/etc/config` are replaced. Use `subPath` to mount individual files without replacing the directory — but then you lose automatic updates.

```yaml
# subPath mount (no auto-update)
volumeMounts:
- name: config
  mountPath: /etc/config/app.conf
  subPath: app.conf                    # Only mounts this specific key as a file

# Full mount (auto-updates, replaces directory)
volumeMounts:
- name: config
  mountPath: /etc/config/              # All keys mounted as files
```

### 8.9 Helm Hooks Can Block Deployment

If a pre-upgrade hook Job fails or hangs, the entire upgrade is blocked. Always set `activeDeadlineSeconds` and `backoffLimit` on hook Jobs, and use `hook-delete-policy: hook-failed` to clean up failures.

### 8.10 Sealed Secrets Are Namespace-Scoped

A Sealed Secret encrypted for namespace `production` cannot be used in namespace `staging`. Each namespace requires its own sealed version. This is a security feature, not a bug.

---

## 9. Interview Questions

### Q1: "How do you manage secrets in Kubernetes securely in production?"

**Deep answer:** Layer your defenses: (1) Enable encryption at rest for etcd — this prevents reading secrets directly from etcd disk/backups. In managed K8s (EKS, GKE), this is default. In self-managed clusters, configure EncryptionConfiguration with AES-CBC or KMS envelope encryption. (2) Use an external secret manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) as the source of truth. Deploy the External Secrets Operator to sync secrets into K8s automatically. Secrets in the vault can be rotated without touching K8s manifests. (3) Never commit secrets to git. Use Sealed Secrets if you must have secret manifests in git — they are encrypted with the cluster's public key and can only be decrypted inside the cluster. (4) Apply strict RBAC: most service accounts should NOT have read access to secrets in other namespaces. Use separate namespaces for different trust boundaries. (5) Enable audit logging for secret access — know who read which secret and when. (6) Prefer volume mounts over environment variables for secrets — env vars appear in process listings and may be logged by frameworks. (7) Use short-lived credentials where possible: IRSA for AWS, Workload Identity for GKE, bound service account tokens.

### Q2: "Explain the difference between ConfigMaps and Secrets. When do you use each?"

**Deep answer:** Functionally, ConfigMaps and Secrets are nearly identical — both store key-value data consumed by pods as env vars or volume mounts. The differences are: (1) Secrets are base64-encoded (not encrypted) and have type annotations (tls, dockerconfigjson, etc.). (2) Secrets can be encrypted at rest in etcd; ConfigMaps cannot. (3) RBAC can be set differently — you might allow developers to read ConfigMaps but restrict Secret access. (4) kubectl outputs Secrets as `<REDACTED>` in some contexts. Use ConfigMaps for non-sensitive configuration: feature flags, service endpoints, log levels, application settings. Use Secrets for sensitive data: passwords, API keys, TLS certificates, database credentials. The key insight is that Kubernetes Secrets are not inherently secure — they are just ConfigMaps with slightly different handling. Real security comes from encryption at rest, external secret managers, RBAC, and audit logging.

### Q3: "Compare Kustomize and Helm. When would you choose each?"

**Deep answer:** Kustomize is template-free — you write standard YAML and layer patches on top. It is built into kubectl (no extra tooling), easy to understand, and great for teams that want to keep manifests readable. Best for: internal applications where you own the manifests, environment-specific overrides (dev/staging/prod), teams that prefer simplicity. Helm is template-based — you write Go templates that generate YAML from values. It has a rich ecosystem of community charts, supports hooks (pre-install jobs, post-upgrade), and handles complex dependency management. Best for: distributing reusable packages (databases, monitoring stacks), applications with complex installation logic (hooks, CRDs, conditional resources), third-party software (install Prometheus, cert-manager, ArgoCD via Helm charts). In practice, most production teams use BOTH: Helm for third-party charts and Kustomize for internal application overlays. You can even use Kustomize to patch Helm-generated manifests via `helm template | kustomize`.

### Q4: "How do you handle configuration changes that require application restarts?"

**Deep answer:** Several approaches depending on the application's capabilities: (1) If the app supports hot-reload: mount ConfigMap as a volume. The kubelet updates the files within ~1-2 minutes. The app watches the filesystem and reloads. No restart needed. (2) If the app does NOT support hot-reload but you want automated restarts: use Stakater Reloader, which watches ConfigMaps/Secrets and triggers a rolling restart of associated Deployments. Or use the Kustomize configMapGenerator approach — content hash changes trigger Deployment updates automatically. (3) For controlled rollouts: use immutable ConfigMaps with version suffixes. Create a new ConfigMap, update the Deployment spec to reference it, and the rolling update mechanism handles the rest. This gives you rollback capability (previous ConfigMap still exists). (4) For Helm: add an annotation with the ConfigMap checksum in the pod template — when the ConfigMap changes, the annotation changes, triggering a rolling update.

### Q5: "Design a configuration management strategy for 50 microservices across dev, staging, and production environments."

**Deep answer:** (1) Structure: Use Kustomize with a base per service and overlays per environment. Store all manifests in a central GitOps repository. (2) Configuration hierarchy: Global config (shared across all services) as a ConfigMap per environment. Service-specific config as per-service ConfigMaps. Secrets via External Secrets Operator pointing to AWS Secrets Manager organized by environment/service. (3) Environment promotion: Kustomize overlays customize replica count, resource limits, image tags, and environment-specific endpoints per environment. Use GitOps (ArgoCD) to sync each environment from its overlay directory. (4) Secret rotation: External Secrets Operator refreshes every 1 hour. Applications support connection pool refresh on config change. (5) Change control: Dev — auto-deploy on merge. Staging — auto-deploy, run integration tests. Production — manual approval gate in ArgoCD, canary rollout via Argo Rollouts. (6) Standardization: Create a Helm library chart with common templates that all services include, ensuring consistent labels, annotations, probes, and resource defaults.

---

## 10. Quick Reference

| Feature | ConfigMap | Secret |
|---------|-----------|--------|
| Data format | Plain text | Base64 encoded |
| Size limit | 1 MiB | 1 MiB |
| Encryption at rest | No | Yes (if configured) |
| Immutable option | Yes (1.21+) | Yes (1.21+) |
| Auto-update (volume) | Yes (~1-2 min delay) | Yes (~1-2 min delay) |
| Auto-update (env var) | No (requires restart) | No (requires restart) |
| RBAC | Standard | Can be restricted separately |

| Tool | Approach | Best For |
|------|----------|----------|
| **Kustomize** | Template-free overlays | Internal apps, env overlays |
| **Helm** | Templated charts | Reusable packages, third-party apps |
| **External Secrets Operator** | Sync from vault | Production secret management |
| **Sealed Secrets** | Encrypted for git | Secrets in GitOps repos |
| **Stakater Reloader** | Auto-restart on change | Apps that cannot hot-reload |
