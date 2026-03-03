# CI/CD Pipelines for Terraform

Infrastructure changes should flow through the same rigorous review process as application code: propose a change in a pull request, generate a plan, review the diff, merge, and apply. Automating this workflow eliminates human error from manual `terraform apply` sessions, enforces policy checks before changes reach production, and creates an audit trail of every infrastructure modification. This guide covers the three dominant approaches -- GitHub Actions, Atlantis, and Terraform Cloud -- along with the practices that make any pipeline reliable.

---

## The GitOps Model for Infrastructure

```
Developer        GitHub              CI/CD              Cloud
   |                |                  |                  |
   |-- push branch->|                  |                  |
   |-- open PR ---->|                  |                  |
   |                |-- trigger ------>|                  |
   |                |                  |-- terraform plan->|
   |                |<-- plan output --|                  |
   |                |   (PR comment)   |                  |
   |                |                  |                  |
   |<- review plan -|                  |                  |
   |-- merge PR --->|                  |                  |
   |                |-- trigger ------>|                  |
   |                |                  |-- terraform apply>|
   |                |<-- apply result--|                  |
```

The principle: **no human ever runs `terraform apply` from their laptop.** All changes go through version control and automated pipelines.

---

## GitHub Actions Workflow

### Complete Example

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  pull_request:
    branches: [main]
    paths:
      - 'infrastructure/**'
  push:
    branches: [main]
    paths:
      - 'infrastructure/**'

permissions:
  id-token: write    # Required for OIDC
  contents: read
  pull-requests: write  # Required to post PR comments

env:
  TF_VERSION: "1.7.0"
  WORKING_DIR: "infrastructure/environments/production"

jobs:
  plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS Credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/terraform-plan
          aws-region: us-west-2

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform fmt
        id: fmt
        run: terraform fmt -check -recursive
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Init
        id: init
        run: terraform init -input=false
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Validate
        id: validate
        run: terraform validate -no-color
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Plan
        id: plan
        run: |
          terraform plan -no-color -input=false \
            -out=tfplan 2>&1 | tee plan_output.txt
          echo "exitcode=$?" >> $GITHUB_OUTPUT
        working-directory: ${{ env.WORKING_DIR }}
        continue-on-error: true

      - name: Post Plan to PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync(
              '${{ env.WORKING_DIR }}/plan_output.txt', 'utf8'
            );
            const truncated = plan.length > 60000
              ? plan.substring(0, 60000) + '\n... (truncated)'
              : plan;

            const body = `### Terraform Plan
            | Step | Status |
            |------|--------|
            | Format | \`${{ steps.fmt.outcome }}\` |
            | Init | \`${{ steps.init.outcome }}\` |
            | Validate | \`${{ steps.validate.outcome }}\` |
            | Plan | \`${{ steps.plan.outcome }}\` |

            <details><summary>Plan Output</summary>

            \`\`\`
            ${truncated}
            \`\`\`

            </details>`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - name: Plan Status
        if: steps.plan.outcome == 'failure'
        run: exit 1

  apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS Credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/terraform-apply
          aws-region: us-west-2

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Init
        run: terraform init -input=false
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Apply
        run: terraform apply -auto-approve -input=false
        working-directory: ${{ env.WORKING_DIR }}
```

### OIDC Authentication (No Long-Lived Credentials)

Never store AWS access keys as GitHub secrets. Use OIDC federation instead.

```hcl
# Terraform to create the OIDC provider and role
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

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
            "repo:my-org/my-repo:pull_request"
        }
      }
    }]
  })
}
```

The plan role gets read-only access. The apply role gets write access and is restricted to `refs/heads/main`.

### Multi-Environment Strategy

**Option A: Matrix strategy** (same workflow, multiple environments)

```yaml
jobs:
  plan:
    strategy:
      matrix:
        environment: [dev, staging, production]
    steps:
      - name: Terraform Plan
        working-directory: infrastructure/environments/${{ matrix.environment }}
        run: terraform plan -no-color -input=false
```

**Option B: Separate workflows** (different triggers per environment)

```yaml
# deploy-dev.yml -- triggers on push to main
# deploy-staging.yml -- triggers on release candidate tags
# deploy-production.yml -- triggers on release tags with manual approval
```

**Option C: Same config, different .tfvars**

```yaml
- name: Terraform Plan
  run: |
    terraform plan -no-color -input=false \
      -var-file=environments/${{ matrix.environment }}.tfvars
```

---

## Atlantis

### What It Is

Atlantis is a self-hosted Go application that listens for GitHub/GitLab webhooks and runs `terraform plan` and `terraform apply` in response to PR comments. It brings the plan/apply workflow directly into the PR conversation.

### How It Works

```
1. Developer opens PR with Terraform changes
2. Atlantis detects changed files, runs `terraform plan`
3. Atlantis posts plan output as PR comment
4. Reviewer examines plan, approves PR
5. Developer comments: "atlantis apply"
6. Atlantis runs `terraform apply`, posts result
7. PR is merged
```

### atlantis.yaml

```yaml
version: 3
automerge: false
parallel_plan: true
parallel_apply: false

projects:
  - name: networking
    dir: infrastructure/networking
    workspace: default
    terraform_version: v1.7.0
    autoplan:
      when_modified:
        - "*.tf"
        - "*.tfvars"
      enabled: true
    apply_requirements:
      - approved
      - mergeable

  - name: application
    dir: infrastructure/application
    workspace: default
    terraform_version: v1.7.0
    autoplan:
      when_modified:
        - "*.tf"
        - "*.tfvars"
      enabled: true
    apply_requirements:
      - approved
      - mergeable
```

### PR Comment Commands

```
atlantis plan                    # Re-run plan
atlantis plan -d infrastructure/ # Plan specific directory
atlantis apply                   # Apply all planned projects
atlantis apply -p networking     # Apply specific project
atlantis unlock                  # Unlock state (if stuck)
```

### Atlantis vs GitHub Actions

| Aspect | Atlantis | GitHub Actions |
|--------|----------|----------------|
| Hosting | Self-hosted (you manage it) | Managed by GitHub |
| Plan/apply trigger | PR comments | PR events / merge |
| State locking | Built-in per-project | You must handle it |
| Multi-repo | Supports multiple repos | Per-repo workflows |
| Cost | Server cost | GitHub Actions minutes |
| Customization | Workflow hooks, custom scripts | Full workflow flexibility |
| Setup complexity | Moderate (deploy server, webhooks) | Low (YAML in repo) |
| Approval flow | `atlantis apply` after approval | Merge triggers apply |

Use Atlantis when you want plan/apply tightly integrated into PR comments, need built-in state locking, or manage many Terraform repos from a central server.

---

## Terraform Cloud / HCP Terraform

### VCS-Driven Workflow

Terraform Cloud connects directly to your VCS (GitHub, GitLab, Bitbucket). When a PR is opened, it runs a plan. When the PR is merged, it runs apply. No CI/CD pipeline configuration needed.

### Key Features

| Feature | Description |
|---------|-------------|
| Remote Execution | Plan and apply run on Terraform Cloud, not in CI runners |
| State Management | Built-in remote state with locking, versioning, encryption |
| Cost Estimation | Shows estimated monthly cost change before apply |
| Sentinel Policies | Policy-as-code evaluated between plan and apply |
| Private Registry | Host private modules and providers for your organization |
| Run Triggers | Chain workspaces (networking applies triggers app workspace) |
| Variable Sets | Share variables across multiple workspaces |

### Configuration

```hcl
terraform {
  cloud {
    organization = "my-org"

    workspaces {
      name = "production-infrastructure"
    }
  }
}
```

### When to Use Terraform Cloud vs Self-Managed CI/CD

| Use Terraform Cloud When | Use Self-Managed CI/CD When |
|--------------------------|----------------------------|
| You want minimal setup | You need full pipeline control |
| Cost estimation matters | You already have CI/CD infrastructure |
| You need Sentinel policies | You use OPA/Conftest for policies |
| Small-medium team | Large team with custom requirements |
| Single Terraform workflow | Terraform is part of a larger deploy pipeline |
| You want managed state | You manage state in S3/GCS already |

---

## Pipeline Best Practices

### Credential Management

```yaml
# WRONG: Long-lived credentials as secrets
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

# CORRECT: OIDC / workload identity federation
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.TERRAFORM_ROLE_ARN }}
    aws-region: us-west-2
```

### Separate Plan and Apply

Never combine plan and apply in a single step. The plan output must be reviewable before apply runs.

```yaml
# WRONG: Plan and apply together
- run: terraform apply -auto-approve

# CORRECT: Saved plan file
- run: terraform plan -out=tfplan    # Plan stage
- run: terraform apply tfplan        # Apply stage (after approval)
```

Using a saved plan file guarantees that exactly what was reviewed gets applied. Without it, the infrastructure could change between plan and apply.

### State Locking in CI/CD

Terraform backends (S3 + DynamoDB, GCS) provide state locking. Ensure your CI/CD pipeline does NOT disable locking:

```bash
# NEVER do this
terraform apply -lock=false

# Terraform locks state by default -- let it
terraform apply tfplan
```

If a CI run is interrupted and leaves a stale lock, use:

```bash
terraform force-unlock LOCK_ID
```

### Post Plan as PR Comment

Always make the plan visible in the PR. Reviewers should see exactly what will change without opening CI logs.

Key elements to include in the PR comment:
- Format/validate/plan status
- Number of resources to add, change, destroy
- Full plan output (in a collapsible details block)
- Link to the full CI run

---

## Drift Detection

Schedule periodic plan runs to detect infrastructure drift -- changes made outside Terraform (console clicks, other tools, manual API calls).

```yaml
# .github/workflows/drift-detection.yml
name: Drift Detection

on:
  schedule:
    - cron: '0 8 * * 1-5'  # Weekdays at 8 AM UTC

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.TERRAFORM_PLAN_ROLE }}
          aws-region: us-west-2

      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init -input=false
        working-directory: infrastructure/

      - name: Detect Drift
        id: drift
        run: |
          terraform plan -detailed-exitcode -input=false \
            -out=tfplan 2>&1 | tee drift_output.txt
          echo "exitcode=$?" >> $GITHUB_OUTPUT
        working-directory: infrastructure/
        continue-on-error: true

      # Exit code 2 means changes detected (drift)
      - name: Alert on Drift
        if: steps.drift.outputs.exitcode == '2'
        run: |
          # Send to Slack, PagerDuty, email, etc.
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H 'Content-Type: application/json' \
            -d '{"text": "Infrastructure drift detected. Review plan output."}'
```

`terraform plan -detailed-exitcode` returns:
- `0` = no changes (no drift)
- `1` = error
- `2` = changes detected (drift exists)

---

## Common Gotchas

**Concurrent runs on the same state.** Two PRs modifying the same Terraform root module can conflict. State locking prevents corruption, but one run will fail waiting for the lock. Solutions: queue CI runs, use Atlantis (built-in locking per project), or split into smaller root modules.

**Plan/apply gap.** The infrastructure can change between when a plan runs (on PR) and when apply runs (on merge). Another PR might merge first, a manual change might happen, or an auto-scaler might modify resources. Always use saved plan files, and consider re-planning on merge before applying.

**Credentials in CI logs.** Terraform can print sensitive values in plan output and error messages. Use `sensitive = true` on variables and outputs. Review your CI logs to confirm secrets are masked.

**Branch protection rules are mandatory.** Without branch protection, anyone can push directly to main and trigger `terraform apply`. Require PR reviews, status checks passing, and no direct pushes to main.

**Large plans overflow PR comments.** GitHub has a 65,536 character limit on PR comments. Truncate plan output and link to the full CI log for large changes.

**State locking timeout.** Long-running applies can hold locks for minutes. Set appropriate `-lock-timeout` values in CI, and monitor for stale locks from interrupted runs.
