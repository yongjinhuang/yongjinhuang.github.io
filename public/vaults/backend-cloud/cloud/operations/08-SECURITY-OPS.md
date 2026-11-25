# Security Operations — Patching, Compliance, Hardening at Scale

> **Audience**: Senior/Staff Cloud Operations Engineers
> **Focus**: Day-2 security operations, not architecture design
> **Scope**: Running security at scale across thousands of hosts

---

## 1. Patch Management at Scale

### The Fundamental Challenge

Patching 5000+ hosts requires coordination, rollback capability, and zero-downtime strategies. Ad-hoc patching is operationally unsustainable.

```
PATCH MANAGEMENT LIFECYCLE
───────────────────────────────────────────────────────────────
   CVE Published          Patch Released         Patch Deployed
        │                      │                      │
   [Detection]          [Staging Test]           [Production]
        │                      │                      │
   Vulnerability          Baseline Verify        Rolling Deploy
   Scan Trigger           (24-48h soak)          with Rollback
        │                      │                      │
   Criticality            Smoke Tests            Health Checks
   Assessment             Pass/Fail Gate         Post-Deploy Scan
───────────────────────────────────────────────────────────────
     Day 0              Day 1-2                  Day 3-14+
```

### AWS SSM Patch Manager at Scale

```bash
# Create a patch baseline for Amazon Linux 2
aws ssm create-patch-baseline \
  --name "AmazonLinux2-CriticalAndImportant" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{"PatchRules":[{"PatchFilterGroup":{"PatchFilters":[{"Key":"CLASSIFICATION","Values":["Security","Bugfix"]},{"Key":"SEVERITY","Values":["Critical","Important"]}]},"ApproveAfterDays":7}]}' \
  --approved-patches-compliance-level CRITICAL \
  --description "Baseline for production AL2 servers"

# Register a patch group (tag instances with Patch Group = prod-app-servers)
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id pb-0c12345678abcdef0 \
  --patch-group "prod-app-servers"

# Create a maintenance window (Sunday 02:00-06:00 UTC)
aws ssm create-maintenance-window \
  --name "prod-patch-sunday-night" \
  --schedule "cron(0 2 ? * SUN *)" \
  --duration 4 \
  --cutoff 1 \
  --allow-unassociated-targets false

# Register a patch task on that window
aws ssm register-task-with-maintenance-window \
  --window-id mw-0a1b2c3d4e5f67890 \
  --targets "Key=WindowTargetIds,Values=<target-id>" \
  --task-arn "arn:aws:ssm:us-east-1::document/AWS-RunPatchBaseline" \
  --service-role-arn "arn:aws:iam::123456789:role/MaintenanceWindowRole" \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"],"RebootOption":["RebootIfNeeded"]}}}' \
  --max-concurrency "20%" \
  --max-errors "10%"
```

### Rolling Patch Strategy Across 5000 Hosts

```
ROLLING PATCH WAVE STRATEGY
─────────────────────────────────────────────────────
Wave 1: Canary (50 hosts)        ── 5% of fleet
   │  Soak: 24 hours
   │  Gate: Error rate < 0.1%, latency < +5%
   ▼
Wave 2: Early Adopters (500 hosts)── 10% of fleet
   │  Soak: 24 hours
   │  Gate: Same metrics + synthetic monitor pass
   ▼
Wave 3: Majority (2000 hosts)    ── 40% of fleet
   │  Soak: 12 hours
   │  Gate: Auto-proceed if gates pass
   ▼
Wave 4: Remaining (2450 hosts)   ── ~49% of fleet
   │  Concurrent with operational monitoring
   ▼
Wave 5: Stragglers (manual)      ── Exceptions, skip-listed
─────────────────────────────────────────────────────
Total elapsed: ~3-4 days for full fleet coverage
```

```bash
# Parallel patching with Ansible for non-SSM hosts
# inventory/patch_wave1.ini — 50 hosts
ansible-playbook patch.yml \
  -i inventory/patch_wave1.ini \
  --forks 10 \
  -e "patch_reboot=true" \
  --limit @/tmp/wave1_hosts.txt

# patch.yml — with pre/post validation
- hosts: all
  serial: "20%"   # Patches 20% of hosts concurrently
  tasks:
    - name: Check host health before patching
      uri:
        url: "http://{{ ansible_host }}:8080/health"
        status_code: 200
      delegate_to: localhost

    - name: Apply security patches (yum)
      yum:
        name: "*"
        security: yes
        state: latest
      register: yum_output

    - name: Reboot if packages updated
      reboot:
        reboot_timeout: 300
      when: yum_output.changed

    - name: Verify health post-reboot
      uri:
        url: "http://{{ ansible_host }}:8080/health"
        status_code: 200
      retries: 10
      delay: 15
      delegate_to: localhost
```

### Reboot Strategies

| Strategy                | Use Case                     | Risk                              | Command                              |
| ----------------------- | ---------------------------- | --------------------------------- | ------------------------------------ |
| `RebootIfNeeded`        | Standard patching            | Low                               | SSM default option                   |
| `NoReboot`              | Kernel patches only deferred | Medium — kernel vuln still active | `--parameters RebootOption=NoReboot` |
| Scheduled Reboot Window | DB servers, stateful         | Low with coordination             | Separate maintenance window          |
| Live Patching (kpatch)  | Zero-downtime kernel         | Subscription needed               | `kpatch load /var/cache/kpatch/`     |
| AMI rotation            | Immutable infra              | Requires ASG                      | Replace ASG launch template          |

```bash
# Live kernel patching (Amazon Linux 2 with kpatch)
sudo amazon-linux-extras enable livepatch
sudo yum install kpatch-runtime kpatch-dnf
sudo systemctl enable --now kpatch

# Check applied patches
kpatch list
```

---

## 2. Vulnerability Scanning

### Scanning Architecture

```
VULNERABILITY SCANNING PIPELINE
────────────────────────────────────────────────────────────────
 Source Code    Container Image    Running Host    Cloud Config
     │               │                 │               │
  [Semgrep]      [Trivy/Grype]    [Qualys/Tenable] [Scout/Prowler]
     │               │                 │               │
     └───────────────┴─────────────────┴───────────────┘
                              │
                    [Vulnerability Database]
                    (NVD, CVE, OSV, EPSS)
                              │
                    [Aggregation / Dedup]
                              │
                    [Prioritization Engine]
                   CVSS Score + EPSS Score
                   + Asset Criticality
                              │
                    [Ticketing / JIRA / PagerDuty]
────────────────────────────────────────────────────────────────
```

### Trivy for Container Image Scanning

```bash
# Install Trivy
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Scan a container image
trivy image --severity HIGH,CRITICAL nginx:1.25.0

# Scan with JSON output for CI/CD
trivy image \
  --format json \
  --output trivy-report.json \
  --exit-code 1 \
  --severity CRITICAL \
  myapp:latest

# Scan a local filesystem (useful in build pipelines)
trivy fs --security-checks vuln,config /app

# Scan IaC (Terraform, CloudFormation)
trivy config --severity HIGH,CRITICAL ./infra/

# Generate SBOM (Software Bill of Materials)
trivy image --format cyclonedx --output sbom.json myapp:latest
```

### CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [push, pull_request]

jobs:
  trivy-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t myapp:${{ github.sha }} .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH
          exit-code: 1

      - name: Upload SARIF to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: trivy-results.sarif
```

### Vulnerability Prioritization: CVSS vs EPSS

```
PRIORITIZATION MATRIX
─────────────────────────────────────────────────────
          │  EPSS Low (<1%)  │  EPSS High (>10%)
──────────┼──────────────────┼──────────────────────
CVSS 9-10 │  Patch in 30d    │  PATCH IMMEDIATELY
          │  (Critical but   │  (Active exploitation
          │  no exploit yet) │   likely in 30 days)
──────────┼──────────────────┼──────────────────────
CVSS 7-8  │  Patch in 90d    │  Patch in 14d
          │  Standard SLA    │  (Likely exploited)
──────────┼──────────────────┼──────────────────────
CVSS 4-6  │  Patch quarterly │  Patch in 30d
          │  or next cycle   │
──────────┼──────────────────┼──────────────────────
CVSS 0-3  │  Accept risk /   │  Patch in 90d
          │  informational   │
─────────────────────────────────────────────────────

EPSS = Exploit Prediction Scoring System (0-100%)
     = Probability of exploitation in 30 days
CVSS = Common Vulnerability Scoring System (0-10)
     = Severity of impact IF exploited
```

```bash
# Query EPSS score for a CVE
curl -s "https://api.first.org/data/v1/epss?cve=CVE-2024-1234" | jq '.data[0].epss'

# Qualys: trigger authenticated scan via API
curl -X POST "https://qualysapi.qualys.com/api/2.0/fo/scan/" \
  -H "X-Requested-With: curl" \
  -u "user:pass" \
  -d "action=launch&scan_title=Weekly+Prod&ip=10.0.0.0/16&option_id=12345"
```

---

## 3. Compliance as Code

### AWS Config Rules

```bash
# Enable AWS Config recording
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::123:role/ConfigRole \
  --recording-group allSupported=true,includeGlobalResourceTypes=true

# Deploy managed rule: ensure S3 buckets are not public
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "s3-bucket-public-read-prohibited",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "S3_BUCKET_PUBLIC_READ_PROHIBITED"
  },
  "Scope": {"ComplianceResourceTypes": ["AWS::S3::Bucket"]}
}'

# Custom Config rule with Lambda
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "require-imdsv2",
  "Source": {
    "Owner": "CUSTOM_LAMBDA",
    "SourceIdentifier": "arn:aws:lambda:us-east-1:123:function:check-imdsv2",
    "SourceDetails": [{"EventSource":"aws.config","MessageType":"ConfigurationItemChangeNotification"}]
  }
}'
```

### Open Policy Agent (OPA) for Infrastructure

```rego
# policies/deny_public_s3.rego
package terraform.s3

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket_acl"
  resource.change.after.acl == "public-read"
  msg := sprintf("S3 bucket '%s' must not have public-read ACL", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket"
  not resource.change.after.server_side_encryption_configuration
  msg := sprintf("S3 bucket '%s' must have server-side encryption enabled", [resource.address])
}
```

```bash
# Run OPA against Terraform plan
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json
opa eval --data policies/ --input tfplan.json "data.terraform.s3.deny"

# Conftest wrapper (Terraform + OPA)
conftest test tfplan.json --policy policies/ --namespace terraform
```

### CIS Benchmark Automation

```bash
# CIS-CAT Lite (free) — run CIS benchmark assessment
./CIS-CAT.sh -b benchmarks/CIS_Amazon_Linux_2_Benchmark_v2.0.0.xml \
  -r reports/ \
  -o html,csv

# InSpec for CIS Amazon Linux 2
gem install inspec
inspec exec https://github.com/dev-sec/linux-baseline \
  -t ssh://ec2-user@10.0.1.50 \
  -i ~/.ssh/prod.pem \
  --reporter cli json:/tmp/cis-report.json

# Parse results
jq '.profiles[0].controls[] | select(.status=="failed") | .id, .title' /tmp/cis-report.json
```

### SOC2 / PCI Drift Detection

```bash
# AWS Security Hub — enable CIS AWS Foundations standard
aws securityhub enable-standards \
  --standards-subscription-requests '[
    {"StandardsArn":"arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.4.0"},
    {"StandardsArn":"arn:aws:securityhub:::standards/pci-dss/v/3.2.1"}
  ]'

# Query failing controls
aws securityhub get-findings \
  --filters '{"ComplianceStatus":[{"Value":"FAILED","Comparison":"EQUALS"}],"RecordState":[{"Value":"ACTIVE","Comparison":"EQUALS"}]}' \
  --max-results 100 | jq '.Findings[] | {id:.Id, title:.Title, severity:.Severity.Label}'

# Prowler — open-source AWS security assessments
pip install prowler
prowler aws --compliance cis_aws_2.0 --output-formats json-asff
```

---

## 4. Server Hardening

### CIS Hardened AMI with Packer

```json
// packer/hardened-al2.pkr.hcl
source "amazon-ebs" "al2-hardened" {
  ami_name      = "cis-hardened-al2-{{timestamp}}"
  instance_type = "t3.medium"
  source_ami_filter {
    filters = { name = "amzn2-ami-hvm-*-x86_64-gp2" }
    owners  = ["137112412989"]
    most_recent = true
  }
  ssh_username = "ec2-user"
}

build {
  sources = ["source.amazon-ebs.al2-hardened"]

  provisioner "ansible" {
    playbook_file = "ansible/cis-hardening.yml"
    extra_arguments = ["--tags", "cis_level1"]
  }

  provisioner "shell" {
    script = "scripts/final-cleanup.sh"
  }
}
```

### SSH Hardening

```bash
# /etc/ssh/sshd_config — hardened settings
cat >> /etc/ssh/sshd_config << 'EOF'
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
MaxAuthTries 3
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 0
LoginGraceTime 60
Banner /etc/issue.net
AllowGroups ssh-users
Ciphers aes256-gcm@openssh.com,chacha20-poly1305@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512
EOF

systemctl reload sshd
```

### File Integrity Monitoring with AIDE

```bash
# Install AIDE (Advanced Intrusion Detection Environment)
yum install aide -y

# Initialize the database
aide --init
mv /var/lib/aide/aide.db.new.gz /var/lib/aide/aide.db.gz

# Run a check (detect changes)
aide --check

# Cron job for daily FIM check with alerting
cat > /etc/cron.daily/aide-check << 'EOF'
#!/bin/bash
REPORT=$(aide --check 2>&1)
if echo "$REPORT" | grep -q "^[0-9]* file(s) changed"; then
  echo "$REPORT" | mail -s "AIDE: File integrity change detected on $(hostname)" security@company.com
fi
EOF
chmod +x /etc/cron.daily/aide-check
```

### auditd for System Call Auditing

```bash
# /etc/audit/rules.d/hardening.rules
# Monitor privileged command execution
-a always,exit -F arch=b64 -S execve -F euid=0 -k root_commands
# Monitor /etc/passwd and shadow changes
-w /etc/passwd -p wa -k identity_change
-w /etc/shadow -p wa -k identity_change
-w /etc/sudoers -p wa -k sudoers_change
# Monitor SSH keys
-w /root/.ssh -p wa -k ssh_key_change
# Monitor kernel module loading
-a always,exit -F arch=b64 -S init_module -S delete_module -k kernel_modules
# Network configuration changes
-a always,exit -F arch=b64 -S sethostname -S setdomainname -k network_mods
# Monitor Docker socket
-w /var/run/docker.sock -p rwxa -k docker_socket

# Load rules
augenrules --load
auditctl -l  # List active rules

# Search audit logs
ausearch -k identity_change --start today | aureport -f -i
```

---

## 5. Secrets Management Operations

### Vault Cluster at Scale

```
VAULT HIGH-AVAILABILITY TOPOLOGY
────────────────────────────────────────────────────
 Region: us-east-1            Region: us-west-2
 ┌─────────────────────┐      ┌─────────────────────┐
 │  Vault Cluster      │      │  Vault Cluster      │
 │  ┌─────┐ ┌─────┐   │      │  ┌─────┐ ┌─────┐   │
 │  │Vault│ │Vault│   │◄────►│  │Vault│ │Vault│   │
 │  │Active│ │Standby│ │      │  │Perf  │ │Replica│ │
 │  └─────┘ └─────┘   │      │  └─────┘ └─────┘   │
 │  Storage: DynamoDB  │      │  Storage: DynamoDB  │
 │  + S3 (HA backend)  │      │  (Read Replica)     │
 └─────────────────────┘      └─────────────────────┘
         │
   [Vault Agent]    ← Sidecar on every app pod
   - Auto-auth
   - Secret caching
   - Lease renewal
────────────────────────────────────────────────────
```

```bash
# Configure AWS Auth Method for EC2/ECS
vault auth enable aws
vault write auth/aws/config/client \
  iam_server_id_header_value="vault.company.com"

vault write auth/aws/role/prod-app-server \
  auth_type=iam \
  bound_iam_principal_arn="arn:aws:iam::123:role/ProdAppRole" \
  policies=prod-app \
  ttl=1h

# Dynamic DB credentials (short-lived, rotated automatically)
vault secrets enable database
vault write database/config/prod-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="app-role" \
  connection_url="postgresql://{{username}}:{{password}}@db.internal:5432/prod" \
  username="vault_root" \
  password="initial_password"

vault write database/roles/app-role \
  db_name=prod-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT app_role TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Retrieve dynamic credentials
vault read database/creds/app-role
# Key         Value
# username    v-app-AbCdEfGh
# password    A1B2-C3D4-...
# lease_duration  1h
```

### Secret Rotation Automation

```bash
# Rotate a static secret and notify dependent services
vault kv put secret/prod/db-password password=$(openssl rand -base64 32)

# Vault agent template — auto-refresh secrets on disk
# /etc/vault-agent/config.hcl
auto_auth {
  method "aws" {
    config = { role = "prod-app-server" }
  }
}
template {
  source      = "/etc/vault-agent/templates/db.ctmpl"
  destination = "/run/secrets/db-password"
  perms       = "0640"
  command     = "systemctl reload app"   # Reload app after secret changes
}

# /etc/vault-agent/templates/db.ctmpl
{{- with secret "secret/prod/db-password" -}}
{{ .Data.data.password }}
{{- end }}
```

### Emergency Break-Glass Procedure

```bash
# Unseal Vault if sealed (requires 3 of 5 key shares — Shamir Secret Sharing)
vault operator unseal <key-share-1>
vault operator unseal <key-share-2>
vault operator unseal <key-share-3>

# Break-glass: generate a root token (requires 3 key shares)
vault operator generate-root -init
# Save the OTP provided, then submit shares:
vault operator generate-root -nonce=<nonce> <key-share-1>
vault operator generate-root -nonce=<nonce> <key-share-2>
vault operator generate-root -nonce=<nonce> <key-share-3>
# Decode the encoded root token:
vault operator generate-root -decode=<encoded-token> -otp=<otp>

# IMPORTANT: Revoke break-glass token after use
VAULT_TOKEN=<break-glass-token> vault token revoke -self
```

---

## 6. Certificate Management

### cert-manager in Kubernetes

```yaml
# ClusterIssuer using Let's Encrypt
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@company.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - dns01:
          route53:
            region: us-east-1
            role: arn:aws:iam::123:role/cert-manager-route53
---
# Certificate resource
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-tls
  namespace: production
spec:
  secretName: api-tls-cert
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  commonName: api.company.com
  dnsNames:
    - api.company.com
    - '*.api.company.com'
  renewBefore: 720h # Renew 30 days before expiry
```

### Internal PKI with Vault

```bash
# Set up Vault PKI for internal mTLS
vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki

# Generate root CA
vault write pki/root/generate/internal \
  common_name="company.internal" \
  ttl=87600h

# Create intermediate CA (best practice — don't expose root)
vault secrets enable -path=pki_int pki
vault write -format=json pki_int/intermediate/generate/internal \
  common_name="company.internal Intermediate" | jq -r '.data.csr' > pki_int.csr

vault write -format=json pki/root/sign-intermediate \
  csr=@pki_int.csr format=pem_bundle | jq -r '.data.certificate' > signed_cert.pem

vault write pki_int/intermediate/set-signed certificate=@signed_cert.pem

# Issue short-lived certificates for services
vault write pki_int/roles/service-cert \
  allowed_domains="service.internal,svc.cluster.local" \
  allow_subdomains=true \
  max_ttl=72h

vault write pki_int/issue/service-cert \
  common_name="payment.service.internal"
```

### Certificate Expiry Monitoring

```bash
# Check cert expiry from the command line
echo | openssl s_client -servername api.company.com -connect api.company.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# Script to check multiple endpoints and alert
cat > /usr/local/bin/cert-expiry-check.sh << 'EOF'
#!/bin/bash
WARN_DAYS=30
ENDPOINTS=("api.company.com:443" "auth.company.com:443" "vault.internal:8200")
for endpoint in "${ENDPOINTS[@]}"; do
  expiry=$(echo | openssl s_client -servername ${endpoint%:*} -connect "$endpoint" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s)
  days_left=$(( (expiry_epoch - $(date +%s)) / 86400 ))
  if [ "$days_left" -lt "$WARN_DAYS" ]; then
    echo "WARNING: $endpoint expires in ${days_left}d ($expiry)"
    # Send to PagerDuty / Slack
  fi
done
EOF
chmod +x /usr/local/bin/cert-expiry-check.sh

# Prometheus cert exporter
helm install cert-exporter stakater/ssl-exporter \
  --set config.targets[0]=api.company.com:443 \
  --set config.targets[1]=auth.company.com:443
# Alert: ssl_certificate_expiry_seconds < 86400 * 30
```

---

## 7. IAM at Scale

### Least Privilege Automation with IAM Access Analyzer

```bash
# Generate least-privilege policy from CloudTrail activity
aws accessanalyzer create-access-preview \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:123:analyzer/default \
  --configurations '{}'

# List findings (over-privileged)
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:123:analyzer/default \
  --filter '{"status":{"eq":["ACTIVE"]}}'

# IAM Access Advisor — see last-used permissions
aws iam generate-service-last-accessed-details --arn arn:aws:iam::123:role/ProdAppRole
aws iam get-service-last-accessed-details --job-id <job-id> \
  | jq '.ServicesLastAccessed[] | select(.TotalAuthenticatedEntities==0) | .ServiceName'
# Remove any service that hasn't been used in 90+ days
```

### Permission Boundaries

```json
// iam/permission-boundary.json — DevOps team can create roles but can't escalate
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowedServices",
      "Effect": "Allow",
      "Action": ["ec2:*", "s3:*", "rds:*", "logs:*", "cloudwatch:*"],
      "Resource": "*"
    },
    {
      "Sid": "DenyPrivilegeEscalation",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser",
        "iam:AttachUserPolicy",
        "iam:PutUserPolicy",
        "iam:CreateAccessKey",
        "iam:CreateLoginProfile",
        "sts:AssumeRole"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::123:policy/DevOpsBoundary"
        }
      }
    }
  ]
}
```

### Just-In-Time (JIT) Access

```bash
# JIT access with AWS IAM Identity Center (SSO)
# Create a time-limited permission set assignment
aws sso-admin create-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --target-id 123456789012 \
  --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-xxx \
  --principal-type USER \
  --principal-id user-id

# Remove after TTL (implement with Step Functions / Lambda scheduler)
aws sso-admin delete-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --target-id 123456789012 \
  --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-xxx \
  --principal-type USER \
  --principal-id user-id
```

---

## 8. Network Security Operations

### Security Group Hygiene at Scale

```bash
# Find security groups with 0.0.0.0/0 inbound on sensitive ports
aws ec2 describe-security-groups \
  --query 'SecurityGroups[?IpPermissions[?IpRanges[?CidrIp==`0.0.0.0/0`] && (FromPort==`22` || FromPort==`3389` || FromPort==`3306`)]].[GroupId,GroupName]' \
  --output table

# Find unused security groups
aws ec2 describe-network-interfaces \
  --query 'NetworkInterfaces[*].Groups[*].GroupId' \
  --output text | tr '\t' '\n' | sort -u > used_sgs.txt

aws ec2 describe-security-groups \
  --query 'SecurityGroups[*].GroupId' \
  --output text | tr '\t' '\n' | sort > all_sgs.txt

comm -23 all_sgs.txt used_sgs.txt  # Unused SGs
```

### WAF Rule Tuning

```bash
# Create WAF rate-limiting rule
aws wafv2 create-rule-group \
  --name "RateLimitRules" \
  --scope REGIONAL \
  --capacity 100 \
  --rules '[{
    "Name":"RateLimitLoginEndpoint",
    "Priority":1,
    "Statement":{"RateBasedStatement":{"Limit":100,"AggregateKeyType":"IP","ScopeDownStatement":{"ByteMatchStatement":{"SearchString":"/api/login","FieldToMatch":{"UriPath":{}},"TextTransformations":[{"Priority":0,"Type":"NONE"}],"PositionalConstraint":"STARTS_WITH"}}}},
    "Action":{"Block":{}},
    "VisibilityConfig":{"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"RateLimitLogin"}
  }]' \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=RateLimitRules

# Monitor WAF blocked requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=prod-waf Name=Region,Value=us-east-1 Name=Rule,Value=ALL \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum
```

### DDoS Response Procedures

```
DDoS RESPONSE RUNBOOK
──────────────────────────────────────────────────────────
 Alert: CloudWatch — NetworkIn > 10 Gbps OR
        WAF BlockedRequests > 100k/min
         │
         ▼
 [1] Identify attack vector
     aws cloudwatch get-metric-data (network, WAF)
     GuardDuty findings: UnauthorizedAccess:EC2/MaliciousIPCaller
         │
         ▼
 [2] Enable Shield Advanced (if not already on)
     aws shield subscribe
     → Automatic DDoS mitigation + AWS DRT support
         │
         ▼
 [3] Update WAF rules (block attacking IPs/ASNs)
     aws wafv2 update-ip-set --addresses <attacker-IPs>
         │
         ▼
 [4] Scale out (absorb via capacity)
     aws application-autoscaling put-scaling-policy ...
         │
         ▼
 [5] Engage AWS DRT (if Shield Advanced subscriber)
     aws shield create-protection-group ...
     Open support case: "Shield Response Team"
         │
         ▼
 [6] Post-incident review
     Export CloudFront/WAF access logs → Athena
     Query attacker IP patterns, user agents
──────────────────────────────────────────────────────────
```

---

## 9. Security Incident Response

### SIEM and GuardDuty Integration

```bash
# Enable GuardDuty
aws guardduty create-detector --enable --finding-publishing-frequency FIFTEEN_MINUTES

# Create EventBridge rule to route high-severity findings to PagerDuty/Slack
aws events put-rule \
  --name GuardDutyHighSeverity \
  --event-pattern '{
    "source": ["aws.guardduty"],
    "detail-type": ["GuardDuty Finding"],
    "detail": {
      "severity": [{"numeric": [">=", 7]}]
    }
  }' \
  --state ENABLED

# Aggregate findings across accounts with Security Hub
aws securityhub accept-administrator-invitation \
  --administrator-id 111111111111 \
  --invitation-id <invitation-id>
```

### Host Isolation Procedure

```bash
# Incident response: isolate a compromised EC2 instance
INSTANCE_ID="i-0abc123def456"
REGION="us-east-1"

# 1. Capture instance metadata before isolation
aws ec2 describe-instances --instance-ids $INSTANCE_ID > /tmp/instance-${INSTANCE_ID}.json

# 2. Create forensic snapshot of root/data volumes BEFORE isolation
VOLUMES=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[*].Ebs.VolumeId' \
  --output text)
for vol in $VOLUMES; do
  aws ec2 create-snapshot --volume-id $vol \
    --description "FORENSIC: $INSTANCE_ID $(date -u +%Y%m%d-%H%M%S)" \
    --tag-specifications "ResourceType=snapshot,Tags=[{Key=incident,Value=${INSTANCE_ID}}]"
done

# 3. Remove from load balancers / ASG
aws autoscaling set-instance-protection \
  --instance-ids $INSTANCE_ID \
  --auto-scaling-group-name prod-asg \
  --protected-from-scale-in

# 4. Apply isolation security group (deny all in/out except SSH from bastion)
ISOLATION_SG=$(aws ec2 create-security-group \
  --group-name "ISOLATED-${INSTANCE_ID}" \
  --description "Forensic isolation for $INSTANCE_ID" \
  --vpc-id vpc-0abc123 \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $ISOLATION_SG \
  --protocol tcp --port 22 \
  --source-group sg-bastion-id

aws ec2 modify-instance-attribute \
  --instance-id $INSTANCE_ID \
  --groups $ISOLATION_SG

# 5. Tag as under investigation
aws ec2 create-tags --resources $INSTANCE_ID \
  --tags Key=SecurityStatus,Value=ISOLATED Key=IncidentId,Value=INC-2024-001
```

### Forensic Evidence Chain

```bash
# Memory capture via SSM Run Command (before shutdown)
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["avml /tmp/memory.lime && aws s3 cp /tmp/memory.lime s3://forensics-bucket/INC-001/memory.lime --sse aws:kms"]'

# Disk image from snapshot — mount forensic copy
FORENSIC_VOL=$(aws ec2 create-volume \
  --snapshot-id <forensic-snap-id> \
  --availability-zone us-east-1a \
  --volume-type gp3 \
  --query 'VolumeId' --output text)

# Attach to forensics workstation (read-only)
aws ec2 attach-volume \
  --volume-id $FORENSIC_VOL \
  --instance-id i-forensics-workstation \
  --device /dev/sdf

# Mount read-only
sudo mount -o ro,noexec /dev/sdf1 /mnt/forensics
# Compute hash for evidence chain
sha256sum /dev/sdf > /evidence/disk-hash.txt
```

---

## 10. Container Security

### Admission Controllers (Kubernetes)

```yaml
# OPA Gatekeeper — deny privileged containers in production
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sPSPPrivilegedContainer
metadata:
  name: no-privileged-containers
spec:
  match:
    kinds:
      - apiGroups: ['']
        kinds: ['Pod']
    namespaces: ['production', 'staging']
---
# Kyverno policy — require image digest (prevent tag mutation attacks)
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-image-digest
spec:
  validationFailureAction: enforce
  rules:
    - name: check-image-digest
      match:
        resources:
          kinds: ['Pod']
          namespaces: ['production']
      validate:
        message: 'Images must use SHA digest, not mutable tags'
        pattern:
          spec:
            containers:
              - image: '*@sha256:*'
```

### Falco Runtime Security

```yaml
# /etc/falco/falco_rules.local.yaml — custom runtime detection rules
- rule: Unexpected Network Tool Executed in Container
  desc: Detect use of network tools (curl, wget, nc) inside a running container
  condition: >
    spawned_process and container and
    (proc.name in (curl, wget, nc, nmap, ncat) or
     proc.cmdline contains "python -c" or
     proc.cmdline contains "/dev/tcp")
  output: >
    Network tool executed in container
    (user=%user.name container=%container.name image=%container.image.repository
     cmd=%proc.cmdline pid=%proc.pid)
  priority: WARNING
  tags: [network, container, mitre_exfiltration]

- rule: Container Privilege Escalation Attempt
  desc: Detect sudo or su usage inside containers
  condition: spawned_process and container and proc.name in (sudo, su)
  output: >
    Privilege escalation attempt in container
    (container=%container.name user=%user.name cmd=%proc.cmdline)
  priority: CRITICAL
```

### Supply Chain Verification with Cosign

```bash
# Sign a container image after build
cosign sign --key cosign.key myrepo/myapp:v1.2.3@sha256:<digest>

# Verify before deployment
cosign verify --key cosign.pub myrepo/myapp:v1.2.3

# Kyverno policy to enforce signature verification
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: enforce
  rules:
    - name: verify-signature
      match:
        resources:
          kinds: ["Pod"]
      verifyImages:
        - image: "myrepo/*"
          key: |-
            -----BEGIN PUBLIC KEY-----
            MFkwEwYH...
            -----END PUBLIC KEY-----
```

---

## 11. Audit & Logging

### CloudTrail Architecture

```
AUDIT LOG PIPELINE
──────────────────────────────────────────────────────────────────
  All AWS Accounts (via Organizations)
         │
  [CloudTrail — Org Trail]
         │  S3 delivery every 5 min
         ▼
  [S3 Bucket: audit-logs]  ←── Object Lock (WORM, 7 years)
         │  SNS notification                │
         ▼                                  │ Athena queries
  [EventBridge]                             │
         │                                  │
  [Lambda: normalize]              [Glue Catalog]
         │
  [OpenSearch / Splunk SIEM]
         │
  [Detection Rules]
  [Alerting → PagerDuty]
──────────────────────────────────────────────────────────────────
```

```bash
# Enable org-wide CloudTrail with tamper protection
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name audit-logs-prod \
  --is-multi-region-trail \
  --include-global-service-events \
  --is-organization-trail \
  --enable-log-file-validation  # SHA-256 digest for tamper detection

# Enable CloudTrail Insights (detect unusual API activity)
aws cloudtrail put-insight-selectors \
  --trail-name org-audit-trail \
  --insight-selectors '[{"InsightType":"ApiCallRateInsight"},{"InsightType":"ApiErrorRateInsight"}]'

# Verify log file integrity
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:123:trail/org-audit-trail \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-07T00:00:00Z

# Query with Athena — who deleted S3 objects in the last 24h
SELECT useridentity.arn, eventname, requestparameters, eventtime
FROM cloudtrail_logs
WHERE eventname IN ('DeleteObject', 'DeleteBucket')
  AND eventtime > date_add('hour', -24, now())
ORDER BY eventtime DESC
LIMIT 100;
```

### Log Retention Policy

| Log Type         | Hot Storage      | Warm Storage | Cold/Archive | Legal Hold     |
| ---------------- | ---------------- | ------------ | ------------ | -------------- |
| CloudTrail       | S3 (90d)         | S3 IA (1y)   | Glacier (7y) | S3 Object Lock |
| VPC Flow Logs    | CloudWatch (30d) | S3 (1y)      | Glacier (3y) | —              |
| Application Logs | OpenSearch (14d) | S3 (1y)      | —            | —              |
| Security Events  | SIEM (90d)       | S3 (3y)      | Glacier (7y) | S3 Object Lock |
| Access Reviews   | IAM (90d)        | S3 (3y)      | —            | —              |

---

## 12. Real-World Scenario: CVE Affecting 3000 Production Servers

### Scenario: Critical OpenSSL CVE (CVSS 9.8) — Respond in 72 Hours

```
INCIDENT TIMELINE
─────────────────────────────────────────────────────────────────
 Hour 0   │ CVE published (e.g., CVE-2024-XXXX, CVSS 9.8)
          │ Patch available: OpenSSL 3.0.8+
          │
 Hour 0-2 │ DETECTION
          │  - Vulnerability scanner (Qualys) triggers alert
          │  - Slack alert: #security-critical
          │  - Incident commander assigned, war room open
          │
 Hour 2-4 │ SCOPE ASSESSMENT
          │  - How many hosts? Which version? Which services?
          │  - Is there a working exploit in the wild?
          │  - EPSS score? Any GuardDuty findings?
          │
 Hour 4-8 │ PATCH VALIDATION
          │  - Apply patch in staging, run regression tests
          │  - Validate service behavior post-patch
          │
Hour 8-24 │ WAVE 1 (300 hosts — 10%)
          │  - Canary deployment, monitor closely
          │
Hour 24-48│ WAVE 2+3 (1500 hosts — 50%)
          │  - Accelerated if canary is clean
          │
Hour 48-72│ WAVE 4+5 (1200 remaining + stragglers)
          │  - Full fleet coverage
          │  - Rescan to confirm patch applied
          │
 Hour 72+ │ POST-INCIDENT
          │  - Compliance report generated
          │  - Root-cause: Why was old OpenSSL still deployed?
          │  - Action items: AMI rotation cadence, SBOM automation
─────────────────────────────────────────────────────────────────
```

**Step 1: Assess scope immediately**

```bash
# Which hosts are running vulnerable OpenSSL?
# Using SSM Run Command across the fleet
aws ssm send-command \
  --targets "Key=tag:Environment,Values=production" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["openssl version", "rpm -q openssl || dpkg -l openssl"]' \
  --output-s3-bucket-name ssm-output-bucket \
  --output-s3-key-prefix "cve-assessment/" \
  --max-concurrency "200"

# Aggregate results
aws s3 sync s3://ssm-output-bucket/cve-assessment/ /tmp/assessment/
grep -rh "OpenSSL" /tmp/assessment/ | sort | uniq -c | sort -rn
```

**Step 2: Prioritize by blast radius**

```bash
# Which vulnerable hosts are internet-facing? (highest priority)
aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=production" \
  --query 'Reservations[*].Instances[*].[InstanceId,PublicIpAddress,Tags[?Key==`Service`].Value|[0]]' \
  --output table | grep -v None  # Only hosts WITH public IPs

# Hosts with no patching maintenance window defined (skip-listed)
aws ssm describe-instance-patch-states \
  --filters "Key=State,Values=InstalledPendingReboot,Failed" \
  --query 'InstancePatchStates[*].[InstanceId,FailedCount,InstalledPendingRebootCount]'
```

**Step 3: Emergency patch — no scheduled window**

```bash
# Create an emergency patch now (bypass maintenance window)
aws ssm send-command \
  --targets "Key=tag:PatchGroup,Values=internet-facing-prod" \
  --document-name "AWS-RunPatchBaseline" \
  --parameters '{"Operation":["Install"],"RebootOption":["RebootIfNeeded"]}' \
  --max-concurrency "10%" \
  --max-errors "5%"

# For container workloads: force image rebuild with patched base
# Trigger CI/CD pipeline to rebuild all production images
curl -X POST "https://api.github.com/repos/company/app/actions/workflows/build.yml/dispatches" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -d '{"ref":"main","inputs":{"force_rebuild":"true","reason":"CVE-2024-XXXX"}}'
```

**Step 4: Verify and report**

```bash
# Re-run scan after patching to verify coverage
aws ssm send-command \
  --targets "Key=tag:Environment,Values=production" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["openssl version"]' \
  --max-concurrency "500"

# Generate compliance report
aws ssm describe-instance-patch-states-for-patch-group \
  --patch-group "internet-facing-prod" \
  --query 'InstancePatchStates[*].[InstanceId,MissingCount,FailedCount,InstalledCount]' \
  --output table

# Confirm 0 hosts with old version
aws s3 sync s3://ssm-output-bucket/post-patch/ /tmp/post-patch/
grep -rh "OpenSSL 3.0" /tmp/post-patch/ | wc -l  # Should equal fleet size
```

**Post-Incident Improvements**

```
ROOT CAUSE ANALYSIS QUESTIONS
──────────────────────────────────────────────────────
1. Why did vulnerable OpenSSL exist in the base AMI?
   → Action: AMI rotation every 30 days with latest patches

2. Why did it take 2h to detect after CVE publication?
   → Action: Subscribe to NVD/AWS Security Bulletins feed
             → Lambda → SNS → PagerDuty within 15 min

3. Why no SBOM? (couldn't immediately see what's affected)
   → Action: Generate SBOM in CI/CD for every image build
             Store in S3 with Trivy/Syft + query via Athena

4. Were any hosts missed? (skip-listed, no SSM agent)
   → Action: Enforce SSM agent via AWS Config rule
             Alert on non-managed instances
──────────────────────────────────────────────────────
```

---

## Quick Reference: Security Operations Cheat Sheet

| Domain        | Key Tool                 | Critical Command/Concept                       |
| ------------- | ------------------------ | ---------------------------------------------- |
| Patch Mgmt    | SSM Patch Manager        | `max-concurrency 20%`, wave deployments        |
| Vuln Scanning | Trivy / Qualys           | EPSS score + CVSS for prioritization           |
| Compliance    | AWS Config / OPA         | `conftest test` + Security Hub standards       |
| Hardening     | CIS Benchmarks           | InSpec `linux-baseline` for validation         |
| Secrets       | HashiCorp Vault          | Dynamic credentials, `vault agent` sidecar     |
| Certs         | cert-manager / Vault PKI | `renewBefore: 720h`, WORM storage              |
| IAM           | Access Analyzer          | Remove permissions unused for 90+ days         |
| Network       | WAF + Shield             | Rate-limit critical endpoints; Shield Advanced |
| Incident      | GuardDuty + isolation    | Snapshot → isolate SG → forensic mount         |
| Container     | Falco + Kyverno          | Enforce image digest, deny privileged          |
| Audit         | CloudTrail + Athena      | Object Lock (WORM), log file validation        |
| CVE Response  | SSM + CI/CD              | Scope → Prioritize → Canary → Full fleet       |
