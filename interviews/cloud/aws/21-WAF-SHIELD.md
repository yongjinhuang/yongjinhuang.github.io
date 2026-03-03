# WAF & Shield

AWS WAF (Web Application Firewall) is a managed firewall service that filters HTTP/HTTPS traffic to protect web applications from common exploits like SQL injection, XSS, and bot abuse. AWS Shield provides DDoS (Distributed Denial of Service) protection -- Shield Standard is free and automatic for all AWS accounts, while Shield Advanced provides enhanced L7 protection, a dedicated DDoS Response Team, and cost protection. Together, WAF and Shield form AWS's front-line defense for internet-facing applications.

## WAF Architecture

WAF is deployed in front of your application by associating a Web ACL with a supported AWS resource.

```
Internet --> CloudFront/ALB/API Gateway --> WAF Web ACL --> Your Application
                                              |
                                        Rules evaluated
                                        (allow/block/count)
```

### Supported Resources

| Resource | Scope |
|----------|-------|
| Amazon CloudFront | Global (must use us-east-1 for WAF) |
| Application Load Balancer (ALB) | Regional |
| Amazon API Gateway (REST API) | Regional |
| AWS AppSync (GraphQL API) | Regional |
| Amazon Cognito User Pool | Regional |
| AWS App Runner | Regional |
| AWS Verified Access | Regional |

## Web ACLs, Rules, and Rule Groups

### Web ACL

A Web ACL is the top-level container. It contains rules and a default action (ALLOW or BLOCK) applied when no rules match.

```bash
# Create a Web ACL
aws wafv2 create-web-acl \
  --name my-app-acl \
  --scope REGIONAL \
  --default-action Allow={} \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=myAppACL \
  --rules file://rules.json
```

### Rules

Rules define match conditions and actions. Each rule has a priority (lower number = higher priority = evaluated first).

| Rule Type | Description | Example |
|-----------|-------------|---------|
| Rate-based | Threshold on requests from single IP | Block IPs exceeding 2,000 req/5 min |
| IP match | Match against IP sets (CIDR blocks) | Allow office IPs, block known bad IPs |
| String match | Match header, URI, body, query string | Block requests with `/admin` in URI |
| Regex match | Pattern matching with regex | Block user agents matching bot patterns |
| Geo match | Match by country code | Block traffic from specific countries |
| SQL injection | Detect SQLi payloads | Inspect query strings and body |
| XSS | Detect cross-site scripting | Inspect body and URI |
| Size constraint | Match on request component size | Block requests with body > 8 KB |
| Label match | Match labels added by other rules | Combine rule logic |

### Rule Actions

| Action | Behavior |
|--------|----------|
| ALLOW | Allow request to proceed |
| BLOCK | Block request, return 403 |
| COUNT | Count the request but take no action (monitoring mode) |
| CAPTCHA | Require CAPTCHA challenge |
| Challenge | Silent browser challenge (JS verification) |

### Rule Groups

Rule groups are reusable collections of rules. Two types:

- **AWS Managed Rule Groups** -- maintained by AWS
- **Custom Rule Groups** -- your own rules bundled together

```bash
# Create a custom rule group
aws wafv2 create-rule-group \
  --name my-custom-rules \
  --scope REGIONAL \
  --capacity 100 \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=myCustomRules \
  --rules file://custom-rules.json
```

## AWS Managed Rules

AWS provides pre-built rule groups that cover common threats. These are maintained and updated by AWS.

| Rule Group | WCU | What It Protects Against |
|------------|-----|--------------------------|
| Core Rule Set (CRS) | 700 | Common web exploits (OWASP Top 10 coverage) |
| Known Bad Inputs | 200 | Request patterns known to be malicious |
| SQL Injection | 200 | SQL injection attacks |
| Linux/POSIX OS | 200 | LFI, command injection on Linux |
| Windows OS | 200 | PowerShell, command injection on Windows |
| PHP Application | 100 | PHP-specific exploits |
| WordPress Application | 100 | WordPress-specific exploits |
| Amazon IP Reputation | 25 | Known malicious IPs (AWS threat intelligence) |
| Anonymous IP List | 50 | VPN, proxy, Tor exit nodes |
| Bot Control | 50 | Automated bot traffic (scrapers, crawlers) |
| Account Takeover Prevention (ATP) | 50 | Credential stuffing, brute force on login |
| Account Creation Fraud Prevention (ACFP) | 50 | Fake account creation |

### Using Managed Rules

```json
{
  "Name": "AWS-AWSManagedRulesCommonRuleSet",
  "Priority": 1,
  "Statement": {
    "ManagedRuleGroupStatement": {
      "VendorName": "AWS",
      "Name": "AWSManagedRulesCommonRuleSet",
      "ExcludedRules": [
        {"Name": "SizeRestrictions_BODY"}
      ]
    }
  },
  "OverrideAction": {"None": {}},
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "AWSCommonRules"
  }
}
```

Use `ExcludedRules` to override specific rules that generate false positives. Start with rules in COUNT mode to observe before enforcing.

## Custom Rules

### Rate-Based Rule

```json
{
  "Name": "RateLimitPerIP",
  "Priority": 0,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 2000,
      "AggregateKeyType": "IP"
    }
  },
  "Action": {"Block": {}},
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "RateLimitPerIP"
  }
}
```

### Geo Blocking Rule

```json
{
  "Name": "GeoBlock",
  "Priority": 2,
  "Statement": {
    "GeoMatchStatement": {
      "CountryCodes": ["CN", "RU", "KP"]
    }
  },
  "Action": {"Block": {}},
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "GeoBlock"
  }
}
```

### IP Allowlist

```bash
# Create an IP set
aws wafv2 create-ip-set \
  --name office-ips \
  --scope REGIONAL \
  --ip-address-version IPV4 \
  --addresses "203.0.113.0/24" "198.51.100.0/24"
```

```json
{
  "Name": "AllowOfficeIPs",
  "Priority": 0,
  "Statement": {
    "IPSetReferenceStatement": {
      "ARN": "arn:aws:wafv2:us-east-1:123456789012:regional/ipset/office-ips/abc123"
    }
  },
  "Action": {"Allow": {}},
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "AllowOfficeIPs"
  }
}
```

## Rule Priority and Evaluation Order

Rules are evaluated in order of priority (lowest number first). Evaluation stops when a rule matches and takes a terminating action (ALLOW or BLOCK).

```
Priority 0: Rate limit (Block if > 2000 req/5min)    --> if match, BLOCK
Priority 1: Allow office IPs                          --> if match, ALLOW
Priority 2: AWS Managed Core Rule Set                 --> if match, BLOCK
Priority 3: AWS Managed SQL Injection                 --> if match, BLOCK
Priority 4: Geo block                                 --> if match, BLOCK
Default: ALLOW                                        --> no match, ALLOW
```

Best practice ordering:
1. Rate limiting (protect against floods first)
2. IP allowlist (let known-good traffic through)
3. IP blocklist (block known-bad traffic)
4. AWS Managed Rules (broad protection)
5. Custom application rules (app-specific logic)
6. Default action (ALLOW or BLOCK)

## WAF Logging

WAF logs every request evaluated by a Web ACL. Three log destinations:

| Destination | Use Case | Prefix Requirement |
|-------------|----------|-------------------|
| CloudWatch Logs | Real-time monitoring, low volume | `aws-waf-logs-` |
| S3 Bucket | Long-term storage, compliance | `aws-waf-logs-` |
| Kinesis Data Firehose | Real-time streaming, high volume | `aws-waf-logs-` |

```bash
# Enable logging to S3
aws wafv2 put-logging-configuration \
  --logging-configuration '{
    "ResourceArn": "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-app-acl/abc123",
    "LogDestinationConfigs": [
      "arn:aws:s3:::aws-waf-logs-my-bucket"
    ],
    "RedactedFields": [
      {"SingleHeader": {"Name": "authorization"}}
    ]
  }'
```

### Filtering Logs

Reduce log volume by filtering on action or label:

```bash
aws wafv2 put-logging-configuration \
  --logging-configuration '{
    "ResourceArn": "...",
    "LogDestinationConfigs": ["..."],
    "LoggingFilter": {
      "DefaultBehavior": "DROP",
      "Filters": [
        {
          "Behavior": "KEEP",
          "Conditions": [
            {"ActionCondition": {"Action": "BLOCK"}}
          ],
          "Requirement": "MEETS_ANY"
        }
      ]
    }
  }'
```

## AWS Shield

### Shield Standard vs Shield Advanced

| Feature | Shield Standard | Shield Advanced |
|---------|----------------|-----------------|
| Cost | Free (included) | $3,000/month + data transfer |
| Protection | L3/L4 DDoS (network/transport) | L3/L4 + L7 DDoS (application) |
| Automatic | Yes, always on | Yes, with enhanced detection |
| Resources | All AWS resources | CloudFront, ALB, EIP, Global Accelerator, Route 53 |
| DDoS Response Team | No | Yes (24/7 DRT access) |
| Cost protection | No | Yes (scaling credits during attack) |
| Advanced metrics | No | Yes (real-time metrics, attack visibility) |
| WAF integration | No | Yes (WAF included at no additional cost) |
| Health-based detection | No | Yes (uses Route 53 health checks) |
| SLA | No | Yes (DDoS-related downtime SLA) |
| Commitment | None | 1-year subscription |

### Shield Advanced Setup

```bash
# Subscribe to Shield Advanced
aws shield create-subscription

# Add protection to a resource
aws shield create-protection \
  --name my-alb-protection \
  --resource-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123

# Associate health check for proactive detection
aws shield associate-health-check \
  --protection-id abc123 \
  --health-check-arn arn:aws:route53:::healthcheck/xyz789

# List protections
aws shield list-protections

# Describe an attack
aws shield describe-attack --attack-id abc-123-def-456
```

### When to Use Shield Advanced

- High-value, internet-facing applications (e-commerce, financial services)
- Applications that cannot tolerate any downtime
- When you need cost protection against DDoS-induced scaling
- When you want AWS's DDoS Response Team on speed dial
- When WAF cost savings offset the $3,000/month (Shield Advanced includes WAF at no extra cost)

## Common CLI Commands

```bash
# --- WAF ---

# Create Web ACL
aws wafv2 create-web-acl \
  --name my-acl \
  --scope REGIONAL \
  --default-action Allow={} \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=myACL

# List Web ACLs
aws wafv2 list-web-acls --scope REGIONAL

# Get Web ACL
aws wafv2 get-web-acl --name my-acl --scope REGIONAL --id <acl-id>

# Associate Web ACL with ALB
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-acl/abc123 \
  --resource-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123

# Create rule group
aws wafv2 create-rule-group \
  --name my-rules \
  --scope REGIONAL \
  --capacity 500 \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=myRules

# List available managed rule groups
aws wafv2 list-available-managed-rule-groups --scope REGIONAL

# Get sampled requests (see what WAF is catching)
aws wafv2 get-sampled-requests \
  --web-acl-arn <acl-arn> \
  --rule-metric-name AWSCommonRules \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-02T00:00:00Z \
  --max-items 100

# Delete Web ACL
aws wafv2 delete-web-acl --name my-acl --scope REGIONAL --id <acl-id> --lock-token <token>

# --- Shield ---

# Check subscription status
aws shield describe-subscription

# Create protection
aws shield create-protection \
  --name my-protection \
  --resource-arn <resource-arn>

# List attacks
aws shield list-attacks \
  --start-time FromInclusive=2024-01-01T00:00:00Z \
  --end-time ToExclusive=2024-01-02T00:00:00Z
```

## Common Gotchas

| Issue | Details |
|-------|---------|
| WCU limit: 5,000 per Web ACL | Web ACL Capacity Units limit the total rule complexity. AWS Managed Rule groups consume WCUs (e.g., Core Rule Set = 700). Plan capacity across all rules. |
| Rule evaluation order matters | Lower priority number = evaluated first. An ALLOW rule at priority 0 will let traffic through before a BLOCK rule at priority 1 can act. |
| Shield Advanced cost | $3,000/month is a significant commitment. Evaluate whether WAF alone with rate limiting provides sufficient protection for your threat model. |
| WAF logs can be high volume | A busy site can generate millions of log entries. Use log filtering to capture only BLOCK actions or specific labels. Budget for S3/Firehose costs. |
| CloudFront WAF is global scope | WAF for CloudFront distributions must be created in `us-east-1` with `--scope CLOUDFRONT`. Regional resources use `--scope REGIONAL`. |
| Managed rule false positives | AWS Managed Rules can block legitimate traffic. Deploy in COUNT mode first, review sampled requests, then switch to BLOCK. Use `ExcludedRules` for persistent false positives. |
| Bot Control cost | Bot Control managed rule group has additional per-request pricing ($1.00 per million requests for common bots, $10.00 for targeted bots). Can be expensive at scale. |
| Web ACL association limits | Each resource can be associated with exactly one Web ACL. A Web ACL can protect multiple resources of the same type and region. |
| Propagation delay | Web ACL changes can take up to a few minutes to propagate, especially for CloudFront distributions. Do not assume changes are instant. |
| Rate-based rule minimum | Rate-based rules have a minimum threshold of 100 requests per 5 minutes. You cannot set it lower than 100. |
