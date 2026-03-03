# Docker Compose: Deep-Dive

Docker Compose is the tool for defining and running multi-container applications. A single YAML file describes your entire application stack -- services, networks, volumes, configs, and secrets -- and a single command brings it up or tears it down. While simple in concept, mastering Compose means understanding service dependencies, networking, environment variable precedence, profiles, health checks, and development workflows.

---

## 1. Mental Model

```
docker-compose.yml
+--------------------------------------------------+
|  services:                                        |
|    api:        --> Container(s) + config           |
|    worker:     --> Container(s) + config           |
|    db:         --> Container(s) + config           |
|    redis:      --> Container(s) + config           |
|                                                    |
|  networks:                                         |
|    frontend:   --> Docker network                  |
|    backend:    --> Docker network                  |
|                                                    |
|  volumes:                                          |
|    pgdata:     --> Docker volume                   |
|    redisdata:  --> Docker volume                   |
+--------------------------------------------------+

$ docker compose up
  --> Creates networks
  --> Creates volumes
  --> Pulls/builds images
  --> Creates and starts containers
  --> Attaches to default network (project_default)
```

---

## 2. Compose v1 vs v2

| Aspect | v1 (deprecated) | v2 (current) |
|--------|-----------------|--------------|
| Command | `docker-compose` (Python, separate binary) | `docker compose` (Go, Docker CLI plugin) |
| Performance | Slower | Significantly faster |
| Container naming | `project_service_1` | `project-service-1` (hyphens) |
| BuildKit | Opt-in | Default |
| Profiles | Limited | Full support |
| Watch mode | Not available | `docker compose watch` |
| GPU support | No | Yes |

```bash
# v1 (deprecated, do not use for new projects)
$ docker-compose up -d

# v2 (always use this)
$ docker compose up -d

# Check version
$ docker compose version
Docker Compose version v2.24.0
```

---

## 3. Complete Compose File Anatomy

```yaml
# docker-compose.yml

# Optional: specify Compose file version (mostly ignored in v2)
# The "version" key is now optional and deprecated

# Top-level elements
services:    # Container definitions (required)
networks:    # Network definitions (optional)
volumes:     # Volume definitions (optional)
configs:     # Config object definitions (optional, Swarm-focused)
secrets:     # Secret definitions (optional)

# Service definition with ALL common options:
services:
  api:
    # --- Image or Build ---
    image: myapp:latest              # Use pre-built image
    build:                           # Or build from Dockerfile
      context: ./api                 # Build context directory
      dockerfile: Dockerfile.prod    # Dockerfile name (default: Dockerfile)
      args:                          # Build arguments
        NODE_ENV: production
      target: production             # Multi-stage build target
      cache_from:                    # Cache sources
        - myapp:cache

    # --- Container Configuration ---
    container_name: my-api           # Explicit name (default: project-service-N)
    hostname: api-host               # Container hostname
    command: ["node", "server.js"]   # Override CMD
    entrypoint: ["/entrypoint.sh"]   # Override ENTRYPOINT
    working_dir: /app                # Override WORKDIR
    user: "1000:1000"                # User to run as
    init: true                       # Add init process (tini)
    stdin_open: true                 # -i flag (keep STDIN open)
    tty: true                        # -t flag (allocate pseudo-TTY)
    stop_signal: SIGQUIT             # Signal to stop container
    stop_grace_period: 30s           # Time before SIGKILL

    # --- Environment ---
    environment:                     # Environment variables
      NODE_ENV: production
      DB_HOST: db
    env_file:                        # Load env from files
      - .env
      - .env.production

    # --- Networking ---
    ports:                           # Port mappings
      - "8080:3000"                  # host:container
      - "127.0.0.1:9090:9090"       # specific interface
    expose:                          # Expose to other services only
      - "3000"
    networks:                        # Networks to join
      - frontend
      - backend
    network_mode: "host"             # Or: bridge, none, service:name
    dns:                             # Custom DNS
      - 8.8.8.8
    extra_hosts:                     # Add /etc/hosts entries
      - "host.docker.internal:host-gateway"

    # --- Storage ---
    volumes:
      - pgdata:/var/lib/postgresql/data     # named volume
      - ./config:/app/config:ro             # bind mount (read-only)
      - /tmp:/tmp                           # host path
    tmpfs:
      - /tmp:size=100M

    # --- Dependencies ---
    depends_on:
      db:
        condition: service_healthy   # Wait for health check
        restart: true                # Restart if dependency restarts
      redis:
        condition: service_started   # Just wait for start

    # --- Health Check ---
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
      start_interval: 2s             # Interval during start_period

    # --- Resource Limits ---
    deploy:
      replicas: 2                    # Number of instances
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s

    # --- Restart Policy (simpler alternative to deploy) ---
    restart: unless-stopped          # no, always, on-failure, unless-stopped

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

    # --- Security ---
    privileged: false
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE

    # --- Profiles ---
    profiles:
      - debug                        # Only starts with --profile debug

    # --- Labels ---
    labels:
      com.example.project: "myapp"
      com.example.team: "backend"
```

---

## 4. Networking in Compose

### 4.1 Default Network

Compose automatically creates a network named `{project}_default`. All services join it.

```yaml
services:
  api:
    image: myapi
    # Automatically on {project}_default network
    # Reachable by other services as "api"
  db:
    image: postgres:16
    # Reachable as "db"
```

```bash
$ docker compose up -d
$ docker network ls
NETWORK ID   NAME              DRIVER
abc123       myproject_default  bridge

# api can reach db at hostname "db"
# db can reach api at hostname "api"
```

### 4.2 Custom Networks

```yaml
services:
  web:
    image: nginx
    networks:
      - frontend

  api:
    image: myapi
    networks:
      - frontend
      - backend

  db:
    image: postgres:16
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true    # no external access
```

```
Network topology:
  web <--frontend--> api <--backend--> db
  web cannot reach db (different networks, no route)
  api bridges both networks
  backend is internal (no internet access)
```

### 4.3 Network Aliases

```yaml
services:
  api-v1:
    image: myapi:v1
    networks:
      backend:
        aliases:
          - api          # reachable as "api" on backend network
  api-v2:
    image: myapi:v2
    networks:
      backend:
        aliases:
          - api          # also reachable as "api" (round-robin DNS)
```

### 4.4 External Networks

```yaml
# Connect to a network created outside Compose
networks:
  existing:
    external: true
    name: my-existing-network

services:
  app:
    networks:
      - existing
```

---

## 5. Volume Management in Compose

### 5.1 Named Volumes

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:                    # Docker-managed volume
    driver: local
```

### 5.2 Bind Mounts

```yaml
services:
  app:
    volumes:
      - ./src:/app/src               # relative path = bind mount
      - /absolute/path:/data          # absolute path = bind mount
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro  # read-only
```

### 5.3 Volume Drivers

```yaml
volumes:
  nfs-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=192.168.1.50,vers=4,rw
      device: ":/exports/data"
```

### 5.4 External Volumes

```yaml
volumes:
  existing-data:
    external: true
    name: my-existing-volume    # must already exist
```

---

## 6. Environment Variable Precedence

Compose resolves environment variables with this precedence (highest to lowest):

```
1. docker compose run -e VAR=value          # CLI override (highest)
2. environment: key in compose file          # Explicit in service
3. --env-file flag on CLI                    # CLI env file
4. env_file: key in compose file             # Service env file
5. .env file in project directory            # Default env file (lowest)
6. Shell environment variables               # Host shell env
```

### 6.1 The .env File

```bash
# .env (loaded automatically by Compose)
POSTGRES_VERSION=16
APP_PORT=3000
DB_PASSWORD=secret123
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:${POSTGRES_VERSION}    # Interpolation from .env
    ports:
      - "${APP_PORT}:3000"
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
```

### 6.2 Multiple Env Files

```yaml
services:
  api:
    env_file:
      - .env                    # base config
      - .env.${ENVIRONMENT}     # environment-specific overrides
    environment:
      LOG_LEVEL: debug          # highest precedence per-var
```

### 6.3 Variable Substitution Syntax

```yaml
services:
  app:
    image: myapp:${VERSION:-latest}       # default if unset
    image: myapp:${VERSION:?Version required}  # error if unset
    image: myapp:${VERSION:+custom}       # "custom" if set, empty if unset
```

---

## 7. Profiles

Profiles let you selectively start services. Services without profiles always start. Services with profiles only start when that profile is active.

```yaml
services:
  api:
    image: myapi
    # No profile: always starts

  db:
    image: postgres:16
    # No profile: always starts

  debug-tools:
    image: nicolaka/netshoot
    profiles:
      - debug                # only with: docker compose --profile debug up

  test-runner:
    image: myapp-test
    profiles:
      - test                 # only with: docker compose --profile test up

  monitoring:
    image: prometheus
    profiles:
      - monitoring           # only with --profile monitoring
      - full                 # OR --profile full
```

```bash
# Start only core services (api, db)
$ docker compose up -d

# Start with debug tools
$ docker compose --profile debug up -d

# Start with multiple profiles
$ docker compose --profile debug --profile monitoring up -d

# Or via environment variable
$ COMPOSE_PROFILES=debug,monitoring docker compose up -d
```

---

## 8. Health Checks and Startup Ordering

### 8.1 depends_on with Health Checks

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    image: myapi
    depends_on:
      db:
        condition: service_healthy    # waits for db health check
      redis:
        condition: service_healthy    # waits for redis health check
    # api starts only after db AND redis are healthy
```

### 8.2 Service States

```
depends_on conditions:
  service_started    - container is running (default, may not be ready)
  service_healthy    - health check passes (recommended for databases)
  service_completed_successfully  - container exited with code 0
                                   (useful for init/migration containers)
```

```yaml
services:
  migrate:
    image: myapp
    command: ["python", "manage.py", "migrate"]
    depends_on:
      db:
        condition: service_healthy

  api:
    image: myapp
    depends_on:
      migrate:
        condition: service_completed_successfully
      db:
        condition: service_healthy
    # api starts after migration completes successfully
```

---

## 9. Docker Compose Watch

Watch mode provides file synchronization and automatic rebuilds during development:

```yaml
services:
  api:
    build: .
    develop:
      watch:
        # Sync: copy file changes into running container (no rebuild)
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - "**/*.test.js"

        # Sync + restart: copy and restart the service
        - action: sync+restart
          path: ./config
          target: /app/config

        # Rebuild: trigger full rebuild when these files change
        - action: rebuild
          path: ./package.json
```

```bash
# Start with watch mode
$ docker compose watch

# Or as part of up
$ docker compose up --watch
```

| Action | When to Use | What Happens |
|--------|------------|--------------|
| `sync` | Source code changes (hot-reload) | Files copied, app's hot-reload handles restart |
| `sync+restart` | Config changes | Files copied, container restarted |
| `rebuild` | Dependency changes (package.json) | Full image rebuild and container recreate |

---

## 10. Multi-File Compose

### 10.1 Override Files

```bash
# Compose automatically merges:
# docker-compose.yml (base)
# docker-compose.override.yml (development overrides, auto-loaded)

$ docker compose up    # merges both files automatically
$ docker compose -f docker-compose.yml -f docker-compose.prod.yml up  # explicit
```

```yaml
# docker-compose.yml (base)
services:
  api:
    image: myapi:latest
    ports:
      - "3000:3000"

# docker-compose.override.yml (dev overrides, loaded automatically)
services:
  api:
    build: .
    volumes:
      - ./src:/app/src
    environment:
      DEBUG: "true"

# docker-compose.prod.yml (production, loaded explicitly)
services:
  api:
    image: myregistry/myapi:${VERSION}
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
    environment:
      DEBUG: "false"
```

### 10.2 Include (Compose 2.20+)

```yaml
# docker-compose.yml
include:
  - path: ./monitoring/docker-compose.yml
  - path: ./logging/docker-compose.yml

services:
  api:
    image: myapi
```

### 10.3 Extends

```yaml
# common.yml
services:
  base-app:
    build: .
    environment:
      NODE_ENV: production
    logging:
      driver: json-file
      options:
        max-size: "10m"

# docker-compose.yml
services:
  api:
    extends:
      file: common.yml
      service: base-app
    ports:
      - "3000:3000"
    command: ["node", "api.js"]

  worker:
    extends:
      file: common.yml
      service: base-app
    command: ["node", "worker.js"]
```

---

## 11. Development Workflows

### 11.1 Node.js Hot-Reload Setup

```yaml
services:
  api:
    build:
      context: .
      target: development
    volumes:
      - ./src:/app/src                    # source code (hot-reload)
      - node_modules:/app/node_modules    # deps in volume (performance)
    ports:
      - "3000:3000"
      - "9229:9229"                       # debugger port
    command: ["npx", "nodemon", "--inspect=0.0.0.0:9229", "src/index.js"]
    environment:
      NODE_ENV: development

volumes:
  node_modules:
```

### 11.2 Python Hot-Reload Setup

```yaml
services:
  api:
    build: .
    volumes:
      - ./:/app
    ports:
      - "8000:8000"
      - "5678:5678"                       # debugpy port
    command: >
      python -m debugpy --listen 0.0.0.0:5678
      -m uvicorn app:app --reload --host 0.0.0.0
    environment:
      PYTHONDONTWRITEBYTECODE: "1"
```

### 11.3 Go Hot-Reload Setup

```yaml
services:
  api:
    build:
      context: .
      target: development
    volumes:
      - ./:/app
    ports:
      - "8080:8080"
      - "2345:2345"                       # delve debugger
    command: >
      air -build.cmd "go build -gcflags='all=-N -l' -o /tmp/app ."
          -build.bin "/tmp/app"
```

---

## 12. Compose in CI/CD

### 12.1 Running Tests

```yaml
# docker-compose.test.yml
services:
  test:
    build:
      context: .
      target: tester
    depends_on:
      db:
        condition: service_healthy
    command: ["npm", "test"]
    environment:
      DATABASE_URL: postgres://postgres:test@db:5432/testdb

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 10
```

```bash
# CI script
$ docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test
# --abort-on-container-exit: stop all services when any exits
# --exit-code-from test: use test service's exit code as the CI exit code
```

### 12.2 Teardown

```bash
# Clean up after CI
$ docker compose -f docker-compose.test.yml down --volumes --remove-orphans
# --volumes: remove named volumes (test data)
# --remove-orphans: remove containers from removed services
```

---

## 13. Real-World Example: Microservice Architecture

```yaml
# docker-compose.yml
services:
  # --- API Gateway ---
  gateway:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      api:
        condition: service_healthy
    networks:
      - frontend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s

  # --- Application API ---
  api:
    build:
      context: ./api
      target: production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/myapp
      REDIS_URL: redis://redis:6379/0
      RABBITMQ_URL: amqp://app:${RABBIT_PASSWORD}@rabbitmq:5672/
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - frontend
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s

  # --- Background Worker ---
  worker:
    build:
      context: ./api
      target: production
    command: ["node", "worker.js"]
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/myapp
      REDIS_URL: redis://redis:6379/0
      RABBITMQ_URL: amqp://app:${RABBIT_PASSWORD}@rabbitmq:5672/
    depends_on:
      db:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped

  # --- Database ---
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    networks:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d myapp"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 15s
    deploy:
      resources:
        limits:
          memory: 1G

  # --- Cache ---
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    volumes:
      - redisdata:/data
    networks:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- Message Queue ---
  rabbitmq:
    image: rabbitmq:3-management-alpine
    volumes:
      - rabbitdata:/var/lib/rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: ${RABBIT_PASSWORD}
    ports:
      - "15672:15672"     # management UI (dev only, remove in prod)
    networks:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # --- Monitoring (profile-based) ---
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - promdata:/prometheus
    ports:
      - "9090:9090"
    networks:
      - backend
    profiles:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafanadata:/var/lib/grafana
    ports:
      - "3001:3000"
    networks:
      - backend
    profiles:
      - monitoring

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true

volumes:
  pgdata:
  redisdata:
  rabbitdata:
  promdata:
  grafanadata:
```

---

## 14. Gotchas

### 14.1 depends_on Does NOT Wait for Ready

Without `condition: service_healthy`, `depends_on` only waits for the container to START, not for the application inside to be ready. A database container starts quickly but PostgreSQL might take 10+ seconds to be ready.

### 14.2 Container Naming and Scaling

Compose uses `{project}-{service}-{number}` naming. If you set `container_name:`, you cannot scale that service above 1 replica.

### 14.3 .env File Is for Compose, Not Containers

The `.env` file is read by Compose for variable interpolation in the YAML file. It is NOT automatically passed to containers. Use `env_file:` or `environment:` for that.

### 14.4 Volume Removal Requires --volumes

`docker compose down` does NOT remove volumes. Data persists by default. Use `docker compose down --volumes` to also remove named volumes.

### 14.5 Build Context Is Relative to Compose File

```yaml
services:
  api:
    build:
      context: ./api    # relative to docker-compose.yml location
```

### 14.6 Port Conflicts on Restart

If you `docker compose down` and `up` quickly, the host port might still be in TIME_WAIT. Wait a moment or use `docker compose restart`.

### 14.7 orphan Container Warnings

Adding or removing services from a compose file leaves "orphan" containers from the old configuration. Use `docker compose up --remove-orphans` or `docker compose down --remove-orphans`.

### 14.8 Environment Variable Escaping

Dollar signs in environment values must be escaped with `$$`:

```yaml
environment:
  REGEX: "$$USER"         # literal $USER in the container
  INTERP: "${USER}"       # interpolated from host/env
```

### 14.9 Compose Project Name Affects Everything

The project name (default: directory name) prefixes all resources. Changing the directory name or using `-p` creates a completely separate stack with separate networks and volumes.

### 14.10 Restart Policy and docker compose stop

`restart: always` means the container restarts even after `docker compose stop`. Use `restart: unless-stopped` to respect manual stops.

---

## 15. Common Interview Questions

### Q1: "Design a docker-compose.yml for a microservice architecture with API, worker, database, cache, and message queue"

**Strong answer:** See Section 13 above for a complete, production-grade example. Key points to highlight:

- Separate frontend and backend networks (gateway and API on frontend, everything internal on backend with `internal: true`)
- Health checks on every service with appropriate intervals and start periods
- depends_on with `condition: service_healthy` for proper startup ordering
- Named volumes for all stateful services
- Resource limits via deploy.resources
- Environment variables via `.env` file (never hardcoded secrets)
- Profiles for optional services (monitoring)
- Restart policies for resilience

---

### Q2: "What is the difference between depends_on and health checks?"

**Strong answer:**

`depends_on` controls startup ordering between services. Without a condition, it only ensures the dependency's container is running -- not that the application inside is ready. A PostgreSQL container starts in ~1 second, but the database might take 10 seconds to accept connections. Services that start before the database is ready will fail.

Health checks (`healthcheck:`) define how Docker determines if a service is healthy. The health check runs periodically inside the container and reports healthy/unhealthy status.

The two work together: `depends_on` with `condition: service_healthy` means "do not start this service until the dependency's health check passes." This is the correct way to handle startup ordering for services that need warm-up time. Without health checks, `depends_on` gives you ordering but not readiness -- the service might start before its dependencies are actually ready.

---

### Q3: "How do you handle environment variables and secrets in Compose?"

**Strong answer:**

For non-sensitive configuration, I use a combination of `.env` files and the `environment:` key. The `.env` file provides defaults that Compose interpolates into the YAML. Service-specific variables go in `environment:` or `env_file:`. The precedence is: CLI > environment key > env_file > .env.

For secrets, never put them in the compose file or `.env` files committed to git. Options: (1) Use a `.env.local` file that is in `.gitignore`. (2) Inject from CI/CD environment variables. (3) Use Docker secrets (`secrets:` key) which mount as files in `/run/secrets/`. (4) Use a secrets manager (Vault, AWS Secrets Manager) and fetch at runtime.

For different environments, I use compose override files: `docker-compose.yml` (base) + `docker-compose.override.yml` (dev, auto-loaded) + `docker-compose.prod.yml` (production, explicit with `-f`). This keeps environment-specific configuration separate and composable.

---

### Q4: "How do you use Compose for testing in CI/CD?"

**Strong answer:**

I create a dedicated test compose file (`docker-compose.test.yml`) that spins up the application and its dependencies, runs the test suite, and exits with the test exit code:

```bash
docker compose -f docker-compose.test.yml up \
  --build \
  --abort-on-container-exit \
  --exit-code-from test
```

`--abort-on-container-exit` stops all services when any container exits (the test runner). `--exit-code-from test` uses the test service's exit code as the command's exit code, so CI fails if tests fail.

After tests, `docker compose down --volumes --remove-orphans` cleans up everything including test databases. The test compose file uses health checks with short intervals to minimize startup wait time.

For parallel test runs in CI, I use the `-p` flag with unique project names so multiple test runs do not conflict on the same agent.

---

### Q5: "How do you manage different environments (dev, staging, prod) with Compose?"

**Strong answer:**

I use compose file layering:

1. `docker-compose.yml`: Base configuration (services, networks, volumes)
2. `docker-compose.override.yml`: Development defaults (bind mounts, debug ports, hot-reload) -- auto-loaded
3. `docker-compose.staging.yml`: Staging overrides (real images, resource limits)
4. `docker-compose.prod.yml`: Production overrides (registry images, replicas, strict security)

Development: `docker compose up` (auto-loads base + override)
Staging: `docker compose -f docker-compose.yml -f docker-compose.staging.yml up`
Production: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up`

Key differences between environments: Dev uses `build:` and bind mounts. Prod uses `image:` from a registry with pinned tags. Dev has debug ports exposed. Prod has resource limits, read-only filesystems, and dropped capabilities. Profiles enable monitoring and debugging tools per-environment.

---

## 16. Quick Reference

| Command | Purpose |
|---------|---------|
| `docker compose up -d` | Start services in background |
| `docker compose down` | Stop and remove containers, networks |
| `docker compose down -v` | Also remove volumes |
| `docker compose ps` | List running services |
| `docker compose logs -f api` | Follow logs for a service |
| `docker compose exec api sh` | Shell into running service |
| `docker compose build` | Build/rebuild images |
| `docker compose pull` | Pull latest images |
| `docker compose restart api` | Restart a service |
| `docker compose stop` | Stop without removing |
| `docker compose config` | Validate and view resolved config |
| `docker compose --profile X up` | Start with profile |
| `docker compose watch` | File sync and rebuild mode |
| `docker compose up --scale api=3` | Scale a service |
| `docker compose cp api:/path ./` | Copy files from service |
| `docker compose top` | Show running processes |
