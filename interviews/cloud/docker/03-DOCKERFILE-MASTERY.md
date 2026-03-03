# Dockerfile Mastery: Beyond the Basics

A Dockerfile is a declarative script that produces a container image. Every engineer can write a basic Dockerfile. What separates senior engineers is understanding build context mechanics, the ENTRYPOINT/CMD interaction matrix, multi-stage build patterns, BuildKit features, and security hardening -- all of which directly impact image size, build speed, security posture, and production reliability.

---

## 1. Build Context

### 1.1 What Is Build Context?

When you run `docker build .`, the entire directory (`.`) is packaged as a tar archive and sent to the Docker daemon. This is the build context. The daemon, not the CLI, executes the build.

```
docker build .
     |
     v
CLI tars up "." --> sends tar to dockerd --> dockerd unpacks and builds
     ^
     |
This is the build context
```

**This is why you see:**
```
Sending build context to Docker daemon  2.4GB
```

If your directory contains `node_modules/`, `.git/`, large data files, or build artifacts, the entire thing is sent every single build.

### 1.2 .dockerignore

The `.dockerignore` file excludes files from the build context. It uses the same syntax as `.gitignore`:

```
# .dockerignore
.git
.gitignore
node_modules
npm-debug.log
Dockerfile
docker-compose.yml
.env
.env.*
*.md
!README.md        # exception: include README.md
coverage/
test/
__tests__/
.nyc_output/
dist/
.cache/
```

**Performance impact:**

| Scenario | Build Context Size | Build Time |
|----------|-------------------|------------|
| No `.dockerignore`, large project | 2.4GB | 45 seconds just to send context |
| With `.dockerignore` | 12MB | <1 second to send context |

### 1.3 Remote Build Contexts

```bash
# Build from a Git repository
$ docker build https://github.com/user/repo.git#branch

# Build from a tar archive
$ docker build https://example.com/context.tar.gz

# Build from stdin (no context)
$ docker build - <<EOF
FROM alpine
RUN echo "hello"
EOF
```

---

## 2. Instruction Deep-Dive

### 2.1 FROM: Base Image Selection

```dockerfile
# Standard base image
FROM python:3.12-slim

# Multi-stage with named stages
FROM node:20-alpine AS builder
FROM nginx:alpine AS production

# Pinned by digest (immutable, reproducible)
FROM python:3.12-slim@sha256:abc123...

# Scratch (empty filesystem -- for static binaries)
FROM scratch

# ARG before FROM (build-time base image selection)
ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE}
```

**Base image selection matrix:**

| Base | Size | Shell | Package Manager | Use Case |
|------|------|-------|-----------------|----------|
| `ubuntu:24.04` | ~77MB | Yes | apt | Full-featured, familiar |
| `debian:bookworm-slim` | ~74MB | Yes | apt | Debian minimal |
| `alpine:3.19` | ~7MB | Yes (ash) | apk | Tiny, but uses musl libc |
| `distroless` | ~2-25MB | No | No | Maximum security, minimal surface |
| `scratch` | 0MB | No | No | Static Go/Rust binaries |

### 2.2 RUN: Shell vs Exec Form

```dockerfile
# Shell form (runs through /bin/sh -c)
RUN apt-get update && apt-get install -y curl
# Equivalent to: /bin/sh -c "apt-get update && apt-get install -y curl"
# Supports variable expansion, piping, redirects

# Exec form (runs directly, no shell)
RUN ["apt-get", "update"]
# No variable expansion, no piping
# Slightly more efficient (no shell process)

# Multi-line with heredoc (BuildKit)
RUN <<EOF
apt-get update
apt-get install -y curl wget
apt-get clean
rm -rf /var/lib/apt/lists/*
EOF
```

**Best practice: chain commands with &&**

```dockerfile
# BAD: 3 layers, apt cache in first layer even after clean
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get clean

# GOOD: 1 layer, apt cache cleaned in same layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

### 2.3 COPY vs ADD

```dockerfile
# COPY: simple file copy from build context
COPY package.json /app/
COPY . /app/
COPY --chown=node:node . /app/    # set ownership

# ADD: COPY + extra features (usually avoid)
ADD https://example.com/file.tar.gz /tmp/    # fetch URL (prefer RUN curl)
ADD archive.tar.gz /app/                      # auto-extract tar (only valid use case)
```

**Rule:** Always use `COPY` unless you specifically need tar extraction. `ADD` from URLs is unpredictable and not cached properly.

### 2.4 ENV vs ARG

```dockerfile
# ARG: build-time only, not available at runtime
ARG NODE_ENV=production
ARG BUILD_VERSION

# ENV: persists into the running container
ENV NODE_ENV=production
ENV APP_PORT=3000

# ARG can be used to set ENV
ARG VERSION=1.0.0
ENV APP_VERSION=${VERSION}

# Scoping difference:
ARG BASE=node:20          # available before FROM
FROM ${BASE}
ARG BUILD_ENV=production  # must redeclare after FROM
```

| Aspect | ARG | ENV |
|--------|-----|-----|
| Available at build time | Yes | Yes |
| Available at runtime | No | Yes |
| Can be overridden | `--build-arg` | `-e` or `--env` |
| Persisted in image | No (but leaks in `docker history`) | Yes |
| Use for secrets | Never (visible in history) | Never (visible in inspect) |

### 2.5 ENTRYPOINT vs CMD: The Interaction Matrix

This is one of the most confusing and frequently asked topics. The key rule: **ENTRYPOINT defines the executable. CMD defines default arguments.**

```dockerfile
# CMD only (most common for simple images)
CMD ["python", "app.py"]
# docker run myapp           --> python app.py
# docker run myapp bash      --> bash (CMD replaced entirely)

# ENTRYPOINT only
ENTRYPOINT ["python", "app.py"]
# docker run myapp           --> python app.py
# docker run myapp --debug   --> python app.py --debug (args appended)

# ENTRYPOINT + CMD (the "proper" way)
ENTRYPOINT ["python"]
CMD ["app.py"]
# docker run myapp           --> python app.py
# docker run myapp test.py   --> python test.py (CMD replaced, ENTRYPOINT stays)
```

**The Full Interaction Matrix:**

| | No ENTRYPOINT | ENTRYPOINT exec_entry p1_entry | ENTRYPOINT ["exec_entry", "p1_entry"] |
|---|---|---|---|
| **No CMD** | Error (not allowed) | /bin/sh -c exec_entry p1_entry | exec_entry p1_entry |
| **CMD ["exec_cmd", "p1_cmd"]** | exec_cmd p1_cmd | /bin/sh -c exec_entry p1_entry | exec_entry p1_entry exec_cmd p1_cmd |
| **CMD exec_cmd p1_cmd** | /bin/sh -c exec_cmd p1_cmd | /bin/sh -c exec_entry p1_entry | exec_entry p1_entry /bin/sh -c exec_cmd p1_cmd |

**Critical distinction: shell form vs exec form:**

```dockerfile
# Exec form (preferred) - runs directly, PID 1 is your process
ENTRYPOINT ["nginx", "-g", "daemon off;"]

# Shell form - wraps in /bin/sh -c, PID 1 is sh (signal handling broken!)
ENTRYPOINT nginx -g "daemon off;"
# Actual execution: /bin/sh -c 'nginx -g "daemon off;"'
# PID 1 = /bin/sh, not nginx. SIGTERM goes to sh, nginx never sees it!
```

### 2.6 WORKDIR

```dockerfile
# Sets the working directory for RUN, CMD, ENTRYPOINT, COPY, ADD
WORKDIR /app

# Creates the directory if it does not exist
# Multiple WORKDIRs can be chained (relative paths resolved)
WORKDIR /app
WORKDIR src        # now /app/src
WORKDIR ../config  # now /app/config
```

### 2.7 USER

```dockerfile
# Switch to non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

# Or use numeric UID (works without /etc/passwd)
USER 1000:1000

# USER affects all subsequent RUN, CMD, ENTRYPOINT
```

### 2.8 HEALTHCHECK

```dockerfile
# HTTP health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Custom script health check
HEALTHCHECK --interval=15s --timeout=3s \
  CMD ["python", "/healthcheck.py"]

# Disable health check (if base image defines one)
HEALTHCHECK NONE
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--interval` | 30s | Time between checks |
| `--timeout` | 30s | Time to wait for check to succeed |
| `--start-period` | 0s | Grace period for startup (failures not counted) |
| `--retries` | 3 | Consecutive failures before unhealthy |

### 2.9 EXPOSE

```dockerfile
# Document which ports the container listens on
EXPOSE 8080
EXPOSE 8080/tcp
EXPOSE 8080/udp

# EXPOSE does NOT publish the port. It is documentation only.
# You still need -p to publish: docker run -p 8080:8080
# Or -P to publish all exposed ports to random host ports
```

### 2.10 STOPSIGNAL

```dockerfile
# Change the signal sent to stop the container (default: SIGTERM)
STOPSIGNAL SIGQUIT    # nginx uses SIGQUIT for graceful shutdown
STOPSIGNAL SIGINT     # some apps prefer SIGINT
STOPSIGNAL 9          # SIGKILL (not recommended -- no graceful shutdown)
```

### 2.11 ONBUILD

```dockerfile
# Trigger instructions in child images (images that use FROM this-image)
ONBUILD COPY . /app
ONBUILD RUN npm install

# When someone does: FROM my-base-image
# These instructions execute automatically in THEIR build
# Use case: creating base images for a team with standard build steps
```

### 2.12 SHELL

```dockerfile
# Change the default shell for shell-form instructions
SHELL ["/bin/bash", "-c"]
RUN echo $BASH_VERSION    # now uses bash, not sh

# Useful for Windows containers:
SHELL ["powershell", "-Command"]
RUN Get-ChildItem
```

---

## 3. Multi-Stage Builds

### 3.1 Basic Pattern

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Test (optional, can stop here in CI)
FROM builder AS tester
RUN npm run test

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --production && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
# Build only the production stage (default: last stage)
$ docker build -t myapp .

# Build up to a specific stage
$ docker build --target tester -t myapp-test .

# Build only the builder stage
$ docker build --target builder -t myapp-builder .
```

### 3.2 Advanced Patterns

**Pattern: External image as build source**

```dockerfile
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy from a completely different image (not a build stage)
COPY --from=redis:alpine /usr/local/bin/redis-cli /usr/local/bin/
```

**Pattern: Shared base with diverging stages**

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS development
RUN pip install --no-cache-dir debugpy pytest
COPY . .
CMD ["python", "-m", "debugpy", "--listen", "0.0.0.0:5678", "app.py"]

FROM base AS production
COPY . .
USER 1000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
```

**Pattern: Build artifacts from multiple stages**

```dockerfile
FROM golang:1.22 AS api-builder
WORKDIR /src
COPY api/ .
RUN go build -o /api-server

FROM node:20-alpine AS frontend-builder
WORKDIR /src
COPY frontend/ .
RUN npm ci && npm run build

FROM alpine:3.19
COPY --from=api-builder /api-server /usr/local/bin/
COPY --from=frontend-builder /src/dist /var/www/html/
CMD ["api-server"]
```

---

## 4. Build Cache

### 4.1 How Cache Works

Each instruction in a Dockerfile is a potential cache hit. Docker compares:

```
For RUN: the instruction string itself (not the output)
For COPY/ADD: the file checksums in the build context
For FROM: the image digest

If any instruction's cache is invalidated, ALL subsequent instructions are rebuilt.
```

```
Instruction 1: FROM node:20-alpine     [CACHED]
Instruction 2: WORKDIR /app            [CACHED]
Instruction 3: COPY package.json .     [CACHED - file unchanged]
Instruction 4: RUN npm ci              [CACHED - previous layers cached]
Instruction 5: COPY . .                [CACHE MISS - source code changed]
Instruction 6: RUN npm run build       [REBUILT - cache invalidated by step 5]
Instruction 7: CMD ["node", "dist/.."] [REBUILT - cache invalidated by step 5]
```

### 4.2 Cache-Busting Techniques

```dockerfile
# Force cache bust for a specific instruction
ARG CACHEBUST=1
RUN echo "bust: ${CACHEBUST}" && apt-get update
# Override with: docker build --build-arg CACHEBUST=$(date +%s)

# Bust cache for package updates (don't do this for every build)
RUN apt-get update && apt-get install -y curl    # cached
# To force update, change the instruction:
RUN apt-get update && apt-get install -y curl wget  # cache busted
```

### 4.3 BuildKit Cache Mounts

Cache mounts persist data between builds WITHOUT including it in the final layer:

```dockerfile
# syntax=docker/dockerfile:1

# Cache apt packages (saves re-downloading on every build)
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y curl

# Cache pip packages
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Cache npm packages
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Cache Go modules
RUN --mount=type=cache,target=/go/pkg/mod \
    go build -o /app .

# Cache Maven/Gradle
RUN --mount=type=cache,target=/root/.m2 \
    mvn package
```

### 4.4 Inline Cache and Remote Cache

```bash
# Export cache metadata inline (in the image itself)
$ docker buildx build \
    --cache-to type=inline \
    --tag myapp:latest \
    --push .

# Import cache from a registry image
$ docker buildx build \
    --cache-from type=registry,ref=myapp:latest \
    --tag myapp:v2.0 \
    .

# Export/import cache to a separate registry location
$ docker buildx build \
    --cache-to type=registry,ref=myapp:cache \
    --cache-from type=registry,ref=myapp:cache \
    --tag myapp:latest \
    --push .

# Local directory cache (useful in CI)
$ docker buildx build \
    --cache-to type=local,dest=/tmp/buildcache \
    --cache-from type=local,src=/tmp/buildcache \
    --tag myapp:latest .
```

---

## 5. BuildKit Features

BuildKit is the next-generation build engine (default since Docker 18.09). Enable explicitly with:

```bash
$ export DOCKER_BUILDKIT=1
# Or in /etc/docker/daemon.json: { "features": { "buildkit": true } }
```

### 5.1 Secret Mounts

Pass secrets during build without embedding them in layers:

```dockerfile
# syntax=docker/dockerfile:1

# Secret is available during this RUN, but NOT in the final image
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci

RUN --mount=type=secret,id=aws_credentials,target=/root/.aws/credentials \
    aws s3 cp s3://private-bucket/config.json /app/
```

```bash
$ docker buildx build \
    --secret id=npmrc,src=$HOME/.npmrc \
    --secret id=aws_credentials,src=$HOME/.aws/credentials \
    -t myapp .
```

### 5.2 SSH Forwarding

Clone private repositories during build:

```dockerfile
# syntax=docker/dockerfile:1

RUN --mount=type=ssh \
    git clone git@github.com:org/private-repo.git /app/private-repo
```

```bash
$ docker buildx build --ssh default -t myapp .
# Uses your SSH agent (ssh-agent must be running)
```

### 5.3 Heredocs

Multi-line RUN instructions without backslash gymnastics:

```dockerfile
# syntax=docker/dockerfile:1

RUN <<EOF
set -e
apt-get update
apt-get install -y curl wget
apt-get clean
rm -rf /var/lib/apt/lists/*
EOF

# Multiple scripts
COPY <<EOF /app/entrypoint.sh
#!/bin/bash
set -e
echo "Starting application..."
exec python app.py
EOF
```

### 5.4 Parallel Stage Execution

BuildKit automatically parallelizes independent stages:

```dockerfile
FROM golang:1.22 AS api-builder     # These two stages
COPY api/ .                          # build in parallel
RUN go build -o /api                 # (no dependencies)

FROM node:20 AS frontend-builder    #
COPY frontend/ .                     #
RUN npm run build                    #

FROM alpine                          # This stage waits for both
COPY --from=api-builder /api /usr/local/bin/
COPY --from=frontend-builder /dist /var/www/
```

---

## 6. Security Hardening

### 6.1 Non-Root User

```dockerfile
# Create a dedicated user and group
RUN groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /sbin/nologin appuser

# Set ownership of app directory
COPY --chown=appuser:appuser . /app/

# Switch to non-root user
USER appuser

# Everything after this runs as appuser
CMD ["node", "server.js"]
```

### 6.2 Read-Only Root Filesystem

```dockerfile
# At runtime:
# docker run --read-only --tmpfs /tmp --tmpfs /var/run myapp

# In Dockerfile, prepare for read-only:
RUN mkdir -p /tmp /var/run /var/log && \
    chown appuser:appuser /tmp /var/run /var/log
```

### 6.3 No New Privileges

```bash
# Prevent gaining new privileges via SUID/SGID binaries
$ docker run --security-opt=no-new-privileges myapp
```

### 6.4 Minimal Capabilities

```dockerfile
# In your deployment config (docker run or compose):
# docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp
```

---

## 7. Dockerfile Linting with Hadolint

```bash
# Install
$ brew install hadolint

# Lint a Dockerfile
$ hadolint Dockerfile
Dockerfile:3 DL3008 Pin versions in apt-get install
Dockerfile:7 DL3013 Pin versions in pip install
Dockerfile:12 DL4006 Set the SHELL option -o pipefail before RUN with pipe
Dockerfile:15 DL3025 Use arguments JSON notation for CMD and ENTRYPOINT
```

### Key Hadolint Rules

| Rule | Description | Fix |
|------|-------------|-----|
| DL3008 | Pin versions in apt-get | `apt-get install -y curl=7.88.1-10` |
| DL3013 | Pin versions in pip | `pip install flask==3.0.0` |
| DL3018 | Pin versions in apk | `apk add --no-cache curl=8.5.0-r0` |
| DL3025 | Use JSON for CMD/ENTRYPOINT | `CMD ["node", "app.js"]` not `CMD node app.js` |
| DL4006 | Set pipefail before pipe | `SHELL ["/bin/bash", "-o", "pipefail", "-c"]` |
| DL3003 | Use WORKDIR instead of cd | `WORKDIR /app` not `RUN cd /app` |
| DL3020 | Use COPY instead of ADD | `COPY file.txt /app/` |
| DL3009 | Delete apt lists after install | `rm -rf /var/lib/apt/lists/*` |

---

## 8. Production Dockerfiles by Language

### 8.1 Node.js

```dockerfile
# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (cache-friendly)
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build application
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# --- Production Stage ---
FROM node:20-alpine AS production

# Security: create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Security: remove unnecessary setuid/setgid binaries
RUN find / -perm /6000 -type f -exec chmod a-s {} \; 2>/dev/null || true

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Runtime configuration
ENV NODE_ENV=production
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Run as non-root
USER appuser

# Use exec form for proper signal handling
CMD ["node", "dist/index.js"]
```

### 8.2 Python

```dockerfile
# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM python:3.12-slim AS builder
WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-compile -r requirements.txt

# --- Production Stage ---
FROM python:3.12-slim AS production

# Install runtime-only system libraries
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY --chown=appuser:appuser . .

EXPOSE 8000
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "app:app"]
```

### 8.3 Go

```dockerfile
# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM golang:1.22-alpine AS builder
WORKDIR /src

# Cache dependencies
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Build static binary
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w -X main.version=$(git describe --tags 2>/dev/null || echo dev)" \
    -o /app/server ./cmd/server

# --- Production Stage ---
FROM scratch

# Import CA certificates for HTTPS calls
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Import timezone data
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy the binary
COPY --from=builder /app/server /server

# Run as non-root (numeric UID since scratch has no /etc/passwd)
USER 65534:65534

EXPOSE 8080
ENTRYPOINT ["/server"]
```

### 8.4 Java (Spring Boot)

```dockerfile
# syntax=docker/dockerfile:1

# --- Builder Stage ---
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app

# Cache Maven dependencies
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:go-offline

# Build the application
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw package -DskipTests

# Extract Spring Boot layers for efficient caching
RUN java -Djarmode=layertools -jar target/*.jar extract --destination /extracted

# --- Production Stage ---
FROM eclipse-temurin:21-jre-alpine AS production

# Create non-root user
RUN addgroup -S spring && adduser -S spring -G spring

WORKDIR /app

# Copy layers in order of change frequency (least -> most)
COPY --from=builder --chown=spring:spring /extracted/dependencies/ ./
COPY --from=builder --chown=spring:spring /extracted/spring-boot-loader/ ./
COPY --from=builder --chown=spring:spring /extracted/snapshot-dependencies/ ./
COPY --from=builder --chown=spring:spring /extracted/application/ ./

USER spring
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/actuator/health"]

# JVM tuning for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} org.springframework.boot.loader.launch.JarLauncher"]
```

---

## 9. Dockerfile Anti-Patterns and Fixes

### The Bad Dockerfile (find everything wrong)

```dockerfile
FROM ubuntu:latest
MAINTAINER developer@company.com
ADD . /app
WORKDIR /app
RUN apt-get update
RUN apt-get install -y python3 python3-pip build-essential
RUN pip3 install -r requirements.txt
RUN apt-get install -y curl
ENV API_KEY=sk-proj-abc123xyz
EXPOSE 5000
RUN echo "Build complete"
CMD python3 app.py
```

### Everything Wrong With It

| Line | Problem | Severity |
|------|---------|----------|
| `FROM ubuntu:latest` | Unpinned tag, full OS image (~77MB base) | Medium |
| `MAINTAINER` | Deprecated, use LABEL | Low |
| `ADD . /app` | ADD instead of COPY, no .dockerignore | Medium |
| Separate `RUN apt-get update` | Cache invalidation: update cached, install gets stale packages | High |
| Multiple `RUN` for apt | Multiple layers, apt cache bloat | Medium |
| `build-essential` left in | Build tools in final image, wasted space | Medium |
| `pip3 install` as root | Running as root | Medium |
| No `--no-cache-dir` for pip | Pip cache in layer | Low |
| `ENV API_KEY=sk-...` | **SECRET IN IMAGE** (visible in `docker inspect`!) | **CRITICAL** |
| `CMD python3 app.py` | Shell form (PID 1 is /bin/sh, signals broken) | High |
| No HEALTHCHECK | No health monitoring | Medium |
| No USER instruction | Running as root at runtime | High |
| No multi-stage | Build tools and dev deps in production image | Medium |

### The Fixed Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-compile -r requirements.txt

FROM python:3.12-slim AS production

LABEL maintainer="developer@company.com"

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --chown=appuser:appuser . .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["curl", "-f", "http://localhost:5000/health"]

USER appuser

CMD ["python3", "app.py"]
```

---

## 10. Gotchas

### 10.1 Build Cache is Instruction-String Based

For `RUN` instructions, Docker caches based on the instruction TEXT, not the output. `RUN apt-get update` always hits cache even if new packages are available. Chain it with `apt-get install` in the same instruction.

### 10.2 COPY Invalidates Cache Based on File Checksums

If ANY file matched by `COPY . /app/` changes (even a whitespace edit in README), the cache is invalidated for that instruction and all subsequent ones. This is why you copy `package.json` separately before `npm install`.

### 10.3 ARG Values Leak in docker history

```bash
$ docker build --build-arg SECRET=mysecret .
$ docker history myimage
# SECRET=mysecret is visible in the output!
```

Use `--mount=type=secret` instead for sensitive build-time values.

### 10.4 Shell Form PID 1 Problem

```dockerfile
CMD python app.py
# Actual process tree:
# PID 1: /bin/sh -c "python app.py"
# PID 7: python app.py

# When docker stop sends SIGTERM:
# SIGTERM goes to PID 1 (/bin/sh)
# /bin/sh does NOT forward it to python
# After 10 seconds, Docker sends SIGKILL (ungraceful death)
```

Always use exec form: `CMD ["python", "app.py"]`

### 10.5 COPY --chown Does Not Work on Windows Containers

The `--chown` flag only works on Linux containers. For Windows, set permissions with a separate `RUN` instruction.

### 10.6 Multi-Stage Build Still Sends Full Context

Even if your production stage only uses `dist/`, the entire build context is sent to the daemon. Use `.dockerignore` to exclude unnecessary files.

### 10.7 FROM scratch Has No Shell

If your final stage is `FROM scratch`, you cannot `docker exec` into it (no shell). You also cannot use `HEALTHCHECK CMD` (no curl, no shell). Use exec form for everything and external health checks.

### 10.8 Layer Limit

OverlayFS has a maximum of 128 lower layers. If your image has more than 128 layers (through deeply nested FROM chains), the build fails. Multi-stage builds help because only the final stage's layers count.

### 10.9 .dockerignore Must Be in Build Context Root

The `.dockerignore` file must be at the root of the build context (the path you pass to `docker build`). It does not work in subdirectories.

### 10.10 WORKDIR Creates with Root Ownership

If you `WORKDIR /app` before `USER nonroot`, the `/app` directory is created as root:root. Files copied later with `--chown` are fine, but the directory itself needs explicit ownership change.

---

## 11. Common Interview Questions

### Q1: "What is the difference between ENTRYPOINT and CMD?"

**Strong answer:**

ENTRYPOINT defines the executable that always runs. CMD defines default arguments that can be overridden at runtime.

When both are specified in exec form: `ENTRYPOINT ["python"]` and `CMD ["app.py"]`, running `docker run myapp` executes `python app.py`. Running `docker run myapp test.py` executes `python test.py` -- the CMD is replaced but the ENTRYPOINT stays.

With only CMD: `CMD ["python", "app.py"]`, running `docker run myapp bash` replaces the entire command with `bash`.

The critical practical detail is the shell form vs exec form distinction. Shell form (`CMD python app.py`) wraps the command in `/bin/sh -c`, making the shell PID 1 instead of your application. This breaks signal handling -- `docker stop` sends SIGTERM to the shell, which does not forward it to your app. Always use exec form (`CMD ["python", "app.py"]`) so your application is PID 1 and receives signals directly.

---

### Q2: "How do multi-stage builds work and why are they important?"

**Strong answer:**

A multi-stage build uses multiple FROM statements in a single Dockerfile, each starting a new build stage. You can copy artifacts from earlier stages into later stages using `COPY --from=stagename`. Only the final stage (or the stage specified with `--target`) becomes the output image.

This matters for three reasons: (1) Image size -- build tools, compilers, and dev dependencies stay in the builder stage and are not included in the production image. A Go app can go from 800MB (with the Go compiler) to 10MB (just the static binary from scratch). (2) Security -- fewer tools in the production image means a smaller attack surface. No compiler means no ability to compile exploits inside the container. (3) Build speed -- BuildKit parallelizes independent stages automatically.

Common patterns include: builder + production (compile then copy artifact), builder + tester + production (add a testing stage), and shared base with development/production variants (same dependencies, different configs).

---

### Q3: "What is the Docker build cache and how do you optimize for it?"

**Strong answer:**

Docker caches the result of each Dockerfile instruction. On the next build, if the instruction and its inputs have not changed, Docker reuses the cached layer instead of re-executing. For `RUN`, the cache key is the instruction string. For `COPY`/`ADD`, it is the file checksums. If any layer's cache is invalidated, all subsequent layers are rebuilt (the cache is linear).

Optimization strategies: (1) Put instructions that change least at the top (FROM, system packages) and instructions that change most at the bottom (COPY source code). (2) Separate dependency installation from code copy -- `COPY package.json` then `RUN npm install`, then `COPY .` -- so dependencies are only reinstalled when `package.json` changes. (3) Use BuildKit cache mounts (`--mount=type=cache`) for package manager caches (apt, pip, npm) that persist across builds but are not included in layers. (4) For CI, use remote cache (`--cache-from type=registry`) to share cache across build agents.

---

### Q4: "Review this Dockerfile and tell me everything wrong with it"

See Section 9 above for the full analysis of a bad Dockerfile with 13+ issues identified and the corrected version.

---

### Q5: "How do you handle secrets during Docker builds?"

**Strong answer:**

Never put secrets in ENV, ARG, or COPY. ENV values are visible in `docker inspect`. ARG values leak in `docker history`. Copied secret files exist in image layers.

The correct approach is BuildKit secret mounts: `RUN --mount=type=secret,id=mytoken,target=/run/secrets/token cat /run/secrets/token`. The secret is available during that RUN instruction but is never written to any layer. You pass it at build time with `docker build --secret id=mytoken,src=./token.txt`.

For SSH keys (e.g., cloning private repos), use `RUN --mount=type=ssh git clone ...` with `docker build --ssh default`.

At runtime, secrets should come from environment variables (injected by the orchestrator), mounted secrets (Docker Swarm secrets, Kubernetes secrets), or a secrets manager (Vault, AWS Secrets Manager) accessed over the network.

---

### Q6: "How would you debug a slow Docker build?"

**Strong answer:**

First, check if the build context is too large -- look at the "Sending build context to Docker daemon" line. If it is hundreds of MB or GBs, add or fix `.dockerignore`.

Second, analyze which layers are rebuilding unnecessarily. BuildKit shows timing for each step. Look for cache misses (`CACHED` vs no tag). Common cause: `COPY . .` early in the Dockerfile invalidates everything when any file changes.

Third, check for large layers. A `RUN apt-get install` followed by separate `RUN apt-get clean` leaves the package cache in an earlier layer. Combine them into one RUN.

Fourth, enable BuildKit cache mounts for package managers. `RUN --mount=type=cache,target=/root/.npm npm ci` keeps the npm cache between builds without bloating the image.

Fifth, for CI, configure remote caching (`--cache-from/--cache-to`) so builds on different agents share cache. Without this, every CI build starts cold.

Sixth, check if stages can be parallelized. BuildKit does this automatically for independent stages, but ensure your Dockerfile structure allows it.

---

## 12. Quick Reference

| Command | Purpose |
|---------|---------|
| `docker build -t name:tag .` | Build image from Dockerfile in current directory |
| `docker build --target stage .` | Build specific stage only |
| `docker build --no-cache .` | Build without cache |
| `docker build --build-arg KEY=VALUE .` | Pass build-time argument |
| `docker build --secret id=x,src=file .` | Pass secret for BuildKit |
| `docker build --ssh default .` | Forward SSH agent for BuildKit |
| `docker build --platform linux/amd64 .` | Build for specific platform |
| `docker buildx build --push .` | Build and push in one step |
| `docker history image:tag` | Show layer history |
| `docker image inspect image:tag` | Full image metadata |
| `hadolint Dockerfile` | Lint Dockerfile |
| `dive image:tag` | Interactive layer analysis |
