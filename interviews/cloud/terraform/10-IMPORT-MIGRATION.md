# Import & Migration

Most real-world Terraform adoption does not start with a blank slate. You inherit existing infrastructure -- manually created EC2 instances, console-configured databases, CloudFormation stacks you want to migrate away from. Terraform import brings those resources under management. State migration lets you restructure without destroying and recreating. This guide covers both the old and new import workflows, state manipulation, backend migration, and the tools that make brownfield adoption practical.

---

## Why You Need Import

| Scenario | What Happens |
|----------|-------------|
| Existing infra not managed by Terraform | Resources exist in AWS but not in state; Terraform wants to create duplicates |
| Brownfield project adoption | Team decides to adopt IaC for infrastructure that has been running for years |
| Migrating from CloudFormation/Pulumi | Need to bring resources into Terraform state without downtime |
| Resources created by another team | Shared resources (VPC, DNS zones) need to be managed or referenced |
| Disaster recovery | Rebuild state after accidental state file deletion |

---

## Import Command (Legacy Approach)

The original import method is imperative: you run a CLI command per resource.

```bash
terraform import <resource_address> <resource_id>
```

### Examples

```bash
# Import an EC2 instance
terraform import aws_instance.web i-0abc123def456789

# Import an S3 bucket
terraform import aws_s3_bucket.data my-data-bucket

# Import a resource inside a module
terraform import module.networking.aws_vpc.main vpc-0abc123

# Import a resource with a count index
terraform import 'aws_subnet.private[0]' subnet-0abc123

# Import a resource with for_each key
terraform import 'aws_subnet.private["us-east-1a"]' subnet-0abc123
```

### Step-by-Step Workflow (Legacy)

```bash
# 1. Write an empty (or partial) resource block
cat >> main.tf << 'EOF'
resource "aws_instance" "web" {
  # Will be filled in after import
}
EOF

# 2. Import the resource into state
terraform import aws_instance.web i-0abc123def456789

# 3. Check what Terraform thinks needs to change
terraform plan
# The plan will show differences between your empty block and reality

# 4. Fill in the resource block to match the imported state
# Use terraform show to see the current state values
terraform show -json | jq '.values.root_module.resources[] | select(.address == "aws_instance.web")'

# 5. Iterate until plan shows no changes
terraform plan
# No changes. Your infrastructure matches the configuration.
```

The goal after import is a clean plan -- `No changes. Infrastructure is up-to-date.` If the plan still shows diffs, your config does not match reality. Keep adjusting until it does.

---

## Import Blocks (Terraform 1.5+, Recommended)

Terraform 1.5 introduced declarative import blocks. Instead of running CLI commands, you declare what to import in your config.

```hcl
# imports.tf
import {
  to = aws_instance.web
  id = "i-0abc123def456789"
}

import {
  to = aws_s3_bucket.data
  id = "my-data-bucket"
}

import {
  to = module.networking.aws_vpc.main
  id = "vpc-0abc123"
}
```

Then run:

```bash
terraform plan
# Terraform will show that it plans to import these resources
# and what changes (if any) are needed to match config

terraform apply
# Imports the resources into state
```

### Advantages Over CLI Import

| Feature | CLI `terraform import` | Import Blocks |
|---------|----------------------|---------------|
| Declarative | No (imperative command) | Yes (in config) |
| Reviewable in PRs | No | Yes (code review) |
| Plannable | No (modifies state directly) | Yes (shows in plan output) |
| Bulk import | Requires scripting | Just add more blocks |
| Rollback | Manual state manipulation | Remove block, re-plan |

After the import is applied and the plan is clean, remove the `import` blocks from your config. They are one-time declarations.

---

## Auto-Generate Config for Imports (Terraform 1.5+)

The most powerful feature of the new import workflow: Terraform can generate the resource configuration for you.

```bash
# Generate config for all import blocks into a file
terraform plan -generate-config-out=generated.tf
```

This reads the real infrastructure for each `import` block and writes the corresponding resource configuration to `generated.tf`. You then review, clean up, and move the generated code into your actual config files.

### Full Workflow

```bash
# 1. Write import blocks
cat > imports.tf << 'EOF'
import {
  to = aws_instance.web
  id = "i-0abc123def456789"
}
EOF

# 2. Generate config
terraform plan -generate-config-out=generated_resources.tf

# 3. Review generated code (it will be verbose -- trim unnecessary defaults)
# Move relevant blocks from generated_resources.tf into your real .tf files

# 4. Remove generated file after incorporating changes
rm generated_resources.tf

# 5. Verify clean plan
terraform plan
# No changes.

# 6. Apply to finalize import
terraform apply

# 7. Remove import blocks (they are no longer needed)
rm imports.tf
```

**Note**: Generated config is often overly verbose. It includes every attribute the API returns, including computed and default values. Clean it up to only include attributes you want to manage.

---

## Bulk Import Strategies

For importing dozens or hundreds of resources, scripting is essential.

### Script-Based CLI Import

```bash
#!/bin/bash
# bulk-import.sh

# List of resources to import: "terraform_address cloud_id"
IMPORTS=(
  "aws_instance.web[0] i-0abc123"
  "aws_instance.web[1] i-0def456"
  "aws_security_group.web sg-0abc123"
  "aws_lb.main arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/main/abc123"
)

for entry in "${IMPORTS[@]}"; do
  addr=$(echo "$entry" | cut -d' ' -f1)
  id=$(echo "$entry" | cut -d' ' -f2-)
  echo "Importing $addr ($id)..."
  terraform import "$addr" "$id" || echo "FAILED: $addr"
done
```

### Generating Import Blocks Programmatically

```bash
# Use AWS CLI to list resources, then generate import blocks
aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text | \
  tr '\t' '\n' | \
  awk '{printf "import {\n  to = aws_instance.imported[\"%s\"]\n  id = \"%s\"\n}\n\n", $1, $1}' \
  > imports.tf
```

---

## State Migration

### Renaming Resources: terraform state mv

When you refactor your Terraform code (rename a resource, move it into a module), Terraform sees a destroy + create. `terraform state mv` updates the state without touching infrastructure.

```bash
# Rename a resource
terraform state mv aws_instance.web aws_instance.application

# Move a resource into a module
terraform state mv aws_instance.web module.compute.aws_instance.web

# Move a resource out of a module
terraform state mv module.compute.aws_instance.web aws_instance.web

# Rename a module
terraform state mv module.old_name module.new_name
```

After `state mv`, run `terraform plan` to verify no changes are detected.

### Moved Blocks (Terraform 1.1+, Recommended)

Declarative alternative to `terraform state mv`. Declare the refactoring in code; Terraform handles it on the next apply.

```hcl
# Tell Terraform that aws_instance.web was renamed to aws_instance.application
moved {
  from = aws_instance.web
  to   = aws_instance.application
}

# Tell Terraform that a resource moved into a module
moved {
  from = aws_instance.web
  to   = module.compute.aws_instance.web
}

# Tell Terraform that a module was renamed
moved {
  from = module.old_name
  to   = module.new_name
}
```

```bash
terraform plan
# Terraform will show: aws_instance.web has moved to aws_instance.application

terraform apply
# State is updated. No infrastructure changes.
```

### Advantages of Moved Blocks Over state mv

| Feature | `terraform state mv` | `moved` blocks |
|---------|---------------------|----------------|
| Declarative | No | Yes |
| Reviewable in PRs | No (state-level operation) | Yes |
| Works across team members | Everyone must run the command | Automatic on next plan/apply |
| Rollback | Manual state manipulation | Remove the block |

Keep `moved` blocks for a few apply cycles so all team members and CI pipelines pick up the change. Then remove them.

### Cross-State Moves

Moving a resource from one state file to another (e.g., splitting a monolith into separate root modules):

```bash
# 1. Remove from source state (does NOT destroy the resource)
cd source-project/
terraform state rm aws_instance.web
# Removed aws_instance.web

# 2. Import into destination state
cd ../destination-project/
terraform import aws_instance.web i-0abc123def456789

# 3. Verify both states
cd ../source-project/ && terraform plan
cd ../destination-project/ && terraform plan
# Both should show no unexpected changes
```

**Always back up state before cross-state moves:**

```bash
terraform state pull > state-backup.json
```

---

## Backend Migration

When changing where state is stored (local to S3, S3 to Terraform Cloud, etc.):

```bash
# Update backend config in your .tf files, then:
terraform init -migrate-state
```

Terraform will:
1. Read state from the old backend
2. Write state to the new backend
3. Confirm the migration

```hcl
# Before: local backend
terraform {
  backend "local" {}
}

# After: S3 backend
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "infra/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

```bash
terraform init -migrate-state
# Terraform detects the backend change and offers to migrate
# Type "yes" to confirm
```

If you need to reconfigure without migrating (start fresh):

```bash
terraform init -reconfigure
# Initializes with new backend, does NOT copy existing state
```

---

## Upgrading Terraform Versions

### Version Compatibility

Terraform state files include the version that last wrote them. Newer Terraform versions can read older state, but older versions cannot read state written by newer versions.

```hcl
terraform {
  required_version = ">= 1.5.0, < 2.0.0"
}
```

### Upgrade Path

```bash
# 1. Check current version
terraform version

# 2. Read the changelog for breaking changes
# https://github.com/hashicorp/terraform/blob/main/CHANGELOG.md

# 3. Back up state
terraform state pull > state-backup-$(date +%Y%m%d).json

# 4. Install new version (tfenv makes this easy)
tfenv install 1.7.0
tfenv use 1.7.0

# 5. Initialize (may upgrade internal state format)
terraform init -upgrade

# 6. Run plan and verify
terraform plan
# Should show no unexpected changes

# 7. If using modules, upgrade module versions too
terraform init -upgrade
```

### Key Version Milestones

| Version | Notable Changes |
|---------|----------------|
| 1.0 | Stability promise, no more breaking changes in 1.x |
| 1.1 | `moved` blocks for declarative refactoring |
| 1.3 | `optional()` for variable object attributes |
| 1.5 | `import` blocks, `-generate-config-out`, `check` blocks |
| 1.6 | `terraform test` framework (built-in testing) |
| 1.7 | `removed` blocks, provider-defined functions |

---

## Third-Party Import Tools

### Terraformer

Generates Terraform config and state from existing infrastructure. Supports AWS, GCP, Azure, and many others.

```bash
# Install
brew install terraformer

# Import all EC2 instances from a region
terraformer import aws --resources=ec2_instance --regions=us-east-1

# Import specific resource types
terraformer import aws --resources=vpc,subnet,security_group --regions=us-east-1

# Output goes to generated/ directory with .tf files and state
```

Terraformer is useful for initial bulk imports but the generated code is verbose and often needs significant cleanup.

### Former2

AWS-specific tool that reads CloudFormation, CDK, or Terraform config from your existing AWS account. It uses the browser console or CLI to scan resources.

```bash
# Web-based: https://former2.com
# Scans your AWS account and generates Terraform (or CloudFormation) code
```

### Import Comparison

| Tool | Scope | Config Generation | State Import | Maintained |
|------|-------|------------------|--------------|------------|
| `terraform import` | Single resource | No (before 1.5) | Yes | Official |
| Import blocks (1.5+) | Single resource | Yes (`-generate-config-out`) | Yes | Official |
| Terraformer | Bulk, multi-provider | Yes | Yes | Community |
| Former2 | AWS bulk | Yes | No (config only) | Community |

---

## Common Gotchas

| Gotcha | Why It Happens | How to Avoid |
|--------|----------------|--------------|
| Import does not generate config (pre-1.5) | Legacy `terraform import` only modifies state, not config | Use Terraform 1.5+ import blocks with `-generate-config-out` |
| Some resources cannot be imported | Provider does not implement import for that resource type | Check provider docs; may need to recreate or manage outside Terraform |
| State manipulation is risky | `state mv`, `state rm` directly modify state; mistakes can orphan or duplicate resources | Always back up state first: `terraform state pull > backup.json` |
| Generated config is too verbose | Auto-generation includes every API-returned attribute | Clean up generated code to only include attributes you want to manage |
| Import drift after apply | Imported resource config does not exactly match reality; apply modifies it | Always run `terraform plan` after import and resolve all diffs before moving on |
| Cross-state move creates a gap | Between `state rm` and `import`, the resource is unmanaged | Do both operations in quick succession; never leave resources in limbo |
| Backend migration loses state | Using `-reconfigure` instead of `-migrate-state` | Always use `-migrate-state`; `-reconfigure` starts fresh |
| Version upgrade breaks providers | Provider version constraints may conflict with new Terraform version | Pin provider versions; upgrade Terraform and providers separately |
| Moved blocks not picked up | Team members do not run `terraform init` or `apply` after refactoring | Keep `moved` blocks for several cycles; communicate refactoring in PRs |

---

## Quick Reference

```bash
# Legacy import
terraform import aws_instance.web i-0abc123

# Import blocks (1.5+) -- add to .tf file then:
terraform plan
terraform apply

# Generate config for import blocks
terraform plan -generate-config-out=generated.tf

# Rename resource in state
terraform state mv aws_instance.old aws_instance.new

# Remove from state (does not destroy)
terraform state rm aws_instance.orphan

# List all resources in state
terraform state list

# Show a specific resource in state
terraform state show aws_instance.web

# Pull full state to a file (backup)
terraform state pull > backup.json

# Push state from a file (dangerous, use with caution)
terraform state push backup.json

# Migrate backend
terraform init -migrate-state

# Upgrade providers and modules
terraform init -upgrade
```
