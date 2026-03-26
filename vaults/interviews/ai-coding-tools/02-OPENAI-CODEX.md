# OpenAI Codex -- Comprehensive Guide

A deep-dive into OpenAI Codex, a coding agent available through the CLI, IDE extensions,
desktop app, and web. Covers installation, architecture, AGENTS.md, configuration, sandbox
model, approval policies, skills, MCP, subagents, and best practices for software engineers.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Installation & Setup](#2-installation--setup)
3. [Configuration System](#3-configuration-system)
4. [AGENTS.md -- Custom Instructions](#4-agentsmd--custom-instructions)
5. [Approval Policies & Security](#5-approval-policies--security)
6. [Sandboxing](#6-sandboxing)
7. [Skills](#7-skills)
8. [Model Context Protocol (MCP)](#8-model-context-protocol-mcp)
9. [Subagents](#9-subagents)
10. [CLI Reference](#10-cli-reference)
11. [Interactive Features](#11-interactive-features)
12. [IDE Integration](#12-ide-integration)
13. [Desktop App & Web](#13-desktop-app--web)
14. [Agents SDK Integration](#14-agents-sdk-integration)
15. [Best Practices](#15-best-practices)
16. [Common Interview Questions](#16-common-interview-questions)
17. [Quick Reference](#17-quick-reference)

---

## 1. Overview & Architecture

### What Is Codex?

Codex is OpenAI's coding agent for software development. It runs locally on your computer
(CLI / IDE) or in the cloud (web / app), operating as an autonomous agent that reads, edits,
tests, and deploys code across entire repositories.

```
+------------------------------------------------------------------+
|                       CODEX ARCHITECTURE                          |
+------------------------------------------------------------------+
|                                                                    |
|  User Prompt  ──>  Agentic Loop  ──>  Tool Execution  ──>  Result |
|                         |                    |                     |
|                    GPT Model            +----+----+                |
|                    (Reasoning)          |    |    |                |
|                                       Read Edit Shell              |
|                                       Search Web Browse            |
|                                       MCP  Agent                   |
|                                                                    |
|  Context:  AGENTS.md + Config + Conversation + File Contents      |
|                                                                    |
|  Security:  Sandbox Layer  +  Approval Policy  +  Permissions     |
+------------------------------------------------------------------+
```

### Key Capabilities

- **Code generation**: Adapts to existing project structure and conventions
- **Codebase comprehension**: Understands complex and legacy systems
- **Code review**: Identifies bugs, logic errors, and edge cases
- **Debugging**: Traces failures and suggests targeted fixes
- **Task automation**: Refactoring, testing, migrations, and setup workflows
- **Multi-agent orchestration**: Spawn specialized subagents for parallel work

### Available Interfaces

| Interface | Description | Key Feature |
|-----------|-------------|-------------|
| **CLI** | Full-screen terminal UI | Pipe, script, automate |
| **IDE Extension** | VS Code, Cursor, Windsurf | Slash commands, inline |
| **Desktop App** | macOS standalone | Project sidebar, threads |
| **Web** | Cloud-based at chatgpt.com/codex | No local setup |

### Models

| Model | Description |
|-------|-------------|
| `gpt-5.4` | Flagship -- combines coding, reasoning, and tool use |
| `gpt-5.4-mini` | Fast/cheap for lighter tasks and subagents |
| `gpt-5.3-codex` | Industry-leading coding model for complex SE tasks |
| `gpt-5.3-codex-spark` | Near-instant iteration (ChatGPT Pro only, research preview) |

Switch mid-session with `/model` or at launch with `--model`.

### Reasoning Effort Levels

| Level | Use Case |
|-------|----------|
| `minimal` | Trivial lookups |
| `low` | Simple, scoped edits |
| `medium` | Recommended default for interactive coding |
| `high` | Complex multi-file changes |
| `xhigh` | Lengthy agentic tasks requiring deep reasoning |

```toml
model_reasoning_effort = "medium"
```

---

## 2. Installation & Setup

### Installation Methods

**npm (recommended):**
```bash
npm install -g @openai/codex
```

**Homebrew:**
```bash
brew install --cask codex
```

**Manual download:** Platform-specific binaries from GitHub Releases.

### Authentication

```bash
codex login
```

Two methods:
1. **ChatGPT Account** (recommended): OAuth sign-in with Plus, Pro, Team, Edu, or Enterprise
2. **API Key**: For programmatic access

### First Run

```bash
cd your-project
codex              # Launches interactive TUI
```

---

## 3. Configuration System

### Configuration Layers

Codex reads settings from multiple layers with clear precedence:

```
Precedence (highest to lowest):
┌────────────────────────────────────┐
│  CLI flags and --config overrides  │
├────────────────────────────────────┤
│  Profile values (--profile <name>) │
├────────────────────────────────────┤
│  Project config (.codex/config.toml│
│  closest to CWD wins)             │
├────────────────────────────────────┤
│  User config (~/.codex/config.toml)│
├────────────────────────────────────┤
│  System config (/etc/codex/...)    │
├────────────────────────────────────┤
│  Built-in defaults                 │
└────────────────────────────────────┘
```

### config.toml Format

```toml
# ~/.codex/config.toml

# Model selection
model = "gpt-5.4"

# Approval policy: untrusted | on-request | never
approval_policy = "on-request"

# Sandbox mode: read-only | workspace-write | danger-full-access
sandbox_mode = "workspace-write"

# Reasoning effort: low | medium | high
model_reasoning_effort = "high"

# Web search: cached | live | disabled
web_search = "cached"

# Communication style: friendly | pragmatic | none
personality = "friendly"

# Shell environment
[shell_environment_policy]
include_only = ["PATH", "HOME"]

# Feature flags
[features]
shell_snapshot = true
web_search = true
multi_agent = true
personality = true

# MCP servers
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# Writable directories
[sandbox_workspace_write]
writable_roots = ["/path/to/additional/dir"]
```

### Project-Level Configuration

Create `.codex/config.toml` in your project root for team-shared settings:

```toml
# .codex/config.toml
model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

### Feature Flags

Enable/disable features via config or CLI:

```bash
codex --enable multi_agent
codex --disable web_search
```

```toml
[features]
shell_snapshot = true
web_search = true
multi_agent = true
```

### Configuration Profiles

Define named profiles for different workflows:

```toml
# In config.toml
[profiles.fast]
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"

[profiles.thorough]
model = "gpt-5.4"
model_reasoning_effort = "xhigh"
```

```bash
codex --profile fast "fix the typo"
codex --profile thorough "refactor the auth system"
```

### Custom Model Providers

```toml
[model_providers.azure]
base_url = "https://my-azure.openai.azure.com/v1"
env_key = "AZURE_API_KEY"
```

For data residency: `base_url = "https://us.api.openai.com/v1"`

---

## 4. AGENTS.md -- Custom Instructions

### What Is AGENTS.md?

AGENTS.md provides persistent instructions and context to Codex before any work begins. It's
analogous to Claude Code's CLAUDE.md but follows a different discovery mechanism.

### Discovery Mechanism

Codex builds an instruction chain by scanning directories:

```
1. Global scope (~/.codex):
   AGENTS.override.md → AGENTS.md

2. Project scope (git root → CWD):
   Walk from git root toward CWD, checking each level for:
   AGENTS.override.md → AGENTS.md

3. Merge order: Root files first, closer files override
```

**Key rules:**
- Files concatenate from root downward; closer files take precedence
- Empty files are skipped automatically
- Maximum size: `project_doc_max_bytes` (32 KiB default)
- Codex rebuilds the instruction chain on every run (no caching)

### Creating Global Guidance

```bash
mkdir -p ~/.codex
cat > ~/.codex/AGENTS.md << 'EOF'
# Global Preferences

## Testing
- Always run tests before committing
- Use pytest for Python projects
- Prefer integration tests over mocks

## Code Style
- Use type hints in Python
- Prefer functional patterns
- Keep functions under 50 lines
EOF
```

### Layering Project Instructions

```
my-project/
├── AGENTS.md                        # Repository-wide expectations
├── services/
│   └── payments/
│       └── AGENTS.override.md       # Payments-specific rules
└── .codex/
    └── config.toml                  # Project configuration
```

### Override Files

`AGENTS.override.md` takes precedence over `AGENTS.md` at the same directory level.
Use for temporary overrides without modifying the base file.

### Custom Fallback Filenames

```toml
# In config.toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536
```

### Verification

```bash
codex --ask-for-approval never "Summarize the instructions you loaded"
```

### Writing Effective Instructions

Similar to CLAUDE.md, focus on:

```markdown
# AGENTS.md

## Repository Layout
- API endpoints in src/api/
- Business logic in src/services/
- Database models in src/models/

## Build & Test
- `npm test` runs the test suite
- `npm run lint` checks style
- `npm run build` creates production build

## Conventions
- Use kebab-case for URLs
- Use camelCase for JSON properties
- Always validate input at API boundaries

## Constraints
- Never modify migration files after merge
- All API changes need OpenAPI spec updates
- Max response time: 200ms for P99
```

---

## 5. Approval Policies & Security

### Two Security Layers

Codex security is built on two independent layers:

```
┌─────────────────────────────────────────────┐
│  Layer 1: SANDBOX (Technical Boundaries)    │
│  What Codex CAN do technically              │
│  - Filesystem access (read/write scope)     │
│  - Network access (allowed/blocked)         │
│  - Command execution scope                  │
├─────────────────────────────────────────────┤
│  Layer 2: APPROVAL POLICY (Human Control)   │
│  When Codex MUST ask before acting          │
│  - File edits                               │
│  - Shell commands                           │
│  - External operations                      │
└─────────────────────────────────────────────┘
```

### Approval Policies

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `untrusted` | Ask before executing non-trusted commands | New/untrusted repos |
| `on-request` | Work within sandbox, ask when exceeding boundaries | Default for most work |
| `never` | No approval prompts | Trusted automation |

### Configuration

```toml
# In config.toml
approval_policy = "on-request"
```

```bash
# CLI override
codex --ask-for-approval on-request
```

### In-Session Control

Use `/permissions` to switch modes during a session.

### The --full-auto Flag

```bash
codex --full-auto
```

Shortcut for:
- `--ask-for-approval on-request`
- `--sandbox workspace-write`

Low-friction automation within safe boundaries.

### The --yolo Flag

```bash
codex --dangerously-bypass-approvals-and-sandbox
# alias: --yolo
```

Bypasses ALL approvals and sandboxing. Only use inside isolated runners (CI containers, VMs).

---

## 6. Sandboxing

### Sandbox Modes

| Mode | Can Read | Can Edit | Can Run Commands | Network |
|------|----------|----------|-----------------|---------|
| `read-only` | Yes | No (needs approval) | No (needs approval) | No |
| `workspace-write` | Yes | Within workspace | Within workspace | No (default) |
| `danger-full-access` | Yes | Anywhere | Anywhere | Yes |

### How It Works -- Defense in Depth

```
┌──────────────────────────────────────────────────┐
│           THREE-LAYER SECURITY MODEL             │
│                                                  │
│  Layer 1: APPROVAL POLICIES                      │
│  When user consent is required                   │
│                                                  │
│  Layer 2: COMMAND SAFETY ANALYSIS                │
│  Classifies commands as safe/unsafe based on     │
│  mutation potential                              │
│                                                  │
│  Layer 3: OS-LEVEL SANDBOXING                    │
│  Platform-native kernel enforcement:             │
│  - macOS: Seatbelt (sandbox-exec, dynamic SBPL)  │
│  - Linux: Bubblewrap (bwrap) + Seccomp syscalls  │
│           Legacy Landlock fallback               │
│  - WSL: Linux sandbox within WSL                 │
│  - Windows: Restricted Tokens (native) or WSL    │
│                                                  │
│  All child processes (git, npm, make, etc.)      │
│  inherit the same sandbox boundaries             │
└──────────────────────────────────────────────────┘
```

### Dynamic Permission Escalation

When a sandbox denial is detected, the ToolOrchestrator can request elevated permissions
from the user. If granted, the sandbox policy widens and the command retries.

### Enterprise Controls

`requirements.toml` can enforce organization-wide constraints:
```toml
# Prevent engineers from disabling security
[forbidden]
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

### Writable Roots

Grant additional directories write access:

```toml
# In config.toml
[sandbox_workspace_write]
writable_roots = ["/path/to/shared-lib", "/path/to/config"]
```

```bash
# CLI flag
codex --add-dir /path/to/additional-dir
```

### Configuration

```bash
# Launch with specific sandbox
codex --sandbox workspace-write

# Full auto = workspace-write + on-request approval
codex --full-auto
```

### Network Access

By default, `workspace-write` mode blocks network access. Enable selectively:

```bash
codex --sandbox danger-full-access  # Enables network (use with caution)
```

---

## 7. Skills

### What Are Skills?

Skills extend Codex with task-specific capabilities by packaging instructions, resources,
and optional scripts. They follow the open [Agent Skills](https://agentskills.io) standard.

### Progressive Disclosure

Codex loads skills in two phases:
1. **Metadata** (name, description, path) -- always in context
2. **Full SKILL.md** -- loaded only when Codex decides to use the skill

### Skill Structure

```
my-skill/
├── SKILL.md                    # Instructions (required)
├── scripts/                    # Executable code (optional)
├── references/                 # Supporting docs (optional)
├── assets/                     # Templates, resources (optional)
└── agents/
    └── openai.yaml             # UI config & dependencies (optional)
```

### Creating Skills

**Using the built-in creator:**
```
$skill-creator
```

**Manual creation:**

```yaml
# .agents/skills/fix-issue/SKILL.md
---
name: fix-issue
description: Fix a GitHub issue by number. Reads the issue, implements changes,
  writes tests, and creates a PR.
---

Fix GitHub issue $ARGUMENTS:

1. Use `gh issue view $ARGUMENTS` to get details
2. Search codebase for relevant files
3. Implement the fix
4. Write and run tests
5. Create a descriptive commit
6. Push and open a PR
```

### Skill Locations

| Scope | Path | Use Case |
|-------|------|----------|
| Project (folder) | `.agents/skills/` in CWD | Folder-specific skills |
| Project (parent) | Parent `.agents/skills/` | Nested repo-wide skills |
| Project (root) | `$REPO_ROOT/.agents/skills/` | Organization defaults |
| User | `$HOME/.agents/skills/` | Personal cross-repo skills |
| Admin | `/etc/codex/skills/` | System-level automation |
| System | Bundled | Built-in skills |

### SKILL.md Format

**Required frontmatter:**
- `name`: Skill identifier
- `description`: Clear scope and trigger conditions

**Body:** Imperative instructions with explicit inputs and outputs.

### Optional Metadata (agents/openai.yaml)

```yaml
interface:
  display_name: "PR Reviewer"
  short_description: "Reviews pull requests"
  icon_small: "./assets/logo.svg"
  brand_color: "#3B82F6"

policy:
  allow_implicit_invocation: false  # Prevent auto-triggering

dependencies:
  tools:
    - type: "mcp"
      value: "github"
```

### Invocation

**Explicit:** Users invoke via `$skill-name` or `/skills` menu
**Implicit:** Codex autonomously selects skills when task matches description
**Control:** Set `allow_implicit_invocation: false` to prevent auto-triggering

### Installing Skills

```bash
$skill-installer linear     # Install from community
```

### Disabling Skills

```toml
# In config.toml
[[skills.config]]
path = "/path/to/skill/SKILL.md"
enabled = false
```

---

## 8. Model Context Protocol (MCP)

### What Is MCP?

MCP connects models to tools and context, enabling Codex to access third-party documentation
and interact with developer tools.

### Supported Transports

| Transport | Description |
|-----------|-------------|
| STDIO | Local process communication |
| Streamable HTTP | Remote server with auth |

### Configuration

**CLI method:**
```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
codex mcp add github -- npx -y @modelcontextprotocol/server-github
```

**Config file:**
```toml
# ~/.codex/config.toml or .codex/config.toml

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }

# HTTP server example
[mcp_servers.remote-docs]
url = "https://docs.example.com/mcp"
bearer_token_env_var = "DOCS_API_TOKEN"
```

### STDIO Server Options

| Option | Required | Description |
|--------|----------|-------------|
| `command` | Yes | Server startup command |
| `args` | No | Command arguments |
| `env` | No | Environment variables |
| `cwd` | No | Working directory |

### HTTP Server Options

| Option | Required | Description |
|--------|----------|-------------|
| `url` | Yes | Server address |
| `bearer_token_env_var` | No | Auth env variable |
| `http_headers` | No | Static or env-based headers |

### Advanced Configuration

```toml
[mcp_servers.my-server]
command = "npx"
args = ["-y", "my-server"]
startup_timeout_sec = 10       # Default: 10
tool_timeout_sec = 60          # Default: 60
enabled_tools = ["read", "search"]   # Allowlist
disabled_tools = ["delete"]          # Denylist
```

### Codex as MCP Server

Codex can itself run as an MCP server, exposing its capabilities to other agents:

```bash
codex mcp-server  # Run Codex as MCP server over stdio
```

This exposes two tools to calling agents:
- `codex` -- initiate new conversations
- `codex-reply` -- continue existing sessions via thread IDs

This enables orchestration via the OpenAI Agents SDK for multi-agent workflows.

### Notable MCP Servers

| Server | Purpose |
|--------|---------|
| OpenAI Docs MCP | Developer documentation search |
| Context7 | Up-to-date developer resources |
| Figma | Design access |
| Playwright | Browser automation |
| Chrome DevTools | Browser debugging |
| GitHub | Repository management |
| Sentry | Error log access |
| Linear | Project management |

---

## 9. Subagents

### What Are Subagents?

Subagents are specialized agents that Codex spawns in parallel for complex tasks. Unlike
single-agent execution, subagents run focused, parallel workstreams and report back.

**Key rule:** Codex only spawns subagents when you explicitly ask.

### Built-in Agents

| Agent | Purpose |
|-------|---------|
| `default` | General-purpose fallback |
| `worker` | Execution-focused (implementation, fixes) |
| `explorer` | Read-heavy codebase exploration |

### Creating Custom Agents

**File format:** TOML files in `~/.codex/agents/` (personal) or `.codex/agents/` (project)

```toml
# .codex/agents/security-reviewer.toml
name = "security-reviewer"
description = "Reviews code for security vulnerabilities"
developer_instructions = """
You are a senior security engineer. Review code for:
- Injection vulnerabilities (SQL, XSS, command injection)
- Authentication and authorization flaws
- Secrets or credentials in code
- Insecure data handling
- OWASP Top 10 violations

Provide specific line references and suggested fixes.
Report findings by severity: Critical > High > Medium > Low.
"""
model = "gpt-5.4"
sandbox_mode = "read-only"
```

### Required Fields

| Field | Description |
|-------|-------------|
| `name` | Agent identifier |
| `description` | When Codex should use this agent |
| `developer_instructions` | Core behavioral guidelines (system prompt) |

### Optional Fields

| Field | Description |
|-------|-------------|
| `nickname_candidates` | Display names for spawned instances |
| `model` | LLM selection |
| `model_reasoning_effort` | Reasoning level |
| `sandbox_mode` | Read-only or write permissions |
| `mcp_servers` | Tool integrations |
| `skills.config` | Custom skills for this agent |

### Global Agent Configuration

```toml
# In config.toml
[agents]
max_threads = 6              # Concurrent agent cap (default: 6)
max_depth = 1                # Nesting depth (default: 1)
job_max_runtime_seconds = 300  # Timeout per worker
```

### Using Subagents

```
# Ask Codex to use subagents
"Use subagents to explore the auth module and API module in parallel"

# Use the /agent command to manage threads
/agent
```

### CSV Batch Processing (Experimental)

For repeated tasks across many items:

```
spawn_agents_on_csv:
  csv_path: /path/to/data.csv
  instruction: "Review {column_name}. Return JSON via report_agent_job_result."
  id_column: unique_identifier
  output_csv_path: /path/to/results.csv
  max_concurrency: 4
  max_runtime_seconds: 300
```

### Best Practices for Subagents

- **Keep agents narrow and opinionated**: One clear job per agent
- **Match tool surface to the job**: Read-only for reviewers, write for implementers
- **Prevent scope drift**: Instructions should constrain the agent's focus
- **Split complex reviews**: e.g., `pr_explorer` (mapping) + `reviewer` (correctness) + `docs_researcher` (verification)

---

## 10. CLI Reference

### Primary Commands

| Command | Status | Description |
|---------|--------|-------------|
| `codex` | Stable | Launch interactive TUI |
| `codex app` | Stable | Launch desktop app (macOS) |
| `codex apply` | Stable | Apply latest diff from cloud task |
| `codex cloud` | Experimental | Interact with cloud tasks |
| `codex completion` | Stable | Generate shell completions |
| `codex exec` | Stable | Non-interactive execution |
| `codex features` | Stable | Manage feature flags |
| `codex fork` | Stable | Fork a session into new thread |
| `codex login` | Stable | Authenticate |
| `codex logout` | Stable | Remove credentials |
| `codex mcp` | Experimental | Manage MCP servers |
| `codex resume` | Stable | Continue previous session |
| `codex sandbox` | Experimental | Run commands in sandbox |

### Global Flags

| Flag | Description |
|------|-------------|
| `--add-dir <path>` | Grant additional directory write access |
| `--ask-for-approval <policy>` | `untrusted` / `on-request` / `never` |
| `--cd <path>` | Set working directory |
| `--config key=value` | Override config values |
| `--full-auto` | Low-friction automation preset |
| `--image <path>` | Attach images to initial message |
| `--model <model>` | Override model |
| `--sandbox <mode>` | `read-only` / `workspace-write` / `danger-full-access` |
| `--search` | Enable live web search |
| `--profile <name>` | Load named config profile |
| `--oss` | Use local open-source model via Ollama |
| `--yolo` | Bypass all approvals and sandbox (dangerous) |

### exec Command (Non-Interactive)

```bash
codex exec "fix all lint errors"                    # Run and exit
codex exec --json "list all endpoints"              # JSON output
codex exec --output-last-message result.txt "task"  # Save to file
codex exec --ephemeral "quick query"                # No session persistence
```

| Flag | Description |
|------|-------------|
| `--color <mode>` | `always` / `never` / `auto` |
| `--ephemeral` | Don't persist session files |
| `--json` | Newline-delimited JSON events |
| `--output-last-message <path>` | Write final message to file |
| `--output-schema <path>` | JSON Schema for validation |
| `--skip-git-repo-check` | Allow running outside git repos |

---

## 11. Interactive Features

### TUI Interface

- Full-screen terminal UI with real-time file reading, editing, and command execution
- Syntax highlighting for markdown code blocks and diffs
- Language-aware formatting

### Session Management

```bash
codex resume       # Continue previous session
codex fork         # Fork session into new thread
```

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/permissions` | Switch approval/sandbox modes |
| `/model` | Switch model mid-session |
| `/review` | Code review mode |
| `/clear` | Reset context |
| `/exit` | End session |
| `/fork` | Fork current session |
| `/theme` | Pick UI theme |
| `/copy` | Copy last output |
| `/compact` | Compress context |
| `/agent` | Manage subagent threads |
| `/skills` | Browse available skills |

### Code Review Mode

```
/review                    # Review current diff
/review HEAD~3..HEAD       # Review specific commits
/review --staged           # Review staged changes
```

The `/review` preset activates a dedicated reviewer that assesses diffs, uncommitted changes,
or specific commits.

### Input Features

- **Image support**: `codex -i screenshot.png "implement this design"`
- **File fuzzy search**: Type `@` for workspace file selection
- **Shell injection**: Prefix lines with `!` to run commands
- **External editor**: `Ctrl+G` opens `$EDITOR`

### Web Search

```bash
codex --search                        # Enable live web search
```

```toml
# In config.toml
web_search = "cached"    # cached | live | disabled
```

---

## 12. IDE Integration

### VS Code / Cursor / Windsurf

Install the Codex extension from the marketplace. Features:

- Slash commands in editor
- Inline code suggestions
- Settings integration
- File context sharing

### Configuration

IDE settings mirror CLI config:

```toml
# .codex/config.toml works for both CLI and IDE
model = "gpt-5.4"
approval_policy = "on-request"
```

---

## 13. Desktop App & Web

### Desktop App

```bash
codex app    # Launch desktop app (macOS)
```

**Features:**
- Project sidebar with file browser
- Thread management (multiple conversations)
- Review pane for diff inspection
- Automation scheduling

### Web Interface

Available at `chatgpt.com/codex`:
- Cloud-based execution
- Environment management
- Internet connectivity control
- No local setup required

### Automations (App Only)

Schedule recurring workflows:
- Target project selection
- Prompt (can invoke skills)
- Execution cadence
- Environment choice (worktree or local)

**Use cases:**
- Morning PR review summaries
- Overnight CI failure analysis
- Weekly dependency audits
- Daily standup summaries
- Post-merge doc sync

### GitHub Actions

Codex provides a GitHub Action for CI/CD integration:

```yaml
# .github/workflows/codex-review.yml
name: Codex Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openai/codex-action@v1
        with:
          prompt: "Review this PR for security issues"
          model: gpt-5.4
          sandbox: read-only
          safety-strategy: drop-sudo
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

**Safety strategies:**
- `drop-sudo` (default): Drop elevated privileges
- `unprivileged-user`: Run as unprivileged user
- `unsafe`: No safety restrictions (not recommended)

**Cloud integration:**
- Tag `@codex` on GitHub issues and PRs for Codex to propose changes
- Codex creates PRs from its work automatically

---

## 14. Agents SDK Integration

### Codex as MCP Server

Expose the CLI as an MCP server and orchestrate with the OpenAI Agents SDK:

```
┌──────────────────────────────────┐
│         AGENTS SDK               │
│                                  │
│  Orchestrator Agent              │
│       │                          │
│  ┌────┴────┐                     │
│  │ Codex   │ ← MCP Server       │
│  │ CLI     │                     │
│  │         │                     │
│  │ Read    │                     │
│  │ Edit    │                     │
│  │ Shell   │                     │
│  └─────────┘                     │
│                                  │
│  Deterministic, reviewable       │
│  workflows that scale from       │
│  single agent to complete        │
│  software delivery pipeline      │
└──────────────────────────────────┘
```

**Use cases:**
- Multi-agent orchestration for large refactors (500+ files)
- Deterministic execution for auditable rollouts
- Specialized agent teams with gating logic
- Framework migrations at scale

---

## 15. Best Practices

### Prompting Structure

Include four elements in every prompt:

| Element | Purpose | Example |
|---------|---------|---------|
| **Goal** | What to change/build | "Add rate limiting to API" |
| **Context** | Relevant files/errors | "Check src/middleware/" |
| **Constraints** | Standards to follow | "Follow existing middleware pattern" |
| **Done when** | Success criteria | "Tests pass, lint clean" |

### Planning Before Coding

For complex tasks:
1. Request plan mode: "Plan this before implementing"
2. Let Codex interview you about assumptions
3. Review the plan
4. Implement with verification

### AGENTS.md Best Practices

| Include | Exclude |
|---------|---------|
| Repository layout | Obvious file structures |
| Build/test/lint commands | Standard CLI usage |
| Engineering conventions | Default language patterns |
| Constraints and prohibitions | Aspirational ideals |
| Success criteria | Vague quality goals |

### Testing & Review

Always require:
- Test creation or updates
- Running relevant test suites
- Lint and type checking
- Final behavior confirmation
- Diff review for bugs/regressions

Use `/review` for structured code reviews.

### Configuration Strategy

| Situation | Recommended Config |
|-----------|-------------------|
| New/untrusted repo | `approval_policy = "untrusted"` |
| Daily development | `approval_policy = "on-request"` |
| Trusted automation | `approval_policy = "never"`, in sandbox |
| CI/CD pipeline | `codex exec` + `--full-auto` |

### Session Management

- **One thread per task** -- Keep conversations focused
- **Fork when work branches** -- Don't mix unrelated tasks
- **Use subagents** for bounded exploration, testing, or triage
- **Resume sessions** for ongoing work

### Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Embedding durable rules in prompts | Put them in AGENTS.md |
| Omitting build/test commands | Document in AGENTS.md |
| Skipping planning on complex tasks | Request plan mode first |
| Full permissions before understanding | Start with defaults, loosen as needed |
| Parallel work on same files | Use worktrees |
| One thread per project | One thread per task |
| Micromanaging Codex | Work in parallel, review results |

### MCP Integration Strategy

Start small:
1. Add 1-2 tools that remove actual manual loops
2. Pair MCP with skills for reliable workflows
3. Don't wire in every tool you use
4. Expand based on real usage patterns

---

## 16. Common Interview Questions

### Conceptual

1. **What is Codex and how does it differ from GPT in ChatGPT?**
   - Codex is an agentic coding tool, not a chatbot
   - It reads files, runs commands, edits code, creates PRs
   - Two security layers: sandbox (technical) + approval policy (human)
   - Available as CLI, IDE extension, desktop app, and web

2. **Explain the sandbox model.**
   - Three modes: read-only, workspace-write (default), danger-full-access
   - OS-level enforcement (macOS sandbox, Linux Landlock/seccomp)
   - Commands spawned by Codex inherit sandbox boundaries
   - Network access blocked by default in workspace-write

3. **How do approval policies work?**
   - Three levels: untrusted (ask often), on-request (ask at boundary), never
   - Independent from sandbox -- sandbox defines what's possible, approval defines when to ask
   - `--full-auto` = workspace-write + on-request (safe automation)
   - `--yolo` bypasses everything (only in isolated environments)

4. **How does AGENTS.md compare to CLAUDE.md?**
   - AGENTS.md: Walks git root → CWD, supports override files, TOML config
   - CLAUDE.md: Walks CWD → root, supports `@imports`, JSON settings
   - Both: Persistent instructions loaded every session
   - AGENTS.md: Shared open standard across tools

5. **What are skills and how do they work?**
   - Packaged instructions with progressive disclosure
   - SKILL.md with name/description frontmatter
   - Implicit (Codex decides) or explicit (user invokes) triggering
   - Can include scripts, references, and templates

### Practical

6. **How would you set up Codex for a team?**
   - Create AGENTS.md with repo layout, commands, conventions
   - Set up `.codex/config.toml` with model, sandbox, approval settings
   - Create skills for common workflows (deploy, review, fix-issue)
   - Configure MCP for external tools (GitHub, Linear, Sentry)
   - Define custom agents for specialized tasks

7. **How do you handle security in Codex?**
   - Start with `workspace-write` sandbox + `on-request` approval
   - Use writable_roots for specific additional directories
   - Never use `--yolo` outside isolated CI/CD containers
   - Review diffs before committing
   - Use `/review` for structured code review

8. **When should you use subagents vs. single-agent?**
   - Subagents: parallel exploration, bounded tasks, complex multi-step
   - Single: simple changes, iterative refinement, small scope
   - Subagents consume more tokens
   - Split by concern: explorer, reviewer, implementer

---

## 17. Quick Reference

### File Locations

| File | Purpose |
|------|---------|
| `~/.codex/config.toml` | User configuration |
| `.codex/config.toml` | Project configuration |
| `~/.codex/AGENTS.md` | Global instructions |
| `AGENTS.md` | Project instructions |
| `AGENTS.override.md` | Override instructions |
| `~/.codex/agents/*.toml` | Personal custom agents |
| `.codex/agents/*.toml` | Project custom agents |
| `~/.agents/skills/*/SKILL.md` | Personal skills |
| `.agents/skills/*/SKILL.md` | Project skills |
| `~/.codex/log/` | Log files |

### Essential Commands

```bash
codex                      # Interactive TUI
codex exec "prompt"        # Non-interactive
codex resume               # Resume session
codex fork                 # Fork session
codex app                  # Desktop app
codex mcp add <name>       # Add MCP server
codex login                # Authenticate
codex --full-auto          # Safe automation
```

### Essential Slash Commands

```
/permissions   # Switch approval/sandbox modes
/model         # Switch model
/review        # Code review mode
/clear         # Reset context
/fork          # Fork session
/theme         # UI theme
/copy          # Copy output
/compact       # Compress context
/agent         # Manage subagents
/skills        # Browse skills
```

### Sandbox Quick Reference

```bash
codex --sandbox read-only              # Most restrictive
codex --sandbox workspace-write        # Default, safe
codex --sandbox danger-full-access     # Unrestricted
codex --full-auto                      # workspace-write + on-request
codex --yolo                           # No sandbox, no approvals
```
