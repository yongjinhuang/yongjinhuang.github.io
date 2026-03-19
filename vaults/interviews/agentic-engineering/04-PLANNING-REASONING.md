# Planning and Reasoning for AI Agents

## Table of Contents

1. [Why Planning Matters](#1-why-planning-matters)
2. [Chain-of-Thought (CoT)](#2-chain-of-thought-cot)
3. [Tree-of-Thought (ToT)](#3-tree-of-thought-tot)
4. [Graph-of-Thought](#4-graph-of-thought)
5. [Task Decomposition](#5-task-decomposition)
6. [Plan-and-Execute](#6-plan-and-execute)
7. [Self-Reflection and Critique](#7-self-reflection-and-critique)
8. [Structured Output for Planning](#8-structured-output-for-planning)
9. [Replanning Strategies](#9-replanning-strategies)
10. [Reasoning Under Uncertainty](#10-reasoning-under-uncertainty)
11. [Planning for Code Tasks](#11-planning-for-code-tasks)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Why Planning Matters

### Reactive vs Deliberative Agents

AI agents exist on a spectrum from purely reactive to fully deliberative:

```
Spectrum of Agent Planning

  Reactive                                              Deliberative
  |----------------------------------------------------------|
  |                    |                    |                  |
  Simple              ReAct              Plan-and-          Multi-step
  Prompt/Response     (Reason+Act)       Execute            Hierarchical
                                                            Planning

  - No memory         - Step-by-step     - Upfront plan     - Goal decomposition
  - No planning       - Observe-think-   - Explicit steps   - Dependency graphs
  - Single turn         act loop         - Replan on fail   - Parallel execution
  - Fast but brittle  - Flexible         - More robust      - Most robust
```

**Reactive agents** respond directly to inputs without maintaining an internal model of the world. They work well for simple, stateless tasks but fail on multi-step problems.

**Deliberative agents** build an internal plan before acting. They reason about goals, break them into subgoals, anticipate obstacles, and adjust plans dynamically.

### When Planning Helps

| Scenario                      | Planning Needed? | Why                                                  |
| ----------------------------- | ---------------- | ---------------------------------------------------- |
| Single Q&A                    | No               | Direct retrieval is sufficient                       |
| Multi-step research           | Yes              | Need to coordinate search, synthesis, and validation |
| Code refactoring across files | Yes              | Must understand dependency order                     |
| Data pipeline construction    | Yes              | Steps have prerequisites and side effects            |
| Ambiguous user request        | Yes              | Need to clarify goals before acting                  |
| Simple text transformation    | No               | Single tool call suffices                            |
| Debugging a complex bug       | Yes              | Hypothesize, test, narrow down systematically        |

### Cost-Benefit Analysis

```
Planning Overhead vs Task Complexity

  Value of       |                                    ___________
  Planning       |                               ___/
                 |                           ___/
                 |                       ___/
                 |                   ___/
                 |               ___/ <-- Sweet spot: moderate planning
                 |           ___/        for moderate complexity
                 |       ___/
                 |   ___/
                 |__/
                 |__________________________________
                 Simple              Complex
                          Task Complexity

  - Simple tasks: planning overhead > benefit
  - Complex tasks: planning saves total tokens and reduces errors
  - Sweet spot: plan enough to avoid dead ends, not so much that
    you waste tokens on plans that won't survive contact with reality
```

### Planning in Production Agent Systems

```python
from enum import Enum
from dataclasses import dataclass, field


class AgentMode(Enum):
    REACTIVE = "reactive"          # Direct response, no planning
    REASON_ACT = "reason_act"      # ReAct-style step-by-step
    PLAN_EXECUTE = "plan_execute"  # Full upfront planning


@dataclass(frozen=True)
class TaskAnalysis:
    estimated_steps: int
    requires_multiple_tools: bool
    has_dependencies: bool
    ambiguity_level: float  # 0.0 to 1.0


def select_agent_mode(analysis: TaskAnalysis) -> AgentMode:
    """Select the appropriate planning mode based on task complexity."""
    if analysis.estimated_steps <= 1 and not analysis.requires_multiple_tools:
        return AgentMode.REACTIVE

    if analysis.has_dependencies or analysis.estimated_steps > 5:
        return AgentMode.PLAN_EXECUTE

    return AgentMode.REASON_ACT
```

---

## 2. Chain-of-Thought (CoT)

### Core Concept

Chain-of-Thought prompting elicits step-by-step reasoning from an LLM before arriving at a final answer. Rather than jumping to a conclusion, the model "shows its work."

```
Standard Prompting vs Chain-of-Thought

  Standard:
  Q: "How many tennis balls fit in a school bus?"
  A: "500,000"  <-- no reasoning, likely wrong

  Chain-of-Thought:
  Q: "How many tennis balls fit in a school bus?"
  A: "Let me think step by step.
      1. School bus interior: ~2.4m x 2.1m x 12m = ~60 m^3
      2. Subtract seats (~40%): ~36 m^3 usable
      3. Tennis ball diameter: ~6.7 cm, volume ~157 cm^3
      4. Packing efficiency ~64%: effective volume per ball ~245 cm^3
      5. 36 m^3 / 245 cm^3 = ~147,000 tennis balls"
```

### Zero-Shot CoT

Simply append "Let's think step by step" to the prompt. No examples needed.

```python
def zero_shot_cot_prompt(question: str) -> str:
    """Create a zero-shot chain-of-thought prompt."""
    return f"""{question}

Let's think step by step."""


def zero_shot_cot_with_structure(question: str) -> str:
    """Zero-shot CoT with structured reasoning stages."""
    return f"""{question}

Let's approach this systematically:
1. First, identify what we know and what we need to find.
2. Then, break the problem into smaller parts.
3. Solve each part carefully.
4. Finally, combine the results and verify the answer."""
```

### Few-Shot CoT

Provide worked examples demonstrating the reasoning pattern you want.

```python
def few_shot_cot_prompt(question: str, examples: list[dict]) -> str:
    """Create a few-shot chain-of-thought prompt with examples."""
    prompt_parts = []

    for ex in examples:
        prompt_parts.append(
            f"Q: {ex['question']}\n"
            f"A: Let's think step by step.\n{ex['reasoning']}\n"
            f"Therefore, the answer is {ex['answer']}.\n"
        )

    prompt_parts.append(
        f"Q: {question}\n"
        f"A: Let's think step by step."
    )

    return "\n".join(prompt_parts)


# Example usage for an agent planning task
PLANNING_EXAMPLES = [
    {
        "question": "Find the average salary of engineers in our database and email a report.",
        "reasoning": (
            "1. I need to query the database for engineer salaries.\n"
            "2. I need to compute the average from the results.\n"
            "3. I need to format a report with the findings.\n"
            "4. I need to send the report via email.\n"
            "Dependencies: Step 2 depends on Step 1. "
            "Step 3 depends on Step 2. Step 4 depends on Step 3."
        ),
        "answer": "Execute steps 1-4 sequentially",
    }
]
```

### CoT for Agent Reasoning

In agentic systems, CoT manifests as the LLM's internal reasoning before deciding which tool to call.

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ReasoningStep:
    thought: str
    action: str
    action_input: dict
    observation: str = ""


class CoTAgent:
    """Agent that uses chain-of-thought reasoning before each action."""

    def __init__(self, llm, tools: dict):
        self._llm = llm
        self._tools = tools

    def _build_react_prompt(self, query: str, history: tuple[ReasoningStep, ...]) -> str:
        tool_descriptions = "\n".join(
            f"- {name}: {tool.description}"
            for name, tool in self._tools.items()
        )

        history_text = ""
        for step in history:
            history_text += (
                f"Thought: {step.thought}\n"
                f"Action: {step.action}\n"
                f"Action Input: {step.action_input}\n"
                f"Observation: {step.observation}\n\n"
            )

        return f"""Answer the following question using the available tools.

Tools:
{tool_descriptions}

Question: {query}

{history_text}Thought:"""

    def run(self, query: str, max_steps: int = 10) -> str:
        history: list[ReasoningStep] = []

        for _ in range(max_steps):
            prompt = self._build_react_prompt(query, tuple(history))
            response = self._llm.generate(prompt)

            thought, action, action_input = self._parse_response(response)

            if action == "finish":
                return action_input.get("answer", "")

            observation = self._tools[action].run(**action_input)

            history.append(ReasoningStep(
                thought=thought,
                action=action,
                action_input=action_input,
                observation=observation,
            ))

        return "Max steps reached without finding an answer."

    def _parse_response(self, response: str) -> tuple[str, str, dict]:
        """Parse LLM response into thought, action, and input."""
        # Implementation depends on output format
        raise NotImplementedError
```

### Strengths and Limitations of CoT

| Aspect       | Strength                            | Limitation                                         |
| ------------ | ----------------------------------- | -------------------------------------------------- |
| Accuracy     | Improves on math, logic, multi-step | Does not help on simple recall tasks               |
| Transparency | Makes reasoning visible             | Reasoning may be post-hoc rationalization          |
| Token cost   | --                                  | Uses more tokens per request                       |
| Faithfulness | --                                  | Model may "reason" to wrong conclusion confidently |
| Scaling      | Better with larger models           | Minimal benefit for small models (<10B params)     |

---

## 3. Tree-of-Thought (ToT)

### Core Concept

Tree-of-Thought extends CoT by exploring **multiple reasoning paths** simultaneously, evaluating them, and pruning unpromising branches. Think of it as a search tree over thought sequences.

```
Chain-of-Thought (linear):

  Start --> Step1 --> Step2 --> Step3 --> Answer


Tree-of-Thought (branching):

                         Start
                        /  |  \
                      S1a S1b S1c        <-- Generate 3 candidate first steps
                      /|    |    \
                   S2a S2b  S2c   X      <-- Prune S1c (score too low)
                   /    |    |
                 S3a    X   S3b          <-- Prune S1b path
                 /           |
              Answer_A    Answer_B       <-- Evaluate final candidates
                 |
              BEST                       <-- Select highest-scoring answer
```

### Exploration Strategies

**Breadth-First Search (BFS):** Explore all branches at each level before going deeper.

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ThoughtNode:
    content: str
    score: float
    depth: int
    parent_id: str
    node_id: str


class TreeOfThought:
    """Tree-of-Thought reasoning with BFS or DFS exploration."""

    def __init__(self, llm, evaluator, branch_factor: int = 3, max_depth: int = 4):
        self._llm = llm
        self._evaluator = evaluator
        self._branch_factor = branch_factor
        self._max_depth = max_depth

    def solve_bfs(self, problem: str) -> str:
        """Breadth-first exploration of thought tree."""
        root = ThoughtNode(
            content=problem,
            score=1.0,
            depth=0,
            parent_id="",
            node_id="root",
        )
        current_level = [root]

        for depth in range(1, self._max_depth + 1):
            candidates = []

            for node in current_level:
                # Generate multiple next thoughts
                next_thoughts = self._generate_thoughts(
                    problem, node, self._branch_factor
                )
                candidates.extend(next_thoughts)

            # Evaluate and prune: keep top-k candidates
            scored = tuple(
                ThoughtNode(
                    content=t.content,
                    score=self._evaluate_thought(problem, t),
                    depth=t.depth,
                    parent_id=t.parent_id,
                    node_id=t.node_id,
                )
                for t in candidates
            )

            # Keep only promising branches
            current_level = sorted(scored, key=lambda t: t.score, reverse=True)[
                :self._branch_factor
            ]

        # Return the best final thought
        best = max(current_level, key=lambda t: t.score)
        return best.content

    def solve_dfs(self, problem: str, node: ThoughtNode | None = None) -> str:
        """Depth-first exploration with backtracking."""
        if node is None:
            node = ThoughtNode(
                content=problem, score=1.0, depth=0,
                parent_id="", node_id="root"
            )

        if node.depth >= self._max_depth:
            return node.content

        next_thoughts = self._generate_thoughts(problem, node, self._branch_factor)

        # Sort by score and explore best-first
        scored = sorted(
            (
                ThoughtNode(
                    content=t.content,
                    score=self._evaluate_thought(problem, t),
                    depth=t.depth,
                    parent_id=t.parent_id,
                    node_id=t.node_id,
                )
                for t in next_thoughts
            ),
            key=lambda t: t.score,
            reverse=True,
        )

        for thought in scored:
            if thought.score < 0.3:  # Prune low-scoring branches
                continue
            result = self.solve_dfs(problem, thought)
            if self._is_solution(result):
                return result

        return node.content  # Backtrack

    def _generate_thoughts(
        self, problem: str, parent: ThoughtNode, n: int
    ) -> list[ThoughtNode]:
        """Generate n candidate next thoughts from parent."""
        prompt = f"""Problem: {problem}
Current reasoning: {parent.content}

Generate {n} distinct next steps for solving this problem.
Each step should explore a different approach or angle.
Format: one step per line, numbered 1-{n}."""

        response = self._llm.generate(prompt)
        thoughts = self._parse_thoughts(response)

        return [
            ThoughtNode(
                content=f"{parent.content}\n-> {t}",
                score=0.0,
                depth=parent.depth + 1,
                parent_id=parent.node_id,
                node_id=f"{parent.node_id}_{i}",
            )
            for i, t in enumerate(thoughts[:n])
        ]

    def _evaluate_thought(self, problem: str, thought: ThoughtNode) -> float:
        """Score a thought on [0, 1] for how promising it is."""
        prompt = f"""Problem: {problem}
Proposed reasoning path:
{thought.content}

Rate this reasoning path from 0.0 to 1.0:
- 0.0: Completely wrong or irrelevant
- 0.5: Partially correct but has issues
- 1.0: Correct and leads toward the solution

Score:"""
        response = self._llm.generate(prompt)
        try:
            return float(response.strip())
        except ValueError:
            return 0.5

    def _parse_thoughts(self, response: str) -> list[str]:
        raise NotImplementedError

    def _is_solution(self, result: str) -> bool:
        raise NotImplementedError
```

### DFS vs BFS for ToT

```
BFS (Breadth-First):
  Level 0:   [A]
  Level 1:   [B, C, D]        evaluate all 3, keep top 2
  Level 2:   [E, F, G, H]     evaluate all 4, keep top 2
  Level 3:   [I, J, K, L]     pick best

  + Compares alternatives at each level
  + Less likely to miss the best path
  - More LLM calls per level (expensive)
  - Good when: evaluation is reliable, problem has many traps


DFS (Depth-First):
  Path 1:   A -> B -> E -> I  (score 0.8) ACCEPT
  Path 2:   A -> B -> F -> J  (score 0.3) PRUNE at F
  Path 3:   A -> C -> G -> K  (never explored, already found solution)

  + Fewer LLM calls (finds answer faster)
  + Uses less memory
  - May get stuck in suboptimal path
  - Good when: solutions are deep, evaluation is expensive
```

### When to Use ToT Over CoT

| Factor          | Use CoT              | Use ToT                                     |
| --------------- | -------------------- | ------------------------------------------- |
| Problem type    | Linear, step-by-step | Requires exploration or creativity          |
| Cost budget     | Tight                | Can afford 3-10x more LLM calls             |
| Error tolerance | Low stakes           | High stakes, need best answer               |
| Latency         | Real-time            | Can tolerate seconds of delay               |
| Examples        | Q&A, summarization   | Puzzle solving, code architecture, strategy |

---

## 4. Graph-of-Thought

### Core Concept

Graph-of-Thought (GoT) extends ToT by allowing **non-linear reasoning**: thoughts can merge, reference earlier thoughts, form cycles, and create parallel branches that later converge.

```
Tree-of-Thought (no merging):

        A
       / \
      B   C
     / \   \
    D   E   F


Graph-of-Thought (merging + parallel):

        A
       / \
      B   C
     / \ / \
    D   E   F        <-- E merges insights from B and C
         \ /
          G           <-- G merges insights from E and F
```

### Why Graphs Beat Trees

Real reasoning is not strictly hierarchical. Consider debugging:

```
Debugging as a Graph of Thought:

  [Bug Report] -----> [Read Stacktrace] -----> [Identify File]
       |                                            |
       v                                            v
  [Check Logs] -----> [Find Error Pattern] ---> [Root Cause Hypothesis]
       |                                            |
       +-----> [Reproduce Bug] <-------------------+
                    |
                    v
              [Test Fix] ------> [Verify Fix]
                    |                  |
                    v                  v
              [Edge Cases] ----> [Final Solution]

  Key insight: "Reproduce Bug" draws from BOTH the log analysis
  AND the root cause hypothesis -- a merge operation impossible
  in a pure tree.
```

### Implementation

```python
from dataclasses import dataclass, field
from enum import Enum


class ThoughtOperation(Enum):
    GENERATE = "generate"     # Create new thoughts
    AGGREGATE = "aggregate"   # Merge multiple thoughts
    REFINE = "refine"         # Improve existing thought
    SCORE = "score"           # Evaluate a thought


@dataclass(frozen=True)
class GraphThought:
    thought_id: str
    content: str
    score: float
    predecessors: tuple[str, ...]  # IDs of parent thoughts
    operation: ThoughtOperation


class GraphOfThought:
    """
    Graph-based reasoning that supports merging, parallel branches,
    and iterative refinement of thoughts.
    """

    def __init__(self, llm, max_thoughts: int = 20):
        self._llm = llm
        self._max_thoughts = max_thoughts
        # Using dict for the graph structure, but treating thoughts as immutable
        self._thoughts: dict[str, GraphThought] = {}
        self._counter = 0

    def _next_id(self) -> str:
        self._counter += 1
        return f"t{self._counter}"

    def generate(self, context: str, n: int = 3) -> tuple[GraphThought, ...]:
        """Generate n parallel thoughts from a context."""
        prompt = f"""Given this context:
{context}

Generate {n} distinct approaches or insights. Each should explore
a different angle. Number them 1-{n}."""

        response = self._llm.generate(prompt)
        lines = [l.strip() for l in response.split("\n") if l.strip()]

        results = []
        for line in lines[:n]:
            thought_id = self._next_id()
            thought = GraphThought(
                thought_id=thought_id,
                content=line,
                score=0.0,
                predecessors=(),
                operation=ThoughtOperation.GENERATE,
            )
            self._thoughts[thought_id] = thought
            results.append(thought)

        return tuple(results)

    def aggregate(self, thought_ids: tuple[str, ...]) -> GraphThought:
        """Merge multiple thoughts into a unified insight."""
        source_thoughts = tuple(self._thoughts[tid] for tid in thought_ids)
        combined = "\n".join(
            f"- [{t.thought_id}]: {t.content}" for t in source_thoughts
        )

        prompt = f"""Synthesize these separate insights into a single,
coherent understanding:

{combined}

Provide a unified analysis that combines the best elements of each."""

        response = self._llm.generate(prompt)
        thought_id = self._next_id()

        merged = GraphThought(
            thought_id=thought_id,
            content=response.strip(),
            score=0.0,
            predecessors=thought_ids,
            operation=ThoughtOperation.AGGREGATE,
        )
        self._thoughts[thought_id] = merged
        return merged

    def refine(self, thought_id: str, feedback: str) -> GraphThought:
        """Refine an existing thought based on feedback."""
        original = self._thoughts[thought_id]

        prompt = f"""Original thought:
{original.content}

Feedback:
{feedback}

Produce an improved version that addresses the feedback."""

        response = self._llm.generate(prompt)
        new_id = self._next_id()

        refined = GraphThought(
            thought_id=new_id,
            content=response.strip(),
            score=0.0,
            predecessors=(thought_id,),
            operation=ThoughtOperation.REFINE,
        )
        self._thoughts[new_id] = refined
        return refined

    def score(self, thought_id: str, criteria: str) -> GraphThought:
        """Score a thought against given criteria."""
        thought = self._thoughts[thought_id]

        prompt = f"""Evaluate this thought against the criteria.

Thought: {thought.content}
Criteria: {criteria}

Score from 0.0 to 1.0 and explain briefly.
Format: SCORE: <number>"""

        response = self._llm.generate(prompt)
        try:
            score_val = float(
                response.split("SCORE:")[1].strip().split()[0]
            )
        except (IndexError, ValueError):
            score_val = 0.5

        scored = GraphThought(
            thought_id=thought.thought_id,
            content=thought.content,
            score=score_val,
            predecessors=thought.predecessors,
            operation=ThoughtOperation.SCORE,
        )
        self._thoughts[thought.thought_id] = scored
        return scored


def solve_with_graph_of_thought(llm, problem: str) -> str:
    """
    Example: Use GoT to solve a complex problem.

    Strategy:
    1. Generate parallel initial approaches
    2. Score each approach
    3. Refine top approaches
    4. Aggregate the best refined thoughts
    5. Score and return the final answer
    """
    got = GraphOfThought(llm)

    # Step 1: Generate initial approaches
    initial_thoughts = got.generate(problem, n=4)

    # Step 2: Score each
    scored = tuple(
        got.score(t.thought_id, "correctness, completeness, feasibility")
        for t in initial_thoughts
    )

    # Step 3: Keep top 2 and refine
    top_two = sorted(scored, key=lambda t: t.score, reverse=True)[:2]
    refined = tuple(
        got.refine(t.thought_id, "Make this more concrete and actionable.")
        for t in top_two
    )

    # Step 4: Aggregate the refined thoughts
    final = got.aggregate(tuple(r.thought_id for r in refined))

    # Step 5: Final scoring
    result = got.score(final.thought_id, "overall quality and completeness")
    return result.content
```

### GoT vs ToT Comparison

```
                    CoT         ToT            GoT
Topology:          Chain       Tree           DAG (Directed Acyclic Graph)
Merging:           No          No             Yes
Parallel paths:    No          Yes            Yes
Refinement:        No          Limited        Full cycle
LLM calls:        1           O(b^d)         Flexible, controlled
Best for:         Simple       Exploration    Complex synthesis
                  reasoning    problems       and integration
```

---

## 5. Task Decomposition

### Core Concept

Task decomposition breaks a complex goal into a hierarchy of manageable subtasks. This is the foundation of planning in agent systems.

```
Task Decomposition Hierarchy:

  Goal: "Build a web scraping pipeline for price monitoring"
  |
  +-- Phase 1: Setup
  |   +-- 1.1 Identify target websites
  |   +-- 1.2 Analyze page structure (HTML/CSS selectors)
  |   +-- 1.3 Set up HTTP client with retry logic
  |
  +-- Phase 2: Extraction
  |   +-- 2.1 Build URL generator for product pages
  |   +-- 2.2 Write parser for each site format
  |   +-- 2.3 Handle pagination
  |   +-- 2.4 Extract price, title, availability
  |
  +-- Phase 3: Storage
  |   +-- 3.1 Design database schema
  |   +-- 3.2 Implement data insertion
  |   +-- 3.3 Add deduplication logic
  |
  +-- Phase 4: Monitoring
      +-- 4.1 Schedule periodic scraping
      +-- 4.2 Detect price changes
      +-- 4.3 Send alerts on significant changes
```

### Decomposition Strategies

```python
from dataclasses import dataclass
from enum import Enum


class DecompositionStrategy(Enum):
    LLM_BASED = "llm_based"           # Ask LLM to break down the task
    TEMPLATE_BASED = "template_based"   # Use predefined templates
    RECURSIVE = "recursive"             # Recursively decompose until atomic
    DEPENDENCY_AWARE = "dependency"      # Decompose respecting dependencies


@dataclass(frozen=True)
class Subtask:
    task_id: str
    description: str
    dependencies: tuple[str, ...]  # IDs of tasks that must complete first
    estimated_complexity: str       # "low", "medium", "high"
    tools_needed: tuple[str, ...]


@dataclass(frozen=True)
class TaskPlan:
    goal: str
    subtasks: tuple[Subtask, ...]

    @property
    def execution_order(self) -> list[list[Subtask]]:
        """Return subtasks grouped into parallelizable waves."""
        completed: set[str] = set()
        remaining = list(self.subtasks)
        waves: list[list[Subtask]] = []

        while remaining:
            # Find tasks whose dependencies are all completed
            ready = [
                t for t in remaining
                if all(dep in completed for dep in t.dependencies)
            ]
            if not ready:
                raise ValueError(
                    f"Circular dependency detected. Remaining: "
                    f"{[t.task_id for t in remaining]}"
                )
            waves.append(ready)
            for t in ready:
                completed.add(t.task_id)
                remaining.remove(t)

        return waves


class TaskDecomposer:
    """Decomposes complex goals into structured subtask plans."""

    def __init__(self, llm):
        self._llm = llm

    def decompose(self, goal: str, context: str = "") -> TaskPlan:
        prompt = f"""Break down this goal into concrete subtasks.

Goal: {goal}
Context: {context}

For each subtask provide:
- ID (e.g., "1.1")
- Description (one sentence)
- Dependencies (list of IDs that must be done first, or "none")
- Complexity: low / medium / high
- Tools needed (e.g., "web_search", "code_editor", "file_system")

Format as structured list. Aim for 5-15 subtasks.
Ensure tasks are atomic enough to be done in a single agent step."""

        response = self._llm.generate(prompt)
        return self._parse_plan(goal, response)

    def decompose_recursive(
        self, goal: str, max_depth: int = 3, current_depth: int = 0
    ) -> TaskPlan:
        """Recursively decompose until all subtasks are atomic."""
        plan = self.decompose(goal)

        if current_depth >= max_depth:
            return plan

        refined_subtasks = []
        for subtask in plan.subtasks:
            if subtask.estimated_complexity == "high":
                # Further decompose complex subtasks
                sub_plan = self.decompose_recursive(
                    subtask.description,
                    max_depth=max_depth,
                    current_depth=current_depth + 1,
                )
                refined_subtasks.extend(sub_plan.subtasks)
            else:
                refined_subtasks.append(subtask)

        return TaskPlan(
            goal=plan.goal,
            subtasks=tuple(refined_subtasks),
        )

    def _parse_plan(self, goal: str, response: str) -> TaskPlan:
        raise NotImplementedError
```

### Dependency Graph Visualization

```
Dependency Graph for "Deploy ML model to production":

  [1] Train model --------+
                           |
  [2] Write unit tests -+  |
                        |  |
  [3] Build API --------+--+--> [5] Integration test
                        |              |
  [4] Write Dockerfile -+              |
                                       v
                              [6] Deploy to staging
                                       |
                                       v
                              [7] Run smoke tests
                                       |
                                       v
                              [8] Deploy to production

  Parallelizable:
    Wave 1: [1], [2], [3], [4]     (all independent)
    Wave 2: [5]                     (depends on 1, 2, 3, 4)
    Wave 3: [6]                     (depends on 5)
    Wave 4: [7]                     (depends on 6)
    Wave 5: [8]                     (depends on 7)
```

### Decomposition Anti-Patterns

| Anti-Pattern         | Problem                                   | Fix                                     |
| -------------------- | ----------------------------------------- | --------------------------------------- |
| Too coarse           | "Build the backend" is not actionable     | Break into API routes, DB schema, auth  |
| Too granular         | "Import os module" wastes planning tokens | Group trivial steps into logical chunks |
| Missing dependencies | Steps fail because prereqs not done       | Explicitly model dependency edges       |
| Linear-only          | No parallelism, slower execution          | Identify independent subtasks           |
| No validation step   | Don't know if subtasks achieve the goal   | Add a verification subtask at the end   |

---

## 6. Plan-and-Execute

### Core Concept

The Plan-and-Execute pattern separates planning from execution into distinct phases. An LLM first generates a complete plan, then a (potentially different) LLM or agent executes each step, with optional replanning when things go wrong.

```
Plan-and-Execute Architecture:

  User Query
      |
      v
  +-------------------+
  |   PLANNER (LLM)   |  <-- "Given this goal, produce a step-by-step plan"
  +-------------------+
      |
      v
  [Step 1] [Step 2] [Step 3] [Step 4]    <-- Structured plan
      |
      v
  +-------------------+
  |  EXECUTOR (Agent)  |  <-- Executes steps one by one
  +-------------------+
      |         |
      |    Failure?-----> REPLANNER (LLM)
      |                       |
      |                   New/modified steps
      |                       |
      v                       v
  [Result 1] ---------> Continue execution
      |
      v
  Final Result
```

### Implementation

```python
from dataclasses import dataclass
from enum import Enum
from typing import Any


class StepStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class PlanStep:
    step_id: int
    description: str
    expected_output: str
    tools: tuple[str, ...]
    status: StepStatus = StepStatus.PENDING
    result: str = ""
    error: str = ""


@dataclass(frozen=True)
class ExecutionPlan:
    goal: str
    steps: tuple[PlanStep, ...]
    current_step: int = 0


class PlanAndExecuteAgent:
    """
    Two-phase agent: first plan, then execute.
    Supports replanning on failure.
    """

    def __init__(self, planner_llm, executor_llm, tools: dict, max_replans: int = 3):
        self._planner = planner_llm
        self._executor = executor_llm
        self._tools = tools
        self._max_replans = max_replans

    def run(self, goal: str) -> str:
        # Phase 1: Generate plan
        plan = self._create_plan(goal)
        replan_count = 0

        # Phase 2: Execute steps
        step_index = 0
        completed_results: list[tuple[int, str]] = []

        while step_index < len(plan.steps):
            step = plan.steps[step_index]

            # Update status to in-progress
            updated_step = PlanStep(
                step_id=step.step_id,
                description=step.description,
                expected_output=step.expected_output,
                tools=step.tools,
                status=StepStatus.IN_PROGRESS,
            )

            try:
                result = self._execute_step(updated_step, tuple(completed_results))
                completed_results.append((step.step_id, result))
                step_index += 1

            except Exception as e:
                if replan_count >= self._max_replans:
                    return f"Failed after {replan_count} replans. Last error: {e}"

                # Replan from the failed step onward
                plan = self._replan(
                    plan, step_index, str(e), tuple(completed_results)
                )
                replan_count += 1
                # Don't increment step_index -- retry the current step

        return self._synthesize_results(goal, tuple(completed_results))

    def _create_plan(self, goal: str) -> ExecutionPlan:
        prompt = f"""Create a step-by-step plan to achieve this goal.

Goal: {goal}

Available tools: {list(self._tools.keys())}

For each step provide:
1. A clear description of what to do
2. What output to expect
3. Which tools to use

Format each step as:
Step N: [description]
Expected: [expected output]
Tools: [tool1, tool2]"""

        response = self._planner.generate(prompt)
        steps = self._parse_steps(response)
        return ExecutionPlan(goal=goal, steps=tuple(steps))

    def _execute_step(
        self, step: PlanStep, prior_results: tuple[tuple[int, str], ...]
    ) -> str:
        context = "\n".join(
            f"Step {sid} result: {res}" for sid, res in prior_results
        )

        prompt = f"""Execute this step using the available tools.

Step: {step.description}
Expected output: {step.expected_output}
Available tools: {list(step.tools)}

Prior results:
{context}

Respond with the tool to call and its arguments."""

        response = self._executor.generate(prompt)
        tool_name, args = self._parse_tool_call(response)
        return self._tools[tool_name].run(**args)

    def _replan(
        self,
        original_plan: ExecutionPlan,
        failed_step_index: int,
        error: str,
        completed_results: tuple[tuple[int, str], ...],
    ) -> ExecutionPlan:
        completed_steps = original_plan.steps[:failed_step_index]
        failed_step = original_plan.steps[failed_step_index]

        prompt = f"""A plan step failed. Create a revised plan for the remaining work.

Original goal: {original_plan.goal}
Completed steps: {[s.description for s in completed_steps]}
Failed step: {failed_step.description}
Error: {error}

Completed results so far:
{chr(10).join(f"Step {sid}: {res}" for sid, res in completed_results)}

Create new steps to achieve the original goal, working around the failure.
You may retry the failed step with a different approach or skip it if possible."""

        response = self._planner.generate(prompt)
        new_steps = self._parse_steps(response)

        return ExecutionPlan(
            goal=original_plan.goal,
            steps=tuple(list(completed_steps) + new_steps),
            current_step=failed_step_index,
        )

    def _synthesize_results(
        self, goal: str, results: tuple[tuple[int, str], ...]
    ) -> str:
        prompt = f"""Synthesize the results of all completed steps into a final answer.

Goal: {goal}
Step results:
{chr(10).join(f"Step {sid}: {res}" for sid, res in results)}

Provide a clear, complete answer to the original goal."""

        return self._planner.generate(prompt)

    def _parse_steps(self, response: str) -> list[PlanStep]:
        raise NotImplementedError

    def _parse_tool_call(self, response: str) -> tuple[str, dict]:
        raise NotImplementedError
```

### Plan-and-Execute vs ReAct

```
ReAct (interleaved reasoning + acting):

  Think -> Act -> Observe -> Think -> Act -> Observe -> ... -> Answer

  + Highly adaptive, adjusts each step
  + Works well with uncertain environments
  - Can wander, no global plan
  - Hard to estimate progress or total cost


Plan-and-Execute (separated phases):

  Plan: [S1, S2, S3, S4, S5]
  Execute: S1 -> S2 -> S3 (fail) -> Replan -> S3' -> S4' -> Answer

  + Clear progress tracking
  + Can estimate cost upfront
  + Easier to debug and audit
  - Planning overhead for simple tasks
  - Plan may be wrong (need replanning)


Hybrid (LangGraph-style):

  Plan -> Execute S1 -> Evaluate -> Maybe Replan -> Execute S2 -> ...

  Combines benefits of both approaches.
```

### When to Use Plan-and-Execute

- Multi-tool workflows with 5+ steps
- Tasks where order matters (e.g., create DB before inserting data)
- When you need cost estimation before execution
- When audit trails and reproducibility matter
- Long-running tasks where partial progress should be preserved

---

## 7. Self-Reflection and Critique

### Core Concept

Self-reflection enables agents to evaluate their own outputs, identify mistakes, and iteratively improve. This creates a feedback loop that catches errors before they reach the user.

```
Self-Reflection Loop:

  +---------+     +-----------+     +----------+     +---------+
  |  Task   |---->|  Execute  |---->| Evaluate |---->| Improve |
  +---------+     +-----------+     +----------+     +---------+
                       ^                  |               |
                       |                  | Score < threshold
                       +------------------+               |
                       |                                  |
                       +---- Score >= threshold ----------+
                                                          |
                                                          v
                                                      [Output]
```

### The Reflexion Pattern

Reflexion (Shinn et al., 2023) adds persistent memory of past failures to prevent repeating mistakes.

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ReflexionMemory:
    attempt_number: int
    action_taken: str
    result: str
    reflection: str
    should_retry: bool


class ReflexionAgent:
    """
    Agent that reflects on failures and accumulates wisdom
    across attempts.
    """

    def __init__(self, llm, tools: dict, max_attempts: int = 5):
        self._llm = llm
        self._tools = tools
        self._max_attempts = max_attempts

    def run(self, task: str) -> str:
        memories: list[ReflexionMemory] = []

        for attempt in range(1, self._max_attempts + 1):
            # Generate action informed by past reflections
            action, result = self._attempt(task, tuple(memories))

            # Evaluate the result
            evaluation = self._evaluate(task, result)

            if evaluation["success"]:
                return result

            # Reflect on the failure
            reflection = self._reflect(task, result, evaluation, tuple(memories))

            memories.append(ReflexionMemory(
                attempt_number=attempt,
                action_taken=action,
                result=result,
                reflection=reflection,
                should_retry=True,
            ))

        return f"Failed after {self._max_attempts} attempts. Last result: {result}"

    def _attempt(self, task: str, memories: tuple[ReflexionMemory, ...]) -> tuple[str, str]:
        memory_context = ""
        if memories:
            memory_context = "Previous attempts and reflections:\n"
            for m in memories:
                memory_context += (
                    f"\nAttempt {m.attempt_number}:\n"
                    f"  Action: {m.action_taken}\n"
                    f"  Result: {m.result}\n"
                    f"  Reflection: {m.reflection}\n"
                )

        prompt = f"""Complete this task. Learn from any previous failed attempts.

Task: {task}
{memory_context}

Based on the above reflections, what is the best approach now?
Provide your action and execute it."""

        response = self._llm.generate(prompt)
        action = self._extract_action(response)
        result = self._execute_action(action)
        return action, result

    def _evaluate(self, task: str, result: str) -> dict:
        prompt = f"""Evaluate whether this result successfully completes the task.

Task: {task}
Result: {result}

Respond in this format:
SUCCESS: true/false
ISSUES: [list any problems]
SCORE: 0.0 to 1.0"""

        response = self._llm.generate(prompt)
        return self._parse_evaluation(response)

    def _reflect(
        self,
        task: str,
        result: str,
        evaluation: dict,
        memories: tuple[ReflexionMemory, ...],
    ) -> str:
        prompt = f"""Reflect on why this attempt failed and what to do differently.

Task: {task}
Result: {result}
Issues: {evaluation.get('issues', [])}

Previous reflections:
{chr(10).join(m.reflection for m in memories) if memories else 'None'}

Provide a specific, actionable reflection:
1. What went wrong?
2. What should be done differently next time?
3. What new information or approach should be tried?"""

        return self._llm.generate(prompt)

    def _extract_action(self, response: str) -> str:
        raise NotImplementedError

    def _execute_action(self, action: str) -> str:
        raise NotImplementedError

    def _parse_evaluation(self, response: str) -> dict:
        raise NotImplementedError
```

### Self-Critique Pattern

A lighter-weight pattern where the LLM critiques its own output immediately.

```python
class SelfCritiqueChain:
    """Generate -> Critique -> Revise pipeline."""

    def __init__(self, llm, max_revisions: int = 3):
        self._llm = llm
        self._max_revisions = max_revisions

    def run(self, task: str) -> str:
        # Initial generation
        output = self._generate(task)

        for _ in range(self._max_revisions):
            critique = self._critique(task, output)

            if critique["is_satisfactory"]:
                return output

            output = self._revise(task, output, critique["feedback"])

        return output

    def _generate(self, task: str) -> str:
        return self._llm.generate(
            f"Complete this task thoroughly:\n{task}"
        )

    def _critique(self, task: str, output: str) -> dict:
        prompt = f"""Critically evaluate this output for the given task.

Task: {task}
Output: {output}

Check for:
1. Correctness: Are there any factual errors?
2. Completeness: Does it fully address the task?
3. Quality: Is it well-structured and clear?
4. Edge cases: Are edge cases handled?

Format:
IS_SATISFACTORY: true/false
FEEDBACK: [specific issues to fix]"""

        response = self._llm.generate(prompt)
        return self._parse_critique(response)

    def _revise(self, task: str, output: str, feedback: str) -> str:
        prompt = f"""Revise this output based on the feedback.

Original task: {task}
Current output: {output}
Feedback: {feedback}

Provide an improved version that addresses all feedback points."""

        return self._llm.generate(prompt)

    def _parse_critique(self, response: str) -> dict:
        raise NotImplementedError
```

### Reflection Strategies Comparison

| Strategy                 | LLM Calls                     | Memory | Best For                   |
| ------------------------ | ----------------------------- | ------ | -------------------------- |
| Single self-critique     | 2 (generate + critique)       | None   | Quick quality check        |
| Generate-critique-revise | 3-6                           | None   | Medium quality needs       |
| Reflexion                | 3N (attempt + eval + reflect) | Yes    | Tasks with trial-and-error |
| Constitutional AI style  | 2-4 per principle             | None   | Safety and alignment       |
| Debate (multi-agent)     | 4-10                          | Shared | High-stakes decisions      |

---

## 8. Structured Output for Planning

### Why Structure Matters

Unstructured plans are ambiguous. Structured plans are parseable, validatable, and executable by code.

```
Unstructured:
  "First, search the web for the latest data. Then analyze it.
   After that, write a report and email it."

  Problems:
  - What does "latest data" mean?
  - What kind of analysis?
  - Who gets the email?
  - What if search returns nothing?

Structured:
  {
    "steps": [
      {
        "id": 1,
        "action": "web_search",
        "params": {"query": "Q3 2025 revenue data ACME Corp"},
        "expected_output": "revenue_figures",
        "on_failure": "retry_with_alternative_query"
      },
      ...
    ]
  }
```

### JSON Plan Schema

```python
from dataclasses import dataclass
from enum import Enum


class FailureStrategy(Enum):
    RETRY = "retry"
    SKIP = "skip"
    REPLAN = "replan"
    ABORT = "abort"


# This schema is used both for validation and as the prompt template
PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "goal": {"type": "string", "description": "The high-level objective"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_id": {"type": "integer"},
                    "description": {"type": "string"},
                    "action": {
                        "type": "string",
                        "enum": [
                            "web_search", "code_execute", "file_read",
                            "file_write", "api_call", "llm_generate",
                            "human_input",
                        ],
                    },
                    "parameters": {"type": "object"},
                    "dependencies": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "step_ids that must complete first",
                    },
                    "expected_output": {
                        "type": "string",
                        "description": "What this step should produce",
                    },
                    "on_failure": {
                        "type": "string",
                        "enum": ["retry", "skip", "replan", "abort"],
                    },
                    "max_retries": {"type": "integer", "default": 2},
                },
                "required": [
                    "step_id", "description", "action",
                    "dependencies", "on_failure",
                ],
            },
        },
        "success_criteria": {
            "type": "string",
            "description": "How to verify the goal is achieved",
        },
    },
    "required": ["goal", "steps", "success_criteria"],
}


@dataclass(frozen=True)
class StructuredStep:
    step_id: int
    description: str
    action: str
    parameters: dict
    dependencies: tuple[int, ...]
    expected_output: str
    on_failure: FailureStrategy
    max_retries: int = 2


@dataclass(frozen=True)
class StructuredPlan:
    goal: str
    steps: tuple[StructuredStep, ...]
    success_criteria: str

    def validate(self) -> list[str]:
        """Validate plan for common issues."""
        errors = []
        step_ids = {s.step_id for s in self.steps}

        for step in self.steps:
            # Check dependency references are valid
            for dep in step.dependencies:
                if dep not in step_ids:
                    errors.append(
                        f"Step {step.step_id} depends on non-existent step {dep}"
                    )
                if dep >= step.step_id:
                    errors.append(
                        f"Step {step.step_id} depends on later step {dep} "
                        f"(forward dependency)"
                    )

        # Check for cycles (simple topological sort check)
        visited: set[int] = set()
        temp: set[int] = set()
        step_map = {s.step_id: s for s in self.steps}

        def has_cycle(sid: int) -> bool:
            if sid in temp:
                return True
            if sid in visited:
                return False
            temp.add(sid)
            for dep in step_map[sid].dependencies:
                if has_cycle(dep):
                    return True
            temp.discard(sid)
            visited.add(sid)
            return False

        for s in self.steps:
            if has_cycle(s.step_id):
                errors.append("Circular dependency detected in plan")
                break

        return errors

    def topological_order(self) -> list[list[StructuredStep]]:
        """Return steps grouped into parallelizable waves."""
        completed: set[int] = set()
        remaining = list(self.steps)
        waves: list[list[StructuredStep]] = []

        while remaining:
            ready = [
                s for s in remaining
                if all(d in completed for d in s.dependencies)
            ]
            if not ready:
                raise ValueError("Cannot resolve dependencies")
            waves.append(ready)
            for s in ready:
                completed.add(s.step_id)
                remaining.remove(s)

        return waves
```

### Generating Structured Plans from LLMs

````python
import json


class StructuredPlanner:
    """Generate validated, structured plans using LLM with JSON output."""

    def __init__(self, llm, schema: dict = PLAN_SCHEMA):
        self._llm = llm
        self._schema = schema

    def create_plan(self, goal: str, context: str = "") -> StructuredPlan:
        prompt = f"""Create a detailed execution plan as JSON.

Goal: {goal}
Context: {context}

You must follow this JSON schema exactly:
{json.dumps(self._schema, indent=2)}

Important rules:
1. Each step_id must be unique and sequential starting from 1.
2. Dependencies must reference earlier step_ids only.
3. Choose the most appropriate action for each step.
4. Set on_failure based on whether the step is critical.
5. Be specific in descriptions and parameters.

Respond with ONLY valid JSON, no other text."""

        response = self._llm.generate(prompt)
        plan_dict = json.loads(self._extract_json(response))
        plan = self._dict_to_plan(plan_dict)

        # Validate
        errors = plan.validate()
        if errors:
            # Ask LLM to fix the plan
            return self._fix_plan(plan, errors)

        return plan

    def _fix_plan(self, plan: StructuredPlan, errors: list[str]) -> StructuredPlan:
        prompt = f"""This plan has validation errors. Fix them.

Current plan: {json.dumps(self._plan_to_dict(plan), indent=2)}
Errors: {errors}

Respond with the corrected JSON plan only."""

        response = self._llm.generate(prompt)
        plan_dict = json.loads(self._extract_json(response))
        return self._dict_to_plan(plan_dict)

    def _extract_json(self, text: str) -> str:
        """Extract JSON from LLM response that may include markdown fences."""
        if "```json" in text:
            return text.split("```json")[1].split("```")[0].strip()
        if "```" in text:
            return text.split("```")[1].split("```")[0].strip()
        return text.strip()

    def _dict_to_plan(self, d: dict) -> StructuredPlan:
        steps = tuple(
            StructuredStep(
                step_id=s["step_id"],
                description=s["description"],
                action=s["action"],
                parameters=s.get("parameters", {}),
                dependencies=tuple(s.get("dependencies", [])),
                expected_output=s.get("expected_output", ""),
                on_failure=FailureStrategy(s.get("on_failure", "replan")),
                max_retries=s.get("max_retries", 2),
            )
            for s in d["steps"]
        )
        return StructuredPlan(
            goal=d["goal"],
            steps=steps,
            success_criteria=d.get("success_criteria", ""),
        )

    def _plan_to_dict(self, plan: StructuredPlan) -> dict:
        return {
            "goal": plan.goal,
            "steps": [
                {
                    "step_id": s.step_id,
                    "description": s.description,
                    "action": s.action,
                    "parameters": s.parameters,
                    "dependencies": list(s.dependencies),
                    "expected_output": s.expected_output,
                    "on_failure": s.on_failure.value,
                    "max_retries": s.max_retries,
                }
                for s in plan.steps
            ],
            "success_criteria": plan.success_criteria,
        }
````

---

## 9. Replanning Strategies

### When to Replan

```
Replanning Decision Tree:

  Step Failed?
      |
      +-- No --> Continue to next step
      |
      +-- Yes
           |
           +-- Retries remaining?
           |       |
           |       +-- Yes --> Retry same step
           |       |
           |       +-- No --> Is step critical?
           |                    |
           |                    +-- No --> Skip step, continue
           |                    |
           |                    +-- Yes --> Full replan
           |
           +-- Environment changed?
           |       |
           |       +-- Yes --> Full replan (assumptions invalidated)
           |       |
           |       +-- No --> Partial replan (adjust remaining steps)
           |
           +-- New information available?
                   |
                   +-- Yes --> Incorporate and partial replan
                   |
                   +-- No --> Retry with different approach
```

### Replanning Strategies

```python
from dataclasses import dataclass
from enum import Enum
from typing import Any


class ReplanTrigger(Enum):
    STEP_FAILURE = "step_failure"
    TIMEOUT = "timeout"
    NEW_INFORMATION = "new_information"
    ENVIRONMENT_CHANGE = "environment_change"
    USER_FEEDBACK = "user_feedback"
    COST_OVERRUN = "cost_overrun"


@dataclass(frozen=True)
class ReplanContext:
    trigger: ReplanTrigger
    failed_step_index: int
    error_message: str
    completed_steps: tuple[dict, ...]  # {step_id, result} pairs
    remaining_steps: tuple[dict, ...]
    total_cost_so_far: float
    budget_remaining: float


class AdaptivePlanner:
    """Planner with multiple replanning strategies."""

    def __init__(self, llm, tools: dict):
        self._llm = llm
        self._tools = tools

    def replan(self, original_goal: str, context: ReplanContext) -> list[dict]:
        """Select and apply the appropriate replanning strategy."""
        strategy = self._select_strategy(context)

        strategy_handlers = {
            "retry_modified": self._retry_with_modification,
            "partial_replan": self._partial_replan,
            "full_replan": self._full_replan,
            "skip_and_continue": self._skip_and_continue,
            "abort": self._abort,
        }

        handler = strategy_handlers[strategy]
        return handler(original_goal, context)

    def _select_strategy(self, context: ReplanContext) -> str:
        """Decide which replanning strategy to use."""
        # Cost guard: if we've used > 80% of budget, be conservative
        if context.budget_remaining < context.total_cost_so_far * 0.25:
            return "abort"

        # If only 1-2 steps remain, just retry with modification
        if len(context.remaining_steps) <= 2:
            return "retry_modified"

        # Environment change invalidates assumptions -- full replan
        if context.trigger == ReplanTrigger.ENVIRONMENT_CHANGE:
            return "full_replan"

        # New information might only affect some steps
        if context.trigger == ReplanTrigger.NEW_INFORMATION:
            return "partial_replan"

        # Step failure with retries exhausted
        if context.trigger == ReplanTrigger.STEP_FAILURE:
            return "partial_replan"

        return "full_replan"

    def _retry_with_modification(
        self, goal: str, context: ReplanContext
    ) -> list[dict]:
        """Retry the failed step with a modified approach."""
        prompt = f"""A step failed. Suggest a modified approach.

Goal: {goal}
Failed step: {context.remaining_steps[0] if context.remaining_steps else 'N/A'}
Error: {context.error_message}

What is an alternative way to accomplish this step?
Keep the same output format but change the approach."""

        response = self._llm.generate(prompt)
        return self._parse_steps(response)

    def _partial_replan(self, goal: str, context: ReplanContext) -> list[dict]:
        """Replan only the remaining steps, keeping completed work."""
        completed_summary = "\n".join(
            f"  Step {s['step_id']}: {s.get('result', 'done')}"
            for s in context.completed_steps
        )

        prompt = f"""Replan the remaining steps. Keep completed work intact.

Goal: {goal}
Completed so far:
{completed_summary}

Failed at: {context.error_message}

Create new steps to complete the goal from this point forward.
You have these results available from completed steps."""

        response = self._llm.generate(prompt)
        return self._parse_steps(response)

    def _full_replan(self, goal: str, context: ReplanContext) -> list[dict]:
        """Create an entirely new plan, informed by what was learned."""
        lessons = "\n".join(
            f"- Step {s['step_id']}: {s.get('result', 'completed')}"
            for s in context.completed_steps
        )

        prompt = f"""Create a completely new plan. The previous approach failed.

Goal: {goal}
What we learned from the previous attempt:
{lessons}
Failure: {context.error_message}

Create a new plan that avoids the previous failure mode.
You may reuse results from completed steps if still valid."""

        response = self._llm.generate(prompt)
        return self._parse_steps(response)

    def _skip_and_continue(
        self, goal: str, context: ReplanContext
    ) -> list[dict]:
        """Skip the failed step and continue with remaining."""
        return [s for s in context.remaining_steps[1:]]

    def _abort(self, goal: str, context: ReplanContext) -> list[dict]:
        """Return empty plan, signaling abort."""
        return []

    def _parse_steps(self, response: str) -> list[dict]:
        raise NotImplementedError
```

### Partial vs Full Replanning

```
Partial Replan (preserves completed work):

  Original:  [S1:done] [S2:done] [S3:FAIL] [S4] [S5]
  After:     [S1:done] [S2:done] [S3':new] [S4':new] [S5':new]

  + Saves tokens (don't re-plan completed steps)
  + Preserves useful intermediate results
  - May miss that earlier assumptions were wrong


Full Replan (start from scratch):

  Original:  [S1:done] [S2:done] [S3:FAIL] [S4] [S5]
  After:     [S1':new] [S2':new] [S3':new] [S4':new]

  + Can take a completely different approach
  + Catches flawed assumptions from early steps
  - More expensive (re-does completed work)
  - Wastes already-computed results
```

### Budget-Aware Replanning

```python
@dataclass(frozen=True)
class CostEstimate:
    llm_tokens: int
    tool_calls: int
    estimated_cost_usd: float


def should_replan_given_budget(
    estimated_replan_cost: CostEstimate,
    budget_remaining: float,
    completion_percentage: float,
    importance: str,  # "critical", "important", "nice_to_have"
) -> bool:
    """Decide whether replanning is worth the cost."""
    if importance == "critical":
        # Always replan critical tasks if budget allows
        return estimated_replan_cost.estimated_cost_usd <= budget_remaining

    if importance == "important":
        # Replan if we're less than 70% done and have budget
        return (
            completion_percentage < 0.7
            and estimated_replan_cost.estimated_cost_usd <= budget_remaining * 0.5
        )

    # Nice-to-have: only replan if cheap and early
    return (
        completion_percentage < 0.3
        and estimated_replan_cost.estimated_cost_usd <= budget_remaining * 0.2
    )
```

---

## 10. Reasoning Under Uncertainty

### Core Challenge

Agents must make decisions with incomplete information, unreliable tool outputs, and ambiguous user intent. Good agents quantify their uncertainty and act accordingly.

```
Uncertainty Sources in Agent Systems:

  +------------------+    +-------------------+    +------------------+
  | User Intent      |    | Tool Reliability  |    | World State      |
  | - Ambiguous query|    | - API failures    |    | - Stale data     |
  | - Missing context|    | - Partial results |    | - Race conditions|
  | - Implicit goals |    | - Wrong formats   |    | - Changing env   |
  +------------------+    +-------------------+    +------------------+
          |                       |                        |
          v                       v                        v
  +---------------------------------------------------------------+
  |              Agent Reasoning Under Uncertainty                 |
  |                                                                |
  |  Strategy: Estimate confidence -> Act accordingly              |
  |  High confidence: Execute directly                             |
  |  Medium confidence: Execute with verification                  |
  |  Low confidence: Ask for clarification or use fallback         |
  +---------------------------------------------------------------+
```

### Confidence Estimation

```python
from dataclasses import dataclass
from enum import Enum


class ConfidenceLevel(Enum):
    HIGH = "high"        # > 0.8
    MEDIUM = "medium"    # 0.5 - 0.8
    LOW = "low"          # 0.2 - 0.5
    VERY_LOW = "very_low"  # < 0.2


@dataclass(frozen=True)
class ConfidenceAssessment:
    score: float  # 0.0 to 1.0
    level: ConfidenceLevel
    reasoning: str
    uncertainties: tuple[str, ...]
    suggested_action: str


class UncertaintyAwareAgent:
    """Agent that estimates and acts on its uncertainty."""

    def __init__(self, llm, tools: dict):
        self._llm = llm
        self._tools = tools

    def assess_confidence(self, task: str, context: str) -> ConfidenceAssessment:
        """Ask the LLM to assess its confidence before acting."""
        prompt = f"""Before acting on this task, assess your confidence.

Task: {task}
Available context: {context}

Rate your confidence from 0.0 to 1.0 and explain:
1. CONFIDENCE_SCORE: (0.0 to 1.0)
2. UNCERTAINTIES: (list what you're unsure about)
3. SUGGESTED_ACTION: One of:
   - "execute" (confident enough to proceed)
   - "execute_and_verify" (proceed but double-check)
   - "clarify" (ask user for more info)
   - "fallback" (use a safer, simpler approach)"""

        response = self._llm.generate(prompt)
        return self._parse_assessment(response)

    def act_with_uncertainty(self, task: str, context: str = "") -> str:
        """Execute a task with uncertainty-aware decision making."""
        assessment = self.assess_confidence(task, context)

        if assessment.level == ConfidenceLevel.HIGH:
            return self._execute_directly(task, context)

        if assessment.level == ConfidenceLevel.MEDIUM:
            result = self._execute_directly(task, context)
            verification = self._verify_result(task, result)
            if verification["is_correct"]:
                return result
            return self._execute_with_fallback(task, context)

        if assessment.level == ConfidenceLevel.LOW:
            clarification = self._request_clarification(task, assessment.uncertainties)
            if clarification:
                return self.act_with_uncertainty(task, f"{context}\n{clarification}")
            return self._execute_with_fallback(task, context)

        # VERY_LOW: refuse or use safest possible approach
        return (
            f"I'm not confident enough to proceed with this task. "
            f"Uncertainties: {', '.join(assessment.uncertainties)}"
        )

    def _execute_directly(self, task: str, context: str) -> str:
        raise NotImplementedError

    def _verify_result(self, task: str, result: str) -> dict:
        raise NotImplementedError

    def _execute_with_fallback(self, task: str, context: str) -> str:
        raise NotImplementedError

    def _request_clarification(
        self, task: str, uncertainties: tuple[str, ...]
    ) -> str:
        raise NotImplementedError

    def _parse_assessment(self, response: str) -> ConfidenceAssessment:
        raise NotImplementedError
```

### Fallback Strategies

```python
@dataclass(frozen=True)
class FallbackChain:
    """Chain of increasingly conservative strategies."""
    strategies: tuple[str, ...]

    # Example chains for different scenarios:
    # Code generation: ("generate", "generate_with_tests", "generate_skeleton", "ask_human")
    # Search: ("semantic_search", "keyword_search", "browse_manually", "ask_human")
    # API call: ("call_api", "call_backup_api", "use_cached_data", "return_error")


class FallbackExecutor:
    """Execute with automatic fallback through a chain of strategies."""

    def __init__(self, llm, strategies: dict):
        self._llm = llm
        self._strategies = strategies

    def execute_with_fallbacks(
        self, task: str, fallback_chain: FallbackChain
    ) -> tuple[str, str]:
        """Try each strategy in order until one succeeds.

        Returns:
            Tuple of (result, strategy_used).
        """
        errors = []

        for strategy_name in fallback_chain.strategies:
            strategy = self._strategies.get(strategy_name)
            if strategy is None:
                continue

            try:
                result = strategy.execute(task)
                return result, strategy_name
            except Exception as e:
                errors.append(f"{strategy_name}: {e}")
                continue

        error_summary = "; ".join(errors)
        raise RuntimeError(
            f"All fallback strategies exhausted. Errors: {error_summary}"
        )
```

### Handling Ambiguous User Intent

```python
class IntentDisambiguator:
    """Detect and resolve ambiguous user requests."""

    def __init__(self, llm):
        self._llm = llm

    def analyze_intent(self, user_query: str) -> dict:
        prompt = f"""Analyze this user request for ambiguity.

Request: "{user_query}"

Identify:
1. CLEAR_INTENT: What the user most likely wants (best guess)
2. ALTERNATIVE_INTENTS: Other possible interpretations (list 2-3)
3. AMBIGUITY_SCORE: 0.0 (perfectly clear) to 1.0 (very ambiguous)
4. CLARIFYING_QUESTIONS: Questions that would resolve ambiguity

Format as structured response."""

        response = self._llm.generate(prompt)
        return self._parse_intent_analysis(response)

    def should_clarify(self, analysis: dict, threshold: float = 0.4) -> bool:
        """Determine if we should ask for clarification."""
        return analysis.get("ambiguity_score", 0.0) > threshold

    def generate_clarification(self, analysis: dict) -> str:
        """Generate a user-friendly clarification request."""
        questions = analysis.get("clarifying_questions", [])
        if not questions:
            return ""

        formatted = "\n".join(f"- {q}" for q in questions[:3])
        return (
            f"I want to make sure I understand your request correctly. "
            f"Could you clarify:\n{formatted}"
        )

    def _parse_intent_analysis(self, response: str) -> dict:
        raise NotImplementedError
```

---

## 11. Planning for Code Tasks

### File-Level Planning

Before modifying code, agents should create a file-level plan that identifies which files to read, modify, create, or delete.

```
Code Task Planning Pipeline:

  User Request: "Add authentication to the API"
      |
      v
  [1. Codebase Analysis]
      - Scan project structure
      - Identify relevant files
      - Understand existing patterns
      |
      v
  [2. Impact Analysis]
      - Which files need changes?
      - What are the dependencies?
      - Are there tests to update?
      |
      v
  [3. Edit Plan]
      - Order of file modifications
      - Specific changes per file
      - New files needed
      |
      v
  [4. Execution]
      - Apply changes in dependency order
      - Run tests after each change
      - Verify build still passes
```

```python
from dataclasses import dataclass
from enum import Enum


class FileAction(Enum):
    READ = "read"
    MODIFY = "modify"
    CREATE = "create"
    DELETE = "delete"
    RENAME = "rename"


@dataclass(frozen=True)
class FileChange:
    file_path: str
    action: FileAction
    description: str
    dependencies: tuple[str, ...]  # File paths that must be changed first
    estimated_lines_changed: int
    risk_level: str  # "low", "medium", "high"


@dataclass(frozen=True)
class CodePlan:
    task_description: str
    files_to_read: tuple[str, ...]      # Read for context
    file_changes: tuple[FileChange, ...]  # Ordered changes
    tests_to_run: tuple[str, ...]
    verification_steps: tuple[str, ...]


class CodeTaskPlanner:
    """Plans code modifications by analyzing codebase structure."""

    def __init__(self, llm, codebase_index: dict):
        self._llm = llm
        self._index = codebase_index  # Pre-built index of files and symbols

    def plan_code_change(self, task: str, relevant_files: tuple[str, ...]) -> CodePlan:
        # Step 1: Understand the codebase context
        file_summaries = self._summarize_files(relevant_files)

        # Step 2: Generate the plan
        prompt = f"""Plan the code changes needed for this task.

Task: {task}

Relevant files and their contents:
{file_summaries}

For each file that needs changing, specify:
1. File path
2. Action: read / modify / create / delete
3. What changes to make (be specific)
4. Dependencies (which files must be changed first)
5. Risk level: low (formatting) / medium (logic) / high (breaking change)

Also specify:
- Which test files to update or create
- What verification steps to run after changes

Order the changes so dependencies are satisfied."""

        response = self._llm.generate(prompt)
        return self._parse_code_plan(task, response)

    def _analyze_dependencies(
        self, file_changes: tuple[FileChange, ...]
    ) -> tuple[FileChange, ...]:
        """Analyze and correct dependency ordering."""
        # Build dependency graph
        change_by_path = {fc.file_path: fc for fc in file_changes}

        # Topological sort
        visited: set[str] = set()
        ordered: list[FileChange] = []

        def visit(path: str) -> None:
            if path in visited:
                return
            visited.add(path)
            fc = change_by_path.get(path)
            if fc is None:
                return
            for dep in fc.dependencies:
                visit(dep)
            ordered.append(fc)

        for fc in file_changes:
            visit(fc.file_path)

        return tuple(ordered)

    def _summarize_files(self, file_paths: tuple[str, ...]) -> str:
        raise NotImplementedError

    def _parse_code_plan(self, task: str, response: str) -> CodePlan:
        raise NotImplementedError
```

### Edit Planning with Diff Preview

```python
@dataclass(frozen=True)
class EditOperation:
    file_path: str
    operation: str  # "insert", "replace", "delete"
    target: str     # Line number, function name, or search string
    old_code: str   # What's currently there (for replace/delete)
    new_code: str   # What to put there (for insert/replace)
    rationale: str


class EditPlanner:
    """Plans specific code edits before execution."""

    def __init__(self, llm):
        self._llm = llm

    def plan_edits(
        self, file_content: str, file_path: str, change_description: str
    ) -> tuple[EditOperation, ...]:
        prompt = f"""Plan specific edits to this file.

File: {file_path}
Current content:
```

{file_content}

```

Required change: {change_description}

For each edit, specify:
1. Operation: insert / replace / delete
2. Target: The exact code to find (for replace/delete) or location (for insert)
3. Old code: Current code (for replace/delete, empty for insert)
4. New code: New code (for insert/replace, empty for delete)
5. Rationale: Why this change is needed

List edits in the order they should be applied.
Be precise about the target -- use enough context to uniquely identify the location."""

        response = self._llm.generate(prompt)
        return self._parse_edits(file_path, response)

    def preview_edits(
        self, file_content: str, edits: tuple[EditOperation, ...]
    ) -> str:
        """Generate a unified diff preview of planned edits."""
        lines = file_content.split("\n")
        result_lines = list(lines)  # Working copy

        # Apply edits in reverse order to preserve line numbers
        for edit in reversed(edits):
            if edit.operation == "replace":
                old_lines = edit.old_code.split("\n")
                new_lines = edit.new_code.split("\n")
                # Find the old code in result_lines
                for i in range(len(result_lines) - len(old_lines) + 1):
                    if result_lines[i:i + len(old_lines)] == old_lines:
                        result_lines[i:i + len(old_lines)] = new_lines
                        break

        # Generate diff
        import difflib
        diff = difflib.unified_diff(
            lines, result_lines,
            fromfile=f"a/{edits[0].file_path}" if edits else "a/file",
            tofile=f"b/{edits[0].file_path}" if edits else "b/file",
            lineterm="",
        )
        return "\n".join(diff)

    def _parse_edits(self, file_path: str, response: str) -> tuple[EditOperation, ...]:
        raise NotImplementedError
```

### Dependency Analysis for Code Changes

```
Dependency Analysis Example:

  Task: "Add user authentication middleware"

  File Dependency Graph:

  models/user.py  --------+
       |                   |
       v                   v
  auth/jwt_utils.py   auth/middleware.py
       |                   |
       v                   v
  routes/auth.py      routes/protected.py
       |                   |
       v                   v
  tests/test_auth.py  tests/test_routes.py

  Execution Order (waves):
    Wave 1: models/user.py          (no dependencies)
    Wave 2: auth/jwt_utils.py       (depends on user model)
    Wave 3: auth/middleware.py      (depends on jwt_utils)
    Wave 4: routes/auth.py,         (depend on middleware,
            routes/protected.py      can run in parallel)
    Wave 5: tests/test_auth.py,     (depend on routes,
            tests/test_routes.py     can run in parallel)
```

```python
class CodeDependencyAnalyzer:
    """Analyze dependencies between code changes."""

    def __init__(self, llm):
        self._llm = llm

    def analyze_import_dependencies(
        self, file_changes: tuple[FileChange, ...]
    ) -> dict[str, tuple[str, ...]]:
        """Build a dependency map based on imports."""
        dependency_map: dict[str, list[str]] = {}

        for change in file_changes:
            prompt = f"""Given this file change:
File: {change.file_path}
Description: {change.description}

Which other files from this list would this file import from or depend on?
Files: {[c.file_path for c in file_changes]}

List only direct dependencies, one per line."""

            response = self._llm.generate(prompt)
            deps = [
                line.strip()
                for line in response.strip().split("\n")
                if line.strip() in {c.file_path for c in file_changes}
            ]
            dependency_map[change.file_path] = deps

        return {k: tuple(v) for k, v in dependency_map.items()}

    def find_safe_execution_order(
        self, dependency_map: dict[str, tuple[str, ...]]
    ) -> list[list[str]]:
        """Topological sort into parallelizable waves."""
        completed: set[str] = set()
        remaining = set(dependency_map.keys())
        waves: list[list[str]] = []

        while remaining:
            ready = [
                f for f in remaining
                if all(dep in completed for dep in dependency_map.get(f, ()))
            ]
            if not ready:
                raise ValueError(
                    f"Circular dependency among: {remaining}"
                )
            waves.append(sorted(ready))
            for f in ready:
                completed.add(f)
                remaining.discard(f)

        return waves
```

---

## 12. Common Interview Questions

### Q1: "How would you implement planning in an AI agent? Walk through the tradeoffs."

**Model Answer:**

Planning in an agent can range from no planning (reactive) to full upfront planning (deliberative). The key tradeoffs:

**Reactive (ReAct-style):** The agent reasons one step at a time -- think, act, observe, repeat. This is simple and adaptive but can wander, has no global progress tracking, and is hard to estimate cost for.

**Upfront Planning (Plan-and-Execute):** A planner LLM generates a structured plan (JSON with step IDs, descriptions, dependencies, and failure strategies). An executor agent then runs each step. Benefits include progress tracking, cost estimation, and auditability. Downsides: planning overhead, plans may be wrong.

**Hybrid:** Plan first, then execute with periodic re-evaluation. After each step (or every N steps), check if the plan is still valid. If not, replan from the current state. This gives you the structure of upfront planning with the adaptability of reactive approaches.

In production, I would use a structured JSON plan schema with dependency tracking, failure strategies per step (retry, skip, replan, abort), and budget guards to prevent runaway replanning. The planner and executor can use different models -- a stronger model for planning and a faster, cheaper model for execution.

---

### Q2: "Explain Chain-of-Thought vs Tree-of-Thought. When would you use each?"

**Model Answer:**

**Chain-of-Thought (CoT)** is linear reasoning: the model produces one step-by-step reasoning chain before answering. It is cheap (1 LLM call), effective on math and logic, and works with both zero-shot ("Let's think step by step") and few-shot approaches.

**Tree-of-Thought (ToT)** explores multiple reasoning paths in parallel, evaluates them, prunes bad branches, and selects the best. It uses BFS or DFS over a tree of partial reasoning sequences.

**When to use CoT:** For most tasks. It is the default. Use it when the problem has a single clear solution path and cost matters.

**When to use ToT:** For creative or exploratory problems where the first reasoning path might be wrong -- puzzle solving, architectural decisions, complex debugging. The cost is 3-10x more LLM calls, so only use ToT when the stakes justify it.

**Key insight for interviews:** ToT is essentially a search algorithm (BFS/DFS) where the nodes are partial reasoning chains and the evaluation function is another LLM call. The branching factor and max depth are hyperparameters you tune for cost vs quality.

---

### Q3: "How would you handle a situation where an agent's plan fails midway through execution?"

**Model Answer:**

I would implement a layered failure handling strategy:

1. **Step-level retry:** Each step has a `max_retries` and an `on_failure` strategy. For transient errors (API timeouts, rate limits), retry with exponential backoff.

2. **Step-level skip:** If the step is non-critical and has no downstream dependencies, skip it and continue. Mark the result as "skipped" so downstream steps can handle missing data.

3. **Partial replan:** If the step is critical but the overall approach is sound, replan only the remaining steps. Pass the completed results and the error to the planner. This preserves completed work and is cheaper than a full replan.

4. **Full replan:** If the failure reveals a flawed assumption (e.g., an API doesn't exist, data format changed), do a full replan informed by what was learned. Include "lessons learned" from the failed attempt.

5. **Budget guard:** Before any replan, check remaining budget. If replanning would cost more than the remaining budget allows, abort gracefully and return partial results with an explanation.

6. **Human escalation:** For high-stakes tasks, if confidence drops below a threshold after replanning, surface the situation to the user with the current state and ask for guidance.

---

### Q4: "How do you ensure an agent's reasoning is faithful and not just post-hoc rationalization?"

**Model Answer:**

This is a fundamental challenge. LLMs can produce plausible-sounding reasoning that doesn't actually reflect how they arrived at their answer. Several strategies help:

1. **Process verification:** Instead of just checking the final answer, verify each intermediate step. Use a separate "verifier" LLM call to check whether each reasoning step follows logically from the previous one.

2. **Outcome-based testing:** Run the plan. If CoT reasoning says "Step 2 depends on Step 1's output X," verify that X was actually produced and used. Ground truth testing catches unfaithful reasoning.

3. **Diverse reasoning:** Generate multiple independent reasoning chains (like in self-consistency or ToT) and check whether they converge. If three independent chains reach the same conclusion via different paths, the reasoning is more likely faithful.

4. **Structured output:** Force the model to produce structured plans (JSON with explicit dependencies) rather than free-text reasoning. This makes it harder to hide sloppy reasoning behind fluent prose.

5. **Reflexion:** Have the agent reflect on its reasoning after getting results. If the results don't match the predictions from the reasoning, flag the reasoning as potentially unfaithful.

The honest answer is that we cannot fully guarantee faithfulness today. The best we can do is design systems where unfaithful reasoning is caught by downstream verification before it causes harm.

---

### Q5: "Design a planning system for a coding agent that needs to refactor a large codebase."

**Model Answer:**

I would build a three-phase system:

**Phase 1: Analysis (read-only)**

- Scan the project structure and build a file dependency graph
- Identify the scope of the refactoring (which files, functions, and symbols are affected)
- Analyze test coverage to know which changes have safety nets
- Output: a JSON analysis document with affected files, dependencies, and risk levels

**Phase 2: Planning (no writes)**

- Generate a structured plan with ordered file changes
- Group changes into parallelizable waves based on dependency analysis
- For each file change, specify the exact edit operations (replace, insert, delete)
- Add verification steps after each wave (run tests, type check, lint)
- Include rollback strategy (git stash/branch) for each wave
- Output: a JSON execution plan with steps, dependencies, and verification gates

**Phase 3: Execution (with verification)**

- Create a feature branch
- Execute each wave of changes
- After each wave: run relevant tests, type checker, linter
- If any verification fails: either auto-fix or replan the remaining waves
- After all waves: run the full test suite
- Generate a summary of all changes for code review

Key design decisions:

- Use a stronger model (e.g., Claude Opus) for the analysis and planning phases, and a faster model (e.g., Claude Sonnet) for executing individual edits
- Plan at the edit-operation level (not just file level) to make execution deterministic
- Always verify after each wave, not just at the end, to catch issues early
- Keep a running context of completed changes so replanning is informed

---

### Q6: "What is the Reflexion pattern and how does it differ from simple retry?"

**Model Answer:**

**Simple retry** repeats the exact same action hoping for a different result (useful for transient errors like network timeouts, but useless for logic errors).

**Reflexion** adds a reflection step between attempts. After a failure, the agent:

1. Evaluates what went wrong
2. Generates a textual reflection explaining the failure and what to do differently
3. Stores this reflection in a persistent memory
4. On the next attempt, includes all prior reflections in the prompt

The key difference is **learning from mistakes**. Each subsequent attempt is informed by accumulated wisdom from prior failures. The reflection memory prevents the agent from making the same mistake twice.

Example: An agent tries to write code that passes a test suite. Attempt 1 fails because it missed an edge case. The reflection notes "the function doesn't handle empty input." Attempt 2 includes this reflection and adds the edge case handling.

Reflexion is especially effective for:

- Code generation (learn from test failures)
- Tool use (learn which parameters work)
- Multi-step reasoning (learn which approaches are dead ends)

Limitation: Reflexion adds 3 LLM calls per attempt (execute, evaluate, reflect) vs 1 for simple retry. After 3-5 attempts, the reflection history gets long and may degrade performance. Cap the number of attempts and summarize old reflections to keep context manageable.

---

### Q7: "How would you implement confidence-aware decision making in an agent?"

**Model Answer:**

I would have the agent assess its confidence at three points:

1. **Before planning:** Analyze the user request for ambiguity. If ambiguity score is above a threshold, ask for clarification instead of guessing. This prevents wasted effort on the wrong task.

2. **Before each action:** Ask the LLM to rate its confidence (0-1) in the proposed action and list specific uncertainties. Route to different strategies:

   - High confidence (>0.8): execute directly
   - Medium (0.5-0.8): execute with verification
   - Low (0.2-0.5): use a safer fallback approach or ask the user
   - Very low (<0.2): refuse and explain uncertainties

3. **After getting results:** Verify whether the result matches expectations. If it doesn't, lower confidence and potentially trigger replanning.

Implementation-wise, I would use a `FallbackChain` pattern where each task type has an ordered list of strategies from most capable to most conservative. The system tries the first strategy, and if confidence is too low or execution fails, it falls back to the next.

Calibrating confidence is hard -- LLMs tend to be overconfident. I would use empirical calibration: run the agent on a test set, record its confidence scores vs actual success rates, and apply a calibration function (e.g., Platt scaling) to map raw confidence scores to calibrated probabilities.

---

## 13. Quick Reference

### Planning Pattern Comparison

| Pattern          | LLM Calls       | Latency     | Cost      | Adaptability        | Best For                      |
| ---------------- | --------------- | ----------- | --------- | ------------------- | ----------------------------- |
| Direct (no plan) | 1               | Lowest      | Lowest    | None                | Simple, single-step tasks     |
| Chain-of-Thought | 1               | Low         | Low       | None                | Math, logic, step-by-step     |
| ReAct            | 3-15            | Medium      | Medium    | High                | Interactive tool use          |
| Plan-and-Execute | 5-20            | Medium-High | Medium    | Medium (replanning) | Multi-step workflows          |
| Tree-of-Thought  | 10-50           | High        | High      | Medium              | Creative/exploratory problems |
| Graph-of-Thought | 10-30           | High        | High      | High                | Complex synthesis tasks       |
| Reflexion        | 3N (N attempts) | Very High   | Very High | Very High           | Trial-and-error tasks         |

### Decision Flowchart

```
How to Choose a Planning Strategy:

  Is the task a single step?
      |
      +-- Yes --> Direct execution (no planning)
      |
      +-- No
           |
           Does it require exploration of alternatives?
               |
               +-- Yes --> Tree-of-Thought or Graph-of-Thought
               |
               +-- No
                    |
                    Are there dependencies between steps?
                        |
                        +-- Yes --> Plan-and-Execute with dependency graph
                        |
                        +-- No
                             |
                             Is the environment unpredictable?
                                 |
                                 +-- Yes --> ReAct (adaptive step-by-step)
                                 |
                                 +-- No --> Plan-and-Execute (upfront plan)
```

### Key Formulas and Heuristics

```
Cost estimation:
  Total cost = (planning_calls * planner_cost) +
               (execution_calls * executor_cost) +
               (replan_probability * replan_cost)

When to stop replanning:
  Stop when: replan_cost > (budget_remaining * urgency_factor)
  Where urgency_factor: 0.2 (nice-to-have) to 1.0 (critical)

Branching factor for ToT:
  b = 3 is a good default
  Increase for creative tasks (b=5)
  Decrease for constrained tasks (b=2)

Reflexion attempt limit:
  Max attempts = min(5, budget / cost_per_attempt)
  Diminishing returns after attempt 3 in most cases

Confidence calibration:
  calibrated_confidence = sigmoid(a * raw_confidence + b)
  Where a, b are fit on validation data
```

### Production Checklist

Before deploying a planning-based agent:

- [ ] **Budget guards**: Maximum total LLM calls capped
- [ ] **Timeout per step**: No single step runs forever
- [ ] **Replan limit**: Maximum number of replans capped (typically 3)
- [ ] **Structured plans**: All plans are JSON-serializable and validatable
- [ ] **Dependency validation**: No circular dependencies, no forward references
- [ ] **Failure strategies**: Every step has an `on_failure` strategy
- [ ] **Observability**: All plans, steps, and results are logged
- [ ] **Human escalation**: Agent can hand off to humans for low-confidence decisions
- [ ] **Idempotency**: Steps can be safely retried without side effects
- [ ] **Rollback plan**: Critical operations have undo/rollback procedures

### Key Papers and References

| Paper                                   | Year | Key Contribution                     |
| --------------------------------------- | ---- | ------------------------------------ |
| Chain-of-Thought Prompting (Wei et al.) | 2022 | Step-by-step reasoning in LLMs       |
| Tree of Thoughts (Yao et al.)           | 2023 | Branching exploration over thoughts  |
| Graph of Thoughts (Besta et al.)        | 2023 | Non-linear reasoning with merging    |
| Reflexion (Shinn et al.)                | 2023 | Learning from verbal self-reflection |
| ReAct (Yao et al.)                      | 2022 | Interleaved reasoning and acting     |
| Plan-and-Solve (Wang et al.)            | 2023 | Zero-shot planning decomposition     |
| Self-Refine (Madaan et al.)             | 2023 | Iterative self-feedback refinement   |
| LLM+P (Liu et al.)                      | 2023 | LLMs with classical planning         |

---

_This guide covers the core planning and reasoning patterns used in production AI agent systems. Master these patterns and you will be well-prepared for agentic engineering interviews._
