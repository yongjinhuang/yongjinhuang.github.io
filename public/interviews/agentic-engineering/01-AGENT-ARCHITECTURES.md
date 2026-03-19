# Agent Architectures: A Comprehensive Interview Guide

> A deep-dive reference for agentic engineers covering every major architecture
> pattern, with ASCII diagrams, Python pseudocode, and interview questions.

---

## Table of Contents

1. [The Agent Loop](#1-the-agent-loop)
2. [ReAct Pattern](#2-react-pattern)
3. [Plan-and-Execute](#3-plan-and-execute)
4. [Reflection / Self-Critique](#4-reflection--self-critique)
5. [Tool-Use Loop](#5-tool-use-loop)
6. [Router / Dispatcher](#6-router--dispatcher)
7. [DAG-Based Orchestration](#7-dag-based-orchestration)
8. [Human-in-the-Loop Architectures](#8-human-in-the-loop-architectures)
9. [Choosing the Right Architecture](#9-choosing-the-right-architecture)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Quick Reference](#11-quick-reference)

---

## 1. The Agent Loop

### Core Concept

An agent is a system that uses an LLM as its reasoning engine inside a loop.
Unlike a single prompt-response call, the agent **repeatedly** observes its
environment, reasons about what to do, acts, and then feeds the result back
in as the next observation. The loop continues until a stopping condition is
met (task complete, max iterations, error).

```
+----------------------------------------------------------+
|                     THE AGENT LOOP                       |
|                                                          |
|   +----------+     +---------+     +--------+            |
|   |          |     |         |     |        |            |
|   | OBSERVE  +---->| THINK   +---->|  ACT   |            |
|   |          |     | (LLM)   |     |        |            |
|   +----^-----+     +---------+     +---+----+            |
|        |                               |                 |
|        |        +------------+         |                 |
|        +--------+ FEEDBACK   |<--------+                 |
|                 | (tool result,        |                 |
|                 |  env change)         |                 |
|                 +------------+         |                 |
|                                                          |
|   Stop condition: task_complete OR max_steps reached     |
+----------------------------------------------------------+
```

### Why a Loop?

Single LLM calls are stateless and one-shot. Real tasks require:

- **Multi-step reasoning** -- breaking a problem into sub-problems
- **External information** -- querying APIs, databases, file systems
- **Error recovery** -- retrying failed actions with new strategies
- **Accumulation** -- building up context over several interactions

### Python Implementation

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class AgentState:
    messages: tuple = ()
    step: int = 0
    max_steps: int = 20
    task_complete: bool = False


def agent_loop(initial_state: AgentState, llm, tools: dict) -> AgentState:
    """Core agent loop: observe -> think -> act -> feedback."""
    state = initial_state

    while not state.task_complete and state.step < state.max_steps:
        # THINK: LLM decides what to do next
        response = llm.chat(messages=state.messages)

        # Check if the LLM wants to stop
        if response.stop_reason == "end_turn":
            return AgentState(
                messages=(*state.messages, response.message),
                step=state.step + 1,
                max_steps=state.max_steps,
                task_complete=True,
            )

        # ACT: Execute the tool the LLM selected
        tool_name = response.tool_call.name
        tool_args = response.tool_call.arguments
        tool_fn = tools[tool_name]

        try:
            result = tool_fn(**tool_args)
        except Exception as e:
            result = f"Error: {e}"

        # FEEDBACK: Append the result and loop again
        state = AgentState(
            messages=(
                *state.messages,
                response.message,
                {"role": "tool", "content": str(result)},
            ),
            step=state.step + 1,
            max_steps=state.max_steps,
            task_complete=False,
        )

    return state
```

### Key Design Decisions

| Decision           | Options                                   | Trade-off                |
| ------------------ | ----------------------------------------- | ------------------------ |
| Stop condition     | LLM decides / max steps / external signal | Autonomy vs. safety      |
| Memory             | Full history / sliding window / summary   | Cost vs. context quality |
| Error handling     | Retry / skip / escalate                   | Robustness vs. cost      |
| Observation format | Raw / summarized / structured             | Token cost vs. fidelity  |

### Interview Tip

> When asked "What is an agent?", start with the loop. An agent is not just
> an LLM -- it is a **loop** that uses an LLM as a reasoning engine, with
> tool access and a feedback mechanism. The loop is the defining characteristic.

---

## 2. ReAct Pattern

### Core Concept

**ReAct** (Reasoning + Acting) interleaves chain-of-thought reasoning with
action execution. At each step the LLM explicitly produces a **Thought**
(reasoning trace), then an **Action** (tool call), and receives an
**Observation** (tool result). This structure makes the agent's reasoning
transparent and debuggable.

```
+----------------------------------------------------------------+
|                       ReAct PATTERN                            |
|                                                                |
|  Step 1:                                                       |
|    Thought: "I need to find the population of France."         |
|    Action:  search("population of France 2024")                |
|    Observation: "67.75 million (2024 estimate)"                |
|                                                                |
|  Step 2:                                                       |
|    Thought: "Now I need the population of Germany."            |
|    Action:  search("population of Germany 2024")               |
|    Observation: "84.48 million (2024 estimate)"                |
|                                                                |
|  Step 3:                                                       |
|    Thought: "I have both numbers. Germany > France by ~16.7M." |
|    Action:  finish("Germany has more people: 84.48M vs 67.75M")|
|    Observation: [DONE]                                         |
+----------------------------------------------------------------+
```

### Detailed Flow

```
     User Question
          |
          v
  +-------+--------+
  | Format prompt   |
  | with ReAct      |
  | instructions    |
  +-------+--------+
          |
          v
  +-------+--------+     +------------------+
  | LLM generates   |     |                  |
  | Thought + Action +---->| Parse action     |
  |                  |     | from LLM output  |
  +------------------+     +--------+---------+
                                    |
                           +--------v---------+
                           | Execute tool      |
                           | (search, calc,    |
                           |  code, etc.)      |
                           +--------+----------+
                                    |
                           +--------v---------+
                           | Append            |
                           | Observation to    |
                           | conversation      |
                           +--------+----------+
                                    |
                            +-------v-------+
                            | Is action     |
                            | "finish"?     |
                            +---+-------+---+
                                |       |
                               YES      NO
                                |       |
                                v       +---> (loop back to LLM)
                           Return answer
```

### Python Implementation

```python
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ReActStep:
    thought: str
    action: str
    action_input: str
    observation: str = ""


@dataclass(frozen=True)
class ReActState:
    question: str
    steps: tuple[ReActStep, ...] = ()
    answer: str | None = None


REACT_SYSTEM_PROMPT = """You are a helpful assistant. Answer the user's question
by using tools. For each step, output exactly:

Thought: <your reasoning about what to do next>
Action: <tool_name>
Action Input: <input to the tool>

Available tools:
- search: Search the web for information. Input: a search query string.
- calculator: Evaluate a math expression. Input: a math expression string.
- finish: Return the final answer. Input: the answer string.

You MUST call finish when you have the answer. Do NOT answer directly."""


def parse_react_output(text: str) -> ReActStep:
    """Parse Thought/Action/Action Input from LLM output."""
    thought_match = re.search(r"Thought:\s*(.+?)(?:\n|$)", text)
    action_match = re.search(r"Action:\s*(.+?)(?:\n|$)", text)
    input_match = re.search(r"Action Input:\s*(.+?)(?:\n|$)", text)

    return ReActStep(
        thought=thought_match.group(1).strip() if thought_match else "",
        action=action_match.group(1).strip() if action_match else "",
        action_input=input_match.group(1).strip() if input_match else "",
    )


def react_loop(question: str, llm, tools: dict, max_steps: int = 10) -> ReActState:
    """Execute the ReAct loop until finish or max steps."""
    state = ReActState(question=question)

    messages = [
        {"role": "system", "content": REACT_SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]

    for _ in range(max_steps):
        response = llm.chat(messages=messages)
        step = parse_react_output(response.text)

        if step.action == "finish":
            return ReActState(
                question=state.question,
                steps=state.steps,
                answer=step.action_input,
            )

        # Execute the tool
        tool_fn = tools.get(step.action)
        if tool_fn is None:
            observation = f"Error: Unknown tool '{step.action}'"
        else:
            try:
                observation = str(tool_fn(step.action_input))
            except Exception as e:
                observation = f"Error: {e}"

        completed_step = ReActStep(
            thought=step.thought,
            action=step.action,
            action_input=step.action_input,
            observation=observation,
        )

        state = ReActState(
            question=state.question,
            steps=(*state.steps, completed_step),
            answer=None,
        )

        # Append to message history for next iteration
        messages = [
            *messages,
            {"role": "assistant", "content": response.text},
            {"role": "user", "content": f"Observation: {observation}"},
        ]

    return state  # Max steps reached without finishing
```

### Strengths and Weaknesses

| Strengths                           | Weaknesses                       |
| ----------------------------------- | -------------------------------- |
| Transparent reasoning trace         | Higher token usage per step      |
| Easy to debug (read the Thoughts)   | Can get stuck in loops           |
| Flexible -- works with any tools    | No upfront planning              |
| Proven on knowledge-intensive tasks | Sequential -- one tool at a time |

### When to Use ReAct

- Open-ended question answering with tool use
- Tasks where you need an audit trail of reasoning
- Scenarios where the path to the answer is not known upfront

---

## 3. Plan-and-Execute

### Core Concept

Instead of interleaving reasoning and action step-by-step (like ReAct),
**Plan-and-Execute** separates planning from execution:

1. **Plan**: The LLM creates a full plan (list of steps) upfront.
2. **Execute**: Each step is executed in order, potentially by a simpler agent.
3. **Replan** (optional): After execution, the planner reviews progress and
   adjusts the remaining plan.

This is analogous to how a project manager (planner) delegates work items to
an engineer (executor).

```
+-------------------------------------------------------------------+
|                    PLAN-AND-EXECUTE                                |
|                                                                   |
|  +-----------+     +------------------+     +---------------+     |
|  |           |     |                  |     |               |     |
|  |  PLANNER  +---->|  STEP EXECUTOR   +---->|  REPLANNER    |     |
|  |  (LLM)    |     |  (Agent/Tool)    |     |  (LLM)        |     |
|  |           |     |                  |     |               |     |
|  +-----+-----+     +--------+---------+     +-------+-------+     |
|        |                    |                       |             |
|        v                    v                       v             |
|   Plan:                Result:                 Updated Plan:      |
|   1. Search X          "X = 42"               1. [DONE] Search X |
|   2. Search Y                                 2. Search Y        |
|   3. Compare                                  3. Compare         |
|   4. Summarize                                4. Summarize       |
|                                                                   |
|   Repeat: Execute step 2, then replan, execute step 3, ...       |
+-------------------------------------------------------------------+
```

### Detailed Architecture

```
          User Task
              |
              v
      +-------+--------+
      |   PLANNER LLM   |
      |  "Break this     |
      |   into steps"    |
      +-------+----------+
              |
              v
      Plan = [step1, step2, step3, ...]
              |
              v
      +-------+----------+    For each step:
      |   EXECUTOR        |<---+
      |   (may be a full  |    |
      |    ReAct agent)   |    |
      +-------+-----------+    |
              |                |
              v                |
      +-------+-----------+   |
      |   REPLANNER LLM   |   |
      |   "Given results   |   |
      |    so far, update  |   |
      |    remaining plan" |   |
      +-------+-----------+   |
              |                |
              +--- more steps -+
              |
              v
         Final Answer
```

### Python Implementation

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class PlanStep:
    description: str
    result: str | None = None
    status: str = "pending"  # pending | complete | failed


@dataclass(frozen=True)
class PlanState:
    task: str
    steps: tuple[PlanStep, ...] = ()
    final_answer: str | None = None


def create_plan(task: str, llm) -> tuple[PlanStep, ...]:
    """Use the LLM to generate an initial plan."""
    response = llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "You are a planner. Given a task, output a numbered list of "
                "steps to complete it. Each step should be a single, concrete "
                "action. Output ONLY the numbered list, nothing else."
            ),
        },
        {"role": "user", "content": task},
    ])

    lines = [
        line.strip()
        for line in response.text.strip().split("\n")
        if line.strip()
    ]
    return tuple(
        PlanStep(description=line.lstrip("0123456789.) "))
        for line in lines
    )


def execute_step(step: PlanStep, context: str, executor_agent) -> PlanStep:
    """Execute a single plan step using an executor agent."""
    prompt = (
        f"Context so far:\n{context}\n\n"
        f"Execute this step: {step.description}\n"
        f"Return the result."
    )
    try:
        result = executor_agent.run(prompt)
        return PlanStep(
            description=step.description,
            result=result,
            status="complete",
        )
    except Exception as e:
        return PlanStep(
            description=step.description,
            result=f"Error: {e}",
            status="failed",
        )


def replan(state: PlanState, llm) -> tuple[PlanStep, ...]:
    """Review progress and update remaining steps."""
    completed = "\n".join(
        f"- [DONE] {s.description}: {s.result}"
        for s in state.steps if s.status == "complete"
    )
    remaining = "\n".join(
        f"- [TODO] {s.description}"
        for s in state.steps if s.status == "pending"
    )

    response = llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "You are a replanner. Given completed and remaining steps, "
                "output an updated list of remaining steps. You may add, "
                "remove, or modify steps. Output ONLY the numbered list."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Task: {state.task}\n\n"
                f"Completed:\n{completed}\n\n"
                f"Remaining:\n{remaining}"
            ),
        },
    ])

    lines = [
        line.strip()
        for line in response.text.strip().split("\n")
        if line.strip()
    ]

    completed_steps = tuple(s for s in state.steps if s.status == "complete")
    new_remaining = tuple(
        PlanStep(description=line.lstrip("0123456789.) "))
        for line in lines
    )
    return (*completed_steps, *new_remaining)


def plan_and_execute(task: str, llm, executor_agent, max_replans: int = 3) -> PlanState:
    """Full plan-and-execute loop with optional replanning."""
    steps = create_plan(task, llm)
    state = PlanState(task=task, steps=steps)

    for replan_count in range(max_replans + 1):
        # Find next pending step
        pending_indices = [
            i for i, s in enumerate(state.steps) if s.status == "pending"
        ]

        if not pending_indices:
            # All steps done -- generate final answer
            context = "\n".join(
                f"{s.description}: {s.result}"
                for s in state.steps if s.status == "complete"
            )
            final = llm.chat(messages=[
                {
                    "role": "user",
                    "content": (
                        f"Task: {task}\nResults:\n{context}\n\n"
                        f"Synthesize a final answer."
                    ),
                },
            ])
            return PlanState(
                task=state.task,
                steps=state.steps,
                final_answer=final.text,
            )

        # Execute next step
        idx = pending_indices[0]
        context = "\n".join(
            f"{s.description}: {s.result}"
            for s in state.steps if s.status == "complete"
        )
        completed_step = execute_step(state.steps[idx], context, executor_agent)

        # Immutably update steps
        updated_steps = (
            *state.steps[:idx],
            completed_step,
            *state.steps[idx + 1:],
        )
        state = PlanState(task=state.task, steps=updated_steps)

        # Replan after each execution
        if replan_count < max_replans:
            replanned_steps = replan(state, llm)
            state = PlanState(task=state.task, steps=replanned_steps)

    return state
```

### Plan-and-Execute vs. ReAct

| Dimension        | ReAct                  | Plan-and-Execute                    |
| ---------------- | ---------------------- | ----------------------------------- |
| Planning         | Implicit, step-by-step | Explicit, upfront                   |
| Adaptability     | Highly reactive        | Replanning required                 |
| Token efficiency | Lower per step         | Higher initial cost, lower per step |
| Best for         | Exploratory tasks      | Well-defined multi-step tasks       |
| Debugging        | Read thought traces    | Inspect plan + step results         |
| Parallelism      | Sequential by default  | Steps can be parallelized           |

---

## 4. Reflection / Self-Critique

### Core Concept

**Reflection** adds a self-evaluation step after the agent produces output.
The agent (or a separate critic LLM) reviews its own work, identifies flaws,
and iterates until quality thresholds are met. The **Reflexion** pattern
specifically stores reflections in memory for future episodes.

```
+-------------------------------------------------------------------+
|                   REFLECTION / SELF-CRITIQUE                      |
|                                                                   |
|   +---------+     +-----------+     +------------+                |
|   |         |     |           |     |            |                |
|   | GENERATE+---->| EVALUATE  +---->| GOOD       |----> Output    |
|   | (Actor) |     | (Critic)  |     | ENOUGH?    |                |
|   |         |     |           |     |            |                |
|   +----^----+     +-----------+     +-----+------+                |
|        |                                  |                       |
|        |              NO                  |                       |
|        +----------------------------------+                       |
|        |                                                          |
|        |  Feedback: "The code has a bug on line 3.                |
|        |  The variable `total` is never initialized."             |
|        |                                                          |
+-------------------------------------------------------------------+
```

### Reflexion Pattern (with Memory)

```
  Episode 1                    Episode 2
  +----------+                 +----------+
  | Attempt  |                 | Attempt  |
  | task     |                 | task     |
  +----+-----+                 +----+-----+
       |                            |
       v                            v
  +----+-----+                 +----+-----+
  | Evaluate |                 | Evaluate |
  | (fail)   |                 | (pass!)  |
  +----+-----+                 +----------+
       |
       v
  +----+------+
  | Reflect   |    "I failed because I didn't
  | & store   +--> handle edge case X. Next time
  | in memory |    I should check for empty input."
  +-----------+
       |
       +-------> Stored in long-term memory
                 Retrieved in Episode 2
```

### Python Implementation

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ReflectionResult:
    output: str
    critique: str
    score: float  # 0.0 to 1.0
    iteration: int


@dataclass(frozen=True)
class ReflectionState:
    task: str
    results: tuple[ReflectionResult, ...] = ()
    final_output: str | None = None


def generate(task: str, feedback: str | None, llm) -> str:
    """Generate or regenerate output based on task and optional feedback."""
    messages = [{"role": "user", "content": f"Task: {task}"}]
    if feedback:
        messages = [
            *messages,
            {
                "role": "user",
                "content": f"Previous feedback to address:\n{feedback}",
            },
        ]
    response = llm.chat(messages=messages)
    return response.text


def evaluate(task: str, output: str, critic_llm) -> tuple[str, float]:
    """Evaluate the output and return (critique, score)."""
    response = critic_llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "You are a code reviewer. Evaluate the output for the given "
                "task. Provide specific, actionable feedback. End with a "
                "score from 0.0 to 1.0 on a line by itself: SCORE: X.X"
            ),
        },
        {
            "role": "user",
            "content": f"Task: {task}\n\nOutput:\n{output}",
        },
    ])

    text = response.text
    # Extract score from last line
    score_line = [l for l in text.split("\n") if l.startswith("SCORE:")]
    score = float(score_line[-1].split(":")[1].strip()) if score_line else 0.5

    return (text, score)


def reflection_loop(
    task: str,
    llm,
    critic_llm,
    threshold: float = 0.8,
    max_iterations: int = 3,
) -> ReflectionState:
    """Generate, evaluate, and refine until quality threshold is met."""
    state = ReflectionState(task=task)
    feedback = None

    for i in range(max_iterations):
        output = generate(task, feedback, llm)
        critique, score = evaluate(task, output, critic_llm)

        result = ReflectionResult(
            output=output,
            critique=critique,
            score=score,
            iteration=i,
        )
        state = ReflectionState(
            task=state.task,
            results=(*state.results, result),
        )

        if score >= threshold:
            return ReflectionState(
                task=state.task,
                results=state.results,
                final_output=output,
            )

        feedback = critique

    # Return best attempt if threshold never met
    best = max(state.results, key=lambda r: r.score)
    return ReflectionState(
        task=state.task,
        results=state.results,
        final_output=best.output,
    )


# -------------------------------------------------------------------
# Reflexion with persistent memory across episodes
# -------------------------------------------------------------------

@dataclass(frozen=True)
class ReflexionMemory:
    reflections: tuple[str, ...] = ()


def reflect_on_failure(task: str, attempt: str, error: str, llm) -> str:
    """Generate a reflection on why the attempt failed."""
    response = llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "You are reflecting on a failed attempt. Explain what went "
                "wrong and what should be done differently next time. Be "
                "specific and actionable. Output 2-3 sentences."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Task: {task}\nAttempt:\n{attempt}\nError: {error}"
            ),
        },
    ])
    return response.text


def reflexion_episode(
    task: str,
    memory: ReflexionMemory,
    llm,
    evaluator,
) -> tuple[str, ReflexionMemory]:
    """Run one episode of Reflexion with memory."""
    # Include past reflections as context
    memory_context = "\n".join(
        f"- {r}" for r in memory.reflections
    ) if memory.reflections else "No previous reflections."

    prompt = (
        f"Task: {task}\n\n"
        f"Lessons from past attempts:\n{memory_context}\n\n"
        f"Generate a solution, avoiding past mistakes."
    )

    output = llm.chat(messages=[{"role": "user", "content": prompt}]).text
    success, error = evaluator(output)

    if success:
        return (output, memory)

    # Failed -- reflect and store
    reflection = reflect_on_failure(task, output, error, llm)
    updated_memory = ReflexionMemory(
        reflections=(*memory.reflections, reflection)
    )
    return (None, updated_memory)
```

### When to Use Reflection

- **Code generation**: Generate code, run tests, reflect on failures
- **Writing tasks**: Draft, critique, revise
- **Complex reasoning**: Solve, verify, re-solve if wrong
- **Any task with a verifiable quality metric**

### Key Insight for Interviews

> The critic can be the **same LLM** (self-critique) or a **different model**
> (cross-critique). Using a different model avoids the "blind spot" problem
> where the same model cannot see its own errors. In production, use
> programmatic evaluators (tests, linters, type-checkers) as the critic
> whenever possible -- they are cheaper and more reliable.

---

## 5. Tool-Use Loop

### Core Concept

Modern LLMs support **function calling** (tool use) natively. The API returns
structured tool call objects instead of free text. The tool-use loop is the
standard pattern for handling these structured calls, including **parallel
tool calls** where the LLM requests multiple tools in a single turn.

```
+-------------------------------------------------------------------+
|                      TOOL-USE LOOP                                |
|                                                                   |
|   User Message                                                    |
|        |                                                          |
|        v                                                          |
|   +----+-----+                                                    |
|   |   LLM    |  (with tool definitions in system prompt)          |
|   +----+-----+                                                    |
|        |                                                          |
|        +----> Text response? ----> Return to user                 |
|        |                                                          |
|        +----> Tool call(s)?                                       |
|               |                                                   |
|        +------+------+------+   (parallel tool calls)             |
|        |      |      |      |                                     |
|        v      v      v      v                                     |
|     Tool A  Tool B  Tool C  Tool D                                |
|        |      |      |      |                                     |
|        +------+------+------+                                     |
|               |                                                   |
|               v                                                   |
|        Tool results appended to messages                          |
|               |                                                   |
|               v                                                   |
|        +------+-----+                                             |
|        |   LLM      |  (sees results, may call more tools)       |
|        +------+-----+                                             |
|               |                                                   |
|               +----> ... (loop continues)                         |
+-------------------------------------------------------------------+
```

### Parallel vs. Sequential Tool Calls

```
  SEQUENTIAL (one at a time):          PARALLEL (multiple at once):

  LLM -> Tool A -> LLM -> Tool B      LLM -> Tool A -+
                                            -> Tool B -+-> LLM -> ...
                                            -> Tool C -+

  Time: 3 LLM calls + 2 tool calls    Time: 2 LLM calls + 1 tool batch

  Total latency: HIGH                 Total latency: LOW
```

### Python Implementation

```python
import asyncio
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass(frozen=True)
class ToolResult:
    tool_call_id: str
    content: str


def run_tool_use_loop(messages: list, llm, tools: dict, max_turns: int = 10) -> str:
    """Standard tool-use loop with parallel tool call support."""
    current_messages = list(messages)

    for _ in range(max_turns):
        response = llm.chat(
            messages=current_messages,
            tools=format_tool_definitions(tools),
        )

        # If no tool calls, return the text response
        if not response.tool_calls:
            return response.text

        # Append assistant message with tool calls
        current_messages = [
            *current_messages,
            {
                "role": "assistant",
                "content": response.text,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments),
                        },
                    }
                    for tc in response.tool_calls
                ],
            },
        ]

        # Execute ALL tool calls (parallel if possible)
        results = execute_tools_parallel(response.tool_calls, tools)

        # Append all tool results
        current_messages = [
            *current_messages,
            *[
                {
                    "role": "tool",
                    "tool_call_id": r.tool_call_id,
                    "content": r.content,
                }
                for r in results
            ],
        ]

    return "Max turns reached without final answer."


def execute_tools_parallel(
    tool_calls: list[ToolCall],
    tools: dict,
) -> list[ToolResult]:
    """Execute multiple tool calls in parallel using asyncio."""

    async def _run_all():
        tasks = [
            _execute_single(tc, tools) for tc in tool_calls
        ]
        return await asyncio.gather(*tasks)

    return asyncio.run(_run_all())


async def _execute_single(tc: ToolCall, tools: dict) -> ToolResult:
    """Execute a single tool call."""
    tool_fn = tools.get(tc.name)
    if tool_fn is None:
        return ToolResult(
            tool_call_id=tc.id,
            content=f"Error: Unknown tool '{tc.name}'",
        )
    try:
        if asyncio.iscoroutinefunction(tool_fn):
            result = await tool_fn(**tc.arguments)
        else:
            result = tool_fn(**tc.arguments)
        return ToolResult(tool_call_id=tc.id, content=str(result))
    except Exception as e:
        return ToolResult(tool_call_id=tc.id, content=f"Error: {e}")


def format_tool_definitions(tools: dict) -> list[dict]:
    """Convert tool functions to API-compatible definitions."""
    definitions = []
    for name, fn in tools.items():
        definitions = [
            *definitions,
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": fn.__doc__ or "",
                    "parameters": getattr(fn, "schema", {}),
                },
            },
        ]
    return definitions
```

### Tool Definition Best Practices

```python
# Good tool definition -- clear name, description, typed parameters
def search_web(query: str, max_results: int = 5) -> str:
    """Search the web for information.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return (1-10).

    Returns:
        A formatted string of search results with titles and snippets.
    """
    ...

search_web.schema = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The search query string",
        },
        "max_results": {
            "type": "integer",
            "description": "Maximum results to return",
            "default": 5,
            "minimum": 1,
            "maximum": 10,
        },
    },
    "required": ["query"],
}
```

### Common Pitfalls

| Pitfall                          | Solution                                |
| -------------------------------- | --------------------------------------- |
| Tool descriptions too vague      | Write detailed docstrings with examples |
| Too many tools overwhelm the LLM | Group related tools, limit to <20       |
| No error handling in tools       | Always return structured error messages |
| Unbounded loop                   | Set `max_turns` and handle gracefully   |
| Ignoring tool call IDs           | Each result must reference its call ID  |

---

## 6. Router / Dispatcher

### Core Concept

A **Router** (or Dispatcher) classifies the user's intent and routes the
request to a specialized sub-agent or handler. This avoids loading a single
agent with all possible tools and instructions, keeping each sub-agent
focused and efficient.

```
+-------------------------------------------------------------------+
|                    ROUTER / DISPATCHER                            |
|                                                                   |
|                    User Message                                   |
|                         |                                         |
|                         v                                         |
|                  +------+------+                                  |
|                  |   ROUTER    |                                  |
|                  |   (LLM or   |                                  |
|                  |  classifier)|                                  |
|                  +--+---+---+--+                                  |
|                     |   |   |                                     |
|            +--------+   |   +--------+                            |
|            |            |            |                             |
|            v            v            v                             |
|     +------+--+  +------+--+  +------+--+                        |
|     | CODE    |  | SEARCH  |  | MATH    |                        |
|     | AGENT   |  | AGENT   |  | AGENT   |                        |
|     |         |  |         |  |         |                        |
|     | Tools:  |  | Tools:  |  | Tools:  |                        |
|     | - exec  |  | - web   |  | - calc  |                        |
|     | - file  |  | - wiki  |  | - plot  |                        |
|     | - git   |  | - arxiv |  | - sympy |                        |
|     +---------+  +---------+  +---------+                        |
|                                                                   |
+-------------------------------------------------------------------+
```

### Multi-Level Routing

```
                    User Message
                         |
                         v
                  +------+------+
                  | L1 ROUTER   |  "Is this code, data, or general?"
                  +--+------+---+
                     |      |
              +------+      +------+
              |                    |
              v                    v
       +------+------+     +------+------+
       | L2 ROUTER   |     | GENERAL     |
       | (Code)      |     | AGENT       |
       +--+-----+----+     +-------------+
          |     |
     +----+     +----+
     |               |
     v               v
  +--+-----+   +-----+----+
  | PYTHON |   | FRONTEND |
  | AGENT  |   | AGENT    |
  +--------+   +----------+
```

### Python Implementation

```python
from dataclasses import dataclass
from enum import Enum


class Intent(Enum):
    CODE = "code"
    SEARCH = "search"
    MATH = "math"
    GENERAL = "general"


@dataclass(frozen=True)
class RouteResult:
    intent: Intent
    confidence: float
    response: str


def classify_intent(message: str, llm) -> tuple[Intent, float]:
    """Classify the user's intent using the LLM."""
    response = llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "Classify the user message into exactly one category:\n"
                "- CODE: writing, debugging, or reviewing code\n"
                "- SEARCH: looking up information, facts, current events\n"
                "- MATH: calculations, equations, data analysis\n"
                "- GENERAL: conversation, opinions, creative writing\n\n"
                "Respond with JSON: {\"intent\": \"...\", \"confidence\": 0.X}"
            ),
        },
        {"role": "user", "content": message},
    ])

    import json
    parsed = json.loads(response.text)
    return (Intent(parsed["intent"].lower()), parsed["confidence"])


def create_specialized_agents(llm, tools_registry: dict) -> dict[Intent, object]:
    """Create a specialized agent for each intent category."""
    return {
        Intent.CODE: Agent(
            llm=llm,
            system_prompt="You are a coding assistant. Write clean, tested code.",
            tools=tools_registry.get("code", {}),
        ),
        Intent.SEARCH: Agent(
            llm=llm,
            system_prompt="You are a research assistant. Find accurate information.",
            tools=tools_registry.get("search", {}),
        ),
        Intent.MATH: Agent(
            llm=llm,
            system_prompt="You are a math tutor. Show your work step by step.",
            tools=tools_registry.get("math", {}),
        ),
        Intent.GENERAL: Agent(
            llm=llm,
            system_prompt="You are a helpful general assistant.",
            tools={},
        ),
    }


def router_dispatch(
    message: str,
    llm,
    agents: dict[Intent, object],
    fallback_intent: Intent = Intent.GENERAL,
    confidence_threshold: float = 0.6,
) -> RouteResult:
    """Route a message to the appropriate specialized agent."""
    intent, confidence = classify_intent(message, llm)

    # Fall back to general if confidence is low
    if confidence < confidence_threshold:
        intent = fallback_intent

    agent = agents[intent]
    response = agent.run(message)

    return RouteResult(
        intent=intent,
        confidence=confidence,
        response=response,
    )


# -------------------------------------------------------------------
# Semantic Router (embedding-based, no LLM call for routing)
# -------------------------------------------------------------------

import numpy as np


@dataclass(frozen=True)
class SemanticRoute:
    intent: Intent
    exemplars: tuple[str, ...]  # Example messages for this route
    embeddings: tuple = ()      # Precomputed embeddings


def build_semantic_router(
    routes: list[SemanticRoute],
    embed_fn,
) -> list[SemanticRoute]:
    """Precompute embeddings for all route exemplars."""
    return [
        SemanticRoute(
            intent=route.intent,
            exemplars=route.exemplars,
            embeddings=tuple(embed_fn(ex) for ex in route.exemplars),
        )
        for route in routes
    ]


def semantic_classify(
    message: str,
    routes: list[SemanticRoute],
    embed_fn,
) -> tuple[Intent, float]:
    """Classify intent using cosine similarity to route exemplars."""
    msg_embedding = embed_fn(message)

    best_intent = Intent.GENERAL
    best_score = -1.0

    for route in routes:
        for emb in route.embeddings:
            score = float(np.dot(msg_embedding, emb) / (
                np.linalg.norm(msg_embedding) * np.linalg.norm(emb)
            ))
            if score > best_score:
                best_score = score
                best_intent = route.intent

    return (best_intent, best_score)
```

### LLM-Based vs. Embedding-Based Routing

| Dimension   | LLM Router                     | Embedding Router                  |
| ----------- | ------------------------------ | --------------------------------- |
| Latency     | ~500ms (LLM call)              | ~10ms (vector comparison)         |
| Accuracy    | High (understands nuance)      | Good (but depends on exemplars)   |
| Cost        | Higher (LLM inference)         | Very low (embedding only)         |
| Flexibility | Easy to update (change prompt) | Requires new exemplars            |
| Best for    | Complex, ambiguous intents     | High-volume, well-defined intents |

### When to Use a Router

- You have distinct task categories that need different tools/prompts
- You want to keep each sub-agent's context window small and focused
- You need to optimize cost (route simple tasks to cheaper models)
- You want to scale horizontally (add new agents without modifying others)

---

## 7. DAG-Based Orchestration

### Core Concept

**DAG-Based Orchestration** models the agent workflow as a directed acyclic
graph (DAG) where nodes are processing steps and edges define the flow of
data between them. This is the pattern used by LangGraph, Prefect, and
similar frameworks. It supports:

- **Conditional branching** (if/else routing)
- **Parallel execution** (fan-out / fan-in)
- **Cycles** (loops for retry/refinement -- technically a cyclic graph)
- **State management** (typed state passed between nodes)

```
+-------------------------------------------------------------------+
|                   DAG-BASED ORCHESTRATION                         |
|                                                                   |
|                      START                                        |
|                        |                                          |
|                        v                                          |
|                 +------+------+                                   |
|                 |   CLASSIFY  |                                   |
|                 +--+------+---+                                   |
|                    |      |                                       |
|           "simple" |      | "complex"                             |
|                    v      v                                       |
|             +------+-+ +--+-------+                               |
|             | DIRECT | | RESEARCH |                               |
|             | ANSWER | |          |                               |
|             +------+-+ +--+-------+                               |
|                    |      |                                       |
|                    |      v                                       |
|                    |  +---+-------+                                |
|                    |  | SYNTHESIZE|                                |
|                    |  +---+-------+                                |
|                    |      |                                       |
|                    v      v                                       |
|                 +--+------+---+                                   |
|                 |   REVIEW    |                                   |
|                 +--+------+---+                                   |
|                    |      |                                       |
|              "pass" |     | "fail"                                |
|                    v      |                                       |
|                  +--+--+  |                                       |
|                  | END |  +---> (loop back to RESEARCH)            |
|                  +-----+                                          |
+-------------------------------------------------------------------+
```

### Fan-Out / Fan-In Pattern

```
                    Input
                      |
                      v
               +------+------+
               |   SPLIT     |  (fan-out)
               +--+--+--+----+
                  |  |  |
         +--------+  |  +--------+
         |           |           |
         v           v           v
    +----+---+  +----+---+  +----+---+
    | AGENT  |  | AGENT  |  | AGENT  |
    |   A    |  |   B    |  |   C    |
    +----+---+  +----+---+  +----+---+
         |           |           |
         +--------+  |  +--------+
                  |  |  |
                  v  v  v
               +--+--+--+----+
               |   MERGE     |  (fan-in)
               +------+------+
                      |
                      v
                   Output
```

### Python Implementation

```python
from dataclasses import dataclass
from typing import Callable, Any
from enum import Enum


# -------------------------------------------------------------------
# Graph definition types
# -------------------------------------------------------------------

@dataclass(frozen=True)
class GraphState:
    """Immutable state passed between nodes."""
    query: str = ""
    classification: str = ""
    research_results: tuple[str, ...] = ()
    draft: str = ""
    review_score: float = 0.0
    final_answer: str = ""
    iteration: int = 0


class NodeResult(Enum):
    CONTINUE = "continue"  # Default edge


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    condition: Callable[[GraphState], bool] | None = None


@dataclass(frozen=True)
class Node:
    name: str
    fn: Callable[[GraphState], GraphState]


@dataclass(frozen=True)
class Graph:
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]
    entry_point: str


# -------------------------------------------------------------------
# Node implementations
# -------------------------------------------------------------------

def classify_node(state: GraphState, llm) -> GraphState:
    """Classify query complexity."""
    response = llm.chat(messages=[
        {
            "role": "user",
            "content": (
                f"Is this query simple or complex? "
                f"Reply with exactly 'simple' or 'complex'.\n"
                f"Query: {state.query}"
            ),
        },
    ])
    return GraphState(
        query=state.query,
        classification=response.text.strip().lower(),
        research_results=state.research_results,
        draft=state.draft,
        review_score=state.review_score,
        final_answer=state.final_answer,
        iteration=state.iteration,
    )


def research_node(state: GraphState, search_tool) -> GraphState:
    """Conduct research on the query."""
    results = search_tool(state.query)
    return GraphState(
        query=state.query,
        classification=state.classification,
        research_results=tuple(results),
        draft=state.draft,
        review_score=state.review_score,
        final_answer=state.final_answer,
        iteration=state.iteration,
    )


def synthesize_node(state: GraphState, llm) -> GraphState:
    """Synthesize research into a draft answer."""
    context = "\n".join(state.research_results)
    response = llm.chat(messages=[
        {
            "role": "user",
            "content": (
                f"Based on this research:\n{context}\n\n"
                f"Answer: {state.query}"
            ),
        },
    ])
    return GraphState(
        query=state.query,
        classification=state.classification,
        research_results=state.research_results,
        draft=response.text,
        review_score=state.review_score,
        final_answer=state.final_answer,
        iteration=state.iteration,
    )


def review_node(state: GraphState, llm) -> GraphState:
    """Review the draft answer and score it."""
    response = llm.chat(messages=[
        {
            "role": "system",
            "content": (
                "Score this answer 0.0-1.0 for accuracy and completeness. "
                "Reply with just the number."
            ),
        },
        {
            "role": "user",
            "content": f"Question: {state.query}\nAnswer: {state.draft}",
        },
    ])
    score = float(response.text.strip())
    return GraphState(
        query=state.query,
        classification=state.classification,
        research_results=state.research_results,
        draft=state.draft,
        review_score=score,
        final_answer=state.draft if score >= 0.8 else "",
        iteration=state.iteration + 1,
    )


# -------------------------------------------------------------------
# Graph execution engine
# -------------------------------------------------------------------

def execute_graph(graph: Graph, initial_state: GraphState, max_steps: int = 20) -> GraphState:
    """Execute a graph by following edges from the entry point."""
    node_map = {node.name: node for node in graph.nodes}
    state = initial_state
    current_node_name = graph.entry_point

    for _ in range(max_steps):
        if current_node_name == "__end__":
            return state

        # Execute current node
        node = node_map[current_node_name]
        state = node.fn(state)

        # Find outgoing edges
        outgoing = [e for e in graph.edges if e.source == current_node_name]

        if not outgoing:
            return state  # No outgoing edges = terminal

        # Evaluate conditions to pick next node
        next_node = None
        for edge in outgoing:
            if edge.condition is None:
                next_node = edge.target  # Default edge
            elif edge.condition(state):
                next_node = edge.target
                break

        if next_node is None:
            # Fall back to unconditional edge
            unconditional = [e for e in outgoing if e.condition is None]
            next_node = unconditional[0].target if unconditional else "__end__"

        current_node_name = next_node

    return state


# -------------------------------------------------------------------
# Build the graph
# -------------------------------------------------------------------

def build_qa_graph(llm, search_tool) -> Graph:
    """Build the QA workflow graph."""
    nodes = (
        Node("classify", lambda s: classify_node(s, llm)),
        Node("direct_answer", lambda s: GraphState(
            query=s.query,
            classification=s.classification,
            research_results=s.research_results,
            draft=s.draft,
            review_score=s.review_score,
            final_answer=llm.chat(
                messages=[{"role": "user", "content": s.query}]
            ).text,
            iteration=s.iteration,
        )),
        Node("research", lambda s: research_node(s, search_tool)),
        Node("synthesize", lambda s: synthesize_node(s, llm)),
        Node("review", lambda s: review_node(s, llm)),
    )

    edges = (
        # From classify
        Edge("classify", "direct_answer",
             condition=lambda s: s.classification == "simple"),
        Edge("classify", "research",
             condition=lambda s: s.classification == "complex"),
        # From direct_answer
        Edge("direct_answer", "__end__"),
        # From research
        Edge("research", "synthesize"),
        # From synthesize
        Edge("synthesize", "review"),
        # From review (conditional loop)
        Edge("review", "__end__",
             condition=lambda s: s.review_score >= 0.8),
        Edge("review", "research",
             condition=lambda s: s.review_score < 0.8 and s.iteration < 3),
        Edge("review", "__end__"),  # Fallback after max iterations
    )

    return Graph(nodes=nodes, edges=edges, entry_point="classify")
```

### LangGraph-Style State Channels

LangGraph uses **annotated state channels** with reducers to handle state
updates, especially for fan-in scenarios:

```python
from typing import Annotated
import operator


# In LangGraph, state is defined with annotations:
class ResearchState:
    query: str
    # "operator.add" means fan-in merges results by concatenation
    results: Annotated[list[str], operator.add]
    final_answer: str


# When 3 parallel nodes each return {"results": ["some finding"]},
# the reducer concatenates them: results = ["A", "B", "C"]
```

### When to Use DAG Orchestration

- Complex workflows with branching logic
- Tasks requiring parallel processing
- Need for retry/refinement loops
- When you want visual workflow debugging
- Production systems requiring observability

---

## 8. Human-in-the-Loop Architectures

### Core Concept

Not all agent decisions should be autonomous. **Human-in-the-loop (HITL)**
architectures insert approval gates, escalation points, and review steps
where a human can inspect, modify, or override the agent's actions.

```
+-------------------------------------------------------------------+
|              HUMAN-IN-THE-LOOP PATTERNS                          |
|                                                                   |
|  Pattern 1: APPROVAL GATE                                        |
|                                                                   |
|    Agent ----> [PROPOSED ACTION] ----> Human ----> Approve? ---+  |
|                                                       |        |  |
|                                              YES      |   NO   |  |
|                                               |       |        |  |
|                                               v       v        |  |
|                                           Execute   Reject/    |  |
|                                                     Modify     |  |
|                                                                   |
|  Pattern 2: ESCALATION                                           |
|                                                                   |
|    Agent ----> Confidence < threshold? ----> YES ----> Human     |
|                        |                                         |
|                        NO                                        |
|                        |                                         |
|                        v                                         |
|                   Auto-execute                                   |
|                                                                   |
|  Pattern 3: REVIEW-AND-EDIT                                      |
|                                                                   |
|    Agent ----> [DRAFT OUTPUT] ----> Human edits ----> Final      |
|                                                                   |
+-------------------------------------------------------------------+
```

### Approval Gate Architecture

```
    +--------+      +-----------+      +----------+
    | Agent  |      | Approval  |      | Executor |
    | (Plan) +----->| Queue     +----->| (Act)    |
    +--------+      +-----+-----+      +----------+
                          |
                          v
                    +-----+-----+
                    | Human     |
                    | Dashboard |
                    |           |
                    | [Approve] |
                    | [Reject]  |
                    | [Modify]  |
                    +-----------+
```

### Python Implementation

```python
import asyncio
from dataclasses import dataclass
from enum import Enum


class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MODIFIED = "modified"


@dataclass(frozen=True)
class ProposedAction:
    action_type: str
    description: str
    parameters: dict
    risk_level: str  # low, medium, high, critical


@dataclass(frozen=True)
class ApprovalDecision:
    status: ApprovalStatus
    modified_parameters: dict | None = None
    reason: str = ""


@dataclass(frozen=True)
class HITLConfig:
    auto_approve_risk_levels: tuple[str, ...] = ("low",)
    require_approval_for: tuple[str, ...] = (
        "delete", "payment", "email", "deploy",
    )
    timeout_seconds: int = 300
    default_on_timeout: ApprovalStatus = ApprovalStatus.REJECTED


def assess_risk(action: ProposedAction) -> str:
    """Assess the risk level of a proposed action."""
    high_risk_actions = {"delete", "payment", "deploy", "admin"}
    medium_risk_actions = {"email", "update", "create"}

    if action.action_type in high_risk_actions:
        return "high"
    if action.action_type in medium_risk_actions:
        return "medium"
    return "low"


async def request_human_approval(
    action: ProposedAction,
    approval_queue: asyncio.Queue,
) -> ApprovalDecision:
    """Send action to human for approval and wait for response."""
    # In production, this would push to a UI/Slack/email
    print(f"\n{'='*60}")
    print(f"APPROVAL REQUIRED")
    print(f"Action: {action.action_type}")
    print(f"Description: {action.description}")
    print(f"Risk Level: {action.risk_level}")
    print(f"Parameters: {action.parameters}")
    print(f"{'='*60}\n")

    # Wait for human decision (from queue, API, etc.)
    decision = await approval_queue.get()
    return decision


async def hitl_execute(
    action: ProposedAction,
    config: HITLConfig,
    executor,
    approval_queue: asyncio.Queue,
) -> dict:
    """Execute an action with human-in-the-loop approval if needed."""
    risk = assess_risk(action)

    # Auto-approve low-risk actions
    if risk in config.auto_approve_risk_levels:
        result = executor(
            action.action_type,
            action.parameters,
        )
        return {"status": "auto_approved", "result": result}

    # Request human approval for higher-risk actions
    try:
        decision = await asyncio.wait_for(
            request_human_approval(action, approval_queue),
            timeout=config.timeout_seconds,
        )
    except asyncio.TimeoutError:
        return {
            "status": "timeout",
            "default": config.default_on_timeout.value,
        }

    if decision.status == ApprovalStatus.APPROVED:
        result = executor(action.action_type, action.parameters)
        return {"status": "approved", "result": result}

    if decision.status == ApprovalStatus.MODIFIED:
        result = executor(action.action_type, decision.modified_parameters)
        return {"status": "modified", "result": result}

    return {"status": "rejected", "reason": decision.reason}


# -------------------------------------------------------------------
# Confidence-based escalation
# -------------------------------------------------------------------

@dataclass(frozen=True)
class EscalationConfig:
    confidence_threshold: float = 0.7
    max_auto_actions: int = 5


def should_escalate(
    confidence: float,
    action_count: int,
    config: EscalationConfig,
) -> bool:
    """Decide whether to escalate to a human."""
    if confidence < config.confidence_threshold:
        return True
    if action_count >= config.max_auto_actions:
        return True
    return False


def agent_with_escalation(
    task: str,
    llm,
    tools: dict,
    config: EscalationConfig,
    human_callback,
) -> str:
    """Agent loop with confidence-based escalation."""
    messages = [{"role": "user", "content": task}]
    action_count = 0

    while action_count < config.max_auto_actions + 5:
        response = llm.chat(messages=messages)

        if response.stop_reason == "end_turn":
            return response.text

        # Check confidence (from model logprobs or self-assessment)
        confidence = estimate_confidence(response)

        if should_escalate(confidence, action_count, config):
            # Escalate to human
            human_decision = human_callback(
                context=messages,
                proposed_action=response.tool_call,
                confidence=confidence,
            )
            if human_decision.action == "override":
                messages = [
                    *messages,
                    {"role": "user", "content": human_decision.instruction},
                ]
                continue
            elif human_decision.action == "approve":
                pass  # Fall through to execute
            else:
                return "Task cancelled by human operator."

        # Execute tool
        tool_fn = tools[response.tool_call.name]
        result = tool_fn(**response.tool_call.arguments)

        messages = [
            *messages,
            response.message,
            {"role": "tool", "content": str(result)},
        ]
        action_count += 1

    return "Max actions reached."


def estimate_confidence(response) -> float:
    """Estimate model confidence from logprobs or self-assessment."""
    if hasattr(response, "logprobs") and response.logprobs:
        import math
        avg_logprob = sum(response.logprobs) / len(response.logprobs)
        return math.exp(avg_logprob)
    return 0.8  # Default when logprobs unavailable
```

### HITL Design Patterns Summary

| Pattern              | When to Use                   | Latency Impact           |
| -------------------- | ----------------------------- | ------------------------ |
| Approval Gate        | Destructive or costly actions | High (waits for human)   |
| Escalation           | Low-confidence situations     | Medium (sometimes waits) |
| Review-and-Edit      | Content generation, drafts    | High (human edits)       |
| Audit Log            | Compliance requirements       | None (async logging)     |
| Progressive Autonomy | Building trust over time      | Decreasing over time     |

---

## 9. Choosing the Right Architecture

### Decision Framework

```
                         START
                           |
                           v
                 Is the task a single
                 LLM call (no tools)?
                     /          \
                   YES           NO
                    |             |
                    v             v
              Simple Chat    Does it need
              (no agent)     multiple tools?
                                 /       \
                               YES        NO
                                |          |
                                v          v
                        Is the path     Single tool
                        known upfront?  loop
                           /       \
                         YES        NO
                          |          |
                          v          v
                   Plan-and-      ReAct
                   Execute         |
                      |            v
                      v       Is self-correction
                 Are steps    important?
                 independent?     /      \
                   /     \      YES       NO
                 YES      NO    |         |
                  |        |    v         v
                  v        v  Reflection  Basic
                DAG w/   Sequential     + ReAct    ReAct
                fan-out  Plan-Exec

                Multiple domains
                or intents?
                  /       \
                YES        NO
                 |          |
                 v          v
              Router    Single Agent
              Pattern

                High-risk actions
                or compliance needs?
                  /       \
                YES        NO
                 |          |
                 v          v
              HITL      Autonomous
              Pattern
```

### Architecture Selection Matrix

| Factor                   | Simple Chat | ReAct | Plan-Exec | Reflection | DAG | Router | HITL |
| ------------------------ | :---------: | :---: | :-------: | :--------: | :-: | :----: | :--: |
| Single-step task         |     \*      |       |           |            |     |        |      |
| Multi-step exploration   |             |  \*   |           |            |     |        |      |
| Known procedure          |             |       |    \*     |            | \*  |        |      |
| Quality-critical output  |             |       |           |     \*     |     |        |      |
| Parallel processing      |             |       |           |            | \*  |        |      |
| Multiple domains         |             |       |           |            |     |   \*   |      |
| Safety-critical          |             |       |           |            |     |        |  \*  |
| Low latency requirement  |     \*      |       |           |            |     |        |      |
| Token budget constrained |     \*      |       |    \*     |            |     |   \*   |      |
| Needs audit trail        |             |  \*   |    \*     |     \*     | \*  |        |  \*  |

### Composition: Combining Architectures

Real-world agents combine multiple patterns:

```
+-------------------------------------------------------------------+
|               COMPOSED ARCHITECTURE EXAMPLE                       |
|                                                                   |
|   +---------+     +-----------+     +------------------+          |
|   |         |     |           |     |                  |          |
|   | ROUTER  +---->| PLAN-AND- +---->| EXECUTOR         |          |
|   |         |     | EXECUTE   |     | (ReAct agent     |          |
|   +---------+     |           |     |  per step)       |          |
|                   +-----------+     +--------+---------+          |
|                                              |                    |
|                                              v                    |
|                                     +--------+---------+          |
|                                     | REFLECTION       |          |
|                                     | (self-critique   |          |
|                                     |  on final answer)|          |
|                                     +--------+---------+          |
|                                              |                    |
|                                              v                    |
|                                     +--------+---------+          |
|                                     | HITL GATE        |          |
|                                     | (if risk > med)  |          |
|                                     +------------------+          |
+-------------------------------------------------------------------+
```

### Cost-Latency-Quality Trade-off

```
                     HIGH QUALITY
                         ^
                         |
           Reflection    |    DAG + Reflection
           + ReAct       |    + HITL
                         |
                         |
              ReAct      |    Plan-and-Execute
                         |
                         |
         Simple Chat     |    Router + Specialized
                         |
                         +-------------------------> LOW LATENCY
                   HIGH COST                    LOW COST
```

### Rules of Thumb

1. **Start simple**. Use a basic tool-use loop before adding complexity.
2. **Add planning** when tasks have >5 steps or benefit from upfront structure.
3. **Add reflection** when output quality is critical and you have evaluation criteria.
4. **Add routing** when you have >3 distinct task categories.
5. **Add HITL** when actions are irreversible or high-stakes.
6. **Use DAGs** when you need parallel processing or complex branching.
7. **Compose patterns** rather than building monolithic agents.

---

## 10. Common Interview Questions

### Q1: What is the difference between an LLM and an agent?

**Model Answer:**
An LLM is a stateless function: prompt in, completion out. An agent is a
**system** that uses an LLM as its reasoning engine inside a **loop**. The
agent observes its environment (via tool results, user messages), decides
what to do (via LLM reasoning), acts (via tool execution), and feeds the
result back in. The loop, the tools, and the feedback mechanism are what
distinguish an agent from a raw LLM call.

---

### Q2: Explain the ReAct pattern and when you would use it.

**Model Answer:**
ReAct interleaves chain-of-thought reasoning with action execution. At each
step, the model produces a Thought (reasoning), an Action (tool call), and
receives an Observation (result). This creates a transparent reasoning trace
that is easy to debug.

Use ReAct for open-ended tasks where the path to the answer is not known
upfront -- for example, multi-hop question answering ("Who is older, the
president of France or the chancellor of Germany?") where you need to look
up multiple facts and combine them.

The downside is that ReAct is sequential (one tool call per turn) and can
consume many tokens over multiple steps. For known procedures, Plan-and-Execute
is more efficient.

---

### Q3: How do you decide between ReAct and Plan-and-Execute?

**Model Answer:**
The key differentiator is **predictability of the task**.

- **ReAct**: Use when the next step depends heavily on the previous result.
  The agent discovers the path as it goes. Good for exploration and
  information-gathering tasks.

- **Plan-and-Execute**: Use when the steps can be enumerated upfront. The
  planner creates a structured plan, then a simpler executor handles each
  step. More token-efficient for multi-step procedures. Replanning handles
  deviations.

In practice, I often compose them: Plan-and-Execute at the top level, with
each step executed by a small ReAct agent.

---

### Q4: How do you prevent an agent from getting stuck in a loop?

**Model Answer:**
Multiple layers of protection:

1. **Max iterations**: Hard cap on loop iterations (e.g., 20 steps).
2. **Duplicate detection**: Track recent actions; if the same action is
   repeated 3 times, force a different approach or stop.
3. **Progress monitoring**: Track whether the state is actually changing.
   If 3 consecutive steps produce no new information, intervene.
4. **Escalation**: If stuck, escalate to a human or a more capable model.
5. **Timeout**: Wall-clock timeout for the entire task.
6. **Token budget**: Stop if cumulative token usage exceeds a threshold.

```python
@dataclass(frozen=True)
class LoopGuard:
    max_steps: int = 20
    max_repeated_actions: int = 3
    max_tokens: int = 100_000
    timeout_seconds: int = 300
```

---

### Q5: How do you handle tool errors in an agent?

**Model Answer:**
Tool errors are normal, not exceptional. The approach is:

1. **Catch and surface**: Never let a tool exception crash the loop. Catch it
   and return a structured error message as the tool result.
2. **Let the LLM reason about the error**: The LLM sees "Error: file not found"
   as the observation and can decide to try a different approach.
3. **Retry with backoff**: For transient errors (rate limits, network), retry
   with exponential backoff before surfacing to the LLM.
4. **Error budget**: Track consecutive errors. After N failures on the same
   step, escalate or abort.
5. **Structured error format**: Return errors as structured data
   (`{"error": "...", "suggestion": "try X instead"}`) so the LLM can reason
   about remediation.

---

### Q6: How do you evaluate agent performance?

**Model Answer:**
Agent evaluation is multi-dimensional:

1. **Task completion rate**: Does the agent produce a correct final answer?
   Measured against ground truth or human judgment.
2. **Step efficiency**: How many steps does it take? Fewer is better.
3. **Token cost**: Total tokens consumed (input + output) per task.
4. **Latency**: Wall-clock time from input to final answer.
5. **Error recovery**: How often does the agent recover from tool errors or
   wrong paths?
6. **Safety**: Does the agent respect boundaries (no unauthorized actions)?

Evaluation frameworks:

- **Offline benchmarks**: Run on a test set of tasks with known answers.
- **Trajectory analysis**: Review the full action trace, not just the final answer.
- **A/B testing**: Compare architectures on live traffic.
- **Human evaluation**: For subjective quality (helpfulness, tone).

---

### Q7: What is a DAG-based orchestration and when would you use it?

**Model Answer:**
A DAG-based orchestration models the agent workflow as a directed graph where
nodes are processing steps (LLM calls, tool calls, logic) and edges define
data flow and conditional routing.

Use it when:

- The workflow has **branching logic** (different paths for different inputs)
- Steps can run in **parallel** (fan-out/fan-in)
- You need **retry loops** for specific steps
- You want **visual debugging** and observability
- The workflow is **productionized** and needs reliability

Frameworks like LangGraph implement this with typed state objects and
reducer functions for handling concurrent state updates.

---

### Q8: Design a customer support agent system.

**Model Answer:**
I would use a **Router + Specialized Agents + HITL** composition:

```
Customer Message
      |
      v
  +---+--------+
  | ROUTER     |   (classifies: billing, technical, complaint, general)
  +--+-+-+-+---+
     | | | |
     v v v v
  Billing  Technical  Complaint  General
  Agent    Agent      Agent      Agent
     |        |          |          |
     v        v          v          v
  +--+--------+----------+----------+--+
  |        REVIEW GATE                 |
  |  Check: Does response meet        |
  |  quality bar? Is action safe?      |
  +--+-----------+---------------------+
     |           |
     v           v
  Auto-send   Escalate to
  response    human agent
```

Key design decisions:

- **Router**: Embedding-based for low latency (<10ms), with LLM fallback for
  ambiguous cases.
- **Specialized agents**: Each has its own tools (billing API, knowledge base,
  ticketing system) and system prompt.
- **HITL**: Auto-approve informational responses. Require human approval for
  refunds >$100, account changes, or complaint escalations.
- **Memory**: Store conversation history and customer context for continuity.
- **Reflection**: The complaint agent uses self-critique to ensure empathetic
  tone before sending.

---

### Q9: How do you manage state in a multi-agent system?

**Model Answer:**
State management strategies, from simple to complex:

1. **Message passing**: State is the conversation history. Each agent
   appends messages. Simple but grows unbounded.
2. **Structured state object**: A typed dataclass passed between agents.
   Each agent returns a new (immutable) state. Easy to serialize and debug.
3. **State channels with reducers**: (LangGraph pattern) Each state field
   has a reducer function. When parallel agents update the same field,
   the reducer merges them (e.g., list concatenation, max, last-write-wins).
4. **External store**: For long-running agents, persist state to a database
   or Redis. Enables resumption after crashes.
5. **Event sourcing**: Store every state transition as an event. Enables
   replay, debugging, and time-travel.

The key principle: **state should be immutable**. Each step produces a new
state object. This makes debugging, testing, and rollback trivial.

---

### Q10: What are the security risks of agentic systems?

**Model Answer:**
Major risk categories:

1. **Prompt injection**: Malicious input tricks the agent into executing
   unauthorized actions. Mitigation: input sanitization, tool-level
   permission checks, output filtering.
2. **Excessive autonomy**: Agent takes destructive actions without oversight.
   Mitigation: HITL gates, action allowlists, risk-based approval.
3. **Data exfiltration**: Agent is tricked into sending sensitive data to
   an external service via tool calls. Mitigation: network allowlists,
   output scanning, sandboxed execution.
4. **Resource exhaustion**: Agent enters an infinite loop consuming tokens
   and API calls. Mitigation: budgets, timeouts, loop guards.
5. **Confused deputy**: Agent uses its elevated permissions to act on behalf
   of an attacker. Mitigation: principle of least privilege, per-action
   authorization.

Defense in depth: never rely on a single mitigation. Layer prompt design,
tool permissions, runtime monitoring, and human oversight.

---

## 11. Quick Reference

### Architecture Comparison Table

```
+------------------+------------+----------+----------+----------+--------+
| Architecture     | Complexity | Latency  | Cost     | Best For | Debug  |
+------------------+------------+----------+----------+----------+--------+
| Simple Chat      | Very Low   | Very Low | Very Low | 1-shot Q | Easy   |
|                  |            |          |          | & A      |        |
+------------------+------------+----------+----------+----------+--------+
| Tool-Use Loop    | Low        | Low-Med  | Low-Med  | Single   | Easy   |
|                  |            |          |          | tool use |        |
+------------------+------------+----------+----------+----------+--------+
| ReAct            | Medium     | Medium   | Medium   | Open     | Good   |
|                  |            |          |          | ended    | (trace)|
|                  |            |          |          | research |        |
+------------------+------------+----------+----------+----------+--------+
| Plan-and-Execute | Medium     | Med-High | Med-Low  | Known    | Good   |
|                  |            |          |          | multi    | (plan) |
|                  |            |          |          | step     |        |
+------------------+------------+----------+----------+----------+--------+
| Reflection       | Med-High   | High     | High     | Quality  | Best   |
|                  |            |          |          | critical | (full  |
|                  |            |          |          | output   | trace) |
+------------------+------------+----------+----------+----------+--------+
| Router           | Medium     | Low      | Low      | Multi    | Good   |
|                  |            | (routing)| (routing)| domain   |        |
+------------------+------------+----------+----------+----------+--------+
| DAG              | High       | Variable | Variable | Complex  | Best   |
| Orchestration    |            |          |          | workflows| (graph)|
+------------------+------------+----------+----------+----------+--------+
| HITL             | High       | High     | High     | Safety   | Best   |
|                  |            | (human)  | (human)  | critical | (audit)|
+------------------+------------+----------+----------+----------+--------+
```

### Pattern Selection Cheat Sheet

```
Task is simple, one-shot          --> Simple Chat
Task needs one tool               --> Tool-Use Loop
Task needs exploration            --> ReAct
Task has known steps              --> Plan-and-Execute
Output quality must be high       --> Add Reflection
Multiple task categories          --> Add Router
Steps can run in parallel         --> DAG Orchestration
Actions are risky/irreversible    --> Add HITL
Need all of the above             --> Compose patterns
```

### Key Formulas

```
Agent Cost = SUM(LLM_calls) * price_per_token + SUM(tool_calls) * tool_cost
Agent Latency = SUM(LLM_latencies) + SUM(tool_latencies) + human_wait_time
Quality = f(architecture, model_capability, tool_quality, prompt_engineering)
```

### Essential Design Principles

1. **Start simple, add complexity only when needed.**
2. **Every loop needs a termination condition** (max steps, budget, timeout).
3. **State should be immutable** -- return new objects, never mutate.
4. **Tools should be well-described** -- the LLM can only use what it understands.
5. **Errors are data, not exceptions** -- surface them as observations.
6. **Compose patterns** -- real agents mix and match architectures.
7. **Evaluate holistically** -- task completion, cost, latency, and safety.
8. **Defense in depth** -- no single layer of safety is sufficient.

---

_This guide covers the architectural patterns most commonly discussed in
agentic engineering interviews. For each pattern, practice implementing it
from scratch, explaining the trade-offs, and designing composed systems that
combine multiple patterns._
