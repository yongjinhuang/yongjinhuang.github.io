# AI System Design Interviews

A framework for approaching AI system design interviews, with three fully worked
examples including ASCII architecture diagrams, cost analysis, and trade-off discussions.
Designed for software engineers interviewing at companies building AI-powered products.

---

## Table of Contents

1. [AI System Design Framework](#ai-system-design-framework)
2. [How AI System Design Differs](#how-ai-system-design-differs)
3. [The 6-Step Framework](#the-6-step-framework)
4. [Worked Example 1: AI Customer Support Chatbot](#worked-example-1-ai-customer-support-chatbot)
5. [Worked Example 2: Enterprise Document Q&A System](#worked-example-2-enterprise-document-qa-system)
6. [Worked Example 3: AI Code Review Assistant](#worked-example-3-ai-code-review-assistant)
7. [Common Interview Questions](#common-interview-questions)
8. [Quick Reference](#quick-reference)

---

## AI System Design Framework

AI system design interviews test your ability to design end-to-end systems that
incorporate LLMs and ML components. Unlike traditional system design, you must also
reason about model selection, prompt design, evaluation, and AI-specific failure modes.

---

## How AI System Design Differs

```
+-----------------------------------------------------------------------+
| TRADITIONAL SYSTEM DESIGN       | AI SYSTEM DESIGN                    |
+---------------------------------+-------------------------------------+
| Deterministic behavior          | Stochastic outputs                  |
| Clear correctness criteria      | Subjective quality evaluation       |
| Scale = requests/sec            | Scale = tokens/sec + cost           |
| Latency = compute + network     | Latency = inference + retrieval     |
| Test with unit tests            | Test with eval suites + human eval  |
| Debug with logs + traces        | Debug with prompt tracing + evals   |
| Failure = errors/crashes        | Failure = hallucination, drift      |
| Cost = compute + storage        | Cost = tokens + GPU + storage       |
+---------------------------------+-------------------------------------+
```

---

## The 6-Step Framework

```
+-------------------------------------------------------------+
|                AI SYSTEM DESIGN FRAMEWORK                     |
|                     (45-60 minutes)                           |
+-------------------------------------------------------------+
|                                                               |
|  STEP 1: Clarify Use Case            [5 min]                |
|  +-------------------------------------------------------+   |
|  | Who are the users? What are they trying to do?         |   |
|  | What does success look like? What are the constraints? |   |
|  +-------------------------------------------------------+   |
|                                                               |
|  STEP 2: Define the AI Pipeline      [10 min]               |
|  +-------------------------------------------------------+   |
|  | High-level architecture: what components are needed?   |   |
|  | Data flow: user query -> ... -> response               |   |
|  | Identify which parts need AI vs traditional logic      |   |
|  +-------------------------------------------------------+   |
|                                                               |
|  STEP 3: Choose Models & Approach    [10 min]               |
|  +-------------------------------------------------------+   |
|  | RAG vs fine-tuning vs prompting?                       |   |
|  | Which LLM? Which embedding model?                      |   |
|  | Justify choices with trade-offs                        |   |
|  +-------------------------------------------------------+   |
|                                                               |
|  STEP 4: Design Retrieval & Data     [10 min]               |
|  +-------------------------------------------------------+   |
|  | How is data ingested and indexed?                      |   |
|  | Chunking strategy, embedding, vector storage           |   |
|  | How does retrieval feed into generation?               |   |
|  +-------------------------------------------------------+   |
|                                                               |
|  STEP 5: Handle Failures & Edge Cases [5 min]               |
|  +-------------------------------------------------------+   |
|  | Hallucination prevention                               |   |
|  | Provider outages / fallbacks                           |   |
|  | Safety: harmful content, PII, prompt injection         |   |
|  +-------------------------------------------------------+   |
|                                                               |
|  STEP 6: Optimize Cost & Observability [5 min]              |
|  +-------------------------------------------------------+   |
|  | Cost estimation and optimization                       |   |
|  | Monitoring, evaluation, feedback loops                 |   |
|  | Scaling strategy                                       |   |
|  +-------------------------------------------------------+   |
|                                                               |
+-------------------------------------------------------------+
```

---

## Worked Example 1: AI Customer Support Chatbot

### Step 1: Clarify Use Case

**Scenario:** Design an AI-powered customer support chatbot for an e-commerce company.

**Requirements gathered:**

| Requirement | Detail |
|-------------|--------|
| Users | Customers (external), support agents (internal) |
| Primary task | Answer customer questions about orders, products, policies |
| Knowledge sources | Help center articles, product catalog, order database |
| Languages | English primary, Spanish secondary |
| Escalation | Seamlessly hand off to human agents when needed |
| Scale | 50K conversations/day, 5 messages per conversation avg |
| Latency | TTFT < 1 second |
| Accuracy | < 3% hallucination rate on factual claims |
| Availability | 99.9% uptime |

### Step 2: Define the AI Pipeline

```
+------------------------------------------------------------------------+
|                 CUSTOMER SUPPORT CHATBOT ARCHITECTURE                   |
+------------------------------------------------------------------------+
|                                                                         |
|  Customer                                                               |
|    |                                                                    |
|    v                                                                    |
|  +------------------+                                                   |
|  | Chat Interface   | (Web widget, mobile app, WhatsApp)               |
|  | (WebSocket)      |                                                   |
|  +--------+---------+                                                   |
|           |                                                             |
|           v                                                             |
|  +------------------+                                                   |
|  | Input Pipeline   |                                                   |
|  | - Language detect |                                                   |
|  | - PII redaction   |                                                   |
|  | - Intent classify |                                                   |
|  +--------+---------+                                                   |
|           |                                                             |
|           v                                                             |
|  +------------------+     +------------------+                          |
|  | Router           |---->| Order Lookup     | (if order-related)       |
|  | (intent-based)   |     | Service          |                          |
|  +--------+---------+     +------------------+                          |
|           |                                                             |
|           v                                                             |
|  +------------------+     +------------------+                          |
|  | RAG Pipeline     |---->| Vector DB        | (help articles,          |
|  | - Query rewrite  |     | (Pinecone)       |  product catalog)        |
|  | - Retrieval      |     +------------------+                          |
|  | - Reranking      |                                                   |
|  +--------+---------+     +------------------+                          |
|           |          ---->| Order Database   | (order status, history)  |
|           v               +------------------+                          |
|  +------------------+                                                   |
|  | LLM Generation   |                                                   |
|  | - Prompt + context|                                                   |
|  | - Streaming resp  |                                                   |
|  +--------+---------+                                                   |
|           |                                                             |
|           v                                                             |
|  +------------------+                                                   |
|  | Output Pipeline  |                                                   |
|  | - Safety check    |                                                   |
|  | - Citation attach |                                                   |
|  | - Escalation check|                                                   |
|  +--------+---------+                                                   |
|           |                                                             |
|    +------+------+                                                      |
|    |             |                                                       |
|    v             v                                                       |
|  Customer     Human Agent                                               |
|  Response     (if escalated)                                            |
|                                                                         |
+------------------------------------------------------------------------+
```

### Step 3: Choose Models & Approach

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| Intent classifier | GPT-4o-mini | Fast, cheap, reliable for classification |
| RAG embedding | text-embedding-3-small | Good quality, low cost |
| Main LLM | GPT-4o-mini (90%), GPT-4o (10%) | Route by complexity for cost |
| Reranker | Cohere Rerank | Better precision than embedding-only |
| Language detect | fasttext | Free, instant, on-device |

**RAG over fine-tuning because:**
- Help articles and policies change frequently
- Product catalog updates daily
- Need citations for trust
- Faster to implement and iterate

### Step 4: Design Retrieval & Data

**Knowledge ingestion:**
- Help center: ~500 articles, crawled weekly
- Product catalog: ~10K products, synced daily
- Policies: ~50 documents, updated monthly
- Chunking: recursive, 512 tokens, 100 token overlap
- Total chunks: ~15K

**Retrieval flow:**
1. Query rewrite: rephrase customer message into search query
2. Hybrid search: dense (embedding) + sparse (BM25)
3. Metadata filter: by product category if detected
4. Rerank top 10 to get top 3
5. Inject into prompt with order data from DB

**Escalation triggers:**
- Customer explicitly asks for human
- Sentiment analysis detects anger/frustration
- Agent confidence score below threshold
- Conversation exceeds 10 turns without resolution
- Topic involves refund > $100

### Step 5: Handle Failures

| Failure Mode | Detection | Mitigation |
|-------------|-----------|------------|
| Hallucination | Faithfulness check on output | "Only answer from provided context" in prompt |
| LLM provider down | Circuit breaker + error rate | Fallback to Anthropic, then canned responses |
| Wrong intent | Confidence threshold | Ask clarifying question if < 0.7 confidence |
| PII in output | Regex + NER check | Redact before sending to customer |
| Prompt injection | Input filter + monitoring | Sanitize input, use XML delimiters |

### Step 6: Cost & Observability

**Cost estimation:**
```
Daily volume: 50K conversations * 5 messages = 250K messages

Per message:
  Intent classification (GPT-4o-mini): ~200 tokens = $0.00003
  RAG embedding: ~100 tokens = $0.000002
  Reranking: ~$0.001
  Generation (90% mini, 10% 4o):
    Mini: ~1000 tokens * $0.0006/1K = $0.0006
    4o: ~1000 tokens * $0.01/1K = $0.01
    Weighted: 0.9 * $0.0006 + 0.1 * $0.01 = $0.00154

  Avg per message: ~$0.0026
  Daily cost: 250K * $0.0026 = $650
  Monthly cost: ~$19,500

  With 40% cache hit rate: ~$11,700/month
```

**Monitoring dashboard:**
- Resolution rate (goal: >70% without human)
- CSAT score per conversation
- Escalation rate (goal: <30%)
- Hallucination rate (sampled, goal: <3%)
- Average response latency
- Cost per conversation

---

## Worked Example 2: Enterprise Document Q&A System

### Step 1: Clarify Use Case

**Scenario:** Design a document Q&A system for a 10,000-employee company.

| Requirement | Detail |
|-------------|--------|
| Users | All employees (engineers, sales, legal, HR) |
| Documents | Confluence wikis, Google Docs, Slack threads, PDFs |
| Scale | 100K documents, growing 5K/month |
| Access control | Users should only see docs they have access to |
| Latency | < 3 seconds end-to-end |
| Accuracy | Must cite sources, < 5% hallucination rate |
| Update freshness | New docs searchable within 30 minutes |

### Step 2: Define the AI Pipeline

```
+------------------------------------------------------------------------+
|              ENTERPRISE DOCUMENT Q&A ARCHITECTURE                       |
+------------------------------------------------------------------------+
|                                                                         |
|  INGESTION PIPELINE (Async)                                            |
|  +-------------------------------------------------------------------+ |
|  |                                                                    | |
|  |  +----------+   +----------+   +---------+   +--------+           | |
|  |  | Source    |-->| Document |-->| Chunking|-->| Embed  |           | |
|  |  | Connectors|   | Parser   |   | Engine  |   | & Store|           | |
|  |  +----------+   +----------+   +---------+   +--------+           | |
|  |  |Confluence|   |Unstructured|  |Recursive|   |pgvector|           | |
|  |  |GDrive    |   |LlamaParse  |  |512 tok  |   |+ meta  |           | |
|  |  |Slack     |   |            |  |100 ovlp |   |        |           | |
|  |  |S3 (PDFs) |   |            |  |         |   |        |           | |
|  |  +----------+   +----------+   +---------+   +--------+           | |
|  |       ^                                            |               | |
|  |       |              +----------------+            v               | |
|  |  +----------+        | ACL Metadata   |     +-----------+          | |
|  |  | Change   |        | (who can access |     | Vector DB |          | |
|  |  | Detection|        |  each doc)     |     | (pgvector)|          | |
|  |  | (webhooks)|       +----------------+     +-----------+          | |
|  |  +----------+                                                      | |
|  +-------------------------------------------------------------------+ |
|                                                                         |
|  QUERY PIPELINE (Sync)                                                 |
|  +-------------------------------------------------------------------+ |
|  |                                                                    | |
|  |  +------+   +----------+   +--------+   +--------+   +--------+  | |
|  |  | User |-->| ACL      |-->| Query  |-->| Hybrid |-->| Rerank |  | |
|  |  | Query|   | Filter   |   | Rewrite|   | Search |   |        |  | |
|  |  +------+   | (only    |   |        |   |(dense+ |   |        |  | |
|  |              | user's   |   |        |   | BM25)  |   |        |  | |
|  |              | docs)    |   |        |   |        |   |        |  | |
|  |              +----------+   +--------+   +--------+   +--------+  | |
|  |                                                            |      | |
|  |                                                            v      | |
|  |  +----------+   +----------+   +----------+   +----------+       | |
|  |  | Response |<--| Citation |<--| LLM      |<--| Context  |       | |
|  |  | + UI     |   | Linker   |   | Generate |   | Assembly |       | |
|  |  +----------+   +----------+   +----------+   +----------+       | |
|  +-------------------------------------------------------------------+ |
+------------------------------------------------------------------------+
```

### Step 3: Choose Models & Approach

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| Embedding | text-embedding-3-small (1536d) | Good balance of quality and cost |
| Vector DB | pgvector (self-hosted) | Already running Postgres, ACL support |
| Sparse search | Elasticsearch | Full-text search, faceted filtering |
| Reranker | cross-encoder/ms-marco-MiniLM | Open-source, fast, self-hosted |
| Main LLM | Claude 3.5 Sonnet | Best for long-context analysis |
| Query rewrite | GPT-4o-mini | Cheap, fast |

**Access control strategy:**
- Store document ACL (access control list) as metadata
- At query time, filter vector search by user's groups/permissions
- Pre-filter approach: `WHERE user_groups && doc_groups` in pgvector query
- Never expose documents a user should not see, even in RAG context

### Step 4: Design Retrieval & Data

**Ingestion pipeline:**
- Source connectors poll or receive webhooks for changes
- Change detection: hash comparison for full crawl, webhooks for incremental
- Document parsing: Unstructured for most, LlamaParse for complex PDFs
- Chunking: recursive at 512 tokens, 100 overlap
- Metadata per chunk: source_url, author, last_modified, teams_with_access, doc_type

**Scale estimation:**
```
100K documents * avg 10 chunks = 1M chunks
1M chunks * 1536 dims * 4 bytes = ~6 GB vectors
1M chunks * ~1 KB text = ~1 GB text
Total storage: ~7 GB (fits in a single Postgres instance)

Queries: 10K/day = ~0.12 QPS avg, ~1 QPS peak
pgvector with HNSW: <10ms per query at 1M vectors
```

### Step 5: Handle Failures

- **Stale documents:** Track last_ingested timestamp, flag if >24h stale
- **Access control bypass:** Defense in depth -- filter at query, validate at response
- **Confidential leakage:** Never put docs from different ACL groups in same prompt
- **No relevant docs found:** If top retrieval score < threshold, say "I could not find relevant information" instead of hallucinating

### Step 6: Cost & Observability

```
Monthly cost:
  Embedding (100K docs, 1M chunks): ~$20 (one-time, re-embed on update)
  Monthly new docs: 5K * 10 chunks * 256 tokens * $0.02/1M = $0.26
  Queries: 10K/day * 30 = 300K queries
    Embedding: negligible
    Reranking: self-hosted (GPU cost ~$500/month)
    LLM generation: 300K * 2000 tokens * $3/1M = $1,800
    Query rewrite: 300K * 200 tokens * $0.15/1M = $9

  Total: ~$2,300/month + infrastructure
  Per query: ~$0.008
```

---

## Worked Example 3: AI Code Review Assistant

### Step 1: Clarify Use Case

**Scenario:** Design an AI code review assistant that integrates with GitHub.

| Requirement | Detail |
|-------------|--------|
| Users | 500 engineers, ~200 PRs/day |
| Trigger | Automatically runs on every PR |
| Review scope | Security, bugs, performance, style |
| Codebase | Monorepo, ~5M lines of code, TypeScript + Python |
| Latency | Complete review within 2 minutes of PR creation |
| False positive rate | < 20% (developers will ignore if too noisy) |
| Integration | GitHub PR comments, inline suggestions |

### Step 2: Define the AI Pipeline

```
+------------------------------------------------------------------------+
|                AI CODE REVIEW ASSISTANT                                  |
+------------------------------------------------------------------------+
|                                                                         |
|  GitHub Webhook (PR created/updated)                                   |
|    |                                                                    |
|    v                                                                    |
|  +------------------+                                                   |
|  | PR Processor     |                                                   |
|  | - Fetch diff     |                                                   |
|  | - Parse files    |                                                   |
|  | - Classify scope |                                                   |
|  +--------+---------+                                                   |
|           |                                                             |
|           v                                                             |
|  +------------------+     +------------------+                          |
|  | Context Builder  |---->| Codebase RAG     |                          |
|  | - Related files  |     | - Architecture   |                          |
|  | - Git history    |     | - Style guides   |                          |
|  | - Type defs      |     | - Past reviews   |                          |
|  +--------+---------+     +------------------+                          |
|           |                                                             |
|    +------+------+------+                                               |
|    |             |      |                                                |
|    v             v      v                                                |
|  +--------+ +--------+ +--------+                                       |
|  |Security| | Bug    | | Style  |   (parallel review agents)            |
|  |Reviewer| | Finder | | Check  |                                       |
|  |Agent   | | Agent  | | Agent  |                                       |
|  +---+----+ +---+----+ +---+----+                                       |
|      |          |           |                                           |
|      +----------+-----------+                                           |
|                 |                                                        |
|                 v                                                        |
|  +------------------+                                                   |
|  | Dedup & Prioritize|                                                  |
|  | - Remove overlaps |                                                  |
|  | - Rank by severity|                                                  |
|  | - Filter low-conf |                                                  |
|  +--------+---------+                                                   |
|           |                                                             |
|           v                                                             |
|  +------------------+                                                   |
|  | GitHub API       |                                                   |
|  | - Post comments  |                                                   |
|  | - Inline suggest |                                                   |
|  | - Summary comment|                                                   |
|  +------------------+                                                   |
|                                                                         |
+------------------------------------------------------------------------+
```

### Step 3: Choose Models & Approach

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| Security review | Claude 3.5 Sonnet | Best at nuanced code analysis |
| Bug detection | GPT-4o | Strong at code reasoning |
| Style checking | GPT-4o-mini | Simple pattern matching, cheap |
| Codebase RAG | text-embedding-3-small + pgvector | Index architecture docs + style guides |
| Dedup/prioritize | GPT-4o-mini | Cheap meta-analysis |

**Why parallel agents:**
- Each agent has a specialized system prompt and focus area
- Parallel execution meets the 2-minute latency budget
- Can independently tune each agent's prompt and model

### Step 4: Design Retrieval & Data

**Context building strategy:**
1. Fetch the PR diff (changed files only)
2. For each changed file, retrieve:
   - Full file content (pre and post change)
   - Import graph (what does this file depend on?)
   - Type definitions for referenced types
   - Recent git log for the file (who changed it, why)
3. RAG retrieval from:
   - Architecture decision records (ADRs)
   - Style guide documents
   - Similar past review comments (learn from history)

**Token budget per review:**
```
Diff:              ~2,000 tokens (avg PR)
File context:      ~3,000 tokens (related files)
Style guide:       ~500 tokens (retrieved chunks)
System prompt:     ~500 tokens
Total input:       ~6,000 tokens per agent * 3 agents = ~18,000 tokens
Output:            ~1,000 tokens per agent = ~3,000 tokens
```

### Step 5: Handle Failures

| Failure Mode | Impact | Mitigation |
|-------------|--------|------------|
| Too many comments (noise) | Developers ignore reviews | Max 10 comments, prioritize by severity |
| False positive | Loss of trust | Confidence threshold, learn from dismissals |
| Large PR (>2000 lines) | Timeout, context overflow | Split by file, summarize instead of line-by-line |
| LLM provider down | No review posted | Retry with fallback, post "review delayed" comment |
| Stale context | Wrong suggestions | Re-fetch diff at review time, not webhook time |

### Step 6: Cost & Observability

```
200 PRs/day cost:
  Security agent (Sonnet): 200 * 6K input * $3/1M + 200 * 1K output * $15/1M
    = $3.60 + $3.00 = $6.60/day
  Bug agent (GPT-4o): 200 * 6K * $2.5/1M + 200 * 1K * $10/1M
    = $3.00 + $2.00 = $5.00/day
  Style agent (GPT-4o-mini): 200 * 6K * $0.15/1M + 200 * 1K * $0.60/1M
    = $0.18 + $0.12 = $0.30/day
  Dedup (GPT-4o-mini): 200 * 3K * $0.15/1M + 200 * 500 * $0.60/1M
    = $0.09 + $0.06 = $0.15/day

  Daily total: ~$12/day
  Monthly: ~$360/month

  Per PR: ~$0.06
```

**Monitoring:**
- Comment acceptance rate (goal: >60% helpful)
- Developer feedback (thumbs up/down on each comment)
- False positive rate (dismissed comments)
- Review latency (goal: <2 min)
- Coverage (% of PRs reviewed)
- Cost per PR

---

## Common Interview Questions

### Q1: How do you approach an AI system design interview?

**Answer:** I use a 6-step framework: (1) Clarify the use case -- understand users,
requirements, scale, and constraints. (2) Define the AI pipeline -- sketch the end-to-end
architecture, identifying which components need AI vs traditional engineering. (3) Choose
models -- decide between RAG, fine-tuning, or prompting, select specific models, and
justify with trade-offs. (4) Design retrieval and data -- detail the ingestion pipeline,
chunking, storage, and retrieval strategy. (5) Handle failures -- address hallucination,
provider outages, safety, and edge cases. (6) Optimize cost and observability -- estimate
costs, identify optimization opportunities, and design monitoring. The key difference
from traditional system design is that AI components are stochastic and require evaluation
pipelines, not just unit tests.

### Q2: How do you decide between RAG and fine-tuning for a system?

**Answer:** Use RAG when: the primary need is accessing specific knowledge (documents,
FAQs, product info), knowledge changes frequently, you need citations, and you want
faster implementation. Use fine-tuning when: you need to change model behavior or output
style, you need a smaller cheaper model that mimics a larger one (distillation), or
domain-specific language patterns are required. In practice, most production systems use
RAG for knowledge + prompt engineering for behavior. Fine-tuning is the last resort after
RAG and prompting are insufficient. Some advanced systems combine all three: fine-tune for
consistent output format, RAG for dynamic knowledge, and carefully crafted prompts for
task-specific behavior.

### Q3: How do you handle hallucination in a production AI system?

**Answer:** Defense in depth: (1) Prompt engineering -- include explicit instructions like
"only answer based on the provided context" and "say I don't know if the context doesn't
contain the answer." (2) Retrieval quality -- better retrieval = less hallucination. Use
reranking, hybrid search, and appropriate chunk sizes. (3) Output validation -- run an
NLI model or LLM-as-judge to check if the response is faithful to the context. (4)
Citations -- require the model to cite specific sources, making hallucination easier to
detect. (5) Confidence scoring -- if retrieval scores are low, flag the response as
uncertain. (6) Monitoring -- sample production responses and run automated faithfulness
checks. Target < 3-5% hallucination rate for enterprise systems.

---

## Quick Reference

### AI System Design Interview Checklist

```
Step 1: Clarify Use Case
  [ ] Who are the users?
  [ ] What is the core task?
  [ ] What are the data sources?
  [ ] What are the scale requirements?
  [ ] What is the latency budget?
  [ ] What is the accuracy requirement?

Step 2: Define Pipeline
  [ ] Draw end-to-end architecture diagram
  [ ] Identify AI vs traditional components
  [ ] Define data flow from input to output
  [ ] Plan ingestion pipeline (if RAG)

Step 3: Choose Models
  [ ] RAG vs fine-tuning vs prompting decision
  [ ] Specific model selection with reasoning
  [ ] Embedding model selection (if RAG)
  [ ] Model routing strategy (if multi-model)

Step 4: Design Retrieval
  [ ] Document parsing strategy
  [ ] Chunking strategy and parameters
  [ ] Vector database selection
  [ ] Retrieval strategy (hybrid, reranking, MMR)
  [ ] Context assembly and token budget

Step 5: Handle Failures
  [ ] Hallucination prevention
  [ ] Provider fallbacks
  [ ] Safety and content filtering
  [ ] Edge cases (long input, no results, ambiguous query)

Step 6: Cost & Observability
  [ ] Per-query cost estimation
  [ ] Monthly cost projection
  [ ] Cost optimization strategy
  [ ] Key metrics and dashboard
  [ ] Evaluation pipeline
```

### Common AI System Design Questions

| Question | Key Focus Areas |
|----------|----------------|
| AI customer support chatbot | RAG, intent routing, escalation, multi-turn |
| Document Q&A system | RAG at scale, access control, freshness |
| AI code review assistant | Parallel agents, context building, PR integration |
| AI search engine | Hybrid search, ranking, personalization |
| Content moderation system | Classification, multi-modal, speed, accuracy |
| AI writing assistant | Real-time suggestions, streaming, context |
| Automated data extraction | Structured output, validation, error handling |
| AI-powered recommendation | Embeddings, user modeling, cold start |

### Cost Estimation Quick Reference

```
Rule of thumb per query:
  Simple (classification):      $0.001 - $0.005
  RAG (embed + search + gen):   $0.01 - $0.05
  Agent (multi-step):           $0.05 - $0.50
  Complex analysis:             $0.10 - $1.00

Scaling:
  10K queries/day:   $3 - $150/day    ($90 - $4,500/month)
  100K queries/day:  $30 - $1,500/day ($900 - $45,000/month)
  1M queries/day:    $300 - $15K/day  ($9K - $450K/month)

Cache savings: typically 30-50% at scale
Model routing savings: typically 50-70%
Combined: can reduce costs by 70-85%
```
