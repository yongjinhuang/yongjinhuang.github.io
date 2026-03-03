# API Gateway

Amazon API Gateway is a fully managed service that acts as the front door for your APIs. It handles request routing, authorization, throttling, caching, request/response transformation, and protocol translation -- so your backend can focus on business logic. API Gateway supports REST, HTTP, and WebSocket protocols and integrates natively with Lambda, ECS, EC2, and any HTTP endpoint.

---

## Three Types of API Gateway

| Feature | REST API | HTTP API | WebSocket API |
|---------|----------|----------|---------------|
| Protocol | HTTP/HTTPS | HTTP/HTTPS | WebSocket (wss://) |
| Relative cost | $$$ | $ (up to 70% cheaper) | $$ |
| Latency | Higher (~10-30 ms overhead) | Lower (~5-10 ms overhead) | N/A |
| Request validation | Yes | No | No |
| Request/response transformation | Yes (VTL templates) | No | Yes (limited) |
| Caching | Yes (built-in) | No | No |
| Usage plans + API keys | Yes | No | No |
| Resource policies | Yes | No | No |
| WAF integration | Yes | No | Yes |
| Private endpoints | Yes | No | No |
| Custom domain names | Yes | Yes | Yes |
| Lambda authorizers | Yes | Yes (v2 payload format) | Yes |
| Cognito authorizers | Yes | Yes (JWT) | No |
| IAM authorization | Yes | Yes | Yes |
| Mutual TLS | Yes | Yes | No |
| OpenAPI import/export | Yes (full) | Yes (partial) | No |

### When to Use Each

- **REST API**: You need caching, request validation, WAF, usage plans, resource policies, or API key management. Enterprise APIs with complex requirements.
- **HTTP API**: You need a simple, fast, cheap proxy to Lambda or HTTP backends. Most new projects should start here.
- **WebSocket API**: Real-time bidirectional communication (chat, live dashboards, multiplayer games, streaming).

**Default choice: HTTP API.** Only use REST API if you need features that HTTP API lacks.

---

## Integration Types

| Integration | Description | Use Case |
|-------------|------------|----------|
| **Lambda Proxy** | Passes entire request to Lambda, returns Lambda response directly | Most common. Lambda handles routing and response formatting. |
| **HTTP Proxy** | Forwards request to an HTTP endpoint (ALB, EC2, external URL) | Existing backend services, microservices behind ALB |
| **AWS Service** | Direct integration with AWS services (S3, DynamoDB, SQS, Step Functions) | Skip Lambda entirely for simple operations |
| **Mock** | Returns a hardcoded response | API prototyping, health checks |
| **VPC Link** | Route to private resources (NLB, ALB, Cloud Map) | Backend services in private subnets |

### Lambda Proxy Integration (Most Common)

API Gateway passes everything to Lambda in a structured event:

```json
{
  "httpMethod": "POST",
  "path": "/users",
  "headers": { "Content-Type": "application/json" },
  "queryStringParameters": { "limit": "10" },
  "pathParameters": { "userId": "123" },
  "body": "{\"name\": \"Alice\"}",
  "requestContext": {
    "authorizer": { "claims": { "sub": "user-id-from-cognito" } },
    "identity": { "sourceIp": "1.2.3.4" }
  }
}
```

Lambda must return a specific response format:

```python
def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({"message": "created"})
    }
```

### Direct AWS Service Integration (No Lambda)

Write directly to SQS without a Lambda middleman:

```
Method: POST /orders
Integration: AWS Service
Service: SQS
Action: SendMessage
```

This eliminates Lambda cold starts and cost for simple pass-through operations.

---

## Stages and Deployment Model

API Gateway uses a two-step deployment model:

1. **Define** your API (resources, methods, integrations)
2. **Deploy** to a stage (creates a snapshot of the API configuration)

```bash
# Create a deployment to the "prod" stage
aws apigateway create-deployment \
    --rest-api-id abc123 \
    --stage-name prod \
    --description "Release v2.1"
```

| Concept | Description |
|---------|-------------|
| **Stage** | A named reference to a deployment (e.g., dev, staging, prod). Each stage has its own URL. |
| **Stage variables** | Key-value pairs per stage. Use to point to different Lambda aliases or backend URLs. |
| **Canary deployment** | Route a percentage of traffic to a new deployment for gradual rollout (REST API only). |

Stage URL format:
- REST API: `https://{api-id}.execute-api.{region}.amazonaws.com/{stage}`
- HTTP API: `https://{api-id}.execute-api.{region}.amazonaws.com/{stage}` (stage is optional, can use `$default`)

---

## Request/Response Transformation (REST API Only)

REST API supports Velocity Template Language (VTL) for transforming requests and responses. HTTP API does not.

```velocity
## Map query string to request body for a DynamoDB integration
{
  "TableName": "users",
  "Key": {
    "userId": { "S": "$input.params('userId')" }
  }
}
```

### Request Validation (REST API Only)

Validate request body, query parameters, and headers before they hit your backend:

```json
{
  "type": "object",
  "required": ["name", "email"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "email": { "type": "string", "format": "email" }
  }
}
```

Invalid requests return 400 immediately -- no Lambda invocation, no cost.

---

## Authorization

### IAM Authorization

Requests signed with AWS SigV4. Best for service-to-service communication.

```bash
# Call IAM-authorized API
aws apigateway test-invoke-method \
    --rest-api-id abc123 \
    --resource-id xyz789 \
    --http-method GET
```

### Cognito Authorizer

Validates JWT tokens from a Cognito User Pool.

```bash
curl -H "Authorization: Bearer <id-token>" \
    https://abc123.execute-api.us-east-1.amazonaws.com/prod/users
```

| Feature | REST API (Cognito) | HTTP API (JWT) |
|---------|-------------------|----------------|
| Token type | ID token or access token | Any JWT (Cognito, Auth0, Okta) |
| Configuration | Cognito User Pool ARN | Issuer URL + audience |
| Scope validation | Access token scopes | Yes |

### Lambda Authorizer

Custom authorization logic. Returns an IAM policy or a simple allow/deny.

```python
# Token-based Lambda authorizer
def handler(event, context):
    token = event['authorizationToken']  # "Bearer xxxxx"

    # Validate token (JWT decode, database lookup, etc.)
    principal_id = validate_token(token)

    return {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{
                "Action": "execute-api:Invoke",
                "Effect": "Allow",
                "Resource": event['methodArn']
            }]
        },
        "context": {
            "userId": principal_id,
            "plan": "premium"
        }
    }
```

Authorization results can be cached (TTL 0-3600 seconds) to avoid invoking the authorizer on every request.

---

## Rate Limiting and Throttling

| Level | Limit | Configurable |
|-------|-------|-------------|
| **Account level** | 10,000 requests/sec across all APIs in a region | Can request increase |
| **Stage level** | Default inherits account limit | Yes (REST API) |
| **Route/method level** | No default | Yes (REST API only) |
| **Usage plan** | Per API key rate + burst + quota | Yes (REST API only) |
| **HTTP API** | Account-level throttle only | Route-level via `$default` stage |

```bash
# Set stage-level throttling (REST API)
aws apigateway update-stage \
    --rest-api-id abc123 \
    --stage-name prod \
    --patch-operations \
        op=replace,path='/*/*/throttling/rateLimit',value='1000' \
        op=replace,path='/*/*/throttling/burstLimit',value='500'
```

When throttled, API Gateway returns **429 Too Many Requests**.

---

## CORS Configuration

Cross-Origin Resource Sharing must be configured when browsers call your API from a different domain.

### HTTP API (Simple)

```bash
aws apigatewayv2 update-api \
    --api-id abc123 \
    --cors-configuration \
        AllowOrigins="https://myapp.com",AllowMethods="GET,POST,PUT,DELETE",AllowHeaders="Content-Type,Authorization",MaxAge=86400
```

### REST API (Manual)

For REST API, you must:

1. Add an `OPTIONS` method to each resource (preflight)
2. Configure `Access-Control-*` headers in the method response
3. Configure the integration response to return those headers

This is one of the most common pain points with REST API. HTTP API handles it with a single configuration block.

---

## Custom Domain Names

Map a custom domain (e.g., `api.myapp.com`) to your API Gateway stage.

```bash
# Create custom domain (requires ACM certificate)
aws apigatewayv2 create-domain-name \
    --domain-name api.myapp.com \
    --domain-name-configurations \
        CertificateArn=arn:aws:acm:us-east-1:123456789:certificate/abc-123,EndpointType=REGIONAL

# Map API to custom domain
aws apigatewayv2 create-api-mapping \
    --domain-name api.myapp.com \
    --api-id abc123 \
    --stage prod \
    --api-mapping-key "v1"
# Result: api.myapp.com/v1/* -> your API
```

- **Regional endpoint**: Certificate in the same region
- **Edge-optimized endpoint** (REST API only): Certificate must be in `us-east-1` (CloudFront requirement)
- Create a Route 53 alias record or CNAME pointing to the API Gateway domain

---

## Usage Plans and API Keys (REST API Only)

Usage plans let you control access and set quotas per API consumer:

```bash
# Create usage plan
aws apigateway create-usage-plan \
    --name "Basic" \
    --throttle burstLimit=10,rateLimit=5 \
    --quota limit=1000,period=MONTH

# Create API key
aws apigateway create-api-key \
    --name "partner-acme" \
    --enabled

# Associate key with usage plan
aws apigateway create-usage-plan-key \
    --usage-plan-id abc123 \
    --key-id xyz789 \
    --key-type API_KEY
```

API keys are passed via the `x-api-key` header. They are **not** a security mechanism (easily leaked). Use them for tracking and throttling, not authentication.

---

## Caching (REST API Only)

| Setting | Options |
|---------|---------|
| Cache capacity | 0.5 GB to 237 GB |
| TTL | 0 to 3600 seconds (default: 300) |
| Encryption | Optional |
| Per-method override | Yes |
| Cache key parameters | Query strings, headers, path parameters |
| Invalidation | `Cache-Control: max-age=0` header (requires authorization) |
| Cost | $0.02 - $3.80/hour depending on size |

Caching reduces Lambda invocations and latency for repeated requests. Only available on REST API.

---

## Common CLI Commands

```bash
# --- REST API ---
# Create REST API
aws apigateway create-rest-api --name "my-api" --endpoint-configuration types=REGIONAL

# Get resources
aws apigateway get-resources --rest-api-id abc123

# Create resource
aws apigateway create-resource \
    --rest-api-id abc123 \
    --parent-id rootId \
    --path-part "users"

# Create method
aws apigateway put-method \
    --rest-api-id abc123 \
    --resource-id resId \
    --http-method GET \
    --authorization-type NONE

# Create Lambda integration
aws apigateway put-integration \
    --rest-api-id abc123 \
    --resource-id resId \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789:function:my-func/invocations"

# Deploy to stage
aws apigateway create-deployment \
    --rest-api-id abc123 \
    --stage-name prod

# --- HTTP API ---
# Create HTTP API with Lambda integration (one command)
aws apigatewayv2 create-api \
    --name "my-http-api" \
    --protocol-type HTTP \
    --target "arn:aws:lambda:us-east-1:123456789:function:my-func"

# Get API details
aws apigatewayv2 get-api --api-id abc123

# Create route
aws apigatewayv2 create-route \
    --api-id abc123 \
    --route-key "GET /users/{userId}"

# List stages
aws apigatewayv2 get-stages --api-id abc123
```

---

## Common Gotchas

| Gotcha | Details |
|--------|---------|
| **29-second timeout** | API Gateway has a hard 29-second integration timeout. If your backend takes longer, the client gets a 504. For long operations, return 202 Accepted and poll or use WebSocket. |
| **10 MB payload limit** | Maximum request/response payload is 10 MB. For larger payloads, use S3 presigned URLs. |
| **Cold start stacking** | API Gateway + Lambda = API Gateway overhead + Lambda cold start. The combined latency can be 2-5 seconds on the first request. Use provisioned concurrency on Lambda to mitigate. |
| **REST vs HTTP API pricing** | REST API: ~$3.50/million requests. HTTP API: ~$1.00/million requests. For simple Lambda proxying, HTTP API saves 70%. |
| **Binary media types** | REST API needs explicit binary media type configuration. HTTP API handles it automatically. REST API is a common source of image/file upload bugs. |
| **CORS on REST API is painful** | You must manually configure OPTIONS methods and response headers. One missed header and the browser blocks everything. Use HTTP API for simpler CORS. |
| **Stage variables in HTTP API** | HTTP API does not support stage variables. Use Lambda aliases or environment-specific routes instead. |
| **API key is not auth** | API keys are for throttling and metering, not security. They are sent in plaintext headers. Always use IAM, Cognito, or Lambda authorizers for authentication. |
| **Lambda permission required** | API Gateway needs permission to invoke your Lambda. Missing the `lambda:InvokeFunction` resource-based policy is the most common 500 error cause. |
| **CloudWatch logging requires a role** | REST API does not log to CloudWatch by default. You must create an IAM role and set it at the account level (`aws apigateway update-account --patch-operations op=replace,path=/cloudwatchRoleArn,value=<role-arn>`). |
| **WebSocket connection limits** | Max connection duration: 2 hours. Idle timeout: 10 minutes. Max message size: 128 KB (32 KB default). Clients must implement reconnection logic. |
| **Throttling is per-region** | The 10,000 req/sec account limit is shared across ALL APIs in a region. One noisy API can throttle others. Use per-method throttling and consider multiple regions. |
