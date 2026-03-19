# Docker Storage & Volumes: Deep-Dive

Container storage is the topic where theory meets the hard reality of stateful workloads. By default, data written inside a container disappears when the container is removed. Understanding why this happens, the three storage mechanisms (volumes, bind mounts, tmpfs), and the underlying storage driver mechanics is essential for running databases, caches, file uploads, and any other stateful service in containers.

---

## 1. Mental Model

```
Container Lifecycle vs Data Lifecycle

Container created:
+-------------------------------------------+
|  Image Layer N (read-only)                |
|  Image Layer 2 (read-only)                |
|  Image Layer 1 (read-only)                |
+-------------------------------------------+
|  Container Layer (read-write, thin)       |  <-- writable layer created
+-------------------------------------------+

Container running:
  App writes files -> go to container layer

Container removed:
  Container layer DELETED               <-- all data lost!
  Image layers UNCHANGED                <-- shared, immutable
```

**The fundamental problem:** The container's writable layer has the same lifecycle as the container. Remove the container, lose the data. Volumes and bind mounts solve this by providing storage that exists OUTSIDE the container's lifecycle.

```
Three Storage Options:

+------------------+-------------------+--------------------+
|    Volumes       |   Bind Mounts     |      tmpfs         |
| Docker-managed   |  Host path mount  |  RAM only          |
| /var/lib/docker/ |  Any host path    |  Never written to  |
| volumes/         |                   |  disk               |
+------------------+-------------------+--------------------+
|                  Container                                |
|  +-----+  +-----+  +-----+                              |
|  |/data|  |/src |  |/tmp |                              |
|  +--+--+  +--+--+  +--+--+                              |
|     |        |        |                                  |
+-----|--------|--------|----------------------------------+
      |        |        |
      v        v        v
   Volume  Host Dir    RAM
```

---

## 2. The Container Writable Layer

### 2.1 How It Works

Every running container has a thin writable layer on top of the image's read-only layers. This uses OverlayFS copy-on-write:

```bash
# See the writable layer location
$ docker inspect --format '{{.GraphDriver.Data.UpperDir}}' mycontainer
/var/lib/docker/overlay2/abc123.../diff

# See what the container has written
$ ls /var/lib/docker/overlay2/abc123.../diff
tmp/  var/  app/

# See filesystem changes in a running container
$ docker diff mycontainer
C /tmp
A /tmp/session.dat
C /var/log
A /var/log/app.log
# C = Changed, A = Added, D = Deleted
```

### 2.2 Why Data Is Lost

```bash
# Create a container, write data
$ docker run -d --name testdb postgres:16
$ docker exec testdb psql -U postgres -c "CREATE TABLE test (id int);"
$ docker exec testdb psql -U postgres -c "INSERT INTO test VALUES (1);"

# Data exists
$ docker exec testdb psql -U postgres -c "SELECT * FROM test;"
 id
----
  1

# Remove and recreate
$ docker rm -f testdb
$ docker run -d --name testdb postgres:16
$ docker exec testdb psql -U postgres -c "SELECT * FROM test;"
# ERROR: relation "test" does not exist
# DATA IS GONE
```

The writable layer was deleted with the container. The new container got a fresh writable layer.

---

## 3. Volumes

### 3.1 What Is a Volume?

A volume is a Docker-managed directory on the host filesystem, stored under `/var/lib/docker/volumes/`. Docker manages the lifecycle, permissions, and cleanup.

```bash
# Create a named volume
$ docker volume create pgdata

# Use it
$ docker run -d --name db \
    -v pgdata:/var/lib/postgresql/data \
    postgres:16

# The volume persists even after container removal
$ docker rm -f db
$ docker volume ls
DRIVER    VOLUME NAME
local     pgdata       # still here!

# Reattach to a new container
$ docker run -d --name db2 \
    -v pgdata:/var/lib/postgresql/data \
    postgres:16
# Data is preserved!
```

### 3.2 Volume Internals

```bash
# Where volumes live on disk
$ ls /var/lib/docker/volumes/
pgdata/
  _data/         # actual data directory
    PG_VERSION
    base/
    global/
    pg_wal/

# Volume metadata
$ docker volume inspect pgdata
[
    {
        "CreatedAt": "2024-01-15T10:30:00Z",
        "Driver": "local",
        "Labels": {},
        "Mountpoint": "/var/lib/docker/volumes/pgdata/_data",
        "Name": "pgdata",
        "Options": {},
        "Scope": "local"
    }
]
```

### 3.3 Named vs Anonymous Volumes

```bash
# Named volume (explicit name)
$ docker run -v mydata:/data alpine

# Anonymous volume (Docker generates a random name)
$ docker run -v /data alpine

$ docker volume ls
DRIVER    VOLUME NAME
local     mydata                                          # named
local     a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0     # anonymous

# Anonymous volumes are harder to manage and easy to orphan
# Always use named volumes in production
```

### 3.4 Volume Lifecycle Commands

```bash
# Create
$ docker volume create mydata
$ docker volume create --driver local \
    --opt type=nfs \
    --opt o=addr=192.168.1.50,rw \
    --opt device=:/exports/data \
    nfs-data

# List
$ docker volume ls
$ docker volume ls --filter dangling=true    # orphaned volumes

# Inspect
$ docker volume inspect mydata

# Remove
$ docker volume rm mydata

# Remove ALL unused volumes (dangerous in production!)
$ docker volume prune
$ docker volume prune --all    # includes named volumes not in use
```

---

## 4. Bind Mounts

### 4.1 What Is a Bind Mount?

A bind mount maps a specific host directory or file into the container. Docker does not manage the directory -- you are responsible for its existence and permissions.

```bash
# Mount current directory into container
$ docker run -v $(pwd):/app node:20 npm start

# Mount-syntax (preferred, explicit)
$ docker run --mount type=bind,source=$(pwd),target=/app node:20 npm start

# Read-only bind mount
$ docker run -v $(pwd)/config:/app/config:ro nginx
$ docker run --mount type=bind,source=$(pwd)/config,target=/app/config,readonly nginx
```

### 4.2 Volumes vs Bind Mounts

| Aspect              | Volume                                    | Bind Mount                          |
| ------------------- | ----------------------------------------- | ----------------------------------- |
| Managed by          | Docker                                    | You                                 |
| Location            | `/var/lib/docker/volumes/`                | Anywhere on host                    |
| Pre-populated       | Yes (copies image data into empty volume) | No (host data shadows image data)   |
| Backup              | Via volume commands or direct access      | Standard filesystem tools           |
| Cross-platform      | Works consistently                        | Path differences (Windows vs Linux) |
| Docker CLI manage   | Yes (volume create/inspect/rm)            | No                                  |
| Use case            | Persistent data (databases, uploads)      | Development (source code, config)   |
| Performance (macOS) | Better (in Docker VM)                     | Slow (filesystem sharing overhead)  |

### 4.3 When to Use Each

```
Use VOLUMES for:
  - Database data (PostgreSQL, MySQL, MongoDB)
  - Application state (uploads, generated files)
  - Cache directories (Redis AOF/RDB)
  - Anything that should persist beyond container lifecycle

Use BIND MOUNTS for:
  - Source code during development (hot-reload)
  - Configuration files (nginx.conf, prometheus.yml)
  - Build output directories
  - Sharing specific files between host and container

Use NEITHER (container layer) for:
  - Temporary files, scratch space
  - Ephemeral cache
  - Runtime-generated files that do not need to persist
```

---

## 5. tmpfs Mounts

### 5.1 What Is tmpfs?

A tmpfs mount stores data in the host's memory (RAM). It is never written to the host filesystem and is lost when the container stops.

```bash
# Mount tmpfs
$ docker run --tmpfs /tmp:rw,size=100m,mode=1777 nginx

# Or using --mount syntax
$ docker run --mount type=tmpfs,target=/tmp,tmpfs-size=100m nginx
```

### 5.2 Use Cases

| Use Case                     | Why tmpfs                                        |
| ---------------------------- | ------------------------------------------------ |
| Secrets at runtime           | Never written to disk, gone when container stops |
| Session data                 | Fast access, ephemeral by nature                 |
| Scratch space for processing | Fast I/O, no disk wear                           |
| /tmp in read-only containers | Container has read-only rootfs but needs /tmp    |

```bash
# Read-only container with tmpfs for writable directories
$ docker run \
    --read-only \
    --tmpfs /tmp:rw,size=50m \
    --tmpfs /var/run:rw \
    nginx
```

---

## 6. Volume Drivers

### 6.1 Local Driver (Default)

The `local` driver stores data on the host's filesystem. It also supports NFS, CIFS, and other mount types:

```bash
# Local directory (default)
$ docker volume create mydata

# NFS mount
$ docker volume create \
    --driver local \
    --opt type=nfs \
    --opt o=addr=192.168.1.50,vers=4,rw \
    --opt device=:/exports/data \
    nfs-data

# Bind mount as a volume (for cross-platform compatibility)
$ docker volume create \
    --driver local \
    --opt type=none \
    --opt device=/host/path \
    --opt o=bind \
    bind-vol
```

### 6.2 Cloud Volume Drivers

| Driver             | Backend     | Use Case                                  |
| ------------------ | ----------- | ----------------------------------------- |
| `rexray/ebs`       | AWS EBS     | Persistent block storage on AWS           |
| `rexray/efs`       | AWS EFS     | Shared NFS on AWS                         |
| `azure/azure-file` | Azure Files | Shared file storage on Azure              |
| `flocker`          | Various     | Multi-host volume management (deprecated) |
| `portworx`         | Portworx    | Enterprise storage for containers         |
| `netapp`           | NetApp      | Enterprise NAS/SAN                        |

```bash
# Example: AWS EBS volume
$ docker volume create \
    --driver rexray/ebs \
    --opt size=100 \
    --opt volumeType=gp3 \
    --opt iops=3000 \
    ebs-data
```

---

## 7. Bind Mount Gotchas

### 7.1 UID/GID Mapping

The biggest pain point with bind mounts: the container process UID must match the host file ownership.

```bash
# Container runs as UID 1000 (node user)
# Host files owned by UID 501 (macOS default)
$ docker run -v $(pwd):/app node:20 ls -la /app
# Files show as owned by UID 501, which the container's UID 1000
# may not have permission to write

# Fix 1: Match UIDs
$ docker run -u $(id -u):$(id -g) -v $(pwd):/app node:20 npm start

# Fix 2: Set ownership in Dockerfile
RUN chown -R node:node /app

# Fix 3: Use named volumes (Docker manages permissions)
$ docker run -v nodedata:/app node:20 npm start
```

### 7.2 SELinux Labels (RHEL/Fedora)

```bash
# On SELinux systems, bind mounts need labels:

# :z -- shared between containers (relabels with a shared label)
$ docker run -v /host/path:/app:z nginx

# :Z -- private to one container (relabels with a private label)
$ docker run -v /host/path:/app:Z nginx

# Without labels on SELinux systems: "Permission denied" errors
```

### 7.3 Performance on macOS

Docker Desktop on macOS runs containers in a Linux VM. Bind mounts require filesystem synchronization between macOS and the VM:

| Sync Mechanism | Speed     | Consistency           |
| -------------- | --------- | --------------------- |
| osxfs (legacy) | Very slow | Full                  |
| gRPC FUSE      | Slow      | Full                  |
| VirtioFS       | Fast      | Full                  |
| Mutagen (sync) | Fast      | Eventually consistent |

```bash
# Use VirtioFS (Docker Desktop settings > General > VirtioFS)
# Or use Mutagen volumes:
$ docker run -v myapp-sync:/app node:20 npm start
```

**Tip for macOS development:** Use named volumes for `node_modules` and bind mounts only for source code:

```yaml
# docker-compose.yml
services:
  app:
    volumes:
      - .:/app # source code (bind mount)
      - node_modules:/app/node_modules # deps (named volume, fast)
volumes:
  node_modules:
```

---

## 8. Storage Drivers

### 8.1 What Storage Drivers Do

The storage driver implements the union filesystem that layers images and the writable container layer. It handles copy-on-write operations.

### 8.2 overlay2 (Default, Recommended)

```bash
# Check current storage driver
$ docker info --format '{{.Driver}}'
overlay2

# overlay2 uses Linux OverlayFS
# Requires: Linux kernel 4.0+ (4.18+ recommended)
# Backing filesystem: ext4 or xfs (with d_type=true)

# Verify xfs has d_type enabled
$ xfs_info /var/lib/docker | grep ftype
ftype=1    # must be 1
```

### 8.3 Storage Driver Comparison

| Driver             | Status      | Backing FS | Performance | Notes                         |
| ------------------ | ----------- | ---------- | ----------- | ----------------------------- |
| **overlay2**       | Recommended | ext4, xfs  | Excellent   | Default on all modern systems |
| **fuse-overlayfs** | Supported   | Any        | Good        | For rootless Docker           |
| **btrfs**          | Supported   | btrfs      | Good        | Native CoW, snapshots         |
| **zfs**            | Supported   | zfs        | Good        | Native CoW, compression       |
| **vfs**            | Fallback    | Any        | Poor        | No CoW, full copy each layer  |
| **aufs**           | Deprecated  | ext4       | Good        | Removed in Docker 24+         |
| **devicemapper**   | Deprecated  | Direct LVM | Poor        | Complex setup, removed        |

### 8.4 Copy-on-Write Performance

```
Read Performance:
  overlay2 reads are fast -- just a filesystem lookup through layers
  No performance penalty for reading files in lower layers

Write Performance (first write to existing file):
  1. File must be copied from lower layer to upper layer
  2. Copy-up for large files is expensive (entire file copied)
  3. Subsequent writes to the same file are fast (already in upper layer)

Write-Heavy Workloads:
  Databases writing to files in the image layer = bad performance
  Solution: ALWAYS use volumes for database data directories
  Volumes bypass the storage driver entirely
```

```bash
# Benchmark: writable layer vs volume
$ docker run --rm alpine sh -c "dd if=/dev/zero of=/tmp/test bs=1M count=100"
# ~50-100 MB/s (through overlay2)

$ docker run --rm -v testdata:/data alpine sh -c "dd if=/dev/zero of=/data/test bs=1M count=100"
# ~200-500 MB/s (direct to volume, bypasses overlay)
```

---

## 9. Volume Backup and Restore

### 9.1 Backup a Volume

```bash
# Method 1: tar from a temporary container
$ docker run --rm \
    -v pgdata:/source:ro \
    -v $(pwd):/backup \
    alpine tar czf /backup/pgdata-backup.tar.gz -C /source .

# Method 2: Use docker cp with a running container
$ docker cp db:/var/lib/postgresql/data ./pg-backup/

# Method 3: Database-specific tools (preferred for databases)
$ docker exec db pg_dump -U postgres mydb > backup.sql
$ docker exec db pg_dumpall -U postgres > all-databases.sql
```

### 9.2 Restore a Volume

```bash
# Method 1: Restore from tar
$ docker volume create pgdata-restored
$ docker run --rm \
    -v pgdata-restored:/target \
    -v $(pwd):/backup:ro \
    alpine tar xzf /backup/pgdata-backup.tar.gz -C /target

# Method 2: Restore from SQL dump
$ docker exec -i db psql -U postgres < backup.sql
```

### 9.3 Copy Volume Between Hosts

```bash
# On source host: backup to tar
$ docker run --rm -v myvolume:/data -v $(pwd):/backup alpine \
    tar czf /backup/myvolume.tar.gz -C /data .

# Transfer to target host
$ scp myvolume.tar.gz target-host:~/

# On target host: restore
$ docker volume create myvolume
$ docker run --rm -v myvolume:/data -v ~/:/backup alpine \
    tar xzf /backup/myvolume.tar.gz -C /data
```

---

## 10. Database Containers: The Right Way

### 10.1 PostgreSQL

```bash
$ docker run -d \
    --name postgres \
    -v pgdata:/var/lib/postgresql/data \
    -e POSTGRES_PASSWORD=secretpassword \
    -e POSTGRES_DB=myapp \
    -p 5432:5432 \
    postgres:16

# Data directory on volume, survives container replacement
# Upgrade process:
# 1. Backup: pg_dumpall > backup.sql
# 2. Stop old container: docker stop postgres
# 3. Start new version: docker run ... postgres:17
# 4. Restore if needed: psql < backup.sql
```

### 10.2 MySQL

```bash
$ docker run -d \
    --name mysql \
    -v mysqldata:/var/lib/mysql \
    -e MYSQL_ROOT_PASSWORD=secretpassword \
    -e MYSQL_DATABASE=myapp \
    -p 3306:3306 \
    mysql:8

# IMPORTANT: MySQL data directory permissions are strict
# The mysql user inside the container must own the volume data
```

### 10.3 What Happens During Upgrades

```
Version Upgrade with Volumes:

1. Container v1 writes data to volume
   +----------+     +--------+
   | MySQL 8.0| --> | Volume |  (data format: 8.0)
   +----------+     +--------+

2. Stop v1, start v2 with same volume
   +----------+     +--------+
   | MySQL 8.4| --> | Volume |  (data format: still 8.0)
   +----------+     +--------+

3. Database engine performs upgrade on startup
   (or refuses to start if incompatible -- always check release notes!)

ALWAYS backup before version upgrades!
```

---

## 11. Gotchas

### 11.1 Volume Data Pre-Population

When you mount an empty named volume to a directory that has data in the image, Docker copies the image data into the volume (first time only). This does NOT happen with bind mounts:

```bash
# Named volume: copies image data
$ docker run -v myhtml:/usr/share/nginx/html nginx
# myhtml volume now contains default nginx HTML files

# Bind mount: host directory shadows image data
$ docker run -v $(pwd)/empty:/usr/share/nginx/html nginx
# Container sees empty directory (host dir shadows image content)
```

### 11.2 Volume Permissions with Non-Root Containers

```bash
# Container runs as UID 1000
# Volume created by Docker is owned by root
$ docker volume create appdata
$ docker run -u 1000:1000 -v appdata:/data alpine touch /data/test
# Permission denied!

# Fix: init container to set permissions
$ docker run --rm -v appdata:/data alpine chown -R 1000:1000 /data
$ docker run -u 1000:1000 -v appdata:/data alpine touch /data/test
# Works!
```

### 11.3 Anonymous Volumes Accumulate

Every `docker run -v /data` creates a new anonymous volume. Over time, these pile up:

```bash
$ docker volume ls --filter dangling=true | wc -l
47   # 47 orphaned volumes eating disk space!

$ docker volume prune    # clean up
```

### 11.4 VOLUME Instruction in Dockerfile Creates Anonymous Volumes

```dockerfile
# This creates an anonymous volume EVERY TIME the container starts
VOLUME /data
```

If you `docker run` without explicitly mounting `/data`, Docker creates an anonymous volume. This is confusing and leads to orphaned volumes. Many base images (postgres, mysql, mongo) use `VOLUME` in their Dockerfiles.

### 11.5 Bind Mount Propagation

By default, mount changes inside the container are not visible on the host and vice versa. This matters for NFS and other dynamic mounts:

```bash
# Propagation modes:
# rprivate (default): no propagation
# rshared: bidirectional
# rslave: host-to-container only

$ docker run -v /mnt/data:/data:rshared myapp
```

### 11.6 Docker Desktop Volume Location

On macOS/Windows, volumes are NOT in `/var/lib/docker/volumes/` on the host. They are inside the Docker Desktop VM:

```bash
# Access Docker Desktop VM filesystem (macOS):
$ docker run --rm -it -v /:/host alpine ls /host/var/lib/docker/volumes/
```

### 11.7 NFS Volume Mount Failures Are Silent

If an NFS mount fails during container start, the container may start with an empty directory instead of failing. Always verify mounts in health checks.

### 11.8 Cannot Remove Volume If Container Exists

Even stopped containers reference volumes. You must remove all containers using a volume before removing the volume:

```bash
$ docker volume rm pgdata
# Error: volume is in use by container abc123

$ docker rm abc123    # remove the container first
$ docker volume rm pgdata    # now works
```

### 11.9 No Built-In Volume Backup

Docker has no `docker volume backup` command. You must use workarounds (tar, cp, database dump tools). This is a common operational gap.

### 11.10 Overlay2 and inode Exhaustion

Each layer uses inodes. Images with many small files (node_modules with thousands of files) can exhaust the filesystem's inode limit:

```bash
# Check inode usage
$ df -i /var/lib/docker
Filesystem     Inodes  IUsed   IFree IUse%
/dev/sda1     6553600 4234567 2318033   65%
```

---

## 12. Common Interview Questions

### Q1: "How do you persist database data in Docker? What happens during upgrades?"

**Strong answer:**

Use named volumes for database data directories. When you run `docker run -v pgdata:/var/lib/postgresql/data postgres:16`, the PostgreSQL data files are stored in a Docker-managed volume that persists independently of the container lifecycle. Removing and recreating the container does not affect the data -- the new container attaches to the same volume and finds the existing data.

For upgrades, the process depends on whether it is a minor or major version change. Minor upgrades (16.1 to 16.2) are usually safe -- stop the old container, start the new one with the same volume, and the database engine handles the upgrade automatically. Major upgrades (16 to 17) require data migration because the on-disk format may change. The safe process is: (1) backup with pg_dump, (2) stop the old container, (3) start the new version with a fresh volume, (4) restore from backup. Never assume a major version upgrade is backward-compatible with the existing data directory.

In production, I would use a dedicated data volume with regular automated backups (pg_dump to S3, or filesystem snapshots if using EBS/ZFS). The volume should be on reliable storage, and you should test the restore process regularly.

---

### Q2: "What is the difference between a volume and a bind mount?"

**Strong answer:**

A volume is managed by Docker: it lives in `/var/lib/docker/volumes/`, Docker handles creation, inspection, and cleanup, and it works consistently across platforms. When you mount an empty volume to a container directory that has data in the image, Docker pre-populates the volume with that data.

A bind mount maps any host directory into the container. Docker does not manage it -- you control the path, permissions, and lifecycle. Bind mounts shadow any data in the image at the mount point (no pre-population). On macOS, bind mounts have significant performance overhead because data must sync between the host and the Docker VM.

Use volumes for persistent data in production (databases, uploads, caches). Use bind mounts for development (source code, configuration files). The key difference at runtime is that volumes go through Docker's storage subsystem while bind mounts are direct host filesystem access.

---

### Q3: "Why is write performance in the container layer slower than in a volume?"

**Strong answer:**

The container's writable layer uses OverlayFS copy-on-write. When a process modifies an existing file from an image layer, the entire file must first be copied from the read-only lower layer to the writable upper layer, then the modification is applied. This copy-up operation is expensive for large files -- even changing one byte of a 500MB file copies the entire 500MB first.

Volumes bypass the overlay filesystem entirely. They are direct mounts to the host filesystem (or to a volume driver backend like NFS or EBS). Reads and writes go directly to the underlying storage without any copy-on-write overhead.

For read-heavy workloads, the overlay performs well because reads just traverse the layer stack. But for write-heavy workloads like databases, the copy-on-write overhead is significant. This is why database containers always use volumes for their data directories -- not just for persistence but also for performance.

---

### Q4: "How would you backup and restore Docker volumes?"

**Strong answer:**

Docker has no built-in volume backup command, so you need to use workarounds:

**Generic approach (works for any volume):** Run a temporary container that mounts both the volume and a host directory, then tar the volume contents:

```bash
docker run --rm -v myvolume:/source:ro -v $(pwd):/backup alpine \
  tar czf /backup/myvolume.tar.gz -C /source .
```

**Database-specific approach (preferred for databases):** Use the database's native dump tools because they produce consistent, application-aware backups:

```bash
docker exec db pg_dumpall -U postgres > backup.sql
```

**For automated production backups:** Schedule regular dumps to object storage (S3, GCS), use volume snapshots if the storage backend supports it (EBS snapshots, ZFS snapshots), or use a backup tool like Velero (for Kubernetes) or restic.

Restore reverses the process: create a new volume, extract the tar (or restore the dump), then start the container with the restored volume. Always test restores regularly -- a backup you have never tested is not a backup.

---

### Q5: "Your containers on macOS are running very slowly with bind mounts. How do you fix this?"

**Strong answer:**

Docker Desktop on macOS runs containers inside a Linux VM. Bind mounts require filesystem synchronization between macOS (APFS) and the Linux VM's filesystem. This sync is inherently slow for write-heavy or many-file workloads (like node_modules with thousands of files).

Solutions, from easiest to most involved:

1. **Switch to VirtioFS** in Docker Desktop settings. It is significantly faster than the older gRPC-FUSE or osxfs backends.

2. **Use named volumes for dependency directories.** Mount source code via bind mount but put node_modules in a named volume:

   ```yaml
   volumes:
     - .:/app # bind mount: source code
     - deps:/app/node_modules # volume: dependencies (fast!)
   ```

3. **Use Docker Compose `watch` mode** which selectively syncs only changed files instead of mounting the entire directory.

4. **Use Mutagen** for smart, incremental file synchronization between host and container.

5. **For extreme cases,** develop inside the container using VS Code Dev Containers or similar tools, avoiding bind mounts entirely.

---

## 13. Quick Reference

| Command                              | Purpose                        |
| ------------------------------------ | ------------------------------ |
| `docker volume create <name>`        | Create named volume            |
| `docker volume ls`                   | List all volumes               |
| `docker volume inspect <name>`       | Volume details and mount point |
| `docker volume rm <name>`            | Remove a volume                |
| `docker volume prune`                | Remove all unused volumes      |
| `docker run -v name:/path`           | Mount named volume             |
| `docker run -v /host:/ctr`           | Bind mount                     |
| `docker run --tmpfs /tmp`            | tmpfs mount                    |
| `docker run --mount type=volume,...` | Explicit mount syntax          |
| `docker run --mount type=bind,...`   | Explicit bind mount syntax     |
| `docker run --read-only`             | Read-only container filesystem |
| `docker diff <container>`            | Show filesystem changes        |
| `docker system df -v`                | Disk usage with volume details |
| `docker cp <ctr>:/path ./local`      | Copy files from container      |
