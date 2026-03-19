# Cloudflare Security

Cloudflare's security stack is a core differentiator -- every HTTP request to a proxied domain passes through the WAF, DDoS mitigation, and bot detection layers before reaching your origin. This guide covers the security services you need to know as a backend engineer.

---

## Table of Contents

1. [Security Stack Overview](#security-stack-overview)
2. [DDoS Protection](#ddos-protection)
3. [WAF (Web Application Firewall)](#waf)
4. [Bot Management](#bot-management)
5. [Rate Limiting](#rate-limiting)
6. [Zero Trust / Cloudflare Access](#zero-trust)
7. [Cloudflare Tunnel](#cloudflare-tunnel)
8. [API Shield](#api-shield)
9. [Common Interview Questions](#common-interview-questions)

---

## Security Stack Overview

Every request passes through these layers in order:

```
Incoming Request
     |
     v
+------------------+
| DDoS Mitigation  |  L3/L4/L7 -- always on, unmetered
+------------------+
     |
     v
+------------------+
| Bot Management   |  ML scoring, JavaScript challenges, fingerprinting
+------------------+
     |
     v
+------------------+
| WAF              |  OWASP rules, Cloudflare managed rules, custom rules
+------------------+
     |
     v
+------------------+
| Rate Limiting    |  Per-IP, per-path, custom expressions
+------------------+
     |
     v
+------------------+
| Access / Zero    |  Identity-based access for internal apps
| Trust            |
+------------------+
     |
     v
Origin Server
```

---

## DDoS Protection

Cloudflare provides **always-on, unmetered** DDoS protection at L3, L4, and L7.

### How It Works

```
DDoS Attack (10 Tbps)
     |
     v (distributed across 300+ PoPs via Anycast)
+--------+  +--------+  +--------+  +--------+
| PoP 1  |  | PoP 2  |  | PoP 3  |  | PoP 4  |  <-- Each absorbs fraction
| 2.5Tbps|  | 2.5Tbps|  | 2.5Tbps|  | 2.5Tbps|
+--------+  +--------+  +--------+  +--------+
     |           |           |           |
     v           v           v           v
   Scrubbed traffic (~1 Gbps legitimate) -> Origin
```

### DDoS Mitigation Layers

| Layer | Attack Type | Mitigation |
| ----- | ----------- | ---------- |
| **L3/L4** | SYN floods, UDP floods, amplification | Anycast absorption, packet filtering, rate limiting |
| **L7** | HTTP floods, slowloris, application-layer | JS challenges, behavioral analysis, rate limiting |
| **DNS** | DNS amplification, random subdomain | Anycast DNS, rate limiting, caching |

### Key Properties

- **Always on** -- no need to "activate" during an attack
- **Unmetered** -- no surge pricing during attacks (unlike AWS Shield Advanced)
- **Automatic** -- ML-based detection, no manual intervention needed
- **Network capacity** -- 296+ Tbps (as of 2024)

---

## WAF

### Managed Rulesets

| Ruleset | What It Covers |
| ------- | -------------- |
| **Cloudflare Managed** | Zero-day protection, Cloudflare-created rules updated continuously |
| **OWASP Core** | OWASP Top 10 (SQLi, XSS, RCE, SSRF, etc.) |
| **Leaked Credentials** | Detects login requests using compromised credentials |

### Custom Rules

```
Expression: (http.request.uri.path contains "/admin" and
             not ip.src in {10.0.0.0/8 172.16.0.0/12})
Action: Block

Expression: (http.request.method eq "POST" and
             http.request.uri.path eq "/api/login" and
             cf.threat_score > 30)
Action: Managed Challenge

Expression: (http.host eq "api.example.com" and
             not http.request.headers["x-api-key"][0] eq "secret123")
Action: Block
```

### WAF vs AWS WAF

| Feature | Cloudflare WAF | AWS WAF |
| ------- | -------------- | ------- |
| **Managed rules** | Included in plan | $1/rule/month + per-request |
| **DDoS** | Included | Shield Standard (basic) or Advanced ($3k/mo) |
| **Bot detection** | ML-based (Enterprise) | Bot Control ($10/month + per-request) |
| **Custom rules** | Plan-based limits | Pay per rule + per-request |
| **Deployment** | Instant (edge) | Per CloudFront/ALB |

---

## Bot Management

### Bot Score

```
cf.bot_management.score: 1-99
  1 = definitely a bot
  30 = likely a bot
  50 = uncertain
  80 = likely human
  99 = definitely human

cf.bot_management.verified_bot: true/false
  true = known good bots (Googlebot, Bingbot, etc.)
```

### Detection Methods

| Method | How |
| ------ | --- |
| **ML scoring** | Behavioral analysis of request patterns |
| **JavaScript challenge** | Browser must execute JS (blocks simple bots) |
| **Turnstile (CAPTCHA alternative)** | Privacy-preserving challenge without user interaction |
| **Device fingerprinting** | TLS fingerprint, HTTP/2 fingerprint (JA3/JA4) |
| **Heuristics** | Known bot patterns, suspicious headers |

---

## Rate Limiting

```
Rule: Match path = /api/login, method = POST
Rate: 5 requests per 10 seconds per IP
Action: Block for 60 seconds
Counting: Per IP + Per path

Advanced expressions:
  Rate limit by API key:
    Key: http.request.headers["x-api-key"]
    Rate: 100/minute

  Rate limit by country:
    Key: ip.geoip.country
    Rate: 1000/minute
```

### Rate Limiting Approaches

| Method | Where | Granularity | Consistency |
| ------ | ----- | ----------- | ----------- |
| **Cloudflare Rate Limiting** | Edge (all PoPs) | Per-PoP counting (approximate) | Eventually consistent |
| **Durable Objects** | Edge (single actor) | Exact counting | Strongly consistent |
| **Origin rate limiting** | Server | Exact counting | Per-server |

---

## Zero Trust

Cloudflare Access replaces VPNs with identity-aware access control.

```
Traditional VPN:
  User -> VPN tunnel -> Internal network -> All internal apps
  Problem: Once on VPN, user can access everything

Cloudflare Zero Trust:
  User -> Cloudflare edge -> Identity check -> Specific app only
  Each app has its own access policy
```

### Access Policies

```
Application: admin.example.com
Policy:
  Allow IF:
    - Email ends with @company.com
    - AND identity provider = Okta
    - AND device has valid certificate
    - AND country in [US, UK, SG]
  Block: everything else
```

### Identity Providers

Supports: Okta, Google Workspace, Azure AD, GitHub, OneLogin, SAML, OIDC.

---

## Cloudflare Tunnel

Securely connect your origin server to Cloudflare without opening inbound ports.

```
Without Tunnel:
  Internet -> Firewall (port 443 open) -> Origin
  Risk: Origin IP exposed, port scanning, direct attacks

With Tunnel:
  Internet -> Cloudflare Edge -> Tunnel (outbound-only) -> Origin
  Origin: No public IP needed, no open ports
  - cloudflared daemon makes outbound connections to Cloudflare
  - Cloudflare routes traffic through the tunnel
```

### Benefits

- Origin IP never exposed
- No firewall rules needed (all connections are outbound)
- Works behind NAT/restricted networks
- Automatic TLS between origin and Cloudflare
- Load balancing across multiple origin servers

---

## API Shield

Protect APIs with schema validation, abuse detection, and discovery.

| Feature | Description |
| ------- | ----------- |
| **Schema validation** | Upload OpenAPI spec, reject non-conforming requests |
| **API discovery** | ML-based automatic API endpoint detection |
| **Sequence detection** | Detect abnormal API call sequences |
| **mTLS** | Mutual TLS for API authentication |
| **JWT validation** | Validate JWTs at the edge (no origin hit for invalid tokens) |

---

## Common Interview Questions

1. **How does Cloudflare handle a 10 Tbps DDoS attack?** Anycast distributes the attack across 300+ PoPs. Each PoP absorbs a fraction. ML-based detection identifies attack patterns. Legitimate traffic is passed through while attack traffic is dropped at the edge.

2. **What is the difference between Cloudflare's WAF and AWS WAF?** Cloudflare WAF is included in paid plans with managed rules. AWS WAF charges per rule and per request. Cloudflare includes DDoS protection; AWS requires Shield Advanced ($3k/mo) for equivalent coverage.

3. **How does Cloudflare Tunnel work?** The `cloudflared` daemon runs on your origin and makes outbound connections to Cloudflare. Cloudflare routes incoming traffic through these tunnels. Origin never needs a public IP or open ports.

4. **What is Zero Trust and how does it replace VPNs?** Traditional VPNs grant network-level access (once on VPN, access everything). Zero Trust validates identity per-application and per-request. Cloudflare Access sits in front of each app and checks identity/device/location.

5. **How would you implement rate limiting for an API?** For approximate global rate limiting: use Cloudflare's built-in rate limiting rules (per-PoP counting). For exact counting: use Durable Objects. Key by API key, user ID, or IP. Return 429 with Retry-After header.

6. **What is bot scoring?** Cloudflare assigns each request a bot score (1-99) using ML, browser fingerprinting, and behavioral analysis. 1 = definitely bot, 99 = definitely human. You can set thresholds in WAF rules to challenge or block likely bots.
