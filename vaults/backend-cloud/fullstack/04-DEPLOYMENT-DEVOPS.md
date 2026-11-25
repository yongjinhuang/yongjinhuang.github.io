# Deployment & DevOps

## Overview

Deployment and DevOps knowledge is essential for full-stack engineers because writing code is only half the battle. You need to reliably ship that code to production, keep it running, and iterate quickly. Modern teams expect developers to own the full lifecycle of their services, from writing code to deploying it, monitoring it, and rolling back when things go wrong. Understanding CI/CD, containers, orchestration, and infrastructure as code separates senior engineers from those who only work in local development environments.

In interviews, these topics signal that you can operate independently, reduce bottleneck on dedicated ops teams, and build systems that are resilient and observable from day one.

---

## Core Concepts

### CI/CD Pipelines

Continuous Integration (CI) is the practice of automatically building and testing every code change. Continuous Deployment (CD) extends this by automatically deploying passing builds to production.

**Key principles:**

- Every commit triggers an automated pipeline
- Tests must pass before merging
- Builds are reproducible and deterministic
- Deployments are automated, not manual

**GitHub Actions** is the most common CI/CD tool in the GitHub ecosystem. Workflows are defined as YAML files in `.github/workflows/`.

**GitLab CI** uses a `.gitlab-ci.yml` file at the repository root and offers built-in container registry, environments, and review apps.

**Pipeline stages typically include:**

1. **Lint** - Code style and static analysis
2. **Build** - Compile/bundle the application
3. **Test** - Unit, integration, and E2E tests
4. **Security** - Dependency scanning, SAST
5. **Deploy** - Push to target environment
6. **Smoke Test** - Verify deployment health

### Docker

Docker packages applications into lightweight, portable containers that run consistently across environments.

**Core concepts:**

- **Image** - A read-only template with the application and its dependencies
- **Container** - A running instance of an image
- **Dockerfile** - Instructions to build an image
- **Layer caching** - Docker caches each instruction layer; ordering matters for build speed
- **Multi-stage builds** - Use multiple FROM statements to keep final images small

**Multi-stage build benefits:**

- Build dependencies stay out of the production image
- Final image contains only the runtime and built artifacts
- Dramatically reduces image size (often 10x smaller)

### Docker Compose

Docker Compose defines and runs multi-container applications using a `docker-compose.yml` file.

**Use cases:**

- Local development environments with databases, caches, and message queues
- Integration testing with real service dependencies
- Consistent development setups across a team

### Kubernetes Basics

Kubernetes (K8s) orchestrates containerized applications across a cluster of machines.

**Key resources:**

- **Pod** - The smallest deployable unit; one or more containers sharing network/storage
- **Service** - A stable network endpoint that routes traffic to pods
- **Deployment** - Manages pod replicas, rolling updates, and rollbacks
- **Ingress** - HTTP routing rules to expose services externally
- **ConfigMap / Secret** - External configuration and sensitive data management
- **Namespace** - Logical isolation within a cluster

**Pod lifecycle:**
Pending -> Running -> Succeeded/Failed

**Service types:**

- `ClusterIP` - Internal cluster access only (default)
- `NodePort` - Exposes on each node's IP at a static port
- `LoadBalancer` - Provisions an external load balancer

### Environment Management

Typical environment progression:

| Environment | Purpose            | Data                 | Access         |
| ----------- | ------------------ | -------------------- | -------------- |
| Local       | Developer machine  | Seed/mock data       | Developer only |
| Dev         | Shared development | Synthetic data       | Team           |
| Staging     | Pre-production     | Production-like data | Team + QA      |
| Production  | Live users         | Real data            | Restricted     |

**Best practices:**

- Environment parity: keep staging as close to production as possible
- Use environment variables for configuration (12-Factor App methodology)
- Never hardcode environment-specific values
- Use feature flags to decouple deployment from release

### Deployment Strategies

**Rolling deployment:**

- Gradually replaces old instances with new ones
- No downtime but both versions run simultaneously during rollout
- Default strategy in Kubernetes

**Blue-green deployment:**

- Run two identical environments (blue = current, green = new)
- Switch traffic from blue to green once validated
- Instant rollback by switching back
- Requires double the infrastructure

**Canary deployment:**

- Route a small percentage of traffic (e.g., 5%) to the new version
- Monitor error rates and performance metrics
- Gradually increase traffic if healthy
- Minimizes blast radius of bad deployments

**Feature flags:**

- Decouple deployment from feature release
- Enable/disable features without code deployment
- Support A/B testing and gradual rollouts

### Infrastructure as Code (IaC)

Infrastructure as Code means managing infrastructure through declarative configuration files rather than manual processes.

**Terraform** is the most popular IaC tool:

- Uses HCL (HashiCorp Configuration Language)
- Provider-agnostic (AWS, GCP, Azure, etc.)
- Maintains state to track resource changes
- `terraform plan` shows what will change before applying
- `terraform apply` executes the changes
- Modules enable reusable infrastructure components

**Key Terraform concepts:**

- **Provider** - Plugin for a specific cloud or service
- **Resource** - A single infrastructure component
- **State** - Current known state of infrastructure
- **Module** - Reusable group of resources
- **Variables** - Input parameters for configuration

### Cloud Providers

**AWS (Amazon Web Services):**

- EC2 - Virtual servers
- S3 - Object storage
- RDS - Managed databases
- Lambda - Serverless functions
- ECS/EKS - Container orchestration
- CloudFront - CDN
- SQS/SNS - Messaging

**GCP (Google Cloud Platform):**

- Compute Engine - Virtual machines
- Cloud Storage - Object storage
- Cloud SQL - Managed databases
- Cloud Functions - Serverless functions
- GKE - Managed Kubernetes
- Cloud CDN - Content delivery
- Pub/Sub - Messaging

### Serverless

Serverless abstracts away server management entirely. You deploy functions, and the platform handles scaling, availability, and infrastructure.

**AWS Lambda:**

- Event-driven execution
- Pay per invocation and duration
- Cold start latency is a consideration
- Integrates with API Gateway, S3, DynamoDB, SQS

**Vercel / Netlify:**

- Optimized for frontend frameworks (Next.js, Nuxt)
- Edge functions for low-latency responses
- Automatic preview deployments per PR
- Built-in CDN and SSL

**Serverless trade-offs:**

- Pros: No infrastructure management, automatic scaling, pay-per-use
- Cons: Cold starts, vendor lock-in, limited execution time, harder debugging

---

## Practical Scenarios

### Scenario 1: Setting Up CI/CD for a New Service

You are building a new Node.js microservice. You need automated testing and deployment.

**Approach:**

1. Create a GitHub Actions workflow that triggers on push and PR
2. Run linting and unit tests in parallel
3. Build the Docker image if tests pass
4. Push the image to a container registry (ECR, GHCR)
5. Deploy to staging automatically on merge to `main`
6. Require manual approval for production deployment
7. Run smoke tests after deployment
8. Notify the team via Slack on success or failure

### Scenario 2: Migrating from VMs to Containers

Your team runs applications on EC2 instances managed with Ansible. You want to move to containers.

**Approach:**

1. Write Dockerfiles for each service with multi-stage builds
2. Set up a container registry
3. Create docker-compose files for local development
4. Deploy to ECS or EKS with Terraform
5. Set up health checks and readiness probes
6. Implement centralized logging (CloudWatch, ELK)
7. Configure auto-scaling policies
8. Migrate one service at a time, starting with the least critical

### Scenario 3: Zero-Downtime Database Migration

You need to change a database schema without any downtime.

**Approach:**

1. Add new columns/tables (backward compatible)
2. Deploy new code that writes to both old and new schema
3. Backfill existing data
4. Deploy code that reads from the new schema
5. Remove writes to the old schema
6. Clean up old columns/tables after a safe period

### Scenario 4: Handling a Production Incident

A deployment causes a spike in 500 errors.

**Approach:**

1. Detect via monitoring alerts (error rate threshold exceeded)
2. Trigger automatic rollback or manually roll back
3. Communicate status to stakeholders
4. Investigate root cause using logs and traces
5. Write a postmortem with timeline, root cause, and action items
6. Add tests and monitoring to prevent recurrence

---

## Interview Questions

### Q1: Walk me through how you would set up a CI/CD pipeline for a full-stack application.

**Answer:**

I would structure the pipeline in stages with clear gates between them:

**CI phase (triggered on every push/PR):**

- Install dependencies with lockfile for reproducibility
- Run linting and type checking in parallel
- Run unit tests with coverage reporting
- Run integration tests (using Docker Compose for dependencies)
- Build the application and Docker image
- Run security scanning (dependency audit, SAST)

**CD phase (triggered on merge to main):**

- Tag the Docker image with commit SHA and `latest`
- Push to container registry
- Deploy to staging environment automatically
- Run E2E smoke tests against staging
- Wait for manual approval for production
- Deploy to production using canary strategy
- Monitor error rates for 15 minutes
- Promote to full rollout or auto-rollback

**Key considerations:**

- Cache dependencies between runs to speed up pipelines
- Use matrix builds for testing against multiple versions
- Store secrets in the CI platform's secret manager, not in code
- Keep pipeline configuration in version control
- Set up notifications for failures

### Q2: Explain Docker multi-stage builds and why they matter.

**Answer:**

Multi-stage builds use multiple `FROM` statements in a single Dockerfile. Each stage can use a different base image, and you can selectively copy artifacts from one stage to another.

**Why they matter:**

- **Smaller images**: The final image only contains the runtime and built artifacts, not build tools, source code, or dev dependencies
- **Security**: Fewer packages in the final image means a smaller attack surface
- **Speed**: Smaller images push and pull faster from registries
- **Separation of concerns**: Build environment is isolated from runtime

A typical Node.js multi-stage build might produce a final image of 150MB versus 1.2GB without multi-stage builds. For Go applications, you can use `scratch` or `distroless` as the final base, resulting in images under 20MB.

### Q3: What is the difference between blue-green and canary deployments? When would you use each?

**Answer:**

**Blue-green** maintains two complete environments. You deploy the new version to the idle environment, validate it, and switch all traffic at once. Rollback is instant (switch back).

**Canary** gradually routes increasing percentages of traffic to the new version while monitoring for issues. If problems arise, you route traffic back to the stable version.

**When to use blue-green:**

- When you need instant, all-or-nothing rollback
- When your application has session affinity requirements
- When you need to validate the full environment before any users see it
- Simpler to implement and reason about

**When to use canary:**

- When you want to minimize blast radius
- When you have sufficient traffic for statistical significance
- When you have good observability (metrics, alerts)
- When a full second environment is cost-prohibitive
- For applications serving diverse user segments

### Q4: How does Kubernetes handle scaling and self-healing?

**Answer:**

**Scaling:**

- **Horizontal Pod Autoscaler (HPA)** adjusts the number of pod replicas based on CPU/memory utilization or custom metrics
- **Vertical Pod Autoscaler (VPA)** adjusts resource requests/limits for containers
- **Cluster Autoscaler** adds or removes nodes based on pending pods that cannot be scheduled

**Self-healing:**

- **Liveness probes** detect when a container is stuck and restart it
- **Readiness probes** detect when a container is not ready to serve traffic and remove it from the service endpoint
- **Startup probes** give slow-starting containers time before liveness probes kick in
- **ReplicaSet** ensures the desired number of pod replicas are always running
- If a pod crashes, Kubernetes automatically restarts it with exponential backoff
- If a node fails, pods are rescheduled to healthy nodes

### Q5: What is Infrastructure as Code and why is it important?

**Answer:**

Infrastructure as Code (IaC) means defining your infrastructure in version-controlled configuration files rather than manually provisioning resources through a console.

**Benefits:**

- **Reproducibility**: Spin up identical environments reliably
- **Version control**: Track changes, review diffs, audit history
- **Collaboration**: Team members can review infrastructure changes like code
- **Disaster recovery**: Recreate entire infrastructure from configuration files
- **Consistency**: Eliminate configuration drift between environments
- **Automation**: Infrastructure changes go through the same CI/CD pipeline as code

**Terraform workflow:**

1. `terraform init` - Initialize providers and modules
2. `terraform plan` - Preview changes before applying
3. `terraform apply` - Execute the planned changes
4. `terraform destroy` - Tear down infrastructure

**State management:**

- Terraform stores state remotely (S3 + DynamoDB for locking)
- State tracks the mapping between configuration and real resources
- State locking prevents concurrent modifications

### Q6: When would you choose serverless over containers?

**Answer:**

**Choose serverless when:**

- Traffic is unpredictable or bursty
- You want zero infrastructure management
- Functions are short-lived (under 15 minutes)
- You need rapid development and deployment
- Cost optimization matters for low-traffic services
- Event-driven architecture fits the use case

**Choose containers when:**

- You need long-running processes
- You require fine-grained control over the runtime
- Cold start latency is unacceptable
- You want to avoid vendor lock-in
- The application has complex dependencies
- You need persistent connections (WebSockets)
- Consistent performance is critical

**Hybrid approach:**
Many production systems use both. For example, a containerized API service for core traffic combined with Lambda functions for asynchronous processing like image resizing, PDF generation, or webhook handling.

### Q7: How do you manage secrets across multiple environments?

**Answer:**

**Principles:**

- Never commit secrets to version control
- Rotate secrets regularly
- Use the principle of least privilege
- Audit secret access

**Tools and approaches:**

- **Environment variables** for simple cases (set in CI/CD platform)
- **AWS Secrets Manager / GCP Secret Manager** for cloud-native secret storage
- **HashiCorp Vault** for cross-cloud secret management with dynamic credentials
- **Kubernetes Secrets** (base64-encoded, not encrypted by default; use sealed secrets or external secrets operator)
- **CI/CD platform secrets** (GitHub Actions secrets, GitLab CI variables)

**Best practices:**

- Use different secrets per environment
- Inject secrets at runtime, not build time
- Encrypt secrets at rest and in transit
- Set up alerts for unauthorized access attempts

---

## Code Examples

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type Check
        run: npm run typecheck

      - name: Unit Tests
        run: npm test -- --coverage

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  integration-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Run Migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: postgres://postgres:testpass@localhost:5432/testdb
      - name: Integration Tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://postgres:testpass@localhost:5432/testdb

  build-and-push:
    needs: [lint-and-test, integration-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        run: |
          kubectl set image deployment/api \
            api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace=staging
          kubectl rollout status deployment/api --namespace=staging --timeout=300s

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://api.example.com
    steps:
      - name: Deploy to Production (Canary)
        run: |
          kubectl set image deployment/api-canary \
            api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace=production
          kubectl rollout status deployment/api-canary --namespace=production --timeout=300s
```

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_modules && \
    npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=deps /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Docker Compose for Local Development

```yaml
# docker-compose.yml
version: '3.9'

services:
  api:
    build:
      context: .
      target: builder
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://postgres:devpass@db:5432/appdb
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    command: npm run dev

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: devpass
      POSTGRES_DB: appdb
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### Kubernetes Deployment Manifest

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production
  labels:
    app: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/myorg/api:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: database-url
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: production
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

### Terraform Configuration

```hcl
# main.tf
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "myapp-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  name = "${var.project}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# RDS
resource "aws_db_instance" "main" {
  identifier        = "${var.project}-db"
  engine            = "postgres"
  engine_version    = "16.1"
  instance_class    = "db.t3.medium"
  allocated_storage = 20

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period = 7
  multi_az               = true
  skip_final_snapshot    = false
}

# Variables
variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "project" {
  description = "Project name"
  default     = "myapp"
}

variable "db_name" {
  description = "Database name"
}

variable "db_username" {
  description = "Database username"
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  sensitive   = true
}
```

### Serverless Function (AWS Lambda with API Gateway)

```typescript
// handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: string;
}

const createResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

export const getUser = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.id;

    if (!userId) {
      return createResponse(400, {
        success: false,
        error: 'User ID is required',
      });
    }

    // Fetch user from DynamoDB or RDS
    const user: User = await fetchUserById(userId);

    return createResponse(200, {
      success: true,
      data: user,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return createResponse(500, {
      success: false,
      error: message,
    });
  }
};
```

---

## Quick Reference

### Docker Commands Cheat Sheet

```bash
# Build and run
docker build -t myapp:latest .
docker run -d -p 3000:3000 --name myapp myapp:latest

# Inspect
docker ps                          # List running containers
docker logs -f myapp               # Follow container logs
docker exec -it myapp /bin/sh      # Shell into container

# Cleanup
docker system prune -a             # Remove unused images/containers
docker volume prune                # Remove unused volumes

# Compose
docker-compose up -d               # Start services in background
docker-compose down -v             # Stop and remove volumes
docker-compose logs -f api         # Follow service logs
```

### Kubernetes Commands Cheat Sheet

```bash
# Cluster info
kubectl cluster-info
kubectl get nodes

# Deployments
kubectl get deployments -n production
kubectl describe deployment api -n production
kubectl rollout status deployment/api -n production
kubectl rollout undo deployment/api -n production

# Pods
kubectl get pods -n production
kubectl logs -f pod/api-xyz -n production
kubectl exec -it pod/api-xyz -- /bin/sh

# Scaling
kubectl scale deployment/api --replicas=5 -n production
kubectl autoscale deployment/api --min=3 --max=10 --cpu-percent=70

# Debugging
kubectl describe pod api-xyz -n production
kubectl get events --sort-by=.metadata.creationTimestamp
```

### Terraform Commands Cheat Sheet

```bash
terraform init        # Initialize and download providers
terraform plan        # Preview changes
terraform apply       # Apply changes
terraform destroy     # Tear down all resources
terraform state list  # List resources in state
terraform output      # Show output values
terraform import      # Import existing resources
terraform validate    # Validate configuration syntax
```

### Environment Variable Checklist

```
PORT=3000
NODE_ENV=production
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=<from-secret-manager>
API_KEY=<from-secret-manager>
LOG_LEVEL=info
CORS_ORIGIN=https://app.example.com
```

### Deployment Strategy Comparison

| Strategy   | Downtime | Risk   | Rollback Speed | Cost            |
| ---------- | -------- | ------ | -------------- | --------------- |
| Rolling    | None     | Medium | Slow           | Low             |
| Blue-Green | None     | Low    | Instant        | High (2x infra) |
| Canary     | None     | Low    | Fast           | Medium          |
| Recreate   | Yes      | High   | Slow           | Low             |

### Health Check Endpoints Pattern

```
GET /health    -> 200 { "status": "ok" }           # Liveness
GET /ready     -> 200 { "status": "ready" }         # Readiness (DB, cache connected)
GET /metrics   -> Prometheus format metrics          # Observability
GET /version   -> 200 { "version": "1.2.3", "sha": "abc123" }
```
