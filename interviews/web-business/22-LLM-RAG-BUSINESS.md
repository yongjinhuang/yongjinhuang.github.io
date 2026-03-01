# LLM & RAG for Business

## What Is It?

Large Language Models (LLMs) are AI systems trained on massive amounts of text that can generate human-like responses, summarize documents, answer questions, and write code. Companies like OpenAI (GPT-4), Anthropic (Claude), Google (Gemini), and Meta (Llama) offer these models. On their own, LLMs are powerful but unreliable for business use -- they "hallucinate" (confidently make up facts), they don't know your company's internal data, and their training data has a cutoff date.

Retrieval-Augmented Generation (RAG) solves this by adding a retrieval step before generation. Instead of asking the LLM to answer from memory, you first search your own data (documents, knowledge bases, databases) for relevant information, then feed that context to the LLM along with the user's question. The LLM generates an answer grounded in your actual data. This is the most common pattern for building business AI applications today -- it's cheaper than fine-tuning, easier to update, and significantly reduces hallucination.

## Why Should You Care?

Every company is building AI features. Customer support bots, internal knowledge search, document Q&A, code assistants, sales copilots -- these are all RAG applications at their core. As a developer, you'll be asked to build or integrate these systems. Understanding the business side -- costs, vendor trade-offs, build-vs-buy decisions, and common failure modes -- is just as important as understanding the technical architecture. A prototype that works in a demo can cost $50,000/month in production if you don't understand token pricing. A chatbot that hallucinates company policies can create legal liability. The developers who understand both the tech and the business implications are the ones building AI features that actually ship.

## Common Use Cases

**Internal Knowledge Base / Employee Assistant.** Employees ask questions about company policies, benefits, engineering docs, or onboarding materials. Instead of searching through Confluence/Notion/SharePoint, they ask a chatbot. RAG retrieves the relevant doc and the LLM summarizes the answer. This is the easiest RAG use case to start with -- low risk, high value, controlled data.

**Customer Support Bot.** Customers ask questions about your product. The bot retrieves answers from your help center, product docs, and FAQ. Escalates to a human agent when confidence is low. Reduces support ticket volume by 30-60% when done well. Requires guardrails and human-in-the-loop for anything involving account changes or billing.

**Document Q&A and Summarization.** Legal teams reviewing contracts, analysts parsing earnings reports, researchers reading papers. Upload a document, ask questions about it. The LLM reads the document (or retrieved chunks) and answers. High value in industries drowning in documents -- legal, finance, healthcare, compliance.

**Code Assistant.** Developers ask questions about an internal codebase, architecture decisions, or proprietary frameworks. RAG retrieves relevant code snippets, ADRs, and internal docs. Helps with onboarding new engineers and reducing time spent searching for tribal knowledge.

**Sales and Marketing Copilot.** Sales reps ask about competitor positioning, product capabilities, or pricing rules. The bot retrieves the latest sales playbook, competitive intel, and pricing docs. Keeps reps on-message and reduces the "ask the product team" bottleneck.

## How It Works (The Business Flow)

### The RAG Pipeline

```
Company Data → Ingestion → Chunking → Embedding → Vector Database
                                                         ↓
User Query → Embedding → Similarity Search → Retrieved Context → LLM → Response
                                                                         ↓
                                                                   Feedback Loop
```

### Step 1: Data Ingestion

Collect and prepare your company's data -- PDFs, Confluence pages, Slack messages, support tickets, product docs, database records. This is the messiest step. Data comes in dozens of formats, often poorly structured, sometimes contradictory. You need connectors for each source and a pipeline that runs on a schedule to keep data fresh.

Common tools for ingestion: LlamaIndex and LangChain provide connectors for dozens of data sources. Unstructured.io handles parsing complex file formats (PDFs with tables, scanned documents). For simpler setups, a Python script that reads files and calls an embedding API is enough to start.

### Step 2: Chunking and Embedding

Documents are split into chunks (typically 200-1000 tokens). Each chunk is converted into a numerical vector (an "embedding") using an embedding model. These vectors capture the semantic meaning of the text -- similar concepts produce similar vectors. The vectors are stored in a vector database (Pinecone, Weaviate, Qdrant, pgvector, Chroma).

### Step 3: User Query and Retrieval

When a user asks a question, their query is also converted into an embedding. The vector database performs a similarity search to find the chunks most relevant to the query. Typically you retrieve 5-20 chunks. Many production systems use hybrid search -- combining vector similarity with traditional keyword search for better results.

### Step 4: Generation

The retrieved chunks are injected into a prompt alongside the user's question. The LLM reads the provided context and generates an answer based on that information. A well-designed prompt tells the LLM to only answer from the provided context and to say "I don't know" when the context doesn't contain the answer.

A basic prompt structure looks like:

```
System: You are a helpful assistant. Answer questions based ONLY on the
provided context. If the context doesn't contain the answer, say
"I don't have enough information to answer that."

Context: [Retrieved chunks inserted here]

User: [User's question]
```

Including source citations in the response ("According to the Employee Handbook, section 4.2...") builds user trust and makes it easy to verify answers.

### Step 5: Feedback Loop

Users rate responses (thumbs up/down), flag incorrect answers, or rephrase questions when the first answer misses the mark. This feedback is critical for improving retrieval quality, refining chunking strategies, and identifying gaps in your data.

Track these metrics from day one: response accuracy (% of correct answers), retrieval relevance (did the right documents get retrieved?), user satisfaction (thumbs up/down ratio), and fallback rate (how often does the system say "I don't know"). These metrics tell you whether to invest in better data, better retrieval, or a better model.

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Hallucination** | When an LLM generates information that sounds correct but is fabricated. The core problem RAG addresses |
| **Grounding** | Anchoring LLM responses to real, verifiable data sources. RAG is a grounding technique |
| **Embedding** | A numerical vector representation of text that captures its meaning. Similar text produces similar vectors |
| **Vector Database** | A database optimized for storing and searching embeddings (Pinecone, Weaviate, Qdrant, Chroma, pgvector) |
| **Token** | The unit LLMs use to process text. Roughly 0.75 words per token. You pay per token |
| **Context Window** | The maximum amount of text an LLM can process in a single request. Ranges from 4K to 200K+ tokens depending on the model |
| **Prompt Engineering** | Crafting the instructions and context you send to an LLM to get the best output |
| **Fine-Tuning** | Retraining a model on your specific data to change its behavior or knowledge. Expensive and slow compared to RAG |
| **RAG vs Fine-Tuning** | RAG adds knowledge at query time (flexible, cheap). Fine-tuning bakes knowledge into the model (expensive, static). Start with RAG |
| **Chunking** | Splitting documents into smaller pieces for embedding and retrieval. Chunk size significantly affects quality |
| **Hybrid Search** | Combining vector similarity search with keyword search (BM25) for better retrieval accuracy |
| **Guardrails** | Rules and filters that prevent an LLM from generating harmful, off-topic, or policy-violating content |
| **Inference** | The process of running a query through an LLM to get a response. This is what you pay for with API pricing |
| **Temperature** | A parameter controlling how creative vs deterministic the LLM's output is. Lower = more predictable |

## The Vendor Landscape

| Provider | Key Models | Strengths | Pricing Model |
|----------|-----------|-----------|---------------|
| **OpenAI** | GPT-4o, GPT-4o-mini, o1 | Largest ecosystem, widest adoption, strong reasoning | Per-token API pricing |
| **Anthropic** | Claude Opus, Sonnet, Haiku | Long context windows (200K), strong safety, excellent at following instructions | Per-token API pricing |
| **Google** | Gemini Pro, Gemini Flash | Multimodal (text + image + video), deep Google integration | Per-token API pricing |
| **Cohere** | Command R+, Embed | Built specifically for enterprise RAG, strong retrieval models | Per-token API pricing |
| **Meta (open-source)** | Llama 3, Llama 3.1 | Free to use, self-hostable, active community, no vendor lock-in | Free (you pay for compute) |
| **Mistral (open-source)** | Mistral Large, Mixtral | Strong performance for size, good for self-hosting | Free or API pricing |

**Key insight:** The gap between open-source and proprietary models is shrinking fast. Llama 3 and Mistral compete with GPT-3.5 for many tasks. For cost-sensitive or privacy-sensitive applications, open-source is increasingly viable.

## Common Patterns

### Pattern 1: Start with RAG Before Fine-Tuning

Fine-tuning is expensive ($500-$10,000+ per training run), slow (hours to days), and creates a static snapshot of knowledge. RAG lets you update your knowledge base in minutes by adding new documents. In most business scenarios, RAG with a good retrieval pipeline outperforms fine-tuning for knowledge-intensive tasks.

**When to fine-tune:** When you need the model to adopt a specific tone, follow a strict output format, or perform a specialized task that prompt engineering can't solve.

**When to use RAG:** When you need the model to answer questions about your data, stay current, and cite sources.

### Pattern 2: Human-in-the-Loop

Never let an LLM take high-stakes actions without human review. For customer-facing support bots, have the LLM draft a response that a human agent can approve, edit, or reject. For internal tools, show confidence scores and source citations so users can verify. This pattern catches hallucinations before they reach customers and builds trust in the system.

**When it's used:** Customer support, legal document generation, medical information, financial advice -- anything where a wrong answer has real consequences.

### Pattern 3: Hybrid Search (Vector + Keyword)

Pure vector search misses exact matches (product SKUs, error codes, legal terms). Pure keyword search misses semantic meaning ("How do I cancel?" won't match a doc titled "Subscription Termination Policy"). Combine both: run a vector search and a keyword search in parallel, then merge and re-rank the results.

**When it's used:** Production RAG systems where retrieval quality directly impacts answer quality. Almost always better than vector-only search.

### Pattern 4: Guardrails and Safety Layers

Wrap your LLM with input and output filters. Input guardrails detect prompt injection attacks, off-topic queries, and attempts to extract system prompts. Output guardrails check for hallucinated URLs, PII leakage, policy violations, and toxic content. These can be rule-based, classifier-based, or even LLM-based (using a second model to evaluate the first).

**When it's used:** Any customer-facing AI feature. Non-negotiable for regulated industries (finance, healthcare, legal).

### Pattern 5: Build vs Buy Decision

| Factor | Use an API (OpenAI, Anthropic) | Self-Host (Llama, Mistral) |
|--------|-------------------------------|---------------------------|
| **Time to market** | Days to weeks | Weeks to months |
| **Cost at low volume** | Low (pay per token) | High (GPU infrastructure) |
| **Cost at high volume** | High (tokens add up fast) | Lower (fixed infrastructure) |
| **Data privacy** | Data sent to third party | Data stays on your servers |
| **Customization** | Limited to API parameters | Full control over the model |
| **Maintenance** | Vendor handles updates | You handle everything |
| **Compliance** | Check vendor's certifications | Full control over compliance |

**General rule:** Start with APIs to validate the use case. Move to self-hosted only when you have a proven need (cost savings at scale, strict data residency requirements, or deep customization needs).

## Common Pitfalls

1. **Ignoring data quality.** Garbage in, garbage out. If your knowledge base has outdated, contradictory, or poorly formatted documents, RAG will surface that garbage to users. Invest in data cleaning and curation before building the AI layer.

2. **Cost explosion in production.** A single GPT-4 call with a large context window can cost $0.05-$0.10. Multiply by thousands of daily users and you're looking at $5,000-$15,000/month. Monitor token usage religiously. Use cheaper models (GPT-4o-mini, Claude Haiku, Llama) for simpler tasks. Cache common queries.

3. **No evaluation framework.** "It seems to work" is not a quality bar. Build a test set of questions with known correct answers. Measure retrieval precision (did we find the right documents?) and generation accuracy (did the LLM answer correctly?). Without metrics, you can't improve.

4. **Data freshness gaps.** Your knowledge base is only as good as your last ingestion run. If a policy changed yesterday but your pipeline runs weekly, the AI will confidently cite the old policy. Define SLAs for data freshness and automate the pipeline.

5. **Treating all queries the same.** A simple FAQ lookup and a complex multi-document analysis need different approaches. Route simple queries to a cheaper/faster model. Reserve expensive models for complex reasoning. This pattern (sometimes called "model routing") can cut costs by 50-70%.

6. **Skipping privacy and compliance review.** Sending customer data to a third-party LLM API may violate GDPR, HIPAA, or your company's data processing agreements. Involve legal and security teams early. Understand what data leaves your infrastructure.

7. **Over-engineering the first version.** Don't build a multi-model, multi-database, auto-fine-tuning pipeline on day one. Start with a simple RAG prototype: one embedding model, one vector store, one LLM. Get user feedback. Iterate. Most of the value comes from getting the data and retrieval right, not from model sophistication.

8. **Ignoring latency.** LLM calls take 1-10 seconds. Users expect sub-second responses for chat. Stream responses token-by-token to improve perceived performance. Cache frequent queries. Pre-compute answers for known common questions.

9. **Vendor lock-in without an abstraction layer.** If your entire codebase is tightly coupled to OpenAI's API, switching to Anthropic or a self-hosted model means rewriting everything. Use an abstraction layer (LiteLLM, LangChain, or a simple interface of your own) so you can swap providers.

10. **Not tracking what users actually ask.** Log queries (with appropriate privacy safeguards). Analyze them weekly. You'll discover that 80% of questions fall into a small number of categories, many of which could be answered with better documentation rather than AI.

## Quick Reference

| Decision | Recommendation |
|----------|---------------|
| First AI feature | Start with RAG + API (OpenAI/Anthropic), not fine-tuning |
| Model choice for prototyping | GPT-4o or Claude Sonnet -- good balance of quality and cost |
| Model choice for production | Route by complexity: cheap model for simple, powerful model for complex |
| Vector database for starting out | pgvector (if you already use PostgreSQL) or Chroma (lightweight) |
| Vector database at scale | Pinecone, Weaviate, or Qdrant (managed, production-ready) |
| Data privacy concern | Self-host open-source models (Llama 3, Mistral) on your infrastructure |
| Customer-facing bot | Always add guardrails + human-in-the-loop |
| Measuring quality | Build eval set of 50-100 Q&A pairs, measure retrieval + generation accuracy |

| Cost Component | Typical Range |
|---------------|---------------|
| Embedding (per 1M tokens) | $0.02 - $0.13 |
| LLM input tokens (per 1M) | $0.15 (Haiku) - $15.00 (Opus/GPT-4) |
| LLM output tokens (per 1M) | $0.60 (Haiku) - $75.00 (Opus/GPT-4) |
| Vector database (managed) | $70 - $500/month for starter tiers |
| Self-hosted GPU (cloud) | $1,000 - $10,000+/month depending on model size |
