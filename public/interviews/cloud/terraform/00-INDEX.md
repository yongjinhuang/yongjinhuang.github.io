# Terraform: Infrastructure as Code for Engineers

Terraform by HashiCorp is the industry-standard tool for defining, provisioning, and managing cloud infrastructure using declarative configuration files. It works across AWS, GCP, Azure, and 3,000+ providers (Datadog, PagerDuty, GitHub, Cloudflare, etc.). If you can manage it through an API, Terraform can manage it as code.

---

## Why Terraform

| Problem | How Terraform Solves It |
|---------|------------------------|
| Manual console clicks are unreproducible | Declarative config files in version control |
| "It works on my account" | Same code deploys the same infrastructure everywhere |
| No audit trail for infra changes | Git history = infrastructure changelog |
| Drift between environments | Plan/apply workflow catches drift before it causes incidents |
| Multi-cloud / multi-provider | Single tool, single workflow, thousands of providers |
| Team collaboration | Remote state with locking prevents concurrent modifications |

---

## Core Concepts at a Glance

```
+-------------------+     +-------------------+     +-------------------+
|   CONFIGURATION   |     |      STATE        |     |   REAL INFRA      |
|   (.tf files)     | --> |  (terraform.tfstate)| --> |   (AWS, GCP, etc) |
|   "desired state" |     |  "known state"    |     |   "actual state"  |
+-------------------+     +-------------------+     +-------------------+
        |                         |                         |
        +--- terraform plan ------+---- compares -----------+
        +--- terraform apply -----+---- reconciles ---------+
```

**Configuration** = what you want (`.tf` files)
**State** = what Terraform thinks exists (`.tfstate` file)
**Real Infrastructure** = what actually exists in the cloud

`terraform plan` compares all three. `terraform apply` makes reality match your config.

---

## The Workflow

```bash
# 1. Write configuration
vim main.tf

# 2. Initialize (download providers, set up backend)
terraform init

# 3. Preview changes (never skip this)
terraform plan

# 4. Apply changes
terraform apply

# 5. Inspect current state
terraform show

# 6. Tear down everything
terraform destroy
```

---

## Guide Contents

### Terraform Language & Core

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 00 | Index (this file) | Overview, why Terraform, core workflow |
| 01 | HCL Syntax | The language: blocks, arguments, types, comments |
| 02 | Providers | Connecting to AWS, GCP, Azure, and others |
| 03 | Resources & Data Sources | Creating infrastructure and reading existing resources |
| 04 | Variables, Outputs & Locals | Parameterizing and composing configurations |
| 05 | Expressions & Functions | Conditionals, loops, built-in functions, dynamic blocks |

### State & Modules

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 06 | State Management | Remote backends, locking, state operations, troubleshooting |
| 07 | Modules | Reusable infrastructure components, module design, registry |

### Workflows & Operations

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 08 | Plan & Apply Workflow | The core workflow, targeting, replacing, lifecycle rules |
| 09 | Workspaces & Environments | Managing dev/staging/prod with the same code |
| 10 | Import & Migration | Bringing existing infrastructure under Terraform control |

### Quality & Automation

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 11 | Testing | Validation, policy-as-code, integration tests, `terraform test` |
| 12 | CI/CD Pipelines | GitHub Actions, Atlantis, Terraform Cloud, GitOps |
| 13 | Security | Secrets handling, least privilege, policy enforcement, scanning |

### Mastery

| # | Guide | What You'll Learn |
|---|-------|-------------------|
| 14 | Patterns & Anti-Patterns | Battle-tested patterns and common mistakes to avoid |
| 15 | Production Best Practices | Team workflows, code organization, operational excellence |

---

## Installation

```bash
# macOS
brew install terraform

# Verify
terraform version

# Enable tab completion
terraform -install-autocomplete
```

## Editor Setup

```bash
# VS Code -- install HashiCorp Terraform extension
code --install-extension hashicorp.terraform

# It gives you: syntax highlighting, auto-completion,
# format-on-save, go-to-definition, and validation
```

## Essential CLI Commands

```bash
terraform init          # Download providers, configure backend
terraform fmt           # Format .tf files (run before every commit)
terraform validate      # Check syntax and internal consistency
terraform plan          # Preview changes
terraform apply         # Apply changes
terraform destroy       # Tear down all resources
terraform show          # Show current state
terraform state list    # List all resources in state
terraform output        # Show output values
terraform import        # Import existing resource into state
terraform taint         # Mark resource for recreation (deprecated, use -replace)
terraform graph         # Generate dependency graph (DOT format)
```
