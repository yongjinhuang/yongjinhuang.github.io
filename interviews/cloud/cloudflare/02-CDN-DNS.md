# Cloudflare CDN & DNS

Cloudflare operates the fastest DNS resolver (1.1.1.1) and one of the largest CDN networks in the world. Understanding how Anycast routing, caching tiers, and cache invalidation work is essential for backend engineers building performant, globally distributed applications.

---

## Table of Contents

1. [Anycast Network](#anycast-network)
2. [DNS](#dns)
3. [CDN Architecture](#cdn-architecture)
4. [Caching Tiers](#caching-tiers)
5. [Cache Rules and Configuration](#cache-rules-and-configuration)
6. [Cache Invalidation](#cache-invalidation)
7. [Comparison with AWS CloudFront](#comparison-with-aws-cloudfront)
8. [Common Interview Questions](#common-interview-questions)

---

## Anycast Network

Unlike traditional CDNs that use DNS-based routing (return different IP per region), Cloudflare uses **Anycast** -- the same IP address is announced from every data center worldwide.

```
Traditional CDN (Unicast/DNS-based):
  User in Tokyo -> DNS resolves to 1.2.3.4 (Tokyo server IP)
  User in London -> DNS resolves to 5.6.7.8 (London server IP)

Cloudflare (Anycast):
  User in Tokyo -> routes to 104.16.0.1 -> arrives at Tokyo PoP (nearest)
  User in London -> routes to 104.16.0.1 -> arrives at London PoP (nearest)
  Same IP, BGP routing picks nearest data center
```

### Benefits of Anycast

| Benefit | How |
| ------- | --- |
| **Automatic failover** | If a PoP goes down, BGP reroutes to next nearest |
| **DDoS absorption** | Attack traffic distributed across all 300+ PoPs |
| **No DNS propagation delay** | No need to update DNS records on failover |
| **Lower latency** | BGP naturally routes to nearest PoP |

---

## DNS

Cloudflare is both a **recursive resolver** (1.1.1.1 for consumers) and an **authoritative DNS** service (for your domains).

### Authoritative DNS Features

| Feature | Details |
| ------- | ------- |
| **Speed** | Fastest authoritative DNS (global Anycast) |
| **DNSSEC** | One-click DNSSEC signing |
| **Proxy mode** | Orange cloud: traffic goes through Cloudflare (CDN + security). Grey cloud: DNS only |
| **TTL** | Auto (300s when proxied), or custom (60s - 1 day) |
| **Record types** | A, AAAA, CNAME, MX, TXT, SRV, HTTPS, SVCB |
| **CNAME flattening** | Returns A record for CNAME at zone apex (standards-compliant) |

### Proxy Mode (Orange Cloud vs Grey Cloud)

```
Orange Cloud (Proxied):
  User -> Cloudflare PoP (CDN + WAF + DDoS) -> Origin
  - Origin IP hidden
  - All Cloudflare features active
  - SSL terminated at Cloudflare edge

Grey Cloud (DNS Only):
  User -> Origin directly
  - Origin IP exposed
  - No Cloudflare features
  - Use for: mail servers, non-HTTP services
```

---

## CDN Architecture

```
+----------------------------------------------------------+
|                    Cloudflare CDN                          |
|                                                           |
|  Edge PoPs (300+ cities)                                  |
|  +--------+  +--------+  +--------+  +--------+          |
|  | Tokyo  |  | London |  | NYC    |  | Sydney |          |
|  | cache  |  | cache  |  | cache  |  | cache  |          |
|  +--------+  +--------+  +--------+  +--------+          |
|       |            |           |           |              |
|       v            v           v           v              |
|  Tier 1: Edge Cache (L1)                                  |
|  - Closest to user                                        |
|  - Highest cache miss rate (many PoPs, split traffic)     |
|                                                           |
|       |            |           |           |              |
|       +-----+------+-----------+-----------+              |
|             v                                             |
|  Tier 2: Regional Cache (L2) -- "Tiered Cache"           |
|  +------------------+  +------------------+               |
|  | US Regional      |  | EU Regional      |              |
|  | (aggregates L1)  |  | (aggregates L1)  |              |
|  +------------------+  +------------------+               |
|             |                    |                         |
|             v                    v                         |
+----------------------------------------------------------+
              |
              v
       +------------------+
       | Origin Server    |
       +------------------+
```

### Tiered Cache (Argo Tiered Cache)

Without tiered cache: Each of 300+ PoPs independently requests from origin on cache miss. Origin gets hammered.

With tiered cache: Cache misses at edge PoPs go to a regional "upper-tier" cache first. Only if the regional cache misses does it go to origin. Dramatically reduces origin load.

---

## Caching Tiers

### What Gets Cached by Default

| Content Type | Cached? | Details |
| ------------ | ------- | ------- |
| Static files (.js, .css, .jpg, .png, .svg, .woff2) | Yes | Based on file extension |
| HTML | No (by default) | Must explicitly enable with Cache Rules |
| API responses | No (by default) | Must explicitly enable with Cache Rules |
| POST/PUT/DELETE | Never | Only GET and HEAD are cacheable |

### Cache-Control Header

Cloudflare respects `Cache-Control` from your origin:

```
Cache-Control: public, max-age=3600
  -> Cloudflare caches for 3600s, browser caches for 3600s

Cache-Control: public, s-maxage=86400, max-age=3600
  -> Cloudflare caches for 86400s (1 day), browser caches for 3600s (1 hour)

Cache-Control: private, no-store
  -> Cloudflare does NOT cache, browser does NOT cache

Cloudflare-CDN-Cache-Control: max-age=86400
  -> Cloudflare-specific header (not forwarded to browser)
```

### Cache Status Headers

```
cf-cache-status: HIT        -- Served from Cloudflare edge cache
cf-cache-status: MISS       -- Fetched from origin, now cached
cf-cache-status: EXPIRED    -- Was cached but TTL expired, re-fetched
cf-cache-status: DYNAMIC    -- Not eligible for caching
cf-cache-status: BYPASS     -- Explicitly bypassed (Cache Rules or cookie)
cf-cache-status: REVALIDATED -- Conditional request (304 from origin)
```

---

## Cache Rules and Configuration

### Cache Rules (replacing legacy Page Rules)

```
Cache Rules (priority order):
  1. Match: hostname = api.example.com AND path = /v1/public/*
     Action: Cache (TTL = 1 hour, browser TTL = 5 min)

  2. Match: hostname = example.com AND path = /blog/*
     Action: Cache (TTL = 1 day, browser TTL = 1 hour)

  3. Match: hostname = example.com AND cookie contains "session"
     Action: Bypass Cache

  4. Match: hostname = example.com
     Action: Cache (use origin Cache-Control headers)
```

### Cache Key Customization

The cache key determines what counts as a "different" cached resource:

```
Default cache key: scheme + host + path + query string
  https://example.com/api/users?page=1   -> cache key A
  https://example.com/api/users?page=2   -> cache key B (different)

Custom cache key options:
  - Include/exclude query parameters
  - Include headers (e.g., Accept-Language for per-language caching)
  - Include cookies
  - Include device type (mobile/desktop)
```

---

## Cache Invalidation

### Purge Methods

| Method | Scope | Speed | Use Case |
| ------ | ----- | ----- | -------- |
| **Purge Everything** | All cached content | ~30 seconds globally | Emergency, major deploy |
| **Purge by URL** | Single URL | ~30 seconds globally | Updated specific page |
| **Purge by Tag** | All URLs with a Cache-Tag header | ~30 seconds globally | Updated product category |
| **Purge by Prefix** | All URLs under a path prefix | ~30 seconds globally | Updated /blog/* |
| **Purge by Hostname** | All URLs for a hostname | ~30 seconds globally | Updated api.example.com |

### Cache-Tag Based Purging

```
Origin response:
  Cache-Tag: product-123, category-electronics, homepage

API call:
  POST /zones/{zone_id}/purge_cache
  { "tags": ["product-123"] }

  -> Purges ALL URLs that included "product-123" in their Cache-Tag header
```

This is the most powerful and precise invalidation method. Tag your responses at the origin, then purge by tag when content changes.

---

## Comparison with AWS CloudFront

| Feature | Cloudflare CDN | AWS CloudFront |
| ------- | -------------- | -------------- |
| **PoPs** | 300+ cities | ~600+ PoPs (more locations) |
| **Routing** | Anycast (same IP everywhere) | DNS-based (different IPs per region) |
| **SSL** | Free universal SSL + auto-renewal | Free ACM certificate + manual setup |
| **DDoS** | Always-on, unmetered, free | Shield Standard (free), Advanced ($3k/mo) |
| **WAF** | Included in paid plans | Separate pricing per rule |
| **Edge compute** | Workers (V8 isolates, <5ms cold start) | Lambda@Edge (containers, 100ms+ cold start) |
| **Pricing** | Flat-rate plans, no egress fees to origin | Per-request + per-GB egress |
| **Cache invalidation** | Free, unlimited, by URL/tag/prefix | $0.005 per path, 1000 free/month |
| **HTTP/3 + QUIC** | Enabled by default | Supported |
| **Tiered cache** | Argo Tiered Cache (paid) | Origin Shield (paid) |

---

## Common Interview Questions

1. **What is Anycast and why does Cloudflare use it?** Anycast announces the same IP from all data centers. BGP routing directs users to the nearest PoP. Benefits: automatic failover, DDoS absorption, no DNS propagation delay.

2. **How does Cloudflare's caching differ from CloudFront?** Cloudflare uses Anycast routing (same IP globally), free unlimited cache purges, cache-tag-based purging, and no egress fees. CloudFront has more PoPs and tighter AWS integration.

3. **Explain Tiered Cache.** Without it, each of 300+ PoPs independently requests origin on miss. With it, edge PoPs route misses through a regional upper-tier cache, dramatically reducing origin load.

4. **How would you cache dynamic API responses on Cloudflare?** Use Cache Rules to match specific paths, set s-maxage, add Cache-Tag headers for targeted purging, use stale-while-revalidate for latency, and implement cache key customization to vary by relevant parameters.

5. **What is CNAME flattening?** RFC requires the zone apex (example.com without www) to have an A record, not a CNAME. Cloudflare "flattens" a CNAME at the apex by resolving it and returning the resulting A record, allowing you to point your apex to another hostname.

6. **How does cache invalidation work at scale?** Use Cache-Tag headers on responses, then purge by tag via API when content changes. This is more precise than purging by URL and more targeted than purging everything.
