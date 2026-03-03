# Terraform State Management

Terraform state is the bridge between your configuration files and the real infrastructure they describe. Without state, Terraform has no way to know which real-world resources correspond to which blocks in your `.tf` files, what metadata those resources carry, or how to efficiently plan changes. Every `terraform plan` compares your desired configuration against the state file, then diffs the state against reality. Understanding state is not optional -- it is the single most important operational concept in Terraform.

---

## Why State Exists

Terraform needs state for three reasons:

| Purpose | Explanation |
|---------|-------------|
| **Resource mapping** | Maps each `resource` block to a real cloud resource (e.g., `aws_instance.web` -> `i-0abc123def456`) |
| **Metadata tracking** | Stores dependency information, resource attributes, and provider details |
| **Performance** | Caches resource attributes so `terraform plan` does not need to query every resource from the provider API on every run |

Without state, Terraform would need to crawl your entire cloud account, attempt to match resources by name or tags, and guess which ones it manages. That approach is brittle and slow. State makes the mapping explicit.

---

## Local State

By default, Terraform stores state in a file called `terraform.tfstate` in the working directory.

```bash
# After your first apply, you'll see:
$ ls
main.tf  terraform.tfstate  terraform.tfstate.backup
```

The `.tfstate` file is JSON. The `.backup` file is the previous version (created on every write).

**Local state is fine for:**
- Learning Terraform
- Solo projects with no CI/CD
- Quick prototypes you will tear down

**Local state is dangerous for:**
- Any team environment (no locking, no shared access)
- CI/CD pipelines (state lives on ephemeral runners)
- Anything you care about losing (laptop dies, state is gone)

---

## Remote Backends

A remote backend stores state in a shared, durable location with locking to prevent concurrent writes.

### Backend Options

| Backend | Locking | Encryption | Best For |
|---------|---------|------------|----------|
| **S3 + DynamoDB** | Yes (DynamoDB) | Yes (SSE) | AWS-native teams; most common in production |
| **GCS** | Yes (built-in) | Yes (default) | GCP-native teams |
| **Azure Blob** | Yes (blob lease) | Yes (SSE) | Azure-native teams |
| **Terraform Cloud** | Yes (built-in) | Yes | Teams wanting managed state + runs |
| **Consul** | Yes (built-in) | Optional | HashiCorp-stack shops |
| **pg (PostgreSQL)** | Yes (advisory locks) | Depends on setup | Teams with existing Postgres infrastructure |

### S3 Backend -- The Industry Standard

This is the most common production setup. You need an S3 bucket for state and a DynamoDB table for locking.

#### Step 1: Bootstrap the Backend Resources

You cannot use Terraform to create the backend that Terraform needs. Bootstrap these manually or with a one-time script:

```bash
# Create the S3 bucket
aws s3api create-bucket \
  --bucket my-company-terraform-state \
  --region us-east-1

# Enable versioning (critical -- lets you recover from bad state writes)
aws s3api put-bucket-versioning \
  --bucket my-company-terraform-state \
  --versioning-configuration Status=Enabled

# Enable server-side encryption by default
aws s3api put-bucket-encryption \
  --bucket my-company-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms"
        },
        "BucketKeyEnabled": true
      }
    ]
  }'

# Block all public access
aws s3api put-public-access-block \
  --bucket my-company-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create the DynamoDB table for locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

#### Step 2: Configure the Backend

```hcl
terraform {
  backend "s3" {
    bucket         = "my-company-terraform-state"
    key            = "prod/networking/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

The `key` is the path within the bucket. Use a structured convention like `{env}/{layer}/terraform.tfstate`.

#### Step 3: Initialize

```bash
terraform init
# Terraform detects the backend configuration and migrates local state if it exists
```

---

## State Locking

State locking prevents two people (or two CI jobs) from writing to state simultaneously. Without locking, concurrent applies can corrupt state or create duplicate resources.

### What Locking Prevents

```
Developer A: terraform apply  -->  reads state  -->  modifies infra  -->  writes state
Developer B: terraform apply  -->  reads state  -->  modifies infra  -->  writes state
                                     ^                                       ^
                                  Same state!                         Overwrites A's changes!
```

With locking, Developer B's `terraform apply` blocks until Developer A's lock is released.

### How DynamoDB Locking Works

Terraform writes a lock record to the DynamoDB table with the state file path as the `LockID`. The record contains:

| Field | Value |
|-------|-------|
| `LockID` | S3 bucket + key (e.g., `my-company-terraform-state/prod/networking/terraform.tfstate`) |
| `Info` | JSON with who acquired the lock, when, and the operation |

When the operation completes, Terraform deletes the lock record.

### Force Unlock

If a Terraform process crashes mid-apply, the lock can be left behind (orphaned lock). You will see:

```
Error: Error locking state: Error acquiring the state lock
Lock Info:
  ID:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Path:      my-company-terraform-state/prod/networking/terraform.tfstate
  Operation: OperationTypeApply
  Who:       developer@laptop
  Version:   1.7.0
  Created:   2024-06-15 14:30:00.000000 +0000 UTC
```

To fix:

```bash
# Only do this if you are certain no other operation is running
terraform force-unlock a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Never force-unlock if another apply is actually running. You will get state corruption.

---

## State File Structure

The state file is JSON. Here is a simplified view:

```json
{
  "version": 4,
  "terraform_version": "1.7.0",
  "serial": 42,
  "lineage": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "outputs": {
    "vpc_id": {
      "value": "vpc-0abc123",
      "type": "string"
    }
  },
  "resources": [
    {
      "mode": "managed",
      "type": "aws_instance",
      "name": "web",
      "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
      "instances": [
        {
          "attributes": {
            "id": "i-0abc123def456",
            "ami": "ami-12345678",
            "instance_type": "t3.micro",
            "private_ip": "10.0.1.50",
            "tags": { "Name": "web-server" }
          }
        }
      ]
    }
  ]
}
```

Key fields:

| Field | Purpose |
|-------|---------|
| `serial` | Incrementing counter; prevents stale writes |
| `lineage` | Unique ID for this state; prevents accidentally pointing two configs at the same state |
| `outputs` | Values exported by `output` blocks |
| `resources` | Every managed resource with all its attributes |

### Sensitive Data Warning

State stores **all** resource attributes in plain text. This includes:

- Database passwords
- API keys passed as resource arguments
- TLS private keys
- Any value Terraform knows about

This is why state encryption and access control are non-negotiable in production.

---

## State Encryption

### S3 Server-Side Encryption

With `encrypt = true` in the backend config, S3 encrypts state at rest using SSE-S3 or SSE-KMS:

```hcl
terraform {
  backend "s3" {
    bucket         = "my-company-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:111122223333:key/abcd-1234"
    dynamodb_table = "terraform-state-lock"
  }
}
```

This encrypts state at rest. State is still decrypted in memory during Terraform operations, and anyone with S3 read access can download and read it.

### Access Control

Lock down the state bucket with IAM policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-company-terraform-state/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::my-company-terraform-state"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:111122223333:table/terraform-state-lock"
    }
  ]
}
```

---

## State Operations

### List All Resources

```bash
$ terraform state list
aws_vpc.main
aws_subnet.public[0]
aws_subnet.public[1]
aws_subnet.private[0]
aws_subnet.private[1]
aws_instance.web
aws_security_group.web_sg
```

Filter with a partial address:

```bash
$ terraform state list aws_subnet
aws_subnet.public[0]
aws_subnet.public[1]
aws_subnet.private[0]
aws_subnet.private[1]
```

### Inspect a Resource

```bash
$ terraform state show aws_instance.web
# aws_instance.web:
resource "aws_instance" "web" {
    ami                          = "ami-12345678"
    instance_type                = "t3.micro"
    id                           = "i-0abc123def456"
    private_ip                   = "10.0.1.50"
    subnet_id                    = "subnet-0abc123"
    vpc_security_group_ids       = ["sg-0abc123"]
    tags                         = { "Name" = "web-server" }
}
```

### Move/Rename a Resource

When you refactor your code (rename a resource, move it into a module), Terraform sees a destroy + create. Use `state mv` to update the mapping without touching real infrastructure:

```bash
# Rename a resource
terraform state mv aws_instance.web aws_instance.app_server

# Move a resource into a module
terraform state mv aws_instance.web module.compute.aws_instance.web

# Move between modules
terraform state mv module.old.aws_instance.web module.new.aws_instance.web
```

### Remove from State

Remove a resource from Terraform management without destroying it in the cloud:

```bash
# Terraform forgets about this resource; the real resource remains
terraform state rm aws_instance.legacy_server
```

Use this when:
- Handing a resource to another team's Terraform config
- Migrating a resource to a different state file
- Removing something Terraform should no longer manage

### Pull and Push State

```bash
# Download state to stdout (useful for inspection or backup)
terraform state pull > backup.tfstate

# Upload state (dangerous -- use only for recovery)
terraform state pull > modified.tfstate
# ... careful edits ...
terraform state push modified.tfstate
```

`state push` increments the serial number. It will refuse to push if the serial is not higher than the remote, unless you use `-force` (which you should almost never do).

---

## Splitting State Files

Large monolithic state files are slow, risky, and create blast radius problems. Split state by infrastructure layer:

```
infrastructure/
  networking/        # VPC, subnets, NAT gateways, route tables
    main.tf
    backend.tf       # key = "prod/networking/terraform.tfstate"
  data/              # RDS, ElastiCache, S3 buckets
    main.tf
    backend.tf       # key = "prod/data/terraform.tfstate"
  compute/           # EC2, ECS, Lambda
    main.tf
    backend.tf       # key = "prod/compute/terraform.tfstate"
  dns/               # Route 53 records
    main.tf
    backend.tf       # key = "prod/dns/terraform.tfstate"
```

Benefits:
- Smaller blast radius (a bad apply in compute does not touch networking)
- Faster plans (fewer resources to refresh)
- Better team autonomy (networking team owns networking state)
- Independent apply cycles

### Referencing Other State Files

Use the `terraform_remote_state` data source to read outputs from another state:

```hcl
# In compute/main.tf -- read networking outputs
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "my-company-terraform-state"
    key    = "prod/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
  subnet_id     = data.terraform_remote_state.networking.outputs.public_subnet_ids[0]
}
```

The networking layer must export the values:

```hcl
# In networking/outputs.tf
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}
```

---

## State Migration

### Local to Remote

```bash
# 1. Add backend configuration to your .tf files
# 2. Run init -- Terraform detects the change and offers to migrate
terraform init

# Terraform will prompt:
# "Do you want to copy existing state to the new backend?"
# Answer: yes
```

### Remote to Remote (e.g., S3 to Terraform Cloud)

```bash
# 1. Update the backend block in your .tf files
# 2. Run init with migration flag
terraform init -migrate-state

# Terraform copies state from old backend to new backend
```

### Manual Migration

If automatic migration fails:

```bash
# Pull state from old backend
terraform state pull > state_backup.tfstate

# Update backend config in .tf files
# Re-initialize with the new backend
terraform init -reconfigure

# Push state to new backend
terraform state push state_backup.tfstate
```

---

## Common Gotchas

### 1. State Contains Secrets in Plain Text

Every attribute Terraform tracks is stored as-is. Database passwords, private keys, access tokens -- all visible to anyone who can read the state file. Encrypt the backend, restrict access, and never commit state to version control.

### 2. Never Edit State Manually

Editing `terraform.tfstate` by hand is tempting when things go wrong. Resist the urge. Use `terraform state mv`, `terraform state rm`, `terraform import`, or `terraform state push` after a `terraform state pull`. Manual edits frequently cause serial number conflicts, malformed JSON, or orphaned resources.

### 3. State File Corruption Recovery

If state gets corrupted:

```bash
# S3 versioning lets you recover previous state versions
aws s3api list-object-versions \
  --bucket my-company-terraform-state \
  --prefix prod/networking/terraform.tfstate

# Download a known-good version
aws s3api get-object \
  --bucket my-company-terraform-state \
  --key prod/networking/terraform.tfstate \
  --version-id "abc123" \
  recovered.tfstate

# Push the recovered state
terraform state push recovered.tfstate
```

This is why you always enable S3 bucket versioning for your state bucket.

### 4. Large State Performance

State files with thousands of resources become slow. Each `plan` refreshes every resource. Mitigations:

- Split into smaller state files (see above)
- Use `-target` for focused plans (sparingly -- it is not a long-term solution)
- Use `-refresh=false` when you know nothing changed externally (risky, but fast)

### 5. Cross-State Dependencies Create Coupling

Using `terraform_remote_state` couples your layers. If the networking layer renames an output, the compute layer breaks. Alternatives:

- Use data sources to look up resources by tags or names instead of remote state
- Use a parameter store (SSM Parameter Store, Consul KV) as an intermediary
- Keep remote state references to a minimum and document them

### 6. The .terraform Directory

`terraform init` creates a `.terraform` directory with provider plugins and backend config. This directory should be in `.gitignore`. It is local to each developer and CI runner.

```gitignore
# .gitignore
.terraform/
*.tfstate
*.tfstate.backup
*.tfvars          # May contain secrets
```

### 7. State and Workspaces

Terraform workspaces create separate state files within the same backend. Each workspace gets its own state:

```bash
terraform workspace new staging
terraform workspace new production
terraform workspace select staging
```

State keys become: `env:/staging/prod/networking/terraform.tfstate`. Workspaces are covered in detail in Guide 09.

---

## Quick Reference

| Task | Command |
|------|---------|
| List all managed resources | `terraform state list` |
| Inspect a resource | `terraform state show <address>` |
| Rename/move a resource | `terraform state mv <old> <new>` |
| Remove from management | `terraform state rm <address>` |
| Download state | `terraform state pull` |
| Upload state | `terraform state push <file>` |
| Force release a lock | `terraform force-unlock <lock-id>` |
| Migrate backend | `terraform init -migrate-state` |
| Reinitialize without migration | `terraform init -reconfigure` |
