# Cloud Cost Optimization — FinOps and Cloud Cost Control

> **Operations Perspective**: Cloud cost is an engineering problem, not just a finance problem.
> Every architecture decision has a cost dimension. FinOps is the practice of making
> cloud spend visible, understandable, and actionable.

---

## 1. The FinOps Framework

FinOps (Financial Operations) is a cultural practice and operational framework for managing
cloud costs across engineering, finance, and business teams.

### The FinOps Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE FINOPS CYCLE                              │
│                                                                  │
│   ┌───────────┐       ┌───────────┐       ┌───────────┐         │
│   │           │       │           │       │           │         │
│   │  INFORM   │──────▶│ OPTIMIZE  │──────▶│  OPERATE  │         │
│   │           │       │           │       │           │         │
│   └─────▲─────┘       └───────────┘       └─────┬─────┘         │
│         │                                        │               │
│         └────────────────────────────────────────┘               │
│                                                                  │
│  INFORM:                                                         │
│  • Visibility into cloud spend (who, what, where)                │
│  • Cost allocation by team/product/environment                   │
│  • Unit economics (cost per transaction, cost per user)          │
│                                                                  │
│  OPTIMIZE:                                                       │
│  • Right-sizing and waste elimination                            │
│  • Reserved instances, savings plans, spot usage                 │
│  • Architecture optimization (moving to cheaper services)        │
│                                                                  │
│  OPERATE:                                                        │
│  • Continuous cost governance and policy enforcement             │
│  • Budget alerts and anomaly detection                           │
│  • Cost reviews embedded in engineering workflows                │
└─────────────────────────────────────────────────────────────────┘
```

### FinOps Team Structure

```
┌──────────────────────────────────────────────────────────────────┐
│                    FINOPS TEAM MODEL                              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                  FINOPS PRACTITIONER                      │    │
│  │  • Central cost visibility and reporting                  │    │
│  │  • Savings plan / RI purchasing authority                 │    │
│  │  • Cross-team optimization programs                       │    │
│  │  • Cost anomaly escalation point                          │    │
│  └─────────────────────────────┬────────────────────────────┘    │
│                                 │                                 │
│         ┌───────────────────────┼─────────────────────────┐      │
│         │                       │                          │      │
│  ┌──────┴──────┐       ┌────────┴────────┐       ┌────────┴──┐   │
│  │ Engineering  │       │    Finance      │       │ Business  │   │
│  │  Teams       │       │    Team         │       │  Units    │   │
│  │             │       │                 │       │           │   │
│  │ • Tag infra  │       │ • Budget owners │       │ • Cost    │   │
│  │ • Own costs  │       │ • Forecasting   │       │   targets │   │
│  │ • Optimize   │       │ • Chargebacks   │       │ • ROI     │   │
│  └─────────────┘       └─────────────────┘       └───────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Cost Ownership Culture

| Anti-Pattern | FinOps Pattern |
|---|---|
| "Cloud costs are IT's problem" | Every team owns their cloud spend |
| Monthly cost reviews only | Daily cost visibility in dashboards |
| Finance surprises at end of month | Budget alerts at 50%, 80%, 100% |
| Cost not considered in design reviews | Cost estimate required for new features |
| Shared accounts with no allocation | Per-team cost allocation via tags |
| Engineers don't see costs | Cost metrics on team dashboards |

**The Golden Rule**: The team that creates the cost should own the cost.

---

## 2. Cloud Cost Anatomy

### Where Money Actually Goes (Typical Distribution)

```
TYPICAL AWS BILL BREAKDOWN (Production SaaS — $200K/month)

Compute (EC2, ECS, Lambda)           ████████████████████  42%  $84,000
RDS / ElastiCache / DynamoDB         ████████████          25%  $50,000
Data Transfer                        ████████              16%  $32,000
S3 / EBS / Storage                   ████                   8%  $16,000
Load Balancers / NAT Gateway         ██                     4%   $8,000
Support / Other                      ██                     5%  $10,000
```

### The Data Transfer Tax

Data transfer is the most underestimated cost category. AWS charges for data leaving
their network or crossing availability zone boundaries.

```
DATA TRANSFER COST MATRIX

                    ┌──────────┬──────────┬──────────┬──────────┐
                    │  Same AZ │ Cross AZ │ Internet │  Direct  │
                    │          │          │  Egress  │ Connect  │
┌───────────────────┼──────────┼──────────┼──────────┼──────────┤
│ EC2 → EC2         │   FREE   │ $0.01/GB │ $0.09/GB │ $0.02/GB │
│ EC2 → S3          │   FREE   │   FREE   │    N/A   │   FREE   │
│ EC2 → Internet    │   N/A    │   N/A    │ $0.09/GB │   N/A    │
│ RDS → EC2 (same)  │   FREE   │ $0.01/GB │   N/A    │   N/A    │
│ CloudFront → user │   N/A    │   N/A    │ $0.0085+ │   N/A    │
└───────────────────┴──────────┴──────────┴──────────┴──────────┘

REAL-WORLD EXAMPLE:
  App servers in us-east-1a calling RDS in us-east-1b:
  • 10 million requests/day × 10KB response = 100GB/day
  • 100GB × $0.01 = $1/day = $365/year just for cross-AZ traffic
  • Solution: Deploy RDS in same AZ as primary app tier
```

### API Call Costs (Often Overlooked)

```bash
# DynamoDB API cost calculation
# $0.25 per million write request units
# $0.0125 per million read request units (eventually consistent)

# 100M writes/month  = $25
# 1B reads/month     = $12.50
# Total API         = $37.50/month

# S3 API costs
# $0.005 per 1,000 PUT/COPY/POST
# $0.0004 per 1,000 GET

# 10M S3 PUTs/month  = $50
# 100M S3 GETs/month = $40
```

---

## 3. Reserved Instances & Savings Plans

### RI vs Savings Plans Comparison

| Dimension | Reserved Instances | Compute Savings Plans | EC2 Instance SP |
|---|---|---|---|
| Flexibility | Instance family locked | Any EC2 + Fargate + Lambda | Specific region + family |
| Discount depth | Up to 72% | Up to 66% | Up to 72% |
| Scope | Instance type specific | Compute spend | Instance family, region |
| Exchange | Convertible RIs only | N/A (automatic) | N/A |
| Applies to | EC2, RDS, ElastiCache | EC2, Fargate, Lambda | EC2 (specific family) |
| Best for | Stable, predictable workloads | Mixed/flexible compute | Stable family, flexible size |

### Commitment Levels and Break-Even

```
SAVINGS PLAN BREAK-EVEN ANALYSIS

On-Demand rate:     $0.192/hr (m5.xlarge, us-east-1)
1yr No Upfront SP:  $0.119/hr (38% savings)
1yr All Upfront SP: $0.109/hr (43% savings)
3yr All Upfront SP: $0.073/hr (62% savings)

Break-even for 1yr All Upfront:
  Upfront cost = $0.109 × 8,760hr = $955/yr
  On-demand equivalent = $0.192 × 8,760hr = $1,682/yr
  Break-even: If you run this instance > 5,584 hours/year (64%)
              you save money with All Upfront

COVERAGE TARGET FORMULA:
  Baseline utilization (P20 percentile of hourly usage) = commit this
  Peak usage = cover with On-Demand or Spot

  Example:
  ┌────────────────────────────────────────────────────────┐
  │ Hourly compute spend over 30 days                      │
  │                                                        │
  │  $500 ┤          ╭───╮    ╭──╮                        │
  │  $400 ┤    ╭─────╯   ╰────╯  ╰──────╮                 │
  │  $300 ┤────╯                         ╰──────╮          │
  │  $200 ┤                               (P20) ╰─────     │
  │  $100 ┤                                                │
  │       └────────────────────────────────────────────── │
  │                                                        │
  │  Commit: $200/hr (P20 baseline)                        │
  │  Flex:   remainder on On-Demand/Spot                   │
  └────────────────────────────────────────────────────────┘
```

### Standard vs Convertible Reserved Instances

```
CONVERTIBLE RI EXCHANGE RULES:
  • Can exchange for any RI of equal or greater value
  • Exchange fee: $0 (but you lose the value differential)
  • Example: t3.xlarge RI → m5.large RI (if equal cost)

RECOMMENDATION MATRIX:
  ┌─────────────────────────────┬─────────────────┬─────────────────┐
  │ Workload Type               │ RI Type         │ Reason          │
  ├─────────────────────────────┼─────────────────┼─────────────────┤
  │ Stable, known instance type │ Standard RI     │ Max discount    │
  │ Might change instance type  │ Convertible RI  │ Flexibility     │
  │ Might change region         │ Savings Plan    │ Region-flexible │
  │ Variable compute mix        │ Compute SP      │ Any EC2/Lambda  │
  └─────────────────────────────┴─────────────────┴─────────────────┘
```

### AWS CLI: Analyze RI Coverage

```bash
# Check RI utilization (want >90%)
aws ce get-reservation-utilization \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --query 'Total.{Utilization:UtilizationPercentage,UnusedHours:UnusedHours}'

# Check RI coverage (what % of usage is covered by RIs)
aws ce get-reservation-coverage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --query 'Total.CoverageHours'

# Get savings plan recommendations
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS
```

---

## 4. Spot Instances / Preemptible VMs

### Spot Interruption Handling

Spot instances receive a 2-minute warning before termination via instance metadata:

```bash
# Poll for interruption notice (run on the instance)
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/spot/interruption-action)

  if [ "$STATUS" = "200" ]; then
    echo "SPOT INTERRUPTION NOTICE - graceful shutdown initiated"
    # Save state, drain connections, notify load balancer
    systemctl stop app-server
    aws s3 sync /tmp/checkpoints s3://my-bucket/checkpoints/
    break
  fi
  sleep 5
done
```

### Spot Fleet Diversification

```
SPOT FLEET DIVERSIFICATION STRATEGY

BAD (Single instance type — high interruption risk):
  ┌──────────────────────────────────────────┐
  │  All m5.xlarge in us-east-1a             │
  │  Interruption rate: HIGH                  │
  └──────────────────────────────────────────┘

GOOD (Diversified fleet — low interruption probability):
  ┌──────────────────────────────────────────────────────────────┐
  │  m5.xlarge    (us-east-1a, 1b, 1c)  — 30% of target        │
  │  m5a.xlarge   (us-east-1a, 1b, 1c)  — 20% of target        │
  │  m4.xlarge    (us-east-1a, 1b)      — 20% of target        │
  │  m5.2xlarge   (us-east-1b, 1c)      — 20% of target        │
  │  r5.xlarge    (us-east-1a, 1b, 1c)  — 10% of target        │
  │                                                              │
  │  Allocation: capacity-optimized (picks pools with most       │
  │              capacity, reducing interruptions)               │
  └──────────────────────────────────────────────────────────────┘
```

### Spot Fleet Configuration

```json
{
  "SpotFleetRequestConfig": {
    "AllocationStrategy": "capacityOptimized",
    "TargetCapacity": 20,
    "IamFleetRole": "arn:aws:iam::123:role/SpotFleetRole",
    "LaunchTemplateConfigs": [
      {
        "LaunchTemplateSpecification": {
          "LaunchTemplateId": "lt-0123456789abcdef",
          "Version": "$Latest"
        },
        "Overrides": [
          {"InstanceType": "m5.xlarge",  "WeightedCapacity": 1},
          {"InstanceType": "m5a.xlarge", "WeightedCapacity": 1},
          {"InstanceType": "m4.xlarge",  "WeightedCapacity": 1},
          {"InstanceType": "m5.2xlarge", "WeightedCapacity": 2},
          {"InstanceType": "r5.xlarge",  "WeightedCapacity": 1}
        ]
      }
    ],
    "SpotMaintenanceStrategies": {
      "CapacityRebalance": {
        "ReplacementStrategy": "launch-before-terminate"
      }
    }
  }
}
```

### Karpenter for Kubernetes

Karpenter replaces Cluster Autoscaler with a smarter, cost-aware node provisioner:

```yaml
# NodePool with spot preference and fallback to on-demand
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64", "arm64"]
        - key: node.kubernetes.io/instance-type
          operator: In
          # Explicitly allow multiple families for diversification
          values: ["m5.xlarge", "m5a.xlarge", "m4.xlarge", "m5.2xlarge",
                   "c5.xlarge", "c5a.xlarge", "r5.xlarge"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: default
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
    expireAfter: 720h  # Cycle nodes every 30 days
```

### Spot-Friendly Architecture Patterns

```
SPOT-FRIENDLY DESIGN CHECKLIST:

  ✓ Stateless workers (no local state to lose)
  ✓ Work queue based (SQS, Kafka) — jobs re-enqueued on interruption
  ✓ Checkpoint support — save progress every N items
  ✓ Idempotent processing — safe to re-process
  ✓ Short job duration (<2 hrs to avoid interruption risk)

WORKLOAD SPOT SUITABILITY:

  Perfect for Spot:                 Not Suitable for Spot:
  • Batch data processing           • Leader nodes (control planes)
  • ML training (checkpointed)      • Primary databases
  • Video transcoding               • Session-critical services
  • CI/CD build workers             • Stateful applications
  • Web crawlers                    • Low-latency trading systems
  • Image/PDF generation
```

---

## 5. Right-Sizing

### CPU/Memory Utilization Analysis

Right-sizing starts with actual usage data, not provisioned capacity:

```bash
# Get EC2 CPU utilization for all instances over 14 days
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-15T00:00:00Z \
  --period 3600 \
  --statistics Average,Maximum \
  --query 'sort_by(Datapoints, &Timestamp)[*].{Time:Timestamp,Avg:Average,Max:Maximum}'

# AWS Compute Optimizer recommendations
aws compute-optimizer get-ec2-instance-recommendations \
  --filters Name=Finding,Values=OVER_PROVISIONED \
  --query 'instanceRecommendations[*].{
    InstanceId:instanceArn,
    Current:currentInstanceType,
    Recommended:recommendationOptions[0].instanceType,
    Savings:recommendationOptions[0].estimatedMonthlySavings.value
  }'
```

### Right-Sizing Decision Matrix

```
RIGHT-SIZING THRESHOLDS (14-day average):

  CPU Util  | Memory Util | Action
  ──────────┼─────────────┼─────────────────────────────────────────
  <10%      | <20%        | Downsize 2 sizes (e.g., m5.2xlarge → m5.large)
  10-20%    | 20-40%      | Downsize 1 size (m5.2xlarge → m5.xlarge)
  20-70%    | 40-80%      | Correctly sized ✓
  >85%      | >85%        | Upsize — performance risk
  <10%      | >70%        | Switch to memory-optimized family (r5)
  >70%      | <20%        | Switch to compute-optimized family (c5)
```

### Graviton Migration Savings

AWS Graviton (ARM-based) processors offer ~20% better price/performance:

```
GRAVITON MIGRATION SAVINGS EXAMPLE:

  Current:  50× m5.2xlarge     On-Demand: $0.384/hr each = $691/day
  Migrate:  50× m6g.2xlarge    On-Demand: $0.308/hr each = $554/day

  Daily savings:   $137
  Monthly savings: $4,110
  Annual savings:  $49,320

  Combine with Savings Plan:
  3yr m6g.2xlarge All Upfront: $0.128/hr each = $230/day
  Annual savings vs m5 On-Demand: $168,000/yr
```

```bash
# Check Compute Optimizer for Graviton recommendations
aws compute-optimizer get-ec2-instance-recommendations \
  --query 'instanceRecommendations[*].recommendationOptions[*] |
    [?contains(instanceType, `g.`)]' \
  --output table
```

---

## 6. Storage Optimization

### S3 Lifecycle Policies

```
S3 STORAGE CLASS COST COMPARISON (per GB/month):

  Standard          $0.023   ██████████████████████  Hot access
  Intelligent-Tier  $0.023   ██████████████████████  Auto-tiers
  Standard-IA       $0.0125  ████████████            Infrequent (retrieval fee)
  One Zone-IA       $0.01    ██████████              Single AZ (retrieval fee)
  Glacier Instant   $0.004   ████                    Archive + fast retrieval
  Glacier Flex      $0.0036  ███                     Archive (3-5hr retrieval)
  Glacier Deep      $0.00099 █                       Cold archive (12hr+)
```

```xml
<!-- S3 Lifecycle Policy — tiered cost optimization -->
<LifecycleConfiguration>
  <Rule>
    <Id>CostOptimization</Id>
    <Status>Enabled</Status>
    <Filter><Prefix>logs/</Prefix></Filter>
    <Transition>
      <Days>30</Days>
      <StorageClass>STANDARD_IA</StorageClass>
    </Transition>
    <Transition>
      <Days>90</Days>
      <StorageClass>GLACIER</StorageClass>
    </Transition>
    <Transition>
      <Days>365</Days>
      <StorageClass>DEEP_ARCHIVE</StorageClass>
    </Transition>
    <Expiration>
      <Days>2555</Days>  <!-- 7 years for compliance -->
    </Expiration>
    <NoncurrentVersionTransition>
      <NoncurrentDays>7</NoncurrentDays>
      <StorageClass>GLACIER</StorageClass>
    </NoncurrentVersionTransition>
    <NoncurrentVersionExpiration>
      <NoncurrentDays>30</NoncurrentDays>
    </NoncurrentVersionExpiration>
  </Rule>
</LifecycleConfiguration>
```

### EBS Volume Optimization

```bash
# Find overprovisioned EBS volumes (low IOPS utilization)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EBS \
  --metric-name VolumeReadOps \
  --dimensions Name=VolumeId,Value=vol-1234567890abcdef \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-15T00:00:00Z \
  --period 86400 \
  --statistics Average

# Find unattached EBS volumes (pure waste)
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}' \
  --output table

# Cost of common EBS types:
# gp3: $0.08/GB-month (baseline 3,000 IOPS included)
# gp2: $0.10/GB-month (IOPS scales with size — often overprovisioned)
# io1: $0.125/GB-month + $0.065/IOPS-month
#
# Migrate gp2 → gp3: instant 20% storage savings + decouple IOPS from size
aws ec2 modify-volume \
  --volume-id vol-1234567890abcdef \
  --volume-type gp3 \
  --iops 3000 \
  --throughput 125
```

### Snapshot Cleanup

```bash
# Find snapshots older than 90 days not associated with AMIs
aws ec2 describe-snapshots \
  --owner-ids self \
  --query "Snapshots[?StartTime<='2024-10-01'].{ID:SnapshotId,Size:VolumeSize,Date:StartTime}" \
  --output table

# Delete orphaned snapshots (snapshots whose source volume is deleted)
SNAPSHOTS=$(aws ec2 describe-snapshots --owner-ids self \
  --query "Snapshots[?!Description.contains(@, 'AMI')].SnapshotId" \
  --output text)

for snap in $SNAPSHOTS; do
  VOLUME=$(aws ec2 describe-snapshots --snapshot-ids $snap \
    --query 'Snapshots[0].VolumeId' --output text)
  if [ "$VOLUME" = "vol-ffffffff" ]; then
    echo "Orphaned snapshot: $snap — safe to delete"
  fi
done
```

---

## 7. Kubernetes Cost Management

### Resource Requests vs Limits — The Hidden Cost

```
KUBERNETES RESOURCE ALLOCATION PROBLEM:

  Pod requests 2 CPU, limits 4 CPU, actual usage 0.3 CPU

  ┌────────────────────────────────────────────────────┐
  │  Node: 16 CPU                                      │
  │                                                    │
  │  Pod A: requested 2 CPU ██████████               │
  │         actual use  0.3 CPU ██                   │
  │                                                    │
  │  Pod B: requested 2 CPU ██████████               │
  │         actual use  0.4 CPU ██                   │
  │                                                    │
  │  Pod C: requested 2 CPU ██████████               │
  │         actual use  0.2 CPU █                    │
  │                                                    │
  │  USED BY SCHEDULER:  6/16 CPU (37.5%)             │
  │  ACTUALLY USED:      0.9/16 CPU (5.6%)            │
  │                                                    │
  │  You're paying for 16 CPUs, using 0.9 CPU         │
  │  Effective utilization: 5.6%                       │
  └────────────────────────────────────────────────────┘

SOLUTION: Set requests = actual P99 usage, not a generous estimate
```

### Namespace Cost Allocation with Kubecost

```bash
# Install Kubecost
helm repo add kubecost https://kubecost.github.io/cost-analyzer
helm install kubecost kubecost/cost-analyzer \
  --namespace kubecost \
  --create-namespace \
  --set kubecostToken="your-token"

# Query namespace costs via Kubecost API
curl "http://kubecost.cluster.local:9090/model/allocation?window=30d&aggregate=namespace" \
  | jq '.data[0] | to_entries[] | {namespace: .key, cost: .value.totalCost}'
```

### VPA (Vertical Pod Autoscaler) for Right-Sizing

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Off"  # Recommendation only — apply manually first
  resourcePolicy:
    containerPolicies:
      - containerName: app
        minAllowed:
          cpu: "50m"
          memory: "64Mi"
        maxAllowed:
          cpu: "2"
          memory: "2Gi"
```

```bash
# Check VPA recommendations
kubectl describe vpa my-app-vpa | grep -A 20 "Recommendation"
# Look for:
#   Lower Bound: 100m / 128Mi
#   Target:      250m / 256Mi
#   Upper Bound: 500m / 512Mi
# If current request is 1CPU/1Gi → significant savings possible
```

### Cluster Autoscaler Efficiency

```
CLUSTER AUTOSCALER TUNING FOR COST:

  Default (safe):
    scale-down-delay-after-add: 10m
    scale-down-unneeded-time: 10m

  Aggressive (cost optimized, spot-aware):
    scale-down-delay-after-add: 5m
    scale-down-unneeded-time: 5m
    scale-down-utilization-threshold: 0.5  # Scale down if node <50% utilized

  Cost savings from faster scale-down:
  • Dev/staging clusters idle overnight: 14hrs × 10 nodes × $0.192/hr = $26.88/night
  • With fast scale-down: near $0 overnight cost
```

---

## 8. Tagging Strategy

### Mandatory Tag Taxonomy

```
REQUIRED TAGS FOR EVERY RESOURCE:

  Tag Key          | Example Values       | Purpose
  ─────────────────┼──────────────────────┼──────────────────────────────
  Environment      | prod/staging/dev/test | Cost by environment
  Team             | platform/payments/ml  | Team chargeback
  Product          | checkout/search/auth  | Product-level P&L
  CostCenter       | CC-1234               | Finance allocation
  Owner            | user@company.com      | Escalation contact
  Project          | PROJ-4521             | Jira project code
  ManagedBy        | terraform/manual      | IaC governance
  CreatedDate      | 2025-01-15            | Age-based cleanup
```

### Tag Enforcement with AWS Config

```bash
# Create Config rule to check for required tags
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "required-tags",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "REQUIRED_TAGS"
  },
  "InputParameters": "{
    \"tag1Key\": \"Environment\",
    \"tag2Key\": \"Team\",
    \"tag3Key\": \"CostCenter\",
    \"tag4Key\": \"Owner\"
  }",
  "Scope": {
    "ComplianceResourceTypes": [
      "AWS::EC2::Instance",
      "AWS::RDS::DBInstance",
      "AWS::ElastiCache::CacheCluster",
      "AWS::S3::Bucket"
    ]
  }
}'

# Terraform: enforce tags at provider level
provider "aws" {
  default_tags {
    tags = {
      Environment = var.environment
      Team        = var.team
      CostCenter  = var.cost_center
      ManagedBy   = "terraform"
    }
  }
}
```

### Showback vs Chargeback

```
SHOWBACK MODEL:
  • Show teams their costs, no actual billing transfer
  • Good for cultural change without political friction
  • "Your team spent $45,000 last month"
  • Report monthly, review in team meetings

CHARGEBACK MODEL:
  • Actually transfer cloud costs to team's budget
  • Stronger incentive to optimize
  • Requires accurate tagging (untagged costs are orphaned)
  • Needs executive support and team buy-in

CHARGEBACK FORMULA:
  Team cost = Tagged team resources + (Shared resource cost × allocation factor)

  Allocation factor options:
  • Equal split: total shared / number of teams
  • Usage-based: team's API calls / total API calls
  • CPU-hours: team's workload CPU hours / total CPU hours
```

---

## 9. Cost Monitoring & Alerting

### AWS Cost Explorer Analysis

```bash
# Daily cost breakdown by service (last 30 days)
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity DAILY \
  --metrics "BlendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[*].{Date:TimePeriod.Start,Groups:Groups[*].{Service:Keys[0],Cost:Metrics.BlendedCost.Amount}}' \
  | jq '.[] | {date: .Date, top: (.Groups | sort_by(.Cost | tonumber) | reverse | .[0:5])}'

# Top 10 cost drivers by resource tag
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=TAG,Key=Team \
  --output table

# Month-over-month change detection
aws ce get-cost-and-usage \
  --time-period Start=2024-12-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics "BlendedCost"
```

### Budget Alerts Configuration

```bash
# Create budget with tiered alerts
aws budgets create-budget --account-id 123456789012 --budget '{
  "BudgetName": "Monthly-Team-Platform",
  "BudgetLimit": {"Amount": "50000", "Unit": "USD"},
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "CostFilters": {
    "TagKeyValue": ["user:Team$platform"]
  }
}' --notifications-with-subscribers '[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 50,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "platform-team@company.com"}]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {"SubscriptionType": "EMAIL", "Address": "platform-team@company.com"},
      {"SubscriptionType": "SNS", "Address": "arn:aws:sns:us-east-1:123:cost-alerts"}
    ]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "finops@company.com"}]
  }
]'
```

### Anomaly Detection

```bash
# Create anomaly monitor for all services
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName": "AllServicesMonitor",
  "MonitorType": "DIMENSIONAL",
  "MonitorDimension": "SERVICE"
}'

# Create alert subscription for anomalies >$500
aws ce create-anomaly-subscription \
  --anomaly-subscription '{
    "SubscriptionName": "AnomalyAlert-500",
    "MonitorArnList": ["arn:aws:ce::123:anomalymonitor/abc123"],
    "Subscribers": [
      {"Address": "finops@company.com", "Type": "EMAIL"}
    ],
    "Threshold": 500,
    "Frequency": "DAILY"
  }'
```

### Daily Cost Digest (Lambda + SES)

```python
import boto3
from datetime import date, timedelta

def send_daily_cost_report():
    ce = boto3.client('ce')
    today = date.today()
    yesterday = today - timedelta(days=1)

    response = ce.get_cost_and_usage(
        TimePeriod={
            'Start': str(yesterday),
            'End': str(today)
        },
        Granularity='DAILY',
        Metrics=['UnblendedCost'],
        GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}]
    )

    groups = response['ResultsByTime'][0]['Groups']
    sorted_costs = sorted(
        groups,
        key=lambda x: float(x['Metrics']['UnblendedCost']['Amount']),
        reverse=True
    )

    report = f"Daily Cost Report — {yesterday}\n\n"
    total = sum(float(g['Metrics']['UnblendedCost']['Amount']) for g in groups)
    report += f"Total: ${total:,.2f}\n\nTop Services:\n"

    for g in sorted_costs[:10]:
        cost = float(g['Metrics']['UnblendedCost']['Amount'])
        report += f"  {g['Keys'][0]:40s} ${cost:>10,.2f}\n"

    # Send via SES
    ses = boto3.client('ses')
    ses.send_email(
        Source='finops@company.com',
        Destination={'ToAddresses': ['engineering@company.com']},
        Message={
            'Subject': {'Data': f'Daily Cost Report: ${total:,.0f}'},
            'Body': {'Text': {'Data': report}}
        }
    )
```

---

## 10. Waste Detection

### Automated Waste Scanner

```bash
#!/bin/bash
# waste-scanner.sh — Find unused/idle AWS resources

echo "=== WASTE SCAN REPORT ==="

echo "--- Unattached EBS Volumes ---"
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,AZ:AvailabilityZone}' \
  --output table

echo "--- Unassociated Elastic IPs ---"
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].{IP:PublicIp,AllocationId:AllocationId}' \
  --output table
# Cost: $0.005/hr per unassociated EIP = $3.60/month each

echo "--- Idle Load Balancers (no healthy targets) ---"
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[*].LoadBalancerArn' \
  --output text | tr '\t' '\n' | while read arn; do
    TARGETS=$(aws elbv2 describe-target-health \
      --target-group-arn $(aws elbv2 describe-target-groups \
        --load-balancer-arn $arn \
        --query 'TargetGroups[0].TargetGroupArn' --output text) \
      --query 'TargetHealthDescriptions[?TargetHealth.State==`healthy`]' \
      --output text 2>/dev/null)
    if [ -z "$TARGETS" ]; then
      echo "Potentially idle ALB: $arn"
    fi
done

echo "--- Old Snapshots (>90 days) ---"
aws ec2 describe-snapshots \
  --owner-ids self \
  --query "Snapshots[?StartTime<='$(date -d '90 days ago' +%Y-%m-%d)'].{ID:SnapshotId,Size:VolumeSize,Date:StartTime}" \
  --output table

echo "--- Stopped EC2 Instances (still paying for EBS) ---"
aws ec2 describe-instances \
  --filters Name=instance-state-name,Values=stopped \
  --query 'Reservations[*].Instances[*].{ID:InstanceId,Type:InstanceType,Stopped:StateTransitionReason}' \
  --output table

echo "--- Idle RDS instances (<5% CPU last 7 days) ---"
aws rds describe-db-instances \
  --query 'DBInstances[*].DBInstanceIdentifier' \
  --output text | tr '\t' '\n' | while read db; do
    AVG_CPU=$(aws cloudwatch get-metric-statistics \
      --namespace AWS/RDS \
      --metric-name CPUUtilization \
      --dimensions Name=DBInstanceIdentifier,Value=$db \
      --start-time $(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%SZ) \
      --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
      --period 604800 \
      --statistics Average \
      --query 'Datapoints[0].Average' --output text 2>/dev/null)
    if (( $(echo "$AVG_CPU < 5" | bc -l) )); then
      echo "Idle RDS: $db (CPU: ${AVG_CPU}%)"
    fi
done
```

### Waste Cost Impact Table

| Resource Type | Typical Waste | Monthly Cost | Annual Waste |
|---|---|---|---|
| Unattached EBS gp3 100GB | Common after instance termination | $8/vol | $96 |
| Unassociated EIP | Often left after NAT changes | $3.60 each | $43 |
| Idle ALB | After app decommission | $16–$25/mo | $300 |
| Stopped m5.xlarge (EBS) | Forgotten dev instances | $6–20 (EBS only) | $240 |
| Old snapshots (1TB) | Never cleaned up | $50 | $600 |
| Idle RDS db.r5.large | Dev DB left running | $146/mo | $1,752 |
| Unused RI (not sold) | Wrong instance type | $100–500/mo | $6,000 |

---

## 11. Data Transfer Costs

### Data Transfer Cost Breakdown

```
AWS DATA TRANSFER PRICING (us-east-1, simplified):

INGRESS (into AWS):
  Internet → EC2/S3        FREE

WITHIN AWS:
  Same AZ (private IP)     FREE
  Cross-AZ                 $0.01/GB each direction
  Cross-Region             $0.01–$0.02/GB (varies by region pair)

EGRESS (out of AWS):
  EC2/S3 → Internet        $0.09/GB (first 10TB/month)
                           $0.085/GB (next 40TB)
                           $0.07/GB  (next 100TB)

VPC ENDPOINTS:
  S3/DynamoDB Gateway      FREE (replaces internet path)
  Interface endpoints      $0.01/GB + $0.01/AZ/hr

NAT GATEWAY:
  Processing               $0.045/GB
  Hourly charge            $0.045/hr = $32.40/month per AZ
```

### Optimizing Data Transfer Costs

```
ANTI-PATTERN: App → NAT Gateway → S3
  • Pays $0.045/GB NAT processing fee
  • Also pays NAT hourly charge
  • Completely unnecessary for S3

SOLUTION: S3 Gateway Endpoint (FREE)
  • Traffic stays within AWS network
  • No NAT processing fee
  • Same region: completely free

  terraform:
  resource "aws_vpc_endpoint" "s3" {
    vpc_id       = aws_vpc.main.id
    service_name = "com.amazonaws.us-east-1.s3"
    route_table_ids = [aws_route_table.private.id]
  }

MONTHLY SAVINGS EXAMPLE:
  100GB/day EC2 → S3 through NAT:
  100 × 30 × $0.045 = $135/month saved with free gateway endpoint
```

### Cross-AZ Traffic Optimization

```bash
# Find top cross-AZ traffic contributors using VPC Flow Logs
# First, query Athena on Flow Logs

SELECT
  srcaddr,
  dstaddr,
  SUM(bytes) as total_bytes,
  SUM(bytes) * 0.01 / 1073741824 as estimated_cost_usd
FROM vpc_flow_logs
WHERE
  SUBSTRING(availability_zone, 1, 10) != SUBSTRING(dst_az, 1, 10)
  AND action = 'ACCEPT'
GROUP BY srcaddr, dstaddr
ORDER BY total_bytes DESC
LIMIT 20;
```

### CloudFront vs Direct Egress

```
DIRECT EGRESS vs CLOUDFRONT COMPARISON (1TB/month):

  Direct EC2 → Internet:   1,000 GB × $0.09 = $90.00
  CloudFront distribution: 1,000 GB × $0.0085 = $8.50 (US/EU)
                         + $0.0075/10K HTTPS requests

  Net savings: ~$81/month per TB
  Additional benefits:
  • Reduced origin traffic (cache hit ratio typically 70-90%)
  • Lower load on EC2 instances
  • Global edge caching

  EFFECTIVE SAVINGS with 80% cache hit rate:
  • Direct: $90 (1TB origin egress)
  • CloudFront: $8.50 (1TB CDN) + $18 (0.2TB origin) = $26.50
  • Savings: $63.50/TB/month
```

---

## 12. Real-World Cost Reduction: $500K → $300K/Month

### The $500K Bill Scenario

```
INITIAL BILL BREAKDOWN (Month 1):
  EC2 Compute (On-Demand)    $210,000  (42%)
  RDS Multi-AZ               $125,000  (25%)
  Data Transfer              $ 80,000  (16%)
  S3 Storage                 $ 40,000  ( 8%)
  Load Balancers / NAT       $ 20,000  ( 4%)
  Misc                       $ 25,000  ( 5%)
  TOTAL                      $500,000
```

### Phase 1: Quick Wins (Month 1–2, Target: Save $80K)

```
ACTION 1: Waste Elimination
  Unattached EBS volumes:       48 volumes × 500GB avg = $1,920/month  ✓ Deleted
  Unassociated EIPs:           120 EIPs × $3.60 = $432/month           ✓ Released
  Idle ALBs:                    15 ALBs × $20 = $300/month             ✓ Removed
  Oversized dev RDS (8 DBs):   $8,000/month → smaller instances        ✓ Rightsized
  TOTAL QUICK WIN:              ~$12,000/month

ACTION 2: S3 Lifecycle Policies
  Logs bucket (2PB total):
    Before: 2,000TB × $0.023 = $46,000/month
    After tiering:
      Hot (30 days):    50TB × $0.023 = $1,150
      IA (31-90 days):  200TB × $0.0125 = $2,500
      Glacier (90d+):   1,750TB × $0.004 = $7,000
      New total: $10,650/month
  SAVINGS: $35,350/month

ACTION 3: VPC Endpoints (S3 + DynamoDB)
  Traffic through NAT to S3/DynamoDB: 50TB/month
  NAT processing savings: 50,000GB × $0.045 = $2,250/month
  SAVINGS: $2,250/month

PHASE 1 TOTAL SAVINGS: ~$50,000/month
```

### Phase 2: Reservations & Right-Sizing (Month 2–4, Target: Save $100K)

```
ACTION 4: Purchase Savings Plans
  Analysis: $210,000/month EC2 On-Demand
  P20 baseline: $140,000/month consistent usage

  1yr Compute Savings Plan at $140,000/month commitment:
  Discount: ~37% on committed spend
  Savings: $140,000 × 0.37 = $51,800/month

ACTION 5: EC2 Right-Sizing (Compute Optimizer findings)
  Over-provisioned instances found: 180 instances
  Average recommended downsize: 1 size class
  Cost reduction: $18,000/month

ACTION 6: Graviton Migration (m5 → m6g)
  100 instances migrated: 20% price reduction
  Savings: $12,000/month

ACTION 7: RDS Reserved Instances
  Stable RDS instances: $90,000/month On-Demand
  1yr All Upfront RI coverage (60%): $54,000 × 0.40 = $21,600 savings
  SAVINGS: $21,600/month

PHASE 2 TOTAL SAVINGS: ~$103,400/month
```

### Phase 3: Architecture Optimization (Month 4–6, Target: Save $50K)

```
ACTION 8: Cross-AZ Traffic Reduction
  Move app tier to same AZ as RDS primary:
  Cross-AZ traffic reduced: 300TB/month × $0.01 = $3,000/month saved

ACTION 9: CloudFront for API responses
  Before: 500TB/month EC2 direct egress × $0.09 = $45,000
  After:  Cache-eligible responses via CloudFront (70% hit rate)
    CloudFront: 500TB × $0.0085 = $4,250
    Origin: 150TB × $0.09 = $13,500
    Total: $17,750
  SAVINGS: $27,250/month

ACTION 10: Spot for Batch Workloads
  Batch processing on On-Demand: $15,000/month
  Migrate to Spot (70% discount): $4,500/month
  SAVINGS: $10,500/month

PHASE 3 TOTAL SAVINGS: ~$40,750/month
```

### Final Results

```
COST REDUCTION SUMMARY:

  Initial Monthly Bill:         $500,000

  Phase 1 (Waste + Storage):  - $50,000
  Phase 2 (RIs + Rightsizing): - $103,400
  Phase 3 (Architecture):      - $40,750

  Final Monthly Bill:           $305,850

  TOTAL REDUCTION:              $194,150/month (38.8%)
  ANNUAL SAVINGS:               $2,329,800

EFFORT BREAKDOWN:
  ┌──────────────────────────────────┬──────────┬─────────────┐
  │ Initiative                       │ Savings  │ Effort      │
  ├──────────────────────────────────┼──────────┼─────────────┤
  │ S3 Lifecycle Policies            │ $35,350  │ Low (1 day) │
  │ Savings Plans purchase           │ $51,800  │ Low (1 hr)  │
  │ EC2 Right-sizing                 │ $18,000  │ Med (2 wks) │
  │ RDS Reserved Instances           │ $21,600  │ Low (1 hr)  │
  │ CloudFront offload               │ $27,250  │ Med (1 wk)  │
  │ Graviton migration               │ $12,000  │ Med (2 wks) │
  │ Waste cleanup                    │ $12,000  │ Low (2 days)│
  │ Spot for batch                   │ $10,500  │ Med (1 wk)  │
  │ VPC endpoints                    │ $ 2,250  │ Low (1 day) │
  │ Cross-AZ reduction               │ $ 3,000  │ Med (1 wk)  │
  └──────────────────────────────────┴──────────┴─────────────┘
```

### FinOps Maturity Model

```
FINOPS MATURITY LEVELS:

  CRAWL (0-3 months):
  • Cost visibility established (tagging, Cost Explorer)
  • Monthly reviews started
  • Quick waste cleanup done
  • First budget alerts configured

  WALK (3-6 months):
  • RI/Savings Plan coverage >60%
  • Right-sizing program running
  • Team-level cost allocation
  • Anomaly detection active

  RUN (6-12 months):
  • Cost embedded in CI/CD (infracost PR comments)
  • Per-feature unit economics tracked
  • Automated waste cleanup
  • Spot adoption >30% of eligible workloads
  • FinOps KPIs on engineering dashboards

GOLDEN METRICS:
  • RI/SP Coverage:        target >80%
  • RI/SP Utilization:     target >90% (unused = pure waste)
  • Spot Adoption:         target >30% eligible workloads
  • Tagging Coverage:      target >95% resources tagged
  • Unit Cost Trend:       decreasing cost per transaction/user/request
```

---

## Quick Reference: Cost Optimization CLI Cheatsheet

```bash
# === DISCOVERY ===

# Top 10 most expensive resources by tag
aws ce get-cost-and-usage \
  --time-period Start=$(date -d 'last month' +%Y-%m-01),End=$(date +%Y-%m-01) \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=TAG,Key=Team --output table

# Find all untagged EC2 instances
aws resourcegroupstaggingapi get-resources \
  --resource-type-filters ec2:instance \
  --tag-filters Key=Team,Values= \
  --query 'ResourceTagMappingList[?!(Tags[?Key==`Team`])].ResourceARN'

# Compute Optimizer summary
aws compute-optimizer get-recommendation-summaries \
  --query 'recommendationSummaries[*].{Type:resourceType,Savings:savingsOpportunity}'

# === RESERVATIONS ===

# Current savings plan utilization
aws ce get-savings-plans-utilization \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --query 'Total.{Utilized:UtilizationPercentage,Unused:UnusedSavingsPlansDetails}'

# Expiring RIs (next 60 days)
aws ec2 describe-reserved-instances \
  --filters Name=state,Values=active \
  --query "ReservedInstances[?to_number(End) < to_number('$(date -d '60 days' +%s)000')].{ID:ReservedInstancesId,Type:InstanceType,Exp:End}"

# === COST EXPLORER API ===

# Cost by linked account (organizations)
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=LINKED_ACCOUNT --output table

# Data transfer costs specifically
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions": {"Key": "USAGE_TYPE_GROUP", "Values": ["EC2: Data Transfer - Internet"]}}'
```

---

## Interview Answer Frameworks

### "How would you reduce our AWS bill by 30%?"

```
STRUCTURED RESPONSE:

1. ASSESS FIRST (1 week)
   • Enable Cost Explorer, pull 3-month trend
   • Identify top 5 cost drivers
   • Run Compute Optimizer scan
   • Audit tagging coverage

2. QUICK WINS (2-4 weeks, target 10-15%)
   • Waste cleanup (unattached EBS, idle EIPs, ALBs)
   • S3 lifecycle policies for logs/archives
   • Dev/staging auto-shutdown schedules

3. MEDIUM EFFORT (1-3 months, target 15-20%)
   • Purchase Savings Plans based on P20 baseline
   • Right-size over-provisioned instances
   • S3 Intelligent-Tiering for uncertain access patterns

4. ARCHITECTURAL (3-6 months, target 5-10%)
   • CloudFront for cacheable API responses
   • Spot for eligible batch workloads
   • Graviton migration for steady-state workloads
   • VPC endpoints for S3/DynamoDB
```

### "How do you build a FinOps culture?"

```
THREE-PILLAR ANSWER:

1. VISIBILITY
   • Every team sees their costs daily (dashboard link in Slack)
   • Anomalies trigger immediate notification to team lead
   • Monthly cost review in engineering all-hands

2. ACCOUNTABILITY
   • Each team owns their AWS spend (tagged resources)
   • Cost is a KPI alongside latency/reliability
   • "Cost-per-request" tracked with business metrics

3. INCENTIVES
   • Savings shared back to teams for reinvestment
   • Cost wins highlighted in engineering blog
   • Architecture reviews include cost estimation (infracost)
```
