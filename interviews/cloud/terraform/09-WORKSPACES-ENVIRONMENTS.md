# Workspaces & Environments

Every team eventually faces the same question: how do you manage dev, staging, and production with the same Terraform code? There is no single right answer. Terraform workspaces, directory-per-environment layouts, Terragrunt, and Terraform Cloud each solve the problem differently with distinct trade-offs. This guide walks through each approach, when it works, and when it breaks down.

---

## The Problem

You have one set of Terraform modules that defines your infrastructure. You need to deploy it to multiple environments that differ in scale, region, account, or feature flags. You need:

- **State isolation**: A bad apply in dev must not corrupt prod state
- **Config variation**: Prod needs 3 replicas, dev needs 1
- **Independent lifecycles**: Deploy to staging without touching prod
- **Code reuse**: Do not copy-paste hundreds of lines across environments

---

## Approach 1: Terraform Workspaces

Terraform has a built-in workspace concept that maintains separate state files for the same configuration directory.

### Basic Commands

```bash
# List workspaces (* marks current)
terraform workspace list
# * default
#   staging
#   production

# Create a new workspace
terraform workspace new staging

# Switch workspace
terraform workspace select production

# Delete a workspace (must not be current, must have empty state)
terraform workspace delete staging

# Show current workspace
terraform workspace show
```

### Using the Workspace Name in Config

```hcl
locals {
  env = terraform.workspace

  instance_type = {
    default    = "t3.micro"
    staging    = "t3.small"
    production = "t3.large"
  }
}

resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = local.instance_type[local.env]

  tags = {
    Name        = "web-${local.env}"
    Environment = local.env
  }
}
```

### How Workspace State Is Stored

With a local backend, workspaces create subdirectories:

```
terraform.tfstate.d/
  staging/
    terraform.tfstate
  production/
    terraform.tfstate
```

With S3 backend, workspaces use key prefixes:

```hcl
backend "s3" {
  bucket = "my-terraform-state"
  key    = "infra/terraform.tfstate"
  region = "us-east-1"
}
# Workspace "staging" stores state at: env:/staging/infra/terraform.tfstate
# Workspace "production" stores state at: env:/production/infra/terraform.tfstate
```

### When Workspaces Work Well

| Scenario | Why |
|----------|-----|
| Same config, different scale | Just change instance counts/sizes per workspace |
| Ephemeral test environments | Quick to create and destroy |
| Single developer iterating | Low overhead, no directory duplication |
| Simple projects with < 20 resources | Workspace switching is fast and manageable |

### When Workspaces Do NOT Work

| Scenario | Why |
|----------|-----|
| Environments need different resources | You end up with `count = terraform.workspace == "prod" ? 1 : 0` everywhere |
| Different providers per environment | Backend config is shared; you cannot vary provider config per workspace |
| Different backend configs per environment | All workspaces share the same backend block |
| Team workflows with CI/CD | Workspace selection is imperative; easy to apply to the wrong workspace |
| Environments in different AWS accounts | Provider config cannot vary by workspace without ugly hacks |

The fundamental limitation: workspaces share the same backend configuration and provider configuration. If your environments differ in anything beyond variable values, workspaces become painful.

---

## Approach 2: Directory-per-Environment (Recommended for Most Teams)

The most common pattern in production. Shared modules define the infrastructure; environment-specific root modules wire them together with environment-specific values.

### Directory Structure

```
infrastructure/
  modules/
    networking/
      main.tf
      variables.tf
      outputs.tf
    compute/
      main.tf
      variables.tf
      outputs.tf
    database/
      main.tf
      variables.tf
      outputs.tf
  environments/
    dev/
      main.tf
      backend.tf
      terraform.tfvars
      providers.tf
    staging/
      main.tf
      backend.tf
      terraform.tfvars
      providers.tf
    production/
      main.tf
      backend.tf
      terraform.tfvars
      providers.tf
```

### Environment Root Module

```hcl
# environments/production/main.tf
module "networking" {
  source = "../../modules/networking"

  vpc_cidr     = var.vpc_cidr
  environment  = "production"
  az_count     = 3
}

module "compute" {
  source = "../../modules/compute"

  instance_type = var.instance_type
  min_size      = var.min_size
  max_size      = var.max_size
  subnet_ids    = module.networking.private_subnet_ids
}

module "database" {
  source = "../../modules/database"

  instance_class    = var.db_instance_class
  multi_az          = true
  subnet_group_name = module.networking.db_subnet_group
}
```

```hcl
# environments/production/backend.tf
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state-prod"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks-prod"
    encrypt        = true
  }
}
```

```hcl
# environments/production/terraform.tfvars
vpc_cidr        = "10.0.0.0/16"
instance_type   = "t3.large"
min_size        = 3
max_size        = 10
db_instance_class = "db.r6g.xlarge"
```

### Advantages

- Each environment has its own state file, backend, and provider config
- No risk of applying to the wrong environment (you `cd` into the directory)
- Environments can diverge when needed (prod has WAF, dev does not)
- CI/CD is straightforward: each directory is an independent Terraform root

### Disadvantages

- Some duplication in root module files across environments
- Changes to module interfaces require updating all environment roots
- More directories to maintain

---

## Approach 3: Terragrunt

Terragrunt is a thin wrapper around Terraform that eliminates duplication in multi-environment setups. It is maintained by Gruntwork.

### What Terragrunt Adds

| Feature | How |
|---------|-----|
| DRY backend config | Define backend once in a parent `terragrunt.hcl`, inherited by children |
| DRY provider config | Same inheritance pattern for providers |
| Dependency management | `dependency` blocks pass outputs between modules |
| `run-all` command | Apply/plan across all modules in a directory tree |
| Before/after hooks | Run scripts before or after Terraform commands |
| Auto-init and auto-retry | Reduces boilerplate in CI/CD |

### Directory Structure with Terragrunt

```
infrastructure/
  terragrunt.hcl              # Root config (backend, provider defaults)
  modules/
    networking/
      main.tf
      variables.tf
      outputs.tf
    compute/
      main.tf
      variables.tf
      outputs.tf
  environments/
    dev/
      env.hcl                 # Environment-level variables
      networking/
        terragrunt.hcl
      compute/
        terragrunt.hcl
    staging/
      env.hcl
      networking/
        terragrunt.hcl
      compute/
        terragrunt.hcl
    production/
      env.hcl
      networking/
        terragrunt.hcl
      compute/
        terragrunt.hcl
```

### Root terragrunt.hcl

```hcl
# infrastructure/terragrunt.hcl
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket         = "mycompany-terraform-state-${local.env}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks-${local.env}"
  }
}

locals {
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))
  env      = local.env_vars.locals.environment
}
```

### Child terragrunt.hcl

```hcl
# environments/production/compute/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../../modules/compute"
}

dependency "networking" {
  config_path = "../networking"
}

inputs = {
  instance_type = "t3.large"
  min_size      = 3
  max_size      = 10
  subnet_ids    = dependency.networking.outputs.private_subnet_ids
}
```

### When to Use Terragrunt vs Native Terraform

| Use Terragrunt When | Use Native Terraform When |
|---------------------|--------------------------|
| 3+ environments with similar structure | 1-2 environments |
| Backend config duplication is painful | Backend config differences are minimal |
| Cross-module dependencies are complex | Modules are independent |
| You want `run-all` for multi-module applies | You apply modules individually |
| Team is comfortable with the extra abstraction | Team prefers fewer tools in the stack |

---

## Approach 4: Terraform Cloud / HCP Terraform Workspaces

Terraform Cloud workspaces are different from CLI workspaces. Each workspace is a fully independent unit with its own state, variables, and VCS connection.

```
Terraform Cloud Workspace: "app-production"
  - VCS: github.com/myorg/infra (branch: main, path: environments/production)
  - Variables: instance_type = "t3.large", region = "us-east-1"
  - State: stored and versioned by Terraform Cloud
  - Run triggers: auto-plan on PR, manual apply

Terraform Cloud Workspace: "app-staging"
  - VCS: github.com/myorg/infra (branch: main, path: environments/staging)
  - Variables: instance_type = "t3.small", region = "us-east-1"
  - State: separate from production
```

Terraform Cloud handles state storage, locking, run history, policy enforcement (Sentinel/OPA), and team permissions. The trade-off is vendor lock-in and cost at scale.

---

## Environment Variables and Var Files Strategy

```
environments/
  dev.tfvars
  staging.tfvars
  production.tfvars
```

```bash
# Select environment by var file
terraform plan -var-file=environments/production.tfvars
```

For sensitive values, use environment variables:

```bash
export TF_VAR_db_password="$(aws secretsmanager get-secret-value \
  --secret-id prod/db/password --query SecretString --output text)"

terraform apply -var-file=environments/production.tfvars
```

Variable precedence (last wins):

1. Default values in `variable` blocks
2. `terraform.tfvars` (auto-loaded)
3. `*.auto.tfvars` (auto-loaded, alphabetical)
4. `-var-file` flag
5. `-var` flag
6. `TF_VAR_*` environment variables

---

## AWS Account-per-Environment Pattern

The gold standard for environment isolation on AWS is separate accounts via AWS Organizations.

```hcl
# Provider config for cross-account access
provider "aws" {
  region = "us-east-1"

  assume_role {
    role_arn = "arn:aws:iam::${var.target_account_id}:role/TerraformDeployRole"
  }
}
```

```
AWS Organization
  Management Account (billing, organization policies)
    Dev Account       (123456789012) -- wide permissions, low blast radius
    Staging Account   (234567890123) -- mirrors prod config
    Production Account(345678901234) -- restricted access, change management
    Shared Services   (456789012345) -- CI/CD, artifact storage, monitoring
```

Each account has its own IAM boundaries, service quotas, and billing. A Terraform run for dev literally cannot touch prod resources because the credentials do not have access.

---

## Promoting Changes Through Environments

The standard promotion flow:

```
Feature Branch --> dev (auto-apply on push)
                    |
                    v
               staging (auto-apply on merge to main)
                    |
                    v
               production (manual approval + apply)
```

### Promotion Strategies

| Strategy | How | Trade-off |
|----------|-----|-----------|
| Same code, different vars | One module, `-var-file` per env | Simple but limited divergence |
| Branch-per-environment | `dev` branch -> dev, `main` -> staging, tag -> prod | Merge conflicts, drift between branches |
| Directory-per-environment | `cd environments/prod && terraform apply` | Some duplication, but clear isolation |
| Artifact promotion | Build plan artifact in staging, adapt for prod | Complex but most reliable |

The directory-per-environment approach with shared modules is the most common pattern in mature teams. Branch-per-environment is almost universally considered an anti-pattern due to merge drift.

---

## Common Gotchas

| Gotcha | Why It Happens | How to Avoid |
|--------|----------------|--------------|
| Applied to wrong workspace | `terraform workspace select` is imperative and easy to forget | Use directory-per-environment instead; or name resources with `terraform.workspace` |
| Workspace state not isolated enough | All workspaces share the same backend and credentials | Use separate accounts or at minimum separate state buckets |
| Terragrunt learning curve | Extra layer of abstraction, `find_in_parent_folders`, HCL-in-HCL | Start with directory-per-environment; adopt Terragrunt when duplication becomes painful |
| Environment parity drift | Environments diverge over time as hotfixes go to prod only | Enforce promotion flow; never apply directly to prod without going through lower environments |
| Branch-per-environment merge conflicts | Dev and prod branches diverge; merges become painful | Use directory-per-environment or var-file approach instead |
| Terraform Cloud cost at scale | Per-resource pricing adds up with many workspaces | Evaluate open-source alternatives (Atlantis, custom CI/CD) |
| Shared state across environments | Using one state file for all environments | Always separate state per environment; this is non-negotiable |

---

## Comparison Summary

| Criteria | CLI Workspaces | Directory-per-env | Terragrunt | TF Cloud Workspaces |
|----------|---------------|-------------------|------------|-------------------|
| State isolation | Same backend, different keys | Fully separate | Fully separate | Fully separate |
| Config variation | `terraform.workspace` conditionals | Different var files | `inputs` in HCL | Workspace variables |
| Backend flexibility | Shared | Independent | DRY + independent | Managed by TF Cloud |
| CI/CD integration | Requires workspace selection step | Natural (`cd` into dir) | `run-all` support | Built-in VCS triggers |
| Duplication | Minimal | Some (root modules) | Minimal | Some (workspace config) |
| Learning curve | Low | Low | Medium | Medium |
| Team scale | Small | Medium-Large | Large | Large |
| Cost | Free | Free | Free (OSS) | Paid at scale |

For most teams starting out: **directory-per-environment with shared modules**. Adopt Terragrunt or Terraform Cloud when the duplication or coordination overhead justifies the additional tooling.
