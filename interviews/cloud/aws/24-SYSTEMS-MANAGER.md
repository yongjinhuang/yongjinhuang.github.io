# AWS Systems Manager

Systems Manager (SSM) is the operational hub for managing your AWS infrastructure. It bundles dozens of capabilities under one roof: storing configuration as parameters, running commands on fleets of instances without SSH, patching OS vulnerabilities, managing sessions, and automating operational runbooks. If you have EC2 instances, on-premises servers, or even edge devices, SSM is how you manage them at scale without opening inbound ports or maintaining bastion hosts.

---

## 1. Core Capabilities Overview

| Capability | What It Does | Key Use Case |
|-----------|-------------|-------------|
| **Parameter Store** | Hierarchical key-value storage | App config, connection strings, feature flags |
| **Session Manager** | Browser/CLI shell access to instances | Replace SSH and bastion hosts |
| **Run Command** | Execute commands on instance fleets | Run scripts across 1000 servers |
| **Patch Manager** | Automated OS patching | Monthly security patches |
| **State Manager** | Desired state configuration | Ensure agents are always installed |
| **Automation** | Multi-step operational runbooks | Restart service, snapshot, resize |
| **Inventory** | Collect software/hardware metadata | Audit installed packages |
| **OpsCenter** | Aggregate and resolve operational issues | Centralized incident tracking |

---

## 2. SSM Agent

The SSM Agent is the daemon that runs on managed instances and communicates with the Systems Manager service. Without it, nothing works.

- **Pre-installed** on Amazon Linux, Amazon Linux 2, Amazon Linux 2023, and some Ubuntu AMIs
- **Must be manually installed** on other AMIs (RHEL, CentOS, Windows, custom images)
- Communicates outbound to SSM endpoints (no inbound ports needed)
- Requires an **IAM instance profile** with `AmazonSSMManagedInstanceCore` policy

```bash
# Check if SSM agent is running
sudo systemctl status amazon-ssm-agent

# Install on Amazon Linux 2 / RHEL (if not present)
sudo yum install -y amazon-ssm-agent
sudo systemctl enable amazon-ssm-agent
sudo systemctl start amazon-ssm-agent

# Verify instance is registered with SSM
aws ssm describe-instance-information \
  --filters Key=InstanceIds,Values=i-0abc123def456
```

**Connectivity requirements:** The instance needs outbound HTTPS (443) access to these endpoints (or use VPC endpoints):
- `ssm.<region>.amazonaws.com`
- `ssmmessages.<region>.amazonaws.com` (Session Manager)
- `ec2messages.<region>.amazonaws.com` (Run Command)

---

## 3. Parameter Store

A hierarchical key-value store for configuration data, secrets, and feature flags. Parameters are organized in a path hierarchy like a filesystem.

### 3.1 Parameter Types

| Type | Use Case | Encryption |
|------|----------|-----------|
| **String** | Plain text values | No |
| **StringList** | Comma-separated values | No |
| **SecureString** | Sensitive data (passwords, API keys) | KMS encrypted |

### 3.2 Standard vs Advanced Tiers

| Feature | Standard | Advanced |
|---------|----------|----------|
| **Max parameters** | 10,000 | 100,000 |
| **Max value size** | 4 KB | 8 KB |
| **Parameter policies** | No | Yes (expiration, notification) |
| **Throughput** | 40 TPS default (adjustable to 1000) | 1000 TPS default |
| **Cost** | Free | $0.05 per parameter per month |

### 3.3 Common Operations

```bash
# Store a plain text parameter
aws ssm put-parameter \
  --name "/myapp/prod/db-host" \
  --value "prod-db.cluster-xyz.us-east-1.rds.amazonaws.com" \
  --type String

# Store a secret (encrypted with default KMS key)
aws ssm put-parameter \
  --name "/myapp/prod/db-password" \
  --value "s3cur3P@ssw0rd" \
  --type SecureString

# Store with a custom KMS key
aws ssm put-parameter \
  --name "/myapp/prod/api-key" \
  --value "sk-abc123" \
  --type SecureString \
  --key-id alias/my-app-key

# Retrieve a parameter
aws ssm get-parameter --name "/myapp/prod/db-host"

# Retrieve and decrypt a SecureString
aws ssm get-parameter --name "/myapp/prod/db-password" --with-decryption

# Get all parameters under a path
aws ssm get-parameters-by-path \
  --path "/myapp/prod" \
  --recursive \
  --with-decryption

# Update a parameter (creates a new version)
aws ssm put-parameter \
  --name "/myapp/prod/db-host" \
  --value "new-host.rds.amazonaws.com" \
  --type String \
  --overwrite

# Get parameter history (versions)
aws ssm get-parameter-history --name "/myapp/prod/db-host"

# Delete a parameter
aws ssm delete-parameter --name "/myapp/prod/old-key"
```

### 3.4 Parameter Store vs Secrets Manager

| Feature | Parameter Store | Secrets Manager |
|---------|----------------|-----------------|
| **Cost** | Free (Standard) | $0.40/secret/month + API calls |
| **Rotation** | Manual only | Built-in automatic rotation (Lambda) |
| **Cross-account sharing** | Via RAM or IAM policies | Native cross-account |
| **Max size** | 4 KB (Standard) / 8 KB (Advanced) | 64 KB |
| **RDS integration** | Manual | Native rotation for RDS, Redshift, DocumentDB |
| **Versioning** | Yes | Yes |
| **Audit** | CloudTrail | CloudTrail |

**Decision rule:** Use Parameter Store for app config and non-rotating secrets. Use Secrets Manager when you need automatic rotation, especially for database credentials.

---

## 4. Session Manager

Session Manager provides shell access to EC2 instances without SSH keys, open inbound ports, or bastion hosts. Sessions are logged and auditable.

### 4.1 Key Benefits

- No port 22 open in security groups
- No SSH key management
- All sessions logged to CloudWatch Logs or S3
- IAM-based access control (who can start sessions to which instances)
- Browser-based console or CLI access
- Port forwarding support

```bash
# Start a session to an instance
aws ssm start-session --target i-0abc123def456

# Start a session with port forwarding (access RDS through EC2)
aws ssm start-session \
  --target i-0abc123def456 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["mydb.cluster-xyz.us-east-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# Port forwarding to the instance itself
aws ssm start-session \
  --target i-0abc123def456 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8080"],"localPortNumber":["8080"]}'
```

### 4.2 Session Logging

Configure in the Session Manager preferences (console or API):

```json
{
  "s3BucketName": "my-session-logs",
  "s3KeyPrefix": "ssm-sessions",
  "cloudWatchLogGroupName": "/aws/ssm/sessions",
  "cloudWatchEncryptionEnabled": true
}
```

---

## 5. Run Command

Execute commands or scripts across a fleet of instances simultaneously. No SSH required.

```bash
# Run a shell command on specific instances
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets Key=instanceids,Values=i-0abc123,i-0def456 \
  --parameters 'commands=["sudo systemctl restart nginx","curl -s http://localhost/health"]'

# Run on all instances with a specific tag
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets Key=tag:Environment,Values=production \
  --parameters 'commands=["df -h"]' \
  --comment "Check disk usage across prod fleet"

# Check command status
aws ssm list-command-invocations \
  --command-id "cmd-abc123" \
  --details

# Get command output for a specific instance
aws ssm get-command-invocation \
  --command-id "cmd-abc123" \
  --instance-id "i-0abc123"
```

**Rate controls:** Set `MaxConcurrency` (e.g., "10" or "25%") and `MaxErrors` (e.g., "5" or "10%") to prevent fleet-wide failures.

---

## 6. Patch Manager

Automate OS patching across your fleet using patch baselines and maintenance windows.

### 6.1 Patch Baselines

A patch baseline defines which patches to approve and when. AWS provides default baselines per OS, or you create custom ones.

```bash
# List default patch baselines
aws ssm describe-patch-baselines \
  --filters Key=OWNER,Values=AWS

# Create a custom patch baseline
aws ssm create-patch-baseline \
  --name "MyLinuxBaseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{
    "PatchRules": [{
      "PatchFilterGroup": {
        "PatchFilters": [
          {"Key": "SEVERITY", "Values": ["Critical", "Important"]},
          {"Key": "CLASSIFICATION", "Values": ["Security"]}
        ]
      },
      "ApproveAfterDays": 7
    }]
  }'
```

### 6.2 Maintenance Windows

Schedule recurring patching windows:

```bash
# Create a maintenance window
aws ssm create-maintenance-window \
  --name "ProdPatchWindow" \
  --schedule "cron(0 2 ? * SUN *)" \
  --duration 4 \
  --cutoff 1 \
  --allow-unassociated-targets

# Register targets
aws ssm register-target-with-maintenance-window \
  --window-id mw-abc123 \
  --resource-type INSTANCE \
  --targets Key=tag:PatchGroup,Values=production
```

---

## 7. State Manager and Automation

### 7.1 State Manager

Ensures instances maintain a desired configuration. Define an association between a document and targets, and SSM enforces it on a schedule.

```bash
# Ensure CloudWatch agent is always installed and running
aws ssm create-association \
  --name "AWS-ConfigureAWSPackage" \
  --targets Key=tag:Environment,Values=production \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(1 day)"
```

### 7.2 Automation

Run multi-step operational runbooks. AWS provides pre-built runbooks, or you create custom ones.

```bash
# Restart an instance with automation
aws ssm start-automation-execution \
  --document-name "AWS-RestartEC2Instance" \
  --parameters '{"InstanceId":["i-0abc123"]}'

# Create a golden AMI with automation
aws ssm start-automation-execution \
  --document-name "AWS-CreateImage" \
  --parameters '{"InstanceId":["i-0abc123"],"NoReboot":["true"]}'

# Check automation status
aws ssm describe-automation-executions \
  --filters Key=ExecutionId,Values=exec-abc123
```

---

## 8. Inventory

Collect metadata from managed instances: installed applications, OS version, network config, Windows updates, custom inventory.

```bash
# Set up inventory collection
aws ssm create-association \
  --name "AWS-GatherSoftwareInventory" \
  --targets Key=tag:Environment,Values=production \
  --schedule-expression "rate(12 hours)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "networkConfig":["Enabled"]
  }'

# Query inventory data
aws ssm get-inventory \
  --filters Key=TypeName,Values=AWS:Application
```

Inventory data can be synced to S3 and queried with Athena for fleet-wide auditing.

---

## 9. Common Gotchas

| Gotcha | Details |
|--------|---------|
| **SSM Agent version matters** | Older agents lack features like Session Manager port forwarding. Keep agents updated. |
| **IAM instance profile required** | No instance profile = instance does not appear in SSM. Attach `AmazonSSMManagedInstanceCore`. |
| **Parameter Store 4 KB limit** | Standard parameters max at 4 KB. Use Advanced tier (8 KB) or store large configs in S3 and reference them. |
| **Rate limits on API calls** | `GetParameter` has a default 40 TPS limit (Standard tier). Cache parameters in your app. |
| **VPC endpoints needed in private subnets** | Instances without internet access need VPC endpoints for `ssm`, `ssmmessages`, and `ec2messages`. |
| **SecureString and CloudFormation** | CloudFormation cannot create `SecureString` parameters. Create them via CLI/SDK, then reference in templates. |
| **Run Command output truncation** | Command output over 48,000 characters is truncated. Send output to S3 for full logs. |
| **Maintenance window timezone** | Maintenance windows use UTC by default. Specify `--schedule-timezone` to avoid surprises. |
| **Hybrid activation** | On-premises servers need a hybrid activation (managed instance ID starts with `mi-`, not `i-`). |
