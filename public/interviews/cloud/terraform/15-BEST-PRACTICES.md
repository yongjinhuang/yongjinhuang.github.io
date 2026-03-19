# Production Best Practices & Team Workflows

Running Terraform solo on a side project is straightforward. Running it across a team of engineers managing production infrastructure for multiple services is a different challenge entirely. This guide covers the operational practices that separate hobbyist Terraform usage from production-grade infrastructure-as-code: code organization, team workflows, state management, module strategy, cost control, disaster recovery, upgrades, and local development.

---

## 1. Code Organization for Teams

### Monorepo Structure with Layered State

```
terraform/
  modules/                          # Reusable internal modules
    vpc/
      main.tf, variables.tf, outputs.tf
    rds-postgres/
      main.tf, variables.tf, outputs.tf
    ecs-service/
      main.tf, variables.tf, outputs.tf
  environments/
    prod/
      networking/                   # key = "prod/networking/terraform.tfstate"
        main.tf, backend.tf, variables.tf, prod.tfvars
      data/                         # key = "prod/data/terraform.tfstate"
        main.tf, backend.tf, variables.tf, prod.tfvars
      compute/                      # key = "prod/compute/terraform.tfstate"
        main.tf, backend.tf, variables.tf, prod.tfvars
      monitoring/
        main.tf, backend.tf, variables.tf, prod.tfvars
    staging/
      networking/ ...
      data/ ...
      compute/ ...
    dev/ ...
  scripts/
    plan.sh, apply.sh              # Wrappers with common flags
  .pre-commit-config.yaml
  .terraform-version               # tfenv version pinning
```

### File Naming Conventions

| File           | Purpose                                       |
| -------------- | --------------------------------------------- |
| `main.tf`      | Resource and module declarations              |
| `variables.tf` | All input variable declarations               |
| `outputs.tf`   | All output declarations                       |
| `data.tf`      | Data sources (AMI lookups, remote state)      |
| `locals.tf`    | Local values and computed expressions         |
| `backend.tf`   | Backend configuration                         |
| `versions.tf`  | `required_version` and `required_providers`   |
| `providers.tf` | Provider configuration (region, default_tags) |

### When to Split into Separate Repositories

| Scenario                                          | Single Repo         | Separate Repos                   |
| ------------------------------------------------- | ------------------- | -------------------------------- |
| One team, one product                             | Yes                 | No                               |
| Platform team publishes modules for product teams | No                  | Yes -- module registry repo      |
| Shared networking (VPC, Transit Gateway)          | Yes, separate layer | Separate repo with strict access |
| Fundamentally different products                  | No                  | Yes                              |

---

## 2. Team Workflow

### Branch Strategy

```
main (protected, no direct pushes)
  +-- feature/add-redis-cache       # Plan posted as PR comment
        +-- PR review + approval    # At least 1 reviewer
              +-- Merge to main     # Triggers apply (or manual gate for prod)
```

### Code Review Checklist for Terraform PRs

| Category | Check                                                              |
| -------- | ------------------------------------------------------------------ |
| Safety   | Plan reviewed -- no unexpected destroys or recreates               |
| Safety   | No secrets or credentials in code                                  |
| Safety   | Stateful resources have `deletion_protection` or `prevent_destroy` |
| Quality  | `terraform fmt` and `terraform validate` pass                      |
| Quality  | No hardcoded IDs, ARNs, or account numbers                         |
| Quality  | Variables have descriptions and type constraints                   |
| Ops      | New providers are version-pinned                                   |
| Ops      | `.terraform.lock.hcl` updated if providers changed                 |
| Ops      | Cost impact reviewed (Infracost if available)                      |

### Environment RBAC

| Role            | dev          | staging      | prod                         |
| --------------- | ------------ | ------------ | ---------------------------- |
| Junior Engineer | plan + apply | plan only    | read-only                    |
| Senior Engineer | plan + apply | plan + apply | plan only                    |
| Platform Lead   | plan + apply | plan + apply | plan + apply (with approval) |
| CI/CD Pipeline  | plan + apply | plan + apply | plan + apply (after merge)   |

Enforce via separate AWS accounts per environment, backend state bucket policies, and CI/CD approval gates.

### Communication During Applies

```yaml
# GitHub Actions: Post plan to PR, notify Slack on apply
- name: Post plan to PR
  uses: actions/github-script@v7
  with:
    script: |
      const plan = fs.readFileSync('plan.txt', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: `### Terraform Plan\n\`\`\`\n${plan}\n\`\`\``
      });

- name: Notify Slack on apply
  if: github.ref == 'refs/heads/main'
  uses: slackapi/slack-github-action@v1
  with:
    payload: '{"text": "Terraform apply: ${{ matrix.layer }} in ${{ matrix.env }}"}'
```

---

## 3. State Management at Scale

### State Per Component

```
s3://mycompany-tfstate/
  prod/networking/terraform.tfstate     # VPC, subnets, NAT
  prod/data/terraform.tfstate           # RDS, ElastiCache, S3
  prod/compute/terraform.tfstate        # ECS, ASG, Lambda
  prod/monitoring/terraform.tfstate     # CloudWatch, Datadog
  staging/networking/terraform.tfstate
  staging/data/terraform.tfstate
  ...
```

### Cross-State References

```hcl
data "terraform_remote_state" "networking" {
  backend = "s3"
  config  = { bucket = "mycompany-tfstate", key = "prod/networking/terraform.tfstate", region = "us-east-1" }
}

resource "aws_ecs_service" "api" {
  network_configuration {
    subnets = data.terraform_remote_state.networking.outputs.private_subnet_ids
  }
}
```

### State File Access Control

Use S3 bucket policies to restrict write access per environment. Dev roles get read-only access to prod state; only the CI/CD pipeline role and platform leads can write to prod state.

### Backup Strategy

- **S3 versioning**: Every apply creates a new version. Roll back to any previous state.
- **DynamoDB locking**: Prevents concurrent applies from corrupting state.
- **Cross-region replication**: Replicate the state bucket to a DR region.

```hcl
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}
```

---

## 4. Module Strategy

### Internal Module Registry

```hcl
# Private registry (Terraform Cloud/Enterprise)
module "vpc" { source = "app.terraform.io/mycompany/vpc/aws"; version = "2.1.0" }

# Git source with version tag
module "vpc" { source = "git::https://github.com/mycompany/terraform-aws-vpc.git?ref=v2.1.0" }
```

### Semantic Versioning

| Change Type                                       | Version Bump           |
| ------------------------------------------------- | ---------------------- |
| Bug fix, no interface change                      | Patch (2.1.0 -> 2.1.1) |
| New optional variable with default                | Minor (2.1.1 -> 2.2.0) |
| Removed variable, renamed output, resource rename | Major (2.2.0 -> 3.0.0) |

### Module Documentation and Testing

```
modules/ecs-service/
  README.md               # Generated by terraform-docs
  main.tf, variables.tf, outputs.tf
  examples/basic/main.tf  # Minimal working example
  tests/service_test.go   # Terratest integration tests
```

```go
// Terratest: apply, verify outputs, destroy
func TestVpcModule(t *testing.T) {
    opts := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../examples/basic",
        Vars: map[string]interface{}{"cidr": "10.99.0.0/16", "project": "test"},
    })
    defer terraform.Destroy(t, opts)
    terraform.InitAndApply(t, opts)
    assert.NotEmpty(t, terraform.Output(t, opts, "vpc_id"))
}
```

Run tests in CI before tagging a new module version. Never publish an untested module.

---

## 5. Cost Management

### Infracost for PR-Level Cost Estimates

```yaml
- name: Run Infracost
  run: |
    infracost breakdown --path=. --format=json --out-file=/tmp/infracost.json
    infracost comment github --path=/tmp/infracost.json \
      --repo=${{ github.repository }} --pull-request=${{ github.event.pull_request.number }}
```

### Tagging Strategy for Cost Allocation

Enable AWS Cost Explorer tag-based allocation for `Project`, `Team`, and `CostCenter`. Use `default_tags` in the provider block (see Patterns guide) so every resource is tagged automatically.

### Scheduled Destroy for Dev Environments

```yaml
# Destroy dev compute every Friday 8 PM UTC. Recreate Monday morning from the same code.
name: Dev Cleanup
on:
  schedule:
    - cron: '0 20 * * 5'
jobs:
  destroy-dev:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd environments/dev/compute && terraform init && terraform destroy -auto-approve
```

This alone can cut non-production cloud costs by 50-60%.

---

## 6. Disaster Recovery

### State Backup and Recovery

```bash
# List state versions (S3 versioning must be enabled)
aws s3api list-object-versions --bucket mycompany-tfstate \
  --prefix prod/compute/terraform.tfstate

# Download a known-good version
aws s3api get-object --bucket mycompany-tfstate \
  --key prod/compute/terraform.tfstate --version-id "abc123" recovered.tfstate

# Push recovered state and verify
terraform state push recovered.tfstate
terraform plan   # Should show no changes if state matches reality
```

### Multi-Region Infrastructure

```hcl
provider "aws" { alias = "primary"; region = "us-east-1" }
provider "aws" { alias = "dr";      region = "us-west-2" }

module "app_primary" { source = "./modules/app"; providers = { aws = aws.primary } }
module "app_dr"      { source = "./modules/app"; providers = { aws = aws.dr }; min_capacity = 1 }

resource "aws_route53_health_check" "primary" {
  fqdn = module.app_primary.endpoint; port = 443; type = "HTTPS"; failure_threshold = 3
}
# Route53 failover routing from primary to DR
```

### terraform import as a Recovery Tool

```bash
# When infrastructure exists but state is lost
terraform import aws_vpc.main vpc-0abc123def456
terraform import 'aws_subnet.private["us-east-1a"]' subnet-0abc123
terraform import 'aws_ecs_service.api' my-cluster/my-service
terraform plan   # Fix configuration drift before applying
```

### Runbook Template

| Incident                    | Resolution                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| State locked (stale)        | `terraform force-unlock <LOCK_ID>` after confirming no active apply                           |
| State corrupted             | Restore from S3 version: `terraform state push recovered.tfstate`                             |
| State drift detected        | If intentional: update code. If not: `terraform apply` to restore desired state.              |
| Resource deleted outside TF | `terraform plan` shows recreate. Review and apply, or `terraform import` if rebuilt manually. |

---

## 7. Upgrading Terraform

### Version Constraints

```hcl
terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers { aws = { source = "hashicorp/aws"; version = "~> 5.40" } }
}
```

### Upgrade Path

| Step | Action                                                            |
| ---- | ----------------------------------------------------------------- |
| 1    | Read the changelog for the target version                         |
| 2    | Upgrade one minor version at a time (1.6 -> 1.7, not 1.6 -> 1.9)  |
| 3    | `terraform init -upgrade` in dev                                  |
| 4    | `terraform plan` -- fix warnings and deprecations                 |
| 5    | Apply to dev, verify, repeat for staging, then prod               |
| 6    | Update `required_version`, `.terraform-version`, commit lock file |

Never upgrade Terraform and providers simultaneously. Isolate the source of any breakage.

---

## 8. Local Development

### LocalStack for Local AWS Emulation

```hcl
provider "aws" {
  region     = "us-east-1"
  access_key = "test"; secret_key = "test"
  skip_credentials_validation = true; skip_metadata_api_check = true
  endpoints { s3 = "http://localhost:4566"; dynamodb = "http://localhost:4566" }
}
```

```bash
docker run -d -p 4566:4566 localstack/localstack
terraform init && terraform apply   # Against local services, no AWS costs
```

### terraform console for Expression Testing

```bash
$ terraform console
> cidrsubnet("10.0.0.0/16", 8, 1)
"10.0.1.0/24"
> [for s in ["hello", "world"] : upper(s)]
["HELLO", "WORLD"]
> { for k, v in { a = 1, b = 2 } : k => v * 10 }
{ "a" = 10, "b" = 20 }
```

### terraform plan as Your Feedback Loop

```bash
terraform plan -var-file=dev.tfvars             # Fast feedback
terraform plan -out=tfplan                       # Save for review
terraform show -json tfplan | jq '.'             # Machine-readable
```

Run `terraform plan` frequently. It is your compiler. If the plan looks wrong, the apply will be wrong.

### IDE Setup

Install the **HashiCorp Terraform** VS Code extension for syntax highlighting, auto-format on save, and enhanced validation. Add `terraform.languageServer.enable: true` to your settings.

---

## Golden Rules

| #   | Rule                                               | Rationale                                                          |
| --- | -------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Always review `terraform plan` before apply        | Last chance to catch mistakes before they hit production           |
| 2   | Pin Terraform and provider versions                | Reproducible builds; no surprise breaking changes                  |
| 3   | Commit `.terraform.lock.hcl`                       | Ensures identical provider binaries across all machines            |
| 4   | One state file per logical component               | Limits blast radius; faster plans; independent team workflows      |
| 5   | Use `for_each` over `count` for distinct resources | Stable keys prevent the index-shift destroy/recreate problem       |
| 6   | Never hardcode IDs, ARNs, or account numbers       | Use data sources and references; works across accounts and regions |
| 7   | Fetch secrets from a secrets manager               | Secrets in version control are a breach waiting to happen          |
| 8   | Use `default_tags` in the provider block           | Consistent tagging without repetition; enables cost allocation     |
| 9   | Separate stateful from stateless resources         | Databases and S3 buckets have different risk profiles than compute |
| 10  | Small composable modules over mega-modules         | Easier to test, understand, and reuse                              |
| 11  | Use `moved` blocks when refactoring                | Rename or restructure without destroying real infrastructure       |
| 12  | Run `terraform fmt` and `validate` in CI           | Catches syntax and structural issues before review                 |
| 13  | Use pre-commit hooks with tfsec/checkov            | Security misconfigurations caught before they reach a PR           |
| 14  | Post plan output to PRs automatically              | Reviewers see infrastructure impact alongside the code diff        |
| 15  | Restrict prod apply permissions                    | Not everyone should be able to modify production infrastructure    |
| 16  | Enable S3 versioning on the state bucket           | Every apply is recoverable; state corruption is fixable            |
| 17  | Upgrade one version at a time                      | Isolates breakage; easier to bisect issues                         |
| 18  | Document modules with terraform-docs               | Auto-generated docs stay in sync with the actual interface         |
| 19  | Test modules with Terratest before publishing      | Untested modules are a liability, not an asset                     |
| 20  | Use Infracost in CI for cost visibility            | Engineers see the dollar impact of their changes before merge      |
