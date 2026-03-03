# Route 53 (DNS)

Route 53 is AWS's managed Domain Name System (DNS) service that combines three functions: DNS resolution (translating domain names to IP addresses), domain registration (buying and managing domain names), and health checking (monitoring endpoint availability and routing traffic away from failures). The name references both the historic Route 66 and TCP/UDP port 53 used by DNS. Route 53 offers 100% availability SLA -- the only AWS service to do so.

---

## Hosted Zones

A hosted zone is a container for DNS records for a domain. It defines how traffic is routed for that domain and its subdomains.

| Type | Purpose | Accessible From |
|------|---------|----------------|
| Public | Routes internet traffic | Anywhere on the internet |
| Private | Routes traffic within VPCs | Associated VPCs only |

```bash
# Create a public hosted zone
aws route53 create-hosted-zone \
  --name example.com \
  --caller-reference "2024-01-unique-string"

# Create a private hosted zone
aws route53 create-hosted-zone \
  --name internal.example.com \
  --caller-reference "2024-01-internal" \
  --vpc VPCRegion=us-east-1,VPCId=vpc-12345 \
  --hosted-zone-config PrivateZone=true
```

Each hosted zone gets four NS records and one SOA record automatically. Public hosted zones cost $0.50/month. You get a default limit of 50 hosted zones per account (increase via support request).

---

## Record Types

| Record Type | Purpose | Example |
|-------------|---------|---------|
| A | Maps domain to IPv4 address | `example.com -> 93.184.216.34` |
| AAAA | Maps domain to IPv6 address | `example.com -> 2001:db8::1` |
| CNAME | Maps domain to another domain | `www.example.com -> example.com` |
| Alias | Maps domain to AWS resource (AWS-specific) | `example.com -> d123.cloudfront.net` |
| MX | Mail server routing | `example.com -> 10 mail.example.com` |
| TXT | Arbitrary text (SPF, DKIM, verification) | `example.com -> "v=spf1 ..."` |
| NS | Name server delegation | `example.com -> ns-123.awsdns-45.com` |
| SOA | Start of authority | Zone metadata |
| SRV | Service locator | `_sip._tcp.example.com -> 10 5 5060 sip.example.com` |
| CAA | Certificate authority authorization | `example.com -> 0 issue "letsencrypt.org"` |

---

## Alias Records

Alias records are a Route 53-specific extension to DNS. They look like A or AAAA records to clients but internally resolve to AWS resources.

### Alias vs CNAME

| Feature | Alias | CNAME |
|---------|-------|-------|
| Zone apex (naked domain) | Yes | No |
| DNS query charge | Free for AWS targets | Standard charges |
| Target | AWS resources only | Any domain |
| Record type | A or AAAA | CNAME |
| TTL | Set by Route 53 automatically | You configure |

### Valid Alias Targets

- CloudFront distributions
- Elastic Load Balancers (ALB, NLB, CLB)
- S3 website endpoints
- API Gateway
- VPC interface endpoints
- Elastic Beanstalk environments
- Another Route 53 record in the same hosted zone
- Global Accelerator

**You cannot create an Alias to an EC2 instance directly.** Use the instance's public IP with a standard A record instead.

### Example: Alias to ALB

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.example.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "my-alb-123456.us-east-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

The `HostedZoneId` in AliasTarget is the hosted zone of the ALB itself (not your hosted zone). Each AWS service has a fixed hosted zone ID per region -- find it in the AWS docs.

---

## Routing Policies

### Simple Routing

Returns one or more values randomly. No health checks attached to individual records.

```json
{
  "Name": "app.example.com",
  "Type": "A",
  "TTL": 300,
  "ResourceRecords": [
    { "Value": "1.2.3.4" },
    { "Value": "5.6.7.8" }
  ]
}
```

### Weighted Routing

Split traffic by percentage. Useful for canary deployments and A/B testing.

```
app.example.com -> 1.2.3.4   (weight: 70)
app.example.com -> 5.6.7.8   (weight: 20)
app.example.com -> 9.10.11.12 (weight: 10)
```

Weight 0 stops all traffic to that record. If all weights are 0, traffic splits equally.

### Latency-Based Routing

Routes to the region with the lowest latency for the client. Route 53 maintains a latency database between regions and client locations.

```
app.example.com -> us-east-1 ALB  (region: us-east-1)
app.example.com -> eu-west-1 ALB  (region: eu-west-1)
app.example.com -> ap-southeast-1 ALB (region: ap-southeast-1)
```

### Failover Routing

Active-passive setup. Primary record serves traffic; secondary takes over when primary health check fails.

```
app.example.com -> Primary (1.2.3.4, health check attached)
app.example.com -> Secondary (5.6.7.8, failover target)
```

### Geolocation Routing

Routes based on the geographic location of the client. You map continents, countries, or US states to specific records.

```
app.example.com -> EU server    (location: Europe)
app.example.com -> US server    (location: United States)
app.example.com -> Default      (location: Default -- required as fallback)
```

Always create a default record. Without it, clients from unmapped locations get no response.

### Geoproximity Routing

Routes based on geographic distance with an adjustable bias. Requires Route 53 Traffic Flow. Bias values (-99 to 99) expand or shrink the geographic region from which a resource receives traffic.

### Multi-Value Answer Routing

Returns up to 8 healthy records randomly. Each record has its own health check. It is not a replacement for a load balancer but provides basic DNS-level health checking and distribution.

---

## Health Checks

Route 53 health checks monitor endpoints and can trigger DNS failover.

### Types

| Type | What It Checks |
|------|---------------|
| Endpoint | HTTP, HTTPS, or TCP to a specific IP/domain |
| Calculated | Combines multiple health checks with AND, OR, or NOT logic |
| CloudWatch Alarm | State of a CloudWatch alarm (for private resources) |

### Endpoint Health Check Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| Protocol | HTTP | HTTP, HTTPS, or TCP |
| Request interval | 30s | 10s available (higher cost) |
| Failure threshold | 3 | Consecutive failures before unhealthy |
| String matching | Disabled | Check first 5120 bytes of response for a string |
| Regions | All | Choose which Route 53 checker regions to use |

```bash
# Create a health check
aws route53 create-health-check \
  --caller-reference "2024-health-check-1" \
  --health-check-config '{
    "IPAddress": "1.2.3.4",
    "Port": 443,
    "Type": "HTTPS",
    "ResourcePath": "/health",
    "FullyQualifiedDomainName": "app.example.com",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }'
```

### Calculated Health Checks

Aggregate multiple child health checks into a single parent check. Useful for complex failover logic.

```bash
aws route53 create-health-check \
  --caller-reference "2024-calc-check" \
  --health-check-config '{
    "Type": "CALCULATED",
    "ChildHealthChecks": ["hc-111", "hc-222", "hc-333"],
    "HealthThreshold": 2
  }'
```

This parent check is healthy if at least 2 of the 3 children are healthy.

### Monitoring Private Resources

Health check endpoints must be publicly accessible -- Route 53 checkers are on the public internet. For private resources, use a CloudWatch Alarm health check: your private resource publishes a CloudWatch metric, an alarm fires when unhealthy, and the Route 53 health check watches the alarm state.

---

## Domain Registration

Route 53 can register new domains and transfer existing ones. Registration includes automatic creation of a public hosted zone with NS and SOA records.

```bash
# Check domain availability
aws route53domains check-domain-availability \
  --domain-name example.com

# List registered domains
aws route53domains list-domains
```

Domain registration supports auto-renewal, transfer lock, and privacy protection (WHOIS privacy). Not all TLDs are supported.

---

## Private Hosted Zones and VPC Association

Private hosted zones resolve DNS queries from associated VPCs only.

```bash
# Associate a VPC with a private hosted zone
aws route53 associate-vpc-with-hosted-zone \
  --hosted-zone-id Z1234567890 \
  --vpc VPCRegion=us-east-1,VPCId=vpc-12345
```

For cross-account VPC association, the hosted zone owner must create an authorization, and the VPC owner accepts it. Enable DNS hostnames and DNS resolution in the VPC settings.

---

## DNSSEC

Route 53 supports DNSSEC for both domain registration and DNS resolution. DNSSEC adds cryptographic signatures to DNS records to prevent spoofing.

Enabling DNSSEC on a hosted zone:
1. Create a KSK (Key Signing Key) backed by a KMS key in us-east-1
2. Route 53 generates ZSK (Zone Signing Key) automatically
3. Add the DS record to the parent zone (done automatically if domain is registered with Route 53)

```bash
aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id Z1234567890
```

---

## Traffic Flow

Traffic Flow is a visual policy editor for complex routing configurations. It lets you combine routing policies (weighted + failover + geolocation) into a single reusable traffic policy.

- Policies are versioned
- Applied to records as traffic policy instances
- Useful when simple routing policy combinations get unwieldy

---

## Common CLI Commands

```bash
# List hosted zones
aws route53 list-hosted-zones

# List records in a hosted zone
aws route53 list-resource-record-sets \
  --hosted-zone-id Z1234567890

# Create/update/delete records (UPSERT is create-or-update)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.example.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "1.2.3.4" }]
      }
    }]
  }'

# Get hosted zone details
aws route53 get-hosted-zone --id Z1234567890

# Test DNS resolution
aws route53 test-dns-answer \
  --hosted-zone-id Z1234567890 \
  --record-name app.example.com \
  --record-type A
```

---

## Common Gotchas

1. **CNAME at zone apex is not allowed.** DNS RFC prohibits CNAME records at the zone apex (e.g., `example.com`). Use an Alias record instead. This is one of the most common mistakes.

2. **TTL management during migrations.** Before migrating DNS, lower TTL to 60s a few days ahead. After migration is verified, raise it back. Forgetting this means stale records linger in caches for hours.

3. **Health check endpoints must be publicly accessible.** Route 53 health checkers run from AWS's public infrastructure. They cannot reach private IPs or resources behind a firewall without special configuration (use CloudWatch Alarm health checks for private resources).

4. **50 hosted zones per account (default).** This is a soft limit. Request an increase via AWS Support if you manage many domains.

5. **Propagation delay.** Changes to Route 53 records typically propagate within 60 seconds, but client-side DNS caching (respecting TTL) means users may see old records longer.

6. **Alias record target hosted zone IDs.** When creating Alias records, you must provide the target service's hosted zone ID, not your own. These IDs are fixed per service per region and documented by AWS.

7. **Weighted routing with weight 0.** Setting weight to 0 does not delete the record -- it stops traffic. If all records have weight 0, traffic splits equally. This catches people off guard during testing.

8. **Multi-value answer is not a load balancer.** It returns up to 8 random healthy IPs. There is no session affinity, no connection distribution, and no health-aware load balancing beyond DNS-level exclusion of unhealthy records.

9. **Private hosted zone resolution.** Both `enableDnsHostnames` and `enableDnsSupport` must be set to true on the VPC for private hosted zone resolution to work.
