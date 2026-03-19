# Cloud Services Daily Operations Guide

A practical guide for the Suppr team on how each cloud service is used day-to-day.

---

## 1. Xinnet (DNS)

**What it does**: Manages all `*.wilddata.cn` DNS records.

**When you touch it**:

- Adding a new subdomain (e.g., `newservice.wilddata.cn`)
- Changing where a subdomain points (e.g., migrating to a new CLB)

**How to use**:

1. Log in to Xinnet console
2. Navigate to domain management → `wilddata.cn`
3. Add/edit DNS records:
   - **A record**: Points subdomain to an IP (e.g., CLB IP)
   - **CNAME record**: Points subdomain to another domain (e.g., EdgeOne CNAME for CDN)
4. TTL: Use 600s (10 min) for records you might change; 3600s (1 hour) for stable ones

**Common tasks**:
| Task | Record Type | Example |
|------|------------|---------|
| New subdomain → CLB | A | `newapp.wilddata.cn → <CLB IP>` |
| New subdomain → EdgeOne | CNAME | `newapp.wilddata.cn → <EdgeOne CNAME>` |
| Verify domain ownership | TXT | `_acme-challenge.wilddata.cn → <verification string>` |

**Gotcha**: DNS changes can take up to the TTL duration to propagate. If you just changed a record and it's not working, wait for the old TTL to expire.

---

## 2. EdgeOne (WAF + CDN + SSL)

**What it does**: Sits in front of the entire `*.wilddata.cn` domain. Provides three functions:

1. **WAF** — Blocks malicious traffic before it reaches your servers
2. **CDN** — Caches page-level responses at edge nodes close to users
3. **SSL** — Auto-provisions and renews HTTPS certificates for all subdomains

**When you touch it**:

- A new attack pattern is hitting the site
- You need to purge cached pages after a deployment
- Adding a new subdomain that needs protection
- Debugging why a page shows stale content

**How to use**:

### Adding a new subdomain

1. Log in to EdgeOne console
2. Go to Site → Domain Management
3. Add the new subdomain
4. EdgeOne provides a CNAME — add this to Xinnet DNS
5. SSL certificate is auto-provisioned (no manual cert needed)

### Blocking an attack

1. Go to Security → WAF Rules
2. Create a custom rule:
   - Match condition: IP range, User-Agent pattern, request path, etc.
   - Action: Block / Challenge / Rate Limit
3. For emergency blocking, use the IP blocklist for immediate effect

### Purging cache

1. Go to Cache → Purge
2. Choose scope:
   - **URL purge**: Specific page (e.g., `https://suppr.wilddata.cn/some-page`)
   - **Prefix purge**: All pages under a path (e.g., `https://suppr.wilddata.cn/share/*`)
   - **Full purge**: Everything (use sparingly — causes origin traffic spike)
3. Cache usually clears within 30 seconds

### Checking traffic / attacks

1. Go to Analytics → Traffic Analysis for request volume, bandwidth, status codes
2. Go to Security → Security Analytics for blocked attacks, top attacker IPs
3. Useful filters: Time range, domain, attack type

**Gotcha**: If a user reports seeing old content after a deployment, it's likely cached by EdgeOne. Purge the specific URL first before investigating further.

---

## 3. Tencent CDN (Static Assets)

**What it does**: Serves `/_next/static/*` files (JS bundles, CSS, fonts) from a **dedicated CDN domain**, separate from EdgeOne. The Next.js frontend (`suppr-fed`) sets `assetPrefix` to this CDN domain.

**When you touch it**:

- Rarely — Next.js static assets are immutable (content-hashed filenames), so cache invalidation is almost never needed
- If you change the CDN domain or need to debug asset loading failures

**How to use**:

### Checking CDN status

1. Log in to Tencent CDN console
2. Go to Domain Management → select the CDN domain
3. Check: Origin server configuration, cache rules, HTTPS settings

### Cache rules (should already be set)

```
/_next/static/*  →  Cache-Control: max-age=31536000 (1 year)
```

Since filenames contain content hashes (e.g., `main-abc123.js`), a 1-year TTL is safe. New deploys generate new filenames, so old cached files simply stop being requested.

### Debugging asset loading

1. Open browser DevTools → Network tab
2. Check if `/_next/static/*` requests are hitting the CDN domain
3. Check response headers: `X-Cache: HIT` means CDN served it; `MISS` means it went to origin
4. If assets fail to load, check CDN origin configuration points to the correct K8s service

**Gotcha**: After changing `assetPrefix` in `next.config.ts`, you must rebuild and redeploy `suppr-fed`. The prefix is baked into the HTML at build time.

---

## 4. CLB (Cloud Load Balancer)

**What it does**: Single entry point for all K8s traffic. Routes requests by subdomain to the NGINX Ingress Controller inside TKE.

**When you touch it**:

- Adding a new subdomain that needs to reach K8s
- Debugging connectivity issues (requests not reaching pods)
- Checking listener health and connection counts

**How to use**:

### Viewing current configuration

1. Log in to Tencent Cloud → CLB console
2. Find the CLB instance
3. Check **Listeners**: Each listener maps a port + protocol to a backend (K8s node)
4. Check **Health status**: Green = healthy, Red = backend unreachable

### Adding a new subdomain route

The CLB itself doesn't route by subdomain — it forwards all traffic to the NGINX Ingress Controller, which does the routing. So to add a new subdomain:

1. **DNS**: Add the subdomain in Xinnet pointing to CLB IP (or EdgeOne CNAME)
2. **EdgeOne**: Add the subdomain if it needs WAF protection
3. **Ingress**: Create a K8s Ingress resource for the new subdomain (see TKE section)
4. CLB doesn't need changes unless you need a new port/protocol

### Monitoring

- Check **Active connections** — if approaching the limit, consider upgrading CLB tier
- Check **Bandwidth** — spikes may indicate an attack (should be caught by EdgeOne first)

**Gotcha**: The CLB handles ALL subdomains and ALL environments on a single instance. Be careful with configuration changes — a mistake affects everything.

---

## 5. TKE (Tencent Kubernetes Engine)

**What it does**: Hosts all stateless services (backend, consumer, frontend, API gateway, payment, gotenberg). Environments are separated by K8s namespaces.

**When you touch it**:

- Deploying new versions (via Orbit CD, but sometimes manual kubectl)
- Scaling replicas up/down
- Debugging pod crashes or restarts
- Checking logs and resource usage

**How to use**:

### Checking pod status

```bash
# All pods in production
kubectl get pods -n production

# Detailed info on a specific pod
kubectl describe pod <pod-name> -n production

# Check why a pod is restarting
kubectl logs <pod-name> -n production --previous
```

### Scaling

```bash
# Scale backend to 10 replicas
kubectl scale deployment suppr-backend -n production --replicas=10

# Scale consumer (be careful — affects Kafka partition assignment)
kubectl scale deployment suppr-consumer -n production --replicas=2
```

Note: Scaling via `kubectl` is temporary. For permanent changes, update the Helm values file and redeploy.

### Deploying via Orbit CD

1. Jenkins builds and pushes the Docker image
2. Go to Coding.net → CD → Orbit
3. Select the application (e.g., `helm-suppr-backend`)
4. Select the environment (test or production)
5. Select the version (image tag)
6. Click Deploy → rolling update begins
7. Monitor: `kubectl rollout status deployment/suppr-backend -n production`

### Deploying manually (emergency)

```bash
# Update image directly (bypasses Helm)
kubectl set image deployment/suppr-backend suppr-backend=<registry>/<image>:<tag> -n production

# Watch rollout
kubectl rollout status deployment/suppr-backend -n production

# Rollback if something goes wrong
kubectl rollout undo deployment/suppr-backend -n production
```

### Adding a new Ingress route

```yaml
# Example: Route new-service.wilddata.cn to a K8s service
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: new-service-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: new-service.wilddata.cn
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: new-service
                port:
                  number: 8080
```

### Checking resource usage

```bash
# CPU and memory per pod
kubectl top pods -n production

# Per node
kubectl top nodes
```

### Common debugging

| Symptom                         | Check                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| Pod stuck in `CrashLoopBackOff` | `kubectl logs <pod> -n production --previous`                           |
| Pod stuck in `Pending`          | `kubectl describe pod <pod>` — usually node affinity or resource limits |
| Pod stuck in `ImagePullBackOff` | Image pull secret expired or image tag doesn't exist                    |
| 502 errors from Ingress         | Pod not ready — check readiness probe and logs                          |
| Slow responses                  | `kubectl top pods` — check if CPU/memory is maxed out                   |

**Gotcha**: Node affinity currently pins pods to 2 specific nodes. If a node is down, pods won't reschedule elsewhere.

---

## 6. COS (Cloud Object Storage)

**What it does**: Stores user-uploaded files, translated documents, avatars, and shared images. Two types of buckets: private (signed URLs) and public (open read access).

**When you touch it**:

- Checking if a file exists or debugging upload failures
- Cleaning up orphaned files
- Managing bucket permissions or lifecycle rules

**How to use**:

### Browsing files

1. Log in to Tencent COS console
2. Select the bucket (private or public)
3. Browse the file tree or search by path/prefix
4. Click a file to see metadata (size, type, upload time, URL)

### Generating a signed URL (for debugging)

1. Find the file in the console
2. Click "Get Temporary URL"
3. Set expiration (default: 1 hour)
4. Copy the URL — this is what the backend generates for users via the MinIO SDK

### File lifecycle

- Private files: Signed URLs expire after 24 hours (configured in backend)
- Public files: Accessible permanently via public URL
- No automatic cleanup rules currently — orphaned files accumulate

### Using COSCMD (CLI tool)

```bash
# Install
pip install coscmd

# Configure (use your COS credentials)
coscmd config -a <SecretId> -s <SecretKey> -b <bucket> -r ap-shanghai

# List files
coscmd list /production/

# Download a file
coscmd download /production/path/to/file.pdf ./local-file.pdf

# Upload a file
coscmd upload ./local-file.pdf /production/path/to/file.pdf

# Delete a file
coscmd delete /production/path/to/file.pdf
```

**Gotcha**: The backend uses MinIO SDK (S3-compatible) to talk to COS. If COS API changes or credentials rotate, update the Helm values for `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`.

---

## 7. Tencent Cloud Log Service (CLS)

**What it does**: Collects stdout/stderr from all K8s pods. Enables centralized log search without `kubectl logs`.

**When you touch it**:

- Debugging production issues
- Searching logs across multiple pods/services
- Checking error frequency over time

**How to use**:

### Searching logs

1. Log in to CLS console
2. Select the log topic (mapped to K8s namespace)
3. Use the search bar with query syntax:

```
# Find errors in suppr-backend
container_name:suppr-backend AND level:ERROR

# Search by user ID
uid:abc123-def456

# Search by session ID
fileTranslationSessionId:xyz789

# Find slow operations (logs with "took" keyword)
"took" AND "ms"

# Time range: Use the time picker (last 1h, 6h, 24h, custom)
```

### Common queries

| Scenario                 | Query                                                           |
| ------------------------ | --------------------------------------------------------------- |
| All errors in last hour  | `level:ERROR` (set time to 1h)                                  |
| Translation failures     | `"Translation failed"` or `FileTranslateTaskConsumer AND ERROR` |
| Payment callback issues  | `WechatPayController AND ERROR`                                 |
| Point rollback events    | `"rollbackPointRecord"`                                         |
| Specific user's activity | `uid:<user-id>`                                                 |
| OOM or memory issues     | `"OutOfMemoryError"` or `"heap"`                                |

### Exporting logs

1. Run your search query
2. Click Export → CSV or JSON
3. Useful for sharing with the AI services team when debugging cross-service issues

**Gotcha**: Logs are plain text (not JSON structured). Complex queries may require regex. Consider switching to structured JSON logging for better queryability (see OPERATIONS_ANALYSIS.md section 11.8).

---

## 8. SSL Certificates

**What it does**: EdgeOne handles SSL auto-renewal for all `*.wilddata.cn` subdomains. No manual certificate management needed.

**When you touch it**:

- Almost never — EdgeOne auto-renews certificates
- Only if adding a domain outside `*.wilddata.cn`

**How to verify SSL is working**:

```bash
# Check certificate details for a domain
curl -vI https://suppr.wilddata.cn 2>&1 | grep -E "subject:|expire"

# Or use openssl
echo | openssl s_client -servername suppr.wilddata.cn -connect suppr.wilddata.cn:443 2>/dev/null | openssl x509 -noout -dates
```

**If SSL breaks on a subdomain**:

1. Check EdgeOne console → Domain Management → ensure the subdomain is added
2. Check DNS → ensure the subdomain CNAME points to EdgeOne (not directly to CLB)
3. EdgeOne auto-provisions certs — if missing, remove and re-add the domain

---

## 9. Lightweight Servers (Stateful Services)

**What it does**: Hosts MySQL, Redis, MongoDB, and Kafka via Docker Compose. Also hosts Jenkins and Strapi.

**When you touch it**:

- Database maintenance (slow queries, disk space, connections)
- Restarting a crashed service
- Checking disk usage (especially MongoDB at 60GB)

**How to use**:

### SSH into a server

```bash
ssh root@<server-ip>
```

### Checking service status

```bash
# List all running containers
docker ps

# Check a specific service's logs
docker logs <container-name> --tail 100 -f

# Check disk usage (critical for MongoDB server)
df -h

# Check memory usage
free -h

# Check Docker disk usage
docker system df
```

### Restarting a service

```bash
# Navigate to the docker-compose directory
cd /path/to/docker-compose/

# Restart a specific service
docker compose restart mysql

# Restart everything
docker compose down && docker compose up -d

# If a container is stuck
docker kill <container-name> && docker compose up -d
```

### MySQL operations

```bash
# Connect to MySQL
docker exec -it <mysql-container> mysql -u root -p

# Check slow queries
SHOW PROCESSLIST;

# Check database size
SELECT table_schema AS 'Database',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
GROUP BY table_schema;

# Manual backup
docker exec <mysql-container> mysqldump --single-transaction suppr_db | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Redis operations

```bash
# Connect to Redis
docker exec -it <redis-container> redis-cli -a <password>

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# Check key count
DBSIZE

# Find large keys (careful in production)
redis-cli --bigkeys
```

### MongoDB operations

```bash
# Connect to MongoDB
docker exec -it <mongo-container> mongosh -u <user> -p <password>

# Check database size
use suppr_db
db.stats()

# Check collection sizes
db.getCollectionNames().forEach(function(c) {
  var stats = db.getCollection(c).stats();
  print(c + ": " + (stats.size / 1024 / 1024 / 1024).toFixed(2) + " GB, " + stats.count + " docs");
})

# Check current operations (find slow queries)
db.currentOp({"secs_running": {$gt: 5}})
```

### Kafka operations

```bash
# List topics
docker exec -it <kafka-container> kafka-topics.sh --list --bootstrap-server localhost:9092

# Check consumer group lag
docker exec -it <kafka-container> kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group suppr-backend-group-prod \
  --describe

# Check topic partition details
docker exec -it <kafka-container> kafka-topics.sh \
  --describe --topic file-translate-tasks-production \
  --bootstrap-server localhost:9092
```

### Disk space emergency (MongoDB server)

```bash
# Check what's using space
du -sh /var/lib/docker/volumes/*

# If MongoDB data dir is full:
# 1. Check if there are old logs to clean
docker logs <mongo-container> --since 720h > /dev/null  # Check log size

# 2. Compact a collection (reclaims space from deleted docs)
# In mongosh:
db.runCommand({ compact: "large_collection_name" })

# 3. As last resort: add a bigger cloud disk and migrate Docker volume
```

**Gotcha**: The docker-compose files are NOT in any repository. If you need to rebuild a server, you'll need to reconstruct the configuration. Priority: persist these files to Git (see OPERATIONS_ANALYSIS.md section 11.6).

---

## 10. Coding.net + Jenkins (CI/CD)

**What it does**: Coding.net hosts the Git repositories. Jenkins builds Docker images. Orbit CD deploys to K8s.

**When you touch it**:

- Every deployment
- When builds fail
- When adding a new service to the pipeline

**How to use**:

### Triggering a build

1. Push code to the target branch on coding.net
2. Coding.net webhook automatically triggers Jenkins
3. Monitor the build on Jenkins UI

### Checking build status

1. SSH into the Jenkins server or open Jenkins web UI
2. Navigate to the project → Build History
3. Click on the build number → Console Output for full logs
4. Common failure reasons:
   - Maven dependency download failed (network issue)
   - Test failure (check test output)
   - Docker push failed (registry credentials expired)

### Deploying to an environment

1. After Jenkins build succeeds, go to Coding.net → CD → Orbit
2. Select application and environment
3. Click deploy
4. Verify: `kubectl get pods -n <namespace> -w` (watch pods rolling)

### Adding a new service to CI/CD

1. **Coding.net**: Create a new repository for the service
2. **Jenkins**: Create a new pipeline job pointing to the repo
3. **Docker**: Add a Dockerfile to the repo
4. **Helm**: Create a new `helm-<service>` chart with values per environment
5. **Orbit CD**: Add `.orbit/` configuration to the Helm chart
6. **Permissions**: Set role-based access on the Helm repo

### Rotating registry credentials

If K8s can't pull images (`ImagePullBackOff`):

```bash
# Delete old secret
kubectl delete secret coding-registry-cred -n production

# Create new secret
kubectl create secret docker-registry coding-registry-cred \
  --docker-server=<registry-host> \
  --docker-username=<username> \
  --docker-password=<token> \
  -n production
```

**Gotcha**: Jenkins runs on a single lightweight server with no backup. If Jenkins dies, you lose all build history and job configurations. Consider periodically backing up Jenkins home directory (`/var/jenkins_home`) to COS.

---

## 11. Quick Reference: "Something Is Down"

### The site is completely unreachable

1. Check DNS: `dig suppr.wilddata.cn` — does it resolve?
2. Check EdgeOne: Is the domain active? Any global rules blocking all traffic?
3. Check CLB: Is the load balancer healthy in Tencent console?
4. Check TKE: `kubectl get nodes` — are worker nodes ready?

### API returns 502/504

1. Check pods: `kubectl get pods -n production` — any restarts or CrashLoopBackOff?
2. Check logs: `kubectl logs <pod> -n production --tail 50`
3. Check DB: SSH into production server → `docker ps` → is MySQL/Redis running?
4. Check Ingress: `kubectl describe ingress -n production`

### File translation is stuck

1. Check consumer pods: `kubectl get pods -n production | grep consumer`
2. Check Kafka lag: Use Kafka CLI to check consumer group lag
3. Check Redis: Is the active task counter stuck? (`file_translation:active_tasks:<uid>`)
4. Check translation service: Is it healthy? (pods in `ai-core-*` namespace)
5. Check CLS logs: Search for the session ID

### Users report stale content

1. Purge EdgeOne cache for the specific URL
2. Check if it's a static asset (`/_next/static/*`) — these have 1-year TTL but content-hashed names, so new deploys should automatically serve new URLs
3. If the issue persists, check if the deployment actually rolled out: `kubectl rollout status deployment/suppr-fed -n production`

### A lightweight server is down

1. Check Tencent Cloud console → Lighthouse → server status
2. If the server is running but services are down:
   ```bash
   ssh root@<server-ip>
   docker ps -a  # Check for exited containers
   docker compose up -d  # Restart everything
   ```
3. If the server is unreachable, restart it from Tencent console
4. After restart, verify all Docker containers came back up

### Jenkins build failed

1. Check Jenkins console output for the specific build
2. Common fixes:
   - Network issue → retry the build
   - Out of disk → clean up old Docker images: `docker system prune -a`
   - Maven/npm cache corrupted → clear `.m2` or `node_modules` cache

---

## 12. Service Dependency Map

When something is down, use this to understand the blast radius:

```
suppr-backend (API) depends on:
  ├── MySQL (user data, orders, points, sessions)
  ├── Redis (JWT validation, pub/sub, locks, counters)
  ├── MongoDB (academic articles, link caches)
  ├── Kafka (sends translation/research tasks)
  ├── COS (file storage and retrieval)
  ├── paper-search [External] (document search)
  ├── translation-service [External] (file translation)
  ├── deep-research [External] (research reports)
  └── gotenberg (PDF conversion)

suppr-consumer depends on:
  ├── MySQL (session status updates, point operations)
  ├── Redis (active task counters, stop signals, pub/sub)
  ├── Kafka (receives translation/research tasks)
  ├── COS (upload translated files)
  ├── translation-service [External] (does the actual translation)
  └── deep-research [External] (does the actual research)

suppr-fed (frontend) depends on:
  ├── suppr-backend (API calls)
  └── Tencent CDN (static asset delivery)

suppr-api (public API) depends on:
  ├── suppr-backend (proxies requests)
  └── Redis (rate limiting)

wilddata-module-pay depends on:
  ├── MySQL (order and payment records)
  └── Redis (notification locks)
```

If MySQL is down → everything is down.
If Redis is down → auth fails, SSE breaks, but read-only pages may still work.
If Kafka is down → new translations/research won't start, but existing API requests still work.
If an External AI service is down → only that specific feature is affected.
