# Memory and State Management for AI Agents

> **Interview Prep Guide for Agentic Engineers**
>
> Memory is what transforms a stateless language model into an intelligent agent.
> This guide covers everything from conversation buffers to hierarchical memory
> architectures -- with code you can build on.

---

## Table of Contents

1. [Why Memory Matters](#1-why-memory-matters)
2. [Context Window Management](#2-context-window-management)
3. [Short-Term Memory](#3-short-term-memory)
4. [Long-Term Memory](#4-long-term-memory)
5. [Working Memory](#5-working-memory)
6. [Episodic Memory](#6-episodic-memory)
7. [Semantic Memory](#7-semantic-memory)
8. [Procedural Memory](#8-procedural-memory)
9. [Memory Architectures](#9-memory-architectures)
10. [State Persistence](#10-state-persistence)
11. [Context Window Optimization](#11-context-window-optimization)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Why Memory Matters

### The Fundamental Problem

Large language models are **stateless functions**. Every call to an LLM is independent -- it has no memory of previous interactions unless you explicitly provide that context. An agent, on the other hand, must behave as though it remembers.

```
Stateless LLM Call:
  Input  -->  [ LLM ]  -->  Output
  (no history, no context, no continuity)

Stateful Agent:
  Input + Memory  -->  [ LLM ]  -->  Output + Memory Update
  (conversation history, retrieved knowledge, learned patterns)
```

### Stateless LLMs vs. Stateful Agents

| Aspect          | Raw LLM                         | Agent with Memory                   |
| --------------- | ------------------------------- | ----------------------------------- |
| Persistence     | None between calls              | Maintains state across turns        |
| Context         | Only what's in the prompt       | Retrieves relevant past context     |
| Learning        | Fixed at training               | Accumulates experience              |
| Personalization | Generic responses               | Adapts to user/task                 |
| Long tasks      | Loses track after context limit | Manages information over hours/days |

### Why This Is Hard

1. **Finite context windows** -- even 128K or 1M tokens eventually run out
2. **Cost scales linearly** with context length (or worse)
3. **Attention degradation** -- models struggle with information in the middle of long contexts ("lost in the middle" problem)
4. **No native persistence** -- you must build every memory mechanism yourself
5. **Relevance filtering** -- not all past information is useful for the current task

### The Memory Stack

Real agent systems use multiple memory types working together, analogous to human cognition:

```
+------------------------------------------------------------------+
|                        AGENT MEMORY STACK                        |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------+   +------------------+   +---------------+ |
|  | Working Memory   |   | Short-Term Memory|   | Episodic      | |
|  | (scratchpad,     |   | (recent turns,   |   | Memory        | |
|  |  current plan,   |   |  sliding window) |   | (past tasks,  | |
|  |  intermediate    |   |                  |   |  outcomes)     | |
|  |  reasoning)      |   |                  |   |               | |
|  +--------+---------+   +--------+---------+   +-------+-------+ |
|           |                      |                      |        |
|           v                      v                      v        |
|  +----------------------------------------------------------+   |
|  |              CONTEXT WINDOW (prompt to LLM)               |   |
|  +----------------------------------------------------------+   |
|           |                      |                      |        |
|           v                      v                      v        |
|  +------------------+   +------------------+   +---------------+ |
|  | Semantic Memory  |   | Procedural       |   | Long-Term     | |
|  | (facts, embeddings|  | Memory           |   | Memory        | |
|  |  vector store)   |   | (skills, tools,  |   | (vector DB,   | |
|  |                  |   |  few-shot examples|   |  knowledge    | |
|  |                  |   |  )               |   |  graph)       | |
|  +------------------+   +------------------+   +---------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 2. Context Window Management

The context window is the **bottleneck** of every agent system. Everything the model can reason about must fit inside it.

### Token Budgeting

Allocate your context window deliberately:

```
Context Window Budget (e.g., 128K tokens):
+------------------------------------------------------------+
| System Prompt & Instructions          |   ~2,000 tokens    |
+---------------------------------------+--------------------+
| Tool Definitions                      |   ~3,000 tokens    |
+---------------------------------------+--------------------+
| Retrieved Knowledge (RAG)             |  ~10,000 tokens    |
+---------------------------------------+--------------------+
| Working Memory / Scratchpad           |   ~5,000 tokens    |
+---------------------------------------+--------------------+
| Conversation History (summarized)     |  ~15,000 tokens    |
+---------------------------------------+--------------------+
| Recent Messages (full fidelity)       |  ~10,000 tokens    |
+---------------------------------------+--------------------+
| Current User Query                    |   ~1,000 tokens    |
+---------------------------------------+--------------------+
| Reserved for Model Output             |   ~4,000 tokens    |
+---------------------------------------+--------------------+
| Safety Buffer (avoid hitting limit)   |   ~2,000 tokens    |
+---------------------------------------+--------------------+
| REMAINING (available for expansion)   |  ~76,000 tokens    |
+------------------------------------------------------------+
```

### Token Budget Manager

```python
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TokenBudget:
    """Immutable token budget allocation for context window."""
    total: int
    system_prompt: int
    tool_definitions: int
    retrieved_knowledge: int
    working_memory: int
    conversation_summary: int
    recent_messages: int
    current_query: int
    output_reserved: int
    safety_buffer: int

    @property
    def allocated(self) -> int:
        return (
            self.system_prompt
            + self.tool_definitions
            + self.retrieved_knowledge
            + self.working_memory
            + self.conversation_summary
            + self.recent_messages
            + self.current_query
            + self.output_reserved
            + self.safety_buffer
        )

    @property
    def remaining(self) -> int:
        return self.total - self.allocated

    def with_updated_allocation(self, **kwargs) -> "TokenBudget":
        """Return a new budget with updated allocations (immutable)."""
        current = {
            "total": self.total,
            "system_prompt": self.system_prompt,
            "tool_definitions": self.tool_definitions,
            "retrieved_knowledge": self.retrieved_knowledge,
            "working_memory": self.working_memory,
            "conversation_summary": self.conversation_summary,
            "recent_messages": self.recent_messages,
            "current_query": self.current_query,
            "output_reserved": self.output_reserved,
            "safety_buffer": self.safety_buffer,
        }
        updated = {**current, **kwargs}
        return TokenBudget(**updated)


def create_default_budget(total_tokens: int = 128_000) -> TokenBudget:
    return TokenBudget(
        total=total_tokens,
        system_prompt=2_000,
        tool_definitions=3_000,
        retrieved_knowledge=10_000,
        working_memory=5_000,
        conversation_summary=15_000,
        recent_messages=10_000,
        current_query=1_000,
        output_reserved=4_000,
        safety_buffer=2_000,
    )
```

### Context Compression Strategies

**1. Summarization** -- Condense older messages into summaries.

```python
async def compress_conversation(
    messages: list[dict],
    llm_client,
    max_summary_tokens: int = 500,
) -> dict:
    """Summarize a block of messages into a single summary message."""
    conversation_text = "\n".join(
        f"{m['role']}: {m['content']}" for m in messages
    )

    summary = await llm_client.complete(
        system="You are a conversation summarizer. Produce a concise summary "
               "that preserves all key facts, decisions, and action items.",
        prompt=f"Summarize this conversation:\n\n{conversation_text}",
        max_tokens=max_summary_tokens,
    )

    return {
        "role": "system",
        "content": f"[Summary of {len(messages)} earlier messages]\n{summary}",
        "metadata": {
            "type": "summary",
            "original_count": len(messages),
            "compressed_from_tokens": sum(
                count_tokens(m["content"]) for m in messages
            ),
        },
    }
```

**2. Selective Retention** -- Keep high-value messages, drop low-value ones.

```python
def score_message_importance(message: dict, current_query: str) -> float:
    """Score how important a message is for the current context."""
    score = 0.0

    # Tool results and errors are often critical
    if message.get("role") == "tool":
        score += 0.3
    if "error" in message.get("content", "").lower():
        score += 0.4

    # Messages with decisions or conclusions
    decision_keywords = ["decided", "conclusion", "therefore", "plan is"]
    if any(kw in message.get("content", "").lower() for kw in decision_keywords):
        score += 0.3

    # Recency bias
    score += message.get("recency_weight", 0.0)

    # Semantic similarity to current query (requires embedding)
    score += message.get("query_similarity", 0.0) * 0.5

    return min(score, 1.0)
```

**3. Hierarchical Compression** -- Multiple levels of detail.

```
Level 0 (full):    "The user asked to refactor the auth module. I analyzed
                    auth.py (340 lines), identified 3 God classes, proposed
                    splitting into AuthService, TokenManager, and SessionStore.
                    User approved. I created the three files..."

Level 1 (medium):  "Refactored auth module: split into AuthService,
                    TokenManager, SessionStore. User approved the plan."

Level 2 (minimal): "Auth module refactored into 3 services."
```

---

## 3. Short-Term Memory

Short-term memory holds the **recent conversation** -- the messages the agent has exchanged with the user and tools in the current session.

### Sliding Window

The simplest approach: keep the last N messages.

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class SlidingWindowMemory:
    """Fixed-size window of recent messages."""
    messages: tuple[dict, ...]
    max_messages: int = 50

    def add_message(self, message: dict) -> "SlidingWindowMemory":
        """Return new memory with the message added (immutable)."""
        new_messages = self.messages + (message,)
        if len(new_messages) > self.max_messages:
            new_messages = new_messages[-self.max_messages:]
        return SlidingWindowMemory(
            messages=new_messages,
            max_messages=self.max_messages,
        )

    def get_messages(self) -> list[dict]:
        return list(self.messages)

    @property
    def token_count(self) -> int:
        return sum(count_tokens(m.get("content", "")) for m in self.messages)
```

### Token-Based Window

A more practical approach: keep messages that fit within a token budget.

```python
@dataclass(frozen=True)
class TokenWindowMemory:
    """Keep as many recent messages as fit within a token budget."""
    messages: tuple[dict, ...]
    max_tokens: int = 10_000

    def add_message(self, message: dict) -> "TokenWindowMemory":
        new_messages = self.messages + (message,)
        # Trim from the front until we're within budget
        trimmed = self._trim_to_budget(new_messages)
        return TokenWindowMemory(
            messages=trimmed,
            max_tokens=self.max_tokens,
        )

    def _trim_to_budget(self, messages: tuple[dict, ...]) -> tuple[dict, ...]:
        total = sum(count_tokens(m.get("content", "")) for m in messages)
        result = list(messages)
        while total > self.max_tokens and len(result) > 1:
            removed = result.pop(0)
            total -= count_tokens(removed.get("content", ""))
        return tuple(result)

    def get_messages(self) -> list[dict]:
        return list(self.messages)
```

### Summary + Recent Hybrid

The most common production pattern: summarize old messages, keep recent ones verbatim.

```
+------------------------------------------------------------+
|                    SHORT-TERM MEMORY                        |
+------------------------------------------------------------+
|                                                             |
|  [Summary of turns 1-45]                                   |
|  "User is building a FastAPI service for order processing.  |
|   We set up the project, defined Order and LineItem models, |
|   created CRUD endpoints, and added JWT auth..."            |
|                                                             |
|  --- summary boundary ---                                   |
|                                                             |
|  Turn 46: User: "Now let's add pagination to GET /orders"  |
|  Turn 47: Assistant: "I'll add offset/limit parameters..."  |
|  Turn 48: User: "Use cursor-based pagination instead"       |
|  Turn 49: Assistant: [current response]                     |
|                                                             |
+------------------------------------------------------------+
```

```python
@dataclass(frozen=True)
class HybridShortTermMemory:
    """Summary of old messages + full recent messages."""
    summary: str
    recent_messages: tuple[dict, ...]
    summarized_count: int
    max_recent_tokens: int = 10_000
    summary_threshold: int = 8_000

    async def add_message(
        self, message: dict, llm_client
    ) -> "HybridShortTermMemory":
        new_recent = self.recent_messages + (message,)
        recent_tokens = sum(
            count_tokens(m.get("content", ""))
            for m in new_recent
        )

        # If recent messages exceed threshold, summarize older half
        if recent_tokens > self.max_recent_tokens:
            split = len(new_recent) // 2
            to_summarize = new_recent[:split]
            remaining = new_recent[split:]

            new_summary_part = await compress_conversation(
                list(to_summarize), llm_client
            )
            updated_summary = (
                f"{self.summary}\n\n{new_summary_part['content']}"
                if self.summary
                else new_summary_part["content"]
            )

            # Compress the summary itself if it's getting long
            if count_tokens(updated_summary) > self.summary_threshold:
                meta_summary = await llm_client.complete(
                    system="Compress this summary, keeping key facts only.",
                    prompt=updated_summary,
                    max_tokens=self.summary_threshold // 2,
                )
                updated_summary = meta_summary

            return HybridShortTermMemory(
                summary=updated_summary,
                recent_messages=remaining,
                summarized_count=self.summarized_count + split,
                max_recent_tokens=self.max_recent_tokens,
                summary_threshold=self.summary_threshold,
            )

        return HybridShortTermMemory(
            summary=self.summary,
            recent_messages=new_recent,
            summarized_count=self.summarized_count,
            max_recent_tokens=self.max_recent_tokens,
            summary_threshold=self.summary_threshold,
        )

    def build_context(self) -> list[dict]:
        context = []
        if self.summary:
            context.append({
                "role": "system",
                "content": (
                    f"[Summary of {self.summarized_count} earlier messages]\n"
                    f"{self.summary}"
                ),
            })
        context.extend(list(self.recent_messages))
        return context
```

### Message Pruning Strategies

Not all messages are equal. Prune strategically:

| Strategy                     | What to Prune                         | Risk   |
| ---------------------------- | ------------------------------------- | ------ |
| Remove system/debug messages | Internal tool logs                    | Low    |
| Collapse tool call chains    | Keep result, drop intermediate calls  | Medium |
| Deduplicate                  | Remove repeated attempts at same task | Low    |
| Remove superseded info       | Old values replaced by new ones       | Medium |
| Drop small talk              | Greetings, acknowledgments            | Low    |

```python
def prune_messages(messages: list[dict]) -> list[dict]:
    """Remove low-value messages to save context space."""
    pruned = []
    for msg in messages:
        content = msg.get("content", "")

        # Skip empty or trivial messages
        if not content or content.strip() in ("ok", "sure", "thanks", "got it"):
            continue

        # Collapse consecutive tool results into summaries
        if msg.get("role") == "tool" and pruned and pruned[-1].get("role") == "tool":
            pruned[-1] = {
                **pruned[-1],
                "content": pruned[-1]["content"] + "\n---\n" + content,
            }
            continue

        pruned.append(msg)

    return pruned
```

---

## 4. Long-Term Memory

Long-term memory persists **across sessions** and conversations. It stores knowledge the agent can retrieve when needed.

### Vector Store Memory

The most common pattern: embed text chunks and retrieve by semantic similarity.

```
Query: "How did we configure the database?"
   |
   v
+------------------+
| Embed Query      |  -->  [0.12, -0.34, 0.56, ...]
+------------------+
   |
   v
+------------------+       +-----------------------------+
| Vector Search    |  -->  | Top-K similar memories:     |
| (cosine sim)     |       | 1. "Set up PostgreSQL with  |
+------------------+       |    connection pooling..."    |
                           | 2. "Database schema uses     |
                           |    UUID primary keys..."     |
                           | 3. "Added pgvector extension |
                           |    for embeddings..."        |
                           +-----------------------------+
```

```python
from dataclasses import dataclass
import numpy as np
from datetime import datetime


@dataclass(frozen=True)
class MemoryEntry:
    """A single memory stored in the vector store."""
    id: str
    content: str
    embedding: tuple[float, ...]
    metadata: dict
    created_at: str
    access_count: int = 0
    last_accessed: str = ""


class VectorMemoryStore:
    """Long-term memory backed by vector similarity search."""

    def __init__(self, embedding_fn, similarity_threshold: float = 0.7):
        self._entries: dict[str, MemoryEntry] = {}
        self._embed = embedding_fn
        self._threshold = similarity_threshold

    async def store(self, content: str, metadata: dict | None = None) -> str:
        """Store a new memory. Returns the memory ID."""
        import uuid

        memory_id = str(uuid.uuid4())
        embedding = await self._embed(content)
        now = datetime.utcnow().isoformat()

        entry = MemoryEntry(
            id=memory_id,
            content=content,
            embedding=tuple(embedding),
            metadata=metadata or {},
            created_at=now,
            access_count=0,
            last_accessed=now,
        )
        self._entries[memory_id] = entry
        return memory_id

    async def retrieve(
        self, query: str, top_k: int = 5
    ) -> list[MemoryEntry]:
        """Retrieve the top-K most relevant memories."""
        query_embedding = np.array(await self._embed(query))

        scored = []
        for entry in self._entries.values():
            entry_embedding = np.array(entry.embedding)
            similarity = float(np.dot(query_embedding, entry_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(entry_embedding)
            ))
            if similarity >= self._threshold:
                scored.append((similarity, entry))

        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for _, entry in scored[:top_k]:
            # Update access metadata (create new entry, don't mutate)
            updated = MemoryEntry(
                id=entry.id,
                content=entry.content,
                embedding=entry.embedding,
                metadata=entry.metadata,
                created_at=entry.created_at,
                access_count=entry.access_count + 1,
                last_accessed=datetime.utcnow().isoformat(),
            )
            self._entries[entry.id] = updated
            results.append(updated)

        return results

    async def forget(self, memory_id: str) -> None:
        """Remove a memory by ID."""
        self._entries = {
            k: v for k, v in self._entries.items() if k != memory_id
        }
```

### Knowledge Graph Memory

For structured relationships between entities:

```
+----------+     works_at     +----------+
|  Alice   | --------------> | Acme Corp |
+----------+                  +----------+
     |                             |
     | knows                       | located_in
     v                             v
+----------+                  +----------+
|   Bob    |                  | New York |
+----------+                  +----------+
     |
     | prefers
     v
+----------+
|  Python  |
+----------+
```

```python
@dataclass(frozen=True)
class KnowledgeTriple:
    """A subject-predicate-object triple in the knowledge graph."""
    subject: str
    predicate: str
    obj: str
    confidence: float = 1.0
    source: str = ""
    timestamp: str = ""


class KnowledgeGraphMemory:
    """Memory as a graph of entity relationships."""

    def __init__(self):
        self._triples: list[KnowledgeTriple] = []

    def add_triple(
        self, subject: str, predicate: str, obj: str, **kwargs
    ) -> "KnowledgeGraphMemory":
        triple = KnowledgeTriple(
            subject=subject,
            predicate=predicate,
            obj=obj,
            timestamp=datetime.utcnow().isoformat(),
            **kwargs,
        )
        new_store = KnowledgeGraphMemory()
        new_store._triples = [*self._triples, triple]
        return new_store

    def query_subject(self, subject: str) -> list[KnowledgeTriple]:
        """Get all facts about a subject."""
        return [t for t in self._triples if t.subject.lower() == subject.lower()]

    def query_relation(
        self, subject: str, predicate: str
    ) -> list[KnowledgeTriple]:
        """Get specific relations for a subject."""
        return [
            t for t in self._triples
            if t.subject.lower() == subject.lower()
            and t.predicate.lower() == predicate.lower()
        ]

    def get_neighborhood(self, entity: str, depth: int = 2) -> list[KnowledgeTriple]:
        """Get all triples within N hops of an entity."""
        visited = set()
        frontier = {entity.lower()}
        result = []

        for _ in range(depth):
            next_frontier = set()
            for triple in self._triples:
                subj = triple.subject.lower()
                obj = triple.obj.lower()
                if subj in frontier and subj not in visited:
                    result.append(triple)
                    next_frontier.add(obj)
                if obj in frontier and obj not in visited:
                    result.append(triple)
                    next_frontier.add(subj)
            visited.update(frontier)
            frontier = next_frontier - visited

        return result

    def to_context_string(self, triples: list[KnowledgeTriple]) -> str:
        """Format triples for inclusion in a prompt."""
        lines = [f"- {t.subject} {t.predicate} {t.obj}" for t in triples]
        return "Known facts:\n" + "\n".join(lines)
```

### Persistent Memory Patterns

**Pattern 1: Automatic Memory Extraction**

After each interaction, extract facts worth remembering:

```python
MEMORY_EXTRACTION_PROMPT = """Analyze this conversation and extract facts
worth remembering for future interactions. Return a JSON list of memories.

Each memory should have:
- "content": the fact or information
- "type": one of "preference", "fact", "decision", "context"
- "importance": float 0-1

Conversation:
{conversation}

Only extract genuinely useful information. Do not extract trivial details."""


async def extract_memories(
    conversation: list[dict], llm_client
) -> list[dict]:
    formatted = "\n".join(
        f"{m['role']}: {m['content']}" for m in conversation
    )
    response = await llm_client.complete(
        system=MEMORY_EXTRACTION_PROMPT.format(conversation=formatted),
        prompt="Extract memories from the above conversation.",
    )
    return parse_json_list(response)
```

**Pattern 2: Memory Consolidation**

Periodically merge and deduplicate stored memories:

```python
async def consolidate_memories(
    memories: list[MemoryEntry], llm_client
) -> list[dict]:
    """Merge related memories, remove contradictions, update stale facts."""
    memory_text = "\n".join(
        f"[{m.created_at}] {m.content}" for m in memories
    )

    consolidated = await llm_client.complete(
        system=(
            "Review these memories. Merge duplicates, resolve contradictions "
            "(keep most recent), and produce a clean list. Return JSON."
        ),
        prompt=memory_text,
    )
    return parse_json_list(consolidated)
```

---

## 5. Working Memory

Working memory holds the **active reasoning state** -- what the agent is currently thinking about and working on. It is analogous to a human's mental workspace.

### Scratchpad Pattern

A dedicated space for intermediate calculations and reasoning:

```python
@dataclass(frozen=True)
class Scratchpad:
    """Working memory for intermediate reasoning state."""
    current_goal: str = ""
    sub_goals: tuple[str, ...] = ()
    observations: tuple[str, ...] = ()
    hypotheses: tuple[str, ...] = ()
    decisions: tuple[str, ...] = ()
    variables: dict = None  # Immutable via frozen -- assigned at creation

    def __post_init__(self):
        if self.variables is None:
            object.__setattr__(self, "variables", {})

    def with_goal(self, goal: str) -> "Scratchpad":
        return Scratchpad(
            current_goal=goal,
            sub_goals=self.sub_goals,
            observations=self.observations,
            hypotheses=self.hypotheses,
            decisions=self.decisions,
            variables=dict(self.variables),
        )

    def add_observation(self, observation: str) -> "Scratchpad":
        return Scratchpad(
            current_goal=self.current_goal,
            sub_goals=self.sub_goals,
            observations=(*self.observations, observation),
            hypotheses=self.hypotheses,
            decisions=self.decisions,
            variables=dict(self.variables),
        )

    def add_hypothesis(self, hypothesis: str) -> "Scratchpad":
        return Scratchpad(
            current_goal=self.current_goal,
            sub_goals=self.sub_goals,
            observations=self.observations,
            hypotheses=(*self.hypotheses, hypothesis),
            decisions=self.decisions,
            variables=dict(self.variables),
        )

    def set_variable(self, key: str, value) -> "Scratchpad":
        new_vars = {**self.variables, key: value}
        return Scratchpad(
            current_goal=self.current_goal,
            sub_goals=self.sub_goals,
            observations=self.observations,
            hypotheses=self.hypotheses,
            decisions=self.decisions,
            variables=new_vars,
        )

    def to_prompt_section(self) -> str:
        lines = ["## Working Memory (Scratchpad)"]
        if self.current_goal:
            lines.append(f"**Current Goal:** {self.current_goal}")
        if self.sub_goals:
            lines.append("**Sub-goals:**")
            lines.extend(f"  - {g}" for g in self.sub_goals)
        if self.observations:
            lines.append("**Observations:**")
            lines.extend(f"  - {o}" for o in self.observations)
        if self.hypotheses:
            lines.append("**Hypotheses:**")
            lines.extend(f"  - {h}" for h in self.hypotheses)
        if self.decisions:
            lines.append("**Decisions Made:**")
            lines.extend(f"  - {d}" for d in self.decisions)
        if self.variables:
            lines.append("**Variables:**")
            lines.extend(f"  - {k} = {v}" for k, v in self.variables.items())
        return "\n".join(lines)
```

### Agent Workspace

A more structured working memory for multi-step tasks:

```
+------------------------------------------------------------+
|                     AGENT WORKSPACE                         |
+------------------------------------------------------------+
|                                                             |
|  Task: "Migrate database from MySQL to PostgreSQL"          |
|                                                             |
|  Plan:                                                      |
|    [x] 1. Analyze current MySQL schema                      |
|    [x] 2. Generate PostgreSQL equivalent DDL                |
|    [ ] 3. Write data migration scripts        <-- CURRENT   |
|    [ ] 4. Update application connection config              |
|    [ ] 5. Run migration and verify                          |
|                                                             |
|  Findings:                                                  |
|    - 47 tables, 12 views, 8 stored procedures               |
|    - MySQL-specific: ENUM types, TINYINT booleans           |
|    - Foreign key naming conflicts in 3 tables               |
|                                                             |
|  Intermediate State:                                        |
|    - schema_analysis.json (saved)                           |
|    - postgres_ddl.sql (saved)                               |
|    - Current table being migrated: orders (23 of 47)        |
|                                                             |
+------------------------------------------------------------+
```

```python
from enum import Enum


class StepStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class PlanStep:
    description: str
    status: StepStatus = StepStatus.PENDING
    result: str = ""

    def with_status(self, status: StepStatus, result: str = "") -> "PlanStep":
        return PlanStep(
            description=self.description,
            status=status,
            result=result if result else self.result,
        )


@dataclass(frozen=True)
class AgentWorkspace:
    """Structured working memory for multi-step agent tasks."""
    task: str
    plan: tuple[PlanStep, ...]
    findings: tuple[str, ...]
    artifacts: dict  # name -> content or path
    current_step_index: int = 0

    def advance_step(self, result: str = "") -> "AgentWorkspace":
        updated_plan = list(self.plan)
        updated_plan[self.current_step_index] = updated_plan[
            self.current_step_index
        ].with_status(StepStatus.COMPLETED, result)

        next_index = self.current_step_index + 1
        if next_index < len(updated_plan):
            updated_plan[next_index] = updated_plan[next_index].with_status(
                StepStatus.IN_PROGRESS
            )

        return AgentWorkspace(
            task=self.task,
            plan=tuple(updated_plan),
            findings=self.findings,
            artifacts=dict(self.artifacts),
            current_step_index=next_index,
        )

    def add_finding(self, finding: str) -> "AgentWorkspace":
        return AgentWorkspace(
            task=self.task,
            plan=self.plan,
            findings=(*self.findings, finding),
            artifacts=dict(self.artifacts),
            current_step_index=self.current_step_index,
        )

    def save_artifact(self, name: str, content) -> "AgentWorkspace":
        return AgentWorkspace(
            task=self.task,
            plan=self.plan,
            findings=self.findings,
            artifacts={**self.artifacts, name: content},
            current_step_index=self.current_step_index,
        )

    def to_prompt_section(self) -> str:
        status_icons = {
            StepStatus.PENDING: "[ ]",
            StepStatus.IN_PROGRESS: "[>]",
            StepStatus.COMPLETED: "[x]",
            StepStatus.FAILED: "[!]",
            StepStatus.SKIPPED: "[-]",
        }
        lines = [
            "## Agent Workspace",
            f"**Task:** {self.task}",
            "",
            "**Plan:**",
        ]
        for i, step in enumerate(self.plan):
            icon = status_icons[step.status]
            marker = " <-- CURRENT" if i == self.current_step_index else ""
            lines.append(f"  {icon} {i + 1}. {step.description}{marker}")

        if self.findings:
            lines.append("\n**Key Findings:**")
            lines.extend(f"  - {f}" for f in self.findings)

        if self.artifacts:
            lines.append("\n**Artifacts:**")
            lines.extend(f"  - {name}" for name in self.artifacts)

        return "\n".join(lines)
```

---

## 6. Episodic Memory

Episodic memory stores **specific past experiences** -- what happened during previous tasks, what worked, and what failed. It enables the agent to learn from its own history.

### Episode Structure

```python
@dataclass(frozen=True)
class Episode:
    """A record of a past agent experience."""
    id: str
    task: str
    approach: str
    outcome: str
    success: bool
    key_learnings: tuple[str, ...]
    tools_used: tuple[str, ...]
    error_encountered: str = ""
    duration_seconds: float = 0.0
    timestamp: str = ""
    tags: tuple[str, ...] = ()


class EpisodicMemory:
    """Store and retrieve past agent experiences."""

    def __init__(self, vector_store: VectorMemoryStore):
        self._vector_store = vector_store
        self._episodes: dict[str, Episode] = {}

    async def record_episode(self, episode: Episode) -> str:
        """Store an episode for future retrieval."""
        # Create a searchable text representation
        episode_text = (
            f"Task: {episode.task}\n"
            f"Approach: {episode.approach}\n"
            f"Outcome: {episode.outcome}\n"
            f"Success: {episode.success}\n"
            f"Learnings: {'; '.join(episode.key_learnings)}"
        )

        memory_id = await self._vector_store.store(
            content=episode_text,
            metadata={
                "type": "episode",
                "episode_id": episode.id,
                "success": episode.success,
                "tags": list(episode.tags),
            },
        )
        self._episodes[episode.id] = episode
        return memory_id

    async def recall_similar_experiences(
        self, current_task: str, top_k: int = 3
    ) -> list[Episode]:
        """Find past episodes relevant to the current task."""
        memories = await self._vector_store.retrieve(
            query=f"Task: {current_task}",
            top_k=top_k,
        )

        episodes = []
        for mem in memories:
            episode_id = mem.metadata.get("episode_id")
            if episode_id and episode_id in self._episodes:
                episodes.append(self._episodes[episode_id])

        return episodes

    async def recall_failures(
        self, current_task: str, top_k: int = 3
    ) -> list[Episode]:
        """Specifically recall past failures to avoid repeating mistakes."""
        similar = await self.recall_similar_experiences(current_task, top_k=10)
        failures = [ep for ep in similar if not ep.success]
        return failures[:top_k]

    def format_for_prompt(self, episodes: list[Episode]) -> str:
        if not episodes:
            return ""

        lines = ["## Relevant Past Experiences"]
        for ep in episodes:
            status = "SUCCESS" if ep.success else "FAILURE"
            lines.append(f"\n### [{status}] {ep.task}")
            lines.append(f"**Approach:** {ep.approach}")
            lines.append(f"**Outcome:** {ep.outcome}")
            if ep.key_learnings:
                lines.append("**Learnings:**")
                lines.extend(f"  - {l}" for l in ep.key_learnings)
            if ep.error_encountered:
                lines.append(f"**Error:** {ep.error_encountered}")

        return "\n".join(lines)
```

### Experience-Based Learning

Use episodic memory to adjust agent behavior:

```python
async def plan_with_experience(
    task: str,
    episodic_memory: EpisodicMemory,
    llm_client,
) -> str:
    """Generate a plan informed by past successes and failures."""
    successes = await episodic_memory.recall_similar_experiences(task, top_k=3)
    failures = await episodic_memory.recall_failures(task, top_k=3)

    experience_context = ""
    if successes:
        experience_context += "\n## Past Successes (approaches that worked)\n"
        for ep in successes:
            if ep.success:
                experience_context += f"- {ep.task}: {ep.approach}\n"

    if failures:
        experience_context += "\n## Past Failures (approaches to AVOID)\n"
        for ep in failures:
            experience_context += (
                f"- {ep.task}: {ep.approach} -- FAILED because: "
                f"{ep.error_encountered}\n"
            )

    plan = await llm_client.complete(
        system=(
            "You are a planning agent. Create a step-by-step plan for the "
            "given task. Learn from past experiences provided below."
            f"{experience_context}"
        ),
        prompt=f"Create a plan for: {task}",
    )

    return plan
```

---

## 7. Semantic Memory

Semantic memory stores **general knowledge and facts** -- not tied to specific episodes, but representing the agent's understanding of the world.

### Embedding-Based Retrieval

```
User query: "What authentication methods does our API support?"
                    |
                    v
            +---------------+
            | Embed query   |
            +-------+-------+
                    |
                    v
    +-------------------------------+
    | Search semantic memory        |
    | (vector similarity)           |
    +-------------------------------+
                    |
          +---------+---------+
          |                   |
          v                   v
+-------------------+ +-------------------+
| "API supports     | | "JWT tokens are   |
|  JWT, OAuth 2.0,  | |  configured with  |
|  and API keys"    | |  RS256 algorithm" |
+-------------------+ +-------------------+
```

```python
class SemanticMemory:
    """Fact-based memory with embedding retrieval and categorization."""

    def __init__(self, embedding_fn, categories: list[str] | None = None):
        self._embedding_fn = embedding_fn
        self._categories = categories or [
            "technical", "business", "personal", "procedural",
        ]
        # Separate vector store per category for efficient retrieval
        self._stores: dict[str, VectorMemoryStore] = {
            cat: VectorMemoryStore(embedding_fn)
            for cat in self._categories
        }
        self._global_store = VectorMemoryStore(embedding_fn)

    async def learn_fact(
        self,
        fact: str,
        category: str = "technical",
        metadata: dict | None = None,
    ) -> str:
        """Store a new fact in semantic memory."""
        meta = {**(metadata or {}), "category": category, "type": "fact"}

        # Store in category-specific and global store
        memory_id = await self._global_store.store(fact, meta)
        if category in self._stores:
            await self._stores[category].store(fact, meta)

        return memory_id

    async def recall(
        self,
        query: str,
        category: str | None = None,
        top_k: int = 5,
    ) -> list[MemoryEntry]:
        """Retrieve relevant facts."""
        if category and category in self._stores:
            return await self._stores[category].retrieve(query, top_k)
        return await self._global_store.retrieve(query, top_k)

    async def batch_learn(
        self,
        document: str,
        chunk_size: int = 500,
        overlap: int = 50,
    ) -> list[str]:
        """Ingest a document by chunking and storing each chunk."""
        chunks = self._chunk_text(document, chunk_size, overlap)
        ids = []
        for chunk in chunks:
            memory_id = await self.learn_fact(chunk)
            ids.append(memory_id)
        return ids

    @staticmethod
    def _chunk_text(
        text: str, chunk_size: int, overlap: int
    ) -> list[str]:
        words = text.split()
        chunks = []
        start = 0
        while start < len(words):
            end = start + chunk_size
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            start = end - overlap
        return chunks
```

### Combining Retrieval Strategies

In practice, you often want to combine keyword search, vector search, and graph lookup:

```python
async def hybrid_recall(
    query: str,
    semantic_memory: SemanticMemory,
    knowledge_graph: KnowledgeGraphMemory,
    keyword_index: dict[str, list[str]],
    top_k: int = 5,
) -> list[str]:
    """Combine multiple retrieval strategies for better recall."""

    # 1. Vector similarity search
    vector_results = await semantic_memory.recall(query, top_k=top_k)
    vector_texts = [r.content for r in vector_results]

    # 2. Knowledge graph lookup
    entities = extract_entities(query)  # NER or keyword extraction
    graph_results = []
    for entity in entities:
        triples = knowledge_graph.query_subject(entity)
        graph_results.extend(
            f"{t.subject} {t.predicate} {t.obj}" for t in triples
        )

    # 3. Keyword search (BM25 or simple inverted index)
    keywords = extract_keywords(query)
    keyword_results = []
    for kw in keywords:
        keyword_results.extend(keyword_index.get(kw.lower(), []))

    # Merge and deduplicate, preserving order
    seen = set()
    merged = []
    for text in vector_texts + graph_results + keyword_results:
        if text not in seen:
            seen.add(text)
            merged.append(text)

    return merged[:top_k]
```

---

## 8. Procedural Memory

Procedural memory captures **how to do things** -- learned skills, tool usage patterns, and successful strategies that the agent can reuse.

### Few-Shot Example Store

````python
@dataclass(frozen=True)
class ToolExample:
    """A successful example of tool usage."""
    tool_name: str
    task_description: str
    input_params: dict
    output: str
    context: str = ""
    success: bool = True


class ProceduralMemory:
    """Memory for learned skills and tool usage patterns."""

    def __init__(self, embedding_fn):
        self._examples: list[ToolExample] = []
        self._vector_store = VectorMemoryStore(embedding_fn)
        self._skill_registry: dict[str, str] = {}  # skill_name -> description

    async def record_tool_usage(self, example: ToolExample) -> None:
        """Record a successful tool invocation as a reusable example."""
        if not example.success:
            return  # Only remember successes for procedural memory

        self._examples.append(example)
        await self._vector_store.store(
            content=(
                f"Tool: {example.tool_name}\n"
                f"Task: {example.task_description}\n"
                f"Input: {example.input_params}\n"
                f"Output: {example.output}"
            ),
            metadata={"tool": example.tool_name, "type": "procedure"},
        )

    async def get_relevant_examples(
        self, task: str, tool_name: str | None = None, top_k: int = 3,
    ) -> list[ToolExample]:
        """Retrieve few-shot examples relevant to the current task."""
        query = f"Task: {task}"
        if tool_name:
            query += f" Tool: {tool_name}"

        results = await self._vector_store.retrieve(query, top_k=top_k)

        # Match results back to examples
        relevant = []
        for result in results:
            for ex in self._examples:
                if (
                    ex.tool_name == result.metadata.get("tool")
                    and ex.task_description in result.content
                ):
                    relevant.append(ex)
                    break

        return relevant[:top_k]

    def register_skill(self, name: str, description: str) -> None:
        self._skill_registry = {**self._skill_registry, name: description}

    def format_examples_for_prompt(self, examples: list[ToolExample]) -> str:
        if not examples:
            return ""

        lines = ["## Relevant Tool Usage Examples"]
        for i, ex in enumerate(examples, 1):
            lines.append(f"\n### Example {i}: {ex.task_description}")
            lines.append(f"**Tool:** {ex.tool_name}")
            lines.append(f"**Input:** ```{ex.input_params}```")
            lines.append(f"**Output:** ```{ex.output}```")

        return "\n".join(lines)
````

### Skill Composition

Agents can learn to chain tools for complex tasks:

```python
@dataclass(frozen=True)
class LearnedProcedure:
    """A multi-step procedure the agent has learned."""
    name: str
    description: str
    steps: tuple[dict, ...]  # Each dict: {"tool": str, "template": str}
    success_rate: float = 1.0
    times_used: int = 0

    def with_usage_recorded(self, success: bool) -> "LearnedProcedure":
        new_count = self.times_used + 1
        new_rate = (
            (self.success_rate * self.times_used + (1.0 if success else 0.0))
            / new_count
        )
        return LearnedProcedure(
            name=self.name,
            description=self.description,
            steps=self.steps,
            success_rate=new_rate,
            times_used=new_count,
        )


# Example learned procedure:
deploy_procedure = LearnedProcedure(
    name="deploy_to_production",
    description="Deploy a Python service to production via Docker",
    steps=(
        {"tool": "bash", "template": "python -m pytest tests/"},
        {"tool": "bash", "template": "docker build -t {image_name} ."},
        {"tool": "bash", "template": "docker push {image_name}"},
        {"tool": "bash", "template": "kubectl rollout restart deployment/{service}"},
        {"tool": "bash", "template": "kubectl rollout status deployment/{service}"},
    ),
)
```

---

## 9. Memory Architectures

### MemGPT Architecture

MemGPT (Memory-GPT) treats the context window like an operating system manages virtual memory, paging information in and out as needed.

```
+------------------------------------------------------------+
|                     MemGPT Architecture                     |
+------------------------------------------------------------+
|                                                             |
|  +------------------------------------------------------+  |
|  |              MAIN CONTEXT (in LLM window)             |  |
|  |                                                       |  |
|  |  System Prompt    |  Working Context  |  Recent Msgs  |  |
|  |  (fixed)          |  (managed)        |  (sliding)    |  |
|  +------------------------------------------------------+  |
|           |                    ^                    |        |
|           |    page in         |    page out        |        |
|           v                    |                    v        |
|  +------------------------------------------------------+  |
|  |              EXTERNAL MEMORY (outside LLM)            |  |
|  |                                                       |  |
|  |  +-------------+  +-------------+  +--------------+  |  |
|  |  | Archival    |  | Recall      |  | Core Memory  |  |  |
|  |  | Memory      |  | Storage     |  | (editable    |  |  |
|  |  | (vector DB) |  | (full chat  |  |  persona &   |  |  |
|  |  |             |  |  history)   |  |  user info)  |  |  |
|  |  +-------------+  +-------------+  +--------------+  |  |
|  +------------------------------------------------------+  |
|                                                             |
|  The LLM decides WHEN to page memory in/out via            |
|  special function calls:                                    |
|    - archival_memory_insert(content)                        |
|    - archival_memory_search(query)                          |
|    - core_memory_replace(old, new)                          |
|    - conversation_search(query)                             |
+------------------------------------------------------------+
```

Key insight: The LLM itself manages memory through tool calls, deciding what to store and retrieve.

```python
class MemGPTStyleMemory:
    """Memory system inspired by MemGPT where the LLM manages its own memory."""

    def __init__(self, embedding_fn):
        # Core memory: always in context, editable by the LLM
        self._core_memory = {
            "persona": "I am a helpful AI assistant.",
            "user_info": "",
            "task_context": "",
        }

        # Archival memory: large, searchable store
        self._archival = VectorMemoryStore(embedding_fn)

        # Recall storage: full conversation history
        self._recall: list[dict] = []

    def get_memory_tools(self) -> list[dict]:
        """Return tool definitions the LLM can call to manage memory."""
        return [
            {
                "name": "core_memory_replace",
                "description": "Replace a section of core memory (always visible).",
                "parameters": {
                    "section": {"type": "string", "enum": list(self._core_memory.keys())},
                    "old_content": {"type": "string"},
                    "new_content": {"type": "string"},
                },
            },
            {
                "name": "archival_memory_insert",
                "description": "Save important information to long-term archival memory.",
                "parameters": {
                    "content": {"type": "string"},
                },
            },
            {
                "name": "archival_memory_search",
                "description": "Search archival memory for relevant information.",
                "parameters": {
                    "query": {"type": "string"},
                    "top_k": {"type": "integer", "default": 5},
                },
            },
            {
                "name": "conversation_search",
                "description": "Search past conversation history.",
                "parameters": {
                    "query": {"type": "string"},
                },
            },
        ]

    async def handle_memory_tool_call(
        self, tool_name: str, params: dict
    ) -> str:
        if tool_name == "core_memory_replace":
            section = params["section"]
            old = params["old_content"]
            new = params["new_content"]
            current = self._core_memory.get(section, "")
            self._core_memory = {
                **self._core_memory,
                section: current.replace(old, new) if old else new,
            }
            return f"Core memory section '{section}' updated."

        elif tool_name == "archival_memory_insert":
            await self._archival.store(params["content"])
            return "Saved to archival memory."

        elif tool_name == "archival_memory_search":
            results = await self._archival.retrieve(
                params["query"], top_k=params.get("top_k", 5)
            )
            return "\n".join(r.content for r in results) or "No results found."

        elif tool_name == "conversation_search":
            query = params["query"].lower()
            matches = [
                m for m in self._recall
                if query in m.get("content", "").lower()
            ]
            return "\n".join(
                f"{m['role']}: {m['content']}" for m in matches[-10:]
            ) or "No matching messages found."

        return f"Unknown memory tool: {tool_name}"

    def build_system_context(self) -> str:
        """Build the core memory section for the system prompt."""
        lines = ["## Core Memory (always visible, editable)"]
        for section, content in self._core_memory.items():
            lines.append(f"\n### {section}")
            lines.append(content if content else "(empty)")
        return "\n".join(lines)
```

### Retrieval-Augmented Memory (RAM)

Combines RAG (Retrieval-Augmented Generation) with memory management:

```
+------------------------------------------------------------+
|              Retrieval-Augmented Memory (RAM)                |
+------------------------------------------------------------+
|                                                             |
|  User Query                                                 |
|      |                                                      |
|      v                                                      |
|  +------------------+                                       |
|  | Query Analyzer   |   Determine what to retrieve:         |
|  | (classify need)  |   - recent context?                   |
|  +------------------+   - domain knowledge?                  |
|      |                  - past experience?                   |
|      |                  - user preferences?                  |
|      v                                                      |
|  +------------------+    +------------------+               |
|  | Memory Router    |--->| Short-term store |               |
|  |                  |--->| Long-term store  |               |
|  |                  |--->| Episodic store   |               |
|  |                  |--->| Semantic store   |               |
|  +------------------+    +------------------+               |
|      |                                                      |
|      v                                                      |
|  +------------------+                                       |
|  | Context Assembler|   Merge, deduplicate, rank, and      |
|  | (fit to budget)  |   fit retrieved content into the     |
|  +------------------+   context window budget.             |
|      |                                                      |
|      v                                                      |
|  [  System Prompt + Retrieved Context + Recent Msgs  ]      |
|                      |                                      |
|                      v                                      |
|                   [ LLM ]                                   |
|                      |                                      |
|                      v                                      |
|                   Response                                  |
|                      |                                      |
|                      v                                      |
|  +------------------+                                       |
|  | Memory Writer    |   Extract and store new memories      |
|  +------------------+   from the interaction.               |
|                                                             |
+------------------------------------------------------------+
```

```python
class RetrievalAugmentedMemory:
    """Unified memory system that routes queries to appropriate stores."""

    def __init__(
        self,
        short_term: HybridShortTermMemory,
        semantic: SemanticMemory,
        episodic: EpisodicMemory,
        procedural: ProceduralMemory,
        token_budget: TokenBudget,
    ):
        self._short_term = short_term
        self._semantic = semantic
        self._episodic = episodic
        self._procedural = procedural
        self._budget = token_budget

    async def build_context(
        self, query: str, llm_client
    ) -> list[dict]:
        """Assemble the full context for an LLM call."""
        context_parts = []

        # 1. Always include short-term memory
        context_parts.extend(self._short_term.build_context())

        # 2. Retrieve relevant semantic knowledge
        facts = await self._semantic.recall(query, top_k=5)
        if facts:
            fact_text = "\n".join(f"- {f.content}" for f in facts)
            context_parts.append({
                "role": "system",
                "content": f"## Relevant Knowledge\n{fact_text}",
            })

        # 3. Retrieve relevant past experiences
        episodes = await self._episodic.recall_similar_experiences(query)
        if episodes:
            ep_text = self._episodic.format_for_prompt(episodes)
            context_parts.append({
                "role": "system",
                "content": ep_text,
            })

        # 4. Retrieve procedural examples
        examples = await self._procedural.get_relevant_examples(query)
        if examples:
            ex_text = self._procedural.format_examples_for_prompt(examples)
            context_parts.append({
                "role": "system",
                "content": ex_text,
            })

        # 5. Fit to budget
        context_parts = self._fit_to_budget(context_parts)

        return context_parts

    def _fit_to_budget(self, parts: list[dict]) -> list[dict]:
        """Trim context parts to fit within the token budget."""
        available = (
            self._budget.retrieved_knowledge
            + self._budget.conversation_summary
            + self._budget.recent_messages
        )

        result = []
        used = 0
        for part in parts:
            tokens = count_tokens(part.get("content", ""))
            if used + tokens <= available:
                result.append(part)
                used += tokens
            else:
                # Truncate this part to fit
                remaining = available - used
                if remaining > 100:  # Only include if meaningful
                    truncated_content = truncate_to_tokens(
                        part["content"], remaining
                    )
                    result.append({**part, "content": truncated_content})
                break

        return result
```

### Hierarchical Memory

Organize memories at multiple levels of abstraction:

```
+------------------------------------------------------------+
|                    HIERARCHICAL MEMORY                       |
+------------------------------------------------------------+
|                                                             |
|  Level 3 (most abstract):                                   |
|  +------------------------------------------------------+  |
|  | "I have been helping the user build a web app using   |  |
|  |  Next.js with authentication and a PostgreSQL DB."    |  |
|  +------------------------------------------------------+  |
|                          |                                  |
|  Level 2 (session-level):                                   |
|  +------------------+  +------------------+  +----------+  |
|  | Session 1:       |  | Session 2:       |  | Session 3|  |
|  | Set up project,  |  | Added auth with  |  | Current  |  |
|  | DB schema,       |  | NextAuth, fixed  |  | session  |  |
|  | basic CRUD API   |  | CORS issues      |  |          |  |
|  +------------------+  +------------------+  +----------+  |
|                          |                                  |
|  Level 1 (task-level):                                      |
|  +--------+  +--------+  +--------+  +--------+            |
|  | Schema |  | CRUD   |  | Auth   |  | CORS   |            |
|  | design |  | routes |  | setup  |  | fix    |            |
|  +--------+  +--------+  +--------+  +--------+            |
|                          |                                  |
|  Level 0 (raw):                                             |
|  Full conversation messages, tool calls, outputs            |
+------------------------------------------------------------+
```

```python
@dataclass(frozen=True)
class MemoryNode:
    """A node in the hierarchical memory tree."""
    id: str
    level: int  # 0 = raw, 1 = task, 2 = session, 3 = project
    content: str
    children: tuple[str, ...] = ()  # child node IDs
    parent: str = ""  # parent node ID
    timestamp: str = ""


class HierarchicalMemory:
    """Multi-level memory with automatic summarization upward."""

    def __init__(self, llm_client):
        self._nodes: dict[str, MemoryNode] = {}
        self._llm = llm_client

    async def add_raw_memory(
        self, content: str, parent_task_id: str = ""
    ) -> str:
        import uuid
        node_id = str(uuid.uuid4())
        node = MemoryNode(
            id=node_id,
            level=0,
            content=content,
            parent=parent_task_id,
            timestamp=datetime.utcnow().isoformat(),
        )
        self._nodes[node_id] = node

        # Update parent's children
        if parent_task_id and parent_task_id in self._nodes:
            parent = self._nodes[parent_task_id]
            self._nodes[parent_task_id] = MemoryNode(
                id=parent.id,
                level=parent.level,
                content=parent.content,
                children=(*parent.children, node_id),
                parent=parent.parent,
                timestamp=parent.timestamp,
            )

        return node_id

    async def summarize_up(self, node_id: str) -> None:
        """Summarize a node's children and propagate up the tree."""
        node = self._nodes.get(node_id)
        if not node or not node.children:
            return

        child_texts = []
        for child_id in node.children:
            child = self._nodes.get(child_id)
            if child:
                child_texts.append(child.content)

        summary = await self._llm.complete(
            system="Summarize these related memories into a single coherent summary.",
            prompt="\n---\n".join(child_texts),
        )

        self._nodes[node_id] = MemoryNode(
            id=node.id,
            level=node.level,
            content=summary,
            children=node.children,
            parent=node.parent,
            timestamp=node.timestamp,
        )

        # Recursively summarize parent
        if node.parent:
            await self.summarize_up(node.parent)

    def get_context_at_level(self, level: int) -> list[str]:
        """Get all memories at a specific abstraction level."""
        return [
            node.content
            for node in self._nodes.values()
            if node.level == level
        ]
```

---

## 10. State Persistence

Agents need to survive restarts, crashes, and session boundaries. State persistence makes this possible.

### Checkpointing

```python
import json
from pathlib import Path


@dataclass(frozen=True)
class AgentCheckpoint:
    """Complete snapshot of agent state at a point in time."""
    checkpoint_id: str
    timestamp: str
    conversation_history: tuple[dict, ...]
    working_memory: dict
    task_state: dict
    memory_store_snapshot: dict
    metadata: dict


class CheckpointManager:
    """Save and restore agent state."""

    def __init__(self, storage_dir: str):
        self._storage_dir = Path(storage_dir)
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def save_checkpoint(self, checkpoint: AgentCheckpoint) -> str:
        """Persist agent state to disk."""
        path = self._storage_dir / f"{checkpoint.checkpoint_id}.json"
        data = {
            "checkpoint_id": checkpoint.checkpoint_id,
            "timestamp": checkpoint.timestamp,
            "conversation_history": list(checkpoint.conversation_history),
            "working_memory": checkpoint.working_memory,
            "task_state": checkpoint.task_state,
            "memory_store_snapshot": checkpoint.memory_store_snapshot,
            "metadata": checkpoint.metadata,
        }
        path.write_text(json.dumps(data, indent=2, default=str))
        return str(path)

    def load_checkpoint(self, checkpoint_id: str) -> AgentCheckpoint:
        """Restore agent state from disk."""
        path = self._storage_dir / f"{checkpoint_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_id}")

        data = json.loads(path.read_text())
        return AgentCheckpoint(
            checkpoint_id=data["checkpoint_id"],
            timestamp=data["timestamp"],
            conversation_history=tuple(data["conversation_history"]),
            working_memory=data["working_memory"],
            task_state=data["task_state"],
            memory_store_snapshot=data["memory_store_snapshot"],
            metadata=data["metadata"],
        )

    def list_checkpoints(self) -> list[str]:
        """List all available checkpoint IDs."""
        return sorted(
            p.stem for p in self._storage_dir.glob("*.json")
        )

    def get_latest_checkpoint(self) -> AgentCheckpoint | None:
        """Load the most recent checkpoint."""
        checkpoints = self.list_checkpoints()
        if not checkpoints:
            return None
        return self.load_checkpoint(checkpoints[-1])
```

### Serializable Agent State

```python
class ResumableAgent:
    """An agent that can be paused and resumed."""

    def __init__(
        self,
        llm_client,
        checkpoint_manager: CheckpointManager,
        memory: RetrievalAugmentedMemory,
    ):
        self._llm = llm_client
        self._checkpoints = checkpoint_manager
        self._memory = memory
        self._workspace = AgentWorkspace(
            task="",
            plan=(),
            findings=(),
            artifacts={},
        )

    async def resume_from_checkpoint(
        self, checkpoint_id: str | None = None
    ) -> None:
        """Resume agent from a saved checkpoint."""
        if checkpoint_id:
            checkpoint = self._checkpoints.load_checkpoint(checkpoint_id)
        else:
            checkpoint = self._checkpoints.get_latest_checkpoint()
            if not checkpoint:
                return  # Fresh start

        # Restore state
        self._workspace = AgentWorkspace(
            task=checkpoint.task_state.get("task", ""),
            plan=tuple(
                PlanStep(**step)
                for step in checkpoint.task_state.get("plan", [])
            ),
            findings=tuple(checkpoint.task_state.get("findings", [])),
            artifacts=checkpoint.task_state.get("artifacts", {}),
            current_step_index=checkpoint.task_state.get("current_step", 0),
        )

    async def save_state(self) -> str:
        """Save current agent state as a checkpoint."""
        import uuid

        checkpoint = AgentCheckpoint(
            checkpoint_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow().isoformat(),
            conversation_history=(),  # Populated from short-term memory
            working_memory={
                "workspace": self._workspace.to_prompt_section(),
            },
            task_state={
                "task": self._workspace.task,
                "plan": [
                    {
                        "description": s.description,
                        "status": s.status.value,
                        "result": s.result,
                    }
                    for s in self._workspace.plan
                ],
                "findings": list(self._workspace.findings),
                "artifacts": self._workspace.artifacts,
                "current_step": self._workspace.current_step_index,
            },
            memory_store_snapshot={},
            metadata={"agent_version": "1.0"},
        )

        return self._checkpoints.save_checkpoint(checkpoint)

    async def run_step(self) -> str:
        """Execute the next step and auto-checkpoint."""
        try:
            result = await self._execute_current_step()
            self._workspace = self._workspace.advance_step(result)
            await self.save_state()  # Auto-checkpoint after each step
            return result
        except Exception as e:
            await self.save_state()  # Checkpoint even on failure
            raise

    async def _execute_current_step(self) -> str:
        step = self._workspace.plan[self._workspace.current_step_index]
        # ... execute step using LLM and tools ...
        return f"Completed: {step.description}"
```

### Event Sourcing for Agent State

Instead of saving snapshots, record every state change as an event:

```python
@dataclass(frozen=True)
class StateEvent:
    """An immutable record of a state change."""
    event_id: str
    timestamp: str
    event_type: str  # "message", "tool_call", "memory_update", "plan_change"
    payload: dict


class EventSourcedState:
    """Reconstruct agent state by replaying events."""

    def __init__(self):
        self._events: list[StateEvent] = []

    def append_event(self, event: StateEvent) -> None:
        self._events.append(event)

    def replay_to(self, event_id: str | None = None) -> dict:
        """Rebuild state by replaying events up to a given point."""
        state = {
            "messages": [],
            "memory_updates": [],
            "plan": [],
            "artifacts": {},
        }

        for event in self._events:
            if event.event_type == "message":
                state["messages"].append(event.payload)
            elif event.event_type == "memory_update":
                state["memory_updates"].append(event.payload)
            elif event.event_type == "plan_change":
                state["plan"] = event.payload.get("plan", state["plan"])
            elif event.event_type == "artifact_saved":
                state["artifacts"] = {
                    **state["artifacts"],
                    event.payload["name"]: event.payload["content"],
                }

            if event_id and event.event_id == event_id:
                break

        return state

    def get_events_since(self, timestamp: str) -> list[StateEvent]:
        return [e for e in self._events if e.timestamp > timestamp]

    def persist(self, path: str) -> None:
        data = [
            {
                "event_id": e.event_id,
                "timestamp": e.timestamp,
                "event_type": e.event_type,
                "payload": e.payload,
            }
            for e in self._events
        ]
        Path(path).write_text(json.dumps(data, indent=2, default=str))
```

---

## 11. Context Window Optimization

Deciding what to keep, summarize, or discard is the core skill of memory management.

### Decision Framework

```
For each piece of information, ask:

  1. Is it needed for the CURRENT task?
     YES --> Keep at full fidelity
     NO  --> Go to 2

  2. Might it be needed in the NEXT few turns?
     YES --> Keep, but consider summarizing
     NO  --> Go to 3

  3. Is it a permanent fact or preference?
     YES --> Store in long-term memory, remove from context
     NO  --> Go to 4

  4. Is it a learning or pattern?
     YES --> Store in episodic/procedural memory, remove from context
     NO  --> Discard
```

### Priority-Based Retention

```python
from enum import IntEnum


class RetentionPriority(IntEnum):
    CRITICAL = 4     # System prompt, current task, active plan
    HIGH = 3         # Recent tool results, user corrections, decisions
    MEDIUM = 2       # Earlier conversation context, related knowledge
    LOW = 1          # Background info, completed sub-tasks
    DISPOSABLE = 0   # Greetings, acknowledgments, superseded info


def assign_retention_priority(message: dict, workspace: AgentWorkspace) -> int:
    """Assign a retention priority to a message."""
    content = message.get("content", "")
    role = message.get("role", "")

    # System instructions are always critical
    if role == "system" and "instruction" in content.lower():
        return RetentionPriority.CRITICAL

    # Current task context
    if workspace.task and workspace.task.lower() in content.lower():
        return RetentionPriority.HIGH

    # Tool errors (we need to remember what went wrong)
    if role == "tool" and "error" in content.lower():
        return RetentionPriority.HIGH

    # User corrections or explicit preferences
    correction_signals = ["actually", "no,", "instead", "I meant", "change"]
    if role == "user" and any(s in content.lower() for s in correction_signals):
        return RetentionPriority.HIGH

    # General tool results
    if role == "tool":
        return RetentionPriority.MEDIUM

    # Acknowledgments and small talk
    trivial = ["ok", "sure", "thanks", "got it", "sounds good"]
    if content.strip().lower() in trivial:
        return RetentionPriority.DISPOSABLE

    return RetentionPriority.MEDIUM


def optimize_context(
    messages: list[dict],
    workspace: AgentWorkspace,
    max_tokens: int,
) -> list[dict]:
    """Keep messages within token budget using priority-based retention."""
    # Score each message
    scored = [
        (assign_retention_priority(m, workspace), i, m)
        for i, m in enumerate(messages)
    ]

    # Always keep CRITICAL messages
    critical = [(p, i, m) for p, i, m in scored if p == RetentionPriority.CRITICAL]
    remaining_budget = max_tokens - sum(
        count_tokens(m.get("content", "")) for _, _, m in critical
    )

    # Fill remaining budget by priority (ties broken by recency)
    non_critical = sorted(
        [(p, i, m) for p, i, m in scored if p < RetentionPriority.CRITICAL],
        key=lambda x: (x[0], x[1]),  # priority desc, then position
        reverse=True,
    )

    kept = list(critical)
    for priority, idx, msg in non_critical:
        tokens = count_tokens(msg.get("content", ""))
        if tokens <= remaining_budget:
            kept.append((priority, idx, msg))
            remaining_budget -= tokens

    # Restore original order
    kept.sort(key=lambda x: x[1])
    return [m for _, _, m in kept]
```

### The "Lost in the Middle" Problem

Research shows that LLMs pay more attention to the beginning and end of their context. Place important information strategically:

```
+------------------------------------------------------------+
|                  CONTEXT WINDOW LAYOUT                       |
+------------------------------------------------------------+
|                                                             |
|  [HIGH ATTENTION] Beginning of context:                     |
|    - System prompt                                          |
|    - Core memory / persona                                  |
|    - Current task description                               |
|                                                             |
|  [LOW ATTENTION] Middle of context:                         |
|    - Conversation history summary                           |
|    - Retrieved background knowledge                         |
|    - Old tool results                                       |
|                                                             |
|  [HIGH ATTENTION] End of context:                           |
|    - Recent messages (last 3-5 turns)                       |
|    - Current user query                                     |
|    - Active plan / next step                                |
|                                                             |
+------------------------------------------------------------+
```

```python
def arrange_context_for_attention(
    system_prompt: str,
    core_memory: str,
    retrieved_knowledge: list[str],
    conversation_summary: str,
    recent_messages: list[dict],
    current_query: str,
    active_plan: str,
) -> list[dict]:
    """Arrange context to maximize LLM attention on important parts."""
    context = []

    # === HIGH ATTENTION: Beginning ===
    context.append({
        "role": "system",
        "content": system_prompt,
    })
    if core_memory:
        context.append({
            "role": "system",
            "content": f"## Core Memory\n{core_memory}",
        })

    # === LOW ATTENTION: Middle ===
    if conversation_summary:
        context.append({
            "role": "system",
            "content": f"## Conversation Summary\n{conversation_summary}",
        })
    if retrieved_knowledge:
        knowledge_text = "\n".join(f"- {k}" for k in retrieved_knowledge)
        context.append({
            "role": "system",
            "content": f"## Retrieved Knowledge\n{knowledge_text}",
        })

    # === HIGH ATTENTION: End ===
    context.extend(recent_messages)
    if active_plan:
        context.append({
            "role": "system",
            "content": f"## Active Plan\n{active_plan}",
        })
    context.append({
        "role": "user",
        "content": current_query,
    })

    return context
```

---

## 12. Common Interview Questions

### Q1: How would you handle an agent that needs to work on a task spanning multiple sessions?

**Model Answer:**

I would implement a multi-layered persistence strategy:

1. **Checkpoint after each step**: Save the complete agent state (plan, workspace, findings, artifacts) after every meaningful action. Use a `CheckpointManager` that writes to disk or a database.

2. **Session summary on close**: When a session ends, generate a summary of what was accomplished, what's pending, and any blockers. Store this in long-term memory.

3. **Resume protocol**: On session start, load the latest checkpoint, retrieve the session summary, and present the agent with a "where we left off" context block.

4. **Artifact persistence**: All intermediate outputs (code files, analysis results, etc.) are saved to persistent storage with references in the checkpoint.

The key design decision is **what to serialize**. The plan and its status are critical. The full conversation history is less important -- a good summary plus the last few messages suffices. Tool results should be summarized unless they contain data the agent will need to reference again.

---

### Q2: What's the difference between RAG and agent memory? When would you use each?

**Model Answer:**

RAG (Retrieval-Augmented Generation) and agent memory overlap but serve different purposes:

**RAG** is about retrieving **external knowledge** -- documents, APIs, databases -- that the model wasn't trained on. It's stateless: given a query, retrieve relevant chunks, stuff them in the prompt.

**Agent memory** is about **the agent's own experience** -- what it has done, learned, and been told. It's stateful: it accumulates over time and reflects the agent's personal history with the user.

In practice, they use similar infrastructure (vector stores, embeddings, retrieval) but differ in:

| Aspect           | RAG                     | Agent Memory             |
| ---------------- | ----------------------- | ------------------------ |
| Content source   | External documents      | Agent's own interactions |
| Update frequency | Batch ingestion         | Continuous (every turn)  |
| Personalization  | Same for all users      | Unique per user/session  |
| Staleness        | Document refresh cycles | Always current           |

I would use both together: RAG for domain knowledge ("What does the API docs say?") and agent memory for personalization and continuity ("The user prefers TypeScript and already set up auth").

---

### Q3: How would you design memory for a multi-agent system where agents need to share context?

**Model Answer:**

I would implement a **shared memory bus** with private and public partitions:

```
+----------+     +----------+     +----------+
| Agent A  |     | Agent B  |     | Agent C  |
| (private |     | (private |     | (private |
|  memory) |     |  memory) |     |  memory) |
+----+-----+     +----+-----+     +----+-----+
     |                |                |
     v                v                v
+--------------------------------------------+
|          SHARED MEMORY BUS                  |
|                                             |
|  +------------------+  +-----------------+  |
|  | Shared Workspace |  | Message Board   |  |
|  | (current task    |  | (agent-to-agent |  |
|  |  state, plan)    |  |  communications)|  |
|  +------------------+  +-----------------+  |
|                                             |
|  +------------------+  +-----------------+  |
|  | Shared Knowledge |  | Coordination    |  |
|  | (facts all agents|  | State (locks,   |  |
|  |  should know)    |  |  assignments)   |  |
|  +------------------+  +-----------------+  |
+--------------------------------------------+
```

Key design principles:

1. **Read-heavy, write-coordinated**: Any agent can read shared memory, but writes go through a coordinator to avoid conflicts.
2. **Typed messages**: Agents communicate via structured messages (not free text) to reduce ambiguity.
3. **Selective sharing**: Agents publish only conclusions and decisions, not raw reasoning.
4. **Conflict resolution**: When two agents produce contradictory information, a resolution strategy (timestamp-based, confidence-based, or coordinator-decided) determines the canonical version.

---

### Q4: How do you evaluate whether your memory system is working well?

**Model Answer:**

I use both **intrinsic** and **extrinsic** metrics:

**Intrinsic metrics (measuring memory quality):**

- **Retrieval precision**: Of the memories retrieved, what fraction was actually useful? (Measure by having the LLM rate relevance.)
- **Retrieval recall**: Of the memories that should have been retrieved, what fraction was? (Harder to measure -- requires labeled test sets.)
- **Freshness**: Are stale or superseded memories being retrieved? Track the age distribution of retrieved memories.
- **Storage efficiency**: Tokens used for memory vs. value provided. Are we wasting context on low-value memories?

**Extrinsic metrics (measuring downstream impact):**

- **Task success rate**: Does the agent complete tasks more reliably with memory than without?
- **Contradiction rate**: How often does the agent contradict something it or the user said earlier?
- **Repetition rate**: How often does the agent ask for information it was already given?
- **User satisfaction**: In human evaluations, do users rate the memory-augmented agent higher?

I would run A/B tests comparing the agent with different memory configurations and track these metrics over time.

---

### Q5: What happens when the context window fills up during a complex task?

**Model Answer:**

This is a critical failure mode. My strategy has three layers:

1. **Prevention**: Budget tokens proactively. Before starting a complex task, estimate the context requirements and configure the memory system accordingly. If the task will require more context than available, break it into sub-tasks upfront.

2. **Graceful degradation**: As context fills up, activate increasingly aggressive compression:

   - At 60% full: Start summarizing older messages
   - At 80% full: Summarize aggressively, drop low-priority content
   - At 90% full: Move all non-essential context to external memory, keep only the current step's context

3. **Recovery**: If the agent hits the limit mid-task:
   - Checkpoint the current state
   - Start a fresh context with: system prompt + task summary + current step + relevant retrieved context
   - This is essentially a "context reset" that preserves continuity through external memory

The worst outcome is silently truncating context. The agent should be aware of its context usage and explicitly manage it.

---

### Q6: How would you implement memory for an agent that needs to handle thousands of concurrent users?

**Model Answer:**

The architecture needs to separate per-user state from shared infrastructure:

1. **Per-user memory isolation**: Each user gets their own namespace in the vector store and key-value store. Memories are never mixed between users.

2. **Tiered storage**:

   - Hot tier: Redis or in-memory cache for active sessions (short-term memory)
   - Warm tier: PostgreSQL with pgvector for recent long-term memories
   - Cold tier: Object storage (S3) for archived sessions and rarely accessed memories

3. **Lazy loading**: Don't load a user's full memory on session start. Load the session summary and recent messages. Retrieve additional context only when the query demands it.

4. **Memory lifecycle**: Implement TTL policies. Memories that haven't been accessed in 90 days move to cold storage. Users can explicitly mark memories as permanent.

5. **Embedding caching**: Cache embeddings for frequently used queries and memories. Embedding computation is often the bottleneck at scale.

---

### Q7: Compare the MemGPT approach with traditional RAG-based memory. What are the tradeoffs?

**Model Answer:**

| Aspect         | MemGPT                                          | Traditional RAG                                    |
| -------------- | ----------------------------------------------- | -------------------------------------------------- |
| Memory control | LLM decides what to store/retrieve              | Retrieval is automatic based on query similarity   |
| Flexibility    | High -- model can store anything in any format  | Limited to what the retrieval pipeline supports    |
| Cost           | Higher -- every memory operation is an LLM call | Lower -- retrieval is embedding similarity (cheap) |
| Reliability    | Model may forget to save important info         | Consistent: all qualifying content is indexed      |
| Latency        | Multiple LLM roundtrips for memory management   | Single embedding + vector search per retrieval     |
| Debugging      | Hard -- model's memory decisions are opaque     | Easier -- retrieval results are deterministic      |

**When I'd choose MemGPT**: For agents that need nuanced memory management -- deciding what's important, updating beliefs, maintaining a evolving self-model. Personal assistants, therapist agents, long-running project agents.

**When I'd choose RAG**: For agents that need reliable access to a large knowledge base. Customer support agents, documentation assistants, code assistants working with large codebases.

**In practice**: I'd combine both. Use RAG for domain knowledge retrieval (reliable, fast, cheap) and MemGPT-style self-managed memory for the agent's personal context (flexible, adaptive).

---

### Q8: How would you handle conflicting memories?

**Model Answer:**

Memory conflicts are inevitable in long-running agents. My approach:

1. **Detection**: When retrieving memories, run a lightweight conflict check. If two memories contradict each other (e.g., "User prefers Python" vs. "User prefers TypeScript"), flag the conflict.

2. **Resolution strategies**:

   - **Recency wins**: The most recent information is usually correct. "User prefers TypeScript" (yesterday) beats "User prefers Python" (3 months ago).
   - **Source authority**: User-stated preferences override agent-inferred ones. Explicit corrections override everything.
   - **Confidence-based**: If memories have confidence scores, prefer higher confidence.
   - **Ask the user**: When the conflict is ambiguous and high-stakes, ask: "I recall you previously preferred Python, but more recently mentioned TypeScript. Which should I use going forward?"

3. **Cleanup**: After resolving a conflict, mark the outdated memory as superseded (don't delete -- it might be useful for understanding history) and create a new canonical memory.

---

## 13. Quick Reference

### Memory Type Comparison

| Memory Type    | Human Analogy              | Persistence          | Update Frequency           | Storage              | Primary Use                   |
| -------------- | -------------------------- | -------------------- | -------------------------- | -------------------- | ----------------------------- |
| **Working**    | Mental workspace           | Current session only | Every reasoning step       | In-context           | Active task state, scratchpad |
| **Short-Term** | Recent conversation recall | Current session      | Every message              | In-context           | Conversation continuity       |
| **Long-Term**  | General knowledge          | Across sessions      | End of session or periodic | Vector DB / KV store | Facts, preferences, context   |
| **Episodic**   | Personal experiences       | Across sessions      | End of each task           | Vector DB            | Past successes/failures       |
| **Semantic**   | Book knowledge             | Permanent            | On ingestion               | Vector DB            | Domain knowledge, facts       |
| **Procedural** | Muscle memory              | Permanent            | On successful tool use     | Vector DB / examples | How to use tools, patterns    |

### Architecture Decision Guide

```
Need to remember conversation?
  --> Short-Term Memory (sliding window + summary)

Need domain knowledge?
  --> Semantic Memory (vector store + RAG)

Need to learn from experience?
  --> Episodic Memory (success/failure records)

Need to reuse tool patterns?
  --> Procedural Memory (few-shot examples)

Need to survive restarts?
  --> State Persistence (checkpointing)

Need LLM-controlled memory?
  --> MemGPT-style architecture

Need multi-agent shared state?
  --> Shared memory bus + coordination layer

Need to handle 1000s of users?
  --> Tiered storage + per-user namespacing
```

### Token Estimation Rules of Thumb

| Content                   | Approximate Token Count |
| ------------------------- | ----------------------- |
| 1 English word            | ~1.3 tokens             |
| 1 line of code            | ~10-15 tokens           |
| 1 paragraph of text       | ~50-100 tokens          |
| 1 JSON tool definition    | ~100-300 tokens         |
| 1 function with docstring | ~100-500 tokens         |
| 1 page of documentation   | ~500-800 tokens         |

### Key Libraries and Tools

| Library            | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `chromadb`         | Lightweight vector store, good for prototyping  |
| `pinecone`         | Managed vector database, production-grade       |
| `weaviate`         | Vector DB with hybrid search (vector + keyword) |
| `pgvector`         | PostgreSQL extension for vector similarity      |
| `langchain.memory` | Pre-built memory abstractions                   |
| `llama-index`      | Document indexing and retrieval framework       |
| `memgpt` / `letta` | MemGPT-style self-managing memory               |
| `redis`            | Fast in-memory store for session state          |
| `tiktoken`         | OpenAI tokenizer for accurate token counting    |

### Common Pitfalls

1. **Storing everything** -- Memory is not a log. Be selective about what you store.
2. **Ignoring token costs** -- Every token of context costs money and latency. Track your budget.
3. **No eviction policy** -- Memories accumulate forever, relevance degrades. Implement TTLs.
4. **Single retrieval strategy** -- Vector similarity alone misses keyword matches and structured relationships. Use hybrid search.
5. **No conflict resolution** -- Contradictory memories confuse the model. Detect and resolve conflicts.
6. **Context stuffing** -- Retrieving too much degrades model performance. Retrieve less, retrieve better.
7. **No evaluation** -- You can't improve what you don't measure. Track retrieval quality and task success.
8. **Forgetting the "lost in the middle" effect** -- Place critical information at the start and end of context.

---

## Further Reading

- **MemGPT Paper**: "MemGPT: Towards LLMs as Operating Systems" (Packer et al., 2023)
- **Lost in the Middle**: "Lost in the Middle: How Language Models Use Long Contexts" (Liu et al., 2023)
- **RAG Survey**: "Retrieval-Augmented Generation for Large Language Models: A Survey" (Gao et al., 2024)
- **Cognitive Architectures for AI Agents**: "A Survey on Large Language Model based Autonomous Agents" (Wang et al., 2023)
- **LangChain Memory Documentation**: Practical memory implementations for LLM applications
- **LlamaIndex**: Framework for connecting LLMs with external data sources

---

_This guide is part of the Agentic Engineering Interview Prep series._
