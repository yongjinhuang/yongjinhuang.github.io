# AWS CodePipeline, CodeBuild & CodeDeploy (CI/CD)

AWS provides a fully managed CI/CD toolchain: CodePipeline orchestrates the pipeline, CodeBuild compiles and tests your code, and CodeDeploy handles deployment to compute targets. Together they replace Jenkins, CircleCI, or GitHub Actions with native AWS integrations. CodeCommit (the managed Git repo) was deprecated in 2024 -- use GitHub, GitLab, or Bitbucket as your source. The entire stack is pay-per-use with no servers to manage.

---

## 1. The AWS CI/CD Ecosystem

```
Source          Build           Test            Deploy
+----------+   +-----------+   +-----------+   +-------------+
| GitHub   |-->| CodeBuild |-->| CodeBuild |-->| CodeDeploy  |
| S3       |   | (compile, |   | (unit,    |   | (EC2, ECS,  |
| ECR      |   |  package) |   |  integ)   |   |  Lambda)    |
+----------+   +-----------+   +-----------+   +-------------+
        \______________|_____________|________________/
                       |
                  CodePipeline (orchestrator)
```

---

## 2. CodePipeline

CodePipeline is the orchestrator. It defines a sequence of **stages**, each containing one or more **actions**. When source code changes, the pipeline triggers automatically.

### 2.1 Pipeline Structure

```
Pipeline
  |-- Stage: Source (GitHub, S3, ECR)
  |-- Stage: Build (CodeBuild)
  |-- Stage: Test (CodeBuild)
  |-- Stage: Approval (Manual)
  |-- Stage: Deploy (CodeDeploy, CloudFormation, ECS, S3)
```

Each stage must complete all actions before the next stage begins. Actions within a stage can run in parallel (using `runOrder`).

### 2.2 Source Stage Providers

| Provider | Trigger | Notes |
|----------|---------|-------|
| **GitHub (v2)** | Webhook via CodeStar Connections | Recommended. Uses app-based auth. |
| **S3** | CloudTrail event on object change | Good for artifact-triggered pipelines |
| **ECR** | Image push | Triggers when a new Docker image is pushed |
| **CodeCommit** | CloudWatch Event | Deprecated -- migrate away |

### 2.3 Artifacts

Each stage produces and consumes **artifacts** stored in an S3 bucket. The source stage outputs source code as an artifact. The build stage consumes it and outputs compiled artifacts. The deploy stage consumes build artifacts.

```bash
# Create a pipeline from JSON definition
aws codepipeline create-pipeline --cli-input-json file://pipeline.json

# Start a pipeline execution manually
aws codepipeline start-pipeline-execution --name my-pipeline

# Get pipeline status
aws codepipeline get-pipeline-state --name my-pipeline

# List pipelines
aws codepipeline list-pipelines
```

### 2.4 Manual Approval Actions

Insert a manual approval stage to gate deployments to production:

```json
{
  "name": "ApproveDeployment",
  "actionTypeId": {
    "category": "Approval",
    "owner": "AWS",
    "provider": "Manual",
    "version": "1"
  },
  "configuration": {
    "NotificationArn": "arn:aws:sns:us-east-1:123456789012:approvals",
    "CustomData": "Review staging deployment before promoting to prod"
  }
}
```

### 2.5 Cross-Account and Cross-Region

CodePipeline supports cross-account deployments using IAM roles and KMS keys. Cross-region actions require an artifact store (S3 bucket) in each region. The pipeline replicates artifacts automatically.

---

## 3. CodeBuild

CodeBuild is a fully managed build service. You provide a `buildspec.yml` and CodeBuild spins up a container, runs your build, and produces artifacts. No build servers to maintain.

### 3.1 buildspec.yml

```yaml
version: 0.2

env:
  variables:
    NODE_ENV: "production"
  parameter-store:
    DB_PASSWORD: "/myapp/db/password"
  secrets-manager:
    API_KEY: "myapp/api-key:API_KEY"

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm ci
  pre_build:
    commands:
      - echo "Running lint..."
      - npm run lint
  build:
    commands:
      - echo "Building..."
      - npm run build
  post_build:
    commands:
      - echo "Running tests..."
      - npm test

artifacts:
  files:
    - '**/*'
  base-directory: dist

cache:
  paths:
    - 'node_modules/**/*'

reports:
  test-results:
    files:
      - 'junit.xml'
    base-directory: test-reports
    file-format: JUNITXML
```

### 3.2 Compute Types

| Compute Type | vCPU | Memory | Use Case |
|-------------|------|--------|----------|
| BUILD_GENERAL1_SMALL | 2 | 3 GB | Small projects, linting |
| BUILD_GENERAL1_MEDIUM | 4 | 7 GB | Standard builds |
| BUILD_GENERAL1_LARGE | 8 | 15 GB | Large compilations, Docker builds |
| BUILD_GENERAL1_2XLARGE | 72 | 145 GB | Huge monorepos, ML model packaging |
| BUILD_LAMBDA_1GB-10GB | 1-10 | 1-10 GB | Fast, lightweight builds |

### 3.3 Key Features

- **Docker support**: Build Docker images inside CodeBuild (enable privileged mode)
- **Build caching**: Cache dependencies in S3 or local cache to speed up builds
- **Custom images**: Use any Docker image as your build environment
- **VPC support**: Run builds inside a VPC to access private resources
- **Concurrent builds**: Default limit of 60 concurrent builds (adjustable)
- **Lambda compute**: Faster startup, lower cost for lightweight builds

```bash
# Start a build
aws codebuild start-build --project-name my-project

# Start build with environment variable overrides
aws codebuild start-build \
  --project-name my-project \
  --environment-variables-override name=BRANCH,value=feature-x,type=PLAINTEXT

# View build logs
aws codebuild batch-get-builds --ids my-project:build-id

# List build projects
aws codebuild list-projects
```

---

## 4. CodeDeploy

CodeDeploy automates deployments to EC2 instances, ECS services, Lambda functions, and on-premises servers. It handles rolling updates, blue/green deployments, and automatic rollback.

### 4.1 Deployment Strategies

| Strategy | Target | How It Works |
|----------|--------|-------------|
| **In-Place** | EC2, On-prem | Stop app, deploy new version, restart. One host at a time or batch. |
| **Blue/Green** | EC2 | Provision new instances, shift traffic, terminate old ones. |
| **Blue/Green** | ECS | Create new task set, shift traffic via ALB, drain old tasks. |
| **Canary** | Lambda, ECS | Shift X% of traffic, wait, then shift 100%. (e.g., `Canary10Percent5Minutes`) |
| **Linear** | Lambda, ECS | Shift X% every N minutes. (e.g., `Linear10PercentEvery1Minute`) |
| **AllAtOnce** | Lambda, ECS | Shift 100% immediately. |

### 4.2 AppSpec File

The AppSpec file tells CodeDeploy what to deploy and which lifecycle hooks to run.

**For EC2/On-Prem (appspec.yml):**

```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /opt/myapp
hooks:
  BeforeInstall:
    - location: scripts/stop-server.sh
      timeout: 300
  AfterInstall:
    - location: scripts/install-deps.sh
      timeout: 300
  ApplicationStart:
    - location: scripts/start-server.sh
      timeout: 300
  ValidateService:
    - location: scripts/health-check.sh
      timeout: 60
```

**For ECS (appspec.yaml):**

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:2"
        LoadBalancerInfo:
          ContainerName: "my-container"
          ContainerPort: 8080
Hooks:
  - BeforeAllowTraffic: "arn:aws:lambda:us-east-1:123456789012:function:pre-traffic-hook"
  - AfterAllowTraffic: "arn:aws:lambda:us-east-1:123456789012:function:post-traffic-hook"
```

**For Lambda (appspec.yaml):**

```yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: "my-function"
        Alias: "live"
        CurrentVersion: "1"
        TargetVersion: "2"
Hooks:
  - BeforeAllowTraffic: "arn:aws:lambda:us-east-1:123456789012:function:pre-hook"
  - AfterAllowTraffic: "arn:aws:lambda:us-east-1:123456789012:function:post-hook"
```

### 4.3 CodeDeploy Agent

For EC2/on-prem deployments, the CodeDeploy agent must be installed and running on target instances.

```bash
# Install CodeDeploy agent on Amazon Linux 2
sudo yum install -y ruby wget
wget https://aws-codedeploy-us-east-1.s3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Verify agent status
sudo service codedeploy-agent status
```

```bash
# Create a deployment
aws deploy create-deployment \
  --application-name my-app \
  --deployment-group-name prod \
  --s3-location bucket=my-artifacts,key=app.zip,bundleType=zip

# Get deployment status
aws deploy get-deployment --deployment-id d-ABC123

# Stop a deployment
aws deploy stop-deployment --deployment-id d-ABC123
```

---

## 5. CodePipeline vs GitHub Actions vs Jenkins

| Feature | CodePipeline | GitHub Actions | Jenkins |
|---------|-------------|---------------|---------|
| **Hosting** | Fully managed | Fully managed | Self-managed |
| **Source integration** | GitHub, S3, ECR | GitHub native | Any SCM |
| **Build service** | CodeBuild | GitHub-hosted runners | Agents/nodes |
| **Deploy strategies** | CodeDeploy (blue/green, canary) | Manual or third-party | Plugins |
| **AWS integration** | Native (IAM roles, VPC) | Via OIDC + IAM roles | Via plugins/credentials |
| **Pricing** | $1/pipeline/month + CodeBuild minutes | Free tier + per-minute | Free (infrastructure cost) |
| **Conditional logic** | No native branching in pipeline | Full expression support | Groovy scripting |
| **Marketplace** | Limited | 20,000+ actions | 1,800+ plugins |

**When to choose CodePipeline:** Deep AWS integration needed, blue/green ECS deployments, compliance requirements for AWS-native tooling.

**When to choose GitHub Actions:** Source is on GitHub, need complex workflow logic, broad ecosystem of actions.

**When to choose Jenkins:** Need full control, complex enterprise pipelines, existing Jenkins investment.

---

## 6. Common Gotchas

| Gotcha | Details |
|--------|---------|
| **CodeBuild timeout** | Max 8 hours (480 minutes). Set `timeoutInMinutes` in project config. |
| **No conditional branching in CodePipeline** | Cannot skip stages based on conditions. Use Lambda actions to control flow or separate pipelines. |
| **Artifact size limits** | CodePipeline artifacts limited to 500 MB. Use S3 references for larger payloads. |
| **CodeDeploy agent required** | For EC2/on-prem only. Must be running and have IAM permissions. Agent auto-update can break things. |
| **CodeBuild Docker builds** | Must enable `privilegedMode: true` to run Docker commands inside CodeBuild. |
| **Pipeline triggers** | GitHub v2 connections require CodeStar Connections setup. Old OAuth tokens are deprecated. |
| **Build cache invalidation** | S3 cache is keyed by path. Changing `cache.paths` in buildspec invalidates everything. |
| **CodeDeploy rollback** | Automatic rollback deploys the last successful revision as a *new* deployment, not a revert. |
| **Cross-account complexity** | Requires KMS key sharing, S3 bucket policies, and cross-account IAM roles. Plan for this upfront. |
