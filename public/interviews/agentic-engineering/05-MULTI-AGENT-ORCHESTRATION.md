# Multi-Agent Orchestration

A comprehensive interview-prep guide for agentic engineers covering orchestration patterns, communication protocols, and practical implementations.

---

## Table of Contents

1. [Why Multi-Agent?](#1-why-multi-agent)
2. [Supervisor/Worker Pattern](#2-supervisorworker-pattern)
3. [Hierarchical Agents](#3-hierarchical-agents)
4. [Peer-to-Peer / Swarm](#4-peer-to-peer--swarm)
5. [Agent Handoffs](#5-agent-handoffs)
6. [Debate and Consensus](#6-debate-and-consensus)
7. [Pipeline/Sequential](#7-pipelinesequential)
8. [Parallel Fan-Out/Fan-In](#8-parallel-fan-outfan-in)
9. [Communication Protocols](#9-communication-protocols)
10. [Agent Routing](#10-agent-routing)
11. [Resource Management](#11-resource-management)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Why Multi-Agent?

### When Single Agents Fail

A single LLM agent hits hard limits as task complexity grows:

```
Single Agent Failure Modes
==========================

1. Context Window Saturation
   - Agent needs to hold code, docs, plan, and conversation
   - Quality degrades as you approach token limits
   - "Lost in the middle" problem: middle-context recall drops

2. Role Confusion
   - Prompt asks agent to be coder, tester, reviewer, planner
   - Competing instructions cause inconsistent behavior
   - "Jack of all trades, master of none"

3. Error Compounding
   - Single agent makes mistake at step 3
   - All subsequent steps build on the mistake
   - No external check to catch drift

4. Latency Bottleneck
   - Tasks that could run in parallel run sequentially
   - One slow API call blocks everything
   - No concurrency within a single agent loop

5. Tool Overload
   - Agent with 50+ tools struggles with tool selection
   - Each additional tool increases chance of wrong choice
   - Tool descriptions consume prompt budget
```

### Benefits of Specialization

Multi-agent systems mirror how effective human teams work:

```
+------------------+----------------------------+----------------------------+
| Dimension        | Single Agent               | Multi-Agent                |
+------------------+----------------------------+----------------------------+
| Context          | One window, shared across  | Each agent gets its own    |
|                  | all concerns               | focused context            |
+------------------+----------------------------+----------------------------+
| Expertise        | Generic prompt tries to    | Each agent has a tight,    |
|                  | cover everything           | specialized system prompt  |
+------------------+----------------------------+----------------------------+
| Error Recovery   | Self-review (unreliable)   | Cross-agent review catches |
|                  |                            | mistakes                   |
+------------------+----------------------------+----------------------------+
| Parallelism      | Sequential only            | Fan-out across agents      |
+------------------+----------------------------+----------------------------+
| Cost Control     | One model for everything   | Cheap models for simple    |
|                  |                            | tasks, powerful for hard   |
+------------------+----------------------------+----------------------------+
| Scalability      | Add more to the prompt     | Add more agents            |
+------------------+----------------------------+----------------------------+
```

### The Specialization Principle

> Give each agent one job, the minimal context it needs, and the fewest tools required for that job.

```
                    Single Agent (Overloaded)
                    =========================
                    System Prompt: "You are a full-stack engineer,
                    QA tester, security reviewer, technical writer,
                    and project manager..."
                    Tools: [50 tools]
                    Context: [everything]

                              vs.

         Multi-Agent (Specialized)
         =========================

  +----------+   +---------+   +----------+   +--------+
  | Planner  |   | Coder   |   | Reviewer |   | Tester |
  | 1 job    |   | 1 job   |   | 1 job    |   | 1 job  |
  | 3 tools  |   | 5 tools |   | 2 tools  |   | 4 tools|
  | Focused  |   | Focused |   | Focused  |   | Focused|
  +----------+   +---------+   +----------+   +--------+
```

---

## 2. Supervisor/Worker Pattern

The most common multi-agent architecture. A central supervisor agent receives tasks, decomposes them, delegates to specialist workers, and synthesizes results.

### Architecture

```
                        +------------------+
                        |   User Request   |
                        +--------+---------+
                                 |
                                 v
                     +-----------+-----------+
                     |      SUPERVISOR       |
                     |  - Decomposes tasks   |
                     |  - Selects workers    |
                     |  - Synthesizes output |
                     |  - Handles failures   |
                     +-----------+-----------+
                          |      |      |
                +---------+      |      +---------+
                |                |                |
                v                v                v
          +----------+    +----------+    +----------+
          | Worker A |    | Worker B |    | Worker C |
          | Research |    |  Coder   |    | Reviewer |
          +----------+    +----------+    +----------+
                |                |                |
                v                v                v
          +----------+    +----------+    +----------+
          |  Result  |    |  Result  |    |  Result  |
          +----------+    +----------+    +----------+
                |                |                |
                +--------+-------+--------+-------+
                         |
                         v
                  +------+------+
                  | Supervisor  |
                  | Synthesizes |
                  +------+------+
                         |
                         v
                  +------+------+
                  | Final Answer|
                  +-------------+
```

### LangGraph Implementation

```python
from typing import Annotated, Literal, TypedDict
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from langchain_anthropic import ChatAnthropic

# Define worker agents
def make_worker(system_prompt: str, tools: list):
    """Create a specialized worker agent."""
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    model_with_tools = model.bind_tools(tools)

    def worker(state: MessagesState) -> Command:
        messages = [{"role": "system", "content": system_prompt}] + state["messages"]
        response = model_with_tools.invoke(messages)
        return Command(
            update={"messages": [response]},
            goto="supervisor",  # Always report back
        )

    return worker

# Supervisor node
def supervisor(state: MessagesState) -> Command:
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    response = model.invoke([
        {
            "role": "system",
            "content": """You are a supervisor managing specialist agents.
            Available workers:
            - researcher: Finds information, reads documentation
            - coder: Writes and modifies code
            - reviewer: Reviews code for bugs and improvements

            Based on the conversation, decide the next step:
            - Route to a worker by responding with their name
            - Respond with "FINISH" if the task is complete

            Always include reasoning for your routing decision.""",
        },
        *state["messages"],
    ])

    content = response.content
    if "FINISH" in content:
        return Command(goto=END, update={"messages": [response]})

    # Parse which worker to route to
    next_worker = "coder"  # Default
    for worker_name in ["researcher", "coder", "reviewer"]:
        if worker_name in content.lower():
            next_worker = worker_name
            break

    return Command(
        goto=next_worker,
        update={"messages": [response]},
    )

# Build the graph
graph = StateGraph(MessagesState)
graph.add_node("supervisor", supervisor)
graph.add_node("researcher", make_worker(
    "You are a research specialist. Find relevant information.",
    tools=[search_tool, read_docs_tool],
))
graph.add_node("coder", make_worker(
    "You are a coding specialist. Write clean, tested code.",
    tools=[file_write_tool, run_code_tool],
))
graph.add_node("reviewer", make_worker(
    "You are a code reviewer. Find bugs and suggest improvements.",
    tools=[file_read_tool],
))

graph.add_edge(START, "supervisor")
app = graph.compile()
```

### CrewAI Implementation

```python
from crewai import Agent, Task, Crew, Process

# Define specialized agents
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, up-to-date technical information",
    backstory="Expert at finding and synthesizing technical documentation.",
    tools=[search_tool, scrape_tool],
    llm="claude-sonnet-4-20250514",
    verbose=True,
)

coder = Agent(
    role="Senior Software Engineer",
    goal="Write production-quality code following best practices",
    backstory="10+ years building distributed systems.",
    tools=[file_tool, terminal_tool],
    llm="claude-sonnet-4-20250514",
    verbose=True,
)

reviewer = Agent(
    role="Code Reviewer",
    goal="Identify bugs, security issues, and improvement opportunities",
    backstory="Security-focused engineer with deep testing experience.",
    tools=[file_tool],
    llm="claude-sonnet-4-20250514",
    verbose=True,
)

# Define tasks
research_task = Task(
    description="Research best practices for {topic}",
    expected_output="A summary of key findings with references",
    agent=researcher,
)

coding_task = Task(
    description="Implement the solution based on research findings",
    expected_output="Working code with tests",
    agent=coder,
    context=[research_task],  # Depends on research output
)

review_task = Task(
    description="Review the implementation for bugs and improvements",
    expected_output="Review report with actionable feedback",
    agent=reviewer,
    context=[coding_task],
)

# Create crew with hierarchical process (supervisor pattern)
crew = Crew(
    agents=[researcher, coder, reviewer],
    tasks=[research_task, coding_task, review_task],
    process=Process.hierarchical,
    manager_llm="claude-sonnet-4-20250514",
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "rate limiting middleware"})
```

### Key Design Decisions

| Decision              | Trade-off                                       |
| --------------------- | ----------------------------------------------- |
| Supervisor model size | Bigger = better routing, more expensive         |
| Worker autonomy       | More autonomy = fewer round trips, less control |
| Retry policy          | More retries = higher quality, higher cost      |
| State passing         | Full state = better context, more tokens        |

---

## 3. Hierarchical Agents

Extends the supervisor/worker pattern to multiple levels. Useful for complex organizations where a single supervisor cannot manage all workers effectively.

### Architecture

```
                          +------------------+
                          |  Executive Agent |
                          |  (Top-Level)     |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |                             |
           +--------+--------+          +--------+--------+
           | Engineering Lead|          | QA Lead         |
           | (Mid-Level)     |          | (Mid-Level)     |
           +--------+--------+          +--------+--------+
                    |                             |
           +--------+--------+           +--------+--------+
           |        |        |           |        |        |
        +--+--+  +--+--+  +-+---+    +--+--+  +--+--+  +-+---+
        |Front|  |Back |  |Infra|    |Unit |  | E2E |  |Perf |
        | end |  | end |  |     |    |Test |  |Test |  |Test |
        +-----+  +-----+  +-----+    +-----+  +-----+  +-----+
```

### LangGraph Hierarchical Implementation

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def build_team(team_name: str, members: dict[str, callable]) -> StateGraph:
    """Build a sub-graph representing a team with a lead and workers."""

    def team_lead(state: MessagesState) -> Command:
        model = ChatAnthropic(model="claude-sonnet-4-20250514")
        member_names = list(members.keys())

        response = model.invoke([
            {
                "role": "system",
                "content": f"""You are the {team_name} team lead.
                Your team members: {member_names}
                Route tasks to the right member or say DONE if complete.""",
            },
            *state["messages"],
        ])

        if "DONE" in response.content:
            return Command(goto=END, update={"messages": [response]})

        # Route to appropriate member
        for name in member_names:
            if name in response.content.lower():
                return Command(goto=name, update={"messages": [response]})

        return Command(goto=member_names[0], update={"messages": [response]})

    # Build team sub-graph
    team_graph = StateGraph(MessagesState)
    team_graph.add_node("lead", team_lead)

    for name, worker_fn in members.items():
        team_graph.add_node(name, worker_fn)
        team_graph.add_edge(name, "lead")  # Workers report to lead

    team_graph.add_edge(START, "lead")
    return team_graph.compile()


# Build individual teams
engineering_team = build_team("Engineering", {
    "frontend": make_worker("You write React components.", [file_tool]),
    "backend": make_worker("You write API endpoints.", [file_tool, db_tool]),
    "infra": make_worker("You handle deployment configs.", [file_tool]),
})

qa_team = build_team("QA", {
    "unit_tester": make_worker("You write unit tests.", [file_tool, test_tool]),
    "e2e_tester": make_worker("You write E2E tests.", [browser_tool]),
    "perf_tester": make_worker("You run performance benchmarks.", [bench_tool]),
})

# Top-level executive graph
def executive(state: MessagesState) -> Command:
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    response = model.invoke([
        {
            "role": "system",
            "content": """You are the executive orchestrator.
            Teams available: engineering, qa
            Route to the right team or say COMPLETE.""",
        },
        *state["messages"],
    ])

    if "COMPLETE" in response.content:
        return Command(goto=END, update={"messages": [response]})

    if "qa" in response.content.lower():
        return Command(goto="qa_team", update={"messages": [response]})

    return Command(goto="engineering_team", update={"messages": [response]})

top_graph = StateGraph(MessagesState)
top_graph.add_node("executive", executive)
top_graph.add_node("engineering_team", engineering_team)
top_graph.add_node("qa_team", qa_team)
top_graph.add_edge(START, "executive")
top_graph.add_edge("engineering_team", "executive")
top_graph.add_edge("qa_team", "executive")

app = top_graph.compile()
```

### When to Use Hierarchical Over Flat

```
Use Hierarchical When:                Use Flat When:
- >5 specialist workers               - 2-4 workers
- Workers cluster into domains         - Workers are independent
- Tasks require multi-step             - Tasks are simple delegation
  coordination within a domain
- You need cost isolation by team      - Cost tracking is simple
- Domain expertise needed at           - Supervisor can understand
  the routing level                      all worker capabilities
```

---

## 4. Peer-to-Peer / Swarm

No central coordinator. Agents communicate directly with each other and self-organize.

### Architecture

```
         +----------+          +----------+
         | Agent A  |<-------->| Agent B  |
         | Planner  |          | Coder    |
         +----+-----+          +-----+----+
              |  \                /   |
              |   \              /    |
              |    \            /     |
              |     \          /      |
              |      v        v       |
         +----+-----+          +-----+----+
         | Agent D  |<-------->| Agent C  |
         | Deployer |          | Tester   |
         +----------+          +----------+

    Each agent can message any other agent directly.
    No central supervisor. Agents negotiate who does what.
```

### OpenAI Swarm-Style Implementation

```python
"""
Swarm pattern: agents decide when to hand off to other agents.
Each agent has a list of agents it can transfer to.
The active agent runs until it decides to hand off.
"""

from dataclasses import dataclass, field

@dataclass(frozen=True)
class Agent:
    name: str
    system_prompt: str
    tools: tuple = ()
    handoff_targets: tuple = ()  # Other agents this one can hand off to

@dataclass(frozen=True)
class SwarmResult:
    agent: Agent
    messages: tuple
    is_complete: bool

def run_swarm(
    agents: dict[str, Agent],
    initial_agent: str,
    messages: list[dict],
    max_turns: int = 20,
) -> SwarmResult:
    """Run a swarm of agents that hand off to each other."""

    current_agent = agents[initial_agent]
    conversation = list(messages)

    for turn in range(max_turns):
        # Build tool list: agent's own tools + handoff tools
        available_tools = list(current_agent.tools)
        for target_name in current_agent.handoff_targets:
            available_tools.append({
                "type": "function",
                "function": {
                    "name": f"handoff_to_{target_name}",
                    "description": f"Transfer to {target_name}: {agents[target_name].system_prompt[:100]}",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "context": {
                                "type": "string",
                                "description": "Context to pass to the next agent",
                            }
                        },
                        "required": ["context"],
                    },
                },
            })

        # Completion tool
        available_tools.append({
            "type": "function",
            "function": {
                "name": "task_complete",
                "description": "Call when the overall task is finished",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                    },
                },
            },
        })

        response = call_llm(
            system=current_agent.system_prompt,
            messages=conversation,
            tools=available_tools,
        )

        conversation.append({"role": "assistant", "content": response.content})

        # Check for handoff or completion
        if response.tool_calls:
            tool_call = response.tool_calls[0]

            if tool_call.name == "task_complete":
                return SwarmResult(
                    agent=current_agent,
                    messages=tuple(conversation),
                    is_complete=True,
                )

            if tool_call.name.startswith("handoff_to_"):
                target_name = tool_call.name.replace("handoff_to_", "")
                context = tool_call.arguments.get("context", "")

                # Switch active agent
                current_agent = agents[target_name]
                conversation.append({
                    "role": "user",
                    "content": f"[Handoff from previous agent] Context: {context}",
                })
                continue

            # Regular tool call - execute and continue
            tool_result = execute_tool(tool_call)
            conversation.append({
                "role": "tool",
                "content": str(tool_result),
                "tool_call_id": tool_call.id,
            })

    return SwarmResult(
        agent=current_agent,
        messages=tuple(conversation),
        is_complete=False,
    )


# Define the swarm
agents = {
    "planner": Agent(
        name="planner",
        system_prompt="You decompose tasks into steps. Hand off to coder when ready.",
        handoff_targets=("coder", "researcher"),
    ),
    "coder": Agent(
        name="coder",
        system_prompt="You write code. Hand off to tester when implementation is done.",
        tools=(file_write_tool,),
        handoff_targets=("tester", "planner"),
    ),
    "tester": Agent(
        name="tester",
        system_prompt="You write and run tests. Hand off to coder if tests fail.",
        tools=(test_tool,),
        handoff_targets=("coder", "planner"),
    ),
    "researcher": Agent(
        name="researcher",
        system_prompt="You find information. Hand off to planner with findings.",
        tools=(search_tool,),
        handoff_targets=("planner",),
    ),
}

result = run_swarm(agents, "planner", [{"role": "user", "content": "Build a REST API"}])
```

### Emergent Behavior Considerations

```
Swarm Advantages:
  + No single point of failure (no supervisor bottleneck)
  + Agents can develop natural collaboration patterns
  + Scales horizontally - add new agents without changing others
  + Agents only activate when needed

Swarm Risks:
  - Circular handoffs: A -> B -> C -> A (infinite loop)
  - No global view of progress
  - Harder to debug and trace
  - Cost unpredictable (no central budget controller)
  - Agents may "pass the buck" on hard sub-tasks

Mitigations:
  - Max turn limits per agent and globally
  - Handoff history tracking to detect cycles
  - Logging/tracing at every handoff
  - Escalation path when agents are stuck
```

---

## 5. Agent Handoffs

The mechanism by which one agent transfers control and context to another. This is the fundamental primitive that all multi-agent patterns rely on.

### Handoff Protocol Design

```
Handoff Anatomy
===============

  Agent A (source)                    Agent B (target)
  ================                    ================

  1. Decides to hand off
     |
  2. Packages context:
     - Task summary
     - Work completed so far
     - Remaining work
     - Key constraints
     - Relevant artifacts
     |
  3. Selects target agent
     |
  4. Invokes handoff ------>  5. Receives context
                              |
                              6. Validates it can handle task
                              |
                              7. Begins execution
                              |
                              8. Completes or hands off again
```

### OpenAI Agents SDK Handoff Pattern

```python
"""
The OpenAI Agents SDK (formerly Swarm) treats handoffs as a first-class primitive.
An agent declares which other agents it can hand off to, and the framework
handles the context transfer.
"""

from agents import Agent, handoff, Runner

# Define agents with explicit handoff declarations
triage_agent = Agent(
    name="Triage",
    instructions="""You are a customer service triage agent.
    Classify the user's issue and hand off to the appropriate specialist:
    - Billing issues -> billing_agent
    - Technical problems -> tech_agent
    - General questions -> answer directly""",
    handoffs=[
        handoff(
            agent="billing_agent",
            description="Hand off billing and payment issues",
        ),
        handoff(
            agent="tech_agent",
            description="Hand off technical problems and bugs",
        ),
    ],
)

billing_agent = Agent(
    name="Billing",
    instructions="""You handle billing inquiries.
    You can look up invoices, process refunds, and update payment methods.
    If the issue is actually technical, hand off to tech_agent.""",
    tools=[lookup_invoice, process_refund],
    handoffs=[
        handoff(agent="tech_agent", description="Technical issues"),
        handoff(agent="triage_agent", description="Re-triage if misrouted"),
    ],
)

tech_agent = Agent(
    name="Tech Support",
    instructions="""You handle technical issues.
    You can check system status, restart services, and file bug reports.""",
    tools=[check_status, restart_service, file_bug],
    handoffs=[
        handoff(agent="billing_agent", description="Billing issues"),
        handoff(agent="triage_agent", description="Re-triage if misrouted"),
    ],
)

# Run the multi-agent system
result = Runner.run(
    starting_agent=triage_agent,
    messages=[{"role": "user", "content": "I was double-charged on my last invoice"}],
)
```

### Context Passing Strategies

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass(frozen=True)
class HandoffContext:
    """Immutable context object passed between agents."""
    task_description: str
    completed_steps: tuple[str, ...] = ()
    artifacts: tuple[tuple[str, Any], ...] = ()  # (name, value) pairs
    constraints: tuple[str, ...] = ()
    metadata: tuple[tuple[str, str], ...] = ()

    def with_step(self, step: str) -> "HandoffContext":
        """Return new context with an added completed step."""
        return HandoffContext(
            task_description=self.task_description,
            completed_steps=(*self.completed_steps, step),
            artifacts=self.artifacts,
            constraints=self.constraints,
            metadata=self.metadata,
        )

    def with_artifact(self, name: str, value: Any) -> "HandoffContext":
        """Return new context with an added artifact."""
        return HandoffContext(
            task_description=self.task_description,
            completed_steps=self.completed_steps,
            artifacts=(*self.artifacts, (name, value)),
            constraints=self.constraints,
            metadata=self.metadata,
        )

    def to_prompt(self) -> str:
        """Serialize context into a prompt-friendly format."""
        lines = [
            f"## Task: {self.task_description}",
            "",
            "## Completed Steps:",
            *[f"  - {s}" for s in self.completed_steps],
            "",
            "## Artifacts:",
            *[f"  - {name}: {value}" for name, value in self.artifacts],
            "",
            "## Constraints:",
            *[f"  - {c}" for c in self.constraints],
        ]
        return "\n".join(lines)


# Usage in a handoff
def perform_handoff(
    source_agent: str,
    target_agent: str,
    context: HandoffContext,
    reason: str,
) -> HandoffContext:
    """Execute a handoff between agents with full context transfer."""

    updated = context.with_step(
        f"Handed off from {source_agent} to {target_agent}: {reason}"
    )

    # Log for observability
    log_handoff(
        source=source_agent,
        target=target_agent,
        reason=reason,
        context_size=len(updated.to_prompt()),
    )

    return updated
```

### Handoff Anti-Patterns

```
ANTI-PATTERN                           FIX
============                           ===

1. Losing context on handoff           Always pass structured context,
   "Here, you handle this"             not just the raw user message

2. Circular handoffs                   Track handoff history, limit
   A -> B -> A -> B -> ...             max handoffs, detect cycles

3. Over-sharing context                Pass only what the target needs,
   Passing entire conversation         summarize if conversation is long

4. No handoff reason                   Always include WHY the handoff
   Target agent doesn't know           is happening and what's expected
   why it was activated

5. Hardcoded handoff targets           Use agent routing (Section 10)
   Can't adapt to new agents           for dynamic target selection
```

---

## 6. Debate and Consensus

Agents critique each other's outputs to improve quality. Inspired by "society of mind" and adversarial collaboration.

### Architecture

```
  Debate Pattern                     Consensus Pattern
  ==============                     =================

  +--------+    +--------+           +--------+ +--------+ +--------+
  |Proposer|--->|  Critic |          |Agent A | |Agent B | |Agent C |
  +--------+    +--------+           +---+----+ +---+----+ +---+----+
       ^             |                   |           |           |
       |             v                   v           v           v
       +-----[revised proposal]      +---+----+ +---+----+ +---+----+
                     |               |Answer A| |Answer B| |Answer C|
                     v               +---+----+ +---+----+ +---+----+
              +------+------+                \       |       /
              | Judge/Final |                 v      v      v
              | Arbiter     |              +---------+--------+
              +-------------+              |   Aggregator     |
                                           |  (vote/merge)    |
                                           +------------------+
```

### Debate Implementation

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class DebateRound:
    proposal: str
    critique: str
    round_number: int

def run_debate(
    task: str,
    max_rounds: int = 3,
    convergence_threshold: float = 0.9,
) -> str:
    """
    Run a proposer-critic debate until convergence or max rounds.
    """
    proposer = ChatAnthropic(model="claude-sonnet-4-20250514")
    critic = ChatAnthropic(model="claude-sonnet-4-20250514")
    judge = ChatAnthropic(model="claude-sonnet-4-20250514")

    rounds: list[DebateRound] = []

    # Initial proposal
    proposal = proposer.invoke([
        {"role": "system", "content": "You are a thoughtful problem solver. Provide a thorough answer."},
        {"role": "user", "content": task},
    ]).content

    for round_num in range(max_rounds):
        # Critic evaluates
        critique = critic.invoke([
            {
                "role": "system",
                "content": """You are a rigorous critic. Evaluate the proposal for:
                1. Correctness - Are there factual errors?
                2. Completeness - What is missing?
                3. Edge cases - What could go wrong?
                4. Clarity - Is the explanation clear?

                Rate confidence 0-1 that the proposal is production-ready.
                Format: CONFIDENCE: 0.X followed by your critique.""",
            },
            {"role": "user", "content": f"Task: {task}\n\nProposal:\n{proposal}"},
        ]).content

        rounds.append(DebateRound(proposal, critique, round_num))

        # Check convergence
        confidence = extract_confidence(critique)
        if confidence >= convergence_threshold:
            break

        # Proposer revises based on critique
        history = "\n\n".join(
            f"Round {r.round_number}:\nProposal: {r.proposal}\nCritique: {r.critique}"
            for r in rounds
        )

        proposal = proposer.invoke([
            {
                "role": "system",
                "content": "Revise your proposal based on the critique. Address every point raised.",
            },
            {"role": "user", "content": f"Task: {task}\n\nDebate history:\n{history}"},
        ]).content

    # Judge makes final decision
    final = judge.invoke([
        {
            "role": "system",
            "content": "You are the final judge. Synthesize the best answer from the debate.",
        },
        {
            "role": "user",
            "content": f"Task: {task}\n\nFinal proposal:\n{proposal}\n\nDebate history:\n{history}",
        },
    ]).content

    return final


def extract_confidence(critique: str) -> float:
    """Extract confidence score from critic's response."""
    import re
    match = re.search(r"CONFIDENCE:\s*(0\.\d+|1\.0)", critique)
    return float(match.group(1)) if match else 0.0
```

### Multi-Agent Voting

```python
from collections import Counter

def consensus_vote(
    task: str,
    num_agents: int = 5,
    agreement_threshold: float = 0.6,
) -> dict:
    """
    Multiple agents independently answer, then vote on the best answer.
    """
    model = ChatAnthropic(model="claude-sonnet-4-20250514")

    # Phase 1: Independent answers (can run in parallel)
    answers = []
    for i in range(num_agents):
        response = model.invoke([
            {
                "role": "system",
                "content": f"""You are expert agent #{i+1}.
                Provide your independent analysis. Do not hedge.
                End with: ANSWER: <your concise answer>""",
            },
            {"role": "user", "content": task},
        ])
        answers.append(response.content)

    # Phase 2: Each agent votes on the best answer
    votes = []
    for i, voter_answer in enumerate(answers):
        all_answers = "\n\n".join(
            f"Answer {j+1}: {a}" for j, a in enumerate(answers)
        )
        vote_response = model.invoke([
            {
                "role": "system",
                "content": """Review all answers and vote for the BEST one.
                You may vote for your own answer.
                Respond with: VOTE: <answer number> REASON: <why>""",
            },
            {"role": "user", "content": f"Task: {task}\n\n{all_answers}"},
        ])
        vote = extract_vote(vote_response.content)
        votes.append(vote)

    # Phase 3: Tally and check agreement
    vote_counts = Counter(votes)
    winner, winner_count = vote_counts.most_common(1)[0]
    agreement = winner_count / num_agents

    return {
        "winning_answer": answers[winner - 1],
        "agreement_ratio": agreement,
        "confident": agreement >= agreement_threshold,
        "vote_distribution": dict(vote_counts),
    }
```

### When Debate Adds Value

```
High Value:                           Low Value:
- Safety-critical code                - Simple CRUD operations
- Architectural decisions             - Well-defined transformations
- Ambiguous requirements              - Tasks with clear specs
- Security reviews                    - Boilerplate generation
- Complex reasoning chains            - Single-step tasks
```

---

## 7. Pipeline/Sequential

Each agent handles one stage of processing. Output of one agent becomes input to the next. Like a factory assembly line.

### Architecture

```
  Input
    |
    v
  +-------+     +--------+     +--------+     +--------+     +--------+
  | Stage1|---->| Stage2 |---->| Stage3 |---->| Stage4 |---->| Stage5 |
  |Analyze|     |  Plan  |     |  Code  |     |  Test  |     | Deploy |
  +-------+     +--------+     +--------+     +--------+     +--------+
    |               |               |               |              |
    v               v               v               v              v
  Analysis       Plan Doc       Source Code    Test Results    Deployed
  Report         + Tasks        + Tests        + Coverage      Artifact
```

### Implementation

```python
from dataclasses import dataclass, field
from typing import Callable, Any

@dataclass(frozen=True)
class PipelineStage:
    name: str
    agent_prompt: str
    tools: tuple = ()
    output_key: str = ""
    model: str = "claude-sonnet-4-20250514"

@dataclass(frozen=True)
class PipelineState:
    """Immutable pipeline state that accumulates results."""
    inputs: dict[str, Any]
    stage_outputs: tuple[tuple[str, Any], ...] = ()

    def with_output(self, key: str, value: Any) -> "PipelineState":
        return PipelineState(
            inputs=self.inputs,
            stage_outputs=(*self.stage_outputs, (key, value)),
        )

    def get_output(self, key: str) -> Any:
        for k, v in self.stage_outputs:
            if k == key:
                return v
        return None

    def all_outputs(self) -> dict[str, Any]:
        return dict(self.stage_outputs)


def run_pipeline(
    stages: list[PipelineStage],
    initial_input: str,
) -> PipelineState:
    """Execute a sequential pipeline of agent stages."""

    state = PipelineState(inputs={"original_request": initial_input})

    for i, stage in enumerate(stages):
        model = ChatAnthropic(model=stage.model)

        # Build context from previous stages
        prior_outputs = "\n\n".join(
            f"## {key}\n{value}" for key, value in state.stage_outputs
        )

        messages = [
            {
                "role": "system",
                "content": f"""{stage.agent_prompt}

You are stage {i+1} of {len(stages)} in a pipeline.
Your output will be passed to the next stage.
Be structured and clear in your output.""",
            },
            {
                "role": "user",
                "content": f"""Original request: {initial_input}

Previous stage outputs:
{prior_outputs}

Execute your stage now.""",
            },
        ]

        if stage.tools:
            model_with_tools = model.bind_tools(list(stage.tools))
            response = run_agent_loop(model_with_tools, messages, stage.tools)
        else:
            response = model.invoke(messages)

        state = state.with_output(
            stage.output_key or stage.name,
            response.content,
        )

    return state


# Define a code generation pipeline
code_pipeline = [
    PipelineStage(
        name="Requirements Analysis",
        agent_prompt="Analyze the request. Output structured requirements with acceptance criteria.",
        output_key="requirements",
        model="claude-haiku-4-20250414",  # Cheap model for analysis
    ),
    PipelineStage(
        name="Architecture Design",
        agent_prompt="Design the system architecture. Output file structure, interfaces, and data flow.",
        output_key="architecture",
        model="claude-sonnet-4-20250514",
    ),
    PipelineStage(
        name="Implementation",
        agent_prompt="Write the code following the architecture. Include error handling and types.",
        output_key="code",
        tools=(file_write_tool,),
        model="claude-sonnet-4-20250514",
    ),
    PipelineStage(
        name="Testing",
        agent_prompt="Write comprehensive tests for the implementation. Target 80%+ coverage.",
        output_key="tests",
        tools=(file_write_tool, test_runner_tool),
        model="claude-sonnet-4-20250514",
    ),
    PipelineStage(
        name="Review",
        agent_prompt="Review code and tests. Output a pass/fail verdict with specific issues.",
        output_key="review",
        model="claude-sonnet-4-20250514",
    ),
]

result = run_pipeline(code_pipeline, "Build a rate-limited API client")
```

### Pipeline with Conditional Stages

```python
def run_pipeline_with_gates(
    stages: list[PipelineStage],
    initial_input: str,
    gates: dict[int, Callable[[PipelineState], bool]] | None = None,
) -> PipelineState:
    """Pipeline with quality gates between stages."""

    gates = gates or {}
    state = PipelineState(inputs={"original_request": initial_input})

    for i, stage in enumerate(stages):
        # Check quality gate before proceeding
        if i in gates:
            gate_fn = gates[i]
            if not gate_fn(state):
                # Gate failed - loop back to previous stage with feedback
                state = state.with_output(
                    f"gate_{i}_failure",
                    f"Quality gate before {stage.name} failed. Previous output needs revision.",
                )
                # Re-run previous stage (simplified; production would be more sophisticated)
                continue

        response = execute_stage(stage, state, initial_input)
        state = state.with_output(stage.output_key or stage.name, response)

    return state

# Example gate: tests must pass before review
gates = {
    4: lambda state: "PASS" in (state.get_output("test_results") or ""),
}
```

---

## 8. Parallel Fan-Out/Fan-In

Distribute independent sub-tasks across agents running concurrently, then aggregate results.

### Architecture

```
                      +----------+
                      |  Input   |
                      +----+-----+
                           |
                    +------+------+
                    | Decomposer  |
                    +------+------+
                           |
              +------------+------------+
              |            |            |
         FAN-OUT      FAN-OUT      FAN-OUT
              |            |            |
              v            v            v
        +---------+  +---------+  +---------+
        | Agent 1 |  | Agent 2 |  | Agent 3 |
        | (async) |  | (async) |  | (async) |
        +---------+  +---------+  +---------+
              |            |            |
              v            v            v
        +---------+  +---------+  +---------+
        |Result 1 |  |Result 2 |  |Result 3 |
        +---------+  +---------+  +---------+
              |            |            |
              +------+-----+-----+-----+
                     |           |
                  FAN-IN      FAN-IN
                     |           |
               +-----+-----+    |
               | Aggregator|<---+
               +-----+-----+
                     |
                     v
               +-----+-----+
               | Final Out |
               +-----------+
```

### Implementation with asyncio

```python
import asyncio
from dataclasses import dataclass

@dataclass(frozen=True)
class SubTask:
    id: str
    description: str
    agent_prompt: str
    tools: tuple = ()

@dataclass(frozen=True)
class SubTaskResult:
    task_id: str
    output: str
    success: bool
    error: str = ""

async def execute_subtask(subtask: SubTask) -> SubTaskResult:
    """Execute a single subtask asynchronously."""
    try:
        model = ChatAnthropic(model="claude-sonnet-4-20250514")
        response = await model.ainvoke([
            {"role": "system", "content": subtask.agent_prompt},
            {"role": "user", "content": subtask.description},
        ])
        return SubTaskResult(
            task_id=subtask.id,
            output=response.content,
            success=True,
        )
    except Exception as e:
        return SubTaskResult(
            task_id=subtask.id,
            output="",
            success=False,
            error=str(e),
        )

async def fan_out_fan_in(
    task: str,
    max_parallel: int = 5,
) -> str:
    """
    Decompose a task, fan out to parallel agents, fan in results.
    """
    model = ChatAnthropic(model="claude-sonnet-4-20250514")

    # Step 1: Decompose into independent subtasks
    decomposition = await model.ainvoke([
        {
            "role": "system",
            "content": """Decompose this task into independent subtasks.
            Output JSON array: [{"id": "1", "description": "...", "agent_type": "..."}]
            Only create subtasks that can run in parallel (no dependencies).""",
        },
        {"role": "user", "content": task},
    ])

    subtasks = parse_subtasks(decomposition.content)

    # Step 2: Fan out - run all subtasks concurrently
    semaphore = asyncio.Semaphore(max_parallel)

    async def bounded_execute(subtask: SubTask) -> SubTaskResult:
        async with semaphore:
            return await execute_subtask(subtask)

    results = await asyncio.gather(
        *[bounded_execute(st) for st in subtasks],
        return_exceptions=True,
    )

    # Handle any exceptions from gather
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append(SubTaskResult(
                task_id=subtasks[i].id,
                output="",
                success=False,
                error=str(result),
            ))
        else:
            processed_results.append(result)

    # Step 3: Fan in - aggregate results
    results_text = "\n\n".join(
        f"## Subtask {r.task_id} ({'SUCCESS' if r.success else 'FAILED'})\n{r.output or r.error}"
        for r in processed_results
    )

    aggregated = await model.ainvoke([
        {
            "role": "system",
            "content": """Synthesize the subtask results into a coherent final output.
            Handle any failed subtasks gracefully.
            Ensure the combined result addresses the original task completely.""",
        },
        {
            "role": "user",
            "content": f"Original task: {task}\n\nSubtask results:\n{results_text}",
        },
    ])

    return aggregated.content
```

### LangGraph Fan-Out/Fan-In

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated
import operator

class FanOutState(TypedDict):
    task: str
    subtasks: list[str]
    results: Annotated[list[str], operator.add]  # Reducer: concatenate
    final_output: str

def decompose(state: FanOutState) -> dict:
    """Break task into parallel subtasks."""
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    response = model.invoke(f"Break this into 3 independent subtasks: {state['task']}")
    subtasks = parse_into_list(response.content)
    return {"subtasks": subtasks}

def route_to_workers(state: FanOutState) -> list[str]:
    """Send to all workers in parallel."""
    return ["worker_1", "worker_2", "worker_3"]

def make_worker(worker_id: int):
    def worker(state: FanOutState) -> dict:
        subtask = state["subtasks"][worker_id] if worker_id < len(state["subtasks"]) else ""
        model = ChatAnthropic(model="claude-sonnet-4-20250514")
        response = model.invoke(f"Complete this subtask: {subtask}")
        return {"results": [response.content]}
    return worker

def aggregate(state: FanOutState) -> dict:
    """Combine all worker results."""
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    combined = "\n\n".join(state["results"])
    response = model.invoke(f"Synthesize these results:\n{combined}")
    return {"final_output": response.content}

# Build graph
graph = StateGraph(FanOutState)
graph.add_node("decompose", decompose)
graph.add_node("worker_1", make_worker(0))
graph.add_node("worker_2", make_worker(1))
graph.add_node("worker_3", make_worker(2))
graph.add_node("aggregate", aggregate)

graph.add_edge(START, "decompose")
graph.add_conditional_edges("decompose", route_to_workers)
graph.add_edge("worker_1", "aggregate")
graph.add_edge("worker_2", "aggregate")
graph.add_edge("worker_3", "aggregate")
graph.add_edge("aggregate", END)

app = graph.compile()
```

### Practical Considerations

```
When to Fan Out:
- Code review of multiple files (1 agent per file)
- Multi-language translation (1 agent per language)
- Security analysis (1 agent per vulnerability category)
- Research across multiple sources (1 agent per source)
- Test generation for multiple modules

When NOT to Fan Out:
- Tasks with sequential dependencies
- Tasks requiring shared mutable state
- When aggregate context is needed (each subtask needs to see others)
- When cost of decomposition + aggregation > sequential execution
```

---

## 9. Communication Protocols

How agents exchange information determines the architecture's capabilities and limitations.

### Protocol Comparison

```
+------------------+--------------------+--------------------+--------------------+
| Protocol         | Message Passing    | Shared State       | Blackboard         |
+------------------+--------------------+--------------------+--------------------+
| How it works     | Agents send msgs   | Agents read/write  | Central knowledge  |
|                  | to each other      | a shared object    | store agents       |
|                  |                    |                    | post to/read from  |
+------------------+--------------------+--------------------+--------------------+
| Coupling         | Low (point-to-     | Medium (all agents | Low (agents only   |
|                  | point)             | share schema)      | know the board)    |
+------------------+--------------------+--------------------+--------------------+
| Scalability      | High               | Medium             | High               |
+------------------+--------------------+--------------------+--------------------+
| Debugging        | Trace messages     | Inspect state      | Read the board     |
+------------------+--------------------+--------------------+--------------------+
| Best for         | Handoffs, events   | Pipelines, shared  | Complex multi-step |
|                  |                    | context            | problem solving    |
+------------------+--------------------+--------------------+--------------------+
```

### Message Passing

```python
import asyncio
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class AgentMessage:
    sender: str
    recipient: str
    content: str
    msg_type: str = "request"  # request, response, broadcast
    correlation_id: str = ""
    metadata: tuple[tuple[str, str], ...] = ()

class MessageBus:
    """Central message broker for agent communication."""

    def __init__(self):
        self._queues: dict[str, asyncio.Queue] = {}
        self._subscribers: dict[str, list[str]] = {}  # topic -> [agent_ids]
        self._message_log: list[AgentMessage] = []

    def register(self, agent_id: str) -> None:
        self._queues[agent_id] = asyncio.Queue()

    async def send(self, message: AgentMessage) -> None:
        """Send a message to a specific agent."""
        self._message_log.append(message)
        if message.recipient in self._queues:
            await self._queues[message.recipient].put(message)

    async def broadcast(self, sender: str, topic: str, content: str) -> None:
        """Broadcast to all subscribers of a topic."""
        subscribers = self._subscribers.get(topic, [])
        for subscriber in subscribers:
            msg = AgentMessage(
                sender=sender,
                recipient=subscriber,
                content=content,
                msg_type="broadcast",
            )
            await self.send(msg)

    async def receive(self, agent_id: str, timeout: float = 30.0) -> AgentMessage:
        """Wait for a message addressed to this agent."""
        return await asyncio.wait_for(
            self._queues[agent_id].get(),
            timeout=timeout,
        )

    def subscribe(self, agent_id: str, topic: str) -> None:
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        self._subscribers[topic].append(agent_id)

    def get_trace(self) -> list[AgentMessage]:
        """Return full message history for debugging."""
        return list(self._message_log)
```

### Shared State (LangGraph Style)

```python
from typing import TypedDict, Annotated
import operator

class SharedState(TypedDict):
    """
    State shared across all agents in a LangGraph graph.
    Reducers define how concurrent updates are merged.
    """
    messages: Annotated[list, operator.add]     # Append-only message list
    plan: str                                    # Overwrite (last writer wins)
    code_files: Annotated[dict, merge_dicts]     # Merge dictionaries
    test_results: Annotated[list, operator.add]  # Append test results
    review_comments: Annotated[list, operator.add]
    status: str                                  # Current pipeline status

def merge_dicts(left: dict, right: dict) -> dict:
    """Custom reducer: merge two dicts (right overwrites left on conflict)."""
    return {**left, **right}

# Each node reads and writes to shared state
def planner_node(state: SharedState) -> dict:
    # Reads: state["messages"]
    # Writes: state["plan"]
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    plan = model.invoke([
        {"role": "system", "content": "Create an implementation plan."},
        *state["messages"],
    ]).content
    return {"plan": plan, "status": "planning_complete"}

def coder_node(state: SharedState) -> dict:
    # Reads: state["plan"], state["messages"]
    # Writes: state["code_files"]
    model = ChatAnthropic(model="claude-sonnet-4-20250514")
    code = model.invoke([
        {"role": "system", "content": f"Implement this plan:\n{state['plan']}"},
        *state["messages"],
    ]).content
    return {
        "code_files": {"main.py": code},
        "status": "coding_complete",
    }
```

### Blackboard Architecture

```python
from dataclasses import dataclass, field
from threading import Lock
from typing import Any
import time

@dataclass
class BlackboardEntry:
    key: str
    value: Any
    author: str
    timestamp: float
    entry_type: str  # "fact", "hypothesis", "solution", "constraint"

class Blackboard:
    """
    Central knowledge store. Agents read from and write to the blackboard.
    Inspired by classic AI blackboard systems.
    """

    def __init__(self):
        self._entries: dict[str, BlackboardEntry] = {}
        self._history: list[BlackboardEntry] = []
        self._lock = Lock()
        self._watchers: dict[str, list[callable]] = {}

    def post(self, key: str, value: Any, author: str, entry_type: str = "fact") -> None:
        """Agent posts information to the blackboard."""
        entry = BlackboardEntry(
            key=key,
            value=value,
            author=author,
            timestamp=time.time(),
            entry_type=entry_type,
        )
        with self._lock:
            self._entries[key] = entry
            self._history.append(entry)

        # Notify watchers
        for watcher in self._watchers.get(key, []):
            watcher(entry)

    def read(self, key: str) -> Any | None:
        """Agent reads information from the blackboard."""
        entry = self._entries.get(key)
        return entry.value if entry else None

    def query(self, entry_type: str | None = None, author: str | None = None) -> list[BlackboardEntry]:
        """Query entries by type or author."""
        results = list(self._entries.values())
        if entry_type:
            results = [e for e in results if e.entry_type == entry_type]
        if author:
            results = [e for e in results if e.author == author]
        return results

    def watch(self, key: str, callback: callable) -> None:
        """Register a callback for when a key is updated."""
        if key not in self._watchers:
            self._watchers[key] = []
        self._watchers[key].append(callback)

    def snapshot(self) -> dict[str, Any]:
        """Get current state of the entire blackboard."""
        return {k: v.value for k, v in self._entries.items()}


# Usage: Multi-agent problem solving with blackboard
async def blackboard_solve(task: str) -> str:
    board = Blackboard()
    board.post("task", task, author="system", entry_type="constraint")

    agents = [
        ("analyst", "Analyze the problem. Post requirements and constraints."),
        ("architect", "Read requirements. Post architecture design."),
        ("implementer", "Read architecture. Post implementation."),
        ("reviewer", "Read implementation. Post review and issues."),
    ]

    for agent_name, agent_role in agents:
        # Agent reads relevant entries from blackboard
        context = board.snapshot()
        model = ChatAnthropic(model="claude-sonnet-4-20250514")

        response = await model.ainvoke([
            {"role": "system", "content": agent_role},
            {"role": "user", "content": f"Blackboard state:\n{context}"},
        ])

        # Agent posts its contribution
        board.post(
            key=f"{agent_name}_output",
            value=response.content,
            author=agent_name,
            entry_type="solution",
        )

    return board.read("reviewer_output")
```

---

## 10. Agent Routing

Dynamically selecting which agent handles a task based on classification of the input.

### Architecture

```
                  +----------+
                  |  Input   |
                  +----+-----+
                       |
                       v
              +--------+--------+
              |     Router      |
              | (Classifier)    |
              +--+----+----+---+
                 |    |    |
    +------------+    |    +------------+
    |                 |                 |
    v                 v                 v
+--------+      +--------+      +--------+
|Agent A |      |Agent B |      |Agent C |
|SQL     |      |Code    |      |General |
|Expert  |      |Expert  |      |Chat    |
+--------+      +--------+      +--------+
```

### LLM-Based Router

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class AgentRoute:
    agent_id: str
    description: str
    examples: tuple[str, ...] = ()
    model: str = "claude-sonnet-4-20250514"
    system_prompt: str = ""

class AgentRouter:
    """Routes incoming tasks to the most appropriate agent."""

    def __init__(self, routes: list[AgentRoute]):
        self.routes = {r.agent_id: r for r in routes}
        self.classifier = ChatAnthropic(model="claude-haiku-4-20250414")  # Cheap, fast

    def route(self, task: str) -> AgentRoute:
        """Classify task and return the best agent route."""
        route_descriptions = "\n".join(
            f"- {r.agent_id}: {r.description}\n  Examples: {', '.join(r.examples)}"
            for r in self.routes.values()
        )

        response = self.classifier.invoke([
            {
                "role": "system",
                "content": f"""Classify the user's task to the most appropriate agent.
Available agents:
{route_descriptions}

Respond with ONLY the agent_id. Nothing else.""",
            },
            {"role": "user", "content": task},
        ])

        agent_id = response.content.strip().lower()
        if agent_id in self.routes:
            return self.routes[agent_id]

        # Fallback to general agent
        return self.routes.get("general", list(self.routes.values())[0])

    def route_with_confidence(self, task: str) -> tuple[AgentRoute, float]:
        """Route with confidence score for escalation decisions."""
        response = self.classifier.invoke([
            {
                "role": "system",
                "content": f"""Classify the task. Respond in JSON:
{{"agent_id": "...", "confidence": 0.0-1.0, "reasoning": "..."}}""",
            },
            {"role": "user", "content": task},
        ])

        result = parse_json(response.content)
        route = self.routes.get(result["agent_id"])
        confidence = result.get("confidence", 0.5)

        if not route or confidence < 0.5:
            return self.routes["general"], confidence

        return route, confidence


# Define routes
router = AgentRouter([
    AgentRoute(
        agent_id="sql_expert",
        description="Handles database queries, schema design, and SQL optimization",
        examples=("Write a query to...", "Optimize this SQL...", "Design a schema for..."),
    ),
    AgentRoute(
        agent_id="code_expert",
        description="Writes application code, implements features, fixes bugs",
        examples=("Implement a function that...", "Fix this bug...", "Refactor this class..."),
    ),
    AgentRoute(
        agent_id="devops_expert",
        description="Handles deployment, CI/CD, infrastructure, and monitoring",
        examples=("Set up a pipeline for...", "Configure Kubernetes...", "Add monitoring..."),
    ),
    AgentRoute(
        agent_id="general",
        description="Handles general questions and tasks that don't fit other categories",
        examples=("Explain how...", "What is...", "Help me understand..."),
    ),
])

# Usage
route = router.route("Write a SQL query to find duplicate customer records")
# -> Returns sql_expert route
```

### Embedding-Based Router (Faster, No LLM Call)

```python
import numpy as np
from dataclasses import dataclass

@dataclass(frozen=True)
class EmbeddingRoute:
    agent_id: str
    description: str
    embedding: tuple[float, ...]  # Pre-computed embedding

class EmbeddingRouter:
    """
    Routes using embedding similarity. Much faster than LLM-based routing.
    Suitable when you have many agents and need sub-100ms routing.
    """

    def __init__(self, routes: list[EmbeddingRoute], embedding_model):
        self.routes = routes
        self.embedding_model = embedding_model
        # Pre-compute route embeddings matrix
        self._embeddings_matrix = np.array([r.embedding for r in routes])

    def route(self, task: str) -> tuple[str, float]:
        """Route based on cosine similarity."""
        task_embedding = np.array(self.embedding_model.embed(task))

        # Cosine similarity
        similarities = np.dot(self._embeddings_matrix, task_embedding) / (
            np.linalg.norm(self._embeddings_matrix, axis=1) * np.linalg.norm(task_embedding)
        )

        best_idx = np.argmax(similarities)
        best_score = similarities[best_idx]

        return self.routes[best_idx].agent_id, float(best_score)
```

### Multi-Tier Routing

```
Tier 1: Keyword/Rule-Based (0ms, free)
  |
  | If no match or low confidence
  v
Tier 2: Embedding Similarity (5ms, cheap)
  |
  | If confidence < 0.7
  v
Tier 3: LLM Classification (500ms, expensive)
  |
  | If still unclear
  v
Tier 4: Human Escalation
```

---

## 11. Resource Management

Managing costs, token budgets, and rate limits across multiple agents.

### Token Budget Management

```python
from dataclasses import dataclass, field
from threading import Lock
import time

@dataclass
class TokenBudget:
    """Manages token allocation across agents."""
    total_budget: int
    consumed: int = 0
    _lock: Lock = field(default_factory=Lock, repr=False)

    @property
    def remaining(self) -> int:
        return self.total_budget - self.consumed

    def request(self, agent_id: str, estimated_tokens: int) -> bool:
        """Request token allocation. Returns True if approved."""
        with self._lock:
            if estimated_tokens <= self.remaining:
                self.consumed += estimated_tokens
                return True
            return False

    def report(self, agent_id: str, actual_tokens: int, estimated_tokens: int) -> None:
        """Report actual usage and adjust budget."""
        with self._lock:
            # Correct for estimation error
            difference = actual_tokens - estimated_tokens
            self.consumed += difference


@dataclass
class AgentCostTracker:
    """Track costs per agent for observability and optimization."""
    agent_costs: dict = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock, repr=False)

    def record(
        self,
        agent_id: str,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> float:
        """Record token usage and return cost in USD."""
        cost = self._calculate_cost(input_tokens, output_tokens, model)

        with self._lock:
            if agent_id not in self.agent_costs:
                self.agent_costs[agent_id] = {
                    "total_cost": 0.0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "calls": 0,
                }

            self.agent_costs[agent_id]["total_cost"] += cost
            self.agent_costs[agent_id]["total_input_tokens"] += input_tokens
            self.agent_costs[agent_id]["total_output_tokens"] += output_tokens
            self.agent_costs[agent_id]["calls"] += 1

        return cost

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Calculate cost based on model pricing."""
        pricing = {
            "claude-sonnet-4-20250514": {"input": 3.0 / 1_000_000, "output": 15.0 / 1_000_000},
            "claude-haiku-4-20250414": {"input": 0.80 / 1_000_000, "output": 4.0 / 1_000_000},
            "claude-opus-4-20250514": {"input": 15.0 / 1_000_000, "output": 75.0 / 1_000_000},
        }
        rates = pricing.get(model, pricing["claude-sonnet-4-20250514"])
        return (input_tokens * rates["input"]) + (output_tokens * rates["output"])

    def summary(self) -> str:
        """Print cost summary."""
        lines = ["Agent Cost Summary", "=" * 50]
        total = 0.0
        for agent_id, data in sorted(
            self.agent_costs.items(),
            key=lambda x: x[1]["total_cost"],
            reverse=True,
        ):
            lines.append(
                f"  {agent_id}: ${data['total_cost']:.4f} "
                f"({data['calls']} calls, "
                f"{data['total_input_tokens']+data['total_output_tokens']} tokens)"
            )
            total += data["total_cost"]
        lines.append(f"\n  TOTAL: ${total:.4f}")
        return "\n".join(lines)
```

### Rate Limiting Across Agents

```python
import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

@dataclass
class RateLimiter:
    """
    Shared rate limiter across all agents.
    Prevents hitting API rate limits when multiple agents run concurrently.
    """
    max_requests_per_minute: int = 50
    max_tokens_per_minute: int = 100_000
    _request_timestamps: deque = field(default_factory=deque)
    _token_counts: deque = field(default_factory=deque)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def acquire(self, estimated_tokens: int = 1000) -> None:
        """Wait until rate limit allows the request."""
        async with self._lock:
            now = time.time()
            window_start = now - 60

            # Clean old entries
            while self._request_timestamps and self._request_timestamps[0] < window_start:
                self._request_timestamps.popleft()
            while self._token_counts and self._token_counts[0][0] < window_start:
                self._token_counts.popleft()

            # Check request rate
            if len(self._request_timestamps) >= self.max_requests_per_minute:
                wait_time = self._request_timestamps[0] - window_start
                await asyncio.sleep(wait_time)

            # Check token rate
            current_tokens = sum(t[1] for t in self._token_counts)
            if current_tokens + estimated_tokens > self.max_tokens_per_minute:
                wait_time = self._token_counts[0][0] - window_start
                await asyncio.sleep(wait_time)

            self._request_timestamps.append(now)
            self._token_counts.append((now, estimated_tokens))


# Model selection for cost optimization
MODEL_TIERS = {
    "simple": "claude-haiku-4-20250414",    # Classification, extraction, simple Q&A
    "standard": "claude-sonnet-4-20250514", # Code gen, analysis, most tasks
    "complex": "claude-opus-4-20250514",    # Architecture, deep reasoning
}

def select_model(task_complexity: str, budget_remaining: float) -> str:
    """Select model based on task complexity and remaining budget."""
    if budget_remaining < 0.10:
        return MODEL_TIERS["simple"]  # Force cheapest when budget is low

    return MODEL_TIERS.get(task_complexity, MODEL_TIERS["standard"])
```

### Cost Optimization Strategies

```
Strategy                      Savings    Trade-off
==========================    =======    ============================
Use Haiku for routing         ~80%       Slightly less accurate routing
Cache repeated prompts        ~30-50%    Stale results for dynamic data
Summarize before handoff      ~40%       Possible information loss
Limit max agent iterations    ~20-60%    May cut off complex tasks
Parallel with early stop      ~15-30%    Might miss some results
Use structured output         ~10-20%    Less flexible responses
Model tiering by complexity   ~40-60%    Complex tasks need identification
```

---

## 12. Common Interview Questions

### Q1: When would you choose multi-agent over single-agent?

**Model Answer:**

I reach for multi-agent when I see one or more of these signals:

1. **Context pressure**: The single agent needs more context than fits comfortably in its window. For example, a coding task that requires understanding a full codebase, writing tests, and reviewing security -- each concern deserves its own focused context.

2. **Parallelizable sub-tasks**: If I can decompose the task into independent pieces (e.g., reviewing 10 files), running them concurrently through separate agents gives linear speedup.

3. **Conflicting roles**: Asking one agent to be both the coder and the critic creates a conflict. Separate agents with different system prompts produce better results because they don't have to "switch hats."

4. **Cost optimization**: Not every sub-task needs the most expensive model. I can route simple classification to Haiku and complex reasoning to Opus, saving 60%+ on total cost.

I would NOT use multi-agent for simple, self-contained tasks. The overhead of decomposition, routing, and aggregation only pays off when the task is genuinely complex.

---

### Q2: How do you prevent infinite loops in multi-agent systems?

**Model Answer:**

Multiple layers of defense:

1. **Global turn limit**: Hard cap on total agent invocations (e.g., 50 turns total across all agents). This is the backstop that guarantees termination.

2. **Per-agent turn limit**: Each individual agent gets at most N turns before being forced to produce output or escalate.

3. **Handoff cycle detection**: Track the handoff chain (A->B->C->A). If we see the same agent appear twice in the last K handoffs without new work being done, break the cycle.

4. **Progress detection**: After each agent turn, check if meaningful progress was made (new files created, tests passed, etc.). If no progress after N turns, escalate or terminate.

5. **Cost circuit breaker**: If total cost exceeds budget, stop immediately regardless of completion status.

```python
@dataclass(frozen=True)
class LoopGuard:
    max_global_turns: int = 50
    max_agent_turns: int = 10
    max_handoff_cycle_length: int = 3

    def check(self, history: tuple[str, ...]) -> bool:
        """Returns True if we should continue, False if we should stop."""
        if len(history) >= self.max_global_turns:
            return False

        # Check for cycles
        if len(history) >= self.max_handoff_cycle_length:
            recent = history[-self.max_handoff_cycle_length:]
            if len(set(recent)) == 1:  # Same agent repeated
                return False

        return True
```

---

### Q3: How do you handle failures in a multi-agent pipeline?

**Model Answer:**

I use a strategy inspired by distributed systems:

1. **Retry with backoff**: Transient failures (API timeout, rate limit) get automatic retries with exponential backoff. Typically 3 retries with jitter.

2. **Fallback agents**: If a specialist agent fails, route to a more general agent. For example, if the SQL expert is down, the general coding agent can attempt the task.

3. **Partial results**: In fan-out patterns, if 2 of 5 workers fail, I still aggregate the 3 successful results and note what's missing. Better than failing entirely.

4. **Checkpoint and resume**: For long pipelines, I persist state after each stage. If stage 4 fails, I can resume from stage 3's output without re-running stages 1-3.

5. **Graceful degradation**: Instead of hard failures, return what we have with a quality warning: "Analysis is 60% complete. The security review could not be performed due to tool access failure."

---

### Q4: How would you debug a multi-agent system that produces wrong outputs?

**Model Answer:**

Multi-agent debugging requires observability at three levels:

1. **Trace logging**: Every agent invocation, handoff, and tool call is logged with timestamps, inputs, outputs, and the agent that produced them. This gives me a complete timeline.

2. **Replay**: I serialize the full trace so I can replay any conversation deterministically. If agent C produced a wrong answer, I replay just the C invocation with its exact inputs.

3. **Intermediate output inspection**: I check each stage's output independently. The bug is usually at a boundary: agent A produced correct output, but agent B misinterpreted it. The handoff context was the problem.

4. **Ablation testing**: I remove agents one at a time to isolate which one causes the issue. If the system works with a single agent doing everything, the problem is in the orchestration.

5. **Prompt regression testing**: I maintain a set of golden test cases for each agent's system prompt. When I change a prompt, I run the test suite to catch regressions.

---

### Q5: Compare supervisor vs. swarm architectures. When do you use each?

**Model Answer:**

| Dimension    | Supervisor                          | Swarm                          |
| ------------ | ----------------------------------- | ------------------------------ |
| Control      | Centralized, predictable            | Decentralized, emergent        |
| Debugging    | Easy (inspect supervisor decisions) | Hard (trace peer-to-peer msgs) |
| Bottleneck   | Supervisor is SPOF                  | No single bottleneck           |
| Latency      | Supervisor adds a hop on every step | Direct agent-to-agent          |
| Cost control | Supervisor manages budget           | Each agent manages its own     |
| Scalability  | Limited by supervisor's context     | Scales horizontally            |

**I use supervisor when:**

- I need predictable, auditable behavior (enterprise, compliance)
- The task has clear decomposition (known sub-tasks up front)
- Cost control is critical (supervisor enforces budget)
- The team is small (<5 agents)

**I use swarm when:**

- The problem is exploratory (research, creative tasks)
- Agents need to iterate directly with each other without overhead
- I need fault tolerance (no SPOF)
- The agent pool is large and dynamic (agents join/leave)

In practice, I often use a hybrid: a light supervisor for routing and budget, with peer-to-peer handoffs between closely-related agents.

---

### Q6: How do you manage context window limits across agents?

**Model Answer:**

Context management is the most underrated challenge in multi-agent systems. My strategies:

1. **Context compression at handoff**: Before passing context to the next agent, I summarize the conversation. A 20k-token conversation becomes a 2k-token summary. The summarization itself costs tokens but saves much more downstream.

2. **Selective context**: Each agent only receives what it needs. The coder gets the plan and relevant code files, not the entire research report. I design handoff schemas that filter information.

3. **Hierarchical memory**: Recent context stays in the prompt. Older context goes to a retrieval system (vector store). The agent can pull relevant history on demand rather than carrying everything.

4. **Artifact separation**: Large outputs (generated code, data files) are stored as artifacts outside the conversation. Agents reference artifacts by ID rather than pasting entire contents into messages.

5. **Window monitoring**: I track token usage per agent and trigger summarization when an agent hits 70% of its context window. This prevents quality degradation from the "lost in the middle" problem.

---

### Q7: Design a multi-agent system for automated code review.

**Model Answer:**

```
                     +------------------+
                     |  PR Webhook      |
                     +--------+---------+
                              |
                              v
                     +--------+---------+
                     |  Orchestrator    |
                     |  (Supervisor)    |
                     +--+----+----+--+-+
                        |    |    |  |
           +------------+    |    |  +------------+
           |                 |    |               |
           v                 v    v               v
     +----------+    +------+--+ +--------+  +--------+
     |Diff       |   |Style    | |Security|  |Logic   |
     |Analyzer   |   |Checker  | |Scanner |  |Reviewer|
     |           |   |         | |        |  |        |
     |(Haiku)    |   |(Haiku)  | |(Sonnet)| |(Sonnet)|
     +-----+----+   +----+----+ +---+----+  +---+----+
           |              |          |           |
           v              v          v           v
     [Changed files] [Style       [Security   [Logic
      + context]      issues]      findings]   issues]
           |              |          |           |
           +------+-------+----+-----+-----+----+
                  |            |           |
                  v            v           v
           +------+------+  +-+--------+  |
           | Comment     |  | Severity |  |
           | Formatter   |  | Ranker   |  |
           | (Haiku)     |  | (Haiku)  |  |
           +------+------+  +----+-----+  |
                  |              |         |
                  v              v         v
           +------+--------------+---------+--+
           |        PR Comment Poster         |
           |     (posts to GitHub API)        |
           +----------------------------------+
```

Key design decisions:

- **Fan-out** the review across 4 specialist agents (parallel)
- **Model tiering**: Haiku for mechanical checks (style, formatting), Sonnet for reasoning-heavy tasks (security, logic)
- **Severity ranking**: Separate agent to prioritize findings, preventing comment spam
- **Idempotency**: Each review run produces a deterministic set of comments for the same diff

---

### Q8: How do you evaluate whether a multi-agent system is working well?

**Model Answer:**

I measure at three levels:

**System-level metrics:**

- Task completion rate (% of tasks fully resolved)
- End-to-end latency (wall clock time)
- Total cost per task
- Error rate (% of runs that fail or produce wrong results)

**Agent-level metrics:**

- Per-agent accuracy (is each agent doing its job correctly?)
- Utilization (how often is each agent invoked? Unused agents = wasted complexity)
- Token efficiency (tokens consumed vs. useful output produced)
- Handoff success rate (how often does the receiving agent successfully continue?)

**Orchestration-level metrics:**

- Routing accuracy (did the router pick the right agent?)
- Average number of handoffs per task (too many = inefficient routing)
- Loop/cycle frequency (how often do we hit cycle breakers?)
- Budget utilization (are we spending the token budget effectively?)

I set up dashboards for these metrics and alert on regression. For example, if routing accuracy drops below 85%, the router's prompt or training data needs updating.

---

## 13. Quick Reference

### Orchestration Pattern Comparison

```
+-------------------+------------+----------+---------+----------+-------------+
| Pattern           | Complexity | Latency  | Cost    | Control  | Best For    |
+-------------------+------------+----------+---------+----------+-------------+
| Supervisor/Worker | Medium     | Medium   | Medium  | High     | Most tasks, |
|                   |            |          |         |          | clear decomp|
+-------------------+------------+----------+---------+----------+-------------+
| Hierarchical      | High       | High     | High    | Very     | Large teams,|
|                   |            |          |         | High     | enterprise  |
+-------------------+------------+----------+---------+----------+-------------+
| Peer-to-Peer/     | High       | Low      | Varies  | Low      | Exploratory,|
| Swarm             |            |          |         |          | creative    |
+-------------------+------------+----------+---------+----------+-------------+
| Pipeline/         | Low        | High     | Low-    | High     | Well-defined|
| Sequential        |            | (serial) | Medium  |          | workflows   |
+-------------------+------------+----------+---------+----------+-------------+
| Fan-Out/Fan-In    | Medium     | Low      | Medium- | Medium   | Paralleliz- |
|                   |            | (parall) | High    |          | able tasks  |
+-------------------+------------+----------+---------+----------+-------------+
| Debate/Consensus  | Medium     | High     | High    | Medium   | High-stakes |
|                   |            |          |         |          | decisions   |
+-------------------+------------+----------+---------+----------+-------------+
| Agent Routing     | Low        | Low      | Low     | High     | Multi-domain|
|                   |            |          |         |          | triage      |
+-------------------+------------+----------+---------+----------+-------------+
```

### Decision Flowchart

```
Start: "Do I need multi-agent?"
  |
  v
Is the task decomposable into independent parts?
  |                          |
  YES                        NO
  |                          |
  v                          v
Can parts run in parallel?   Does the task need multiple
  |           |              expert perspectives?
  YES         NO             |           |
  |           |              YES         NO
  v           v              |           |
Fan-Out/    Pipeline         v           v
Fan-In                     Debate/     Single Agent
                           Consensus   (don't over-engineer)
  |
  v
Do I need centralized control?
  |                    |
  YES                  NO
  |                    |
  v                    v
How many agents?     Swarm/Peer-to-Peer
  |          |
  <5         5+
  |          |
  v          v
Supervisor  Hierarchical
```

### Framework Selection Guide

```
+---------------+------------------+------------------+------------------+
| Criterion     | LangGraph        | CrewAI           | OpenAI Agents SDK|
+---------------+------------------+------------------+------------------+
| Paradigm      | Graph-based      | Role-based       | Handoff-based    |
|               | state machine    | crews/tasks      | swarm            |
+---------------+------------------+------------------+------------------+
| Control       | Fine-grained     | High-level       | Agent-driven     |
|               | (nodes + edges)  | (declarative)    | (emergent)       |
+---------------+------------------+------------------+------------------+
| State Mgmt    | Typed state with | Automatic via    | Conversation     |
|               | custom reducers  | task context      | history          |
+---------------+------------------+------------------+------------------+
| Debugging     | LangSmith traces | Built-in logging | Manual tracing   |
+---------------+------------------+------------------+------------------+
| Streaming     | Built-in         | Limited          | Built-in         |
+---------------+------------------+------------------+------------------+
| Learning      | Steep (graph     | Gentle (roles    | Moderate         |
| Curve         | theory concepts) | and tasks)       |                  |
+---------------+------------------+------------------+------------------+
| Best For      | Complex flows    | Quick prototypes | Customer service |
|               | with conditions  | role-based teams | agent handoffs   |
+---------------+------------------+------------------+------------------+
| Production    | High             | Medium           | Medium           |
| Readiness     |                  |                  |                  |
+---------------+------------------+------------------+------------------+
```

### Key Formulas

```
Total Cost = sum(agent_i_calls * model_i_price_per_token * tokens_i)

Speedup from parallelism = T_sequential / T_parallel
  where T_parallel = max(T_agent_1, T_agent_2, ..., T_agent_n) + T_overhead

Optimal number of agents = ceil(task_complexity / agent_capacity)
  - Too few -> context overload, role confusion
  - Too many -> communication overhead, increased cost

Communication overhead = O(n^2) for fully connected
                       = O(n)   for supervisor pattern
                       = O(k*n) for hierarchical (k = levels)
```

### Anti-Pattern Checklist

```
[ ] "God Supervisor" - Supervisor does actual work instead of delegating
[ ] "Chatty Agents" - Agents exchange messages without making progress
[ ] "Context Dump" - Passing entire conversation history on every handoff
[ ] "Premature Multi-Agent" - Using 5 agents for a task one agent handles fine
[ ] "Homogeneous Agents" - All agents have the same prompt and tools
[ ] "No Exit Condition" - Agents loop forever without a termination check
[ ] "Blind Aggregation" - Combining results without quality checking
[ ] "Static Routing" - Hardcoded routing that can't adapt to new task types
```
