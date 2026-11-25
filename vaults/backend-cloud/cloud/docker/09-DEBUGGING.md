# Docker Debugging & Troubleshooting: Deep-Dive

Debugging containers is what separates engineers who have run Docker in production from those who have only followed tutorials. Containers add layers of abstraction over processes, networking, and storage, making traditional debugging harder. But containers also provide powerful inspection tools. Knowing exactly which tool to use and when is the skill that impresses interviewers and saves production incidents.

---

## 1. Mental Model: Debugging Layers

```
Problem occurs. Which layer?

+----------------------------------------------------------+
| Layer 5: Application Logic                                |
|   Tools: docker logs, docker exec, application metrics    |
+----------------------------------------------------------+
| Layer 4: Container Configuration                          |
|   Tools: docker inspect, docker diff, docker top          |
+----------------------------------------------------------+
| Layer 3: Networking                                       |
|   Tools: docker network inspect, nsenter, tcpdump         |
+----------------------------------------------------------+
| Layer 2: Storage / Filesystem                             |
|   Tools: docker diff, docker cp, volume inspect           |
+----------------------------------------------------------+
| Layer 1: Resource Limits (cgroups)                        |
|   Tools: docker stats, /sys/fs/cgroup, dmesg              |
+----------------------------------------------------------+
| Layer 0: Docker Daemon / Host OS                          |
|   Tools: docker events, docker info, journalctl, dmesg    |
+----------------------------------------------------------+
```

**Debugging workflow:**

1. What is the symptom? (crash, slow, unreachable, wrong output)
2. Which layer is involved? (app, config, network, storage, resources, daemon)
3. Use the right tool for that layer
4. Fix and verify

---

## 2. docker logs

The first tool for any container issue.

```bash
# View all logs
$ docker logs myapp

# Follow (tail -f equivalent)
$ docker logs -f myapp

# Last N lines
$ docker logs --tail 100 myapp

# Logs since a time
$ docker logs --since "2024-01-15T10:00:00" myapp
$ docker logs --since 30m myapp    # last 30 minutes

# Logs with timestamps
$ docker logs -t myapp
2024-01-15T10:30:00.123456789Z Starting application...
2024-01-15T10:30:01.234567890Z Listening on port 3000

# Logs between two times
$ docker logs --since "2024-01-15T10:00:00" --until "2024-01-15T11:00:00" myapp

# Redirect to file for analysis
$ docker logs myapp > app.log 2>&1

# Compose: logs across services
$ docker compose logs
$ docker compose logs -f api worker
$ docker compose logs --since 10m api
```

**Common patterns:**

```bash
# Find errors
$ docker logs myapp 2>&1 | grep -i error

# Count occurrences
$ docker logs myapp 2>&1 | grep -c "connection refused"

# Watch for specific pattern
$ docker logs -f myapp 2>&1 | grep --line-buffered "timeout"
```

---

## 3. docker exec

Run commands inside a running container. The Swiss Army knife of container debugging.

```bash
# Interactive shell
$ docker exec -it myapp /bin/sh        # Alpine (ash shell)
$ docker exec -it myapp /bin/bash      # Debian/Ubuntu
$ docker exec -it myapp sh             # auto-detect

# Run a specific command
$ docker exec myapp cat /etc/hosts
$ docker exec myapp env                 # see environment variables
$ docker exec myapp ps aux              # see running processes
$ docker exec myapp ls -la /app/        # check filesystem

# As a specific user
$ docker exec -u root myapp whoami
$ docker exec -u 1000:1000 myapp id

# With environment variables
$ docker exec -e DEBUG=true myapp python debug_script.py

# Non-interactive (for scripting)
$ docker exec myapp cat /proc/1/status | grep VmRSS
```

**When exec is not available (no shell in container):**

```bash
# If the container has no shell (distroless, scratch):

# Method 1: Copy a static binary in
$ docker cp /usr/bin/busybox myapp:/tmp/
$ docker exec myapp /tmp/busybox sh

# Method 2: Use a debug container sharing the same namespaces
$ docker run --rm -it \
    --pid=container:myapp \
    --net=container:myapp \
    nicolaka/netshoot

# Method 3: docker debug (Docker Desktop, experimental)
$ docker debug myapp
```

---

## 4. docker inspect

The JSON encyclopedia of a container. Contains EVERYTHING about its configuration and state.

```bash
# Full JSON output
$ docker inspect myapp

# Extract specific fields with Go templates:

# Container state
$ docker inspect --format '{{.State.Status}}' myapp
running

$ docker inspect --format '{{.State.ExitCode}}' myapp
0

$ docker inspect --format '{{.State.OOMKilled}}' myapp
false

# IP address
$ docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' myapp
172.18.0.2

# Port mappings
$ docker inspect --format '{{json .NetworkSettings.Ports}}' myapp | python3 -m json.tool

# Environment variables
$ docker inspect --format '{{json .Config.Env}}' myapp | python3 -m json.tool

# Mounts
$ docker inspect --format '{{json .Mounts}}' myapp | python3 -m json.tool

# Health check status
$ docker inspect --format '{{json .State.Health}}' myapp | python3 -m json.tool

# Restart count
$ docker inspect --format '{{.RestartCount}}' myapp

# Started at / finished at
$ docker inspect --format '{{.State.StartedAt}}' myapp
$ docker inspect --format '{{.State.FinishedAt}}' myapp

# Container's PID on the host
$ docker inspect --format '{{.State.Pid}}' myapp
12345

# Image ID
$ docker inspect --format '{{.Image}}' myapp

# Command
$ docker inspect --format '{{json .Config.Cmd}}' myapp
$ docker inspect --format '{{json .Config.Entrypoint}}' myapp
```

---

## 5. docker stats

Real-time resource monitoring (like `top` for containers).

```bash
# All running containers
$ docker stats
CONTAINER   CPU %   MEM USAGE / LIMIT   MEM %   NET I/O        BLOCK I/O      PIDS
myapp       2.45%   128.5MiB / 512MiB   25.10%  1.2MB / 450kB  12MB / 0B      15
mydb        5.12%   256MiB / 1GiB       25.00%  800kB / 1.1MB  45MB / 12MB    42

# Single container, no streaming (snapshot)
$ docker stats --no-stream myapp

# Formatted output
$ docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# In Compose
$ docker compose stats
```

**What the columns mean:**

| Column    | Description                  | Notes                              |
| --------- | ---------------------------- | ---------------------------------- |
| CPU %     | CPU usage relative to host   | 200% = 2 full CPUs                 |
| MEM USAGE | Current memory (RSS + cache) | Includes page cache                |
| MEM LIMIT | Memory limit (cgroup)        | Unlimited if not set               |
| MEM %     | Usage / Limit                | Watch for approaching 100%         |
| NET I/O   | Network traffic (in / out)   | Since container start              |
| BLOCK I/O | Disk reads / writes          | Since container start              |
| PIDS      | Number of processes          | Watch for growth (fork bomb, leak) |

---

## 6. docker events

Stream real-time events from the Docker daemon.

```bash
# Stream all events
$ docker events

# Filter by type
$ docker events --filter type=container
$ docker events --filter type=image
$ docker events --filter type=volume
$ docker events --filter type=network

# Filter by event
$ docker events --filter event=start
$ docker events --filter event=die
$ docker events --filter event=oom

# Filter by container
$ docker events --filter container=myapp

# Time range
$ docker events --since '2024-01-15T10:00:00' --until '2024-01-15T11:00:00'

# Formatted output
$ docker events --format '{{.Time}} {{.Type}} {{.Action}} {{.Actor.Attributes.name}}'
```

**Common events to watch for:**

```
container start    - container started
container die      - container exited (check exitCode attribute)
container oom      - container OOM killed
container kill     - container received signal
container health_status: healthy    - health check passed
container health_status: unhealthy  - health check failed
```

---

## 7. docker diff

Show filesystem changes in a running container compared to its image.

```bash
$ docker diff myapp
C /tmp                  # Changed
A /tmp/session.dat      # Added
A /var/log/app.log      # Added
C /etc/hosts            # Changed (Docker modifies this)
D /etc/motd             # Deleted

# C = Changed
# A = Added
# D = Deleted
```

Useful for: understanding what a container has written, debugging unexpected file changes, verifying read-only behavior.

---

## 8. nsenter: Enter Container Namespaces

nsenter lets you run commands in a container's namespaces from the host, without requiring tools inside the container.

```bash
# Get the container's PID
$ PID=$(docker inspect --format '{{.State.Pid}}' myapp)

# Enter all namespaces
$ nsenter -t $PID -m -u -i -n -p -- /bin/sh

# Enter specific namespaces:
# Network namespace only (for network debugging)
$ nsenter -t $PID -n ip addr
$ nsenter -t $PID -n ss -tlnp
$ nsenter -t $PID -n ping 172.18.0.3

# PID namespace (see container's process tree from inside)
$ nsenter -t $PID -p ps aux

# Mount namespace (see container's filesystem)
$ nsenter -t $PID -m ls /app/

# Network debugging with host tools (not available inside container)
$ nsenter -t $PID -n tcpdump -i eth0 -nn port 80
$ nsenter -t $PID -n iptables -L -n
$ nsenter -t $PID -n netstat -tlnp
```

**Why nsenter over docker exec:** nsenter uses HOST tools, not container tools. If the container has no shell, curl, or networking tools, nsenter still works because you are running the host's binaries in the container's namespace.

---

## 9. strace in Containers

Trace system calls to understand what a process is doing at the kernel level.

```bash
# Method 1: strace inside the container (if available)
$ docker exec myapp strace -p 1 -f

# Method 2: strace from the host using nsenter
$ PID=$(docker inspect --format '{{.State.Pid}}' myapp)
$ strace -p $PID -f -e trace=network

# Method 3: Run container with SYS_PTRACE capability
$ docker run --cap-add=SYS_PTRACE myapp
$ docker exec myapp strace -p 1

# Common strace filters:
# Network calls:
$ strace -e trace=network -p $PID

# File operations:
$ strace -e trace=file -p $PID

# Memory operations:
$ strace -e trace=memory -p $PID

# With timing:
$ strace -T -p $PID    # time per syscall
$ strace -c -p $PID    # summary statistics
```

**Note:** strace requires the `SYS_PTRACE` capability, which is NOT in Docker's default set. Either add it (`--cap-add=SYS_PTRACE`) or use nsenter from the host.

---

## 10. Network Debugging

### 10.1 Connectivity Checklist

```bash
# 1. Is the container running?
$ docker ps | grep myapp

# 2. What network is it on?
$ docker inspect --format '{{json .NetworkSettings.Networks}}' myapp

# 3. What IP does it have?
$ docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' myapp

# 4. Is the port listening inside the container?
$ docker exec myapp ss -tlnp
# or
$ docker exec myapp netstat -tlnp

# 5. Can it reach the target?
$ docker exec myapp ping target-host
$ docker exec myapp curl http://target-host:8080/health
$ docker exec myapp nslookup target-host

# 6. Is DNS working?
$ docker exec myapp cat /etc/resolv.conf
$ docker exec myapp nslookup google.com

# 7. Packet capture
$ docker exec myapp tcpdump -i eth0 -nn port 8080
# Or from host:
$ nsenter -t $(docker inspect --format '{{.State.Pid}}' myapp) -n tcpdump -i eth0 -nn
```

### 10.2 Using netshoot for Network Debugging

```bash
# netshoot has ALL networking tools (tcpdump, curl, dig, nmap, iperf, etc.)

# Share network namespace with target container
$ docker run --rm -it --network container:myapp nicolaka/netshoot

# Now you have all tools in myapp's network namespace:
$ tcpdump -i eth0 -nn
$ curl http://localhost:8080/health
$ dig api.mynet
$ nmap -sT 172.18.0.3
$ iperf3 -c target-host
```

---

## 11. Common Problems and Solutions

### 11.1 Container Exits Immediately

```bash
# Symptom: container starts and immediately stops
$ docker ps -a
CONTAINER   STATUS                    COMMAND
myapp       Exited (0) 2 seconds ago  "python app.py"

# Diagnosis:
$ docker logs myapp
# Check for: errors, "file not found", import errors, config issues

# Common causes:
# 1. Foreground vs background: the process daemonizes and exits
#    Fix: Run in foreground mode (e.g., nginx -g "daemon off;")
#
# 2. Missing command: no CMD and no ENTRYPOINT
#    Fix: Define CMD in Dockerfile or pass command at runtime
#
# 3. Application error: crashes on startup
#    Fix: Check logs, fix the error
#
# 4. Missing file or dependency
#    Fix: Verify COPY in Dockerfile, check build context
```

### 11.2 Container Keeps Restarting (CrashLoopBackOff Pattern)

```bash
# Symptom: restart count keeps increasing
$ docker inspect --format '{{.RestartCount}}' myapp
47

# Diagnosis:
$ docker logs myapp          # check application errors
$ docker events --filter container=myapp  # see crash events
$ docker inspect --format '{{.State.ExitCode}}' myapp

# Exit codes:
#   0   = clean exit (but restart policy restarts it)
#   1   = application error
#   137 = SIGKILL (OOM or docker kill)
#   139 = SIGSEGV (segfault)
#   143 = SIGTERM (graceful stop)

# OOM check:
$ docker inspect --format '{{.State.OOMKilled}}' myapp
$ dmesg | grep -i oom | tail -5

# Fix: depends on exit code
#   1: fix application error
#   137: increase memory limit or fix memory leak
#   139: fix segfault (common with musl/Alpine + some libraries)
```

### 11.3 Port Already In Use

```bash
# Symptom:
# Error: driver failed programming external connectivity on endpoint:
# Bind for 0.0.0.0:8080 failed: port is already allocated

# Find what is using the port:
$ lsof -i :8080
$ ss -tlnp | grep 8080

# It might be:
# - Another container: docker ps | grep 8080
# - A host process: kill or reconfigure
# - A previous container that did not release the port: wait or docker rm -f
```

### 11.4 Permission Denied

```bash
# Symptom: permission denied errors in container

# Check who the container runs as:
$ docker exec myapp id
uid=1000(node) gid=1000(node)

# Check file permissions:
$ docker exec myapp ls -la /app/
drwxr-xr-x root root .
-rw-r--r-- root root config.json    # owned by root, container runs as node

# Fixes:
# 1. Fix in Dockerfile:
#    COPY --chown=node:node . /app/
#
# 2. Fix at runtime:
#    docker run -u root myapp chown -R 1000:1000 /app
#
# 3. Volume permissions:
#    docker run --rm -v myvolume:/data alpine chown -R 1000:1000 /data
```

### 11.5 DNS Resolution Fails

```bash
# Symptom: "could not resolve host"

# Check DNS configuration:
$ docker exec myapp cat /etc/resolv.conf

# Check if DNS server is reachable:
$ docker exec myapp ping 127.0.0.11

# Check container name resolution:
$ docker exec myapp nslookup targetname

# Common causes:
# 1. On default bridge network (no DNS): switch to user-defined network
# 2. Typo in container name
# 3. Target container on different network
# 4. Docker DNS not responding: restart Docker daemon
# 5. External DNS issues: check host DNS config
```

### 11.6 Image Pull Fails

```bash
# Symptom: "Error response from daemon: pull access denied"

# Check authentication:
$ docker login myregistry.com

# Check image name:
$ docker pull myregistry.com/myorg/myapp:v1.0    # correct path?

# Check network:
$ curl -v https://myregistry.com/v2/   # can you reach the registry?

# Rate limiting (Docker Hub):
# Anonymous: 100 pulls / 6 hours
# Authenticated: 200 pulls / 6 hours
# Check: docker info | grep "Username"
```

### 11.7 Build Cache Not Working

```bash
# Symptom: layers rebuild when they should be cached

# Diagnosis: check BuildKit output for CACHED vs non-cached steps

# Common causes:
# 1. .dockerignore missing: build context changes trigger COPY cache miss
# 2. Wrong layer order: COPY . before RUN npm install
# 3. ARG changes: different build args invalidate cache
# 4. Different builder: CI uses different machine than local
# 5. Docker pruned cache: docker builder prune

# Fix: reorder Dockerfile, add .dockerignore, use remote cache
```

### 11.8 Volume Permission Issues

```bash
# Symptom: app cannot write to mounted volume

# Check volume ownership:
$ docker run --rm -v myvolume:/data alpine ls -la /data
drwxr-xr-x root root .    # owned by root

# Container runs as UID 1000
# Cannot write to root-owned directory

# Fix: init container to set permissions
$ docker run --rm -v myvolume:/data alpine chown -R 1000:1000 /data
```

---

## 12. Performance Debugging

### 12.1 Slow Builds

```bash
# Check build context size
$ docker build . 2>&1 | head -1
Sending build context to Docker daemon  2.4GB    # TOO LARGE

# Fix: add .dockerignore

# Check which steps are slow
$ DOCKER_BUILDKIT=1 docker build . 2>&1 | grep "DONE\|CACHED"
# CACHED steps are fast
# DONE steps show timing

# Check for cache misses
# Look for steps that should be CACHED but are rebuilding
```

### 12.2 Large Images

```bash
# Check image size
$ docker images myapp
REPOSITORY  TAG     SIZE
myapp       latest  1.2GB    # too large

# Analyze layers
$ docker history myapp
$ dive myapp    # interactive layer analysis

# Common culprits:
# - Build tools in final image (use multi-stage)
# - Package manager cache (apt lists, npm cache, pip cache)
# - Large base image (use alpine or slim)
# - Unnecessary files (tests, docs, .git)
```

### 12.3 Slow Container Start

```bash
# Measure start time
$ time docker run --rm myapp echo "started"

# Common causes:
# - Large image pull time (use smaller images, local cache)
# - Slow entrypoint script (migrations, config generation)
# - Application initialization (JVM warmup, model loading)
# - Volume mount performance (macOS bind mounts)

# Diagnosis: add timing to entrypoint
$ docker logs myapp | head -20    # check startup sequence timing
```

### 12.4 High Memory Usage

```bash
# Current usage
$ docker stats --no-stream myapp
MEM USAGE: 480MiB / 512MiB    # close to limit!

# Detailed memory breakdown (inside container):
$ docker exec myapp cat /proc/1/status | grep -E "VmRSS|VmSize|VmPeak"
VmPeak:   524288 kB    # peak virtual memory
VmSize:   498000 kB    # current virtual memory
VmRSS:    450000 kB    # resident set size (actual RAM)

# Check for memory leaks:
# Monitor RSS over time
$ while true; do
    docker exec myapp cat /proc/1/status | grep VmRSS
    sleep 10
  done

# cgroup memory stats:
$ PID=$(docker inspect --format '{{.State.Pid}}' myapp)
$ cat /sys/fs/cgroup/system.slice/docker-$(docker inspect --format '{{.Id}}' myapp).scope/memory.stat
```

---

## 13. Core Dump Collection

```bash
# Enable core dumps inside the container
$ docker run --ulimit core=-1 \
    -v /tmp/cores:/cores \
    -e GOTRACEBACK=crash \
    myapp

# Set core pattern on host
$ echo "/cores/core.%e.%p.%t" | sudo tee /proc/sys/kernel/core_pattern

# After crash, core dump appears in /tmp/cores/
$ ls /tmp/cores/
core.myapp.12345.1705312200

# Analyze with gdb
$ docker run --rm -it -v /tmp/cores:/cores myapp-debug \
    gdb /app/myapp /cores/core.myapp.12345.1705312200
```

---

## 14. Docker Daemon Debugging

```bash
# Docker daemon logs
$ journalctl -u docker --since "1 hour ago"

# Docker daemon info
$ docker info
# Check: Storage Driver, Logging Driver, Cgroup Version, Kernel Version

# Docker system resource usage
$ docker system df
TYPE            TOTAL   ACTIVE  SIZE     RECLAIMABLE
Images          25      5       8.5GB    6.2GB (72%)
Containers      8       5       120MB    50MB (41%)
Local Volumes   12      5       2.1GB    800MB (38%)
Build Cache     40      0       3.2GB    3.2GB (100%)

# Clean up everything
$ docker system prune                    # dangling images + stopped containers
$ docker system prune -a --volumes       # EVERYTHING unused (careful!)

# Docker daemon debug mode
# /etc/docker/daemon.json
{
  "debug": true,
  "log-level": "debug"
}
$ sudo systemctl restart docker
```

---

## 15. Gotchas

### 15.1 docker logs Does Not Work with All Logging Drivers

If the logging driver is `syslog`, `fluentd`, or `awslogs`, `docker logs` returns nothing. The logs are sent directly to the external system. Only `json-file`, `local`, and `journald` support `docker logs`.

### 15.2 docker exec Adds Overhead

Each `docker exec` creates a new process in the container's namespaces. In high-frequency debugging, this adds load. For continuous monitoring, use `docker stats` or host-level tools instead.

### 15.3 Container Filesystem Changes Are Lost on Restart

Files created via `docker exec` (debug scripts, config changes) are lost when the container restarts. If you need persistent debug changes, use volumes or rebuild the image.

### 15.4 nsenter Requires Root on Host

nsenter typically requires root (or CAP_SYS_ADMIN) on the host to enter another process's namespaces. In managed environments, you may not have host access.

### 15.5 strace Requires SYS_PTRACE Capability

The default Docker seccomp profile allows ptrace between processes in the same container, but the SYS_PTRACE capability is not granted by default. Add it explicitly for strace debugging.

### 15.6 docker diff Shows Host-Modified Files

Docker modifies `/etc/hosts`, `/etc/resolv.conf`, and `/etc/hostname` for every container. These always show as "Changed" in `docker diff` and are not from your application.

### 15.7 Memory Stats Include Page Cache

`docker stats` MEM USAGE includes the Linux page cache, which is reclaimable. Your actual application memory usage might be much lower. Check `memory.stat` for the breakdown.

### 15.8 docker inspect Shows Secrets in Environment Variables

`docker inspect` displays ALL environment variables including any secrets passed with `-e`. Anyone with Docker access can read these. This is why secrets should be mounted as files, not environment variables.

### 15.9 Build Cache Debug

BuildKit does not show which layer caused a cache miss by default. Enable verbose output:

```bash
$ BUILDKIT_PROGRESS=plain docker build .
```

### 15.10 Detached Container Logs Disappear After Removal

`docker logs` only works for existing containers. Once `docker rm` removes the container, the logs are gone (unless using a persistent logging driver). For production, always configure centralized logging.

---

## 16. Common Interview Questions

### Q1: "A container keeps restarting -- how do you diagnose?"

**Strong answer:**

Systematic approach:

1. **Check restart count and exit code:**

   ```bash
   docker inspect --format '{{.RestartCount}} {{.State.ExitCode}}' myapp
   ```

   Exit code tells you why: 0 = clean exit, 1 = app error, 137 = OOM/SIGKILL, 139 = segfault.

2. **Check logs for the crash:**

   ```bash
   docker logs --tail 50 myapp
   ```

   Look for error messages, stack traces, missing configuration.

3. **Check if OOM killed:**

   ```bash
   docker inspect --format '{{.State.OOMKilled}}' myapp
   ```

   Also check `dmesg | grep -i oom`. If OOM, either the memory limit is too low or the app has a leak.

4. **Check events for the pattern:**

   ```bash
   docker events --filter container=myapp --since 30m
   ```

   Look for die/start cycles and whether OOM events precede them.

5. **Start the container interactively to reproduce:**

   ```bash
   docker run -it --entrypoint /bin/sh myapp
   ```

   Then run the application manually to see the error in real-time.

6. **Check resource limits:** `docker stats` to see if the container is hitting CPU or memory ceilings.

---

### Q2: "How do you debug a container that has no shell (distroless)?"

**Strong answer:**

Several approaches:

1. **Use `docker debug` (Docker Desktop feature):** `docker debug myapp` injects a debugging shell into the container.

2. **Use a sidecar debug container** sharing the same namespaces:

   ```bash
   docker run --rm -it --pid=container:myapp --net=container:myapp nicolaka/netshoot
   ```

   This gives you a full toolkit (bash, curl, tcpdump, strace) while operating in the same network and process namespace.

3. **Use nsenter from the host:**

   ```bash
   nsenter -t $(docker inspect --format '{{.State.Pid}}' myapp) -n -p -m /bin/bash
   ```

   This uses host-installed tools inside the container's namespaces.

4. **Examine from outside:** `docker logs`, `docker inspect`, `docker stats`, and `docker diff` all work without a shell inside the container.

5. **For builds:** Use a multi-stage Dockerfile with a debug target that includes a shell and debug tools. Build the debug target for debugging, production target for deployment.

---

### Q3: "A service inside a container is not reachable from outside. Walk me through debugging."

**Strong answer:**

Work from inside out:

1. **Is the container running?** `docker ps | grep myapp`

2. **Is the application listening?**

   ```bash
   docker exec myapp ss -tlnp
   ```

   Check that it is listening on `0.0.0.0:<port>`, not `127.0.0.1:<port>`. If bound to localhost, it only accepts connections from inside the container.

3. **Is the port published?**

   ```bash
   docker port myapp
   ```

   No output means no port mapping. Need `-p host:container`.

4. **Can you reach it from the host?**

   ```bash
   curl http://localhost:8080
   ```

5. **Check iptables rules:**

   ```bash
   sudo iptables -t nat -L DOCKER -n -v
   ```

   Look for the DNAT rule mapping host port to container IP.

6. **Check the docker-proxy:**

   ```bash
   ps aux | grep docker-proxy
   ```

7. **Check host firewall/security group:** UFW, firewalld, or cloud security groups might be blocking the port. Note that Docker bypasses UFW by default.

8. **Check the binding interface:** `docker run -p 127.0.0.1:8080:80` only allows connections from localhost. For external access, use `0.0.0.0` or omit the interface.

---

### Q4: "How do you investigate high memory usage in a container?"

**Strong answer:**

1. **Get current usage:** `docker stats --no-stream myapp` shows MEM USAGE vs LIMIT.

2. **Distinguish real usage from cache:** The memory number includes page cache. Check the actual breakdown:

   ```bash
   cat /sys/fs/cgroup/system.slice/docker-<id>.scope/memory.stat
   ```

   `anon` is application memory, `file` is page cache (reclaimable).

3. **Check for memory leaks:** Monitor RSS over time:

   ```bash
   docker exec myapp cat /proc/1/status | grep VmRSS
   ```

   If it grows continuously without leveling off, there is a leak.

4. **Application-level profiling:** Use language-specific tools:

   - Node.js: `--inspect` flag + Chrome DevTools heap snapshot
   - Python: `tracemalloc`, `memory_profiler`
   - Java: `jmap -heap`, JFR, VisualVM
   - Go: `pprof` heap profile

5. **Check JVM container support:** For Java apps, verify `UseContainerSupport` is enabled and heap size is appropriate for the container limit.

6. **Check for the `/proc/meminfo` problem:** If the application reads host memory instead of cgroup limits, it might allocate too much.

---

### Q5: "How do you troubleshoot slow Docker builds?"

**Strong answer:**

1. **Check build context size:** The "Sending build context" line tells you how much data is transferred. If it is hundreds of MB, create or fix `.dockerignore` to exclude `.git`, `node_modules`, test data, etc.

2. **Enable BuildKit verbose output:**

   ```bash
   BUILDKIT_PROGRESS=plain docker build .
   ```

   This shows timing for every step and whether each layer was cached.

3. **Identify cache misses:** Look for steps that should be cached but are rebuilding. Common cause: `COPY . .` early in the Dockerfile invalidates cache when any file changes. Reorder to copy dependency files first, install, then copy source.

4. **Use cache mounts:**

   ```dockerfile
   RUN --mount=type=cache,target=/root/.npm npm ci
   ```

   This persists the package manager cache between builds.

5. **Check for unnecessary layer creation:** Multiple `RUN apt-get` commands create multiple layers. Combine into one.

6. **Enable remote caching for CI:**

   ```bash
   docker buildx build --cache-from type=registry,ref=myapp:cache --cache-to type=registry,ref=myapp:cache .
   ```

7. **Parallelize stages:** Ensure independent stages are not waiting on each other. BuildKit parallelizes automatically if the dependency graph allows it.

---

## 17. Quick Reference

| Tool                   | When to Use                    | Key Flags                          |
| ---------------------- | ------------------------------ | ---------------------------------- |
| `docker logs`          | First step for any issue       | `-f` (follow), `--tail`, `--since` |
| `docker exec`          | Run commands inside container  | `-it` (interactive), `-u` (user)   |
| `docker inspect`       | Container config and state     | `--format '{{.State.Status}}'`     |
| `docker stats`         | Real-time resource monitoring  | `--no-stream`, `--format`          |
| `docker events`        | Daemon event stream            | `--filter`, `--since`              |
| `docker diff`          | Filesystem changes             | (no notable flags)                 |
| `docker top`           | Process list inside container  | (like `ps` inside container)       |
| `docker cp`            | Copy files in/out of container | `container:/path ./local`          |
| `nsenter`              | Enter container namespaces     | `-t PID -n -p -m`                  |
| `strace`               | System call tracing            | `-p PID -f -e trace=network`       |
| `tcpdump`              | Packet capture                 | `-i eth0 -nn port 80`              |
| `netshoot`             | Full network debug toolkit     | `--network container:target`       |
| `dive`                 | Image layer analysis           | Interactive TUI                    |
| `docker system df`     | Disk usage overview            | `-v` for details                   |
| `docker builder prune` | Clean build cache              | `-a` for all cache                 |
