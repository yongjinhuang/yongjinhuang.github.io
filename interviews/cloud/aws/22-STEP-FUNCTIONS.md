# AWS Step Functions

Step Functions is a serverless workflow orchestration service that lets you coordinate multiple AWS services into structured, visual workflows. Instead of writing spaghetti code with nested callbacks, retries, and state tracking, you define a state machine in JSON (Amazon States Language) and Step Functions handles execution, error handling, and state transitions. Think of it as the glue that turns individual Lambda functions, ECS tasks, and SDK calls into reliable multi-step processes.

---

## 1. Standard vs Express Workflows

Step Functions offers two workflow types optimized for different use cases:

| Feature | Standard | Express |
|---------|----------|---------|
| **Max duration** | 1 year | 5 minutes |
| **Pricing** | Per state transition ($0.025 per 1000) | Per request + duration |
| **Execution semantics** | Exactly-once | At-least-once (async) or at-most-once (sync) |
| **Execution history** | Stored for 90 days | CloudWatch Logs only |
| **Max events in history** | 25,000 | N/A |
| **Use case** | Long-running orchestration, human approval | High-volume data processing, IoT ingestion |

```bash
# Create a Standard workflow
aws stepfunctions create-state-machine \
  --name order-processing \
  --definition file://definition.json \
  --role-arn arn:aws:iam::123456789012:role/StepFunctionsRole \
  --type STANDARD

# Create an Express workflow
aws stepfunctions create-state-machine \
  --name event-enrichment \
  --definition file://definition.json \
  --role-arn arn:aws:iam::123456789012:role/StepFunctionsRole \
  --type EXPRESS
```

**Decision rule:** If your workflow runs under 5 minutes and you can tolerate at-least-once semantics, use Express. Everything else goes Standard.

---

## 2. Amazon States Language (ASL)

Workflows are defined in JSON using ASL. Every state machine has a `StartAt` field and a `States` object. Each state has a `Type` and optional `Next` or `End` field.

### 2.1 State Types

| State | Purpose | Example |
|-------|---------|---------|
| **Task** | Execute work (Lambda, SDK call, ECS, etc.) | Call a Lambda to validate input |
| **Choice** | Branch based on conditions | Route to different handlers based on order type |
| **Wait** | Pause for a duration or until a timestamp | Wait 30 seconds before retry |
| **Parallel** | Run branches concurrently | Validate payment and check inventory simultaneously |
| **Map** | Iterate over a collection | Process each line item in an order |
| **Pass** | Pass input to output (optionally transform) | Inject default values |
| **Succeed** | Terminal success state | Mark workflow complete |
| **Fail** | Terminal failure state with error and cause | Abort with a specific error message |

### 2.2 Task State -- The Workhorse

The Task state does the actual work. It supports multiple integration patterns:

```json
{
  "ProcessOrder": {
    "Type": "Task",
    "Resource": "arn:aws:lambda:us-east-1:123456789012:function:process-order",
    "Next": "NotifyCustomer"
  }
}
```

**SDK integrations** let you call virtually any AWS API directly:

```json
{
  "CreateDDBItem": {
    "Type": "Task",
    "Resource": "arn:aws:states:::dynamodb:putItem",
    "Parameters": {
      "TableName": "Orders",
      "Item": {
        "OrderId": { "S.$": "$.orderId" },
        "Status": { "S": "CREATED" }
      }
    },
    "Next": "Done"
  }
}
```

**Integration patterns:**
- **Request-Response** (default): Call and wait for HTTP response
- **Run a Job (.sync)**: Call and wait for the job to complete (ECS, Glue, CodeBuild)
- **Wait for Callback (.waitForTaskToken)**: Pause until an external system sends a task token back

---

## 3. Error Handling: Retry and Catch

Step Functions has built-in retry and catch mechanisms -- no try/catch in application code needed.

```json
{
  "CallPaymentAPI": {
    "Type": "Task",
    "Resource": "arn:aws:lambda:us-east-1:123456789012:function:charge-card",
    "Retry": [
      {
        "ErrorEquals": ["States.TaskFailed", "States.Timeout"],
        "IntervalSeconds": 3,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["States.ALL"],
        "Next": "HandlePaymentFailure",
        "ResultPath": "$.error"
      }
    ],
    "Next": "ConfirmOrder"
  }
}
```

**Built-in error codes:** `States.ALL`, `States.Timeout`, `States.TaskFailed`, `States.Permissions`, `States.ResultPathMatchFailure`, `States.ParameterPathFailure`, `States.HeartbeatTimeout`.

---

## 4. Input/Output Processing

Every state can manipulate data flowing through it using five filters, applied in order:

```
Input --> InputPath --> Parameters --> [Task Execution] --> ResultSelector --> ResultPath --> OutputPath --> Output
```

| Filter | Purpose | Example |
|--------|---------|---------|
| **InputPath** | Select a subset of input | `"InputPath": "$.order"` |
| **Parameters** | Construct new input for the task | Build specific API request payload |
| **ResultSelector** | Select fields from task result | Extract only `statusCode` and `body` |
| **ResultPath** | Where to place the result in the original input | `"ResultPath": "$.taskResult"` |
| **OutputPath** | Select a subset of output to pass to next state | `"OutputPath": "$.taskResult"` |

```json
{
  "GetOrderDetails": {
    "Type": "Task",
    "Resource": "arn:aws:lambda:us-east-1:123456789012:function:get-order",
    "Parameters": {
      "orderId.$": "$.order.id",
      "includeHistory": true
    },
    "ResultSelector": {
      "status.$": "$.Payload.status",
      "total.$": "$.Payload.total"
    },
    "ResultPath": "$.orderDetails",
    "Next": "ProcessPayment"
  }
}
```

**Key rule:** Fields ending in `.$` use JSONPath to reference values from the input. Fields without `.$` are static values.

---

## 5. Parallel and Map States

### 5.1 Parallel State

Run multiple branches concurrently. All branches must succeed for the state to succeed.

```json
{
  "ValidateOrder": {
    "Type": "Parallel",
    "Branches": [
      {
        "StartAt": "CheckInventory",
        "States": { "CheckInventory": { "Type": "Task", "Resource": "...", "End": true } }
      },
      {
        "StartAt": "ValidatePayment",
        "States": { "ValidatePayment": { "Type": "Task", "Resource": "...", "End": true } }
      }
    ],
    "Next": "FulfillOrder"
  }
}
```

Output is an array with one element per branch, in order.

### 5.2 Map State (Inline)

Iterate over an array in the input. Each element is processed by a sub-workflow.

```json
{
  "ProcessLineItems": {
    "Type": "Map",
    "ItemsPath": "$.order.items",
    "MaxConcurrency": 10,
    "ItemProcessor": {
      "ProcessorConfig": { "Mode": "INLINE" },
      "StartAt": "ProcessItem",
      "States": {
        "ProcessItem": { "Type": "Task", "Resource": "...", "End": true }
      }
    },
    "Next": "Finalize"
  }
}
```

### 5.3 Distributed Map

Process millions of items from S3 with up to 10,000 concurrent child executions. Each child is a separate execution with its own history limit.

```json
{
  "ProcessCSV": {
    "Type": "Map",
    "ItemProcessor": {
      "ProcessorConfig": {
        "Mode": "DISTRIBUTED",
        "ExecutionType": "STANDARD"
      },
      "StartAt": "Transform",
      "States": { "Transform": { "Type": "Task", "Resource": "...", "End": true } }
    },
    "ItemReader": {
      "Resource": "arn:aws:states:::s3:getObject",
      "ReaderConfig": { "InputType": "CSV", "CSVHeaderLocation": "FIRST_ROW" },
      "Parameters": { "Bucket": "my-data", "Key": "input.csv" }
    },
    "Next": "Done"
  }
}
```

---

## 6. Activity Tasks

Activities let external workers (on-prem servers, ECS containers) poll for work. The worker calls `GetActivityTask`, processes the task, then reports success or failure.

```bash
# Create an activity
aws stepfunctions create-activity --name manual-review

# Worker polls for tasks
aws stepfunctions get-activity-task \
  --activity-arn arn:aws:states:us-east-1:123456789012:activity:manual-review

# Worker reports completion
aws stepfunctions send-task-success \
  --task-token "AABBCC..." \
  --output '{"approved": true}'
```

---

## 7. Common Patterns

### 7.1 Saga Pattern (Compensating Transactions)

Each step has a corresponding "undo" step. If step 3 fails, run compensations for steps 2 and 1 in reverse order.

### 7.2 Human Approval

Use `.waitForTaskToken` integration. Send the task token to a human via email/Slack. The workflow pauses until `SendTaskSuccess` or `SendTaskFailure` is called.

### 7.3 Fan-Out / Fan-In

Use Map state to fan out processing across items, then aggregate results in the next state.

### 7.4 ETL Pipeline

Source (S3) -> Transform (Lambda/Glue via .sync) -> Load (Redshift/DynamoDB) with error handling at each stage.

---

## 8. Common CLI Commands

```bash
# Create state machine
aws stepfunctions create-state-machine \
  --name my-workflow \
  --definition file://workflow.json \
  --role-arn arn:aws:iam::123456789012:role/StepFunctionsRole

# Start execution
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:my-workflow \
  --input '{"orderId": "12345"}'

# Describe execution status
aws stepfunctions describe-execution \
  --execution-arn arn:aws:states:us-east-1:123456789012:execution:my-workflow:exec-id

# List executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:my-workflow \
  --status-filter RUNNING

# Update state machine definition
aws stepfunctions update-state-machine \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:my-workflow \
  --definition file://updated-workflow.json

# Stop a running execution
aws stepfunctions stop-execution \
  --execution-arn arn:aws:states:us-east-1:123456789012:execution:my-workflow:exec-id
```

---

## 9. Common Gotchas

| Gotcha | Details |
|--------|---------|
| **Standard pricing adds up** | $0.025 per 1,000 state transitions. A 10-state workflow running 1M times = $250. Map states multiply this. |
| **Express workflow 5-min limit** | Cannot extend. If your processing might exceed 5 minutes, use Standard. |
| **256 KB payload limit** | State input/output cannot exceed 256 KB. Store large payloads in S3 and pass references. |
| **25,000 event history limit** | Standard workflows fail if execution history exceeds 25,000 events. Use nested workflows (child executions) for long-running loops. |
| **Eventual consistency of updates** | After `UpdateStateMachine`, new executions might still use the old definition for a brief period. |
| **JSONPath quirks** | ASL uses a subset of JSONPath. No filtering expressions, no recursive descent. Test your paths carefully. |
| **Cold starts compound** | A workflow calling 5 Lambda functions hits 5 cold starts. Pre-warm or use provisioned concurrency for latency-sensitive workflows. |
| **Map state concurrency** | Default `MaxConcurrency` is 0 (unlimited). Set it explicitly to avoid throttling downstream services. |
