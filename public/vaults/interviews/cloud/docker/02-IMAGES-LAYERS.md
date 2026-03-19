# Docker Images & Layers: Deep Internals

A Docker image is not a monolithic blob. It is an ordered collection of filesystem layers, each represented as a tar archive of changes, plus a JSON configuration file describing how to run the image. Understanding this structure is essential for building efficient images, debugging layer bloat, optimizing build cache, and working with registries.

---

## 1. Mental Model

```
Image = Ordered Stack of Layers + Config JSON

+--------------------------------------------------+
|  Image Config (JSON)                              |
|  - architecture: amd64                            |
|  - os: linux                                      |
|  - history: [layer descriptions]                  |
|  - config: {Env, Cmd, Entrypoint, ExposedPorts}   |
+--------------------------------------------------+
|  Layer N (tar)  -- COPY . /app                    |
|  Layer 3 (tar)  -- RUN pip install -r req.txt     |
|  Layer 2 (tar)  -- RUN apt-get install python3    |
|  Layer 1 (tar)  -- base image (debian:bookworm)   |
+--------------------------------------------------+
```

Each layer is:

- A tar archive of filesystem changes (added, modified, or deleted files)
- Identified by a content-addressable SHA256 digest
- Immutable once created
- Shared across images that use the same layer

---

## 2. OverlayFS Deep-Dive

### 2.1 The Four Directories

OverlayFS (the default storage driver) uses four directories:

```
+-------------------------------------------+
|   merged/     (unified view)               |  mount point
+-------------------------------------------+
|   upper/      (writable layer)             |  container changes
+-------------------------------------------+
|   work/       (internal bookkeeping)       |  OverlayFS scratch space
+-------------------------------------------+
|   lower/      (read-only layers)           |  image layers (stacked)
+-------------------------------------------+
```

```bash
# See the actual overlay mount for a running container
$ mount | grep overlay
overlay on /var/lib/docker/overlay2/abc123/merged type overlay \
  (rw,relatime,lowerdir=/var/lib/docker/overlay2/l/LAYER3:/var/lib/docker/overlay2/l/LAYER2:/var/lib/docker/overlay2/l/LAYER1,\
   upperdir=/var/lib/docker/overlay2/abc123/diff,\
   workdir=/var/lib/docker/overlay2/abc123/work)
```

### 2.2 How File Operations Work

| Operation                | What Happens in OverlayFS                                                      |
| ------------------------ | ------------------------------------------------------------------------------ |
| **Read existing file**   | Look in upper, then lower layers top-down. First match returned.               |
| **Create new file**      | Written directly to upper layer.                                               |
| **Modify existing file** | File copied from lower to upper (copy-on-write), then modified in upper.       |
| **Delete file**          | A "whiteout" character device created in upper. Hides the lower layer file.    |
| **Delete directory**     | An "opaque whiteout" (`.wh..wh..opq`) created in upper.                        |
| **Rename file**          | Depends on kernel version. Older kernels: copy-up + whiteout. Newer: redirect. |

### 2.3 Copy-on-Write Performance Implications

```
First write to a large file from a lower layer:
1. Entire file copied from lower to upper (even for a 1-byte change)
2. Then the modification is applied
3. Subsequent writes go directly to the upper copy (no more copy-up)

This means:
- First write to a large file is slow (copy entire file)
- Subsequent writes are fast (direct to upper)
- Write-heavy workloads on existing files should use volumes instead
```

```bash
# Example: modifying a 500MB file in a container
# First write: copy 500MB from lower to upper + modify (slow)
# Second write: modify directly in upper (fast)

# For databases, this is terrible. Always use volumes for data directories.
```

---

## 3. Image Manifest and Config

### 3.1 OCI Image Manifest

The manifest is the entry point for an image. It lists the config and all layers:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "size": 7023
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "digest": "sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4",
      "size": 32654
    },
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "digest": "sha256:9f0706ba7422412cd468804fee71942239c4f2483678e0f0704694f01a95d6c1",
      "size": 16724
    }
  ]
}
```

### 3.2 Image Config

The config describes the runtime behavior and build history:

```json
{
  "architecture": "amd64",
  "os": "linux",
  "config": {
    "Env": [
      "PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "PYTHON_VERSION=3.12.1"
    ],
    "Cmd": ["python3"],
    "Entrypoint": null,
    "ExposedPorts": { "8080/tcp": {} },
    "WorkingDir": "/app",
    "User": "1000",
    "Labels": { "maintainer": "dev@example.com" }
  },
  "rootfs": {
    "type": "layers",
    "diff_ids": ["sha256:aaa...", "sha256:bbb...", "sha256:ccc..."]
  },
  "history": [
    {
      "created": "2024-01-15T10:30:00Z",
      "created_by": "/bin/sh -c #(nop) ADD file:... in /"
    },
    {
      "created": "2024-01-15T10:30:01Z",
      "created_by": "/bin/sh -c apt-get update && apt-get install -y python3",
      "comment": ""
    },
    {
      "created": "2024-01-15T10:30:05Z",
      "created_by": "/bin/sh -c #(nop) COPY dir:... in /app",
      "comment": ""
    }
  ]
}
```

---

## 4. Content-Addressable Storage

Docker uses content-addressable storage: every piece of data (layer, config, manifest) is identified by the SHA256 hash of its content.

### 4.1 How Deduplication Works

```
Image A (python:3.12):
  Layer 1: sha256:aaa... (debian base)
  Layer 2: sha256:bbb... (python runtime)

Image B (your-app):
  Layer 1: sha256:aaa... (debian base)     <-- SAME as Image A, stored once
  Layer 2: sha256:bbb... (python runtime)  <-- SAME as Image A, stored once
  Layer 3: sha256:ccc... (your app code)   <-- unique to Image B

Storage on disk: 3 layers, not 5
Pull from registry: only Layer 3 needs downloading if Image A is cached
```

```bash
# See the content-addressable store
$ ls /var/lib/docker/image/overlay2/layerdb/sha256/
aaa111...   bbb222...   ccc333...

# Each directory contains:
$ ls /var/lib/docker/image/overlay2/layerdb/sha256/aaa111.../
cache-id    diff    parent    size    tar-split.json.gz
```

### 4.2 Digest vs DiffID vs ChainID

| ID Type     | What It Is                                  | Calculated From                           |
| ----------- | ------------------------------------------- | ----------------------------------------- |
| **Digest**  | SHA256 of compressed layer tar.gz           | The compressed blob as stored in registry |
| **DiffID**  | SHA256 of uncompressed layer tar            | The uncompressed content                  |
| **ChainID** | SHA256 of (parent_chain_id + " " + diff_id) | Ordered sequence of layers (for dedup)    |

```bash
# Get diff IDs (uncompressed layer hashes)
$ docker inspect --format '{{json .RootFS.Layers}}' nginx | python3 -m json.tool
[
    "sha256:a1234...",
    "sha256:b5678...",
    "sha256:c9abc..."
]

# ChainID for first layer = DiffID (no parent)
# ChainID for second layer = sha256(chainID_of_first + " " + diffID_of_second)
```

---

## 5. Layer Inspection and Analysis

### 5.1 docker history

```bash
$ docker history nginx:latest
IMAGE          CREATED       CREATED BY                                      SIZE
4f67c83422ec   2 weeks ago   CMD ["nginx" "-g" "daemon off;"]                0B
<missing>      2 weeks ago   STOPSIGNAL SIGQUIT                              0B
<missing>      2 weeks ago   EXPOSE map[80/tcp:{}]                           0B
<missing>      2 weeks ago   ENTRYPOINT ["/docker-entrypoint.sh"]            0B
<missing>      2 weeks ago   COPY 30-tune-worker-processes.sh /docker-ent…   4.62kB
<missing>      2 weeks ago   COPY 20-envsubst-on-templates.sh /docker-en…    3.02kB
<missing>      2 weeks ago   COPY 15-local-resolvers.envsh /docker-entryp…   336B
<missing>      2 weeks ago   COPY 10-listen-on-ipv6-by-default.sh /docke…    2.12kB
<missing>      2 weeks ago   COPY docker-entrypoint.sh / …                    1.62kB
<missing>      2 weeks ago   RUN /bin/sh -c set -x     && groupadd --syst…   113MB
<missing>      2 weeks ago   ENV DYNPKG_RELEASE=2~bookworm                   0B
<missing>      2 weeks ago   ENV NJS_RELEASE=2~bookworm                      0B
<missing>      2 weeks ago   ENV NJS_VERSION=0.8.2                           0B
<missing>      2 weeks ago   ENV NGINX_VERSION=1.25.3                        0B
<missing>      2 weeks ago   LABEL maintainer=NGINX Docker Maintainers <d…   0B
<missing>      2 weeks ago   /bin/sh -c #(nop)  CMD ["bash"]                 0B
<missing>      2 weeks ago   /bin/sh -c #(nop) ADD file:d261a6f6921593f1e…   74.8MB
```

**Key insight:** Lines with `0B` size did NOT create filesystem layers. They only modified image metadata (ENV, EXPOSE, CMD, ENTRYPOINT, LABEL).

### 5.2 Which Dockerfile Instructions Create Layers

| Instruction   | Creates Layer? | Notes                                                                 |
| ------------- | -------------- | --------------------------------------------------------------------- |
| `FROM`        | Yes            | Base image layers                                                     |
| `RUN`         | Yes            | Executes command, captures filesystem changes                         |
| `COPY`        | Yes            | Adds files from build context                                         |
| `ADD`         | Yes            | Like COPY but also handles URLs and tar extraction                    |
| `ENV`         | No             | Metadata only                                                         |
| `ARG`         | No             | Build-time variable, metadata only                                    |
| `EXPOSE`      | No             | Metadata only (documentation)                                         |
| `CMD`         | No             | Metadata only                                                         |
| `ENTRYPOINT`  | No             | Metadata only                                                         |
| `WORKDIR`     | No\*           | Metadata, but creates the directory if it does not exist (tiny layer) |
| `USER`        | No             | Metadata only                                                         |
| `LABEL`       | No             | Metadata only                                                         |
| `VOLUME`      | No             | Metadata only                                                         |
| `HEALTHCHECK` | No             | Metadata only                                                         |
| `STOPSIGNAL`  | No             | Metadata only                                                         |
| `SHELL`       | No             | Metadata only                                                         |
| `ONBUILD`     | No             | Metadata only (triggers in child builds)                              |

### 5.3 Using dive for Layer Analysis

```bash
# Install dive
$ brew install dive   # or: docker pull wagoodman/dive

# Analyze an image
$ dive nginx:latest

# dive shows:
# - Each layer and its contents
# - Wasted space (duplicate files across layers)
# - Overall efficiency score
# - File tree for each layer

# CI mode (fails if efficiency is below threshold)
$ dive nginx:latest --ci --lowestEfficiency=0.9
```

### 5.4 Image Size Analysis

```bash
# Total image size
$ docker images nginx
REPOSITORY   TAG       IMAGE ID       CREATED       SIZE
nginx        latest    4f67c83422ec   2 weeks ago   187MB

# Size breakdown by layer
$ docker inspect nginx --format '{{json .RootFS.Layers}}' | python3 -m json.tool | wc -l
# Shows number of layers

# Detailed size per layer
$ docker history --no-trunc --format "{{.Size}}\t{{.CreatedBy}}" nginx | sort -hr | head -5
113MB   /bin/sh -c set -x && groupadd ...
74.8MB  /bin/sh -c #(nop) ADD file:...

# Find large files inside an image
$ docker run --rm nginx find / -type f -size +1M -exec ls -lh {} \; 2>/dev/null
```

---

## 6. Multi-Architecture Images

### 6.1 How They Work

A multi-arch image uses a **manifest list** (also called an index) that points to multiple platform-specific manifests:

```
Image Tag: nginx:latest
     |
     v
Manifest List (Index)
+------------------------------------------+
| platform: linux/amd64  -> Manifest A     |
| platform: linux/arm64  -> Manifest B     |
| platform: linux/arm/v7 -> Manifest C     |
+------------------------------------------+

When you `docker pull nginx`:
1. Docker sends your platform (e.g., linux/arm64)
2. Registry returns the manifest for that platform
3. Docker pulls the layers for that specific architecture
```

```bash
# Inspect a manifest list
$ docker manifest inspect nginx:latest
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:aaa...",
      "size": 1570,
      "platform": { "architecture": "amd64", "os": "linux" }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:bbb...",
      "size": 1570,
      "platform": { "architecture": "arm64", "os": "linux" }
    }
  ]
}
```

### 6.2 Building Multi-Arch Images with buildx

```bash
# Create a builder that supports multi-platform
$ docker buildx create --name multiarch --driver docker-container --use

# Build for multiple architectures and push
$ docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag myapp:latest \
    --push \
    .

# How it works:
# - amd64 layers: built natively (if on amd64 host)
# - arm64 layers: built via QEMU emulation (or on a native arm64 node)
```

### 6.3 QEMU Emulation

```bash
# Install QEMU for cross-platform builds
$ docker run --privileged --rm tonistiigi/binfmt --install all

# Verify registered emulators
$ ls /proc/sys/fs/binfmt_misc/
qemu-aarch64  qemu-arm  qemu-riscv64  ...

# Now you can run arm64 images on amd64
$ docker run --platform linux/arm64 alpine uname -m
aarch64
```

**Performance note:** QEMU emulation is 5-20x slower than native execution. For CI/CD, use native arm64 builders (GitHub Actions arm64 runners, AWS Graviton) instead of emulation.

---

## 7. Image Signing and Verification

### 7.1 Docker Content Trust (DCT)

```bash
# Enable content trust
$ export DOCKER_CONTENT_TRUST=1

# Push a signed image
$ docker push myregistry/myapp:v1.0
# Docker prompts for signing keys on first use

# Pull with verification
$ docker pull myregistry/myapp:v1.0
# Fails if image is not signed
```

### 7.2 Cosign (Modern Alternative)

```bash
# Install cosign
$ brew install cosign

# Generate a key pair
$ cosign generate-key-pair
# Creates cosign.key (private) and cosign.pub (public)

# Sign an image
$ cosign sign --key cosign.key myregistry/myapp:v1.0@sha256:abc...

# Verify an image
$ cosign verify --key cosign.pub myregistry/myapp:v1.0
# Returns verified signatures and attestations

# Keyless signing with OIDC (Sigstore/Fulcio)
$ cosign sign myregistry/myapp:v1.0
# Uses your identity provider (GitHub, Google) to sign
```

### 7.3 SBOM (Software Bill of Materials)

```bash
# Generate SBOM with syft
$ syft myapp:latest -o spdx-json > sbom.json

# Attach SBOM to image
$ cosign attach sbom --sbom sbom.json myregistry/myapp:v1.0

# Scan SBOM for vulnerabilities
$ grype sbom:sbom.json
```

---

## 8. Registry Internals

### 8.1 How docker push Works

```
docker push myregistry.com/myapp:v1.0

Step 1: Check authentication
  POST /v2/  --> 401 Unauthorized
  POST /v2/token?service=myregistry --> Bearer token

Step 2: Check if layers already exist (cross-repo mount)
  HEAD /v2/myapp/blobs/sha256:aaa... --> 200 (exists) or 404 (needs upload)

Step 3: Upload missing layers
  For each missing layer:
    POST /v2/myapp/blobs/uploads/ --> 202 (returns upload URL)
    PATCH <upload-url> with layer data (chunked or monolithic)
    PUT <upload-url>?digest=sha256:aaa... --> 201 Created

Step 4: Upload config blob
  Same process as layer upload

Step 5: Upload manifest
  PUT /v2/myapp/manifests/v1.0
  Body: manifest JSON pointing to config + layers
  --> 201 Created
```

### 8.2 How docker pull Works

```
docker pull myregistry.com/myapp:v1.0

Step 1: Authenticate (same as push)

Step 2: Fetch manifest
  GET /v2/myapp/manifests/v1.0
  Accept: application/vnd.oci.image.index.v1+json,
          application/vnd.oci.image.manifest.v1+json

Step 3: (If manifest list) Select platform-specific manifest
  GET /v2/myapp/manifests/sha256:bbb...

Step 4: Fetch config
  GET /v2/myapp/blobs/sha256:ccc...

Step 5: Fetch layers (parallel, skip cached ones)
  GET /v2/myapp/blobs/sha256:aaa... --> layer tar.gz
  GET /v2/myapp/blobs/sha256:ddd... --> layer tar.gz

Step 6: Verify digests and unpack layers
```

### 8.3 Registry Storage Layout

```
registry/
  v2/
    repositories/
      myapp/
        _manifests/
          tags/
            v1.0/
              current/link          --> sha256:manifest_digest
            latest/
              current/link          --> sha256:manifest_digest
          revisions/
            sha256/
              <manifest_digest>/link
        _layers/
          sha256/
            <layer_digest>/link
    blobs/
      sha256/
        aa/
          aaa111.../data            --> actual layer/config blob
        bb/
          bbb222.../data
```

---

## 9. Image Optimization: From 1.2GB to 50MB

### 9.1 The Problem

```dockerfile
# BAD: 1.2GB Node.js image
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Why this is 1.2GB:

- `node:20` is based on Debian with full OS tools (~900MB)
- `npm install` includes dev dependencies
- Source code, node_modules, and build artifacts all in the final image
- Build tools (gcc, make) from native module compilation left behind

### 9.2 Optimization Techniques

**Technique 1: Use a smaller base image**

```dockerfile
# node:20         ~900MB (Debian + Node + tools)
# node:20-slim    ~200MB (Debian minimal + Node)
# node:20-alpine  ~130MB (Alpine + Node)
# distroless       ~25MB (just Node runtime, no shell)
```

**Technique 2: Multi-stage build**

```dockerfile
# Build stage: has all dev tools
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# Production stage: minimal runtime
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --production && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
```

**Technique 3: For Go, use scratch**

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
# Final image: ~10-20MB (just the binary + CA certs)
```

**Technique 4: Order layers for cache efficiency**

```dockerfile
# GOOD: Dependencies change rarely, code changes often
COPY package*.json ./     # Layer 1: cached until package.json changes
RUN npm ci                # Layer 2: cached until package.json changes
COPY . .                  # Layer 3: rebuilt every code change

# BAD: Every code change rebuilds npm install
COPY . .                  # Layer 1: rebuilt every code change
RUN npm ci                # Layer 2: ALSO rebuilt (cache invalidated)
```

**Technique 5: Clean up in the same RUN statement**

```dockerfile
# BAD: cleanup in separate RUN creates 3 layers, deletion does not shrink earlier layers
RUN apt-get update
RUN apt-get install -y build-essential
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# GOOD: single layer, cleanup reduces layer size
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    make && \
    apt-get purge -y build-essential && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

### 9.3 Size Comparison

| Approach                            | Size   | Notes                                   |
| ----------------------------------- | ------ | --------------------------------------- |
| `FROM node:20` + copy everything    | ~1.2GB | Full OS + dev deps + source             |
| `FROM node:20-alpine` + multi-stage | ~150MB | Alpine + production deps + built assets |
| `FROM node:20-alpine` + prune       | ~80MB  | Alpine + minimal deps                   |
| `FROM gcr.io/distroless/nodejs20`   | ~50MB  | No shell, no package manager            |
| Go app `FROM scratch`               | ~10MB  | Just the static binary                  |

---

## 10. Gotchas

### 10.1 Layer Order Matters for Cache

If you change an early layer, ALL subsequent layers are rebuilt. Put things that change least (base image, dependencies) first and things that change most (source code) last.

### 10.2 Deleting Files Does Not Shrink Image

If Layer 1 adds a 500MB file and Layer 2 deletes it, the image is still 500MB. The file exists in Layer 1 (which is immutable). The deletion in Layer 2 just adds a whiteout. Both layers are part of the image. Solution: never add files you need to delete later, or do it all in one layer.

### 10.3 `.dockerignore` Is Critical

Without `.dockerignore`, the entire build context (including `.git/`, `node_modules/`, test files, secrets) is sent to the daemon. A 2GB `node_modules` means a 2GB build context sent on every build.

```
# .dockerignore
.git
node_modules
*.md
.env
.env.*
coverage/
test/
```

### 10.4 `latest` Tag Is Not "Latest"

The `latest` tag is just a convention. It does not automatically point to the most recent push. If you push `myapp:v2.0`, the `latest` tag still points to whatever it pointed to before (unless you explicitly push `myapp:latest`). Never rely on `latest` in production.

### 10.5 Platform Mismatch on Apple Silicon

Building on an M1/M2 Mac creates `linux/arm64` images by default. If your production server is `linux/amd64`, the image will not run (or will run under emulation, slowly). Always specify `--platform linux/amd64` when building for x86 production.

```bash
$ docker build --platform linux/amd64 -t myapp .
```

### 10.6 Layer Squashing Removes Cache Benefits

`docker build --squash` merges all layers into one. This reduces size but destroys layer sharing across images. Two apps based on the same base image will no longer share the base layers.

### 10.7 ADD vs COPY

`ADD` does more than `COPY`: it can fetch URLs and auto-extract tar archives. This sounds convenient but is unpredictable. Use `COPY` for files and `RUN curl + tar` for URLs. The only valid use of `ADD` is extracting a local tar archive into the image.

### 10.8 Registry Authentication Token Expiry

Registry tokens have short TTLs (typically 5-15 minutes). Long pulls (large images, slow connections) can fail mid-download if the token expires. Docker handles re-authentication automatically, but custom registry clients may not.

### 10.9 Compressed vs Uncompressed Size

`docker images` shows uncompressed size. The registry stores compressed layers. A 500MB image might be 150MB compressed in the registry. `docker pull` downloads the compressed size; `docker images` shows the uncompressed size.

### 10.10 Alpine and musl libc

Alpine uses musl libc instead of glibc. Some applications compiled for glibc will segfault or behave incorrectly on Alpine. Python packages with C extensions, Java with certain native libraries, and some Node.js native modules can have issues. Test thoroughly when switching to Alpine.

---

## 11. Common Interview Questions

### Q1: "How do you reduce a Docker image from 1.2GB to 50MB?"

**Strong answer:**

The strategy depends on the language, but the general approach is:

1. **Choose a minimal base image.** Replace `node:20` (Debian-based, ~900MB) with `node:20-alpine` (~130MB) or Google's distroless image (~25MB). For Go, use `scratch` (0MB) since Go compiles to static binaries.

2. **Use multi-stage builds.** Have a "builder" stage with all build tools (compilers, dev dependencies) and a "production" stage with only the runtime. Copy only the built artifacts from builder to production.

3. **Separate dependency installation from code copy.** Copy `package.json` first, run `npm ci`, then copy source code. This leverages layer caching -- dependencies only reinstall when `package.json` changes.

4. **Install only production dependencies.** Use `npm ci --production` (or `npm ci` + `npm prune --production`) in the final stage.

5. **Clean up in the same RUN instruction.** `apt-get install && make && apt-get purge && rm -rf /var/lib/apt/lists/*` in one RUN avoids leaving artifacts in intermediate layers.

6. **Use .dockerignore** to exclude `.git/`, `node_modules/`, `test/`, docs, etc. from the build context.

7. **Analyze with tools** like `dive` to find wasted space and duplicate files across layers.

---

### Q2: "Explain Docker image layers and how copy-on-write works"

**Strong answer:**

A Docker image is a stack of read-only filesystem layers. Each `RUN`, `COPY`, or `ADD` instruction in a Dockerfile creates a new layer containing only the filesystem changes (diffs) from that instruction. Layers are stored as compressed tar archives identified by SHA256 digests, which enables deduplication -- if two images share the same base layers, those layers are stored only once on disk and in the registry.

When a container starts, Docker adds a thin writable layer on top of the image layers using OverlayFS. This is the "container layer." The union filesystem presents all layers as a single coherent directory tree.

Copy-on-write means: when a process in the container modifies a file that exists in a read-only layer, the file is first copied up to the writable layer, then modified there. The original in the lower layer is untouched. This is efficient for read-heavy workloads but has a performance cost for the first write to large files (the entire file must be copied). For write-heavy workloads (databases), this is why you use volumes -- they bypass the overlay filesystem entirely.

Deletions work via whiteout files: a special file in the upper layer that hides the corresponding file in lower layers. The file still exists in the lower layer (and in the image), which is why deleting a file in a later Dockerfile instruction does not reduce the image size.

---

### Q3: "What happens during docker push and docker pull at the registry protocol level?"

**Strong answer:**

**Push:**

1. Client authenticates with the registry (OAuth2 token exchange).
2. For each layer, client sends a HEAD request to check if the blob already exists (by digest). If it exists, skip upload.
3. For new layers, client initiates a blob upload (POST), streams the compressed tar.gz (PATCH), and completes with the digest (PUT).
4. Client uploads the config blob the same way.
5. Finally, client uploads the manifest (PUT), which ties together the config and layer references. The manifest is what the tag points to.

**Pull:**

1. Client authenticates.
2. Client fetches the manifest by tag (GET /v2/repo/manifests/tag). If it is a manifest list (multi-arch), client selects the platform-specific manifest.
3. Client fetches the config blob.
4. Client fetches each layer blob in parallel, skipping any already cached locally.
5. Client verifies all digests match, decompresses layers, and applies them to the local store.

This is all defined by the OCI Distribution Specification. Any registry (Docker Hub, ECR, GCR, GHCR, Harbor) implements this protocol.

---

### Q4: "What is the difference between a Docker image and a container?"

**Strong answer:**

An image is a read-only template: an ordered stack of filesystem layers plus metadata (environment variables, entrypoint, exposed ports). It is built once and can be stored in a registry and shared. An image is defined by its content-addressable digest and is immutable.

A container is a running (or stopped) instance of an image. When you create a container from an image, Docker adds a thin writable layer on top (using OverlayFS copy-on-write), creates namespaces for isolation, sets up cgroups for resource limits, and starts the entrypoint process. Multiple containers can run from the same image simultaneously, each with their own writable layer and isolated namespaces.

The relationship is similar to class vs object in OOP: the image is the class (template), the container is the instance (runtime entity).

---

### Q5: "How does Docker achieve layer deduplication across images?"

**Strong answer:**

Every layer is identified by the SHA256 hash of its content (content-addressable storage). When Docker stores or pulls a layer, it checks if a blob with that digest already exists. If it does, it reuses the existing blob instead of storing a duplicate.

This works at three levels:

1. **On disk:** Two images based on `python:3.12` share the same base layers in `/var/lib/docker/overlay2/`. The layers are stored once.
2. **During pull:** When pulling an image, Docker sends HEAD requests for each layer digest. The registry returns 200 if the layer exists. The client skips downloading layers it already has locally.
3. **During push:** Same mechanism -- the client checks if each layer already exists in the target repository. If so, it can use cross-repository blob mounting instead of re-uploading.

This is why choosing common base images matters: if your team standardizes on `python:3.12-slim`, every service shares those base layers on every node, saving disk space and pull time.

---

## 12. Quick Reference

| Command                                  | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `docker images`                          | List local images with sizes         |
| `docker image inspect <img>`             | Full image metadata (JSON)           |
| `docker history <img>`                   | Layer-by-layer build history         |
| `docker manifest inspect <img>`          | Multi-arch manifest list             |
| `docker buildx imagetools inspect <img>` | Detailed multi-platform info         |
| `docker image prune`                     | Remove dangling images               |
| `docker image prune -a`                  | Remove all unused images             |
| `docker system df`                       | Disk usage summary                   |
| `docker save <img> -o file.tar`          | Export image to tar archive          |
| `docker load -i file.tar`                | Import image from tar archive        |
| `dive <img>`                             | Interactive layer analysis           |
| `skopeo inspect docker://<img>`          | Inspect remote image without pulling |
| `crane manifest <img>`                   | Fetch manifest from registry         |
