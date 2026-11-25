# Cloudflare Services Overview for Engineers

Cloudflare operates one of the world's largest edge networks (300+ cities). Unlike AWS/GCP/Azure which are data-center-centric clouds, Cloudflare is an **edge-first platform** -- compute, storage, and security run at the network edge, close to users. This guide covers the services that matter for backend engineers.

---

## Service Map

### Edge Compute

| Service | One-Liner | AWS Equivalent |
| ------- | --------- | -------------- |
| **Workers** | V8 isolate-based serverless functions at the edge | Lambda@Edge / CloudFront Functions |
| **Durable Objects** | Stateful serverless actors with strong consistency | No direct equivalent (closest: DynamoDB + Lambda) |
| **Workers AI** | Run AI models at the edge | Bedrock / SageMaker endpoints |

### Storage

| Service | One-Liner | AWS Equivalent |
| ------- | --------- | -------------- |
| **KV** | Global key-value store (eventually consistent) | DynamoDB (eventual) / Parameter Store |
| **R2** | S3-compatible object storage with zero egress fees | S3 |
| **D1** | SQLite at the edge (serverless relational DB) | Aurora Serverless (loosely) |
| **Hyperdrive** | Connection pooling proxy for external databases | RDS Proxy |

### Networking & CDN

| Service | One-Liner | AWS Equivalent |
| ------- | --------- | -------------- |
| **CDN** | Global Anycast CDN with smart caching | CloudFront |
| **DNS** | Fastest authoritative DNS (global Anycast) | Route 53 |
| **Argo Smart Routing** | Optimized routing through Cloudflare's network | Global Accelerator |
| **Tunnel** | Secure tunnel from origin to Cloudflare (no public IP needed) | No direct equivalent |

### Security

| Service | One-Liner | AWS Equivalent |
| ------- | --------- | -------------- |
| **WAF** | Web Application Firewall with managed rulesets | AWS WAF |
| **DDoS Protection** | Always-on, unmetered L3/L4/L7 DDoS mitigation | Shield Advanced |
| **Bot Management** | ML-based bot detection and scoring | No direct equivalent |
| **Zero Trust / Access** | Identity-aware proxy for internal apps | AWS Verified Access |
| **API Shield** | API discovery, schema validation, abuse detection | API Gateway + WAF |

### Media & Applications

| Service | One-Liner | AWS Equivalent |
| ------- | --------- | -------------- |
| **Pages** | Jamstack deployment platform (Git-integrated) | Amplify Hosting |
| **Stream** | Video encoding, storage, and delivery | MediaConvert + CloudFront |
| **Images** | On-the-fly image resizing and optimization | CloudFront + Lambda@Edge |
| **Queues** | Message queue integrated with Workers | SQS |

---

## Why Cloudflare Matters for Backend Engineers

1. **Edge computing is the future** -- Cloudflare Workers run in 300+ cities with <50ms cold starts (V8 isolates, not containers)
2. **Zero egress fees** -- R2 eliminates the biggest cloud cost trap
3. **Full-stack at the edge** -- Compute (Workers) + Storage (KV/R2/D1) + Messaging (Queues) = entire backends at the edge
4. **Security-first** -- Every request passes through Cloudflare's security stack (WAF, DDoS, Bot Management)

---

## Table of Contents

| # | File | Topic | Key Concepts |
| - | ---- | ----- | ------------ |
| 1 | [01-WORKERS.md](01-WORKERS.md) | Workers & Edge Compute | V8 isolates, Durable Objects, KV, runtime limits |
| 2 | [02-CDN-DNS.md](02-CDN-DNS.md) | CDN & DNS | Anycast, caching tiers, cache rules, TTL strategies |
| 3 | [03-SECURITY.md](03-SECURITY.md) | Security | WAF, DDoS, Bot Management, Zero Trust, Tunnel |
| 4 | [04-R2-STORAGE.md](04-R2-STORAGE.md) | R2 Object Storage | S3-compatible, zero egress, multipart upload |
| 5 | [05-D1-DATABASE.md](05-D1-DATABASE.md) | D1 Database | Edge SQLite, replication, limitations |
| 6 | [06-PAGES-STREAMS.md](06-PAGES-STREAMS.md) | Pages & Stream | Jamstack deployment, video encoding |
| 7 | [07-QUEUES-PUBSUB.md](07-QUEUES-PUBSUB.md) | Queues & Pub/Sub | Message delivery, batching, retry policies |
