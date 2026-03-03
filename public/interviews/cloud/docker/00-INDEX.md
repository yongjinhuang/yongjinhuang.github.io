# Docker Deep-Dive: Interview Preparation Guide

Docker is the industry-standard tool for packaging and running applications in containers. But "knowing Docker" in an interview means understanding far more than `docker run`. This guide goes deep into the Linux primitives that make containers possible, the internals of images and builds, networking, storage, security, production patterns, and debugging. Every topic starts with the mental model, then progressively drills into implementation details, commands, gotchas, and interview questions.

---

## Study Map

| # | File | Core Topic | Lines | Priority |
|---|------|-----------|-------|----------|
| 01 | [Container Fundamentals](01-CONTAINER-FUNDAMENTALS.md) | Namespaces, cgroups, union filesystems, OCI runtime | ~850 | **Start here** |
| 02 | [Images & Layers](02-IMAGES-LAYERS.md) | OverlayFS, content-addressable storage, registries, multi-arch | ~750 | High |
| 03 | [Dockerfile Mastery](03-DOCKERFILE-MASTERY.md) | Build context, multi-stage, BuildKit, ENTRYPOINT/CMD matrix | ~850 | High |
| 04 | [Networking](04-NETWORKING.md) | Bridge, overlay, veth pairs, DNS, iptables, debugging | ~750 | High |
| 05 | [Storage & Volumes](05-STORAGE-VOLUMES.md) | Volumes, bind mounts, tmpfs, storage drivers, CoW | ~650 | Medium |
| 06 | [Docker Compose](06-COMPOSE.md) | Services, networks, volumes, profiles, watch, CI/CD | ~750 | Medium |
| 07 | [Security](07-SECURITY.md) | Capabilities, seccomp, user namespaces, rootless, scanning | ~750 | High |
| 08 | [Production Patterns](08-PRODUCTION-PATTERNS.md) | PID 1, health checks, logging, resource limits, CI/CD | ~750 | High |
| 09 | [Debugging & Troubleshooting](09-DEBUGGING.md) | docker logs, exec, inspect, nsenter, strace, common problems | ~650 | Medium |

---

## Recommended Study Order

### Week 1: Foundations
1. **Container Fundamentals** -- You cannot answer "what is a container?" properly without understanding namespaces and cgroups
2. **Images & Layers** -- Understand what you are actually building and pulling
3. **Dockerfile Mastery** -- The skill you use every day

### Week 2: Runtime
4. **Networking** -- The most common source of production issues
5. **Storage & Volumes** -- Data persistence patterns
6. **Docker Compose** -- Multi-container development and testing

### Week 3: Production
7. **Security** -- The questions that separate senior from mid-level
8. **Production Patterns** -- Running containers in real environments
9. **Debugging** -- The questions that separate practitioners from tutorial-readers

---

## Docker Version Timeline

| Date | Version | Key Feature |
|------|---------|-------------|
| 2013-03 | 0.1 | Initial release (dotCloud) |
| 2014-06 | 1.0 | Production-ready declaration |
| 2015-06 | 1.7 | Networking plugins, logging drivers |
| 2015-11 | 1.9 | Multi-host networking (overlay), volume plugins |
| 2016-02 | 1.10 | Content-addressable image storage, user namespaces |
| 2016-06 | 1.12 | Built-in Swarm mode, health checks |
| 2017-01 | 1.13 | Docker Compose v3, `docker system prune` |
| 2017-03 | 17.03 | Moby Project, multi-stage builds, new versioning (YY.MM) |
| 2017-06 | 17.06 | Docker CE/EE split, secrets management |
| 2018-11 | 18.09 | BuildKit as default builder backend |
| 2019-07 | 19.03 | Rootless mode (experimental), GPU support |
| 2020-06 | 19.03.12 | cgroups v2 support |
| 2020-12 | 20.10 | Compose v2 (Go rewrite), cgroups v2 GA |
| 2021-08 | 20.10.8 | Docker Desktop licensing changes |
| 2022-05 | 20.10.16 | Compose v2 GA, `docker compose` (no hyphen) |
| 2023-02 | 23.0 | New versioning again, containerd image store |
| 2023-07 | 24.0 | containerd image store GA, `docker init` |
| 2024-03 | 25.0 | CDI device support, improved OCI support |
| 2024-10 | 27.0 | Compose Watch GA, improved BuildKit |

---

## Container Runtime Landscape

Understanding where Docker fits in the ecosystem:

```
+-------------------------------------------------------+
|                    User Interface                       |
|  docker CLI    podman CLI    nerdctl    crictl          |
+-------------------------------------------------------+
|                   High-Level Runtime                    |
|  dockerd/containerd    CRI-O    Podman (daemonless)    |
+-------------------------------------------------------+
|                    OCI Runtime                          |
|  runc    crun    gVisor(runsc)    Kata(kata-runtime)   |
+-------------------------------------------------------+
|                   Linux Kernel                          |
|  namespaces    cgroups    seccomp    LSMs    OverlayFS |
+-------------------------------------------------------+
```

| Runtime | Description | Used By |
|---------|-------------|---------|
| **Docker Engine** | dockerd daemon + containerd + runc | Developer workstations, CI/CD, standalone hosts |
| **containerd** | Industry-standard container runtime (CNCF graduated) | Kubernetes (default), Docker (embedded), AWS ECS |
| **CRI-O** | Lightweight CRI implementation for Kubernetes | OpenShift, some Kubernetes clusters |
| **Podman** | Daemonless, rootless Docker-compatible alternative | RHEL/Fedora, security-conscious environments |
| **runc** | OCI reference runtime (low-level) | Used by containerd, CRI-O, Docker |
| **crun** | Fast OCI runtime written in C | Used by Podman on Fedora |
| **gVisor** | Application kernel for container sandboxing | Google Cloud Run, high-security workloads |
| **Kata Containers** | Lightweight VMs as containers | High-isolation multi-tenant environments |

---

## Key Concepts Quick Reference

| Concept | One-Liner |
|---------|-----------|
| **Container** | A process with isolated namespaces, limited cgroups, and a union filesystem root |
| **Image** | An ordered collection of filesystem layers plus metadata (OCI image spec) |
| **Dockerfile** | Declarative build instructions that produce an image |
| **Layer** | A set of filesystem changes (tar archive + metadata) |
| **Registry** | HTTP API for storing and distributing images (Docker Hub, ECR, GCR, GHCR) |
| **Volume** | Host-managed filesystem mount that persists beyond container lifecycle |
| **Network** | Virtual network connecting containers (bridge, overlay, host, macvlan) |
| **Compose** | Multi-container application definition and orchestration (YAML) |
| **BuildKit** | Next-generation build engine with caching, secrets, SSH forwarding |
| **OCI** | Open Container Initiative -- standards for runtime and image format |

---

## Interview Meta-Advice

**For Docker interviews specifically:**

1. **Start with Linux fundamentals.** If asked "what is a container?", do NOT say "a lightweight VM." Say it is a process (or group of processes) running with isolated Linux namespaces, resource limits via cgroups, and a root filesystem from a union mount. Then go deeper if they want.

2. **Know the full lifecycle.** Be able to trace what happens from `docker build` through `docker push` through `docker run` through `docker stop`. Every step.

3. **Have opinions on production patterns.** Interviewers want to know you have run containers in production. Talk about health checks, graceful shutdown, logging, resource limits, and image scanning.

4. **Security is the differentiator.** Anyone can write a Dockerfile. Knowing about capabilities, seccomp, user namespaces, and rootless mode separates senior engineers from everyone else.

5. **Debug stories win interviews.** Have 2-3 stories ready about debugging container issues. "The container kept OOM-killing because..." or "DNS resolution was failing because..." are the stories that land offers.
