# Resources and Data Sources

Resources are the core building block of Terraform. A resource block tells Terraform to create, update, or delete a piece of infrastructure -- an EC2 instance, an S3 bucket, a DNS record, a GitHub repository. Data sources are the read-only counterpart: they query existing infrastructure that Terraform does not manage. Together, resources and data sources are how you express your entire infrastructure in code.

---

## 1. Resources

### Basic Syntax

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  tags          = { Name = "web-server" }
}
```

The first label (`aws_instance`) is the **resource type** -- the prefix (`aws`) identifies the provider. The second label (`web`) is the **local name** you choose, unique within that type in the same module.

### Resource Addressing

| Address                         | Meaning                                 |
| ------------------------------- | --------------------------------------- |
| `aws_instance.web`              | Resource in the root module             |
| `aws_instance.web[0]`           | Specific instance when using `count`    |
| `aws_instance.web["app"]`       | Specific instance when using `for_each` |
| `module.vpc.aws_subnet.private` | Resource inside a child module          |

### Arguments vs Computed Attributes

**Arguments** are values you provide. **Computed attributes** are values the provider returns after creation. Check each resource's documentation to see which are configurable and which are read-only.

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"  # argument
  instance_type = "t3.micro"               # argument
  # Computed after creation:
  # aws_instance.web.id          --> "i-0abc123def456"
  # aws_instance.web.public_ip   --> "54.123.45.67"
}
```

---

## 2. Meta-Arguments

Meta-arguments work on **any** resource type. They control Terraform's behavior, not the resource's configuration.

### 2.1 count

Creates multiple instances using a numeric index:

```hcl
resource "aws_instance" "web" {
  count         = 3
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  tags          = { Name = "web-${count.index}" }
}
```

**Problem:** Instances are identified by index. Removing the second item shifts all subsequent indices, causing recreation.

### 2.2 for_each

Creates multiple instances identified by a **key** instead of an index:

```hcl
resource "aws_iam_user" "engineers" {
  for_each = toset(["alice", "bob", "carol"])
  name     = each.value
}

# With a map
resource "aws_instance" "servers" {
  for_each      = var.instances    # map of objects
  ami           = each.value.ami
  instance_type = each.value.instance_type
  tags          = { Name = each.key }
}
```

### count vs for_each

|                      | count                                 | for_each                           |
| -------------------- | ------------------------------------- | ---------------------------------- |
| Identifier           | Numeric index (`[0]`, `[1]`)          | String key (`["web"]`)             |
| Remove middle item   | Shifts all indices, causes recreation | Only the removed item is destroyed |
| Input type           | Number                                | Set or map                         |
| Conditional creation | `count = var.enabled ? 1 : 0`         | Works but count is simpler         |
| Best for             | On/off toggles                        | Everything else                    |

**Rule of thumb:** Use `for_each` by default. Use `count` only for binary on/off (0 or 1).

### 2.3 depends_on

Forces an explicit dependency when Terraform cannot detect one from references:

```hcl
resource "aws_instance" "app" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  # No attribute reference to the policy exists, but the instance needs it
  depends_on = [aws_iam_role_policy.s3_access]
}
```

Use sparingly. If you add `depends_on` frequently, your architecture may need rethinking. Implicit dependencies via attribute references are clearer.

### 2.4 provider

Specifies which provider instance to use when you have aliases:

```hcl
resource "aws_instance" "eu_web" {
  provider      = aws.europe
  ami           = "ami-0d71ea30463e0ff8d"
  instance_type = "t3.micro"
}
```

### 2.5 lifecycle

Controls how Terraform handles resource creation, updates, and deletion:

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
    ignore_changes        = [tags, ami]
    replace_triggered_by  = [aws_launch_template.web.latest_version]
  }
}
```

| Option                  | What It Does                                   | When To Use                             |
| ----------------------- | ---------------------------------------------- | --------------------------------------- |
| `create_before_destroy` | Creates replacement before destroying original | Zero-downtime replacements              |
| `prevent_destroy`       | Terraform errors if plan would destroy this    | Databases, critical S3 buckets          |
| `ignore_changes`        | Ignores drift on listed attributes             | When another system modifies attributes |
| `replace_triggered_by`  | Forces replacement when a dependency changes   | Re-provisioning on dependency updates   |

`ignore_changes` accepts a list of attribute names or the special value `all` (Terraform never updates the resource after creation).

---

## 3. Timeouts

Some resources support custom timeouts for long-running operations:

```hcl
resource "aws_db_instance" "main" {
  engine         = "postgres"
  instance_class = "db.r6g.large"

  timeouts {
    create = "60m"
    update = "45m"
    delete = "30m"
  }
}
```

Not all resources support timeouts. Defaults are usually reasonable, but bump them for slow resources (RDS, EKS, CloudFront).

---

## 4. Data Sources

Data sources read existing infrastructure. They do not create, update, or delete anything.

```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]    # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"
}
```

### Common Data Sources

| Data Source               | What It Returns         | Typical Use                           |
| ------------------------- | ----------------------- | ------------------------------------- |
| `aws_ami`                 | AMI ID matching filters | Find latest Ubuntu/Amazon Linux AMI   |
| `aws_vpc`                 | VPC attributes          | Reference existing VPC                |
| `aws_subnets`             | List of subnet IDs      | Find subnets for ASG placement        |
| `aws_caller_identity`     | Account ID, ARN         | Construct ARNs dynamically            |
| `aws_region`              | Current region name     | Region-aware configurations           |
| `aws_availability_zones`  | Available AZs           | Spread resources across AZs           |
| `aws_iam_policy_document` | JSON IAM policy         | Write policies in HCL instead of JSON |
| `aws_ssm_parameter`       | Parameter Store value   | Read config from Parameter Store      |

### When to Use Data Sources vs Resources

| Scenario                                 | Use                                       |
| ---------------------------------------- | ----------------------------------------- |
| You are creating the infrastructure      | `resource`                                |
| Infrastructure exists, managed elsewhere | `data` source                             |
| Another Terraform workspace manages it   | `data` source or `terraform_remote_state` |
| You need the latest AMI ID at plan time  | `data` source                             |

---

## 5. Resource Dependencies

### Implicit Dependencies

Terraform automatically detects dependencies when one resource references another's attributes:

```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id    # implicit dependency
  cidr_block = "10.0.1.0/24"
}
```

Terraform builds a DAG from these references. Resources without dependencies are created in parallel.

### Explicit Dependencies

Use `depends_on` when the dependency is not visible through attribute references:

```hcl
resource "aws_instance" "app" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  depends_on    = [aws_s3_bucket_policy.logs]
}
```

---

## 6. Provisioners (and Why to Avoid Them)

Provisioners run scripts on a resource after creation:

| Provisioner   | What It Does                                      |
| ------------- | ------------------------------------------------- |
| `remote-exec` | Run commands on the remote resource via SSH/WinRM |
| `local-exec`  | Run commands on the machine running Terraform     |
| `file`        | Copy files to the remote resource                 |

### Why They Are a Last Resort

| Problem                   | Explanation                                          |
| ------------------------- | ---------------------------------------------------- |
| Not in the state model    | Terraform cannot detect drift in provisioner results |
| Not idempotent            | Running apply twice may produce different results    |
| Fragile connections       | SSH timeouts, key management headaches               |
| Better alternatives exist | cloud-init/user_data, Packer, Ansible                |

### Better Alternatives

```hcl
# Use user_data instead of remote-exec
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  user_data = <<-EOT
    #!/bin/bash
    apt-get update
    apt-get install -y nginx
    systemctl enable nginx
  EOT
}
```

If you must use a provisioner, `local-exec` is the least problematic.

---

## 7. Common Gotchas

### Data Source Timing During Plan

Data sources are read during `terraform plan`. If a data source depends on a resource being created in the same apply, it may fail because the resource does not exist yet. If you are creating a resource and need its attributes, reference the resource directly, not a data source.

### count and for_each with Unknown Values

`count` and `for_each` must be known at plan time. You cannot use a computed value as the count argument. If a data source depends on a not-yet-created resource, its output is unknown and Terraform errors. The solution: split into layers (VPC layer runs first, app layer second).

### Destroy Order with depends_on

During destroy, Terraform reverses the dependency graph. `depends_on` can create unexpected ordering if destroying one resource requires another to still exist (e.g., a Lambda needing its IAM role during teardown).

### for_each Only Accepts Sets and Maps

```hcl
# FAILS
resource "aws_iam_user" "users" {
  for_each = ["alice", "bob"]   # list not allowed
  name     = each.value
}

# WORKS
resource "aws_iam_user" "users" {
  for_each = toset(["alice", "bob"])
  name     = each.value
}
```

### Referencing count vs for_each Resources

```hcl
# With count: splat expression returns a list
output "ips" {
  value = aws_instance.web[*].public_ip
}

# With for_each: use a for expression
output "ips" {
  value = { for k, v in aws_instance.web : k => v.public_ip }
}
```

The splat expression (`[*]`) only works with `count`. For `for_each`, use `for` or `values()`.
