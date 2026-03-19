# Coding Agents & SWE Agents

A deep-dive guide to software engineering agents -- autonomous systems that read, write,
test, and debug code across entire repositories. Covers the evolution from autocomplete
to autonomous SWE, benchmarking with SWE-bench, repo-level reasoning, code generation
patterns, IDE integration, CI/CD agents, sandboxed execution, and the agent-computer
interface (ACI) design principles that make coding agents effective.

This is one of the fastest-moving and most interview-relevant areas in agentic engineering.

---

## Table of Contents

1. [The Rise of Coding Agents](#1-the-rise-of-coding-agents)
2. [SWE-bench and Benchmarks](#2-swe-bench-and-benchmarks)
3. [Repo-Level Reasoning](#3-repo-level-reasoning)
4. [Code Generation Patterns](#4-code-generation-patterns)
5. [Code Understanding](#5-code-understanding)
6. [IDE Integration](#6-ide-integration)
7. [CI/CD Integration](#7-cicd-integration)
8. [Sandboxed Execution](#8-sandboxed-execution)
9. [Multi-File Editing](#9-multi-file-editing)
10. [Code Review Agents](#10-code-review-agents)
11. [Test Generation](#11-test-generation)
12. [Agent-Computer Interface (ACI)](#12-agent-computer-interface-aci)
13. [Common Interview Questions](#13-common-interview-questions)
14. [Quick Reference](#14-quick-reference)

---

## 1. The Rise of Coding Agents

### From Autocomplete to Autonomous SWE

The evolution of AI-assisted coding has moved through distinct generations, each
expanding the scope of what the model controls:

```
GENERATION 0          GENERATION 1         GENERATION 2         GENERATION 3
(2018-2020)           (2021-2022)          (2023-2024)          (2025+)

Autocomplete          Inline Suggest       Chat + Edit          Autonomous Agent
+-----------+         +-----------+        +-----------+        +---------------+
| Complete  |         | Multi-line|        | Explain + |        | Plan          |
| current   |   -->   | suggest   |  -->   | generate  |  -->   | Search repo   |
| token     |         | from      |        | from      |        | Edit files    |
|           |         | context   |        | instruction|        | Run tests     |
+-----------+         +-----------+        +-----------+        | Debug + fix   |
                                                                | Create PRs    |
 TabNine, Kite        GitHub Copilot       ChatGPT, Claude      +---------------+
                      (original)           Cursor Chat
                                                                 Claude Code
                                                                 Devin, SWE-agent
                                                                 Codex, Cursor Agent
```

### Key Milestones

| Year | Milestone                  | Significance                                     |
| ---- | -------------------------- | ------------------------------------------------ |
| 2021 | GitHub Copilot (preview)   | First mainstream LLM code assistant              |
| 2022 | ChatGPT                    | Conversational coding becomes mainstream         |
| 2023 | GPT-4, Claude 2            | Models capable of multi-file reasoning           |
| 2023 | SWE-bench published        | First rigorous benchmark for coding agents       |
| 2024 | SWE-agent (Princeton)      | Open-source agent solving real GitHub issues     |
| 2024 | Devin (Cognition)          | First "AI software engineer" product launch      |
| 2024 | Claude Code, Cursor Agent  | Terminal/IDE-native agentic coding               |
| 2024 | SWE-bench Verified         | Human-validated subset for reliable measurement  |
| 2025 | Codex (OpenAI cloud agent) | Cloud-based async coding agent                   |
| 2025 | Claude Code + Agent SDK    | Anthropic ships agent-native CLI with sub-agents |
| 2025 | >70% SWE-bench Verified    | Top agents solve majority of real GitHub issues  |

### The Landscape Today

```
+------------------------------------------------------------------+
|                   CODING AGENT LANDSCAPE                          |
+------------------------------------------------------------------+
|                                                                    |
|  TERMINAL-NATIVE          IDE-INTEGRATED          CLOUD/ASYNC     |
|  +-----------------+      +-----------------+     +-------------+ |
|  | Claude Code     |      | Cursor          |     | Devin       | |
|  | Aider           |      | Windsurf        |     | Codex       | |
|  | Mentat          |      | GitHub Copilot  |     | Factory     | |
|  | gpt-engineer    |      | Cline (VSCode)  |     | Sweep       | |
|  | SWE-agent       |      | Continue        |     | CodeGen     | |
|  +-----------------+      +-----------------+     +-------------+ |
|         |                        |                      |         |
|    Direct terminal          Editor UI +             Background    |
|    access, full              inline diff            execution,    |
|    repo context              + chat panel           PR-based      |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  OPEN-SOURCE RESEARCH      PR / CI AGENTS         SPECIALIZED    |
|  +-----------------+       +-----------------+    +-------------+ |
|  | SWE-agent       |       | CodeRabbit      |    | Test gen    | |
|  | OpenHands       |       | Graphite        |    | Migration   | |
|  | Agentless       |       | Ellipsis        |    | Refactoring | |
|  | AutoCodeRover   |       | PR-Agent        |    | Security    | |
|  | Moatless        |       | GitHub Actions  |    | Doc gen     | |
|  +-----------------+       +-----------------+    +-------------+ |
+------------------------------------------------------------------+
```

### What Makes Coding Agents Different from General Agents

Coding agents have unique properties that distinguish them from general-purpose agents:

1. **Verifiable output** -- Code either compiles/passes tests or it does not
2. **Rich tool ecosystem** -- File I/O, terminal, LSP, AST parsers, test runners
3. **Structured workspace** -- Repos have conventions (README, tests, CI configs)
4. **Edit-test-debug loop** -- Natural feedback cycle enables self-correction
5. **Long context dependency** -- Changes in one file ripple across the codebase
6. **Deterministic validation** -- Tests provide ground truth unlike open-ended tasks

---

## 2. SWE-bench and Benchmarks

### SWE-bench: The Standard Benchmark

SWE-bench is the gold standard for evaluating coding agents. Created by researchers at
Princeton, it consists of real GitHub issues from popular Python repositories paired with
their actual pull request solutions.

```
+------------------------------------------------------------------+
|                    SWE-BENCH PIPELINE                              |
+------------------------------------------------------------------+
|                                                                    |
|  1. CURATE TASK                                                   |
|  +---------------------------+                                    |
|  | GitHub Issue (description) |                                   |
|  | + Repository snapshot      |   From repos like django,         |
|  | + Failing test(s)          |   scikit-learn, sympy,            |
|  | + Gold-standard patch      |   matplotlib, flask, etc.         |
|  +---------------------------+                                    |
|              |                                                     |
|              v                                                     |
|  2. AGENT ATTEMPTS                                                |
|  +---------------------------+                                    |
|  | Agent receives:           |                                    |
|  |   - Issue text            |                                    |
|  |   - Full repository       |                                    |
|  |                           |                                    |
|  | Agent must:               |                                    |
|  |   - Understand the issue  |                                    |
|  |   - Find relevant files   |                                    |
|  |   - Generate a patch      |                                    |
|  +---------------------------+                                    |
|              |                                                     |
|              v                                                     |
|  3. EVALUATE                                                      |
|  +---------------------------+                                    |
|  | Apply agent's patch       |                                    |
|  | Run test suite            |                                    |
|  | Pass = resolved           |                                    |
|  | Fail = unresolved         |                                    |
|  +---------------------------+                                    |
|                                                                    |
+------------------------------------------------------------------+
```

### SWE-bench Variants

| Variant                  | Size        | Description                          | Use Case                 |
| ------------------------ | ----------- | ------------------------------------ | ------------------------ |
| **SWE-bench Full**       | 2,294 tasks | Complete original dataset            | Comprehensive evaluation |
| **SWE-bench Lite**       | 300 tasks   | Curated subset, less noisy           | Faster iteration         |
| **SWE-bench Verified**   | 500 tasks   | Human-validated, confirmed solvable  | Industry standard        |
| **SWE-bench Multimodal** | ~600 tasks  | Tasks requiring visual understanding | Frontier evaluation      |

### Leaderboard Snapshot (as of Early 2025)

Top systems on SWE-bench Verified:

| Rank | System             | % Resolved | Approach                             |
| ---- | ------------------ | ---------- | ------------------------------------ |
| 1    | Claude + tools     | ~72%       | Agentic with search + edit + test    |
| 2    | OpenAI Codex       | ~70%       | Cloud sandbox agent                  |
| 3    | Amazon Q Developer | ~65%       | Agentic flow                         |
| 4    | SWE-agent + Claude | ~55%       | Open-source harness + frontier model |
| 5    | Agentless + GPT-4o | ~35%       | No agent loop, single-pass           |

_(Numbers are approximate and rapidly changing; check swebench.com for current standings.)_

### Key Benchmark Insights

**Why SWE-bench matters for interviews:**

- It tests real-world software engineering, not toy problems
- It requires file discovery, code understanding, and correct edits
- It rewards systems that can run tests and self-correct
- The gap between "agentic" and "single-pass" approaches is enormous (~2x)

**What separates top systems:**

```python
# The critical insight: edit-test-debug loops dramatically improve performance

class NaiveApproach:
    """Single-pass: read issue, generate patch. ~25-35% on SWE-bench Verified."""
    def solve(self, issue, repo):
        relevant_files = self.search(issue, repo)
        patch = self.generate_patch(issue, relevant_files)
        return patch  # No verification!

class AgenticApproach:
    """Edit-test-debug loop: ~55-72% on SWE-bench Verified."""
    def solve(self, issue, repo):
        plan = self.analyze_issue(issue, repo)

        for attempt in range(self.max_attempts):
            relevant_files = self.search(issue, repo, plan)
            patch = self.generate_patch(issue, relevant_files, plan)

            self.apply_patch(patch)
            test_result = self.run_tests()

            if test_result.passed:
                return patch

            # Self-correction: analyze failure and retry
            plan = self.revise_plan(plan, test_result.errors)

        return self.best_patch  # Return best attempt
```

### Beyond SWE-bench: Other Benchmarks

| Benchmark              | What It Tests               | Why It Matters             |
| ---------------------- | --------------------------- | -------------------------- |
| **HumanEval / MBPP**   | Function-level code gen     | Baseline coding ability    |
| **SWE-bench**          | Repo-level issue resolution | End-to-end SWE capability  |
| **Aider polyglot**     | Multi-language editing      | Language breadth           |
| **Terminal-bench**     | Terminal/shell tasks        | System admin ability       |
| **WebArena / OSWorld** | Browser/OS tasks            | General computer use       |
| **USACO / CodeForces** | Competitive programming     | Algorithmic reasoning      |
| **BigCodeBench**       | Diverse coding tasks        | Breadth of coding skill    |
| **LiveCodeBench**      | Recent competition problems | Data contamination control |

---

## 3. Repo-Level Reasoning

The hardest challenge for coding agents is not generating code -- it is understanding
a codebase well enough to make the _right_ change in the _right_ place.

### The File Discovery Problem

```
+------------------------------------------------------------------+
|               REPO-LEVEL REASONING PIPELINE                       |
+------------------------------------------------------------------+
|                                                                    |
|  1. ISSUE UNDERSTANDING                                           |
|  "Fix: UserSerializer doesn't validate email format"             |
|          |                                                         |
|          v                                                         |
|  2. LOCALIZATION (find relevant files)                            |
|  +-----------------------------------------------------------+   |
|  | Strategy A: Keyword search ("UserSerializer", "email")     |   |
|  | Strategy B: File structure (serializers/, models/, tests/)  |   |
|  | Strategy C: Dependency graph (what imports what?)           |   |
|  | Strategy D: Git history (what files changed together?)      |   |
|  | Strategy E: AST/symbol search (find class UserSerializer)   |   |
|  +-----------------------------------------------------------+   |
|          |                                                         |
|          v                                                         |
|  3. CONTEXT ASSEMBLY                                              |
|  +-----------------------------------------------------------+   |
|  | Read relevant files, extract key sections                   |   |
|  | Understand types, interfaces, conventions                   |   |
|  | Identify test patterns to follow                            |   |
|  +-----------------------------------------------------------+   |
|          |                                                         |
|          v                                                         |
|  4. CHANGE PLANNING                                               |
|  +-----------------------------------------------------------+   |
|  | What to change and why                                      |   |
|  | Which files need edits                                      |   |
|  | What tests to add/modify                                    |   |
|  +-----------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### File Discovery Strategies

```python
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SearchResult:
    file_path: str
    relevance_score: float
    snippet: str
    line_number: int


class RepoNavigator:
    """Multi-strategy file discovery for coding agents."""

    def __init__(self, repo_path: str):
        self.repo_path = repo_path

    def keyword_search(self, query: str, max_results: int = 20) -> list[SearchResult]:
        """Grep-based search -- fast, broad, noisy."""
        # Uses ripgrep or similar for speed
        # Good first pass to identify candidate files
        ...

    def semantic_search(self, query: str, max_results: int = 10) -> list[SearchResult]:
        """Embedding-based search -- slower, more precise."""
        # Requires pre-built index of code embeddings
        # Better for natural language queries like "email validation"
        ...

    def symbol_search(self, symbol_name: str) -> list[SearchResult]:
        """AST-based search -- finds definitions and references."""
        # Uses tree-sitter or LSP to find exact symbol locations
        # Best for "find where UserSerializer is defined"
        ...

    def directory_listing(self, path: str = "") -> list[str]:
        """Structural exploration -- understand repo layout."""
        # Essential first step: understand project structure
        # Look for conventions: src/, tests/, models/, etc.
        ...

    def git_history_search(self, query: str) -> list[SearchResult]:
        """Find files that changed together historically."""
        # "What files changed when someone last touched UserSerializer?"
        # Reveals hidden dependencies
        ...

    def dependency_analysis(self, file_path: str) -> dict:
        """Trace imports and exports from a file."""
        # Build a local dependency graph
        # Critical for understanding impact of changes
        ...

    def find_relevant_files(self, issue_description: str) -> list[SearchResult]:
        """Multi-strategy search combining all approaches."""
        results = []

        # Strategy 1: Extract keywords and search
        keywords = self._extract_keywords(issue_description)
        for keyword in keywords:
            results.extend(self.keyword_search(keyword))

        # Strategy 2: Search for mentioned symbols
        symbols = self._extract_symbols(issue_description)
        for symbol in symbols:
            results.extend(self.symbol_search(symbol))

        # Strategy 3: Semantic search for the full issue
        results.extend(self.semantic_search(issue_description))

        # Deduplicate and rank
        return self._rank_and_deduplicate(results)
```

### Context Window Management for Large Repos

One of the biggest challenges: repos can have millions of lines of code but the context
window is finite.

```
+------------------------------------------------------------------+
|            CONTEXT BUDGET ALLOCATION                               |
+------------------------------------------------------------------+
|                                                                    |
|  Total context: ~200K tokens                                      |
|                                                                    |
|  +--------------------+  System prompt, tools, instructions        |
|  |  ~5K tokens        |  (fixed overhead)                         |
|  +--------------------+                                            |
|  +--------------------+  Issue description + conversation          |
|  |  ~5K tokens        |  history                                   |
|  +--------------------+                                            |
|  +--------------------+  Repo structure overview                   |
|  |  ~2K tokens        |  (directory tree, key files list)          |
|  +--------------------+                                            |
|  +--------------------+                                            |
|  |                    |  Primary files being edited                |
|  |  ~40K tokens       |  (full file contents)                      |
|  |                    |                                            |
|  +--------------------+                                            |
|  +--------------------+                                            |
|  |  ~20K tokens       |  Related files (imports, tests,            |
|  |                    |  type definitions)                         |
|  +--------------------+                                            |
|  +--------------------+  Search results, test output,              |
|  |  ~30K tokens       |  error messages                            |
|  +--------------------+                                            |
|  +--------------------+                                            |
|  |  ~50K+ tokens      |  Reserved for agent reasoning              |
|  |                    |  and multi-turn conversation               |
|  +--------------------+                                            |
|                                                                    |
+------------------------------------------------------------------+
```

### The Localization-First Insight

Research from the Agentless paper shows that **localization is the bottleneck**:

```
+---------------------------------------+
| TASK: Fix a bug in a 500-file repo    |
+---------------------------------------+
|                                        |
| Step 1: Find the right file(s)        |
|   - If correct file found: ~60% solve |
|   - If wrong file: ~5% solve          |
|   >>> Localization is 10x leverage    |
|                                        |
| Step 2: Find the right location       |
|   - Function, class, or line level    |
|   - Narrows from ~50K lines to ~50    |
|                                        |
| Step 3: Generate the patch            |
|   - Given correct location, models    |
|     are surprisingly good at this     |
|                                        |
+---------------------------------------+
```

---

## 4. Code Generation Patterns

Coding agents use several distinct patterns for generating and applying code changes.
Understanding these trade-offs is critical for interviews.

### Pattern 1: Search-and-Replace (Edit-Based)

The approach used by Claude Code, Aider, and most production systems.

```python
@dataclass(frozen=True)
class SearchReplaceEdit:
    """Targeted edit: find exact text, replace with new text."""
    file_path: str
    old_content: str  # Must match exactly
    new_content: str


def apply_search_replace(edit: SearchReplaceEdit) -> str:
    """Apply a search-and-replace edit to a file."""
    with open(edit.file_path, 'r') as f:
        content = f.read()

    if content.count(edit.old_content) == 0:
        raise ValueError(f"Old content not found in {edit.file_path}")
    if content.count(edit.old_content) > 1:
        raise ValueError(f"Old content matches multiple locations in {edit.file_path}")

    new_file_content = content.replace(edit.old_content, edit.new_content, 1)

    with open(edit.file_path, 'w') as f:
        f.write(new_file_content)

    return new_file_content
```

**Advantages:**

- Minimal tokens (only the changed region)
- Easy to review -- you see exactly what changed
- Low risk of destroying unrelated code
- Works well with LLMs (they output the exact old and new text)

**Disadvantages:**

- Fragile if old_content does not match exactly (whitespace, line endings)
- Cannot handle concurrent edits to the same region
- Requires unique matching of old_content

### Pattern 2: Unified Diff (Patch-Based)

Traditional diff format, used by SWE-agent and some research systems.

```python
@dataclass(frozen=True)
class UnifiedDiff:
    """Standard unified diff format."""
    file_path: str
    diff_text: str  # Standard unified diff format


EXAMPLE_DIFF = """
--- a/src/serializers.py
+++ b/src/serializers.py
@@ -15,6 +15,8 @@ class UserSerializer:
     def validate_email(self, value):
-        return value
+        if '@' not in value:
+            raise ValidationError('Invalid email format')
+        return value.strip().lower()
"""


def apply_unified_diff(diff: UnifiedDiff) -> None:
    """Apply a unified diff using the patch command."""
    import subprocess
    result = subprocess.run(
        ['patch', '-p1', '--no-backup-if-mismatch'],
        input=diff.diff_text,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Patch failed: {result.stderr}")
```

**Advantages:**

- Standard format, tooling everywhere
- Handles line number context (tolerates minor shifts)
- Compact representation

**Disadvantages:**

- LLMs struggle with line numbers and `@@` headers
- Off-by-one errors are extremely common
- Harder to validate before applying

### Pattern 3: Full File Rewrite

Used by Cursor (for shorter files), some simpler agent systems.

```python
@dataclass(frozen=True)
class FileRewrite:
    """Complete file replacement."""
    file_path: str
    new_content: str


def apply_file_rewrite(rewrite: FileRewrite) -> None:
    """Replace entire file contents."""
    with open(rewrite.file_path, 'w') as f:
        f.write(rewrite.new_content)
```

**Advantages:**

- Simplest to implement
- No matching issues
- LLMs can generate complete files reliably

**Disadvantages:**

- Extremely token-expensive for large files
- Easy to accidentally drop code
- Harder to review (must diff entire file)
- Does not scale to files >500 lines

### Pattern Comparison Matrix

```
+------------------------------------------------------------------+
|          CODE GENERATION PATTERN COMPARISON                        |
+------------------------------------------------------------------+
|                                                                    |
| Dimension          | Search/Replace | Unified Diff | Full Rewrite |
|--------------------|----------------|--------------|--------------|
| Token efficiency   | High           | High         | Low          |
| LLM reliability    | High           | Medium       | High (small) |
| Handles big files  | Yes            | Yes          | No           |
| Review clarity     | High           | Medium       | Low          |
| Error recovery     | Easy           | Hard         | Easy         |
| Multi-edit support | Sequential     | Batched      | N/A          |
| Used by            | Claude Code,   | SWE-agent    | Cursor (Tab) |
|                    | Aider          |              |              |
+------------------------------------------------------------------+
```

### Pattern 4: AST-Based Transformations

More advanced systems manipulate the abstract syntax tree directly.

```python
import ast
from copy import deepcopy


def add_parameter_to_function(
    source: str,
    function_name: str,
    param_name: str,
    param_type: str,
    default_value: str,
) -> str:
    """Add a parameter to a function using AST manipulation."""
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            # Create new argument
            new_arg = ast.arg(arg=param_name, annotation=ast.Constant(value=param_type))
            new_default = ast.Constant(value=ast.literal_eval(default_value))

            node.args.args.append(new_arg)
            node.args.defaults.append(new_default)
            break

    return ast.unparse(tree)
```

**Advantages:**

- Semantically correct transformations
- Cannot produce syntax errors
- Enables structural refactoring (rename symbol, extract function)

**Disadvantages:**

- Loses comments and formatting
- Complex to implement for all languages
- LLMs cannot easily "think in ASTs"

---

## 5. Code Understanding

Coding agents need more than text search -- they need semantic understanding of code
structure, types, and relationships.

### AST Analysis

Abstract Syntax Trees let agents understand code structure rather than just text:

```python
import ast


def extract_function_signatures(source_code: str) -> list[dict]:
    """Extract all function signatures from Python source."""
    tree = ast.parse(source_code)
    signatures = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            sig = {
                "name": node.name,
                "args": [arg.arg for arg in node.args.args],
                "decorators": [ast.dump(d) for d in node.decorator_list],
                "line_number": node.lineno,
                "is_async": isinstance(node, ast.AsyncFunctionDef),
                "docstring": ast.get_docstring(node),
            }
            signatures.append(sig)

    return signatures


def extract_class_hierarchy(source_code: str) -> dict:
    """Extract class definitions and their inheritance."""
    tree = ast.parse(source_code)
    classes = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            classes[node.name] = {
                "bases": [ast.dump(base) for base in node.bases],
                "methods": [
                    n.name for n in node.body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                ],
                "line_number": node.lineno,
            }

    return classes
```

### Tree-sitter for Multi-Language Parsing

Tree-sitter provides fast, incremental parsing for 100+ languages:

```python
# tree-sitter provides language-agnostic AST parsing
# Used by GitHub, Neovim, Zed, and most coding agents

import tree_sitter_python as tspython
from tree_sitter import Language, Parser


def build_python_parser() -> Parser:
    """Build a tree-sitter parser for Python."""
    PY_LANGUAGE = Language(tspython.language())
    parser = Parser(PY_LANGUAGE)
    return parser


def find_all_function_calls(source: bytes, parser: Parser) -> list[dict]:
    """Find all function calls in source code using tree-sitter."""
    tree = parser.parse(source)
    calls = []

    def visit(node):
        if node.type == "call":
            func_node = node.child_by_field_name("function")
            if func_node:
                calls.append({
                    "function": source[func_node.start_byte:func_node.end_byte].decode(),
                    "line": node.start_point[0] + 1,
                    "col": node.start_point[1],
                })
        for child in node.children:
            visit(child)

    visit(tree.root_node)
    return calls
```

### Symbol Resolution and Go-to-Definition

```
+------------------------------------------------------------------+
|                SYMBOL RESOLUTION PIPELINE                          |
+------------------------------------------------------------------+
|                                                                    |
|  Source: "result = user_service.validate(email)"                  |
|                                                                    |
|  Step 1: Parse AST                                                |
|    -> attribute access: user_service.validate                     |
|    -> argument: email (Name node)                                  |
|                                                                    |
|  Step 2: Resolve user_service                                     |
|    -> Check local scope -> not found                              |
|    -> Check imports -> "from services import user_service"        |
|    -> File: services/user_service.py                              |
|                                                                    |
|  Step 3: Resolve .validate method                                 |
|    -> In services/user_service.py, find "def validate"            |
|    -> Line 45, takes (self, email: str) -> bool                   |
|                                                                    |
|  Step 4: Return definition location                               |
|    -> services/user_service.py:45                                  |
|                                                                    |
+------------------------------------------------------------------+
```

### Semantic Code Search

Beyond text matching, semantic search understands intent:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class CodeChunk:
    file_path: str
    content: str
    start_line: int
    end_line: int
    chunk_type: str  # "function", "class", "module"
    embedding: list[float]


class SemanticCodeIndex:
    """Index code for semantic search using embeddings."""

    def __init__(self, embedding_model):
        self.model = embedding_model
        self.chunks: list[CodeChunk] = []

    def index_repository(self, repo_path: str) -> None:
        """Parse all files and build semantic index."""
        for file_path in self._find_source_files(repo_path):
            source = self._read_file(file_path)
            chunks = self._chunk_by_structure(file_path, source)

            for chunk in chunks:
                embedding = self.model.embed(chunk.content)
                self.chunks.append(
                    CodeChunk(
                        file_path=chunk.file_path,
                        content=chunk.content,
                        start_line=chunk.start_line,
                        end_line=chunk.end_line,
                        chunk_type=chunk.chunk_type,
                        embedding=embedding,
                    )
                )

    def search(self, query: str, top_k: int = 10) -> list[CodeChunk]:
        """Find code chunks semantically similar to query."""
        query_embedding = self.model.embed(query)
        scored = [
            (self._cosine_similarity(query_embedding, chunk.embedding), chunk)
            for chunk in self.chunks
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]

    def _chunk_by_structure(self, file_path, source):
        """Split source into semantic chunks (functions, classes, etc)."""
        ...

    def _cosine_similarity(self, a, b):
        ...

    def _find_source_files(self, repo_path):
        ...

    def _read_file(self, file_path):
        ...
```

### Type Inference for Dynamic Languages

```python
class TypeInferencer:
    """Lightweight type inference for Python code understanding.

    Coding agents use type information to:
    - Understand function contracts
    - Generate correct call sites
    - Identify type mismatches in patches
    """

    def infer_from_hints(self, source: str) -> dict[str, str]:
        """Extract explicit type annotations."""
        tree = ast.parse(source)
        types = {}

        for node in ast.walk(tree):
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                types[node.target.id] = ast.dump(node.annotation)
            elif isinstance(node, ast.FunctionDef):
                for arg in node.args.args:
                    if arg.annotation:
                        types[f"{node.name}.{arg.arg}"] = ast.dump(arg.annotation)

        return types

    def infer_from_usage(self, source: str, variable_name: str) -> list[str]:
        """Infer type from how a variable is used (duck typing analysis)."""
        tree = ast.parse(source)
        methods_called = []

        for node in ast.walk(tree):
            if (isinstance(node, ast.Attribute)
                    and isinstance(node.value, ast.Name)
                    and node.value.id == variable_name):
                methods_called.append(node.attr)

        # Map method patterns to likely types
        type_hints = []
        if "append" in methods_called or "__getitem__" in methods_called:
            type_hints.append("list")
        if "items" in methods_called or "keys" in methods_called:
            type_hints.append("dict")
        if "read" in methods_called or "write" in methods_called:
            type_hints.append("file-like")

        return type_hints
```

---

## 6. IDE Integration

### Architecture Patterns

All IDE-integrated coding agents follow variations of the same architecture:

```
+------------------------------------------------------------------+
|              IDE CODING AGENT ARCHITECTURE                         |
+------------------------------------------------------------------+
|                                                                    |
|  +-------------------+     +-------------------+                  |
|  |    IDE / Editor    |     |   Agent Backend   |                  |
|  |                    |     |                    |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  |  | Chat Panel  |<-|---->|->| LLM API     |  |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  |  +-------------+  | API |  +-------------+  |                  |
|  |  | Inline Diff |<-|---->|->| Tool Engine |  |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  |  | File Tree   |<-|---->|->| Context     |  |                  |
|  |  +-------------+  |     |  | Manager     |  |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  |  | Terminal    |<-|---->|->| Sandbox     |  |                  |
|  |  +-------------+  |     |  +-------------+  |                  |
|  +-------------------+     +-------------------+                  |
|         |                           |                              |
|         v                           v                              |
|  +-------------------+     +-------------------+                  |
|  | Language Server   |     |  Model Provider   |                  |
|  | (LSP)            |     |  (Anthropic/       |                  |
|  |                   |     |   OpenAI/local)    |                  |
|  +-------------------+     +-------------------+                  |
|                                                                    |
+------------------------------------------------------------------+
```

### Product Comparison

```
+------------------------------------------------------------------+
|           IDE CODING AGENT COMPARISON                              |
+------------------------------------------------------------------+
|                                                                    |
| Feature           | Claude  | Cursor | Copilot | Windsurf| Cline |
|                   | Code    |        |         |         |       |
|-------------------|---------|--------|---------|---------|-------|
| Interface         | Terminal| IDE    | IDE     | IDE     | IDE   |
| Autonomy level    | High    | Medium | Medium  | Medium  | High  |
| Edit pattern      | S&R     | Rewrite| Inline  | Rewrite | S&R   |
| Terminal access   | Native  | Yes    | Limited | Yes     | Yes   |
| Multi-file edits  | Yes     | Yes    | Limited | Yes     | Yes   |
| Test execution    | Yes     | Yes    | No      | Yes     | Yes   |
| Git operations    | Yes     | Yes    | Yes     | Yes     | Yes   |
| Sub-agents        | Yes     | No     | No      | No      | No    |
| MCP support       | Yes     | Yes    | No      | Yes     | Yes   |
| Model flexibility | Claude  | Any    | GPT/    | Any     | Any   |
|                   |         |        | Claude  |         |       |
| Pricing model     | API     | Sub    | Sub     | Sub     | Free  |
|                   | usage   |        |         |         | (OSS) |
+------------------------------------------------------------------+
```

### Claude Code Architecture Deep Dive

Claude Code is a terminal-native coding agent. Its architecture is particularly
interview-relevant because it demonstrates key ACI design principles:

```
+------------------------------------------------------------------+
|                  CLAUDE CODE ARCHITECTURE                          |
+------------------------------------------------------------------+
|                                                                    |
|  Terminal Input                                                    |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  Agent Loop (TypeScript)                                    |   |
|  |                                                             |   |
|  |  +----------+    +-----------+    +------------------+     |   |
|  |  | System   |--->| Anthropic |--->| Tool Execution   |     |   |
|  |  | Prompt   |    | API       |    |                  |     |   |
|  |  | Builder  |    | (Claude)  |    | - Read file      |     |   |
|  |  +----------+    +-----------+    | - Edit file      |     |   |
|  |       ^               |           | - Bash command   |     |   |
|  |       |               v           | - Glob search    |     |   |
|  |  +----------+    +-----------+    | - Grep search    |     |   |
|  |  | Context  |    | Response  |    | - Write file     |     |   |
|  |  | (CLAUDE  |    | Parser    |    | - Sub-agents     |     |   |
|  |  |  .md,    |    +-----------+    | - MCP tools      |     |   |
|  |  |  memory) |                     | - Notebook edit  |     |   |
|  |  +----------+                     +------------------+     |   |
|  |                                                             |   |
|  |  Permission System:                                         |   |
|  |  - File reads: auto-approved                                |   |
|  |  - File writes: require approval (unless allowlisted)       |   |
|  |  - Bash commands: require approval (unless allowlisted)     |   |
|  |  - Destructive git ops: always require approval             |   |
|  +-----------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Cursor Architecture Pattern

```
+------------------------------------------------------------------+
|                   CURSOR ARCHITECTURE                              |
+------------------------------------------------------------------+
|                                                                    |
|  VSCode Fork                                                      |
|      |                                                             |
|      +---> Tab Completion (fast, single-line/block)               |
|      |         Uses: speculative decoding, small model             |
|      |         Latency target: <300ms                             |
|      |                                                             |
|      +---> Cmd+K Inline Edit (targeted edit)                      |
|      |         Uses: selection + instruction -> diff               |
|      |         Model: Claude/GPT with edit format                 |
|      |                                                             |
|      +---> Chat Panel (conversational)                            |
|      |         Uses: full conversation context                     |
|      |         Can reference files with @-mentions                 |
|      |                                                             |
|      +---> Agent Mode (autonomous)                                |
|               Uses: tool calling, file ops, terminal               |
|               Full agentic loop with approval gates               |
|                                                                    |
|  Key Innovation: Context engine                                    |
|  - Codebase indexing (embeddings for every file)                  |
|  - Automatic context selection based on cursor position           |
|  - Recently edited files prioritized                              |
|  - @-mention system for explicit context                          |
|                                                                    |
+------------------------------------------------------------------+
```

### GitHub Copilot Architecture

```
+------------------------------------------------------------------+
|               GITHUB COPILOT ARCHITECTURE                         |
+------------------------------------------------------------------+
|                                                                    |
|  IDE Extension (VSCode, JetBrains, Neovim)                       |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  Context Assembly                                           |   |
|  |  - Current file (up to cursor)                              |   |
|  |  - Open tabs (prioritized by relevance)                     |   |
|  |  - Import graph (referenced files)                          |   |
|  |  - Language-specific context (type stubs, headers)          |   |
|  +-----------------------------------------------------------+   |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  GitHub Cloud                                               |   |
|  |  - Model inference (Codex / GPT-4 / Claude)                |   |
|  |  - RAG over repo (Copilot Workspace)                        |   |
|  |  - Multi-step agent (Copilot Agent)                         |   |
|  +-----------------------------------------------------------+   |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  Inline Ghost Text / Chat / Agent Response                  |   |
|  +-----------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 7. CI/CD Integration

### PR Agents

PR agents automate code review, test generation, and PR management:

```
+------------------------------------------------------------------+
|               PR AGENT WORKFLOW                                    |
+------------------------------------------------------------------+
|                                                                    |
|  Developer pushes code                                            |
|      |                                                             |
|      v                                                             |
|  GitHub/GitLab Webhook fires                                      |
|      |                                                             |
|      +---> PR Agent receives event                                |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  ANALYSIS PHASE                                             |   |
|  |  1. Fetch diff (changed files)                              |   |
|  |  2. Fetch related context (imports, tests, types)           |   |
|  |  3. Analyze changes with LLM                                |   |
|  |     - Code quality issues                                   |   |
|  |     - Security vulnerabilities                              |   |
|  |     - Performance concerns                                  |   |
|  |     - Missing tests                                         |   |
|  |     - Style violations                                      |   |
|  +-----------------------------------------------------------+   |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  ACTION PHASE                                               |   |
|  |  - Post inline review comments                              |   |
|  |  - Generate PR summary                                      |   |
|  |  - Suggest fixes (as commits or suggestions)                |   |
|  |  - Auto-generate missing tests                              |   |
|  |  - Update documentation                                     |   |
|  +-----------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### Implementing a PR Review Agent

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class PRDiff:
    file_path: str
    old_content: str
    new_content: str
    diff_text: str


@dataclass(frozen=True)
class ReviewComment:
    file_path: str
    line_number: int
    severity: str  # "critical", "warning", "suggestion", "nitpick"
    category: str  # "security", "performance", "style", "bug", "test"
    message: str
    suggested_fix: str | None


class PRReviewAgent:
    """Automated PR review agent."""

    def __init__(self, llm_client, repo_context):
        self.llm = llm_client
        self.repo = repo_context

    def review_pr(self, pr_diffs: list[PRDiff]) -> list[ReviewComment]:
        """Review all changes in a PR."""
        comments = []

        for diff in pr_diffs:
            # Get context: related files, type definitions, existing tests
            context = self.repo.get_context_for_file(diff.file_path)

            # Run multiple review passes
            comments.extend(self._check_security(diff, context))
            comments.extend(self._check_bugs(diff, context))
            comments.extend(self._check_performance(diff, context))
            comments.extend(self._check_test_coverage(diff, context))
            comments.extend(self._check_style(diff, context))

        # Deduplicate and prioritize
        return self._prioritize(comments)

    def _check_security(self, diff: PRDiff, context: dict) -> list[ReviewComment]:
        """Check for security vulnerabilities."""
        prompt = f"""Review this code change for security issues:

File: {diff.file_path}
Diff:
{diff.diff_text}

Context:
{context}

Look for: SQL injection, XSS, hardcoded secrets, auth bypass,
path traversal, insecure deserialization, SSRF.

Return findings as JSON array."""

        response = self.llm.generate(prompt)
        return self._parse_comments(response, category="security")

    def _check_bugs(self, diff, context):
        ...

    def _check_performance(self, diff, context):
        ...

    def _check_test_coverage(self, diff, context):
        ...

    def _check_style(self, diff, context):
        ...

    def _prioritize(self, comments):
        ...

    def _parse_comments(self, response, category):
        ...
```

### Test Generation in CI

```python
class CITestGenerator:
    """Generate tests for new code in CI pipeline."""

    def generate_tests_for_pr(self, pr_diffs: list[PRDiff]) -> dict[str, str]:
        """Generate test files for changed functions."""
        new_test_files = {}

        for diff in pr_diffs:
            if self._is_test_file(diff.file_path):
                continue  # Skip existing test files

            # Find functions that changed
            changed_functions = self._extract_changed_functions(diff)
            if not changed_functions:
                continue

            # Find existing test file (if any)
            test_file = self._find_test_file(diff.file_path)
            existing_tests = self._read_file(test_file) if test_file else ""

            # Get test patterns from the repo
            test_patterns = self._analyze_test_patterns(diff.file_path)

            # Generate tests
            new_tests = self._generate_tests(
                source_file=diff.file_path,
                new_content=diff.new_content,
                changed_functions=changed_functions,
                existing_tests=existing_tests,
                test_patterns=test_patterns,
            )

            target_test_file = test_file or self._derive_test_path(diff.file_path)
            new_test_files[target_test_file] = new_tests

        return new_test_files

    def _is_test_file(self, path):
        return "test" in path.lower()

    def _extract_changed_functions(self, diff):
        ...

    def _find_test_file(self, source_path):
        ...

    def _read_file(self, path):
        ...

    def _analyze_test_patterns(self, source_path):
        ...

    def _generate_tests(self, **kwargs):
        ...

    def _derive_test_path(self, source_path):
        ...
```

### Deployment Agents

```
+------------------------------------------------------------------+
|              DEPLOYMENT AGENT PIPELINE                             |
+------------------------------------------------------------------+
|                                                                    |
|  PR Merged to main                                                |
|      |                                                             |
|      v                                                             |
|  +------------------+                                             |
|  | Pre-deploy Check |  Agent verifies:                            |
|  | Agent            |  - All tests pass                           |
|  |                  |  - No security issues                       |
|  |                  |  - DB migrations safe                       |
|  |                  |  - Config changes valid                     |
|  +--------+---------+                                             |
|           |                                                        |
|           v                                                        |
|  +------------------+                                             |
|  | Canary Deploy    |  Agent monitors:                            |
|  | Agent            |  - Error rates                              |
|  |                  |  - Latency percentiles                      |
|  |                  |  - Resource usage                           |
|  +--------+---------+                                             |
|           |                                                        |
|      +----+----+                                                  |
|      |         |                                                  |
|   Healthy   Unhealthy                                             |
|      |         |                                                  |
|      v         v                                                  |
|  Full Roll  Rollback                                              |
|  Out        + Alert                                               |
|             + Root Cause Agent                                    |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 8. Sandboxed Execution

Running AI-generated code safely is a foundational requirement. The agent must be able
to execute code and tests to verify its work without risking the host system.

### Sandbox Architecture

```
+------------------------------------------------------------------+
|               SANDBOX ARCHITECTURE                                 |
+------------------------------------------------------------------+
|                                                                    |
|  +-----------------------------------------------------------+   |
|  |  Agent Process                                              |   |
|  |                                                             |   |
|  |  "Run pytest tests/test_serializer.py"                     |   |
|  +----------------------------+------------------------------+   |
|                               |                                   |
|                               v                                   |
|  +-----------------------------------------------------------+   |
|  |  Sandbox Manager                                            |   |
|  |                                                             |   |
|  |  1. Choose isolation level based on command                 |   |
|  |  2. Apply resource limits (CPU, memory, time, disk)        |   |
|  |  3. Mount repo as volume (read-write or read-only)         |   |
|  |  4. Execute command                                         |   |
|  |  5. Capture stdout, stderr, exit code                       |   |
|  |  6. Enforce timeout                                         |   |
|  |  7. Return results to agent                                 |   |
|  +-----------------------------------------------------------+   |
|                               |                                   |
|              +----------------+----------------+                  |
|              |                |                |                   |
|              v                v                v                   |
|  +----------------+  +---------------+  +----------------+        |
|  | Docker/OCI     |  | gVisor/Firecracker | Nsjail/Bubblewrap |  |
|  | Container      |  | MicroVM       |  | Process Sandbox|        |
|  |                |  |               |  |                |        |
|  | - Full OS      |  | - Kernel-level|  | - Lightweight  |        |
|  |   isolation    |  |   isolation   |  | - Namespace    |        |
|  | - Slow startup |  | - Fast start  |  |   isolation    |        |
|  | - Heavy        |  | - Secure      |  | - Fast         |        |
|  +----------------+  +---------------+  +----------------+        |
|                                                                    |
+------------------------------------------------------------------+
```

### Implementing a Sandbox Manager

```python
import subprocess
import tempfile
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SandboxConfig:
    timeout_seconds: int = 120
    max_memory_mb: int = 2048
    max_disk_mb: int = 1024
    network_access: bool = False
    writable_paths: tuple[str, ...] = ()
    read_only_paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool
    duration_seconds: float


class SandboxExecutor:
    """Execute commands in an isolated environment."""

    def __init__(self, config: SandboxConfig):
        self.config = config

    def execute(self, command: str, working_dir: str) -> ExecutionResult:
        """Execute a command in a sandboxed environment."""
        import time
        start_time = time.time()

        docker_cmd = self._build_docker_command(command, working_dir)

        try:
            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=self.config.timeout_seconds,
            )
            duration = time.time() - start_time

            return ExecutionResult(
                stdout=result.stdout[-10000:],  # Truncate long output
                stderr=result.stderr[-5000:],
                exit_code=result.returncode,
                timed_out=False,
                duration_seconds=duration,
            )

        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return ExecutionResult(
                stdout="",
                stderr=f"Command timed out after {self.config.timeout_seconds}s",
                exit_code=-1,
                timed_out=True,
                duration_seconds=duration,
            )

    def _build_docker_command(self, command: str, working_dir: str) -> list[str]:
        """Build a Docker command with appropriate isolation."""
        cmd = [
            "docker", "run",
            "--rm",
            f"--memory={self.config.max_memory_mb}m",
            "--cpus=2",
            f"--stop-timeout={self.config.timeout_seconds}",
        ]

        # Network isolation
        if not self.config.network_access:
            cmd.append("--network=none")

        # Mount working directory
        cmd.extend(["-v", f"{working_dir}:/workspace:rw"])
        cmd.extend(["-w", "/workspace"])

        # Read-only mounts
        for path in self.config.read_only_paths:
            cmd.extend(["-v", f"{path}:{path}:ro"])

        # Security: drop all capabilities, no new privileges
        cmd.extend(["--cap-drop=ALL", "--security-opt=no-new-privileges"])

        cmd.extend(["python:3.12-slim", "bash", "-c", command])
        return cmd
```

### E2Code/OpenHands Sandbox Pattern

OpenHands (formerly OpenDevin) uses a particularly well-designed sandbox:

```
+------------------------------------------------------------------+
|              OPENHANDS SANDBOX ARCHITECTURE                        |
+------------------------------------------------------------------+
|                                                                    |
|  +-------------------+         +-------------------------+        |
|  |  Agent Runtime    |         |  Sandbox Container      |        |
|  |  (Host)           |         |  (Docker)               |        |
|  |                   |   gRPC  |                         |        |
|  |  Agent Loop  -----+-------->|  Action Executor        |        |
|  |                   |         |  - File operations      |        |
|  |  Observation <----+---------+  - Shell commands       |        |
|  |  Handler          |         |  - Browser (Playwright) |        |
|  |                   |         |  - Code interpreter     |        |
|  +-------------------+         |                         |        |
|                                |  Persistent workspace:  |        |
|                                |  /workspace/repo/       |        |
|                                +-------------------------+        |
|                                                                    |
|  Key design choices:                                              |
|  - Agent and sandbox in separate processes                        |
|  - gRPC for structured communication                              |
|  - Sandbox state persists across actions                          |
|  - Agent can observe file changes, terminal output                |
|  - Browser available for web-related tasks                        |
|                                                                    |
+------------------------------------------------------------------+
```

### Security Considerations

| Risk                         | Mitigation                                |
| ---------------------------- | ----------------------------------------- |
| **Arbitrary code execution** | Container isolation, dropped capabilities |
| **Network exfiltration**     | `--network=none` by default               |
| **Resource exhaustion**      | CPU, memory, disk, and time limits        |
| **File system escape**       | Read-only mounts, no host path access     |
| **Privilege escalation**     | Non-root user, `no-new-privileges`        |
| **Infinite loops**           | Hard timeout with process kill            |
| **Fork bombs**               | PID limits (`--pids-limit`)               |
| **Cryptomining**             | CPU limits, no GPU access                 |

---

## 9. Multi-File Editing

Real software changes rarely touch a single file. Coding agents must coordinate edits
across multiple files while maintaining consistency.

### The Multi-File Challenge

```
+------------------------------------------------------------------+
|          MULTI-FILE EDIT COORDINATION                              |
+------------------------------------------------------------------+
|                                                                    |
|  Task: "Add email validation to the User model"                  |
|                                                                    |
|  Files that need changes:                                         |
|                                                                    |
|  models/user.py          +-- Add email field validation           |
|       |                                                            |
|       +--- serializers/user_serializer.py                         |
|       |         +-- Update serializer to use validation           |
|       |                                                            |
|       +--- tests/test_user.py                                     |
|       |         +-- Add test for email validation                 |
|       |                                                            |
|       +--- tests/test_serializer.py                               |
|       |         +-- Add serializer validation test                |
|       |                                                            |
|       +--- migrations/0042_add_email_validation.py                |
|       |         +-- Database migration                            |
|       |                                                            |
|       +--- api/views.py                                           |
|                 +-- Update error handling for new validation      |
|                                                                    |
|  Constraints:                                                     |
|  - All files must be consistent with each other                   |
|  - Types must match across boundaries                             |
|  - Tests must import the right symbols                            |
|  - Migration must match model changes                             |
|                                                                    |
+------------------------------------------------------------------+
```

### Multi-File Edit Strategies

**Strategy 1: Sequential with Dependency Order**

```python
class SequentialMultiFileEditor:
    """Edit files in dependency order, validating after each."""

    def apply_changes(self, change_plan: list[dict]) -> list[dict]:
        """Apply changes sequentially, checking consistency."""
        results = []

        # Sort by dependency: types -> models -> services -> tests
        ordered = self._topological_sort(change_plan)

        for change in ordered:
            result = self._apply_single_change(change)
            results.append(result)

            # Validate consistency after each change
            issues = self._check_consistency(results)
            if issues:
                # Let the LLM fix inconsistencies before continuing
                fix = self._resolve_inconsistency(issues, results)
                results.append(fix)

        return results

    def _topological_sort(self, changes):
        """Sort changes so dependencies are edited first."""
        # types.py before models.py before serializers.py before tests.py
        priority = {
            "types": 0, "models": 1, "schemas": 2,
            "services": 3, "views": 4, "tests": 5,
        }

        def get_priority(change):
            path = change["file_path"].lower()
            for key, val in priority.items():
                if key in path:
                    return val
            return 3  # default middle priority

        return sorted(changes, key=get_priority)

    def _apply_single_change(self, change):
        ...

    def _check_consistency(self, results):
        ...

    def _resolve_inconsistency(self, issues, results):
        ...
```

**Strategy 2: Plan-All-Then-Apply**

```python
class PlanThenApplyEditor:
    """Generate all edits first, validate as a batch, then apply."""

    def apply_changes(self, task_description: str, repo_context: dict) -> list[dict]:
        """Plan all changes, validate together, then apply atomically."""

        # Phase 1: Generate complete change plan
        change_plan = self.llm.generate_plan(
            task=task_description,
            context=repo_context,
        )

        # Phase 2: Validate consistency across all changes
        validation = self._validate_plan(change_plan)
        if not validation.is_consistent:
            change_plan = self.llm.fix_plan(change_plan, validation.issues)

        # Phase 3: Apply all changes atomically
        applied = []
        try:
            for change in change_plan:
                self._apply_change(change)
                applied.append(change)

            # Phase 4: Run tests to verify
            test_result = self._run_tests()
            if not test_result.passed:
                self._rollback(applied)
                # Enter fix loop
                return self._fix_and_retry(change_plan, test_result)

        except Exception as e:
            self._rollback(applied)
            raise

        return applied

    def _validate_plan(self, plan):
        ...

    def _apply_change(self, change):
        ...

    def _run_tests(self):
        ...

    def _rollback(self, applied):
        ...

    def _fix_and_retry(self, plan, test_result):
        ...
```

### Consistency Checks

```python
class ConsistencyChecker:
    """Verify multi-file edit consistency."""

    def check_import_consistency(self, changed_files: dict[str, str]) -> list[str]:
        """Verify all imports resolve after changes."""
        issues = []
        for file_path, content in changed_files.items():
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    for alias in node.names:
                        symbol = alias.name
                        if not self._symbol_exists(module, symbol, changed_files):
                            issues.append(
                                f"{file_path}: imports '{symbol}' from '{module}' "
                                f"but symbol not found after changes"
                            )
        return issues

    def check_type_consistency(self, changed_files: dict[str, str]) -> list[str]:
        """Verify type annotations match across file boundaries."""
        issues = []
        # Extract all function signatures from changed files
        signatures = {}
        for file_path, content in changed_files.items():
            sigs = extract_function_signatures(content)
            for sig in sigs:
                signatures[f"{file_path}:{sig['name']}"] = sig

        # Check call sites match function signatures
        for file_path, content in changed_files.items():
            calls = self._extract_function_calls(content)
            for call in calls:
                if call["target"] in signatures:
                    sig = signatures[call["target"]]
                    if len(call["args"]) != len(sig["args"]):
                        issues.append(
                            f"{file_path}:{call['line']}: calls {call['target']} "
                            f"with {len(call['args'])} args but signature "
                            f"expects {len(sig['args'])}"
                        )
        return issues

    def _symbol_exists(self, module, symbol, changed_files):
        ...

    def _extract_function_calls(self, content):
        ...
```

---

## 10. Code Review Agents

### Automated Review Architecture

```
+------------------------------------------------------------------+
|              CODE REVIEW AGENT ARCHITECTURE                        |
+------------------------------------------------------------------+
|                                                                    |
|  PR Diff Input                                                    |
|      |                                                             |
|      v                                                             |
|  +-----------------------------------------------------------+   |
|  |  REVIEW PIPELINE                                            |   |
|  |                                                             |   |
|  |  Stage 1: Static Analysis (fast, deterministic)             |   |
|  |  +-----------------------------------------------------+   |   |
|  |  | - Lint (ESLint, Ruff, pylint)                        |   |   |
|  |  | - Type check (mypy, tsc)                             |   |   |
|  |  | - Format check (prettier, black)                     |   |   |
|  |  | - Security scan (Semgrep, Bandit)                    |   |   |
|  |  +-----------------------------------------------------+   |   |
|  |                    |                                        |   |
|  |                    v                                        |   |
|  |  Stage 2: LLM Review (slower, nuanced)                     |   |
|  |  +-----------------------------------------------------+   |   |
|  |  | - Logic correctness                                  |   |   |
|  |  | - Edge case analysis                                 |   |   |
|  |  | - Performance implications                           |   |   |
|  |  | - API design review                                  |   |   |
|  |  | - Test adequacy                                      |   |   |
|  |  +-----------------------------------------------------+   |   |
|  |                    |                                        |   |
|  |                    v                                        |   |
|  |  Stage 3: Contextual Review (requires repo understanding)   |   |
|  |  +-----------------------------------------------------+   |   |
|  |  | - Architectural consistency                          |   |   |
|  |  | - Pattern adherence (does this match existing code?) |   |   |
|  |  | - Impact analysis (what might break?)                |   |   |
|  |  | - Migration safety                                   |   |   |
|  |  +-----------------------------------------------------+   |   |
|  |                    |                                        |   |
|  |                    v                                        |   |
|  |  Stage 4: Aggregate & Prioritize                            |   |
|  |  +-----------------------------------------------------+   |   |
|  |  | - Deduplicate findings                               |   |   |
|  |  | - Assign severity (critical > high > medium > low)   |   |   |
|  |  | - Group by file                                      |   |   |
|  |  | - Generate summary                                   |   |   |
|  |  +-----------------------------------------------------+   |   |
|  +-----------------------------------------------------------+   |
|      |                                                             |
|      v                                                             |
|  PR Comments (inline + summary)                                   |
|                                                                    |
+------------------------------------------------------------------+
```

### Review Categories and Severity

```python
from enum import Enum


class ReviewSeverity(Enum):
    CRITICAL = "critical"   # Must fix before merge (security, data loss)
    HIGH = "high"           # Should fix before merge (bugs, regressions)
    MEDIUM = "medium"       # Should fix soon (code quality, performance)
    LOW = "low"             # Nice to have (style, naming, docs)
    NITPICK = "nitpick"     # Optional (personal preference)


class ReviewCategory(Enum):
    SECURITY = "security"
    BUG = "bug"
    PERFORMANCE = "performance"
    STYLE = "style"
    TEST = "test"
    DOCUMENTATION = "documentation"
    ARCHITECTURE = "architecture"
    ACCESSIBILITY = "accessibility"


# What each severity means in practice:
SEVERITY_ACTIONS = {
    ReviewSeverity.CRITICAL: "Block merge. Fix immediately.",
    ReviewSeverity.HIGH: "Block merge. Fix in this PR.",
    ReviewSeverity.MEDIUM: "Merge OK. Fix in follow-up PR.",
    ReviewSeverity.LOW: "Merge OK. Fix when convenient.",
    ReviewSeverity.NITPICK: "Merge OK. Author's choice.",
}
```

### Best Practice Checkers

```python
class BestPracticeChecker:
    """Check code against established best practices."""

    CHECKS = {
        "no_bare_except": {
            "pattern": r"except\s*:",
            "message": "Bare except catches all exceptions including SystemExit and KeyboardInterrupt",
            "severity": ReviewSeverity.HIGH,
            "fix": "Use 'except Exception:' or a more specific exception type",
        },
        "no_mutable_defaults": {
            "pattern": r"def\s+\w+\([^)]*=\s*(\[\]|\{\}|set\(\))",
            "message": "Mutable default argument -- shared across all calls",
            "severity": ReviewSeverity.HIGH,
            "fix": "Use None as default and create the mutable object inside the function",
        },
        "no_hardcoded_secrets": {
            "pattern": r'(password|secret|api_key|token)\s*=\s*["\'][^"\']+["\']',
            "message": "Possible hardcoded secret",
            "severity": ReviewSeverity.CRITICAL,
            "fix": "Use environment variables or a secrets manager",
        },
        "no_sql_string_format": {
            "pattern": r'(execute|query)\s*\(\s*f["\']|\.format\(',
            "message": "Possible SQL injection -- string formatting in query",
            "severity": ReviewSeverity.CRITICAL,
            "fix": "Use parameterized queries",
        },
    }

    def check(self, source: str) -> list[dict]:
        import re
        findings = []
        for name, check in self.CHECKS.items():
            for match in re.finditer(check["pattern"], source):
                line_num = source[:match.start()].count('\n') + 1
                findings.append({
                    "check": name,
                    "line": line_num,
                    "message": check["message"],
                    "severity": check["severity"],
                    "fix": check["fix"],
                })
        return findings
```

---

## 11. Test Generation

### Test Generation Strategies

```
+------------------------------------------------------------------+
|              TEST GENERATION APPROACHES                            |
+------------------------------------------------------------------+
|                                                                    |
|  1. EXAMPLE-BASED (most common)                                   |
|     - Look at existing tests in the repo                          |
|     - Match style, framework, patterns                            |
|     - Generate similar tests for new code                         |
|                                                                    |
|  2. SPECIFICATION-BASED                                           |
|     - Read docstrings, type hints, contracts                      |
|     - Generate tests covering the specification                   |
|     - Good for well-documented code                               |
|                                                                    |
|  3. MUTATION-BASED                                                |
|     - Generate mutants of the code                                |
|     - Generate tests that kill each mutant                        |
|     - Strongest test quality                                      |
|                                                                    |
|  4. COVERAGE-GUIDED                                               |
|     - Run existing tests, measure coverage                        |
|     - Generate tests for uncovered branches                       |
|     - Incremental improvement                                     |
|                                                                    |
|  5. PROPERTY-BASED                                                |
|     - Identify invariants from code analysis                      |
|     - Generate Hypothesis-style property tests                    |
|     - Finds edge cases humans miss                                |
|                                                                    |
+------------------------------------------------------------------+
```

### Implementing a Test Generator

````python
from dataclasses import dataclass


@dataclass(frozen=True)
class TestCase:
    name: str
    test_body: str
    setup: str
    teardown: str
    description: str


class TestGenerator:
    """Generate tests by analyzing source code and existing patterns."""

    def __init__(self, llm_client):
        self.llm = llm_client

    def generate_unit_tests(
        self,
        source_file: str,
        source_content: str,
        existing_tests: str | None = None,
        test_framework: str = "pytest",
    ) -> str:
        """Generate unit tests for a source file."""

        # Step 1: Analyze the source
        functions = self._extract_testable_functions(source_content)
        types = self._extract_types(source_content)
        imports = self._extract_imports(source_content)

        # Step 2: Analyze existing test patterns (if available)
        patterns = {}
        if existing_tests:
            patterns = self._analyze_test_patterns(existing_tests)

        # Step 3: Generate tests for each function
        prompt = f"""Generate {test_framework} tests for the following Python module.

Source file: {source_file}
```python
{source_content}
````

Functions to test: {[f['name'] for f in functions]}
Type information: {types}

{"Existing test patterns to follow:" if patterns else ""}
{patterns}

Requirements:

- Test happy path and edge cases
- Test error conditions (invalid inputs, boundary values)
- Use descriptive test names: test*<function>*<scenario>
- Include docstrings explaining what each test verifies
- Mock external dependencies
- Follow {test_framework} conventions
- Do NOT test private methods directly
  """

          return self.llm.generate(prompt)

      def generate_integration_tests(
          self,
          entry_point: str,
          dependency_graph: dict,
          api_schemas: dict,
      ) -> str:
          """Generate integration tests for API endpoints or service boundaries."""

          prompt = f"""Generate integration tests for:

Entry point: {entry_point}
Dependencies: {dependency_graph}
API schemas: {api_schemas}

Requirements:

- Test the integration between components (not unit-level)
- Use realistic test data
- Verify side effects (database writes, API calls)
- Test error propagation across boundaries
- Include setup/teardown for test fixtures
  """

          return self.llm.generate(prompt)

      def improve_coverage(
          self,
          source_content: str,
          existing_tests: str,
          coverage_report: dict,
      ) -> str:
          """Generate tests to fill coverage gaps."""

          uncovered_lines = coverage_report.get("uncovered_lines", [])
          uncovered_branches = coverage_report.get("uncovered_branches", [])

          prompt = f"""The following code has coverage gaps. Generate additional tests.

Source:

```python
{source_content}
```

Existing tests:

```python
{existing_tests}
```

Uncovered lines: {uncovered_lines}
Uncovered branches: {uncovered_branches}

Generate tests that specifically exercise the uncovered code paths.
Do NOT duplicate existing tests.
"""

        return self.llm.generate(prompt)

    def _extract_testable_functions(self, source):
        ...

    def _extract_types(self, source):
        ...

    def _extract_imports(self, source):
        ...

    def _analyze_test_patterns(self, test_source):
        ...

````

### Test-Driven Coding Agent

The most effective coding agents follow a TDD-like workflow:

```python
class TDDCodingAgent:
    """Agent that writes tests first, then implements to pass them."""

    def __init__(self, llm, sandbox, repo):
        self.llm = llm
        self.sandbox = sandbox
        self.repo = repo

    def solve_task(self, task_description: str) -> dict:
        """Solve a coding task using test-driven development."""

        # Phase 1: Understand the task
        plan = self.llm.plan(task_description, self.repo.get_context())

        # Phase 2: Write a failing test (RED)
        test_code = self.llm.generate_test(plan)
        self.repo.write_file(plan["test_file"], test_code)

        red_result = self.sandbox.execute(f"pytest {plan['test_file']} -x")
        if red_result.exit_code == 0:
            # Test passes without implementation -- test is wrong
            test_code = self.llm.fix_test(test_code, "Test should fail but passes")
            self.repo.write_file(plan["test_file"], test_code)

        # Phase 3: Write implementation (GREEN)
        for attempt in range(5):
            implementation = self.llm.implement(plan, test_code)
            self.repo.apply_changes(implementation)

            green_result = self.sandbox.execute(f"pytest {plan['test_file']} -x")
            if green_result.exit_code == 0:
                break

            # Fix implementation based on test failure
            plan = self.llm.revise(plan, green_result.stderr)

        # Phase 4: Refactor (IMPROVE)
        if green_result.exit_code == 0:
            refactored = self.llm.refactor(implementation)
            self.repo.apply_changes(refactored)

            # Verify tests still pass after refactor
            refactor_result = self.sandbox.execute(f"pytest {plan['test_file']} -x")
            if refactor_result.exit_code != 0:
                # Refactoring broke tests -- revert
                self.repo.apply_changes(implementation)

        # Phase 5: Run full test suite
        full_result = self.sandbox.execute("pytest --tb=short")

        return {
            "success": full_result.exit_code == 0,
            "implementation": implementation,
            "tests": test_code,
            "test_output": full_result.stdout,
        }
````

---

## 12. Agent-Computer Interface (ACI)

The Agent-Computer Interface is the set of tools and abstractions through which a
coding agent interacts with the computer. Good ACI design is one of the most impactful
and least understood aspects of building coding agents.

### ACI Design Principles

The term ACI was coined by the SWE-agent team, drawing an analogy to HCI (Human-Computer
Interface):

```
+------------------------------------------------------------------+
|              HCI vs ACI                                            |
+------------------------------------------------------------------+
|                                                                    |
|  HCI (Human-Computer Interface)                                   |
|  +-------------------+         +-------------------+              |
|  |  Human            |  GUI/   |  Computer          |              |
|  |  - Visual         |  CLI    |  - File system     |              |
|  |  - Spatial        |-------->|  - Processes       |              |
|  |  - Sequential     |         |  - Network         |              |
|  |  - Error-tolerant |  <------|  - Memory          |              |
|  +-------------------+         +-------------------+              |
|                                                                    |
|  ACI (Agent-Computer Interface)                                   |
|  +-------------------+         +-------------------+              |
|  |  LLM Agent        |  Tools  |  Computer          |              |
|  |  - Text-based     |  (API)  |  - File system     |              |
|  |  - Token-limited  |-------->|  - Processes       |              |
|  |  - No visual      |         |  - Network         |              |
|  |  - Fragile to     |  <------|  - Memory          |              |
|  |    ambiguity      |         |                    |              |
|  +-------------------+         +-------------------+              |
|                                                                    |
|  Key difference: agents cannot "see" a screen or "scroll"         |
|  through a file. Every interaction must be explicit text I/O.     |
|                                                                    |
+------------------------------------------------------------------+
```

### Core ACI Design Principles

**1. Concise Output**

```python
# BAD: Returns entire file (wastes tokens, confuses agent)
def read_file_bad(path: str) -> str:
    """Read a file and return all contents."""
    with open(path) as f:
        return f.read()  # Could be 10K lines!


# GOOD: Returns windowed view with line numbers
def read_file_good(path: str, offset: int = 0, limit: int = 200) -> str:
    """Read a file with pagination and line numbers."""
    with open(path) as f:
        lines = f.readlines()

    total = len(lines)
    window = lines[offset:offset + limit]
    numbered = [f"{i + offset + 1:>6}\t{line}" for i, line in enumerate(window)]

    header = f"File: {path} ({total} lines, showing {offset+1}-{min(offset+limit, total)})"
    return header + "\n" + "".join(numbered)
```

**2. Error Messages That Guide Recovery**

```python
# BAD: Unhelpful error
def edit_file_bad(path: str, old: str, new: str) -> str:
    content = open(path).read()
    if old not in content:
        return "Error: text not found"  # Agent has no idea why


# GOOD: Error with context to help the agent fix the problem
def edit_file_good(path: str, old: str, new: str) -> str:
    content = open(path).read()
    if old not in content:
        # Show what the file actually contains near where the edit was intended
        import difflib
        close_matches = difflib.get_close_matches(
            old[:50], content.split('\n'), n=3, cutoff=0.4
        )
        return (
            f"Error: exact text not found in {path}.\n"
            f"The old_string must match the file content exactly.\n"
            f"Similar lines found:\n"
            + "\n".join(f"  {m}" for m in close_matches)
        )
    if content.count(old) > 1:
        locations = []
        start = 0
        while True:
            idx = content.find(old, start)
            if idx == -1:
                break
            line_num = content[:idx].count('\n') + 1
            locations.append(f"  line {line_num}")
            start = idx + 1
        return (
            f"Error: old_string matches {content.count(old)} locations in {path}:\n"
            + "\n".join(locations) + "\n"
            "Provide more surrounding context to make the match unique."
        )
    return content.replace(old, new, 1)
```

**3. Tool Granularity**

```python
# BAD: One mega-tool that does everything
def file_tool(action: str, path: str, **kwargs) -> str:
    """Do file operations. Action: read|write|edit|delete|list|search"""
    if action == "read": ...
    elif action == "write": ...
    # Agent must remember the action parameter format


# GOOD: Separate, focused tools with clear names
def read_file(path: str, offset: int = 0, limit: int = 200) -> str:
    """Read lines from a file with pagination."""
    ...

def edit_file(path: str, old_string: str, new_string: str) -> str:
    """Replace old_string with new_string in file. old_string must be unique."""
    ...

def write_file(path: str, content: str) -> str:
    """Create a new file or completely overwrite an existing file."""
    ...

def search_files(pattern: str, path: str = ".", glob: str = "*") -> str:
    """Search for a regex pattern in files. Returns matching lines with context."""
    ...

def list_directory(path: str = ".") -> str:
    """List files and directories at the given path."""
    ...
```

### SWE-agent ACI vs Claude Code ACI

```
+------------------------------------------------------------------+
|           ACI COMPARISON: SWE-agent vs Claude Code                |
+------------------------------------------------------------------+
|                                                                    |
| SWE-agent ACI                    Claude Code ACI                  |
| +--------------------------+     +--------------------------+     |
| | Tools:                   |     | Tools:                   |     |
| | - open (file viewer)     |     | - Read                   |     |
| | - goto (line number)     |     | - Edit (search/replace)  |     |
| | - scroll_up/down         |     | - Write                  |     |
| | - search_file            |     | - Glob (file search)     |     |
| | - search_dir             |     | - Grep (content search)  |     |
| | - find_file              |     | - Bash (terminal)        |     |
| | - edit (line range)      |     | - Sub-agents (Task)      |     |
| | - create                 |     | - MCP tools              |     |
| | - submit                 |     | - NotebookEdit           |     |
| +--------------------------+     +--------------------------+     |
| | Window: 100 lines visible|     | Window: full file or      |     |
| | Must scroll to see more  |     |   paginated with offset   |     |
| |                          |     |                           |     |
| | Edit: by line number     |     | Edit: by exact text match |     |
| |   "edit 15:20"           |     |   "replace X with Y"     |     |
| |                          |     |                           |     |
| | Metaphor: text editor    |     | Metaphor: developer CLI  |     |
| +--------------------------+     +--------------------------+     |
|                                                                    |
| Key insight: Claude Code's search/replace avoids the              |
| line-number accuracy problem that plagues diff-based approaches.  |
|                                                                    |
+------------------------------------------------------------------+
```

### Designing Tools for Coding Agents

```python
class CodingAgentToolkit:
    """A well-designed tool suite for a coding agent.

    Design principles applied:
    1. Each tool does one thing well
    2. Output is concise and structured
    3. Errors guide recovery
    4. Tools compose naturally
    """

    def glob_search(self, pattern: str, path: str = ".") -> str:
        """Find files matching a glob pattern.

        Returns file paths sorted by modification time.
        Use this to discover project structure and find files by name.
        """
        ...

    def grep_search(
        self, pattern: str, path: str = ".", glob_filter: str = "*",
        context_lines: int = 2, max_results: int = 20,
    ) -> str:
        """Search file contents for a regex pattern.

        Returns matching lines with surrounding context.
        Use this to find where specific code, strings, or patterns appear.
        """
        ...

    def read_file(
        self, file_path: str, offset: int = 0, limit: int = 200,
    ) -> str:
        """Read a file with line numbers. Supports pagination for large files.

        Start with no offset/limit to see the whole file (up to 2000 lines).
        For larger files, use offset and limit to paginate.
        """
        ...

    def edit_file(self, file_path: str, old_string: str, new_string: str) -> str:
        """Replace old_string with new_string in the file.

        Rules:
        - old_string must appear exactly once in the file
        - Include enough context in old_string to make it unique
        - Preserve indentation exactly
        """
        ...

    def bash(self, command: str, timeout: int = 120) -> str:
        """Execute a bash command and return stdout + stderr.

        Use for: running tests, installing packages, git operations,
        build commands, or any system command.

        Working directory persists between calls.
        Commands that modify state (cd) do not persist.
        """
        ...

    def write_file(self, file_path: str, content: str) -> str:
        """Create a new file or completely replace an existing file.

        Prefer edit_file for modifying existing files.
        Use write_file only for new files or complete rewrites.
        """
        ...
```

### The Impact of ACI on Performance

Research from the SWE-agent paper shows ACI design has massive impact:

```
+------------------------------------------------------------------+
|           ACI DESIGN IMPACT ON SWE-BENCH                          |
+------------------------------------------------------------------+
|                                                                    |
|  Same model (Claude 3.5 Sonnet), different ACI:                  |
|                                                                    |
|  Bare terminal (just bash)        : ~15% resolve rate             |
|  SWE-agent ACI (custom tools)     : ~35% resolve rate             |
|  Full agentic ACI (search+edit    : ~55% resolve rate             |
|    +test+debug loop)                                              |
|                                                                    |
|  The ACI is worth 2-3x performance for the same model!           |
|                                                                    |
|  Most impactful ACI decisions:                                    |
|  1. Search/replace vs line-number edits (+10% resolve)            |
|  2. Structured search tools vs raw grep (+8% resolve)             |
|  3. Paginated file view vs dump-everything (+5% resolve)          |
|  4. Error messages with context vs bare errors (+7% resolve)      |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 13. Common Interview Questions

### Q1: "Design a coding agent that can resolve GitHub issues."

**Model Answer:**

The system needs four major components: localization, planning, editing, and validation.

```
+------------------------------------------------------------------+
|  GITHUB ISSUE RESOLUTION AGENT                                    |
+------------------------------------------------------------------+
|                                                                    |
|  Input: Issue text + Repository snapshot                          |
|                                                                    |
|  Phase 1: LOCALIZE                                                |
|  - Parse issue for keywords, symbols, file paths, error messages  |
|  - Multi-strategy search: grep, semantic, AST symbol search       |
|  - Rank candidate files by relevance                              |
|  - Read top candidates to confirm relevance                       |
|                                                                    |
|  Phase 2: PLAN                                                    |
|  - Analyze the issue root cause from relevant code                |
|  - Determine which files need changes                             |
|  - Plan the change sequence (types -> impl -> tests)              |
|  - Identify test files to run                                     |
|                                                                    |
|  Phase 3: EDIT                                                    |
|  - Apply search/replace edits to each file                        |
|  - Use dependency order (edit interfaces before implementations)  |
|  - Keep edits minimal and focused                                 |
|                                                                    |
|  Phase 4: VALIDATE                                                |
|  - Run the failing test(s) mentioned in the issue                 |
|  - Run the broader test suite to check for regressions            |
|  - If tests fail: analyze error, revise plan, re-edit (loop)      |
|  - If tests pass: generate PR with summary                        |
|                                                                    |
|  Key design decisions:                                            |
|  - Max 5 edit-test-debug iterations (cost control)                |
|  - Sandbox execution for all test runs                            |
|  - Context budget: reserve 30% for reasoning/output               |
|  - Fallback: if stuck, return best partial fix + explanation      |
|                                                                    |
+------------------------------------------------------------------+
```

---

### Q2: "Why does SWE-bench measure agentic vs single-pass approaches so differently?"

**Model Answer:**

The gap comes from three factors:

1. **Localization accuracy.** Single-pass approaches must find the right file on the first try. Agentic approaches can iteratively search, read files, and narrow down.

2. **Self-correction via test feedback.** When a patch is wrong, an agentic system can run tests, observe the error, and fix it. A single-pass system submits and hopes. On SWE-bench, roughly 40% of initially-generated patches need at least one fix iteration.

3. **Context assembly.** Real issues often require reading multiple files to understand the codebase conventions, types, and constraints. An agent can dynamically fetch context as needed rather than guessing which files to include upfront.

The practical implication: for any production coding agent, the edit-test-debug loop is not optional -- it is the primary source of performance.

---

### Q3: "How would you design the tool interface for a coding agent?"

**Model Answer:**

I would follow ACI design principles from the SWE-agent research:

1. **Separate search from read.** A `grep` tool for finding things, a `read` tool for reading them. Do not dump entire files into search results.

2. **Search-and-replace for edits.** Avoid line-number-based edits because LLMs frequently get line numbers wrong. Instead, use exact text matching: "find this exact string, replace with that string."

3. **Structured error output.** When an edit fails, tell the agent _why_ (duplicate match? text not found? here is what the file actually contains near that location).

4. **Paginated file reading.** Large files should be read in windows (e.g., 200 lines at a time) with line numbers, not dumped entirely.

5. **Bash for everything else.** A general `bash` tool handles test execution, git, package management, and anything not worth a specialized tool.

6. **Minimize tool count.** 5-8 well-designed tools outperform 20 narrow tools. Fewer tools means the model spends less time deciding which tool to use.

---

### Q4: "How do you prevent a coding agent from introducing security vulnerabilities?"

**Model Answer:**

Defense in depth with multiple layers:

- **Static analysis in the loop.** Run security linters (Semgrep, Bandit) after each edit. If they find issues, feed the findings back to the agent for fixing.
- **Sandbox execution.** All generated code runs in isolated containers with no network access and limited file system scope.
- **Permission gates.** Destructive operations (file deletion, git push, network access) require explicit human approval.
- **Code review agent.** A separate LLM pass specifically checking for security anti-patterns (hardcoded secrets, SQL injection, command injection, path traversal).
- **Diff review before merge.** Human reviews the final diff. The agent is a draft author, not the final approver.
- **Test suite as guard.** Existing security tests catch regressions.

---

### Q5: "How would you evaluate a coding agent's performance?"

**Model Answer:**

Multi-level evaluation:

| Level                     | Metric                               | How to Measure                             |
| ------------------------- | ------------------------------------ | ------------------------------------------ |
| **Task completion**       | % of tasks solved correctly          | SWE-bench, internal benchmarks             |
| **Localization accuracy** | Does the agent find the right files? | Compare agent's file selection to gold set |
| **Edit quality**          | Are edits minimal and correct?       | Diff size vs gold patch, manual review     |
| **Test pass rate**        | Do generated patches pass tests?     | Run existing + new tests                   |
| **Iteration efficiency**  | How many attempts to solve?          | Count edit-test cycles                     |
| **Cost efficiency**       | Tokens per task solved               | Track API costs per resolution             |
| **Safety**                | No regressions introduced?           | Full test suite pass rate                  |
| **Latency**               | Time to resolution                   | Wall clock time per task                   |

Beyond benchmarks, I would run the agent on the team's real issue backlog (with human review) and track acceptance rate of generated patches.

---

### Q6: "Explain the difference between Cursor, Claude Code, and Devin."

**Model Answer:**

They represent three distinct architectural approaches to coding agents:

**Cursor** is an IDE-first approach (a VSCode fork). The agent lives inside your editor. Strengths: inline diffs, tab completion, visual context from open files. The model sees what you see. Trade-off: tied to the IDE, single-developer workflow.

**Claude Code** is a terminal-first approach. It runs in your shell alongside your normal development tools. Strengths: full terminal access (git, make, npm, any CLI), works in any project regardless of IDE, supports sub-agents for parallel work. Trade-off: no visual UI for diffs (text-based), requires comfort with terminal.

**Devin** is a cloud-first approach. It runs in a remote sandbox with its own browser, editor, and terminal. Strengths: fully autonomous (you give it a task and come back later), can handle long-running tasks. Trade-off: slower feedback loop, less interactive, harder to steer mid-task.

The key architectural trade-off is **interactivity vs. autonomy**: Cursor is most interactive, Devin is most autonomous, Claude Code is in between.

---

### Q7: "How do coding agents handle large repositories that don't fit in context?"

**Model Answer:**

Large repo strategies form a hierarchy:

1. **Repo map.** Generate a compressed overview: directory structure, file summaries, key symbols. This fits in a few thousand tokens and gives the agent a "table of contents."

2. **Iterative search.** The agent searches in rounds: broad keyword search first, then read the top candidates, then narrower searches based on what it learned. Each search returns only the relevant snippets, not full files.

3. **Dependency-guided expansion.** When the agent reads a file, it identifies imports and follows them to understand related code. This builds context on-demand rather than loading everything upfront.

4. **Chunked file reading.** Files are read in 200-line windows. The agent requests specific ranges rather than loading a 5000-line file.

5. **Context pruning.** As the conversation grows, older search results and fully-understood files can be summarized or dropped from context to make room for new information.

6. **Sub-agents.** For very large tasks, spawn sub-agents that each handle a subset of the work in their own context window, then merge results.

The key insight is that repo-level coding is fundamentally a search and context management problem, not just a code generation problem.

---

### Q8: "How do you ensure multi-file edits are consistent?"

**Model Answer:**

Three levels of consistency checking:

1. **Syntactic.** After all edits, parse every changed file. If any file has syntax errors, the agent must fix them before proceeding.

2. **Semantic.** Check imports resolve, type signatures match across boundaries, and function call sites are consistent with definitions. This can use lightweight AST analysis or the language server.

3. **Behavioral.** Run the test suite. Tests are the ultimate consistency check -- if tests pass, the changes are consistent at the behavioral level.

The editing strategy also matters: edit files in dependency order (types first, then interfaces, then implementations, then tests). This reduces cascading inconsistencies.

---

### Q9: "What is the Agent-Computer Interface (ACI) and why does it matter?"

**Model Answer:**

ACI is the set of tools, output formats, and interaction patterns through which an agent interacts with a computer -- analogous to how HCI (Human-Computer Interface) is the set of screens, buttons, and interaction patterns through which humans interact with computers.

It matters because the same model can perform 2-3x better or worse depending on the ACI design. The SWE-agent paper demonstrated this empirically: swapping from raw bash to a custom ACI with structured file viewing, search-and-replace editing, and paginated output nearly doubled the solve rate on SWE-bench with the same underlying model.

Key ACI design principles: concise output (do not flood the context window), informative errors (tell the agent how to fix the problem, not just that it failed), appropriate granularity (few focused tools, not many narrow ones), and text-native interaction (agents cannot scroll or click, so every operation must be explicit).

---

### Q10: "Walk me through how a coding agent resolves a bug from issue to PR."

**Model Answer (trace through a concrete example):**

Issue: "UserSerializer.validate_email returns True for invalid emails like 'notanemail'"

```
Step 1: SEARCH
> grep "UserSerializer" --type py
  src/serializers/user.py:15  class UserSerializer:
  tests/test_serializers.py:8  class TestUserSerializer:

> grep "validate_email" --type py
  src/serializers/user.py:42  def validate_email(self, value):
  tests/test_serializers.py:25  def test_validate_email(self):

Step 2: READ relevant files
> read src/serializers/user.py (lines 38-55)
  42:     def validate_email(self, value):
  43:         return True  # BUG: no actual validation!

> read tests/test_serializers.py (lines 20-35)
  25:     def test_validate_email(self):
  26:         assert self.serializer.validate_email("test@example.com")
  # Only tests valid case, not invalid case

Step 3: PLAN
- Fix validate_email to actually check email format
- Add test for invalid email addresses
- Run tests to verify

Step 4: EDIT source
> edit src/serializers/user.py
  old: "return True  # BUG: no actual validation!"
  new: (regex validation that checks for @ and domain)

Step 5: EDIT tests
> edit tests/test_serializers.py
  Add: test_validate_email_rejects_invalid
  Add: test_validate_email_rejects_empty_string

Step 6: RUN TESTS
> bash "pytest tests/test_serializers.py -v"
  PASSED test_validate_email
  PASSED test_validate_email_rejects_invalid
  PASSED test_validate_email_rejects_empty_string

> bash "pytest --tb=short"  (full suite)
  142 passed, 0 failed

Step 7: CREATE PR
> git add, commit, push, create PR with summary
```

---

## 14. Quick Reference

### Coding Agent Architecture Template

```
+------------------------------------------------------------------+
|              CODING AGENT REFERENCE ARCHITECTURE                  |
+------------------------------------------------------------------+
|                                                                    |
|  INPUT: Task description (issue, feature request, bug report)     |
|                                                                    |
|  +-----------------------------------------------------------+   |
|  |                    AGENT LOOP                               |   |
|  |                                                             |   |
|  |  +--------+    +--------+    +--------+    +--------+      |   |
|  |  |LOCALIZE|--->| PLAN   |--->| EDIT   |--->|VALIDATE|      |   |
|  |  |        |    |        |    |        |    |        |      |   |
|  |  |Search  |    |Analyze |    |Apply   |    |Run     |      |   |
|  |  |Read    |    |Decide  |    |changes |    |tests   |      |   |
|  |  |Explore |    |Order   |    |        |    |Check   |      |   |
|  |  +--------+    +--------+    +--------+    +---+----+      |   |
|  |                                                |            |   |
|  |                              +-------+---------+            |   |
|  |                              |                 |            |   |
|  |                           PASS              FAIL            |   |
|  |                              |                 |            |   |
|  |                              v                 v            |   |
|  |                          SUBMIT          DIAGNOSE           |   |
|  |                                          + loop back        |   |
|  +-----------------------------------------------------------+   |
|                                                                    |
|  TOOLS:                                                           |
|  - File search (glob, grep, semantic)                             |
|  - File read (paginated, with line numbers)                       |
|  - File edit (search-and-replace)                                 |
|  - File write (new files)                                         |
|  - Bash (terminal commands, test execution)                       |
|  - (Optional) LSP, AST parser, git operations                    |
|                                                                    |
|  SANDBOX: Container isolation for code execution                  |
|  CONTEXT MANAGEMENT: Paginate, summarize, prune                   |
|  GUARD RAILS: Permission gates, cost limits, timeout              |
|                                                                    |
+------------------------------------------------------------------+
```

### Key Metrics Comparison

| Metric                | Single-Pass | Agentic (basic) | Agentic (full) |
| --------------------- | ----------- | --------------- | -------------- |
| SWE-bench Verified    | ~25-35%     | ~45-55%         | ~65-72%        |
| Avg attempts per task | 1           | 3-5             | 5-10           |
| Tokens per task       | ~10K        | ~50K            | ~150K          |
| Cost per task         | ~$0.05      | ~$0.30          | ~$1.50         |
| Latency               | 10-30s      | 2-5 min         | 5-15 min       |

### ACI Design Cheat Sheet

| Principle      | Do                                        | Do Not                  |
| -------------- | ----------------------------------------- | ----------------------- |
| Output length  | Return relevant snippets with context     | Dump entire files       |
| Error messages | Explain what went wrong and how to fix    | Return bare error codes |
| Edit format    | Search-and-replace (exact text match)     | Line-number-based edits |
| File reading   | Paginate with line numbers                | Load everything at once |
| Tool count     | 5-8 focused tools                         | 20+ narrow tools        |
| Search         | Multi-strategy (keyword + semantic + AST) | Single grep             |

### Code Generation Pattern Decision Tree

```
Should I use...

Search/Replace?
  - Editing existing files: YES (default choice)
  - Small, targeted changes: YES
  - Large files: YES

Full File Rewrite?
  - Creating new files: YES
  - File < 100 lines and mostly changing: YES
  - File > 500 lines: NO

Unified Diff?
  - Interfacing with git tooling: YES
  - LLM generating the diff: AVOID (error-prone)
  - Applying human-written patches: YES

AST Transform?
  - Mechanical refactoring (rename, extract): YES
  - Semantic changes requiring understanding: NO
  - Preserving comments/formatting matters: NO (AST loses them)
```

### Interview Preparation Checklist

- [ ] Can explain the evolution from autocomplete to autonomous SWE agents
- [ ] Can describe SWE-bench methodology and why agentic > single-pass
- [ ] Can design a multi-strategy file localization system
- [ ] Can compare search/replace, diff, and rewrite edit patterns with trade-offs
- [ ] Can explain ACI design principles and their performance impact
- [ ] Can describe sandbox architectures and security considerations
- [ ] Can design a PR review agent pipeline
- [ ] Can explain multi-file edit consistency challenges and solutions
- [ ] Can compare Claude Code, Cursor, Copilot, and Devin architectures
- [ ] Can design a test generation system that follows repo conventions
- [ ] Can articulate how coding agents handle repos that exceed context window
- [ ] Can walk through a complete issue-to-PR trace for a coding agent

---

_This guide covers the core knowledge needed for coding agent / SWE agent interviews. The field moves extremely fast -- stay current with SWE-bench leaderboards, new tool releases, and ACI research. The fundamental principles (edit-test-debug loops, ACI design, sandbox execution, multi-strategy search) remain stable even as specific products and benchmarks evolve._
