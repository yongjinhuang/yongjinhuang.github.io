# Third-Party Integrations

## What Is It?

Third-party integration is connecting your app with external services — payment processors (Stripe), email providers (SendGrid), identity providers (Auth0), cloud storage (AWS S3), communication tools (Slack, Twilio), analytics platforms (Mixpanel), and dozens of others. Rather than building everything from scratch, you use APIs to leverage specialized services. As a developer, a huge part of your job is wiring these services together reliably.

## Why Should You Care?

Modern apps are built on integrations. A typical SaaS product might integrate with 10-20 external services. Understanding integration patterns — how to authenticate, handle failures, process webhooks, manage API changes — is a core skill. Bad integrations cause cascading failures, data inconsistencies, and security vulnerabilities. Good integrations are resilient, well-monitored, and easy to maintain.

## How It Works (The Business Flow)

### API Integration Flow

1. **Evaluate**: Research the third-party service. Check docs, pricing, reliability, rate limits
2. **Authenticate**: Get API keys or set up OAuth. Store credentials securely
3. **Integrate**: Write code to call the API. Handle responses and errors
4. **Test**: Use the service's sandbox/test environment
5. **Monitor**: Track API calls, latency, error rates in production
6. **Maintain**: Handle API version changes, deprecations, and outages

### Webhooks (Inbound)

Instead of polling an API ("Did anything change?"), the service tells you when something happens:

1. You register a webhook URL with the service (e.g., `https://yourapp.com/webhooks/stripe`)
2. When an event occurs (payment succeeded, email bounced), the service sends an HTTP POST to your URL
3. Your server receives the payload, verifies it's authentic (signature verification), and processes it
4. You respond with `200 OK` within a timeout (usually 5-30 seconds)
5. If you don't respond, the service retries (exponential backoff, usually 3-5 retries)

### OAuth Integration (Connecting User Accounts)

When your app needs to act on behalf of a user in another service:

1. User clicks "Connect Slack" in your app
2. User is redirected to Slack's authorization page
3. User approves: "Allow YourApp to post messages?"
4. Slack redirects back to your app with an authorization code
5. Your server exchanges the code for access + refresh tokens
6. You store the tokens and use them to call Slack's API on behalf of the user
7. When the access token expires, you use the refresh token to get a new one

### Data Synchronization

When your app and a third-party service need to stay in sync:

1. **One-way sync**: Your app pushes data to the service (e.g., new customers → CRM)
2. **Two-way sync**: Changes in either system are reflected in the other (complex and error-prone)
3. **Event-driven sync**: Webhooks trigger sync operations in near real-time
4. **Batch sync**: Periodic job that reconciles data between systems (hourly, daily)

## Key Terms You'll Hear

| Term                    | What It Means                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **API**                 | Application Programming Interface — the contract for communicating with a service                 |
| **REST API**            | API that uses HTTP methods (GET, POST, PUT, DELETE) and URL paths to represent resources          |
| **GraphQL**             | A query language for APIs where the client specifies exactly what data it needs                   |
| **Webhook**             | An HTTP callback — the service pushes data to your server when an event occurs                    |
| **API Key**             | A credential that identifies your application. Usually a long random string                       |
| **OAuth 2.0**           | A protocol for delegated access — your app acts on behalf of a user                               |
| **Rate Limit**          | Maximum number of API calls allowed in a time window (e.g., 100 requests/minute)                  |
| **Sandbox / Test Mode** | A separate environment for development/testing that doesn't affect real data or charge real money |
| **SDK**                 | Software Development Kit — a library the service provides for easier integration                  |
| **Idempotency**         | Ensuring the same operation can be safely retried without duplicate effects                       |
| **Circuit Breaker**     | A pattern that stops calling a failing service to prevent cascading failures                      |
| **Retry with Backoff**  | Retrying failed requests with increasing delays (1s, 2s, 4s, 8s)                                  |
| **API Versioning**      | Services release new versions (`v1`, `v2`). Old versions are eventually deprecated                |
| **Deprecation**         | When a service announces that an API endpoint or version will be removed                          |

## Common Patterns

### Pattern 1: Direct API Calls

Your server calls the third-party API directly when needed.

```
User Action → Your Server → Third-Party API → Response → Your Server → User
```

**When it's used:** Simple integrations, synchronous operations (verify a payment, send an email).

**Trade-off:** Your response time depends on the third party's response time. If they're slow, your user waits.

### Pattern 2: Queue-Based Integration

Decouple the API call from the user's request using a message queue.

```
User Action → Your Server → Queue → Worker → Third-Party API
                    ↓
              Immediate Response to User
```

**When it's used:** Non-urgent operations (send email, sync CRM, generate report). Anything where the user doesn't need an immediate result.

**Trade-off:** More infrastructure (queue, workers). But user requests are fast and failures can be retried.

### Pattern 3: Webhook Receiver

The third party pushes data to you instead of you pulling it.

```
Third-Party Event → Webhook POST → Your Server → Process Event → Update Database
```

**When it's used:** Payment events, email delivery status, subscription changes, CI/CD notifications.

**Trade-off:** You need a reliable, publicly accessible endpoint. Must verify webhook authenticity. Must handle duplicate deliveries.

### Pattern 4: Abstraction Layer

Wrap the third-party API behind your own interface so you can swap providers without changing your app.

```typescript
// Your abstraction
interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>
}

// Implementation for SendGrid
class SendGridProvider implements EmailProvider { ... }

// Implementation for Postmark
class PostmarkProvider implements EmailProvider { ... }
```

**When it's used:** When you might switch providers, or when you use multiple providers for the same function (failover).

**Trade-off:** Extra abstraction layer. Only worth it if you realistically might switch.

## Gotchas & Edge Cases

- **Don't trust the third party to be up**: Every external service will have outages. Your app must handle unavailability gracefully — queue retries, show degraded state, fall back to cached data.
- **Webhook signature verification**: Always verify that webhooks are actually from the claimed service. Without verification, anyone can POST fake events to your webhook endpoint.
- **Webhook processing must be fast**: Respond with `200 OK` quickly, then process the event asynchronously. If you take too long, the service will time out and retry, causing duplicate processing.
- **Idempotent webhook handlers**: Webhooks can be delivered more than once. Use the event ID to deduplicate. If you've already processed event `evt_123`, skip it.
- **API key rotation**: API keys should be rotatable without downtime. Support reading from environment variables and don't hardcode them.
- **Rate limit handling**: Respect `429 Too Many Requests` responses. Read the `Retry-After` header. Implement backoff. Don't hammer a rate-limited API.
- **Sandbox vs Production keys**: Using production API keys in development means sending real emails, charging real cards, and posting to real Slack channels. Always use test/sandbox keys in development.
- **API deprecation**: Subscribe to the service's changelog/blog. When they announce a deprecation, you typically have 6-12 months to migrate. Don't ignore it.
- **Cost monitoring**: Third-party API calls cost money. A bug that sends a million emails or makes a million API calls can generate a huge bill. Set up billing alerts.

## Quick Reference

| Integration Type | Pattern         | Example                                                       |
| ---------------- | --------------- | ------------------------------------------------------------- |
| Payment          | Webhook + API   | Stripe: create payment intent → receive webhook on success    |
| Email            | Queue + API     | SendGrid: queue email → worker sends via API                  |
| Auth             | OAuth 2.0       | Google: redirect → authorize → exchange code → use tokens     |
| Storage          | Direct API      | S3: generate presigned URL → client uploads directly          |
| Communication    | Webhook         | Slack: receive webhook on message → process → respond         |
| Analytics        | Event streaming | Segment: send events → fan out to destinations                |
| CRM sync         | Batch + webhook | Salesforce: webhook on changes + nightly batch reconciliation |
