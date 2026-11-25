# Azure Networking

Azure networking is closer to AWS than GCP -- VNets are regional, subnets are zonal. The standout service is Azure Front Door, a global CDN + load balancer + WAF in one product.

---

## Table of Contents

1. [Virtual Network (VNet)](#vnet)
2. [Load Balancing Options](#load-balancing-options)
3. [Azure Front Door](#azure-front-door)
4. [Other Networking Services](#other-networking-services)
5. [Comparison with AWS](#comparison-with-aws)
6. [Common Interview Questions](#common-interview-questions)

---

## VNet

| Feature | Azure VNet | AWS VPC |
| ------- | ---------- | ------- |
| **Scope** | Regional | Regional |
| **Subnets** | Regional (span all AZs) | Per-AZ |
| **Cross-region** | VNet Peering (global) | VPC Peering |
| **NSG** | Network Security Groups (stateful) | Security Groups (stateful) |
| **Firewall** | Azure Firewall (managed) | Network Firewall |
| **NAT** | NAT Gateway | NAT Gateway |
| **Private endpoints** | Private Link | PrivateLink |
| **DNS** | Azure Private DNS | Route 53 Private Hosted Zones |

### Network Security Groups (NSG)

```
Applied to: subnets or individual NICs
Rules: priority-based (100-4096), allow/deny, inbound/outbound

Example:
  Priority 100: Allow TCP 443 from Internet    -> ALLOW
  Priority 200: Allow TCP 22 from 10.0.0.0/8   -> ALLOW
  Priority 4096: Deny all inbound               -> DENY (default)
```

---

## Load Balancing Options

```
Decision tree:

Global or regional?
  Global -> HTTP or non-HTTP?
    HTTP -> Azure Front Door (CDN + WAF + global LB)
    Non-HTTP -> Traffic Manager (DNS-based routing)
  Regional -> HTTP or non-HTTP?
    HTTP -> Application Gateway (L7 + WAF)
    Non-HTTP -> Azure Load Balancer (L4)
```

| Service | Layer | Scope | Key Feature |
| ------- | ----- | ----- | ----------- |
| **Front Door** | L7 | Global | CDN + WAF + LB (all-in-one) |
| **Traffic Manager** | DNS | Global | DNS-based routing (failover, geo, weighted) |
| **Application Gateway** | L7 | Regional | WAF, SSL termination, URL routing |
| **Load Balancer** | L4 | Regional | TCP/UDP, ultra-low latency |

---

## Azure Front Door

Global CDN + load balancer + WAF in one service (closest to Cloudflare's all-in-one offering).

| Feature | Details |
| ------- | ------- |
| **CDN** | Global edge caching at Microsoft's PoPs |
| **Load balancing** | Anycast-based global load balancing |
| **WAF** | Managed rulesets (OWASP), custom rules, bot protection |
| **SSL** | Free managed certificates |
| **Routing** | URL path, header, geo, weighted, session affinity |
| **Health probes** | Automatic backend health monitoring |
| **Caching** | Query string, header-based cache keys |
| **Private Link** | Connect to private backends (no public IP needed) |

### Front Door vs CloudFront vs Cloudflare

| Feature | Front Door | CloudFront | Cloudflare |
| ------- | ---------- | ---------- | ---------- |
| **CDN** | Yes | Yes | Yes |
| **WAF** | Built-in | Separate | Built-in |
| **Global LB** | Built-in | Separate (Global Accelerator) | Built-in (Anycast) |
| **DDoS** | Built-in | Shield Standard | Built-in (unmetered) |
| **Edge compute** | No | Lambda@Edge | Workers |
| **Private backend** | Private Link | No | Tunnel |
| **Pricing** | Per request + per GB | Per request + per GB | Flat plans |

---

## Other Networking Services

| Service | Purpose | AWS Equivalent |
| ------- | ------- | -------------- |
| **ExpressRoute** | Dedicated connection to Azure | Direct Connect |
| **VPN Gateway** | Site-to-site VPN | Site-to-Site VPN |
| **Azure DNS** | Managed DNS | Route 53 |
| **Azure Firewall** | Managed network firewall | Network Firewall |
| **Private Link** | Private access to Azure services | PrivateLink |
| **Azure Bastion** | Secure RDP/SSH access without public IP | Session Manager |

---

## Comparison with AWS

| Feature | Azure | AWS |
| ------- | ----- | --- |
| **VNet/VPC** | Regional, subnets span AZs | Regional, subnets per-AZ |
| **Global LB** | Front Door (built-in CDN+WAF) | CloudFront + Global Accelerator + WAF |
| **L7 LB** | Application Gateway | ALB |
| **L4 LB** | Load Balancer | NLB |
| **DNS routing** | Traffic Manager | Route 53 routing policies |
| **DDoS** | DDoS Protection (Standard) | Shield (Standard + Advanced) |
| **Private access** | Private Link | PrivateLink |
| **Dedicated line** | ExpressRoute | Direct Connect |

---

## Common Interview Questions

1. **How do you choose between Azure's load balancing options?** Global HTTP: Front Door. Global non-HTTP: Traffic Manager. Regional HTTP: Application Gateway. Regional non-HTTP: Load Balancer.

2. **What is Azure Front Door?** An all-in-one global service combining CDN, L7 load balancing, WAF, and DDoS protection. Routes traffic to the nearest healthy backend using anycast. Similar to combining CloudFront + ALB + WAF + Global Accelerator in AWS.

3. **How do Azure NSGs work?** Stateful firewall rules applied to subnets or NICs. Priority-based (lower number = higher priority). Rules specify allow/deny for inbound/outbound traffic by protocol, port, and source/destination.

4. **What is Private Link?** Exposes Azure services (Storage, SQL, Cosmos DB) via a private IP in your VNet. Traffic stays on Microsoft's backbone. No public internet exposure. Similar to AWS PrivateLink / VPC Endpoints.
