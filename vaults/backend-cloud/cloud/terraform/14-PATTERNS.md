# Terraform Patterns & Anti-Patterns

Every Terraform codebase eventually grows past a single `main.tf`. This guide catalogs the patterns that scale and the anti-patterns that create operational debt, each with concrete code showing the wrong way and the right way.

---

## Patterns (DO)

### 1. Layered Architecture: Separate State Files

```
infra/
  networking/          # VPC, subnets, NAT gateways     -> s3://tfstate/networking/
  data/                # RDS, ElastiCache, S3 buckets    -> s3://tfstate/data/
  compute/             # ECS, ASG, Lambda                -> s3://tfstate/compute/
  monitoring/          # CloudWatch, alarms              -> s3://tfstate/monitoring/
```

Each layer has its own state file and references others via `terraform_remote_state`. The blast radius of any single `terraform apply` is limited to one layer.

---

### 2. Composition Over Inheritance: Small Focused Modules

```hcl
# DON'T: One mega-module with 200 variables
module "everything" {
  source = "./modules/app"
  create_vpc = true; create_database = true; create_ecs = true; create_cdn = true
}

# DO: Small modules composed together
module "vpc"      { source = "./modules/vpc"; cidr = "10.0.0.0/16" }
module "database" { source = "./modules/rds"; subnet_ids = module.vpc.private_subnet_ids }
module "app"      { source = "./modules/ecs"; db_endpoint = module.database.endpoint }
```

Each module has a clear interface (variables in, outputs out). You can test, version, and reuse them independently.

---

### 3. Data Source Lookups Instead of Hardcoded IDs

```hcl
# DON'T
resource "aws_instance" "web" {
  ami = "ami-0c55b159cbfafe1f0"   # What is this? Which region? Still valid?
}

# DO
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "web" {
  ami = data.aws_ami.amazon_linux.id   # Works across regions, stays current
}
```

---

### 4. Remote State References for Cross-Layer Dependencies

```hcl
# compute/data.tf
data "terraform_remote_state" "networking" {
  backend = "s3"
  config  = { bucket = "mycompany-tfstate", key = "networking/terraform.tfstate", region = "us-east-1" }
}

# compute/main.tf
resource "aws_ecs_service" "app" {
  network_configuration {
    subnets = data.terraform_remote_state.networking.outputs.private_subnet_ids
  }
}
```

No hardcoded values, no copy-paste.

---

### 5. Conditional Resources: count with Booleans

```hcl
variable "enable_monitoring" { type = bool; default = true }

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count               = var.enable_monitoring ? 1 : 0
  alarm_name          = "${var.name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  # Reference: aws_cloudwatch_metric_alarm.cpu_high[0]
}
```

`count` with a boolean is correct for binary toggles. For multiple similar resources, use `for_each`.

---

### 6. for_each with Maps for Named Resources

```hcl
# DON'T: count with a list (index shift problem)
resource "aws_subnet" "private" {
  count      = length(var.subnet_cidrs)               # ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  cidr_block = var.subnet_cidrs[count.index]           # Removing item 0 shifts ALL indices -> destroy/recreate
}

# DO: for_each with a map (stable keys)
variable "subnets" {
  default = {
    "private-a" = { cidr = "10.0.1.0/24", az = "us-east-1a" }
    "private-b" = { cidr = "10.0.2.0/24", az = "us-east-1b" }
    "private-c" = { cidr = "10.0.3.0/24", az = "us-east-1c" }
  }
}

resource "aws_subnet" "private" {
  for_each          = var.subnets
  cidr_block        = each.value.cidr
  availability_zone = each.value.az
  tags              = { Name = "${var.project}-${each.key}" }
}
# Removing "private-b" only destroys that one subnet. Others untouched.
```

---

### 7. moved Blocks for Refactoring

```hcl
# Moved into a module
moved {
  from = aws_s3_bucket.uploads
  to   = module.storage.aws_s3_bucket.uploads
}

# Renamed a resource
moved {
  from = aws_instance.web
  to   = aws_instance.app_server
}

# Migrated from count to for_each
moved {
  from = aws_subnet.private[0]
  to   = aws_subnet.private["us-east-1a"]
}
```

Run `terraform plan` after adding `moved` blocks. You should see `(moved from ...)` with zero destroy/create.

---

### 8. Consistent Naming Conventions

```hcl
locals { name_prefix = "${var.project}-${var.environment}" }

# Pattern: <project>-<env>-<resource>-<purpose>
resource "aws_security_group" "this" { name = "${local.name_prefix}-sg-web" }
resource "aws_lb" "this"             { name = "${local.name_prefix}-alb-public" }
resource "aws_s3_bucket" "this"      { bucket = "${local.name_prefix}-s3-uploads" }
```

| Component     | Convention         | Example                  |
| ------------- | ------------------ | ------------------------ |
| Project       | lowercase, short   | `acme`                   |
| Environment   | dev, staging, prod | `prod`                   |
| Resource type | abbreviated        | `sg`, `alb`, `svc`, `s3` |
| Full name     | hyphen-separated   | `acme-prod-sg-web`       |

---

### 9. Tag Propagation with default_tags

```hcl
provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project = var.project; Environment = var.environment
      ManagedBy = "terraform"; Team = var.team; CostCenter = var.cost_center
    }
  }
}

# Resources only add resource-specific tags. Common tags inherited automatically.
resource "aws_instance" "web" { tags = { Name = "${local.name_prefix}-web" } }
```

---

### 10. Separate Stateful from Stateless Resources

```hcl
# data-layer/ -- Rarely changes, high-risk. Uses deletion_protection + prevent_destroy.
resource "aws_rds_cluster" "main"   { deletion_protection = true }
resource "aws_s3_bucket" "docs"     { lifecycle { prevent_destroy = true } }

# compute-layer/ -- Changes frequently, low-risk. Safe to iterate.
resource "aws_ecs_service" "api"    { /* deployed multiple times per day */ }
```

---

### 11. Commit .terraform.lock.hcl

```bash
# .gitignore
.terraform/            # YES - ignore plugin cache
*.tfstate              # YES - ignore local state
# .terraform.lock.hcl  # NO - commit this file
```

Without the lock file, `terraform init` on a different machine might resolve to a different provider patch version.

---

### 12. Pre-commit Hooks with checkov/tfsec

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.89.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tflint
      - id: terraform_checkov
      - id: terraform_tfsec
```

---

## Anti-Patterns (DON'T)

### 1. Mega-Module

```hcl
# DON'T: 50+ variables controlling every aspect of your infrastructure
module "platform" {
  source = "./modules/platform"
  create_vpc = true; create_rds = true; create_ecs = true; create_waf = true
  rds_engine = "postgres"; ecs_cpu = 256; ecs_memory = 512  # ... 40 more
}
# Impossible to test, slow to plan. Compose small modules instead (Pattern 2).
```

### 2. God State

```hcl
# DON'T
terraform { backend "s3" { key = "everything.tfstate" } }  # VPC + RDS + ECS + Lambda + CDN
# Every plan locks everything. State grows to megabytes. Plans take minutes.

# DO: One state per layer (see Pattern 1)
terraform { backend "s3" { key = "compute/terraform.tfstate" } }
```

---

### 3. Hardcoded Values

```hcl
# DON'T
resource "aws_instance" "web" {
  ami = "ami-0c55b159cbfafe1f0"; subnet_id = "subnet-0bb1c79de3EXAMPLE"
  iam_instance_profile = "arn:aws:iam::123456789012:instance-profile/web-role"
}

# DO: Use data sources and references
resource "aws_instance" "web" {
  ami = data.aws_ami.amazon_linux.id; subnet_id = module.vpc.private_subnet_ids[0]
  iam_instance_profile = aws_iam_instance_profile.web.name
}
```

### 4. count with Lists (Index Shift Problem)

```hcl
# DON'T: Removing "bob" shifts "charlie" from index 2 to 1 -> destroy + recreate
resource "aws_iam_user" "this" {
  count = length(var.users)     # ["alice", "bob", "charlie"]
  name  = var.users[count.index]
}

# DO
resource "aws_iam_user" "this" {
  for_each = toset(var.users)   # Removing "bob" only affects ["bob"]
  name     = each.key
}
```

---

### 5. Overusing -target

```bash
# DON'T: Applying individual resources to "fix" things
terraform apply -target=aws_instance.web
terraform apply -target=aws_security_group.web   # State is now inconsistent

# DO: Fix root cause and apply the full plan
terraform plan && terraform apply
```

---

### 6. Provisioners for Configuration Management

```hcl
# DON'T
provisioner "remote-exec" {
  inline = ["sudo apt-get update", "sudo apt-get install -y nginx", "sudo systemctl start nginx"]
}
# Not idempotent. Runs only on creation. Requires SSH connectivity.

# DO: Use user_data or a pre-baked AMI
resource "aws_instance" "web" {
  ami       = data.aws_ami.web_server.id      # Pre-baked with Packer
  user_data = templatefile("${path.module}/user-data.sh", { environment = var.environment })
}
```

---

### 7. Nested Ternaries

```hcl
# DON'T
locals {
  instance_type = var.env == "prod" ? (var.high_mem ? "r5.2xlarge" : "m5.xlarge") : (var.env == "staging" ? "t3.large" : "t3.micro")
}

# DO: Use a lookup map
locals {
  instance_types = { prod = "m5.xlarge", prod-highmem = "r5.2xlarge", staging = "t3.large", dev = "t3.micro" }
  instance_key   = var.high_mem && var.env == "prod" ? "prod-highmem" : var.env
  instance_type  = local.instance_types[local.instance_key]
}
```

---

### 8. Ignoring Plan Output

```bash
# DON'T
terraform apply -auto-approve    # In production?

# DO
terraform plan -out=tfplan       # Save and review
terraform apply tfplan           # Apply exactly what was reviewed
```

---

### 9. local-exec for Everything

```hcl
# DON'T: Shelling out for things Terraform can do natively
resource "null_resource" "dns" {
  provisioner "local-exec" {
    command = "aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://dns.json"
  }
}

# DO: Use the actual resource (tracked in state, idempotent, portable)
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  alias { name = aws_lb.api.dns_name; zone_id = aws_lb.api.zone_id }
}
```

---

### 10. Secrets in terraform.tfvars

```hcl
# DON'T (committed to git)
db_password = "SuperSecret123!"
api_key     = "sk-proj-abc123xyz"

# DO: Fetch from secrets manager at runtime
data "aws_secretsmanager_secret_version" "db" { secret_id = "prod/database/password" }
resource "aws_rds_cluster" "main" { master_password = data.aws_secretsmanager_secret_version.db.secret_string }
# Or: export TF_VAR_db_password=$(aws secretsmanager get-secret-value ...)
```

---

### 11. Not Pinning Provider Versions

```hcl
# DON'T
terraform { required_providers { aws = { source = "hashicorp/aws" } } }
# Today: 5.40.0. Tomorrow: 6.0.0 with breaking changes.

# DO
terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws    = { source = "hashicorp/aws";    version = "~> 5.40" }
    random = { source = "hashicorp/random"; version = "~> 3.6" }
  }
}
```

---

### 12. terraform.workspace for Different Environments

```hcl
# DON'T: Workspaces share backend config, state bucket, and access controls
resource "aws_instance" "web" {
  instance_type = terraform.workspace == "prod" ? "m5.xlarge" : "t3.micro"
  # What if someone runs `terraform workspace select prod` and applies dev code?
}

# DO: Separate directories per environment
# environments/prod/  -> backend key = "prod/app/terraform.tfstate"
# environments/staging/ -> backend key = "staging/app/terraform.tfstate"
```

---

## Decision Matrix

| Situation                   | Pattern                      | Anti-Pattern               |
| --------------------------- | ---------------------------- | -------------------------- |
| Multiple similar resources  | `for_each` with maps         | `count` with lists         |
| Toggle a resource on/off    | `count` with boolean         | Commenting out code        |
| Cross-layer references      | `terraform_remote_state`     | Hardcoded IDs              |
| Renaming/moving resources   | `moved` blocks               | Manual `state mv`          |
| Environment-specific config | Separate dirs or var-files   | `terraform.workspace`      |
| Software on instances       | Packer AMIs or cloud-init    | `remote-exec` provisioners |
| Secrets                     | Secrets Manager data sources | Values in tfvars           |
| Complex conditionals        | Map lookups                  | Nested ternaries           |
| Module design               | Small, composable            | Mega-modules               |
| State organization          | One state per layer          | God state file             |
