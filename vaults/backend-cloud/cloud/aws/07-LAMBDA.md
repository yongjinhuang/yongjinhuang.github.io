# AWS Lambda

AWS Lambda is an event-driven, serverless compute service that runs your code in response to triggers without provisioning or managing servers. You pay only for the compute time consumed -- billed per millisecond of execution time and per invocation. Lambda is the backbone of serverless architectures on AWS and integrates with nearly every other AWS service.

---

## Execution Model

Every Lambda function has a **handler** -- the entry point that AWS invokes when the function is triggered.

```python
# Python handler
def handler(event, context):
    # event: dict containing trigger-specific data (S3 record, API Gateway request, etc.)
    # context: runtime info (request ID, remaining time, memory limit, log group)
    return {
        "statusCode": 200,
        "body": "OK"
    }
```

```javascript
// Node.js handler
export const handler = async (event, context) => {
  const requestId = context.awsRequestId;
  const remainingMs = context.getRemainingTimeInMillis();
  return { statusCode: 200, body: JSON.stringify({ requestId }) };
};
```

### The Lifecycle

1. **INIT** -- Runtime boots, dependencies load, code outside the handler executes (cold start)
2. **INVOKE** -- Handler runs with the event payload
3. **SHUTDOWN** -- After idle timeout (~5-15 min), the execution environment is destroyed

Code outside the handler runs once per cold start. Use this for expensive initialization:

```python
import boto3

# Runs once per cold start -- reused across warm invocations
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('my-table')

def handler(event, context):
    # table connection is already warm
    return table.get_item(Key={'id': event['id']})
```

---

## Supported Runtimes

| Runtime | Versions          | Notes                                            |
| ------- | ----------------- | ------------------------------------------------ |
| Node.js | 18.x, 20.x, 22.x  | Most popular, fast cold starts                   |
| Python  | 3.9 - 3.13        | Great for scripting, data processing             |
| Java    | 11, 17, 21        | Slower cold starts, use SnapStart                |
| .NET    | 6, 8              | C# and PowerShell                                |
| Go      | `provided.al2023` | Compile to binary, use custom runtime            |
| Rust    | `provided.al2023` | Custom runtime, excellent cold start performance |
| Ruby    | 3.2, 3.3          | Niche usage                                      |
| Custom  | `provided.al2023` | Bring any language via bootstrap executable      |

---

## Triggers and Event Sources

| Trigger                  | Invocation Type | Common Use Case             |
| ------------------------ | --------------- | --------------------------- |
| API Gateway              | Synchronous     | REST/HTTP APIs              |
| S3                       | Asynchronous    | File processing on upload   |
| SQS                      | Polling         | Queue processing            |
| DynamoDB Streams         | Polling         | Change data capture         |
| Kinesis                  | Polling         | Real-time stream processing |
| EventBridge              | Asynchronous    | Event-driven workflows      |
| CloudWatch Events        | Asynchronous    | Cron jobs, scheduled tasks  |
| SNS                      | Asynchronous    | Fan-out notifications       |
| ALB                      | Synchronous     | Load-balanced HTTP          |
| CloudFront (Lambda@Edge) | Synchronous     | Edge compute                |
| Cognito                  | Synchronous     | Auth triggers               |

**Invocation types matter:**

- **Synchronous** -- Caller waits for response. Errors return to the caller.
- **Asynchronous** -- Lambda queues the event. Built-in retry (2 retries). Dead-letter queue for failures.
- **Polling** -- Lambda polls the source (SQS, Kinesis, DynamoDB Streams). Batch size configurable.

---

## Resource Configuration

### Memory and CPU

CPU scales proportionally with memory. You configure memory; AWS assigns CPU.

| Memory    | vCPUs       | Good For                       |
| --------- | ----------- | ------------------------------ |
| 128 MB    | Fraction    | Tiny transformations           |
| 512 MB    | ~0.3        | Simple API handlers            |
| 1,769 MB  | 1 full vCPU | General purpose                |
| 3,538 MB  | 2 vCPUs     | Compute-intensive              |
| 10,240 MB | 6 vCPUs     | Heavy processing, ML inference |

**Cost optimization tip:** More memory often means faster execution, which can be cheaper overall. Profile with [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning).

### Timeout

- **Minimum:** 1 second
- **Maximum:** 15 minutes (900 seconds)
- **Default:** 3 seconds
- Set it to slightly above your expected execution time. Never leave it at 15 minutes unless needed.

### Ephemeral Storage (/tmp)

- **Default:** 512 MB
- **Maximum:** 10,240 MB (10 GB)
- Persists across warm invocations of the same execution environment
- Use for temporary file processing, not durable storage

---

## Cold Starts

A cold start occurs when Lambda creates a new execution environment. This includes downloading your code, starting the runtime, and running initialization code.

### What Causes Cold Starts

- First invocation after deployment
- Scaling up to handle concurrent requests
- Invocation after idle timeout (~5-15 minutes)
- Code or configuration update

### Cold Start Latency by Runtime

| Runtime   | Typical Cold Start | Notes                             |
| --------- | ------------------ | --------------------------------- |
| Python    | 200-500 ms         | Fast, lightweight                 |
| Node.js   | 200-500 ms         | Fast, lightweight                 |
| Go / Rust | 50-200 ms          | Compiled binary, minimal overhead |
| Java      | 2-10 seconds       | JVM startup, class loading        |
| .NET      | 500 ms - 2 s       | CLR initialization                |

### Mitigation Strategies

| Strategy                    | How It Works                                  | Cost                |
| --------------------------- | --------------------------------------------- | ------------------- |
| **Provisioned Concurrency** | Pre-warms N execution environments            | Pay for idle time   |
| **SnapStart** (Java)        | Snapshots initialized JVM, restores on invoke | Free, Java 11+ only |
| **Keep-warm pings**         | CloudWatch scheduled event every 5 min        | Minimal, hacky      |
| **Smaller packages**        | Less code to download and parse               | Free                |
| **Avoid VPC**               | VPC adds ENI attachment time (~1-2s)          | Free (remove VPC)   |
| **ARM64 (Graviton2)**       | Faster init, 20% cheaper                      | Architecture change |

---

## Layers

Layers let you package shared libraries, custom runtimes, or configuration files separately from your function code.

```bash
# Create a layer
zip -r my-layer.zip python/  # Directory structure must match runtime
aws lambda publish-layer-version \
    --layer-name my-shared-libs \
    --zip-file fileb://my-layer.zip \
    --compatible-runtimes python3.12 python3.13

# Attach layer to function
aws lambda update-function-configuration \
    --function-name my-function \
    --layers arn:aws:lambda:us-east-1:123456789:layer:my-shared-libs:1
```

- **Max 5 layers per function**
- Combined unzipped size (function + layers) must be under 250 MB
- Layers are extracted to `/opt/` in the execution environment

---

## Environment Variables and Secrets

```bash
# Set environment variables
aws lambda update-function-configuration \
    --function-name my-function \
    --environment "Variables={DB_HOST=mydb.cluster.us-east-1.rds.amazonaws.com,LOG_LEVEL=INFO}"
```

For secrets, use AWS Secrets Manager or SSM Parameter Store:

```python
import boto3
import os

# Cache the client outside the handler
secrets_client = boto3.client('secretsmanager')

def get_secret(secret_name):
    response = secrets_client.get_secret_value(SecretId=secret_name)
    return response['SecretString']

def handler(event, context):
    db_password = get_secret('prod/db/password')
    # Use the secret
```

Use the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) to cache secrets locally and reduce API calls.

---

## Lambda@Edge and CloudFront Functions

| Feature            | Lambda@Edge                  | CloudFront Functions              |
| ------------------ | ---------------------------- | --------------------------------- |
| Runtime            | Node.js, Python              | JavaScript only                   |
| Execution location | Regional edge caches         | 400+ edge locations               |
| Max duration       | 5s (viewer) / 30s (origin)   | 1 ms                              |
| Max memory         | 128 - 10,240 MB              | 2 MB                              |
| Network access     | Yes                          | No                                |
| Use case           | Auth, A/B testing, redirects | Header manipulation, URL rewrites |
| Price              | Higher                       | ~1/6 the cost                     |

---

## Concurrency

| Concept                     | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| **Unreserved concurrency**  | Shared pool across all functions in the account               |
| **Reserved concurrency**    | Guarantees N instances for a function, also acts as a max cap |
| **Provisioned concurrency** | Pre-initializes N instances (eliminates cold starts)          |
| **Account limit**           | 1,000 concurrent executions (default, can request increase)   |
| **Burst limit**             | 500-3,000 depending on region (initial burst capacity)        |

```bash
# Reserve concurrency (guarantees 100 instances, caps at 100)
aws lambda put-function-concurrency \
    --function-name my-function \
    --reserved-concurrent-executions 100

# Provision concurrency (pre-warm 50 instances)
aws lambda put-provisioned-concurrency-config \
    --function-name my-function \
    --qualifier prod \
    --provisioned-concurrent-executions 50
```

---

## Deployment

### ZIP Package

```bash
# Create deployment package
zip -r function.zip . -x "*.git*"

# Create function
aws lambda create-function \
    --function-name my-function \
    --runtime python3.13 \
    --role arn:aws:iam::123456789:role/lambda-execution-role \
    --handler app.handler \
    --zip-file fileb://function.zip \
    --timeout 30 \
    --memory-size 512

# Update code
aws lambda update-function-code \
    --function-name my-function \
    --zip-file fileb://function.zip
```

### Container Image

```bash
# Build and push to ECR
docker build -t my-lambda .
aws ecr get-login-password | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag my-lambda:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest

# Create function from container image
aws lambda create-function \
    --function-name my-function \
    --package-type Image \
    --code ImageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/my-lambda:latest \
    --role arn:aws:iam::123456789:role/lambda-execution-role
```

- ZIP: Max 50 MB (direct upload) or 250 MB unzipped (via S3)
- Container: Max 10 GB image size

---

## Common CLI Commands

```bash
# List all functions
aws lambda list-functions --query 'Functions[].FunctionName'

# Invoke synchronously
aws lambda invoke \
    --function-name my-function \
    --payload '{"key": "value"}' \
    --cli-binary-format raw-in-base64-out \
    output.json

# Invoke asynchronously
aws lambda invoke \
    --function-name my-function \
    --invocation-type Event \
    --payload '{"key": "value"}' \
    --cli-binary-format raw-in-base64-out \
    output.json

# View recent logs
aws logs tail /aws/lambda/my-function --follow

# Get function configuration
aws lambda get-function-configuration --function-name my-function

# Delete function
aws lambda delete-function --function-name my-function

# Create alias (for traffic shifting / blue-green)
aws lambda create-alias \
    --function-name my-function \
    --name prod \
    --function-version 5
```

---

## Common Gotchas

| Gotcha                                    | Details                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **/tmp persists across warm invocations** | Data from previous invocations may be in `/tmp`. Always clean up or handle stale data.                                                                                                    |
| **Connection reuse matters**              | Initialize HTTP clients and DB connections outside the handler. Reuse across invocations to avoid connection exhaustion.                                                                  |
| **Avoid VPC unless necessary**            | VPC-attached Lambdas historically had slower cold starts (~1-2s for ENI). Hyperplane has improved this, but it still adds overhead. Only use VPC if you need to access private resources. |
| **Payload size limits**                   | Synchronous: 6 MB request and response. Asynchronous: 256 KB. For larger payloads, use S3 as intermediary.                                                                                |
| **Recursive invocation**                  | Lambda triggering itself (e.g., writing to S3 that triggers the same Lambda). Use prefixes or separate buckets.                                                                           |
| **Timeout != retry**                      | Synchronous timeouts return errors to the caller. Async retries happen twice, then go to DLQ.                                                                                             |
| **Concurrent execution throttling**       | Hitting concurrency limits returns 429 errors. Other functions in the same account share the pool.                                                                                        |
| **Idempotency is your job**               | Async invocations and stream polling can deliver duplicates. Design handlers to be idempotent.                                                                                            |
| **ARM64 is cheaper**                      | Graviton2 (arm64) is 20% cheaper and often faster. No code changes needed for interpreted runtimes.                                                                                       |
| **Log group not auto-deleted**            | CloudWatch log group `/aws/lambda/<name>` persists after function deletion. Set retention policies.                                                                                       |
