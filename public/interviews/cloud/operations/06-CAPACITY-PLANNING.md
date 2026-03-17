# Capacity Planning — Forecasting, Right-Sizing, and Scaling

> Operations Perspective | Cloud Infrastructure | Interview Prep Series

---

## 1. Why Capacity Planning Matters

Capacity planning is the practice of determining the production capacity needed by an organization to meet changing demands. Getting it wrong in either direction is expensive.

### The Cost of Under-Provisioning

Under-provisioning means your system cannot handle traffic. Consequences:

- **Latency spikes**: P99 latency goes from 50ms to 5000ms under load
- **Error rate increases**: 5xx responses, timeouts, connection refused
- **Revenue loss**: For Amazon, a 100ms delay cost ~1% in sales (2006 study)
- **SLA breaches**: Customer refunds, legal liability
- **Cascading failures**: One overloaded service causes downstream timeouts

**Real dollar example — e-commerce site under Black Friday load:**

```
Normal load:   500 req/s    → $50,000/hr revenue
Black Friday: 5000 req/s   → $500,000/hr potential revenue

Without capacity planning:
  System saturates at 800 req/s
  503 errors for 4,200 req/s = $420,000/hr lost revenue
  4-hour peak = $1,680,000 in lost sales
```

### The Cost of Over-Provisioning

Over-provisioning wastes money. In cloud environments this is especially measurable:

```
Example: 100 x m5.2xlarge instances running 24/7
  Cost: 100 × $0.384/hr × 8,760 hr/yr = $336,384/yr

If average CPU utilization is 8% (common without right-sizing):
  Useful compute: 8% × $336,384 = $26,911/yr
  Waste: $309,473/yr

With right-sizing to m5.large (25% of m5.2xlarge capacity):
  100 × $0.096/hr × 8,760 = $84,096/yr
  Same workload, 75% cost reduction
```

### The Right Mental Model

Capacity planning is not about 100% utilization. It is about **headroom management**:

```
                    Capacity Utilization Sweet Spot

100% ┤                                    ╔═══════╗
     │                                    ║ OVER  ║
 80% ┤════════════════════════════════════╣THRESH-╠════ SLA breach zone
     │          TARGET ZONE               ║ OLD   ║
 60% ┤     ╔══════════════════════════╗   ╚═══════╝
     │     ║                          ║
 40% ┤     ║  Optimal: 40-70% CPU     ║
     │     ║  allows for spikes       ║
 20% ┤     ╚══════════════════════════╝
     │
  0% ┤═══════════════════════════════════════════════▶ Time
         Headroom buffer for safe operation
```

**Target utilization guidelines by resource type:**

| Resource        | Target Utilization | Max Sustained | Reasoning                        |
|-----------------|-------------------|---------------|----------------------------------|
| CPU (compute)   | 40-70%            | 80%           | Headroom for bursts              |
| Memory          | 60-80%            | 90%           | GC and spike tolerance           |
| Disk I/O        | 60-70%            | 85%           | Write buffering overhead         |
| Network         | 50-60%            | 75%           | TCP retransmit avoidance         |
| DB Connections  | 60-70%            | 85%           | Connection pool saturation       |

---

## 2. The Capacity Planning Cycle

Capacity planning is a continuous loop, not a one-time event:

```
        ┌─────────────────────────────────────────────────────┐
        │                CAPACITY PLANNING CYCLE               │
        └─────────────────────────────────────────────────────┘

    ┌─────────┐    ┌──────────┐    ┌────────┐    ┌───────────┐    ┌──────────┐
    │ MEASURE │───▶│FORECAST  │───▶│  PLAN  │───▶│ PROVISION │───▶│ VALIDATE │
    │         │    │          │    │        │    │           │    │          │
    │Collect  │    │Analyze   │    │Design  │    │Deploy     │    │Load test │
    │metrics  │    │trends    │    │arch.   │    │infra      │    │Monitor   │
    │Baselines│    │Model     │    │Estimate│    │Configure  │    │Compare   │
    │         │    │growth    │    │costs   │    │scaling    │    │to plan   │
    └─────────┘    └──────────┘    └────────┘    └───────────┘    └──────────┘
         ▲                                                               │
         └───────────────────────────────────────────────────────────────┘
                              Feedback loop
```

### Phase 1: Measure

Establish baselines for every layer of your stack:

```bash
# CPU utilization — 30-day average per instance
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T00:00:00Z \
  --period 3600 \
  --statistics Average Maximum \
  --output table

# Memory utilization (requires CloudWatch agent)
aws cloudwatch get-metric-statistics \
  --namespace CWAgent \
  --metric-name mem_used_percent \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T00:00:00Z \
  --period 86400 \
  --statistics Average p99

# Network throughput
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name NetworkIn \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

**Key metrics to baseline:**

```
Application Layer:
  - Request rate (req/s) — peak, average, p95
  - Response time (ms) — p50, p95, p99, p999
  - Error rate (%) — 4xx, 5xx separately
  - Active connections

Infrastructure Layer:
  - CPU utilization — user%, system%, iowait%
  - Memory utilization — used, cached, buffers, swap
  - Disk I/O — read/write IOPS, throughput MB/s, latency ms
  - Network — bytes in/out, packets, errors, drops

Business Layer:
  - Transactions per second
  - Concurrent users
  - Revenue per hour (for ROI justification)
```

### Phase 2: Forecast

Use collected data to project future needs. Covered in detail in Section 7.

### Phase 3: Plan

Translate forecasts into infrastructure specifications:

```
Capacity Plan Document Template:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service: checkout-api
Current State:
  - 10x m5.large instances
  - Average CPU: 35%, Memory: 52%
  - Peak CPU: 68%, Memory: 71%
  - Handles: 1,200 req/s peak

Forecast (Q4, Black Friday):
  - Expected 4x traffic spike
  - Target: 4,800 req/s peak

Plan:
  - Scale to 45 instances (4x + 12.5% headroom)
  - Implement Auto Scaling with target 60% CPU
  - Pre-warm 25 instances 2 hours before event
  - DB read replicas: 2 → 5
  - Cache layer: 1 node → 3 nodes
  - CDN: Enable, offload 60% static traffic

Cost Impact:
  - Current: $4,320/month
  - Black Friday week: $12,960/week (7x)
  - Annual increase: $8,640 for planned events
```

### Phase 4: Provision

Infrastructure-as-Code changes, not manual clicks:

```bash
# Terraform example — updating ASG capacity for planned event
terraform apply -var="min_capacity=25" \
                -var="max_capacity=100" \
                -var="desired_capacity=40"

# Kubernetes — update HPA limits
kubectl patch hpa checkout-api \
  -p '{"spec":{"minReplicas":10,"maxReplicas":50}}'
```

### Phase 5: Validate

Run load tests against the new capacity. Covered in Section 6.

---

## 3. Right-Sizing Instances

Right-sizing is the process of matching instance type and size to actual workload requirements. It is one of the highest ROI cloud optimization activities.

### AWS Compute Optimizer

AWS Compute Optimizer uses ML to analyze 14 days of CloudWatch metrics and recommends optimal instance types:

```bash
# Get recommendations for all EC2 instances in account
aws compute-optimizer get-ec2-instance-recommendations \
  --region us-east-1 \
  --output json | jq '.instanceRecommendations[] | {
    instance: .instanceArn,
    currentType: .currentInstanceType,
    finding: .finding,
    recommendations: [.recommendationOptions[].instanceType]
  }'

# Get recommendations for specific instance
aws compute-optimizer get-ec2-instance-recommendations \
  --instance-arns arn:aws:ec2:us-east-1:123456789:instance/i-0abc123 \
  --output json | jq '.instanceRecommendations[0].recommendationOptions'
```

**Compute Optimizer findings explained:**

| Finding     | Meaning                                            | Action                      |
|-------------|----------------------------------------------------|-----------------------------|
| OVER_PROVISIONED | CPU/memory consistently low (< 40% avg)       | Downsize instance           |
| UNDER_PROVISIONED | CPU/memory consistently high (> 80% avg)     | Upsize instance             |
| OPTIMIZED   | Usage is within expected bands                     | No change needed            |
| NOT_OPTIMIZED | Insufficient data (< 30 hours)                   | Wait or check metrics       |

### Manual Right-Sizing Analysis

When Compute Optimizer is unavailable or you need deeper analysis:

```bash
# Collect CPU stats for all instances over 14 days
#!/bin/bash
INSTANCES=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' \
  --output text)

for INSTANCE_ID in $INSTANCES; do
  echo "=== $INSTANCE_ID ==="

  # Average CPU
  AVG_CPU=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/EC2 \
    --metric-name CPUUtilization \
    --dimensions Name=InstanceId,Value=$INSTANCE_ID \
    --start-time $(date -v-14d +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date +%Y-%m-%dT%H:%M:%SZ) \
    --period 1209600 \
    --statistics Average \
    --query 'Datapoints[0].Average' \
    --output text)

  # Max CPU (p99 equivalent using Maximum)
  MAX_CPU=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/EC2 \
    --metric-name CPUUtilization \
    --dimensions Name=InstanceId,Value=$INSTANCE_ID \
    --start-time $(date -v-14d +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date +%Y-%m-%dT%H:%M:%SZ) \
    --period 1209600 \
    --statistics Maximum \
    --query 'Datapoints[0].Maximum' \
    --output text)

  echo "  Avg CPU: $AVG_CPU%   Max CPU: $MAX_CPU%"
done
```

### Instance Family Selection Guide

Different workloads need different instance families:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS EC2 INSTANCE FAMILY GUIDE                    │
├─────────────┬───────────────┬──────────────┬────────────────────────┤
│ Family      │ vCPU:Memory   │ Use Case     │ Examples               │
├─────────────┼───────────────┼──────────────┼────────────────────────┤
│ m7g/m6i     │ 1:4           │ General      │ Web servers, app tier  │
│ c7g/c6i     │ 1:2           │ Compute      │ CPU-intensive, ML infer│
│ r7g/r6i     │ 1:8           │ Memory       │ Caches, in-memory DBs  │
│ x2gd        │ 1:16          │ High Memory  │ Large in-memory DBs    │
│ i4i/i3      │ 1:4 + NVMe   │ Storage      │ NoSQL, data warehouses │
│ p4d/g5      │ 1:4 + GPU    │ ML Training  │ Deep learning          │
│ inf2/inf1   │ Custom        │ ML Inference │ Model serving          │
│ t4g/t3      │ 1:4 (burst)  │ Burstable    │ Dev, low-traffic sites │
└─────────────┴───────────────┴──────────────┴────────────────────────┘
```

**CPU-to-memory ratio decision tree:**

```
What is your workload?
  │
  ├─▶ Processing data (transforms, compression, encoding)?
  │     └─▶ Compute-optimized (c7g) — 1:2 ratio
  │
  ├─▶ Running databases, caches, JVM heaps?
  │     └─▶ Memory-optimized (r7g) — 1:8 ratio
  │
  ├─▶ Mixed workload (web API, microservices)?
  │     └─▶ General purpose (m7g) — 1:4 ratio
  │
  └─▶ Development / low-traffic / variable workload?
        └─▶ Burstable (t4g) — cheapest option
```

### Graviton (ARM) vs x86 Savings

AWS Graviton3 (ARM) instances are 20-40% cheaper for same performance:

```bash
# Compare m6i.2xlarge vs m7g.2xlarge pricing
# m6i.2xlarge (x86): $0.384/hr
# m7g.2xlarge (ARM): $0.3136/hr
# Savings: 18.3%

# Migrate to Graviton — check if your container image is ARM-compatible
docker buildx build --platform linux/arm64 -t myapp:arm64 .

# ECS task definition — specify ARM architecture
{
  "requiresCompatibilities": ["FARGATE"],
  "runtimePlatform": {
    "cpuArchitecture": "ARM64",
    "operatingSystemFamily": "LINUX"
  }
}
```

---

## 4. Horizontal vs Vertical Scaling

### Comparison

| Dimension          | Horizontal (Scale Out)              | Vertical (Scale Up)                 |
|--------------------|-------------------------------------|-------------------------------------|
| Mechanism          | Add more instances                  | Larger instance size                |
| Downtime           | None (with load balancer)           | Brief restart required              |
| Cost curve         | Linear                              | Non-linear (larger = less efficient)|
| State management   | Complex (distributed state)         | Simple (shared memory)              |
| Failure domain     | One instance failure = low impact   | One instance failure = outage       |
| Ceiling            | Very high (theoretically unlimited) | Hard limit (largest instance size)  |
| Best for           | Stateless services, web tier        | Databases, legacy monoliths         |

### When to Scale Vertically

- Stateful workloads where distributing state is complex (single-node DB, Redis)
- Legacy applications not designed for horizontal scale
- Short-term fix when horizontal scaling requires architectural changes
- When the bottleneck is single-threaded performance (some DB workloads)

```bash
# Vertical scale example — RDS instance resize
aws rds modify-db-instance \
  --db-instance-identifier prod-postgres \
  --db-instance-class db.r6g.4xlarge \
  --apply-immediately

# Note: this causes ~2 min downtime for Multi-AZ (failover)
# Plan for 20-30 min for Single-AZ
```

### When to Scale Horizontally

- Stateless services (web tier, API tier, workers)
- When you need redundancy and high availability
- When vertical scaling ceiling is reached
- When cost efficiency matters (many small > few large)

### Pre-warming

Auto-scaling reacts to load — there is always a lag. Pre-warming provisions capacity before load arrives:

```bash
# Pre-warm ASG for known event (e.g., Black Friday at 8pm EST)
# Set this up 2 hours before expected spike

# Manual pre-warm — set desired capacity
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name prod-web-asg \
  --desired-capacity 40

# Scheduled pre-warm — better approach for recurring events
aws autoscaling put-scheduled-action \
  --auto-scaling-group-name prod-web-asg \
  --scheduled-action-name black-friday-prewarm \
  --start-time "2024-11-29T18:00:00Z" \
  --desired-capacity 40 \
  --min-size 40 \
  --max-size 100

# Clean up after event
aws autoscaling put-scheduled-action \
  --auto-scaling-group-name prod-web-asg \
  --scheduled-action-name black-friday-scale-down \
  --start-time "2024-11-30T06:00:00Z" \
  --desired-capacity 10 \
  --min-size 5 \
  --max-size 50
```

**Pre-warming time estimates by service type:**

| Service            | Warm-up Time | Notes                                    |
|--------------------|-------------|------------------------------------------|
| EC2 instance       | 3-5 min     | Plus app startup time                    |
| ECS Fargate task   | 30-60 sec   | Plus container pull time                 |
| Lambda (cold start)| 100-500ms   | Provisioned concurrency eliminates this  |
| RDS Multi-AZ       | 20-30 min   | After resize, not after normal failover  |
| ALB target         | 5-15 min    | ALB connection draining                  |
| CloudFront         | 15-30 min   | For new distributions to propagate       |

---

## 5. Auto-Scaling Deep Dive

### Target Tracking Scaling

The simplest and most effective policy. You specify a target metric value and AWS maintains it:

```bash
# Target tracking — maintain 60% average CPU
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-web-asg \
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
```

**Cooldown periods explained:**

```
Scale-out cooldown (60s): After scaling OUT, wait 60s before scaling OUT again
  └─▶ Prevents over-provisioning during rapid traffic growth

Scale-in cooldown (300s): After scaling IN, wait 300s before scaling IN again
  └─▶ Prevents removing instances too fast (stable period check)

                Time ──────────────────────────────────▶
CPU%  90 ┤                     ╔═══╗
         │                ╔════╝   ╚═══╗
      60 ┤────────────────╬───────────╬──────────── Target
         │           ╔════╝           ╚════╗
      30 ┤───────────╝                     ╚═════────
         └──┬──────────┬───────────────┬──────────────
            │          │               │
          Scale       Scale           Scale
          out         out             in
          event      blocked          event
                     (cooldown)
```

### Step Scaling

More granular — take different actions at different thresholds:

```bash
# Step scaling policy — larger step for more severe overload
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-web-asg \
  --policy-name cpu-step-scale-out \
  --policy-type StepScaling \
  --adjustment-type PercentChangeInCapacity \
  --step-adjustments '[
    {
      "MetricIntervalLowerBound": 0,
      "MetricIntervalUpperBound": 20,
      "ScalingAdjustment": 25
    },
    {
      "MetricIntervalLowerBound": 20,
      "MetricIntervalUpperBound": 40,
      "ScalingAdjustment": 50
    },
    {
      "MetricIntervalLowerBound": 40,
      "ScalingAdjustment": 100
    }
  ]'
```

**Step scaling visualization:**

```
CPU%  above target (70%):
  │
  ├─ 70-90% (20% above):  Add 25% more instances
  ├─ 90-110% (40% above): Add 50% more instances
  └─ 110%+   (40%+ above): Double instances (+100%)

Example: Currently 10 instances at 95% CPU
  95% is 25% above target (70%)
  Falls in second band: Add 50%
  New desired: 10 × 1.5 = 15 instances
```

### Predictive Scaling

Uses ML to forecast load based on historical patterns and provisions ahead of time:

```bash
# Enable predictive scaling
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-web-asg \
  --policy-name predictive-scaling \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications": [{
      "TargetValue": 60,
      "PredefinedMetricPairSpecification": {
        "PredefinedMetricType": "ASGCPUUtilization"
      }
    }],
    "Mode": "ForecastAndScale",
    "SchedulingBufferTime": 300,
    "MaxCapacityBreachBehavior": "IncreaseMaxCapacity"
  }'

# Check forecast
aws autoscaling get-predictive-scaling-forecast \
  --auto-scaling-group-name prod-web-asg \
  --policy-name predictive-scaling \
  --start-time "2024-11-29T00:00:00Z" \
  --end-time "2024-11-30T00:00:00Z"
```

### Custom Metrics Scaling

Scale on any CloudWatch metric — business metrics, app metrics, queue depth:

```bash
# Scale on application request rate (custom metric)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name prod-web-asg \
  --policy-name request-rate-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "CustomizedMetricSpecification": {
      "MetricName": "RequestCountPerTarget",
      "Namespace": "AWS/ApplicationELB",
      "Dimensions": [{
        "Name": "TargetGroup",
        "Value": "targetgroup/prod-web-tg/1234567890"
      }],
      "Statistic": "Sum"
    },
    "TargetValue": 1000,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

### SQS Queue Depth Scaling

Scale worker instances based on SQS queue depth — a critical pattern for async workloads:

```bash
# Create alarm for queue depth
aws cloudwatch put-metric-alarm \
  --alarm-name sqs-queue-deep \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --dimensions Name=QueueName,Value=order-processing-queue \
  --statistic Average \
  --period 60 \
  --threshold 100 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:autoscaling:us-east-1:123:scalingPolicy:abc123

# Target tracking on SQS — scale to maintain ~10 messages per worker
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name order-worker-asg \
  --policy-name sqs-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "CustomizedMetricSpecification": {
      "Metrics": [{
        "Id": "visible",
        "MetricStat": {
          "Metric": {
            "Namespace": "AWS/SQS",
            "MetricName": "ApproximateNumberOfMessagesVisible",
            "Dimensions": [{"Name": "QueueName", "Value": "order-processing-queue"}]
          },
          "Period": 60,
          "Stat": "Sum"
        }
      }, {
        "Id": "capacity",
        "Expression": "SERVICE_METRIC",
        "MetricStat": {
          "Metric": {
            "Namespace": "AWS/AutoScaling",
            "MetricName": "GroupInServiceCapacity",
            "Dimensions": [{"Name": "AutoScalingGroupName", "Value": "order-worker-asg"}]
          },
          "Period": 60,
          "Stat": "Average"
        }
      }, {
        "Id": "backlog_per_instance",
        "Expression": "visible / capacity"
      }]
    },
    "TargetValue": 10
  }'
```

**SQS scaling math:**

```
Formula: desired_workers = ceil(queue_depth / messages_per_worker_per_minute)

Example:
  Queue depth: 500 messages
  Worker processes: 50 messages/minute
  Processing time target: 2 minutes

  desired_workers = ceil(500 / (50 × 2)) = ceil(5) = 5 workers

  To process in 1 minute:
  desired_workers = ceil(500 / 50) = 10 workers
```

### Kubernetes HPA

```yaml
# HPA with CPU and memory targets
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: checkout-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: checkout-api
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 5
        periodSeconds: 60
      - type: Percent
        value: 50
        periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 2
        periodSeconds: 60
```

---

## 6. Load Testing for Capacity

Load testing validates your capacity plan. The goal is to find breaking points before production traffic does.

### k6 — Modern Load Testing

```javascript
// k6 load test — realistic ramp pattern
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  stages: [
    { duration: '2m',  target: 100  },  // Ramp up to 100 users
    { duration: '5m',  target: 100  },  // Hold at 100 (baseline)
    { duration: '2m',  target: 500  },  // Ramp to 500 (normal peak)
    { duration: '5m',  target: 500  },  // Hold at 500
    { duration: '2m',  target: 2000 },  // Ramp to 2000 (stress)
    { duration: '5m',  target: 2000 },  // Hold at 2000
    { duration: '2m',  target: 5000 },  // Ramp to 5000 (spike)
    { duration: '3m',  target: 5000 },  // Hold at spike
    { duration: '2m',  target: 0    },  // Scale down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // Latency SLOs
    errors: ['rate<0.01'],                            // <1% error rate
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  // Browse product
  const browseRes = http.get('https://api.example.com/products/123');
  check(browseRes, { 'browse OK': (r) => r.status === 200 });

  sleep(1); // Think time

  // Add to cart
  const cartRes = http.post('https://api.example.com/cart', JSON.stringify({
    productId: '123',
    quantity: 1,
  }), { headers: { 'Content-Type': 'application/json' } });
  check(cartRes, { 'cart OK': (r) => r.status === 201 });

  sleep(2);

  // Checkout
  const start = Date.now();
  const checkoutRes = http.post('https://api.example.com/checkout', JSON.stringify({
    cartId: cartRes.json('cartId'),
    paymentMethod: 'card',
  }), { headers: { 'Content-Type': 'application/json' } });
  checkoutDuration.add(Date.now() - start);

  check(checkoutRes, { 'checkout OK': (r) => r.status === 200 });
  errorRate.add(checkoutRes.status !== 200);

  sleep(1);
}
```

```bash
# Run the test
k6 run --out cloud load-test.js

# Run with output to InfluxDB for Grafana visualization
k6 run --out influxdb=http://localhost:8086/k6 load-test.js
```

### Locust — Python-based Load Testing

```python
# locustfile.py
from locust import HttpUser, task, between
from locust import events
import json
import random

class CheckoutUser(HttpUser):
    wait_time = between(1, 3)  # Think time between requests

    def on_start(self):
        """Called when user starts — login"""
        response = self.client.post("/auth/login", json={
            "username": f"user_{random.randint(1, 10000)}@test.com",
            "password": "testpassword"
        })
        self.token = response.json().get("token", "")
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(10)  # Weight: 10x more browsing than purchasing
    def browse_products(self):
        product_id = random.randint(1, 1000)
        with self.client.get(
            f"/products/{product_id}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code != 200:
                response.failure(f"Got {response.status_code}")

    @task(3)
    def search_products(self):
        terms = ["laptop", "phone", "tablet", "headphones", "keyboard"]
        self.client.get(
            f"/search?q={random.choice(terms)}",
            headers=self.headers
        )

    @task(1)  # Weight: 1x — less frequent checkout
    def checkout(self):
        # Add item
        add_response = self.client.post(
            "/cart/items",
            json={"productId": random.randint(1, 1000), "qty": 1},
            headers=self.headers
        )
        if add_response.status_code == 201:
            cart_id = add_response.json().get("cartId")
            # Checkout
            self.client.post(
                "/orders",
                json={"cartId": cart_id, "paymentToken": "tok_test"},
                headers=self.headers
            )
```

```bash
# Run Locust with web UI
locust -f locustfile.py --host=https://api.example.com

# Run headless (for CI/CD)
locust -f locustfile.py \
  --host=https://api.example.com \
  --users 2000 \
  --spawn-rate 50 \
  --run-time 10m \
  --headless \
  --csv=results
```

### Identifying Bottlenecks During Load Tests

```
Bottleneck Identification Matrix:

SYMPTOM                          LIKELY CAUSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
High CPU, low latency increase   → Need more compute (scale out)
High latency, low CPU            → I/O bound (DB, network, disk)
Memory increasing (no plateau)   → Memory leak
Latency spike at specific RPS    → Connection pool exhaustion
HTTP 503 errors                  → Target group health checks failing
HTTP 504 timeouts                → Downstream service slow
TCP connection refused           → Socket exhaustion (ulimit)
Garbage collection pauses        → JVM heap too small
DB connection timeouts           → Connection pool limit hit
High disk I/O wait               → Storage IOPS limit reached
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
# Check for TCP socket exhaustion during load test
ss -s  # Socket statistics summary
cat /proc/sys/net/ipv4/ip_local_port_range  # Available port range

# Check connection pool saturation (PostgreSQL example)
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
psql -c "SHOW max_connections;"

# Check file descriptor limits
ulimit -n  # Current limit
cat /proc/$(pgrep -f "node server")/fd | wc -l  # FDs in use
```

---

## 7. Forecasting Demand

### Historical Analysis

Start with what you have. Plot your traffic over time and identify patterns:

```
Request Rate — Last 12 Weeks (illustrative)

req/s
 2000 ┤                                                          ╔══
      │                                                     ╔════╝
 1500 ┤                              ╔═══╗            ╔═════╝
      │                    ╔════╗    ║   ╚════╗  ╔════╝
 1000 ┤══════╗   ╔════╗    ║    ╚════╝        ╚══╝
      │      ╚═══╝    ╚════╝
  500 ┤
      └──┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───▶ Weeks
         1   2   3   4   5   6   7   8   9  10  11  12

Observed patterns:
  - Weekly cycle: peaks on Thu-Sat, troughs Mon-Tue
  - Steady weekly growth: ~8% week-over-week
  - Week 7 spike: product launch event
```

### Seasonal Decomposition

Decompose time series into: Trend + Seasonality + Residual

```python
# Python — seasonal decomposition using statsmodels
import pandas as pd
from statsmodels.tsa.seasonal import seasonal_decompose
import matplotlib.pyplot as plt

# Load hourly request data (12 weeks)
df = pd.read_csv('requests_per_hour.csv',
                  parse_dates=['timestamp'],
                  index_col='timestamp')

# Decompose with weekly seasonality (168 hours)
result = seasonal_decompose(df['requests'],
                              model='multiplicative',
                              period=168)

# Components:
# result.trend      — long-term growth trajectory
# result.seasonal   — repeating weekly pattern
# result.resid      — random noise / unexplained variance

# Forecast: trend × seasonal factor × growth rate
# For Black Friday week, multiply seasonal factor by known event multiplier
```

### Growth Modeling

For linear growth:
```
Forecast = Current × (1 + weekly_growth_rate)^n_weeks

Example:
  Current peak: 1,000 req/s
  Weekly growth: 5%
  Target: 8 weeks from now

  Forecast = 1,000 × (1.05)^8 = 1,477 req/s
```

For exponential growth (viral products, product launches):
```
Forecast = Current × e^(growth_rate × time)

Conservative planning: use 90th percentile of historical growth rate
Aggressive planning: use 95th percentile + scenario buffer
```

### Event-Driven Spike Planning (Black Friday)

```
Black Friday Capacity Planning Formula:

Step 1: Establish baseline (last 4 Fridays average)
  Average Friday peak: 1,200 req/s

Step 2: Apply Black Friday multiplier (from historical data or industry benchmarks)
  E-commerce industry: 5-10x Cyber Monday, 3-6x Black Friday
  Your last Black Friday: 4.2x
  Assumed this year: 5x (growth + marketing spend)

Step 3: Calculate target capacity
  Target peak: 1,200 × 5 = 6,000 req/s

Step 4: Add safety margin (20-30%)
  Provisioned capacity: 6,000 × 1.25 = 7,500 req/s

Step 5: Translate to instances
  Each instance handles 150 req/s at 60% CPU
  Required instances: ceil(7,500 / 150) = 50 instances
  Current: 10 instances
  Add: 40 instances (pre-warm 36 hours before)
```

---

## 8. Resource Quotas and Limits

### AWS Service Limits

AWS enforces default limits to prevent runaway costs and protect shared infrastructure:

```bash
# View current service quotas
aws service-quotas list-service-quotas \
  --service-code ec2 \
  --query 'Quotas[?Adjustable==`true`].{Name:QuotaName,Value:Value}' \
  --output table

# Common limits to check before scaling events
aws service-quotas get-service-quota \
  --service-code ec2 \
  --quota-code L-1216C47A  # Running On-Demand Standard instances

# Request limit increase (do this 2 weeks before planned events)
aws service-quotas request-service-quota-increase \
  --service-code ec2 \
  --quota-code L-1216C47A \
  --desired-value 500
```

**Critical limits to monitor for capacity planning:**

| Service           | Limit Type                      | Default | Impact if Hit                  |
|-------------------|---------------------------------|---------|--------------------------------|
| EC2               | vCPUs per region (on-demand)    | 32-384  | Cannot launch new instances    |
| ELB               | Targets per ALB                 | 1000    | Cannot register new targets    |
| RDS               | DB instances per region         | 40      | Cannot create read replicas    |
| ElastiCache       | Nodes per cluster               | 90      | Cannot scale cache             |
| SQS               | Messages in flight              | 120,000 | Consumer scaling fails         |
| Lambda            | Concurrent executions           | 1,000   | Throttling, 429 errors         |
| DynamoDB          | Table throughput (without PAY)  | varies  | Throttled requests             |
| VPC               | Subnets per VPC                 | 200     | No IP space for new instances  |

### Kubernetes Resource Quotas

Prevent any one namespace from consuming all cluster resources:

```yaml
# ResourceQuota — namespace-level limits
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "100"          # Total CPU requests
    requests.memory: 200Gi       # Total memory requests
    limits.cpu: "200"            # Total CPU limits
    limits.memory: 400Gi         # Total memory limits
    pods: "100"                  # Max pods
    services: "20"               # Max services
    persistentvolumeclaims: "20" # Max PVCs
    count/deployments.apps: "30" # Max deployments
```

```yaml
# LimitRange — per-pod/container defaults and bounds
apiVersion: v1
kind: LimitRange
metadata:
  name: production-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:          # Default limits if not specified
      cpu: "500m"
      memory: "512Mi"
    defaultRequest:   # Default requests if not specified
      cpu: "100m"
      memory: "128Mi"
    max:              # Maximum allowed per container
      cpu: "4"
      memory: "8Gi"
    min:              # Minimum allowed per container
      cpu: "50m"
      memory: "64Mi"
  - type: Pod
    max:
      cpu: "8"
      memory: "16Gi"
```

### Kubernetes Over-Commit Ratios

```
Memory over-commit:
  Physical memory: 256 GiB on node
  Memory limits sum: 512 GiB (2:1 over-commit)
  Memory requests sum: 192 GiB (0.75:1 under-commit)

  Why this works: containers rarely use their full limit
  Risk: OOMKiller terminates pods if limits are actually hit

CPU over-commit:
  Physical CPUs: 64 vCPU on node
  CPU limits sum: 128 vCPU (2:1 over-commit)
  CPU requests sum: 32 vCPU (0.5:1 under-commit)

  Why this works: CPU throttling (not OOM) — safer over-commit
  Risk: increased CPU throttling under high load

Recommended ratios:
  Memory: 1.2-1.5x over-commit (conservative)
  CPU:    2-4x over-commit (more aggressive, safe due to throttling)
```

---

## 9. Database Capacity

Database capacity is the most common bottleneck and the hardest to scale quickly.

### Connection Pooling

Databases have hard connection limits. Connection pools are essential:

```
Without connection pooling:
  100 app instances × 10 threads each = 1,000 connections to DB
  PostgreSQL default max_connections: 100
  Result: "too many connections" errors

With PgBouncer connection pooling:
  100 app instances × 10 threads → PgBouncer → 20 DB connections
  PgBouncer multiplexes many client connections to few server connections
```

```ini
# PgBouncer configuration
[databases]
myapp = host=postgres-primary port=5432 dbname=myapp

[pgbouncer]
listen_port = 5432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Pool mode: session | transaction | statement
pool_mode = transaction        # Best for most web apps
max_client_conn = 1000         # Max connections from apps
default_pool_size = 25         # Connections per database/user pair
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3       # Seconds before using reserve

# Important for capacity planning
server_idle_timeout = 600      # Close idle server connections
client_idle_timeout = 0        # Keep client connections open
```

### Read Replicas

Distribute read load across multiple replicas:

```bash
# Add read replica — RDS
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-postgres-replica-2 \
  --source-db-instance-identifier prod-postgres \
  --db-instance-class db.r6g.2xlarge \
  --availability-zone us-east-1b \
  --publicly-accessible false

# Check replication lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=prod-postgres-replica-1 \
  --start-time "$(date -v-1H +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date +%Y-%m-%dT%H:%M:%SZ)" \
  --period 60 \
  --statistics Average
```

**Read/Write split patterns:**

```
Application → Connection Router
                    │
           ┌────────┴────────┐
           │                 │
    ┌──────▼──────┐   ┌──────▼──────┐
    │   WRITES    │   │    READS    │
    │  Primary    │   │  Replicas   │
    │  db:5432    │   │  replica-1  │
    │             │   │  replica-2  │
    └─────────────┘   │  replica-3  │
                      └─────────────┘

  Read traffic split: Round-robin or geographic proximity
  Write traffic: Always to primary

  Replication lag consideration:
    < 100ms lag: Use replicas for most reads
    > 1s lag: Serve critical reads from primary, non-critical from replicas
```

### Storage Auto-Scaling

```bash
# Enable RDS storage auto-scaling
aws rds modify-db-instance \
  --db-instance-identifier prod-postgres \
  --max-allocated-storage 500 \  # Maximum 500 GiB
  --apply-immediately

# Alert when storage reaches 80%
aws cloudwatch put-metric-alarm \
  --alarm-name rds-storage-high \
  --namespace AWS/RDS \
  --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value=prod-postgres \
  --threshold 21474836480 \  # 20 GiB remaining
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2 \
  --period 300 \
  --statistic Average \
  --alarm-actions arn:aws:sns:us-east-1:123:ops-alerts
```

### IOPS Planning

```
IOPS requirements estimation:

PostgreSQL:
  Formula: IOPS = (transactions/sec × pages_per_transaction × page_size) / block_size

  Simple estimate: 1 TPS ≈ 3-10 IOPS (reads + writes + WAL)
  At 1,000 TPS: need ~5,000-10,000 IOPS

  gp3 SSD baseline: 3,000 IOPS (free)
  gp3 provisioned max: 16,000 IOPS
  io1/io2 provisioned: up to 256,000 IOPS

  Always provision 20% headroom above measured peak:
  If peak is 8,000 IOPS → provision 10,000 IOPS

MySQL InnoDB:
  Read IOPS: buffer_pool_hit_rate determines disk reads
  Aim for >99% buffer pool hit rate (most reads from memory)
  Write IOPS: determined by write workload + innodb_flush_log_at_trx_commit setting
```

### Sharding Decisions

```
Sharding is complex — avoid until necessary. Triggers for sharding:

1. Single instance cannot handle write throughput
2. Single instance maximum size exceeded (even with vertical scaling)
3. Table sizes exceed 500GB-1TB (query planning degrades)
4. Single-node failure risk too high for data size

Sharding strategies:
  Hash sharding:
    shard = hash(customer_id) % num_shards
    Pro: Even distribution
    Con: Cannot do range queries across shards

  Range sharding:
    shard = floor(customer_id / shard_size)
    Pro: Range queries stay on one shard
    Con: Hot spots if recent data is most active

  Directory sharding:
    Lookup table maps entity → shard
    Pro: Flexible, can rebalance without rehashing
    Con: Lookup table itself becomes bottleneck

Capacity planning for sharding:
  Start with 8-16 shards (even if 4 would do — future growth)
  Each shard should be 50-60% full maximum
  Leave room for resharding without immediate emergency
```

---

## 10. Queue and Async Capacity

### Consumer Scaling Patterns

```
Queue-based load leveling architecture:

Producers ──▶ ┌──────────────┐ ──▶ Consumers
              │  SQS Queue   │     (Auto-scaling group)
              │              │
              │ Depth: 0-∞   │     Scale based on:
              │              │       - ApproximateNumberOfMessagesVisible
              └──────────────┘       - Age of oldest message
                                     - Consumer CPU/memory

Scaling formula:
  messages_per_consumer_per_minute = throughput × 60
  required_consumers = ceil(queue_depth / (messages_per_consumer_per_minute × target_latency_minutes))

Example:
  Queue depth: 10,000 messages
  Each consumer: 100 msg/min
  Target: process all within 5 minutes
  Required consumers: ceil(10,000 / (100 × 5)) = 20 consumers
```

### Backpressure

Backpressure prevents producers from overwhelming consumers:

```python
# Producer with backpressure — check queue depth before sending
import boto3
import time

sqs = boto3.client('sqs')
QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/orders'
MAX_QUEUE_DEPTH = 10000  # Backpressure threshold

def send_with_backpressure(message: dict):
    while True:
        # Check queue depth
        attrs = sqs.get_queue_attributes(
            QueueUrl=QUEUE_URL,
            AttributeNames=['ApproximateNumberOfMessages']
        )
        depth = int(attrs['Attributes']['ApproximateNumberOfMessages'])

        if depth < MAX_QUEUE_DEPTH:
            sqs.send_message(
                QueueUrl=QUEUE_URL,
                MessageBody=json.dumps(message)
            )
            return
        else:
            # Queue is deep — slow down producer
            print(f"Backpressure applied: queue depth {depth}")
            time.sleep(1)
```

### Dead Letter Queues

```bash
# Create DLQ and configure source queue
aws sqs create-queue --queue-name orders-dlq

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123/orders-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# Configure main queue to use DLQ after 3 failures
aws sqs set-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123/orders \
  --attributes "{
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
  }"

# Alert on DLQ messages (should always be near 0)
aws cloudwatch put-metric-alarm \
  --alarm-name orders-dlq-not-empty \
  --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=orders-dlq \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --period 60 \
  --statistic Sum \
  --alarm-actions arn:aws:sns:us-east-1:123:ops-alerts
```

### Queue Depth Monitoring Dashboard

```
SQS Queue Health — Metrics to Monitor:

Metric                            Alert Threshold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ApproximateNumberOfMessages       > 1000 (warn), > 10000 (critical)
ApproximateAgeOfOldestMessage     > 300s (warn), > 600s (critical)
NumberOfMessagesSent              baseline ± 3σ (anomaly detection)
NumberOfMessagesReceived          < sent (consumer lagging alert)
NumberOfMessageDeleted            consumer throughput metric
ApproximateNumberOfMessages (DLQ) > 0 (immediate alert)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 11. Capacity Planning for Stateful Services

Stateful services cannot be horizontally scaled as freely as stateless ones. Planning must happen further in advance.

### Redis / ElastiCache Capacity

```bash
# Check Redis memory usage
redis-cli info memory | grep -E "used_memory_human|maxmemory_human|mem_fragmentation_ratio"

# Key metrics:
# used_memory: actual data size
# used_memory_rss: memory allocated by OS (includes fragmentation)
# maxmemory: configured limit
# mem_fragmentation_ratio: >1.5 means significant fragmentation

# Calculate cache hit rate
redis-cli info stats | grep -E "keyspace_hits|keyspace_misses"
# Hit rate = hits / (hits + misses) × 100
# Target: > 90% hit rate

# Eviction policy for capacity planning
redis-cli config get maxmemory-policy
# allkeys-lru: Evict least recently used — good for caches
# volatile-lru: Only evict keys with TTL — good for session stores
# noeviction: Return error when full — use with writes you cannot lose
```

**Redis cluster capacity planning:**

```
Single node sizing:
  Total cache size needed: 100 GB
  Fragmentation overhead: 1.3x
  Required maxmemory: 100 × 1.3 = 130 GB
  Add 20% headroom: 130 × 1.2 = 156 GB
  Use r6g.4xlarge ElastiCache node (122 GiB RAM) + replication

Redis Cluster (sharded):
  Total data: 500 GB
  3-node cluster with replication: each primary holds ~167 GB
  Use 3 × r6g.8xlarge (244 GiB each) = 48% utilization per node
  Scale trigger: > 70% utilization per shard
```

### Kafka / MSK Capacity

```
Kafka broker sizing formula:

Message retention:
  daily_volume_GB = messages_per_day × avg_message_size_bytes / 1e9
  retention_GB = daily_volume_GB × retention_days × replication_factor

Example:
  1 billion messages/day × 500 bytes = 500 GB/day
  7-day retention × 3 replicas = 500 × 7 × 3 = 10.5 TB
  Per broker (6 brokers): 10.5 / 6 = 1.75 TB per broker
  With 20% headroom: provision 2.5 TB per broker

Throughput:
  peak_MB_s = (peak_messages_per_second × avg_message_size) / 1e6
  with_replication = peak_MB_s × replication_factor
  per_broker = with_replication / num_brokers

  Target: < 80% of network bandwidth per broker
```

### Persistent Volume Capacity (Kubernetes)

```yaml
# StorageClass with volume expansion enabled
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true  # Allows online resize
volumeBindingMode: WaitForFirstConsumer

---
# PVC with monitoring annotation
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  annotations:
    # Alert when 80% full (requires custom monitoring)
    capacity-alert-threshold: "80"
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: fast-gp3
  resources:
    requests:
      storage: 200Gi
```

```bash
# Monitor PV usage in Kubernetes
kubectl exec -it postgres-0 -- df -h /var/lib/postgresql/data

# Expand PVC (online, no downtime for gp3)
kubectl patch pvc postgres-data \
  -p '{"spec":{"resources":{"requests":{"storage":"400Gi"}}}}'

# Verify expansion
kubectl describe pvc postgres-data | grep -A5 "Conditions:"
```

---

## 12. Real-World Capacity Plan: 10x Black Friday

### Scenario

E-commerce platform, normally handles 500 req/s, expecting 5,000 req/s on Black Friday.

```
Current Architecture:
  Load Balancer (ALB)
      │
      ├── Web Tier: 5 × c6i.xlarge EC2 (4 vCPU, 8 GB RAM)
      │   └── Node.js app, 100 req/s per instance @ 60% CPU
      │
      ├── API Tier: 10 × m6i.large EC2 (2 vCPU, 8 GB RAM)
      │   └── Java Spring Boot, 50 req/s per instance @ 55% CPU
      │
      ├── Cache: ElastiCache Redis, cache.r6g.large (2 vCPU, 13 GiB)
      │
      ├── Database: RDS PostgreSQL, db.r6g.2xlarge (8 vCPU, 64 GiB)
      │   └── 1 primary + 1 read replica
      │
      └── Queue: SQS, 10 × m6i.large worker instances
```

### Step 1: Capacity Calculation

```
Target: 5,000 req/s with P99 < 500ms

Web Tier:
  Current: 5 instances × 100 req/s = 500 req/s
  Required: 5,000 req/s / 100 req/s = 50 instances
  Add 25% headroom: ceil(50 × 1.25) = 63 instances
  Use ASG: min=10, desired=50, max=75

API Tier:
  Current: 10 instances × 50 req/s = 500 req/s
  Required: 5,000 req/s / 50 req/s = 100 instances
  Add 25% headroom: ceil(100 × 1.25) = 125 instances
  Use ASG: min=15, desired=100, max=150

Cache (Redis):
  Current: Single node, 13 GiB
  Working set at 10x load: ~65 GiB (estimated 5x data accessed)
  Upgrade to: cache.r6g.4xlarge (122 GiB) — single node
  Or: 2-node cluster (cache.r6g.2xlarge × 2)
  Add read replica for high availability

Database:
  Current: 1 primary + 1 replica
  Write TPS at 10x: ~500 TPS (20% of traffic writes)
  Read TPS at 10x: ~4,500 read TPS
  Action:
    - Upgrade primary: db.r6g.2xlarge → db.r6g.4xlarge
    - Add read replicas: 1 → 4 read replicas
    - Add PgBouncer: pool to 50 connections per replica
  IOPS check:
    At 500 write TPS: ~3,000 write IOPS needed
    Upgrade gp3 storage IOPS: 3,000 → 10,000

Queue Workers:
  Normal: 10 workers processing 5,000 orders/hour
  Black Friday: 50,000 orders/hour
  Required workers: 100
  Use ASG: min=10, desired=60, max=120 (scale on queue depth)
```

### Step 2: Timeline

```
Black Friday Preparation Timeline:

T-14 days:
  ├── Request AWS service limit increases (EC2 vCPUs, RDS instances)
  ├── Order Reserved Instances if using spot instances
  └── Review and update Terraform modules for new capacity

T-7 days:
  ├── Run full load test at 5,000 req/s in staging
  ├── Fix any bottlenecks identified
  ├── Update ASG max capacities in production
  └── Add additional read replicas (warm up replication lag)

T-3 days:
  ├── Run final load test with event-specific flows
  ├── Verify all monitoring and alerts are active
  ├── Runbook review with on-call team
  └── Pre-create AMIs for faster instance launch

T-24 hours:
  ├── Check queue backlogs are cleared
  ├── Verify cache warmup (pre-populate top products)
  └── Test DB connections and pool sizes

T-2 hours (6am Black Friday):
  ├── Execute scheduled scaling actions:
  │   aws autoscaling set-desired-capacity \
  │     --auto-scaling-group-name web-asg --desired-capacity 50
  │   aws autoscaling set-desired-capacity \
  │     --auto-scaling-group-name api-asg --desired-capacity 100
  │   aws autoscaling set-desired-capacity \
  │     --auto-scaling-group-name worker-asg --desired-capacity 60
  ├── Warm up load balancer (send test traffic)
  └── All-hands war room staffed

T+0 (8am - Black Friday start):
  ├── Monitor dashboards: CloudWatch, Datadog
  ├── Watch error rate, latency, queue depth
  └── Be ready to execute runbooks

T+12 hours (scale down begins):
  └── Reduce desired capacity back to normal + 20%

T+48 hours (full scale down):
  └── Return to normal capacity, review post-mortem data
```

### Step 3: Cost Estimate

```
Black Friday Week Cost Breakdown:

                Normal/Week    BF Week     Delta
Web Tier        $504           $6,372      +$5,868  (×12.6)
API Tier        $672           $8,400      +$7,728  (×12.5)
Cache           $120           $480        +$360    (×4.0)
Database        $840           $2,520      +$1,680  (×3.0)
Data Transfer   $200           $2,000      +$1,800  (×10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total           $2,336/wk      $19,772/wk  +$17,436

Revenue (5,000 req/s × 8-hour peak × ~$2 AOV × 2% conversion):
  = 5,000 × 28,800s × 0.02 × $2 = $5,760,000

ROI on capacity investment:
  Infrastructure cost: $17,436
  Potential revenue: $5,760,000
  Cost as % of revenue: 0.3%

  Cost of under-provisioning (if site crashes for 2 hours):
  = 5,000 req/s × 7,200s × 0.02 × $2 = $1,440,000 lost
  vs $17,436 investment → Obvious choice
```

### Step 4: Runbooks

```bash
# Runbook: Emergency scale-out if auto-scaling too slow
#!/bin/bash
# Run this if CPU > 90% and auto-scaling not responding fast enough

echo "=== EMERGENCY SCALE-OUT ==="
echo "Current time: $(date)"

# Double web tier capacity immediately
CURRENT=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names web-asg \
  --query 'AutoScalingGroups[0].DesiredCapacity')

NEW_CAPACITY=$(($CURRENT * 2))
echo "Scaling web-asg from $CURRENT to $NEW_CAPACITY"

aws autoscaling set-desired-capacity \
  --auto-scaling-group-name web-asg \
  --desired-capacity $NEW_CAPACITY

# Double API tier
CURRENT_API=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names api-asg \
  --query 'AutoScalingGroups[0].DesiredCapacity')

NEW_API=$(($CURRENT_API * 2))
echo "Scaling api-asg from $CURRENT_API to $NEW_API"

aws autoscaling set-desired-capacity \
  --auto-scaling-group-name api-asg \
  --desired-capacity $NEW_API

echo "=== Watch for instances to come healthy ==="
watch -n 10 "aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names web-asg api-asg \
  --query 'AutoScalingGroups[].{Name:AutoScalingGroupName,Desired:DesiredCapacity,InService:Instances[?LifecycleState==\`InService\`]|length(@)}'"
```

---

## Quick Reference Formulas

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAPACITY PLANNING FORMULA SHEET

Instances needed:
  N = ceil((peak_requests_per_second × target_latency_seconds) / max_concurrent_per_instance)
  N_with_headroom = ceil(N / target_utilization)  e.g., / 0.70 for 70% target

SQS worker scaling:
  workers = ceil(queue_depth / (throughput_per_worker_per_min × target_drain_minutes))

Redis memory:
  required = dataset_GB × fragmentation_multiplier (1.3) × headroom (1.2)

Database IOPS:
  IOPS ≈ TPS × iops_per_transaction (3-10 for PostgreSQL)
  provision = ceil(peak_IOPS × 1.2)

Storage capacity:
  storage = (daily_data_GB × retention_days × replication_factor) × 1.3

Growth forecast:
  future_load = current_load × (1 + weekly_growth_rate)^weeks
  event_load = baseline × event_multiplier × safety_margin

Cost of downtime:
  loss_per_hour = revenue_per_hour × downtime_probability × (1 - partial_service_factor)

ROI on capacity investment:
  ROI = (prevented_loss - capacity_cost) / capacity_cost × 100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Interview Question Patterns

**Common capacity planning interview questions and key points to hit:**

**Q: "How would you prepare your infrastructure for a 10x traffic spike?"**
- Mention the full cycle: measure baseline → calculate requirements → provision ahead → validate with load test
- Pre-warming is critical — auto-scaling has lag
- Database is usually the hardest to scale (read replicas, connection pooling)
- Cost justification: infrastructure cost vs. revenue at risk

**Q: "What metrics do you use to determine if you need to scale?"**
- Not just CPU — memory, network, IOPS, connection pool saturation, queue depth
- P99 latency trending up is often the first meaningful signal
- Error rate increase follows latency
- Business metrics: revenue per hour dropping

**Q: "How do you right-size instances?"**
- AWS Compute Optimizer for automated recommendations
- Rule of thumb: average CPU < 40% and max CPU < 70% → downsize
- Consider workload pattern: burstable (t3) vs. consistent (m6i)
- Always test after right-sizing

**Q: "What is target tracking scaling and when would you NOT use it?"**
- Maintains a target metric value (e.g., 60% CPU)
- Good for: predictable workloads, stateless services
- Bad for: metric has high variance (lots of noise), when you need minimum guarantees during known events
- For known events: use scheduled actions + target tracking together
