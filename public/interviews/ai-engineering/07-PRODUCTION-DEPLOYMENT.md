# Production Deployment for LLM Systems

A practical guide to deploying LLM-powered systems in production. Covers API gateways,
streaming, caching, cost optimization, observability, guardrails, and resilience patterns
that separate hobby projects from production-grade AI systems.

---

## Table of Contents

1. [Production Architecture Overview](#production-architecture-overview)
2. [LLM API Gateway Patterns](#llm-api-gateway-patterns)
3. [Streaming Responses](#streaming-responses)
4. [Caching Strategies](#caching-strategies)
5. [Rate Limiting and Quota Management](#rate-limiting-and-quota-management)
6. [Cost Optimization](#cost-optimization)
7. [Observability](#observability)
8. [Fallback and Resilience](#fallback-and-resilience)
9. [Guardrails and Content Filtering](#guardrails-and-content-filtering)
10. [Common Interview Questions](#common-interview-questions)
11. [Quick Reference](#quick-reference)

---

## Production Architecture Overview

```
+-------------------------------------------------------------------------+
|                  PRODUCTION LLM ARCHITECTURE                             |
+-------------------------------------------------------------------------+
|                                                                          |
|  Client                                                                  |
|    |                                                                     |
|    v                                                                     |
|  +-------------------+                                                   |
|  | API Gateway       | Auth, rate limiting, request validation           |
|  +--------+----------+                                                   |
|           |                                                              |
|           v                                                              |
|  +-------------------+                                                   |
|  | Input Guardrails  | PII detection, prompt injection filter,           |
|  |                   | content moderation, input validation              |
|  +--------+----------+                                                   |
|           |                                                              |
|           v                                                              |
|  +-------------------+                                                   |
|  | Cache Layer       | Exact match + semantic cache                      |
|  | (hit? return)     |                                                   |
|  +--------+----------+                                                   |
|           |                                                              |
|           v                                                              |
|  +-------------------+    +-------------------+                          |
|  | Model Router      |--->| LLM Provider A    | (primary: OpenAI)       |
|  | (select model,    |    +-------------------+                          |
|  |  fallback logic)  |--->| LLM Provider B    | (fallback: Anthropic)   |
|  +--------+----------+    +-------------------+                          |
|           |               | Self-hosted LLM   | (cost optimization)     |
|           |               +-------------------+                          |
|           v                                                              |
|  +-------------------+                                                   |
|  | Output Guardrails | Hallucination check, format validation,           |
|  |                   | content filtering, PII scrubbing                  |
|  +--------+----------+                                                   |
|           |                                                              |
|           v                                                              |
|  +-------------------+                                                   |
|  | Observability     | Log prompt/completion, trace chains,              |
|  |                   | metrics (latency, cost, quality)                  |
|  +--------+----------+                                                   |
|           |                                                              |
|           v                                                              |
|  Client Response (streamed or batched)                                   |
+-------------------------------------------------------------------------+
```

---

## LLM API Gateway Patterns

### Gateway Implementation

```python
from dataclasses import dataclass
from typing import Any
import time
import hashlib

@dataclass(frozen=True)
class LLMRequest:
    model: str
    messages: list[dict]
    temperature: float
    max_tokens: int
    user_id: str
    request_id: str

@dataclass(frozen=True)
class LLMResponse:
    content: str
    model: str
    tokens_used: int
    latency_ms: float
    cached: bool
    request_id: str


class LLMGateway:
    """Production LLM gateway with caching, routing, and monitoring."""

    def __init__(self, providers: dict[str, Any], cache: Any = None):
        self._providers = providers
        self._cache = cache
        self._metrics: list[dict] = []

    def complete(self, request: LLMRequest) -> LLMResponse:
        """Route an LLM request through the full pipeline."""
        start = time.time()

        # Step 1: Check cache
        if self._cache:
            cache_key = self._compute_cache_key(request)
            cached = self._cache.get(cache_key)
            if cached:
                return LLMResponse(
                    content=cached,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start) * 1000,
                    cached=True,
                    request_id=request.request_id,
                )

        # Step 2: Route to provider
        provider = self._select_provider(request.model)

        # Step 3: Call LLM with fallback
        try:
            response = provider.chat.completions.create(
                model=request.model,
                messages=request.messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except Exception as primary_error:
            # Fallback to secondary provider
            fallback_provider = self._get_fallback_provider(request.model)
            if fallback_provider is None:
                raise primary_error
            fallback_model = self._get_fallback_model(request.model)
            response = fallback_provider.chat.completions.create(
                model=fallback_model,
                messages=request.messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )

        content = response.choices[0].message.content
        latency = (time.time() - start) * 1000

        # Step 4: Cache the result
        if self._cache and request.temperature == 0:
            self._cache.set(cache_key, content, ttl=3600)

        # Step 5: Record metrics
        self._record_metrics(request, response, latency)

        return LLMResponse(
            content=content,
            model=response.model,
            tokens_used=response.usage.total_tokens,
            latency_ms=latency,
            cached=False,
            request_id=request.request_id,
        )

    def _compute_cache_key(self, request: LLMRequest) -> str:
        key_data = f"{request.model}:{request.temperature}:{str(request.messages)}"
        return hashlib.sha256(key_data.encode()).hexdigest()

    def _select_provider(self, model: str):
        if model.startswith("gpt"):
            return self._providers["openai"]
        if model.startswith("claude"):
            return self._providers["anthropic"]
        return self._providers.get("default", self._providers["openai"])

    def _get_fallback_provider(self, model: str):
        if model.startswith("gpt"):
            return self._providers.get("anthropic")
        return self._providers.get("openai")

    def _get_fallback_model(self, model: str) -> str:
        fallback_map = {
            "gpt-4o": "claude-sonnet-4-20250514",
            "claude-sonnet-4-20250514": "gpt-4o",
            "gpt-4o-mini": "claude-3-haiku-20240307",
        }
        return fallback_map.get(model, "gpt-4o-mini")

    def _record_metrics(self, request, response, latency_ms):
        self._metrics.append({
            "request_id": request.request_id,
            "model": response.model,
            "user_id": request.user_id,
            "input_tokens": response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
            "latency_ms": latency_ms,
            "timestamp": time.time(),
        })
```

---

## Streaming Responses

Streaming is essential for user-facing LLM applications. Without streaming, users
wait 5-30 seconds for a response. With streaming, they see tokens appear in real-time.

### Server-Side Streaming

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json

app = FastAPI()
client = OpenAI()

@app.post("/chat/stream")
async def chat_stream(request: dict):
    """Stream LLM responses using Server-Sent Events (SSE)."""

    async def generate():
        stream = client.chat.completions.create(
            model=request.get("model", "gpt-4o"),
            messages=request["messages"],
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                # SSE format
                data = json.dumps({"content": delta.content})
                yield f"data: {data}\n\n"

            if chunk.choices[0].finish_reason:
                yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

### Client-Side Consumption

```python
import httpx

async def consume_stream(url: str, messages: list[dict]):
    """Consume an SSE stream from the LLM gateway."""
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            url,
            json={"messages": messages},
            timeout=60.0,
        ) as response:
            full_response = []
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    if data.get("done"):
                        break
                    content = data.get("content", "")
                    full_response.append(content)
                    print(content, end="", flush=True)

    return "".join(full_response)
```

### Streaming Metrics

```
+------------------------------------------------------------------+
| STREAMING PERFORMANCE METRICS                                     |
+------------------------------------------------------------------+
|                                                                    |
|  TTFT (Time to First Token)                                       |
|  - Most important UX metric                                      |
|  - Target: < 500ms for interactive applications                  |
|  - Includes: network + model loading + first inference step      |
|                                                                    |
|  TPS (Tokens Per Second)                                          |
|  - Speed of token generation after first token                   |
|  - Target: > 30 TPS for readable streaming                      |
|  - Typical: 40-100 TPS (API), 20-50 TPS (self-hosted)          |
|                                                                    |
|  Total Time                                                       |
|  - TTFT + (output_tokens / TPS)                                  |
|  - For 500 token response at 50 TPS: 0.5s + 10s = 10.5s         |
|  - Without streaming user waits 10.5s; with streaming, 0.5s      |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Caching Strategies

### Exact Match Cache

```python
import hashlib
import json
import time
from typing import Any

class ExactMatchCache:
    """Cache LLM responses by exact input match."""

    def __init__(self, max_size: int = 10000, default_ttl: int = 3600):
        self._store: dict[str, dict] = {}
        self._max_size = max_size
        self._default_ttl = default_ttl

    def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.time() > entry["expires_at"]:
            del self._store[key]
            return None
        return entry["value"]

    def set(self, key: str, value: str, ttl: int | None = None) -> None:
        if len(self._store) >= self._max_size:
            self._evict_oldest()
        self._store[key] = {
            "value": value,
            "expires_at": time.time() + (ttl or self._default_ttl),
            "created_at": time.time(),
        }

    def _evict_oldest(self) -> None:
        oldest_key = min(self._store, key=lambda k: self._store[k]["created_at"])
        del self._store[oldest_key]

    @staticmethod
    def compute_key(model: str, messages: list[dict], temperature: float) -> str:
        data = json.dumps({"model": model, "messages": messages, "temp": temperature})
        return hashlib.sha256(data.encode()).hexdigest()
```

### Semantic Cache

Cache responses for semantically similar (not identical) queries.

```python
import numpy as np

class SemanticCache:
    """Cache LLM responses using embedding similarity."""

    def __init__(
        self,
        embedding_client,
        similarity_threshold: float = 0.95,
        max_size: int = 5000,
    ):
        self._client = embedding_client
        self._threshold = similarity_threshold
        self._max_size = max_size
        self._entries: list[dict] = []

    def get(self, query: str) -> str | None:
        """Find a cached response for a semantically similar query."""
        query_embedding = self._embed(query)

        best_score = 0.0
        best_response = None

        for entry in self._entries:
            score = self._cosine_sim(query_embedding, entry["embedding"])
            if score > best_score:
                best_score = score
                best_response = entry["response"]

        if best_score >= self._threshold:
            return best_response
        return None

    def set(self, query: str, response: str) -> None:
        """Cache a query-response pair."""
        embedding = self._embed(query)
        self._entries.append({
            "query": query,
            "response": response,
            "embedding": embedding,
            "timestamp": time.time(),
        })
        if len(self._entries) > self._max_size:
            self._entries.pop(0)  # Remove oldest

    def _embed(self, text: str) -> list[float]:
        response = self._client.embeddings.create(
            model="text-embedding-3-small",
            input=[text],
        )
        return response.data[0].embedding

    def _cosine_sim(self, a: list[float], b: list[float]) -> float:
        a_arr = np.array(a)
        b_arr = np.array(b)
        return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))
```

### Cache Strategy Comparison

| Strategy | Hit Rate | Accuracy | Cost Overhead | Best For |
|----------|---------|----------|---------------|----------|
| Exact match | Low (10-30%) | 100% | None | Deterministic queries (temp=0) |
| Semantic cache | Medium (30-60%) | 95%+ | Embedding cost | Similar user queries |
| Prompt-level | High (50-70%) | 100% | None | System prompts, prefixes |

---

## Rate Limiting and Quota Management

```python
import time
from collections import defaultdict

class TokenBucketRateLimiter:
    """Rate limiter using token bucket algorithm."""

    def __init__(
        self,
        tokens_per_minute: int = 100000,
        requests_per_minute: int = 100,
    ):
        self._token_limit = tokens_per_minute
        self._request_limit = requests_per_minute
        self._user_buckets: dict[str, dict] = defaultdict(
            lambda: {
                "tokens": tokens_per_minute,
                "requests": requests_per_minute,
                "last_refill": time.time(),
            }
        )

    def check_and_consume(
        self, user_id: str, estimated_tokens: int
    ) -> dict:
        """Check if request is allowed and consume quota."""
        bucket = self._user_buckets[user_id]
        self._refill(bucket)

        if bucket["requests"] <= 0:
            return {
                "allowed": False,
                "reason": "request_limit_exceeded",
                "retry_after_seconds": 60,
            }

        if bucket["tokens"] < estimated_tokens:
            return {
                "allowed": False,
                "reason": "token_limit_exceeded",
                "retry_after_seconds": 60,
            }

        new_bucket = {
            **bucket,
            "tokens": bucket["tokens"] - estimated_tokens,
            "requests": bucket["requests"] - 1,
        }
        self._user_buckets[user_id] = new_bucket

        return {"allowed": True, "remaining_tokens": new_bucket["tokens"]}

    def _refill(self, bucket: dict) -> None:
        now = time.time()
        elapsed = now - bucket["last_refill"]
        if elapsed >= 60:
            bucket["tokens"] = self._token_limit
            bucket["requests"] = self._request_limit
            bucket["last_refill"] = now
```

---

## Cost Optimization

### Model Routing

Route queries to the cheapest model that can handle them well.

```python
class ModelRouter:
    """Route queries to the most cost-effective model."""

    def __init__(self, client):
        self.client = client
        self._routing_rules = [
            {
                "condition": lambda q: len(q.split()) < 20,
                "model": "gpt-4o-mini",
                "reason": "simple_query",
            },
            {
                "condition": lambda q: any(
                    kw in q.lower() for kw in ["summarize", "translate", "classify"]
                ),
                "model": "gpt-4o-mini",
                "reason": "standard_task",
            },
            {
                "condition": lambda q: any(
                    kw in q.lower()
                    for kw in ["analyze", "design", "complex", "compare"]
                ),
                "model": "gpt-4o",
                "reason": "complex_task",
            },
        ]
        self._default_model = "gpt-4o-mini"

    def route(self, query: str) -> dict:
        """Select the best model for a query."""
        for rule in self._routing_rules:
            if rule["condition"](query):
                return {"model": rule["model"], "reason": rule["reason"]}
        return {"model": self._default_model, "reason": "default"}


# Advanced: LLM-based routing
def llm_based_router(client, query: str) -> str:
    """Use a cheap model to classify query complexity."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        max_tokens=10,
        messages=[
            {
                "role": "system",
                "content": "Classify query complexity as SIMPLE or COMPLEX. "
                           "Respond with one word only.",
            },
            {"role": "user", "content": query},
        ],
    )
    complexity = response.choices[0].message.content.strip().upper()
    return "gpt-4o" if complexity == "COMPLEX" else "gpt-4o-mini"
```

### Prompt Compression

```python
def compress_prompt(
    system_prompt: str,
    context: str,
    max_context_tokens: int = 2000,
) -> str:
    """Compress context to fit within token budget."""
    import tiktoken

    enc = tiktoken.encoding_for_model("gpt-4o")
    context_tokens = enc.encode(context)

    if len(context_tokens) <= max_context_tokens:
        return context

    # Strategy 1: Truncate from the middle (keep beginning and end)
    half = max_context_tokens // 2
    compressed_tokens = context_tokens[:half] + context_tokens[-half:]
    return enc.decode(compressed_tokens)
```

### Cost Optimization Summary

```
+------------------------------------------------------------------+
| COST OPTIMIZATION TECHNIQUES                                      |
+------------------------------------------------------------------+
|                                                                    |
|  1. MODEL ROUTING (60-80% savings)                                |
|     Route simple queries to GPT-4o-mini ($0.15/1M)               |
|     Reserve GPT-4o ($2.50/1M) for complex queries                |
|                                                                    |
|  2. CACHING (30-70% savings)                                      |
|     Exact match: temp=0 deterministic queries                     |
|     Semantic: similar queries within threshold                    |
|                                                                    |
|  3. PROMPT COMPRESSION (20-40% savings)                           |
|     Shorten system prompts                                        |
|     Truncate/summarize context                                    |
|     Remove redundant instructions                                 |
|                                                                    |
|  4. BATCH API (50% savings)                                       |
|     OpenAI Batch API: 50% discount                                |
|     For non-urgent processing (analytics, evaluation)             |
|                                                                    |
|  5. TOKEN BUDGETING                                               |
|     Set max_tokens per request type                               |
|     Monitor and alert on budget overruns                          |
|                                                                    |
|  6. SELF-HOSTING (at scale)                                       |
|     Break-even: ~10M+ tokens/day                                 |
|     Use quantized models (GPTQ, AWQ)                              |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Observability

### Structured Logging

```python
import json
import time
import uuid
from dataclasses import dataclass

@dataclass(frozen=True)
class LLMLogEntry:
    request_id: str
    timestamp: float
    model: str
    user_id: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: float
    cost_usd: float
    cached: bool
    error: str | None
    # Do NOT log full prompts/completions by default (PII risk)
    prompt_hash: str
    completion_length: int


class LLMLogger:
    """Structured logging for LLM requests."""

    PRICING = {
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    }

    def log_request(
        self,
        request_id: str,
        model: str,
        user_id: str,
        response,
        latency_ms: float,
        cached: bool = False,
    ) -> LLMLogEntry:
        """Create a structured log entry for an LLM request."""
        prompt_tokens = response.usage.prompt_tokens
        completion_tokens = response.usage.completion_tokens

        pricing = self.PRICING.get(model, {"input": 0, "output": 0})
        cost = (
            (prompt_tokens / 1_000_000) * pricing["input"]
            + (completion_tokens / 1_000_000) * pricing["output"]
        )

        entry = LLMLogEntry(
            request_id=request_id,
            timestamp=time.time(),
            model=model,
            user_id=user_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
            cached=cached,
            error=None,
            prompt_hash=hashlib.sha256(
                str(response).encode()
            ).hexdigest()[:16],
            completion_length=len(response.choices[0].message.content),
        )

        # In production, send to logging service
        print(json.dumps({
            "level": "INFO",
            "service": "llm-gateway",
            **vars(entry),
        }))

        return entry
```

### Tracing Chains and Pipelines

```python
from dataclasses import dataclass, field
import uuid
import time

@dataclass(frozen=True)
class SpanInfo:
    span_id: str
    name: str
    start_time: float
    end_time: float
    model: str | None
    tokens: int
    metadata: dict


class LLMTracer:
    """Trace multi-step LLM pipelines."""

    def __init__(self):
        self._trace_id = str(uuid.uuid4())
        self._spans: list[SpanInfo] = []

    def span(self, name: str, model: str | None = None):
        """Context manager for tracing a span."""
        return TracerSpan(self, name, model)

    def add_span(self, span: SpanInfo) -> None:
        self._spans = [*self._spans, span]

    def get_trace(self) -> dict:
        return {
            "trace_id": self._trace_id,
            "total_time_ms": sum(
                (s.end_time - s.start_time) * 1000 for s in self._spans
            ),
            "total_tokens": sum(s.tokens for s in self._spans),
            "spans": [
                {
                    "span_id": s.span_id,
                    "name": s.name,
                    "duration_ms": (s.end_time - s.start_time) * 1000,
                    "model": s.model,
                    "tokens": s.tokens,
                }
                for s in self._spans
            ],
        }


class TracerSpan:
    def __init__(self, tracer: LLMTracer, name: str, model: str | None):
        self._tracer = tracer
        self._name = name
        self._model = model
        self._start_time = 0.0
        self._tokens = 0
        self._metadata: dict = {}

    def __enter__(self):
        self._start_time = time.time()
        return self

    def __exit__(self, *args):
        span = SpanInfo(
            span_id=str(uuid.uuid4()),
            name=self._name,
            start_time=self._start_time,
            end_time=time.time(),
            model=self._model,
            tokens=self._tokens,
            metadata=self._metadata,
        )
        self._tracer.add_span(span)

    def set_tokens(self, tokens: int):
        self._tokens = tokens

    def set_metadata(self, key: str, value):
        self._metadata = {**self._metadata, key: value}


# Usage
tracer = LLMTracer()

with tracer.span("embed_query", model="text-embedding-3-small") as span:
    # embedding call
    span.set_tokens(256)

with tracer.span("vector_search") as span:
    # vector DB query
    span.set_metadata("results_count", 5)

with tracer.span("generate_answer", model="gpt-4o") as span:
    # LLM generation
    span.set_tokens(1500)

print(json.dumps(tracer.get_trace(), indent=2))
```

### Observability Tools

| Tool | Type | Best For | Open Source |
|------|------|----------|-------------|
| **LangSmith** | LLM tracing | LangChain pipelines | No |
| **Langfuse** | LLM tracing | General LLM ops | Yes |
| **Helicone** | LLM proxy | API monitoring | Yes |
| **Arize Phoenix** | LLM evaluation | Tracing + eval | Yes |
| **OpenTelemetry** | General tracing | Custom pipelines | Yes |
| **Weights & Biases** | Experiment tracking | Fine-tuning | No |

---

## Fallback and Resilience

### Fallback Strategy

```python
import time
from dataclasses import dataclass

@dataclass(frozen=True)
class ModelConfig:
    provider: str
    model: str
    timeout_seconds: int
    max_retries: int

# Define fallback chain
FALLBACK_CHAIN = [
    ModelConfig("openai", "gpt-4o", timeout_seconds=30, max_retries=2),
    ModelConfig("anthropic", "claude-sonnet-4-20250514", timeout_seconds=30, max_retries=2),
    ModelConfig("openai", "gpt-4o-mini", timeout_seconds=15, max_retries=1),
]

def call_with_fallback(
    providers: dict,
    messages: list[dict],
    chain: list[ModelConfig] = FALLBACK_CHAIN,
) -> dict:
    """Try each model in the fallback chain until one succeeds."""
    errors = []

    for config in chain:
        provider = providers.get(config.provider)
        if provider is None:
            continue

        for attempt in range(config.max_retries + 1):
            try:
                response = provider.chat.completions.create(
                    model=config.model,
                    messages=messages,
                    timeout=config.timeout_seconds,
                )
                return {
                    "content": response.choices[0].message.content,
                    "model": config.model,
                    "provider": config.provider,
                    "fallback_level": chain.index(config),
                }
            except Exception as e:
                errors.append(f"{config.provider}/{config.model}: {str(e)}")
                if attempt < config.max_retries:
                    time.sleep(1 * (attempt + 1))

    raise RuntimeError(
        f"All models in fallback chain failed: {'; '.join(errors)}"
    )
```

### Circuit Breaker Pattern

```python
import time

class CircuitBreaker:
    """Circuit breaker for LLM provider health."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
    ):
        self._failure_count = 0
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._state = "closed"  # closed, open, half-open
        self._last_failure_time = 0.0

    @property
    def is_available(self) -> bool:
        if self._state == "closed":
            return True
        if self._state == "open":
            if time.time() - self._last_failure_time > self._recovery_timeout:
                self._state = "half-open"
                return True
            return False
        # half-open: allow one request
        return True

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self._failure_threshold:
            self._state = "open"
```

---

## Guardrails and Content Filtering

### Input/Output Guardrails

```python
import re

class Guardrails:
    """Input and output guardrails for LLM systems."""

    PII_PATTERNS = {
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
        "credit_card": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    }

    @staticmethod
    def check_input(text: str) -> dict:
        """Validate input before sending to LLM."""
        issues = []

        # Check for PII
        for pii_type, pattern in Guardrails.PII_PATTERNS.items():
            if re.search(pattern, text):
                issues.append({"type": "pii_detected", "subtype": pii_type})

        # Check for prompt injection patterns
        injection_patterns = [
            r"ignore\s+(all\s+)?previous\s+instructions",
            r"you\s+are\s+now\s+",
            r"system\s*prompt:",
        ]
        for pattern in injection_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                issues.append({"type": "prompt_injection_attempt"})
                break

        # Check length
        if len(text) > 50000:
            issues.append({"type": "input_too_long", "length": len(text)})

        return {
            "safe": len(issues) == 0,
            "issues": issues,
        }

    @staticmethod
    def check_output(text: str) -> dict:
        """Validate LLM output before returning to user."""
        issues = []

        # Check for PII leakage
        for pii_type, pattern in Guardrails.PII_PATTERNS.items():
            if re.search(pattern, text):
                issues.append({"type": "pii_in_output", "subtype": pii_type})

        # Check for refusal to answer (may indicate jailbreak)
        refusal_indicators = [
            "I cannot", "I'm unable to", "I must decline",
            "as an AI language model",
        ]
        has_refusal = any(r.lower() in text.lower() for r in refusal_indicators)
        if has_refusal:
            issues.append({"type": "refusal_detected"})

        return {
            "safe": len([i for i in issues if i["type"] == "pii_in_output"]) == 0,
            "issues": issues,
        }

    @staticmethod
    def redact_pii(text: str) -> str:
        """Remove PII from text."""
        redacted = text
        replacements = {
            "email": "[EMAIL_REDACTED]",
            "phone": "[PHONE_REDACTED]",
            "ssn": "[SSN_REDACTED]",
            "credit_card": "[CC_REDACTED]",
        }
        for pii_type, pattern in Guardrails.PII_PATTERNS.items():
            redacted = re.sub(pattern, replacements[pii_type], redacted)
        return redacted
```

---

## Common Interview Questions

### Q1: How do you handle LLM provider outages in production?

**Answer:** A multi-layered resilience strategy: (1) Fallback chain -- configure primary
and secondary LLM providers (e.g., OpenAI primary, Anthropic fallback). If the primary
returns an error or times out, automatically try the fallback. (2) Circuit breaker --
after N consecutive failures (e.g., 5), stop sending requests to the failing provider
for a cooldown period (e.g., 60 seconds) and route all traffic to fallbacks. (3)
Graceful degradation -- if all LLM providers are down, fall back to cached responses,
pre-computed answers, or a "we're experiencing issues" message. (4) Async retries with
exponential backoff for transient errors. (5) Multi-region deployment if using self-hosted
models. The key is that users should never see a raw error -- always have a fallback path.

### Q2: How do you optimize LLM costs in production?

**Answer:** Multiple techniques stacked together: (1) Model routing (biggest impact) --
classify query complexity and route simple queries to cheap models (GPT-4o-mini at
$0.15/1M) and only use expensive models (GPT-4o at $2.50/1M) for complex queries.
Typical savings: 60-80%. (2) Caching -- exact match cache for deterministic queries
(temp=0) and semantic cache for similar queries. Savings: 30-70% depending on query
diversity. (3) Prompt optimization -- shorten system prompts, compress context, remove
redundant instructions. Savings: 20-40%. (4) Batch API -- use OpenAI's batch endpoint
(50% discount) for non-real-time processing. (5) Token budgeting -- set max_tokens per
request type and monitor usage. (6) At very high scale (10M+ tokens/day), self-hosting
quantized open-source models becomes cheaper than API.

### Q3: How do you implement caching for LLM responses?

**Answer:** Two-tier caching strategy. Tier 1: exact match cache -- hash the full request
(model + messages + temperature) and cache the response. Works great for deterministic
queries (temperature=0) like classification, extraction, and structured output. Use
Redis or in-memory cache with TTL. Tier 2: semantic cache -- embed the user query and
find similar cached queries using cosine similarity above a threshold (0.95+). This
catches paraphrased versions of the same question. The tradeoff: semantic cache has
higher hit rates but risks returning slightly wrong answers for genuinely different
queries. Important considerations: (1) only cache temperature=0 requests for exact match,
(2) invalidate cache when the system prompt changes, (3) set appropriate TTL based on
how frequently the underlying data changes.

### Q4: What observability do you need for LLM systems?

**Answer:** Four pillars: (1) Metrics -- track latency (TTFT, total), token usage,
cost per request, error rate, cache hit rate, model distribution. (2) Logging -- log
request metadata (model, tokens, latency, user_id) for every call. Do NOT log full
prompts/completions by default (PII risk) -- use a separate opt-in audit log for
debugging. (3) Tracing -- for multi-step pipelines (RAG, agents), trace each step with
parent-child span relationships so you can see where time and tokens are spent. (4)
Quality monitoring -- sample 1-5% of production responses for automated evaluation
(LLM-as-judge, faithfulness checks) and track quality metrics over time to detect drift.
Tools like Langfuse and Helicone provide LLM-specific observability out of the box.

---

## Quick Reference

### Production Readiness Checklist

```
Infrastructure:
  [ ] LLM gateway with provider abstraction
  [ ] Fallback chain (primary + secondary provider)
  [ ] Circuit breaker on each provider
  [ ] Rate limiting per user/tenant
  [ ] Streaming support for user-facing endpoints

Cost Control:
  [ ] Model routing (simple -> cheap, complex -> expensive)
  [ ] Caching layer (exact + semantic)
  [ ] Token budgets and alerts
  [ ] Monthly cost forecasting

Quality:
  [ ] Input guardrails (PII, injection, length)
  [ ] Output guardrails (PII, format, safety)
  [ ] Evaluation pipeline on production samples
  [ ] Regression test suite for prompts

Observability:
  [ ] Structured logging (no PII in default logs)
  [ ] Tracing for multi-step pipelines
  [ ] Dashboard: latency, cost, errors, quality
  [ ] Alerting on anomalies

Security:
  [ ] API keys in secret manager (not code)
  [ ] PII redaction before logging
  [ ] Prompt injection defenses
  [ ] Audit log for sensitive operations
```

### Key Production Numbers

```
Latency targets:
  TTFT (streaming):     < 500ms
  Simple query (e2e):   < 2s
  RAG query (e2e):      < 3s
  Agent task (e2e):     < 30s

Error budget:
  API error rate:       < 0.1%
  Timeout rate:         < 1%
  Cache hit rate:       > 40%
  Fallback trigger rate: < 5%

Cost benchmarks (per 1000 queries):
  Cheap model only:     $0.10 - $0.50
  Model routing:        $0.50 - $2.00
  Premium model only:   $2.00 - $10.00
  RAG pipeline:         $5.00 - $20.00
  Agent pipeline:       $10.00 - $50.00
```
