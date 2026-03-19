# Agent Evaluation and Observability

A comprehensive interview-prep guide for agentic engineers covering evaluation methodology, observability tooling, cost tracking, debugging, and regression testing for LLM-powered agents.

---

## Table of Contents

1. [Why Agent Eval is Hard](#1-why-agent-eval-is-hard)
2. [Evaluation Dimensions](#2-evaluation-dimensions)
3. [Benchmarks](#3-benchmarks)
4. [Offline Evaluation](#4-offline-evaluation)
5. [LLM-as-Judge](#5-llm-as-judge)
6. [Trajectory Evaluation](#6-trajectory-evaluation)
7. [A/B Testing Agents](#7-ab-testing-agents)
8. [Tracing and Logging](#8-tracing-and-logging)
9. [Cost Tracking](#9-cost-tracking)
10. [Debugging Agent Failures](#10-debugging-agent-failures)
11. [Regression Testing](#11-regression-testing)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Why Agent Eval is Hard

### The Core Challenges

Traditional software testing relies on deterministic inputs producing deterministic outputs. Agents break every assumption that conventional testing is built on.

```
Traditional Software             Agentic Systems
+------------------+             +------------------+
| Input  -> Output |             | Input            |
| Deterministic    |             |   -> Plan        |
| Single step      |             |   -> Tool call 1 |
| Binary pass/fail |             |   -> Observe     |
|                  |             |   -> Tool call 2 |
|                  |             |   -> Re-plan     |
|                  |             |   -> Tool call 3 |
|                  |             |   -> Output      |
| Easy to test     |             | Hard to test     |
+------------------+             +------------------+
```

### Non-Determinism

The same prompt with the same model can produce different outputs across runs. This stems from:

- **Temperature sampling**: Even at temperature=0, floating-point non-determinism in GPU operations can lead to different token selections.
- **API-side batching**: Cloud providers may batch requests differently, altering computation paths.
- **Tool output variability**: External APIs, databases, and web pages change over time.
- **Context window effects**: Subtle differences in conversation history accumulate.

```python
# Demonstrating non-determinism in agent evaluation
import asyncio
from dataclasses import dataclass

@dataclass(frozen=True)
class EvalResult:
    run_id: int
    task_completed: bool
    steps_taken: int
    final_answer: str
    cost_usd: float

async def run_eval_n_times(
    agent_fn,
    task: str,
    n: int = 10,
) -> list[EvalResult]:
    """Run the same task N times to measure variance."""
    results = []
    for i in range(n):
        result = await agent_fn(task)
        results.append(EvalResult(
            run_id=i,
            task_completed=result.success,
            steps_taken=result.num_steps,
            final_answer=result.output,
            cost_usd=result.total_cost,
        ))
    return results

def compute_pass_at_k(results: list[EvalResult], k: int) -> float:
    """
    pass@k: probability that at least one of k samples succeeds.
    Unbiased estimator from the Codex paper.
    """
    n = len(results)
    c = sum(1 for r in results if r.task_completed)
    if n - c < k:
        return 1.0
    # Combinatorial estimator: 1 - C(n-c, k) / C(n, k)
    from math import comb
    return 1.0 - comb(n - c, k) / comb(n, k)
```

### Multi-Step Evaluation

A coding agent that fixes a bug might take 3 steps or 15 steps. Both could produce correct code, but they represent vastly different quality levels. Evaluating only the final output misses:

- **Efficiency**: Did the agent waste steps on dead ends?
- **Reasoning quality**: Did it identify the root cause or stumble into a fix?
- **Safety**: Did it make dangerous intermediate actions (deleting files, running unsafe commands)?
- **Cost**: A 15-step solution costs 5x more in API calls.

### Partial Success

Many agent tasks are not binary. Consider an agent asked to "refactor the authentication module":

- It might correctly extract the JWT logic but miss the session handling.
- It might refactor everything but introduce a subtle bug.
- It might produce perfect code but fail to update the tests.

Scoring partial success requires rubrics, weighted criteria, and domain expertise.

### The Evaluation Paradox

Evaluating agents often requires the same capabilities as the agent itself. If you need an LLM to judge whether an agent's code refactoring is correct, you are relying on the same class of system you are trying to evaluate. This creates a circular dependency that must be managed carefully.

---

## 2. Evaluation Dimensions

A complete agent evaluation framework measures across multiple dimensions simultaneously.

```
                    Evaluation Dimensions
    +-----------------------------------------------+
    |                                               |
    |   Task Completion    Efficiency    Safety      |
    |   +-------------+  +---------+  +---------+  |
    |   | Did it work?|  | How fast?|  | Any harm?|  |
    |   | Correct?    |  | # steps  |  | Data leak?|  |
    |   | Complete?   |  | # tokens |  | Unsafe op?|  |
    |   +-------------+  +---------+  +---------+  |
    |                                               |
    |   Cost              User Satisfaction          |
    |   +-------------+  +---------------------+   |
    |   | $/task       |  | Would user accept?  |   |
    |   | $/success    |  | Quality rating?     |   |
    |   | ROI vs human |  | Trust calibration?  |   |
    |   +-------------+  +---------------------+   |
    |                                               |
    +-----------------------------------------------+
```

### Dimension 1: Task Completion

The most fundamental question: did the agent accomplish what was asked?

```python
from enum import Enum
from dataclasses import dataclass

class CompletionLevel(Enum):
    FULL = "full"           # Task fully completed correctly
    PARTIAL = "partial"     # Some sub-goals met
    INCORRECT = "incorrect" # Produced output but wrong
    FAILED = "failed"       # Could not produce output
    REFUSED = "refused"     # Declined to attempt

@dataclass(frozen=True)
class TaskCompletionScore:
    level: CompletionLevel
    sub_goals_met: int
    sub_goals_total: int
    correctness_score: float  # 0.0 to 1.0
    explanation: str

    @property
    def completion_rate(self) -> float:
        if self.sub_goals_total == 0:
            return 0.0
        return self.sub_goals_met / self.sub_goals_total

def evaluate_task_completion(
    task_description: str,
    expected_outputs: list[str],
    actual_output: str,
    test_results: dict | None = None,
) -> TaskCompletionScore:
    """
    Multi-signal task completion evaluation.
    Combines automated checks with structured scoring.
    """
    sub_goals_met = 0
    sub_goals_total = len(expected_outputs)

    for expected in expected_outputs:
        if expected.lower() in actual_output.lower():
            sub_goals_met += 1

    # If we have test results, use them as ground truth
    correctness = 1.0
    if test_results is not None:
        passed = test_results.get("passed", 0)
        total = test_results.get("total", 1)
        correctness = passed / total if total > 0 else 0.0

    if correctness == 1.0 and sub_goals_met == sub_goals_total:
        level = CompletionLevel.FULL
    elif sub_goals_met > 0 or correctness > 0:
        level = CompletionLevel.PARTIAL
    elif actual_output.strip():
        level = CompletionLevel.INCORRECT
    else:
        level = CompletionLevel.FAILED

    return TaskCompletionScore(
        level=level,
        sub_goals_met=sub_goals_met,
        sub_goals_total=sub_goals_total,
        correctness_score=correctness,
        explanation=f"{sub_goals_met}/{sub_goals_total} sub-goals met, "
                    f"correctness={correctness:.2f}",
    )
```

### Dimension 2: Efficiency

Two correct solutions can differ dramatically in efficiency.

| Metric              | Good           | Acceptable      | Poor        |
| ------------------- | -------------- | --------------- | ----------- |
| Steps to completion | Minimum viable | 2x minimum      | 5x+ minimum |
| Token usage         | < 10K          | 10-50K          | 50K+        |
| Wall-clock time     | < 30s          | 30s-5min        | 5min+       |
| Tool calls          | Targeted       | Some redundancy | Thrashing   |
| Retries             | 0-1            | 2-3             | 4+          |

### Dimension 3: Cost

Cost evaluation must account for the full picture:

- **Direct API costs**: Input/output tokens, model choice.
- **Tool execution costs**: External API calls, compute resources.
- **Opportunity cost**: Time spent waiting for agent vs. doing it manually.
- **Error cost**: Cost of fixing agent mistakes.

### Dimension 4: Safety

Safety evaluation checks for harmful agent behaviors:

- Executing destructive commands (rm -rf, DROP TABLE).
- Leaking sensitive data in logs or outputs.
- Making unauthorized external requests.
- Exceeding resource limits (infinite loops, excessive API calls).
- Producing outputs that violate content policies.

### Dimension 5: User Satisfaction

Ultimately measured through:

- **Acceptance rate**: How often do users accept the agent's output without modification?
- **Edit distance**: How much do users change the agent's output?
- **Net Promoter Score**: Would users recommend the agent?
- **Trust calibration**: Does the agent accurately convey its confidence?

---

## 3. Benchmarks

### Overview of Major Agent Benchmarks

```
+-----------------------------------------------------------+
|                    Agent Benchmarks Landscape              |
+-----------------------------------------------------------+
|                                                           |
| Code Generation          Reasoning & QA                   |
| +--------------+        +--------------+                  |
| | HumanEval    |        | GAIA         |                  |
| | MBPP         |        | MMLU         |                  |
| | SWE-bench    |        | ARC          |                  |
| | CodeContests |        | GSM8K        |                  |
| +--------------+        +--------------+                  |
|                                                           |
| Web & Computer Use       Multi-Tool                       |
| +--------------+        +--------------+                  |
| | WebArena     |        | AgentBench   |                  |
| | VisualWebAr. |        | ToolBench    |                  |
| | OSWorld      |        | API-Bank     |                  |
| | Mind2Web     |        | Gorilla      |                  |
| +--------------+        +--------------+                  |
|                                                           |
+-----------------------------------------------------------+
```

### SWE-bench

**What it measures**: Can an agent resolve real GitHub issues from popular Python repositories?

- **Dataset**: 2,294 task instances from 12 popular Python repos (Django, Flask, scikit-learn, etc.)
- **Task**: Given an issue description and the full repo, produce a patch that resolves the issue.
- **Evaluation**: The patch must pass the repository's test suite, including newly added tests for the issue.
- **Variants**: SWE-bench Lite (300 instances, more curated), SWE-bench Verified (human-verified subset).

**Why it matters for interviews**: SWE-bench is the gold standard for evaluating coding agents. It tests real-world software engineering, not toy problems. Top systems (as of early 2026) resolve 40-60% of SWE-bench Verified issues.

**Key insight**: Success on SWE-bench requires the agent to navigate large codebases, understand existing patterns, write patches, and reason about test expectations, which mirrors actual engineering work.

### GAIA

**What it measures**: General AI Assistant capabilities requiring multi-step reasoning with tools.

- **Levels**: Three difficulty levels (1-3), from simple factual lookups to complex multi-step reasoning.
- **Tools needed**: Web search, calculator, file reading, code execution.
- **Evaluation**: Exact match on the final answer (short factual answers).

**Key insight**: GAIA specifically tests whether agents can decompose complex questions and use tools effectively, not just answer from parametric knowledge.

### AgentBench

**What it measures**: Agent capabilities across 8 diverse environments:

1. Operating system interaction (bash)
2. Database operations (SQL)
3. Knowledge graph reasoning
4. Digital card games
5. Lateral thinking puzzles
6. Household tasks (ALFWorld)
7. Web shopping (WebShop)
8. Web browsing

**Key insight**: Tests generalization across very different domains and tool interfaces.

### WebArena

**What it measures**: Autonomous web navigation and task completion.

- **Environment**: Realistic self-hosted websites (GitLab, Reddit clone, e-commerce, CMS, maps).
- **Tasks**: 812 tasks like "Find the cheapest one-way flight from NYC to London" or "Create a new repository with specific settings."
- **Evaluation**: Functional correctness (did the desired state change happen?), not just final page state.

**Key insight**: Tests the agent's ability to interact with complex, stateful web interfaces over multiple steps, including handling authentication, navigation, and form filling.

### HumanEval and MBPP

**What they measure**: Code generation from docstrings/descriptions.

- **HumanEval**: 164 hand-written Python programming problems with unit tests.
- **MBPP**: 974 crowd-sourced Python programming problems.
- **Metric**: pass@k (probability of at least one correct solution in k samples).

**Key insight**: These are function-level code generation benchmarks. They test coding ability but not agentic capabilities like planning, tool use, or multi-file reasoning. Useful as a baseline for the LLM backbone's coding ability.

### Tool-Use Benchmarks

| Benchmark | Focus                           | Size                   | Key Metric                 |
| --------- | ------------------------------- | ---------------------- | -------------------------- |
| ToolBench | API tool selection and usage    | 16K+ APIs              | Pass rate                  |
| API-Bank  | API call planning and execution | 73 APIs, 314 dialogues | API call accuracy          |
| Gorilla   | API call generation accuracy    | 1,645 API calls        | AST accuracy               |
| BFCL      | Function calling correctness    | 2,000 test cases       | Accuracy across categories |
| TaskBench | Task decomposition and tool use | 28K tasks              | Graph similarity           |

---

## 4. Offline Evaluation

Offline evaluation runs against pre-collected datasets without live user interaction. It is the foundation of agent quality assurance.

### Building a Golden Dataset

```python
from dataclasses import dataclass, field
import json
from pathlib import Path

@dataclass(frozen=True)
class EvalCase:
    """A single evaluation case in a golden dataset."""
    id: str
    category: str
    input_prompt: str
    expected_output: str
    acceptable_variations: tuple[str, ...] = ()
    required_tool_calls: tuple[str, ...] = ()
    max_steps: int = 20
    difficulty: str = "medium"  # easy, medium, hard
    tags: tuple[str, ...] = ()

@dataclass(frozen=True)
class GoldenDataset:
    """Collection of evaluation cases with metadata."""
    name: str
    version: str
    cases: tuple[EvalCase, ...]
    description: str = ""

    def filter_by_category(self, category: str) -> "GoldenDataset":
        filtered = tuple(c for c in self.cases if c.category == category)
        return GoldenDataset(
            name=self.name,
            version=self.version,
            cases=filtered,
            description=self.description,
        )

    def filter_by_difficulty(self, difficulty: str) -> "GoldenDataset":
        filtered = tuple(c for c in self.cases if c.difficulty == difficulty)
        return GoldenDataset(
            name=self.name,
            version=self.version,
            cases=filtered,
            description=self.description,
        )

    @staticmethod
    def load_from_file(path: str) -> "GoldenDataset":
        data = json.loads(Path(path).read_text())
        cases = tuple(
            EvalCase(
                id=c["id"],
                category=c["category"],
                input_prompt=c["input_prompt"],
                expected_output=c["expected_output"],
                acceptable_variations=tuple(c.get("acceptable_variations", [])),
                required_tool_calls=tuple(c.get("required_tool_calls", [])),
                max_steps=c.get("max_steps", 20),
                difficulty=c.get("difficulty", "medium"),
                tags=tuple(c.get("tags", [])),
            )
            for c in data["cases"]
        )
        return GoldenDataset(
            name=data["name"],
            version=data["version"],
            cases=cases,
            description=data.get("description", ""),
        )
```

### Automated Scoring Functions

```python
from dataclasses import dataclass
import re
from difflib import SequenceMatcher

@dataclass(frozen=True)
class ScoringResult:
    score: float          # 0.0 to 1.0
    passed: bool          # Above threshold
    details: dict         # Breakdown of scoring
    scorer_name: str      # Which scorer produced this

def exact_match_scorer(expected: str, actual: str) -> ScoringResult:
    """Strict exact match after normalization."""
    norm_expected = expected.strip().lower()
    norm_actual = actual.strip().lower()
    match = norm_expected == norm_actual
    return ScoringResult(
        score=1.0 if match else 0.0,
        passed=match,
        details={"expected": norm_expected, "actual": norm_actual},
        scorer_name="exact_match",
    )

def fuzzy_match_scorer(
    expected: str,
    actual: str,
    threshold: float = 0.85,
) -> ScoringResult:
    """Fuzzy string matching using SequenceMatcher."""
    ratio = SequenceMatcher(None, expected.lower(), actual.lower()).ratio()
    return ScoringResult(
        score=ratio,
        passed=ratio >= threshold,
        details={"similarity_ratio": ratio, "threshold": threshold},
        scorer_name="fuzzy_match",
    )

def contains_all_scorer(
    actual: str,
    required_substrings: list[str],
) -> ScoringResult:
    """Check if output contains all required substrings."""
    found = {s: s.lower() in actual.lower() for s in required_substrings}
    score = sum(found.values()) / len(found) if found else 0.0
    return ScoringResult(
        score=score,
        passed=all(found.values()),
        details={"substring_results": found},
        scorer_name="contains_all",
    )

def code_execution_scorer(
    code: str,
    test_cases: list[dict],
) -> ScoringResult:
    """Execute generated code against test cases in a sandbox."""
    passed_count = 0
    results = {}

    for i, test in enumerate(test_cases):
        try:
            # WARNING: In production, use a proper sandbox
            # (Docker, gVisor, or Pyodide)
            namespace: dict = {}
            exec(code, namespace)  # noqa: S102
            func = namespace[test["function_name"]]
            result = func(*test["inputs"])
            test_passed = result == test["expected_output"]
            passed_count += 1 if test_passed else 0
            results[f"test_{i}"] = {
                "passed": test_passed,
                "expected": test["expected_output"],
                "actual": result,
            }
        except Exception as e:
            results[f"test_{i}"] = {
                "passed": False,
                "error": str(e),
            }

    score = passed_count / len(test_cases) if test_cases else 0.0
    return ScoringResult(
        score=score,
        passed=score == 1.0,
        details={"test_results": results, "passed": passed_count, "total": len(test_cases)},
        scorer_name="code_execution",
    )
```

### The Eval Harness

```python
import asyncio
import time
from dataclasses import dataclass

@dataclass(frozen=True)
class EvalRunResult:
    case_id: str
    scores: tuple  # tuple of ScoringResult
    agent_output: str
    steps_taken: int
    latency_seconds: float
    tokens_used: int
    cost_usd: float
    error: str | None = None

@dataclass(frozen=True)
class EvalSummary:
    total_cases: int
    passed_cases: int
    failed_cases: int
    error_cases: int
    avg_score: float
    avg_latency: float
    avg_steps: float
    total_cost: float
    results: tuple  # tuple of EvalRunResult

    @property
    def pass_rate(self) -> float:
        return self.passed_cases / self.total_cases if self.total_cases > 0 else 0.0

async def run_eval_harness(
    agent_fn,
    dataset: GoldenDataset,
    scorers: list,
    concurrency: int = 5,
) -> EvalSummary:
    """
    Run a full evaluation harness over a golden dataset.

    Args:
        agent_fn: Async callable that takes a prompt and returns agent output.
        dataset: The golden dataset to evaluate against.
        scorers: List of scoring functions to apply.
        concurrency: Max concurrent evaluations.
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: list[EvalRunResult] = []

    async def eval_single(case: EvalCase) -> EvalRunResult:
        async with semaphore:
            start = time.monotonic()
            try:
                agent_result = await agent_fn(case.input_prompt)
                elapsed = time.monotonic() - start

                scores = tuple(
                    scorer(case.expected_output, agent_result.output)
                    for scorer in scorers
                )

                return EvalRunResult(
                    case_id=case.id,
                    scores=scores,
                    agent_output=agent_result.output,
                    steps_taken=agent_result.num_steps,
                    latency_seconds=elapsed,
                    tokens_used=agent_result.total_tokens,
                    cost_usd=agent_result.total_cost,
                )
            except Exception as e:
                elapsed = time.monotonic() - start
                return EvalRunResult(
                    case_id=case.id,
                    scores=(),
                    agent_output="",
                    steps_taken=0,
                    latency_seconds=elapsed,
                    tokens_used=0,
                    cost_usd=0.0,
                    error=str(e),
                )

    tasks = [eval_single(case) for case in dataset.cases]
    results = list(await asyncio.gather(*tasks))

    passed = sum(
        1 for r in results
        if r.error is None and all(s.passed for s in r.scores)
    )
    errors = sum(1 for r in results if r.error is not None)
    non_error = [r for r in results if r.error is None]

    avg_score = (
        sum(
            sum(s.score for s in r.scores) / len(r.scores)
            for r in non_error
            if r.scores
        ) / len(non_error)
        if non_error else 0.0
    )

    return EvalSummary(
        total_cases=len(results),
        passed_cases=passed,
        failed_cases=len(results) - passed - errors,
        error_cases=errors,
        avg_score=avg_score,
        avg_latency=sum(r.latency_seconds for r in results) / len(results),
        avg_steps=sum(r.steps_taken for r in results) / len(results) if results else 0,
        total_cost=sum(r.cost_usd for r in results),
        results=tuple(results),
    )
```

---

## 5. LLM-as-Judge

When automated scoring cannot capture semantic correctness, use a stronger LLM (or the same LLM with a careful rubric) to evaluate outputs.

### Why LLM-as-Judge?

```
Problem: "Summarize the key findings of this research paper."

Agent Output A: "The paper finds that transformer models scale
                 predictably with compute."

Agent Output B: "This research demonstrates scaling laws for
                 neural language models."

Both are correct. Exact match fails. Fuzzy match gives low scores.
Only semantic evaluation captures that both answers are valid.
```

### Rubric Design

A well-designed rubric is the most critical component of LLM-as-Judge evaluation.

```python
RUBRIC_TEMPLATE = """
You are evaluating an AI agent's response to a task.

## Task Description
{task_description}

## Agent's Output
{agent_output}

## Reference Answer (if available)
{reference_answer}

## Evaluation Rubric

Score each dimension from 1-5:

### Correctness (weight: 0.4)
1 - Completely wrong or fabricated
2 - Major errors that invalidate the response
3 - Partially correct with significant gaps
4 - Mostly correct with minor issues
5 - Fully correct and accurate

### Completeness (weight: 0.3)
1 - Missing most required elements
2 - Addresses less than half the requirements
3 - Addresses most requirements with some gaps
4 - Covers all major requirements
5 - Comprehensive coverage including edge cases

### Clarity (weight: 0.2)
1 - Incoherent or incomprehensible
2 - Poorly organized, hard to follow
3 - Understandable but could be clearer
4 - Well-organized and clear
5 - Exceptionally clear and well-structured

### Safety (weight: 0.1)
1 - Contains harmful or dangerous content
2 - Includes risky suggestions without warnings
3 - Neutral, no safety concerns
4 - Appropriately cautious
5 - Proactively identifies risks and mitigations

## Output Format
Respond with JSON only:
{{
    "correctness": <1-5>,
    "completeness": <1-5>,
    "clarity": <1-5>,
    "safety": <1-5>,
    "explanation": "<brief justification>",
    "weighted_score": <computed weighted average>
}}
"""
```

### Implementation

````python
import json
from dataclasses import dataclass

@dataclass(frozen=True)
class JudgeResult:
    correctness: int
    completeness: int
    clarity: int
    safety: int
    explanation: str
    weighted_score: float
    raw_response: str

async def llm_as_judge(
    client,
    task_description: str,
    agent_output: str,
    reference_answer: str = "N/A",
    model: str = "claude-sonnet-4-20250514",
    temperature: float = 0.0,
) -> JudgeResult:
    """
    Use an LLM to evaluate agent output against a rubric.
    """
    prompt = RUBRIC_TEMPLATE.format(
        task_description=task_description,
        agent_output=agent_output,
        reference_answer=reference_answer,
    )

    response = await client.messages.create(
        model=model,
        max_tokens=1024,
        temperature=temperature,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Attempt to extract JSON from markdown code block
        import re
        match = re.search(r'```json?\s*(.*?)\s*```', raw, re.DOTALL)
        if match:
            parsed = json.loads(match.group(1))
        else:
            raise ValueError(f"Could not parse judge response: {raw}")

    weights = {"correctness": 0.4, "completeness": 0.3, "clarity": 0.2, "safety": 0.1}
    weighted = sum(
        parsed[dim] * weight
        for dim, weight in weights.items()
    )

    return JudgeResult(
        correctness=parsed["correctness"],
        completeness=parsed["completeness"],
        clarity=parsed["clarity"],
        safety=parsed["safety"],
        explanation=parsed["explanation"],
        weighted_score=weighted,
        raw_response=raw,
    )
````

### Calibration Techniques

LLM judges can be biased. Common issues and mitigations:

| Bias             | Description                                 | Mitigation                                            |
| ---------------- | ------------------------------------------- | ----------------------------------------------------- |
| Position bias    | Prefers first or last option in comparisons | Randomize order, average across orderings             |
| Verbosity bias   | Rates longer responses higher               | Include "conciseness" in rubric, normalize by length  |
| Self-enhancement | Rates own outputs higher                    | Use a different model family as judge                 |
| Anchoring        | Over-influenced by reference answer         | Evaluate without reference first, then with           |
| Leniency         | Tends to give high scores                   | Calibrate with known-bad examples, force distribution |

```python
async def calibrated_judge(
    client,
    task: str,
    output: str,
    reference: str,
    n_runs: int = 3,
) -> JudgeResult:
    """
    Run LLM-as-Judge multiple times and aggregate for calibration.
    Reduces variance from single-run evaluation.
    """
    results = []
    for _ in range(n_runs):
        result = await llm_as_judge(
            client, task, output, reference,
            temperature=0.3,  # slight temperature for diversity
        )
        results.append(result)

    # Aggregate scores (median is more robust than mean)
    def median(values):
        s = sorted(values)
        n = len(s)
        if n % 2 == 0:
            return (s[n // 2 - 1] + s[n // 2]) / 2
        return s[n // 2]

    return JudgeResult(
        correctness=int(median([r.correctness for r in results])),
        completeness=int(median([r.completeness for r in results])),
        clarity=int(median([r.clarity for r in results])),
        safety=int(median([r.safety for r in results])),
        explanation=" | ".join(r.explanation for r in results),
        weighted_score=median([r.weighted_score for r in results]),
        raw_response=results[0].raw_response,
    )
```

### Pairwise Comparison

Instead of absolute scoring, compare two outputs head-to-head:

```python
PAIRWISE_PROMPT = """
You are comparing two AI agent outputs for the same task.

## Task
{task}

## Output A
{output_a}

## Output B
{output_b}

Which output is better? Consider correctness, completeness,
clarity, and safety.

Respond with JSON:
{{
    "winner": "A" or "B" or "tie",
    "confidence": <0.0-1.0>,
    "reasoning": "<explanation>"
}}
"""
```

Pairwise comparison is more reliable than absolute scoring because humans (and LLMs) are better at relative judgments than absolute ones. Use it for A/B comparisons between agent versions.

---

## 6. Trajectory Evaluation

Evaluating only the final output misses critical information about how the agent arrived at its answer.

### Why Trajectory Matters

```
Task: "Find and fix the bug in auth.py"

Trajectory A (Good):                Trajectory B (Bad):
+---------------------------+      +---------------------------+
| 1. Read error logs        |      | 1. Read README            |
| 2. Search auth.py for     |      | 2. Read package.json      |
|    relevant function      |      | 3. List all files         |
| 3. Identify off-by-one    |      | 4. Read auth.py           |
|    in token expiry check  |      | 5. Read config.py         |
| 4. Apply fix              |      | 6. Read requirements.txt  |
| 5. Run tests - pass       |      | 7. Read auth.py again     |
+---------------------------+      | 8. Try random fix         |
                                   | 9. Run tests - fail       |
5 steps, focused, efficient        | 10. Try another fix       |
                                   | 11. Run tests - fail      |
                                   | 12. Revert                |
                                   | 13. Read stack trace      |
                                   | 14. Apply correct fix     |
                                   | 15. Run tests - pass      |
                                   +---------------------------+
                                   15 steps, unfocused, costly
```

Both produce the same final result, but Trajectory A demonstrates better reasoning.

### Step-Level Scoring

```python
from dataclasses import dataclass
from enum import Enum

class StepQuality(Enum):
    EXCELLENT = 4    # Optimal action given context
    GOOD = 3         # Reasonable action, minor inefficiency
    NEUTRAL = 2      # Unnecessary but not harmful
    WASTEFUL = 1     # Wasted resources without progress
    HARMFUL = 0      # Made things worse or created risk

@dataclass(frozen=True)
class StepEvaluation:
    step_index: int
    action_type: str       # e.g., "tool_call", "reasoning", "output"
    action_summary: str
    quality: StepQuality
    reasoning: str
    advanced_toward_goal: bool
    was_necessary: bool

@dataclass(frozen=True)
class TrajectoryEvaluation:
    steps: tuple           # tuple of StepEvaluation
    overall_score: float
    efficiency_score: float
    reasoning_score: float
    recovery_score: float  # How well did it recover from errors?
    summary: str

def evaluate_trajectory(
    steps: list[dict],
    task_description: str,
    successful: bool,
) -> TrajectoryEvaluation:
    """
    Evaluate the quality of an agent's trajectory.
    """
    evaluations = []
    necessary_steps = 0
    advancing_steps = 0

    for i, step in enumerate(steps):
        # Heuristic step evaluation
        action = step.get("action", "")
        observation = step.get("observation", "")

        # Detect common wasteful patterns
        is_repeated = any(
            prev.get("action") == action
            for prev in steps[:i]
        )

        is_exploration = action.startswith("list") or action.startswith("read")
        made_progress = step.get("made_progress", False)

        if is_repeated and not made_progress:
            quality = StepQuality.WASTEFUL
            was_necessary = False
        elif made_progress:
            quality = StepQuality.GOOD
            was_necessary = True
            advancing_steps += 1
        elif is_exploration and i < 3:
            quality = StepQuality.NEUTRAL  # Early exploration is OK
            was_necessary = False
        else:
            quality = StepQuality.NEUTRAL
            was_necessary = False

        if was_necessary:
            necessary_steps += 1

        evaluations.append(StepEvaluation(
            step_index=i,
            action_type=step.get("type", "unknown"),
            action_summary=action[:100],
            quality=quality,
            reasoning=f"Step {'advanced' if made_progress else 'did not advance'} goal",
            advanced_toward_goal=made_progress,
            was_necessary=was_necessary,
        ))

    total_steps = len(steps)
    efficiency = necessary_steps / total_steps if total_steps > 0 else 0.0
    avg_quality = (
        sum(e.quality.value for e in evaluations) / len(evaluations)
        if evaluations else 0.0
    )

    # Detect error recovery (went from failing to succeeding)
    recovery_score = 1.0 if successful and any(
        not e.advanced_toward_goal for e in evaluations
    ) else (1.0 if successful else 0.0)

    return TrajectoryEvaluation(
        steps=tuple(evaluations),
        overall_score=avg_quality / 4.0,  # Normalize to 0-1
        efficiency_score=efficiency,
        reasoning_score=advancing_steps / total_steps if total_steps > 0 else 0.0,
        recovery_score=recovery_score,
        summary=f"{total_steps} steps, {necessary_steps} necessary, "
                f"efficiency={efficiency:.2%}",
    )
```

### Ideal Trajectory Comparison

For high-stakes evaluations, define the ideal trajectory and compare:

```python
@dataclass(frozen=True)
class IdealTrajectory:
    steps: tuple[str, ...]      # Ordered list of ideal actions
    max_acceptable_steps: int
    required_checkpoints: tuple[str, ...]  # Actions that must appear

def compare_to_ideal(
    actual_steps: list[str],
    ideal: IdealTrajectory,
) -> dict:
    """Compare actual trajectory to an ideal reference."""
    # Check required checkpoints
    checkpoints_hit = {
        cp: any(cp.lower() in step.lower() for step in actual_steps)
        for cp in ideal.required_checkpoints
    }

    # Compute step overhead
    overhead = len(actual_steps) / len(ideal.steps) if ideal.steps else float('inf')

    # Check ordering of checkpoints
    checkpoint_indices = []
    for cp in ideal.required_checkpoints:
        for i, step in enumerate(actual_steps):
            if cp.lower() in step.lower():
                checkpoint_indices.append(i)
                break

    ordering_correct = checkpoint_indices == sorted(checkpoint_indices)

    return {
        "checkpoints_hit": checkpoints_hit,
        "all_checkpoints_met": all(checkpoints_hit.values()),
        "step_overhead": overhead,
        "within_step_limit": len(actual_steps) <= ideal.max_acceptable_steps,
        "checkpoint_ordering_correct": ordering_correct,
        "actual_steps": len(actual_steps),
        "ideal_steps": len(ideal.steps),
    }
```

---

## 7. A/B Testing Agents

### Online Evaluation Design

```
                    A/B Test Architecture
+--------------------------------------------------+
|                  Traffic Router                    |
|  +----------------------------------------------+|
|  |  User Request                                 ||
|  |       |                                       ||
|  |       v                                       ||
|  |  +----------+                                 ||
|  |  | Splitter | ---> hash(user_id) % 100        ||
|  |  +----------+                                 ||
|  |    /      \                                   ||
|  |   v        v                                  ||
|  | Group A   Group B                             ||
|  | (50%)     (50%)                               ||
|  |   |         |                                 ||
|  |   v         v                                 ||
|  | Agent v1  Agent v2                            ||
|  |   |         |                                 ||
|  |   v         v                                 ||
|  | Log metrics + outcomes                        ||
|  |       |                                       ||
|  |       v                                       ||
|  | Statistical Analysis                          ||
|  +----------------------------------------------+|
+--------------------------------------------------+
```

### Implementation

```python
import hashlib
from dataclasses import dataclass

@dataclass(frozen=True)
class ExperimentConfig:
    experiment_id: str
    control_name: str          # e.g., "agent_v1"
    treatment_name: str        # e.g., "agent_v2"
    traffic_split: float       # 0.0-1.0, fraction going to treatment
    min_sample_size: int       # Minimum observations per group
    primary_metric: str        # e.g., "task_completion_rate"
    guardrail_metrics: tuple[str, ...]  # Metrics that must not degrade

def assign_variant(
    config: ExperimentConfig,
    user_id: str,
) -> str:
    """
    Deterministic user assignment using consistent hashing.
    Same user always gets same variant.
    """
    hash_input = f"{config.experiment_id}:{user_id}"
    hash_value = int(hashlib.sha256(hash_input.encode()).hexdigest(), 16)
    bucket = (hash_value % 10000) / 10000.0

    if bucket < config.traffic_split:
        return config.treatment_name
    return config.control_name

def compute_significance(
    control_successes: int,
    control_total: int,
    treatment_successes: int,
    treatment_total: int,
    alpha: float = 0.05,
) -> dict:
    """
    Two-proportion z-test for A/B test significance.
    """
    import math

    p1 = control_successes / control_total if control_total > 0 else 0
    p2 = treatment_successes / treatment_total if treatment_total > 0 else 0

    # Pooled proportion
    p_pool = (
        (control_successes + treatment_successes)
        / (control_total + treatment_total)
    )

    # Standard error
    se = math.sqrt(
        p_pool * (1 - p_pool) * (1 / control_total + 1 / treatment_total)
    ) if p_pool > 0 and p_pool < 1 else float('inf')

    # Z-statistic
    z = (p2 - p1) / se if se > 0 and se != float('inf') else 0

    # Two-tailed p-value (approximation)
    # For production, use scipy.stats.norm.sf
    p_value = 2 * (1 - _normal_cdf(abs(z)))

    return {
        "control_rate": p1,
        "treatment_rate": p2,
        "absolute_difference": p2 - p1,
        "relative_improvement": (p2 - p1) / p1 if p1 > 0 else float('inf'),
        "z_statistic": z,
        "p_value": p_value,
        "is_significant": p_value < alpha,
        "alpha": alpha,
    }

def _normal_cdf(x: float) -> float:
    """Approximation of the standard normal CDF."""
    import math
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))
```

### Metric Selection for Agent A/B Tests

Choose metrics carefully. Agent A/B tests are harder than traditional A/B tests because:

**Primary Metrics** (pick one):

- Task completion rate
- User acceptance rate
- End-to-end success rate

**Secondary Metrics** (track all):

- Average steps to completion
- Average cost per task
- Average latency
- User edit distance (how much they changed the output)

**Guardrail Metrics** (must not degrade):

- Error rate
- Safety violation rate
- P99 latency
- Cost per task ceiling

### Sample Size Considerations

Agent tasks are expensive. Each sample costs real money (API calls, tool executions). Plan accordingly:

```python
import math

def required_sample_size(
    baseline_rate: float,
    minimum_detectable_effect: float,
    alpha: float = 0.05,
    power: float = 0.80,
) -> int:
    """
    Calculate required sample size per group for a two-proportion test.
    """
    p1 = baseline_rate
    p2 = baseline_rate + minimum_detectable_effect

    # Z-scores for alpha and power
    z_alpha = 1.96   # for alpha=0.05, two-tailed
    z_beta = 0.84    # for power=0.80

    numerator = (z_alpha * math.sqrt(2 * p1 * (1 - p1))
                 + z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    denominator = (p2 - p1) ** 2

    return math.ceil(numerator / denominator)

# Example: Detecting a 5% improvement from 70% baseline
n = required_sample_size(0.70, 0.05)
# n ~ 1,200 per group -> 2,400 total agent runs
# At $0.10/run, that's $240 just for the experiment
```

---

## 8. Tracing and Logging

### The Observability Stack for Agents

```
+----------------------------------------------------------+
|                Agent Observability Stack                   |
+----------------------------------------------------------+
|                                                          |
|  Application Layer                                       |
|  +----------------------------------------------------+ |
|  |  Agent Code                                        | |
|  |  +----------+  +----------+  +----------+         | |
|  |  | LLM Call |  | Tool Use |  | Planning |         | |
|  |  +----+-----+  +----+-----+  +----+-----+         | |
|  |       |              |              |               | |
|  +-------|--------------|--------------|---------------+ |
|          v              v              v                 |
|  Instrumentation Layer                                   |
|  +----------------------------------------------------+ |
|  | OpenTelemetry SDK                                  | |
|  | +--------+ +--------+ +--------+ +--------+       | |
|  | | Traces | | Spans  | | Metrics| | Logs   |       | |
|  | +--------+ +--------+ +--------+ +--------+       | |
|  +----------------------------------------------------+ |
|          |              |              |                 |
|          v              v              v                 |
|  Collection Layer                                        |
|  +----------------------------------------------------+ |
|  | OTLP Exporter -> Collector                         | |
|  +----------------------------------------------------+ |
|          |              |              |                 |
|          v              v              v                 |
|  Backend Layer                                           |
|  +------------+ +-------------+ +--------------+        |
|  | LangSmith  | | Arize       | | Braintrust   |        |
|  |            | | Phoenix     | |              |        |
|  +------------+ +-------------+ +--------------+        |
|                                                          |
+----------------------------------------------------------+
```

### OpenTelemetry for Agents

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from functools import wraps
from dataclasses import dataclass

# Initialize tracing
provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("agent-service")

def trace_llm_call(model: str):
    """Decorator to trace LLM calls with token and cost attributes."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(
                "llm_call",
                attributes={
                    "llm.model": model,
                    "llm.provider": "anthropic",
                    "agent.step_type": "llm_call",
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_attribute("llm.input_tokens", result.usage.input_tokens)
                    span.set_attribute("llm.output_tokens", result.usage.output_tokens)
                    span.set_attribute("llm.total_tokens",
                        result.usage.input_tokens + result.usage.output_tokens)
                    span.set_attribute("llm.stop_reason", result.stop_reason)
                    return result
                except Exception as e:
                    span.set_status(trace.StatusCode.ERROR, str(e))
                    span.record_exception(e)
                    raise
        return wrapper
    return decorator

def trace_tool_call(tool_name: str):
    """Decorator to trace tool/function calls."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(
                f"tool_call.{tool_name}",
                attributes={
                    "tool.name": tool_name,
                    "agent.step_type": "tool_call",
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_attribute("tool.success", True)
                    span.set_attribute("tool.output_length", len(str(result)))
                    return result
                except Exception as e:
                    span.set_attribute("tool.success", False)
                    span.set_status(trace.StatusCode.ERROR, str(e))
                    span.record_exception(e)
                    raise
        return wrapper
    return decorator

def trace_agent_run(agent_name: str):
    """Decorator to trace an entire agent run as a parent span."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(
                f"agent_run.{agent_name}",
                attributes={
                    "agent.name": agent_name,
                    "agent.step_type": "agent_run",
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_attribute("agent.success", True)
                    span.set_attribute("agent.total_steps", result.num_steps)
                    return result
                except Exception as e:
                    span.set_attribute("agent.success", False)
                    span.set_status(trace.StatusCode.ERROR, str(e))
                    span.record_exception(e)
                    raise
        return wrapper
    return decorator
```

### Trace Structure for Multi-Agent Systems

```
Agent Run (root span)
|
+-- LLM Call: Planning (span)
|   |-- model: claude-sonnet-4
|   |-- input_tokens: 1,250
|   |-- output_tokens: 340
|   +-- duration: 2.3s
|
+-- Tool Call: search_codebase (span)
|   |-- tool: grep
|   |-- query: "authentication"
|   |-- results_count: 12
|   +-- duration: 0.1s
|
+-- LLM Call: Analysis (span)
|   |-- model: claude-sonnet-4
|   |-- input_tokens: 3,400
|   |-- output_tokens: 890
|   +-- duration: 4.1s
|
+-- Sub-Agent: code_reviewer (span)
|   |
|   +-- LLM Call: Review (span)
|   |   |-- model: claude-haiku-4
|   |   |-- input_tokens: 2,100
|   |   +-- output_tokens: 450
|   |
|   +-- Tool Call: run_tests (span)
|       |-- tests_passed: 14
|       +-- tests_failed: 0
|
+-- LLM Call: Final Response (span)
    |-- model: claude-sonnet-4
    |-- input_tokens: 5,200
    +-- output_tokens: 1,100
```

### Platform Comparison

| Feature           | LangSmith                  | Arize Phoenix             | Braintrust          |
| ----------------- | -------------------------- | ------------------------- | ------------------- |
| **Focus**         | LangChain ecosystem        | Open-source observability | Eval-first platform |
| **Tracing**       | Deep LangChain integration | OpenTelemetry native      | Custom SDK          |
| **Eval**          | Built-in eval framework    | Evals with Phoenix        | Core strength       |
| **LLM-as-Judge**  | Supported                  | Supported                 | First-class support |
| **Cost tracking** | Token-level                | Token-level               | Token + custom      |
| **Self-hosted**   | No (SaaS)                  | Yes (open source)         | No (SaaS)           |
| **Datasets**      | Built-in management        | Via integration           | Built-in versioned  |
| **Playground**    | Prompt playground          | Notebook integration      | Prompt playground   |
| **Pricing**       | Free tier + paid           | Free (open source)        | Free tier + paid    |

### Structured Logging for Agents

```python
import json
import logging
import time
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class AgentLogEntry:
    timestamp: float
    trace_id: str
    span_id: str
    agent_name: str
    step_number: int
    step_type: str        # "llm_call", "tool_call", "planning", "error"
    action: str
    input_summary: str
    output_summary: str
    tokens_used: int
    cost_usd: float
    duration_ms: float
    success: bool
    error_message: str | None = None
    metadata: dict | None = None

class AgentLogger:
    """Structured logger for agent execution traces."""

    def __init__(self, agent_name: str, trace_id: str):
        self._agent_name = agent_name
        self._trace_id = trace_id
        self._step_count = 0
        self._logger = logging.getLogger(f"agent.{agent_name}")
        self._entries: list[AgentLogEntry] = []

    def log_step(
        self,
        step_type: str,
        action: str,
        input_summary: str,
        output_summary: str,
        tokens_used: int = 0,
        cost_usd: float = 0.0,
        duration_ms: float = 0.0,
        success: bool = True,
        error_message: str | None = None,
        metadata: dict | None = None,
    ) -> AgentLogEntry:
        self._step_count += 1
        entry = AgentLogEntry(
            timestamp=time.time(),
            trace_id=self._trace_id,
            span_id=f"{self._trace_id}-{self._step_count}",
            agent_name=self._agent_name,
            step_number=self._step_count,
            step_type=step_type,
            action=action,
            input_summary=input_summary[:500],
            output_summary=output_summary[:500],
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            duration_ms=duration_ms,
            success=success,
            error_message=error_message,
            metadata=metadata,
        )
        self._entries.append(entry)
        self._logger.info(json.dumps(asdict(entry)))
        return entry

    def get_summary(self) -> dict:
        return {
            "trace_id": self._trace_id,
            "agent_name": self._agent_name,
            "total_steps": self._step_count,
            "total_tokens": sum(e.tokens_used for e in self._entries),
            "total_cost": sum(e.cost_usd for e in self._entries),
            "total_duration_ms": sum(e.duration_ms for e in self._entries),
            "success_rate": (
                sum(1 for e in self._entries if e.success) / len(self._entries)
                if self._entries else 0.0
            ),
            "error_count": sum(1 for e in self._entries if not e.success),
        }
```

---

## 9. Cost Tracking

### Token-Level Cost Model

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class ModelPricing:
    """Pricing per million tokens (as of early 2026, approximate)."""
    model_id: str
    input_cost_per_mtok: float
    output_cost_per_mtok: float
    cached_input_cost_per_mtok: float = 0.0

# Common model pricing
PRICING_TABLE: dict[str, ModelPricing] = {
    "claude-opus-4": ModelPricing(
        model_id="claude-opus-4",
        input_cost_per_mtok=15.0,
        output_cost_per_mtok=75.0,
        cached_input_cost_per_mtok=1.875,
    ),
    "claude-sonnet-4": ModelPricing(
        model_id="claude-sonnet-4",
        input_cost_per_mtok=3.0,
        output_cost_per_mtok=15.0,
        cached_input_cost_per_mtok=0.30,
    ),
    "claude-haiku-4": ModelPricing(
        model_id="claude-haiku-4",
        input_cost_per_mtok=0.80,
        output_cost_per_mtok=4.0,
        cached_input_cost_per_mtok=0.08,
    ),
    "gpt-4o": ModelPricing(
        model_id="gpt-4o",
        input_cost_per_mtok=2.50,
        output_cost_per_mtok=10.0,
    ),
    "gpt-4o-mini": ModelPricing(
        model_id="gpt-4o-mini",
        input_cost_per_mtok=0.15,
        output_cost_per_mtok=0.60,
    ),
}

def calculate_cost(
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> float:
    """Calculate the cost of a single LLM call."""
    pricing = PRICING_TABLE.get(model_id)
    if pricing is None:
        raise ValueError(f"Unknown model: {model_id}")

    non_cached_input = input_tokens - cached_input_tokens
    cost = (
        (non_cached_input / 1_000_000) * pricing.input_cost_per_mtok
        + (cached_input_tokens / 1_000_000) * pricing.cached_input_cost_per_mtok
        + (output_tokens / 1_000_000) * pricing.output_cost_per_mtok
    )
    return cost
```

### Per-Task Cost Attribution

```python
from dataclasses import dataclass, field
import time

@dataclass(frozen=True)
class CostEntry:
    timestamp: float
    model_id: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    cost_usd: float
    category: str         # "planning", "execution", "evaluation", "retry"
    agent_name: str
    task_id: str

@dataclass
class CostTracker:
    """Track and attribute costs across agents and tasks."""

    def __init__(self):
        self._entries: list[CostEntry] = []

    def record(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        category: str,
        agent_name: str,
        task_id: str,
        cached_tokens: int = 0,
    ) -> CostEntry:
        cost = calculate_cost(model_id, input_tokens, output_tokens, cached_tokens)
        entry = CostEntry(
            timestamp=time.time(),
            model_id=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            cost_usd=cost,
            category=category,
            agent_name=agent_name,
            task_id=task_id,
        )
        self._entries = [*self._entries, entry]  # Immutable append
        return entry

    def total_cost(self) -> float:
        return sum(e.cost_usd for e in self._entries)

    def cost_by_agent(self) -> dict[str, float]:
        result: dict[str, float] = {}
        for entry in self._entries:
            result[entry.agent_name] = result.get(entry.agent_name, 0) + entry.cost_usd
        return result

    def cost_by_category(self) -> dict[str, float]:
        result: dict[str, float] = {}
        for entry in self._entries:
            result[entry.category] = result.get(entry.category, 0) + entry.cost_usd
        return result

    def cost_by_task(self) -> dict[str, float]:
        result: dict[str, float] = {}
        for entry in self._entries:
            result[entry.task_id] = result.get(entry.task_id, 0) + entry.cost_usd
        return result

    def cost_per_success(self, successful_tasks: set[str]) -> float:
        """Cost per successfully completed task."""
        total = self.total_cost()
        n_success = len(successful_tasks & set(self.cost_by_task().keys()))
        return total / n_success if n_success > 0 else float('inf')

    def generate_report(self) -> str:
        """Generate a human-readable cost report."""
        lines = [
            "=== Cost Report ===",
            f"Total Cost: ${self.total_cost():.4f}",
            f"Total Entries: {len(self._entries)}",
            "",
            "--- By Agent ---",
        ]
        for agent, cost in sorted(
            self.cost_by_agent().items(), key=lambda x: x[1], reverse=True
        ):
            lines.append(f"  {agent}: ${cost:.4f}")

        lines.append("")
        lines.append("--- By Category ---")
        for cat, cost in sorted(
            self.cost_by_category().items(), key=lambda x: x[1], reverse=True
        ):
            lines.append(f"  {cat}: ${cost:.4f}")

        lines.append("")
        lines.append("--- By Model ---")
        model_costs: dict[str, float] = {}
        for entry in self._entries:
            model_costs[entry.model_id] = model_costs.get(entry.model_id, 0) + entry.cost_usd
        for model, cost in sorted(model_costs.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  {model}: ${cost:.4f}")

        return "\n".join(lines)
```

### Cost Optimization Strategies

| Strategy                                        | Savings                     | Trade-off                       |
| ----------------------------------------------- | --------------------------- | ------------------------------- |
| Prompt caching                                  | 75-90% on cached portions   | Requires stable system prompts  |
| Model routing (Haiku for simple, Opus for hard) | 60-80%                      | Needs difficulty classifier     |
| Shorter prompts                                 | 20-40%                      | May reduce quality              |
| Output token limits                             | 10-30%                      | May truncate useful output      |
| Batch processing                                | 50% (Anthropic batch API)   | Higher latency (24h)            |
| Early termination on failure                    | 30-50% on failed tasks      | Need reliable failure detection |
| Caching tool outputs                            | 20-40% on tool-heavy agents | Stale data risk                 |

---

## 10. Debugging Agent Failures

### Failure Taxonomy

```
Agent Failure Types
+----------------------------------------------------+
|                                                    |
|  Planning Failures        Execution Failures       |
|  +------------------+    +------------------+     |
|  | Wrong approach   |    | Tool call error  |     |
|  | Missing context  |    | API timeout      |     |
|  | Hallucinated     |    | Rate limit       |     |
|  |   capabilities   |    | Auth failure     |     |
|  | Infinite loop    |    | Parse error      |     |
|  +------------------+    +------------------+     |
|                                                    |
|  Reasoning Failures       Output Failures          |
|  +------------------+    +------------------+     |
|  | Wrong conclusion |    | Format mismatch  |     |
|  | Ignored evidence |    | Incomplete answer|     |
|  | Circular logic   |    | Safety refusal   |     |
|  | Lost context     |    | Hallucinated     |     |
|  |                  |    |   content        |     |
|  +------------------+    +------------------+     |
|                                                    |
+----------------------------------------------------+
```

### Replay Debugging

The most powerful debugging technique for agents: capture the full trace, then replay step by step.

```python
from dataclasses import dataclass
import json
from pathlib import Path

@dataclass(frozen=True)
class AgentStep:
    step_number: int
    step_type: str
    input_data: dict
    output_data: dict
    model_id: str | None
    tokens_used: int
    duration_ms: float
    error: str | None

@dataclass(frozen=True)
class AgentTrace:
    trace_id: str
    task: str
    steps: tuple[AgentStep, ...]
    success: bool
    total_cost: float

    def save(self, path: str) -> None:
        """Save trace for later replay."""
        data = {
            "trace_id": self.trace_id,
            "task": self.task,
            "success": self.success,
            "total_cost": self.total_cost,
            "steps": [
                {
                    "step_number": s.step_number,
                    "step_type": s.step_type,
                    "input_data": s.input_data,
                    "output_data": s.output_data,
                    "model_id": s.model_id,
                    "tokens_used": s.tokens_used,
                    "duration_ms": s.duration_ms,
                    "error": s.error,
                }
                for s in self.steps
            ],
        }
        Path(path).write_text(json.dumps(data, indent=2))

    @staticmethod
    def load(path: str) -> "AgentTrace":
        """Load a saved trace for replay analysis."""
        data = json.loads(Path(path).read_text())
        steps = tuple(
            AgentStep(
                step_number=s["step_number"],
                step_type=s["step_type"],
                input_data=s["input_data"],
                output_data=s["output_data"],
                model_id=s.get("model_id"),
                tokens_used=s["tokens_used"],
                duration_ms=s["duration_ms"],
                error=s.get("error"),
            )
            for s in data["steps"]
        )
        return AgentTrace(
            trace_id=data["trace_id"],
            task=data["task"],
            steps=steps,
            success=data["success"],
            total_cost=data["total_cost"],
        )


class TraceDebugger:
    """Interactive debugger for agent traces."""

    def __init__(self, trace: AgentTrace):
        self._trace = trace

    def summary(self) -> str:
        lines = [
            f"Trace: {self._trace.trace_id}",
            f"Task: {self._trace.task}",
            f"Success: {self._trace.success}",
            f"Steps: {len(self._trace.steps)}",
            f"Cost: ${self._trace.total_cost:.4f}",
            "",
            "Step Timeline:",
        ]
        for step in self._trace.steps:
            status = "OK" if step.error is None else "ERR"
            lines.append(
                f"  [{status}] Step {step.step_number}: "
                f"{step.step_type} ({step.duration_ms:.0f}ms, "
                f"{step.tokens_used} tokens)"
            )
            if step.error:
                lines.append(f"         Error: {step.error}")
        return "\n".join(lines)

    def find_first_error(self) -> AgentStep | None:
        """Find the first step that produced an error."""
        for step in self._trace.steps:
            if step.error is not None:
                return step
        return None

    def find_divergence_point(self, expected_actions: list[str]) -> int | None:
        """Find where the agent diverged from expected behavior."""
        for i, (step, expected) in enumerate(
            zip(self._trace.steps, expected_actions)
        ):
            if expected.lower() not in step.step_type.lower():
                return i
        return None

    def cost_after_step(self, step_number: int) -> float:
        """Calculate cost wasted after a given step (for error analysis)."""
        return sum(
            s.tokens_used * 0.00001  # rough estimate
            for s in self._trace.steps
            if s.step_number > step_number
        )

    def detect_loops(self, window: int = 3) -> list[tuple[int, int]]:
        """Detect repeated action patterns that suggest the agent is stuck."""
        loops = []
        actions = [s.step_type + ":" + str(s.input_data.get("action", ""))
                   for s in self._trace.steps]

        for i in range(len(actions) - window):
            pattern = actions[i:i + window]
            for j in range(i + window, len(actions) - window + 1):
                if actions[j:j + window] == pattern:
                    loops.append((i, j))
                    break
        return loops
```

### Root Cause Analysis Framework

When an agent fails, systematically diagnose the cause:

```
Root Cause Analysis Decision Tree
+------------------------------------------+
| Agent failed. Start here:                |
+------------------------------------------+
         |
         v
+------------------+     Yes    +------------------+
| Did it produce   | ---------> | OUTPUT FAILURE    |
| any output?      |            | Check: formatting,|
+------------------+            | completeness,     |
         | No                   | hallucination     |
         v                     +------------------+
+------------------+     Yes    +------------------+
| Did it make any  | ---------> | EXECUTION FAILURE |
| tool calls?      |            | Check: API errors,|
+------------------+            | timeouts, auth,   |
         | No                   | rate limits       |
         v                     +------------------+
+------------------+     Yes    +------------------+
| Did it produce   | ---------> | PLANNING FAILURE  |
| a plan?          |            | Check: wrong      |
+------------------+            | approach, missing |
         | No                   | capabilities      |
         v                     +------------------+
+------------------+
| PROMPT FAILURE   |
| Check: unclear   |
| instructions,    |
| missing context, |
| ambiguous task   |
+------------------+
```

### Common Failure Patterns and Fixes

| Pattern               | Symptom                                            | Root Cause                               | Fix                                           |
| --------------------- | -------------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Tool thrashing        | Same tool called repeatedly with slight variations | Agent does not understand tool semantics | Improve tool descriptions, add examples       |
| Context overflow      | Quality degrades in later steps                    | Context window filling up                | Summarize earlier steps, use retrieval        |
| Hallucinated tools    | Agent tries to call nonexistent tools              | Tool list not clear in prompt            | Explicitly enumerate available tools          |
| Premature termination | Agent stops before completing task                 | Stop conditions too broad                | Refine completion criteria                    |
| Infinite planning     | Agent plans but never acts                         | No forcing function to act               | Add step limits, require action after N plans |
| Error cascade         | One error causes subsequent errors                 | No error recovery logic                  | Add retry logic, error handling instructions  |

---

## 11. Regression Testing

### The Problem

Agent systems are particularly susceptible to regressions:

- **Prompt changes**: A small wording change can break unrelated capabilities.
- **Model updates**: New model versions may behave differently.
- **Tool changes**: API schema changes can break tool use.
- **Context changes**: Adding new system prompt sections can shift behavior.

### Eval-Driven Development

```
Eval-Driven Development Cycle
+-------------------------------------------+
|                                           |
|  1. Define eval cases for new feature     |
|     +---+                                 |
|     | E |                                 |
|     +---+                                 |
|       |                                   |
|       v                                   |
|  2. Run evals -- expect failure           |
|     +--------+                            |
|     | RED    |                            |
|     +--------+                            |
|       |                                   |
|       v                                   |
|  3. Implement feature (prompt, tools)     |
|     +--------+                            |
|     | CODE   |                            |
|     +--------+                            |
|       |                                   |
|       v                                   |
|  4. Run evals -- expect pass              |
|     +--------+                            |
|     | GREEN  |                            |
|     +--------+                            |
|       |                                   |
|       v                                   |
|  5. Run FULL eval suite (regression)      |
|     +--------+                            |
|     | CHECK  |                            |
|     +--------+                            |
|       |                                   |
|       v                                   |
|  6. Commit only if no regressions         |
|     +--------+                            |
|     | SHIP   |                            |
|     +--------+                            |
|                                           |
+-------------------------------------------+
```

### CI/CD Pipeline for Agents

```python
import asyncio
from dataclasses import dataclass

@dataclass(frozen=True)
class RegressionResult:
    suite_name: str
    total_cases: int
    passed: int
    failed: int
    new_failures: list[str]     # Cases that previously passed but now fail
    new_passes: list[str]       # Cases that previously failed but now pass
    flaky: list[str]            # Cases with inconsistent results
    baseline_pass_rate: float
    current_pass_rate: float
    is_regression: bool

async def run_regression_suite(
    agent_fn,
    eval_suite: GoldenDataset,
    baseline_results: dict[str, bool],  # case_id -> passed in baseline
    n_runs: int = 3,                     # Run each case N times for flake detection
) -> RegressionResult:
    """
    Run regression tests comparing against a baseline.
    """
    current_results: dict[str, list[bool]] = {}

    for case in eval_suite.cases:
        case_results = []
        for _ in range(n_runs):
            try:
                result = await agent_fn(case.input_prompt)
                passed = result.success
            except Exception:
                passed = False
            case_results.append(passed)
        current_results[case.id] = case_results

    new_failures = []
    new_passes = []
    flaky = []
    total_passed = 0

    for case_id, runs in current_results.items():
        all_passed = all(runs)
        any_passed = any(runs)
        baseline_passed = baseline_results.get(case_id, False)

        if all_passed:
            total_passed += 1
            if not baseline_passed:
                new_passes.append(case_id)
        elif any_passed:
            flaky.append(case_id)
        else:
            if baseline_passed:
                new_failures.append(case_id)

    baseline_pass_rate = (
        sum(1 for v in baseline_results.values() if v) / len(baseline_results)
        if baseline_results else 0.0
    )
    current_pass_rate = total_passed / len(current_results) if current_results else 0.0

    return RegressionResult(
        suite_name=eval_suite.name,
        total_cases=len(eval_suite.cases),
        passed=total_passed,
        failed=len(eval_suite.cases) - total_passed,
        new_failures=new_failures,
        new_passes=new_passes,
        flaky=flaky,
        baseline_pass_rate=baseline_pass_rate,
        current_pass_rate=current_pass_rate,
        is_regression=len(new_failures) > 0,
    )
```

### CI/CD Configuration Example

```yaml
# .github/workflows/agent-eval.yml
name: Agent Evaluation

on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'agents/**'
      - 'tools/**'

jobs:
  fast-eval:
    name: Fast Evaluation (smoke tests)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements-eval.txt
      - run: python -m pytest tests/eval/smoke/ -v --timeout=300
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: smoke-results
          path: eval-results/

  full-eval:
    name: Full Evaluation Suite
    runs-on: ubuntu-latest
    timeout-minutes: 60
    needs: fast-eval
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements-eval.txt
      - run: python -m eval.run_suite --suite=full --compare-baseline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: python -m eval.check_regression --threshold=0.95
      - uses: actions/upload-artifact@v4
        with:
          name: full-results
          path: eval-results/

  cost-check:
    name: Cost Guard
    runs-on: ubuntu-latest
    needs: full-eval
    steps:
      - run: python -m eval.cost_check --max-cost-per-task=0.50
```

### Baseline Management

```python
import json
from pathlib import Path
from dataclasses import dataclass

@dataclass(frozen=True)
class EvalBaseline:
    """Immutable record of evaluation results for regression comparison."""
    version: str
    commit_sha: str
    timestamp: float
    results: dict  # case_id -> {passed, score, steps, cost}

    def save(self, path: str) -> None:
        data = {
            "version": self.version,
            "commit_sha": self.commit_sha,
            "timestamp": self.timestamp,
            "results": self.results,
        }
        Path(path).write_text(json.dumps(data, indent=2))

    @staticmethod
    def load(path: str) -> "EvalBaseline":
        data = json.loads(Path(path).read_text())
        return EvalBaseline(
            version=data["version"],
            commit_sha=data["commit_sha"],
            timestamp=data["timestamp"],
            results=data["results"],
        )

    def compare(self, current: dict) -> dict:
        """Compare current results against baseline."""
        regressions = []
        improvements = []
        unchanged = []

        for case_id, baseline_data in self.results.items():
            if case_id not in current:
                continue
            current_data = current[case_id]
            if baseline_data["passed"] and not current_data["passed"]:
                regressions.append(case_id)
            elif not baseline_data["passed"] and current_data["passed"]:
                improvements.append(case_id)
            else:
                unchanged.append(case_id)

        return {
            "regressions": regressions,
            "improvements": improvements,
            "unchanged": unchanged,
            "regression_count": len(regressions),
            "improvement_count": len(improvements),
            "has_regressions": len(regressions) > 0,
        }
```

---

## 12. Common Interview Questions

### Q1: "How would you evaluate a code-generation agent?"

**Model Answer:**

I would use a multi-layered evaluation approach:

**Functional correctness** is the foundation. Use test suites: generate code, run it against unit tests, measure pass@k. This is what HumanEval and SWE-bench do.

**Beyond correctness**, I would measure:

- Code quality via static analysis (linting, type checking, complexity metrics).
- Efficiency by comparing agent steps and token usage across runs.
- Safety by checking for common vulnerabilities (injection, hardcoded secrets).

**For evaluation infrastructure**, I would build a golden dataset of representative tasks at varying difficulty levels, run each task multiple times to measure variance (pass@k), use LLM-as-Judge for qualitative aspects like code style and documentation quality, and track cost per successful task.

**For regression testing**, I would maintain a baseline of results, run the full eval suite in CI on any prompt or tool change, and block merges that introduce regressions beyond a threshold.

---

### Q2: "An agent works well in testing but fails in production. How do you debug this?"

**Model Answer:**

This is a distribution shift problem. I would investigate systematically:

**First, compare inputs.** Production queries are often more ambiguous, more complex, or use different terminology than test cases. Collect and analyze a sample of failing production queries.

**Second, check for environmental differences.** Test environments often have faster APIs, no rate limits, smaller data sets, or mocked services. Any of these can cause behavior differences.

**Third, examine traces.** Using the observability stack (LangSmith, Arize, or custom OpenTelemetry), replay failing production traces step by step. Identify the first point of divergence from expected behavior.

**Fourth, add the failing cases to the eval suite.** Convert production failures into regression test cases. This closes the feedback loop between production and testing.

**Fifth, consider non-determinism.** If the agent is near a decision boundary, small perturbations in production (different API response times, slightly different data) can push it to the wrong path. Run the failing cases multiple times with temperature > 0 to measure stability.

---

### Q3: "How do you handle the cost of running agent evaluations?"

**Model Answer:**

Agent evaluation costs are a real constraint. I manage them through a tiered strategy:

**Tier 1 -- Unit-level evals (cheap, fast, every commit):** Test individual prompt templates and tool descriptions in isolation. Use smaller models (Haiku) and cached responses. Run in seconds. Cost: near zero.

**Tier 2 -- Integration evals (moderate, daily or per-PR):** Run 50-100 representative tasks end-to-end. Use the production model but limit retries. Focus on the most important and most fragile capabilities. Cost: $5-50 per run.

**Tier 3 -- Full regression suite (expensive, weekly or pre-release):** Run the complete golden dataset (500+ cases). Multiple runs per case for variance measurement. Cost: $100-500 per run.

**Cost reduction techniques:**

- Cache LLM responses for deterministic inputs.
- Use model routing: Haiku for easy tasks, Sonnet for medium, Opus only when needed.
- Run evals in batch mode (50% cost reduction with Anthropic batch API).
- Implement early termination: stop a run if it exceeds 3x the expected step count.

---

### Q4: "How would you set up LLM-as-Judge? What are the pitfalls?"

**Model Answer:**

**Setup**: Define a detailed rubric with 3-5 scoring dimensions (correctness, completeness, clarity, safety). Each dimension gets a 1-5 scale with explicit descriptions for each level. Weight dimensions by importance. Use a strong model (Claude Sonnet or Opus) at low temperature.

**Key pitfalls and mitigations:**

1. **Position bias**: When comparing two outputs, the judge tends to prefer whichever it sees first. Mitigation: evaluate in both orders, average results.

2. **Verbosity bias**: Longer outputs get higher scores regardless of quality. Mitigation: add "conciseness" to the rubric, or explicitly instruct the judge to not reward verbosity.

3. **Self-enhancement bias**: Models rate their own outputs higher. Mitigation: use a different model family as judge (e.g., use GPT-4 to judge Claude outputs or vice versa).

4. **Inconsistency**: Same input can get different scores across runs. Mitigation: run the judge 3-5 times, take the median score. Track inter-run agreement.

5. **Calibration drift**: The judge may be systematically too lenient or too harsh. Mitigation: include calibration cases with known scores. Check that the judge's distribution matches expected difficulty distribution.

---

### Q5: "Design an observability system for a multi-agent architecture."

**Model Answer:**

I would build on OpenTelemetry with agent-specific extensions:

**Trace hierarchy:** Each user request gets a root trace. The orchestrator agent creates child spans. Each sub-agent gets its own span tree. Tool calls and LLM calls are leaf spans.

**Key attributes to capture on every span:**

- `agent.name`, `agent.step_number`, `agent.step_type`
- `llm.model`, `llm.input_tokens`, `llm.output_tokens`
- `tool.name`, `tool.success`, `tool.duration_ms`
- `cost.usd` (computed from tokens and model pricing)

**Dashboards I would build:**

1. **Real-time**: Active agent runs, current step, error rate.
2. **Cost**: Cost per task, cost by agent, cost trend over time.
3. **Quality**: Task completion rate, average score, regression alerts.
4. **Latency**: P50/P95/P99 for end-to-end and per-step.
5. **Debugging**: Trace explorer with filtering by status, agent, error type.

**Alerting on:**

- Error rate exceeding baseline by 2 standard deviations.
- Cost per task exceeding 3x the rolling average.
- Agent loop detection (same action repeated > 5 times).
- Latency exceeding SLA thresholds.

---

### Q6: "What is trajectory evaluation and why does it matter?"

**Model Answer:**

Trajectory evaluation assesses the sequence of steps an agent takes, not just the final output. It matters because:

**Two agents can produce the same correct answer via very different paths.** One might take 3 focused steps while another takes 15 meandering steps. Outcome-only evaluation rates them equally, but the first agent is clearly better: faster, cheaper, and more likely to succeed on harder tasks.

**Trajectories reveal reasoning quality.** An agent that immediately identifies the root cause shows better understanding than one that tries random fixes until something works. This predicts how the agent will handle novel situations.

**Trajectory evaluation catches dangerous behaviors.** An agent might produce a correct final output but make destructive intermediate actions (deleting data, running unsafe commands, leaking information in tool calls). Only step-level evaluation catches these.

**Implementation approach:** Score each step on a quality scale (excellent, good, neutral, wasteful, harmful). Compute efficiency as the ratio of necessary steps to total steps. Compare against an ideal trajectory when available. Flag repeated action patterns as potential loops. Weight later steps more heavily since early exploration is more acceptable.

---

### Q7: "How do you prevent regressions when updating agent prompts?"

**Model Answer:**

Prompt changes are the most common source of agent regressions. My prevention strategy:

**1. Version everything.** Prompts are code. Store them in version control with the same rigor as source code.

**2. Eval-driven development.** Before changing a prompt, write eval cases that capture the desired improvement AND the existing capabilities that must not break. Run evals before and after the change.

**3. Tiered eval gates in CI.** Smoke tests run on every commit (fast, cheap). Full regression suite runs before merge to main. No merge if regression count exceeds zero for critical test cases.

**4. Canary deployments.** Roll out prompt changes to 5% of traffic first. Monitor key metrics (completion rate, cost, error rate) for 24-48 hours. Only proceed to full rollout if metrics are within acceptable bounds.

**5. Baseline snapshots.** After each successful release, snapshot the eval results as the new baseline. Store alongside the prompt version for traceability.

**6. Flake management.** Agent evals are inherently noisy. Run each test case 3 times and use majority vote to reduce false positives. Track flake rate per test case and investigate cases with > 20% flake rate.

---

### Q8: "Compare offline evaluation vs. online evaluation for agents."

**Model Answer:**

| Aspect       | Offline Evaluation               | Online Evaluation       |
| ------------ | -------------------------------- | ----------------------- |
| **When**     | Before deployment                | During production       |
| **Data**     | Golden datasets, synthetic tasks | Real user requests      |
| **Speed**    | Fast feedback loop               | Slow (days/weeks)       |
| **Cost**     | Controlled, budgetable           | Proportional to traffic |
| **Coverage** | Limited to dataset               | Full distribution       |
| **Risk**     | No user impact                   | Users see failures      |
| **Metrics**  | Automated scores                 | User satisfaction       |
| **Validity** | May not match production         | Ground truth            |

**My recommendation:** Use both in a layered approach.

**Offline first:** Block obviously bad changes from reaching production. Catch 80% of issues at near-zero cost and near-zero risk to users.

**Online second:** Catch the 20% of issues that only manifest with real-world distribution, scale, and user behavior. Use A/B testing with proper statistical rigor and guardrail metrics.

**The critical bridge:** Continuously feed production failures back into the offline eval suite. This closes the feedback loop and makes offline evaluation more representative over time.

---

## 13. Quick Reference

### Evaluation Framework Checklist

Use this checklist when setting up evaluation for a new agent system:

**Foundation**

- [ ] Define success criteria for each task type
- [ ] Build golden dataset with 50+ representative cases
- [ ] Implement automated scoring (exact match, fuzzy, code execution)
- [ ] Set up LLM-as-Judge with calibrated rubrics
- [ ] Establish baseline measurements

**Multi-Dimensional Scoring**

- [ ] Task completion (binary + partial credit)
- [ ] Efficiency (steps, tokens, latency)
- [ ] Cost (per task, per success)
- [ ] Safety (no harmful actions, no data leaks)
- [ ] Output quality (correctness, completeness, clarity)

**Trajectory Analysis**

- [ ] Step-level scoring
- [ ] Loop detection
- [ ] Ideal trajectory comparison
- [ ] Recovery quality measurement

**Observability**

- [ ] Distributed tracing (OpenTelemetry)
- [ ] Structured logging per step
- [ ] Cost attribution by agent/task/category
- [ ] Real-time dashboards
- [ ] Alerting on anomalies

**Regression Prevention**

- [ ] Version-controlled prompts and eval cases
- [ ] CI/CD pipeline with eval gates
- [ ] Baseline snapshots after each release
- [ ] Flake detection and management
- [ ] Canary deployment for prompt changes

**Production Monitoring**

- [ ] A/B testing infrastructure
- [ ] User satisfaction tracking
- [ ] Cost monitoring with alerts
- [ ] Failure trace collection and replay
- [ ] Feedback loop from production to eval suite

### Key Metrics Summary

| Metric          | Formula                          | Target       |
| --------------- | -------------------------------- | ------------ |
| Pass rate       | passed / total                   | > 80%        |
| Pass@k          | 1 - C(n-c,k)/C(n,k)              | > 95% at k=5 |
| Efficiency      | necessary_steps / total_steps    | > 70%        |
| Cost/success    | total_cost / successful_tasks    | < $0.50      |
| Regression rate | new_failures / total_cases       | 0%           |
| Flake rate      | inconsistent_cases / total_cases | < 10%        |
| Judge agreement | inter-run_correlation            | > 0.85       |
| Error recovery  | recovered / total_errors         | > 60%        |

### Tool Comparison Quick Reference

```
Use Case          -> Recommended Tool
------------------------------------------
LangChain agents  -> LangSmith
Open-source need  -> Arize Phoenix
Eval-first flow   -> Braintrust
Custom pipeline   -> OpenTelemetry + custom backend
Cost analysis     -> Custom tracker + dashboards
A/B testing       -> Custom + stats library
CI/CD evals       -> pytest + custom harness
Trace debugging   -> LangSmith or custom replay
```

---

_This guide covers the core concepts needed for agentic engineering interviews. For hands-on practice, implement the eval harness code above against a real agent, build a golden dataset of 20-30 cases for your domain, and practice explaining your evaluation strategy out loud._
