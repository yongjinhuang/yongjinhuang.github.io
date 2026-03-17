# Disaster Recovery — Backups, Failover, Chaos Engineering

> Operations Perspective: How to design, test, and execute DR in production systems.

---

## 1. DR Fundamentals

### RTO vs RPO

```
Timeline of a Disaster Event
─────────────────────────────────────────────────────────────────────────

  Last Good      Disaster        Service         Full
  Backup         Occurs          Restored        Recovery
     │               │               │               │
     ▼               ▼               ▼               ▼
─────●───────────────●───────────────●───────────────●──────────────────▶ time

     │←────────────────────────────→│
     │         RPO Window           │
     │  (data potentially lost)     │

                     │←─────────────│
                         RTO Window
                     (service downtime)
```

| Metric | Definition | Measures | Business Impact |
|--------|-----------|----------|-----------------|
| **RPO** (Recovery Point Objective) | Max acceptable data loss | How old can restored data be? | Data integrity, compliance |
| **RTO** (Recovery Time Objective) | Max acceptable downtime | How fast must service be restored? | Revenue loss, SLA penalties |
| **WRT** (Work Recovery Time) | Time to make data consistent after restore | Manual data entry, reconciliation | Operational cost |
| **MTD** (Maximum Tolerable Downtime) | Absolute maximum outage | Beyond this = business failure | Existential threat |

**The Relationship:**
```
MTD >= RTO + WRT
```

### DR Tier Classification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DR Tier Classification                           │
├──────────┬──────────┬──────────┬──────────────────────────────────────┤
│  Tier 0  │  Tier 1  │  Tier 2  │  Tier 3  │  Tier 4  │  Tier 5/6     │
│ No DR    │ Data     │ Hot      │ Electronic│ Point-in │ High          │
│          │ Backup   │ Standby  │ Vaulting │ Time Copy│ Availability  │
├──────────┼──────────┼──────────┼──────────┼──────────┼───────────────┤
│ RTO: N/A │ Days     │ Hours    │ Hours    │ Minutes  │ Seconds/Zero  │
│ RPO: N/A │ 24h+     │ 4-8h     │ 1-4h     │ Minutes  │ Near-zero     │
│ Cost: $  │ $$       │ $$$      │ $$$$     │ $$$$$    │ $$$$$$        │
└──────────┴──────────┴──────────┴──────────┴──────────┴───────────────┘
```

### Business Impact Analysis (BIA)

BIA quantifies the cost of downtime per system, used to justify DR investment.

```bash
# BIA Calculation Template

Revenue per hour:        $50,000
Productivity loss/hour:  $10,000
Penalty/SLA breach/hour: $5,000
Reputational cost/hour:  $15,000 (estimated)
─────────────────────────────────
Total cost per hour:     $80,000

If RTO = 4 hours:
  Max tolerable loss = 4 * $80,000 = $320,000
  DR solution budget should be < $320,000/year
```

**BIA Process:**
1. Inventory all systems and dependencies
2. Assign criticality tier (P0–P4)
3. Estimate hourly downtime cost per system
4. Map dependencies (what breaks when X fails?)
5. Define RPO/RTO targets per tier
6. Gap analysis against current capabilities

### DR Testing Frequency

| Test Type | Frequency | Duration | Disruption | Cost |
|-----------|-----------|----------|------------|------|
| Tabletop exercise | Monthly | 2 hours | None | Low |
| Backup restore test | Weekly (automated) | Automated | None | Low |
| Component failover | Quarterly | 4 hours | Minimal | Medium |
| Simulated regional failure | Bi-annual | 8 hours | Some traffic | High |
| Full DR drill | Annual | 24–48 hours | Significant | Very High |

---

## 2. DR Strategies Comparison

```
Recovery Speed vs Cost Matrix
─────────────────────────────────────────────────────────────────────────

  Fast
  Recovery   Multi-Site         ●  Active-Active
  (seconds)  Active-Active
             ─────────────────────────────────────────
             Warm Standby       ●
  (minutes)
             ─────────────────────────────────────────
             Pilot Light        ●
  (hours)
             ─────────────────────────────────────────
             Backup & Restore   ●
  (days)
             ─────────────────────────────────────────
                            Low                High
                                     Cost
```

### Strategy Deep Dive

**Backup & Restore**
```
PRIMARY REGION              DR REGION
┌─────────────────┐         ┌─────────────────┐
│  App + DB       │─────→   │  Backups Only   │
│  (active)       │ backup  │  (S3/Glacier)   │
└─────────────────┘         └─────────────────┘
RTO: 4–24 hours   RPO: 1–24 hours   Cost: $
Use case: Non-critical systems, development, archive data
```

**Pilot Light**
```
PRIMARY REGION              DR REGION
┌─────────────────┐         ┌─────────────────┐
│  Full Stack     │─────→   │  DB Replica     │
│  (active)       │  repl.  │  (minimal infra)│
└─────────────────┘         └─────────────────┘
                             ↑ Scale up on failover
RTO: 1–4 hours   RPO: Minutes   Cost: $$
Use case: Internal apps, moderate criticality
```

**Warm Standby**
```
PRIMARY REGION              DR REGION
┌─────────────────┐         ┌─────────────────┐
│  Full Stack     │─────→   │  Reduced-scale  │
│  (active, full) │  sync   │  Stack (active) │
└─────────────────┘         └─────────────────┘
                             ↑ Scale up on failover
RTO: Minutes   RPO: Seconds   Cost: $$$
Use case: Business-critical apps, e-commerce
```

**Multi-Site Active-Active**
```
REGION A                    REGION B
┌─────────────────┐         ┌─────────────────┐
│  Full Stack     │◄───────►│  Full Stack     │
│  (serving 50%)  │ bi-dir  │  (serving 50%)  │
└─────────────────┘  repl.  └─────────────────┘
         ↑                           ↑
         └──────── Route 53 ─────────┘
                  (latency-based)

RTO: Zero   RPO: Near-zero   Cost: $$$$
Use case: High-traffic, globally distributed, financial
```

### Cost vs Recovery Comparison

| Strategy | Annual Cost (est.) | RTO | RPO | Complexity |
|----------|-------------------|-----|-----|------------|
| Backup & Restore | $500–$2K | Hours–Days | Hours | Low |
| Pilot Light | $2K–$10K | 1–4 hours | Minutes | Medium |
| Warm Standby | $10K–$50K | Minutes | Seconds | High |
| Active-Active | $50K–$500K | Zero | Near-zero | Very High |

---

## 3. Backup Operations at Scale

### Automated Backup Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Automated Backup Architecture                        │
│                                                                        │
│  Sources          Orchestration        Storage           Verification  │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  ┌───────────┐ │
│  │ RDS DB   │───►│              │───►│ S3 Primary   │─►│ Restore   │ │
│  │ EBS Vols │───►│  AWS Backup  │───►│ (same region)│  │ Test Job  │ │
│  │ EFS      │───►│  /           │    └──────────────┘  └───────────┘ │
│  │ DynamoDB │───►│  EventBridge │         │                           │
│  │ Aurora   │───►│  Schedule    │         │ Cross-region              │
│  └──────────┘    └──────────────┘         ▼ replication               │
│                                    ┌──────────────┐                   │
│                                    │ S3 DR Region │                   │
│                                    │ (Glacier for │                   │
│                                    │  long-term)  │                   │
│                                    └──────────────┘                   │
└────────────────────────────────────────────────────────────────────────┘
```

### AWS Backup — Terraform Setup

```hcl
resource "aws_backup_plan" "main" {
  name = "production-backup-plan"

  rule {
    rule_name         = "hourly_backups"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 * * * ? *)"  # Every hour

    lifecycle {
      delete_after = 7  # Keep 7 days of hourly backups
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr_region.arn
      lifecycle {
        delete_after = 30
      }
    }
  }

  rule {
    rule_name         = "daily_backups"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 2 * * ? *)"  # 2 AM daily

    lifecycle {
      cold_storage_after = 30   # Move to Glacier after 30 days
      delete_after       = 365  # Delete after 1 year
    }
  }
}
```

### Backup Verification — Automated Restore Testing

```bash
#!/bin/bash
# backup-verify.sh — Daily automated restore test

set -euo pipefail

BACKUP_VAULT="production-vault"
TEST_SUBNET="subnet-0123456789"
TEST_SG="sg-0123456789"
REPORT_BUCKET="s3://backup-verification-reports"
DATE=$(date +%Y-%m-%d)

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# 1. Find the latest backup
log "Finding latest backup recovery point..."
RECOVERY_POINT=$(aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name "$BACKUP_VAULT" \
  --by-resource-type "RDS" \
  --query 'RecoveryPoints | sort_by(@, &CreationDate) | [-1].RecoveryPointArn' \
  --output text)

log "Recovery point: $RECOVERY_POINT"

# 2. Start restore job
log "Starting restore job..."
JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn "$RECOVERY_POINT" \
  --metadata "DBInstanceIdentifier=dr-test-${DATE},DBSubnetGroupName=test-subnet-group" \
  --iam-role-arn "arn:aws:iam::123456789:role/BackupRestoreRole" \
  --resource-type "RDS" \
  --query 'RestoreJobId' \
  --output text)

# 3. Wait for completion (poll every 60s)
log "Waiting for restore job $JOB_ID..."
for i in $(seq 1 60); do
  STATUS=$(aws backup describe-restore-job \
    --restore-job-id "$JOB_ID" \
    --query 'Status' --output text)

  if [[ "$STATUS" == "COMPLETED" ]]; then
    log "Restore completed successfully"
    break
  elif [[ "$STATUS" == "FAILED" ]]; then
    log "ERROR: Restore failed"
    aws cloudwatch put-metric-data \
      --namespace "DR/BackupVerification" \
      --metric-name "RestoreTestResult" \
      --value 0
    exit 1
  fi

  sleep 60
done

# 4. Validate data integrity
log "Running data integrity checks..."
RESTORED_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "dr-test-${DATE}" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Run validation queries
RECORD_COUNT=$(psql -h "$RESTORED_ENDPOINT" -U admin -d mydb -t -c \
  "SELECT COUNT(*) FROM critical_table WHERE created_at > NOW() - INTERVAL '24 hours';")

if [[ "$RECORD_COUNT" -gt 0 ]]; then
  log "Data integrity check PASSED: $RECORD_COUNT records found"
  RESULT=1
else
  log "WARNING: Data integrity check — no recent records"
  RESULT=0
fi

# 5. Publish metrics and report
aws cloudwatch put-metric-data \
  --namespace "DR/BackupVerification" \
  --metric-name "RestoreTestResult" \
  --value "$RESULT"

# 6. Cleanup test instance
log "Cleaning up test instance..."
aws rds delete-db-instance \
  --db-instance-identifier "dr-test-${DATE}" \
  --skip-final-snapshot

log "Backup verification complete. Result: $RESULT"
```

### Retention Policy Matrix

| Data Type | Daily | Weekly | Monthly | Annual | Compliance |
|-----------|-------|--------|---------|--------|-----------|
| Application DB | 7 days | 4 weeks | 12 months | 7 years | GDPR/SOC2 |
| Audit logs | 90 days | — | 24 months | 7 years | PCI-DSS |
| Config snapshots | 30 days | 12 weeks | 24 months | 5 years | SOC2 |
| User uploads | 7 days | — | — | — | Internal |
| Financial records | — | — | — | 10 years | Financial |

### Backup Encryption

```bash
# All backups must be encrypted at rest

# S3 backup bucket with CMK
aws s3api put-bucket-encryption \
  --bucket production-backups \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:us-east-1:123456789:key/mrk-xxx"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Cross-region KMS key replication (multi-region key)
aws kms replicate-key \
  --key-id "arn:aws:kms:us-east-1:123456789:key/mrk-xxx" \
  --replica-region "us-west-2"
```

---

## 4. Database DR

### RDS Multi-AZ vs Read Replicas

```
Multi-AZ (HA, not DR)              Cross-Region Read Replica (DR)
─────────────────────              ──────────────────────────────

us-east-1                          us-east-1        us-west-2
┌──────────────────────┐           ┌────────┐       ┌──────────┐
│  ┌─────────────────┐ │           │Primary │──────►│ Read     │
│  │Primary Instance │ │           │        │ async  │ Replica  │
│  │  (AZ-1a)        │ │           └────────┘ repl. │ (promote │
│  └────────┬────────┘ │                            │ on fail) │
│    sync   │          │                            └──────────┘
│  repl.    ▼          │           RPO: Minutes (lag dependent)
│  ┌─────────────────┐ │           RTO: ~5–10 min (promote)
│  │Standby Instance │ │
│  │  (AZ-1b)        │ │
│  └─────────────────┘ │
└──────────────────────┘
RPO: 0  RTO: 60–120 sec
Automatic failover, same region
```

### Aurora Global Database

```
PRIMARY REGION (us-east-1)         SECONDARY REGIONS
┌────────────────────────────┐     ┌────────────────────────────┐
│  Aurora Primary Cluster    │     │  Aurora Secondary Cluster  │
│  ┌──────────┐ ┌──────────┐│     │  ┌──────────┐ ┌──────────┐│
│  │Writer    │ │Reader    ││────►│  │Reader   │ │Reader    ││
│  │Instance  │ │Instance  ││     │  │(only)   │ │(only)    ││
│  └──────────┘ └──────────┘│     └────────────────────────────┘
└────────────────────────────┘
         │
         │ Storage-level replication
         │ Typical lag: <1 second
         │ Max lag: ~1 second (RPO target)
         ▼
   Shared Storage

# Managed failover: ~1 minute
# Unmanaged failover: promote secondary manually
aws rds failover-global-cluster \
  --global-cluster-identifier my-global-cluster \
  --target-db-cluster-identifier arn:aws:rds:us-west-2:123456789:cluster:my-secondary
```

### DynamoDB Global Tables

```bash
# Enable Global Tables — Bi-directional replication
aws dynamodb create-global-table \
  --global-table-name UserSessions \
  --replication-group '[
    {"RegionName": "us-east-1"},
    {"RegionName": "us-west-2"},
    {"RegionName": "eu-west-1"}
  ]'

# Conflict resolution: Last-writer-wins (by timestamp)
# RPO: Seconds  RTO: Zero (already active in all regions)

# Monitor replication lag
aws cloudwatch get-metric-statistics \
  --namespace "AWS/DynamoDB" \
  --metric-name "ReplicationLatency" \
  --dimensions Name=TableName,Value=UserSessions Name=ReceivingRegion,Value=us-west-2 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average
```

### Point-in-Time Recovery (PITR)

```bash
# RDS PITR — Restore to any second in last 35 days
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier production-db \
  --target-db-instance-identifier production-db-recovered \
  --restore-time "2026-03-15T14:30:00Z" \
  --db-instance-class db.r6g.xlarge \
  --multi-az

# DynamoDB PITR — Enable first
aws dynamodb update-continuous-backups \
  --table-name Orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Restore to specific time
aws dynamodb restore-table-to-point-in-time \
  --source-table-name Orders \
  --target-table-name Orders-recovered \
  --restore-date-time "2026-03-15T14:30:00Z"
```

---

## 5. Multi-Region Failover

### Route 53 Health Check and Failover Architecture

```
                        Users
                          │
                          ▼
                    Route 53 DNS
                   ┌───────────┐
                   │ Health    │
                   │ Checks    │
                   └─────┬─────┘
              ┌──────────┴──────────┐
              │ Primary (ACTIVE)    │  │ Secondary (STANDBY)
              │ weight=100          │  │ weight=0 (failover)
              ▼                     │  ▼
    ┌─────────────────┐             │  ┌─────────────────┐
    │  us-east-1      │             │  │  us-west-2      │
    │  ALB            │             │  │  ALB            │
    │  App Servers    │             │  │  App Servers    │
    │  RDS Primary    │─────────────┘  │  RDS Replica    │
    └─────────────────┘   replication  └─────────────────┘
           │
           │ Health check fails
           ▼
    Route 53 detects failure
    → Promotes secondary record
    → TTL expires (60s typical)
    → Traffic shifts to us-west-2
```

### Route 53 Failover Configuration

```bash
# Primary record — failover routing
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "SetIdentifier": "primary",
        "Failover": "PRIMARY",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "us-east-1-alb.amazonaws.com",
          "EvaluateTargetHealth": true
        },
        "HealthCheckId": "abc123"
      }
    }]
  }'

# Health check — check every 10 seconds
aws route53 create-health-check \
  --caller-reference "$(date +%s)" \
  --health-check-config '{
    "IPAddress": "1.2.3.4",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "FullyQualifiedDomainName": "api.example.com",
    "RequestInterval": 10,
    "FailureThreshold": 2,
    "EnableSNI": true
  }'
```

### DNS Propagation Reality

```
TTL Consideration for DR:

Steady State: TTL = 300s (5 min)
  → Before planned DR test: lower TTL to 60s
  → Allow 2x current TTL for caches to flush before changing

DNS Propagation Timeline:
  T+0:    Health check fails (Route 53 detects)
  T+20s:  Route 53 stops routing to primary
  T+20s:  New DNS response available
  T+60s:  Clients with 60s TTL pick up new record
  T+300s: Clients with 300s TTL pick up new record (!)
  T+3600s: ISP resolvers with longer TTL might still cache

Key insight: Some traffic will hit the dead region until TTL expires.
Application must handle connection errors gracefully.
```

### Split-Brain Prevention

```
Split-Brain Scenario:
  - Both regions think they are PRIMARY
  - Both accept writes
  - Conflict: which writes survive?

Prevention Strategies:

1. FENCING — Shoot The Other Node In The Head (STONITH)
   ┌──────────────────────────────────────────────────────┐
   │ When Region A detects Region B is unhealthy:         │
   │   → Region A forcibly removes Region B's write access│
   │   → Update IAM policy to deny writes in Region B     │
   │   → Update security group to block DB write port     │
   └──────────────────────────────────────────────────────┘

2. QUORUM — Only majority wins
   ┌──────────────────────────────────────────────────────┐
   │ 3-region setup: A, B, C                              │
   │   → Region needs quorum (2 of 3) to accept writes    │
   │   → Network partition: A sees B+C unreachable        │
   │   → A refuses writes (no quorum)                     │
   │   → B+C still communicate: they have quorum          │
   └──────────────────────────────────────────────────────┘

3. LOCK SERVICE — Distributed lock
   ┌──────────────────────────────────────────────────────┐
   │ Use external lock service (etcd, ZooKeeper, DynamoDB)│
   │   → Primary holds a lease (expires after 30s)        │
   │   → Renews every 10s while healthy                   │
   │   → If primary dies, lease expires                   │
   │   → Secondary acquires lease and promotes            │
   └──────────────────────────────────────────────────────┘
```

---

## 6. Chaos Engineering

### The Principles

```
Chaos Engineering = Proactive resilience verification
   "Break things deliberately in controlled way before they break
    accidentally in uncontrolled ways"

Core Loop:
  ┌──────────────────────────────────────────────────────────┐
  │  1. Define steady-state hypothesis                       │
  │     "p99 latency < 200ms, error rate < 0.1%"            │
  │                                                          │
  │  2. Hypothesize: what happens when X fails?              │
  │     "Killing one app instance increases latency by <50ms"│
  │                                                          │
  │  3. Run experiment                                       │
  │     Kill the instance, observe metrics                   │
  │                                                          │
  │  4. Measure: does steady-state hold?                     │
  │     Verify metrics against hypothesis                    │
  │                                                          │
  │  5. Fix weaknesses discovered                            │
  │     Add retry, fallback, circuit breaker                 │
  └──────────────────────────────────────────────────────────┘
```

### AWS Fault Injection Simulator (FIS)

```bash
# Define an experiment template — kill 50% of EC2 instances
cat > fis-experiment.json << 'EOF'
{
  "description": "Kill 50% of app tier instances",
  "targets": {
    "AppInstances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": {"Environment": "production", "Tier": "app"},
      "selectionMode": "PERCENT(50)"
    }
  },
  "actions": {
    "TerminateInstances": {
      "actionId": "aws:ec2:terminate-instances",
      "targets": {"Instances": "AppInstances"}
    }
  },
  "stopConditions": [{
    "source": "aws:cloudwatch:alarm",
    "value": "arn:aws:cloudwatch:us-east-1:123456789:alarm/ErrorRateHigh"
  }],
  "roleArn": "arn:aws:iam::123456789:role/FISRole",
  "tags": {"Purpose": "DR-Testing"}
}
EOF

# Create and start experiment
TEMPLATE_ID=$(aws fis create-experiment-template \
  --cli-input-json file://fis-experiment.json \
  --query 'experimentTemplate.id' --output text)

aws fis start-experiment --experiment-template-id "$TEMPLATE_ID"
```

### Litmus Chaos — Kubernetes Chaos

```yaml
# Litmus ChaosEngine — Network Partition experiment
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: network-chaos
  namespace: production
spec:
  appinfo:
    appns: production
    applabel: app=payment-service
    appkind: deployment
  engineState: active
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-network-partition
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: "300"  # 5 minutes
            - name: NETWORK_INTERFACE
              value: eth0
            - name: DESTINATION_IPS
              value: "10.0.0.0/8"  # Block internal traffic
            - name: POLICY
              value: egress
        probe:
          - name: "check-payment-api"
            type: httpProbe
            mode: Continuous
            httpProbe/inputs:
              url: "http://payment-service/health"
              responseTimeout: 1000
              method:
                get:
                  criteria: ==
                  responseCode: "200"
```

### Game Day Checklist

```
PRE-GAME DAY (1 week before)
─────────────────────────────
[ ] Define success criteria (steady-state hypothesis)
[ ] Notify all stakeholders (engineering, support, leadership)
[ ] Review on-call rotation — ensure experienced engineers on call
[ ] Prepare rollback procedures for each experiment
[ ] Set up dedicated monitoring dashboard
[ ] Schedule customer communication if needed
[ ] Agree on abort criteria (when to stop)

GAME DAY EXECUTION
───────────────────
[ ] All-hands war room assembled (or video call)
[ ] Monitoring confirmed working
[ ] Baseline metrics captured (steady-state verified)
[ ] Experiment 1: Single AZ failure → observe auto-scaling
[ ] Metrics reviewed → document observations
[ ] Experiment 2: Database failover → measure RTO
[ ] Metrics reviewed → document observations
[ ] Experiment 3: Dependency failure → circuit breakers?
[ ] Final metrics captured

POST-GAME DAY (1 week after)
──────────────────────────────
[ ] Write incident report / game day report
[ ] Create tickets for all discovered weaknesses
[ ] Prioritize fixes (P0 → P2)
[ ] Update runbooks based on learnings
[ ] Schedule follow-up chaos test after fixes
```

---

## 7. Runbook: Region Failure

### Severity & Decision Tree

```
Region Failure Detected
        │
        ▼
Is this a false alarm?
(Check AWS Service Health Dashboard)
        │
   ┌────┴────┐
  YES       NO
   │         │
Investigate  Is data loss acceptable?
(5 min)      │
         ┌───┴───┐
        YES      NO
         │        │
    Initiate  Is degraded
    Failover  mode possible?
                  │
             ┌────┴────┐
            YES        NO
             │          │
        Enable      Initiate
        Degraded    Failover
        Mode        Immediately
```

### Failover Runbook — Step by Step

```
REGION FAILURE RUNBOOK v2.3
Last updated: 2026-03-17
Owner: Platform Team
RTO Target: 15 minutes

═══════════════════════════════════════════════════════════════
PHASE 1: DETECTION (T+0 to T+5 min)
═══════════════════════════════════════════════════════════════

Step 1.1: Confirm outage (avoid false positives)
  Command:
    aws health describe-events \
      --filter '{"regions":["us-east-1"],"eventStatusCodes":["open"]}' \
      --query 'events[].{Service:service,Status:statusCode,Desc:eventTypeCode}'

  Also check: https://health.aws.amazon.com/health/status
  Expected: AWS confirms regional impairment

Step 1.2: Verify application impact
  Command:
    # Check error rates
    aws cloudwatch get-metric-statistics \
      --namespace "Application" \
      --metric-name "HTTPErrors5xx" \
      --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
      --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
      --period 60 --statistics Sum

  Decision: If error rate > 10%, proceed to Phase 2

Step 1.3: Page incident commander
  PagerDuty: pd-trigger --incident-key "region-failure-us-east-1"
  Slack: #incidents — post: "P0: us-east-1 region failure. IC: @oncall"

═══════════════════════════════════════════════════════════════
PHASE 2: FAILOVER INITIATION (T+5 to T+15 min)
═══════════════════════════════════════════════════════════════

Step 2.1: Promote read replica to primary
  Command:
    aws rds promote-read-replica \
      --db-instance-identifier production-db-us-west-2-replica \
      --backup-retention-period 7 \
      --preferred-backup-window "03:00-04:00"

  Wait:
    aws rds wait db-instance-available \
      --db-instance-identifier production-db-us-west-2-replica

  Expected: ~5-8 minutes

Step 2.2: Update application config to point to new DB
  Command:
    # Update Parameter Store
    aws ssm put-parameter \
      --name "/production/database/host" \
      --value "production-db-us-west-2-replica.cluster-xxx.us-west-2.rds.amazonaws.com" \
      --type "SecureString" \
      --overwrite \
      --region us-west-2

    # Rolling restart of app servers in DR region
    aws ecs update-service \
      --cluster production-us-west-2 \
      --service api-service \
      --force-new-deployment \
      --region us-west-2

Step 2.3: Switch DNS to DR region
  Command:
    aws route53 change-resource-record-sets \
      --hosted-zone-id Z1234567890 \
      --change-batch file://failover-dns-change.json

  Verify:
    watch -n 5 "dig +short api.example.com"

  Expected: DNS resolves to DR region IPs within 60s (low TTL)

Step 2.4: Scale up DR environment
  Command:
    # Scale app tier
    aws autoscaling update-auto-scaling-group \
      --auto-scaling-group-name app-asg-us-west-2 \
      --min-size 10 \
      --max-size 50 \
      --desired-capacity 20 \
      --region us-west-2

═══════════════════════════════════════════════════════════════
PHASE 3: VALIDATION (T+15 to T+25 min)
═══════════════════════════════════════════════════════════════

Step 3.1: Smoke tests
  Command:
    curl -f https://api.example.com/health
    curl -f https://api.example.com/v1/users/me -H "Authorization: Bearer $TEST_TOKEN"

  Check dashboards:
    - Error rate < 1%
    - p99 latency < 500ms
    - All health checks GREEN

Step 3.2: Customer communication
  Template:
    "We are currently experiencing issues in our primary data center.
     Service has been restored to our secondary region. You may notice
     slightly higher latency. Our team is monitoring the situation."

═══════════════════════════════════════════════════════════════
PHASE 4: FAILBACK (after primary region recovery)
═══════════════════════════════════════════════════════════════

Step 4.1: Assess primary region health (wait for AWS confirmation)
Step 4.2: Set up replication from DR → Primary
  - Create read replica in primary region from DR primary
  - Wait for replication lag < 100ms before switching back
Step 4.3: Test primary region
  - Route 5% traffic to primary via weighted routing
  - Monitor for 30 minutes
Step 4.4: Gradually shift traffic back (10% → 25% → 50% → 100%)
Step 4.5: Demote DR primary back to replica
Step 4.6: Post-incident review (within 48 hours)
```

---

## 8. Data Consistency in DR

### CAP Theorem in Practice

```
           Consistency
               ▲
               │
        ┌──────┴──────┐
        │  CA systems │  (traditional RDBMS — no partition tolerance)
        │  Postgres    │
        │  MySQL       │
        └─────────────┘
               │
      ─────────┼─────────
      P        │         P
      A   ─────┼─────    C
               │
    ┌──────────┤──────────┐
    │ AP       │  CP      │
    │ Cassandra│ ZooKeeper│
    │ DynamoDB │ HBase    │
    │ (avail.) │ (consist)│
    └──────────┴──────────┘
         Partition Tolerance ──────────────►

In DR context:
  Network partition between regions = P
  You must choose: A (serve possibly stale data) or C (reject writes)
```

### Replication Lag Monitoring

```bash
# Monitor PostgreSQL replication lag
psql -h primary.us-east-1.rds.amazonaws.com -U admin -d mydb -c "
  SELECT
    client_addr,
    state,
    sent_lsn - replay_lsn AS replication_lag_bytes,
    EXTRACT(EPOCH FROM (now() - reply_time)) AS lag_seconds
  FROM pg_stat_replication;
"

# CloudWatch metric for Aurora
aws cloudwatch get-metric-statistics \
  --namespace "AWS/RDS" \
  --metric-name "AuroraGlobalDBReplicationLag" \
  --dimensions Name=DBClusterIdentifier,Value=my-global-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 --statistics Average

# Alert if lag > 5 seconds
```

### Conflict Resolution Strategies

| Strategy | Mechanism | Use Case | Trade-off |
|----------|-----------|----------|-----------|
| Last-writer-wins (LWW) | Compare timestamps | DynamoDB Global Tables | Can lose updates |
| Multi-version concurrency (MVCC) | Keep all versions | CRDTs, collaborative editing | Storage overhead |
| Application-level merge | Custom merge logic | Domain-specific rules | Complex to implement |
| Operational transformation | Track intent, not state | Google Docs-style | Very complex |
| Avoid conflicts | Route same user to same region | Session affinity | Reduces availability |

---

## 9. Stateful Service DR

### Service-by-Service DR Patterns

```
┌─────────────────────────────────────────────────────────────────────┐
│              Stateful Services DR Pattern Matrix                    │
├──────────────────┬──────────────┬──────────────────┬───────────────┤
│ Service Type     │ DR Pattern   │ RPO              │ RTO           │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ Relational DB    │ Read replica │ Seconds          │ 5–10 min      │
│                  │ + PITR       │ (replication lag)│ (promote)     │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ Redis Cache      │ Accept loss  │ Total loss OK    │ Seconds       │
│                  │ (rebuild)    │ (cache is cache) │ (cold start)  │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ Kafka / SQS      │ Cross-region │ Seconds          │ Minutes       │
│ Message Queue    │ mirror/repl. │ (in-flight msgs) │               │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ S3 Object Store  │ CRR          │ Minutes          │ Zero          │
│                  │ (Cross-Region│ (eventual)       │ (already      │
│                  │  Replication)│                  │  replicated)  │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ Elasticsearch    │ CCR          │ Seconds          │ Minutes       │
│                  │ (Cross-Clust.│                  │               │
│                  │  Replication)│                  │               │
├──────────────────┼──────────────┼──────────────────┼───────────────┤
│ EFS / File Store │ AWS Backup   │ Hours            │ Hours         │
│                  │ + DataSync   │ (backup interval)│ (restore)     │
└──────────────────┴──────────────┴──────────────────┴───────────────┘
```

### Redis DR Strategy

```bash
# Option 1: Accept cache loss (preferred for most caches)
# On failover, point apps to new empty Redis in DR region
# Cache will warm up naturally via application requests
# Impact: Increased DB load for 15–30 minutes (thundering herd risk)

# Mitigation for thundering herd:
# Add jitter to cache misses, implement probabilistic early expiry

# Option 2: ElastiCache Global Datastore (if RPO matters)
aws elasticache create-global-replication-group \
  --global-replication-group-id-suffix my-global-redis \
  --primary-replication-group-id primary-redis-us-east-1

# Add DR region
aws elasticache create-replication-group \
  --replication-group-id redis-dr-us-west-2 \
  --global-replication-group-id global-my-global-redis \
  --replication-group-description "DR Redis"
```

### Kafka Cross-Region Replication

```bash
# MirrorMaker 2 configuration for cross-region replication
cat > mm2.properties << 'EOF'
# Source and target cluster aliases
clusters = us-east-1, us-west-2

us-east-1.bootstrap.servers = kafka-primary.us-east-1.amazonaws.com:9092
us-west-2.bootstrap.servers = kafka-dr.us-west-2.amazonaws.com:9092

# Replicate all topics from us-east-1 to us-west-2
us-east-1->us-west-2.enabled = true
us-east-1->us-west-2.topics = .*

# Consumer group offset sync
sync.group.offsets.enabled = true
sync.group.offsets.interval.seconds = 60

# Topic replication factor in DR
replication.factor = 3
EOF

# On failover: consumers switch to DR cluster
# Topic names prefixed: us-east-1.original-topic-name
```

---

## 10. DR Testing

### Testing Maturity Ladder

```
Level 1: Tabletop Exercise
  "We talk through what we would do"
  → No systems touched
  → Identify gaps in runbooks
  → 2-hour meeting, quarterly

Level 2: Component Restore Test
  "We restore individual components from backup"
  → Restore DB to test environment
  → Measure actual RTO, verify RPO
  → Monthly, automated

Level 3: Simulated Failover
  "We fail over non-production environment"
  → Staging environment DR drill
  → Uses production-like data volumes
  → Quarterly, 4–8 hours

Level 4: Partial Production Failover
  "We shift 5–10% of prod traffic to DR"
  → Real traffic, real data
  → Rollback ready at all times
  → Bi-annual, full day

Level 5: Full DR Drill
  "We cut over 100% to DR region"
  → Only possible with active-active or warm standby
  → Annual, requires executive sign-off
```

### DR Testing Calendar

```
Monthly
  Week 1: Automated backup restore tests (automated, no humans)
  Week 2: DNS failover test (staging environment)
  Week 3: Chaos test — random pod/instance kill (staging)
  Week 4: Runbook review and update

Quarterly
  Q1: Database failover drill (with RTO/RPO measurement)
  Q2: Network partition test (chaos engineering game day)
  Q3: Full application failover (staging environment)
  Q4: Tabletop exercise (full team, including leadership)

Annual
  Full production DR drill (requires change management approval)
```

### DR Test Report Template

```markdown
# DR Test Report

**Date:** 2026-03-15
**Test Type:** Database Failover Drill
**Participants:** Platform Team (5 engineers), DBA, On-call SRE
**Environment:** Production

## Hypothesis
Promoting the us-west-2 read replica to primary will result in:
- RTO < 10 minutes
- RPO < 30 seconds (replication lag at time of failover)
- Error rate < 5% during failover window

## Results
| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Time to detect failure | < 2 min | 1m 42s | PASS |
| Time to promote replica | < 8 min | 6m 15s | PASS |
| Time to update app config | < 2 min | 3m 10s | FAIL |
| Data loss (replication lag) | < 30s | 8s | PASS |
| Error rate during failover | < 5% | 2.3% | PASS |
| Total RTO | < 15 min | 12m 07s | PASS |

## Issues Found
1. (MEDIUM) App config update was manual — should be automated
2. (LOW) DNS TTL was 300s, consider reducing to 60s pre-emptively

## Action Items
- [ ] Automate config update via SSM Parameter Store hook (#TICKET-1234)
- [ ] Set DNS TTL to 60s during business hours (#TICKET-1235)
- [ ] Add replication lag alert at >20s (#TICKET-1236)

## Next Test
Scheduled for 2026-06-15
```

---

## 11. Infrastructure as Code for DR

### Terraform Multi-Region Architecture

```hcl
# variables.tf
variable "regions" {
  default = {
    primary = "us-east-1"
    dr      = "us-west-2"
  }
}

# providers.tf
provider "aws" {
  alias  = "primary"
  region = var.regions.primary
}

provider "aws" {
  alias  = "dr"
  region = var.regions.dr
}

# modules/application/main.tf — deployed to both regions
module "app_primary" {
  source    = "./modules/application"
  providers = { aws = aws.primary }
  environment = "production"
  is_primary  = true
  db_replica_source = null
}

module "app_dr" {
  source    = "./modules/application"
  providers = { aws = aws.dr }
  environment = "production-dr"
  is_primary  = false
  db_replica_source = module.app_primary.db_endpoint
}
```

### Pre-Provisioned vs On-Demand DR

```
Pre-Provisioned DR (Warm/Active Standby)
─────────────────────────────────────────
  Pros:
  + Predictable, tested RTO (minutes)
  + No provisioning delay during crisis
  + Can serve traffic immediately

  Cons:
  - Pay 50–100% extra for idle resources
  - Must keep in sync with primary

On-Demand DR (Pilot Light)
───────────────────────────
  Pros:
  + Much lower cost (pay only for DB replication + minimal infra)
  + Modern IaC makes provisioning fast (~10 min with Terraform)

  Cons:
  - Provisioning time adds to RTO
  - Must test provisioning pipeline regularly

Decision Matrix:
  RTO target < 5 min  → Pre-provisioned (Warm Standby or Active-Active)
  RTO target < 1 hour → Pilot Light with pre-warmed DB
  RTO target < 4 hour → Backup & Restore with fast IaC
```

### CloudFormation StackSets for Multi-Region DR

```bash
# Deploy DR infrastructure to all target regions simultaneously
aws cloudformation create-stack-set \
  --stack-set-name ProductionDRInfra \
  --template-url https://s3.amazonaws.com/templates/dr-infra.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=IsDRRegion,ParameterValue=true \
  --capabilities CAPABILITY_IAM

# Deploy instances to specific regions
aws cloudformation create-stack-instances \
  --stack-set-name ProductionDRInfra \
  --regions us-west-2 eu-west-1 ap-southeast-1 \
  --deployment-targets '{"OrganizationalUnitIds": ["ou-xxxx-yyyy"]}' \
  --operation-preferences '{
    "RegionConcurrencyType": "PARALLEL",
    "FailureToleranceCount": 1,
    "MaxConcurrentCount": 3
  }'
```

---

## 12. Real-World DR Scenario: AZ Failure in 3-Tier Application

### Architecture Overview

```
BEFORE FAILURE
us-east-1
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │   AZ-1a      │  │   AZ-1b      │  │   AZ-1c              ││
│  │              │  │              │  │                       ││
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐        ││
│  │ │Web x3    │ │  │ │Web x3    │ │  │ │Web x3    │        ││
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘        ││
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐        ││
│  │ │App x3    │ │  │ │App x3    │ │  │ │App x3    │        ││
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘        ││
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐        ││
│  │ │RDS       │ │  │ │RDS       │ │  │ │RDS       │        ││
│  │ │Primary   │ │  │ │Standby   │ │  │ │(no role) │        ││
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘        ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### Failure Timeline and Response

```
T+0:00  AZ-1a becomes completely unavailable
        (power failure, network partition, or AWS infrastructure issue)

T+0:45  CloudWatch alarms fire:
        - HealthyHostCount on ALB drops from 9 to 6
        - RDS Primary unreachable (AZ-1a hosted the primary)
        - EC2 Status Check failures in AZ-1a
        PagerDuty pages on-call engineer

T+1:00  AWS RDS Multi-AZ AUTOMATIC FAILOVER begins
        RDS detects primary failure
        Promotes AZ-1b standby to primary
        Updates CNAME endpoint automatically

T+2:30  RDS failover COMPLETE
        New primary: AZ-1b
        Applications reconnect (connection pool reset required)
        ERROR: App servers have stale DB connections

T+3:00  Application connection pool errors spike
        Fix: Rolling restart of app tier in AZ-1b and AZ-1c
        Command:
          aws ecs update-service \
            --cluster production \
            --service api-service \
            --force-new-deployment

T+5:00  Auto Scaling Group detects AZ-1a instance health failures
        Launches replacement instances in AZ-1b and AZ-1c
        (configured: AZRebalance policy active)
        New instances: 4 in AZ-1b, 4 in AZ-1c (from 3+3+3 = 9 total)

T+8:00  All health checks GREEN
        9 healthy app servers across 2 AZs
        DB primary healthy in AZ-1b
        Error rate: 0.2% (down from peak 12%)
        p99 latency: 185ms (up from 120ms, acceptable)

T+8:30  Incident commander declares: degraded but stable
        Status page updated: "Investigating performance issues"

T+45:00 AWS declares AZ-1a restored
        Verify: EC2 instances in AZ-1a pass health checks

T+50:00 ASG re-balances instances across all 3 AZs automatically

T+60:00 All systems nominal across all 3 AZs
        Status page updated: "All systems operational"

T+48h   Post-incident review:
        - Why did connection pool not handle DB failover gracefully?
        - Action: Configure connection pool with auto-reconnect
        - Action: Add synthetic monitoring for DB connection test
```

### Lessons from the Scenario

```
Root Causes of Extended Recovery:

1. Connection Pool Issue (T+2:30 to T+5:00)
   Problem: App servers held stale TCP connections to dead DB primary
   Fix:
     # Add to DB connection config:
     PGCONNECT_TIMEOUT=5
     PGTCP_USER_TIMEOUT=10000
     # Or in connection pool (PgBouncer):
     server_check_delay = 10
     server_login_retry = 15

2. Error Rate During Failover (12% peak)
   Problem: Clients received 500 errors during DB promotion window
   Fix: Implement circuit breaker pattern
     → Return cached response during DB unavailability
     → Queue writes for retry
     → Respond with 503 (retry-able) instead of 500 (terminal)

3. No Pre-Notification
   Problem: On-call found out via PagerDuty, no proactive alerting
   Fix:
     → Subscribe to AWS Health Events via EventBridge
     → EventBridge → SNS → Slack/PagerDuty
     → Detect AZ issues before customer impact possible

Post-Incident Metrics:
  Actual RTO: ~8 minutes (target was 15 min — PASS)
  Actual RPO: 0 (Multi-AZ synchronous replication — PASS)
  Customer impact: ~3 minutes of elevated errors
  Data loss: Zero
```

---

## Summary Reference Card

```
DR QUICK REFERENCE
══════════════════════════════════════════════════════════════════

Strategy Selection:
  RPO hours, RTO days  → Backup & Restore
  RPO minutes, RTO hours → Pilot Light
  RPO seconds, RTO minutes → Warm Standby
  RPO near-zero, RTO zero → Active-Active

Database DR Commands:
  Promote RDS replica: aws rds promote-read-replica --db-instance-identifier <id>
  Aurora global failover: aws rds failover-global-cluster --global-cluster-identifier <id>
  DynamoDB PITR restore: aws dynamodb restore-table-to-point-in-time
  RDS PITR restore: aws rds restore-db-instance-to-point-in-time

DNS Failover:
  Lower TTL before testing: Update Route 53 records to TTL=60
  Manual failover: aws route53 change-resource-record-sets

Chaos Engineering:
  FIS experiment: aws fis start-experiment --experiment-template-id <id>
  Steady-state: Define metrics BEFORE running experiments

DR Testing Frequency:
  Backup restore: Weekly (automated)
  Component failover: Quarterly
  Full DR drill: Annual

Key Metrics to Monitor:
  Replication lag (target < 5s for DR)
  HealthyHostCount on ALBs
  RDS FreeableMemory, DatabaseConnections
  Route53 HealthCheckStatus
══════════════════════════════════════════════════════════════════
```
