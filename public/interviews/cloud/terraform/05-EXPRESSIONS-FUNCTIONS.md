# Expressions & Built-in Functions

Terraform's expression language turns static configuration into dynamic infrastructure. Conditionals toggle resources per environment, `for` expressions reshape data structures, dynamic blocks eliminate repetitive nested blocks, and 100+ built-in functions handle everything from CIDR math to JSON encoding. This guide covers the expressions and functions you will actually use in production, with patterns and gotchas from real-world modules.

---

## Conditional Expressions

```hcl
# Ternary: condition ? true_value : false_value
resource "aws_instance" "web" {
  instance_type = var.environment == "prod" ? "m5.xlarge" : "t3.micro"
}

# Conditional resource creation
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  count      = var.enable_monitoring ? 1 : 0
  alarm_name = "${var.name}-high-cpu"
}

# Reference conditional resource (count makes it a list)
output "alarm_arn" {
  value = var.enable_monitoring ? aws_cloudwatch_metric_alarm.high_cpu[0].arn : null
}
```

---

## For Expressions

```hcl
# List to list
locals {
  upper_names = [for name in var.names : upper(name)]
}

# List to list with filtering
locals {
  long_names = [for name in var.names : upper(name) if length(name) > 3]
}

# Map to map (transform values)
locals {
  prefixed = { for k, v in var.instance_types : k => "aws:${v}" }
}

# Map to list
locals {
  descriptions = [for k, v in var.instance_types : "${k} uses ${v}"]
}

# List to map
locals {
  name_map = { for i, name in var.names : name => i }
  # { alice = 0, bob = 1, charlie = 2 }
}
```

---

## Splat Expressions

Shorthand for extracting a single attribute from every element in a list.

```hcl
# These are equivalent:
output "ids" { value = aws_instance.web[*].id }
output "ids" { value = [for inst in aws_instance.web : inst.id] }
```

Splat only works on lists (`count` resources). For `for_each` resources, use `values()`:

```hcl
output "instance_ids" {
  value = values(aws_instance.web)[*].id
}
```

---

## Dynamic Blocks

Generate repeated nested blocks from a collection. The iterator defaults to the block label; override with `iterator`.

```hcl
resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = var.vpc_id

  dynamic "ingress" {
    for_each = var.ingress_rules   # list of objects with port, protocol, cidr_blocks
    content {
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
      description = ingress.value.description
    }
  }
}

# Override iterator name
dynamic "ingress" {
  for_each = var.ingress_rules
  iterator = rule
  content { from_port = rule.value.port; to_port = rule.value.port }
}
```

---

## Operators

| Category | Operators | Example |
|----------|-----------|---------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` | `var.count * 2` |
| Equality | `==`, `!=` | `var.env == "prod"` |
| Comparison | `<`, `>`, `<=`, `>=` | `var.replicas >= 3` |
| Logical | `&&`, `\|\|`, `!` | `var.enabled && var.env == "prod"` |

---

## Built-in Functions Reference

### String Functions

```hcl
format("Hello, %s! Count: %d", var.name, var.count)
join(", ", ["a", "b", "c"])                    # "a, b, c"
split(",", "a,b,c")                            # ["a", "b", "c"]
replace("hello-world", "-", "_")               # "hello_world"
trimspace("  hello  ")                         # "hello"
substr("terraform", 0, 5)                      # "terra"
upper("hello") / lower("HELLO")               # "HELLO" / "hello"
regex("^([a-z]+)-([0-9]+)$", "app-123")        # ["app", "123"]
regexall("[a-z]+", "abc 123 def")              # ["abc", "def"]
startswith("hello world", "hello")             # true
endswith("file.tf", ".tf")                     # true
```

### Collection Functions

```hcl
length(["a", "b", "c"])                        # 3
flatten([["a", "b"], ["c"]])                   # ["a", "b", "c"]
merge({a = 1}, {b = 2}, {a = 3})               # {a = 3, b = 2}  (last wins)
lookup({a = 1, b = 2}, "c", 0)                 # 0  (default)
element(["a", "b", "c"], 1)                    # "b"
contains(["a", "b", "c"], "b")                 # true
keys({a = 1, b = 2})                           # ["a", "b"]
values({a = 1, b = 2})                         # [1, 2]
zipmap(["a", "b"], [1, 2])                     # {a = 1, b = 2}
concat(["a"], ["b", "c"])                      # ["a", "b", "c"]
distinct(["a", "b", "a"])                      # ["a", "b"]
sort(["c", "a", "b"])                          # ["a", "b", "c"]
one(["single"])                                # "single" (one([]) returns null)
```

### Type Conversion Functions

```hcl
tostring(42) / tonumber("42") / tobool("true")
tolist(toset(["b", "a", "c"]))                 # ["a", "b", "c"]  (sorted)
toset(["a", "b", "a"])                         # toset(["a", "b"])
```

### Filesystem Functions

```hcl
file("${path.module}/scripts/init.sh")         # read file as string
filebase64("${path.module}/files/cert.pem")     # read as base64
templatefile("${path.module}/tpl/ud.sh", {      # render template with variables
  hostname = var.hostname
})
fileset(path.module, "templates/*.tpl")         # glob file paths
fileexists("${path.module}/optional.conf")      # true/false
```

### Date/Time Functions

```hcl
timestamp()                                    # current UTC time (changes every plan)
plantimestamp()                                # plan time (consistent within a plan)
timeadd(timestamp(), "24h")                    # 24 hours from now
formatdate("YYYY-MM-DD", timestamp())          # "2026-03-03"
```

### Hash and Encoding Functions

```hcl
base64encode("hello") / base64decode("aGVsbG8=")
sha256("hello")                                # hex digest
md5("hello")                                   # hex digest (avoid for security)
jsonencode({ name = "test" })                  # '{"name":"test"}'
jsondecode("{\"name\":\"test\"}")               # { name = "test" }
yamlencode({ name = "test" })                  # YAML string
yamldecode("name: test\n")                     # { name = "test" }
```

### IP Network Functions

```hcl
cidrsubnet("10.0.0.0/16", 8, 1)               # "10.0.1.0/24"
cidrsubnet("10.0.0.0/16", 8, 2)               # "10.0.2.0/24"
cidrhost("10.0.1.0/24", 5)                    # "10.0.1.5"
cidrnetmask("10.0.0.0/16")                    # "255.255.0.0"

# Subnet calculation pattern
locals {
  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 10)]
}
```

---

## Error Handling: try() and can()

```hcl
# can() returns true if the expression evaluates without error
locals {
  is_valid_json = can(jsondecode(var.raw_config))
}

# try() returns the first expression that succeeds
locals {
  config = try(jsondecode(var.raw_config), {})
  port   = try(var.service.port, 8080)
}

# Useful in variable validation
variable "json_config" {
  type = string
  validation {
    condition     = can(jsondecode(var.json_config))
    error_message = "json_config must be valid JSON."
  }
}
```

---

## Common Patterns

### Conditional Resource Creation with count

```hcl
resource "aws_db_instance" "replica" {
  count               = var.enable_read_replica ? 1 : 0
  replicate_source_db = aws_db_instance.primary.id
  instance_class      = var.replica_instance_class
}
```

### for_each with Maps

```hcl
variable "buckets" {
  type    = map(object({ versioning = bool }))
  default = { logs = { versioning = false }, assets = { versioning = true } }
}

resource "aws_s3_bucket" "this" {
  for_each = var.buckets
  bucket   = "${var.project}-${each.key}"
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = { for k, v in var.buckets : k => v if v.versioning }
  bucket   = aws_s3_bucket.this[each.key].id
  versioning_configuration { status = "Enabled" }
}
```

### Dynamic Blocks for Security Group Rules

```hcl
locals {
  rules = {
    http  = { port = 80,  cidrs = ["0.0.0.0/0"] }
    https = { port = 443, cidrs = ["0.0.0.0/0"] }
    ssh   = { port = 22,  cidrs = [var.admin_cidr] }
  }
}

resource "aws_security_group" "this" {
  name   = "${var.name}-sg"
  vpc_id = var.vpc_id

  dynamic "ingress" {
    for_each = local.rules
    content {
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = "tcp"
      cidr_blocks = ingress.value.cidrs
      description = ingress.key
    }
  }
}
```

### templatefile() for User Data

```hcl
resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = var.instance_type
  user_data = templatefile("${path.module}/templates/user_data.sh", {
    hostname    = "web-${var.environment}"
    packages    = join(" ", var.packages)
    config_json = jsonencode(var.app_config)
  })
}
```

### Flattening Nested Structures for for_each

```hcl
locals {
  subnets = flatten([
    for vpc_name, vpc in var.vpc_config : [
      for subnet_name, subnet in vpc.subnets : {
        key = "${vpc_name}-${subnet_name}", vpc_name = vpc_name
        cidr = subnet.cidr, az = subnet.az
      }
    ]
  ])
  subnet_map = { for s in local.subnets : s.key => s }
}

resource "aws_subnet" "this" {
  for_each          = local.subnet_map
  vpc_id            = aws_vpc.this[each.value.vpc_name].id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az
}
```

---

## Common Gotchas

| Gotcha | Explanation |
|--------|-------------|
| Splat on `for_each` resources | `resource[*].id` fails with `for_each`. Use `values(resource)[*].id`. |
| `for_each` needs map or set(string) | Passing a list of objects fails. Convert: `{ for o in list : o.key => o }`. |
| Dynamic blocks hurt readability | More than 2 levels deep is a code smell. Restructure inputs or split resources. |
| `count` to `for_each` migration | Switching forces recreation of all instances. Plan carefully. |
| `templatefile` whitespace | Use `%{~ ... }` for trimming. Without `~`, expect extra blank lines. |
| `merge()` last-key-wins | `merge({a=1}, {a=2})` returns `{a=2}`. Easy to miss with tag maps. |
| `timestamp()` perpetual diff | Changes every plan. Use `plantimestamp()` or a `null_resource` trigger. |
| `jsonencode` key ordering | Keys are sorted alphabetically, which can cause diffs vs external JSON. |
| `regex` returns captures | `regex("(a)(b)", "ab")` returns `["a", "b"]`, not `"ab"`. |
| `coalesce` vs `coalescelist` | `coalesce` is for strings/numbers. For lists, use `coalescelist`. |

---

## Quick Function Reference

| Category | Key Functions |
|----------|--------------|
| Strings | `format`, `join`, `split`, `replace`, `trimspace`, `upper`, `lower`, `regex`, `regexall` |
| Collections | `length`, `flatten`, `merge`, `lookup`, `contains`, `keys`, `values`, `zipmap`, `distinct`, `sort`, `one` |
| Type Conversion | `tostring`, `tonumber`, `tobool`, `tolist`, `tomap`, `toset` |
| Filesystem | `file`, `filebase64`, `templatefile`, `fileset`, `fileexists` |
| Date/Time | `timestamp`, `plantimestamp`, `timeadd`, `formatdate` |
| Hash/Encoding | `base64encode`, `base64decode`, `sha256`, `md5`, `jsonencode`, `jsondecode`, `yamlencode`, `yamldecode` |
| Networking | `cidrsubnet`, `cidrhost`, `cidrnetmask` |
| Error Handling | `try`, `can` |
