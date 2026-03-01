# Rate Limiting & API Management

## What Is It?

Rate limiting is controlling how many requests a client can make to your API in a given time period. API management is the broader discipline of designing, publishing, securing, and monitoring APIs — both internal APIs and APIs you expose to external developers. Together they protect your system from abuse, ensure fair usage, and turn your API into a product that others can consume reliably.

## Why Should You Care?

Without rate limiting, a single misbehaving client (or attacker) can bring down your entire service. A bot scraping your data, a bug in a client's code that fires requests in a loop, or a DDoS attack — all of these hit your API. Rate limiting is your first line of defense. Beyond protection, if your company offers an API as a product (like Stripe, Twilio, or OpenAI), you need proper API management: documentation, authentication, versioning, rate limits per plan, and usage tracking.

## How It Works (The Business Flow)

### Rate Limiting Flow

1. Client sends a request to your API
2. Rate limiter checks: how many requests has this client made in the current time window?
3. If under the limit → request is processed normally
4. If over the limit → return `429 Too Many Requests` with a `Retry-After` header
5. Client should respect the `Retry-After` header and slow down

### Rate Limit Headers

APIs typically return rate limit info in response headers:

```
X-RateLimit-Limit: 100        // Max requests per window
X-RateLimit-Remaining: 73     // Requests left in current window
X-RateLimit-Reset: 1709312400 // When the window resets (Unix timestamp)
```

This lets clients manage their request rate proactively instead of hitting the wall.

### API Key Management

1. Developer signs up for your API → gets an API key
2. API key is included with every request (header, query parameter)
3. Your server identifies the client by the key and applies the appropriate rate limit
4. Keys can be revoked, rotated, or scoped to specific endpoints
5. Usage is tracked per key for billing and monitoring

### API Versioning

APIs evolve. You need to change endpoints without breaking existing clients:

1. **URL versioning**: `/v1/users`, `/v2/users` — most common, most visible
2. **Header versioning**: `Accept: application/vnd.yourapi.v2+json` — cleaner URLs
3. **Query parameter**: `/users?version=2` — easy but less conventional

When you release `v2`:
- `v1` continues working (for a deprecation period, usually 6-12 months)
- New features only go to `v2`
- Communicate the migration timeline clearly

### Developer Portal

If your API is a product, developers need:

1. **Documentation**: Clear, up-to-date API reference with examples
2. **Authentication**: API key generation, OAuth app registration
3. **Playground**: Interactive API explorer to test endpoints
4. **SDKs**: Client libraries in popular languages (JavaScript, Python, Go)
5. **Changelog**: What changed in each version
6. **Status page**: Current API health and incident history

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Rate Limit** | Maximum number of requests allowed in a time window |
| **Throttling** | Slowing down requests instead of rejecting them outright |
| **429 Too Many Requests** | HTTP status code returned when rate limit is exceeded |
| **API Gateway** | A proxy that sits in front of your API, handling auth, rate limiting, routing (Kong, AWS API Gateway) |
| **API Key** | A unique identifier for an API consumer |
| **OAuth 2.0** | Protocol for authorized API access on behalf of a user |
| **Quota** | A broader usage limit (e.g., 10,000 API calls per month, 1GB storage) |
| **Burst Limit** | Short-term limit (e.g., 10 requests per second) vs sustained limit (1,000 per hour) |
| **Token Bucket** | A rate limiting algorithm: tokens are added at a fixed rate, each request consumes a token |
| **Sliding Window** | A rate limiting approach that considers a rolling time window rather than fixed intervals |
| **DDoS** | Distributed Denial of Service — flooding your API with requests to take it down |
| **WAF** | Web Application Firewall — filters malicious traffic before it reaches your API |
| **API Versioning** | Maintaining multiple API versions simultaneously |
| **Deprecation** | Announcing that an API version will be removed, giving clients time to migrate |
| **SLA** | Service Level Agreement — guaranteed uptime and performance (e.g., 99.9% uptime) |

## Common Patterns

### Pattern 1: Fixed Window

Count requests in fixed time windows (e.g., 100 requests per minute, reset at each minute boundary).

**When it's used:** Simplest to implement. Good enough for most cases.

**Trade-off:** Burst problem — a client could make 100 requests at 11:59:59 and 100 more at 12:00:00 (200 requests in 2 seconds).

### Pattern 2: Sliding Window

Uses a rolling time window instead of fixed boundaries. Smooths out the burst problem.

**When it's used:** When you need more consistent rate enforcement.

**Trade-off:** Slightly more complex to implement. Uses more memory.

### Pattern 3: Token Bucket

Tokens are added to a bucket at a fixed rate. Each request consumes a token. If the bucket is empty, the request is rejected. Allows short bursts while enforcing average rates.

**When it's used:** Most production rate limiters. Allows bursts up to the bucket capacity.

**Trade-off:** Most flexible but more state to manage.

### Pattern 4: Tiered Rate Limits

Different rate limits for different plan tiers:

```
Free:       100 requests/hour
Pro:        1,000 requests/hour
Enterprise: 10,000 requests/hour
```

**When it's used:** API-as-a-product businesses (Stripe, OpenAI, Twilio).

**Trade-off:** Need to track usage per customer for billing. Upgrade path must be clear.

## Gotchas & Edge Cases

- **Rate limit by what?**: By API key? By IP address? By user ID? Each has different implications. IP-based limits can affect multiple users behind a NAT. Key-based limits don't catch unauthenticated abuse.
- **Don't rate limit health checks**: Monitoring systems hit your health endpoint frequently. Exempt it from rate limiting.
- **Graceful degradation**: Instead of hard-rejecting at the limit, consider degrading service quality (returning cached data, reducing response detail) before cutting off entirely.
- **Webhooks don't respect your rate limits**: If a third party sends you 10,000 webhooks in a burst, your webhook endpoint needs its own protection. Use a queue to buffer incoming webhooks.
- **Client-side retry storms**: If your API returns 429 and many clients retry simultaneously, you get a "thundering herd." Include jitter in `Retry-After` values.
- **Internal API rate limiting**: Even internal services should have rate limits. A bug in Service A shouldn't be able to overwhelm Service B.
- **Distributed rate limiting**: If your API runs on multiple servers, rate limits need to be shared (usually via Redis). Per-server limits are inaccurate.
- **Documentation is part of the product**: If developers can't understand your API from the docs, they won't use it. Invest in clear examples, error explanations, and quick-start guides.

## Quick Reference

| Scenario | Rate Limiting Strategy |
|----------|----------------------|
| Public API | Token bucket per API key, tiered by plan |
| Login endpoint | Strict limit per IP (prevent brute force) |
| Webhook receiver | Queue-based buffer with processing rate limit |
| Internal service | Token bucket per service, generous limits |
| Free tier | Low limits with clear upgrade path |
| DDoS protection | WAF + CDN-level rate limiting (Cloudflare, AWS Shield) |

| Algorithm | Best For |
|-----------|----------|
| Fixed window | Simple APIs, low traffic |
| Sliding window | Consistent enforcement |
| Token bucket | Bursty traffic with average limit |
| Leaky bucket | Smooth, constant output rate |
