# AWS Services Overview for Engineers

AWS has 200+ services. You do not need all of them. This guide covers the ~25 services that matter most for building and operating production systems, organized by function.

---

## Service Map

### Identity & Networking Foundation

| Service | One-Liner |
|---------|-----------|
| **IAM** | Who can do what to which resource |
| **VPC** | Your private network in the cloud |
| **Route 53** | DNS + health checks + routing policies |

### Compute

| Service | One-Liner |
|---------|-----------|
| **EC2** | Virtual machines you fully control |
| **Lambda** | Run code without managing servers |
| **ECS / EKS** | Run containers (Docker-managed vs Kubernetes-managed) |
| **Fargate** | Serverless compute engine for containers |

### Storage & Databases

| Service | One-Liner |
|---------|-----------|
| **S3** | Infinite object storage with 11 nines durability |
| **RDS / Aurora** | Managed relational databases (Postgres, MySQL) |
| **DynamoDB** | Serverless NoSQL with single-digit ms latency |
| **ElastiCache** | Managed Redis or Memcached |
| **Redshift** | Columnar data warehouse for analytics |

### Networking & Content Delivery

| Service | One-Liner |
|---------|-----------|
| **ALB / NLB** | Layer 7 (HTTP) and Layer 4 (TCP) load balancers |
| **CloudFront** | Global CDN with edge caching |
| **API Gateway** | Managed REST/WebSocket/HTTP API front door |

### Messaging & Events

| Service | One-Liner |
|---------|-----------|
| **SQS** | Managed message queue (decoupling) |
| **SNS** | Pub/sub fan-out notifications |
| **EventBridge** | Serverless event bus for event-driven architectures |
| **Kinesis** | Real-time data streaming |

### Security & Encryption

| Service | One-Liner |
|---------|-----------|
| **KMS** | Managed encryption keys |
| **Secrets Manager** | Rotate and retrieve secrets programmatically |
| **WAF / Shield** | Web application firewall + DDoS protection |
| **Cognito** | User sign-up, sign-in, and access control |

### Observability

| Service | One-Liner |
|---------|-----------|
| **CloudWatch** | Metrics, logs, alarms, dashboards |
| **CloudTrail** | Audit log of every API call in your account |
| **X-Ray** | Distributed tracing for microservices |

### DevOps & IaC

| Service | One-Liner |
|---------|-----------|
| **CloudFormation** | Infrastructure as Code (YAML/JSON templates) |
| **CDK** | IaC using real programming languages (TypeScript, Python) |
| **CodePipeline** | Managed CI/CD pipeline |
| **Systems Manager** | Operational hub: parameter store, patching, run commands |
| **Step Functions** | Visual workflow orchestration for distributed apps |

### Other Essentials

| Service | One-Liner |
|---------|-----------|
| **ECR** | Private Docker container registry |
| **SES** | Transactional and bulk email |

---

## How to Think About AWS

**Rule 1: Start with the problem, not the service.** AWS markets services aggressively. Ask "what problem am I solving?" before picking a service.

**Rule 2: Managed > Self-hosted.** Unless you have a very specific reason, use managed services. You're paying for someone else's on-call rotation.

**Rule 3: Region and AZ awareness.** Every resource lives in a Region (e.g., `us-east-1`) and usually an Availability Zone (e.g., `us-east-1a`). Design for multi-AZ from day one.

**Rule 4: Everything is an API call.** The AWS Console is just a GUI over the API. Learn the CLI and SDKs -- that's how you automate.

**Rule 5: Least privilege everywhere.** Every service, every role, every user gets the minimum permissions needed. No `*` wildcards in production.

---

## Essential CLI Setup

```bash
# Install AWS CLI
brew install awscli

# Configure credentials
aws configure
# AWS Access Key ID: ****
# AWS Secret Access Key: ****
# Default region name: us-east-1
# Default output format: json

# Use named profiles for multiple accounts
aws configure --profile staging
aws s3 ls --profile staging

# Use SSO (recommended for organizations)
aws configure sso
aws sso login --profile my-sso-profile
```

## Key CLI Patterns

```bash
# Describe / List (read)
aws ec2 describe-instances --filters "Name=tag:Env,Values=prod"
aws s3 ls s3://my-bucket/prefix/

# Create / Put (write)
aws s3 cp ./file.txt s3://my-bucket/
aws ec2 run-instances --image-id ami-xxx --instance-type t3.micro

# Use --query for JMESPath filtering
aws ec2 describe-instances --query 'Reservations[].Instances[].{ID:InstanceId,State:State.Name}'

# Use --output for format control
aws iam list-users --output table
```
