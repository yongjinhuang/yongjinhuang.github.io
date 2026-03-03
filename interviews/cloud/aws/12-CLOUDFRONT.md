# CloudFront (CDN)

CloudFront is AWS's global Content Delivery Network with 400+ edge locations and 13 regional edge caches across 90+ cities worldwide. It caches and serves content from locations physically close to users, reducing latency and offloading origin servers. CloudFront supports static files, dynamic content, streaming media, WebSockets, and APIs. It integrates deeply with S3, ALB, API Gateway, and Lambda@Edge for edge compute. Whether you are serving a static site or a complex API, CloudFront sits in front and accelerates delivery.

---

## Distributions

A CloudFront distribution defines the configuration for content delivery: where to fetch content (origins), how to cache it (behaviors), and how to serve it (SSL, custom domain, etc.).

### Key Components

| Component | Purpose |
|-----------|---------|
| Origin | Where CloudFront fetches content from |
| Behavior | Rules for how requests are handled and cached |
| Cache Policy | Controls what is included in the cache key and TTL |
| Domain Names (CNAMEs) | Custom domains for the distribution |
| SSL Certificate | TLS certificate for HTTPS |
| Price Class | Which edge locations to use |

---

## Origin Types

| Origin Type | Use Case | Notes |
|------------|----------|-------|
| S3 bucket | Static assets, websites | Use OAC for private buckets |
| ALB / ELB | Dynamic web applications | Must be publicly accessible |
| Custom HTTP | Any HTTP server | EC2, on-premises, third-party |
| MediaStore | Video streaming | Optimized for media delivery |
| API Gateway | REST/HTTP APIs | Regional or edge-optimized |

### Origin Failover (Origin Groups)

Origin groups provide automatic failover. Define a primary and secondary origin. If the primary returns specific error codes (500, 502, 503, 504, 403, 404), CloudFront automatically retries from the secondary.

```json
{
  "OriginGroup": {
    "Id": "my-origin-group",
    "FailoverCriteria": {
      "StatusCodes": { "Items": [500, 502, 503, 504], "Quantity": 4 }
    },
    "Members": {
      "Items": [
        { "OriginId": "primary-s3" },
        { "OriginId": "backup-s3" }
      ],
      "Quantity": 2
    }
  }
}
```

Use case: S3 primary bucket in us-east-1 fails over to a replica bucket in eu-west-1.

---

## Cache Behavior

Behaviors map URL path patterns to origins and define caching rules. They are evaluated in order; the first match wins. Every distribution has a default behavior (`*`).

### Path Pattern Examples

```
/api/*       -> ALB origin, no caching (TTL 0)
/static/*    -> S3 origin, aggressive caching (TTL 86400)
/images/*    -> S3 origin, caching with query string forwarding
*            -> Default origin
```

### Cache Keys

The cache key determines what makes a cached object unique. By default, it is the URL path only. You can add:

- Query strings (all, specific, or none)
- HTTP headers (specific ones only -- avoid `*` which disables caching)
- Cookies (all, specific, or none)

### TTL Configuration

| Setting | Default | Range |
|---------|---------|-------|
| Default TTL | 86400s (24h) | 0 - 31536000s |
| Minimum TTL | 0s | 0 - 31536000s |
| Maximum TTL | 31536000s (1 year) | 0 - 31536000s |

CloudFront respects `Cache-Control` and `Expires` headers from the origin, bounded by min/max TTL. If the origin sends no cache headers, the default TTL is used.

### Cache Policies vs Origin Request Policies

| Policy Type | Controls |
|------------|----------|
| Cache Policy | What is in the cache key, TTL settings |
| Origin Request Policy | What headers/cookies/query strings are forwarded to origin (without affecting cache key) |

This separation is critical: you often need to forward authentication headers to the origin without including them in the cache key (which would destroy cache hit rates).

---

## Cache Invalidation

Remove objects from edge caches before TTL expiration.

```bash
# Invalidate specific paths
aws cloudfront create-invalidation \
  --distribution-id E1A2B3C4D5E6F7 \
  --paths "/index.html" "/css/*"

# Invalidate everything
aws cloudfront create-invalidation \
  --distribution-id E1A2B3C4D5E6F7 \
  --paths "/*"
```

### Cost

- First 1,000 invalidation paths per month: free
- After that: $0.005 per path
- Wildcard (`/*`) counts as one path
- Invalidation propagates to all edge locations (takes 1-5 minutes typically)

**Best practice**: Use versioned file names (`app.abc123.js`) instead of invalidation. It is faster, free, and atomic.

---

## SSL/TLS

### ACM Certificates

CloudFront requires certificates to be in **us-east-1** (N. Virginia), regardless of where your origin is.

```bash
# Request a certificate (must be in us-east-1)
aws acm request-certificate \
  --region us-east-1 \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS
```

### SNI vs Dedicated IP

| Method | Cost | Notes |
|--------|------|-------|
| SNI (Server Name Indication) | Free | Works with modern clients (99.9%+) |
| Dedicated IP | $600/month per distribution | Required only for ancient clients without SNI |

Always use SNI unless you have a specific requirement for legacy client support.

### Viewer Protocol Policy

| Policy | Behavior |
|--------|----------|
| HTTP and HTTPS | Serve both (not recommended) |
| Redirect HTTP to HTTPS | 301 redirect (recommended) |
| HTTPS Only | Reject HTTP requests |

### Origin Protocol Policy

| Policy | When to Use |
|--------|------------|
| HTTPS Only | Origin supports HTTPS (recommended) |
| Match Viewer | Origin handles both protocols |
| HTTP Only | Origin is HTTP only (e.g., S3 website endpoint) |

---

## Edge Compute

### Lambda@Edge vs CloudFront Functions

| Feature | Lambda@Edge | CloudFront Functions |
|---------|------------|---------------------|
| Runtime | Node.js, Python | JavaScript only |
| Execution time | Up to 30s (origin) / 5s (viewer) | Up to 1ms |
| Memory | 128-10240 MB | 2 MB |
| Network access | Yes | No |
| File system access | Yes (512 MB /tmp) | No |
| Request body access | Yes | No |
| Deploy region | us-east-1 (replicated globally) | Edge locations |
| Triggers | Viewer request/response, Origin request/response | Viewer request/response only |
| Price | $0.60 per 1M requests + duration | $0.10 per 1M requests |
| Scale | Thousands per second | Millions per second |

### When to Use What

**CloudFront Functions** -- lightweight, high-volume transformations:
- URL rewrites and redirects
- Header manipulation
- Cache key normalization
- JWT token validation (simple)
- A/B testing (cookie-based routing)

**Lambda@Edge** -- heavier processing:
- Dynamic origin selection
- Authentication and authorization with external calls
- Image transformation
- Server-side rendering at the edge
- Modifying response bodies

### CloudFront Function Example

```javascript
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Append index.html for directory requests
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
```

---

## Origin Access Control (OAC)

OAC restricts S3 bucket access so content is only served through CloudFront, not directly from S3.

OAC replaces the older Origin Access Identity (OAI). OAC supports:
- All S3 bucket types (including SSE-KMS encrypted)
- All S3 features (S3 Object Lambda, etc.)
- Better security with short-lived credentials

### Setup

1. Create an OAC in CloudFront
2. Associate it with the S3 origin in the distribution
3. Update the S3 bucket policy to allow CloudFront

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": {
      "Service": "cloudfront.amazonaws.com"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789:distribution/E1A2B3C4D5E6F7"
      }
    }
  }]
}
```

---

## Signed URLs and Signed Cookies

Control access to private content by requiring authentication via signed URLs or cookies.

| Method | Use Case |
|--------|----------|
| Signed URL | Individual file access, RTMP streams |
| Signed Cookie | Access to multiple restricted files, entire site |

Signed URLs include an expiration time, optional IP restriction, and a signature generated with a CloudFront key pair.

**Signed URL vs S3 pre-signed URL**: CloudFront signed URLs use CloudFront key pairs and work with any CloudFront origin (not just S3). S3 pre-signed URLs use IAM credentials and go directly to S3.

---

## Logging

### Standard Logs (Access Logs)

Delivered to S3 bucket. Include client IP, URI, status code, bytes, user-agent, and more. Logs are delivered on a best-effort basis with some delay (minutes to hours).

```bash
# Enable logging during distribution creation
aws cloudfront create-distribution \
  --distribution-config '{
    "Logging": {
      "Enabled": true,
      "Bucket": "my-cf-logs.s3.amazonaws.com",
      "Prefix": "cdn/",
      "IncludeCookies": false
    }
  }'
```

### Real-Time Logs

Stream logs to Kinesis Data Streams in real time. Configurable sampling rate (1-100%). Useful for monitoring and real-time analytics. Higher cost than standard logs.

---

## Price Classes

Restrict which edge locations CloudFront uses to reduce cost. Content is served from fewer locations, potentially increasing latency for distant users.

| Price Class | Regions Included |
|-------------|-----------------|
| PriceClass_All | All edge locations (best performance) |
| PriceClass_200 | Excludes South America and Australia |
| PriceClass_100 | North America and Europe only (cheapest) |

---

## Common CLI Commands

```bash
# Create a distribution (minimal S3 origin example)
aws cloudfront create-distribution \
  --origin-domain-name my-bucket.s3.amazonaws.com \
  --default-root-object index.html

# List distributions
aws cloudfront list-distributions

# Get distribution config
aws cloudfront get-distribution-config \
  --id E1A2B3C4D5E6F7

# Create invalidation
aws cloudfront create-invalidation \
  --distribution-id E1A2B3C4D5E6F7 \
  --paths "/index.html" "/css/*"

# Get invalidation status
aws cloudfront get-invalidation \
  --distribution-id E1A2B3C4D5E6F7 \
  --id I1A2B3C4D5E6F7

# Update distribution (disable)
aws cloudfront get-distribution-config --id E1A2B3C4D5E6F7 > dist-config.json
# Edit dist-config.json: set Enabled=false
aws cloudfront update-distribution \
  --id E1A2B3C4D5E6F7 \
  --distribution-config file://dist-config.json \
  --if-match E2QWRUHEXAMPLE

# Delete distribution (must be disabled first)
aws cloudfront delete-distribution \
  --id E1A2B3C4D5E6F7 \
  --if-match E2QWRUHEXAMPLE
```

---

## Common Gotchas

1. **ACM certificate must be in us-east-1.** CloudFront is a global service. No matter where your origin sits, the SSL certificate must be provisioned in N. Virginia. This is the single most common configuration mistake.

2. **Cache invalidation is not instant.** Invalidation typically takes 1-5 minutes to propagate to all edge locations. For time-critical updates, use versioned file names instead.

3. **Default 1,000 free invalidation paths per month.** After that, each path costs $0.005. A wildcard (`/*`) counts as one path. Frequent invalidations add up -- prefer versioned assets.

4. **CloudFront Functions have a 1ms execution limit.** If your function exceeds this, the request fails. Keep logic minimal. No network calls, no file system access. For anything heavier, use Lambda@Edge.

5. **30-second origin timeout.** If your origin takes longer than 30 seconds to respond, CloudFront returns a 504 error. Increase the timeout (up to 60s) or optimize your origin. For Lambda@Edge origin-facing triggers, the limit is 30 seconds.

6. **S3 website endpoint vs S3 REST endpoint.** If your S3 bucket is configured as a website, use the website endpoint (e.g., `bucket.s3-website-us-east-1.amazonaws.com`) as a custom origin, not the REST endpoint. OAC only works with the REST endpoint.

7. **Forwarding headers kills cache hit rate.** If you forward `Authorization` or all headers to the origin via the cache policy (not origin request policy), every unique header combination creates a separate cache entry. Use Origin Request Policy to forward headers without affecting the cache key.

8. **Default root object only works at the root path.** Setting `index.html` as the default root object means `example.com/` serves `index.html`, but `example.com/about/` does NOT serve `about/index.html`. Use CloudFront Functions or Lambda@Edge to rewrite sub-directory requests.

9. **Geo-restriction.** CloudFront supports allowlist/blocklist by country. It uses a third-party GeoIP database. This is separate from Route 53 geolocation routing.

10. **CORS with CloudFront.** If your origin returns CORS headers, you must configure CloudFront to forward the `Origin` header (via origin request policy) and cache based on it (via cache policy). Otherwise, a cached response without CORS headers may be served to cross-origin requests.
