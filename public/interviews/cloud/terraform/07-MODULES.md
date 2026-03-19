# Terraform Modules

Modules are reusable, self-contained packages of Terraform configuration. Every Terraform project is already a module -- the top-level directory is the **root module**. When you call another module from your root, that called module is a **child module**. Modules let you encapsulate infrastructure patterns (a VPC with subnets, an ECS service with load balancing, a database with backups) into composable building blocks. If you find yourself copying and pasting resource blocks between projects, you need a module.

---

## Root Module vs Child Modules

```
project/
  main.tf          <-- Root module (this is always a module)
  variables.tf
  outputs.tf
  modules/
    vpc/            <-- Child module
      main.tf
      variables.tf
      outputs.tf
    compute/        <-- Child module
      main.tf
      variables.tf
      outputs.tf
```

The root module is what you run `terraform apply` against. Child modules are called from the root (or from other child modules) using `module` blocks. Terraform resolves the full dependency graph across all modules during planning.

---

## Module Structure

A well-structured module has a predictable file layout:

```
modules/vpc/
  main.tf           # Resource definitions
  variables.tf      # Input variables (the module's API)
  outputs.tf        # Output values (what the module exposes)
  versions.tf       # Required providers and Terraform version constraints
  README.md         # Usage documentation
```

| File           | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `main.tf`      | Core resources; may be split into multiple files for large modules     |
| `variables.tf` | All input variables with descriptions, types, defaults, and validation |
| `outputs.tf`   | All outputs with descriptions                                          |
| `versions.tf`  | `required_providers` and `required_version` constraints                |
| `README.md`    | Usage examples, input/output tables, requirements                      |

For simple modules, all resources can live in `main.tf`. For larger modules, split by concern: `networking.tf`, `security.tf`, `iam.tf`.

---

## Calling a Module

```hcl
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr         = "10.0.0.0/16"
  environment      = "production"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
}
```

After adding or changing a `source`, you must run `terraform init` to download the module.

### Source Types

| Source                 | Syntax                                                                 | Use Case                       |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| **Local path**         | `source = "./modules/vpc"`                                             | Modules within the same repo   |
| **Terraform Registry** | `source = "terraform-aws-modules/vpc/aws"`                             | Public community modules       |
| **GitHub**             | `source = "github.com/org/repo//modules/vpc"`                          | Private or public GitHub repos |
| **Git (generic)**      | `source = "git::https://example.com/repo.git//modules/vpc"`            | Any Git repository             |
| **S3**                 | `source = "s3::https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip"`     | S3-hosted module archives      |
| **GCS**                | `source = "gcs::https://www.googleapis.com/storage/v1/bucket/vpc.zip"` | GCS-hosted module archives     |

The `//` separator in GitHub/Git sources separates the repo path from the subdirectory within the repo.

### Module Versioning

For registry modules, pin the version:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"

  name = "my-vpc"
  cidr = "10.0.0.0/16"
}
```

For Git sources, use a ref:

```hcl
module "vpc" {
  source = "git::https://github.com/org/infra-modules.git//modules/vpc?ref=v2.1.0"
}
```

Version constraint syntax:

| Constraint        | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `"5.5.1"`         | Exact version                                           |
| `"~> 5.5"`        | Any 5.x where x >= 5 (e.g., 5.5, 5.6, 5.99 but not 6.0) |
| `">= 5.0, < 6.0"` | Explicit range                                          |

**Always pin versions in production.** An unpinned module will pull the latest version on `terraform init`, which can break your infrastructure without any change to your code.

---

## Module Inputs and Outputs

### Inputs (Variables)

The module's `variables.tf` defines its API:

```hcl
# modules/vpc/variables.tf

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
}

variable "enable_nat_gateway" {
  description = "Whether to create NAT gateways for private subnets"
  type        = bool
  default     = true
}

variable "availability_zones" {
  description = "List of AZs to deploy into"
  type        = list(string)
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
```

### Outputs

The module's `outputs.tf` defines what it exposes to callers:

```hcl
# modules/vpc/outputs.tf

output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IPs of the NAT gateways"
  value       = aws_eip.nat[*].public_ip
}
```

### Accessing Module Outputs

```hcl
# In root module
resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
  subnet_id     = module.vpc.public_subnet_ids[0]
}
```

---

## Module Composition

The power of modules comes from composing them -- feeding outputs from one module as inputs to another:

```hcl
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = "10.0.0.0/16"
  environment        = "production"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

module "database" {
  source = "./modules/rds"

  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  instance_class     = "db.r6g.large"
  engine_version     = "15.4"
}

module "app" {
  source = "./modules/ecs-service"

  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  db_endpoint        = module.database.endpoint
  db_port            = module.database.port
}
```

Terraform automatically resolves the dependency graph: VPC is created first, then database and app subnets depend on VPC outputs, and app depends on database outputs.

---

## Standard Module Structure

For modules intended for sharing (internal registry, open source), follow the standard structure:

```
terraform-aws-vpc/
  main.tf                # Root module resources
  variables.tf
  outputs.tf
  versions.tf
  README.md
  examples/
    simple/              # Minimal working example
      main.tf
    complete/            # Full-featured example
      main.tf
  modules/               # Nested sub-modules (if needed)
    public-subnets/
      main.tf
      variables.tf
      outputs.tf
    private-subnets/
      main.tf
      variables.tf
      outputs.tf
  tests/                 # terraform test files
    vpc_basic.tftest.hcl
    vpc_complete.tftest.hcl
```

The `examples/` directory is critical. It serves as both documentation and integration test targets.

---

## Public Terraform Registry

The [Terraform Registry](https://registry.terraform.io/) hosts thousands of community modules. The most widely used are the `terraform-aws-modules` family:

| Module                                     | Description                         |
| ------------------------------------------ | ----------------------------------- |
| `terraform-aws-modules/vpc/aws`            | VPC with subnets, NAT, route tables |
| `terraform-aws-modules/eks/aws`            | EKS cluster with node groups        |
| `terraform-aws-modules/rds/aws`            | RDS instances and clusters          |
| `terraform-aws-modules/s3-bucket/aws`      | S3 bucket with policies             |
| `terraform-aws-modules/lambda/aws`         | Lambda functions with IAM           |
| `terraform-aws-modules/security-group/aws` | Security groups with common rules   |

Using a registry module:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"

  name = "my-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
```

### Private Module Registry

For internal modules, you have several options:

- **Terraform Cloud / Enterprise** -- built-in private registry with version management
- **Git repositories** -- reference modules via Git URLs with version tags
- **S3 / GCS** -- host zipped module archives; works but lacks version browsing UI

---

## Module Design Principles

### 1. One Module per Logical Component

A module should represent a single logical piece of infrastructure, not a single resource:

```
# Good: A "database" module that creates RDS instance + subnet group +
#        security group + parameter group + CloudWatch alarms
module "database" { ... }

# Bad: A module that creates just one security group
module "sg" { ... }
```

A module with one resource adds overhead without value. A module should encapsulate a coherent set of resources that are always deployed together.

### 2. Expose What Changes, Hardcode What Should Not

```hcl
# Good: Instance type varies by environment
variable "instance_class" {
  type    = string
  default = "db.t3.medium"
}

# Good: Engine is always PostgreSQL for this module -- not a variable
resource "aws_db_instance" "main" {
  engine = "postgres"
  # ...
}
```

Do not expose every possible attribute as a variable. Expose what the caller needs to customize. Hardcode organizational standards and guardrails.

### 3. Use Sensible Defaults

```hcl
variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true    # Safe default for production
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7       # Reasonable default
}
```

A module should work with minimal input. If I call your VPC module with just a CIDR block, it should produce a working VPC with sensible subnet sizing, route tables, and gateways.

### 4. Output Everything Downstream Might Need

```hcl
# Callers will need these to wire up other resources
output "vpc_id" { value = aws_vpc.main.id }
output "vpc_cidr" { value = aws_vpc.main.cidr_block }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "public_route_table_id" { value = aws_route_table.public.id }
output "private_route_table_ids" { value = aws_route_table.private[*].id }
output "nat_gateway_ids" { value = aws_nat_gateway.main[*].id }
```

If you do not output it, callers cannot reference it without modifying your module. Over-outputting is better than under-outputting.

### 5. Keep Modules Shallow

Avoid deeply nested modules. Two levels is fine. Three levels is a warning sign. Four levels means your abstractions are wrong.

```
# Fine
root -> module.vpc -> (resources)
root -> module.app -> module.ecs_service -> (resources)

# Problematic
root -> module.platform -> module.networking -> module.vpc -> module.subnets -> (resources)
```

Deep nesting makes debugging hard (`module.platform.module.networking.module.vpc.module.subnets.aws_subnet.private[0]`), slows down plans, and obscures what is actually being created.

---

## Module Best Practices

### Pin Module Versions in Production

```hcl
# Production: always pin exact or pessimistic constraint
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"
}

# Development: looser constraints are acceptable
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.5"
}
```

### Use for_each with Modules

Since Terraform 0.13+, you can create multiple instances of a module:

```hcl
variable "services" {
  type = map(object({
    cpu    = number
    memory = number
    image  = string
  }))
}

module "ecs_service" {
  source   = "./modules/ecs-service"
  for_each = var.services

  name      = each.key
  cpu       = each.value.cpu
  memory    = each.value.memory
  image     = each.value.image
  vpc_id    = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}
```

Prefer `for_each` over `count` for modules. With `count`, removing an item from the middle of a list forces recreation of all subsequent items. With `for_each`, items are keyed by map key and can be added/removed independently.

### Module Testing with terraform test

Terraform 1.6+ introduced native testing:

```hcl
# tests/vpc_basic.tftest.hcl

run "create_vpc" {
  command = apply

  variables {
    vpc_cidr           = "10.0.0.0/16"
    environment        = "test"
    availability_zones = ["us-east-1a", "us-east-1b"]
  }

  assert {
    condition     = aws_vpc.main.cidr_block == "10.0.0.0/16"
    error_message = "VPC CIDR block did not match expected value"
  }

  assert {
    condition     = length(aws_subnet.public) == 2
    error_message = "Expected 2 public subnets"
  }

  assert {
    condition     = length(aws_subnet.private) == 2
    error_message = "Expected 2 private subnets"
  }
}
```

Run tests with:

```bash
terraform test
```

---

## Example: Complete VPC Module

This module creates a production-ready VPC with public/private subnets, NAT gateways, and route tables.

### modules/vpc/main.tf

```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
  })
}

# --- Public Subnets ---

resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.environment}-public-${var.availability_zones[count.index]}"
    Tier = "public"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.environment}-igw"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count = length(var.availability_zones)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --- Private Subnets ---

resource "aws_subnet" "private" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 100)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.environment}-private-${var.availability_zones[count.index]}"
    Tier = "private"
  })
}

# --- NAT Gateways (one per AZ for high availability) ---

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? length(var.availability_zones) : 0
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.environment}-nat-eip-${var.availability_zones[count.index]}"
  })
}

resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? length(var.availability_zones) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "${var.environment}-nat-${var.availability_zones[count.index]}"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count = length(var.availability_zones)

  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[count.index].id
    }
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-private-rt-${var.availability_zones[count.index]}"
  })
}

resource "aws_route_table_association" "private" {
  count = length(var.availability_zones)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
```

### modules/vpc/variables.tf

```hcl
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "environment" {
  description = "Environment name used for resource naming and tagging"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones to deploy subnets into"
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones required for high availability."
  }
}

variable "enable_nat_gateway" {
  description = "Whether to create NAT gateways for private subnet internet access"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags applied to all resources"
  type        = map(string)
  default     = {}
}
```

### modules/vpc/outputs.tf

```hcl
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "public_route_table_id" {
  description = "ID of the public route table"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "IDs of the private route tables (one per AZ)"
  value       = aws_route_table.private[*].id
}

output "nat_gateway_ids" {
  description = "IDs of the NAT gateways"
  value       = aws_nat_gateway.main[*].id
}

output "nat_gateway_ips" {
  description = "Public IPs of the NAT gateways"
  value       = aws_eip.nat[*].public_ip
}

output "internet_gateway_id" {
  description = "ID of the internet gateway"
  value       = aws_internet_gateway.main.id
}
```

### Calling the Module

```hcl
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = "10.0.0.0/16"
  environment        = "production"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true

  tags = {
    Project   = "my-app"
    ManagedBy = "terraform"
  }
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnet_ids
}
```

---

## Common Gotchas

### 1. Unpinned Module Versions

Without a `version` constraint, `terraform init` pulls the latest version. A major version bump in a community module can change resource names, drop variables, or restructure outputs -- breaking your infrastructure.

```hcl
# Dangerous
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
}

# Safe
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"
}
```

### 2. Provider Inheritance

Child modules inherit providers from the root module by default. If you need a module to use a different provider configuration (e.g., a different AWS region), pass it explicitly:

```hcl
provider "aws" {
  region = "us-east-1"
  alias  = "us_east"
}

provider "aws" {
  region = "eu-west-1"
  alias  = "eu_west"
}

module "vpc_us" {
  source = "./modules/vpc"
  providers = {
    aws = aws.us_east
  }
}

module "vpc_eu" {
  source = "./modules/vpc"
  providers = {
    aws = aws.eu_west
  }
}
```

Modules should not define provider blocks themselves -- only declare `required_providers` in `versions.tf`.

### 3. count and for_each Limitations

Before Terraform 0.13, `count` and `for_each` were not supported on `module` blocks. If you are stuck on an older version, you must duplicate module calls or upgrade. In 0.13+, both work but with a constraint: the `for_each` keys must be known at plan time (they cannot depend on resources that have not been created yet).

### 4. Circular Dependencies Between Modules

Modules cannot reference each other's outputs bidirectionally:

```hcl
# This is impossible -- circular dependency
module "a" {
  source  = "./modules/a"
  b_value = module.b.output_x    # a depends on b
}

module "b" {
  source  = "./modules/b"
  a_value = module.a.output_y    # b depends on a -- CYCLE!
}
```

Fix this by restructuring: extract the shared resource into a third module, or pass configuration values (not resource outputs) where possible.

### 5. Module Source Changes Require Re-init

If you change a module's `source` (e.g., from local path to registry), you must run `terraform init` again. Terraform does not automatically detect source changes during `plan` or `apply`.

### 6. Refactoring Modules Requires State Moves

If you move resources into or out of a module, Terraform sees a destroy + create. Use `terraform state mv` to update the state mapping:

```bash
# Moving a resource into a module
terraform state mv aws_vpc.main module.vpc.aws_vpc.main

# Moving a resource out of a module
terraform state mv module.vpc.aws_vpc.main aws_vpc.main
```

Or use the `moved` block (Terraform 1.1+) for declarative refactoring:

```hcl
moved {
  from = aws_vpc.main
  to   = module.vpc.aws_vpc.main
}
```

The `moved` block is version-controlled and self-documenting -- prefer it over manual state operations.
