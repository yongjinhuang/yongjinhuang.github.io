# Variables, Outputs & Locals

Terraform configurations become reusable the moment you parameterize them. Input variables are your function arguments, outputs are your return values, and locals are your intermediate computations. Master these three and you can compose any infrastructure from a single module source with different parameter sets per environment.

---

## Input Variables

```hcl
variable "instance_type" {
  type        = string
  default     = "t3.micro"
  description = "EC2 instance type for the web server fleet"
  nullable    = false

  validation {
    condition     = can(regex("^t3\\.", var.instance_type))
    error_message = "Only t3 instance types are allowed."
  }
}

variable "db_password" {
  type        = string
  description = "RDS master password"
  sensitive   = true
}
```

| Argument | Required | Purpose |
|----------|----------|---------|
| `type` | No (defaults to `any`) | Constrains accepted values |
| `default` | No | Fallback value; omit to make the variable required |
| `description` | No | Shown in `terraform plan` prompts |
| `validation` | No | Custom rules (one or more blocks) |
| `sensitive` | No | Redacts from CLI output; does NOT encrypt state |
| `nullable` | No | Whether `null` is valid (default `true`) |

---

## Variable Types

```hcl
# Simple types
variable "name"    { type = string }
variable "port"    { type = number }
variable "enabled" { type = bool }

# Collections
variable "azs"  { type = list(string) }
variable "tags" { type = map(string) }
variable "cidrs" { type = set(string) }

# Structural
variable "database" {
  type = object({
    engine         = string
    instance_class = string
    multi_az       = bool
  })
}

variable "ingress_rules" {
  type = list(object({
    port        = number
    protocol    = string
    cidr_blocks = list(string)
  }))
}

variable "fixed_record" { type = tuple([string, number, bool]) }
```

| Type | Ordered | Unique | Element Types |
|------|---------|--------|---------------|
| `list` | Yes | No | Single type |
| `set` | No | Yes | Single type |
| `map` | By key | Keys unique | Single value type |
| `object` | N/A | Keys unique | Mixed types per attribute |
| `tuple` | Yes | No | Mixed types per position |

---

## Variable Precedence

When the same variable is set in multiple places, the **last one wins**.

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (lowest) | `default` in declaration | Fallback only |
| 2 | `terraform.tfvars` | Auto-loaded if present |
| 3 | `*.auto.tfvars` (alphabetical) | Auto-loaded, lexicographic order |
| 4 | `-var-file=foo.tfvars` | Explicit file, in order specified |
| 5 | `-var 'key=value'` | CLI flag |
| 6 (highest) | `TF_VAR_key` env var | Overrides everything |

```bash
export TF_VAR_region="us-west-2"                      # priority 6
terraform apply -var="region=us-east-1"                # priority 5
terraform apply -var-file="prod.tfvars"                # priority 4
# region.auto.tfvars with region = "eu-west-1"        # priority 3
# terraform.tfvars with region = "ap-southeast-1"     # priority 2
# default = "us-east-1" in variable block             # priority 1
```

---

## Variable Files

```hcl
# terraform.tfvars -- auto-loaded
region        = "us-east-1"
instance_type = "t3.medium"

# environments/prod.tfvars -- loaded with -var-file
instance_type = "m5.xlarge"
min_capacity  = 3
```

```bash
terraform plan -var-file="environments/prod.tfvars"
```

Any file matching `*.auto.tfvars` or `*.auto.tfvars.json` is auto-loaded. Useful for splitting concerns:

```
project/
  main.tf
  variables.tf
  network.auto.tfvars     # VPC/subnet config
  compute.auto.tfvars     # Instance config
  tags.auto.tfvars        # Standard tags
```

---

## Variable Validation

```hcl
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "cidr_block" {
  type = string
  validation {
    condition     = can(cidrnetmask(var.cidr_block))
    error_message = "Must be a valid CIDR block (e.g., 10.0.0.0/16)."
  }
}

variable "instance_count" {
  type = number
  validation {
    condition     = var.instance_count > 0 && var.instance_count <= 50
    error_message = "Instance count must be between 1 and 50."
  }
}
```

Multiple `validation` blocks on a single variable are allowed. All must pass.

---

## Sensitive Variables

```hcl
variable "api_key" {
  type      = string
  sensitive = true
}

resource "aws_ssm_parameter" "api_key" {
  name  = "/app/api-key"
  type  = "SecureString"
  value = var.api_key    # shown as "(sensitive value)" in plan output
}
```

Sensitivity propagates: any expression referencing a sensitive variable is also treated as sensitive.

---

## Output Values

```hcl
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "The ID of the main VPC"
}

output "db_connection_string" {
  value       = "postgresql://${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "all_instance_ips" {
  value = aws_instance.web[*].private_ip
}
```

| Argument | Required | Purpose |
|----------|----------|---------|
| `value` | Yes | The expression to expose |
| `description` | No | Human-readable documentation |
| `sensitive` | No | Redact from CLI output |
| `depends_on` | No | Explicit dependency for timing (rare) |
| `precondition` | No | Validate assumptions before exposing |

### Outputs as Module Return Values

Outputs are the **only** way for a parent module to access a child module's resources.

```hcl
# modules/vpc/outputs.tf
output "vpc_id"     { value = aws_vpc.main.id }
output "subnet_ids" { value = aws_subnet.private[*].id }

# root module
module "vpc" {
  source = "./modules/vpc"
  cidr   = "10.0.0.0/16"
}

resource "aws_instance" "web" {
  subnet_id = module.vpc.subnet_ids[0]   # accessing child output
}
```

### Accessing Outputs

```bash
terraform output                    # all outputs (human-readable)
terraform output vpc_id             # single value
terraform output -json              # machine-readable JSON
terraform output -raw vpc_id        # raw value, no quotes (for piping)

VPC_ID=$(terraform output -raw vpc_id)
aws ec2 describe-vpcs --vpc-ids "$VPC_ID"
```

---

## Local Values

Locals are named expressions for intermediate computation. They reduce repetition and improve readability.

```hcl
locals {
  env         = var.environment
  name_prefix = "${var.project}-${local.env}"

  common_tags = {
    Project     = var.project
    Environment = local.env
    ManagedBy   = "terraform"
    Owner       = var.team
  }

  is_production = local.env == "prod"
  instance_type = local.is_production ? "m5.xlarge" : "t3.medium"
  min_capacity  = local.is_production ? 3 : 1
}

resource "aws_instance" "web" {
  instance_type = local.instance_type
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-web"
  })
}
```

---

## When to Use Variables vs Locals

| Use Case | Variables | Locals |
|----------|-----------|--------|
| Values that differ per deployment | Yes | No |
| Values computed from other variables | No | Yes |
| Values the caller provides | Yes | No |
| Internal implementation detail | No | Yes |
| Standard tags / naming conventions | No | Yes |
| Conditional logic (is_production) | No | Yes |
| Module "public API" | Yes | No |

If the caller should control it, use a variable. If it is derived or internal, use a local.

---

## Common Patterns

### Computed CIDR Blocks

```hcl
locals {
  azs             = ["a", "b", "c"]
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 100)]
}
```

### Flattening Nested Structures

```hcl
variable "projects" {
  type = map(object({ environments = list(string) }))
}

locals {
  project_envs = flatten([
    for proj, config in var.projects : [
      for env in config.environments : {
        project     = proj
        environment = env
      }
    ]
  ])
}
```

---

## Common Gotchas

| Gotcha | Why It Matters |
|--------|---------------|
| Putting secrets in `default` values | Defaults live in `.tf` files committed to version control |
| Assuming `sensitive = true` encrypts state | Only redacts CLI output; state still contains plaintext. Encrypt your backend. |
| `depends_on` on outputs | Forces Terraform to wait before evaluating, slowing plans |
| Complex `object` without `optional()` | Callers must specify every attribute. Use `optional()` modifier. |
| `nullable = false` with `default = null` | Terraform errors at validation |
| Forgetting `-var-file` in CI | Variables with no default cause interactive prompts that hang |
| Over-parameterizing modules | Not everything needs a variable. Expose only what actually varies. |

---

## File Organization Convention

```
module/
  main.tf           # Resources
  variables.tf      # All variable declarations (the interface contract)
  outputs.tf        # All output declarations (the return contract)
  locals.tf         # All locals (or inline in main.tf if few)
  terraform.tfvars  # Default variable values (root module only)
  versions.tf       # Required providers and Terraform version
```
