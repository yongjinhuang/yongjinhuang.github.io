# Testing Terraform Code

Infrastructure bugs don't throw stack traces -- they cause outages, data loss, and security breaches. Testing Terraform code catches invalid instance types before they fail at 2 AM, validates that your S3 bucket isn't publicly readable before it hits production, and ensures your network ACLs actually block what they should. The cost of an infrastructure bug is measured in downtime minutes and incident severity, not failed unit tests. Treat your Terraform code with the same rigor you'd apply to application code.

---

## The IaC Testing Pyramid

```
            /  E2E Tests  \          Slow, expensive, high confidence
           /  (Terratest)  \
          /------------------\
         / Integration Tests  \      Deploy real infra, validate, destroy
        /  (terraform test)    \
       /------------------------\
      /   Plan-Based Testing     \   Assert against plan JSON
     /----------------------------\
    /   Policy-as-Code (OPA, etc)  \  Validate compliance rules
   /--------------------------------\
  /     Static Analysis              \  Fast, cheap, catches obvious errors
 /  (fmt, validate, tflint, tfsec)   \
/--------------------------------------\
```

Move as much testing as possible toward the base. Static analysis is free and fast. E2E tests cost real money and take minutes.

---

## Static Analysis

### terraform fmt -check

Enforces canonical formatting. Zero configuration, zero ambiguity.

```bash
# Check formatting (exits non-zero if files need formatting)
terraform fmt -check -recursive

# Auto-fix formatting
terraform fmt -recursive
```

Run this in CI on every PR. No exceptions, no arguments about style.

### terraform validate

Checks syntax and internal consistency. Catches typos in resource references, invalid argument names, and type mismatches.

```bash
terraform init -backend=false   # init required, but skip backend
terraform validate
```

It does NOT check provider-specific constraints. `instance_type = "m5.nonexistent"` passes validation.

### tflint

Catches what `validate` misses: invalid instance types, deprecated features, naming convention violations, and provider-specific errors.

```bash
# Install
brew install tflint

# Initialize plugins
tflint --init

# Run
tflint --recursive
```

#### Configuration (.tflint.hcl)

```hcl
plugin "aws" {
  enabled = true
  version = "0.31.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "terraform_naming_convention" {
  enabled = true
  format  = "snake_case"
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}

# Custom: enforce specific tags
rule "aws_resource_missing_tags" {
  enabled = true
  tags    = ["Environment", "Team", "ManagedBy"]
}
```

tflint catches things like:

| Error Type            | Example                     | Caught By            |
| --------------------- | --------------------------- | -------------------- |
| Invalid instance type | `m5.nonexistent`            | tflint (AWS plugin)  |
| Missing required tags | No `Environment` tag        | tflint (custom rule) |
| Deprecated resource   | `aws_opsworks_stack`        | tflint               |
| Bad naming convention | `myBucket` (not snake_case) | tflint               |
| Invalid AMI format    | `ami-wrongformat`           | tflint (AWS plugin)  |

---

## Policy-as-Code

### Checkov

Python-based scanner with 1,000+ built-in rules. Checks for misconfigurations, compliance violations, and security issues across Terraform, CloudFormation, Kubernetes, and more.

```bash
pip install checkov

# Scan a directory
checkov -d .

# Scan specific framework
checkov -d . --framework terraform

# Skip specific checks
checkov -d . --skip-check CKV_AWS_18,CKV_AWS_21

# Output as JSON for CI integration
checkov -d . -o json
```

Example Checkov rule (custom Python check):

```python
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck
from checkov.common.models.enums import CheckResult, CheckCategories

class S3BucketEncryption(BaseResourceCheck):
    def __init__(self):
        name = "Ensure S3 bucket has server-side encryption"
        id = "CKV_CUSTOM_1"
        supported_resources = ["aws_s3_bucket"]
        categories = [CheckCategories.ENCRYPTION]
        super().__init__(name=name, id=id,
                         categories=categories,
                         supported_resources=supported_resources)

    def scan_resource_conf(self, conf):
        # Check for encryption configuration
        if "server_side_encryption_configuration" in conf:
            return CheckResult.PASSED
        return CheckResult.FAILED

check = S3BucketEncryption()
```

### tfsec / trivy

Security-focused static analysis. tfsec is now part of trivy.

```bash
# Install trivy
brew install trivy

# Scan Terraform files
trivy config .

# Scan with specific severity
trivy config --severity HIGH,CRITICAL .
```

### OPA / Conftest

Open Policy Agent evaluates Rego policies against Terraform plan JSON. Maximum flexibility -- you write the rules.

```bash
# Generate plan JSON
terraform plan -out=tfplan
terraform show -json tfplan > tfplan.json

# Run conftest against plan
conftest test tfplan.json -p policy/
```

Example OPA policy (`policy/s3.rego`):

```rego
package main

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    resource.change.after.acl == "public-read"
    msg := sprintf("S3 bucket '%s' must not be publicly readable",
                   [resource.address])
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_instance"
    not resource.change.after.metadata_options
    msg := sprintf("EC2 instance '%s' must configure IMDSv2",
                   [resource.address])
}
```

### Sentinel (Terraform Cloud / Enterprise)

HashiCorp's proprietary policy-as-code framework. Integrated directly into Terraform Cloud runs.

```hcl
# Only allow approved instance types
import "tfplan/v2" as tfplan

allowed_types = ["t3.micro", "t3.small", "t3.medium"]

main = rule {
    all tfplan.resource_changes as _, rc {
        rc.type is "aws_instance" implies
            rc.change.after.instance_type in allowed_types
    }
}
```

Sentinel runs between plan and apply in Terraform Cloud. Hard-mandatory policies block apply. Advisory policies warn but allow.

---

## terraform test (Built-in, Terraform 1.6+)

Native testing framework. Tests live in `.tftest.hcl` files alongside your configuration.

### Example: Testing an S3 Module

```
modules/s3-bucket/
  main.tf
  variables.tf
  outputs.tf
  tests/
    defaults.tftest.hcl
    encryption.tftest.hcl
```

#### tests/defaults.tftest.hcl

```hcl
# Plan-only test -- no real resources created
run "creates_bucket_with_defaults" {
  command = plan

  variables {
    bucket_name = "test-bucket-12345"
    environment = "test"
  }

  assert {
    condition     = aws_s3_bucket.this.bucket == "test-bucket-12345"
    error_message = "Bucket name did not match expected value"
  }

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning should be enabled by default"
  }
}

# Apply test -- creates and destroys real resources
run "bucket_is_accessible" {
  command = apply

  variables {
    bucket_name = "integration-test-98765"
    environment = "test"
  }

  assert {
    condition     = output.bucket_arn != ""
    error_message = "Bucket ARN should not be empty"
  }
}
```

### Mock Providers

Override provider behavior for isolated unit tests:

```hcl
mock_provider "aws" {
  mock_data "aws_caller_identity" "current" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/test"
    }
  }
}

run "test_with_mock" {
  command = plan

  providers = {
    aws = aws
  }

  assert {
    condition     = data.aws_caller_identity.current.account_id == "123456789012"
    error_message = "Mock account ID mismatch"
  }
}
```

Run tests:

```bash
terraform test                        # Run all tests
terraform test -filter=tests/defaults.tftest.hcl  # Run specific file
terraform test -verbose               # Detailed output
```

---

## Integration Testing with Terratest

Terratest (Go library) deploys real infrastructure, runs validations, and tears everything down. It is the most thorough testing approach -- and the most expensive.

### Example: Testing an S3 Bucket Module

```go
package test

import (
    "testing"

    "github.com/gruntwork-io/terratest/modules/aws"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestS3Bucket(t *testing.T) {
    t.Parallel()

    region := "us-west-2"
    bucketName := "terratest-" + strings.ToLower(random.UniqueId())

    terraformOptions := &terraform.Options{
        TerraformDir: "../modules/s3-bucket",
        Vars: map[string]interface{}{
            "bucket_name": bucketName,
            "environment": "test",
        },
        EnvVars: map[string]string{
            "AWS_DEFAULT_REGION": region,
        },
    }

    // Destroy infrastructure at the end of the test
    defer terraform.Destroy(t, terraformOptions)

    // Deploy infrastructure
    terraform.InitAndApply(t, terraformOptions)

    // Validate: bucket exists
    actualBucketName := terraform.Output(t, terraformOptions, "bucket_name")
    assert.Equal(t, bucketName, actualBucketName)

    // Validate: bucket is in the correct region
    actualRegion := aws.GetS3BucketRegion(t, region, bucketName)
    assert.Equal(t, region, actualRegion)

    // Validate: versioning is enabled
    versioning := aws.GetS3BucketVersioning(t, region, bucketName)
    assert.Equal(t, "Enabled", versioning)
}
```

Run with:

```bash
cd test/
go test -v -timeout 30m -run TestS3Bucket
```

---

## Plan-Based Testing

Lightweight alternative: assert against `terraform plan` JSON output using `jq`.

```bash
# Generate plan JSON
terraform plan -out=tfplan
terraform show -json tfplan > tfplan.json

# Assert: no resources are being destroyed
DESTROYS=$(jq '[.resource_changes[] |
  select(.change.actions[] == "delete")] | length' tfplan.json)
if [ "$DESTROYS" -gt 0 ]; then
  echo "FAIL: Plan would destroy $DESTROYS resources"
  exit 1
fi

# Assert: all S3 buckets have encryption
UNENCRYPTED=$(jq '[.resource_changes[] |
  select(.type == "aws_s3_bucket") |
  select(.change.after.server_side_encryption_configuration == null)] |
  length' tfplan.json)
if [ "$UNENCRYPTED" -gt 0 ]; then
  echo "FAIL: $UNENCRYPTED S3 buckets missing encryption"
  exit 1
fi

echo "All plan assertions passed"
```

This is cheap, fast, and catches most issues. Combine with OPA/Conftest for structured policy checks.

---

## Pre-commit Hooks

The `pre-commit-terraform` framework runs checks automatically before every commit.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tflint
        args:
          - --args=--config=__GIT_WORKING_DIR__/.tflint.hcl
      - id: terraform_checkov
        args:
          - --args=--quiet
      - id: terraform_docs
        args:
          - --args=--config=.terraform-docs.yml
```

Install and run:

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files   # Run manually
```

---

## Summary: What to Run Where

| Tool                     | When              | Cost      | What It Catches                  |
| ------------------------ | ----------------- | --------- | -------------------------------- |
| `terraform fmt`          | Pre-commit, CI    | Free      | Formatting                       |
| `terraform validate`     | Pre-commit, CI    | Free      | Syntax errors, bad references    |
| tflint                   | Pre-commit, CI    | Free      | Provider-specific errors, naming |
| Checkov / trivy          | CI                | Free      | Security misconfigs, compliance  |
| OPA / Conftest           | CI                | Free      | Custom policy violations         |
| `terraform test` (plan)  | CI                | Free      | Logic errors, variable handling  |
| `terraform test` (apply) | Nightly/scheduled | Real cost | Deployment validation            |
| Terratest                | Nightly/scheduled | Real cost | Full integration validation      |

---

## Common Gotchas

**Integration tests cost real money.** Every `command = apply` test and every Terratest run provisions real cloud resources. Run these on a schedule (nightly), not on every PR push. Use `command = plan` tests for PR-level validation.

**Test isolation is critical.** Use unique resource names (random suffixes) and dedicated test accounts or projects. Two parallel test runs creating the same S3 bucket name will collide.

**Parallel test execution needs care.** Terratest supports `t.Parallel()`, but parallel tests sharing the same Terraform state will corrupt it. Each test must use its own `TerraformDir` or a copied working directory.

**Cleanup failures leave orphan resources.** If `terraform destroy` fails mid-test, you have dangling infrastructure costing money. Set up a nightly cleanup job that finds and destroys resources tagged `Environment = test` older than 24 hours.

**Mock providers have limits.** `terraform test` mock providers do not simulate real provider behavior. They return whatever defaults you set. Do not rely on them for integration-level confidence.

**Plan assertions can drift from reality.** A plan says one thing; the provider might do another (eventual consistency, IAM propagation delays). Plan-based tests are necessary but not sufficient.
