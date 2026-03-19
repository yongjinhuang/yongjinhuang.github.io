# Data Model: AI Agent Orchestration Platform

An AI agent orchestration platform manages the lifecycle of autonomous agents that use LLMs and tools to complete complex tasks. The data model must track agent configurations, task execution with full step-level observability, tool invocations, vector-based memory, and safety guardrails -- all while maintaining token and cost accounting.

---

## Table Responsibilities

| Table             | Purpose                                 | Why It Exists                                                                            |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| **agents**        | Agent configuration and versioning      | Separates agent identity from execution; allows A/B testing different prompts/models     |
| **tasks**         | Top-level task lifecycle tracking       | One row per user request; tracks status, cost, and links agent to session                |
| **task_steps**    | Step-by-step execution log (ReAct loop) | Full observability into think/tool_call/tool_result/response cycle; debugging and replay |
| **tools**         | Tool registry with schemas              | Decouples tools from agents; enables schema validation and sandbox enforcement           |
| **memory_chunks** | Vector-stored memory (short/long-term)  | Gives agents persistent context across sessions via embedding similarity search          |
| **guardrails**    | Input/output safety rules               | Centralizes toxicity, PII, and prompt-injection checks; reusable across agents           |

---

## Detailed Field Descriptions

### agents

| Field              | Type      | Description                                                   |
| ------------------ | --------- | ------------------------------------------------------------- |
| agent_id           | UUID (PK) | Unique agent identifier                                       |
| name               | VARCHAR   | Human-readable agent name                                     |
| system_prompt      | TEXT      | The system prompt defining agent behavior and persona         |
| primary_model      | VARCHAR   | Preferred LLM model (e.g., claude-opus-4-20250514)            |
| fallback_model     | VARCHAR   | Cheaper/faster model used when token_budget is tight          |
| tool_ids           | UUID[]    | Array of tool IDs this agent can invoke                       |
| memory_config_json | JSONB     | Memory settings: window size, retrieval top-k, decay rate     |
| guardrail_id       | UUID (FK) | References guardrails for input/output filtering              |
| token_budget       | INT       | Max tokens per task before switching to fallback_model        |
| status             | ENUM      | active, paused, deprecated                                    |
| version            | INT       | Monotonically increasing; enables rollback and A/B comparison |

**Why array for tool_ids?** Agents need different tool subsets. An array avoids a join table for what is a read-heavy, write-rare config. For larger systems, a many-to-many join table would be preferable.

### tasks

| Field        | Type      | Description                                     |
| ------------ | --------- | ----------------------------------------------- |
| task_id      | UUID (PK) | Unique task identifier                          |
| agent_id     | UUID (FK) | Which agent is executing this task              |
| session_id   | UUID      | Groups multiple tasks in a conversation session |
| user_id      | UUID      | The user who initiated the task                 |
| status       | ENUM      | queued, running, completed, failed              |
| priority     | INT       | Higher priority tasks are dequeued first        |
| input_json   | JSONB     | The user's input payload                        |
| output_json  | JSONB     | The agent's final response                      |
| total_tokens | INT       | Sum of all tokens consumed across all steps     |
| total_cost   | DECIMAL   | Computed cost based on model pricing            |
| created_at   | TIMESTAMP | Task creation time                              |

**Why separate input/output JSON?** Keeps the original request immutable for audit, while output captures the final result after the full ReAct loop.

### task_steps

| Field       | Type      | Description                                                                       |
| ----------- | --------- | --------------------------------------------------------------------------------- |
| task_id     | UUID (FK) | Parent task reference                                                             |
| step_index  | INT       | Ordered step within the task (composite PK with task_id)                          |
| step_type   | ENUM      | think, tool_call, tool_result, response                                           |
| content     | TEXT      | The actual content of this step (thought, tool args, tool output, final response) |
| model_used  | VARCHAR   | Which model produced this step (primary or fallback)                              |
| latency_ms  | INT       | Wall-clock time for this step                                                     |
| tokens_used | INT       | Tokens consumed by this step                                                      |

**Why composite PK (task_id + step_index)?** Steps are always accessed in task context, never independently. The composite key enforces ordering and enables efficient range scans for "show me all steps of task X."

### tools

| Field              | Type      | Description                                                          |
| ------------------ | --------- | -------------------------------------------------------------------- |
| tool_id            | UUID (PK) | Unique tool identifier                                               |
| name               | VARCHAR   | Tool name (e.g., web_search, code_executor)                          |
| description        | TEXT      | Shown to the LLM in tool-use prompts                                 |
| input_schema_json  | JSONB     | JSON Schema for validating tool inputs                               |
| output_schema_json | JSONB     | JSON Schema for expected tool outputs                                |
| execution_type     | ENUM      | function (in-process), api (HTTP call), sandbox (isolated execution) |
| sandbox_level      | ENUM      | none, container, vm -- isolation level for code execution tools      |
| rate_limit         | INT       | Max invocations per minute per agent                                 |

**Why execution_type matters:** Interview signal -- shows you understand that a "calculator" tool can run in-process, a "web_search" calls an API, but a "code_executor" needs sandbox isolation for security.

### memory_chunks (Vector DB)

| Field       | Type         | Description                                                                   |
| ----------- | ------------ | ----------------------------------------------------------------------------- |
| chunk_id    | UUID (PK)    | Unique chunk identifier                                                       |
| agent_id    | UUID (FK)    | Which agent owns this memory                                                  |
| session_id  | UUID         | Nullable; NULL means long-term cross-session memory                           |
| content     | TEXT         | The actual memory content                                                     |
| embedding   | VECTOR(1536) | Dense vector embedding for similarity search                                  |
| memory_type | ENUM         | short_term (session-scoped), long_term (persisted), episodic (task summaries) |
| created_at  | TIMESTAMP    | When this memory was stored                                                   |

**Why three memory types?** Short-term gives conversation context within a session. Long-term persists facts across sessions. Episodic stores task summaries for "what did I do last time?" retrieval. This mirrors cognitive architecture patterns.

### guardrails

| Field             | Type      | Description                                                                                  |
| ----------------- | --------- | -------------------------------------------------------------------------------------------- |
| guardrail_id      | UUID (PK) | Unique guardrail identifier                                                                  |
| name              | VARCHAR   | Human-readable name (e.g., "strict_safety")                                                  |
| input_rules_json  | JSONB     | Rules applied to user inputs: prompt injection detection, topic blocklist                    |
| output_rules_json | JSONB     | Rules applied to agent outputs: toxicity threshold, PII regex patterns, hallucination checks |

**Why separate input vs output rules?** Input rules prevent adversarial prompts from reaching the model. Output rules catch harmful content the model generates. Different failure modes require different rule sets.

---

## ER Diagram

```
+------------------+          +------------------+
|   guardrails     |          |     tools        |
+------------------+          +------------------+
| guardrail_id (PK)|         | tool_id (PK)     |
| name             |          | name             |
| input_rules_json |          | description      |
| output_rules_json|          | input_schema_json|
+--------+---------+          | output_schema_json|
         |                    | execution_type   |
         | 1                  | sandbox_level    |
         |                    | rate_limit       |
         |                    +--------+---------+
         |                             |
         |                        referenced by
         |                        tool_ids array
         |                             |
+--------+---------+                   |
|     agents       +-------------------+
+------------------+
| agent_id (PK)    |
| name             |
| system_prompt    |
| primary_model    |
| fallback_model   |
| tool_ids[]       |
| memory_config    |
| guardrail_id(FK) |1
| token_budget     |
| status, version  |
+--------+---------+
         |
         | 1
         |
         *
+--------+---------+          +-------------------+
|     tasks        |          | memory_chunks     |
+------------------+          | (Vector DB)       |
| task_id (PK)     |          +-------------------+
| agent_id (FK)    |          | chunk_id (PK)     |
| session_id       |          | agent_id (FK)     |
| user_id          |          | session_id        |
| status           |          | content           |
| priority         |          | embedding         |
| input_json       |          | memory_type       |
| output_json      |          | created_at        |
| total_tokens     |          +-------------------+
| total_cost       |                  *
| created_at       |                  |
+--------+---------+                  |
         |                            |
         | 1                     1    |
         |              agents -------+
         *
+------------------+
|   task_steps     |
+------------------+
| task_id (FK)(CPK)|
| step_index  (CPK)|
| step_type        |
| content          |
| model_used       |
| latency_ms       |
| tokens_used      |
+------------------+
```

### Relationship Summary

```
guardrails 1───* agents        (one guardrail set shared by many agents)
agents     1───* tasks         (one agent executes many tasks)
agents     1───* memory_chunks (one agent accumulates many memories)
tasks      1───* task_steps    (one task has ordered execution steps)
agents ····*···· tools         (many-to-many via tool_ids array)
```

---

## Data Flow

1. **User submits task** -- A new row is inserted into `tasks` with status=queued, capturing input_json and linking to the target agent_id.

2. **Agent initialization** -- The orchestrator loads the agent config (system_prompt, tool_ids, memory_config) and the associated guardrails.

3. **Input guardrail check** -- The user's input is validated against `guardrails.input_rules_json` (prompt injection detection, topic filtering). Rejected inputs fail the task immediately.

4. **Memory retrieval** -- The system queries `memory_chunks` using vector similarity search on the input embedding, filtered by agent_id and memory_type. Top-k results are injected into the context window.

5. **Model selection** -- If the estimated token usage fits within `token_budget`, use `primary_model`. Otherwise, fall back to `fallback_model`. This is logged in each task_step.

6. **ReAct loop execution** -- The agent enters a think-act-observe loop:

   - **Think**: Model reasons about the next action → logged as task_step (step_type=think)
   - **Tool call**: Model selects a tool and provides arguments → logged as task_step (step_type=tool_call), validated against tool's input_schema_json
   - **Tool result**: Tool executes and returns result → logged as task_step (step_type=tool_result)
   - Loop repeats until the agent decides to respond

7. **Output guardrail check** -- The final response is validated against `guardrails.output_rules_json` (toxicity, PII detection). Failed checks trigger retry or safe fallback.

8. **Memory storage** -- Key information from the task is embedded and stored in `memory_chunks` (short_term for session context, episodic as a task summary).

9. **Task completion** -- The task row is updated with output_json, total_tokens (summed from all task_steps), total_cost (computed from tokens x model pricing), and status=completed.

---

## Interview Discussion Points

**Q: Why not embed the tool definitions directly in the agent record?**
Decoupling tools from agents enables tool reuse across agents, independent versioning, and centralized rate limiting. A "web_search" tool used by 50 agents should have one definition, not 50 copies.

**Q: How do you handle agent versioning for A/B tests?**
The `version` field on agents allows multiple versions to coexist. Tasks reference a specific agent_id+version, so you can compare performance metrics (tokens, latency, success rate) across versions.

**Q: Why use a vector database for memory instead of a relational table?**
Memory retrieval is fundamentally a similarity search problem ("find memories relevant to this query"), not an exact-match lookup. Vector databases with ANN indexes (HNSW, IVF) provide sub-millisecond retrieval at scale.

**Q: How do you prevent runaway costs?**
Three layers: (1) token_budget per task triggers model fallback, (2) rate_limit per tool prevents excessive tool calls, (3) total_cost tracking on tasks enables per-user spending alerts and hard caps.
