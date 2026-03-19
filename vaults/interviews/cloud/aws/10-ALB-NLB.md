# Elastic Load Balancing (ALB & NLB)

Elastic Load Balancing (ELB) distributes incoming traffic across multiple targets -- EC2 instances, containers, IPs, or Lambda functions -- across one or more Availability Zones. AWS offers three load balancer types: Application Load Balancer (ALB) for HTTP/HTTPS at Layer 7, Network Load Balancer (NLB) for TCP/UDP/TLS at Layer 4, and Classic Load Balancer (CLB) which is legacy and should be avoided for new workloads. Choosing the right type depends on whether you need intelligent HTTP routing or raw network performance.

---

## ALB (Application Load Balancer) -- Layer 7

ALB operates at the application layer and understands HTTP/HTTPS. It inspects request content to make routing decisions.

### Core Features

| Feature      | Details                                                  |
| ------------ | -------------------------------------------------------- |
| Protocol     | HTTP, HTTPS, gRPC                                        |
| Routing      | Path-based, host-based, header-based, query-string-based |
| Targets      | EC2 instances, IPs, Lambda functions, containers         |
| WebSockets   | Native support                                           |
| HTTP/2       | Native support                                           |
| Idle timeout | Default 60s, configurable                                |

### Path-Based Routing

Route requests to different target groups based on the URL path.

```
/api/*      -> API target group (port 8080)
/static/*   -> Static assets target group (port 80)
/health     -> Health check target group
/*          -> Default target group
```

### Host-Based Routing

Route based on the `Host` header, enabling multiple domains on a single ALB.

```
api.example.com    -> API target group
www.example.com    -> Web target group
admin.example.com  -> Admin target group
```

### Weighted Target Groups

Split traffic across target groups by weight. Useful for blue-green and canary deployments.

```json
{
  "Actions": [
    {
      "Type": "forward",
      "ForwardConfig": {
        "TargetGroups": [
          { "TargetGroupArn": "arn:aws:...blue-tg", "Weight": 90 },
          { "TargetGroupArn": "arn:aws:...green-tg", "Weight": 10 }
        ]
      }
    }
  ]
}
```

### Sticky Sessions

ALB supports application-based and duration-based stickiness. Cookies tie a client to a specific target for the life of the session.

- **Duration-based**: ALB generates `AWSALB` cookie. Configurable 1s to 7 days.
- **Application-based**: Your app sets a custom cookie. ALB uses it for routing.

Sticky sessions are configured per target group, not per listener.

---

## NLB (Network Load Balancer) -- Layer 4

NLB operates at the transport layer. It handles millions of requests per second with ultra-low latency (~100 microseconds added). It does not inspect packet content.

### Core Features

| Feature    | Details                                     |
| ---------- | ------------------------------------------- |
| Protocol   | TCP, UDP, TLS                               |
| Latency    | Ultra-low (~100us)                          |
| Static IPs | One static IP per AZ (or Elastic IP)        |
| Source IP  | Preserved by default                        |
| Targets    | EC2 instances, IPs, ALB (chaining)          |
| Connection | Long-lived connections supported            |
| Throughput | Millions of requests/second without warm-up |

### When NLB Shines

- Real-time gaming, IoT, financial trading (low latency)
- Non-HTTP protocols (MQTT, custom TCP)
- Need for static IPs or Elastic IPs
- Extreme throughput requirements
- PrivateLink (NLB is required for VPC endpoint services)

### NLB + ALB Chaining

Register an ALB as a target of an NLB. This gives you both static IPs (NLB) and Layer 7 routing (ALB).

---

## Target Types

| Target Type | ALB | NLB | Notes                            |
| ----------- | --- | --- | -------------------------------- |
| Instance    | Yes | Yes | Routes by instance ID            |
| IP          | Yes | Yes | Supports IPs in peered VPCs      |
| Lambda      | Yes | No  | ALB invokes Lambda synchronously |

Lambda targets on ALB: the ALB converts HTTP to JSON, invokes the function, and converts the response back. No target group health checks for Lambda targets.

---

## Health Checks

Both ALB and NLB perform health checks against registered targets. Unhealthy targets stop receiving traffic.

### Configuration Parameters

| Parameter           | ALB Default | NLB Default |
| ------------------- | ----------- | ----------- |
| Protocol            | HTTP        | TCP         |
| Path                | `/`         | N/A (TCP)   |
| Interval            | 30s         | 30s         |
| Timeout             | 5s          | 10s         |
| Healthy threshold   | 5           | 3           |
| Unhealthy threshold | 2           | 3           |

### ALB Health Check Example

```bash
aws elbv2 modify-target-group \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc123 \
  --health-check-protocol HTTP \
  --health-check-path /health \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 3 \
  --unhealthy-threshold-count 2 \
  --health-check-timeout-seconds 5
```

NLB health checks can be TCP (port open?), HTTP, or HTTPS. TCP checks are faster but less meaningful than HTTP checks that validate application state.

---

## SSL/TLS Termination

Both ALB and NLB support TLS termination at the load balancer using certificates from AWS Certificate Manager (ACM).

```bash
# Create an HTTPS listener on ALB
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/my-alb/abc123 \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:123456789:certificate/abc-123 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc123
```

- **ALB**: Terminates TLS, decrypts, inspects, re-encrypts if needed to targets.
- **NLB**: Can terminate TLS or pass through encrypted traffic directly to targets.
- **SNI (Server Name Indication)**: Both support multiple certificates on a single listener. The LB selects the right certificate based on the hostname.

---

## Cross-Zone Load Balancing

Distributes traffic evenly across all registered targets in all enabled AZs, regardless of which AZ received the request.

| Load Balancer | Default                    | Cost                                     |
| ------------- | -------------------------- | ---------------------------------------- |
| ALB           | Always on (cannot disable) | No extra charge                          |
| NLB           | Off by default             | Inter-AZ data charges apply when enabled |

Without cross-zone: traffic is split evenly across AZs first, then among targets within that AZ. If AZ-A has 2 targets and AZ-B has 8, each AZ gets 50% -- meaning AZ-A targets get 25% each while AZ-B targets get 6.25% each.

---

## Access Logs

ALB can log all requests to S3. Each log entry includes client IP, latencies, request path, server response, and more.

```bash
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/my-alb/abc123 \
  --attributes Key=access_logs.s3.enabled,Value=true \
               Key=access_logs.s3.bucket,Value=my-alb-logs \
               Key=access_logs.s3.prefix,Value=prod
```

NLB does not have access logs. Use VPC Flow Logs instead for NLB traffic analysis.

---

## Connection Draining / Deregistration Delay

When a target is deregistered or fails a health check, the LB stops sending new requests but allows in-flight requests to complete.

- Default: 300 seconds
- Range: 0-3600 seconds
- Set to 0 for immediate deregistration (not recommended for production)

```bash
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc123 \
  --attributes Key=deregistration_delay.timeout_seconds,Value=120
```

---

## ALB + WAF Integration

ALB is the only load balancer type that integrates with AWS WAF. Attach a Web ACL to filter malicious traffic before it reaches your application.

```bash
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:us-east-1:123456789:regional/webacl/my-acl/abc123 \
  --resource-arn arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/my-alb/abc123
```

WAF rules can block by IP, rate-limit, match SQL injection patterns, and apply managed rule groups (OWASP top 10, bot control, etc.).

---

## ALB vs NLB Decision Matrix

| Criteria               | Choose ALB                            | Choose NLB             |
| ---------------------- | ------------------------------------- | ---------------------- |
| Protocol               | HTTP/HTTPS/gRPC                       | TCP/UDP/TLS            |
| Routing needs          | Path, host, header-based              | None (port-based only) |
| Latency requirement    | Acceptable (~ms)                      | Ultra-low (~us)        |
| Static IP needed       | No (use Global Accelerator if needed) | Yes (built-in)         |
| WAF needed             | Yes                                   | No                     |
| Lambda targets         | Yes                                   | No                     |
| PrivateLink            | No                                    | Yes (required)         |
| Source IP preservation | Via X-Forwarded-For header            | Natively preserved     |
| Sticky sessions        | Yes                                   | No                     |

---

## Common CLI Commands

```bash
# Create an ALB
aws elbv2 create-load-balancer \
  --name my-alb \
  --type application \
  --subnets subnet-aaa subnet-bbb \
  --security-groups sg-12345

# Create an NLB
aws elbv2 create-load-balancer \
  --name my-nlb \
  --type network \
  --subnets subnet-aaa subnet-bbb

# Create a target group
aws elbv2 create-target-group \
  --name my-tg \
  --protocol HTTP \
  --port 80 \
  --vpc-id vpc-12345 \
  --target-type instance \
  --health-check-path /health

# Register targets
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc123 \
  --targets Id=i-1234567890abcdef0 Id=i-0987654321fedcba0

# Describe load balancers
aws elbv2 describe-load-balancers --names my-alb

# Describe target health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/my-tg/abc123

# Delete a load balancer
aws elbv2 delete-load-balancer \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/my-alb/abc123
```

---

## Common Gotchas

1. **ALB has no static IP.** ALB DNS names resolve to changing IPs. If you need a static IP with HTTP routing, put an NLB in front of an ALB, or use AWS Global Accelerator.

2. **ALB does not preserve client source IP by default.** The client IP is in the `X-Forwarded-For` header. Your application must read it from there. NLB preserves source IP natively.

3. **ALB warm-up under sudden traffic spikes.** ALB scales automatically but not instantly. For predictable large events, contact AWS support to pre-warm. NLB handles sudden spikes without warm-up.

4. **Security groups.** ALB requires security groups. NLB does not use security groups (traffic passes through). Your target security groups must allow traffic from the NLB subnet CIDRs.

5. **Cross-zone charges on NLB.** Enabling cross-zone load balancing on NLB incurs inter-AZ data transfer charges. ALB has it always on at no extra cost.

6. **Health check source.** ALB health checks come from the ALB's own IPs. NLB health checks come from the NLB node IPs in each AZ. Make sure security groups on targets allow these.

7. **Deregistration delay.** Default 300s is often too long for rolling deployments. Tune it based on your typical request duration.

8. **Target group per listener rule limit.** ALB supports up to 100 rules per listener. Plan your routing carefully.
