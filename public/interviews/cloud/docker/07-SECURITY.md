# Docker Security: Deep-Dive

Container security is the topic that separates senior engineers from everyone else in interviews. The fundamental tension is that containers share a kernel with the host, making the isolation boundary thinner than with VMs. Understanding the attack surface, Linux security primitives (capabilities, seccomp, AppArmor/SELinux, user namespaces), image supply chain security, and runtime hardening is essential for anyone running containers in production.

---

## 1. Mental Model: Defense in Depth

```
Layer 7: Image Supply Chain
  Trusted base images, vulnerability scanning, signed images, SBOMs

Layer 6: Build Security
  No secrets in layers, non-root USER, minimal packages, multi-stage

Layer 5: Runtime Configuration
  Read-only rootfs, no-new-privileges, resource limits, no privileged

Layer 4: Linux Security Modules
  AppArmor / SELinux profiles (mandatory access control)

Layer 3: Seccomp
  Syscall filtering (block dangerous syscalls)

Layer 2: Linux Capabilities
  Fine-grained privilege decomposition (drop ALL, add only needed)

Layer 1: Namespaces
  Process, network, mount, user isolation

Layer 0: Kernel
  Shared attack surface. If the kernel is compromised, game over.
```

**Key principle:** No single layer is sufficient. Container security requires defense in depth -- multiple overlapping security mechanisms so that if one layer fails, others contain the damage.

---

## 2. Attack Surface

### 2.1 The Shared Kernel Problem

```
VM Attack Surface:                 Container Attack Surface:
+------------------+               +------------------+
| App              |               | App              |
+------------------+               +------------------+
| Guest OS Kernel  |               |  (no guest OS)   |
+------------------+               +------------------+
| Hypervisor       |               | Host OS Kernel   | <-- shared!
+------------------+               +------------------+
| Host OS Kernel   |
+------------------+

VM: attacker must escape guest OS + hypervisor
Container: attacker must escape namespaces/cgroups (same kernel)
```

### 2.2 Common Attack Vectors

| Vector | Description | Mitigation |
|--------|-------------|------------|
| **Vulnerable base images** | Known CVEs in OS packages | Scan images, use minimal bases, update regularly |
| **Secrets in images** | API keys, passwords in layers | BuildKit secrets, never ENV/COPY secrets |
| **Privileged containers** | All security disabled | Never use --privileged |
| **Docker socket exposure** | Mount /var/run/docker.sock = root | Never mount in production |
| **Container escape** | Kernel exploit from inside container | Update kernel, use gVisor/Kata, user namespaces |
| **Malicious images** | Supply chain attack via base image | Use official images, verify signatures |
| **Resource exhaustion** | Fork bomb, memory exhaustion | Cgroup limits, pids-limit |
| **Network attack** | Container-to-container lateral movement | Network policies, segmentation |

---

## 3. Linux Capabilities

### 3.1 What Are Capabilities?

Linux capabilities decompose the monolithic root privilege into ~41 fine-grained permissions. Instead of being root (all privileges) or unprivileged (no special privileges), a process can have exactly the capabilities it needs.

### 3.2 Docker Default Capabilities

Docker grants 14 capabilities by default (out of ~41 total):

```
Default capabilities granted to containers:
  AUDIT_WRITE       Write to kernel audit log
  CHOWN             Change file ownership
  DAC_OVERRIDE      Bypass file permission checks
  FOWNER            Bypass permission checks on file owner
  FSETID            Set file SUID/SGID bits
  KILL              Send signals to any process
  MKNOD             Create special files
  NET_BIND_SERVICE  Bind to ports < 1024
  NET_RAW           Use raw sockets (ping, packet crafting)
  SETFCAP           Set file capabilities
  SETGID            Set GID
  SETPCAP           Set process capabilities
  SETUID            Set UID
  SYS_CHROOT        Use chroot
```

### 3.3 Dangerous Capabilities NOT Granted by Default

```
SYS_ADMIN          Mount filesystems, configure namespaces, many more
                   (the "new root" -- almost as dangerous as root)
SYS_PTRACE         Trace/debug other processes
SYS_MODULE         Load kernel modules
SYS_RAWIO          Raw I/O access (iopl, ioperm)
SYS_TIME           Set system clock
NET_ADMIN           Configure network interfaces, routing, firewall
SYS_BOOT           Reboot the system
DAC_READ_SEARCH    Bypass file read permission checks
```

### 3.4 Capability Management

```bash
# Drop ALL capabilities, add only what is needed
$ docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE nginx

# Check capabilities inside a container
$ docker run --rm alpine sh -c "cat /proc/1/status | grep Cap"
CapPrm: 00000000a80425fb   # permitted capabilities (bitmask)
CapEff: 00000000a80425fb   # effective capabilities
CapBnd: 00000000a80425fb   # bounding set

# Decode capability bitmask
$ capsh --decode=00000000a80425fb
0x00000000a80425fb=cap_chown,cap_dac_override,...

# In Docker Compose:
services:
  api:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### 3.5 Minimal Capabilities by Use Case

| Use Case | Required Capabilities |
|----------|----------------------|
| Web server (port 80/443) | `NET_BIND_SERVICE` |
| Web server (port > 1024) | None (drop ALL) |
| App writing to volumes | `CHOWN`, `FOWNER` (or fix permissions) |
| Network monitoring | `NET_RAW`, `NET_ADMIN` |
| Container that pings | `NET_RAW` |

---

## 4. Seccomp Profiles

### 4.1 What Is Seccomp?

Seccomp (Secure Computing Mode) filters which system calls a process can make. Docker applies a default seccomp profile that blocks ~44 dangerous syscalls out of 300+.

### 4.2 Default Docker Seccomp Profile

The default profile blocks these categories:

| Category | Blocked Syscalls | Why |
|----------|-----------------|-----|
| Kernel modules | `init_module`, `delete_module`, `finit_module` | Prevent kernel modification |
| System boot | `reboot`, `kexec_load`, `kexec_file_load` | Prevent host reboot |
| Mount operations | `mount`, `umount2` | Prevent filesystem manipulation |
| Process trace | `ptrace` (partially) | Prevent debugging other processes |
| Namespace creation | `unshare`, `setns` (partially) | Prevent creating new namespaces |
| Keyring | `add_key`, `keyctl`, `request_key` | Prevent kernel keyring access |
| Clock | `clock_settime`, `settimeofday` | Prevent time changes |
| Swap | `swapon`, `swapoff` | Prevent swap manipulation |

### 4.3 Custom Seccomp Profiles

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "fstat",
                "mmap", "mprotect", "munmap", "brk", "rt_sigaction",
                "rt_sigprocmask", "ioctl", "access", "pipe", "select",
                "sched_yield", "clone", "fork", "execve", "exit",
                "wait4", "kill", "getpid", "socket", "connect",
                "accept", "sendto", "recvfrom", "bind", "listen"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```bash
# Use custom profile
$ docker run --security-opt seccomp=custom-profile.json myapp

# Disable seccomp entirely (DANGEROUS -- do not do in production)
$ docker run --security-opt seccomp=unconfined myapp

# Generate a profile from a running container (using OCI/seccomp tools)
$ docker run --security-opt seccomp=audit.json myapp
# Then analyze audit logs to build a minimal profile
```

---

## 5. AppArmor and SELinux

### 5.1 AppArmor (Ubuntu/Debian)

AppArmor provides mandatory access control (MAC) -- even root cannot bypass these restrictions.

```bash
# Docker applies a default AppArmor profile (docker-default)
$ docker run --rm alpine cat /proc/1/attr/current
docker-default (enforce)

# Custom AppArmor profile
$ docker run --security-opt apparmor=my-custom-profile myapp

# Disable AppArmor (not recommended)
$ docker run --security-opt apparmor=unconfined myapp
```

The default `docker-default` profile:
- Denies mount operations
- Denies write to `/proc` and `/sys`
- Denies access to sensitive files
- Denies raw network access

### 5.2 SELinux (RHEL/Fedora)

```bash
# Check if SELinux is enabled
$ getenforce
Enforcing

# Docker applies SELinux labels automatically
# Container processes get: system_u:system_r:container_t:s0
# Container files get: system_u:object_r:container_file_t:s0

# Disable SELinux for a container (not recommended)
$ docker run --security-opt label=disable myapp

# Custom SELinux type
$ docker run --security-opt label=type:my_container_t myapp
```

---

## 6. User Namespaces

### 6.1 The Root Problem

Without user namespaces, UID 0 inside the container IS UID 0 on the host:

```bash
$ docker run --rm alpine id
uid=0(root) gid=0(root)

# If an attacker escapes the container, they are root on the host
```

### 6.2 User Namespace Remapping (userns-remap)

```bash
# Enable in Docker daemon config
# /etc/docker/daemon.json
{
  "userns-remap": "default"
}

# Docker creates subordinate UID/GID ranges
$ cat /etc/subuid
dockremap:100000:65536

$ cat /etc/subgid
dockremap:100000:65536

# Restart Docker
$ sudo systemctl restart docker

# Now container root maps to host UID 100000
$ docker run --rm alpine cat /proc/1/uid_map
         0     100000      65536
#        ^container  ^host
#        UID 0    -> UID 100000 (unprivileged on host!)
```

### 6.3 Trade-offs

| Benefit | Limitation |
|---------|-----------|
| Container root is unprivileged on host | Volume permission issues (files owned by mapped UID) |
| Container escape gives unprivileged access | Some images assume real root |
| Better multi-tenant isolation | Incompatible with `--privileged` |
| | Incompatible with `--net=host` |
| | Performance overhead on some operations |

---

## 7. Read-Only Containers

```bash
# Run with read-only root filesystem
$ docker run --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=100m \
    --tmpfs /var/run:rw,noexec,nosuid \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid \
    nginx

# In Compose:
services:
  api:
    read_only: true
    tmpfs:
      - /tmp:size=100M
      - /var/run
```

**Why read-only matters:** If an attacker gains code execution inside the container, they cannot:
- Write malware to the filesystem
- Modify application binaries
- Create reverse shells
- Install additional tools

The only writable paths are the explicitly mounted tmpfs (which live in RAM and disappear on restart) and volumes.

---

## 8. No-New-Privileges

```bash
$ docker run --security-opt=no-new-privileges:true myapp

# In Compose:
services:
  api:
    security_opt:
      - no-new-privileges:true
```

This prevents processes from gaining additional privileges via:
- SUID/SGID binaries (e.g., `/usr/bin/passwd`, `/bin/su`)
- Linux capabilities added at runtime
- Exec'd processes inheriting elevated privileges

---

## 9. Rootless Docker

### 9.1 What Is Rootless Docker?

Rootless Docker runs the entire Docker daemon and containers without root privileges. Both `dockerd` and containers run as a regular user.

```bash
# Install rootless Docker
$ dockerd-rootless-setuptool.sh install

# Start rootless daemon
$ systemctl --user start docker

# Verify
$ docker info | grep "Root Dir"
 Docker Root Dir: /home/user/.local/share/docker
```

### 9.2 How It Works

```
Traditional Docker:                    Rootless Docker:
  root: dockerd                          user: rootless-dockerd
  root: containerd                       user: containerd
  root: runc                             user: runc (in user namespace)
  root: container process                user: container process

  Kernel namespace: root                 Kernel namespace: user
  Real UID: 0                           Real UID: user (e.g., 1000)
```

### 9.3 Trade-offs

| Benefit | Limitation |
|---------|-----------|
| No root daemon = smaller attack surface | Cannot bind to ports < 1024 without extra config |
| User-level isolation | Some storage drivers not supported |
| No Docker socket as root | Overlay network requires extra setup |
| Better for multi-tenant hosts | Slightly more complex setup |
| | Performance may be slightly lower |

---

## 10. Image Security

### 10.1 Vulnerability Scanning

```bash
# Docker Scout (built into Docker Desktop)
$ docker scout cves nginx:latest
$ docker scout quickview nginx:latest

# Trivy (open-source, popular in CI)
$ trivy image nginx:latest
nginx:latest (debian 12.4)
Total: 123 (UNKNOWN: 0, LOW: 89, MEDIUM: 25, HIGH: 7, CRITICAL: 2)

# Grype (Anchore)
$ grype nginx:latest

# Snyk
$ snyk container test nginx:latest
```

### 10.2 Base Image Selection Strategy

```
Most Secure                                Least Secure
<-------------------------------------------------------------->
scratch     distroless    alpine    slim        full (debian)
0 packages  ~15 packages  ~40 pkg   ~100 pkg    ~400 packages
No shell    No shell      ash shell bash shell   bash + tools
No CVEs     ~0 CVEs       Few CVEs  Some CVEs   Many CVEs
```

| Base Image | Packages | Shell | Size | CVE Surface |
|-----------|----------|-------|------|-------------|
| `scratch` | 0 | No | 0MB | None |
| `gcr.io/distroless/static` | ~1 | No | ~2MB | Minimal |
| `gcr.io/distroless/cc` | ~5 | No | ~10MB | Minimal |
| `alpine:3.19` | ~40 | ash | ~7MB | Low |
| `debian:bookworm-slim` | ~100 | bash | ~74MB | Medium |
| `ubuntu:24.04` | ~200 | bash | ~77MB | Medium |
| `node:20` | ~400 | bash | ~900MB | High |

### 10.3 Image Scanning in CI

```yaml
# GitHub Actions example
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'myapp:${{ github.sha }}'
    format: 'sarif'
    output: 'trivy-results.sarif'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'             # Fail CI on critical/high CVEs
```

---

## 11. Secrets Management

### 11.1 What NOT To Do

```dockerfile
# NEVER: secrets in environment variables (visible in docker inspect)
ENV API_KEY=sk-proj-abc123

# NEVER: secrets in build args (visible in docker history)
ARG DATABASE_PASSWORD=secret123

# NEVER: copy secret files into the image
COPY credentials.json /app/
```

### 11.2 Build-Time Secrets (BuildKit)

```dockerfile
# syntax=docker/dockerfile:1

# Secret available only during this RUN, never in any layer
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --registry=https://private.npmjs.com

RUN --mount=type=secret,id=pip_conf,target=/etc/pip.conf \
    pip install -r requirements.txt
```

```bash
$ docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
```

### 11.3 Runtime Secrets

```bash
# Docker Swarm secrets (mounted as files)
$ echo "mysecretpassword" | docker secret create db_password -
$ docker service create --secret db_password myapp
# Secret available at /run/secrets/db_password inside the container

# Environment variables (acceptable for non-critical config, common in practice)
$ docker run -e DATABASE_URL="postgres://user:pass@host/db" myapp

# Volume-mounted secrets
$ docker run -v /path/to/secrets:/run/secrets:ro myapp

# Fetch from secrets manager at runtime (best for production)
# App reads from Vault, AWS Secrets Manager, etc. at startup
```

### 11.4 Docker Compose Secrets

```yaml
services:
  api:
    secrets:
      - db_password
      - api_key
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt    # from file
  api_key:
    environment: "API_KEY"              # from host env var
```

---

## 12. Docker Socket Security

### 12.1 Why Mounting the Docker Socket Is Dangerous

```bash
# This gives the container full control over Docker (and therefore the host)
$ docker run -v /var/run/docker.sock:/var/run/docker.sock myapp

# Inside the container, you can:
# 1. Create privileged containers
# 2. Mount the host filesystem
# 3. Access host network
# 4. Read secrets from other containers
# 5. Effectively become root on the host

# Example attack:
$ docker run -v /var/run/docker.sock:/var/run/docker.sock alpine \
    docker run --privileged -v /:/host alpine chroot /host
# Now you have a root shell on the host
```

### 12.2 Mitigations

```bash
# Option 1: Do not mount the socket (best)
# Use CI/CD tools that do not need direct Docker access

# Option 2: Use Docker socket proxy (TCP proxy that filters API calls)
# Example: Tecnativa/docker-socket-proxy
$ docker run -d \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e CONTAINERS=1 \
    -e IMAGES=0 \
    -e VOLUMES=0 \
    -e NETWORKS=0 \
    -p 2375:2375 \
    tecnativa/docker-socket-proxy

# Option 3: Use a read-only mount (limited protection)
$ docker run -v /var/run/docker.sock:/var/run/docker.sock:ro myapp
# Still dangerous -- many read operations expose sensitive info

# Option 4: Use rootless Docker (socket is owned by regular user)
```

---

## 13. Container Escape Techniques (Know the Defense)

Understanding how escapes work helps you defend against them. These are well-known techniques that attackers use:

### 13.1 Privileged Container Escape

```bash
# If container is --privileged, escape is trivial:
# Mount the host filesystem
$ mount /dev/sda1 /mnt
$ chroot /mnt
# You are now root on the host
```

**Defense:** Never use `--privileged`.

### 13.2 Docker Socket Escape

```bash
# If Docker socket is mounted:
$ docker run -v /:/host --privileged alpine chroot /host
```

**Defense:** Never mount the Docker socket in production.

### 13.3 Kernel Exploit

If a kernel vulnerability allows code execution from within a namespace, the attacker is root on the host (without user namespaces).

**Defense:** Keep kernel updated, use user namespaces, consider gVisor/Kata for high-security workloads.

### 13.4 Sensitive Mount Exploits

```bash
# /proc/sys is writable by default in some configurations
# Can modify kernel parameters
$ echo 1 > /proc/sys/kernel/core_pattern  # arbitrary write

# /proc/sysrq-trigger can crash the host
$ echo c > /proc/sysrq-trigger
```

**Defense:** Seccomp profile, read-only proc mounts, drop capabilities.

---

## 14. CIS Docker Benchmark

The CIS (Center for Internet Security) Docker Benchmark provides a comprehensive checklist. Key recommendations:

### 14.1 Host Configuration
- Keep Docker updated to latest stable version
- Audit Docker daemon activities
- Configure appropriate ulimits

### 14.2 Docker Daemon Configuration
- Restrict network traffic between containers (`--icc=false`)
- Set `--log-level` to at least `info`
- Allow Docker to make changes to iptables
- Enable user namespace support
- Use TLS for Docker daemon socket (if exposed over network)
- Set default ulimit as appropriate

### 14.3 Container Runtime
- Do not use `--privileged`
- Do not map privileged ports (< 1024) unnecessarily
- Open only needed ports
- Do not share host IPC, PID, or network namespace
- Limit memory and CPU
- Set read-only root filesystem
- Set `no-new-privileges`
- Use `--pids-limit` to prevent fork bombs

### 14.4 Images
- Create a user and use non-root USER
- Use COPY instead of ADD
- Do not store secrets in Dockerfiles
- Install verified packages only
- Scan for vulnerabilities before deployment
- Use fixed image tags (or digests), not `latest`

```bash
# Run the CIS Docker Benchmark audit
$ docker run --net host --pid host \
    --userns host --cap-add audit_control \
    -v /var/lib:/var/lib:ro \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v /etc:/etc:ro \
    docker/docker-bench-security
```

---

## 15. Production Hardening Checklist

```yaml
# Production-hardened Docker Compose service
services:
  api:
    image: myregistry/myapi:v1.2.3@sha256:abc...   # pinned by digest
    read_only: true                                   # read-only rootfs
    security_opt:
      - no-new-privileges:true                        # no privilege escalation
    cap_drop:
      - ALL                                           # drop all capabilities
    cap_add:
      - NET_BIND_SERVICE                              # add only what is needed
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=50M                # writable tmp
    user: "1000:1000"                                  # non-root
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
          pids: 100                                    # fork bomb protection
    healthcheck:
      test: ["CMD", "/healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - backend
    restart: unless-stopped
```

---

## 16. Gotchas

### 16.1 Default Docker = Root

Out of the box, Docker runs as root, containers run as root, and there are no user namespaces. This is the insecure default for backward compatibility. You must actively harden.

### 16.2 Environment Variables Are Not Secret

`docker inspect` shows all environment variables. Anyone with Docker access can read them. Use mounted files or secrets managers instead.

### 16.3 `--privileged` Disables Everything

Privileged mode disables seccomp, AppArmor, capability restrictions, and grants access to all devices. It is the equivalent of running directly on the host.

### 16.4 Image Tags Are Mutable

`nginx:latest` today might be different from `nginx:latest` tomorrow. For reproducible and secure deployments, pin by digest: `nginx@sha256:abc...`.

### 16.5 Alpine Has Its Own Vulnerabilities

Alpine's musl libc has different behavior than glibc. Some vulnerabilities exist in musl that do not exist in glibc and vice versa. Alpine is smaller but not inherently more secure.

### 16.6 Scanning Is Not Enough

Vulnerability scanners have false negatives. A clean scan does not mean the image is secure. Defense in depth (runtime restrictions, read-only fs, minimal capabilities) is still essential.

### 16.7 Host Docker Group = Root Access

Any user in the `docker` group can run containers with full host access. The `docker` group is effectively equivalent to root:

```bash
# Any docker group member can do this:
$ docker run -v /etc/shadow:/shadow alpine cat /shadow
# Reading the host's shadow file as a non-root user
```

### 16.8 Logs Can Contain Secrets

Application logs might contain secrets (tokens in headers, passwords in error messages). Configure log rotation and audit log content.

### 16.9 Inter-Container Communication Default

By default, all containers on the same bridge network can communicate. Use network segmentation and `internal: true` for backend networks.

### 16.10 Old Base Images Accumulate CVEs

If you build an image and do not rebuild regularly, the base image's CVEs accumulate. Automate weekly rebuilds of your images even if your code has not changed.

---

## 17. Common Interview Questions

### Q1: "How would you harden a Docker deployment for production?"

**Strong answer:**

I would apply defense in depth across multiple layers:

**Image level:** Use minimal base images (Alpine, distroless, or scratch for Go). Scan images for vulnerabilities in CI (Trivy or Grype) and fail the pipeline on critical/high CVEs. Pin images by digest for reproducibility. Never store secrets in images.

**Dockerfile level:** Always specify a non-root USER. Use multi-stage builds to exclude build tools. Use COPY, never ADD. Use BuildKit secret mounts for build-time credentials.

**Runtime level:** Drop all capabilities (`--cap-drop=ALL`) and add back only what is needed. Enable `no-new-privileges`. Run with `--read-only` root filesystem (use tmpfs for /tmp). Set memory and CPU limits to prevent resource exhaustion. Set `--pids-limit` to prevent fork bombs. Use the default seccomp profile (never unconfined).

**Network level:** Use user-defined bridge networks. Mark backend networks as internal. Never expose ports to 0.0.0.0 unless needed -- bind to specific interfaces. Never bypass the host firewall with Docker's iptables rules without understanding the implications.

**Operational level:** Never mount the Docker socket. Enable user namespace remapping if feasible. Keep Docker and the host kernel updated. Enable and monitor Docker daemon audit logs. Run the CIS Docker Benchmark regularly.

---

### Q2: "What are Linux capabilities and why do they matter for containers?"

**Strong answer:**

Capabilities decompose the monolithic root privilege into approximately 41 fine-grained permissions. Instead of a binary root/non-root model, a process can have exactly the privileges it needs.

Docker grants 14 capabilities by default, which is already a significant reduction from full root. But for maximum security, the best practice is `--cap-drop=ALL` followed by `--cap-add=<only-what-you-need>`. A web server that binds to port 80 only needs `NET_BIND_SERVICE`. An application on port 8080 needs no capabilities at all.

The most dangerous capability is `SYS_ADMIN` -- it is sometimes called "the new root" because it grants permissions to mount filesystems, create namespaces, and perform many operations that effectively bypass container isolation. Never add `SYS_ADMIN` unless you fully understand the implications.

---

### Q3: "What is the difference between seccomp, AppArmor, and capabilities?"

**Strong answer:**

These are three different Linux security mechanisms that work at different levels:

**Capabilities** control which privileged OPERATIONS a process can perform. They answer: "Can this process bind to port 80?" (NET_BIND_SERVICE) or "Can this process change file ownership?" (CHOWN). They are coarse-grained -- each capability covers a category of operations.

**Seccomp** controls which SYSTEM CALLS a process can make. It is more fine-grained than capabilities. Even if a process has a capability, seccomp can block the specific syscall that implements it. Docker's default seccomp profile blocks ~44 dangerous syscalls like `reboot`, `mount`, and `kexec_load`.

**AppArmor/SELinux** are mandatory access control (MAC) systems that control which FILES and RESOURCES a process can access. They define profiles that specify what paths a process can read/write, what network operations it can perform, and what other processes it can interact with. Even root cannot bypass MAC.

In Docker, all three work together: capabilities define what privileges the process has, seccomp filters what syscalls it can use to exercise those privileges, and AppArmor/SELinux restricts what resources it can access. Disabling any one of these weakens the overall security posture.

---

### Q4: "Why is mounting the Docker socket dangerous?"

**Strong answer:**

Mounting `/var/run/docker.sock` into a container gives that container full control over the Docker daemon. The Docker daemon runs as root and can create containers with any privileges. This means:

1. The container can create new privileged containers with access to the host filesystem.
2. It can read secrets from other containers.
3. It can mount the host's root filesystem and chroot into it, getting a root shell on the host.
4. It can modify or destroy any container, image, or volume.

Effectively, Docker socket access equals root access on the host. It is the most common privilege escalation vector in container environments.

Alternatives: (1) Use a Docker socket proxy that filters API calls (e.g., Tecnativa/docker-socket-proxy). (2) Use tools that do not need direct Docker access (kaniko for image building, buildah for building without a daemon). (3) If you must expose the socket, use it read-only with strict network policies, understanding that even read access exposes sensitive information.

---

### Q5: "How do user namespaces improve container security?"

**Strong answer:**

Without user namespaces, UID 0 inside the container is the same as UID 0 on the host. If an attacker escapes the container through a kernel vulnerability or misconfiguration, they are root on the host.

With user namespaces enabled (`userns-remap`), container UID 0 maps to a high, unprivileged UID on the host (e.g., 100000). A container escape now gives the attacker an unprivileged user account, significantly limiting the blast radius. They cannot read /etc/shadow, modify system files, or control the Docker daemon.

The trade-off is complexity: volume permissions become tricky because files created by container UID 0 are owned by host UID 100000. Some images that assume real root privileges may not work. And user namespaces are incompatible with `--privileged` and `--net=host`. Despite these limitations, user namespaces are one of the most impactful security improvements for multi-tenant container hosts.

---

### Q6: "How do you secure the container image supply chain?"

**Strong answer:**

Supply chain security covers the entire lifecycle from base image selection to runtime:

**Source:** Use official images from trusted registries (Docker Hub verified publishers, distroless from Google, Amazon ECR public). Pin base images by digest, not tag. Avoid random third-party images.

**Build:** Scan dependencies for known vulnerabilities before building. Use multi-stage builds to exclude build tools. Never embed secrets in images. Generate SBOMs (Software Bill of Materials) for every image.

**Scan:** Run vulnerability scanners (Trivy, Grype, Snyk) in CI on every build. Block deployment of images with critical CVEs. Scan running containers periodically because new CVEs are discovered after deployment.

**Sign:** Sign images with cosign or Docker Content Trust. Enforce signature verification in deployment pipelines so only signed images can be deployed.

**Runtime:** Use admission controllers (in Kubernetes: OPA Gatekeeper, Kyverno) to enforce that only images from approved registries, with valid signatures, and recent scan results can run. Automate weekly rebuilds of images to pick up base image security patches.

---

## 18. Quick Reference

| Security Feature | Command / Config |
|------------------|-----------------|
| Drop all capabilities | `--cap-drop=ALL` |
| Add specific capability | `--cap-add=NET_BIND_SERVICE` |
| Read-only filesystem | `--read-only` |
| No new privileges | `--security-opt=no-new-privileges:true` |
| Custom seccomp | `--security-opt seccomp=profile.json` |
| Disable AppArmor | `--security-opt apparmor=unconfined` |
| User namespace remap | `/etc/docker/daemon.json: {"userns-remap": "default"}` |
| Non-root user | `USER 1000:1000` in Dockerfile |
| Memory limit | `--memory=512m` |
| PID limit | `--pids-limit=100` |
| Scan with Trivy | `trivy image myapp:latest` |
| Sign with cosign | `cosign sign --key key myregistry/myapp:v1` |
| CIS Benchmark audit | `docker run docker/docker-bench-security` |
| Rootless Docker | `dockerd-rootless-setuptool.sh install` |
