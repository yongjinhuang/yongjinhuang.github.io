# Fleet Management — Managing Thousands of Servers

> Operations perspective: how teams actually run fleets of 100s to 10,000s of servers day-to-day.

---

## 1. Server Inventory & Asset Management

### The Core Problem

When you have 5000 servers, you need answers to:
- What hardware/instance types are running right now?
- Which servers are running which application version?
- Which are unpatched against CVE-2024-XXXX?
- Who owns this server and what cost center pays for it?

### CMDB (Configuration Management Database)

A CMDB is the single source of truth for your infrastructure state.

```
┌─────────────────────────────────────────────────────────┐
│                        CMDB                             │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │  CI Records  │    │Relationships │                  │
│  │              │    │              │                  │
│  │ server-001   │───▶│ runs:app-A   │                  │
│  │ server-002   │    │ in:az-1a     │                  │
│  │ server-003   │    │ owned-by:sre │                  │
│  └──────────────┘    └──────────────┘                  │
│                                                         │
│  Sources: AWS API, Ansible facts, custom agents         │
└─────────────────────────────────────────────────────────┘
          ▲                    ▲
          │                    │
   Discovery             Manual Entry
   (automated)           (exceptions)
```

Popular CMDBs: ServiceNow, NetBox (open source), AWS Config, Backstage (developer portal).

### Tagging Strategy (AWS)

Tagging is the foundation of fleet management. Without disciplined tagging, cost allocation and ownership become impossible.

**Mandatory tag schema:**

| Tag Key         | Example Value          | Purpose                      |
|-----------------|------------------------|------------------------------|
| `env`           | `prod`, `staging`      | Environment classification   |
| `app`           | `checkout-api`         | Application identifier       |
| `team`          | `payments-eng`         | Ownership for alerts/billing |
| `cost-center`   | `CC-1042`              | Finance allocation           |
| `managed-by`    | `terraform`            | IaC tracking                 |
| `ami-id`        | `ami-0abc123`          | Image version tracking       |
| `patch-group`   | `linux-prod-weekly`    | SSM Patch Manager grouping   |

**Enforce tags via AWS Config rule:**

```bash
# List EC2 instances missing required tags
aws ec2 describe-instances \
  --query "Reservations[].Instances[?!Tags[?Key=='env']].[InstanceId]" \
  --output text

# Config rule: required-tags
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "required-tags",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "REQUIRED_TAGS"
  },
  "InputParameters": "{\"tag1Key\":\"env\",\"tag2Key\":\"app\",\"tag3Key\":\"team\"}"
}'
```

### AWS Systems Manager (SSM) Inventory

SSM Inventory collects metadata from managed instances automatically — OS, installed software, network config, running services.

```bash
# Query inventory for all instances running a specific package
aws ssm list-inventory-entries \
  --instance-id mi-0abc123 \
  --type-name "AWS:Application"

# Aggregate query: find all instances with nginx installed
aws ssm get-inventory \
  --filters '[{
    "Key": "AWS:Application.Name",
    "Type": "Equal",
    "Values": ["nginx"]
  }]' \
  --query "Entities[].Id"

# Resource Data Sync: push inventory to S3 for Athena querying
aws ssm create-resource-data-sync \
  --sync-name "fleet-inventory-sync" \
  --s3-destination '{
    "BucketName": "my-inventory-bucket",
    "Prefix": "ssm-inventory/",
    "SyncFormat": "JsonSerDe",
    "Region": "us-east-1"
  }'
```

**Fleet discovery with SSM Inventory + Athena:**

```sql
-- Find all instances not reporting inventory for 48 hours (offline/zombie)
SELECT instanceid, lastupdatetime
FROM "ssm_inventory"."aws_instanceinformation"
WHERE lastupdatetime < NOW() - INTERVAL '48' HOUR
  AND environmenttype = 'EC2'
ORDER BY lastupdatetime ASC;

-- Software version spread across fleet
SELECT name, version, COUNT(*) AS instance_count
FROM "ssm_inventory"."aws_application"
WHERE name = 'openssl'
GROUP BY name, version
ORDER BY instance_count DESC;
```

---

## 2. Provisioning at Scale

### The Problem with Snowflake Servers

```
ANTI-PATTERN: Configuration drift over time

Day 1:   server-A  ──── standard AMI ────▶ config v1
Day 30:  server-A  ──── manual patch ────▶ config v1 + hotfix
Day 60:  server-A  ──── chef run ────────▶ config v1 + hotfix + chef
Day 90:  server-A  ──── ad-hoc change ──▶ config v1 + hotfix + chef + ???

Result: unique "snowflake" server — impossible to reproduce, risky to touch
```

### Golden AMI Strategy

A golden AMI bakes in everything needed so instances launch ready-to-serve, with zero bootstrap time.

```
Base AMI (AWS/OS vendor)
    │
    ▼
┌───────────────────────────────────┐
│         Security Hardening        │
│  - CIS benchmarks                 │
│  - Remove unneeded packages       │
│  - Configure auditd, fail2ban     │
│  - Install CrowdStrike/Defender   │
└───────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────┐
│      OS & Runtime Dependencies    │
│  - Java 21 / Node 22 / Python 3.12│
│  - Monitoring agents (datadog)    │
│  - Log shippers (fluentbit)       │
│  - SSM agent (if not pre-installed│
└───────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────┐
│       Application Layer (opt.)    │
│  - App binary + config            │
│  - Startup scripts                │
│  - Health check endpoint          │
└───────────────────────────────────┘
    │
    ▼
Golden AMI  ──── tested ──── tagged ──── distributed to all regions
```

### Packer: AMI Image Pipeline

```hcl
# packer/golden-ami.pkr.hcl

packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "base_ami" {
  type    = string
  default = "ami-0abcdef1234567890"  # Latest Amazon Linux 2023
}

variable "app_version" {
  type = string
}

source "amazon-ebs" "golden" {
  region         = "us-east-1"
  source_ami     = var.base_ami
  instance_type  = "m5.large"
  ssh_username   = "ec2-user"
  ami_name       = "golden-checkout-api-${var.app_version}-{{timestamp}}"

  ami_regions = ["us-east-1", "us-west-2", "eu-west-1"]

  tags = {
    Name        = "golden-checkout-api"
    app         = "checkout-api"
    app_version = var.app_version
    built_at    = "{{timestamp}}"
    managed_by  = "packer"
  }

  launch_block_device_mappings {
    device_name           = "/dev/xvda"
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }
}

build {
  sources = ["source.amazon-ebs.golden"]

  # Step 1: OS hardening
  provisioner "shell" {
    script = "scripts/harden-os.sh"
  }

  # Step 2: Install runtime & agents
  provisioner "ansible" {
    playbook_file = "ansible/install-runtime.yml"
    extra_arguments = ["--extra-vars", "app_version=${var.app_version}"]
  }

  # Step 3: Install application
  provisioner "shell" {
    inline = [
      "aws s3 cp s3://artifacts/checkout-api-${var.app_version}.tar.gz /opt/",
      "tar -xzf /opt/checkout-api-${var.app_version}.tar.gz -C /opt/app/",
      "systemctl enable checkout-api"
    ]
  }

  # Step 4: Validate
  provisioner "shell" {
    script = "scripts/validate-ami.sh"
  }

  # Step 5: CIS scan
  post-processor "shell-local" {
    command = "aws inspector2 start-ci-scan --resource-id ${PACKER_BUILD_NAME}"
  }
}
```

**Run the pipeline:**
```bash
# Validate template
packer validate -var "app_version=2.4.1" golden-ami.pkr.hcl

# Build
packer build -var "app_version=2.4.1" golden-ami.pkr.hcl

# Output: ami-0newgolden123456 (us-east-1)
#         ami-0newgolden234567 (us-west-2)
#         ami-0newgolden345678 (eu-west-1)
```

### Launch Templates

Launch templates capture the full instance config for reproducible launches.

```bash
# Create launch template from golden AMI
aws ec2 create-launch-template \
  --launch-template-name "checkout-api-prod" \
  --version-description "v2.4.1 golden AMI" \
  --launch-template-data '{
    "ImageId": "ami-0newgolden123456",
    "InstanceType": "m5.xlarge",
    "IamInstanceProfile": {"Name": "checkout-api-role"},
    "SecurityGroupIds": ["sg-0abc123"],
    "UserData": "base64-encoded-bootstrap-script",
    "BlockDeviceMappings": [{
      "DeviceName": "/dev/xvda",
      "Ebs": {"VolumeSize": 30, "VolumeType": "gp3", "Encrypted": true}
    }],
    "MetadataOptions": {
      "HttpTokens": "required",
      "HttpPutResponseHopLimit": 1
    },
    "TagSpecifications": [{
      "ResourceType": "instance",
      "Tags": [
        {"Key": "app", "Value": "checkout-api"},
        {"Key": "env", "Value": "prod"},
        {"Key": "team", "Value": "payments-eng"}
      ]
    }]
  }'

# Create new version when AMI updates
aws ec2 create-launch-template-version \
  --launch-template-name "checkout-api-prod" \
  --source-version 1 \
  --version-description "v2.4.2 golden AMI" \
  --launch-template-data '{"ImageId": "ami-0newergolden567890"}'
```

---

## 3. Immutable Infrastructure vs Mutable

### The Spectrum

```
MUTABLE (Pet model)                    IMMUTABLE (Cattle model)
─────────────────────────────────────────────────────────────
"Server Alice"                         "i-0abc123"
Has a name, history, feelings          ID only, disposable
SSH in and fix it                      Replace it, never patch in-place
Config drift accumulates               Always fresh from golden image
Hard to reproduce                      100% reproducible
Manual runbooks                        Automated pipelines
Works until it doesn't                 Fails fast, replaces fast
```

### Why Immutable Wins at Scale

| Factor              | Mutable (Pets)              | Immutable (Cattle)              |
|---------------------|-----------------------------|---------------------------------|
| Config drift        | Grows over time             | Zero — every instance is fresh  |
| Patch rollout       | Run chef/ansible on all     | Roll new AMI via ASG            |
| Incident response   | SSH in and debug            | Terminate + replace             |
| Reproducibility     | "Works on this server"      | Same everywhere, always         |
| Security posture    | Patching lag accumulates    | New AMI = fully patched         |
| Rollback            | Hope the runbook works      | Roll back launch template ver.  |
| Audit compliance    | Drift makes audits hard     | Immutable state = clean audits  |

### Blue-Green Infrastructure Replacement

Instead of patching running servers, you build a new fleet and cut traffic over.

```
BEFORE DEPLOYMENT:
┌─────────────────────────────────────────┐
│           Load Balancer                 │
└──────────────────┬──────────────────────┘
                   │ 100% traffic
         ┌─────────▼──────────┐
         │   BLUE Fleet       │
         │   50 instances     │
         │   AMI v2.3.0       │
         └────────────────────┘

DURING DEPLOYMENT:
┌─────────────────────────────────────────┐
│           Load Balancer                 │
└──────────┬──────────────────┬───────────┘
           │ 90%              │ 10% (canary)
  ┌────────▼───────┐  ┌───────▼────────┐
  │  BLUE Fleet    │  │  GREEN Fleet   │
  │  50 instances  │  │  5 instances   │
  │  AMI v2.3.0    │  │  AMI v2.4.0    │
  └────────────────┘  └────────────────┘

AFTER VALIDATION (shift 100% to green):
┌─────────────────────────────────────────┐
│           Load Balancer                 │
└──────────────────┬──────────────────────┘
                   │ 100% traffic
         ┌─────────▼──────────┐
         │   GREEN Fleet      │
         │   50 instances     │
         │   AMI v2.4.0       │
         └────────────────────┘
           (Blue fleet terminated)
```

---

## 4. Auto-Scaling Groups Deep Dive

### ASG Core Concepts

```
┌──────────────────────────────────────────────────────────┐
│                Auto-Scaling Group                        │
│                                                          │
│  Min: 10    Desired: 25    Max: 100                      │
│                                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │  i1  │ │  i2  │ │  i3  │ │ ... │ │  i25 │          │
│  │ AZ-a │ │ AZ-b │ │ AZ-c │ │     │ │ AZ-a │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                          │
│  Launch Template: checkout-api-prod v3                   │
│  Health Check: ELB (port 8080 /health)                   │
│  Termination Policy: OldestInstance                      │
└──────────────────────────────────────────────────────────┘
```

### Scaling Policies

**1. Target Tracking (recommended for most workloads)**

```bash
# Scale to maintain 60% CPU utilization
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name checkout-api-prod \
  --policy-name cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 60.0,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# Track custom CloudWatch metric (e.g., requests per instance)
aws autoscaling put-scaling-policy \
  --policy-name rps-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "CustomizedMetricSpecification": {
      "MetricName": "RequestsPerTarget",
      "Namespace": "checkout-api/production",
      "Dimensions": [{"Name": "ASGName", "Value": "checkout-api-prod"}],
      "Statistic": "Average",
      "Unit": "None"
    },
    "TargetValue": 1000.0
  }'
```

**2. Step Scaling (for non-linear response)**

```bash
# Scale aggressively when CPU > 80%, gently when 60-80%
aws autoscaling put-scaling-policy \
  --policy-name cpu-step-scale-out \
  --policy-type StepScaling \
  --adjustment-type ChangeInCapacity \
  --step-adjustments '[
    {"MetricIntervalLowerBound": 0, "MetricIntervalUpperBound": 20, "ScalingAdjustment": 2},
    {"MetricIntervalLowerBound": 20, "ScalingAdjustment": 5}
  ]'
```

**3. Predictive Scaling**

AWS analyzes historical patterns and pre-provisions capacity before demand arrives.

```bash
aws autoscaling put-scaling-policy \
  --policy-name predictive-scaling \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications": [{
      "TargetValue": 60.0,
      "PredefinedMetricPairSpecification": {
        "PredefinedMetricType": "ASGCPUUtilization"
      }
    }],
    "Mode": "ForecastAndScale",
    "SchedulingBufferTime": 300
  }'
```

### Cooldown Periods

Cooldown prevents thrashing — rapid scale-out followed immediately by scale-in.

```
Scale-Out Event
     │
     ▼
  Launch 10 instances
     │
     ▼
  Cooldown timer starts (300s default)
     │
  ┌──┴──────────────────────────────────┐
  │  During cooldown: scaling suspended  │
  │  (even if metric triggers again)     │
  └──┬──────────────────────────────────┘
     │ Timer expires
     ▼
  Resume normal scaling evaluation
```

**Cooldown recommendations:**
- Scale-out cooldown: 60-120s (you want fast scale-out)
- Scale-in cooldown: 300-600s (scale-in slowly to avoid premature termination)
- Instance warm-up: time for new instance to start contributing to metrics

### Lifecycle Hooks

Lifecycle hooks pause the instance at transition points, letting you run custom logic.

```
LAUNCH LIFECYCLE:
─────────────────
EC2 Pending ──▶ [Pending:Wait] ──▶ InService
                      │
                      │ Your hook runs here:
                      │ - Register with service mesh
                      │ - Pull secrets from Vault
                      │ - Wait for app health check
                      │ - Notify monitoring system
                      ▼
               CompleteLifecycleAction (CONTINUE or ABANDON)

TERMINATION LIFECYCLE:
──────────────────────
InService ──▶ [Terminating:Wait] ──▶ Terminated
                      │
                      │ Your hook runs here:
                      │ - Drain connections (ELB does this, but custom too)
                      │ - Flush in-memory queues
                      │ - Deregister from service discovery
                      │ - Upload final logs
                      ▼
               CompleteLifecycleAction (CONTINUE)
```

```bash
# Create termination lifecycle hook
aws autoscaling put-lifecycle-hook \
  --lifecycle-hook-name graceful-shutdown \
  --auto-scaling-group-name checkout-api-prod \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 120 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sqs:us-east-1:123456789:lifecycle-hooks \
  --role-arn arn:aws:iam::123456789:role/asg-lifecycle-role

# Lambda or service processes the hook, then signals completion
aws autoscaling complete-lifecycle-action \
  --lifecycle-hook-name graceful-shutdown \
  --auto-scaling-group-name checkout-api-prod \
  --lifecycle-action-result CONTINUE \
  --instance-id i-0abc123def456
```

### Mixed Instances (Spot + On-Demand)

```bash
# Create ASG with spot + on-demand mix
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name checkout-api-prod \
  --min-size 10 --max-size 100 --desired-capacity 30 \
  --mixed-instances-policy '{
    "LaunchTemplate": {
      "LaunchTemplateSpecification": {
        "LaunchTemplateName": "checkout-api-prod",
        "Version": "$Latest"
      },
      "Overrides": [
        {"InstanceType": "m5.xlarge"},
        {"InstanceType": "m5a.xlarge"},
        {"InstanceType": "m4.xlarge"},
        {"InstanceType": "r5.large"}
      ]
    },
    "InstancesDistribution": {
      "OnDemandBaseCapacity": 10,
      "OnDemandPercentageAboveBaseCapacity": 30,
      "SpotAllocationStrategy": "capacity-optimized",
      "SpotInstancePools": 4
    }
  }' \
  --vpc-zone-identifier "subnet-0a,subnet-0b,subnet-0c"
```

**Cost breakdown with mixed instances:**
- On-demand base (10 instances): always available, predictable cost
- 30% of remaining on-demand: buffer for critical headroom
- 70% spot: ~70% cheaper, tolerate interruptions with graceful draining

---

## 5. Instance Lifecycle

### Full Lifecycle State Machine

```
                    ┌─────────────────┐
                    │   Scale-Out /   │
                    │  Manual Launch  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Pending      │
                    │  (booting)      │
                    └────────┬────────┘
                             │  (if lifecycle hook)
                    ┌────────▼────────┐
                    │  Pending:Wait   │
                    │  (hook running) │
                    └────────┬────────┘
                             │ CONTINUE
                    ┌────────▼────────┐
               ┌───▶  InService      │◀──── Normal operation
               │    │  (healthy)     │
               │    └────────┬───────┘
               │             │  health check fails /
               │             │  scale-in / termination
               │    ┌────────▼───────┐
  re-queue     │    │  Terminating   │
  if error     │    │  (draining)    │
               │    └────────┬───────┘
               │             │ (if lifecycle hook)
               │    ┌────────▼────────┐
               │    │Terminating:Wait │
               └────│  (hook running) │
                    └────────┬────────┘
                             │ CONTINUE
                    ┌────────▼────────┐
                    │   Terminated    │
                    └─────────────────┘
```

### Health Check Configuration

```bash
# ELB health check (preferred — validates app is actually serving traffic)
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name checkout-api-prod \
  --health-check-type ELB \
  --health-check-grace-period 120  # seconds before health check starts

# EC2 health check (fallback — only checks instance reachability)
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name checkout-api-prod \
  --health-check-type EC2 \
  --health-check-grace-period 60
```

### Graceful Shutdown on the Instance

Your application must handle SIGTERM to shut down cleanly:

```bash
# /etc/systemd/system/checkout-api.service
[Unit]
Description=Checkout API
After=network.target

[Service]
Type=simple
ExecStart=/opt/app/checkout-api
ExecStop=/bin/kill -TERM $MAINPID
TimeoutStopSec=90          # Allow 90s for graceful drain
KillMode=mixed
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
# Custom shutdown script triggered by lifecycle hook
#!/bin/bash
# /opt/scripts/graceful-shutdown.sh

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
ASG_NAME=$(aws autoscaling describe-auto-scaling-instances \
  --instance-ids $INSTANCE_ID \
  --query "AutoScalingInstances[0].AutoScalingGroupName" \
  --output text)

# Stop accepting new requests (ELB draining handles connections)
# Wait for in-flight requests to complete
sleep 30

# Flush job queue
/opt/scripts/drain-queue.sh

# Signal lifecycle hook complete
aws autoscaling complete-lifecycle-action \
  --lifecycle-hook-name graceful-shutdown \
  --auto-scaling-group-name $ASG_NAME \
  --lifecycle-action-result CONTINUE \
  --instance-id $INSTANCE_ID
```

---

## 6. Fleet-Wide Operations

### SSM Run Command — Running Commands Across 5000 Hosts

AWS Systems Manager Run Command lets you execute scripts on any number of managed instances without SSH.

```
OPS Team                SSM Service             Target Fleet
─────────               ───────────             ────────────
Submit command ──────▶  Queue command     ──── i-001 (agent polls)
                        Store results     ──── i-002 (agent polls)
                                          ──── ...
View results   ◀──────  Aggregate output  ──── i-5000 (agent polls)
```

**Basic Run Command:**

```bash
# Run a shell command on ALL prod instances
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets '[{"Key": "tag:env", "Values": ["prod"]}]' \
  --parameters '{"commands": ["systemctl status checkout-api"]}' \
  --max-concurrency "20%"  \  # Roll across 20% of fleet at a time
  --max-errors "5%"  \        # Stop if >5% error rate
  --timeout-seconds 60 \
  --output-s3-bucket-name "ssm-run-output" \
  --output-s3-key-prefix "commands/"

# Run on specific application tier
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets '[
    {"Key": "tag:app", "Values": ["checkout-api"]},
    {"Key": "tag:env", "Values": ["prod"]}
  ]' \
  --parameters '{"commands": [
    "APP_VERSION=$(cat /opt/app/VERSION)",
    "echo \"Instance: $(hostname) | Version: $APP_VERSION\""
  ]}'

# Check command status
COMMAND_ID="abc-def-123"
aws ssm list-command-invocations \
  --command-id $COMMAND_ID \
  --details \
  --query "CommandInvocations[*].[InstanceId,Status,StatusDetails]" \
  --output table
```

**SSM Documents for complex operations:**

```yaml
# ssm-documents/rotate-tls-cert.yaml
schemaVersion: "2.2"
description: "Rotate TLS certificate across fleet"
parameters:
  CertArn:
    type: String
    description: "ACM cert ARN to deploy"
mainSteps:
  - action: aws:runShellScript
    name: downloadCert
    inputs:
      runCommand:
        - aws acm export-certificate --certificate-arn {{ CertArn }} --passphrase $(openssl rand -base64 32) > /tmp/cert.pem
  - action: aws:runShellScript
    name: deployCert
    inputs:
      runCommand:
        - cp /tmp/cert.pem /etc/ssl/certs/app.pem
        - systemctl reload nginx
        - echo "Certificate deployed at $(date)"
  - action: aws:runShellScript
    name: validate
    inputs:
      runCommand:
        - openssl x509 -in /etc/ssl/certs/app.pem -noout -enddate
```

### Patch Management with SSM Patch Manager

```bash
# Create patch baseline (what to patch)
aws ssm create-patch-baseline \
  --name "ProductionLinuxBaseline" \
  --operating-system "AMAZON_LINUX_2023" \
  --approval-rules '{
    "PatchRules": [{
      "PatchFilterGroup": {
        "PatchFilters": [
          {"Key": "CLASSIFICATION", "Values": ["Security", "Bugfix"]},
          {"Key": "SEVERITY", "Values": ["Critical", "Important"]}
        ]
      },
      "ApproveAfterDays": 7,
      "EnableNonSecurity": false
    }]
  }' \
  --rejected-patches "kernel*"  # Never auto-patch kernel

# Create maintenance window (when to patch)
aws ssm create-maintenance-window \
  --name "prod-patching-window" \
  --schedule "cron(0 2 ? * SUN *)"  \  # 2 AM every Sunday
  --duration 4 \                         # 4 hour window
  --cutoff 1 \                           # Stop scheduling 1hr before end
  --allow-unassociated-targets

# Register target (what to patch)
aws ssm register-target-with-maintenance-window \
  --window-id mw-0abc123 \
  --resource-type INSTANCE \
  --targets '[{"Key": "tag:patch-group", "Values": ["linux-prod-weekly"]}]'

# Register patch task
aws ssm register-task-with-maintenance-window \
  --window-id mw-0abc123 \
  --task-arn "AWS-RunPatchBaseline" \
  --task-type RUN_COMMAND \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --task-parameters '{"Operation": {"Values": ["Install"]}}'
```

**Patch compliance reporting:**

```bash
# How patched is the fleet?
aws ssm describe-instance-patch-states-for-patch-group \
  --patch-group "linux-prod-weekly" \
  --query "InstancePatchStates[*].[InstanceId,MissingCount,FailedCount,InstalledPendingRebootCount]" \
  --output table

# Find critical unpatched instances
aws ssm describe-instance-patch-states \
  --filters '[{
    "Key": "FailedCount",
    "Type": "GreaterThan",
    "Values": ["0"]
  }]' \
  --query "InstancePatchStates[*].[InstanceId,FailedCount,InstalledPendingRebootCount]"
```

---

## 7. OS Image Pipeline

### Full Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Image Pipeline (automated)                        │
│                                                                      │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐            │
│  │  Base   │──▶│ Harden  │──▶│  Deps   │──▶│  Test   │            │
│  │  Image  │   │  Layer  │   │  Layer  │   │  Suite  │            │
│  │(weekly) │   │(CIS+SEL)│   │(runtime)│   │(inspec) │            │
│  └─────────┘   └─────────┘   └─────────┘   └────┬────┘            │
│                                                   │ PASS            │
│                                          ┌────────▼────────┐        │
│                                          │  Golden AMI     │        │
│                                          │  (staging)      │        │
│                                          └────────┬────────┘        │
│                                                   │ integration test │
│                                          ┌────────▼────────┐        │
│                                          │  Golden AMI     │        │
│                                          │  (production)   │        │
│                                          └────────┬────────┘        │
│                                                   │                 │
│                                          ┌────────▼────────┐        │
│                                          │  Distributed to │        │
│                                          │  all regions    │        │
│                                          └─────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### EC2 Image Builder (AWS Native Pipeline)

```bash
# Define image recipe (layers to apply)
aws imagebuilder create-image-recipe \
  --name "checkout-api-recipe" \
  --semantic-version "1.0.0" \
  --parent-image "arn:aws:imagebuilder:us-east-1:aws:image/amazon-linux-2023-x86/x.x.x" \
  --block-device-mappings '[{
    "deviceName": "/dev/xvda",
    "ebs": {"volumeSize": 30, "volumeType": "gp3", "encrypted": true}
  }]' \
  --components '[
    {"componentArn": "arn:aws:imagebuilder:...:component/cis-hardening/1.0.0"},
    {"componentArn": "arn:aws:imagebuilder:...:component/datadog-agent/7.x.x"},
    {"componentArn": "arn:aws:imagebuilder:...:component/checkout-api-runtime/2.4.0"}
  ]'

# Create distribution (which regions to copy to)
aws imagebuilder create-distribution-configuration \
  --name "checkout-api-distribution" \
  --distributions '[
    {
      "region": "us-east-1",
      "amiDistributionConfiguration": {
        "name": "golden-checkout-api-{{ imagebuilder:buildDate }}",
        "description": "Production checkout API AMI",
        "amiTags": {"env": "prod", "managed-by": "imagebuilder"}
      }
    },
    {"region": "us-west-2", "amiDistributionConfiguration": {...}},
    {"region": "eu-west-1", "amiDistributionConfiguration": {...}}
  ]'

# Create pipeline (schedule + assemble)
aws imagebuilder create-image-pipeline \
  --name "checkout-api-pipeline" \
  --image-recipe-arn "arn:aws:imagebuilder:...:image-recipe/checkout-api-recipe/1.0.0" \
  --infrastructure-configuration-arn "arn:..." \
  --distribution-configuration-arn "arn:..." \
  --image-tests-configuration '{"imageTestsEnabled": true, "timeoutMinutes": 60}' \
  --schedule '{"scheduleExpression": "cron(0 0 * * 0)", "pipelineExecutionStartCondition": "EXPRESSION_MATCH_ONLY"}'
```

### Image Rotation and Retirement

```bash
#!/bin/bash
# scripts/rotate-amis.sh
# Keep last 3 golden AMIs, deprecate older ones

APP_NAME=$1
KEEP_COUNT=3

# List golden AMIs sorted by creation date (newest first)
AMIS=$(aws ec2 describe-images \
  --filters "Name=tag:app,Values=$APP_NAME" "Name=tag:managed-by,Values=imagebuilder" \
  --query "sort_by(Images, &CreationDate)[*].[ImageId,CreationDate,Name]" \
  --output text | tac)

TOTAL=$(echo "$AMIS" | wc -l)
RETIRE_COUNT=$((TOTAL - KEEP_COUNT))

if [ $RETIRE_COUNT -le 0 ]; then
  echo "Nothing to retire (only $TOTAL AMIs exist)"
  exit 0
fi

# Deprecate oldest AMIs
echo "$AMIS" | tail -n $RETIRE_COUNT | while read AMI_ID DATE NAME; do
  echo "Deprecating $AMI_ID ($NAME, created $DATE)"
  aws ec2 enable-image-deprecation \
    --image-id $AMI_ID \
    --deprecate-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Check if any ASGs still use this AMI
  IN_USE=$(aws autoscaling describe-auto-scaling-groups \
    --query "AutoScalingGroups[?contains(Instances[].ImageId, '$AMI_ID')].AutoScalingGroupName" \
    --output text)

  if [ -n "$IN_USE" ]; then
    echo "WARNING: AMI $AMI_ID still in use by ASG: $IN_USE"
    # Alert via SNS
    aws sns publish \
      --topic-arn arn:aws:sns:us-east-1:123456789:ops-alerts \
      --message "Deprecated AMI $AMI_ID still in use by $IN_USE"
  fi
done
```

---

## 8. Server Groups & Placement

### Availability Zone Distribution

```
Region: us-east-1
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   AZ: 1a     │  │   AZ: 1b     │  │   AZ: 1c     │ │
│  │              │  │              │  │              │ │
│  │  10 servers  │  │  10 servers  │  │  10 servers  │ │
│  │  checkout    │  │  checkout    │  │  checkout    │ │
│  │              │  │              │  │              │ │
│  │  5 servers   │  │  5 servers   │  │  5 servers   │ │
│  │  payments    │  │  payments    │  │  payments    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  Rule: Minimum 2 AZs always active.                     │
│  If 1 AZ fails, remaining 2 handle 100% traffic.        │
└─────────────────────────────────────────────────────────┘
```

**Enforce AZ balancing in Terraform:**

```hcl
resource "aws_autoscaling_group" "checkout_api" {
  name                = "checkout-api-prod"
  min_size            = 9   # Divisible by 3 AZs
  max_size            = 30
  desired_capacity    = 9

  vpc_zone_identifier = [
    aws_subnet.private_1a.id,
    aws_subnet.private_1b.id,
    aws_subnet.private_1c.id
  ]

  # Balance instances across AZs
  availability_zone_distribution {
    capacity_distribution_strategy = "balanced-best-effort"
  }
}
```

### Placement Groups

| Type      | Use Case                                  | Tradeoff                          |
|-----------|-------------------------------------------|-----------------------------------|
| Cluster   | HPC, ML training, low latency networking  | All in single AZ, no HA           |
| Spread    | Critical instances — must not fail together | Max 7 instances per AZ per group |
| Partition | Kafka, Cassandra, Hadoop — rack-aware     | Partition = separate physical rack|

```bash
# Cluster placement group: maximum network throughput
aws ec2 create-placement-group \
  --group-name "ml-training-cluster" \
  --strategy cluster

# Spread placement group: critical instances never share hardware
aws ec2 create-placement-group \
  --group-name "zookeeper-spread" \
  --strategy spread \
  --spread-level rack  # Or 'host' for dedicated hosts

# Partition placement group: Kafka brokers across racks
aws ec2 create-placement-group \
  --group-name "kafka-partitioned" \
  --strategy partition \
  --partition-count 3  # 3 racks

# Launch Kafka broker into specific partition
aws ec2 run-instances \
  --image-id ami-0abc123 \
  --instance-type r5.2xlarge \
  --placement '{
    "GroupName": "kafka-partitioned",
    "PartitionNumber": 1
  }'
```

### Partition Placement for Kafka

```
Partition Group: kafka-partitioned
┌──────────────────────────────────────────────────┐
│                                                  │
│  Partition 1      Partition 2      Partition 3  │
│  (Rack A)         (Rack B)         (Rack C)      │
│                                                  │
│  ┌──────────┐     ┌──────────┐    ┌──────────┐  │
│  │ broker-1 │     │ broker-2 │    │ broker-3 │  │
│  │ broker-4 │     │ broker-5 │    │ broker-6 │  │
│  └──────────┘     └──────────┘    └──────────┘  │
│                                                  │
│  Kafka RF=3: each partition replica on diff rack │
└──────────────────────────────────────────────────┘
```

---

## 9. Bare Metal vs VMs vs Containers Decision Matrix

```
                BARE METAL       VMs (EC2)        CONTAINERS
                ──────────       ─────────        ──────────
Performance     ████████████     ████████░░       ██████████
(CPU/mem)       No hypervisor    ~5% overhead     ~1% overhead

Isolation       ████████████     ████████████     ████████░░░
(security)      Physical         Hypervisor       Namespace/cgroup

Density         ████░░░░░░░░     ██████████░░     ████████████
(workloads/hw)  1 per server     10-50 per server 100s per server

Provisioning    ████░░░░░░░░     ████████░░░░     ████████████
Speed           Minutes-hours    30-90 seconds    1-10 seconds

Cost            ████████████     ██████████░░     ████████████
Efficiency      High fixed cost  Flexible/varied  Best at scale

Operational     ████░░░░░░░░     ████████░░░░     ██████████░░
Complexity      Very high        Moderate         High (orchestration)
```

**Decision guide:**

| Workload                              | Recommendation            | Reasoning                                    |
|---------------------------------------|---------------------------|----------------------------------------------|
| ML training (GPU-intensive)           | Bare metal / p4d.24xlarge | No hypervisor overhead on GPU ops            |
| High-frequency trading                | Bare metal                | Microsecond latency, no jitter               |
| Standard web services                 | EC2 + containers (ECS/EKS)| Cost efficiency, fast scaling                |
| Stateful databases (Postgres, MySQL)  | EC2 (large instances)     | Persistent storage, memory control           |
| Stateless microservices               | Containers on ECS/EKS     | Density, fast deploys, easy scaling          |
| Batch jobs                            | Spot containers (Fargate) | Cheapest, disposable                         |
| Legacy apps needing full OS           | EC2 VMs                   | Compatibility, can't containerize easily     |

---

## 10. Real-World Fleet Architecture: 3000-Server E-Commerce Platform

### Platform Overview

```
3000 instances across 3 regions (us-east-1, eu-west-1, ap-southeast-1)
Peak traffic: Black Friday — 10x normal load
Steady state: 1000 instances per region
```

### Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   Global Traffic Manager     │
                         │   (Route53 latency routing)  │
                         └──────┬──────────┬────────────┘
                                │          │
               ┌────────────────▼───┐  ┌───▼─────────────────┐
               │    us-east-1       │  │    eu-west-1         │
               │    400 instances   │  │    400 instances     │
               └────────┬───────────┘  └──────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          │             │              │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │  AZ: 1a   │ │  AZ: 1b   │ │  AZ: 1c   │
    │           │ │           │ │           │
    │ Tier:     │ │ Tier:     │ │ Tier:     │
    │  Web ×40  │ │  Web ×40  │ │  Web ×40  │
    │  API ×30  │ │  API ×30  │ │  API ×30  │
    │  Worker×10│ │  Worker×10│ │  Worker×10│
    │  Cache ×5 │ │  Cache ×5 │ │  Cache ×5 │
    └───────────┘ └───────────┘ └───────────┘

    Total per region: ~400 active instances
    Black Friday peak: ~1200 instances (3x via predictive scaling)
```

### ASG Configuration per Tier

| ASG Name              | Min | Desired | Max  | Instance Type     | Spot % |
|-----------------------|-----|---------|------|-------------------|--------|
| web-frontend-prod     | 30  | 120     | 600  | m5.large          | 70%    |
| checkout-api-prod     | 15  | 90      | 300  | m5.xlarge         | 50%    |
| inventory-api-prod    | 10  | 30      | 150  | m5.large          | 60%    |
| search-api-prod       | 6   | 24      | 60   | r5.2xlarge        | 40%    |
| order-worker-prod     | 5   | 30      | 200  | m5.large          | 80%    |
| session-cache-prod    | 3   | 9       | 9    | r6g.2xlarge       | 0%     |

Note: Session cache uses 0% spot — cache loss would degrade all users.

### Fleet Operations Runbook

```bash
#!/bin/bash
# daily-fleet-health.sh — Run every morning

echo "=== Fleet Health Report $(date) ==="

# 1. Instance counts by tier
for ASG in web-frontend-prod checkout-api-prod inventory-api-prod; do
  DESIRED=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names $ASG \
    --query "AutoScalingGroups[0].DesiredCapacity")
  HEALTHY=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names $ASG \
    --query "AutoScalingGroups[0].Instances[?HealthStatus=='Healthy'] | length(@)")
  echo "$ASG: $HEALTHY/$DESIRED healthy"
done

# 2. Patch compliance
aws ssm describe-patch-group-state \
  --patch-group "linux-prod-weekly" \
  --query "Instances | {Total: length(@), Patched: length([?PatchComplianceStatus=='COMPLIANT'])}"

# 3. AMI age check (alert if golden AMI > 30 days old)
AMI_AGE=$(aws ec2 describe-images \
  --filters "Name=tag:app,Values=checkout-api" "Name=tag:env,Values=prod" \
  --query "sort_by(Images, &CreationDate)[-1].CreationDate" \
  --output text)
echo "Latest golden AMI created: $AMI_AGE"

# 4. Spot interruption risk
aws ec2 describe-spot-instance-requests \
  --filters "Name=state,Values=active" \
  --query "SpotInstanceRequests[*].[InstanceId,Status.Code,LaunchSpecification.InstanceType]" \
  --output table
```

### Incident Response: 100 Instances Suddenly Unhealthy

```
TIMELINE:
T+0:00  Alarm fires: checkout-api ELB 5xx > 5%
T+0:02  On-call receives PagerDuty alert
T+0:03  Check ASG status

$ aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names checkout-api-prod \
    --query "AutoScalingGroups[0].{Desired:DesiredCapacity,Healthy:Instances[?HealthStatus=='Healthy']|length(@),Unhealthy:Instances[?HealthStatus=='Unhealthy']|length(@)}"

Output: {Desired: 90, Healthy: 45, Unhealthy: 45}

T+0:05  Check recent ASG activities
$ aws autoscaling describe-scaling-activities \
    --auto-scaling-group-name checkout-api-prod \
    --max-items 10

T+0:07  Hypothesis: bad AMI deployment
        Check which AMI unhealthy instances are running

$ aws ec2 describe-instances \
    --filters "Name=tag:app,Values=checkout-api" \
    --query "Reservations[].Instances[*].[InstanceId,ImageId,State.Name]" \
    --output text | sort -k2

T+0:08  Confirm: unhealthy instances all running ami-0bad123 (new)
        Healthy instances running ami-0good456 (previous)

T+0:09  ROLLBACK: Update launch template to previous version
$ aws ec2 modify-launch-template \
    --launch-template-name checkout-api-prod \
    --default-version 3  # Previous good version

T+0:10  Terminate unhealthy instances (ASG will replace with old AMI)
$ aws autoscaling set-instance-health \
    --instance-id i-0bad001 \
    --health-status Unhealthy

T+0:15  ASG replaces instances with previous AMI
T+0:20  Error rate returns to baseline
T+0:25  Post-incident review scheduled
```

### Black Friday Pre-Scaling Runbook

```bash
#!/bin/bash
# pre-scale-black-friday.sh

echo "Pre-scaling fleet for Black Friday..."

# Scale ASGs to Black Friday capacity 2 hours before
declare -A ASG_TARGETS=(
  ["web-frontend-prod"]=400
  ["checkout-api-prod"]=250
  ["inventory-api-prod"]=100
  ["search-api-prod"]=60
  ["order-worker-prod"]=150
)

for ASG in "${!ASG_TARGETS[@]}"; do
  TARGET=${ASG_TARGETS[$ASG]}
  echo "Scaling $ASG to $TARGET..."
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name $ASG \
    --desired-capacity $TARGET
done

# Verify all instances healthy before traffic surge
echo "Waiting for instances to become healthy..."
for ASG in "${!ASG_TARGETS[@]}"; do
  while true; do
    HEALTHY=$(aws autoscaling describe-auto-scaling-groups \
      --auto-scaling-group-names $ASG \
      --query "AutoScalingGroups[0].Instances[?HealthStatus=='Healthy'] | length(@)")
    TARGET=${ASG_TARGETS[$ASG]}
    echo "$ASG: $HEALTHY/$TARGET healthy"
    [ "$HEALTHY" -ge "$TARGET" ] && break
    sleep 30
  done
done

echo "Fleet pre-scaled and healthy. Ready for Black Friday."
```

---

## Quick Reference: Key Commands

```bash
# --- Fleet Status ---
# All running instances with tags
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[*].[InstanceId,InstanceType,Tags[?Key=='app'].Value|[0],Tags[?Key=='env'].Value|[0]]" \
  --output table

# ASG health summary
aws autoscaling describe-auto-scaling-groups \
  --query "AutoScalingGroups[*].{Name:AutoScalingGroupName,Min:MinSize,Desired:DesiredCapacity,Max:MaxSize,Healthy:Instances[?HealthStatus=='Healthy']|length(@)}" \
  --output table

# --- AMI Operations ---
# Find latest golden AMI for an app
aws ec2 describe-images \
  --filters "Name=tag:app,Values=checkout-api" "Name=is-public,Values=false" \
  --query "sort_by(Images, &CreationDate)[-1].[ImageId,CreationDate,Name]" \
  --output text

# --- SSM Operations ---
# Count managed vs unmanaged instances
aws ssm describe-instance-information \
  --query "length(InstanceInformationList)"

# Run command and wait for results
COMMAND_ID=$(aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets '[{"Key":"tag:env","Values":["prod"]}]' \
  --parameters '{"commands":["uptime"]}' \
  --query "Command.CommandId" --output text)

aws ssm list-command-invocations --command-id $COMMAND_ID --details \
  --query "CommandInvocations[*].[InstanceId,Status,CommandPlugins[0].Output]" \
  --output table

# --- Scaling Operations ---
# Trigger immediate scale-out
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name checkout-api-prod \
  --desired-capacity 50 \
  --honor-cooldown

# Suspend scale-in during maintenance
aws autoscaling suspend-processes \
  --auto-scaling-group-name checkout-api-prod \
  --scaling-processes Terminate

# Resume after maintenance
aws autoscaling resume-processes \
  --auto-scaling-group-name checkout-api-prod \
  --scaling-processes Terminate
```

---

## Summary: Fleet Management Principles

| Principle                     | Implementation                                           |
|-------------------------------|----------------------------------------------------------|
| Every server is tagged        | Enforce with AWS Config rules and IAM SCPs               |
| Images are immutable          | Golden AMIs via Packer/Image Builder, never patch in-place|
| State is in launch templates  | Version controlled, rollback is changing default version |
| Scale horizontally            | ASGs with mixed instances, target tracking policies      |
| Patch via image replacement   | New AMI + rolling ASG update instead of SSM patching     |
| Audit everything              | SSM Inventory + Athena for fleet-wide queries            |
| Graceful shutdown everywhere  | Lifecycle hooks + SIGTERM handlers in every service      |
| Spread across AZs             | Min 2 AZs, ideally 3, capacity divisible by AZ count     |
| Spot for stateless, on-demand for stateful | Session stores, DBs never on spot       |
| Automate runbooks             | SSM Documents replace manual SSH runbooks                |
