# 11 -- Real-World Agent Case Studies

## Table of Contents

1. [Claude Code (Anthropic)](#1-claude-code-anthropic)
2. [Devin (Cognition)](#2-devin-cognition)
3. [ChatGPT Deep Research (OpenAI)](#3-chatgpt-deep-research-openai)
4. [GitHub Copilot Workspace](#4-github-copilot-workspace)
5. [Cursor / Windsurf](#5-cursor--windsurf)
6. [Customer Support Agents](#6-customer-support-agents)
7. [Data Analysis Agents](#7-data-analysis-agents)
8. [Workflow Automation Agents](#8-workflow-automation-agents)
9. [Browser Automation Agents](#9-browser-automation-agents)
10. [Lessons Learned](#10-lessons-learned)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Quick Reference](#12-quick-reference)

---

## 1. Claude Code (Anthropic)

### What It Is

Claude Code is a CLI-based agentic coding assistant that operates directly in your terminal. It reads your codebase, executes shell commands, edits files, and orchestrates sub-agents -- all through a tool-use loop driven by Claude. Unlike IDE-embedded agents, it operates at the repository level and treats the entire filesystem + shell as its workspace.

### Architecture

```
+------------------------------------------------------------------+
|                         CLAUDE CODE CLI                           |
+------------------------------------------------------------------+
|                                                                    |
|  +-----------+     +-------------+     +------------------------+ |
|  |  User     |---->|  Main Agent |---->|  Tool Dispatcher       | |
|  |  Prompt   |     |  (Claude)   |     |  (Router)              | |
|  +-----------+     +------+------+     +----------+-------------+ |
|                           |                       |                |
|                           v                       v                |
|                    +------+------+    +-----------+-----------+   |
|                    | Conversation |    |    Tool Implementations | |
|                    | History      |    |                         | |
|                    | + Context    |    |  +---+ +---+ +------+  | |
|                    | Manager      |    |  |Bash| |Read| |Edit |  | |
|                    +--------------+    |  +---+ +---+ +------+  | |
|                                        |  +---+ +----+ +-----+ | |
|                                        |  |Glob| |Grep| |Write| | |
|                                        |  +---+ +----+ +-----+ | |
|                                        |  +-------+ +--------+ | |
|                                        |  |WebFetch| |TodoWrite|| |
|                                        |  +-------+ +--------+ | |
|                                        +----------+------------+ |
|                                                   |               |
|  +-------------------+     +----------------------+              |
|  | Sub-Agent (Task)  |     | MCP Server Registry  |              |
|  | - Own context      |     | - Context7 docs      |              |
|  | - Own tool access  |     | - GitHub API         |              |
|  | - Reports back     |     | - Custom servers     |              |
|  +-------------------+     +----------------------+              |
|                                                                    |
+------------------------------------------------------------------+
|                     Operating System Layer                         |
|  [Filesystem]  [Shell/Bash]  [Git]  [Network]  [Sandbox]         |
+------------------------------------------------------------------+
```

### The Tool Loop

The core execution model is a **single-turn tool-use loop**:

```
while not done:
    response = claude.send(conversation_history)

    if response.has_tool_calls:
        results = execute_tools(response.tool_calls)  # parallel when independent
        conversation_history.append(assistant_message)
        conversation_history.append(tool_results)
    else:
        display(response.text)
        done = True
```

Key properties of this loop:

- **Unbounded iterations**: The agent keeps looping until it decides to emit a final text response. There is no hard cap on turns -- a complex task might take 50+ tool calls.
- **Parallel tool execution**: Independent tool calls within a single response are executed concurrently. The model signals this by emitting multiple tool-use blocks.
- **Conversation history as state**: The full conversation (user messages, assistant messages, tool results) is the agent's working memory.

### File Operations

Claude Code exposes a tiered set of file tools, each optimized for a specific access pattern:

| Tool    | Purpose                              | Why Not Just Bash?                                          |
| ------- | ------------------------------------ | ----------------------------------------------------------- |
| `Read`  | Read file contents with line numbers | Handles images, PDFs, notebooks; enforced before edits      |
| `Edit`  | String-replace in files              | Atomic, validates uniqueness, prevents partial corruptions  |
| `Write` | Create/overwrite entire files        | Requires prior Read for existing files (safety check)       |
| `Glob`  | Find files by pattern                | Faster than `find`, sorted by mtime                         |
| `Grep`  | Search file contents                 | Optimized permissions, ripgrep-based, multiple output modes |

The safety invariants are deliberate:

1. You must `Read` a file before you can `Edit` or `Write` it. This prevents blind overwrites.
2. `Edit` requires `old_string` to be unique in the file. This forces precise, surgical edits rather than ambiguous replacements.
3. `Write` is discouraged for existing files -- `Edit` is preferred because it sends only the diff.

### Bash Execution

The `Bash` tool is the escape hatch -- it can do anything the OS can do. But it comes with guardrails:

- **No persistent shell state**: Each invocation starts fresh. Environment variables and `cd` do not carry over.
- **Working directory persists**: The CWD is tracked between calls, but shell state (aliases, exports) resets.
- **Timeout enforcement**: Default 2 minutes, max 10 minutes. Long-running commands use `run_in_background`.
- **Dangerous command awareness**: The system prompt explicitly warns against destructive git operations (`reset --hard`, `push --force`) without user consent.

### Context Management

Context window management is the single hardest engineering problem in Claude Code:

```
+------------------------------------------------------------------+
|                    CONTEXT WINDOW (200K tokens)                    |
|                                                                    |
|  [System Prompt]  ~2-5K tokens (fixed)                           |
|  [CLAUDE.md]      ~1-3K tokens (fixed)                           |
|  [User Rules]     ~1-2K tokens (fixed)                           |
|  [Conversation]   Variable -- grows with each turn               |
|  [Tool Results]   Variable -- file contents, command output       |
|  [Git Status]     Snapshot at session start                       |
|                                                                    |
|  DANGER ZONE: Last 20% -- degraded attention ─────────────────>  |
+------------------------------------------------------------------+
```

Strategies used:

- **Read with offset/limit**: Large files are read in chunks rather than all at once.
- **Grep before Read**: Find the relevant file first, then read only what matters.
- **Tool result truncation**: Long bash outputs are bounded.
- **TodoWrite for tracking**: Offloads task state into a structured list rather than relying on the model to remember everything from earlier in the conversation.
- **Sub-agent delegation**: Complex sub-tasks are handed to a fresh agent with its own context window, which reports back a summary.

### Multi-Agent Delegation

Claude Code supports spawning sub-agents for parallel or isolated work:

```
Main Agent (orchestrator)
    |
    +-- Task Agent: "Analyze security of auth.ts"
    |       - Gets own context window
    |       - Has access to same tools
    |       - Returns summary to main agent
    |
    +-- Task Agent: "Run tests and report failures"
    |       - Isolated execution
    |       - Only relevant results bubble up
    |
    +-- Task Agent: "Review PR #42"
            - Can use gh CLI
            - Returns structured review
```

This is a **supervisor-worker** pattern where the main agent decides when delegation is appropriate. The key insight: sub-agents get fresh context windows, so they can deeply explore a sub-problem without polluting the main agent's context.

### MCP Integration

The Model Context Protocol (MCP) extends Claude Code's capabilities through external servers:

```
Claude Code <--JSON-RPC--> MCP Server: Context7 (documentation lookup)
Claude Code <--JSON-RPC--> MCP Server: GitHub (authenticated API access)
Claude Code <--JSON-RPC--> MCP Server: Custom (company-specific tools)
```

MCP matters because it separates **tool implementation** from **tool invocation**. The agent sees a tool schema and calls it. The MCP server handles authentication, rate limiting, caching, and the actual API calls. This is the same separation-of-concerns pattern as microservices.

### Key Design Decisions

1. **CLI, not IDE**: Operates at the OS level. Can work with any editor, any language, any toolchain. Trade-off: no visual affordances (no inline diffs, no syntax highlighting in the agent itself).
2. **Conversation-as-state**: No external database for agent state. The conversation history IS the state. Simple but means long sessions accumulate context debt.
3. **Safety-first file editing**: The Read-before-Edit invariant prevents a large class of bugs where the model hallucinates file contents.
4. **Hooks system**: Pre/post tool-use hooks allow users to inject custom behavior (auto-format after edit, block certain operations, audit logging) without modifying the agent itself.

### What Makes It Work

- The tool set is small and orthogonal. Each tool does one thing well.
- The model is powerful enough to plan multi-step operations and self-correct.
- The safety invariants (Read before Edit, unique string matching) prevent the most common failure modes of file-editing agents.
- Sub-agent delegation prevents context window exhaustion on complex tasks.

### Trade-offs

| Strength                         | Weakness                                   |
| -------------------------------- | ------------------------------------------ |
| Full OS access via Bash          | Can execute destructive commands           |
| Language/framework agnostic      | No deep IDE integration (hover, go-to-def) |
| Fresh context per sub-agent      | Overhead of re-establishing context        |
| Conversation-as-state simplicity | Long sessions degrade performance          |
| MCP extensibility                | MCP ecosystem still maturing               |

### What I Would Do Differently

- **Persistent structured state**: Beyond conversation history, maintain a structured project model (file tree, dependency graph, recent test results) that persists across sessions.
- **Speculative execution**: For common patterns (edit file then run tests), speculatively start the test run while still editing, and abort if the edit changes.
- **Progressive context summarization**: Automatically compress old conversation turns instead of carrying full verbatim history.

---

## 2. Devin (Cognition)

### What It Is

Devin is a fully autonomous software engineering agent. Unlike IDE-integrated tools, Devin operates in a complete sandboxed development environment with browser, terminal, code editor, and planner -- mimicking how a human developer works across multiple applications simultaneously.

### Architecture

```
+------------------------------------------------------------------+
|                         DEVIN AGENT                               |
+------------------------------------------------------------------+
|                                                                    |
|  +--------------------+                                           |
|  |  Planner / Manager |                                           |
|  |  (High-Level LLM)  |                                           |
|  +--------+-----------+                                           |
|           |                                                        |
|           v                                                        |
|  +--------+-----------+                                           |
|  |  Task Decomposer   |                                           |
|  |  - Break into steps |                                           |
|  |  - Track progress   |                                           |
|  |  - Re-plan on fail  |                                           |
|  +--------+-----------+                                           |
|           |                                                        |
|           v                                                        |
|  +--------+------------------------------------------------+     |
|  |              Execution Environment (Sandboxed VM)        |     |
|  |                                                          |     |
|  |  +----------+  +-----------+  +----------+  +---------+ |     |
|  |  | Terminal  |  | Code      |  | Browser  |  | Planner | |     |
|  |  | (shell)   |  | Editor    |  | (Chrome) |  | (UI)    | |     |
|  |  |           |  |           |  |           |  |         | |     |
|  |  | - git     |  | - open    |  | - search |  | - tasks | |     |
|  |  | - npm     |  | - edit    |  | - read   |  | - deps  | |     |
|  |  | - python  |  | - navigate|  | - docs   |  | - notes | |     |
|  |  | - curl    |  | - diff    |  | - debug  |  | - plan  | |     |
|  |  +----------+  +-----------+  +----------+  +---------+ |     |
|  |                                                          |     |
|  +----------------------------------------------------------+     |
|                                                                    |
|  +--------------------+    +--------------------+                 |
|  | Snapshot & Rollback |    | Human Interaction  |                 |
|  | - VM state saves    |    | - Chat interface   |                 |
|  | - Git checkpoints   |    | - Approve/reject   |                 |
|  | - Retry from save   |    | - Redirect tasks   |                 |
|  +--------------------+    +--------------------+                 |
+------------------------------------------------------------------+
```

### Key Design Decisions

**1. Full VM Sandbox**

Devin runs inside a sandboxed virtual machine, not a container or a subprocess. This gives it:

- Persistent filesystem state across the entire session
- Real browser with rendered DOM (not headless HTML scraping)
- Ability to install packages, run servers, open ports
- Isolation from the user's machine (safe to experiment)

**2. Multi-Application Interaction**

Unlike agents that only have a terminal, Devin can:

- Read documentation in the browser, then write code in the editor
- Run a dev server in the terminal, test it in the browser, fix errors in the editor
- Google error messages, read Stack Overflow, apply solutions

This multi-modal workspace mirrors human developer behavior and is critical for tasks that require external information.

**3. Planning as a First-Class Feature**

Devin maintains a visible, editable plan:

```
Plan: Implement user authentication
  [x] 1. Research auth libraries (JWT vs session-based)
  [x] 2. Install dependencies (bcrypt, jsonwebtoken)
  [ ] 3. Create User model with password hashing
  [ ] 4. Implement /register endpoint
  [ ] 5. Implement /login endpoint
  [ ] 6. Add middleware for protected routes
  [ ] 7. Write tests
  [ ] 8. Update API documentation
```

The plan is not just decorative -- the agent actively updates it, re-plans when blocked, and uses it to maintain long-horizon coherence.

**4. Checkpoint and Rollback**

Devin takes snapshots of the VM state at key points. If an approach fails, it can roll back to a checkpoint rather than trying to undo a chain of changes. This is dramatically more reliable than incremental undo.

### What Makes It Work

- **Long-horizon coherence**: The explicit planner prevents the agent from losing track during multi-hour tasks.
- **Browser access**: Many real engineering tasks require reading docs, Stack Overflow, or API references. Browser access closes this gap.
- **Rollback**: Failed experiments are cheap. The agent can try speculative approaches without fear of corrupting state.
- **Human-in-the-loop**: Users can observe, redirect, or take over at any point.

### Trade-offs

| Strength                   | Weakness                             |
| -------------------------- | ------------------------------------ |
| Full developer environment | Expensive (VM per session)           |
| Browser for research       | Slow (browser rendering, navigation) |
| Rollback/checkpoint        | Large state to snapshot              |
| Truly autonomous           | Hard to steer mid-task               |
| Real package installation  | Security surface area of full VM     |

### What I Would Do Differently

- **Tiered environments**: Use lightweight containers for simple tasks, VMs only for tasks that need browser or GUI. Most coding tasks do not need a browser.
- **Structured tool calls over raw UI interaction**: Clicking through a browser is slow and brittle. Where possible, prefer API calls (e.g., GitHub API instead of navigating github.com).
- **Parallel execution tracks**: Run tests in a parallel environment while continuing to code, rather than serial edit-test cycles.

---

## 3. ChatGPT Deep Research (OpenAI)

### What It Is

Deep Research is OpenAI's research agent built on top of GPT-4-class models. Given a research question, it autonomously browses the web, reads dozens of sources, synthesizes findings, and produces a comprehensive report with citations. It runs for minutes to tens of minutes on a single query.

### Architecture

```
+------------------------------------------------------------------+
|                     DEEP RESEARCH AGENT                           |
+------------------------------------------------------------------+
|                                                                    |
|  +-----------+                                                    |
|  | User Query|                                                    |
|  +-----+-----+                                                    |
|        |                                                           |
|        v                                                           |
|  +-----+------------------+                                       |
|  | Research Planner        |                                       |
|  | - Decompose question    |                                       |
|  | - Identify sub-queries  |                                       |
|  | - Prioritize sources    |                                       |
|  +-----+------------------+                                       |
|        |                                                           |
|        v                                                           |
|  +-----+------------------+     +-----------------------------+   |
|  | Search & Browse Loop    |<--->| Web Browser Tool            |   |
|  |                         |     | - Search (Bing/Google)      |   |
|  | for each sub-query:     |     | - Navigate to URL           |   |
|  |   1. Search             |     | - Read page content         |   |
|  |   2. Open top results   |     | - Extract relevant sections |   |
|  |   3. Extract facts      |     | - Follow links              |   |
|  |   4. Assess credibility |     +-----------------------------+   |
|  |   5. Note citations     |                                       |
|  |   6. Identify gaps      |                                       |
|  |   7. Search again       |                                       |
|  +-----+------------------+                                       |
|        |                                                           |
|        v                                                           |
|  +-----+------------------+                                       |
|  | Synthesis Engine        |                                       |
|  | - Cross-reference facts |                                       |
|  | - Resolve conflicts     |                                       |
|  | - Organize by theme     |                                       |
|  | - Generate report       |                                       |
|  | - Attach citations      |                                       |
|  +-----+------------------+                                       |
|        |                                                           |
|        v                                                           |
|  +-----+------------------+                                       |
|  | Final Report            |                                       |
|  | - Structured markdown   |                                       |
|  | - Inline citations [1]  |                                       |
|  | - Source list            |                                       |
|  +------------------------+                                       |
+------------------------------------------------------------------+
```

### The Research Loop

Deep Research's core is an iterative search-read-assess loop:

```
research_state = {questions: decompose(user_query), facts: [], sources: []}

while research_state.has_open_questions():
    query = research_state.next_question()
    search_results = web_search(query)

    for result in search_results[:N]:
        page_content = browse(result.url)
        extracted = extract_relevant_facts(page_content, query)
        research_state.facts.extend(extracted)
        research_state.sources.append(result)

    # Assess completeness
    gaps = identify_gaps(research_state)
    if gaps:
        research_state.questions.extend(gaps)

report = synthesize(research_state)
```

Key properties:

- **Adaptive depth**: The agent decides how many sub-queries to explore based on the complexity of the question. Simple factual queries might take 3-5 searches; complex analytical questions might take 20-30.
- **Source credibility assessment**: Not all sources are equal. The agent weights information from authoritative sources (academic papers, official docs) higher than blog posts or forums.
- **Gap identification**: After each round of reading, the agent asks "what do I still not know?" and generates new sub-queries.

### Key Design Decisions

1. **Asynchronous execution**: Deep Research runs in the background, allowing the user to do other things. This is essential because research tasks take minutes, not seconds.
2. **Report-oriented output**: Rather than streaming partial results, it produces a polished, structured report. This matches the use case -- users want answers, not a stream of consciousness.
3. **Citation-first design**: Every claim is linked to a source. This makes the output verifiable and builds trust.
4. **Bounded exploration**: Despite being iterative, there are limits on total browsing time and number of sources to prevent infinite research spirals.

### What Makes It Work

- **Question decomposition**: Breaking a complex question into sub-queries is the key insight. "Compare React and Vue for enterprise applications" becomes: performance benchmarks, ecosystem maturity, hiring market, learning curve, TypeScript support, etc.
- **Multi-source synthesis**: Reading 20+ sources and producing a coherent narrative is something LLMs are genuinely good at, and something humans find tedious.
- **Iterative refinement**: The gap-identification step prevents shallow research that only covers the first page of Google results.

### Trade-offs

| Strength                            | Weakness                                      |
| ----------------------------------- | --------------------------------------------- |
| Comprehensive multi-source research | Slow (minutes per query)                      |
| Cited, verifiable claims            | Cannot access paywalled content               |
| Adaptive depth                      | Expensive (many LLM calls + browsing)         |
| Structured output                   | May miss nuance that requires expert judgment |
| Handles ambiguous queries           | Can go down rabbit holes on tangents          |

### What I Would Do Differently

- **Parallel source reading**: Read multiple URLs concurrently instead of sequentially. Most of the time is spent waiting for page loads.
- **Cached knowledge base**: For common topics, maintain a cache of previously extracted facts to avoid redundant browsing.
- **User-guided refinement**: After the initial plan, let the user approve/modify sub-queries before the agent starts browsing. This prevents wasted effort on irrelevant tangents.
- **Confidence scoring**: Attach confidence levels to claims based on source agreement and source quality.

---

## 4. GitHub Copilot Workspace

### What It Is

GitHub Copilot Workspace is an agent-powered development environment integrated into GitHub. Given an issue or task description, it generates a specification, creates an implementation plan, writes code across multiple files, and can run tests -- all within a structured workflow that the developer can review and edit at each step.

### Architecture

```
+------------------------------------------------------------------+
|                   COPILOT WORKSPACE                               |
+------------------------------------------------------------------+
|                                                                    |
|  +-------------------+                                            |
|  | Issue / Task       |                                            |
|  | Description        |                                            |
|  +---------+---------+                                            |
|            |                                                       |
|            v                                                       |
|  +---------+---------+    +-----------------+                     |
|  | 1. SPECIFICATION   |<-->| Repository      |                     |
|  | - What to change   |    | Context Engine  |                     |
|  | - Acceptance crit.  |    | - File index    |                     |
|  | - Scope boundaries  |    | - Dep graph     |                     |
|  +---------+---------+    | - Symbol table  |                     |
|            |               | - Test mapping  |                     |
|            v  [User Edit]  +-----------------+                     |
|  +---------+---------+                                            |
|  | 2. PLAN             |                                            |
|  | - Files to modify   |                                            |
|  | - Changes per file  |                                            |
|  | - Ordered steps     |                                            |
|  +---------+---------+                                            |
|            |                                                       |
|            v  [User Edit]                                          |
|  +---------+---------+                                            |
|  | 3. IMPLEMENTATION   |                                            |
|  | - Generate diffs    |                                            |
|  | - Multi-file edits  |                                            |
|  | - Apply changes     |                                            |
|  +---------+---------+                                            |
|            |                                                       |
|            v  [User Edit]                                          |
|  +---------+---------+                                            |
|  | 4. VALIDATION       |                                            |
|  | - Run tests         |                                            |
|  | - Check types       |                                            |
|  | - Lint              |                                            |
|  +---------+---------+                                            |
|            |                                                       |
|            v                                                       |
|  +---------+---------+                                            |
|  | 5. PULL REQUEST     |                                            |
|  | - Generate PR       |                                            |
|  | - Summary + diff    |                                            |
|  +-------------------+                                            |
+------------------------------------------------------------------+
```

### The Spec-Plan-Code-Test Pipeline

This is the defining architectural choice: a **linear pipeline with human checkpoints**.

**Stage 1: Specification**
The agent reads the issue, examines the repository, and produces a natural-language specification: what needs to change, what the acceptance criteria are, what is explicitly out of scope. The user can edit this before proceeding.

**Stage 2: Plan**
Given the spec, the agent produces a file-by-file plan: which files to modify, what changes to make in each, and in what order. Again, editable by the user.

**Stage 3: Implementation**
The agent generates actual code changes (diffs) for each file in the plan. Multi-file edits are coordinated -- if you add a function in one file, the import appears in the other.

**Stage 4: Validation**
Run the test suite, type checker, and linter against the proposed changes. Failures feed back into the implementation stage for correction.

### Key Design Decisions

1. **Human-editable at every stage**: Each stage produces a human-readable artifact that can be modified before the next stage runs. This is not just a UX nicety -- it is a correctness mechanism. If the spec is wrong, the code will be wrong; letting the human fix the spec prevents cascading errors.

2. **Repository context engine**: Workspace has deep knowledge of the repo structure -- file index, dependency graph, symbol table. This means the plan stage can identify which files actually need to change (not just guess based on the issue text).

3. **Diff-oriented output**: The implementation produces diffs, not complete files. This is better for review (you see exactly what changed) and more efficient (less token generation).

4. **Issue-driven**: The entry point is a GitHub issue, which provides structured context: title, description, labels, linked PRs, comments. This is richer input than a free-text prompt.

### What Makes It Work

- **Structured decomposition prevents hallucination**: By forcing the agent through spec -> plan -> code, each stage constrains the next. The plan cannot mention files that do not exist; the code must follow the plan.
- **Human checkpoints catch errors early**: A wrong specification caught at stage 1 costs nothing. The same error caught at stage 4 (failing tests) wastes minutes of compute and human review time.
- **Repository awareness**: The context engine means the agent does not need to "discover" the codebase by searching -- it already knows the structure.

### Trade-offs

| Strength                         | Weakness                                 |
| -------------------------------- | ---------------------------------------- |
| Structured, reviewable pipeline  | Rigid -- cannot deviate from linear flow |
| Human checkpoints at every stage | Slow for simple tasks (4 approval steps) |
| Deep repo context                | Expensive to index large repos           |
| Issue-driven entry point         | Limited to GitHub ecosystem              |
| Diff-oriented output             | Cannot handle tasks requiring new repos  |

### What I Would Do Differently

- **Adaptive pipeline depth**: Simple tasks (rename a variable) should skip the spec stage. Complex tasks (new feature) should get the full pipeline. Let the agent decide.
- **Iterative implementation**: Instead of generating all diffs at once, implement file-by-file with intermediate validation. Catch errors earlier.
- **Branch from anywhere**: Support entry points beyond GitHub issues -- Slack messages, Jira tickets, natural language in a chat.

---

## 5. Cursor / Windsurf

### What It Is

Cursor and Windsurf are IDE-native AI coding agents. Unlike CLI tools (Claude Code) or web-based workflows (Copilot Workspace), these are forked or extended versions of VS Code that deeply integrate AI into the editing experience: tab completion, inline editing, multi-file generation, and conversational coding with full codebase context.

### Architecture

```
+------------------------------------------------------------------+
|                     IDE AGENT (Cursor/Windsurf)                   |
+------------------------------------------------------------------+
|                                                                    |
|  +---------------------+     +-------------------------------+    |
|  | VS Code Fork / Ext. |     | AI Backend Service            |    |
|  |                      |     |                               |    |
|  | +------------------+ |     | +---------------------------+ |    |
|  | | Editor Surface   | |     | | Model Router              | |    |
|  | | - Cursor position| |     | | - Tab: fast model (small) | |    |
|  | | - Selection      | |     | | - Edit: mid model         | |    |
|  | | - Visible code   | |     | | - Chat: large model       | |    |
|  | +--------+---------+ |     | | - Agent: large + tools    | |    |
|  |          |           |     | +---------------------------+ |    |
|  | +--------+---------+ |     |                               |    |
|  | | Context Engine   | |     | +---------------------------+ |    |
|  | | - Open files     | |     | | Codebase Index            | |    |
|  | | - Recent edits   | |     | | - Embeddings (all files)  | |    |
|  | | - Cursor context | |     | | - Symbol graph            | |    |
|  | | - Git diff       | |     | | - Semantic search         | |    |
|  | | - Terminal output | |     | +---------------------------+ |    |
|  | +------------------+ |     |                               |    |
|  |                      |     | +---------------------------+ |    |
|  | +------------------+ |     | | Prompt Builder            | |    |
|  | | Interaction Modes| |     | | - System prompt           | |    |
|  | | - Tab complete   | |     | | - Context injection       | |    |
|  | | - Inline edit    | |     | | - Few-shot examples       | |    |
|  | | - Chat panel     | |     | | - Instruction following   | |    |
|  | | - Agent mode     | |     | +---------------------------+ |    |
|  | +------------------+ |     +-------------------------------+    |
|  +---------------------+                                          |
+------------------------------------------------------------------+
```

### Interaction Modes

IDE agents typically offer multiple interaction modes, each with different latency and capability requirements:

**Tab Completion (Autocomplete)**

- Triggered automatically as you type
- Latency budget: <300ms
- Model: Small, fast model (or speculative decoding)
- Context: Current file, cursor position, recent edits, open files
- Output: 1-5 lines of code

**Inline Edit (Cmd+K / Ctrl+K)**

- Triggered by user with a natural language instruction
- Latency budget: 1-5 seconds
- Model: Mid-size model
- Context: Selected code + surrounding context + instruction
- Output: Replacement code for the selected region

**Chat Panel**

- Conversational interface in a sidebar
- Latency budget: 5-30 seconds
- Model: Large model
- Context: Full codebase search, selected files, conversation history
- Output: Explanations, multi-file suggestions, code blocks

**Agent Mode**

- Autonomous multi-step execution
- Latency budget: Minutes
- Model: Large model with tool use
- Context: Full codebase, terminal, file system
- Output: Multi-file edits, terminal commands, iterative refinement

### Codebase Indexing

The differentiating technology in IDE agents is the **codebase index**:

```
Repository Files
      |
      v
+------------------+
| Chunking Engine  |
| - Split by func  |
| - Overlap chunks |
| - Preserve scope |
+--------+---------+
         |
         v
+--------+---------+
| Embedding Model  |
| - Code-specific  |
| - Fast inference |
+--------+---------+
         |
         v
+--------+---------+
| Vector Index     |   <--- Semantic search at query time
| - HNSW / IVF    |
| - Updated on save|
+------------------+
```

When the user asks a question or the agent needs context, the system:

1. Embeds the query
2. Retrieves top-K relevant chunks from the index
3. Re-ranks based on recency, file proximity, and symbol relevance
4. Injects the most relevant chunks into the prompt

This is essentially **RAG for code**, and it is what enables questions like "how does authentication work in this project?" to return useful answers without the user specifying which files to look at.

### Key Design Decisions

1. **Model routing by interaction mode**: Tab completion uses a small, fast model because latency matters more than capability. Agent mode uses the best available model because correctness matters more than speed. This is a cost-performance optimization.

2. **Apply model for diffs**: When the chat suggests a code change, a separate "apply model" translates the suggestion into an actual diff. This model is optimized for edit operations and is faster than having the main model generate the full file.

3. **Context-aware prompt construction**: Every prompt is dynamically assembled based on what the user is doing. Writing a test? The prompt includes the source file. Fixing a bug? The prompt includes the error output and relevant stack frames.

4. **Speculative edits**: Some IDE agents pre-compute likely next edits based on your recent activity, so when you press Tab, the suggestion appears instantly.

### What Makes It Work

- **Low-latency tab completion** is the gateway feature. It provides value on every keystroke and builds the habit of using AI assistance.
- **Codebase indexing** makes the agent context-aware without requiring the user to manually select relevant files.
- **Multiple interaction modes** match the agent's capabilities to the task's complexity.
- **Tight IDE integration** means suggestions appear in the right place, in the right format, with one-keypress acceptance.

### Trade-offs

| Strength                   | Weakness                               |
| -------------------------- | -------------------------------------- |
| Sub-second tab completion  | Requires custom IDE (vendor lock-in)   |
| Deep codebase awareness    | Index building/maintenance cost        |
| Multiple interaction modes | Complexity of routing and context      |
| Inline diff application    | Apply model can introduce errors       |
| Visual code review         | Limited to supported languages/editors |

### Cursor vs. Windsurf Differences

| Dimension       | Cursor                     | Windsurf                   |
| --------------- | -------------------------- | -------------------------- |
| Base            | VS Code fork               | VS Code fork               |
| Agent mode      | Multi-file with tool use   | "Cascade" flow-based agent |
| Context         | Explicit @-mentions + auto | Automatic "deep context"   |
| Pricing         | Per-request model          | Unlimited completions tier |
| Differentiation | Power-user control         | Seamless auto-context      |

### What I Would Do Differently

- **Language server integration**: Use the Language Server Protocol (LSP) for type-aware context rather than purely embedding-based retrieval. The LSP knows the types, definitions, and references -- this is strictly more useful than semantic similarity for code.
- **Edit confidence scoring**: Before applying a suggested edit, estimate the probability it will break something (based on test coverage, type checking, etc.). High-risk edits get a warning.
- **Session-level learning**: Track which suggestions the user accepts, modifies, or rejects within a session and adjust the model's behavior accordingly.

---

## 6. Customer Support Agents

### What It Is

Production customer support agents handle real customer conversations at scale. Companies like Sierra, Intercom, and Zendesk deploy LLM-powered agents that can resolve common issues autonomously (password resets, order tracking, FAQ answers) and escalate complex cases to human agents. These systems must be reliable, brand-consistent, and safe -- a single bad response can go viral.

### Architecture

```
+------------------------------------------------------------------+
|                  CUSTOMER SUPPORT AGENT SYSTEM                    |
+------------------------------------------------------------------+
|                                                                    |
|  Customer Message                                                 |
|       |                                                            |
|       v                                                            |
|  +----+------------------+                                        |
|  | Input Classification   |                                        |
|  | - Intent detection     |                                        |
|  | - Sentiment analysis   |                                        |
|  | - Language detection    |                                        |
|  | - Priority scoring     |                                        |
|  | - PII detection        |                                        |
|  +----+------------------+                                        |
|       |                                                            |
|       v                                                            |
|  +----+------------------+     +-----------------------------+    |
|  | Router                 |     | Routing Rules               |    |
|  | - AI-resolvable?       |---->| - Simple: AI handles        |    |
|  | - Needs human?         |     | - Complex: Human + AI copilot|   |
|  | - Escalation trigger?  |     | - Angry: Immediate human    |    |
|  +----+------------------+     | - Legal: Human only         |    |
|       |                        +-----------------------------+    |
|       v                                                            |
|  +----+------------------+     +-----------------------------+    |
|  | AI Agent               |     | Knowledge Base               |    |
|  | - Retrieve context     |<--->| - Product docs               |    |
|  | - Generate response    |     | - Policy documents           |    |
|  | - Execute actions      |     | - FAQ database               |    |
|  | - Check guardrails     |     | - Past ticket resolutions    |    |
|  +----+------------------+     +-----------------------------+    |
|       |                                                            |
|       v                                                            |
|  +----+------------------+     +-----------------------------+    |
|  | Action Engine          |     | Backend Systems              |    |
|  | - Order lookup         |<--->| - CRM (Salesforce)           |    |
|  | - Refund processing    |     | - Order management           |    |
|  | - Account updates      |     | - Billing system             |    |
|  | - Ticket creation      |     | - Inventory                  |    |
|  +----+------------------+     +-----------------------------+    |
|       |                                                            |
|       v                                                            |
|  +----+------------------+                                        |
|  | Output Guardrails      |                                        |
|  | - Brand voice check    |                                        |
|  | - Hallucination detect |                                        |
|  | - Policy compliance    |                                        |
|  | - PII redaction        |                                        |
|  | - Confidence threshold |                                        |
|  +----+------------------+                                        |
|       |                                                            |
|       v                                                            |
|  Response to Customer                                              |
+------------------------------------------------------------------+
```

### The Escalation Decision

The most important design decision in a support agent is **when to escalate to a human**. This is not a binary classification -- it is a multi-factor scoring system:

```
Escalation Score = weighted_sum(
    sentiment_score,        # Angry customers escalate faster
    complexity_score,       # Multi-issue tickets are harder
    confidence_score,       # Low confidence = escalate
    policy_sensitivity,     # Refunds > $X require human
    repeat_contact_flag,    # Customer contacted 3x = escalate
    legal_risk_flag         # Anything mentioning "lawyer" = human
)

if score > threshold:
    route_to_human(with_ai_summary)
else:
    handle_with_ai()
```

### The Sierra Pattern

Sierra (founded by Bret Taylor) popularized a specific architecture for enterprise support agents:

1. **Brand-specific personas**: Each company gets a custom AI persona trained on their brand voice, policies, and product knowledge.
2. **Action authorization**: The AI can take real actions (process refunds, update orders) but only within pre-defined policy boundaries.
3. **Continuous learning loop**: Human agent corrections feed back into the AI's knowledge base and policy rules.
4. **Audit trail**: Every AI decision is logged with reasoning, enabling compliance review.

### The Intercom Pattern

Intercom's Fin agent uses a different approach:

1. **Knowledge-first**: The agent is grounded entirely in the company's help center articles. It will only answer questions it can ground in existing documentation.
2. **No hallucination by construction**: If no relevant article exists, the agent says "I don't have information about that" and routes to a human.
3. **Transparent sourcing**: Every answer includes a link to the source article.

### Key Design Decisions

1. **RAG over fine-tuning**: Both Sierra and Intercom use RAG (retrieval-augmented generation) rather than fine-tuning. RAG allows real-time updates to the knowledge base without retraining, and provides source attribution.

2. **Graduated autonomy**: Start with the AI answering only FAQ-style questions. Gradually expand to action-taking (order lookups, then refunds, then account changes) as confidence in the system grows.

3. **Human-in-the-loop as a feature**: When the AI escalates, it hands the human agent a summary of the conversation, the customer's issue, and suggested actions. The human is not starting from scratch.

4. **Tone and brand guardrails**: Output is checked not just for correctness but for brand alignment. A luxury brand and a budget brand need different conversational tones.

### What Makes It Work

- **Constrained action space**: The agent can only do things the company has explicitly authorized. This limits the blast radius of errors.
- **Knowledge grounding**: RAG prevents hallucination by anchoring responses in real documentation.
- **Escalation safety net**: The human fallback means no customer issue is truly unresolvable.
- **Continuous feedback loop**: Every human correction improves the system for next time.

### Trade-offs

| Strength                            | Weakness                                 |
| ----------------------------------- | ---------------------------------------- |
| 24/7 availability                   | Cannot handle truly novel situations     |
| Consistent brand voice              | Sounds robotic to some customers         |
| Instant response for simple queries | Complex issues still need humans         |
| Scales to millions of conversations | Knowledge base maintenance burden        |
| Audit trail for compliance          | False confidence can frustrate customers |

### What I Would Do Differently

- **Proactive issue detection**: Monitor customer behavior (repeated page visits, cart abandonment) and proactively offer help before the customer opens a ticket.
- **Multi-turn memory across channels**: If a customer emailed yesterday and chats today, the agent should know the full history without the customer repeating themselves.
- **Confidence calibration**: Regularly test the agent's confidence scores against actual resolution rates and recalibrate.

---

## 7. Data Analysis Agents

### What It Is

Data analysis agents (exemplified by ChatGPT's Code Interpreter / Advanced Data Analysis, and similar features in other platforms) take a natural language question about data, generate code to analyze it, execute the code in a sandbox, inspect the results, and iterate until the analysis is complete. They close the loop between "what do I want to know?" and "here is the answer with a chart."

### Architecture

```
+------------------------------------------------------------------+
|                    DATA ANALYSIS AGENT                            |
+------------------------------------------------------------------+
|                                                                    |
|  +------------+    +-------------------------------------------+ |
|  | User Query  |    | Data Sources                              | |
|  | + Uploaded   |    | - CSV/Excel uploads                      | |
|  |   Files      |    | - Database connections                    | |
|  +------+------+    | - API endpoints                           | |
|         |           | - Cloud storage (S3, GCS)                 | |
|         v           +-------------------------------------------+ |
|  +------+------+                                                  |
|  | Query        |                                                  |
|  | Understanding|                                                  |
|  | - What data? |                                                  |
|  | - What       |                                                  |
|  |   analysis?  |                                                  |
|  | - What       |                                                  |
|  |   output?    |                                                  |
|  +------+------+                                                  |
|         |                                                          |
|         v                                                          |
|  +------+------+    +-------------------+                         |
|  | Code         |    | Sandbox           |                         |
|  | Generation   |--->| (Jupyter kernel)  |                         |
|  | - pandas     |    |                   |                         |
|  | - SQL        |    | - Execute code    |                         |
|  | - matplotlib |    | - Capture output  |                         |
|  | - seaborn    |    | - Capture errors  |                         |
|  | - sklearn    |    | - Capture plots   |                         |
|  +------+------+    +--------+----------+                         |
|         |                    |                                     |
|         v                    v                                     |
|  +------+--------------------+------+                             |
|  | Result Inspection                 |                             |
|  | - Did code run successfully?      |                             |
|  | - Does output answer the question?|                             |
|  | - Are there anomalies in data?    |                             |
|  | - Should I dig deeper?            |                             |
|  +------+---------------------------+                             |
|         |                                                          |
|    +----+----+                                                    |
|    | Iterate? |--- YES ---> back to Code Generation               |
|    +----+----+                                                    |
|         | NO                                                       |
|         v                                                          |
|  +------+------+                                                  |
|  | Present      |                                                  |
|  | Results      |                                                  |
|  | - Charts     |                                                  |
|  | - Tables     |                                                  |
|  | - Narrative  |                                                  |
|  +-------------+                                                  |
+------------------------------------------------------------------+
```

### The Iterative Analysis Loop

The defining pattern is **code generation + execution + inspection + iteration**:

```
analysis_complete = False
context = {data_description, user_question, previous_outputs: []}

while not analysis_complete:
    code = generate_code(context)
    result = sandbox.execute(code)

    if result.error:
        context.previous_outputs.append({code, error: result.error})
        # LLM sees the error and fixes the code
        continue

    context.previous_outputs.append({code, output: result.output, plots: result.plots})

    assessment = assess_completeness(context)
    if assessment.needs_more_analysis:
        context.follow_up = assessment.next_steps
    else:
        analysis_complete = True

present_results(context)
```

The key insight: the agent does not try to write perfect code on the first attempt. It writes code, runs it, observes the output (including errors), and iterates. This is exactly how human data analysts work.

### Key Design Decisions

1. **Sandboxed execution**: Code runs in an isolated environment (typically a Jupyter kernel in a container). The sandbox has pre-installed libraries (pandas, numpy, matplotlib, scikit-learn) but no network access and limited compute.

2. **Visual output support**: The sandbox captures matplotlib/seaborn plots as images and returns them to the LLM. The model can "see" the chart and decide if it answers the question or needs refinement.

3. **Error-driven iteration**: When code fails, the error traceback is fed back to the model. This is the most common iteration pattern -- not "the analysis is incomplete" but "the code crashed."

4. **Data profiling first**: Good data analysis agents start by profiling the data (shape, dtypes, missing values, basic statistics) before diving into the actual analysis. This grounds the model in what the data actually looks like.

### Common Analysis Patterns

```
Pattern 1: Exploratory Data Analysis
  1. Load and profile data (shape, types, nulls)
  2. Basic statistics (describe())
  3. Distribution plots for key columns
  4. Correlation matrix
  5. Identify outliers and anomalies

Pattern 2: Hypothesis Testing
  1. Load data
  2. State hypothesis in code comments
  3. Filter/group relevant subsets
  4. Statistical test (t-test, chi-square, etc.)
  5. Visualize results
  6. State conclusion

Pattern 3: Dashboard Generation
  1. Load and clean data
  2. Compute KPIs
  3. Generate subplot grid
  4. Add annotations and context
  5. Export as image or HTML
```

### What Makes It Work

- **Natural language to insight**: The user does not need to know pandas or SQL. They describe what they want to know, and the agent handles the technical translation.
- **Error recovery**: Code bugs are automatically fixed. The user never sees a traceback.
- **Iterative depth**: The agent keeps digging until it has a satisfying answer, following up on interesting patterns it discovers.
- **Visual communication**: Charts are more compelling than tables for most stakeholders.

### Trade-offs

| Strength                       | Weakness                                     |
| ------------------------------ | -------------------------------------------- |
| Accessible to non-programmers  | Limited to pre-installed libraries           |
| Self-correcting code execution | Sandbox compute limits for large datasets    |
| Visual outputs (charts)        | Cannot connect to live databases (typically) |
| Iterative refinement           | May over-analyze simple questions            |
| Handles messy data well        | Statistical rigor varies                     |

### What I Would Do Differently

- **Schema-aware generation**: If connected to a real database, use the schema (table names, column types, foreign keys) to generate correct SQL on the first try, rather than relying on error-driven iteration.
- **Caching intermediate results**: Store DataFrames between turns so re-analysis does not require re-loading and re-processing.
- **Statistical validation layer**: Before presenting results, run automated checks (e.g., is the sample size sufficient for this statistical test? Are the assumptions of the test met?).

---

## 8. Workflow Automation Agents

### What It Is

Workflow automation agents (Zapier AI, n8n AI nodes, Make.com AI) add LLM-powered decision-making and content generation to traditional workflow automation. Instead of rigid if-then rules, these systems use AI to classify inputs, generate content, extract data from unstructured sources, and make routing decisions within multi-step business workflows.

### Architecture

```
+------------------------------------------------------------------+
|               WORKFLOW AUTOMATION AGENT SYSTEM                    |
+------------------------------------------------------------------+
|                                                                    |
|  Trigger                                                          |
|  (email, webhook, schedule, form submission)                      |
|       |                                                            |
|       v                                                            |
|  +----+---+    +----+---+    +----+---+    +----+---+            |
|  | Step 1  |--->| Step 2  |--->| Step 3  |--->| Step 4  |         |
|  | Extract |    | AI      |    | Route   |    | Action  |         |
|  | Data    |    | Process |    | Decision|    | Execute |         |
|  +---------+    +---------+    +---------+    +---------+         |
|                                                                    |
|  Example Workflow: Customer Email Triage                          |
|                                                                    |
|  +----------+   +---------+   +-----------+   +----------+       |
|  | Gmail:   |   | AI:     |   | Router:   |   | Actions: |       |
|  | New email|-->| Classify|-->| Priority  |-->| High: Slack|     |
|  | received |   | intent, |   | & route   |   | Med: Ticket|     |
|  |          |   | extract |   |           |   | Low: Auto  |     |
|  |          |   | entities|   |           |   |   reply    |     |
|  +----------+   +---------+   +-----------+   +----------+       |
|                                                                    |
|  +-------------------------------------------------------------+ |
|  | AI Node Capabilities                                         | |
|  |                                                               | |
|  | +------------------+  +------------------+  +--------------+ | |
|  | | Classification   |  | Content          |  | Extraction   | | |
|  | | - Intent detect  |  | Generation       |  | - Parse PDFs | | |
|  | | - Sentiment      |  | - Draft replies  |  | - Read imgs  | | |
|  | | - Priority       |  | - Summarize      |  | - Structure  | | |
|  | | - Category       |  | - Translate      |  |   data       | | |
|  | +------------------+  +------------------+  +--------------+ | |
|  +-------------------------------------------------------------+ |
|                                                                    |
|  +-------------------------------------------------------------+ |
|  | Orchestration Layer                                          | |
|  | - Retry with backoff on failures                             | |
|  | - Dead letter queue for unprocessable items                  | |
|  | - Rate limiting per API endpoint                             | |
|  | - Audit log of all AI decisions                              | |
|  | - Cost tracking per workflow run                             | |
|  +-------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### AI Node Patterns

**Pattern 1: AI as Classifier**

```
Input: Unstructured text (email, message, ticket)
AI: Classify into predefined categories
Output: Category label + confidence score
Next step: Route based on category
```

**Pattern 2: AI as Transformer**

```
Input: Data in one format (PDF invoice, voice transcript)
AI: Extract structured data
Output: JSON with fields (amount, date, vendor, line items)
Next step: Insert into database or spreadsheet
```

**Pattern 3: AI as Generator**

```
Input: Context (customer name, issue, history)
AI: Generate personalized response
Output: Draft email or message
Next step: Send (with or without human review)
```

**Pattern 4: AI as Decision Maker**

```
Input: Complex situation with multiple factors
AI: Evaluate and decide next action
Output: Decision + reasoning
Next step: Execute the decided action
```

### Key Design Decisions

1. **AI as a step, not the orchestrator**: In workflow automation, the AI is one node in a larger DAG. The workflow engine handles sequencing, retries, and error handling. The AI handles the parts that need language understanding.

2. **Structured input/output contracts**: Each AI node has a defined schema for its input and output. The AI's response is parsed into structured fields that downstream steps can consume. This is critical for composability.

3. **Fallback paths**: Every AI decision node has a fallback path for when the AI is uncertain. Low-confidence classifications route to a human review queue.

4. **Cost-per-run budgets**: Each workflow has a token budget. If the AI is consuming too many tokens (e.g., processing a very long document), the workflow can short-circuit to a fallback.

### What Makes It Work

- **Composability**: AI nodes plug into existing workflow infrastructure. You do not need to rewrite your entire automation stack.
- **Deterministic scaffolding**: The workflow engine provides reliable sequencing, retries, and error handling. The AI only handles the non-deterministic parts.
- **Gradual adoption**: Start with one AI node (e.g., email classification) and add more as confidence grows.
- **Existing integrations**: Platforms like Zapier have thousands of app integrations. AI nodes inherit all of them.

### Trade-offs

| Strength                          | Weakness                                |
| --------------------------------- | --------------------------------------- |
| Plugs into existing workflows     | Limited AI context (one step at a time) |
| Deterministic orchestration       | AI errors cascade through the workflow  |
| Thousands of app integrations     | Token costs scale with volume           |
| Visual workflow builder           | Complex logic is hard to debug          |
| Retry and error handling built in | Latency of AI calls adds up             |

### What I Would Do Differently

- **Cross-step context**: Let AI nodes access results from previous steps without explicit wiring. The AI should be able to "see" the full workflow execution history.
- **Automated workflow generation**: Given a natural language description of a business process, generate the workflow DAG automatically.
- **Cost prediction**: Before running a workflow on 10,000 items, estimate the total token cost and get approval.

---

## 9. Browser Automation Agents

### What It Is

Browser automation agents use LLMs to control a web browser -- navigating pages, filling forms, clicking buttons, extracting data -- based on natural language instructions. They bridge the gap between "I want to do X on website Y" and the brittle CSS selectors / DOM manipulation that traditional browser automation requires.

### Architecture

```
+------------------------------------------------------------------+
|                  BROWSER AUTOMATION AGENT                         |
+------------------------------------------------------------------+
|                                                                    |
|  +------------+                                                   |
|  | User Goal   |  "Book a flight from SFO to JFK on March 25"   |
|  +------+-----+                                                   |
|         |                                                          |
|         v                                                          |
|  +------+-----+                                                   |
|  | Planner     |                                                   |
|  | 1. Go to airline site                                          |
|  | 2. Enter departure: SFO                                        |
|  | 3. Enter arrival: JFK                                          |
|  | 4. Select date: March 25                                       |
|  | 5. Search flights                                              |
|  | 6. Select cheapest option                                      |
|  +------+-----+                                                   |
|         |                                                          |
|         v                                                          |
|  +------+-------------------------------------------------+      |
|  | Execution Loop                                          |      |
|  |                                                         |      |
|  |  +------------------+    +------------------------+    |      |
|  |  | Page Observer     |    | Browser Controller     |    |      |
|  |  |                   |    | (Playwright/Puppeteer) |    |      |
|  |  | - Screenshot      |    |                        |    |      |
|  |  | - DOM snapshot    |    | - navigate(url)        |    |      |
|  |  | - Accessibility   |    | - click(selector)      |    |      |
|  |  |   tree            |    | - type(selector, text) |    |      |
|  |  | - Visible text    |    | - select(selector,val) |    |      |
|  |  +--------+---------+    | - scroll(direction)    |    |      |
|  |           |               | - wait(condition)      |    |      |
|  |           v               | - screenshot()         |    |      |
|  |  +--------+---------+    +----------+-------------+    |      |
|  |  | Action Decider    |               ^                  |      |
|  |  | (LLM)             |               |                  |      |
|  |  | Given:            |               |                  |      |
|  |  |  - Current page   +---------------+                  |      |
|  |  |  - Goal           |  action to execute               |      |
|  |  |  - History        |                                  |      |
|  |  | Output:           |                                  |      |
|  |  |  - Next action    |                                  |      |
|  |  +------------------+                                  |      |
|  +--------------------------------------------------------+      |
|                                                                    |
|  +------------------------------+                                 |
|  | Page Representation Options   |                                 |
|  |                               |                                 |
|  | 1. Screenshot (vision model)  | -- Most general, most tokens   |
|  | 2. Accessibility tree         | -- Structured, medium tokens   |
|  | 3. Simplified DOM             | -- Detailed, many tokens       |
|  | 4. Visible text only          | -- Cheapest, least context     |
|  +------------------------------+                                 |
+------------------------------------------------------------------+
```

### Page Representation Strategy

The biggest design choice is how to represent the current page state to the LLM:

**Screenshot (Vision Model)**

- Most faithful to what a human sees
- Handles dynamic content, canvas elements, images
- Expensive: each screenshot is thousands of tokens
- Requires a vision-capable model

**Accessibility Tree**

- Structured representation of interactive elements
- Includes labels, roles, states (checked, disabled)
- Much cheaper than screenshots
- Misses visual layout and non-interactive content

**Simplified DOM**

- Strips scripts, styles, hidden elements
- Retains structure and text content
- Can be large for complex pages
- Good balance of detail and cost

**Hybrid Approach (Recommended)**

- Use accessibility tree as the primary representation
- Fall back to screenshot when the tree is insufficient (e.g., CAPTCHAs, canvas-based UIs)
- Include visible text for context

### Action Space

Browser agents operate with a finite set of primitive actions:

```
Actions:
  navigate(url)           # Go to a URL
  click(element_id)       # Click an element
  type(element_id, text)  # Type into an input
  select(element_id, val) # Select from dropdown
  scroll(direction, amt)  # Scroll the page
  wait(seconds)           # Wait for dynamic content
  back()                  # Browser back button
  extract(selector)       # Get text content
  screenshot()            # Capture current state
```

Each action returns the new page state, forming the observation for the next LLM call.

### Key Design Decisions

1. **Element identification**: Using numbered element IDs from the accessibility tree rather than CSS selectors. Selectors are brittle and change across page loads; element IDs from the tree are stable within a single page state.

2. **Wait strategy**: Dynamic web pages need time to load. Rather than fixed waits, good agents wait for specific conditions (element visible, network idle, text appears).

3. **Error recovery**: When an action fails (element not found, navigation error), the agent re-observes the page and re-plans rather than crashing.

4. **Action history compression**: The full history of every action and page state would overflow the context window. Agents compress history to: last N actions + current page state + original goal.

### What Makes It Work

- **Resilience to UI changes**: Unlike CSS-selector-based automation, LLM-driven agents adapt to minor UI changes because they reason about what elements look like and do, not their specific DOM path.
- **Natural language goals**: Users describe what they want in plain English rather than writing Playwright scripts.
- **Self-correction**: When an action does not produce the expected result, the agent re-evaluates and tries a different approach.

### Trade-offs

| Strength                      | Weakness                                       |
| ----------------------------- | ---------------------------------------------- |
| Adapts to UI changes          | Slow (LLM call per action)                     |
| Natural language instructions | Expensive (screenshots = many tokens)          |
| Handles complex workflows     | Cannot handle CAPTCHAs reliably                |
| Self-correcting               | Non-deterministic (same task, different paths) |
| No code maintenance           | Authentication is complex                      |

### What I Would Do Differently

- **Macro actions**: Combine common action sequences (login, search, fill form) into single macro actions to reduce the number of LLM calls.
- **Page type classification**: Detect the type of page (search results, form, article, dashboard) and use specialized strategies for each.
- **Parallel tab execution**: For tasks that involve comparing information from multiple sites, open multiple tabs and process them concurrently.
- **Deterministic fallback**: For frequently-executed workflows, record the LLM's successful action sequence and replay it deterministically. Only invoke the LLM when the deterministic path fails (due to UI changes).

---

## 10. Lessons Learned

### Common Patterns Across Successful Agents

**1. The Observe-Act-Reflect Loop Is Universal**

Every successful agent follows the same fundamental pattern, regardless of domain:

```
Observe  -->  Reason  -->  Act  -->  Observe Result  -->  Reflect
   ^                                                         |
   +---------------------------------------------------------+
```

Claude Code observes file contents, reasons about what to change, edits, and checks if the edit was correct. Deep Research observes search results, reasons about gaps, searches again, and assesses completeness. Customer support agents observe the customer message, reason about intent, take an action, and check if the issue was resolved.

**2. Constrained Action Spaces Beat Open-Ended Freedom**

The most reliable agents have a small, well-defined set of actions:

| Agent            | Number of Core Actions                                 |
| ---------------- | ------------------------------------------------------ |
| Claude Code      | ~10 tools (Read, Edit, Write, Bash, Glob, Grep, etc.)  |
| Customer Support | ~5-10 actions (lookup, refund, update, escalate, etc.) |
| Browser Agent    | ~8 primitives (click, type, navigate, scroll, etc.)    |
| Data Analysis    | ~3 patterns (load, analyze, visualize)                 |

Agents with unbounded action spaces (e.g., "write any code and run it") are harder to make reliable than agents with structured action menus.

**3. Error Recovery Is More Important Than Error Prevention**

Every production agent encounters errors. The successful ones handle them gracefully:

- **Claude Code**: Edit fails because `old_string` is not unique -> agent reads the file again and provides more context.
- **Data Analysis**: Code throws an exception -> agent reads the traceback and fixes the bug.
- **Browser Agent**: Element not found -> agent re-observes the page and tries a different approach.
- **Customer Support**: Low confidence response -> escalate to human.

The pattern: **observe the error, understand why it happened, try a different approach**. Never just retry the same action.

**4. Human-in-the-Loop Is a Feature**

Every production agent has a human fallback:

- Copilot Workspace: Human edits at every pipeline stage
- Customer Support: Escalation to human agents
- Claude Code: User approves dangerous operations
- Devin: User can intervene and redirect at any time

The goal is not full autonomy -- it is **appropriate autonomy**. Handle the easy cases automatically, escalate the hard ones, and always give the human a way to override.

**5. Context Management Is the Engineering Challenge**

The most discussed topic in agent engineering is not prompting or model selection -- it is context management:

- What information does the agent need to see right now?
- How do we retrieve relevant context from large knowledge bases?
- How do we prevent the context window from filling up with irrelevant history?
- How do we compress or summarize old context without losing important details?

Solutions vary by domain (codebase indexing for IDE agents, RAG for support agents, data profiling for analysis agents) but the problem is universal.

**6. Typed, Structured Interfaces Between Components**

Successful agent systems do not pass free-form text between components. They use structured schemas:

- Tool calls have typed parameters and return typed results
- Workflow steps have defined input/output contracts
- Classification nodes output structured labels, not prose
- Plans are structured lists, not paragraphs

This is basic software engineering applied to AI systems, and it is the single biggest differentiator between demo-quality and production-quality agents.

### Anti-Patterns to Avoid

**1. The "Giant Prompt" Anti-Pattern**

Putting everything into a single massive system prompt: all instructions, all examples, all edge cases. This leads to instruction conflicts, context window waste, and unpredictable behavior when the prompt grows beyond what the model can reliably follow.

**Fix**: Modular, dynamically-assembled prompts. Only include what is relevant to the current task.

**2. The "Autonomous Forever" Anti-Pattern**

Building agents that never ask for help and never stop. They loop indefinitely, consuming tokens, when they should have escalated 10 steps ago.

**Fix**: Token budgets, step count limits, confidence thresholds for escalation, and the principle that stopping early is always better than failing late.

**3. The "Hope-Based Error Handling" Anti-Pattern**

Retry the same action up to 3 times, then give up with a generic error. No attempt to understand why it failed or try a different approach.

**Fix**: Parse errors, classify failure modes, and have specific recovery strategies for each. Retries should only be used for transient errors (network timeouts), not for logic errors.

**4. The "Context Stuffing" Anti-Pattern**

Retrieving everything potentially relevant and cramming it into the context. "More context is better, right?" No. Irrelevant context dilutes attention and increases cost.

**Fix**: Retrieve broadly, re-rank aggressively, include only the top-K most relevant items. Measure the impact of context items on task success and prune what does not help.

**5. The "Demo-Driven Development" Anti-Pattern**

Building for impressive demos rather than reliable production behavior. The agent handles the happy path beautifully but crashes on edge cases, malformed inputs, or unexpected states.

**Fix**: Invest in evaluation. Test on adversarial inputs. Measure success rates on real-world distributions, not cherry-picked examples.

**6. The "Model Will Figure It Out" Anti-Pattern**

Relying on the LLM to handle complexity that should be in code. Parsing dates, validating emails, doing arithmetic -- these should be deterministic code, not LLM inference.

**Fix**: Use the LLM for what it is good at (language understanding, reasoning, generation) and code for everything else.

---

## 11. Common Interview Questions

### The "Design an Agent for X" Framework

When asked "Design an AI agent for X" in an interview, use this structured approach:

```
Step 1: CLARIFY
  - What is the user? What problem are they solving?
  - What is the scope? (fully autonomous vs. human-assisted?)
  - What are the constraints? (latency, cost, accuracy requirements)
  - What are the inputs and outputs?

Step 2: ARCHITECTURE
  - Draw the core loop (observe -> reason -> act)
  - Define the action space (what can the agent do?)
  - Define the observation space (what does the agent see?)
  - Identify the state (what does the agent remember?)

Step 3: TOOL DESIGN
  - What tools does the agent need?
  - What are the input/output schemas?
  - What are the error modes for each tool?

Step 4: CONTEXT & MEMORY
  - What context does the LLM need for each decision?
  - How do you retrieve relevant context?
  - How do you manage context window limits?

Step 5: ERROR HANDLING & SAFETY
  - What happens when a tool fails?
  - When does the agent escalate to a human?
  - What are the guardrails and safety constraints?

Step 6: EVALUATION
  - How do you measure success?
  - What does the eval dataset look like?
  - What are the key metrics?

Step 7: SCALE & COST
  - How does this work at 10x volume?
  - What is the per-request cost?
  - What can be cached or pre-computed?
```

### Worked Example: "Design an AI Agent for Code Review"

**Step 1: Clarify**

- User: Software developers submitting pull requests
- Scope: Automated first-pass review; humans still do final approval
- Constraints: Must complete within 5 minutes per PR, cost under $0.50 per review
- Input: PR diff, repository context. Output: Review comments on specific lines

**Step 2: Architecture**

```
PR Opened (webhook)
     |
     v
+----+----+    +------------------+
| Diff     |    | Repository Index |
| Parser   |    | - File tree      |
+-+--------+    | - Style guide    |
  |             | - Test patterns  |
  v             | - Past reviews   |
+-+----------+  +--------+---------+
| File-Level  |           |
| Analyzer    |<----------+
| (per file   |
|  in diff)   |
+------+------+
       |
       v
+------+------+
| Comment      |
| Aggregator   |
| - Deduplicate|
| - Prioritize |
| - Format     |
+------+------+
       |
       v
  Post Comments
  via GitHub API
```

**Step 3: Tools**

- `get_diff(pr_id)` - Fetch the PR diff
- `get_file(path, ref)` - Read full file at a specific commit
- `search_codebase(query)` - Semantic search over the repo
- `get_style_guide()` - Retrieve the team's style guide
- `post_comment(file, line, body)` - Post a review comment

**Step 4: Context**

- For each changed file: the full file content (not just the diff), plus related files (imports, tests)
- Style guide and past review patterns
- Context management: process files independently to avoid context overflow; aggregate results at the end

**Step 5: Error Handling**

- Large PRs (>50 files): Review only the most-changed files, note that the review is partial
- Confidence threshold: Only post comments where the model is >80% confident
- Escalation: Flag security-sensitive changes for mandatory human review

**Step 6: Evaluation**

- Ground truth: Past PRs with human review comments
- Metrics: Precision (what % of AI comments are useful), Recall (what % of real issues are caught), False positive rate
- Target: >80% precision, >60% recall

**Step 7: Scale & Cost**

- Process files in parallel (one LLM call per file)
- Cache the repository index; update incrementally on new commits
- Estimated cost: ~2K tokens per file, 20 files avg = 40K tokens/review ~ $0.10 with mid-tier model

### Worked Example: "Design an AI Agent for Trip Planning"

**Step 1: Clarify**

- User: Travelers who want a personalized itinerary
- Scope: Research destinations, create day-by-day plans, book nothing (just recommend)
- Constraints: Should produce a plan within 2 minutes, handle multi-city trips
- Input: Destination, dates, preferences (budget, interests). Output: Day-by-day itinerary with links

**Step 2: Architecture**

```
User Preferences
      |
      v
+-----+-------+
| Preference    |
| Parser        |
| - Dates       |
| - Budget tier |
| - Interests   |
| - Constraints |
+-----+--------+
      |
      v
+-----+--------+    +-------------------+
| Research       |    | Knowledge Sources  |
| Agent          |<-->| - Travel APIs      |
| - Destinations |    | - Review sites     |
| - Activities   |    | - Weather data     |
| - Restaurants  |    | - Event calendars  |
| - Logistics    |    | - Price databases  |
+-----+---------+    +-------------------+
      |
      v
+-----+---------+
| Itinerary      |
| Planner        |
| - Time slots   |
| - Geography    |
|   (minimize    |
|    travel)     |
| - Pacing       |
| - Alternatives |
+-----+---------+
      |
      v
+-----+---------+
| Output         |
| Formatter      |
| - Day-by-day   |
| - Maps links   |
| - Cost estimate |
| - Booking links |
+---------------+
```

**Step 3: Tools**

- `search_attractions(city, category)` - Find things to do
- `search_restaurants(city, cuisine, price)` - Find places to eat
- `get_travel_time(from, to, mode)` - Estimate transit time
- `get_weather(city, dates)` - Weather forecast
- `search_events(city, dates)` - Local events and festivals

**Step 4: Context**

- User preferences persist throughout the session
- Research results are structured (not raw web pages) to minimize token usage
- For multi-city trips, plan each city independently then optimize transitions

**Step 5: Error Handling**

- API failure: Gracefully degrade (skip weather data, estimate travel times)
- Conflicting constraints: Surface trade-offs to the user ("You said budget-friendly and Michelin restaurants -- here are both options")
- Over-packed schedule: Default to 3-4 activities per day, let user adjust

**Step 6: Evaluation**

- User satisfaction surveys on generated itineraries
- Feasibility check: Are the travel times realistic? Are venues open during suggested times?
- A/B test against human-curated itineraries

### More Practice Questions

These are common interview prompts. Practice applying the framework above:

1. **"Design an AI agent for email triage"** -- Classify, prioritize, draft responses, route to the right person.
2. **"Design an AI agent for SQL query generation"** -- Natural language to SQL, validate against schema, handle ambiguity.
3. **"Design an AI agent for document summarization"** -- Handle long documents, multiple formats, preserve key facts.
4. **"Design an AI agent for meeting scheduling"** -- Parse availability, propose times, handle timezone conflicts.
5. **"Design an AI agent for bug reproduction"** -- Given a bug report, set up the environment, reproduce the steps, verify the bug.
6. **"Design an AI agent for infrastructure monitoring"** -- Detect anomalies, diagnose root causes, suggest or execute remediation.
7. **"Design an AI agent for content moderation"** -- Classify content, handle edge cases, minimize false positives while catching policy violations.

For each, identify: the action space, the observation space, the context requirements, the error modes, and the evaluation metrics.

---

## 12. Quick Reference

### Case Study Comparison Table

| System                  | Domain              | Core Loop                       | Action Space                       | Context Strategy                  | Human-in-Loop                    | Key Strength                      | Key Weakness                          |
| ----------------------- | ------------------- | ------------------------------- | ---------------------------------- | --------------------------------- | -------------------------------- | --------------------------------- | ------------------------------------- |
| **Claude Code**         | Coding (CLI)        | Tool-use loop                   | ~10 tools (Read, Edit, Bash, etc.) | Conversation history + sub-agents | Approvals for dangerous ops      | Full OS access, safety invariants | Context window exhaustion             |
| **Devin**               | Coding (Autonomous) | Plan-execute with VM            | Terminal + editor + browser        | Persistent VM state + planner     | Chat interface, can redirect     | Full dev environment, rollback    | Expensive, slow                       |
| **Deep Research**       | Research            | Search-read-synthesize          | Web search + browse                | Iterative gap-filling             | Post-hoc report review           | Multi-source synthesis, citations | Slow, cannot access paywalled content |
| **Copilot Workspace**   | Coding (GitHub)     | Spec->plan->code->test          | File edits + test execution        | Repo index + issue context        | Editable at every stage          | Structured pipeline, repo-aware   | Rigid linear flow                     |
| **Cursor/Windsurf**     | Coding (IDE)        | Multiple modes (tab/chat/agent) | Code completion + edits            | Codebase embeddings + LSP         | Accept/reject suggestions        | Low-latency tab completion        | IDE vendor lock-in                    |
| **Customer Support**    | Support             | Classify->route->respond        | Lookup, refund, escalate           | RAG over knowledge base           | Escalation to human agents       | 24/7 availability, consistency    | Cannot handle novel situations        |
| **Data Analysis**       | Analytics           | Generate->execute->inspect      | Python code in sandbox             | Data profiling + prior outputs    | User asks follow-up questions    | Natural language to insight       | Sandbox compute limits                |
| **Workflow Automation** | Business Ops        | Trigger->process->route->act    | API calls across services          | Per-step structured data          | Review queues for low confidence | Plugs into existing systems       | Limited cross-step context            |
| **Browser Agents**      | Web Tasks           | Observe page->decide->act       | Click, type, navigate, scroll      | Screenshot or accessibility tree  | User monitors and redirects      | Adapts to UI changes              | Slow, expensive, non-deterministic    |

### Architecture Pattern Quick Reference

| Pattern                       | When to Use                                     | Example Systems                       |
| ----------------------------- | ----------------------------------------------- | ------------------------------------- |
| **Tool-use loop**             | Agent needs to take actions and observe results | Claude Code, Cursor Agent Mode        |
| **Plan-then-execute**         | Task requires multi-step coordination           | Devin, Copilot Workspace              |
| **RAG + generate**            | Answers must be grounded in a knowledge base    | Customer Support, Deep Research       |
| **Code-gen + sandbox**        | Task requires computation or data manipulation  | Data Analysis agents                  |
| **Classify + route**          | Input needs to be triaged to different handlers | Customer Support, Workflow Automation |
| **Observe + act (browser)**   | Task requires interacting with web UIs          | Browser Agents                        |
| **Pipeline with checkpoints** | Multi-stage process with human review           | Copilot Workspace                     |
| **Supervisor + workers**      | Complex task decomposable into sub-tasks        | Claude Code sub-agents, Devin planner |

### Decision Framework: Choosing an Agent Architecture

```
Is the task a single-turn generation?
  YES --> Not an agent. Use a simple LLM call.
  NO  --> Continue.

Does the task require taking actions in the world?
  YES --> Tool-use loop or plan-then-execute
  NO  --> RAG + generate (research/Q&A)

Does the task require multiple tools in sequence?
  YES --> Does order matter?
    YES --> Plan-then-execute (Copilot Workspace pattern)
    NO  --> Parallel tool calls (Claude Code pattern)
  NO  --> Single tool-use loop

Does the task require long-horizon coherence (>20 steps)?
  YES --> Explicit planner + checkpoints (Devin pattern)
  NO  --> Simple tool-use loop with conversation history

Does the task involve untrusted input?
  YES --> Input validation + output guardrails + escalation
  NO  --> Standard error handling

What is the latency budget?
  < 1 second  --> Small model, pre-computed, cached
  1-10 seconds --> Standard tool-use loop
  > 10 seconds --> Async execution, progress updates
```

### Key Metrics by Agent Type

| Agent Type     | Primary Metric                   | Secondary Metrics                       |
| -------------- | -------------------------------- | --------------------------------------- |
| Coding Agent   | Task completion rate (SWE-bench) | Token cost per task, time to completion |
| Research Agent | Factual accuracy, source quality | Completeness, citation count            |
| Support Agent  | Resolution rate, CSAT score      | Escalation rate, avg handle time        |
| Data Analysis  | Answer correctness               | Code execution success rate, iterations |
| Workflow Agent | End-to-end success rate          | Latency, cost per run                   |
| Browser Agent  | Task completion rate             | Steps per task, time, cost              |

### Interview Prep Checklist

Before your interview, make sure you can:

- [ ] Draw the tool-use loop from memory and explain each component
- [ ] Design an action space for a given domain (what tools, what schemas)
- [ ] Explain 3 context management strategies and their trade-offs
- [ ] Describe how you would evaluate an agent system (metrics, dataset, methodology)
- [ ] Walk through error handling for 3 different failure modes
- [ ] Discuss cost optimization at scale (model routing, caching, batching)
- [ ] Explain when to use human-in-the-loop and how to implement escalation
- [ ] Compare two real-world agent systems and articulate their architectural differences
- [ ] Design an agent system end-to-end in 30 minutes using the framework from Section 11
- [ ] Discuss one anti-pattern you have seen and how you would fix it
