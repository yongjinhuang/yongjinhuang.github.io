# HCL Language Basics

HashiCorp Configuration Language (HCL) is a declarative, domain-specific language designed for defining infrastructure. It is **not** a general-purpose programming language -- you cannot write arbitrary loops, handle exceptions, or build applications with it. HCL describes the desired end state of your infrastructure, and Terraform figures out how to get there. Understanding HCL's syntax, block types, and type system is the foundation for everything else in Terraform.

---

## 1. File Structure

Terraform reads **every** `.tf` file in the current directory (non-recursively) and merges them into a single configuration. It does not care about file names or ordering -- you could put everything in one file and it would work identically.

### File Types

| Extension | Purpose |
|-----------|---------|
| `.tf` | Terraform configuration (HCL syntax) |
| `.tf.json` | Terraform configuration (JSON syntax, rarely used) |
| `.tfvars` | Variable value definitions |
| `.auto.tfvars` | Auto-loaded variable values (no `-var-file` flag needed) |
| `.terraform.lock.hcl` | Dependency lock file (always commit this) |

### Naming Conventions

```
project/
  main.tf            # Primary resources
  variables.tf       # Input variable declarations
  outputs.tf         # Output declarations
  providers.tf       # Provider configuration
  versions.tf        # terraform {} block with required_version and required_providers
  locals.tf          # Local values
  data.tf            # Data sources (some teams put these in main.tf)
```

These are conventions, not requirements. Terraform merges all `.tf` files. But violating these conventions will confuse every engineer who touches your code.

---

## 2. Blocks

Everything in HCL is organized into **blocks**. A block has a type, zero or more labels, and a body enclosed in braces.

```hcl
block_type "label_1" "label_2" {
  argument = value
}
```

### Block Types

| Block | Labels | Purpose |
|-------|--------|---------|
| `resource` | type, name | Creates infrastructure |
| `data` | type, name | Reads existing infrastructure |
| `variable` | name | Declares an input variable |
| `output` | name | Declares an output value |
| `locals` | (none) | Defines local named values |
| `module` | name | Calls a child module |
| `provider` | name | Configures a provider plugin |
| `terraform` | (none) | Terraform settings (version, backend, required_providers) |

### Examples

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Deployment environment"
}

output "instance_ip" {
  value = aws_instance.web.public_ip
}

locals {
  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
```

---

## 3. Arguments and Attributes

**Arguments** are values you set inside a block. **Attributes** are values exposed by a resource after creation (computed by the provider).

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"  # argument (you set this)
  instance_type = "t3.micro"               # argument (you set this)
  # After apply, you can reference:
  # aws_instance.web.public_ip             # attribute (computed)
  # aws_instance.web.id                    # attribute (computed)
}
```

The distinction matters: arguments are inputs, attributes are outputs.

---

## 4. Type System

HCL has a strict type system. Every value has a type, and Terraform will error if types don't match.

### Primitive Types

| Type | Example | Notes |
|------|---------|-------|
| `string` | `"hello"` | Always quoted |
| `number` | `42`, `3.14` | Integer or float |
| `bool` | `true`, `false` | Lowercase only |

### Collection Types

| Type | Example | Constraint |
|------|---------|------------|
| `list(type)` | `["a", "b", "c"]` | Ordered, same type elements |
| `set(type)` | `toset(["a", "b"])` | Unordered, unique, same type |
| `map(type)` | `{ key = "value" }` | String keys, same type values |

### Structural Types

| Type | Example | Constraint |
|------|---------|------------|
| `object({...})` | `{ name = string, age = number }` | Fixed attributes with specified types |
| `tuple([...])` | `[string, number, bool]` | Fixed length, each element typed |

### Type Constraints in Variables

```hcl
variable "tags" {
  type = map(string)
}

variable "server_config" {
  type = object({
    name          = string
    instance_type = string
    disk_size_gb  = number
    public        = bool
  })
}
```

### Type Conversion

Terraform performs automatic type conversion in limited cases: `number`/`bool` convert to `string`, `string` converts to `number`/`bool` if valid, `list` converts to `set`, `tuple` converts to `list` if all elements share a type. When in doubt, be explicit.

---

## 5. Strings, Interpolation, and Heredocs

### String Interpolation

Use `${}` inside double-quoted strings to embed expressions:

```hcl
locals {
  bucket_name = "${var.project}-${var.environment}-assets"
}
```

Do **not** interpolate when unnecessary:

```hcl
# WRONG: useless interpolation
instance_type = "${var.instance_type}"

# RIGHT: direct reference
instance_type = var.instance_type
```

### Heredoc Syntax

```hcl
# Standard heredoc (preserves indentation)
resource "aws_iam_policy" "example" {
  policy = <<EOT
{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Action": "s3:GetObject", "Resource": "*" }]
}
EOT
}

# Indented heredoc (<<- strips leading whitespace, matching closing marker)
output "instructions" {
  value = <<-EOT
    Connect to the server:
      ssh ${var.user}@${aws_instance.web.public_ip}
  EOT
}
```

### Directive Syntax

```hcl
locals {
  greeting = "Hello, %{if var.name != ""}${var.name}%{else}stranger%{endif}!"
  servers  = "%{for s in var.servers}  - ${s}\n%{endfor}"
}
```

---

## 6. Comments

```hcl
# Single-line comment (preferred)
// Single-line comment (also valid, less common)
/* Multi-line comment */
```

---

## 7. The terraform Block

The `terraform` block configures Terraform itself -- not your infrastructure.

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

### Version Constraint Syntax

| Syntax | Meaning |
|--------|---------|
| `= 5.1.0` | Exactly 5.1.0 |
| `>= 5.0` | 5.0 or newer |
| `~> 5.0` | >= 5.0.0, < 6.0.0 (pessimistic, major pinned) |
| `~> 5.1` | >= 5.1.0, < 5.2.0 (pessimistic, minor pinned) |
| `>= 5.0, < 6.0` | Compound constraint |

`~>` is the most common. It allows patch/minor upgrades but prevents breaking major version bumps.

---

## 8. Formatting and JSON Alternative

### terraform fmt

Terraform has an opinionated formatter. Run it before every commit.

```bash
terraform fmt              # Format all .tf files in current directory
terraform fmt -recursive   # Recursive formatting
terraform fmt -check       # Check without changing (useful in CI)
```

### JSON Syntax

Every HCL construct has a JSON equivalent (`.tf.json` files). This exists for machine-generated configs. You will almost never write it by hand.

---

## 9. Common Gotchas

### HCL is Declarative, Not Imperative

There is no "step 1, then step 2." You describe the end state. Terraform decides the execution order based on dependencies.

```hcl
# These two resources can be in any order in the file.
# Terraform knows the subnet depends on the VPC via the reference.
resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
```

### Order Does Not Matter

File order, block order within a file -- none of it affects behavior. Terraform builds a dependency graph from references.

### The any Type

`any` is not a type -- it is a type constraint placeholder meaning "accept anything." It disables type checking. Use sparingly.

### Null Values

`null` represents the absence of a value. Setting an argument to `null` is the same as omitting it. Useful in conditionals:

```hcl
resource "aws_instance" "web" {
  ami           = var.ami
  instance_type = var.instance_type
  key_name      = var.enable_ssh ? var.key_name : null
}
```

### Sensitive Values

Mark variables as sensitive to suppress them in CLI output. This does **not** encrypt the value in state.

```hcl
variable "db_password" {
  type      = string
  sensitive = true
}
```
