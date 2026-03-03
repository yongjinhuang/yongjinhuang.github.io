# Providers and Authentication

Providers are Terraform's plugin system for talking to external APIs. Every resource and data source belongs to a provider. AWS resources come from the `hashicorp/aws` provider, GCP resources from `hashicorp/google`, and so on. There are over 3,000 providers in the Terraform Registry covering everything from major clouds to SaaS tools like Datadog, PagerDuty, GitHub, and Cloudflare. If a service has an API, there is probably a Terraform provider for it.

---

## 1. How Providers Work

```
Your .tf files  --->  Terraform Core  --->  Provider Plugin  --->  Cloud API
                      (orchestrator)       (translator)           (AWS, GCP, etc.)
```

Terraform Core reads your config, builds a dependency graph, and delegates actual API calls to provider plugins. Providers are separate binaries downloaded during `terraform init`.

---

## 2. Provider Configuration

### Basic Provider Block

```hcl
provider "aws" {
  region = "us-east-1"
}

provider "google" {
  project = "my-gcp-project"
  region  = "us-central1"
}

provider "azurerm" {
  features {}
}
```

### Required Providers in terraform Block

Always declare which providers your configuration needs and pin their versions:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.30"
    }
  }
}
```

The `source` follows the format `<namespace>/<type>`. Official HashiCorp providers use `hashicorp/`. Community providers use their own namespace.

---

## 3. Version Constraints

| Syntax | Meaning | Use When |
|--------|---------|----------|
| `= 5.1.0` | Exactly this version | Pinning after a known-good deploy |
| `~> 5.0` | >= 5.0.0, < 6.0.0 | Allow minor and patch updates |
| `~> 5.1` | >= 5.1.0, < 5.2.0 | Allow only patch updates |
| `>= 5.0` | 5.0 or newer | Rarely useful alone (too permissive) |
| `>= 5.0, < 6.0` | Range constraint | Explicit range |

**Recommendation:** Use `~> MAJOR.MINOR` for most cases. This allows patch updates while preventing minor version bumps that might introduce new behaviors.

---

## 4. Authentication Methods

Providers need credentials. **Never put credentials in `.tf` files.**

### 4.1 AWS Provider

The AWS provider checks credentials in this order (first match wins):

| Priority | Method | Best For |
|----------|--------|----------|
| 1 | Environment variables | CI/CD pipelines, containers |
| 2 | Shared credentials file (`~/.aws/credentials`) | Local development |
| 3 | Shared config file (`~/.aws/config`) | SSO profiles |
| 4 | EC2 instance profile / ECS task role | Workloads running in AWS |
| 5 | Web identity token (OIDC) | GitHub Actions, Kubernetes |

```bash
# Environment variables (CI/CD)
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="wJalr..."
export AWS_REGION="us-east-1"

# SSO profile (local dev)
aws sso login --profile my-sso-profile
export AWS_PROFILE="my-sso-profile"
```

```hcl
provider "aws" {
  region = "us-east-1"  # credentials come from environment or profile
}

# Cross-account via role assumption
provider "aws" {
  region = "us-east-1"
  assume_role {
    role_arn     = "arn:aws:iam::123456789012:role/TerraformRole"
    session_name = "terraform-deploy"
  }
}
```

### 4.2 GCP Provider

```bash
# Application Default Credentials (local dev)
gcloud auth application-default login

# Service account key (CI/CD -- prefer Workload Identity Federation instead)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

```hcl
provider "google" {
  project = "my-project-id"
  region  = "us-central1"
}
```

### 4.3 Azure Provider

```bash
# Azure CLI (local dev)
az login

# Service principal (CI/CD)
export ARM_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export ARM_CLIENT_SECRET="xxxxxxxx"
export ARM_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export ARM_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

```hcl
provider "azurerm" {
  features {}
  # With managed identity (workloads running in Azure)
  use_msi = true
}
```

---

## 5. Provider Aliases

When you need multiple instances of the same provider -- typically for multi-region or multi-account deployments.

```hcl
provider "aws" {
  region = "us-east-1"
}

provider "aws" {
  alias  = "europe"
  region = "eu-west-1"
}

provider "aws" {
  alias  = "shared_services"
  region = "us-east-1"
  assume_role {
    role_arn = "arn:aws:iam::999999999999:role/TerraformRole"
  }
}
```

### Using Aliased Providers

```hcl
# Default provider (us-east-1) -- no provider argument needed
resource "aws_instance" "us_web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
}

# Explicit alias
resource "aws_instance" "eu_web" {
  provider      = aws.europe
  ami           = "ami-0d71ea30463e0ff8d"
  instance_type = "t3.micro"
}

# Pass aliased provider to a module
module "eu_vpc" {
  source = "./modules/vpc"
  providers = {
    aws = aws.europe
  }
}
```

---

## 6. Provider Installation and Init

`terraform init` downloads providers and sets up the backend.

```bash
terraform init              # Download providers, configure backend
terraform init -upgrade     # Upgrade providers to latest matching versions
terraform init -reconfigure # Reconfigure backend
terraform init -migrate-state  # Migrate state to new backend
```

### What init Does

1. Reads `terraform {}` block
2. Downloads provider binaries to `.terraform/providers/`
3. Creates or updates `.terraform.lock.hcl`
4. Initializes the backend
5. Downloads child modules to `.terraform/modules/`

**Never commit `.terraform/` to version control.** It contains large binaries. Add it to `.gitignore`.

---

## 7. Dependency Lock File

`.terraform.lock.hcl` records the exact provider versions and their checksums -- the Terraform equivalent of `package-lock.json`.

| Rule | Why |
|------|-----|
| Always commit `.terraform.lock.hcl` | Ensures all team members and CI use the same versions |
| Never edit it manually | Let Terraform manage it |
| Run `terraform init -upgrade` to update | Respects constraints while upgrading |
| Run `terraform providers lock` to add platform hashes | Required when team uses different OS/arch |

```bash
# Generate hashes for multiple platforms
terraform providers lock -platform=darwin_arm64 -platform=linux_amd64

# Show currently locked providers
terraform providers
```

---

## 8. Official vs Community Providers

| Category | Source Namespace | Maintained By | Examples |
|----------|----------------|---------------|----------|
| Official | `hashicorp/` | HashiCorp | aws, google, azurerm, kubernetes |
| Partner | Varies | Technology partner | DataDog/datadog, cloudflare/cloudflare |
| Community | Varies | Individual maintainers | Varies widely in quality |

Prefer official and partner providers. Vet community providers carefully -- check commit history, issue tracker, and activity.

---

## 9. Provider Configuration for Environments

Do not hardcode environment-specific values. Use variables:

```hcl
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

provider "aws" {
  region = var.aws_region
}
```

```bash
# Per environment via tfvars
terraform apply -var-file="environments/prod.tfvars"
```

---

## 10. Common Gotchas

### Version Constraint Confusion

`~> 5.0` means >= 5.0.0, < 6.0.0 (allows 5.x.x). `~> 5.1` means >= 5.1.0, < 5.2.0 (allows 5.1.x only). The number of decimal places changes behavior. This catches people regularly.

### Credentials in CI/CD

Never store credentials in Terraform files. Use OIDC federation when possible:

```yaml
# GitHub Actions -- OIDC, no long-lived secrets
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsTerraform
    aws-region: us-east-1
```

### Provider Upgrades Can Break Things

Major version upgrades often include breaking changes. Always: read the changelog, upgrade in non-prod first, run `terraform plan` and review for unexpected destroys.

### Provider Not Found After Init

If you add a new provider to your config, you must run `terraform init` again. Terraform does not auto-download providers.

### Modules and Provider Passing

When passing providers to modules, the module must declare `required_providers`. Without it, Terraform may use the wrong provider or fail with a confusing error.

```hcl
# In the calling code
module "eu_app" {
  source = "./modules/app"
  providers = {
    aws = aws.europe
  }
}
```
