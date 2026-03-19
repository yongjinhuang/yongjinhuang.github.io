# Infrastructure as Code: Rules for Managing Complex AWS Infrastructure

Infrastructure as Code (IaC) is the practice of defining, provisioning, and managing cloud resources through machine-readable configuration files rather than manual console clicks. Done well, it gives you reproducible environments, auditable change history, and the confidence that your staging environment actually mirrors production. Done poorly, it creates a false sense of control while hiding drift, duplication, and security gaps. This guide covers the principles, patterns, and hard-won lessons for managing AWS infrastructure at scale using IaC.

---

## 1. Why IaC Matters

### The Problem with ClickOps

Manual console changes (ClickOps) create undocumented, unreproducible infrastructure. Someone adds a security group rule at 2 AM during an incident. Another engineer tweaks a Lambda timeout through the console. Within weeks, your "documented" architecture diverges from reality.

Problems with ClickOps:

- No audit trail beyond CloudTrail (which tells you _what_ changed, not _why_)
- Impossible to reproduce environments reliably
- Knowledge lives in people's heads, not in version control
- No peer review for infrastructure changes
- Disaster recovery becomes guesswork

### What IaC Gives You

| Benefit               | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| **Reproducibility**   | Spin up identical environments in minutes                      |
| **Version control**   | Git history shows who changed what and why                     |
| **Peer review**       | PRs for infrastructure, just like application code             |
| **Auditability**      | Compliance teams can read the repo, not dig through CloudTrail |
| **Drift detection**   | Compare desired state against actual state automatically       |
| **Disaster recovery** | Rebuild entire environments from code                          |

### Infrastructure Drift

Drift occurs when actual infrastructure state diverges from what your IaC defines. IaC tools detect drift by comparing the declared desired state against the real state of resources. When drift is found, you can reconcile by either updating the code to match reality or re-applying the code to fix the environment.

---

## 2. Tool Selection

### Comparison

| Feature          | CloudFormation              | CDK                              | Terraform                    | Pulumi                           |
| ---------------- | --------------------------- | -------------------------------- | ---------------------------- | -------------------------------- |
| Language         | YAML/JSON                   | TypeScript, Python, Java, Go, C# | HCL                          | TypeScript, Python, Go, C#, Java |
| State management | AWS-managed (no state file) | AWS-managed (compiles to CFN)    | Self-managed (S3 + DynamoDB) | Self-managed or Pulumi Cloud     |
| Multi-cloud      | No                          | No                               | Yes                          | Yes                              |
| Drift detection  | Built-in                    | Via CloudFormation               | `terraform plan`             | `pulumi preview`                 |
| Learning curve   | Moderate                    | Low (if you know the language)   | Moderate                     | Low (if you know the language)   |
| Ecosystem        | AWS-only                    | AWS-only (with escape hatches)   | Massive provider ecosystem   | Growing                          |
| Rollback         | Automatic on failure        | Automatic on failure             | Manual                       | Manual                           |

### Decision Matrix

- **AWS-only, small team, simple infra** -- CloudFormation
- **AWS-only, developers who want real code** -- CDK
- **Multi-cloud or strong module ecosystem needed** -- Terraform
- **Multi-cloud, developers who dislike HCL** -- Pulumi

Pick one tool and standardize. Mixed tooling across teams creates operational overhead that outweighs any individual tool advantage.

---

## 3. Repository and Project Structure

### Monorepo vs Polyrepo

**Monorepo** works well when one team owns all infrastructure. Changes across stacks are atomic, and shared modules live alongside consumers.

**Polyrepo** works when multiple teams own different services. Each team manages their infra repo independently, consuming shared modules from a registry or Git tags.

### Terraform Project Structure

```
infrastructure/
  modules/
    vpc/
      main.tf
      variables.tf
      outputs.tf
    rds/
      main.tf
      variables.tf
      outputs.tf
  environments/
    dev/
      main.tf
      terraform.tfvars
      backend.tf
    staging/
      main.tf
      terraform.tfvars
      backend.tf
    prod/
      main.tf
      terraform.tfvars
      backend.tf
```

### CDK Project Structure

```
infrastructure/
  bin/
    app.ts
  lib/
    constructs/
      vpc-construct.ts
      database-construct.ts
    stacks/
      networking-stack.ts
      database-stack.ts
      compute-stack.ts
  config/
    dev.ts
    staging.ts
    prod.ts
  test/
    networking-stack.test.ts
    database-stack.test.ts
```

### CloudFormation Project Structure

```
infrastructure/
  templates/
    networking.yaml
    database.yaml
    compute.yaml
  parameters/
    dev.json
    staging.json
    prod.json
  scripts/
    deploy.sh
    validate.sh
```

Key principle: **same templates, different parameters per environment**. Never copy-paste templates across environments.

---

## 4. State Management (Terraform-Specific)

### Remote State with S3 + DynamoDB Locking

Never use local state. Configure remote state from day one.

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "environments/prod/networking/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

Bootstrap the state bucket and lock table manually or with a separate, minimal Terraform config that uses local state.

### State Isolation

Use separate state files per environment and per logical grouping:

```
s3://mycompany-terraform-state/
  environments/
    dev/
      networking/terraform.tfstate
      database/terraform.tfstate
      compute/terraform.tfstate
    staging/
      networking/terraform.tfstate
      ...
    prod/
      networking/terraform.tfstate
      ...
```

### Rules for State

- **Never commit `.tfstate` files** to version control. Add them to `.gitignore`.
- **Enable encryption** on the S3 bucket (SSE-S3 or SSE-KMS).
- **Enable versioning** on the S3 bucket for state recovery.
- **Restrict access** to the state bucket with IAM policies. State files contain sensitive data (resource IDs, sometimes secrets).
- **Use `terraform state mv`** for refactoring, never edit state files by hand.

---

## 5. Module and Construct Design

### Terraform Module Example

A well-designed module is narrow in scope, validates its inputs, and exposes useful outputs.

```hcl
# modules/rds/variables.tf
variable "instance_class" {
  type        = string
  default     = "db.t3.medium"
  description = "RDS instance class"

  validation {
    condition     = can(regex("^db\\.", var.instance_class))
    error_message = "Instance class must start with 'db.'"
  }
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "allocated_storage" {
  type        = number
  default     = 20
  description = "Allocated storage in GB"
}

# modules/rds/main.tf
resource "aws_db_instance" "this" {
  identifier          = "${var.environment}-app-db"
  engine              = "postgres"
  engine_version      = "15.4"
  instance_class      = var.instance_class
  allocated_storage   = var.allocated_storage
  storage_encrypted   = true
  deletion_protection = var.environment == "prod" ? true : false

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# modules/rds/outputs.tf
output "endpoint" {
  value       = aws_db_instance.this.endpoint
  description = "RDS instance endpoint"
}

output "arn" {
  value       = aws_db_instance.this.arn
  description = "RDS instance ARN"
}
```

### CDK Construct Example

```typescript
// lib/constructs/database-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface DatabaseConstructProps {
  vpc: ec2.IVpc;
  environment: string;
  instanceType?: ec2.InstanceType;
}

export class DatabaseConstruct extends Construct {
  public readonly endpoint: string;
  public readonly secret: rds.DatabaseSecret;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const instanceType =
      props.instanceType ??
      ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM);

    const instance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      deletionProtection: props.environment === 'prod',
      removalPolicy:
        props.environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    this.endpoint = instance.dbInstanceEndpointAddress;
  }
}
```

### Module Versioning

For shared modules, use Git tags or a private module registry:

```hcl
module "rds" {
  source  = "git::https://github.com/mycompany/terraform-modules.git//rds?ref=v2.1.0"
  # Pin to a specific version. Never use ref=main in production.
  environment = "prod"
}
```

---

## 6. Environment Management

### Same Code, Different Configs

The core principle: environments differ only in configuration, never in structure.

**Terraform (tfvars):**

```hcl
# environments/dev/terraform.tfvars
environment      = "dev"
instance_class   = "db.t3.micro"
instance_count   = 1

# environments/prod/terraform.tfvars
environment      = "prod"
instance_class   = "db.r6g.xlarge"
instance_count   = 3
```

**CDK (context):**

```typescript
// config/prod.ts
export const prodConfig = {
  environment: 'prod',
  instanceType: ec2.InstanceType.of(
    ec2.InstanceClass.R6G,
    ec2.InstanceSize.XLARGE
  ),
  instanceCount: 3,
};
```

### Account-per-Environment Strategy

Use AWS Organizations to isolate environments into separate accounts:

```
Management Account (billing, SCPs)
  Production OU
    prod-account (123456789012)
  Non-Production OU
    staging-account (234567890123)
    dev-account (345678901234)
  Shared Services OU
    shared-account (456789012345) -- CI/CD, artifact registries
```

Benefits: hard security boundary, independent service quotas, clean cost attribution.

### Feature Flags in Infrastructure

Use conditional resources for gradual rollout:

```hcl
variable "enable_waf" {
  type    = bool
  default = false
}

resource "aws_wafv2_web_acl" "this" {
  count = var.enable_waf ? 1 : 0
  # ...
}
```

---

## 7. CI/CD for Infrastructure

### GitOps Workflow

```
1. Developer creates feature branch
2. Pushes changes, opens PR
3. CI runs: lint -> validate -> plan/diff
4. Plan output posted as PR comment
5. Team reviews plan (not just code)
6. Merge to main triggers apply
7. Post-apply verification runs
```

### GitHub Actions Example (Terraform)

````yaml
name: Terraform

on:
  pull_request:
    paths: ['infrastructure/**']
  push:
    branches: [main]
    paths: ['infrastructure/**']

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/terraform-ci
          aws-region: us-east-1

      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        working-directory: infrastructure/environments/prod

      - name: Terraform Validate
        run: terraform validate
        working-directory: infrastructure/environments/prod

      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color -out=tfplan
        working-directory: infrastructure/environments/prod

      - name: Post Plan to PR
        uses: actions/github-script@v7
        with:
          script: |
            const output = `${{ steps.plan.outputs.stdout }}`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '### Terraform Plan\n```\n' + output + '\n```'
            });

  apply:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/terraform-ci
          aws-region: us-east-1

      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        working-directory: infrastructure/environments/prod

      - name: Terraform Apply
        run: terraform apply -auto-approve
        working-directory: infrastructure/environments/prod
````

### Drift Detection

Schedule a `terraform plan` (or `aws cloudformation detect-stack-drift`) to run nightly. Alert when drift is detected. Either update the code to reflect intentional changes or re-apply to fix unintended drift.

### Rollback Strategies

- **CloudFormation/CDK**: Automatic rollback on stack update failure is built in.
- **Terraform**: Revert the Git commit and re-apply. The previous state is preserved in S3 versioning as a safety net.
- **All tools**: Stateful resources (databases) rarely support true rollback. Plan changes to stateful resources with extreme caution.

---

## 8. Security in IaC

### No Secrets in Code

```hcl
# WRONG: secret in code
resource "aws_db_instance" "this" {
  password = "SuperSecret123!"
}

# CORRECT: reference from Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "prod/database/password"
}

resource "aws_db_instance" "this" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}
```

State files also contain sensitive values. Encrypt the state bucket and restrict access.

### Policy-as-Code

Run static analysis in CI before any apply:

| Tool             | Target              | What It Checks                       |
| ---------------- | ------------------- | ------------------------------------ |
| **tfsec**        | Terraform           | Security misconfigurations           |
| **Checkov**      | Terraform, CFN, CDK | Security, compliance, best practices |
| **cfn-nag**      | CloudFormation      | Security warnings and failures       |
| **OPA/Conftest** | Any (JSON/YAML/HCL) | Custom policy rules                  |

Example Checkov in CI:

```yaml
- name: Run Checkov
  run: checkov -d infrastructure/ --framework terraform --soft-fail-on LOW
```

### IAM for CI/CD

- Use OIDC federation (GitHub Actions -> IAM role). No long-lived access keys.
- Scope the CI/CD role to only the permissions needed for deployment.
- Use separate roles for plan (read-only) and apply (write).
- Apply SCPs at the Organization level to prevent privilege escalation.

---

## 9. Tagging Strategy

### Required Tags

Every resource should have at minimum:

| Tag           | Purpose              | Example                      |
| ------------- | -------------------- | ---------------------------- |
| `Environment` | Identifies env       | `prod`, `staging`, `dev`     |
| `Service`     | Logical service name | `payment-api`, `user-auth`   |
| `Team`        | Owning team          | `platform`, `payments`       |
| `CostCenter`  | Billing attribution  | `CC-1234`                    |
| `ManagedBy`   | How it was created   | `terraform`, `cdk`, `manual` |

### Enforcing Tags

Use a default tags block to apply tags globally:

```hcl
# Terraform
provider "aws" {
  default_tags {
    tags = {
      Environment = var.environment
      Team        = "platform"
      ManagedBy   = "terraform"
    }
  }
}
```

```typescript
// CDK
cdk.Tags.of(app).add('Environment', config.environment);
cdk.Tags.of(app).add('Team', 'platform');
cdk.Tags.of(app).add('ManagedBy', 'cdk');
```

Enforce required tags with AWS Config rules or SCPs that deny resource creation without them.

### Tag-Based Cost Allocation

Activate tags in AWS Billing. Use Cost Explorer to filter and group by `Service`, `Team`, or `CostCenter`. This is the foundation of any cost management strategy.

---

## 10. Blast Radius Reduction

### Small, Focused Stacks

Split infrastructure into logical, independently deployable units:

```
networking/    -- VPC, subnets, NAT gateways, transit gateway
database/      -- RDS, ElastiCache, DynamoDB tables
compute/       -- ECS services, Lambda functions, ASGs
monitoring/    -- CloudWatch dashboards, alarms, SNS topics
dns/           -- Route 53 hosted zones, records
```

A change to a Lambda function should never risk your VPC configuration.

### Separate Stateful from Stateless

Stateful resources (databases, S3 buckets, encryption keys) have different lifecycles than stateless resources (compute, load balancers). Keep them in separate stacks with protective guards:

```hcl
# Terraform
resource "aws_db_instance" "this" {
  # ...
  lifecycle {
    prevent_destroy = true
  }
}

# CloudFormation
Resources:
  Database:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Retain
    UpdateReplacePolicy: Snapshot
```

### Import Existing Resources

When adopting IaC for existing infrastructure, import resources rather than recreating them:

```bash
terraform import aws_s3_bucket.existing my-existing-bucket
```

For CDK, use `cdk import` or reference existing resources with `fromXxx` methods:

```typescript
const existingVpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
  vpcId: 'vpc-0123456789abcdef0',
});
```

---

## 11. Testing Infrastructure Code

### CDK Unit Tests

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/stacks/database-stack';

test('Database is encrypted and has deletion protection in prod', () => {
  const app = new cdk.App();
  const stack = new DatabaseStack(app, 'TestStack', {
    environment: 'prod',
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::RDS::DBInstance', {
    StorageEncrypted: true,
    DeletionProtection: true,
  });
});

test('Database allows destruction in dev', () => {
  const app = new cdk.App();
  const stack = new DatabaseStack(app, 'TestStack', {
    environment: 'dev',
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::RDS::DBInstance', {
    DeletionProtection: false,
  });
});
```

### Terraform Validation

```bash
terraform validate           # Syntax and internal consistency
terraform plan               # Dry run against real AWS
terraform fmt -check         # Formatting check
```

For deeper Terraform testing, use `terratest` (Go) or `tftest` (native):

```hcl
# tests/rds.tftest.hcl
run "verify_rds_encryption" {
  command = plan

  assert {
    condition     = aws_db_instance.this.storage_encrypted == true
    error_message = "RDS storage must be encrypted"
  }
}
```

### Integration Tests

Deploy temporary stacks, run assertions, then tear down:

```bash
# Deploy ephemeral environment
terraform apply -var="environment=test-$(git rev-parse --short HEAD)"
# Run integration tests against the deployed infra
pytest tests/integration/
# Destroy ephemeral environment
terraform destroy -auto-approve -var="environment=test-$(git rev-parse --short HEAD)"
```

### Drift Detection as a Test

Include scheduled drift detection in your test suite. If drift is found, the test fails and triggers an alert.

---

## 12. Documentation and Runbooks

### Self-Documenting Code

Use meaningful resource names and descriptions:

```hcl
resource "aws_security_group" "api_ingress" {
  name        = "${var.environment}-api-ingress"
  description = "Allow HTTPS traffic to API servers from ALB"
  # ...
}
```

Add descriptions to every variable and output. Future you will thank present you.

### Architecture Diagrams as Code

Use Mermaid or the Python `diagrams` library to keep diagrams in version control alongside the infrastructure code:

```
docs/
  architecture.py       # Generates architecture diagram
  runbooks/
    scaling.md
    failover.md
    disaster-recovery.md
```

### Runbooks for Day-2 Operations

Every stack should have runbooks covering:

- How to scale up/down
- Failover procedures
- Disaster recovery steps
- How to rotate secrets
- How to roll back a bad deployment
- On-call troubleshooting steps

Store runbooks alongside the code they describe. Review them during infrastructure PRs.

---

## 13. Cost Management

### Tag-Based Attribution

Without consistent tagging, cost attribution is impossible. Enforce tagging (see Section 9) and activate cost allocation tags in AWS Billing.

### Right-Sizing

```hcl
# Use variables to make instance sizing reviewable
variable "instance_type" {
  type        = string
  description = "EC2 instance type -- review with Cost Explorer data"
}
```

Review AWS Compute Optimizer recommendations monthly. Codify right-sizing changes through IaC, not console clicks.

### Budget Alarms

```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "${var.environment}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.billing_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.billing_alerts.arn]
  }
}
```

### Savings Plans and Reserved Instances

Manage commitments through IaC for auditability. Track expiration dates and renewal decisions in the same repo as the infrastructure they cover.

---

## Golden Rules Summary

| Rule                                      | Why                                                           |
| ----------------------------------------- | ------------------------------------------------------------- |
| Everything in version control             | No undocumented changes                                       |
| One tool, standardized                    | Avoid operational fragmentation                               |
| Same code, different parameters           | Environments must be structurally identical                   |
| Remote state, always encrypted            | Local state is a ticking time bomb                            |
| Small, focused stacks                     | Limit blast radius of any single change                       |
| Separate stateful from stateless          | Databases and compute have different lifecycles               |
| PR-based workflow with plan output        | Every change is reviewed before apply                         |
| No secrets in code or state               | Use Secrets Manager / SSM Parameter Store                     |
| Policy-as-code in CI                      | Catch misconfigurations before they reach AWS                 |
| Tag everything                            | Cost attribution, access control, and operations depend on it |
| Test infrastructure like application code | Unit tests, integration tests, drift detection                |
| Protect critical resources                | `prevent_destroy`, `DeletionPolicy: Retain`                   |
| Document and maintain runbooks            | Code without context is a liability                           |
