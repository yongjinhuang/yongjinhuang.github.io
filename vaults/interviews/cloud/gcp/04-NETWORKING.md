# GCP Networking

GCP's networking is fundamentally different from AWS: VPCs are global by default, load balancers get a single global anycast IP, and the premium tier routes traffic through Google's private backbone network. Understanding these differences is key for interviews at companies using GCP.

---

## Table of Contents

1. [VPC](#vpc)
2. [Cloud Load Balancing](#cloud-load-balancing)
3. [Cloud CDN](#cloud-cdn)
4. [Cloud Armor](#cloud-armor)
5. [Other Networking Services](#other-networking-services)
6. [GCP vs AWS Networking](#gcp-vs-aws-networking)
7. [Common Interview Questions](#common-interview-questions)

---

## VPC

### Global VPC (GCP's Unique Approach)

```
AWS VPC (Regional):
  VPC us-east-1 -> Subnet us-east-1a, Subnet us-east-1b
  VPC eu-west-1 -> Subnet eu-west-1a, Subnet eu-west-1b
  Cross-region: VPC Peering required

GCP VPC (Global):
  VPC "production" -> Subnet us-central1 (10.0.0.0/24)
                   -> Subnet europe-west1 (10.0.1.0/24)
                   -> Subnet asia-east1 (10.0.2.0/24)
  Cross-region: Internal IPs work automatically within the same VPC!
```

### Key Features

| Feature | GCP | AWS |
| ------- | --- | --- |
| **VPC scope** | Global | Regional |
| **Subnets** | Regional (span all zones in a region) | Zonal (one AZ per subnet) |
| **Cross-region** | Automatic within VPC | VPC Peering / Transit Gateway |
| **Firewall rules** | Network-level + tags/service accounts | Security Groups + NACLs |
| **Shared VPC** | Share VPC across projects | Share VPC across accounts (RAM) |
| **Private Google Access** | Access GCP services without public IP | VPC Endpoints |

### Firewall Rules

```
GCP uses network-level firewall rules with target tags or service accounts:

gcloud compute firewall-rules create allow-http \
  --network=production \
  --allow=tcp:80,tcp:443 \
  --target-tags=web-server \
  --source-ranges=0.0.0.0/0

-- Rules apply to instances with matching tags
-- Service account-based rules are more secure (can't be changed by instance)
```

---

## Cloud Load Balancing

GCP load balancers are global by default -- a single anycast IP routes traffic to the nearest healthy backend worldwide.

### Load Balancer Types

| Type | Layer | Scope | Use Case |
| ---- | ----- | ----- | -------- |
| **Global External HTTP(S)** | L7 | Global | Web apps, APIs (most common) |
| **Global External TCP/SSL Proxy** | L4 | Global | Non-HTTP TCP services |
| **Regional External TCP/UDP** | L4 | Regional | Network (passthrough) LB |
| **Internal HTTP(S)** | L7 | Regional | Internal microservices |
| **Internal TCP/UDP** | L4 | Regional | Internal non-HTTP services |

### Global HTTP(S) Load Balancer

```
User (Tokyo) -> Anycast IP (single global IP)
  -> Google Front End (GFE) in Tokyo
  -> Routes to nearest healthy backend
  -> Backend in asia-northeast1

User (London) -> Same Anycast IP
  -> GFE in London
  -> Routes to nearest healthy backend
  -> Backend in europe-west1
```

| Feature | Details |
| ------- | ------- |
| **Single IP** | One anycast IP for all regions (no DNS-based routing) |
| **SSL termination** | At Google's edge (managed certificates) |
| **URL map** | Route by path, host, headers |
| **CDN integration** | Enable Cloud CDN with one click |
| **Health checks** | HTTP, HTTPS, HTTP/2, TCP, gRPC |
| **Autoscaling** | Integrates with MIGs and NEGs |

### Network Endpoint Groups (NEGs)

```
Serverless NEG: Cloud Run, App Engine, Cloud Functions as backends
  -> Global HTTPS LB -> Serverless NEG -> Cloud Run service

Internet NEG: External endpoints as backends
  -> Use GCP LB in front of on-prem or other cloud services
```

---

## Cloud CDN

Works with Cloud Load Balancing to cache content at Google's edge.

| Feature | Details |
| ------- | ------- |
| **Integration** | Enable on existing HTTP(S) load balancer |
| **Cache modes** | USE_ORIGIN_HEADERS, CACHE_ALL_STATIC, FORCE_CACHE_ALL |
| **Cache keys** | Customizable (include/exclude query params, headers) |
| **Signed URLs** | Time-limited authenticated access |
| **Invalidation** | By URL path or tag |
| **Pricing** | Cache fill + cache egress + HTTP requests |

---

## Cloud Armor

WAF and DDoS protection integrated with Cloud Load Balancing.

| Feature | Details | AWS Equivalent |
| ------- | ------- | -------------- |
| **DDoS** | Always-on L3/L4/L7 | Shield Standard + Advanced |
| **WAF rules** | OWASP Top 10, custom rules | AWS WAF |
| **Rate limiting** | Per-IP, per-header | AWS WAF rate rules |
| **Bot management** | reCAPTCHA integration | Bot Control |
| **Adaptive protection** | ML-based anomaly detection | Shield Advanced |
| **Named IP lists** | Block by geo, IP list | IP sets |
| **Pricing** | Per policy + per rule + per request | Per rule + per request |

---

## Other Networking Services

| Service | Purpose | AWS Equivalent |
| ------- | ------- | -------------- |
| **Cloud DNS** | Managed authoritative DNS | Route 53 |
| **Cloud NAT** | Managed NAT gateway | NAT Gateway |
| **Cloud Interconnect** | Dedicated connection to GCP | Direct Connect |
| **Cloud VPN** | IPsec VPN tunnels | Site-to-Site VPN |
| **Private Service Connect** | Private access to GCP/third-party services | PrivateLink |
| **Network Intelligence Center** | Network monitoring and diagnostics | VPC Flow Logs + Reachability Analyzer |

### Network Tiers

```
Premium Tier (default):
  Traffic enters Google's backbone at nearest PoP
  Routed over Google's private fiber network
  Lower latency, higher reliability
  Higher cost

Standard Tier:
  Traffic routed over public internet
  Enters Google's network at the region
  Higher latency, lower cost
  Regional load balancers only (no global)
```

---

## GCP vs AWS Networking

| Aspect | GCP | AWS |
| ------ | --- | --- |
| **VPC** | Global | Regional |
| **Subnets** | Regional (all zones) | Per-AZ |
| **Load Balancer** | Global anycast (single IP) | Regional (Global Accelerator for global) |
| **Firewall** | Network-level with tags | Security Groups (instance-level) |
| **Cross-region** | Automatic within VPC | VPC Peering / Transit Gateway |
| **Network tiers** | Premium (backbone) / Standard (internet) | No equivalent (always backbone-ish) |
| **Private access** | Private Google Access | VPC Endpoints (Gateway/Interface) |

---

## Common Interview Questions

1. **How does GCP's global VPC differ from AWS?** GCP VPCs are global -- subnets span regions, internal IPs work cross-region automatically. AWS VPCs are regional -- cross-region requires VPC Peering or Transit Gateway. GCP's approach simplifies multi-region architectures.

2. **How does GCP's global load balancer work?** A single anycast IP is advertised from all Google edge PoPs. BGP routes users to the nearest PoP. The Google Front End (GFE) terminates SSL and routes to the nearest healthy backend. No DNS-based routing needed.

3. **What is the difference between Premium and Standard network tier?** Premium: traffic enters Google's backbone at nearest PoP, routed over private fiber (lower latency). Standard: traffic routed over public internet, enters Google at the region (higher latency, lower cost).

4. **How do GCP firewall rules work?** Network-level rules (not instance-level like AWS Security Groups). Target instances by tags or service accounts. Rules have priority (0-65535). Can apply to ingress or egress. Service account targeting is more secure than tag-based.

5. **When would you use Cloud Armor?** For WAF (OWASP rules, custom rules), DDoS protection, rate limiting, bot management, and geo-blocking. Attaches to HTTP(S) load balancers. Includes ML-based adaptive protection for automated attack mitigation.
