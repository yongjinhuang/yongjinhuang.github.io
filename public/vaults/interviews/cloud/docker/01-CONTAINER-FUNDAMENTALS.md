# Container Fundamentals: What Containers Actually Are

The single most important thing to understand about containers: **a container is not a lightweight virtual machine.** A container is a regular Linux process (or group of processes) that the kernel has been told to isolate using namespaces, restrict using cgroups, and give a different filesystem view using a union mount. There is no hypervisor. There is no guest kernel. The container shares the host kernel. Everything else follows from this.

---

## 1. Mental Model: Containers vs VMs

```
Virtual Machine                          Container
+---------------------------+            +---------------------------+
| App A     | App B         |            | App A     | App B         |
+---------------------------+            +---------------------------+
| Bins/Libs | Bins/Libs     |            | Bins/Libs | Bins/Libs     |
+---------------------------+            +---------------------------+
| Guest OS  | Guest OS      |            |    (no guest OS)          |
+---------------------------+            +---------------------------+
|       Hypervisor          |            |   Container Runtime       |
+---------------------------+            +---------------------------+
|       Host OS Kernel      |            |   Host OS Kernel          |
+---------------------------+            +---------------------------+
|       Hardware             |            |       Hardware             |
+---------------------------+            +---------------------------+
```

| Aspect              | Virtual Machine                                  | Container                                      |
| ------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Isolation mechanism | Hardware virtualization (hypervisor)             | OS-level isolation (namespaces + cgroups)      |
| Kernel              | Each VM has its own kernel                       | All containers share the host kernel           |
| Boot time           | Seconds to minutes                               | Milliseconds                                   |
| Overhead            | Full OS memory + CPU for guest kernel            | Near-zero (just process overhead)              |
| Image size          | GBs (full OS)                                    | MBs (just app + dependencies)                  |
| Isolation strength  | Strong (separate kernel, separate address space) | Weaker (shared kernel = shared attack surface) |
| Use case            | Different OS, strong isolation                   | Same OS, fast deployment, high density         |

**Key insight for interviews:** VMs virtualize hardware. Containers virtualize the operating system. A VM guest cannot crash the host kernel. A container exploit that reaches the kernel affects all containers on that host.

---

## 2. Linux Namespaces: The Isolation Mechanism

Namespaces are the Linux kernel feature that make containers possible. A namespace wraps a global system resource in an abstraction that makes it appear to the process inside the namespace that it has its own isolated instance of the resource.

### 2.1 The Seven Namespace Types

| Namespace  | Flag              | Isolates                    | What the Container Sees                             |
| ---------- | ----------------- | --------------------------- | --------------------------------------------------- |
| **PID**    | `CLONE_NEWPID`    | Process IDs                 | Its own PID 1, cannot see host processes            |
| **NET**    | `CLONE_NEWNET`    | Network stack               | Own interfaces, IPs, routes, iptables, ports        |
| **MNT**    | `CLONE_NEWNS`     | Mount points                | Own filesystem tree (pivot_root or chroot)          |
| **UTS**    | `CLONE_NEWUTS`    | Hostname and domain         | Own hostname (what `hostname` returns)              |
| **IPC**    | `CLONE_NEWIPC`    | Inter-process communication | Own semaphores, message queues, shared memory       |
| **USER**   | `CLONE_NEWUSER`   | User and group IDs          | Can be root (UID 0) inside but unprivileged outside |
| **CGROUP** | `CLONE_NEWCGROUP` | Cgroup root directory       | Sees its cgroup as the root of the cgroup tree      |

### 2.2 PID Namespace Deep-Dive

The PID namespace gives a container its own process tree. The first process in the namespace gets PID 1. Processes inside the namespace cannot see or signal processes outside it.

```bash
# On the host: see all processes
$ ps aux | head -5
USER   PID  %CPU  COMMAND
root     1  0.0   /sbin/init
root     2  0.0   [kthreadd]
root   847  0.1   /usr/bin/dockerd
root  1234  0.0   nginx: master process

# Inside the container: only sees its own processes
$ docker exec nginx-container ps aux
USER   PID  %CPU  COMMAND
root     1  0.0   nginx: master process
root    31  0.0   nginx: worker process
root    32  0.0   nginx: worker process
```

**Key detail:** From the host, you CAN see container processes (they have host PIDs). From the container, you CANNOT see host processes. The isolation is one-directional.

```bash
# From the host, find the container's PID in the host namespace
$ docker inspect --format '{{.State.Pid}}' nginx-container
12345

# That PID 12345 on the host IS PID 1 inside the container
$ cat /proc/12345/status | grep NSpid
NSpid: 12345  1
#             ^host  ^container
```

### 2.3 NET Namespace Deep-Dive

Each container gets its own network namespace with its own:

- Network interfaces (eth0, lo)
- IP addresses
- Routing table
- iptables rules
- Port space (container A and container B can both listen on port 80)

```bash
# List network namespaces
$ lsns -t net
        NS TYPE NPROCS   PID USER    COMMAND
4026531840 net     123     1 root    /sbin/init          # host
4026532189 net       3 12345 root    nginx: master       # container

# Inspect a container's network namespace
$ nsenter -t 12345 -n ip addr
1: lo: <LOOPBACK,UP> inet 127.0.0.1/8
2: eth0@if45: <BROADCAST,UP> inet 172.17.0.2/16
```

### 2.4 MNT Namespace: The Filesystem View

The mount namespace gives each container its own view of the filesystem. Combined with `pivot_root` (or `chroot`), the container sees only its own root filesystem. It cannot access the host filesystem unless you explicitly mount something in.

```bash
# Container sees its own root filesystem
$ docker exec alpine ls /
bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var

# The host's / is completely invisible to the container
# (unless you bind-mounted it)
```

### 2.5 USER Namespace: UID Remapping

The USER namespace maps UIDs inside the container to different UIDs outside. This is critical for security:

```
Without user namespace:
  Container root (UID 0) == Host root (UID 0)
  If container escapes, attacker is root on host

With user namespace:
  Container root (UID 0) -> Host UID 100000 (unprivileged)
  If container escapes, attacker is unprivileged user
```

```bash
# Enable user namespace remapping in Docker
# /etc/docker/daemon.json
{
  "userns-remap": "default"
}

# Docker creates a subordinate UID range
$ cat /etc/subuid
dockremap:100000:65536

# Container's UID 0 maps to host UID 100000
```

**Why this is not the default:** User namespaces break some workloads (volume permissions, host networking, privileged operations). Docker trades security for compatibility here.

---

## 3. Cgroups: The Resource Limiting Mechanism

While namespaces provide isolation (what a process can see), cgroups (control groups) provide resource limits (what a process can use). Cgroups are a Linux kernel feature that organizes processes into hierarchical groups and applies resource limits to those groups.

### 3.1 What Cgroups Control

| Resource      | Cgroup Controller     | What It Limits                              |
| ------------- | --------------------- | ------------------------------------------- |
| **CPU**       | `cpu`, `cpuacct`      | CPU time, CPU shares, CPU pinning           |
| **Memory**    | `memory`              | RAM usage, swap, OOM behavior               |
| **Block I/O** | `blkio`               | Disk read/write bandwidth and IOPS          |
| **Network**   | `net_cls`, `net_prio` | Network traffic classification and priority |
| **PIDs**      | `pids`                | Maximum number of processes                 |
| **Devices**   | `devices`             | Which /dev devices are accessible           |
| **Hugepages** | `hugetlb`             | Huge page memory usage                      |
| **CPU sets**  | `cpuset`              | Which CPUs and memory nodes to use          |

### 3.2 Cgroups v1 vs v2

| Aspect              | Cgroups v1                                | Cgroups v2                                |
| ------------------- | ----------------------------------------- | ----------------------------------------- |
| Hierarchy           | Multiple hierarchies (one per controller) | Single unified hierarchy                  |
| Filesystem          | `/sys/fs/cgroup/<controller>/`            | `/sys/fs/cgroup/` (unified)               |
| Delegation          | Complex, error-prone                      | Clean delegation model                    |
| Pressure stall info | Not available                             | PSI (Pressure Stall Information) built-in |
| Memory accounting   | Per-process                               | Per-cgroup, more accurate                 |
| Default in Docker   | Pre-20.10                                 | 20.10+ on modern kernels                  |

```bash
# Check which cgroup version your system uses
$ stat -f -c %T /sys/fs/cgroup
cgroup2fs     # <-- v2
tmpfs         # <-- v1

# Or check the mount
$ mount | grep cgroup
cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)
```

### 3.3 How Docker Uses Cgroups

When you run `docker run --memory=512m --cpus=1.5 nginx`:

```bash
# Docker creates a cgroup for the container
# On cgroups v2:
$ cat /sys/fs/cgroup/system.slice/docker-<container-id>.scope/memory.max
536870912    # 512MB in bytes

$ cat /sys/fs/cgroup/system.slice/docker-<container-id>.scope/cpu.max
150000 100000    # 1.5 CPUs (150ms per 100ms period)
```

### 3.4 Memory Cgroup in Detail

```bash
# Run a container with memory limit
$ docker run -d --memory=256m --memory-swap=512m --name memtest nginx

# Inspect the limits
$ docker inspect memtest --format '{{.HostConfig.Memory}}'
268435456    # 256MB

# What happens when the limit is exceeded:
# 1. Kernel tries to reclaim memory (page cache, etc.)
# 2. If still over limit, OOM killer kills a process in the cgroup
# 3. Docker logs show: "container killed: OOM"

# Monitor memory usage
$ docker stats memtest --no-stream
CONTAINER   MEM USAGE / LIMIT   MEM %
memtest     12.5MiB / 256MiB    4.88%
```

### 3.5 CPU Cgroup in Detail

Docker offers several CPU limiting mechanisms:

```bash
# CPU shares (relative weight, default 1024)
$ docker run -d --cpu-shares=512 app1    # gets half as much as default
$ docker run -d --cpu-shares=2048 app2   # gets twice as much as default
# Shares only matter when there is contention

# CPU quota (hard limit)
$ docker run -d --cpus=1.5 app           # can use at most 1.5 CPUs
# Equivalent to: --cpu-period=100000 --cpu-quota=150000

# CPU pinning (specific cores)
$ docker run -d --cpuset-cpus="0,1" app  # only use CPUs 0 and 1
```

---

## 4. Union Filesystems: The Image Layer System

A union filesystem (UnionFS) merges multiple directories (layers) into a single coherent view. This is what makes Docker images efficient -- layers are shared and reused.

### 4.1 OverlayFS (Default on Modern Linux)

```
+------------------------------------------+
|           Merged (unified view)           |  <-- What the container sees
+------------------------------------------+
|           Upper (writable layer)          |  <-- Container's changes go here
+------------------------------------------+
|           Lower 3 (read-only)             |  <-- FROM python:3.12
|           Lower 2 (read-only)             |  <-- RUN pip install flask
|           Lower 1 (read-only)             |  <-- COPY app.py /app/
+------------------------------------------+
```

**How reads work:**

1. Look for the file in the upper (writable) layer
2. If not found, look in lower layers top-to-bottom
3. First match wins

**How writes work (copy-on-write):**

1. If modifying a file from a lower layer, copy it to the upper layer first
2. Then modify the copy in the upper layer
3. The lower layer file is untouched (it is read-only)
4. Future reads see the upper layer version (because it is checked first)

**How deletes work:**

1. Create a "whiteout" file in the upper layer
2. The whiteout hides the file in lower layers
3. The file appears deleted in the merged view but still exists in the lower layer

```bash
# See the overlay mount for a running container
$ docker inspect nginx --format '{{.GraphDriver.Data.MergedDir}}'
/var/lib/docker/overlay2/abc123.../merged

$ docker inspect nginx --format '{{.GraphDriver.Data.UpperDir}}'
/var/lib/docker/overlay2/abc123.../diff

$ docker inspect nginx --format '{{.GraphDriver.Data.LowerDir}}'
/var/lib/docker/overlay2/def456.../diff:/var/lib/docker/overlay2/ghi789.../diff
```

---

## 5. What Happens When You Run `docker run nginx`

This is a classic interview question. Here is the full lifecycle, step by step:

### Step 1: CLI to Daemon

```
docker CLI --REST API--> dockerd (Docker daemon)
```

The `docker` CLI sends an HTTP request to the Docker daemon (`dockerd`) via a Unix socket (`/var/run/docker.sock`) or TCP.

### Step 2: Image Pull (if not cached)

```
dockerd --> checks local image store
         --> image not found
         --> contacts registry (Docker Hub by default)
         --> pulls manifest (JSON describing the image)
         --> pulls each layer (tar.gz) that is not already cached
         --> unpacks layers into /var/lib/docker/overlay2/
```

### Step 3: Container Creation

```
dockerd --> containerd (via gRPC)
         --> containerd creates a container object
         --> prepares the OCI bundle:
             - config.json (OCI runtime spec: namespaces, cgroups, mounts)
             - rootfs (union mount of image layers + writable layer)
```

### Step 4: Container Start (runc)

```
containerd --> runc (OCI runtime)
            --> runc forks a new process
            --> calls clone() with namespace flags:
                CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS |
                CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWCGROUP
            --> sets up cgroups (memory limits, CPU limits)
            --> calls pivot_root() to switch to container rootfs
            --> drops capabilities
            --> applies seccomp profile (restricts syscalls)
            --> exec() the entrypoint (nginx in this case)
            --> runc exits (containerd-shim takes over as parent)
```

### Step 5: Runtime

```
containerd-shim
  └── nginx (PID 1 in container namespace)
      ├── nginx worker (PID 2)
      └── nginx worker (PID 3)
```

The `containerd-shim` is a small process that:

- Keeps STDIO open for the container
- Reports exit status back to containerd
- Allows containerd to restart without killing containers

### Full Architecture Diagram

```
+----------------------------------------------------------+
|                      docker CLI                           |
+----------------------------------------------------------+
          | REST API (/var/run/docker.sock)
          v
+----------------------------------------------------------+
|                      dockerd                              |
|  (image management, API, build, networking, volumes)      |
+----------------------------------------------------------+
          | gRPC
          v
+----------------------------------------------------------+
|                    containerd                              |
|  (container lifecycle, image distribution, snapshots)      |
+----------------------------------------------------------+
          | OCI runtime spec
          v
+----------------------------------------------------------+
|                       runc                                 |
|  (creates namespaces, cgroups, exec entrypoint, exits)     |
+----------------------------------------------------------+
          | clone() + exec()
          v
+----------------------------------------------------------+
|                containerd-shim                              |
|  (keeps container alive, reports exit status)               |
|     └── container process (nginx, python, etc.)            |
+----------------------------------------------------------+
```

---

## 6. OCI Runtime Specification

The Open Container Initiative (OCI) defines two specifications:

### 6.1 Runtime Spec

Defines how to run a container from an extracted filesystem bundle. The key file is `config.json`:

```json
{
  "ociVersion": "1.0.2",
  "process": {
    "terminal": false,
    "user": { "uid": 0, "gid": 0 },
    "args": ["nginx", "-g", "daemon off;"],
    "env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"],
    "cwd": "/"
  },
  "root": {
    "path": "rootfs",
    "readonly": false
  },
  "mounts": [
    { "destination": "/proc", "type": "proc", "source": "proc" },
    { "destination": "/dev", "type": "tmpfs", "source": "tmpfs" }
  ],
  "linux": {
    "namespaces": [
      { "type": "pid" },
      { "type": "network" },
      { "type": "ipc" },
      { "type": "uts" },
      { "type": "mount" },
      { "type": "cgroup" }
    ],
    "resources": {
      "memory": { "limit": 536870912 },
      "cpu": { "quota": 150000, "period": 100000 }
    },
    "seccomp": { ... }
  }
}
```

### 6.2 Image Spec

Defines the format of container images (manifests, layers, config). Covered in detail in [02-IMAGES-LAYERS.md](02-IMAGES-LAYERS.md).

---

## 7. Container Isolation Boundaries

Understanding what IS and IS NOT isolated is critical for security.

### 7.1 What IS Isolated

| Resource         | Mechanism               | Notes                                 |
| ---------------- | ----------------------- | ------------------------------------- |
| Process tree     | PID namespace           | Container sees only its own processes |
| Network stack    | NET namespace           | Own IPs, ports, routing               |
| Filesystem       | MNT namespace + overlay | Own root filesystem                   |
| Hostname         | UTS namespace           | Own hostname                          |
| IPC              | IPC namespace           | Own semaphores, message queues        |
| Users (optional) | USER namespace          | UID remapping (not default)           |
| Resource usage   | Cgroups                 | Memory, CPU, I/O limits               |

### 7.2 What is NOT Isolated

| Resource           | Risk                                                        | Mitigation                                           |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Kernel**         | All containers share one kernel. Kernel exploit = game over | Use gVisor or Kata Containers for stronger isolation |
| **/proc, /sys**    | Expose kernel parameters, hardware info                     | Mount read-only, use seccomp to block writes         |
| **System time**    | Container can change host clock with CAP_SYS_TIME           | Drop capability (dropped by default)                 |
| **Kernel modules** | Container can load modules with CAP_SYS_MODULE              | Drop capability (dropped by default)                 |
| **Kernel keyring** | Shared across all containers                                | Use user namespaces                                  |
| **Host network**   | `--net=host` exposes all host interfaces                    | Avoid unless necessary                               |
| **Docker socket**  | Mounting `/var/run/docker.sock` = root on host              | Never mount in production                            |
| **Syscalls**       | 300+ syscalls available, some dangerous                     | Seccomp profiles restrict available syscalls         |

### 7.3 Root in Container == Root on Host

Without user namespaces, root (UID 0) inside the container IS root (UID 0) on the host. The container boundaries are enforced by namespaces and cgroups, but:

```bash
# If you can escape the container (e.g., via a kernel exploit),
# you are root on the host.

# Proof: check the UID mapping
$ docker run --rm alpine cat /proc/1/uid_map
         0          0 4294967295
#        ^container  ^host
#        UID 0    -> UID 0 (same!)

# With user namespace remapping:
$ docker run --rm --userns=host alpine cat /proc/1/uid_map
         0     100000      65536
#        ^container  ^host
#        UID 0    -> UID 100000 (unprivileged!)
```

---

## 8. Build a "Container" From Scratch

This exercise demonstrates that containers are just Linux features. No Docker required.

### Step 1: Create a Root Filesystem

```bash
# Download and extract Alpine Linux rootfs
$ mkdir /tmp/container-root
$ cd /tmp/container-root
$ curl -O https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.0-x86_64.tar.gz
$ tar xzf alpine-minirootfs-3.19.0-x86_64.tar.gz
```

### Step 2: Create Namespaces with unshare

```bash
# unshare creates new namespaces and runs a command in them
$ sudo unshare \
    --pid \           # new PID namespace
    --mount \         # new mount namespace
    --uts \           # new UTS namespace (hostname)
    --ipc \           # new IPC namespace
    --fork \          # fork before exec (needed for PID namespace)
    --mount-proc \    # mount a new /proc for the PID namespace
    /bin/sh
```

### Step 3: Change Root Filesystem

```bash
# Inside the unshared shell:
$ hostname container-demo     # works because UTS namespace is isolated
$ pivot_root /tmp/container-root /tmp/container-root/.old_root
$ cd /
$ umount -l /.old_root
$ rmdir /.old_root

# Now we are in the container's filesystem
$ ls /
bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var

# We have PID isolation
$ ps aux
PID   USER     COMMAND
    1 root     /bin/sh
    4 root     ps aux
```

### Step 4: Apply Cgroup Limits

```bash
# In another terminal (as root on the host):
# Create a cgroup for our "container"
$ mkdir /sys/fs/cgroup/container-demo

# Set memory limit to 64MB
$ echo 67108864 > /sys/fs/cgroup/container-demo/memory.max

# Set CPU limit to 0.5 CPUs
$ echo "50000 100000" > /sys/fs/cgroup/container-demo/cpu.max

# Add the container's PID to the cgroup
$ echo <PID> > /sys/fs/cgroup/container-demo/cgroup.procs
```

**This is essentially what Docker does.** Docker just automates these steps, adds networking, image management, and a nice API on top.

---

## 9. Container Runtime Comparison

### 9.1 Docker Engine

```
docker CLI --> dockerd --> containerd --> runc
```

- Full-featured: build, push, pull, networking, volumes, compose
- Requires a daemon (dockerd) running as root
- Largest ecosystem and community
- Default for developer workstations

### 9.2 Podman

```
podman CLI --> conmon --> crun (or runc)
```

- Daemonless (no always-running daemon)
- Rootless by default (runs as non-root user)
- Docker CLI-compatible (alias docker=podman)
- Generates systemd unit files for container management
- Default on RHEL/Fedora

### 9.3 containerd

```
ctr/nerdctl --> containerd --> runc
```

- Graduated CNCF project
- Used as the runtime by Docker Engine (embedded) and Kubernetes
- `nerdctl` is the Docker-compatible CLI for containerd
- Lighter than full Docker Engine

### 9.4 CRI-O

```
kubelet --> CRI-O --> runc
```

- Purpose-built for Kubernetes (implements CRI)
- Does not support `docker build`, `docker push`, etc.
- Lighter footprint than containerd for pure Kubernetes use
- Used by OpenShift

### 9.5 Comparison Table

| Feature         | Docker               | Podman               | containerd    | CRI-O     |
| --------------- | -------------------- | -------------------- | ------------- | --------- |
| Daemon required | Yes                  | No                   | Yes           | Yes       |
| Rootless        | Supported            | Default              | Supported     | Supported |
| Build images    | Yes                  | Yes (Buildah)        | Yes (nerdctl) | No        |
| Compose         | Yes                  | Yes (podman-compose) | Yes (nerdctl) | No        |
| Kubernetes CRI  | No (uses containerd) | Yes (via CRI-O)      | Yes           | Yes       |
| Swarm mode      | Yes                  | No                   | No            | No        |
| Docker socket   | Yes                  | Emulated             | No            | No        |

---

## 10. Gotchas

### 10.1 "My Container is Using 6GB of Memory"

`docker stats` reports RSS + page cache. The page cache is reclaimable memory that the kernel uses for file caching. Your app might only be using 200MB, but if it reads lots of files, the page cache inflates the number. Check `memory.stat` for the real breakdown.

### 10.2 Container is Not Running After `docker run`

If the main process exits, the container stops. Containers are not services by default -- they are processes. If `docker run ubuntu` exits immediately, it is because `/bin/bash` has no TTY to attach to. Use `docker run -it ubuntu` for interactive use.

### 10.3 `--privileged` is a Footgun

`docker run --privileged` disables ALL security features: no seccomp, no AppArmor, full capabilities, access to all devices. It is essentially running on the host. Never use this in production. Even for Docker-in-Docker, there are better alternatives (rootless DinD, sysbox).

### 10.4 PID 1 Zombie Problem

In a container, PID 1 has a special responsibility: reaping zombie processes. Most applications (Node.js, Python, Java) do NOT handle this. If your app spawns child processes, zombies accumulate. Fix: use `--init` flag (adds tini as PID 1) or use a proper init system.

### 10.5 Host PID Visibility

From the HOST, you can see all container processes with `ps aux`. Container PID isolation only works from inside the container looking out. This means host monitoring tools (top, htop) see everything.

### 10.6 Kernel Version Matters

Since containers share the host kernel, you cannot run a container that requires kernel features not available on the host. You also cannot run a Linux container on a Windows kernel natively (Docker Desktop uses a Linux VM on Mac/Windows).

### 10.7 `/proc` Leaks Information

Containers mount `/proc` from the host kernel. While the PID namespace filters process information, other files in `/proc` (like `/proc/meminfo`, `/proc/cpuinfo`) show HOST information, not container-limited information. Applications that read `/proc/meminfo` to determine available memory will see the host's total RAM, not the cgroup limit. This breaks JVM memory auto-sizing, Python memory checks, etc.

### 10.8 Docker != containerd != OCI

Docker is a product. containerd is a runtime. OCI is a specification. Docker uses containerd, which uses runc (an OCI runtime). But you can use containerd without Docker, and you can use other OCI runtimes (crun, gVisor) instead of runc.

### 10.9 Time Namespace is NOT Used by Default

Containers share the host's system clock. If a container changes the time (with CAP_SYS_TIME), it affects the host. The TIME namespace exists in newer kernels but Docker does not use it by default.

### 10.10 Seccomp Is a Critical Layer

By default, Docker applies a seccomp profile that blocks ~44 dangerous syscalls (like `reboot`, `mount`, `kexec_load`). Running with `--security-opt seccomp=unconfined` removes this protection. Always know what your seccomp profile allows.

---

## 11. Common Interview Questions

### Q1: "Explain what happens when you run `docker run -p 8080:80 nginx`"

**Strong answer:**

1. The Docker CLI parses the command and sends a REST API request to the Docker daemon (`dockerd`) via the Unix socket.

2. `dockerd` checks if the `nginx` image exists locally. If not, it pulls from Docker Hub: fetches the manifest, then each layer that is not already cached, decompresses them into the content-addressable store under `/var/lib/docker/overlay2/`.

3. `dockerd` instructs `containerd` to create a container. containerd prepares an OCI bundle: a `config.json` specifying namespaces (PID, NET, MNT, UTS, IPC, CGROUP), cgroup limits, seccomp profile, capabilities, and mounts; plus a rootfs directory that is an overlay mount of the image layers plus a new writable layer.

4. containerd calls `runc` to start the container. runc forks a child process, calls `clone()` with namespace flags to create isolated namespaces, sets up cgroups, calls `pivot_root()` to change the root filesystem, drops capabilities, applies the seccomp profile, and then `exec()`s the nginx process. runc then exits, leaving `containerd-shim` as the parent.

5. For the `-p 8080:80` flag, Docker sets up a `docker-proxy` process listening on host port 8080, AND adds iptables DNAT rules to forward traffic from host:8080 to the container's IP on port 80. The container gets a veth pair connecting it to the `docker0` bridge.

6. nginx starts as PID 1 inside the container's PID namespace, listens on port 80 in the container's NET namespace, and is reachable from the host on port 8080.

---

### Q2: "What is the difference between a container and a virtual machine?"

**Strong answer:**

A VM virtualizes hardware -- a hypervisor (KVM, Xen, VMware) presents virtual CPUs, memory, and devices to a guest OS, which runs its own kernel. Isolation is enforced by hardware (VT-x, AMD-V) and the hypervisor. Each VM has its own kernel, its own memory address space, and its own device model.

A container virtualizes the operating system -- it is a regular Linux process that runs in isolated namespaces (PID, NET, MNT, UTS, IPC, USER, CGROUP), with resource limits enforced by cgroups, and a filesystem view provided by a union mount (OverlayFS). All containers on a host share the same kernel.

The practical implications:

- Containers start in milliseconds (no kernel boot). VMs take seconds to minutes.
- Containers use MB of disk (app + deps). VMs use GB (full OS).
- Containers have near-zero overhead. VMs have hypervisor overhead.
- But VMs provide stronger isolation because a kernel exploit in one VM does not affect other VMs. A kernel exploit in a container compromises all containers on that host.
- You cannot run a different kernel in a container (no Windows containers on Linux kernel). VMs can run any OS.

For production, many teams use both: containers inside VMs. The VM provides the strong isolation boundary, and containers provide the efficient packaging and deployment model.

---

### Q3: "How does container networking work at the Linux level?"

**Strong answer:**

When Docker creates a container with the default bridge network:

1. Docker creates a NET namespace for the container (isolated network stack).
2. Docker creates a **veth pair** -- a virtual ethernet cable with two ends. One end (`eth0`) goes into the container's namespace. The other end (`vethXXX`) stays in the host namespace and is attached to the `docker0` bridge.
3. The container gets an IP from Docker's IPAM (e.g., 172.17.0.2/16) assigned to its `eth0`.
4. The container's routing table has a default route via the `docker0` bridge IP (172.17.0.1).
5. For port mapping (`-p 8080:80`), Docker adds iptables DNAT rules: packets arriving on host:8080 are rewritten to container_ip:80.
6. Outbound traffic from the container hits the `docker0` bridge, goes through iptables MASQUERADE (SNAT), and exits via the host's default interface with the host's IP.

This is all standard Linux networking -- veth pairs, bridges, iptables NAT. Docker just automates the configuration.

---

### Q4: "What are cgroups and why do they matter for containers?"

**Strong answer:**

Cgroups (control groups) are a Linux kernel feature that limits, accounts for, and isolates resource usage of process groups. While namespaces control what a process can see, cgroups control what a process can use.

Key controllers:

- **memory**: Sets hard memory limits. When exceeded, the OOM killer terminates the process. Docker uses `--memory` flag.
- **cpu**: Controls CPU time allocation via shares (relative weight) or quota (hard limit). Docker uses `--cpus` or `--cpu-shares`.
- **pids**: Limits the number of processes (prevents fork bombs). Docker uses `--pids-limit`.
- **blkio**: Limits disk I/O bandwidth and IOPS.

In production, cgroups are essential because without them, one container could consume all host memory or CPU, starving other containers. The memory controller is especially important because it is what triggers OOM kills -- a common production issue with containerized applications.

Modern systems use cgroups v2 (single unified hierarchy), which provides better resource accounting, PSI (Pressure Stall Information) metrics, and cleaner delegation for rootless containers.

---

### Q5: "A developer says 'the container shows 64GB of memory but we set --memory=512m'. What is happening?"

**Strong answer:**

The application inside the container is reading `/proc/meminfo`, which shows the HOST's total memory, not the cgroup limit. This is because `/proc/meminfo` is not namespace-aware -- it reports system-wide memory information.

This is a well-known problem that affects:

- JVMs that auto-size heap based on available memory (fixed in Java 10+ with `-XX:+UseContainerSupport`)
- Python applications using `os.sysconf('SC_PHYS_PAGES')`
- Node.js `os.totalmem()`
- Any application that reads `/proc/meminfo` or `/proc/cpuinfo`

Solutions:

1. Use runtimes that respect cgroup limits (modern JVM, Go runtime since 1.19)
2. Explicitly set memory limits in the application (e.g., `-Xmx` for Java)
3. Use LXCFS to provide cgroup-aware `/proc` files (intercepts reads to `/proc/meminfo`)
4. In Kubernetes, use the Downward API to inject resource limits as environment variables

---

### Q6: "Why should you NOT use `--privileged` in production?"

**Strong answer:**

`--privileged` disables nearly all container security features:

1. **All Linux capabilities are granted** -- the container can do anything: mount filesystems, load kernel modules, change network config, access raw devices.
2. **Seccomp profile is disabled** -- all 300+ syscalls are available, including dangerous ones like `reboot`, `kexec_load`, and `mount`.
3. **AppArmor/SELinux profiles are disabled** -- no mandatory access control.
4. **All devices on the host are accessible** -- the container can read/write raw disks, GPUs, USB devices.
5. **The container can mount the host filesystem** -- trivial container escape.

Effectively, `--privileged` means the container is running ON the host, not in it. Any process in the container has equivalent access to the host as the root user.

Alternatives:

- Need specific capabilities? Use `--cap-add=NET_ADMIN` instead of `--privileged`
- Need device access? Use `--device=/dev/fuse` for specific devices
- Need Docker-in-Docker? Use rootless DinD, sysbox, or Docker-outside-of-Docker (mount the socket)
- Need to modify sysctl settings? Use `--sysctl net.core.somaxconn=1024`

---

## 12. Quick Reference

| Concept              | Command / Location                                      |
| -------------------- | ------------------------------------------------------- |
| List namespaces      | `lsns`                                                  |
| Enter a namespace    | `nsenter -t <PID> -p -n -m`                             |
| Create namespaces    | `unshare --pid --net --mount --fork`                    |
| View cgroup limits   | `cat /sys/fs/cgroup/.../memory.max`                     |
| Container's host PID | `docker inspect --format '{{.State.Pid}}' <ctr>`        |
| OCI runtime spec     | `config.json` in the OCI bundle                         |
| Overlay mount info   | `docker inspect --format '{{.GraphDriver.Data}}' <ctr>` |
| Check cgroup version | `stat -f -c %T /sys/fs/cgroup`                          |
| Docker daemon config | `/etc/docker/daemon.json`                               |
| Container runtime    | `docker info --format '{{.DefaultRuntime}}'`            |
