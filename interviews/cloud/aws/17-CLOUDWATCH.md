# CloudWatch, CloudTrail & X-Ray (Observability)

AWS observability is built on three pillars: CloudWatch for metrics, logs, and alarms; CloudTrail for audit logging of every API call; and X-Ray for distributed tracing. Together they form a unified observability stack. Understanding where each starts and stops is the difference between debugging an incident in 5 minutes and debugging it in 5 hours.

---

## CloudWatch Overview

| Component | What It Does |
|-----------|-------------|
| **Metrics** | Time-series data points (CPU, latency, custom business metrics) |
| **Logs** | Centralized log ingestion, storage, and querying |
| **Alarms** | Threshold or anomaly-based alerts that trigger actions |
| **Dashboards** | Real-time visualization of metrics and logs |
| **Synthetics** | Canary scripts that monitor endpoints and APIs |

---

## Metrics

### Built-in vs Custom

AWS services publish built-in metrics automatically. Custom metrics are anything you publish yourself.

| Built-in (examples) | Custom (you publish) |
|----------------------|----------------------|
| EC2: CPUUtilization, NetworkIn | Application p99 latency |
| RDS: DatabaseConnections | Business: orders_per_minute |
| ALB: RequestCount, TargetResponseTime | Cache hit ratio |

### Metric Resolution

| Resolution | Period | Cost | Use Case |
|-----------|--------|------|----------|
| **Standard** | 1 minute | Free for built-in | Most production monitoring |
| **High-resolution** | 1 second | $0.30/metric/month | Auto-scaling triggers, real-time dashboards |

```bash
# Publish a custom metric
aws cloudwatch put-metric-data \
  --namespace "MyApp/Prod" \
  --metric-name "OrdersProcessed" \
  --value 42 --unit Count \
  --dimensions Service=OrderService,Environment=prod

# High-resolution custom metric
aws cloudwatch put-metric-data \
  --namespace "MyApp/Prod" \
  --metric-name "RequestLatencyMs" \
  --value 12.5 --unit Milliseconds --storage-resolution 1

# Get metric statistics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --start-time 2026-03-03T00:00:00Z --end-time 2026-03-03T01:00:00Z \
  --period 300 --statistics Average \
  --dimensions Name=InstanceId,Value=i-0abc123
```

Statistics: Average, Sum, Min, Max, SampleCount, and percentiles (p50, p90, p99). Metric math lets you combine metrics: `errors / requests * 100` for error rates.

---

## CloudWatch Alarms

### Alarm Types

| Type | How It Works |
|------|-------------|
| **Metric alarm** | Fires when metric crosses a static threshold for N consecutive periods |
| **Anomaly detection** | ML baseline band; fires when metric exits the band |
| **Composite alarm** | Combines multiple alarms with AND/OR to reduce noise |

### Alarm Actions

| Target | Example |
|--------|---------|
| **SNS** | Notify on-call via PagerDuty, Slack |
| **Auto Scaling** | Scale out when CPU > 70% |
| **EC2** | Reboot, stop, terminate, recover |
| **Lambda** | Custom remediation logic |

```bash
# CPU alarm: 3 consecutive 5-min periods above 80%
aws cloudwatch put-metric-alarm \
  --alarm-name "HighCPU" \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0abc123 \
  --statistic Average --period 300 \
  --evaluation-periods 3 --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:alerts

# Composite alarm: only page when BOTH high CPU AND high errors
aws cloudwatch put-composite-alarm \
  --alarm-name "Critical" \
  --alarm-rule 'ALARM("HighCPU") AND ALARM("HighErrors")' \
  --alarm-actions arn:aws:sns:us-east-1:123456789:pagerduty
```

---

## CloudWatch Logs

### Structure

Log Group --> Log Streams --> Log Events. Default retention is **forever** (and you pay for it). Always set a retention policy.

```bash
aws logs create-log-group --log-group-name /myapp/api
aws logs put-retention-policy --log-group-name /myapp/api --retention-in-days 30
```

Always log in JSON. It makes Log Insights queries and metric filters dramatically easier.

---

## Log Insights

Query language for searching and analyzing log data across millions of events.

```sql
-- 20 most recent errors
fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20

-- Error count by service
filter level = "ERROR" | stats count(*) as errors by service | sort errors desc

-- P99 latency by endpoint
filter ispresent(durationMs)
| stats pct(durationMs, 99) as p99Ms by endpoint | sort p99Ms desc
```

Log Insights scans at query time (not indexed). Narrow the time window to control cost and speed.

---

## Metric Filters

Extract metrics from log data and publish as CloudWatch metrics. Bridges logs and alarms without code changes.

```bash
# Count ERROR lines as a metric
aws logs put-metric-filter \
  --log-group-name /myapp/api --filter-name ErrorCount \
  --filter-pattern "ERROR" \
  --metric-transformations \
    metricName=AppErrors,metricNamespace=MyApp,metricValue=1,defaultValue=0
```

Now alarm on `MyApp/AppErrors` like any other metric.

---

## Logs Subscriptions

Real-time streaming of log events to Lambda, Kinesis Data Streams, Kinesis Firehose, or cross-account log groups. Limit: 2 subscription filters per log group.

```bash
aws logs put-subscription-filter \
  --log-group-name /myapp/api --filter-name "ErrorsToLambda" \
  --filter-pattern "ERROR" \
  --destination-arn arn:aws:lambda:us-east-1:123456789:function:process-errors
```

---

## CloudWatch Dashboards

Single pane of glass for operational visibility. Include the four golden signals: latency, traffic, errors, saturation. One dashboard per service/team. Add alarm status widgets for red/green at a glance. Supports cross-account and cross-region.

---

## CloudWatch Agent

Built-in EC2 metrics are hypervisor-level (no memory, no disk space). The CloudWatch Agent runs inside the instance and collects: `mem_used_percent`, `disk_used_percent`, per-process CPU, and can tail log files to ship to CloudWatch Logs.

```bash
sudo yum install amazon-cloudwatch-agent -y
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json -s
```

Requires `CloudWatchAgentServerPolicy` on the EC2 instance profile. For containers, use the agent as a sidecar or ADOT collector.

---

## CloudTrail

Records every API call in your AWS account. Answers: **who did what, when, from where?**

### Event Types

| Type | What It Records | Default |
|------|----------------|---------|
| **Management events** | Control plane: CreateBucket, RunInstances | Enabled (free, 90-day lookup) |
| **Data events** | Data plane: GetObject, PutObject, Invoke | Disabled (high volume, costs money) |
| **Insights events** | Anomalous API activity spikes | Disabled |

### Trail Setup

```bash
aws cloudtrail create-trail \
  --name audit-trail --s3-bucket-name my-cloudtrail-logs \
  --is-multi-region-trail --enable-log-file-validation
aws cloudtrail start-logging --name audit-trail

# Enable S3 and Lambda data events
aws cloudtrail put-event-selectors --trail-name audit-trail \
  --event-selectors '[{"ReadWriteType":"All","IncludeManagementEvents":true,
    "DataResources":[
      {"Type":"AWS::S3::Object","Values":["arn:aws:s3:::my-bucket/"]},
      {"Type":"AWS::Lambda::Function","Values":["arn:aws:lambda:us-east-1:123456789:function:*"]}
    ]}]'
```

**Organization trails:** For multi-account setups, create from the management account. Logs all member accounts to a single S3 bucket. Non-negotiable for compliance.

---

## X-Ray

Distributed tracing for microservices. Traces a request from ingress through every service call, DB query, and external API.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Trace** | End-to-end journey of a single request |
| **Segment** | Work done by one service |
| **Subsegment** | Granular breakdown (a DynamoDB call, HTTP request) |
| **Annotation** | Indexed key-value for filtering (e.g., `userId=42`) |
| **Metadata** | Non-indexed data (e.g., full request body) |
| **Service map** | Auto-generated dependency graph with latency/error info |

### Sampling

Default: 1 request/sec + 5% of additional. Adjust for critical paths:

```bash
aws xray create-sampling-rule --cli-input-json '{
  "SamplingRule": {
    "RuleName": "high-value-orders", "Priority": 100,
    "FixedRate": 1.0, "ReservoirSize": 10,
    "ServiceName": "order-service", "ServiceType": "*",
    "Host": "*", "HTTPMethod": "POST", "URLPath": "/api/orders",
    "ResourceARN": "*", "Version": 1
  }}'
```

Use the service map as the first stop during incident triage. It immediately reveals which service is degraded.

---

## Unified Observability Strategy

```
Request --> X-Ray trace ID assigned
        --> CloudWatch Metrics: RequestCount++, Latency recorded
        --> CloudWatch Logs: Structured log with trace ID
        --> If error: Alarm fires --> SNS --> PagerDuty
        --> CloudTrail: Records any AWS API calls made

Debugging: Alarm (CloudWatch) --> Dashboard --> Logs by trace ID (Log Insights) --> Full trace (X-Ray) --> Who changed what (CloudTrail)
```

### Four Golden Signals

| Signal | Metric | Example Alarm |
|--------|--------|---------------|
| **Latency** | p99 response time | p99 > 500ms for 5 min |
| **Traffic** | Requests/sec | Sudden drop > 50% |
| **Errors** | 5xx / total | Error rate > 1% for 3 min |
| **Saturation** | CPU, memory, queue depth | CPU > 80% for 10 min |

---

## Common CLI Commands

```bash
# Metrics
aws cloudwatch list-metrics --namespace "MyApp"
aws cloudwatch describe-alarms --state-value ALARM
aws cloudwatch delete-alarms --alarm-names "HighCPU"

# Logs
aws logs tail /myapp/api --follow
aws logs start-query --log-group-name /myapp/api \
  --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s) \
  --query-string 'filter @message like /ERROR/ | stats count(*) by bin(5m)'
aws logs get-query-results --query-id "abc-123"

# CloudTrail
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances

# X-Ray
aws xray batch-get-traces --trace-ids "1-65e3a1b2-abc123def456789"
aws xray get-service-graph \
  --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s)
```

---

## Common Gotchas

**Logs cost:** Ingestion is $0.50/GB. 100 servers at 1 GB/day = $1,500/month. Set retention, use proper log levels, stream to S3 via Firehose for cheap long-term storage.

**High-resolution metrics cost:** $0.30/metric/month. 500 metrics = $150/month. Use only where sub-minute alarms are needed.

**CloudTrail data events volume:** Enabling S3 data events on a busy bucket generates millions of events/day. Start with specific prefixes, not all buckets.

**X-Ray sampling:** Default may miss rare errors. 100% sampling on high-traffic services generates massive data. Tune per-service.

**New custom metrics delay:** Up to 15 minutes to appear. Alarms show `INSUFFICIENT_DATA` until enough data points exist.

**CloudWatch Agent permissions:** Needs `CloudWatchAgentServerPolicy` on the instance profile. Commonly forgotten; agent starts but silently fails.

**Alarm flapping:** Increase evaluation period (3 of 5 instead of 1 of 1). Use composite alarms. Set `treat-missing-data` appropriately.
