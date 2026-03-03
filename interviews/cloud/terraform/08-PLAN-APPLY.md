# Plan & Apply Workflow

The plan/apply cycle is Terraform's core operational loop. You write config, Terraform computes the diff between your desired state and reality, shows you exactly what it will do, and then executes those changes. Understanding this workflow deeply -- including saved plans, targeting, lifecycle rules, and CI/CD integration -- separates operators who use Terraform from those who trust it.

---

## The Core Cycle: init -> plan -> apply

```bash
# 1. Initialize the working directory (download providers, configure backend)
terraform init

# 2. Preview what Terraform will do (read-only, no changes made)
terraform plan

# 3. Execute the changes
terraform apply
```

Every Terraform workflow follows this sequence. `init` is typically run once per directory (or after adding providers/modules). `plan` and `apply` are run repeatedly as you iterate.

---

## What terraform plan Actually Does

`terraform plan` performs three comparisons:

```
Configuration (.tf files)  ---+
                               |--- compute diff ---> Execution Plan
State (terraform.tfstate)  ---+
                               |
Real Infrastructure (API)  ---+
```

1. **Reads your configuration** from `.tf` files
2. **Reads the state file** to understand what Terraform currently manages
3. **Refreshes state** by querying real infrastructure APIs (unless `-refresh=false`)
4. **Computes the diff** between desired state (config) and known state (refreshed state)
5. **Outputs the execution plan** showing exactly what will change

Plan is read-only. It never modifies infrastructure.

---

## Reading Plan Output

Plan output uses symbols to indicate change types:

| Symbol | Meaning | Description |
|--------|---------|-------------|
| `+` | Create | New resource will be created |
| `~` | Update in-place | Existing resource will be modified without recreation |
| `-` | Destroy | Resource will be deleted |
| `-/+` | Replace (destroy then create) | Resource must be destroyed and recreated |
| `+/-` | Replace (create then destroy) | New resource created before old one is destroyed |
| `<=` | Read | Data source will be read |

```
# aws_instance.web will be updated in-place
~ resource "aws_instance" "web" {
    ~ instance_type = "t3.micro" -> "t3.small"
      id            = "i-0abc123def456"
      tags          = {
          "Name" = "web-server"
      }
  }

Plan: 0 to add, 1 to change, 0 to destroy.
```

The `~` prefix on a specific attribute tells you which fields change. Unchanged attributes are shown without a prefix for context.

---

## Saved Plans

```bash
# Save plan to a binary file
terraform plan -out=tfplan

# Apply the exact saved plan (no confirmation prompt)
terraform apply tfplan
```

### Why Saved Plans Matter

Without a saved plan, `terraform apply` runs its own plan internally before applying. If infrastructure changed between your `plan` and `apply` (someone modified something in the console, another pipeline ran), the applied changes may differ from what you reviewed.

With a saved plan, Terraform applies exactly what was planned. If the state has drifted since the plan was created, Terraform will reject the saved plan and force you to re-plan.

```bash
# CI/CD pattern: plan on PR, save artifact, apply on merge
terraform plan -out=tfplan -input=false
# Store tfplan as a build artifact
# On merge:
terraform apply -input=false tfplan
```

**Note**: The plan file is a binary format. It is not human-readable. It also contains sensitive values, so treat it accordingly.

---

## terraform apply

```bash
# Interactive: shows plan, prompts for confirmation
terraform apply

# Skip confirmation (CI/CD only -- never use interactively)
terraform apply -auto-approve

# Apply a saved plan (no confirmation needed, plan already reviewed)
terraform apply tfplan
```

`-auto-approve` should only be used in automated pipelines where a human already reviewed the plan output in a prior step. Using it interactively defeats the purpose of the plan/apply safety model.

---

## Targeting Specific Resources

```bash
# Only plan/apply changes for a specific resource
terraform plan -target=aws_instance.web
terraform apply -target=aws_instance.web

# Target a module
terraform apply -target=module.networking

# Multiple targets
terraform apply -target=aws_security_group.web -target=aws_instance.web
```

### When to Use -target

`-target` is an escape hatch, not a workflow. Use it when:

- You need to fix a specific broken resource without touching the rest
- You are debugging dependency issues
- A full apply would take too long and you need to iterate on one piece

### When NOT to Use -target

- As a regular part of your workflow (this means your config is too big; split into modules)
- To permanently skip resources (use `lifecycle` blocks instead)
- In CI/CD pipelines (you should be applying the full plan)

After using `-target`, always run a full `terraform plan` to verify the overall state is consistent.

---

## Replacing Resources

```bash
# Force recreation of a specific resource (replaces deprecated terraform taint)
terraform apply -replace=aws_instance.web

# Plan with replacement to preview
terraform plan -replace=aws_instance.web
```

Use `-replace` when you need to force-recreate a resource even though Terraform sees no config change. Common scenarios:

- The underlying instance is corrupted
- You need to rotate a TLS certificate
- AMI baking process changed but the AMI ID is the same
- A resource is in a bad state that an update cannot fix

---

## Refresh-Only Mode

```bash
# Detect drift without changing config
terraform plan -refresh-only

# Update state to match reality (no infra changes)
terraform apply -refresh-only
```

Refresh-only mode answers: "Has reality drifted from what Terraform expects?" It updates the state file to match real infrastructure but does not modify any resources. Use this to:

- Audit drift after manual changes
- Update state after out-of-band changes you want to accept
- Verify that infrastructure matches state before a major change

---

## Resource Lifecycle Rules

Lifecycle rules modify how Terraform handles resource creation, updates, and deletion.

```hcl
resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = "t3.small"

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
    ignore_changes        = [tags, ami]
  }
}
```

### create_before_destroy

```hcl
lifecycle {
  create_before_destroy = true
}
```

When a resource must be replaced, create the new one first, then destroy the old one. Critical for zero-downtime replacements (load balancer targets, DNS records, etc.).

### prevent_destroy

```hcl
lifecycle {
  prevent_destroy = true
}
```

Terraform will error if a plan would destroy this resource. Protects databases, S3 buckets with important data, and other resources you never want accidentally deleted. Remove the rule when you actually need to destroy.

### ignore_changes

```hcl
lifecycle {
  ignore_changes = [tags["LastModified"], ami]
}
```

Terraform ignores changes to the specified attributes. Use when external processes legitimately modify certain attributes (auto-scaling changes to `desired_capacity`, external tagging systems, etc.).

```hcl
# Ignore ALL attribute changes (Terraform manages existence only)
lifecycle {
  ignore_changes = all
}
```

### replace_triggered_by

```hcl
resource "aws_instance" "web" {
  # ...
  lifecycle {
    replace_triggered_by = [null_resource.trigger.id]
  }
}
```

Force replacement when a referenced resource or attribute changes. Useful for coupling replacements across resources.

---

## Destroy

```bash
# Destroy all resources managed by this configuration
terraform destroy

# Preview what will be destroyed
terraform plan -destroy

# Destroy specific resources only
terraform destroy -target=aws_instance.web

# Skip confirmation (CI/CD only)
terraform destroy -auto-approve
```

`terraform destroy` is equivalent to removing all resources from your config and running `terraform apply`. It reads the state to determine what exists and destroys everything.

---

## Variable Files

```bash
# Use a specific variable file
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/production.tfvars

# Combine with saved plan
terraform plan -var-file=staging.tfvars -out=tfplan
terraform apply tfplan
```

Files named `terraform.tfvars` or `*.auto.tfvars` are loaded automatically. Everything else requires `-var-file`.

```bash
# Inline variable override
terraform apply -var="instance_type=t3.large"
```

---

## Plan & Apply in CI/CD

A standard CI/CD pattern for Terraform:

```
PR Opened/Updated:
  1. terraform init
  2. terraform fmt -check
  3. terraform validate
  4. terraform plan -out=tfplan
  5. Post plan output as PR comment

PR Merged to main:
  1. terraform init
  2. terraform apply tfplan   # or re-plan + auto-approve
```

```yaml
# GitHub Actions example (simplified)
- name: Terraform Plan
  run: |
    terraform init -input=false
    terraform plan -input=false -out=tfplan
    terraform show -no-color tfplan > plan.txt

- name: Comment PR with Plan
  uses: actions/github-script@v7
  with:
    script: |
      const plan = require('fs').readFileSync('plan.txt', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '```\n' + plan + '\n```'
      });
```

---

## Common Gotchas

| Gotcha | Why It Happens | How to Avoid |
|--------|----------------|--------------|
| Plan succeeds but apply fails | Plan only checks Terraform logic; apply hits real APIs that may reject requests (quota, permissions, naming conflicts) | Test in a lower environment first; handle API-specific constraints in config |
| Plan output differs from actual apply | Infrastructure changed between plan and apply | Use saved plans (`-out=tfplan`) |
| `-target` leaves state inconsistent | Terraform skips dependency graph for non-targeted resources | Always run a full plan after targeted operations |
| `-auto-approve` destroys resources | No human review before apply | Only use in CI/CD after plan review; never use interactively |
| `prevent_destroy` blocks `terraform destroy` | Working as intended | Remove the lifecycle rule before destroying |
| `ignore_changes` hides real drift | Terraform stops tracking those attributes entirely | Only ignore attributes managed by external systems |
| Refresh shows unexpected changes | Someone modified infrastructure outside Terraform | Run `terraform apply -refresh-only` to accept the drift, or fix the config |

---

## Quick Reference

```bash
# Core workflow
terraform init
terraform plan
terraform apply

# Saved plan workflow
terraform plan -out=tfplan
terraform apply tfplan

# Target a resource
terraform plan -target=aws_instance.web

# Force replace
terraform apply -replace=aws_instance.web

# Detect drift
terraform plan -refresh-only

# Destroy everything
terraform destroy

# Use var file
terraform apply -var-file=prod.tfvars

# CI/CD apply
terraform apply -input=false -auto-approve
```
