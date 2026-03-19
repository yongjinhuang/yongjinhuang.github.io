# CI/CD Pipelines — Deploying to Hundreds of Servers Safely

> Operations perspective: how do you ship code to 500 pods across 3 regions without waking up at 3am?

---

## 1. The Deployment Pipeline

Every production deployment follows the same fundamental flow. The goal is to fail fast, catch issues early, and never let untested artifacts touch production.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT PIPELINE OVERVIEW                            │
└─────────────────────────────────────────────────────────────────────────────────┘

Developer Push
     │
     ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SOURCE    │───▶│    BUILD    │───▶│    TEST     │───▶│  ARTIFACT   │
│   COMMIT    │    │  Compile    │    │ Unit / Int  │    │  REGISTRY   │
│  git push   │    │  Lint       │    │ SAST / DAST │    │  Push Image │
│  PR merge   │    │  Dockerfile │    │  Coverage   │    │  Sign/SBOM  │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                  │
     ┌────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   STAGING   │───▶│    CANARY   │───▶│   METRICS   │───▶│ PRODUCTION  │
│  Deploy 1:1 │    │  5% traffic │    │  Analysis   │    │  Full Roll  │
│  Smoke Test │    │  Real users │    │  Auto/Human │    │  All Regions│
│  E2E Tests  │    │  30 minutes │    │  Gate/Block │    │  Completed  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Pipeline Stages in Detail

**Stage 1: Source Commit**

- Triggered by: PR merge to `main`, tag push, scheduled (nightly)
- Key checks: branch protection rules, required reviewers, status checks

**Stage 2: Build**

- Compile source code, resolve dependencies
- Build Docker image (multi-stage for smaller final image)
- Lint, static analysis, dependency audit

**Stage 3: Test**

- Unit tests with coverage gate (fail if < 80%)
- Integration tests against real dependencies (testcontainers)
- SAST: static application security testing (Semgrep, CodeQL)
- Secret scanning (truffleHog, GitGuardian)

**Stage 4: Artifact**

- Push versioned image to registry
- Sign artifact with Cosign
- Generate SBOM (Software Bill of Materials)
- Scan image for CVEs (Trivy, Grype)

**Stage 5: Staging**

- Deploy to staging cluster (identical config to prod)
- Smoke tests: is the service responding?
- E2E tests: critical user flows
- Performance baseline comparison

**Stage 6: Canary**

- Route 5% of real production traffic to new version
- Collect metrics: error rate, latency p99, business metrics
- Automated analysis (Flagger, Argo Rollouts)
- Promote or rollback based on thresholds

**Stage 7: Production**

- Progressive rollout (rolling, blue-green, or full canary)
- Real-time monitoring
- Deployment marked successful when health checks pass

### Example GitHub Actions Pipeline

```yaml
# .github/workflows/deploy.yaml
name: Build, Test, Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Run unit tests
        run: |
          docker build --target test -t test-image .
          docker run --rm test-image npm test -- --coverage
          # Fail pipeline if coverage < 80%

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Sign image with Cosign
        if: github.event_name != 'pull_request'
        run: |
          cosign sign --yes \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

      - name: Generate SBOM
        run: |
          syft ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -o spdx-json > sbom.json
          cosign attach sbom --sbom sbom.json \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

      - name: Scan for vulnerabilities
        run: |
          trivy image --exit-code 1 --severity CRITICAL \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

  deploy-staging:
    needs: build-test
    if: github.ref == 'refs/heads/main'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: |
          kubectl set image deployment/my-service \
            my-service=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace=staging
          kubectl rollout status deployment/my-service --namespace=staging --timeout=5m

      - name: Run smoke tests
        run: |
          ./scripts/smoke-test.sh https://staging.myapp.com

  deploy-production:
    needs: deploy-staging
    environment: production
    runs-on: ubuntu-latest
    steps:
      - name: Deploy canary
        run: |
          # Update canary deployment only (5% traffic)
          kubectl set image deployment/my-service-canary \
            my-service=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace=production
          # Wait for canary analysis (Flagger/Argo Rollouts handles this)
          kubectl wait canary/my-service --for=condition=Promoted --timeout=30m
```

---

## 2. Artifact Management

Immutable artifacts are the foundation of safe deployments. The artifact that passed tests in staging is the exact artifact that goes to production — never rebuilt.

### Artifact Versioning Strategy

```
┌──────────────────────────────────────────────────────────────────────┐
│                     ARTIFACT VERSIONING                              │
├──────────────────────┬───────────────────────────────────────────────┤
│  Tag Type            │  Example / When Used                          │
├──────────────────────┼───────────────────────────────────────────────┤
│  Git SHA             │  ghcr.io/org/app:a3f9c12  (immutable, always) │
│  Semantic version    │  ghcr.io/org/app:v2.3.1   (release tags)      │
│  Branch name         │  ghcr.io/org/app:main     (mutable, for dev)  │
│  Environment         │  ghcr.io/org/app:staging  (promoted artifact) │
│  latest              │  ghcr.io/org/app:latest   (never in prod)     │
└──────────────────────┴───────────────────────────────────────────────┘
```

**Rule**: Production deployments MUST reference an immutable tag (SHA or semver). Never deploy `latest` to production.

### Promotion Between Environments

Promotion means tagging an already-built image with a new environment label. No rebuild happens.

```bash
# Promote staging image to production tag
STAGING_SHA=$(kubectl get deployment my-service -n staging \
  -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)

# Re-tag the same image (no rebuild)
docker pull ghcr.io/org/app:${STAGING_SHA}
docker tag ghcr.io/org/app:${STAGING_SHA} ghcr.io/org/app:production
docker push ghcr.io/org/app:production

# Or with Skopeo (no local docker daemon needed)
skopeo copy \
  docker://ghcr.io/org/app:${STAGING_SHA} \
  docker://ghcr.io/org/app:production
```

### AMI Pipeline (for VM-based infrastructure)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Packer     │───▶│  Base AMI    │───▶│  App AMI     │───▶│  Validated   │
│  Template    │    │  OS patches  │    │  App baked   │    │  AMI ready   │
│  HCL config  │    │  Hardening   │    │  Config mgmt │    │  for Launch  │
│              │    │  CIS bench   │    │  systemd svc │    │  Template    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

```hcl
# packer/app.pkr.hcl
source "amazon-ebs" "app" {
  ami_name      = "my-app-${var.version}-${formatdate("YYYY-MM-DD", timestamp())}"
  instance_type = "t3.medium"
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-hvm-*-x86_64-gp2"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["amazon"]
  }
  ssh_username = "ec2-user"
}

build {
  sources = ["source.amazon-ebs.app"]
  provisioner "shell" {
    script = "scripts/install-app.sh"
    environment_vars = ["APP_VERSION=${var.version}"]
  }
  provisioner "shell" {
    script = "scripts/harden.sh"  # CIS hardening
  }
  post-processor "manifest" {
    output = "manifest.json"  # Record AMI ID for downstream use
  }
}
```

---

## 3. Deployment Strategies Deep Dive

### 3.1 Rolling Update

The default Kubernetes strategy. Replace old pods gradually, maintaining minimum availability.

```
TIME ──────────────────────────────────────────────────────────────────▶

t=0   [v1][v1][v1][v1][v1][v1][v1][v1][v1][v1]  10 pods, all v1

t=1   [v2][v2][  ][v1][v1][v1][v1][v1][v1][v1]  maxSurge=2 added, 2 terminated
         ▲                    ▲
         new pods             old pods being drained

t=2   [v2][v2][v2][v2][  ][  ][v1][v1][v1][v1]

t=3   [v2][v2][v2][v2][v2][v2][  ][  ][v1][v1]

t=4   [v2][v2][v2][v2][v2][v2][v2][v2][  ][  ]

t=5   [v2][v2][v2][v2][v2][v2][v2][v2][v2][v2]  complete
```

**Key parameters:**

```yaml
# kubernetes/deployment.yaml
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 2 # At most 2 pods down at any time
      maxSurge: 2 # At most 2 extra pods above desired
  template:
    spec:
      containers:
        - name: app
          readinessProbe: # CRITICAL: pod must be ready before old pod is killed
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ['/bin/sleep', '5'] # Drain connections before SIGTERM
      terminationGracePeriodSeconds: 60
```

**Readiness gates** prevent traffic being sent to pods that haven't warmed up:

```yaml
spec:
  readinessGates:
    - conditionType: 'feature-gates.example.com/ready'
# External controller (e.g., Argo Rollouts) sets this condition
# Pod receives traffic only when both readiness probe AND gate pass
```

**When rolling update fails**: Kubernetes stops the rollout and leaves a mixed state. Always check:

```bash
kubectl rollout status deployment/my-service -n production
kubectl rollout history deployment/my-service -n production
kubectl rollout undo deployment/my-service -n production  # rollback
```

---

### 3.2 Blue-Green Deployment

Two identical environments. Switch all traffic at once. Instant rollback by switching back.

```
                        ┌─────────────────────────────┐
                        │      LOAD BALANCER           │
                        │    (or Ingress/Service)      │
                        └──────────────┬───────────────┘
                                       │
                        Traffic Switch │ (100% atomic)
                       ┌───────────────┴──────────────┐
                       │                              │
              ─ ─ ─ ─ ─▼─ ─ ─ ─ ─                  ─▼─────────────
             │  BLUE (current v1)  │                │GREEN (new v2)│
             │  10 pods running    │                │10 pods ready │
             │  serving 100%       │                │idle/warm     │
              ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                  ──────────────
             ▲
             Rollback: switch back in seconds
```

**Traffic switching in Kubernetes (Service selector swap):**

```bash
# Blue currently active (selector: version=blue)
kubectl patch service my-service \
  -p '{"spec":{"selector":{"version":"green"}}}' \
  -n production

# To rollback, flip back to blue
kubectl patch service my-service \
  -p '{"spec":{"selector":{"version":"blue"}}}' \
  -n production
```

**AWS with Application Load Balancer:**

```bash
# Get listener ARN
LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --query 'Listeners[0].ListenerArn' --output text)

# Switch to green target group (100% traffic)
aws elbv2 modify-listener \
  --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$GREEN_TG_ARN
```

**Database migration challenge with Blue-Green:**

```
PROBLEM: Schema changes must be compatible with BOTH blue and green simultaneously
         during the transition window.

WRONG APPROACH:
  v1 code → reads column "user_name"
  Rename column "user_name" → "username"
  v2 code → reads column "username"
  ❌ During switch, if rollback needed, v1 breaks (column renamed)

CORRECT APPROACH (Expand-Contract):
  Phase 1 (expand):  Add new column "username", keep "user_name"
  Phase 2 (migrate): Deploy v2 that writes to BOTH columns
  Phase 3 (switch):  Blue-green switch to v2
  Phase 4 (contract): Drop old column "user_name" (separate deploy)
```

---

### 3.3 Canary Deployment

Route a small percentage of real traffic to the new version. Collect metrics. Decide to promote or rollback.

```
                    ┌────────────────────────────────┐
                    │         INGRESS / LB            │
                    └──────────┬────────────┬─────────┘
                               │            │
                          95%  │       5%   │
                               │            │
                    ┌──────────▼──┐   ┌─────▼──────┐
                    │  STABLE v1  │   │  CANARY v2 │
                    │  475 pods   │   │   25 pods  │
                    │             │   │            │
                    └─────────────┘   └────────────┘
                                            │
                                     Metrics Collection
                                     - Error rate < 1%?
                                     - p99 latency < 200ms?
                                     - Conversion rate stable?
                                            │
                                   ┌────────┴─────────┐
                                   │                  │
                                PASS               FAIL
                                   │                  │
                              ┌────▼────┐        ┌────▼────┐
                              │ PROMOTE │        │ROLLBACK │
                              │ 100% v2 │        │ 0% v2   │
                              └─────────┘        └─────────┘
```

**Nginx Ingress canary annotations:**

```yaml
# canary-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-service-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: 'true'
    nginx.ingress.kubernetes.io/canary-weight: '5' # 5% traffic
    # Or by header for internal testing:
    nginx.ingress.kubernetes.io/canary-by-header: 'X-Canary'
    nginx.ingress.kubernetes.io/canary-by-header-value: 'always'
spec:
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service-canary
                port:
                  number: 80
```

---

### 3.4 Feature Flags

Decouple deployment from release. Code ships dark; features turn on independently.

```
┌───────────────────────────────────────────────────────────────────┐
│                 DEPLOYMENT vs RELEASE                             │
├───────────────────────────────────────────────────────────────────┤
│  Deployment: Code is on the server (all users)                    │
│  Release:    Feature is visible/active (controlled users)         │
│                                                                   │
│  Monday:   Deploy v2.5 with new checkout flow (dark)              │
│  Tuesday:  Enable for 1% of users (canary release)                │
│  Thursday: Enable for 10% (beta testers)                          │
│  Next week: Enable for 100% (full release)                        │
│  Anytime:  Kill switch → disable for 100% in seconds             │
└───────────────────────────────────────────────────────────────────┘
```

**LaunchDarkly pattern:**

```typescript
// Feature flag evaluation at runtime
const ldClient = LaunchDarkly.init(process.env.LD_SDK_KEY);

const user = { key: userId, email, country };
const showNewCheckout = await ldClient.variation(
  'new-checkout-flow',
  user,
  false // default if flag service is down
);

if (showNewCheckout) {
  return renderNewCheckout(cart);
} else {
  return renderLegacyCheckout(cart);
}
```

**Flagsmith (self-hosted) via REST:**

```bash
# Toggle feature on for specific segment
curl -X POST https://api.flagsmith.com/api/v1/features/ \
  -H "Authorization: Token $FLAGSMITH_TOKEN" \
  -d '{"name": "new_checkout", "enabled": true, "feature_segment": {"segment": "beta_users"}}'
```

---

## 4. Progressive Delivery with Argo Rollouts

Argo Rollouts extends Kubernetes with sophisticated deployment strategies.

```yaml
# argo-rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: my-service
spec:
  replicas: 100
  strategy:
    canary:
      canaryService: my-service-canary
      stableService: my-service-stable
      trafficRouting:
        nginx:
          stableIngress: my-service-stable
      steps:
        - setWeight: 5 # Step 1: 5% traffic
        - pause: { duration: 10m }
        - analysis: # Step 2: automated metric check
            templates:
              - templateName: success-rate
        - setWeight: 25 # Step 3: 25% traffic
        - pause: { duration: 5m }
        - setWeight: 50
        - pause: { duration: 5m }
        - setWeight: 100 # Full rollout
      analysis:
        successfulRunHistoryLimit: 3
        unsuccessfulRunHistoryLimit: 3

---
# Analysis template — automated decision gate
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 1m
      # Fail if success rate < 99%
      successCondition: result[0] >= 0.99
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{status!~"5..",deployment="{{args.service-name}}"}[5m]))
            /
            sum(rate(http_requests_total{deployment="{{args.service-name}}"}[5m]))
    - name: latency-p99
      interval: 1m
      successCondition: result[0] <= 0.2 # 200ms
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            histogram_quantile(0.99,
              rate(http_request_duration_seconds_bucket{deployment="{{args.service-name}}"}[5m])
            )
```

**Flagger** (alternative, works with Istio/Linkerd):

```yaml
# flagger-canary.yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: my-service
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-service
  progressDeadlineSeconds: 600
  service:
    port: 80
    targetPort: 8080
  analysis:
    interval: 1m
    threshold: 5 # max failed checks before rollback
    maxWeight: 50 # max canary traffic weight
    stepWeight: 10 # increment per step
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99
        interval: 1m
      - name: request-duration
        thresholdRange:
          max: 500 # ms
        interval: 1m
    webhooks:
      - name: load-test
        url: http://loadtester/
        timeout: 5s
        metadata:
          type: cmd
          cmd: 'hey -z 1m -q 10 -c 2 http://my-service-canary/'
```

**Promotion gates** — manual approval before promoting:

```bash
# Pause rollout at current step, waiting for human approval
kubectl argo rollouts pause my-service -n production

# After review, approve promotion
kubectl argo rollouts promote my-service -n production

# Or abort and rollback
kubectl argo rollouts abort my-service -n production
```

---

## 5. Database Migrations in CI/CD

Schema changes are the #1 source of deployment incidents. The **expand-contract pattern** is the safest approach.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXPAND-CONTRACT PATTERN                            │
└─────────────────────────────────────────────────────────────────────────┘

GOAL: Rename column "user_name" → "username"

Phase 1: EXPAND (backward-compatible schema change)
  - Add new column "username" (nullable, no default)
  - Keep old column "user_name"
  - Both columns exist simultaneously
  Deploy: App v1 still reads/writes "user_name"

Phase 2: DUAL-WRITE
  - Deploy app that writes to BOTH "user_name" AND "username"
  - Backfill existing rows: UPDATE t SET username = user_name WHERE username IS NULL
  - Both columns stay in sync

Phase 3: SWITCH READS
  - Deploy app that reads from "username", writes to both
  - Verify data consistency

Phase 4: SINGLE-WRITE
  - Deploy app that reads/writes only "username"
  - Stop writing to "user_name"

Phase 5: CONTRACT (cleanup)
  - Drop old column "user_name"
  - Run in separate deploy, weeks later
  - Deploy: App no longer references old column
```

### Flyway Migration Example

```sql
-- V20240315_01__add_username_column.sql
-- Phase 1: Expand
ALTER TABLE users ADD COLUMN username VARCHAR(255);
CREATE INDEX idx_users_username ON users(username);

-- V20240315_02__backfill_username.sql
-- Phase 2: Backfill (run in batches for large tables)
UPDATE users
SET username = user_name
WHERE username IS NULL
  AND id BETWEEN 1 AND 100000;
-- Repeat for all ID ranges

-- V20240322_01__drop_user_name.sql
-- Phase 5: Contract (separate PR, weeks later)
ALTER TABLE users DROP COLUMN user_name;
```

**Flyway in pipeline:**

```yaml
# docker-compose for migration job
services:
  migrate:
    image: flyway/flyway:10
    command: migrate
    environment:
      FLYWAY_URL: jdbc:postgresql://${DB_HOST}:5432/${DB_NAME}
      FLYWAY_USER: ${DB_USER}
      FLYWAY_PASSWORD: ${DB_PASSWORD}
      FLYWAY_LOCATIONS: filesystem:/migrations
    volumes:
      - ./migrations:/migrations
```

```bash
# Kubernetes migration Job (runs before deployment)
kubectl apply -f migration-job.yaml
kubectl wait job/db-migrate --for=condition=complete --timeout=10m
# If migration fails, abort deployment
```

### Zero-downtime migration rules

```
┌──────────────────────────────────────────────────────────────────────┐
│  SAFE operations (can run while app is live)                         │
├──────────────────────────────────────────────────────────────────────┤
│  + Add new table                                                      │
│  + Add nullable column (no default)                                  │
│  + Add index CONCURRENTLY (Postgres)                                 │
│  + Add foreign key NOT VALID (validate separately)                   │
│  + Create new enum value (Postgres 9.1+)                             │
└──────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│  DANGEROUS operations (require expand-contract or maintenance window) │
├──────────────────────────────────────────────────────────────────────┤
│  - Rename column or table                                             │
│  - Drop column or table                                               │
│  - Change column type                                                 │
│  - Add NOT NULL without default                                       │
│  - Add column with DEFAULT (rewrites table in older Postgres)         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rollback Strategies

### Automated Rollback Triggers

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ROLLBACK DECISION TREE                               │
└────────────────────────────────────────────────────────────────────────┘

Deployment in progress
        │
        ▼
  Error rate spike?  ──YES──▶  > threshold (e.g., 5x baseline)?
        │                              │           │
        NO                            NO          YES
        │                              │           │
        ▼                              ▼           ▼
  p99 latency spike? ──YES──▶  Wait 2m more?  AUTO-ROLLBACK
        │                              │
        NO                             NO → alert on-call
        │
        ▼
  Pod crash loops?  ──YES──▶  > X restarts? ──YES──▶  AUTO-ROLLBACK
        │
        NO
        │
        ▼
  Deployment healthy ✓
```

**Kubernetes automated rollback via deployment policy:**

```yaml
spec:
  progressDeadlineSeconds: 600 # Auto-rollback if not progressed in 10min
  minReadySeconds: 30 # Pod must be ready 30s before counting as available
```

```bash
# Manual rollback
kubectl rollout undo deployment/my-service -n production

# Rollback to specific revision
kubectl rollout history deployment/my-service -n production
kubectl rollout undo deployment/my-service --to-revision=3 -n production

# Verify rollback completed
kubectl rollout status deployment/my-service -n production
```

### Rollback vs Roll Forward

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ROLLBACK vs ROLL FORWARD                           │
├──────────────────────┬──────────────────────────────────────────────┤
│  Rollback            │  Roll Forward                                │
├──────────────────────┼──────────────────────────────────────────────┤
│  Revert to previous  │  Fix forward with hotfix deploy              │
│  artifact version    │  in new commit                               │
├──────────────────────┼──────────────────────────────────────────────┤
│  Use when:           │  Use when:                                   │
│  - Critical bug      │  - Schema already migrated forward           │
│  - Unknown cause     │  - Quick config fix needed                   │
│  - Data corruption   │  - Rollback would lose data                  │
│    risk              │  - Root cause known and fixable fast         │
├──────────────────────┼──────────────────────────────────────────────┤
│  Risk: DB schema     │  Risk: Takes time; bug still active          │
│  incompatibility if  │  during fix pipeline                         │
│  migration happened  │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Database Rollback Challenges

```
ADDITIVE migrations are safe to rollback (DROP the new column):
  V1: Add column "feature_flag_enabled"
  Rollback: DROP COLUMN feature_flag_enabled  ← safe, no data loss

DESTRUCTIVE migrations CANNOT be safely rolled back:
  V1: DROP TABLE legacy_orders
  Rollback: Table is gone. Data is gone. ← cannot undo

PREVENTION:
  1. Never DROP in same deploy as application change
  2. Soft deletes first: set deleted_at = NOW()
  3. Keep deleted tables for 30+ days as backup
  4. Flyway undo scripts (requires Flyway Teams)
```

---

## 7. Multi-Region Deployments

Deploying to 500 pods across 3 regions introduces ordering, blast radius, and data consistency concerns.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-REGION DEPLOYMENT ORDER                        │
└─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────┐
                           │  CI/CD      │
                           │  System     │
                           └──────┬──────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │                            │
              Phase 1                      Wait for
              Deploy to                    health check
              us-east-2                    + metrics
              (10% traffic                 validation
              globally)                    (10 min)
                    │                            │
                    └─────────────┬──────────────┘
                                  │  PASS
                    ┌─────────────▼──────────────┐
                    │  Phase 2: us-west-2         │
                    │  (35% traffic globally)     │
                    └─────────────┬──────────────┘
                                  │  PASS (5 min)
                    ┌─────────────▼──────────────┐
                    │  Phase 3: eu-west-1         │
                    │  (55% traffic globally)     │
                    └─────────────┬──────────────┘
                                  │  PASS (5 min)
                    ┌─────────────▼──────────────┐
                    │  COMPLETE                   │
                    │  All regions on new version │
                    └─────────────────────────────┘
```

### Regional Traffic Shifting (AWS Route53)

```bash
# Weighted routing: 10% to canary region during testing
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.myapp.com",
        "Type": "A",
        "SetIdentifier": "us-east-2-canary",
        "Weight": 10,
        "AliasTarget": {
          "HostedZoneId": "$ALB_ZONE",
          "DNSName": "$US_EAST_2_ALB",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

### Blast Radius Control

```
┌──────────────────────────────────────────────────────────────────────┐
│  BLAST RADIUS CONTROL STRATEGIES                                     │
├──────────────────────────────────────────────────────────────────────┤
│  1. Deploy to lowest-traffic region first (often us-east-2 vs        │
│     us-east-1 for US; ap-southeast-1 for Asia overnight US time)     │
│                                                                      │
│  2. Canary region: dedicated region gets 1% of global traffic        │
│     via geolocation or weighted routing                              │
│                                                                      │
│  3. Cell-based architecture: deploy to one "cell" (isolated          │
│     cluster) before all cells in a region                            │
│                                                                      │
│  4. AZ-aware rolling: roll one AZ at a time within a region         │
│     before moving to next region                                     │
│                                                                      │
│  5. Automated stop: if error rate in region 1 spikes,               │
│     pipeline stops — regions 2 and 3 never get the bad deploy        │
└──────────────────────────────────────────────────────────────────────┘
```

### Multi-Region Pipeline YAML

```yaml
# .github/workflows/multi-region-deploy.yaml
jobs:
  deploy-us-east-2:
    environment: production-us-east-2
    steps:
      - name: Deploy to us-east-2
        run: |
          helm upgrade my-service ./charts/my-service \
            --kube-context $US_EAST_2_CONTEXT \
            --set image.tag=${{ github.sha }} \
            --set replicaCount=50 \
            --wait --timeout=10m

      - name: Validate us-east-2 health
        run: |
          ./scripts/validate-region.sh us-east-2 \
            --error-rate-threshold 0.01 \
            --latency-p99-threshold 200 \
            --duration 10m

  deploy-us-west-2:
    needs: deploy-us-east-2
    environment: production-us-west-2
    steps:
      - name: Deploy to us-west-2
        run: |
          helm upgrade my-service ./charts/my-service \
            --kube-context $US_WEST_2_CONTEXT \
            --set image.tag=${{ github.sha }} \
            --set replicaCount=150 \
            --wait --timeout=10m

  deploy-eu-west-1:
    needs: deploy-us-west-2
    environment: production-eu-west-1
    steps:
      - name: Deploy to eu-west-1
        run: |
          helm upgrade my-service ./charts/my-service \
            --kube-context $EU_WEST_1_CONTEXT \
            --set image.tag=${{ github.sha }} \
            --set replicaCount=300 \
            --wait --timeout=10m
```

---

## 8. Pipeline Security

### Supply Chain Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SOFTWARE SUPPLY CHAIN                                │
│                                                                         │
│  Source ──▶ Build ──▶ Package ──▶ Deploy                               │
│    │           │          │           │                                 │
│  SLSA L1     SLSA L2    SLSA L3    Policy                               │
│  Signed      Hermetic   Verified    OPA/Kyverno                         │
│  commits     builds     provenance  admission                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**SLSA (Supply chain Levels for Software Artifacts):**

| Level  | Requirement       | How                        |
| ------ | ----------------- | -------------------------- |
| SLSA 1 | Provenance exists | Generated by build system  |
| SLSA 2 | Provenance signed | Build service signs it     |
| SLSA 3 | Hermetic build    | Isolated build environment |
| SLSA 4 | Two-party review  | All changes reviewed       |

**Cosign image signing:**

```bash
# Generate key pair (store private key in secrets manager)
cosign generate-key-pair --kms awskms:///arn:aws:kms:us-east-1:123:key/abc

# Sign image after build
cosign sign --key awskms:///arn:aws:kms:us-east-1:123:key/abc \
  ghcr.io/org/app:${{ github.sha }}

# Verify before deploying (in admission webhook or pipeline)
cosign verify \
  --key cosign.pub \
  ghcr.io/org/app:${{ github.sha }}
```

**Kyverno policy — block unsigned images:**

```yaml
# kyverno-policy.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: enforce
  rules:
    - name: check-image-signature
      match:
        any:
          - resources:
              kinds: [Pod]
              namespaces: [production]
      verifyImages:
        - imageReferences:
            - 'ghcr.io/org/*'
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      ...your cosign public key...
                      -----END PUBLIC KEY-----
```

**OPA policy — prevent deploy from untrusted registries:**

```rego
# policy/registry.rego
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  not startswith(image, "ghcr.io/org/")
  msg := sprintf("Image '%v' is from untrusted registry", [image])
}

deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  # Reject :latest tag in production
  endswith(image, ":latest")
  input.request.namespace == "production"
  msg := "Production deployments must use immutable image tags"
}
```

### Vulnerability Scanning in Pipeline

```bash
# Trivy: scan for CVEs, secrets, misconfigs
trivy image \
  --exit-code 1 \
  --severity CRITICAL,HIGH \
  --ignore-unfixed \
  --format sarif \
  --output trivy-results.sarif \
  ghcr.io/org/app:${{ github.sha }}

# Upload results to GitHub Security tab
gh api \
  --method POST \
  /repos/org/app/code-scanning/sarifs \
  --field sarif=@trivy-results.sarif \
  --field ref=${{ github.ref }} \
  --field commit_sha=${{ github.sha }}
```

---

## 9. GitOps

GitOps is the operations model where Git is the single source of truth for deployment state. The cluster continuously reconciles toward what Git says.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GITOPS FLOW                                    │
│                                                                         │
│   Developer                  Git Repo                  Cluster          │
│      │                           │                         │            │
│      │──── git push ────────────▶│                         │            │
│      │                           │◀─── ArgoCD polls ───────│            │
│      │                           │      every 3 min        │            │
│      │                           │                         │            │
│      │                           │──── diff detected ─────▶│            │
│      │                           │                         │            │
│      │                           │         ArgoCD syncs    │            │
│      │                           │         (applies diff)  │            │
│      │                           │                         │            │
│      │                           │◀─── sync complete ──────│            │
│      │                           │                         │            │
│                                                                         │
│  KEY PROPERTY: No one SSHes to the cluster. All changes go via Git.    │
└─────────────────────────────────────────────────────────────────────────┘
```

### ArgoCD Application

```yaml
# argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-service-production
  namespace: argocd
spec:
  project: production
  source:
    repoURL: https://github.com/org/k8s-manifests
    targetRevision: main
    path: apps/my-service/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true # Delete resources removed from Git
      selfHeal: true # Revert manual cluster changes
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true # Delete old resources after new ones are healthy
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Sync Waves — controlling deployment order

```yaml
# Run database migration before application pods
# Wave numbers: lower waves sync first
---
# Wave -1: Run migration job first
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    argocd.argoproj.io/sync-wave: '-1'
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/org/app:v2.3.1
          command: ['./migrate', 'up']
---
# Wave 0: Deploy application after migration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
  annotations:
    argocd.argoproj.io/sync-wave: '0'
```

### Drift Detection

```bash
# Check if cluster state matches Git
argocd app diff my-service-production

# Show all apps out of sync
argocd app list --output wide | grep OutOfSync

# Get current sync status programmatically
argocd app get my-service-production -o json | \
  jq '.status.sync.status'
```

### Flux (alternative GitOps engine)

```yaml
# flux-kustomization.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: my-service
  namespace: flux-system
spec:
  interval: 5m
  path: ./apps/my-service/production
  prune: true
  sourceRef:
    kind: GitRepository
    name: k8s-manifests
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: my-service
      namespace: production
  timeout: 10m
  # Automated image update
  images:
    - name: ghcr.io/org/app
      newTag: ${{ IMAGE_TAG }} # Updated by Flux image automation
```

---

## 10. Pipeline Observability — DORA Metrics

DORA (DevOps Research and Assessment) metrics measure deployment pipeline health.

```
┌───────────────────────────────────────────────────────────────────────┐
│                         DORA METRICS                                  │
├────────────────────────┬──────────────┬──────────────────────────────┤
│  Metric                │  Elite       │  What It Measures            │
├────────────────────────┼──────────────┼──────────────────────────────┤
│  Deployment Frequency  │  Multiple/day│  How often you ship          │
│  Lead Time for Changes │  < 1 hour    │  Commit to production time   │
│  Change Failure Rate   │  < 5%        │  % deploys causing incidents │
│  MTTR (recover time)   │  < 1 hour    │  Time to restore service     │
└────────────────────────┴──────────────┴──────────────────────────────┘
```

**Lead Time breakdown:**

```
┌──────────────────────────────────────────────────────────────────┐
│  LEAD TIME = PR Open → Production Deployed                       │
│                                                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │  Code   │  │  Build  │  │  Stage  │  │  Prod   │           │
│  │  Review │  │  &Test  │  │  Deploy │  │  Deploy │           │
│  │  2-4h   │  │  5-15m  │  │  30-60m │  │  15-30m │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
│                                                                  │
│  Total: ~3-6 hours (good), ~1 day (acceptable), >1 week (poor) │
└──────────────────────────────────────────────────────────────────┘
```

**Tracking deployments in Datadog:**

```bash
# Mark deployment event in Datadog
curl -X POST "https://api.datadoghq.com/api/v1/events" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "title": "Deployment: my-service v2.3.1",
    "text": "Deployed my-service:'"${IMAGE_SHA}"' to production",
    "tags": [
      "service:my-service",
      "version:v2.3.1",
      "env:production",
      "deployer:github-actions"
    ],
    "alert_type": "info",
    "source_type_name": "deployment"
  }'
```

**Prometheus deployment tracking:**

```yaml
# prometheus-deployment-metric.yaml
# Use a Pushgateway to record deployment timestamp
- job_name: push_deployment
  script: |
    cat <<EOF | curl --data-binary @- http://pushgateway:9091/metrics/job/deployments
    # TYPE deployment_timestamp gauge
    deployment_timestamp{service="my-service",version="${IMAGE_TAG}",env="production"} $(date +%s)
    EOF
```

---

## 11. Real-World Pipeline: 500 Pods Across 3 Regions

Putting it all together: deploying a microservice to 500 pods across us-east-2 (50 pods), us-west-2 (150 pods), eu-west-1 (300 pods).

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GLOBAL DEPLOYMENT TOPOLOGY                             │
│                                                                             │
│  ┌─────────────────────────┐                                                │
│  │    GitHub Actions        │  Triggered: push to main                      │
│  │    (Orchestrator)        │  Duration: ~45 min end-to-end                 │
│  └────────────┬─────────────┘                                               │
│               │                                                             │
│    ┌──────────▼───────────────────────────────────────────────┐             │
│    │  Phase 0: Build & Test (~10 min)                         │             │
│    │  - Docker multi-stage build                              │             │
│    │  - Unit tests (must pass)                                │             │
│    │  - Trivy scan (block on CRITICAL CVE)                    │             │
│    │  - Push to GHCR with SHA tag                             │             │
│    │  - Cosign sign                                           │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 1: Database Migration (~5 min)                    │             │
│    │  - Run Flyway migration job in staging                   │             │
│    │  - Run Flyway migration job in production (us-east-2)   │             │
│    │  - Verify schema version matches expected                │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 2: Staging Deploy (~5 min)                        │             │
│    │  - Argo Rollout in staging cluster                       │             │
│    │  - 100% rollout (no canary in staging)                   │             │
│    │  - Smoke tests + E2E critical paths                      │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 3: us-east-2 Canary (~15 min)                    │             │
│    │  - Deploy canary: 5 pods out of 50 (10%)                │             │
│    │  - Route 10% traffic via Nginx ingress weights           │             │
│    │  - Argo Rollouts analysis: error rate, p99 latency       │             │
│    │  - Auto-promote if metrics pass; auto-rollback if fail   │             │
│    │  - On success: rolling update remaining 45 pods          │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 4: us-west-2 Canary (~15 min)                    │             │
│    │  - Same pattern, 15/150 pods as canary                  │             │
│    │  - Health gate from phase 3 must pass first             │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 5: eu-west-1 Full Rollout (~10 min)               │             │
│    │  - 300 pods, rolling update, maxUnavailable=30           │             │
│    │  - GDPR region: additional compliance scan               │             │
│    └──────────────────────────────┬───────────────────────────┘             │
│                                   │                                         │
│    ┌──────────────────────────────▼───────────────────────────┐             │
│    │  Phase 6: Post-deploy (~5 min)                           │             │
│    │  - Tag image as :production in registry                  │             │
│    │  - Post deployment event to Datadog                      │             │
│    │  - Update deployment record in incident management       │             │
│    │  - Notify Slack #deployments channel                     │             │
│    └──────────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Complete Pipeline YAML

```yaml
# .github/workflows/deploy-production.yaml
name: Deploy to Production (500 pods, 3 regions)

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE: ghcr.io/${{ github.repository }}
  IMAGE_TAG: ${{ github.sha }}

jobs:
  # ─── PHASE 0: Build & Security ──────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    outputs:
      image: ${{ env.IMAGE }}:${{ env.IMAGE_TAG }}
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ env.IMAGE }}:${{ env.IMAGE_TAG }}

      - name: Security scan
        run: |
          trivy image --exit-code 1 --severity CRITICAL \
            ${{ env.IMAGE }}:${{ env.IMAGE_TAG }}

      - name: Sign and SBOM
        run: |
          cosign sign --yes ${{ env.IMAGE }}:${{ env.IMAGE_TAG }}
          syft ${{ env.IMAGE }}:${{ env.IMAGE_TAG }} -o spdx-json | \
            cosign attest --yes --type spdx - ${{ env.IMAGE }}:${{ env.IMAGE_TAG }}

  # ─── PHASE 1: Database Migration ────────────────────────────────────────
  db-migrate:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Run migrations (production)
        run: |
          kubectl apply -f k8s/migration-job.yaml \
            --context $PROD_US_EAST_2_CONTEXT
          kubectl wait job/db-migrate \
            --for=condition=complete \
            --timeout=10m \
            --context $PROD_US_EAST_2_CONTEXT

  # ─── PHASE 2: Staging ───────────────────────────────────────────────────
  deploy-staging:
    needs: db-migrate
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: |
          kubectl argo rollouts set image my-service \
            my-service=${{ env.IMAGE }}:${{ env.IMAGE_TAG }} \
            --context $STAGING_CONTEXT -n staging
          kubectl argo rollouts status my-service \
            --context $STAGING_CONTEXT -n staging --timeout=10m

      - name: Smoke + E2E tests
        run: |
          ./scripts/smoke-test.sh https://staging.myapp.com
          npx playwright test --project=smoke --base-url=https://staging.myapp.com

  # ─── PHASE 3: us-east-2 ─────────────────────────────────────────────────
  deploy-us-east-2:
    needs: deploy-staging
    environment: production-us-east-2
    runs-on: ubuntu-latest
    steps:
      - name: Canary deploy us-east-2
        run: |
          kubectl argo rollouts set image my-service \
            my-service=${{ env.IMAGE }}:${{ env.IMAGE_TAG }} \
            --context $PROD_US_EAST_2_CONTEXT -n production
          # Argo Rollouts handles canary steps + analysis from rollout spec
          kubectl argo rollouts status my-service \
            --context $PROD_US_EAST_2_CONTEXT -n production --timeout=30m

  # ─── PHASE 4: us-west-2 ─────────────────────────────────────────────────
  deploy-us-west-2:
    needs: deploy-us-east-2
    environment: production-us-west-2
    runs-on: ubuntu-latest
    steps:
      - name: Deploy us-west-2
        run: |
          kubectl argo rollouts set image my-service \
            my-service=${{ env.IMAGE }}:${{ env.IMAGE_TAG }} \
            --context $PROD_US_WEST_2_CONTEXT -n production
          kubectl argo rollouts status my-service \
            --context $PROD_US_WEST_2_CONTEXT -n production --timeout=30m

  # ─── PHASE 5: eu-west-1 ─────────────────────────────────────────────────
  deploy-eu-west-1:
    needs: deploy-us-west-2
    environment: production-eu-west-1
    runs-on: ubuntu-latest
    steps:
      - name: Deploy eu-west-1
        run: |
          kubectl argo rollouts set image my-service \
            my-service=${{ env.IMAGE }}:${{ env.IMAGE_TAG }} \
            --context $PROD_EU_WEST_1_CONTEXT -n production
          kubectl argo rollouts status my-service \
            --context $PROD_EU_WEST_1_CONTEXT -n production --timeout=30m

  # ─── PHASE 6: Post-deploy ───────────────────────────────────────────────
  post-deploy:
    needs: deploy-eu-west-1
    runs-on: ubuntu-latest
    steps:
      - name: Tag image as production
        run: |
          skopeo copy \
            docker://${{ env.IMAGE }}:${{ env.IMAGE_TAG }} \
            docker://${{ env.IMAGE }}:production

      - name: Notify success
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -d '{"text":"✅ Deployed my-service '${{ env.IMAGE_TAG }}' to all 3 regions (500 pods)"}'

      - name: Record deployment
        run: |
          curl -X POST "https://api.datadoghq.com/api/v1/events" \
            -H "DD-API-KEY: ${DD_API_KEY}" \
            -d '{
              "title":"Deployed my-service to production",
              "tags":["service:my-service","sha:'"${{ env.IMAGE_TAG }}"'","regions:3"],
              "alert_type":"success"
            }'
```

---

## Quick Reference: Common Ops Commands

```bash
# Check rollout status
kubectl argo rollouts get rollout my-service -n production --watch

# Pause a canary manually
kubectl argo rollouts pause my-service -n production

# Promote a paused canary
kubectl argo rollouts promote my-service -n production

# Abort and rollback immediately
kubectl argo rollouts abort my-service -n production

# Check ArgoCD sync status
argocd app get my-service-production

# Force ArgoCD sync
argocd app sync my-service-production --force

# Rollback Kubernetes deployment
kubectl rollout undo deployment/my-service -n production

# View rollout history
kubectl rollout history deployment/my-service -n production

# Check canary weight
kubectl get ingress my-service-canary -n production \
  -o jsonpath='{.metadata.annotations.nginx\.ingress\.kubernetes\.io/canary-weight}'

# Trivy scan a running pod's image
IMAGE=$(kubectl get pod -n production -l app=my-service \
  -o jsonpath='{.items[0].spec.containers[0].image}')
trivy image $IMAGE

# Check image signature
cosign verify --certificate-identity-regexp=".*" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/org/app:${SHA}
```

---

## Interview Checklist

| Topic                           | Key Points to Demonstrate                                   |
| ------------------------------- | ----------------------------------------------------------- |
| Pipeline stages                 | Know the commit → artifact → staging → canary → prod flow   |
| Immutable artifacts             | SHA-tagged images, no rebuilds between environments         |
| Rolling vs Blue-Green vs Canary | Trade-offs: risk, speed, infrastructure cost                |
| Database migrations             | Expand-contract, never rename/drop in same deploy as code   |
| Rollback triggers               | Automated on error rate spike; when to roll back vs forward |
| Multi-region ordering           | Start with smallest blast radius; gate on regional health   |
| GitOps                          | Pull-based model, drift detection, sync waves for ordering  |
| Supply chain                    | Cosign signing, SBOM, Kyverno admission policies            |
| DORA metrics                    | Deployment frequency, lead time, CFR, MTTR                  |
| Feature flags                   | Decouple deploy from release; kill switch capability        |
