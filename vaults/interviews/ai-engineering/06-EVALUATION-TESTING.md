# Evaluation and Testing for LLM Systems

A comprehensive guide to evaluating LLM outputs, detecting hallucinations, testing
prompts and pipelines, and monitoring AI systems in production. Covers automated
evaluation, LLM-as-judge, A/B testing, and benchmarking frameworks.

---

## Table of Contents

1. [Why LLM Evaluation Is Hard](#why-llm-evaluation-is-hard)
2. [Evaluation Frameworks](#evaluation-frameworks)
3. [Hallucination Detection](#hallucination-detection)
4. [LLM-as-Judge (Automated Evaluation)](#llm-as-judge-automated-evaluation)
5. [Human Evaluation Protocols](#human-evaluation-protocols)
6. [Regression Testing for Prompts](#regression-testing-for-prompts)
7. [A/B Testing LLM Outputs](#ab-testing-llm-outputs)
8. [Benchmarking](#benchmarking)
9. [Production Monitoring](#production-monitoring)
10. [Common Interview Questions](#common-interview-questions)
11. [Quick Reference](#quick-reference)

---

## Why LLM Evaluation Is Hard

Unlike traditional software (deterministic: same input = same output), LLMs are
stochastic and produce free-form text. This makes evaluation fundamentally different.

```
+------------------------------------------------------------------+
| TRADITIONAL SOFTWARE vs LLM EVALUATION                            |
+------------------------------------------------------------------+
|                                                                    |
|  Traditional:                                                     |
|  assert add(2, 3) == 5            # Exact match, pass/fail       |
|  assert response.status == 200     # Binary correctness           |
|                                                                    |
|  LLM:                                                             |
|  assert llm("Summarize X") == ???  # What is "correct"?          |
|  - Multiple valid summaries exist                                 |
|  - Quality is subjective                                          |
|  - Same prompt can give different outputs                         |
|  - Partial correctness is common                                  |
|  - Format and content both matter                                 |
|                                                                    |
+------------------------------------------------------------------+
```

### Evaluation Dimensions

| Dimension        | What It Measures                  | How to Evaluate                       |
| ---------------- | --------------------------------- | ------------------------------------- |
| **Correctness**  | Is the answer factually right?    | Ground truth comparison, LLM-as-judge |
| **Relevance**    | Does it answer the question?      | Semantic similarity, LLM-as-judge     |
| **Faithfulness** | Is it grounded in given context?  | NLI models, RAGAS                     |
| **Coherence**    | Is it well-written and logical?   | LLM-as-judge, human eval              |
| **Helpfulness**  | Is it useful to the user?         | Human eval, user feedback             |
| **Safety**       | Is it harmful or biased?          | Safety classifiers, red teaming       |
| **Format**       | Does it match required structure? | Regex, schema validation              |
| **Latency**      | How fast is the response?         | p50, p95, p99 measurements            |
| **Cost**         | How much does it cost?            | Token counting                        |

---

## Evaluation Frameworks

### RAGAS (RAG Assessment)

The standard framework for evaluating RAG pipelines.

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)
from datasets import Dataset

# Prepare evaluation dataset
eval_data = {
    "question": [
        "What is the capital of France?",
        "How does photosynthesis work?",
    ],
    "answer": [
        "The capital of France is Paris.",
        "Photosynthesis converts sunlight into chemical energy in plants.",
    ],
    "contexts": [
        ["France is a country in Western Europe. Its capital is Paris."],
        ["Photosynthesis is the process by which plants convert light energy "
         "into chemical energy stored in glucose."],
    ],
    "ground_truth": [
        "Paris is the capital of France.",
        "Photosynthesis converts light energy to chemical energy in plants.",
    ],
}

dataset = Dataset.from_dict(eval_data)

results = evaluate(
    dataset,
    metrics=[
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
        answer_correctness,
    ],
)

print(results)
# Output: {'faithfulness': 0.95, 'answer_relevancy': 0.92,
#          'context_precision': 0.88, 'context_recall': 0.90,
#          'answer_correctness': 0.94}
```

### RAGAS Metrics Explained

```
+---------------------+--------------------------------------------+----------+
| Metric              | What It Measures                           | Target   |
+---------------------+--------------------------------------------+----------+
| Faithfulness        | Is the answer supported by the context?    | > 0.85   |
|                     | (detects hallucination)                    |          |
+---------------------+--------------------------------------------+----------+
| Answer Relevancy    | Is the answer relevant to the question?    | > 0.80   |
+---------------------+--------------------------------------------+----------+
| Context Precision   | Are the retrieved contexts relevant?       | > 0.80   |
|                     | (retrieval quality)                        |          |
+---------------------+--------------------------------------------+----------+
| Context Recall      | Does context cover the ground truth?       | > 0.85   |
|                     | (retrieval completeness)                   |          |
+---------------------+--------------------------------------------+----------+
| Answer Correctness  | Is the answer factually correct?           | > 0.85   |
|                     | (vs ground truth)                          |          |
+---------------------+--------------------------------------------+----------+
```

### DeepEval

A developer-friendly evaluation framework with more metrics.

```python
from deepeval import evaluate
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    ToxicityMetric,
)
from deepeval.test_case import LLMTestCase

# Create test cases
test_case = LLMTestCase(
    input="What are the benefits of exercise?",
    actual_output="Exercise improves cardiovascular health, boosts mood, "
                  "and helps maintain a healthy weight.",
    expected_output="Exercise has many benefits including improved "
                    "cardiovascular health and mental well-being.",
    retrieval_context=[
        "Regular exercise improves heart health, reduces stress, "
        "and helps with weight management."
    ],
)

# Define metrics
relevancy = AnswerRelevancyMetric(threshold=0.7)
faithfulness = FaithfulnessMetric(threshold=0.7)
hallucination = HallucinationMetric(threshold=0.5)

# Run evaluation
results = evaluate([test_case], [relevancy, faithfulness, hallucination])
```

---

## Hallucination Detection

Hallucinations are when the model generates information not supported by the provided
context or that is factually incorrect.

### Types of Hallucination

```
+------------------------------------------------------------------+
| HALLUCINATION TAXONOMY                                            |
+------------------------------------------------------------------+
|                                                                    |
|  1. INTRINSIC HALLUCINATION                                       |
|     Output contradicts the provided context                       |
|     Example: Context says "founded in 2010"                       |
|              Model says "founded in 2008"                         |
|                                                                    |
|  2. EXTRINSIC HALLUCINATION                                       |
|     Output adds information not in context                        |
|     Example: Context: "Company makes widgets"                     |
|              Model: "Company makes widgets and was               |
|                      recently acquired by Google"                 |
|                      (acquisition not mentioned anywhere)         |
|                                                                    |
|  3. FACTUAL HALLUCINATION                                         |
|     Output contains incorrect factual claims                      |
|     Example: "The Eiffel Tower is in London"                      |
|                                                                    |
+------------------------------------------------------------------+
```

### Hallucination Detection Methods

```python
from openai import OpenAI

client = OpenAI()

def detect_hallucination(
    question: str,
    answer: str,
    context: str,
) -> dict:
    """Detect hallucination using LLM-as-judge."""
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a hallucination detector. Given a question, an answer, "
                    "and the context used to generate the answer, determine:\n"
                    "1. Is the answer faithful to the context? (no invented facts)\n"
                    "2. Does the answer contradict the context?\n"
                    "3. Does the answer add claims not supported by context?\n\n"
                    "Respond in JSON:\n"
                    "{\n"
                    '  "is_faithful": true/false,\n'
                    '  "has_contradiction": true/false,\n'
                    '  "has_unsupported_claims": true/false,\n'
                    '  "hallucinated_claims": ["list of specific hallucinated claims"],\n'
                    '  "faithfulness_score": 0.0-1.0,\n'
                    '  "explanation": "brief explanation"\n'
                    "}"
                ),
            },
            {
                "role": "user",
                "content": f"Context: {context}\n\nQuestion: {question}\n\nAnswer: {answer}",
            },
        ],
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


# Example usage
result = detect_hallucination(
    question="When was Acme Corp founded?",
    answer="Acme Corp was founded in 2010 by John Smith and went public in 2015.",
    context="Acme Corp was founded in 2010 by John Smith. It is headquartered in NYC.",
)
# Result: {"is_faithful": false, "has_unsupported_claims": true,
#          "hallucinated_claims": ["went public in 2015"],
#          "faithfulness_score": 0.6, ...}
```

### NLI-Based Hallucination Detection

```python
from transformers import pipeline

nli_model = pipeline(
    "text-classification",
    model="cross-encoder/nli-deberta-v3-base",
)

def check_entailment(premise: str, hypothesis: str) -> dict:
    """Check if context (premise) entails the claim (hypothesis)."""
    result = nli_model(f"{premise} [SEP] {hypothesis}")[0]
    return {
        "label": result["label"],    # entailment, contradiction, neutral
        "score": result["score"],
    }


def detect_hallucination_nli(context: str, answer: str) -> dict:
    """Split answer into claims and check each against context."""
    # Split answer into individual claims (sentences)
    claims = [s.strip() for s in answer.split(". ") if s.strip()]

    results = []
    for claim in claims:
        entailment = check_entailment(context, claim)
        results.append({
            "claim": claim,
            "verdict": entailment["label"],
            "confidence": entailment["score"],
        })

    hallucinated = [r for r in results if r["verdict"] != "entailment"]

    return {
        "claims_checked": len(results),
        "hallucinated_count": len(hallucinated),
        "hallucination_rate": len(hallucinated) / max(len(results), 1),
        "details": results,
    }
```

---

## LLM-as-Judge (Automated Evaluation)

Using a stronger LLM to evaluate the outputs of another LLM. This is the most
practical approach for evaluating open-ended generation.

### Basic LLM-as-Judge

```python
import json
from openai import OpenAI

client = OpenAI()

def llm_judge(
    question: str,
    answer: str,
    criteria: list[str],
    reference_answer: str | None = None,
    model: str = "gpt-4o",
) -> dict:
    """Use an LLM to judge the quality of an answer."""
    criteria_text = "\n".join(f"- {c}" for c in criteria)
    reference_section = ""
    if reference_answer:
        reference_section = f"\nReference answer: {reference_answer}\n"

    response = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert evaluator. Score the answer on each criterion "
                    "from 1-5 (1=terrible, 5=excellent). Be strict and fair.\n\n"
                    "Respond in JSON:\n"
                    "{\n"
                    '  "scores": {"criterion_name": score, ...},\n'
                    '  "overall_score": weighted_average,\n'
                    '  "strengths": ["list"],\n'
                    '  "weaknesses": ["list"],\n'
                    '  "explanation": "brief explanation"\n'
                    "}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question: {question}\n\n"
                    f"Answer to evaluate: {answer}\n"
                    f"{reference_section}\n"
                    f"Evaluation criteria:\n{criteria_text}"
                ),
            },
        ],
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


# Usage
result = llm_judge(
    question="Explain the CAP theorem",
    answer="CAP theorem states that a distributed system can only guarantee "
           "two of three properties: Consistency, Availability, Partition tolerance.",
    criteria=[
        "Correctness: Are all facts accurate?",
        "Completeness: Does it cover all key aspects?",
        "Clarity: Is the explanation clear and easy to understand?",
        "Examples: Are concrete examples provided?",
    ],
)
```

### Pairwise Comparison

Compare two outputs side by side -- more reliable than absolute scoring.

```python
def pairwise_judge(
    question: str,
    answer_a: str,
    answer_b: str,
    criteria: str = "overall quality, correctness, and helpfulness",
) -> dict:
    """Compare two answers and determine which is better."""
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert evaluator. Compare two answers and determine "
                    "which is better. Be objective and explain your reasoning.\n\n"
                    "Respond in JSON:\n"
                    "{\n"
                    '  "winner": "A" or "B" or "tie",\n'
                    '  "confidence": 0.0-1.0,\n'
                    '  "reasoning": "explanation"\n'
                    "}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question: {question}\n\n"
                    f"Answer A: {answer_a}\n\n"
                    f"Answer B: {answer_b}\n\n"
                    f"Judge based on: {criteria}"
                ),
            },
        ],
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)
```

### LLM-as-Judge Pitfalls

| Pitfall            | Description                         | Mitigation                           |
| ------------------ | ----------------------------------- | ------------------------------------ |
| **Position bias**  | Prefers first answer in comparisons | Randomize order, run twice           |
| **Verbosity bias** | Prefers longer answers              | Explicitly instruct to ignore length |
| **Self-bias**      | GPT-4 prefers GPT-4 outputs         | Use different model as judge         |
| **Leniency**       | Scores too generously               | Use strict rubric, anchor examples   |
| **Inconsistency**  | Different scores for same input     | Use temp=0, average multiple runs    |

---

## Human Evaluation Protocols

### When Human Eval Is Needed

```
+------------------------------------------------------------------+
| WHEN TO USE HUMAN EVALUATION                                      |
+------------------------------------------------------------------+
|                                                                    |
|  ALWAYS use human eval for:                                       |
|  - Final quality assessment before launch                         |
|  - Calibrating automated metrics                                  |
|  - Evaluating subjective qualities (tone, helpfulness)            |
|  - Safety-critical applications                                   |
|  - New task types with no established metrics                     |
|                                                                    |
|  Can skip human eval for:                                         |
|  - Classification tasks (use accuracy/F1)                         |
|  - Structured extraction (use schema validation)                  |
|  - Regression testing (use automated comparison)                  |
|                                                                    |
+------------------------------------------------------------------+
```

### Human Evaluation Template

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class HumanEvalTask:
    id: str
    question: str
    answer: str
    context: str | None
    rubric: dict  # criterion -> description

@dataclass(frozen=True)
class HumanEvalResult:
    task_id: str
    evaluator_id: str
    scores: dict  # criterion -> 1-5 score
    comments: str
    time_spent_seconds: int


EVALUATION_RUBRIC = {
    "correctness": {
        "1": "Completely wrong or hallucinated",
        "2": "Mostly wrong with some correct elements",
        "3": "Partially correct, has some errors",
        "4": "Mostly correct with minor issues",
        "5": "Completely correct and accurate",
    },
    "helpfulness": {
        "1": "Not helpful at all",
        "2": "Slightly helpful but misses the point",
        "3": "Somewhat helpful but incomplete",
        "4": "Helpful with minor gaps",
        "5": "Very helpful, fully addresses the question",
    },
    "safety": {
        "1": "Contains harmful or inappropriate content",
        "2": "Borderline inappropriate",
        "3": "Safe but could be improved",
        "4": "Safe and appropriate",
        "5": "Safe, appropriate, and proactively responsible",
    },
}


def compute_inter_annotator_agreement(
    evaluations: list[HumanEvalResult],
) -> dict:
    """Compute agreement between human evaluators."""
    from collections import defaultdict

    task_scores = defaultdict(list)
    for ev in evaluations:
        task_scores[ev.task_id].append(ev.scores)

    agreements = []
    for task_id, score_lists in task_scores.items():
        if len(score_lists) < 2:
            continue
        for criterion in score_lists[0]:
            values = [s[criterion] for s in score_lists]
            agreement = 1 - (max(values) - min(values)) / 4  # Normalized
            agreements.append(agreement)

    return {
        "mean_agreement": sum(agreements) / max(len(agreements), 1),
        "total_tasks": len(task_scores),
    }
```

---

## Regression Testing for Prompts

When you change a prompt, model version, or pipeline, you need to verify it does not
degrade quality on existing use cases.

### Prompt Test Suite

```python
import json
from dataclasses import dataclass

@dataclass(frozen=True)
class PromptTestCase:
    name: str
    messages: list[dict]
    expected_contains: list[str]  # Must contain these strings
    expected_not_contains: list[str]  # Must NOT contain these
    expected_format: str | None  # "json", "markdown", None
    max_tokens: int
    temperature: float

@dataclass(frozen=True)
class TestResult:
    name: str
    passed: bool
    failures: list[str]
    output: str
    latency_ms: float
    tokens_used: int


class PromptTestSuite:
    """Regression test suite for LLM prompts."""

    def __init__(self, client, model: str = "gpt-4o"):
        self.client = client
        self.model = model
        self._test_cases: list[PromptTestCase] = []

    def add_test(self, test_case: PromptTestCase) -> None:
        self._test_cases.append(test_case)

    def run_all(self) -> list[TestResult]:
        """Run all test cases and return results."""
        results = []
        for tc in self._test_cases:
            result = self._run_single(tc)
            results.append(result)
        return results

    def _run_single(self, tc: PromptTestCase) -> TestResult:
        """Run a single test case."""
        import time

        start = time.time()
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=tc.messages,
                temperature=tc.temperature,
                max_tokens=tc.max_tokens,
            )
            output = response.choices[0].message.content
            latency = (time.time() - start) * 1000
            tokens = response.usage.total_tokens
        except Exception as e:
            return TestResult(
                name=tc.name,
                passed=False,
                failures=[f"API error: {str(e)}"],
                output="",
                latency_ms=0,
                tokens_used=0,
            )

        # Check assertions
        failures = []

        for expected in tc.expected_contains:
            if expected.lower() not in output.lower():
                failures.append(f"Missing expected content: '{expected}'")

        for unexpected in tc.expected_not_contains:
            if unexpected.lower() in output.lower():
                failures.append(f"Contains unexpected content: '{unexpected}'")

        if tc.expected_format == "json":
            try:
                json.loads(output)
            except json.JSONDecodeError:
                failures.append("Expected JSON format but output is not valid JSON")

        return TestResult(
            name=tc.name,
            passed=len(failures) == 0,
            failures=failures,
            output=output[:500],
            latency_ms=latency,
            tokens_used=tokens,
        )

    def print_report(self, results: list[TestResult]) -> None:
        """Print a test report."""
        passed = sum(1 for r in results if r.passed)
        total = len(results)

        print(f"\nPrompt Test Results: {passed}/{total} passed\n")
        for r in results:
            status = "PASS" if r.passed else "FAIL"
            print(f"  [{status}] {r.name} ({r.latency_ms:.0f}ms, {r.tokens_used} tokens)")
            for f in r.failures:
                print(f"         {f}")


# Usage
suite = PromptTestSuite(client)

suite.add_test(PromptTestCase(
    name="ticket_classification_basic",
    messages=[
        {"role": "system", "content": "Classify tickets as: billing, technical, account"},
        {"role": "user", "content": "I was charged twice for my subscription"},
    ],
    expected_contains=["billing"],
    expected_not_contains=["technical"],
    expected_format=None,
    max_tokens=50,
    temperature=0,
))

suite.add_test(PromptTestCase(
    name="json_output_format",
    messages=[
        {"role": "system", "content": "Extract info as JSON: {name, email, issue}"},
        {"role": "user", "content": "Hi, I'm John (john@email.com), my app crashes on login"},
    ],
    expected_contains=["john@email.com"],
    expected_not_contains=[],
    expected_format="json",
    max_tokens=200,
    temperature=0,
))

results = suite.run_all()
suite.print_report(results)
```

---

## A/B Testing LLM Outputs

### A/B Test Architecture

```
+------------------------------------------------------------------+
|                    LLM A/B TESTING                                 |
+------------------------------------------------------------------+
|                                                                    |
|  User Request                                                     |
|      |                                                             |
|      v                                                             |
|  +----------+                                                     |
|  | Traffic  |  50% -> Variant A (current prompt / model)          |
|  | Splitter |  50% -> Variant B (new prompt / model)              |
|  +----------+                                                     |
|      |    |                                                        |
|      v    v                                                        |
|  +------+ +------+                                                 |
|  | LLM  | | LLM  |                                                |
|  | (A)  | | (B)  |                                                |
|  +------+ +------+                                                 |
|      |        |                                                    |
|      v        v                                                    |
|  +------------------+                                              |
|  | Metrics Collector |                                             |
|  | - User feedback   |                                             |
|  | - Task success    |                                             |
|  | - Latency         |                                             |
|  | - Cost            |                                             |
|  +------------------+                                              |
|           |                                                        |
|           v                                                        |
|  +------------------+                                              |
|  | Statistical       |                                             |
|  | Analysis          |                                             |
|  | (significance     |                                             |
|  |  testing)         |                                             |
|  +------------------+                                              |
|                                                                    |
+------------------------------------------------------------------+
```

### A/B Test Implementation

```python
import hashlib
import random
from dataclasses import dataclass

@dataclass(frozen=True)
class ABVariant:
    name: str
    model: str
    system_prompt: str
    temperature: float

@dataclass(frozen=True)
class ABResult:
    variant: str
    output: str
    latency_ms: float
    tokens_used: int
    cost: float


class LLMABTest:
    """Simple A/B testing for LLM configurations."""

    def __init__(self, client, variant_a: ABVariant, variant_b: ABVariant):
        self.client = client
        self.variant_a = variant_a
        self.variant_b = variant_b
        self._results: list[dict] = []

    def assign_variant(self, user_id: str) -> ABVariant:
        """Deterministically assign a variant based on user ID."""
        hash_val = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
        if hash_val % 2 == 0:
            return self.variant_a
        return self.variant_b

    def run(self, user_id: str, user_message: str) -> ABResult:
        """Run the assigned variant and record results."""
        import time

        variant = self.assign_variant(user_id)
        start = time.time()

        response = self.client.chat.completions.create(
            model=variant.model,
            temperature=variant.temperature,
            messages=[
                {"role": "system", "content": variant.system_prompt},
                {"role": "user", "content": user_message},
            ],
        )

        latency = (time.time() - start) * 1000
        output = response.choices[0].message.content
        tokens = response.usage.total_tokens

        result = ABResult(
            variant=variant.name,
            output=output,
            latency_ms=latency,
            tokens_used=tokens,
            cost=tokens * 0.000003,  # Approximate
        )

        self._results.append({
            "user_id": user_id,
            "variant": variant.name,
            "latency_ms": latency,
            "tokens_used": tokens,
        })

        return result

    def get_summary(self) -> dict:
        """Compute summary statistics for the A/B test."""
        a_results = [r for r in self._results if r["variant"] == self.variant_a.name]
        b_results = [r for r in self._results if r["variant"] == self.variant_b.name]

        def avg(items, key):
            values = [i[key] for i in items]
            return sum(values) / max(len(values), 1)

        return {
            "variant_a": {
                "name": self.variant_a.name,
                "count": len(a_results),
                "avg_latency_ms": avg(a_results, "latency_ms"),
                "avg_tokens": avg(a_results, "tokens_used"),
            },
            "variant_b": {
                "name": self.variant_b.name,
                "count": len(b_results),
                "avg_latency_ms": avg(b_results, "latency_ms"),
                "avg_tokens": avg(b_results, "tokens_used"),
            },
        }
```

---

## Benchmarking

### Key Benchmarks for SWEs

| Benchmark      | What It Tests                     | Models Use It For    |
| -------------- | --------------------------------- | -------------------- |
| **MMLU**       | Multitask knowledge (57 subjects) | General capability   |
| **HumanEval**  | Code generation (Python)          | Coding ability       |
| **MBPP**       | Code generation (entry-level)     | Coding ability       |
| **GSM8K**      | Grade school math                 | Math reasoning       |
| **MATH**       | Competition math                  | Advanced reasoning   |
| **HellaSwag**  | Commonsense reasoning             | General intelligence |
| **TruthfulQA** | Truthfulness / hallucination      | Factual accuracy     |
| **MT-Bench**   | Multi-turn conversation           | Chat quality         |
| **GPQA**       | Graduate-level Q&A                | Expert knowledge     |

### Running HumanEval

````python
def evaluate_code_generation(
    client,
    model: str,
    problems: list[dict],
    num_samples: int = 1,
) -> dict:
    """Evaluate code generation on HumanEval-style problems."""
    results = {"total": len(problems), "passed": 0, "failed": 0, "errors": 0}

    for problem in problems:
        prompt = problem["prompt"]
        test_code = problem["test"]

        response = client.chat.completions.create(
            model=model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": "Complete the Python function. "
                               "Only output the function body, no explanation.",
                },
                {"role": "user", "content": prompt},
            ],
        )

        generated_code = response.choices[0].message.content

        # Extract code from markdown if needed
        if "```python" in generated_code:
            generated_code = generated_code.split("```python")[1].split("```")[0]

        # Test the generated code
        try:
            exec(prompt + generated_code + "\n" + test_code)
            results["passed"] += 1
        except AssertionError:
            results["failed"] += 1
        except Exception:
            results["errors"] += 1

    results["pass_rate"] = results["passed"] / max(results["total"], 1)
    return results
````

---

## Production Monitoring

### Key Metrics to Track

```
+------------------------------------------------------------------+
| PRODUCTION LLM MONITORING DASHBOARD                               |
+------------------------------------------------------------------+
|                                                                    |
|  LATENCY                         QUALITY                          |
|  +----------------------------+  +----------------------------+   |
|  | TTFT (time to first token) |  | User satisfaction score   |   |
|  | Total response time        |  | Thumbs up/down ratio      |   |
|  | p50, p95, p99              |  | Hallucination rate        |   |
|  +----------------------------+  | Task success rate         |   |
|                                  +----------------------------+   |
|  COST                                                             |
|  +----------------------------+  ERRORS                           |
|  | $/query (avg, p99)        |  +----------------------------+   |
|  | Total daily/monthly spend |  | API error rate             |   |
|  | Token usage by model      |  | Timeout rate               |   |
|  +----------------------------+  | Rate limit hits            |   |
|                                  | Malformed output rate      |   |
|                                  +----------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Quality Drift Detection

```python
from datetime import datetime, timedelta
from dataclasses import dataclass

@dataclass(frozen=True)
class QualitySnapshot:
    timestamp: str
    avg_score: float
    hallucination_rate: float
    format_compliance_rate: float
    sample_size: int


def detect_quality_drift(
    snapshots: list[QualitySnapshot],
    score_threshold: float = 0.1,
    hallucination_threshold: float = 0.05,
) -> list[dict]:
    """Detect significant quality degradation over time."""
    alerts = []

    if len(snapshots) < 2:
        return alerts

    baseline = snapshots[0]
    latest = snapshots[-1]

    score_delta = latest.avg_score - baseline.avg_score
    if score_delta < -score_threshold:
        alerts.append({
            "type": "quality_degradation",
            "metric": "avg_score",
            "baseline": baseline.avg_score,
            "current": latest.avg_score,
            "delta": score_delta,
            "severity": "HIGH" if score_delta < -2 * score_threshold else "MEDIUM",
        })

    hallucination_delta = latest.hallucination_rate - baseline.hallucination_rate
    if hallucination_delta > hallucination_threshold:
        alerts.append({
            "type": "hallucination_increase",
            "metric": "hallucination_rate",
            "baseline": baseline.hallucination_rate,
            "current": latest.hallucination_rate,
            "delta": hallucination_delta,
            "severity": "CRITICAL",
        })

    return alerts
```

---

## Common Interview Questions

### Q1: How do you evaluate an LLM-powered feature?

**Answer:** A layered approach: (1) Automated metrics -- use LLM-as-judge for open-ended
tasks, exact match for classification, schema validation for structured output. Build a
test suite of 50-200 examples with expected outputs. (2) Human evaluation -- have domain
experts rate a sample on criteria like correctness, helpfulness, and safety using a
standardized rubric. Compute inter-annotator agreement to validate the rubric. (3)
Production metrics -- track user feedback (thumbs up/down), task completion rates,
latency, cost, and error rates. (4) Regression testing -- whenever you change a prompt
or model version, run the full test suite to catch degradation. The key insight is that
no single metric captures LLM quality; you need a portfolio of measurements.

### Q2: What are the limitations of LLM-as-judge?

**Answer:** Several known biases: (1) Position bias -- in pairwise comparisons, the model
tends to prefer the first answer. Mitigate by running comparisons in both orders. (2)
Verbosity bias -- longer answers get higher scores regardless of quality. Mitigate by
explicitly instructing the judge to ignore length. (3) Self-bias -- GPT-4 tends to
prefer outputs generated by GPT-4 over Claude outputs, and vice versa. Use a different
model family as judge. (4) Leniency -- models tend to score too generously. Use a strict
rubric with anchor examples. (5) Hallucination in judging -- the judge itself can
hallucinate reasons for its scores. Despite these limitations, LLM-as-judge correlates
well with human judgment (0.8+ agreement) and is 100x cheaper and faster than human eval.

### Q3: How do you detect hallucinations in production?

**Answer:** Multiple approaches: (1) For RAG systems, use NLI (Natural Language Inference)
models to check if each claim in the response is entailed by the retrieved context. (2)
Use LLM-as-judge with a faithfulness prompt that specifically asks whether the response
adds information not present in the context. (3) For factual claims, check against
knowledge bases or trusted sources. (4) Monitor hallucination rates over time using
sampled evaluation -- check 1-5% of production responses automatically. (5) Set up user
feedback mechanisms (flagging/reporting) as a safety net. (6) Use logprobs when available
-- low-confidence tokens often correlate with hallucination. The most practical approach
for production is combining NLI-based checks (fast, cheap) with periodic LLM-as-judge
evaluation (higher quality but more expensive).

### Q4: How do you A/B test a prompt change?

**Answer:** (1) Define success metrics upfront (user satisfaction, task completion rate,
latency, cost). (2) Use deterministic variant assignment based on user ID hash so users
get consistent experiences. (3) Run both variants simultaneously with a 50/50 split.
(4) Collect metrics for at least 1-2 weeks or until statistical significance (typically
p < 0.05). (5) Use both automated metrics (LLM-as-judge scores, format compliance) and
user feedback. (6) Watch for confounds -- time of day, user segments, seasonal effects.
(7) Always have a rollback plan. For LLM-specific considerations: be aware that prompt
changes can have non-obvious effects, so test broadly (not just on expected use cases)
and include edge cases in your evaluation set.

---

## Quick Reference

### Evaluation Method Selection Guide

```
What are you evaluating?
  |
  +--> Classification output
  |      --> Accuracy, F1, precision, recall
  |
  +--> Structured extraction (JSON, entities)
  |      --> Schema validation + field-level accuracy
  |
  +--> Free-form generation (summaries, answers)
  |      --> LLM-as-judge + human eval sample
  |
  +--> RAG pipeline
  |      --> RAGAS (faithfulness, relevancy, context precision/recall)
  |
  +--> Code generation
  |      --> HumanEval / MBPP (pass@k)
  |
  +--> Safety / bias
         --> Red teaming + safety classifiers
```

### Metric Targets by Application

| Application          | Key Metric                      | Target |
| -------------------- | ------------------------------- | ------ |
| Customer support bot | Task resolution rate            | > 70%  |
| Document Q&A         | Faithfulness (RAGAS)            | > 0.90 |
| Code generation      | pass@1 (HumanEval)              | > 0.80 |
| Content moderation   | Precision (false positive rate) | > 0.95 |
| Text classification  | F1 score                        | > 0.85 |
| Summarization        | LLM-judge quality score (1-5)   | > 4.0  |

### Cost of Evaluation Methods

| Method                     | Cost per 100 Evaluations | Speed      | Reliability       |
| -------------------------- | ------------------------ | ---------- | ----------------- |
| Regex/schema check         | ~$0                      | Instant    | High (for format) |
| NLI model                  | ~$0.01                   | Seconds    | Medium            |
| LLM-as-judge (GPT-4o-mini) | ~$0.50                   | Minutes    | Medium-High       |
| LLM-as-judge (GPT-4o)      | ~$5.00                   | Minutes    | High              |
| Human evaluation           | ~$50-200                 | Hours-Days | Highest           |
