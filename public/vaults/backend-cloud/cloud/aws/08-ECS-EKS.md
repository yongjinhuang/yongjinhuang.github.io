# Container Services: ECS, EKS, Fargate, and ECR

AWS provides multiple ways to run containers in production. ECS (Elastic Container Service) is AWS's proprietary orchestrator. EKS (Elastic Kubernetes Service) is managed Kubernetes. Fargate is a serverless compute engine that works with both ECS and EKS, removing the need to manage EC2 instances. ECR (Elastic Container Registry) is the private Docker registry that ties them all together. Choosing between these services is one of the most consequential infrastructure decisions you will make.

---

## When to Use What

| Requirement                   | Lambda      | ECS/Fargate           | ECS/EC2             | EKS                           |
| ----------------------------- | ----------- | --------------------- | ------------------- | ----------------------------- |
| Execution duration            | < 15 min    | Hours to indefinite   | Hours to indefinite | Hours to indefinite           |
| Request-driven, low traffic   | Best fit    | Overkill              | Overkill            | Overkill                      |
| Steady-state HTTP services    | Poor fit    | Good fit              | Good fit            | Good fit                      |
| Need GPUs                     | No          | No                    | Yes                 | Yes                           |
| K8s ecosystem required        | No          | No                    | No                  | Required                      |
| Minimize ops overhead         | Lowest      | Low                   | Medium              | High                          |
| Fine-grained instance control | No          | No                    | Yes                 | Yes                           |
| Cost at scale                 | Expensive   | Medium                | Cheapest            | Medium + $73/mo control plane |
| Startup latency sensitive     | Cold starts | Seconds (task launch) | Seconds             | Seconds                       |

**Rule of thumb:** Start with Lambda. When you hit its limits (duration, payload size, sustained load economics), move to ECS on Fargate. Reach for EKS only if you need Kubernetes-specific features or your team already runs K8s.

---

## ECS: Elastic Container Service

ECS is AWS's container orchestrator. You define what to run (task definitions), how many to run (services), and where to run them (clusters).

### Core Concepts

| Concept                  | Description                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Cluster**              | Logical grouping of tasks and services. Can span multiple AZs.                                                  |
| **Task Definition**      | Blueprint for your container(s). Specifies image, CPU, memory, ports, env vars, logging. Versioned (revisions). |
| **Task**                 | A running instance of a task definition. One or more containers running together.                               |
| **Service**              | Maintains a desired count of tasks. Handles rolling deploys, load balancer registration, auto-scaling.          |
| **Container Definition** | Configuration for a single container within a task definition. A task can have multiple containers (sidecars).  |

### Launch Types: EC2 vs Fargate

| Feature               | EC2 Launch Type                                 | Fargate Launch Type                     |
| --------------------- | ----------------------------------------------- | --------------------------------------- |
| Server management     | You manage EC2 instances                        | AWS manages infrastructure              |
| Pricing model         | Pay for EC2 instances (even idle)               | Pay per task (vCPU + memory per second) |
| GPU support           | Yes                                             | No                                      |
| Placement control     | Full (placement strategies, constraints)        | Limited (AZ spread)                     |
| EBS volumes           | Yes                                             | Ephemeral storage only (up to 200 GB)   |
| Privileged containers | Yes                                             | No                                      |
| Maximum task size     | Limited by instance type                        | 16 vCPU, 120 GB memory                  |
| Startup time          | Seconds (if capacity exists)                    | 30-60 seconds                           |
| Cost at steady state  | Cheaper (reserved instances, savings plans)     | ~30-40% more expensive                  |
| Best for              | Cost-optimized workloads, GPU, special hardware | Variable workloads, minimize ops        |

### Task Definition Anatomy

```json
{
  "family": "my-web-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/myAppTaskRole",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest",
      "portMappings": [{ "containerPort": 8080, "protocol": "tcp" }],
      "environment": [{ "name": "NODE_ENV", "value": "production" }],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:prod/db-AbCdEf"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-web-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "web"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:8080/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      },
      "essential": true
    }
  ]
}
```

**Key roles:**

- **Execution Role** (`executionRoleArn`): Used by the ECS agent to pull images from ECR, push logs to CloudWatch, and retrieve secrets. This is the infrastructure role.
- **Task Role** (`taskRoleArn`): Used by your application code to call AWS services (S3, DynamoDB, etc.). This is the application role.

### Service Discovery and Service Mesh

| Service                 | Purpose           | How It Works                                                                                                                    |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **AWS Cloud Map**       | Service discovery | Registers tasks as DNS records or API-discoverable instances. Other services resolve `my-service.my-namespace` to get task IPs. |
| **AWS App Mesh**        | Service mesh      | Envoy sidecar proxies for traffic management, observability, and mTLS between services.                                         |
| **ECS Service Connect** | Simplified mesh   | Built on Cloud Map + App Mesh. Easier to configure. Provides per-service load balancing and observability.                      |

### ECS Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/my-cluster/my-service \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 2 \
    --max-capacity 20

# Create target tracking scaling policy
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id service/my-cluster/my-service \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name cpu-tracking \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration \
        "TargetValue=70.0,PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization}"
```

---

## EKS: Elastic Kubernetes Service

EKS runs a managed Kubernetes control plane. AWS handles the API server, etcd, scheduler, and controller manager across multiple AZs. You manage the worker nodes (or use Fargate).

### Node Group Types

| Type                    | Description                                      | Best For                         |
| ----------------------- | ------------------------------------------------ | -------------------------------- |
| **Managed Node Groups** | AWS manages EC2 instances, AMI updates, draining | Most workloads                   |
| **Self-Managed Nodes**  | You manage the EC2 ASG and AMI                   | Custom AMIs, GPU, special config |
| **Fargate Profiles**    | Serverless pods -- no nodes to manage            | Batch jobs, burst workloads      |

### EKS Key Points

- **Control plane cost:** ~$73/month ($0.10/hour) regardless of cluster size
- **Worker nodes:** Standard EC2 pricing (or Fargate pricing)
- **Kubernetes version:** Must upgrade regularly (AWS supports ~4 minor versions at a time, ~12-14 months per version)
- **Networking:** Uses VPC CNI plugin -- each pod gets a real VPC IP address
- **Add-ons:** CoreDNS, kube-proxy, VPC CNI, EBS CSI driver are managed by AWS

### Kubernetes Auto Scaling

| Scaler                              | What It Scales          | How                                                                        |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| **HPA** (Horizontal Pod Autoscaler) | Pod replicas            | CPU/memory metrics or custom metrics                                       |
| **VPA** (Vertical Pod Autoscaler)   | Pod CPU/memory requests | Analyzes usage, adjusts resource requests                                  |
| **Karpenter**                       | Nodes                   | Provisions right-sized EC2 instances based on pending pods                 |
| **Cluster Autoscaler**              | Node groups             | Adjusts ASG desired count based on pending pods (legacy, prefer Karpenter) |

---

## ECR: Elastic Container Registry

ECR is AWS's managed Docker registry. Every account gets a private registry per region.

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Create repository
aws ecr create-repository \
    --repository-name my-app \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256

# Build, tag, push
docker build -t my-app .
docker tag my-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest

# List images
aws ecr describe-images --repository-name my-app \
    --query 'imageDetails[*].{Tag:imageTags[0],Size:imageSizeInBytes,Pushed:imagePushedAt}' \
    --output table
```

### Image Lifecycle Policies

Automatically clean up old images to save storage costs:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Delete untagged images older than 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

### Image Scanning

- **Basic scanning:** Scans on push using Clair (CVE database)
- **Enhanced scanning:** Continuous scanning using Amazon Inspector (costs extra, covers OS and language packages)

---

## Load Balancing

Both ECS and EKS integrate with Application Load Balancer (ALB) for HTTP traffic and Network Load Balancer (NLB) for TCP/UDP.

### ECS + ALB Pattern

```bash
# Create target group (IP type for awsvpc network mode / Fargate)
aws elbv2 create-target-group \
    --name my-service-tg \
    --protocol HTTP \
    --port 8080 \
    --vpc-id vpc-123456 \
    --target-type ip \
    --health-check-path /health

# ECS service registers tasks automatically when configured with a load balancer
aws ecs create-service \
    --cluster my-cluster \
    --service-name my-service \
    --task-definition my-app:3 \
    --desired-count 3 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-123],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...:targetgroup/my-service-tg/abc123,containerName=web,containerPort=8080"
```

**Path-based routing** lets you route different URL paths to different ECS services behind one ALB:

- `/api/*` -> API service target group
- `/admin/*` -> Admin service target group
- `/*` -> Frontend service target group

---

## Logging

### awslogs Driver (ECS)

Built-in log driver that ships container stdout/stderr to CloudWatch Logs. Configured in the task definition (see example above).

### Fluent Bit Sidecar

For more control (multi-destination, filtering, parsing), run Fluent Bit as a sidecar container or use the AWS FireLens integration:

```json
{
  "name": "log-router",
  "image": "public.ecr.aws/aws-observability/aws-for-fluent-bit:latest",
  "essential": true,
  "firelensConfiguration": {
    "type": "fluentbit",
    "options": {
      "config-file-type": "file",
      "config-file-value": "/fluent-bit/configs/output.conf"
    }
  }
}
```

---

## Common CLI Commands

```bash
# --- ECS ---
# Create cluster
aws ecs create-cluster --cluster-name my-cluster

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-def.json

# Run a one-off task
aws ecs run-task \
    --cluster my-cluster \
    --task-definition my-app:1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa],securityGroups=[sg-123],assignPublicIp=ENABLED}"

# Create a service
aws ecs create-service \
    --cluster my-cluster \
    --service-name my-service \
    --task-definition my-app:1 \
    --desired-count 3

# Force new deployment (pull latest image for same tag)
aws ecs update-service \
    --cluster my-cluster \
    --service-name my-service \
    --force-new-deployment

# List running tasks
aws ecs list-tasks --cluster my-cluster --service-name my-service

# Execute command in running container (ECS Exec)
aws ecs execute-command \
    --cluster my-cluster \
    --task abc123 \
    --container web \
    --interactive \
    --command "/bin/sh"

# --- ECR ---
# List repositories
aws ecr describe-repositories --query 'repositories[].repositoryName'

# Delete old images
aws ecr batch-delete-image \
    --repository-name my-app \
    --image-ids imageTag=old-tag
```

---

## ECS vs EKS Decision Matrix

| Factor                        | Choose ECS                     | Choose EKS                         |
| ----------------------------- | ------------------------------ | ---------------------------------- |
| Team K8s experience           | Little to none                 | Strong K8s skills                  |
| Multi-cloud strategy          | AWS-only                       | Need portability                   |
| Ecosystem needs               | AWS-native tooling is enough   | Need Helm, Istio, ArgoCD, etc.     |
| Operational overhead          | Want less                      | Willing to accept more             |
| Control plane cost            | Free                           | ~$73/month                         |
| Service mesh                  | ECS Service Connect / App Mesh | Istio, Linkerd, App Mesh           |
| GitOps                        | Possible but limited           | ArgoCD, Flux native support        |
| Batch workloads               | Basic (run-task)               | Mature (Jobs, CronJobs)            |
| Startup team                  | Prefer ECS                     | Prefer ECS (unless K8s experience) |
| Enterprise with platform team | Either                         | Often EKS                          |

---

## Common Gotchas

| Gotcha                          | Details                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fargate costs add up**        | Fargate is ~30-40% more expensive than equivalent EC2 capacity. At scale, the convenience premium is significant. Do the math.                                       |
| **EKS control plane cost**      | ~$73/month per cluster even with zero worker nodes. Dev, staging, and prod clusters add up fast.                                                                     |
| **Task role vs execution role** | Execution role is for ECS infrastructure (pull images, push logs). Task role is for your app code (access S3, DynamoDB). Confusing them leads to permissions errors. |
| **Docker Hub pull throttling**  | Docker Hub rate limits anonymous and free pulls (100/200 per 6 hours). Use ECR Public Gallery or ECR pull-through cache to avoid failures during deploys.            |
| **Image tag mutability**        | Using `latest` tag means you don't know what's running. Use immutable tags (git SHA, semver) for reproducible deployments.                                           |
| **awsvpc ENI limits**           | Each task in awsvpc mode gets an ENI. EC2 instances have ENI limits per type. You may run out of ENIs before running out of CPU/memory.                              |
| **Fargate spot termination**    | Fargate Spot can save ~70% but tasks can be interrupted with 30-second warning. Only use for fault-tolerant workloads.                                               |
| **EKS version upgrades**        | Kubernetes versions are supported for ~14 months. You must plan regular upgrades. Skipping versions is not supported.                                                |
| **Container health checks**     | ECS health checks and ALB health checks are separate. A container can be "healthy" to ECS but "unhealthy" to the ALB (or vice versa). Configure both correctly.      |
| **Secret injection latency**    | Fetching secrets from Secrets Manager at task startup adds latency. For Fargate, secrets are injected as env vars at launch -- plan for this in startup time.        |
