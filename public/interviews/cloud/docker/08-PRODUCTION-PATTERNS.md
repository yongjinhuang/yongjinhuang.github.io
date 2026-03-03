# Production Patterns: Running Docker in the Real World

Running containers in production is fundamentally different from running them in development. In production, you need health checks, graceful shutdown, proper signal handling, logging, resource limits, and robust CI/CD pipelines. This chapter covers the patterns that keep containerized applications running reliably under real-world conditions.

---

## 1. Mental Model: Container Lifecycle in Production

```
Build --> Test --> Scan --> Push --> Deploy --> Run --> Monitor --> Stop/Replace

  Build:    Multi-stage Dockerfile, BuildKit cache
  Test:     Integration tests in containers
  Scan:     Vulnerability scan (Trivy, Grype)
  Push:     Tagged image to registry (never :latest)
  Deploy:   Pull image, create container with health check
  Run:      Health checks, resource limits, logging, restart policy
  Monitor:  Metrics, logs, alerts
  Stop:     Graceful shutdown (SIGTERM -> cleanup -> exit)
```

---

## 2. The PID 1 Problem

### 2.1 Why PID 1 Is Special

In Linux, PID 1 (the init process) has two special responsibilities:
1. **Signal handling:** PID 1 does NOT get default signal handlers. SIGTERM does not kill PID 1 by default -- the process must explicitly handle it.
2. **Zombie reaping:** PID 1 must call `wait()` on orphaned child processes (zombies). If it does not, zombie processes accumulate.

### 2.2 The Problem in Containers

```
Normal Linux system:
  PID 1: /sbin/init (systemd) -- handles signals, reaps zombies
  PID 1234: your-app

Docker container (shell form CMD):
  PID 1: /bin/sh -c "python app.py"    <-- sh is PID 1
  PID 7: python app.py

  Problem 1: docker stop sends SIGTERM to PID 1 (sh)
             sh does NOT forward SIGTERM to python
             After 10 seconds, Docker sends SIGKILL (ungraceful!)

  Problem 2: If python spawns children that die,
             sh does NOT reap them -> zombie processes

Docker container (exec form CMD):
  PID 1: python app.py                  <-- python is PID 1

  Problem 1: Python must explicitly handle SIGTERM
             (default signal handler not applied to PID 1)

  Problem 2: If python spawns children that die,
             python does NOT reap them -> zombie processes
             (Python is not designed to be an init system)
```

### 2.3 Solutions

**Solution 1: Use `--init` flag (tini)**

```bash
$ docker run --init myapp
# Docker injects "tini" as PID 1
# tini forwards signals to your app and reaps zombies

# Process tree:
# PID 1: /sbin/tini -- python app.py
# PID 7: python app.py
```

**Solution 2: Install tini in Dockerfile**

```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["python", "app.py"]
```

**Solution 3: Use dumb-init**

```dockerfile
RUN apt-get update && apt-get install -y dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["python", "app.py"]
```

**Solution 4: Handle signals in your application**

```python
# Python
import signal
import sys

def graceful_shutdown(signum, frame):
    print("Received SIGTERM, shutting down gracefully...")
    # Close database connections, finish pending requests, etc.
    sys.exit(0)

signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)
```

```javascript
// Node.js
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    // Close database connections
    process.exit(0);
  });
});
```

### 2.4 When You Need an Init Process

| Scenario | Need tini/dumb-init? |
|----------|---------------------|
| Single-process container (your app is PID 1) | Yes, if you spawn child processes |
| Your app handles SIGTERM and has no children | No (but recommended anyway) |
| Multi-process container (supervisord, etc.) | Use supervisord as PID 1 |
| Shell form CMD/ENTRYPOINT | Always fix this first (use exec form) |

---

## 3. Health Checks

### 3.1 Types of Health Checks

| Type | Purpose | Where Defined |
|------|---------|--------------|
| **Startup probe** | Is the app done initializing? | `start_period` in HEALTHCHECK |
| **Liveness check** | Is the app still alive? | HEALTHCHECK instruction |
| **Readiness check** | Can the app accept traffic? | Orchestrator (K8s), not Docker natively |

### 3.2 HEALTHCHECK Instruction

```dockerfile
# HTTP health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# TCP health check (no curl in image)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["node", "-e", "require('net').connect(8080, 'localhost', () => process.exit(0)).on('error', () => process.exit(1))"]

# Custom script
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["/healthcheck.sh"]
```

### 3.3 Health Check States

```
Container states:
  starting  --> interval checks during start_period (failures do not count)
  healthy   --> health check passes
  unhealthy --> health check fails (retries exceeded)

Timeline:
  0s        Container starts           [starting]
  0-30s     start_period               [starting] (failures ignored)
  30s       First real check           [starting -> healthy or starting]
  60s       Second check               [healthy] or [starting]
  ...
  After 3 consecutive failures         [unhealthy]
```

```bash
# Check container health status
$ docker inspect --format '{{.State.Health.Status}}' myapp
healthy

# See health check history
$ docker inspect --format '{{json .State.Health}}' myapp | python3 -m json.tool
{
    "Status": "healthy",
    "FailingStreak": 0,
    "Log": [
        {
            "Start": "2024-01-15T10:30:00Z",
            "End": "2024-01-15T10:30:01Z",
            "ExitCode": 0,
            "Output": "HTTP/1.1 200 OK\n..."
        }
    ]
}
```

### 3.4 Health Check Best Practices

```
DO:
  - Check the actual application (not just port open)
  - Include database connectivity check
  - Keep checks fast (<5 seconds)
  - Use start_period for apps with slow startup (JVM, large ML models)
  - Return meaningful output (aids debugging)

DO NOT:
  - Use curl to external services (makes health dependent on external)
  - Perform expensive operations in health checks
  - Set interval too low (adds load to the service)
  - Forget start_period for slow-starting apps
```

---

## 4. Graceful Shutdown

### 4.1 The Shutdown Sequence

```
docker stop myapp
     |
     v
SIGTERM sent to PID 1 in container
     |
     v
Application receives SIGTERM:
  1. Stop accepting new connections
  2. Finish processing in-flight requests
  3. Close database connections
  4. Flush logs / metrics
  5. Exit with code 0
     |
     v (if app does not exit within grace period)
SIGKILL sent (default: 10 seconds)
  - Forceful kill, no cleanup
  - Data may be lost
  - Connections dropped mid-request
```

### 4.2 Configuring Grace Period

```bash
# Default: 10 seconds
$ docker stop myapp

# Custom grace period: 30 seconds
$ docker stop -t 30 myapp

# In Dockerfile
STOPSIGNAL SIGQUIT    # nginx uses SIGQUIT for graceful shutdown

# In Compose
services:
  api:
    stop_grace_period: 30s
    stop_signal: SIGTERM
```

### 4.3 Graceful Shutdown Patterns by Framework

```python
# Python/Flask with Gunicorn
# Gunicorn handles SIGTERM:
# 1. Stops accepting new connections
# 2. Waits for workers to finish (--graceful-timeout)
# 3. Sends SIGTERM to workers after timeout
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--graceful-timeout", "30", "app:app"]
```

```javascript
// Node.js/Express
const server = app.listen(3000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  server.close(() => {
    console.log('HTTP server closed. Closing DB connections...');
    db.end(() => {
      console.log('DB connections closed. Exiting.');
      process.exit(0);
    });
  });
  // Force shutdown after 25 seconds (leave 5s buffer before SIGKILL)
  setTimeout(() => process.exit(1), 25000);
});
```

```nginx
# Nginx uses SIGQUIT for graceful shutdown
# (finishes serving active connections, then exits)
STOPSIGNAL SIGQUIT
```

---

## 5. Logging

### 5.1 The 12-Factor Approach

Containers should write logs to stdout/stderr. The container runtime (Docker) captures these streams and routes them to the configured logging driver.

```bash
# View logs
$ docker logs myapp
$ docker logs -f myapp          # follow (tail -f)
$ docker logs --since 1h myapp  # last hour
$ docker logs --tail 100 myapp  # last 100 lines
$ docker logs -t myapp          # with timestamps
```

### 5.2 Logging Drivers

```bash
# Check current logging driver
$ docker info --format '{{.LoggingDriver}}'
json-file

# Available drivers:
# json-file   - default, writes JSON to /var/lib/docker/containers/<id>/<id>-json.log
# syslog      - sends to syslog daemon
# journald    - sends to systemd journal
# fluentd     - sends to Fluentd
# awslogs     - sends to CloudWatch Logs
# gcplogs     - sends to Google Cloud Logging
# local       - optimized local storage (binary format, faster than json-file)
# none        - no logging (docker logs will not work)
```

### 5.3 Log Rotation (Critical in Production)

Without log rotation, container logs grow unbounded and fill the disk:

```bash
# Per container:
$ docker run --log-opt max-size=10m --log-opt max-file=3 myapp

# Global default in /etc/docker/daemon.json:
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```yaml
# In Compose:
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### 5.4 Structured Logging

```
BAD: Unstructured log
[2024-01-15 10:30:00] ERROR: Failed to process order 12345

GOOD: Structured JSON log
{"timestamp":"2024-01-15T10:30:00Z","level":"error","msg":"Failed to process order","order_id":"12345","error":"payment declined","request_id":"abc-123"}
```

Structured logs are parseable by log aggregators (ELK, Loki, CloudWatch) and enable filtering, alerting, and dashboards.

### 5.5 Centralized Logging Architecture

```
Containers (stdout/stderr)
  |
  v
Docker logging driver (json-file / fluentd / awslogs)
  |
  v
Log aggregator (Fluentd / Fluent Bit / Logstash / Vector)
  |
  v
Storage + Search (Elasticsearch / Loki / CloudWatch)
  |
  v
Visualization (Kibana / Grafana / CloudWatch Console)
```

---

## 6. Resource Limits

### 6.1 Memory Limits

```bash
# Hard memory limit (OOM killed if exceeded)
$ docker run --memory=512m myapp

# Memory + swap limit
$ docker run --memory=512m --memory-swap=1g myapp
# Container can use 512MB RAM + 512MB swap (1g total - 512m RAM)

# Memory reservation (soft limit)
$ docker run --memory=512m --memory-reservation=256m myapp
# Docker tries to keep container at 256MB but allows up to 512MB
```

### 6.2 OOM Killer Behavior

```
Container exceeds memory limit:
  1. Kernel tries to reclaim memory (page cache, etc.)
  2. If still over limit, OOM killer kills a process in the cgroup
  3. Usually kills the main application process (PID 1)
  4. Container exits with code 137 (128 + 9 = SIGKILL)

$ docker inspect --format '{{.State.OOMKilled}}' myapp
true

$ docker inspect --format '{{.State.ExitCode}}' myapp
137
```

### 6.3 CPU Limits

```bash
# Hard CPU limit (1.5 CPUs)
$ docker run --cpus=1.5 myapp
# Container gets at most 150ms of CPU time per 100ms period

# CPU shares (relative weight, only matters during contention)
$ docker run --cpu-shares=512 myapp    # half of default (1024)

# Pin to specific CPU cores
$ docker run --cpuset-cpus="0,2" myapp  # only use CPUs 0 and 2
```

### 6.4 PID Limits

```bash
# Prevent fork bombs
$ docker run --pids-limit=100 myapp
# Container can have at most 100 processes
```

### 6.5 Resource Limits in Compose

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
          pids: 100
        reservations:
          cpus: "0.25"
          memory: 128M
```

---

## 7. Restart Policies

```bash
# no: never restart (default)
$ docker run --restart=no myapp

# on-failure: restart only on non-zero exit code
$ docker run --restart=on-failure:5 myapp    # max 5 retries

# always: always restart (even after docker stop + docker daemon restart)
$ docker run --restart=always myapp

# unless-stopped: like always, but respects docker stop
$ docker run --restart=unless-stopped myapp
```

| Policy | On crash | On docker stop | On daemon restart |
|--------|----------|---------------|-------------------|
| `no` | No restart | Stays stopped | Stays stopped |
| `on-failure[:N]` | Restart (up to N times) | Stays stopped | Restarts |
| `always` | Restart | Restarts | Restarts |
| `unless-stopped` | Restart | Stays stopped | Stays stopped |

**Production recommendation:** Use `unless-stopped` for services and `on-failure` for batch jobs.

---

## 8. CI/CD with Docker

### 8.1 Image Tagging Strategy

```bash
# BAD: mutable tags
$ docker push myapp:latest          # what version is this?
$ docker push myapp:stable          # changed without warning

# GOOD: immutable tags
$ docker push myapp:v1.2.3          # semantic version
$ docker push myapp:abc123f         # git SHA
$ docker push myapp:v1.2.3-abc123f  # both

# BEST: digest for deployment
$ docker pull myapp@sha256:abc...   # immutable, verifiable
```

| Tag Pattern | Use Case | Mutable? |
|-------------|----------|----------|
| `latest` | Development only, never production | Yes |
| `v1.2.3` | Releases | Should not change |
| `abc123f` | Git SHA, CI builds | No |
| `v1.2.3-abc123f` | Release + commit | No |
| `sha256:abc...` | Production deployment | No (by definition) |

### 8.2 Multi-Stage CI Pipeline

```
+--------+     +--------+     +--------+     +--------+     +--------+
| Build  | --> | Test   | --> | Scan   | --> | Push   | --> | Deploy |
+--------+     +--------+     +--------+     +--------+     +--------+
  Dockerfile     Integration    Trivy/Grype    Registry      Pull &
  multi-stage    tests in       CVE check      with tags     Run
  build          containers                    + digest
```

```yaml
# GitHub Actions example
name: CI/CD Pipeline
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          target: production
          load: true
          tags: myapp:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run tests
        run: |
          docker compose -f docker-compose.test.yml up \
            --abort-on-container-exit --exit-code-from test

      - name: Scan for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          exit-code: 1
          severity: CRITICAL,HIGH

      - name: Push to registry
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            myregistry/myapp:${{ github.sha }}
            myregistry/myapp:latest
```

### 8.3 Docker-in-Docker vs Docker-outside-of-Docker

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **DinD** (Docker-in-Docker) | Run dockerd inside a container | Full isolation, clean environment | Requires --privileged, storage overhead |
| **DooD** (Docker-outside-of-Docker) | Mount host's Docker socket | Simple, uses host cache | Shared daemon, security risk |
| **Kaniko** | Build without Docker daemon | No daemon needed, secure | Slower, no run/test |
| **Buildah** | Build OCI images without daemon | Rootless, no daemon | Different tool/syntax |

```bash
# DinD (used by GitLab CI, GitHub Actions)
$ docker run --privileged docker:dind

# DooD (mount host socket)
$ docker run -v /var/run/docker.sock:/var/run/docker.sock docker

# Kaniko (no daemon, good for Kubernetes CI)
$ docker run gcr.io/kaniko-project/executor \
    --context=git://github.com/user/repo \
    --destination=myregistry/myapp:latest
```

### 8.4 Build Caching in CI

```bash
# GitHub Actions Cache (via BuildKit)
$ docker buildx build \
    --cache-from type=gha \
    --cache-to type=gha,mode=max \
    --tag myapp:latest .

# Registry-based cache
$ docker buildx build \
    --cache-from type=registry,ref=myregistry/myapp:cache \
    --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
    --tag myapp:latest \
    --push .
```

---

## 9. Container Orchestration: When You Outgrow Single-Host Docker

| Signal | You Need Orchestration |
|--------|----------------------|
| Running on multiple hosts | Yes |
| Need automatic scaling | Yes |
| Need zero-downtime deployments | Yes |
| Need self-healing (restart on node failure) | Yes |
| Need service mesh / advanced networking | Yes |
| Single host, few containers | Maybe not |

| Orchestrator | Complexity | Use Case |
|-------------|-----------|----------|
| **Docker Compose** | Low | Single host, development, simple production |
| **Docker Swarm** | Medium | Simple multi-host, built into Docker |
| **Kubernetes** | High | Production multi-host, industry standard |
| **ECS/Fargate** | Medium | AWS-native, managed |
| **Cloud Run** | Low | Serverless containers (GCP) |
| **Azure Container Apps** | Low | Serverless containers (Azure) |

---

## 10. Production Checklist

### Image
- [ ] Minimal base image (Alpine, distroless, scratch)
- [ ] Multi-stage build (no build tools in production image)
- [ ] Non-root USER in Dockerfile
- [ ] No secrets in image (no ENV, ARG, or COPY of secrets)
- [ ] Vulnerability scan passes (no critical/high CVEs)
- [ ] Image signed and verified
- [ ] Pinned by digest (not mutable tag)
- [ ] .dockerignore excludes unnecessary files

### Runtime
- [ ] Health check defined (HEALTHCHECK or orchestrator probe)
- [ ] Graceful shutdown implemented (SIGTERM handler)
- [ ] PID 1 problem addressed (tini, dumb-init, or signal handler)
- [ ] Memory limit set (--memory)
- [ ] CPU limit set (--cpus)
- [ ] PID limit set (--pids-limit)
- [ ] Restart policy configured (unless-stopped or on-failure)
- [ ] Log rotation configured (max-size, max-file)

### Security
- [ ] No --privileged
- [ ] Capabilities dropped (--cap-drop=ALL, --cap-add only needed)
- [ ] No new privileges (--security-opt=no-new-privileges)
- [ ] Read-only root filesystem (--read-only + tmpfs)
- [ ] No Docker socket mounted
- [ ] Non-root user
- [ ] Seccomp profile applied (default or custom)

### Networking
- [ ] Only necessary ports published
- [ ] Ports bound to specific interface (not 0.0.0.0)
- [ ] User-defined networks (not default bridge)
- [ ] Backend networks marked internal

### Storage
- [ ] Named volumes for persistent data
- [ ] Volume backup strategy documented and tested
- [ ] No important data in container writable layer

---

## 11. Gotchas

### 11.1 Default Stop Timeout Is Only 10 Seconds

If your application needs more than 10 seconds for graceful shutdown (draining connections, flushing buffers), it will be SIGKILL'd. Always set `stop_grace_period` to match your application's shutdown needs.

### 11.2 Shell Form Breaks Signal Handling

`CMD python app.py` wraps in `/bin/sh -c`, making sh PID 1. SIGTERM goes to sh, not your app. Always use exec form: `CMD ["python", "app.py"]`.

### 11.3 Container Exit Code 137 = OOM Kill

Exit code 137 = 128 + 9 (SIGKILL). Usually means the container exceeded its memory limit. Check `docker inspect --format '{{.State.OOMKilled}}'`.

### 11.4 :latest Is Not Latest

The `latest` tag does not automatically point to the most recently pushed image. It is just a string tag that must be explicitly pushed. Using `latest` in production means you do not know what version is running.

### 11.5 Docker Logs Grow Forever by Default

Without `max-size` and `max-file` configuration, `json-file` logging driver writes unbounded. A busy service can fill a disk in hours.

### 11.6 No Readiness Check in Docker (Without Orchestrator)

Docker only has a single health check. There is no distinction between "alive but not ready" (liveness) and "ready to serve traffic" (readiness). This distinction exists in Kubernetes but not in standalone Docker. Use `depends_on` with `condition: service_healthy` in Compose as a workaround.

### 11.7 Resource Limits Require cgroups

If cgroups are not properly configured (e.g., in some minimal VMs or WSL1), memory and CPU limits are silently ignored. Always verify with `docker stats`.

### 11.8 JVM Does Not Respect Container Memory by Default (Pre-Java 10)

JVMs before Java 10 read `/proc/meminfo` (host memory) and set heap size based on that. A JVM in a container with `--memory=512m` on a 64GB host might try to use 16GB heap. Fix: Use Java 10+ with `-XX:+UseContainerSupport` (default) or explicitly set `-Xmx`.

### 11.9 Build Cache Is Not Shared Across CI Agents

Each CI agent has its own Docker cache. Without remote cache configuration (registry-based or GitHub Actions cache), every agent builds from scratch. This can double or triple your CI time.

### 11.10 Docker Compose deploy Key Ignored Without Swarm

The `deploy:` key (replicas, resources, restart_policy) is partially ignored in `docker compose up`. Some fields like `resources.limits` work, but `replicas` requires `--scale`. In Docker Swarm (`docker stack deploy`), all fields are honored.

---

## 12. Common Interview Questions

### Q1: "Your containerized app is being OOM-killed -- walk me through debugging it"

**Strong answer:**

First, confirm the OOM kill:
```bash
docker inspect --format '{{.State.OOMKilled}}' myapp   # true
docker inspect --format '{{.State.ExitCode}}' myapp     # 137
```

Then understand the memory usage pattern:
```bash
docker stats myapp --no-stream   # current usage vs limit
```

Check if the application has a memory leak by monitoring over time. Also check if the application is reading `/proc/meminfo` instead of respecting cgroup limits (common with JVMs before Java 10, Node.js, Python).

Common causes: (1) Memory leak in application code. (2) JVM heap sized based on host memory, not container limit -- fix with `-XX:+UseContainerSupport` or explicit `-Xmx`. (3) Container limit too low for the workload. (4) Page cache counted against limit -- read-heavy apps inflate memory usage because Linux counts file cache in the cgroup's memory.

Resolution: Fix the root cause (leak, JVM settings, etc.). If the limit is genuinely too low, increase it. Consider using `--memory-reservation` as a soft limit with a higher `--memory` hard limit for burst scenarios.

---

### Q2: "Explain the PID 1 problem in containers"

**Strong answer:**

In Linux, PID 1 has special behavior: it does not receive default signal handlers, and it is responsible for reaping zombie child processes.

In a container, your application becomes PID 1. This creates two problems: (1) If you use shell form (`CMD python app.py`), the shell (`/bin/sh`) becomes PID 1. When Docker sends SIGTERM during `docker stop`, the shell receives it but does NOT forward it to your application. After the 10-second grace period, Docker sends SIGKILL, killing your app ungracefully. (2) Even with exec form (`CMD ["python", "app.py"]`), if your app spawns child processes that die, those become zombies because most applications do not implement `wait()` for child processes.

The solution is to use a lightweight init process like tini or dumb-init as PID 1. These handle signal forwarding and zombie reaping. Docker has this built in with `--init`. Alternatively, you can handle SIGTERM explicitly in your application code and use exec form for CMD/ENTRYPOINT to ensure your app is PID 1 (not wrapped in sh).

---

### Q3: "How do you implement zero-downtime deployments with Docker?"

**Strong answer:**

Zero-downtime deployment requires: (1) running the new version alongside the old version, (2) health checking the new version, (3) shifting traffic, and (4) stopping the old version gracefully.

With Docker Compose and a reverse proxy (nginx/traefik): deploy the new version as a new container on a different port, wait for its health check to pass, update the reverse proxy configuration to point to the new container, then stop the old container with a sufficient grace period for in-flight requests.

With Docker Swarm: `docker service update --image myapp:v2` performs a rolling update by default -- starting new tasks, waiting for health checks, then stopping old tasks one at a time.

Key requirements: (1) Health checks must verify actual readiness (not just port open). (2) Graceful shutdown must drain in-flight requests before exiting. (3) The application must be stateless (or state must be external) so multiple versions can run simultaneously. (4) Database migrations must be backward-compatible (both old and new versions must work with the schema).

---

### Q4: "How do you handle logging for containerized applications?"

**Strong answer:**

The 12-Factor approach: applications write to stdout/stderr, and the infrastructure handles routing, storage, and search.

In Docker, the logging driver captures stdout/stderr and routes it. For production, I configure: (1) `json-file` driver with `max-size=10m` and `max-file=3` as the default (prevents disk exhaustion). (2) A log aggregator (Fluent Bit, Vector, or Logstash) that tails the Docker log files and forwards to centralized storage. (3) Structured JSON logging in the application so logs are parseable and searchable.

For AWS: use the `awslogs` driver to send directly to CloudWatch. For Kubernetes: stdout/stderr is automatically captured by the container runtime and available via `kubectl logs`. A DaemonSet (Fluent Bit) on each node forwards to Elasticsearch/Loki.

Critical production detail: always configure log rotation. Without it, a verbose application can fill a disk in hours. Also, never log secrets (tokens, passwords) -- sanitize log output and use request IDs for tracing instead of including sensitive data.

---

### Q5: "What is your image tagging strategy for production?"

**Strong answer:**

I use a combination of semantic versioning and git SHAs. Every CI build produces an image tagged with the git SHA (`myapp:abc123f`) for traceability. Release builds additionally get a semantic version tag (`myapp:v1.2.3`). The `latest` tag is only used in development, never in production.

For actual production deployments, I reference images by digest (`myapp@sha256:abc...`) because digests are immutable -- tags can be overwritten. This ensures that what was tested is exactly what gets deployed.

The tagging workflow: CI builds on every commit with git SHA tag. When a release is cut (git tag), CI also tags with the version number. The deployment pipeline references the digest from the CI artifact, not the tag. This gives you traceability (SHA to commit), human-readability (version tag), and immutability (digest).

I never use `latest` in production because it is ambiguous -- you cannot tell what version is running, you cannot roll back to a specific version, and different nodes might pull different images if `latest` changes between pulls.

---

## 13. Quick Reference

| Pattern | Implementation |
|---------|---------------|
| PID 1 init | `docker run --init` or `ENTRYPOINT ["/sbin/tini", "--"]` |
| Graceful shutdown | Handle SIGTERM in app + exec form CMD + sufficient stop timeout |
| Health check | `HEALTHCHECK CMD curl -f http://localhost/health` |
| Log rotation | `--log-opt max-size=10m --log-opt max-file=3` |
| Memory limit | `--memory=512m` |
| CPU limit | `--cpus=1.5` |
| PID limit | `--pids-limit=100` |
| Restart policy | `--restart=unless-stopped` |
| Non-root | `USER 1000:1000` in Dockerfile |
| Read-only | `--read-only --tmpfs /tmp` |
| Image tag | `v1.2.3` or `sha256:abc...` (never `latest`) |
| Stop timeout | `docker stop -t 30` or `stop_grace_period: 30s` |
