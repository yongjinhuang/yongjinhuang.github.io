# Networking Operations — DNS, Load Balancers, CDN, Service Mesh

> Cloud Operations Interview Prep — Deep Technical Reference

---

## 1. DNS Operations at Scale

### Architecture Overview

```
                          ┌─────────────────────────────────┐
                          │         Route 53 Hosted Zone      │
                          │  api.example.com                  │
                          │                                   │
                          │  ┌──────────┐  ┌──────────────┐  │
                          │  │ Weighted │  │ Latency-based│  │
                          │  │ Routing  │  │   Routing    │  │
                          │  └────┬─────┘  └──────┬───────┘  │
                          │       │               │          │
                          └───────┼───────────────┼──────────┘
                                  │               │
              ┌───────────────────┘               └──────────────────┐
              │                                                       │
     ┌────────▼────────┐                                   ┌─────────▼───────┐
     │  us-east-1      │                                   │  eu-west-1      │
     │  ALB (weight 80)│                                   │  ALB (weight 20)│
     └─────────────────┘                                   └─────────────────┘
```

### Route 53 Routing Policies Compared

| Policy         | Use Case                                  | Failover | Cost |
|----------------|-------------------------------------------|----------|------|
| Simple         | Single resource, no health checks          | No       | Low  |
| Weighted       | A/B testing, gradual migration             | Optional | Low  |
| Latency        | Route to lowest-latency region             | Optional | Low  |
| Failover       | Active-passive HA setup                    | Yes      | Low  |
| Geolocation    | Compliance, localization                   | Optional | Low  |
| Geoproximity   | Traffic shifting with bias                 | No       | Low  |
| Multivalue     | Return up to 8 healthy IPs                 | Yes      | Low  |
| IP-based       | Route by CIDR block (ISP/corporate splits) | No       | Low  |

### Weighted Routing — Canary Deployment

```bash
# Create weighted record sets for canary release
# v1 gets 90%, v2 gets 10%
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.example.com",
          "Type": "A",
          "SetIdentifier": "v1-primary",
          "Weight": 90,
          "AliasTarget": {
            "HostedZoneId": "Z35SXDOTRQ7X7K",
            "DNSName": "v1-alb.us-east-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      },
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.example.com",
          "Type": "A",
          "SetIdentifier": "v2-canary",
          "Weight": 10,
          "AliasTarget": {
            "HostedZoneId": "Z35SXDOTRQ7X7K",
            "DNSName": "v2-alb.us-east-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'
```

### DNS Failover — Active/Passive

```bash
# Create health check first
aws route53 create-health-check \
  --caller-reference "hc-primary-$(date +%s)" \
  --health-check-config '{
    "IPAddress": "203.0.113.10",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "FullyQualifiedDomainName": "api.example.com",
    "RequestInterval": 10,
    "FailureThreshold": 3,
    "EnableSNI": true
  }'

# Associate with primary record (Failover = PRIMARY)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "SetIdentifier": "primary",
        "Failover": "PRIMARY",
        "HealthCheckId": "abc123",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "primary-alb.us-east-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

### TTL Strategy by Record Type

| Record Type    | Recommended TTL | Reasoning                                      |
|----------------|-----------------|------------------------------------------------|
| Root/Apex (A)  | 300s (5 min)    | CDN or ALB rarely changes                      |
| API endpoints  | 60s             | Allows faster failover                         |
| Health-checked | 30–60s          | Minimize failover window                       |
| Internal SRV   | 10s             | Service discovery needs freshness              |
| MX records     | 3600s           | Mail infra is stable                           |
| NS records     | 172800s (2 day) | Never change; high cache efficiency            |
| During incident| 30s             | Pre-lower TTL 24h before planned failover      |

### DNS-Based Service Discovery

```bash
# Register service in Route 53 Private Hosted Zone
# Services self-register on startup via AWS SDK

# SRV record for service discovery
aws route53 change-resource-record-sets \
  --hosted-zone-id ZPRIVATE123 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "_http._tcp.payments.internal",
        "Type": "SRV",
        "TTL": 10,
        "ResourceRecords": [
          {"Value": "0 1 8080 payments-1.internal"},
          {"Value": "0 1 8080 payments-2.internal"}
        ]
      }
    }]
  }'

# Lookup from application
dig SRV _http._tcp.payments.internal @169.254.169.253
```

---

## 2. Load Balancer Operations

### ALB vs NLB vs GLB Decision Tree

```
                     Traffic Type?
                          │
            ┌─────────────┼──────────────┐
            │             │              │
         HTTP/S        TCP/UDP        L3/L4 Inline
            │             │              │
           ALB           NLB            GWLB
            │             │              │
     ┌──────┘      ┌──────┘        ┌────┘
     │             │               │
  - Content     - Ultra-low      - 3rd-party
    routing       latency          firewalls
  - Auth        - Static IP     - IDS/IPS
  - gRPC        - TLS passthru  - Deep packet
  - WebSocket   - Gaming/VoIP     inspection
  - WAF
```

### ALB vs NLB vs GWLB — Feature Comparison

| Feature                | ALB              | NLB                   | GWLB              |
|------------------------|------------------|-----------------------|-------------------|
| OSI Layer              | 7 (HTTP)         | 4 (TCP/UDP)           | 3/4               |
| Protocols              | HTTP, HTTPS, gRPC| TCP, UDP, TLS         | GENEVE (UDP 6081) |
| Latency                | ~1ms             | ~100µs                | Transparent       |
| Static IP              | No (DNS only)    | Yes (per AZ)          | No                |
| Preserve Client IP     | Via X-Forwarded  | Native                | Native            |
| Health Check           | HTTP/HTTPS       | TCP/HTTP/HTTPS        | HTTP              |
| WAF Support            | Yes              | No                    | No                |
| Lambda targets         | Yes              | No                    | No                |
| Cross-zone default     | On (free)        | Off (charged)         | Off (charged)     |
| Idle timeout           | 60s (adjustable) | 350s TCP              | N/A               |

### Health Check Configuration — Best Practices

```bash
# ALB target group health check
aws elbv2 modify-target-group \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456:targetgroup/api/abc \
  --health-check-protocol HTTP \
  --health-check-path /health/live \
  --health-check-interval-seconds 15 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --matcher '{"HttpCode": "200-299"}'

# Inspect unhealthy targets
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456:targetgroup/api/abc \
  --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`]'
```

### Connection Draining (Deregistration Delay)

```bash
# Set deregistration delay — allow in-flight requests to complete
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456:targetgroup/api/abc \
  --attributes '[
    {"Key": "deregistration_delay.timeout_seconds", "Value": "30"},
    {"Key": "slow_start.duration_seconds", "Value": "60"},
    {"Key": "load_balancing.algorithm.type", "Value": "least_outstanding_requests"}
  ]'

# Slow start: ramp new targets from 0% to full over 60s
# Prevents cold-start spike on newly registered targets
```

### Cross-Zone Load Balancing

```
Without cross-zone (NLB default):          With cross-zone (ALB default):

AZ-1 (2 targets): 50% traffic each        AZ-1: 25% each target
  ├── Target A: 50%                          ├── Target A: 25%
  └── Target B: 50%                          └── Target B: 25%

AZ-2 (2 targets): 50% traffic each        AZ-2: 25% each target
  ├── Target C: 50%                          ├── Target C: 25%
  └── Target D: 50%                          └── Target D: 25%

Problem: AZ imbalance when uneven
targets across zones → use cross-zone
```

### Sticky Sessions

```bash
# Enable duration-based stickiness (ALB cookie)
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456:targetgroup/api/abc \
  --attributes '[
    {"Key": "stickiness.enabled", "Value": "true"},
    {"Key": "stickiness.type", "Value": "lb_cookie"},
    {"Key": "stickiness.lb_cookie.duration_seconds", "Value": "86400"}
  ]'

# App-based cookie (uses your app's own cookie, e.g., JSESSIONID)
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456:targetgroup/api/abc \
  --attributes '[
    {"Key": "stickiness.enabled", "Value": "true"},
    {"Key": "stickiness.type", "Value": "app_cookie"},
    {"Key": "stickiness.app_cookie.cookie_name", "Value": "JSESSIONID"},
    {"Key": "stickiness.app_cookie.duration_seconds", "Value": "3600"}
  ]'
```

---

## 3. CDN Operations

### CloudFront Architecture

```
User Request
    │
    ▼
┌─────────────────────────────────────────────┐
│          CloudFront Edge Location           │
│                                             │
│  ┌──────────┐    Cache Hit?    ┌─────────┐  │
│  │ WAF/Shield│──────────────► │  Cache  │  │
│  └──────────┘        Yes      └────┬────┘  │
│                       │           │No      │
│                       │      ┌────▼──────┐ │
│                       │      │Origin     │ │
│                       │      │Shield     │ │
│                       │      │(Regional) │ │
│                       │      └────┬──────┘ │
└───────────────────────┼───────────┼────────┘
                        │           │
                        ▼           ▼
                   Response     Origin
                  (from cache)  (ALB/S3/API GW)
```

### Cache Invalidation Strategies

```bash
# Invalidate specific paths — costs $0.005 per path after first 1000/month
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths '/api/v1/users/*' '/static/css/main.css'

# Wildcard invalidation — invalidates everything (expensive, use sparingly)
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths '/*'

# Monitor invalidation status
aws cloudfront get-invalidation \
  --distribution-id E1234567890 \
  --id I1234567890

# Better practice: versioned assets avoid invalidation entirely
# /static/css/main.a1b2c3d4.css  — hash in filename, set long Cache-Control
```

### Cache Control Headers Strategy

| Content Type       | Cache-Control                          | TTL     |
|--------------------|----------------------------------------|---------|
| HTML pages         | `no-cache, no-store`                   | 0s      |
| API responses      | `no-cache` or `max-age=60`             | 0-60s   |
| JS/CSS (hashed)    | `public, max-age=31536000, immutable`  | 1 year  |
| Images (hashed)    | `public, max-age=31536000, immutable`  | 1 year  |
| Images (no hash)   | `public, max-age=86400`                | 1 day   |
| Font files         | `public, max-age=31536000, immutable`  | 1 year  |
| Config/manifest    | `public, max-age=300`                  | 5 min   |

### Origin Shield — Reduce Origin Load

```bash
# Enable Origin Shield in CloudFront distribution
aws cloudfront update-distribution \
  --id E1234567890 \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "primary-origin",
        "DomainName": "api-alb.us-east-1.elb.amazonaws.com",
        "OriginShield": {
          "Enabled": true,
          "OriginShieldRegion": "us-east-1"
        }
      }]
    }
  }'

# Origin Shield collapses cache misses from all edges
# into a single regional origin request — reduces origin load by ~60%
```

### CloudFront Functions vs Lambda@Edge

| Feature             | CloudFront Functions      | Lambda@Edge               |
|---------------------|---------------------------|---------------------------|
| Execution location  | 218+ edge locations        | Regional edge caches      |
| Latency             | Sub-millisecond            | 1-5ms                     |
| Triggers            | Viewer request/response    | All 4 event types         |
| Runtime             | JavaScript (ES5.1)         | Node.js, Python           |
| Max duration        | 1ms                        | 5s (viewer), 30s (origin) |
| Max memory          | 2MB                        | 128MB–10GB                |
| Network access      | No                         | Yes                       |
| File system         | No                         | No                        |
| Use case            | URL rewrite, header modify | Auth, dynamic routing     |
| Cost                | $0.10/1M invocations       | $0.60/1M invocations      |

---

## 4. VPC Architecture at Scale

### Multi-Account Hub-and-Spoke with Transit Gateway

```
                    ┌──────────────────────────┐
                    │  Transit Gateway (TGW)    │
                    │  Route Tables:            │
                    │  - prod-rt                │
                    │  - dev-rt                 │
                    │  - shared-rt              │
                    └───────────┬──────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐    ┌─────────▼──────┐    ┌───────────▼────┐
│  Prod Account  │    │  Dev Account   │    │ Shared Services │
│  10.0.0.0/16   │    │  10.2.0.0/16   │    │  10.4.0.0/16   │
│                │    │                │    │                 │
│ ┌────────────┐ │    │ ┌────────────┐ │    │ ┌───────────┐  │
│ │ VPC: Prod  │ │    │ │ VPC: Dev   │ │    │ │VPC: Shared│  │
│ │ App: 10.0  │ │    │ │ App: 10.2  │ │    │ │ DNS: 10.4 │  │
│ │ Data: 10.1 │ │    │ │ Data: 10.3 │ │    │ │ NTP: 10.4 │  │
│ └────────────┘ │    │ └────────────┘ │    │ └───────────┘  │
└────────────────┘    └────────────────┘    └────────────────┘
```

### CIDR Planning for 100+ VPCs

```
RFC 1918 Space Allocation Plan:
────────────────────────────────────────────────────────
10.0.0.0/8 = 16,777,216 addresses

Strategy: /16 per VPC = 65,536 addresses each
          Supports 256 VPCs within 10.0.0.0/8

Org Layout:
  10.0.0.0/8
  ├── 10.0.0.0/10  [0-63.x.x]   = Production (64 VPCs)
  ├── 10.64.0.0/10 [64-127.x.x] = Staging    (64 VPCs)
  ├── 10.128.0.0/10[128-191.x.x]= Dev        (64 VPCs)
  └── 10.192.0.0/10[192-255.x.x]= Shared/Mgmt(64 VPCs)

Per VPC /16 → 4 x /18 subnets (AZ tiers):
  AZ-a:
    - Public:   /20  (~4094 IPs)
    - Private:  /18  (~16382 IPs)
    - Data:     /21  (~2046 IPs)
  AZ-b: mirror of AZ-a
  AZ-c: mirror of AZ-a

Anti-patterns to avoid:
  - Overlapping CIDRs between VPCs (breaks peering/TGW)
  - Using 172.16.0.0/12 (conflicts with Docker default)
  - /24 subnets in data tier (only 251 usable IPs — too small for RDS clusters)
```

### VPC Peering vs PrivateLink vs TGW

| Feature              | VPC Peering           | PrivateLink (Endpoint Svc) | Transit Gateway     |
|----------------------|-----------------------|---------------------------|---------------------|
| Traffic path         | Direct (no hop)       | NLB-fronted endpoint      | TGW router          |
| Transitive routing   | No                    | Yes (1:many)              | Yes                 |
| Cross-account        | Yes                   | Yes                       | Yes                 |
| Cross-region         | Yes (inter-region)    | Limited                   | Yes (TGW peering)   |
| Scalability          | 125 peerings/VPC max  | Unlimited consumers       | 5000 VPCs per TGW   |
| Cost                 | Data transfer only    | Per-hour + data           | Per-hour + data     |
| Use case             | Small # VPCs          | Expose SaaS services      | Enterprise mesh     |
| Security             | SG by IP              | SG by VPCE                | Route table segmt   |

```bash
# Create TGW attachment
aws ec2 create-transit-gateway-vpc-attachment \
  --transit-gateway-id tgw-0abc1234 \
  --vpc-id vpc-0prod1234 \
  --subnet-ids subnet-0a1b2c3d subnet-0e5f6g7h \
  --options '{"DnsSupport":"enable","Ipv6Support":"disable"}'

# Add route to TGW in VPC route table
aws ec2 create-route \
  --route-table-id rtb-0abc1234 \
  --destination-cidr-block 10.0.0.0/8 \
  --transit-gateway-id tgw-0abc1234
```

---

## 5. Service Mesh Operations

### Service Mesh Architecture (Istio)

```
┌─────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                     │
│                                                         │
│  ┌────────────┐           ┌────────────┐                │
│  │  Service A │           │  Service B │                │
│  │            │           │            │                │
│  │ ┌────────┐ │  mTLS     │ ┌────────┐ │                │
│  │ │App     │ │◄─────────►│ │App     │ │                │
│  │ │:8080   │ │           │ │:8080   │ │                │
│  │ └────────┘ │           │ └────────┘ │                │
│  │ ┌────────┐ │           │ ┌────────┐ │                │
│  │ │Envoy   │ │           │ │Envoy   │ │                │
│  │ │Sidecar │ │           │ │Sidecar │ │                │
│  │ │:15001  │ │           │ │:15001  │ │                │
│  │ └────────┘ │           │ └────────┘ │                │
│  └────────────┘           └────────────┘                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Istio Control Plane                 │   │
│  │  istiod: Pilot + Citadel + Galley               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Traffic Management — VirtualService

```yaml
# Canary deployment: 90/10 split via Istio VirtualService
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payments-vs
spec:
  hosts:
    - payments
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: payments
            subset: v2
    - route:
        - destination:
            host: payments
            subset: v1
          weight: 90
        - destination:
            host: payments
            subset: v2
          weight: 10
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: gateway-error,connect-failure,retriable-4xx
      timeout: 10s
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payments-dr
spec:
  host: payments
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        http1MaxPendingRequests: 50
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

### Circuit Breaker Pattern

```
State Machine:
                         threshold exceeded
  ┌─────────┐           ┌──────────────────►┌───────────┐
  │  CLOSED │           │                   │   OPEN    │
  │(normal) ├───────────┘    timeout        │(fail fast)│
  └─────────┘                               └─────┬─────┘
       ▲                                          │
       │                                          │ half-open
       │                            probe request │
       │                                          ▼
       │                                   ┌──────────────┐
       └───────────────────────────────────┤  HALF-OPEN   │
              success                      │(test traffic)│
                                           └──────────────┘

Istio outlierDetection = circuit breaker at the client side
```

### mTLS Configuration

```bash
# Enforce strict mTLS across namespace
kubectl apply -f - <<EOF
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT
EOF

# Verify mTLS is active
istioctl x describe pod payments-abc123 -n production
# Should show: mTLS: yes

# Check certificate expiry
istioctl proxy-config secret payments-abc123 -n production \
  -o json | jq '.dynamicActiveSecrets[].secret.tlsCertificate.certificateChain'
```

### Mesh Observability — Key Metrics

| Metric             | Tool            | Signal                                        |
|--------------------|-----------------|-----------------------------------------------|
| Request rate       | Prometheus/Grafana | Baseline + alert on 2x spike               |
| Error rate (5xx)   | Prometheus      | Alert at >1% of requests                     |
| P99 latency        | Prometheus/Jaeger | Alert if >2x baseline                       |
| Circuit open       | Envoy stats     | `cluster.payments.circuit_breakers.default.open` |
| mTLS failures      | Istio access log| `response_flags: DC` = downstream connection |
| Retry budget       | Envoy stats     | `cluster.payments.upstream_rq_retry`         |

---

## 6. Network Troubleshooting

### VPC Flow Logs Analysis

```bash
# Enable flow logs to S3
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-0prod1234 \
  --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::my-flow-logs-bucket/vpc/ \
  --log-format '${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${windowstart} ${windowend} ${action} ${flow-direction} ${log-status}'

# Query with Athena — find top rejected connections
SELECT srcaddr, dstaddr, dstport, COUNT(*) as count
FROM vpc_flow_logs
WHERE action = 'REJECT'
  AND windowstart > to_unixtime(current_timestamp - interval '1' hour)
GROUP BY srcaddr, dstaddr, dstport
ORDER BY count DESC
LIMIT 20;

# Find all traffic to specific instance on port 443
SELECT *
FROM vpc_flow_logs
WHERE dstaddr = '10.0.1.45'
  AND dstport = 443
  AND windowstart > to_unixtime(current_timestamp - interval '30' minute)
ORDER BY windowstart;
```

### Security Group Debugging — Step-by-Step

```
Problem: EC2 cannot reach RDS on port 5432

Checklist:
1. EC2 security group outbound rules
   aws ec2 describe-security-groups --group-ids sg-ec2 \
     --query 'SecurityGroups[].IpPermissionsEgress'

2. RDS security group inbound rules
   aws ec2 describe-security-groups --group-ids sg-rds \
     --query 'SecurityGroups[].IpPermissions'
   → Look for rule: port 5432, source = sg-ec2

3. Subnet route tables
   aws ec2 describe-route-tables \
     --filters "Name=association.subnet-id,Values=subnet-ec2"

4. Network ACLs (stateless — need BOTH inbound and outbound)
   aws ec2 describe-network-acls \
     --filters "Name=association.subnet-id,Values=subnet-rds"
   → Check inbound port 5432 AND outbound ephemeral ports 1024-65535

5. VPC DNS resolution (for RDS endpoint)
   aws ec2 describe-vpc-attribute \
     --vpc-id vpc-0prod1234 \
     --attribute enableDnsHostnames

6. From inside EC2, test connectivity
   nc -vz rds-endpoint.rds.amazonaws.com 5432
   curl -v telnet://rds-endpoint.rds.amazonaws.com:5432
```

### NACL vs Security Group

| Property          | Security Group                  | Network ACL                         |
|-------------------|---------------------------------|-------------------------------------|
| Applies to        | Instance (ENI)                  | Subnet                              |
| State             | Stateful (return traffic auto)  | Stateless (must allow both dirs)    |
| Rules             | Allow only                      | Allow + Deny                        |
| Rule evaluation   | All rules evaluated             | Lowest numbered rule wins           |
| Default           | Deny all inbound, allow all out | Allow all inbound and outbound      |
| Use case          | Instance-level micro-segmentation| Subnet-level block list (DDoS IPs)  |

### Packet Capture in Cloud

```bash
# Use SSM + tcpdump (no SSH needed)
aws ssm start-session --target i-0abc1234

# On the instance
sudo tcpdump -i eth0 -nn port 443 -w /tmp/capture.pcap -c 1000

# Copy back via S3
aws s3 cp /tmp/capture.pcap s3://debug-bucket/captures/

# VPC Traffic Mirroring (production-safe alternative)
aws ec2 create-traffic-mirror-session \
  --network-interface-id eni-0abc1234 \
  --traffic-mirror-target-id tmt-0abc1234 \
  --traffic-mirror-filter-id tmf-0abc1234 \
  --session-number 1 \
  --description "Debug session for pod payments"
```

---

## 7. Hybrid Networking

### Direct Connect Architecture

```
On-Premises Data Center
         │
         │ Physical fiber (1G/10G/100G)
         │
    ┌────▼────────────────────┐
    │  AWS Direct Connect      │
    │  Location (colocation)   │
    │                          │
    │  ┌──────────────────┐   │
    │  │  Customer Router  │   │
    │  └────────┬──────────┘   │
    │           │ BGP session  │
    │  ┌────────▼──────────┐   │
    │  │  AWS DX Router    │   │
    │  └────────┬──────────┘   │
    └───────────┼──────────────┘
                │
    ┌───────────▼──────────────┐
    │  Virtual Private Gateway │
    │  or Direct Connect GW    │
    └───────────┬──────────────┘
                │
    ┌───────────▼──────────────┐
    │     AWS VPC              │
    └──────────────────────────┘
```

### DX vs VPN — Comparison

| Property          | Direct Connect          | Site-to-Site VPN            |
|-------------------|-------------------------|-----------------------------|
| Bandwidth         | 1G, 10G, 100G           | Up to 1.25 Gbps per tunnel  |
| Latency           | Consistent low latency  | Variable (public internet)  |
| Reliability       | SLA-backed              | Best-effort                 |
| Setup time        | Weeks to months         | Minutes to hours            |
| Cost              | Port hours + data       | VPN hours + data            |
| Encryption        | No (use MACsec/IPsec)   | Yes (IPsec)                 |
| BGP               | Yes                     | Yes                         |
| Typical use       | Production workloads    | Backup/Dev or DX failover   |

### Bandwidth Planning for Hybrid

```
Formula:
  Required_BW = (Peak_data_transfer_GB_per_hour × 8 × 1024) / 3600 × headroom_factor

Example:
  - 500 GB/hour peak transfer
  - 20% headroom
  Required = (500 × 8 × 1024) / 3600 × 1.2
           = 4,096,000 / 3600 × 1.2
           ≈ 1,365 Mbps → provision 2x 1G DX links (active/passive)

For critical workloads:
  - 2x DX connections (different DX locations for resilience)
  - VPN as tertiary fallback
  - BGP MED/LOCAL_PREF for traffic preference
```

---

## 8. Network Security

### WAF Rule Hierarchy

```
AWS WAF Evaluation Order:
  1. AWS Managed Rules (AWSManagedRulesCommonRuleSet)
  2. Custom IP reputation lists (Block known bad IPs)
  3. Rate-based rules (100 req/5min per IP)
  4. Custom rules (SQLi, XSS, path traversal)
  5. Default action (Allow/Block)

Each rule has priority 0-100 (lower = evaluated first)
First matching rule terminates evaluation (BLOCK/ALLOW/COUNT)
```

```bash
# Create WAF web ACL with rate limiting
aws wafv2 create-web-acl \
  --name prod-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules '[
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 0,
      "OverrideAction": {"None": {}},
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "CommonRuleSet"
      }
    },
    {
      "Name": "RateLimit",
      "Priority": 1,
      "Action": {"Block": {}},
      "Statement": {
        "RateBasedStatement": {
          "Limit": 2000,
          "AggregateKeyType": "IP"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimit"
      }
    }
  ]' \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=prod-waf

# Associate WAF with ALB
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:us-east-1:123456:regional/webacl/prod-waf/abc123 \
  --resource-arn arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/prod-alb/abc123
```

### DDoS Protection Layers

```
Layer 3/4 (Network/Transport):
  AWS Shield Standard (free) → Absorbs SYN floods, UDP reflection
  AWS Shield Advanced ($3K/mo) → DDoS response team, cost protection

Layer 7 (Application):
  CloudFront + WAF → Rate limiting, geo-blocking, bot detection
  ALB + WAF → WAF before app servers

Zero-Trust Networking:
  - All internal traffic must be authenticated (SPIFFE/X.509)
  - mTLS everywhere (Istio / AWS App Mesh)
  - No implicit trust by network location
  - PrivateLink for service exposure (no public IPs)
  - VPC Endpoints for AWS services (no internet egress)
```

### PrivateLink for Service Exposure

```
Before PrivateLink (complex, insecure):
  Consumer VPC ──(peering/internet)──► Producer VPC

After PrivateLink:
  Consumer VPC                          Producer VPC
  ┌──────────────┐                   ┌─────────────────┐
  │              │                   │                 │
  │  Interface   │◄────PrivateLink───┤  NLB            │
  │  VPC Endpoint│                   │   │             │
  │  10.1.0.100  │                   │  ┌▼──────────┐  │
  │              │                   │  │ Service   │  │
  └──────────────┘                   │  └───────────┘  │
                                     └─────────────────┘

Benefits:
  - No VPC peering needed (no transitive routing complexity)
  - Traffic never leaves AWS backbone
  - Consumer cannot reach any other resource in producer VPC
  - Producer can sell service to thousands of consumers
```

---

## 9. IPv4 Exhaustion & IPv6 Migration

### NAT Gateway Cost Analysis

```
NAT Gateway Pricing (us-east-1):
  - $0.045/hour × 730 hours = $32.85/month per NAT GW
  - $0.045/GB data processed

Common mistake: 1 NAT GW per region (not per AZ)
  → All AZ traffic crosses AZ boundary: $0.01/GB cross-AZ charge

Correct: 1 NAT GW per AZ
  AZ-a private → NAT GW in AZ-a → Internet  (no cross-AZ fee)
  AZ-b private → NAT GW in AZ-b → Internet  (no cross-AZ fee)

Cost for 1TB/day cross-region savings:
  1000 GB × $0.01 = $10/day = $300/month saved per NAT GW pair
```

### IPv6 Dual-Stack Migration Checklist

```
Phase 1: Audit
  [ ] Identify all VPCs, subnets, SGs, NACLs
  [ ] Audit applications for IPv4 hardcoding
  [ ] Check OS/kernel IPv6 support

Phase 2: VPC enablement
  [ ] Enable IPv6 CIDR on VPC (/56 from Amazon)
  [ ] Assign /64 per subnet
  [ ] Add ::/0 route to Internet Gateway for public subnets
  [ ] Add ::/0 route to Egress-Only Internet Gateway for private

Phase 3: Compute
  [ ] Add IPv6 to EC2 launch templates
  [ ] Update security groups to include IPv6 CIDR blocks
  [ ] Update NACLs for IPv6 ranges

Phase 4: DNS
  [ ] Create AAAA records in Route 53
  [ ] Test dual-stack resolution
  [ ] Monitor IPv6 traffic ratio

Phase 5: Cutover
  [ ] Enable prefer IPv6 in application configs
  [ ] Monitor for IPv6-related errors
  [ ] Gradually reduce NAT Gateway capacity
```

### Prefix Lists — Manage CIDRs at Scale

```bash
# Create managed prefix list for corporate IPs
aws ec2 create-managed-prefix-list \
  --prefix-list-name corporate-ips \
  --max-entries 20 \
  --address-family IPv4

# Add entries
aws ec2 modify-managed-prefix-list \
  --prefix-list-id pl-0abc1234 \
  --add-entries '[
    {"Cidr": "203.0.113.0/24", "Description": "HQ Singapore"},
    {"Cidr": "198.51.100.0/24", "Description": "HQ London"}
  ]' \
  --current-version 1

# Reference in security group (updates all SGs when prefix list changes)
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc1234 \
  --ip-permissions '[{
    "IpProtocol": "tcp",
    "FromPort": 443,
    "ToPort": 443,
    "PrefixListIds": [{"PrefixListId": "pl-0abc1234"}]
  }]'
```

---

## 10. Global Traffic Management

### Multi-Region Load Balancing

```
                    ┌──────────────────────────┐
                    │      Route 53            │
                    │  Latency-based routing   │
                    │  + health checks         │
                    └─────────┬────────────────┘
                              │
           ┌──────────────────┼───────────────────┐
           │                  │                   │
  ┌────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
  │  us-east-1      │ │  eu-west-1     │ │ ap-southeast-1 │
  │  ALB            │ │  ALB           │ │  ALB           │
  │  + CloudFront   │ │  + CloudFront  │ │  + CloudFront  │
  └─────────────────┘ └────────────────┘ └────────────────┘

AWS Global Accelerator Alternative:
  - Anycast IPs (2 static IPs)
  - Ingress at closest AWS edge (not DNS-based)
  - TCP-level failover in <30s vs DNS TTL delay
  - Best for: non-HTTP, gaming, IoT, latency-critical APIs
```

### Global Accelerator vs CloudFront vs Route 53

| Feature                | Global Accelerator          | CloudFront              | Route 53 (Latency) |
|------------------------|-----------------------------|-------------------------|--------------------|
| Static IPs             | Yes (2 anycast IPs)         | No (DNS-based)          | No                 |
| Protocol               | TCP, UDP, HTTP              | HTTP/HTTPS only         | DNS (any protocol) |
| Caching                | No                          | Yes                     | No                 |
| Failover speed         | <30s                        | TTL-based               | TTL-based          |
| DDoS protection        | Shield (included)           | Shield (Standard)       | No                 |
| Use case               | Low-latency non-HTTP        | Static + dynamic cache  | DNS-level routing  |
| Cost                   | $0.025/hr + $0.01/GB        | $0.0085/10K requests    | $0.40/1M queries   |

### GeoDNS Implementation

```bash
# Route EU users to EU endpoint
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.example.com",
          "Type": "A",
          "SetIdentifier": "eu-west",
          "GeoLocation": {"ContinentCode": "EU"},
          "AliasTarget": {
            "HostedZoneId": "Z32O12XQLNTSW2",
            "DNSName": "eu-alb.eu-west-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      },
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "api.example.com",
          "Type": "A",
          "SetIdentifier": "default",
          "GeoLocation": {"CountryCode": "*"},
          "AliasTarget": {
            "HostedZoneId": "Z35SXDOTRQ7X7K",
            "DNSName": "us-alb.us-east-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'
```

---

## 11. Real-World Architecture: Multi-Region SaaS with 50 Microservices

### Architecture Diagram

```
                          Users (Global)
                               │
              ┌────────────────▼────────────────┐
              │         Route 53                 │
              │  Latency Routing + Health Checks │
              └──────────┬─────────────┬─────────┘
                         │             │
              ┌──────────▼──┐     ┌────▼──────────┐
              │  us-east-1  │     │  ap-southeast-1│
              │  (Primary)  │     │  (Secondary)   │
              └──────┬──────┘     └──────┬─────────┘
                     │                   │
              ┌──────▼──────┐     ┌──────▼─────────┐
              │ CloudFront  │     │  CloudFront     │
              │ + WAF       │     │  + WAF          │
              │ + Shield    │     │  + Shield       │
              └──────┬──────┘     └──────┬──────────┘
                     │                   │
              ┌──────▼──────┐     ┌──────▼──────────┐
              │ API Gateway │     │  API Gateway    │
              │ (Edge-opt.) │     │  (Regional)     │
              └──────┬──────┘     └──────┬──────────┘
                     │                   │
              ┌──────▼──────────────────▼──────────┐
              │         EKS Cluster (Istio mesh)    │
              │                                     │
              │  Ingress (Istio Gateway)             │
              │      │                              │
              │  ┌───▼─────────────────────────┐   │
              │  │  Service Mesh (mTLS)         │   │
              │  │                             │   │
              │  │ auth  payments  orders  ... │   │
              │  │  (50 microservices)         │   │
              │  └─────────────────────────────┘   │
              └──────────────────────────────────────┘
                     │                   │
              ┌──────▼────┐      ┌───────▼──────┐
              │   RDS     │      │  ElastiCache  │
              │ (Aurora   │      │  (Redis)      │
              │  Global)  │      └──────────────┘
              └───────────┘
```

### Network Segmentation for 50 Microservices

```
VPC CIDR: 10.0.0.0/16

Subnet Layout (per AZ × 3 AZs):
  Public tier:    10.0.0.0/20    – ALB, NAT GW, Bastion
  App tier:       10.0.16.0/18   – EKS worker nodes
  Data tier:      10.0.80.0/21   – RDS, ElastiCache, MSK

EKS Network Policy (Calico / Cilium):
  Default: deny all pod-to-pod traffic
  Allow: explicitly via NetworkPolicy per namespace

Example NetworkPolicy (payments can only be called by orders):
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: payments-ingress
    namespace: payments
  spec:
    podSelector:
      matchLabels:
        app: payments
    ingress:
      - from:
          - namespaceSelector:
              matchLabels:
                app: orders
        ports:
          - port: 8080
```

### Operational Runbooks for Network Incidents

```
INCIDENT: High 5xx from ALB

1. Check ALB target health
   aws elbv2 describe-target-health --target-group-arn <ARN>

2. Check ALB access logs in S3 for error pattern
   SELECT elb_status_code, target_status_code, request_url, count(*)
   FROM alb_access_logs
   WHERE elb_status_code >= 500
   GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 20;

3. Check instance/container health
   kubectl get pods -n production | grep -v Running

4. Check security group if new deployment changed SGs
   aws ec2 describe-security-groups --group-ids sg-prod

5. Check if NACLs block ephemeral ports (common mistake)
   aws ec2 describe-network-acls --filters Name=vpc-id,Values=vpc-prod

6. Roll back if deployment-related
   kubectl rollout undo deployment/api-service -n production

INCIDENT: DNS resolution failure

1. Check Route 53 health check status
   aws route53 list-health-checks | jq '.HealthChecks[] | {Id, Status: .HealthCheckConfig}'

2. Check health check CloudWatch alarms
   aws cloudwatch describe-alarms \
     --alarm-name-prefix "Route53-HealthCheck"

3. Verify TTL propagation (wait up to current TTL seconds)
   dig api.example.com +trace

4. Verify private DNS in VPC
   aws ec2 describe-vpc-attribute \
     --vpc-id vpc-prod --attribute enableDnsSupport

5. Force re-resolve from specific resolver
   dig @169.254.169.253 api.example.com  (AWS VPC resolver)
```

### Cost Optimization Checklist for Network

```
Monthly Network Cost Review:
  [ ] NAT Gateway — 1 per AZ, not 1 per region
  [ ] CloudFront — cache hit ratio >80%? Review cache policies
  [ ] DX port hours — right-sized? Consider shared connection
  [ ] TGW attachments — remove unused attachments ($0.05/hr each)
  [ ] VPC Endpoints — replace NAT GW traffic to S3/DynamoDB ($0 for gateway endpoints)
  [ ] Data transfer — same-region cross-AZ vs cross-region rates
  [ ] ALB — any idle load balancers? ($0.008/LCU-hr)
  [ ] Route 53 — health checks ($0.50/mo each) — remove stale ones

Quick wins:
  - S3/DynamoDB Gateway VPC Endpoints = $0 (saves NAT data processing)
  - CloudFront Origin Shield = small cost, big origin savings
  - NLB over ALB for non-HTTP = lower LCU consumption
  - Reserved capacity for DX = 12/36 month discounts available
```

---

## Quick Reference — Key Port Numbers & Protocols

| Service         | Port  | Protocol | Notes                                    |
|-----------------|-------|----------|------------------------------------------|
| HTTP            | 80    | TCP      | Redirect to 443 at ALB level             |
| HTTPS           | 443   | TCP      | TLS termination at ALB or pass-through   |
| gRPC            | 443   | HTTP/2   | ALB supports gRPC natively               |
| SSH             | 22    | TCP      | Use SSM Session Manager instead          |
| RDS PostgreSQL  | 5432  | TCP      | Within VPC only, no public exposure      |
| RDS MySQL       | 3306  | TCP      | Within VPC only                          |
| Redis           | 6379  | TCP      | Use ElastiCache endpoint                 |
| Kafka/MSK       | 9092  | TCP      | Within VPC; 9094 for TLS                 |
| DNS             | 53    | UDP/TCP  | UDP for queries <512 bytes, TCP otherwise|
| NTP             | 123   | UDP      | AWS Time Sync: 169.254.169.123           |
| Envoy admin     | 15000 | HTTP     | Istio sidecar admin interface            |
| Envoy inbound   | 15006 | TCP      | All inbound traffic intercepted          |
| Envoy outbound  | 15001 | TCP      | All outbound traffic intercepted         |
| GENEVE (GWLB)   | 6081  | UDP      | Gateway Load Balancer encapsulation      |
| BGP             | 179   | TCP      | DX, VPN, TGW routing protocol           |

---

## Interview Cheat Sheet — Instant Recall

```
DNS Failover:   TTL 30s + health check + SECONDARY record
ALB vs NLB:     HTTP routing → ALB; TCP/static IP → NLB
CDN Cache Miss: Check Cache-Control, CloudFront behaviors, origin response headers
TGW vs Peering: >10 VPCs or transitive routing needed → TGW
Service Mesh:   Envoy sidecar + control plane (istiod) + mTLS + VirtualService
Flow Logs:      VPC/Subnet/ENI level; S3 + Athena for analysis
NACL vs SG:     NACL = stateless subnet firewall; SG = stateful instance firewall
DX vs VPN:      Production consistent latency → DX; quick/cheap/backup → VPN
IPv6:           Egress-Only IGW for private subnets (like NAT GW for IPv4)
Global Acc.:    Anycast ingress + AWS backbone transit; better than DNS for TCP
PrivateLink:    NLB-backed endpoint service; no VPC peering needed; no IP overlap issues
```
