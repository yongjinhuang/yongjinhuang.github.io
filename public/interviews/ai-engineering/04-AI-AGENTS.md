# AI Agents

A practical guide to building AI agents -- autonomous systems that use LLMs to reason,
plan, and take actions using tools. Covers agent architectures, tool calling, memory
systems, multi-agent orchestration, and building agents from scratch in Python.

---

## Table of Contents

1. [What Are AI Agents?](#what-are-ai-agents)
2. [Agent Architectures](#agent-architectures)
3. [Tool Calling / Function Calling](#tool-calling--function-calling)
4. [Memory Systems](#memory-systems)
5. [Multi-Agent Orchestration](#multi-agent-orchestration)
6. [Agent Frameworks](#agent-frameworks)
7. [Building an Agent from Scratch](#building-an-agent-from-scratch)
8. [Error Handling and Reliability](#error-handling-and-reliability)
9. [Agent Evaluation](#agent-evaluation)
10. [Common Interview Questions](#common-interview-questions)
11. [Quick Reference](#quick-reference)

---

## What Are AI Agents?

An AI agent is a system that uses an LLM as its "brain" to autonomously decide what
actions to take, execute those actions using tools, observe the results, and iterate
until a task is complete.

```
+------------------------------------------------------------------+
| CHATBOT vs AGENT                                                  |
+------------------------------------------------------------------+
|                                                                    |
|  CHATBOT (Reactive)           AGENT (Autonomous)                  |
|  +------------------------+   +------------------------------+    |
|  | User asks question     |   | User gives goal              |    |
|  | Model answers          |   | Agent plans steps            |    |
|  | User asks follow-up    |   | Agent calls tools            |    |
|  | Model answers again    |   | Agent observes results        |    |
|  | ...                    |   | Agent decides next action     |    |
|  | (no action, no tools)  |   | Agent iterates until done     |    |
|  +------------------------+   +------------------------------+    |
|                                                                    |
|  Key difference: agents have TOOLS and can take ACTIONS           |
+------------------------------------------------------------------+
```

### Agent Loop

Every agent follows the same fundamental loop:

```
                    +-------------------+
                    |   User Goal       |
                    +--------+----------+
                             |
                             v
                    +-------------------+
              +---->|   Think/Plan      |<----+
              |     | (LLM reasoning)   |     |
              |     +--------+----------+     |
              |              |                |
              |              v                |
              |     +-------------------+     |
              |     |   Act             |     |
              |     | (call tool/API)   |     |
              |     +--------+----------+     |
              |              |                |
              |              v                |
              |     +-------------------+     |
              |     |   Observe         |     |
              +-----| (check result)    |-----+
                    +--------+----------+
                             |
                     (task complete?)
                             |
                             v
                    +-------------------+
                    |   Return Result   |
                    +-------------------+
```

---

## Agent Architectures

### 1. ReAct (Reasoning + Acting)

The most common agent pattern. The LLM alternates between reasoning (thinking about
what to do) and acting (calling tools).

```
User: "What's the weather in Tokyo and should I bring an umbrella?"

Thought: I need to check the weather in Tokyo. Let me use the weather tool.
Action: get_weather(location="Tokyo")
Observation: {"temp": 22, "condition": "rain", "humidity": 85}

Thought: It's raining in Tokyo. I should recommend an umbrella.
Action: respond("It's 22C and raining in Tokyo. Yes, bring an umbrella!")
```

```python
REACT_SYSTEM_PROMPT = """You are a helpful assistant with access to tools.

For each step, use this format:
Thought: [Your reasoning about what to do next]
Action: [tool_name(param1="value1", param2="value2")]

After receiving the observation, continue with another Thought/Action
or provide your final answer.

When you have enough information, respond with:
Thought: I have all the information needed.
Action: respond(message="[your final answer]")

Available tools:
{tool_descriptions}
"""
```

### 2. Plan-and-Execute

First create a complete plan, then execute each step. Better for complex multi-step
tasks where planning upfront leads to better outcomes.

```
User: "Research competitor X and create a comparison report"

Plan:
1. Search for competitor X's product features
2. Search for competitor X's pricing
3. Get our own product features and pricing
4. Compare features side-by-side
5. Analyze pricing differences
6. Generate comparison report

Execute:
Step 1: search_web("competitor X product features") -> [results]
Step 2: search_web("competitor X pricing 2025") -> [results]
Step 3: query_database("SELECT features, pricing FROM products") -> [data]
Step 4-6: [generate analysis and report]
```

```python
PLAN_AND_EXECUTE_PROMPT = """You are a planning agent. Given a task, create a
step-by-step plan to accomplish it.

Rules:
- Each step should be a single, concrete action
- Steps should be ordered by dependency
- Mark steps that can be parallelized
- Each step should map to one tool call

Output format:
Step 1: [action description] -> tool: [tool_name]
Step 2: [action description] -> tool: [tool_name]
...

Task: {task}
"""
```

### 3. Router Agent

A dispatcher that routes queries to specialized sub-agents based on intent.

```
+------------------------------------------------------------------+
|                    ROUTER AGENT                                    |
+------------------------------------------------------------------+
|                                                                    |
|  User Query --> [Router LLM] --> Which specialist?                |
|                      |                                             |
|        +-------------+---------------+                             |
|        |             |               |                             |
|        v             v               v                             |
|  +----------+  +----------+   +----------+                         |
|  | Code     |  | Research |   | Data     |                         |
|  | Agent    |  | Agent    |   | Agent    |                         |
|  | (writes, |  | (search, |   | (SQL,    |                         |
|  |  runs    |  |  browse, |   |  charts, |                         |
|  |  code)   |  |  summarize)|  |  analyze)|                        |
|  +----------+  +----------+   +----------+                         |
+------------------------------------------------------------------+
```

### Architecture Comparison

| Architecture | Strengths | Weaknesses | Best For |
|-------------|-----------|------------|----------|
| **ReAct** | Simple, flexible, adaptive | Can loop, hard to predict | General tasks, chatbots |
| **Plan-and-Execute** | Structured, predictable | Rigid, expensive planning | Complex multi-step tasks |
| **Router** | Specialized, efficient | Limited collaboration | Multi-domain systems |
| **Reflexion** | Self-correcting | Slow, expensive | High-stakes tasks |

---

## Tool Calling / Function Calling

Tools give agents the ability to interact with the real world -- APIs, databases,
file systems, web browsers.

### OpenAI Function Calling

```python
from openai import OpenAI
import json

client = OpenAI()

# Define tools
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name, e.g., 'San Francisco, CA'",
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "Temperature unit",
                    },
                },
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_database",
            "description": "Search the product database",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "limit": {"type": "integer", "description": "Max results"},
                },
                "required": ["query"],
            },
        },
    },
]

# Make request with tools
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What's the weather in Tokyo?"}],
    tools=tools,
    tool_choice="auto",
)

# Check if model wants to call a tool
message = response.choices[0].message
if message.tool_calls:
    for tool_call in message.tool_calls:
        function_name = tool_call.function.name
        arguments = json.loads(tool_call.function.arguments)
        print(f"Tool: {function_name}, Args: {arguments}")
        # Execute the function and send result back to model
```

### Anthropic Tool Use

```python
import anthropic
import json

client = anthropic.Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name",
                },
            },
            "required": ["location"],
        },
    },
]

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What's the weather in Tokyo?"}],
)

# Process tool use
for block in response.content:
    if block.type == "tool_use":
        tool_name = block.name
        tool_input = block.input
        tool_use_id = block.id
        print(f"Tool: {tool_name}, Input: {tool_input}")

        # Execute tool and return result
        tool_result = execute_tool(tool_name, tool_input)

        # Continue conversation with tool result
        follow_up = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            tools=tools,
            messages=[
                {"role": "user", "content": "What's the weather in Tokyo?"},
                {"role": "assistant", "content": response.content},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": json.dumps(tool_result),
                        }
                    ],
                },
            ],
        )
```

### Tool Design Best Practices

```
+------------------------------------------------------------------+
| TOOL DESIGN CHECKLIST                                             |
+------------------------------------------------------------------+
|                                                                    |
|  1. CLEAR NAMES: Use verb_noun format (get_weather, search_docs) |
|  2. GOOD DESCRIPTIONS: Help the LLM know WHEN to use the tool   |
|  3. TYPED PARAMETERS: Use JSON Schema with descriptions          |
|  4. BOUNDED OUTPUT: Return concise results, not entire databases |
|  5. ERROR MESSAGES: Return helpful errors the LLM can act on     |
|  6. IDEMPOTENT: Same input = same output (when possible)         |
|  7. SAFE BY DEFAULT: Read-only tools first, write tools gated    |
|  8. TIMEOUT: Set timeouts on all external calls                  |
+------------------------------------------------------------------+
```

---

## Memory Systems

Agents need memory to maintain context across interactions and learn from past
experiences.

### Memory Types

```
+------------------------------------------------------------------+
|                    AGENT MEMORY SYSTEMS                            |
+------------------------------------------------------------------+
|                                                                    |
|  SHORT-TERM MEMORY (Working Memory)                               |
|  +------------------------------------------------------------+   |
|  | Current conversation context                                |   |
|  | Tool call results from current session                      |   |
|  | Implementation: conversation message history                |   |
|  | Lifetime: single session/conversation                       |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  LONG-TERM MEMORY (Persistent)                                    |
|  +------------------------------------------------------------+   |
|  | Facts learned across sessions                               |   |
|  | User preferences and history                                |   |
|  | Implementation: vector DB + key-value store                 |   |
|  | Lifetime: indefinite                                        |   |
|  +------------------------------------------------------------+   |
|                                                                    |
|  EPISODIC MEMORY (Experience)                                     |
|  +------------------------------------------------------------+   |
|  | Summaries of past task executions                           |   |
|  | What worked, what failed, lessons learned                   |   |
|  | Implementation: structured logs + embeddings                |   |
|  | Lifetime: indefinite, pruned by relevance                   |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Memory Implementation

```python
from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class MemoryEntry:
    content: str
    memory_type: str  # "fact", "preference", "episode"
    timestamp: str
    relevance_score: float = 0.0


class AgentMemory:
    """Multi-layer memory system for an AI agent."""

    def __init__(self, max_short_term: int = 20):
        self._short_term: list[dict] = []
        self._long_term: list[MemoryEntry] = []
        self._max_short_term = max_short_term

    def add_message(self, role: str, content: str) -> "AgentMemory":
        """Add to short-term (conversation) memory. Returns new instance."""
        new_short_term = [*self._short_term, {"role": role, "content": content}]

        # Summarize and compress if too long
        if len(new_short_term) > self._max_short_term:
            new_short_term = self._compress_short_term(new_short_term)

        result = AgentMemory(self._max_short_term)
        result._short_term = new_short_term
        result._long_term = self._long_term
        return result

    def store_fact(self, fact: str) -> "AgentMemory":
        """Store a fact in long-term memory. Returns new instance."""
        entry = MemoryEntry(
            content=fact,
            memory_type="fact",
            timestamp=datetime.now().isoformat(),
        )
        result = AgentMemory(self._max_short_term)
        result._short_term = self._short_term
        result._long_term = [*self._long_term, entry]
        return result

    def store_episode(self, summary: str) -> "AgentMemory":
        """Store a task episode summary. Returns new instance."""
        entry = MemoryEntry(
            content=summary,
            memory_type="episode",
            timestamp=datetime.now().isoformat(),
        )
        result = AgentMemory(self._max_short_term)
        result._short_term = self._short_term
        result._long_term = [*self._long_term, entry]
        return result

    def get_relevant_memories(self, query: str, top_k: int = 5) -> list[MemoryEntry]:
        """Retrieve relevant long-term memories for current context."""
        # In production, use vector similarity search
        # This is a simplified keyword-based approach
        scored = []
        query_words = set(query.lower().split())
        for entry in self._long_term:
            entry_words = set(entry.content.lower().split())
            overlap = len(query_words & entry_words)
            scored.append(MemoryEntry(
                content=entry.content,
                memory_type=entry.memory_type,
                timestamp=entry.timestamp,
                relevance_score=overlap / max(len(query_words), 1),
            ))

        return sorted(scored, key=lambda x: x.relevance_score, reverse=True)[:top_k]

    def get_context_messages(self) -> list[dict]:
        """Get current conversation context for LLM."""
        return list(self._short_term)

    def _compress_short_term(self, messages: list[dict]) -> list[dict]:
        """Compress old messages into a summary."""
        # Keep system message + last N messages, summarize the rest
        midpoint = len(messages) // 2
        old_messages = messages[:midpoint]
        recent_messages = messages[midpoint:]

        summary_text = "Summary of earlier conversation: " + " | ".join(
            m["content"][:100] for m in old_messages if m["role"] != "system"
        )

        return [
            {"role": "system", "content": summary_text},
            *recent_messages,
        ]
```

---

## Multi-Agent Orchestration

Complex tasks benefit from multiple specialized agents working together.

### Orchestration Patterns

```
Pattern 1: SEQUENTIAL PIPELINE
+--------+    +--------+    +--------+    +--------+
| Agent1 |--->| Agent2 |--->| Agent3 |--->| Agent4 |
| Research|    | Analyze|    | Write  |    | Review |
+--------+    +--------+    +--------+    +--------+

Pattern 2: PARALLEL FAN-OUT / FAN-IN
                +--------+
          +---->| Agent1 |----+
          |     | Security|    |
+-------+ |    +--------+     |    +--------+
| Router|-+                    +--->| Merger |
|       |-+    +--------+     |    |        |
+-------+ |    | Agent2 |    |    +--------+
          +--->| Perf   |----+
          |    +--------+     |
          |    +--------+     |
          +--->| Agent3 |----+
               | Quality|
               +--------+

Pattern 3: SUPERVISOR
              +------------+
              | Supervisor  |
              | Agent       |
              +------+------+
                     |
         +-----------+-----------+
         |           |           |
    +----v---+  +----v---+  +----v---+
    | Worker |  | Worker |  | Worker |
    | Agent1 |  | Agent2 |  | Agent3 |
    +--------+  +--------+  +--------+
```

### Multi-Agent Implementation

```python
from dataclasses import dataclass
from typing import Callable

@dataclass(frozen=True)
class AgentConfig:
    name: str
    system_prompt: str
    model: str
    tools: list[dict]


def run_multi_agent_pipeline(
    client,
    task: str,
    agents: list[AgentConfig],
) -> dict:
    """Run a sequential multi-agent pipeline."""
    context = {"original_task": task, "steps": []}

    for agent_config in agents:
        # Build messages with accumulated context
        context_summary = "\n".join(
            f"[{step['agent']}]: {step['output'][:500]}"
            for step in context["steps"]
        )

        messages = [
            {"role": "system", "content": agent_config.system_prompt},
            {
                "role": "user",
                "content": f"Task: {task}\n\n"
                           f"Previous steps:\n{context_summary}\n\n"
                           f"Now complete your part.",
            },
        ]

        response = client.chat.completions.create(
            model=agent_config.model,
            messages=messages,
            tools=agent_config.tools if agent_config.tools else None,
        )

        output = response.choices[0].message.content
        context = {
            **context,
            "steps": [
                *context["steps"],
                {"agent": agent_config.name, "output": output},
            ],
        }

    return context


# Define specialized agents
research_agent = AgentConfig(
    name="Researcher",
    system_prompt="You are a research agent. Search for relevant information.",
    model="gpt-4o",
    tools=[],  # search tools would go here
)

analyst_agent = AgentConfig(
    name="Analyst",
    system_prompt="You are an analysis agent. Analyze the research findings.",
    model="gpt-4o",
    tools=[],
)

writer_agent = AgentConfig(
    name="Writer",
    system_prompt="You are a writing agent. Create a clear report from the analysis.",
    model="gpt-4o",
    tools=[],
)

# Run pipeline
result = run_multi_agent_pipeline(
    client,
    task="Analyze the impact of AI on software engineering jobs in 2025",
    agents=[research_agent, analyst_agent, writer_agent],
)
```

---

## Agent Frameworks

### Framework Comparison

| Framework | Architecture | Best For | Complexity | Production Ready |
|-----------|-------------|----------|-----------|-----------------|
| **LangChain** | Chain-based | General purpose | Medium | Yes |
| **LangGraph** | Graph-based | Complex workflows | High | Yes |
| **CrewAI** | Multi-agent | Role-based teams | Low | Growing |
| **Autogen** | Multi-agent | Conversational agents | Medium | Growing |
| **Semantic Kernel** | Plugin-based | Enterprise (.NET/Python) | Medium | Yes |
| **Haystack** | Pipeline-based | RAG + agents | Medium | Yes |

### LangGraph Example

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class AgentState(TypedDict):
    messages: list[dict]
    next_step: str
    result: str

def research_node(state: AgentState) -> AgentState:
    """Research step."""
    # Call LLM with research tools
    return {
        **state,
        "messages": [*state["messages"], {"role": "assistant", "content": "Research done"}],
        "next_step": "analyze",
    }

def analyze_node(state: AgentState) -> AgentState:
    """Analysis step."""
    return {
        **state,
        "messages": [*state["messages"], {"role": "assistant", "content": "Analysis done"}],
        "next_step": "write",
    }

def write_node(state: AgentState) -> AgentState:
    """Writing step."""
    return {
        **state,
        "result": "Final report content here",
        "next_step": "end",
    }

def router(state: AgentState) -> str:
    """Route to next node."""
    return state["next_step"]

# Build graph
workflow = StateGraph(AgentState)
workflow.add_node("research", research_node)
workflow.add_node("analyze", analyze_node)
workflow.add_node("write", write_node)

workflow.add_conditional_edges("research", router, {"analyze": "analyze"})
workflow.add_conditional_edges("analyze", router, {"write": "write"})
workflow.add_conditional_edges("write", router, {"end": END})

workflow.set_entry_point("research")
app = workflow.compile()
```

---

## Building an Agent from Scratch

A complete, minimal agent implementation without frameworks.

```python
import json
from openai import OpenAI
from dataclasses import dataclass

@dataclass(frozen=True)
class ToolResult:
    tool_name: str
    result: str
    success: bool


class SimpleAgent:
    """A minimal ReAct agent built from scratch."""

    def __init__(self, model: str = "gpt-4o", max_iterations: int = 10):
        self.client = OpenAI()
        self.model = model
        self.max_iterations = max_iterations
        self._tools: dict[str, callable] = {}
        self._tool_schemas: list[dict] = []

    def register_tool(self, name: str, func: callable, schema: dict) -> None:
        """Register a tool the agent can use."""
        self._tools[name] = func
        self._tool_schemas.append({
            "type": "function",
            "function": {"name": name, **schema},
        })

    def run(self, task: str) -> str:
        """Execute the agent loop until task completion or max iterations."""
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful AI agent. Use the provided tools to "
                    "accomplish the user's task. Think carefully before each "
                    "action. When you have enough information, provide your "
                    "final answer directly without calling any tools."
                ),
            },
            {"role": "user", "content": task},
        ]

        for iteration in range(self.max_iterations):
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=self._tool_schemas if self._tool_schemas else None,
                tool_choice="auto" if self._tool_schemas else None,
            )

            assistant_message = response.choices[0].message

            # If no tool calls, agent is done
            if not assistant_message.tool_calls:
                return assistant_message.content

            # Process tool calls
            messages.append(assistant_message)

            for tool_call in assistant_message.tool_calls:
                tool_result = self._execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_result.result,
                })

        return "Agent reached maximum iterations without completing the task."

    def _execute_tool(self, tool_call) -> ToolResult:
        """Execute a single tool call with error handling."""
        function_name = tool_call.function.name
        try:
            arguments = json.loads(tool_call.function.arguments)
        except json.JSONDecodeError:
            return ToolResult(
                tool_name=function_name,
                result="Error: Invalid JSON arguments",
                success=False,
            )

        func = self._tools.get(function_name)
        if func is None:
            return ToolResult(
                tool_name=function_name,
                result=f"Error: Unknown tool '{function_name}'",
                success=False,
            )

        try:
            result = func(**arguments)
            return ToolResult(
                tool_name=function_name,
                result=json.dumps(result) if not isinstance(result, str) else result,
                success=True,
            )
        except Exception as e:
            return ToolResult(
                tool_name=function_name,
                result=f"Error executing {function_name}: {str(e)}",
                success=False,
            )


# --- Usage Example ---

def get_weather(location: str, unit: str = "celsius") -> dict:
    """Simulated weather API."""
    return {"location": location, "temp": 22, "condition": "sunny", "unit": unit}

def search_web(query: str) -> dict:
    """Simulated web search."""
    return {"results": [f"Result about '{query}'"], "count": 1}

def calculate(expression: str) -> dict:
    """Safe math evaluation."""
    allowed_chars = set("0123456789+-*/.() ")
    if not all(c in allowed_chars for c in expression):
        return {"error": "Invalid expression"}
    return {"result": eval(expression)}  # In production, use a safe evaluator


# Create and configure agent
agent = SimpleAgent()

agent.register_tool("get_weather", get_weather, {
    "description": "Get current weather for a location",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City name"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
        },
        "required": ["location"],
    },
})

agent.register_tool("search_web", search_web, {
    "description": "Search the web for information",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
        },
        "required": ["query"],
    },
})

agent.register_tool("calculate", calculate, {
    "description": "Evaluate a mathematical expression",
    "parameters": {
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "Math expression"},
        },
        "required": ["expression"],
    },
})

# Run the agent
result = agent.run(
    "What's the weather in Tokyo? If it's above 20C, calculate 20 * 1.8 + 32 "
    "to convert to Fahrenheit."
)
print(result)
```

---

## Error Handling and Reliability

### Common Agent Failure Modes

```
+------------------------------------------------------------------+
| AGENT FAILURE MODES AND MITIGATIONS                               |
+------------------------------------------------------------------+
|                                                                    |
|  1. INFINITE LOOPS                                                |
|     Agent keeps calling the same tool with same arguments         |
|     Fix: max_iterations, loop detection, dedup tool calls         |
|                                                                    |
|  2. HALLUCINATED TOOL CALLS                                       |
|     Agent invents tools that do not exist                         |
|     Fix: strict tool validation, clear tool descriptions          |
|                                                                    |
|  3. WRONG TOOL SELECTION                                          |
|     Agent picks the wrong tool for the task                       |
|     Fix: better descriptions, few-shot examples, tool routing     |
|                                                                    |
|  4. MALFORMED ARGUMENTS                                           |
|     Agent passes invalid JSON or wrong parameter types            |
|     Fix: JSON schema validation, retry with error message         |
|                                                                    |
|  5. TOOL EXECUTION FAILURES                                       |
|     External API timeout, rate limit, error                       |
|     Fix: retry with backoff, fallback tools, error reporting      |
|                                                                    |
|  6. CONTEXT OVERFLOW                                              |
|     Too many tool results fill the context window                 |
|     Fix: summarize results, limit result size, sliding window     |
|                                                                    |
+------------------------------------------------------------------+
```

### Retry Logic

```python
import time

def execute_with_retry(
    func: callable,
    kwargs: dict,
    max_retries: int = 3,
    base_delay: float = 1.0,
) -> dict:
    """Execute a tool with exponential backoff retry."""
    last_error = None

    for attempt in range(max_retries):
        try:
            result = func(**kwargs)
            return {"success": True, "result": result, "attempts": attempt + 1}
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                time.sleep(delay)

    return {
        "success": False,
        "error": str(last_error),
        "attempts": max_retries,
    }
```

---

## Agent Evaluation

### Evaluation Dimensions

| Dimension | What to Measure | Metric |
|-----------|----------------|--------|
| **Task completion** | Did the agent complete the task? | Success rate (%) |
| **Correctness** | Is the final answer correct? | Accuracy, F1 |
| **Efficiency** | How many steps did it take? | Step count, token usage |
| **Tool accuracy** | Did it choose the right tools? | Tool selection accuracy |
| **Robustness** | Does it handle errors gracefully? | Recovery rate |
| **Safety** | Does it respect boundaries? | Violation rate |
| **Cost** | How much did it cost? | $/task |
| **Latency** | How long did it take? | End-to-end seconds |

### Evaluation Framework

```python
@dataclass(frozen=True)
class AgentTestCase:
    task: str
    expected_tools: list[str]
    expected_answer_contains: list[str]
    max_steps: int


def evaluate_agent(agent, test_cases: list[AgentTestCase]) -> dict:
    """Evaluate an agent on a set of test cases."""
    results = {
        "total": len(test_cases),
        "passed": 0,
        "failed": 0,
        "errors": 0,
        "avg_steps": 0,
        "details": [],
    }

    total_steps = 0

    for tc in test_cases:
        try:
            answer = agent.run(tc.task)

            # Check if answer contains expected content
            answer_correct = all(
                expected.lower() in answer.lower()
                for expected in tc.expected_answer_contains
            )

            if answer_correct:
                results["passed"] += 1
            else:
                results["failed"] += 1

            results["details"].append({
                "task": tc.task,
                "passed": answer_correct,
                "answer": answer[:200],
            })

        except Exception as e:
            results["errors"] += 1
            results["details"].append({
                "task": tc.task,
                "passed": False,
                "error": str(e),
            })

    results["success_rate"] = results["passed"] / max(results["total"], 1)
    return results
```

---

## Common Interview Questions

### Q1: Explain the ReAct agent pattern.

**Answer:** ReAct (Reasoning + Acting) is an agent architecture where the LLM alternates
between two modes: reasoning (thinking about what to do next based on the current state)
and acting (choosing and executing a tool). After each action, the agent observes the
result, reasons about it, and decides the next action. The loop continues until the
agent determines the task is complete. The key advantage is that reasoning traces make
the agent's decision process transparent and debuggable. The typical prompt format is
Thought -> Action -> Observation, repeated until done.

### Q2: How do you handle an agent that gets stuck in a loop?

**Answer:** Multiple strategies: (1) Set a hard max_iterations limit (e.g., 10-15 steps).
(2) Detect repeated tool calls with identical arguments and break the loop. (3) Track
a set of (tool_name, arguments) tuples and refuse duplicates. (4) If stuck, inject a
meta-prompt: "You seem to be repeating actions. Summarize what you know and provide
your best answer." (5) Use a timeout per task. (6) In production, monitor loop rates
and alert when they spike -- it often indicates a prompt or tool description problem.

### Q3: How do you design tools for an AI agent?

**Answer:** Good tool design follows these principles: (1) Clear, descriptive names
using verb_noun format (search_database, send_email). (2) Detailed descriptions that
explain WHEN to use the tool, not just what it does. (3) Well-typed parameters with
JSON Schema, including descriptions for each parameter. (4) Bounded output -- return
concise results, not raw database dumps. (5) Meaningful error messages the LLM can
reason about. (6) Idempotent where possible. (7) Separate read and write tools, with
write tools requiring explicit confirmation. (8) Set timeouts on all external calls.
The quality of tool descriptions is often more important than the agent prompt itself.

### Q4: Compare LangChain, LangGraph, and building from scratch.

**Answer:** LangChain provides high-level abstractions (chains, agents, tools) that
speed up prototyping but can be opaque and hard to debug. LangGraph adds graph-based
state machines for complex workflows with cycles, conditional branching, and
human-in-the-loop -- better for production systems. Building from scratch gives maximum
control and transparency with no abstraction overhead, but requires implementing
retry logic, memory management, and tool execution yourself. My recommendation: start
from scratch for simple agents (< 3 tools), use LangGraph for complex multi-step
workflows, and avoid LangChain's high-level agent abstractions in production due to
debugging difficulty.

### Q5: What are the key challenges with multi-agent systems?

**Answer:** (1) Communication overhead -- agents need to share context efficiently
without exceeding context windows. (2) Coordination -- deciding which agent acts next,
preventing conflicts, handling deadlocks. (3) Error propagation -- one agent's mistake
cascades through the pipeline. (4) Cost -- multiple LLM calls per task multiplies cost.
(5) Debugging -- tracing issues across agents is much harder than single-agent systems.
(6) Evaluation -- testing multi-agent interactions requires more complex test harnesses.
Best practice: start with a single agent, only add more when you can demonstrate a
measurable quality improvement from specialization.

---

## Quick Reference

### Agent Architecture Decision Tree

```
How complex is your task?
  |
  +--> Simple (1-3 tools, linear flow)
  |      --> Build from scratch, no framework needed
  |
  +--> Medium (3-10 tools, some branching)
  |      --> ReAct pattern with LangGraph or custom
  |
  +--> Complex (10+ tools, parallel work, human-in-loop)
         --> Multi-agent with LangGraph or supervisor pattern
```

### Tool Calling Checklist

```
[ ] Tool names are clear and descriptive
[ ] Tool descriptions explain WHEN to use, not just WHAT
[ ] Parameters have types and descriptions
[ ] Required vs optional parameters are specified
[ ] Output is bounded and concise
[ ] Error messages are LLM-parseable
[ ] Timeout is set on all external calls
[ ] Retry logic with exponential backoff
[ ] Logging for all tool executions
[ ] Rate limiting on expensive tools
```

### Cost Estimation for Agents

```
Average agent task:
  Planning:    ~500 tokens input + 200 output  = ~$0.004
  Per step:    ~1000 tokens input + 300 output  = ~$0.007
  Avg steps:   5 steps                          = ~$0.035
  Total/task:  ~$0.04 (GPT-4o pricing)

1000 agent tasks/day:
  ~$40/day = ~$1,200/month

Cost reduction:
  Use GPT-4o-mini for tool selection: ~$0.004/task
  Use GPT-4o only for final answer:   ~$0.010/task
  Mixed: ~$0.014/task = $14/day = ~$420/month (65% savings)
```
