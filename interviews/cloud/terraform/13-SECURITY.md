# Security Best Practices for Terraform

Terraform has privileged access to your infrastructure. It creates IAM roles, configures network rules, provisions databases, and manages secrets. A misconfigured Terraform setup is not just a code quality issue -- it is a security incident waiting to happen. The state file alone contains every attribute of every managed resource in plain text, including database passwords and API keys. This guide covers the practices that keep your Terraform workflows secure: secrets management, state protection, least-privilege IAM, policy enforcement, and the gotchas that catch even experienced teams.

---

## Secrets Management

### The Cardinal Rule

Never hardcode secrets in `.tf` files. Never commit `.tfvars` files that contain secrets. Never pass secrets as command-line arguments (they appear in process listings and shell history).

```hcl
# WRONG: Hardcoded secret
resource "aws_db_instance" "main" {
  password = "SuperSecret123!"
}

# WRONG: Default value for sensitive variable
variable "db_password" {
  default = "SuperSecret123!"
}
```

### Environment Variables

Terraform reads `TF_VAR_<name>` environment variables automatically.

```bash
# Set in CI/CD environment, never in config files
export TF_VAR_db_password="$DB_PASSWORD_FROM_VAULT"

terraform apply
```

```hcl
variable "db_password" {
  type      = string
  sensitive = true  # Redacts from plan/apply output
}

resource "aws_db_instance" "main" {
  password = var.db_password
}
```

### Reference Secrets from External Stores

The best approach: secrets live in a dedicated secrets manager. Terraform reads them at plan/apply time.

```hcl
# AWS Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "production/database/password"
}

resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# AWS SSM Parameter Store
data "aws_ssm_parameter" "api_key" {
  name            = "/production/api-key"
  with_decryption = true
}

resource "aws_lambda_function" "api" {
  environment {
    variables = {
      API_KEY = data.aws_ssm_parameter.api_key.value
    }
  }
}
```

### The sensitive Marker

```hcl
variable "db_password" {
  type      = string
  sensitive = true
}

output "connection_string" {
  value     = "postgres://admin:${var.db_password}@${aws_db_instance.main.endpoint}/mydb"
  sensitive = true
}
```

What `sensitive = true` does:
- Redacts the value from `terraform plan` and `terraform apply` console output
- Prevents the value from appearing in `terraform output` without `-json` flag

What `sensitive = true` does NOT do:
- Does not encrypt the value in state (it is still plain text in `.tfstate`)
- Does not prevent the value from appearing in provider error messages
- Does not prevent the value from being logged by the provider itself

---

## State File Security

### The Problem

Terraform state contains every attribute of every resource -- in plain text. This includes:

| Resource | What State Contains |
|----------|-------------------|
| `aws_db_instance` | Master password, endpoint, port |
| `aws_iam_access_key` | Access key ID, secret access key |
| `tls_private_key` | Full private key PEM |
| `aws_secretsmanager_secret_version` | The actual secret value |
| `aws_instance` | User data (may contain bootstrap secrets) |

**The state file is the single biggest security risk in any Terraform setup.**

### Protect State at Rest

```hcl
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true                          # SSE-S3 encryption
    kms_key_id     = "arn:aws:kms:us-west-2:123456789012:key/xxx"  # SSE-KMS
    dynamodb_table = "terraform-lock"
  }
}
```

### Restrict State Access

```hcl
# S3 bucket policy: only specific roles can access state
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnauthorizedAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [
              "arn:aws:iam::123456789012:role/terraform-plan",
              "arn:aws:iam::123456789012:role/terraform-apply"
            ]
          }
        }
      }
    ]
  })
}
```

### Additional State Protections

```hcl
# Enable versioning (recover from corrupted/deleted state)
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable access logging
resource "aws_s3_bucket_logging" "state" {
  bucket        = aws_s3_bucket.terraform_state.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "terraform-state-access/"
}
```

### Never Commit State to Git

```gitignore
# .gitignore
*.tfstate
*.tfstate.*
*.tfplan
.terraform/
```

If state was ever committed to git, rotating every secret in it is not optional -- it is mandatory. Git history is permanent.

---

## IAM for Terraform

### Principle of Least Privilege

Terraform CI/CD roles should have exactly the permissions needed -- no more.

```hcl
# Plan role: read-only
resource "aws_iam_role" "terraform_plan" {
  name = "terraform-plan"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" =
            "repo:my-org/infra:pull_request"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "plan_permissions" {
  name = "plan-permissions"
  role = aws_iam_role.terraform_plan.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadOnlyForPlan"
        Effect   = "Allow"
        Action   = [
          "ec2:Describe*",
          "s3:Get*",
          "s3:List*",
          "iam:Get*",
          "iam:List*",
          "rds:Describe*",
          "lambda:Get*",
          "lambda:List*"
        ]
        Resource = "*"
      },
      {
        Sid      = "StateBucketAccess"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::my-terraform-state",
          "arn:aws:s3:::my-terraform-state/*"
        ]
      },
      {
        Sid      = "StateLockRead"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = "arn:aws:dynamodb:*:*:table/terraform-lock"
      }
    ]
  })
}

# Apply role: read-write, restricted to main branch
resource "aws_iam_role" "terraform_apply" {
  name = "terraform-apply"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" =
            "repo:my-org/infra:ref:refs/heads/main"
        }
      }
    }]
  })
}
```

Key separation: the plan role is read-only and scoped to pull requests. The apply role has write access and is scoped to the main branch only. Even if a malicious PR is opened, it cannot trigger apply-level permissions.

### OIDC Federation

OIDC eliminates long-lived credentials entirely. GitHub Actions receives a short-lived token from AWS STS for each workflow run.

| Aspect | Access Keys | OIDC Federation |
|--------|-------------|-----------------|
| Credential lifetime | Permanent until rotated | Minutes (per-run) |
| Storage | GitHub Secrets | None (dynamic) |
| Rotation required | Yes (manually) | No (automatic) |
| Blast radius if leaked | Full access until revoked | Already expired |
| Branch scoping | Not possible | Built-in via sub claim |

---

## Policy Enforcement

### Defense in Depth

Layer multiple policy mechanisms. No single tool catches everything.

```
+------------------------------------------+
|  Layer 1: Pre-commit hooks (developer)   |  tflint, terraform fmt, checkov
+------------------------------------------+
|  Layer 2: CI static analysis (PR)        |  trivy, conftest, tflint
+------------------------------------------+
|  Layer 3: Plan validation (PR)           |  OPA against plan JSON
+------------------------------------------+
|  Layer 4: Sentinel (TFC, pre-apply)      |  Hard-mandatory policies
+------------------------------------------+
|  Layer 5: SCPs (AWS Organizations)       |  Account-level guardrails
+------------------------------------------+
```

### SCPs as Guardrails

Service Control Policies in AWS Organizations act as a hard ceiling. Even if Terraform has admin permissions, SCPs prevent forbidden actions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicS3",
      "Effect": "Deny",
      "Action": [
        "s3:PutBucketPolicy",
        "s3:PutBucketAcl"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": ["public-read", "public-read-write"]
        }
      }
    },
    {
      "Sid": "RequireIMDSv2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": {
          "ec2:MetadataHttpTokens": "required"
        }
      }
    }
  ]
}
```

---

## Provider Credentials

### Prefer Assumed Roles Over Access Keys

```hcl
# WRONG: Static credentials
provider "aws" {
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
  region     = "us-west-2"
}

# CORRECT: Assumed role (credentials come from environment)
provider "aws" {
  region = "us-west-2"

  assume_role {
    role_arn     = "arn:aws:iam::123456789012:role/terraform"
    session_name = "terraform-ci"
  }
}

# CORRECT: Default credential chain (OIDC, instance profile, etc.)
provider "aws" {
  region = "us-west-2"
}
```

### Short-Lived Tokens

| Method | Lifetime | Use Case |
|--------|----------|----------|
| OIDC (GitHub Actions) | ~1 hour | CI/CD pipelines |
| Instance profile (EC2) | ~6 hours, auto-rotated | Self-hosted runners |
| SSO session | 1-12 hours (configurable) | Developer workstations |
| STS AssumeRole | 1-12 hours | Cross-account access |
| Access keys | Permanent | Avoid whenever possible |

---

## Network Security in Terraform

### Avoid Open Ingress

```hcl
# WRONG: Open to the world
resource "aws_security_group_rule" "allow_ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]  # Never do this
  security_group_id = aws_security_group.main.id
}

# CORRECT: Restrict to known CIDR ranges
resource "aws_security_group_rule" "allow_ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ssh_cidrs  # Validated variable
  security_group_id = aws_security_group.main.id
}

# BETTER: Reference other security groups instead of CIDRs
resource "aws_security_group_rule" "allow_app_to_db" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  security_group_id        = aws_security_group.db.id
}
```

### Validate CIDR Ranges

```hcl
variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to SSH"

  validation {
    condition = alltrue([
      for cidr in var.allowed_ssh_cidrs :
      cidr != "0.0.0.0/0" && can(cidrhost(cidr, 0))
    ])
    error_message = "CIDR blocks must be valid and must not be 0.0.0.0/0."
  }
}
```

---

## .gitignore for Terraform

```gitignore
# Terraform state (CRITICAL -- contains secrets in plain text)
*.tfstate
*.tfstate.*

# Terraform plan files (may contain sensitive values)
*.tfplan
tfplan
plan.out

# Provider plugins (large, downloaded via terraform init)
.terraform/

# Variable files that may contain secrets
*.auto.tfvars
secret.tfvars
# Keep non-secret tfvars: terraform.tfvars, environments/*.tfvars

# Crash logs
crash.log
crash.*.log

# Override files (local developer overrides)
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# CLI configuration
.terraformrc
terraform.rc

# Lock file -- DO commit this (ensures consistent provider versions)
# !.terraform.lock.hcl
```

**Always commit `.terraform.lock.hcl`**. It pins exact provider versions and hashes, ensuring every team member and CI run uses the same provider binaries.

---

## Common Gotchas

**`sensitive` does not mean encrypted.** Marking a variable or output as `sensitive` only redacts it from CLI output. The value is still stored in plain text in the state file. If an attacker has access to state, `sensitive = true` provides zero protection.

**State is the biggest attack surface.** Treat the state backend with the same care as a credentials vault. Encrypt at rest, restrict access, enable versioning, log all access. A compromised state file exposes every managed secret.

**Provider credentials in CI logs.** Providers sometimes include credentials in error messages. Terraform may log the full HTTP request/response during debug mode (`TF_LOG=DEBUG`). Never enable debug logging in production CI. Review CI log retention policies.

**`terraform import` can expose secrets.** Importing an existing resource writes all its attributes to state -- including secrets you might not know about. After importing, audit the state for sensitive values and ensure they are properly managed.

**`terraform output` with `-json` bypasses sensitive.** While `terraform output` redacts sensitive values, `terraform output -json` prints them in plain text. Restrict who can run this command and where.

**Deleted resources leave secrets in state history.** Even after a resource is destroyed, its attributes remain in previous state versions (S3 versioning). Implement a lifecycle policy to expire old state versions, and rotate secrets that were ever stored in state.

**Console-created resources bypass all policies.** Policy-as-code only works for changes that flow through Terraform. Manual console changes bypass everything. Detect drift with scheduled `terraform plan` runs, and enforce that all changes go through code.
