# EventBridge

Amazon EventBridge is a serverless event bus that connects applications using events. It is the evolution of CloudWatch Events, with a much broader feature set including schema discovery, third-party integrations, archive/replay, and cross-account event routing. EventBridge is the default choice for building event-driven architectures on AWS where you need content-based routing, multiple targets, and loose coupling between services.

---

## Core Concepts

### Event Buses

An event bus receives events and routes them to targets based on rules.

| Bus Type    | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| **Default** | Every AWS account has one. Receives events from AWS services automatically. |
| **Custom**  | You create these for your application events. Isolate event domains.        |
| **Partner** | Receive events from SaaS providers (Datadog, Auth0, Shopify, etc.)          |

You can have multiple custom buses to separate concerns (e.g., `orders-bus`, `payments-bus`).

### Event Structure

Every EventBridge event follows a standard JSON envelope:

```json
{
  "version": "0",
  "id": "12345678-1234-1234-1234-123456789012",
  "source": "com.myapp.orders",
  "detail-type": "OrderPlaced",
  "account": "123456789012",
  "region": "us-east-1",
  "time": "2026-03-03T10:30:00Z",
  "resources": [],
  "detail": {
    "orderId": "ord-9876",
    "customerId": "cust-1234",
    "total": 99.99,
    "items": ["item-a", "item-b"]
  }
}
```

- **source**: Identifies who sent the event. Use reverse domain notation.
- **detail-type**: The event type. Think of it as the event name.
- **detail**: The event payload. This is where your business data goes.

### Rules

Rules match incoming events and route them to one or more targets.

**Event pattern rules** - Content-based filtering:

```json
{
  "source": ["com.myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "total": [{ "numeric": [">=", 100] }]
  }
}
```

This rule matches only `OrderPlaced` events from `com.myapp.orders` where the total is >= 100.

**Scheduled rules** - Cron or rate-based:

```json
{
  "schedule-expression": "rate(5 minutes)"
}
```

```json
{
  "schedule-expression": "cron(0 12 * * ? *)"
}
```

Pattern matching supports: exact values, prefix, numeric comparisons, IP address matching, exists/absent checks, anything-but, and combinations using `$or`.

### Targets

A rule can have up to **5 targets**. Each target receives the matched event.

| Target                                                        | Common Use                            |
| ------------------------------------------------------------- | ------------------------------------- |
| Lambda                                                        | Serverless event processing           |
| SQS                                                           | Buffer events for async processing    |
| SNS                                                           | Fan-out to multiple subscribers       |
| Step Functions                                                | Start a workflow                      |
| API Gateway                                                   | Trigger an API endpoint               |
| ECS Task                                                      | Run a container                       |
| Kinesis Data Stream                                           | Stream processing                     |
| CodePipeline                                                  | Trigger deployments                   |
| CloudWatch Log Group                                          | Event logging/debugging               |
| Another Event Bus                                             | Cross-account or cross-region routing |
| Redshift, Batch, Inspector, Systems Manager, Incident Manager | Various AWS service integrations      |

### Input Transformation

Reshape the event before delivering it to a target. Useful when the target expects a different format.

```json
{
  "InputPathsMap": {
    "orderId": "$.detail.orderId",
    "customer": "$.detail.customerId"
  },
  "InputTemplate": "{\"order\": <orderId>, \"customer\": <customer>, \"source\": \"eventbridge\"}"
}
```

You can also use `InputPath` to extract a subset or `Input` to send a constant string.

---

## Advanced Features

### Schema Registry and Discovery

EventBridge can automatically detect and register schemas from events flowing through your bus.

- **Schema discovery**: Enable on a bus. EventBridge infers the JSON schema from real events.
- **Schema registry**: Browse, search, and download schemas. Generate code bindings for Java, Python, TypeScript.
- **Versioning**: Schemas are versioned as they evolve.

This is valuable for contract-first development. Producers and consumers agree on a schema, and the registry enforces it.

### Archive and Replay

Archive events from a bus and replay them later. Essential for debugging, testing, and disaster recovery.

```bash
# Create an archive
aws events create-archive \
  --archive-name order-events-archive \
  --source-arn arn:aws:events:us-east-1:123456789012:event-bus/orders-bus \
  --event-pattern '{"source":["com.myapp.orders"]}' \
  --retention-days 90

# Start a replay
aws events start-replay \
  --replay-name debug-replay-march \
  --event-source-arn arn:aws:events:us-east-1:123456789012:event-bus/orders-bus \
  --destination '{"Arn":"arn:aws:events:us-east-1:123456789012:event-bus/orders-bus"}' \
  --event-start-time 2026-03-01T00:00:00Z \
  --event-end-time 2026-03-02T00:00:00Z
```

Replayed events have a `replay-name` header so your consumers can distinguish replays from live events.

### Cross-Account and Cross-Region

- **Cross-account**: Grant permissions on the target bus. Use resource-based policies. The source account puts events to the target account's bus.
- **Cross-region**: Create a rule with a target that is an event bus in another region. EventBridge handles the routing.

```bash
# Allow another account to put events to your bus
aws events put-permission \
  --event-bus-name orders-bus \
  --action events:PutEvents \
  --principal 987654321098 \
  --statement-id allow-partner-account
```

### EventBridge Pipes

Point-to-point integrations with optional filtering, enrichment, and transformation.

```
[Source] --> [Filter] --> [Enrichment] --> [Target]
```

- **Sources**: SQS, Kinesis, DynamoDB Streams, Kafka, MQ
- **Enrichment**: Lambda, Step Functions, API Gateway, API Destination
- **Targets**: Same as rule targets

Pipes are simpler than rules when you have a 1:1 source-to-target mapping and need inline enrichment.

### EventBridge Scheduler

A standalone scheduler for one-time or recurring invocations at scale.

- Supports millions of schedules (far beyond CloudWatch Events limits)
- One-time schedules (e.g., "send reminder in 48 hours")
- Recurring schedules (rate or cron)
- Built-in retry policies and DLQ
- Targets: Lambda, SQS, SNS, Step Functions, and more

```bash
# Create a one-time schedule
aws scheduler create-schedule \
  --name order-reminder \
  --schedule-expression "at(2026-03-05T10:00:00)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{
    "Arn":"arn:aws:lambda:us-east-1:123456789012:function:send-reminder",
    "RoleArn":"arn:aws:iam::123456789012:role/scheduler-role",
    "Input":"{\"orderId\":\"ord-9876\"}"
  }'

# Create a recurring schedule
aws scheduler create-schedule \
  --name daily-cleanup \
  --schedule-expression "rate(1 day)" \
  --flexible-time-window '{"Mode":"FLEXIBLE","MaximumWindowInMinutes":15}' \
  --target '{
    "Arn":"arn:aws:lambda:us-east-1:123456789012:function:cleanup",
    "RoleArn":"arn:aws:iam::123456789012:role/scheduler-role"
  }'
```

---

## Event-Driven Architecture Patterns

### Choreography vs Orchestration

|                | Choreography                           | Orchestration                                     |
| -------------- | -------------------------------------- | ------------------------------------------------- |
| Coordination   | Services react to events independently | Central coordinator (Step Functions) manages flow |
| Coupling       | Very loose                             | Tighter (coordinator knows the steps)             |
| Visibility     | Harder to trace end-to-end flow        | Easy to see full workflow in state machine        |
| Error handling | Each service handles its own errors    | Coordinator handles retries, compensation         |
| Best for       | Loosely coupled microservices          | Complex multi-step workflows with error handling  |

**Choreography** (EventBridge): OrderPlaced event published. Inventory service, payment service, notification service each react independently.

**Orchestration** (Step Functions): A state machine calls inventory, then payment, then notification in sequence, with error handling at each step.

In practice, most systems use both. EventBridge for cross-domain events, Step Functions for intra-domain workflows.

---

## Common CLI Commands

```bash
# Create a custom event bus
aws events create-event-bus --name orders-bus

# Put a rule on the bus
aws events put-rule \
  --name high-value-orders \
  --event-bus-name orders-bus \
  --event-pattern '{
    "source": ["com.myapp.orders"],
    "detail-type": ["OrderPlaced"],
    "detail": {"total": [{"numeric": [">=", 100]}]}
  }'

# Add a target to the rule
aws events put-targets \
  --rule high-value-orders \
  --event-bus-name orders-bus \
  --targets '[{
    "Id": "send-to-lambda",
    "Arn": "arn:aws:lambda:us-east-1:123456789012:function:process-high-value"
  }]'

# Publish an event
aws events put-events --entries '[{
  "Source": "com.myapp.orders",
  "DetailType": "OrderPlaced",
  "Detail": "{\"orderId\":\"ord-9876\",\"total\":150.00}",
  "EventBusName": "orders-bus"
}]'

# Describe a rule
aws events describe-rule \
  --name high-value-orders \
  --event-bus-name orders-bus

# List rules on a bus
aws events list-rules --event-bus-name orders-bus

# Delete a rule (must remove targets first)
aws events remove-targets \
  --rule high-value-orders \
  --event-bus-name orders-bus \
  --ids send-to-lambda

aws events delete-rule \
  --name high-value-orders \
  --event-bus-name orders-bus
```

---

## Common Gotchas

1. **Event size limit**: 256KB per event. If your payload is larger, store it in S3 and include a reference in the event detail.
2. **At-least-once delivery**: EventBridge delivers events at least once. Your consumers must be idempotent. Use the event `id` field for deduplication.
3. **No guaranteed ordering**: Events may arrive out of order. If ordering matters, include a timestamp or sequence number in the detail and handle reordering in the consumer.
4. **Rule limit**: 300 rules per event bus (soft limit, can be increased). Design your event patterns to be specific enough to avoid needing hundreds of rules.
5. **Target limit**: 5 targets per rule. If you need more, fan out through SNS or use multiple rules.
6. **Eventual consistency**: Rule updates are eventually consistent. After updating a rule, there may be a brief window where both old and new patterns match.
7. **PutEvents throttling**: Default limit of 10,000 entries per second per account per region. Burst capacity available but plan for sustained throughput.
8. **Scheduled rules**: Minimum granularity is 1 minute. For sub-minute scheduling, use EventBridge Scheduler or a different approach.
9. **Cross-account permissions**: The target account must explicitly allow the source account. Forgetting the resource policy is the number one cause of cross-account events not arriving.
10. **Replay flooding**: Replaying a large archive can overwhelm downstream consumers. Use specific time ranges and event patterns to limit replay scope.
