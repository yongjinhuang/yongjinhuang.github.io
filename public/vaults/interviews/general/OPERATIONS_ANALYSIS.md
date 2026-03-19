# Suppr Operations & Infrastructure Analysis

## 1. Infrastructure Topology

### 1.1 Cloud Provider: Tencent Cloud (Region: ap-nanjing / ap-shanghai)

```
                         ┌──────────────────────────────┐
                         │        DNS (Xinnet)           │
                         │    *.wilddata.cn records      │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │   EdgeOne (CDN + WAF + SSL)   │
                         │  - Covers entire domain       │
                         │  - DDoS / bot protection      │
                         │  - Auto SSL certificate renew │
                         │  - Static response caching    │
                         └──────────────┬───────────────┘
                                        │
                  ┌─────────────────────▼─────────────────────┐
                  │        CLB (Cloud Load Balancer)           │
                  │                                           │
                  │  Routes by subdomain:                     │
                  │  suppr.wilddata.cn      → K8s Ingress     │
                  │  api.suppr.wilddata.cn  → K8s Ingress     │
                  │  docs.suppr.wilddata.cn → K8s Ingress     │
                  │  seomanage.wilddata.cn  → K8s Ingress     │
                  └─────────────────────┬─────────────────────┘
                                        │
          ┌─────────────────────────────▼─────────────────────────────┐
          │                    TKE (K8s Cluster)                      │
          │                                                           │
          │  ┌─────────────────────────────────────────────────────┐  │
          │  │              NGINX Ingress Controller                │  │
          │  └───────────────────────┬─────────────────────────────┘  │
          │                          │                                │
          │  ┌───────────────────────▼─────────────────────────────┐  │
          │  │  Namespace: production                              │  │
          │  │                                                     │  │
          │  │  suppr-backend x7    suppr-consumer x1              │  │
          │  │  suppr-fed x1        suppr-api x1                   │  │
          │  │  wilddata-module-pay x1    gotenberg x1             │  │
          │  └─────────────────────────────────────────────────────┘  │
          │                                                           │
          │  Cloud Servers (Worker Nodes): 2 nodes (node affinity)   │
          └───────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │     External AI Services (on TKE, owned by another team)          │
  │                                                                    │
  │  paper-search        — LLM-based academic document search          │
  │  translation-service — Multi-language file translation engine      │
  │  deep-research       — Research report generation                  │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │    Lightweight Servers (Stateful Services via Docker Compose)      │
  │    (docker-compose files exist locally but NOT persisted to repo)  │
  │                                                                    │
  │  Production Server       Shared Server          DevOps Server     │
  │  ├── MySQL               ├── MongoDB (60GB,     ├── Jenkins CI    │
  │  └── Redis               │   3 billion records) └── Strapi CMS   │
  │                          └── Kafka                                │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │                Tencent COS (Object Storage)                        │
  │                                                                    │
  │  Private bucket: Production user files (signed URLs)               │
  │  Public bucket:  Avatars, share images (public read)               │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │                Tencent CDN (dedicated domain)                      │
  │                                                                    │
  │  Serves ONLY /_next/static/* assets from suppr-fed                 │
  │  via a dedicated CDN domain (not through EdgeOne)                  │
  └────────────────────────────────────────────────────────────────────┘
```

### 1.2 Service Inventory

| Service                 | Type                    | Where                  | Purpose                                            |
| ----------------------- | ----------------------- | ---------------------- | -------------------------------------------------- |
| **suppr-backend**       | Java 21 Spring Boot     | TKE (api profile)      | REST API, SSE streaming, JWT auth                  |
| **suppr-consumer**      | Java 21 Spring Boot     | TKE (consumer profile) | Kafka consumers for translation/research           |
| **suppr-fed**           | Next.js 15              | TKE                    | Admin dashboard at `/dashboard`                    |
| **suppr-api**           | Java 21 Spring Boot     | TKE                    | Public API gateway with rate limiting              |
| **wilddata-module-pay** | Java 21 Spring Boot     | TKE                    | Payment service (WeChat/Alipay)                    |
| **paper-search**        | External (another team) | TKE                    | LLM-based academic document search                 |
| **translation-service** | External (another team) | TKE                    | Multi-language file translation engine             |
| **deep-research**       | External (another team) | TKE                    | Research report generation                         |
| **gotenberg**           | Docker (3rd-party)      | TKE                    | PDF conversion via LibreOffice/Chromium            |
| **MySQL**               | Database                | Lightweight Server     | Relational data (users, orders, points)            |
| **Redis**               | Cache/Pub-Sub           | Lightweight Server     | JWT, SSE relay, distributed locks, counters        |
| **MongoDB**             | Document DB             | Lightweight Server     | Academic articles, link caches                     |
| **Kafka**               | Message Queue           | Lightweight Server     | Async task processing (3 brokers dev, 1 prod port) |
| **Strapi**              | Headless CMS            | Lightweight Server     | Content management for sharing                     |
| **Jenkins**             | CI Server               | Lightweight Server     | Build & deploy pipelines                           |

---

## 2. Network & Domain Architecture

### 2.1 Domain Routing

```
*.wilddata.cn (Xinnet DNS)
  │
  ├── suppr.wilddata.cn ──────────► Production
  │     ├── /suppr-backend/*       → suppr-backend (production ns)
  │     ├── /dashboard/*           → suppr-fed (production ns)
  │     └── /pay/*                 → wilddata-module-pay (production ns)
  │
  ├── test.suppr.wilddata.cn ─────► Test
  │     ├── /suppr-backend/*       → suppr-backend (test ns)
  │     ├── /dashboard/*           → suppr-fed (test ns)
  │     └── /pay/*                 → wilddata-module-pay (testing ns)
  │
  ├── api.suppr.wilddata.cn ──────► Public API
  │     └── /api/v1/*              → suppr-api (rate-limited gateway)
  │
  ├── docs.suppr.wilddata.cn ─────► API Documentation
  │
  └── seomanage.wilddata.cn ──────► SEO Management Tool
```

### 2.2 Traffic Flow

```
User Request
  → Xinnet DNS (*.wilddata.cn)
  → EdgeOne (covers entire *.wilddata.cn domain)
     - WAF: Blocks malicious traffic (bots, DDoS, scanners)
     - CDN: Caches static frontend responses (HTML, CSS, JS, images)
     - SSL: Auto-renewal certificates for all subdomains
  → CLB (Cloud Load Balancer)
     - Routes by Host header to K8s Ingress
     - Single CLB handles ALL subdomains (cost optimization)
  → NGINX Ingress Controller (inside TKE)
     - Path-based routing to K8s Services
  → K8s Pod

Static assets (separate path):
  → suppr-fed sets assetPrefix to a dedicated CDN domain
  → /_next/static/* requests go directly to Tencent CDN
  → CDN origin pulls from suppr-fed pods
  → Does NOT go through EdgeOne (separate domain)
```

### 2.3 SSL Certificate Management

- **Provider**: EdgeOne (auto-renewal)
- **Scope**: Covers entire `*.wilddata.cn` domain
- **Termination point**: EdgeOne edge nodes (not at pod level)
- **Renewal**: Automatic — EdgeOne handles certificate lifecycle

---

## 3. CI/CD Pipeline

### 3.1 Pipeline Architecture

```
Developer pushes to coding.net branch
  │
  ▼
coding.net webhook triggers Jenkins
  │
  ▼
Jenkins (on dedicated lightweight server)
  ├── Pull source code from coding.net
  ├── Build Docker image (multi-stage)
  │     ├── Maven build (Java 21) or npm build (Next.js)
  │     └── Produce minimal runtime image
  ├── Push image to Coding Docker Registry (private)
  └── Trigger Orbit CD deployment
        │
        ▼
Orbit CD (Tencent Coding CD)
  ├── Select environment (test / production)
  ├── Apply Helm chart with environment-specific values
  │     ├── values-test.yaml
  │     └── values-production.yaml
  └── K8s rolling update in target namespace
```

### 3.2 Container Registry

- **Host**: Coding.net private Docker registry
- **K8s authentication**: Image pull secret configured per namespace
- **Image naming**: `<org>/<project>/<service>:<tag>`
- **Tag strategy**: `v0.0.X` for releases, `test` for test builds

### 3.3 Deployment Tool: Orbit CD

- Tencent Coding's built-in CD tool (GitOps-style)
- Environment definitions stored in `.orbit/` directory per Helm chart
- Each environment maps to a K8s namespace + cluster credential
- **AutoSync disabled** — all deployments are manual (intentional for a startup)
- **Force Sync enabled** — overrides drift when deploying
- Version history in `.orbit/versions/` enables rollback

### 3.4 Helm Repository Access Control

Each `helm-*` repository has **strict role-based permissions**. Different team members have different access levels — only authorized members can modify production Helm values or trigger production deployments. This prevents accidental production changes by junior developers or non-ops members.

### 3.5 Environment Strategy

| Environment    | Namespace    | Replicas    | Purpose             |
| -------------- | ------------ | ----------- | ------------------- |
| **Test**       | `test`       | 1           | Development testing |
| **Production** | `production` | 7 (backend) | Live traffic        |
| ~~Demo~~       | ~~demo~~     | ~~1~~       | ~~Deprecated~~      |

Key differences across environments:

| Config                            | Test           | Production     |
| --------------------------------- | -------------- | -------------- |
| Backend replicas                  | 1              | 7              |
| MySQL pool                        | min=10, max=15 | min=20, max=60 |
| MongoDB pool                      | 20             | 100            |
| Undertow workers                  | 32             | 128            |
| Kafka file-translation partitions | 3              | 18             |
| Kafka deep-research partitions    | 3              | 6              |
| Translation concurrency/node      | 3              | 18             |

---

## 4. Container & JVM Configuration

### 4.1 Docker Build Strategy

All Java services use **multi-stage builds**:

```
Stage 1: maven:3.9.4-eclipse-temurin-21-alpine
  → Maven build with production profile
  → Output: fat JAR

Stage 2: eclipse-temurin:21-jre
  → Minimal JRE runtime
  → SSH client for tunnel access
  → Asia/Shanghai timezone
  → Custom entrypoint.sh
```

Next.js frontend uses:

```
Stage 1: node:20-alpine (Aliyun npm mirror)
  → npm ci + next build
Stage 2: alpine (non-root user nextjs:1001)
  → Standalone output mode
  → Port 3000
```

### 4.2 JVM Tuning (entrypoint.sh)

```bash
-XX:+UseG1GC                    # Low-latency GC
-XX:MaxGCPauseMillis=100        # Target 100ms pauses
-XX:+UseContainerSupport        # Respect cgroup memory limits
-XX:MaxRAMPercentage=75.0       # Use 75% of container memory
-XX:+UseStringDeduplication     # Deduplicate string objects
-XX:+UseTransparentHugePages    # OS-level memory optimization
-XX:+UseCompressedOops          # Reduce pointer size on 64-bit
```

suppr-api additionally configures:

```bash
-XX:+HeapDumpOnOutOfMemoryError          # Capture heap dumps
-XX:HeapDumpPath=/workspace/heapdumps/   # Dump location
-XX:+ExitOnOutOfMemoryError              # Crash fast on OOM
-Xlog:gc*:file=/workspace/logs/gc.log    # GC logging
```

### 4.3 Health Checks

All K8s deployments use the same pattern:

```yaml
livenessProbe:
  httpGet:
    path: /ping
    port: http
  initialDelaySeconds: 30
  periodSeconds: 5

readinessProbe:
  httpGet:
    path: /ping
    port: http
  initialDelaySeconds: 30
  periodSeconds: 5
```

- **API termination grace**: 10 seconds
- **Consumer termination grace**: 30 seconds (allows in-flight Kafka tasks to finish)

---

## 5. Stateful Services: Lightweight Servers

### 5.1 Why Lightweight Servers Instead of Managed Services

You deploy MySQL, Redis, MongoDB, and Kafka on Tencent Lightweight Servers (self-managed) rather than using Tencent managed database services (TencentDB, TDSQL, etc.). This is a deliberate **cost optimization** for a startup:

| Service | Lightweight Server | Managed Service (Tencent)        |
| ------- | ------------------ | -------------------------------- |
| MySQL   | Self-managed on VM | TencentDB for MySQL (~3-5x cost) |
| Redis   | Self-managed on VM | TencentDB for Redis (~2-3x cost) |
| MongoDB | Self-managed on VM | TencentDB for MongoDB (~3x cost) |
| Kafka   | Self-managed on VM | CKafka (~4x cost)                |

**Trade-off**: Lower cost but no automatic backups, failover, patching, or monitoring out of the box.

### 5.2 Docker Compose for Stateful Services

All stateful services (MySQL, Redis, MongoDB, Kafka) are deployed via **Docker Compose** on lightweight servers. This makes setup straightforward — `docker compose up -d` brings up the entire stack. However, **the docker-compose files exist only locally on each server and are NOT persisted to any repository**, which is a risk for reproducibility.

### 5.3 Server Layout

```
Production Server
  ├── MySQL (via Docker Compose)
  └── Redis (via Docker Compose)

Shared Server
  ├── MongoDB (via Docker Compose) — 60GB, ~3 billion records
  └── Kafka  (via Docker Compose) — shared across test/prod

DevOps Server
  ├── Jenkins CI
  └── Strapi CMS
```

---

## 6. Object Storage (COS)

### 6.1 Bucket Strategy

| Bucket               | Purpose                               | Access                              |
| -------------------- | ------------------------------------- | ----------------------------------- |
| Private (production) | User files — translated docs, uploads | Private (signed URLs, 24h validity) |
| Private (test)       | Test environment files                | Private (signed URLs)               |
| Public               | Avatars, share images                 | Public read                         |

### 6.2 Integration

- MinIO SDK used as S3-compatible client (works with Tencent COS's S3 API)
- Signed URLs with 24-hour validity for private file downloads
- Max file size: 2GB
- Separate credentials per bucket (private vs public)

---

## 7. CDN & Edge Security

### 7.1 EdgeOne (Covers Entire Domain)

- **Scope**: Covers all `*.wilddata.cn` subdomains
- **WAF**: Blocks DDoS, bot traffic, vulnerability scanners, malicious crawlers
- **CDN**: Caches frontend responses (HTML pages, images) at edge nodes
- **SSL**: Auto-renewal certificates for all subdomains — no manual intervention needed
- **Primary motivation**: Security — protecting specific pages from malicious attacks

### 7.2 CDN (Tencent Cloud CDN — Separate Domain)

- Serves **only** `/_next/static/*` files (Next.js JS bundles, CSS, fonts, media)
- `suppr-fed` sets `assetPrefix` to a **dedicated CDN domain**, so static asset requests go directly to CDN without passing through EdgeOne
- Origin: K8s suppr-fed pods
- This is a valid use case — Next.js static assets have content-hash filenames (immutable), ideal for long `Cache-Control: max-age=31536000` TTLs

### 7.3 EdgeOne vs CDN: No Overlap

These two layers serve **different traffic on different domains**:

```
Page requests (suppr.wilddata.cn/*)
  → EdgeOne (WAF + cache + SSL) → CLB → K8s

Static assets (cdn-domain.example.com/_next/static/*)
  → Tencent CDN (pure caching) → K8s suppr-fed (origin)
```

No overlap — EdgeOne handles security and page caching on the main domain; CDN handles static asset delivery on a dedicated domain.

---

## 8. Logging & Monitoring

### 8.1 Application Logging

- **Framework**: Logback with Spring profile-aware configuration
- **Appenders**: Console (stdout) + Rolling file (30-day retention, 3GB cap)
- **Pattern**: `timestamp [thread] level logger - message`
- **Log levels**: Configurable via `LOGGING_LEVEL` env var per pod

### 8.2 Tencent Cloud Log Service (CLS)

- Collects stdout/stderr from all K8s pods
- Enables centralized log search across namespaces
- Useful for debugging cross-service issues (API → Kafka → Consumer)

### 8.3 What's Missing

- No structured JSON logging (plain text only)
- No Prometheus metrics endpoint
- No distributed tracing (SkyWalking agent config exists but not actively used)
- No alerting on log patterns (e.g., ERROR rate spikes)

---

## 9. What's Done Well

### 9.1 Cost-Effective Architecture for a Startup

The entire production stack runs on a minimal footprint: 2 cloud servers for TKE worker nodes, a few lightweight servers for stateful services, and a single CLB for all subdomains. This is a pragmatic choice — managed services would cost 3-5x more for the same capacity.

### 9.2 Clean Environment Separation via K8s Namespaces

Test and production share the same K8s cluster but are isolated by namespace. Each environment has its own Helm values file with environment-specific databases, credentials, Kafka topics, and COS buckets. No cross-environment contamination is possible because topic names, DB names, and Redis databases are all namespaced. Helm repositories have strict per-member access controls to prevent unauthorized production changes.

### 9.3 Profile-Based API/Consumer Split

The same Docker image serves both roles. `SPRING_PROFILES_ACTIVE=api` starts the web server; `=consumer` starts Kafka listeners. This simplifies the build pipeline (one image, two deployments) while allowing independent scaling and different termination grace periods (10s vs 30s).

### 9.4 Multi-Stage Docker Builds

All services use multi-stage builds that produce minimal runtime images. The Java services drop the entire Maven toolchain in the final image; the Next.js frontend uses standalone output mode with a non-root user. This reduces image size, attack surface, and startup time.

### 9.5 JVM Container Awareness

The entrypoint scripts use `-XX:+UseContainerSupport` and `-XX:MaxRAMPercentage=75.0`, ensuring the JVM respects cgroup memory limits set by K8s. This prevents OOM kills from the JVM allocating more memory than the pod's resource limit. The suppr-api service additionally has `HeapDumpOnOutOfMemoryError` and `ExitOnOutOfMemoryError` for crash diagnostics.

### 9.6 Graceful Shutdown Differentiation

API pods have a 10-second termination grace period (sufficient for draining HTTP connections), while Consumer pods have 30 seconds (allowing in-flight Kafka tasks to complete and ACK before shutdown). This prevents message loss during rolling updates.

### 9.7 Health Check Endpoints

Every service exposes a `/ping` endpoint used for both liveness and readiness probes. K8s won't route traffic to a pod until it passes readiness, and will restart it if liveness fails. The 30-second initial delay accommodates Spring Boot startup time.

### 9.8 SSH Tunnel for Secure Internal Access

The backend pods mount SSH keys and establish tunnels to access services that aren't directly reachable from the K8s network. This is a lightweight alternative to VPN peering or private network setup, appropriate for a startup's infra budget.

### 9.9 Helm Values Per Environment

Environment-specific tuning is externalized to values files rather than hardcoded. Production gets 7 replicas, 128 Undertow workers, 60 MySQL connections, and 18 Kafka partitions. Test gets 1 replica, 32 workers, 15 connections, and 3 partitions. Changing any of these requires zero code changes.

### 9.10 Immutable Asset CDN Caching via Dedicated Domain

Using a **dedicated CDN domain** for `/_next/static/*` (via Next.js `assetPrefix`) is a smart optimization. Next.js generates content-hashed filenames for all static assets — they are immutable by design. A long `Cache-Control: max-age=31536000` TTL is safe and eliminates origin traffic for repeat visitors. Separating this onto its own domain avoids interference with EdgeOne's WAF rules on the main domain.

---

## 10. Current Issues

### 10.1 Critical

#### Single-node stateful services with no backup

MySQL, Redis, MongoDB, and Kafka all run on single lightweight servers with no replication, automatic failover, or automated backups. If the production MySQL server dies, **all production data is lost**. This is the single highest risk in the entire infrastructure.

#### Shared MongoDB and Kafka across environments

MongoDB and Kafka are shared between test and production on the same server. A runaway test workload can saturate Kafka or MongoDB, causing production degradation. A misconfigured test consumer could accidentally consume production topic messages if topic naming conventions are violated.

#### Credentials in Helm values files (checked into Git)

Production database credentials, COS access keys, and JWT signing keys are stored in plain text in `values-production.yaml`. While Helm repositories have strict access controls per team member, the credentials are still in Git history. Anyone who gains repo access — even temporarily — can extract all production secrets.

### 10.2 High

#### Single CLB as the gateway for everything

One Cloud Load Balancer handles all subdomains (suppr, test.suppr, api.suppr, docs, seomanage). If the CLB hits its connection limit or has a configuration error, **all services and all environments** go down simultaneously. There's no isolation between production and test traffic at the load balancer level.

#### Node affinity pins pods to 2 specific servers

Production pods have hard affinity to 2 specific worker nodes. If either node goes down, pods cannot be rescheduled to other nodes. This defeats K8s's self-healing capability. With 7 backend replicas pinned to 2 nodes, a single node failure takes out ~3-4 replicas.

#### No automated database backups

No `mysqldump` cron, no Redis RDB/AOF persistence verification, no MongoDB backup strategy. Recovery from data corruption or accidental deletion requires manual intervention — if a backup even exists. MongoDB is particularly challenging at 60GB / 3 billion records (see section 11.1).

### 10.3 Medium

#### Jenkins on a lightweight server with no redundancy

The Jenkins CI server runs on a single lightweight server. Jenkins has no redundancy — if the server dies, the entire CI/CD pipeline stops. All build history and job configurations would be lost.

#### Docker Compose files not persisted to repository

Stateful services are deployed via Docker Compose on lightweight servers, but the compose files exist only locally. If a server is lost, the exact configuration (port mappings, volumes, environment variables) would need to be reconstructed from memory.

#### No K8s resource limits visible in Helm charts

The deployment templates don't specify CPU/memory `requests` and `limits`. Without resource limits, a single misbehaving pod can consume all node resources and starve other pods (noisy neighbor problem).

#### Orbit CD AutoSync is disabled everywhere

All environments use manual deployment. While this prevents accidental deployments, it also means deployments depend on a human remembering to trigger Orbit CD after the Jenkins build succeeds. There's no automated pipeline from code push to production.

---

## 11. How to Improve

### 11.1 Database Backup Strategy (Urgent)

**MySQL** — straightforward:

```bash
# Daily full backup + hourly binlog backup
mysqldump --single-transaction --routines --triggers suppr_db | gzip > backup_$(date +%Y%m%d).sql.gz
# Upload to COS for offsite storage
```

**Redis** — verify RDB persistence is enabled, daily copy of dump.rdb to COS.

**MongoDB** — the hard problem. At **60GB / 3 billion records**, `mongodump` is impractical on a lightweight server (would consume all disk I/O and memory for hours). Better alternatives:

- **Filesystem snapshots**: If the lightweight server uses a cloud disk, use Tencent Cloud's **CBS snapshot** to take a consistent point-in-time backup at the block level. Fast, zero application impact.
- **Delayed secondary replica**: Add a small MongoDB replica set member with `slaveDelay` (e.g., 1 hour). Acts as a rolling backup — if data is corrupted, the delayed node still has clean data.
- **Incremental backup with `mongodump --query`**: Back up only recent data (e.g., last 7 days by `_last_modified_time`) instead of the full 60GB. Combine with periodic full CBS snapshots.

Store all backups in a **separate COS bucket** with lifecycle rules (30 days retention). Test restore procedures monthly.

### 11.2 Separate Shared Infrastructure

Split MongoDB and Kafka per environment:

| Current                       | Improved                                                 |
| ----------------------------- | -------------------------------------------------------- |
| 1 shared MongoDB for all envs | Test MongoDB on test server, Prod MongoDB on prod server |
| 1 shared Kafka for all envs   | Test Kafka on test server, Prod Kafka on prod server     |

At minimum, use different Kafka ports or separate broker instances. This eliminates the risk of test traffic affecting production.

### 11.3 Secret Management

Move credentials out of Helm values files:

- **Short-term**: Use K8s Secrets created manually (not checked into Git). Reference secrets in Helm via `existingSecret` pattern.
- **Long-term**: Use Tencent Cloud SSM (Secrets Manager) or HashiCorp Vault. Inject secrets via K8s CSI driver or init container.
- **Immediately**: Rotate all production credentials that are currently exposed in Git history.

### 11.4 Remove Node Affinity Constraints

Replace hard node affinity with **soft preference** (`preferredDuringSchedulingIgnoredDuringExecution`) or remove it entirely. Let K8s scheduler distribute pods across all available nodes. If specific nodes have more resources, use node labels and resource requests instead of IP-based pinning.

### 11.5 Add K8s Resource Limits

```yaml
resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: 2000m
    memory: 4Gi
```

Without limits, a single pod can OOM the entire node. Set requests based on typical usage and limits based on peak usage. Monitor actual consumption with `kubectl top pods` to right-size over time.

### 11.6 Persist Docker Compose Files and Infrastructure Config

The docker-compose files for stateful services exist only locally on each server. Persist them to a Git repository:

```
infra/
  ├── docker-compose/
  │     ├── production/
  │     │     ├── docker-compose.yml    (MySQL + Redis)
  │     │     └── .env.example
  │     ├── shared/
  │     │     ├── docker-compose.yml    (MongoDB + Kafka)
  │     │     └── .env.example
  │     └── devops/
  │           ├── docker-compose.yml    (Jenkins + Strapi)
  │           └── .env.example
  └── README.md                         (server setup instructions)
```

This ensures any team member can rebuild a server from scratch without tribal knowledge. Even without Ansible/Terraform, versioned compose files are a significant improvement.

### 11.7 CI/CD Pipeline Improvements

```
Current:  Push → Jenkins → Build Image → Manual Orbit CD → Deploy
Improved: Push → Jenkins → Build Image → Auto-deploy to Test
                                       → Manual approval gate → Deploy to Prod
```

- Enable Orbit CD **AutoSync for test namespace only** — every push to the develop branch auto-deploys to test.
- Keep production manual, but add a Slack/DingTalk notification when a new image is available for promotion.
- Add a **build verification step**: Run `mvn test` in Jenkins before building the image.

### 11.8 Structured Logging + Alerting

Switch from plain text to JSON logging:

```json
{
  "timestamp": "2026-02-26T10:30:00",
  "level": "ERROR",
  "logger": "FileTranslateTaskConsumer",
  "message": "Translation failed",
  "uid": "abc123",
  "sessionId": "xyz789",
  "error": "Connection refused"
}
```

This enables:

- CLS (Log Service) structured queries (filter by uid, sessionId, level)
- Alert rules: "Notify DingTalk if ERROR count > 10 in 5 minutes"
- Dashboard: Error rate per service over time

---

## 12. Summary

> Suppr runs on Tencent Cloud with a cost-optimized architecture: TKE for stateless services, lightweight servers running Docker Compose for databases, a single CLB for all subdomains, EdgeOne for domain-wide WAF + auto-SSL, and Coding.net + Jenkins for CI/CD. The infrastructure demonstrates good startup pragmatism — namespace-based environment isolation with strict Helm repo access controls, profile-based API/Consumer split, multi-stage Docker builds, container-aware JVM tuning, and a dedicated CDN domain for immutable Next.js assets. The critical risks are: single-node stateful services with no automated backups (especially the 60GB MongoDB), production credentials in Git history, shared MongoDB/Kafka across environments, and hard node affinity that defeats K8s self-healing. Priority improvements are: automated database backups (CBS snapshots for MongoDB), secret management via K8s Secrets, separating shared infrastructure per environment, persisting docker-compose files to Git, and removing node affinity constraints.
