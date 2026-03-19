# Agent Frameworks: A Comprehensive Comparison Guide

> **Agentic Engineering Interview Prep** | Estimated study time: 3-4 hours
> Last updated: March 2026

---

## Table of Contents

1. [Framework Landscape Overview](#1-framework-landscape-overview)
2. [LangGraph](#2-langgraph)
3. [Claude Agent SDK](#3-claude-agent-sdk)
4. [OpenAI Agents SDK](#4-openai-agents-sdk)
5. [CrewAI](#5-crewai)
6. [AutoGen / AG2](#6-autogen--ag2)
7. [DSPy](#7-dspy)
8. [Pydantic AI](#8-pydantic-ai)
9. [Mastra](#9-mastra)
10. [Building from Scratch](#10-building-from-scratch)
11. [Framework Comparison Matrix](#11-framework-comparison-matrix)
12. [Migration Patterns](#12-migration-patterns)
13. [Common Interview Questions](#13-common-interview-questions)
14. [Quick Reference](#14-quick-reference)

---

## 1. Framework Landscape Overview

### Categories of Agent Frameworks

```
+---------------------------------------------------------------------+
|                    AGENT FRAMEWORK TAXONOMY                         |
+---------------------------------------------------------------------+
|                                                                     |
|  ORCHESTRATION         MULTI-AGENT          OPTIMIZATION            |
|  (Control Flow)        (Collaboration)      (Prompt/Weight)         |
|  +--------------+      +--------------+     +--------------+        |
|  | LangGraph    |      | CrewAI       |     | DSPy         |        |
|  | Mastra       |      | AutoGen/AG2  |     |              |        |
|  +--------------+      | OpenAI SDK   |     +--------------+        |
|                        +--------------+                             |
|  TYPE-SAFE             PROVIDER SDKs        FULL-STACK              |
|  (Validation)          (Native Tools)       (End-to-End)            |
|  +--------------+      +--------------+     +--------------+        |
|  | Pydantic AI  |      | Claude SDK   |     | Mastra       |        |
|  |              |      | OpenAI SDK   |     | CrewAI       |        |
|  +--------------+      +--------------+     +--------------+        |
+---------------------------------------------------------------------+
```

### When to Use a Framework vs. Build from Scratch

```
USE A FRAMEWORK WHEN:                 BUILD FROM SCRATCH WHEN:
+-----------------------------------+ +-----------------------------------+
| - Rapid prototyping needed        | | - Extreme performance needs       |
| - Standard agentic patterns       | | - Unique control flow logic       |
| - Team needs shared conventions   | | - Minimal dependencies required   |
| - Observability out of the box    | | - Full understanding of internals |
| - Multi-agent coordination        | | - Custom memory/state management  |
| - Human-in-the-loop workflows     | | - Tight model-provider coupling   |
| - Production monitoring/tracing   | | - Regulatory/audit constraints    |
+-----------------------------------+ +-----------------------------------+
```

### Framework Maturity Spectrum (as of early 2026)

```
EXPERIMENTAL        MATURING             PRODUCTION-READY
     |                  |                       |
     +--DSPy(agents)----+--Mastra---------+-----+
                        |--Pydantic AI----+-----+
                        |--AutoGen/AG2----+
                        +--OpenAI SDK-----------+
                        +--Claude SDK-----------+
                        +--CrewAI---------------+
                        +--LangGraph------------+
```

---

## 2. LangGraph

### Overview

LangGraph is a graph-based orchestration framework from LangChain that models agents
as **state machines**. Nodes are functions, edges are transitions, and state is
immutable and checkpointed after every step.

**Key Insight**: LangGraph treats agent execution as a _directed graph_ problem,
giving you explicit control over branching, loops, and parallelism.

### Core Concepts

```
+------------------+     +------------------+     +------------------+
|   StateGraph     |---->|     Nodes        |---->|     Edges        |
| (TypedDict-based |     | (Python funcs    |     | (Conditional or  |
|  state schema)   |     |  that transform  |     |  fixed routing)  |
|                  |     |  state)          |     |                  |
+------------------+     +------------------+     +------------------+
         |                                               |
         v                                               v
+------------------+     +------------------+     +------------------+
|  Checkpointers   |     |  Human-in-Loop   |     |  Subgraphs       |
| (MemorySaver,    |     | (interrupt_before|     | (Nested graphs   |
|  PostgresSaver)  |     |  interrupt_after)|     |  with own state) |
+------------------+     +------------------+     +------------------+
```

### Checkpointing and Persistence

LangGraph saves a snapshot of graph state at every step. This enables:

- **Fault tolerance**: Failed nodes can be retried without re-running successful ones
- **Time-travel debugging**: Roll back to any prior state and replay
- **Pause/resume**: Long-running agents survive server restarts
- **Branching**: Fork execution from any checkpoint

Production deployments should use `PostgresSaver` (not `MemorySaver`) for durability
and horizontal scaling.

### Code Example: Research Agent

```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_openai import ChatOpenAI

# 1. Define state schema with reducers
class ResearchState(TypedDict):
    query: str
    sources: Annotated[list[str], lambda x, y: x + y]  # append reducer
    summary: str
    is_sufficient: bool

# 2. Define node functions (pure transforms)
def search(state: ResearchState) -> dict:
    results = web_search(state["query"])
    return {"sources": results}

def summarize(state: ResearchState) -> dict:
    summary = llm.invoke(
        f"Summarize these sources about {state['query']}: "
        f"{state['sources']}"
    )
    return {"summary": summary.content}

def evaluate(state: ResearchState) -> dict:
    evaluation = llm.invoke(
        f"Is this summary sufficient? {state['summary']}"
    )
    return {"is_sufficient": "yes" in evaluation.content.lower()}

# 3. Define routing logic
def should_continue(state: ResearchState) -> str:
    if state["is_sufficient"]:
        return "done"
    return "search_more"

# 4. Build the graph
graph = StateGraph(ResearchState)
graph.add_node("search", search)
graph.add_node("summarize", summarize)
graph.add_node("evaluate", evaluate)

graph.set_entry_point("search")
graph.add_edge("search", "summarize")
graph.add_edge("summarize", "evaluate")
graph.add_conditional_edges("evaluate", should_continue, {
    "search_more": "search",
    "done": END,
})

# 5. Compile with checkpointing
checkpointer = PostgresSaver.from_conn_string("postgresql://...")
app = graph.compile(checkpointer=checkpointer)

# 6. Run with thread-level persistence
result = app.invoke(
    {"query": "quantum computing advances 2026"},
    config={"configurable": {"thread_id": "research-001"}}
)
```

### LangSmith Integration

LangGraph integrates tightly with LangSmith for observability:

- Trace every node execution with inputs/outputs
- Visualize graph topology and execution paths
- Monitor latency, token usage, and cost per run
- Set up evaluations and regression testing
- Compare runs across different graph configurations

### When to Use LangGraph

- Complex workflows with conditional branching and cycles
- Long-running agents that need fault tolerance
- Workflows requiring human approval steps
- Systems where you need time-travel debugging
- Multi-agent architectures with explicit orchestration

---

## 3. Claude Agent SDK

### Overview

The Claude Agent SDK (formerly Claude Code SDK) gives you the same agent loop, tools,
and context management that power Claude Code, packaged as a library for Python and
TypeScript. Released September 2025 by Anthropic.

**Key Insight**: Rather than building agent infrastructure from scratch, the SDK
exposes the _battle-tested agent loop_ behind Claude Code as a programmable toolkit.

### The Agentic Loop

```
+---> Gather Context ---> Take Action ---> Verify Work ---+
|                                                         |
+----------------------- Repeat --------------------------+
                           |
                    (until task complete)
```

### Model Context Protocol (MCP)

MCP is an open standard (backed by Anthropic) for connecting agents to external
services. It handles authentication and API calls automatically.

```
+------------------+       +------------------+       +------------------+
|   Agent          |<----->|   MCP Server     |<----->|  External        |
|   (Claude SDK)   |       |   (Middleware)   |       |  Service         |
|                  |       |   - Auth/OAuth   |       |  - Slack         |
|  "search_slack"  |       |   - Rate limits  |       |  - GitHub        |
|  "get_tasks"     |       |   - Schema       |       |  - Google Drive  |
+------------------+       +------------------+       +------------------+
```

### Code Example: Research Agent

```typescript
import { Agent, tool } from '@anthropic-ai/claude-agent-sdk';

// Define tools
const webSearch = tool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: {
    query: { type: 'string', description: 'Search query' },
  },
  async execute({ query }) {
    const results = await searchAPI(query);
    return results.map((r) => `${r.title}: ${r.snippet}`).join('\n');
  },
});

const summarize = tool({
  name: 'summarize',
  description: 'Summarize collected research',
  parameters: {
    content: { type: 'string', description: 'Content to summarize' },
  },
  async execute({ content }) {
    return content; // Agent processes the content
  },
});

// Create and run the agent
const agent = new Agent({
  model: 'claude-sonnet-4-5',
  tools: [webSearch, summarize],
  systemPrompt: `You are a research assistant. Search for information,
    evaluate quality, and produce a comprehensive summary.`,
  maxTurns: 10,
});

const result = await agent.run('Research quantum computing advances in 2026');
console.log(result.output);
```

### MCP Server Integration

```typescript
import { Agent, mcpServer } from '@anthropic-ai/claude-agent-sdk';

// Connect to MCP servers for external integrations
const agent = new Agent({
  model: 'claude-sonnet-4-5',
  mcpServers: [
    mcpServer('slack', { token: process.env.SLACK_TOKEN }),
    mcpServer('github', { token: process.env.GITHUB_TOKEN }),
  ],
  systemPrompt: 'You are a project manager assistant.',
});

// Agent can now call tools like search_slack_messages,
// create_github_issue without custom integration code
const result = await agent.run(
  'Find recent Slack messages about the API outage and create a GitHub issue'
);
```

### When to Use the Claude Agent SDK

- Building agents that need Claude Code-level capabilities
- Projects already using Anthropic models
- Need for MCP integrations with external services
- Rapid prototyping of autonomous agents
- Agents that read/write files, run commands, or browse the web

---

## 4. OpenAI Agents SDK

### Overview

The OpenAI Agents SDK (launched March 2025) is the production-ready successor to the
experimental Swarm project. It centers on three primitives: **Agents**, **Handoffs**,
and **Guardrails**.

**Key Insight**: The SDK has the cleanest _handoff model_ of any framework -- agents
delegate to other agents via simple function returns, creating natural multi-agent
routing.

### Core Primitives

```
+------------------+     +------------------+     +------------------+
|    AGENTS        |     |    HANDOFFS      |     |   GUARDRAILS     |
| - Model config   |     | - Agent-to-agent |     | - Input checks   |
| - Instructions   |     |   delegation     |     | - Output checks  |
| - Tools          |     | - Context carry  |     | - Tool checks    |
| - Output type    |     | - Clean routing  |     | - Fast/cheap LM  |
+------------------+     +------------------+     +------------------+
```

### Guardrails Architecture

```
User Input
    |
    v
[Input Guardrail] -----> BLOCK (if malicious)
    |
    v (passes)
[Agent Execution]
    |
    v
[Tool Guardrail] -------> BLOCK (per-tool validation)
    |
    v
[Output Guardrail] -----> BLOCK (if invalid/unsafe)
    |
    v
Final Response
```

### Code Example: Research Agent with Handoffs

```python
from agents import Agent, Runner, handoff, guardrail, InputGuardrail

# Guardrail: block off-topic queries
@guardrail
async def topic_check(ctx, agent, input_text):
    result = await Runner.run(
        Agent(
            name="Topic Checker",
            instructions="Return 'off_topic' if the query is not research-related.",
            model="gpt-4o-mini",  # fast/cheap model for guardrails
        ),
        input_text,
    )
    if "off_topic" in result.final_output.lower():
        return {"tripwire": True, "message": "Query is not research-related"}
    return {"tripwire": False}

# Specialist agents
search_agent = Agent(
    name="Search Specialist",
    instructions="Search the web and return raw results.",
    tools=[web_search_tool],
    model="gpt-4o",
)

summary_agent = Agent(
    name="Summary Specialist",
    instructions="Synthesize search results into a clear summary.",
    model="gpt-4o",
)

# Triage agent with handoffs
triage_agent = Agent(
    name="Research Coordinator",
    instructions="""You coordinate research tasks.
    Hand off to Search Specialist for web searches.
    Hand off to Summary Specialist for synthesis.""",
    handoffs=[
        handoff(search_agent),
        handoff(summary_agent),
    ],
    input_guardrails=[InputGuardrail(guardrail_function=topic_check)],
    model="gpt-4o",
)

# Run with built-in tracing
result = await Runner.run(
    triage_agent,
    "Research quantum computing advances in 2026",
)
print(result.final_output)
```

### Tracing

The SDK includes built-in tracing that integrates with OpenAI's evaluation,
fine-tuning, and distillation tools. Every agent invocation, tool call, and handoff
is automatically traced.

### When to Use the OpenAI Agents SDK

- Multi-agent systems with clear delegation patterns
- Projects needing input/output validation (guardrails)
- Teams already invested in the OpenAI ecosystem
- Voice/realtime agents (Realtime Agents feature)
- Need for both Python and TypeScript support

---

## 5. CrewAI

### Overview

CrewAI models multi-agent systems as **crews** of role-playing agents. Each agent has
a role, goal, and backstory. Agents collaborate on **tasks** via configurable
**processes** (sequential, hierarchical, consensus).

**Key Insight**: CrewAI uses an organizational metaphor -- you design teams the way
you'd staff a real project, with managers, workers, and researchers.

### Architecture

```
+---------------------------------------------------------------+
|                         CREW                                  |
|  +-------------------+  +-------------------+                 |
|  |   AGENT           |  |   AGENT           |                 |
|  |   Role: Researcher|  |   Role: Writer    |                 |
|  |   Goal: Find data |  |   Goal: Summarize |                 |
|  |   Backstory: ...  |  |   Backstory: ...  |                 |
|  |   Tools: [search] |  |   Tools: [write]  |                 |
|  +-------------------+  +-------------------+                 |
|                                                               |
|  +-------------------+  +-------------------+                 |
|  |   TASK 1          |  |   TASK 2          |                 |
|  |   Description     |  |   Description     |                 |
|  |   Agent: Research  |  |   Agent: Writer   |                 |
|  |   Expected Output |  |   Expected Output |                 |
|  +-------------------+  +-------------------+                 |
|                                                               |
|  PROCESS: Sequential | Hierarchical | Consensus               |
+---------------------------------------------------------------+
```

### Process Types

```
SEQUENTIAL                 HIERARCHICAL              CONSENSUS
Task1 -> Task2 -> Task3    Manager                   All agents discuss
                            /    \                    until agreement
                        Worker  Worker
                            \    /
                          Results
```

### Code Example: Research Crew

```python
from crewai import Agent, Task, Crew, Process

# Define agents with roles
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find comprehensive, accurate information on the given topic",
    backstory="""You are an experienced research analyst with expertise
    in synthesizing information from multiple sources. You are thorough
    and always verify your findings.""",
    tools=[web_search, document_reader],
    llm="gpt-4o",
    verbose=True,
)

writer = Agent(
    role="Technical Writer",
    goal="Create clear, well-structured summaries of research findings",
    backstory="""You are a skilled technical writer who excels at
    making complex topics accessible. You always cite your sources.""",
    llm="gpt-4o",
    verbose=True,
)

# Define tasks
research_task = Task(
    description="""Research quantum computing advances in 2026.
    Focus on: breakthroughs, key players, practical applications.""",
    expected_output="Detailed research notes with sources",
    agent=researcher,
)

summary_task = Task(
    description="""Using the research notes, write a comprehensive
    summary suitable for a technical audience.""",
    expected_output="A well-structured 500-word summary with citations",
    agent=writer,
)

# Create and run the crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, summary_task],
    process=Process.sequential,
    memory=True,           # Enable shared memory
    planning=True,         # Enable planning agent
    verbose=True,
)

result = crew.kickoff()
print(result)
```

### Memory System

CrewAI provides four types of memory:

- **Short-term**: Current task context
- **Long-term**: Persistent across crew executions
- **Entity**: Knowledge about specific entities mentioned
- **Contextual**: Shared context between agents in a crew

### When to Use CrewAI

- Teams that think in organizational metaphors (roles, delegation)
- Rapid prototyping of multi-agent workflows
- Projects where agent specialization is natural
- Use cases with clear task decomposition
- When you want built-in planning and memory

---

## 6. AutoGen / AG2

### Overview

AutoGen (Microsoft) pioneered the concept of multi-agent conversation. Agents
_chat with each other_ to solve problems. AG2 (Agent Gen 2) is the community-led
fork continuing the original v0.2 API, while Microsoft has moved to the new
Agent Framework combining AutoGen with Semantic Kernel.

**Key Insight**: AutoGen models all agent interaction as _conversations_. The core
abstraction is message passing between agents, not graph nodes or task queues.

### Conversation Patterns

```
TWO-AGENT CHAT           SEQUENTIAL CHAT          GROUP CHAT
+------+  +------+       A->B->C->D              +----------+
|Agent1|<>|Agent2|       (carryover summary)      |GroupChat |
+------+  +------+                                | Manager  |
                                                  +----+-----+
                                                  /    |    \
                                             Agent1 Agent2 Agent3

NESTED CHATS              SWARMS
+--Agent(outer)--+        Multiple agents with
| +--Agent(in)--+|        built-in orchestration
| | sub-workflow ||        patterns
| +-------------+|
+-----------------+
```

### Code Example: Research Conversation

```python
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager

# Define agents
researcher = AssistantAgent(
    name="Researcher",
    system_message="""You search for and gather information.
    When you find sufficient information, say TERMINATE.""",
    llm_config={"model": "gpt-4o"},
)

analyst = AssistantAgent(
    name="Analyst",
    system_message="""You analyze research findings and identify
    key insights and patterns.""",
    llm_config={"model": "gpt-4o"},
)

writer = AssistantAgent(
    name="Writer",
    system_message="""You write clear summaries based on the
    analysis. When the summary is complete, say TERMINATE.""",
    llm_config={"model": "gpt-4o"},
)

# Human proxy for oversight
user_proxy = UserProxyAgent(
    name="User",
    human_input_mode="TERMINATE",  # Ask human only at end
    code_execution_config={"work_dir": "output"},
)

# Group chat with manager
group_chat = GroupChat(
    agents=[user_proxy, researcher, analyst, writer],
    messages=[],
    max_round=12,
    speaker_selection_method="auto",  # LLM picks next speaker
)

manager = GroupChatManager(
    groupchat=group_chat,
    llm_config={"model": "gpt-4o"},
)

# Start the conversation
user_proxy.initiate_chat(
    manager,
    message="Research quantum computing advances in 2026",
)
```

### AG2 vs. AutoGen v0.4 vs. Microsoft Agent Framework

```
+---------------------+---------------------------+-----------------------------+
| AG2 (Community)     | AutoGen 0.4 (Microsoft)   | Agent Framework (Microsoft) |
+---------------------+---------------------------+-----------------------------+
| Continues v0.2 API  | Complete rewrite           | Successor to AutoGen        |
| Backward compatible | Layered architecture       | Combines AutoGen +          |
| Active community    | Event-driven               |   Semantic Kernel           |
| pip install ag2     | pip install autogen-agentchat| Graph-based workflows     |
| Stable, production  | Breaking changes           | Enterprise features         |
+---------------------+---------------------------+-----------------------------+
```

### When to Use AutoGen / AG2

- Systems where agents need to _debate_ or _negotiate_
- Research prototyping with flexible conversation patterns
- Projects needing code execution within agent conversations
- Scenarios with dynamic agent topologies
- When the Microsoft ecosystem is already in use

---

## 7. DSPy

### Overview

DSPy (Declarative Self-improving Python) takes a fundamentally different approach:
instead of prompting LLMs, you **program** them. You define _what_ you want
(Signatures) and DSPy's optimizers figure out _how_ to prompt the model.

**Key Insight**: DSPy treats prompt engineering as a _compilation problem_. You write
declarative specifications, and optimizers automatically find the best prompts,
few-shot examples, and even fine-tuning strategies.

### Core Abstraction: Signatures

```
TRADITIONAL PROMPTING              DSPy SIGNATURES
+--------------------------+       +--------------------------+
| "You are a helpful       |       | class Summarize(dspy.    |
|  assistant. Given the    |       |     Signature):          |
|  following document,     |       |   document: str = dspy.  |
|  please provide a        |       |     InputField()         |
|  concise summary that    |       |   summary: str = dspy.   |
|  captures the key..."    |       |     OutputField()        |
| (500 words of prompt)    |       |                          |
+--------------------------+       +--------------------------+
     Fragile, manual                   Declarative, optimizable
```

### Optimizer Hierarchy

```
Few examples (10)?     --> BootstrapFewShot
More data (50+)?       --> BootstrapFewShotWithRandomSearch
Best quality?          --> MIPROv2 (instruction + demo generation)
Cutting edge (2025+)?  --> GEPA (genetic Pareto optimization)
Prompt + fine-tune?    --> BetterTogether (meta-optimizer)
```

### Code Example: Research Pipeline

```python
import dspy

# Configure the LM
lm = dspy.LM("openai/gpt-4o")
dspy.configure(lm=lm)

# Define signatures (WHAT, not HOW)
class SearchQuery(dspy.Signature):
    """Generate an effective search query for a research topic."""
    topic: str = dspy.InputField()
    query: str = dspy.OutputField(desc="optimized search query")

class Summarize(dspy.Signature):
    """Summarize search results into key findings."""
    results: str = dspy.InputField()
    summary: str = dspy.OutputField(desc="concise summary of findings")

class Evaluate(dspy.Signature):
    """Evaluate if a research summary is comprehensive enough."""
    summary: str = dspy.InputField()
    is_sufficient: bool = dspy.OutputField()
    reasoning: str = dspy.OutputField()

# Build a module (composable pipeline)
class ResearchAgent(dspy.Module):
    def __init__(self):
        self.gen_query = dspy.ChainOfThought(SearchQuery)
        self.summarize = dspy.ChainOfThought(Summarize)
        self.evaluate = dspy.ChainOfThought(Evaluate)

    def forward(self, topic: str) -> str:
        query = self.gen_query(topic=topic)
        results = web_search(query.query)  # external tool call
        summary = self.summarize(results=str(results))

        evaluation = self.evaluate(summary=summary.summary)
        if not evaluation.is_sufficient:
            # Iteratively refine
            refined_query = self.gen_query(
                topic=f"{topic} - need more on: {evaluation.reasoning}"
            )
            more_results = web_search(refined_query.query)
            summary = self.summarize(
                results=f"{results}\n{more_results}"
            )

        return summary.summary

# Optimize with training data
trainset = [
    dspy.Example(topic="quantum computing", summary="...expected..."),
    # ... more examples
]

optimizer = dspy.MIPROv2(metric=research_quality_metric, num_threads=4)
optimized_agent = optimizer.compile(
    ResearchAgent(),
    trainset=trainset,
    max_bootstrapped_demos=4,
    max_labeled_demos=4,
)

# Use the optimized agent
result = optimized_agent("quantum computing advances 2026")
```

### When to Use DSPy

- You want prompts to be automatically optimized, not hand-tuned
- Switching between models frequently (prompts auto-adapt)
- Building pipelines where quality metrics can be defined
- Research contexts where systematic prompt optimization matters
- When prompt fragility is causing production issues

---

## 8. Pydantic AI

### Overview

Pydantic AI brings the "FastAPI feeling" to agent development. Built by the Pydantic
team, it emphasizes type safety, structured outputs, and dependency injection.

**Key Insight**: An agent is a class. A tool is a function. An output is a Pydantic
model. No chains, no runnables, no special syntax -- just typed Python.

### Dependency Injection Pattern

```
+------------------+
|  Dependencies    |  (injected at runtime)
|  - DB connection |
|  - API clients   |
|  - User context  |
+--------+---------+
         |
         v
+------------------+     +------------------+
|     Agent        |---->|     Tools        |
|  - model         |     |  (receive deps   |
|  - system_prompt |     |   via RunContext) |
|  - result_type   |     +------------------+
+------------------+
         |
         v
+------------------+
|  Structured      |
|  Output          |
|  (Pydantic model)|
+------------------+
```

### Code Example: Research Agent

```python
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from dataclasses import dataclass

# Structured output type
class ResearchResult(BaseModel):
    summary: str
    key_findings: list[str]
    sources: list[str]
    confidence: float

# Dependencies (injected, not global)
@dataclass
class ResearchDeps:
    search_client: SearchClient
    max_sources: int = 10

# Define the agent with type safety
research_agent = Agent(
    "openai:gpt-4o",
    deps_type=ResearchDeps,
    result_type=ResearchResult,  # Guarantees structured output
    system_prompt="""You are a thorough research assistant.
    Search for information, evaluate sources, and provide
    a structured summary with confidence score.""",
)

# Tools receive dependencies via RunContext
@research_agent.tool
async def search_web(
    ctx: RunContext[ResearchDeps], query: str
) -> str:
    """Search the web for information."""
    results = await ctx.deps.search_client.search(
        query, limit=ctx.deps.max_sources
    )
    return "\n".join(f"- {r.title}: {r.snippet}" for r in results)

# Run with real dependencies
async def main():
    deps = ResearchDeps(search_client=RealSearchClient())
    result = await research_agent.run(
        "Research quantum computing advances in 2026",
        deps=deps,
    )
    # result.data is a validated ResearchResult
    print(result.data.summary)
    print(f"Confidence: {result.data.confidence}")

# Test with mock dependencies -- no API calls, deterministic
async def test_research():
    from pydantic_ai import TestModel

    deps = ResearchDeps(search_client=MockSearchClient())
    with research_agent.override(model=TestModel()):
        result = await research_agent.run(
            "Test query", deps=deps
        )
        assert isinstance(result.data, ResearchResult)
```

### Key Differentiators

- **TestModel**: Deterministic testing with no API calls or cost
- **Validation retries**: Automatically re-prompts when LLM returns invalid data
- **Model agnostic**: 40+ providers through one interface
- **Logfire integration**: OpenTelemetry-based observability

### When to Use Pydantic AI

- Type safety is a priority (teams used to strict typing)
- Structured outputs are critical (validated by Pydantic)
- Dependency injection patterns are familiar (FastAPI users)
- Testing agents without API calls is important
- You want minimal abstraction over plain Python

---

## 9. Mastra

### Overview

Mastra is the **TypeScript-first** agent framework, built by the team behind Gatsby.
It provides a unified set of primitives for agents, workflows, RAG, and evaluations
in the JavaScript/TypeScript ecosystem.

**Key Insight**: Mastra fills the gap for TypeScript developers who want the same
level of agent tooling that Python developers get from LangGraph or CrewAI.

### Architecture

```
+------------------------------------------------------------------+
|                         MASTRA                                   |
|                                                                  |
|  +------------+  +-------------+  +------------+  +----------+  |
|  |   Agents   |  |  Workflows  |  |    RAG     |  |   Evals  |  |
|  | - LLM call |  | - Graph-    |  | - Ingest   |  | - Auto   |  |
|  | - Tools    |  |   based     |  | - Chunk    |  | - Custom |  |
|  | - Memory   |  | - .then()   |  | - Embed    |  | - CI/CD  |  |
|  | - MCP      |  | - .branch() |  | - Retrieve |  |          |  |
|  +------------+  | - .parallel()|  +------------+  +----------+  |
|                  +-------------+                                 |
+------------------------------------------------------------------+
```

### Code Example: Research Agent

```typescript
import { Agent, createTool } from '@mastra/core';
import { z } from 'zod';

// Define tools with Zod schemas
const webSearch = createTool({
  id: 'web-search',
  description: 'Search the web for information',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
        url: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const results = await searchAPI(context.query);
    return { results };
  },
});

// Create agent
const researchAgent = new Agent({
  name: 'Research Agent',
  instructions: `You are a research assistant. Search for information
    and provide comprehensive summaries with sources.`,
  model: {
    provider: 'ANTHROPIC',
    name: 'claude-sonnet-4-5',
  },
  tools: { webSearch },
});

// Use in a workflow for complex orchestration
import { Workflow, Step } from '@mastra/core';

const researchWorkflow = new Workflow({
  name: 'deep-research',
  triggerSchema: z.object({ topic: z.string() }),
});

const searchStep = new Step({
  id: 'search',
  execute: async ({ context }) => {
    const response = await researchAgent.generate(
      `Search for: ${context.triggerData.topic}`
    );
    return { findings: response.text };
  },
});

const synthesizeStep = new Step({
  id: 'synthesize',
  execute: async ({ context }) => {
    const response = await researchAgent.generate(
      `Synthesize these findings: ${context.getStepResult('search').findings}`
    );
    return { summary: response.text };
  },
});

researchWorkflow.step(searchStep).then(synthesizeStep).commit();

const result = await researchWorkflow.execute({
  triggerData: { topic: 'quantum computing advances 2026' },
});
```

### When to Use Mastra

- TypeScript/JavaScript is your primary language
- Building full-stack AI apps with React/Next.js
- Need RAG, agents, and workflows in one framework
- Want to deploy to serverless (Vercel, Cloudflare)
- Authoring MCP servers for tool distribution

---

## 10. Building from Scratch

### When to Build Your Own Agent Loop

```
BUILD FROM SCRATCH WHEN:
+------------------------------------------------------------+
| 1. You need <10ms overhead per step (frameworks add 5-50ms)|
| 2. Your control flow doesn't fit graph/crew/chat patterns  |
| 3. Regulatory requirements demand full code auditability   |
| 4. You need custom memory/state beyond key-value stores    |
| 5. The agent is simple enough (single model + few tools)   |
| 6. You want to deeply understand agent internals           |
| 7. Framework lock-in is unacceptable for your use case     |
+------------------------------------------------------------+
```

### Minimal Agent Loop

```python
import json
from openai import OpenAI

client = OpenAI()

def agent_loop(
    user_message: str,
    tools: dict,
    model: str = "gpt-4o",
    max_iterations: int = 10,
) -> str:
    messages = [
        {"role": "system", "content": "You are a helpful research assistant."},
        {"role": "user", "content": user_message},
    ]

    tool_schemas = [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": func.__doc__,
                "parameters": func.schema,
            },
        }
        for name, func in tools.items()
    ]

    for _ in range(max_iterations):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tool_schemas if tool_schemas else None,
        )

        message = response.choices[0].message

        # No tool calls means the agent is done
        if not message.tool_calls:
            return message.content

        # Process each tool call
        messages.append(message)
        for tool_call in message.tool_calls:
            func = tools[tool_call.function.name]
            args = json.loads(tool_call.function.arguments)
            try:
                result = func(**args)
            except Exception as e:
                result = f"Error: {str(e)}"

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result),
            })

    return "Max iterations reached without final answer."
```

### Adding Production Features Incrementally

```
BASIC LOOP                    + PERSISTENCE              + OBSERVABILITY
+-----------+                 +-----------+              +-----------+
| LLM call  |    --------->  | + State   |  --------->  | + Logging |
| Tool exec |                |   store   |              | + Tracing |
| Loop      |                | + Resume  |              | + Metrics |
+-----------+                +-----------+              +-----------+

+ GUARDRAILS                  + MULTI-AGENT              = FRAMEWORK
+-----------+                 +-----------+              +-----------+
| + Input   |    --------->  | + Routing |  --------->  | You just  |
|   checks  |                | + Handoff |              | built one |
| + Output  |                | + Shared  |              |           |
|   checks  |                |   state   |              |           |
+-----------+                +-----------+              +-----------+
```

### Key Components to Implement

1. **Message management**: Token counting, context window trimming
2. **Tool execution**: Schema validation, error handling, timeouts
3. **State persistence**: Checkpoint/resume across restarts
4. **Observability**: Structured logging, cost tracking, latency monitoring
5. **Safety**: Input/output validation, rate limiting, content filtering
6. **Error recovery**: Retry logic, fallback models, graceful degradation

### When NOT to Build from Scratch

- Multi-agent coordination (frameworks handle message routing)
- Human-in-the-loop (frameworks handle pause/resume)
- Time-travel debugging (requires checkpointing infrastructure)
- Team projects (frameworks provide shared conventions)

---

## 11. Framework Comparison Matrix

### Feature Comparison

```
+----------------+----------+----------+----------+----------+----------+----------+----------+----------+
| Feature        | LangGraph| Claude   | OpenAI   | CrewAI   | AutoGen  | DSPy     | Pydantic | Mastra   |
|                |          | SDK      | SDK      |          | /AG2     |          | AI       |          |
+----------------+----------+----------+----------+----------+----------+----------+----------+----------+
| Language       | Python   | Py + TS  | Py + TS  | Python   | Python   | Python   | Python   | TypeScript|
| Multi-Agent    | Yes      | Via MCP  | Yes      | Yes      | Yes      | No*      | Limited  | Yes      |
| Checkpointing  | Built-in | No       | No       | Limited  | No       | No       | No       | Yes      |
| Guardrails     | Manual   | Manual   | Built-in | Manual   | Manual   | Metrics  | Validation| Manual  |
| Type Safety    | TypedDict| TS types | Pydantic | Limited  | Limited  | Typed    | Pydantic | Zod      |
| Observability  | LangSmith| Manual   | Built-in | Limited  | Limited  | Manual   | Logfire  | Built-in |
| Human-in-Loop  | Built-in | Manual   | Manual   | Limited  | Built-in | No       | No       | Built-in |
| MCP Support    | Yes      | Native   | Yes      | Yes      | Limited  | No       | Yes      | Native   |
| RAG Built-in   | No       | No       | No       | No       | No       | No       | No       | Yes      |
| Prompt Optim.  | No       | No       | No       | No       | No       | Core     | No       | No       |
| Streaming      | Yes      | Yes      | Yes      | Limited  | Yes      | No       | Yes      | Yes      |
| Voice/Realtime | No       | No       | Yes      | No       | No       | No       | No       | No       |
+----------------+----------+----------+----------+----------+----------+----------+----------+----------+

* DSPy focuses on pipeline optimization, not multi-agent collaboration
```

### Strengths and Weaknesses

```
+----------------+--------------------------------+--------------------------------+
| Framework      | STRENGTHS                      | WEAKNESSES                     |
+----------------+--------------------------------+--------------------------------+
| LangGraph      | - Explicit control flow        | - Steep learning curve         |
|                | - Checkpointing/persistence    | - Verbose for simple agents    |
|                | - Time-travel debugging        | - LangChain ecosystem lock-in  |
|                | - Production-proven            |                                |
+----------------+--------------------------------+--------------------------------+
| Claude SDK     | - Battle-tested agent loop     | - Anthropic models only        |
|                | - MCP ecosystem                | - Newer, smaller community     |
|                | - File/shell/web built-in      | - Less flexibility in loop     |
|                | - Minimal boilerplate          |                                |
+----------------+--------------------------------+--------------------------------+
| OpenAI SDK     | - Cleanest handoff model       | - OpenAI ecosystem bias        |
|                | - Built-in guardrails          | - Limited state management     |
|                | - Tracing + eval pipeline      | - No checkpointing             |
|                | - Py + TS parity               |                                |
+----------------+--------------------------------+--------------------------------+
| CrewAI         | - Intuitive role metaphor      | - Less control over internals  |
|                | - Built-in planning agent      | - Verbose role definitions     |
|                | - Large community (44k stars)  | - Can be unpredictable         |
|                | - Memory system                |                                |
+----------------+--------------------------------+--------------------------------+
| AutoGen/AG2    | - Flexible conversation types  | - Fragmented ecosystem         |
|                | - Code execution built-in      | - API instability (v0.2 vs 4) |
|                | - Academic research backing    | - Microsoft moving to new FW   |
|                | - Dynamic agent topologies     |                                |
+----------------+--------------------------------+--------------------------------+
| DSPy           | - Automatic prompt optimization| - Not a traditional agent FW   |
|                | - Model portability            | - Requires quality metrics     |
|                | - Eliminates prompt fragility  | - Optimization cost/time       |
|                | - Composable optimizers        | - Steeper conceptual curve     |
+----------------+--------------------------------+--------------------------------+
| Pydantic AI    | - Excellent type safety        | - Smaller ecosystem            |
|                | - Dependency injection         | - Less multi-agent support     |
|                | - TestModel for CI/CD          | - Newer framework              |
|                | - FastAPI-like ergonomics      |                                |
+----------------+--------------------------------+--------------------------------+
| Mastra         | - TypeScript-first             | - Smaller community            |
|                | - Full-stack (RAG + agents)    | - Enterprise license for some  |
|                | - Serverless deployment        |   features                     |
|                | - MCP server authoring         | - Less battle-tested           |
+----------------+--------------------------------+--------------------------------+
```

### Best Use Cases

```
+-------------------------------+------------------------------------------+
| USE CASE                      | BEST FRAMEWORK                           |
+-------------------------------+------------------------------------------+
| Complex stateful workflows    | LangGraph                                |
| Quick autonomous agent        | Claude SDK, Pydantic AI                  |
| Multi-agent delegation        | OpenAI SDK, CrewAI                       |
| Research/debate agents        | AutoGen/AG2                              |
| Prompt optimization pipeline  | DSPy                                     |
| Type-safe production agent    | Pydantic AI                              |
| TypeScript full-stack AI app  | Mastra                                   |
| Simple single-agent tool use  | Build from scratch or Pydantic AI        |
| Voice/realtime agents         | OpenAI SDK                               |
| File/code manipulation agent  | Claude SDK                               |
+-------------------------------+------------------------------------------+
```

---

## 12. Migration Patterns

### Common Migration Paths

```
LangChain Agents -----> LangGraph
                         (same ecosystem, graph-based upgrade)

Swarm (experimental) -> OpenAI Agents SDK
                         (direct successor, production-ready)

AutoGen v0.2 ---------> AG2 (community fork, backward compat)
                    or-> Microsoft Agent Framework (enterprise)

Custom agent loop ----> Pydantic AI (minimal abstraction)
                    or-> LangGraph (maximum control)

JavaScript agents ----> Mastra (TypeScript-native)
```

### Abstraction Layer Strategy

When you anticipate switching frameworks, create a thin abstraction:

```python
from abc import ABC, abstractmethod
from typing import Any
from dataclasses import dataclass

@dataclass(frozen=True)
class AgentResult:
    output: str
    tool_calls: list[dict]
    token_usage: dict
    cost: float

class AgentRunner(ABC):
    """Framework-agnostic agent interface."""

    @abstractmethod
    async def run(self, prompt: str, **kwargs) -> AgentResult:
        ...

    @abstractmethod
    def add_tool(self, name: str, func: callable, schema: dict) -> None:
        ...

# Framework-specific implementations
class LangGraphRunner(AgentRunner):
    async def run(self, prompt: str, **kwargs) -> AgentResult:
        result = await self.graph.ainvoke({"input": prompt}, **kwargs)
        return AgentResult(
            output=result["output"],
            tool_calls=result.get("tool_calls", []),
            token_usage=result.get("usage", {}),
            cost=calculate_cost(result),
        )

    def add_tool(self, name, func, schema):
        self.tools[name] = StructuredTool.from_function(func)

class PydanticAIRunner(AgentRunner):
    async def run(self, prompt: str, **kwargs) -> AgentResult:
        result = await self.agent.run(prompt, **kwargs)
        return AgentResult(
            output=str(result.data),
            tool_calls=[],
            token_usage=result.usage().dict(),
            cost=result.cost(),
        )

    def add_tool(self, name, func, schema):
        self.agent.tool(func)
```

### Migration Checklist

```
[ ] Inventory all tools and their schemas
[ ] Map state management patterns to new framework
[ ] Identify framework-specific features you depend on
[ ] Create integration tests for agent behavior (not implementation)
[ ] Migrate one agent at a time, not all at once
[ ] Benchmark latency and cost differences
[ ] Update observability/tracing configuration
[ ] Verify error handling and retry behavior
[ ] Test human-in-the-loop flows if applicable
[ ] Update CI/CD pipelines
```

---

## 13. Common Interview Questions

### Q1: "How would you choose an agent framework for a new project?"

**Model Answer:**

"I'd evaluate along five axes:

1. **Complexity of orchestration** -- If I need stateful workflows with branching,
   cycles, and checkpointing, I'd choose LangGraph. For simple tool-use agents,
   Pydantic AI or building from scratch is sufficient.

2. **Multi-agent requirements** -- For multi-agent delegation, OpenAI's SDK has the
   cleanest handoff model. For role-based collaboration, CrewAI. For debate/negotiation
   patterns, AutoGen.

3. **Language ecosystem** -- TypeScript teams should consider Mastra. Python teams
   have the most options.

4. **Production needs** -- Pydantic AI gives the best type safety and testability.
   LangGraph has the most mature persistence. OpenAI SDK has built-in guardrails.

5. **Team familiarity** -- The best framework is the one your team can ship with
   confidently. Framework overhead matters less than developer productivity."

---

### Q2: "What are the tradeoffs between LangGraph and CrewAI?"

**Model Answer:**

"They represent opposite philosophies. LangGraph is _explicit_ -- you define every
node, edge, and conditional branch. This gives you full control but requires more
code. CrewAI is _declarative_ -- you define roles and tasks, and the framework
handles orchestration. This is faster to prototype but harder to debug when agents
misbehave.

LangGraph excels when you need deterministic workflows with checkpointing and
human-in-the-loop. CrewAI excels when tasks decompose naturally into roles and you
want built-in planning and memory. In production, LangGraph is often chosen for
reliability-critical systems, while CrewAI is preferred for rapid prototyping and
teams that think in organizational metaphors."

---

### Q3: "When would you use DSPy instead of a traditional agent framework?"

**Model Answer:**

"DSPy solves a different problem. Traditional frameworks orchestrate _how_ an agent
acts. DSPy optimizes _how the model is prompted_. I'd use DSPy when:

- Prompts are fragile and break when switching models
- I can define quality metrics for my task
- I want systematic optimization instead of manual prompt tuning
- I'm building pipelines, not conversational agents

DSPy can also be combined with agent frameworks. For example, you could use DSPy to
optimize the prompts within LangGraph nodes, getting the best of both worlds."

---

### Q4: "Explain the Model Context Protocol and why it matters."

**Model Answer:**

"MCP is an open standard for connecting AI agents to external services. Before MCP,
every integration required custom code -- OAuth flows, API wrappers, error handling.
MCP standardizes this into a server that handles auth and exposes tools.

It matters because it creates an ecosystem effect. An MCP server for Slack works with
Claude SDK, Mastra, OpenAI SDK, or any MCP-compatible agent. This decouples tool
development from agent development. You build a tool once, and any agent can use it.

In practice, MCP shifts the effort from 'build N integrations for M agents' (N\*M work)
to 'build N MCP servers + M agent adapters' (N+M work)."

---

### Q5: "How would you add reliability to a custom agent loop?"

**Model Answer:**

"I'd add five layers incrementally:

1. **Retry with backoff** -- Transient API failures shouldn't crash the agent.
   Exponential backoff with jitter for rate limits.

2. **Input/output validation** -- Validate tool arguments before execution and
   validate LLM outputs against expected schemas. Pydantic models work well here.

3. **Checkpointing** -- Save state after each successful step so the agent can
   resume after crashes. Even a simple JSON file works for single-agent systems.

4. **Guardrails** -- Run a fast, cheap model to check for prompt injection, off-topic
   queries, or unsafe outputs before the main model processes them.

5. **Observability** -- Structured logging with trace IDs, token counts, latency per
   step, and cost tracking. This is essential for debugging production issues."

---

### Q6: "Compare the handoff patterns in OpenAI SDK vs CrewAI vs LangGraph."

**Model Answer:**

"These frameworks implement agent-to-agent delegation very differently:

**OpenAI SDK**: Handoffs are explicit function returns. An agent calls a handoff
function that returns another agent. The SDK transfers control and carries context.
It's the simplest mental model -- like a function call that switches the active agent.

**CrewAI**: Delegation is implicit through the role system. Agents can delegate
subtasks to other crew members based on role definitions. The framework routes tasks
based on which agent's role best matches. Less control but more autonomous.

**LangGraph**: Routing is done through conditional edges in the graph. You write a
routing function that examines state and returns the next node name. Most explicit and
customizable, but requires you to define every possible transition."

---

### Q7: "Your agent needs to survive server restarts and process multi-hour tasks. Which framework and why?"

**Model Answer:**

"LangGraph with PostgresSaver. Here's why:

LangGraph checkpoints state after every node execution. With PostgresSaver, this state
survives server restarts and scales across multiple instances. If a node fails, only
that node is retried -- successful nodes aren't re-run.

For multi-hour tasks, I'd also add: (1) a dead-letter queue for permanently failed
steps, (2) heartbeat monitoring to detect stalled agents, and (3) configurable
timeouts per node.

If I needed TypeScript, Mastra's workflow engine also supports suspending and resuming
with persistent storage. But LangGraph has the most mature checkpointing system."

---

### Q8: "How would you test agents in CI/CD without making API calls?"

**Model Answer:**

"Three approaches depending on the framework:

1. **Pydantic AI's TestModel** -- Provides deterministic responses without any API
   calls. Best for unit testing individual agent behaviors.

2. **Mock the LLM client** -- Replace the API client with a mock that returns
   predetermined responses. Works with any framework. Test tool selection logic by
   returning specific tool_calls in mock responses.

3. **Record/replay** -- Record real API responses during development, replay them in
   CI. Libraries like VCR.py or responses work well. Good for integration tests.

For all approaches, I'd write behavior tests ('given this input, the agent should
call these tools and produce output matching this schema') rather than implementation
tests ('the agent should make exactly 3 API calls')."

---

### Q9: "What's the difference between Pydantic AI and LangGraph's approach to type safety?"

**Model Answer:**

"Pydantic AI enforces types at the _agent boundary_ -- inputs, outputs, dependencies,
and tool arguments are all Pydantic models validated at runtime. If the LLM returns
invalid JSON, Pydantic AI automatically retries with the validation error as feedback.
This gives you 'if it compiles, it works' confidence.

LangGraph uses TypedDict for _state schemas_ and Annotated types for reducer
functions. This gives you type checking on state transitions but doesn't validate LLM
outputs automatically. You'd add Pydantic validation inside individual nodes.

They're complementary: you can use Pydantic models inside LangGraph nodes to get both
graph-level orchestration and output-level type safety."

---

### Q10: "Walk me through how you'd evaluate whether to adopt a new agent framework."

**Model Answer:**

"I'd run a structured evaluation:

1. **Implement a spike** -- Build the same agent in 2-3 candidate frameworks. Time
   how long each takes and measure code complexity.

2. **Stress test** -- Run 100+ concurrent agent sessions. Measure latency overhead,
   memory usage, and failure modes.

3. **Evaluate the escape hatches** -- Can I drop down to raw API calls when the
   framework's abstraction doesn't fit? Frameworks that trap you are dangerous.

4. **Check the bus factor** -- How many maintainers? Is it backed by a company?
   How active is the community? AutoGen's fragmentation is a cautionary tale.

5. **Assess migration cost** -- How coupled would my code be? Can I swap frameworks
   later? I'd build a thin abstraction layer if lock-in risk is high.

6. **Production readiness** -- Does it have observability hooks? Error recovery?
   Rate limiting? These unsexy features matter most in production."

---

## 14. Quick Reference

### Decision Tree for Framework Selection

```
START: What kind of agent system?
|
+-- Single agent with tools?
|   |
|   +-- Python? --> Pydantic AI (type-safe, simple)
|   +-- TypeScript? --> Mastra (full-stack)
|   +-- Minimal deps? --> Build from scratch
|   +-- Need Claude specifically? --> Claude Agent SDK
|
+-- Multi-agent with delegation?
|   |
|   +-- Clean handoffs? --> OpenAI Agents SDK
|   +-- Role-based teams? --> CrewAI
|   +-- Debate/negotiation? --> AutoGen/AG2
|
+-- Complex stateful workflow?
|   |
|   +-- Branching + cycles + checkpoints? --> LangGraph
|   +-- TypeScript + serverless? --> Mastra
|
+-- Prompt optimization?
|   |
|   +-- Systematic, metric-driven? --> DSPy
|
+-- Not sure?
    |
    +-- Prototype with Pydantic AI or CrewAI (fastest to start)
    +-- Move to LangGraph if you need more control
```

### Framework Cheat Sheet

```
+----------------+------------------+---------------------------+------------------+
| Framework      | Mental Model     | One-Line Pitch            | Install          |
+----------------+------------------+---------------------------+------------------+
| LangGraph      | State machine    | "Graphs for agents"       | pip install      |
|                | graph            |                           |   langgraph      |
+----------------+------------------+---------------------------+------------------+
| Claude SDK     | Agent loop       | "Claude Code as a library"| npm install      |
|                |                  |                           |   @anthropic-ai/ |
|                |                  |                           |   claude-agent-sdk|
+----------------+------------------+---------------------------+------------------+
| OpenAI SDK     | Handoff chain    | "Agents that delegate"    | pip install      |
|                |                  |                           |   openai-agents  |
+----------------+------------------+---------------------------+------------------+
| CrewAI         | Team of roles    | "Crew of specialists"     | pip install      |
|                |                  |                           |   crewai         |
+----------------+------------------+---------------------------+------------------+
| AutoGen/AG2    | Chat room        | "Agents that converse"    | pip install ag2  |
+----------------+------------------+---------------------------+------------------+
| DSPy           | Compiler         | "Programming, not         | pip install dspy |
|                |                  |  prompting"               |                  |
+----------------+------------------+---------------------------+------------------+
| Pydantic AI    | Typed function   | "FastAPI for agents"      | pip install      |
|                |                  |                           |   pydantic-ai    |
+----------------+------------------+---------------------------+------------------+
| Mastra         | Full-stack TS    | "Gatsby team's AI         | npm install      |
|                | toolkit          |  framework"               |   @mastra/core   |
+----------------+------------------+---------------------------+------------------+
```

### Key Concepts Glossary

| Term                  | Definition                                                               |
| --------------------- | ------------------------------------------------------------------------ |
| **Agent Loop**        | The core cycle: prompt LLM -> parse response -> execute tools -> repeat  |
| **Checkpointing**     | Saving agent state after each step for fault tolerance and resume        |
| **Guardrails**        | Input/output validation to prevent unsafe or invalid agent behavior      |
| **Handoff**           | Transferring control from one agent to another with context              |
| **Human-in-the-Loop** | Pausing agent execution for human review or approval                     |
| **MCP**               | Model Context Protocol -- open standard for agent-to-service integration |
| **Reducer**           | Function that merges state updates (e.g., append vs. replace)            |
| **Signature**         | DSPy's declarative input/output spec replacing manual prompts            |
| **State Machine**     | Model where agents transition between defined states via edges           |
| **Tool Schema**       | JSON Schema describing a tool's parameters for the LLM                   |
| **Tracing**           | Recording every step of agent execution for debugging and monitoring     |

---

_Next in the series: [07 - Production Deployment](./07-PRODUCTION-DEPLOYMENT.md)_
