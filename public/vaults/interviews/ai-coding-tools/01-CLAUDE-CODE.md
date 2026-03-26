# Claude Code (Anthropic) -- Comprehensive Guide

A deep-dive into Claude Code, Anthropic's agentic coding tool that reads your codebase,
edits files, runs commands, and integrates with your development tools. Covers installation,
the agentic loop, memory system, skills, hooks, MCP, sub-agents, permissions, the Agent SDK,
and best practices for software engineers.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Installation & Setup](#2-installation--setup)
3. [The Agentic Loop](#3-the-agentic-loop)
4. [Memory System (CLAUDE.md)](#4-memory-system-claudemd)
5. [Auto Memory](#5-auto-memory)
6. [Skills](#6-skills)
7. [Hooks](#7-hooks)
8. [Model Context Protocol (MCP)](#8-model-context-protocol-mcp)
9. [Sub-Agents](#9-sub-agents)
10. [Permissions & Security](#10-permissions--security)
11. [CLI Reference & Non-Interactive Mode](#11-cli-reference--non-interactive-mode)
12. [IDE Integration](#12-ide-integration)
13. [GitHub Actions & CI/CD](#13-github-actions--cicd)
14. [Agent SDK](#14-agent-sdk)
15. [Best Practices](#15-best-practices)
16. [Common Interview Questions](#16-common-interview-questions)
17. [Quick Reference](#17-quick-reference)

---

## 1. Overview & Architecture

### What Is Claude Code?

Claude Code is an agentic coding tool powered by Claude (Anthropic's LLM). Unlike traditional
code assistants that auto-complete lines, Claude Code operates as a fully autonomous agent:

```
+------------------------------------------------------------------+
|                      CLAUDE CODE ARCHITECTURE                     |
+------------------------------------------------------------------+
|                                                                    |
|  User Prompt  ──>  Agentic Loop  ──>  Tool Execution  ──>  Result |
|                         |                    |                     |
|                    Claude LLM           +----+----+                |
|                    (Reasoning)          |    |    |                |
|                                       Read Edit Bash              |
|                                       Grep Write Glob             |
|                                       MCP  Agent WebFetch         |
|                                                                    |
|  Context:  CLAUDE.md + Auto Memory + Conversation + File Contents |
+------------------------------------------------------------------+
```

**Key capabilities:**
- Read and navigate entire codebases
- Edit files across multiple directories
- Run shell commands (build, test, lint, deploy)
- Create git commits and pull requests
- Connect to external tools via MCP
- Delegate work to specialized sub-agents
- Schedule recurring tasks

### Available Surfaces

| Surface | Description | Key Feature |
|---------|-------------|-------------|
| **Terminal CLI** | Full-featured command-line tool | Pipe, script, automate |
| **VS Code** | Extension with inline diffs | @-mentions, plan review |
| **JetBrains** | Plugin for IntelliJ, PyCharm, etc. | Interactive diff viewing |
| **Desktop App** | Standalone application | Multi-session, scheduling |
| **Web** | Browser-based at claude.ai/code | No local setup needed |
| **iOS** | Claude iOS app | Mobile task kickoff |

All surfaces connect to the same underlying engine -- CLAUDE.md files, settings, and MCP
servers work across all of them.

---

## 2. Installation & Setup

### Installation Methods

**Native Install (Recommended -- auto-updates):**

```bash
# macOS / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex

# Windows CMD
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

**Package Managers (manual updates):**

```bash
# Homebrew
brew install --cask claude-code

# WinGet
winget install Anthropic.ClaudeCode
```

### First Run

```bash
cd your-project
claude          # Launches interactive mode
                # Prompts for login on first use
```

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key for Console users |
| `CLAUDE_CODE_USE_BEDROCK=1` | Route through AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX=1` | Route through Google Vertex |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | Disable auto memory |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` | Trigger compaction earlier |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Disable background tasks |

---

## 3. The Agentic Loop

Claude Code operates in an agentic loop: it reasons about your request, selects tools,
executes them, observes results, and repeats until the task is complete.

```
User Prompt
    │
    ▼
┌─────────────────────────────────┐
│         AGENTIC LOOP            │
│                                 │
│  1. Reason about the task       │
│  2. Select appropriate tool     │
│  3. Execute tool (with perms)   │
│  4. Observe result              │
│  5. Decide: done or continue?   │
│         │                       │
│         ▼                       │
│    If not done → go to step 1   │
│    If done → return response    │
└─────────────────────────────────┘
    │
    ▼
Response to User
```

### Available Tools

| Tool | Purpose |
|------|---------|
| `Read` | Read files from filesystem |
| `Edit` | Make targeted edits to files |
| `Write` | Create or overwrite files |
| `Bash` | Execute shell commands |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `Agent` | Delegate to sub-agents |
| `WebFetch` | Fetch web content |
| `WebSearch` | Search the web |
| `LSP` | Language server operations |
| `TodoWrite` | Track task progress |
| `MCP tools` | Any connected MCP server tools |

### Context Window Management

The context window is Claude Code's most critical resource. It holds:
- Your conversation history
- Every file Claude reads
- Every command output
- CLAUDE.md contents
- Auto memory

**Auto-compaction** triggers at ~95% capacity, summarizing older context while preserving
code patterns, file states, and key decisions.

**Manual controls:**
- `/clear` -- Reset context between unrelated tasks
- `/compact <instructions>` -- Compact with custom focus
- `/rewind` -- Restore to a previous checkpoint
- `/btw` -- Quick question without growing context

---

## 4. Memory System (CLAUDE.md)

### What Is CLAUDE.md?

CLAUDE.md files are markdown files that give Claude persistent instructions. They're loaded
at the start of every session and carry knowledge across conversations.

### File Hierarchy

```
Precedence (highest to lowest):
┌────────────────────────────────────────────────────────┐
│  Managed Policy                                        │
│  /Library/Application Support/ClaudeCode/CLAUDE.md     │
│  (macOS) -- Organization-wide, cannot be excluded      │
├────────────────────────────────────────────────────────┤
│  Project Instructions                                  │
│  ./CLAUDE.md  or  ./.claude/CLAUDE.md                  │
│  (Shared with team via version control)                │
├────────────────────────────────────────────────────────┤
│  User Instructions                                     │
│  ~/.claude/CLAUDE.md                                   │
│  (Personal preferences, all projects)                  │
├────────────────────────────────────────────────────────┤
│  Parent / Ancestor Directories                         │
│  (Walked up from CWD, loaded at launch)                │
├────────────────────────────────────────────────────────┤
│  Child / Subdirectories                                │
│  (Loaded on demand when Claude reads files there)      │
└────────────────────────────────────────────────────────┘
```

### Writing Effective Instructions

**Target:** Under 200 lines per CLAUDE.md file.

**Structure:** Use markdown headers and bullets. Organized sections are easier to follow.

**Specificity:** Concrete, verifiable instructions work best:

```markdown
# CLAUDE.md

## Build & Test
- Run `npm test` before committing
- Use `npm run lint:fix` for auto-fixing

## Code Style
- Use ES modules (import/export), not CommonJS (require)
- Destructure imports when possible
- Use 2-space indentation

## Architecture
- API handlers live in src/api/handlers/
- Business logic in src/services/
- Database queries in src/repositories/

## Workflow
- Always typecheck after a series of code changes
- Prefer running single tests over the full suite
```

### Importing Files

Use `@path/to/import` syntax to include additional files:

```markdown
See @README.md for project overview.
See @package.json for available npm commands.

# Personal overrides (not checked in)
@~/.claude/my-project-instructions.md
```

### Project Rules (`.claude/rules/`)

For larger projects, organize instructions into modular rule files:

```
.claude/
├── CLAUDE.md              # Main project instructions
└── rules/
    ├── code-style.md      # Code style guidelines
    ├── testing.md          # Testing conventions
    ├── security.md         # Security requirements
    └── frontend/
        └── react.md        # React-specific rules
```

**Path-specific rules** only load when Claude works with matching files:

```yaml
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
- All API endpoints must include input validation
- Use the standard error response format
```

### AGENTS.md Compatibility

If your repo uses `AGENTS.md` for other tools, import it from CLAUDE.md:

```markdown
@AGENTS.md

## Claude Code Specific
Use plan mode for changes under `src/billing/`.
```

### Scaffolding with /init

Run `/init` to auto-generate a starter CLAUDE.md based on your codebase. It detects build
systems, test frameworks, and code patterns.

---

## 5. Auto Memory

Auto memory lets Claude accumulate knowledge across sessions without you writing anything.

### How It Works

- Claude saves notes about build commands, debugging insights, code style preferences
- Stored in `~/.claude/projects/<project>/memory/`
- `MEMORY.md` acts as an index (first 200 lines loaded every session)
- Detailed notes go into topic files (loaded on demand)
- All worktrees within the same git repo share one memory directory

### Storage Structure

```
~/.claude/projects/<project>/memory/
├── MEMORY.md              # Index, loaded every session
├── debugging.md           # Debugging patterns
├── api-conventions.md     # API design decisions
└── ...                    # Topic files Claude creates
```

### Configuration

```json
// Disable auto memory
{ "autoMemoryEnabled": false }

// Custom memory directory
{ "autoMemoryDirectory": "~/my-custom-memory-dir" }
```

### Key Behaviors

- Claude decides what's worth remembering based on usefulness for future conversations
- When you correct Claude ("always use pnpm, not npm"), it saves the correction
- Plain markdown files you can edit or delete anytime
- Run `/memory` to browse and manage memory files

---

## 6. Skills

Skills extend Claude's capabilities with reusable instructions and workflows.

### What Are Skills?

A skill is a `SKILL.md` file with instructions that Claude can load on demand or that you
invoke directly with `/skill-name`. Skills follow the [Agent Skills](https://agentskills.io)
open standard.

### Creating a Skill

```
~/.claude/skills/explain-code/
└── SKILL.md
```

```yaml
---
name: explain-code
description: Explains code with visual diagrams and analogies. Use when
  explaining how code works or when the user asks "how does this work?"
---

When explaining code, always include:
1. **Start with an analogy** from everyday life
2. **Draw a diagram** using ASCII art
3. **Walk through the code** step by step
4. **Highlight a gotcha** or common misconception
```

### Skill Locations

| Scope | Path | Applies To |
|-------|------|------------|
| Enterprise | Managed settings | All users in org |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where plugin is enabled |

### Frontmatter Reference

| Field | Description |
|-------|-------------|
| `name` | Display name, becomes `/slash-command` |
| `description` | When Claude should use this skill |
| `disable-model-invocation` | `true` = only manual invocation |
| `user-invocable` | `false` = only Claude can invoke |
| `allowed-tools` | Restrict tools during skill execution |
| `model` | Model override |
| `effort` | Effort level (`low`, `medium`, `high`, `max`) |
| `context` | Set to `fork` to run in a sub-agent |
| `agent` | Sub-agent type when `context: fork` |
| `hooks` | Lifecycle hooks scoped to this skill |
| `paths` | Glob patterns for auto-activation |
| `shell` | Shell for inline commands (`bash`/`powershell`) |

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `/batch <instruction>` | Orchestrate large-scale parallel changes |
| `/claude-api` | Load Claude API reference material |
| `/debug [description]` | Enable debug logging and troubleshoot |
| `/loop [interval] <prompt>` | Run prompt repeatedly on interval |
| `/simplify [focus]` | Review changed files for quality issues |

### String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to the skill |
| `$ARGUMENTS[N]` | Nth argument (0-based) |
| `$N` | Shorthand for `$ARGUMENTS[N]` |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill |

### Dynamic Context Injection

The `` !`<command>` `` syntax runs shell commands before skill content reaches Claude:

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

### Supporting Files

```
my-skill/
├── SKILL.md              # Main instructions (required)
├── template.md           # Template for Claude to fill in
├── examples/
│   └── sample.md         # Example output
└── scripts/
    └── validate.sh       # Script Claude can execute
```

---

## 7. Hooks

Hooks are user-defined actions that execute automatically at specific points in Claude Code's
lifecycle. Unlike CLAUDE.md instructions (advisory), hooks are deterministic and guaranteed.

### Hook Types

| Type | Description |
|------|-------------|
| `command` | Execute shell commands (JSON input via stdin) |
| `http` | Send POST requests to remote endpoints |
| `prompt` | Single-turn yes/no LLM evaluation |
| `agent` | Spawn sub-agents that can use tools |

### Configuration

```json
// In settings.json (.claude/settings.json or ~/.claude/settings.json)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate-bash.sh",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

### Hook Events

**Session Events:**

| Event | When | Use Case |
|-------|------|----------|
| `SessionStart` | Session begins/resumes | Environment setup |
| `SessionEnd` | Session terminates | Cleanup, logging |
| `InstructionsLoaded` | CLAUDE.md files load | Debug rule loading |

**Tool Events (Most Important):**

| Event | When | Use Case |
|-------|------|----------|
| `PreToolUse` | Before tool execution | Block, allow, or modify |
| `PostToolUse` | After successful execution | Auto-format, lint, validate |
| `PostToolUseFailure` | After tool failure | Error handling |
| `PermissionRequest` | Permission dialog appears | Auto-approve/deny |

**Agent Events:**

| Event | When | Use Case |
|-------|------|----------|
| `SubagentStart` | Sub-agent spawned | Setup, context injection |
| `SubagentStop` | Sub-agent finished | Prevent stopping, cleanup |
| `Stop` | Main agent finishes | Force continuation |

**Other Events:**

| Event | When | Use Case |
|-------|------|----------|
| `UserPromptSubmit` | User submits prompt | Validate, enrich prompts |
| `CwdChanged` | Directory changes | Load per-directory config |
| `FileChanged` | Watched files change | Trigger rebuilds |
| `PreCompact` / `PostCompact` | Context compaction | Preserve/restore state |

### Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| 0 | Success | Parse JSON from stdout |
| 2 | Blocking error | Action blocked, stderr fed to Claude |
| Other | Non-blocking error | Continue, stderr in verbose mode |

### PreToolUse Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",     // or "deny" or "ask"
    "permissionDecisionReason": "Safe pattern",
    "updatedInput": { "command": "safer_command" },
    "additionalContext": "context for Claude"
  }
}
```

### Example: Auto-Format After Edit

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$TOOL_INPUT_FILE\""
          }
        ]
      }
    ]
  }
}
```

### Example: Block Dangerous Commands

```bash
#!/bin/bash
# .claude/hooks/validate-bash.sh
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE 'rm -rf|DROP TABLE|--force'; then
  echo "Blocked: Dangerous command detected" >&2
  exit 2
fi
exit 0
```

---

## 8. Model Context Protocol (MCP)

MCP is an open standard for connecting AI tools to external data sources and services.

### What MCP Enables

- Read design docs from Google Drive
- Update tickets in Jira
- Pull data from Slack
- Query databases
- Interact with Figma designs
- Use custom internal tooling

### Configuration

**CLI method:**

```bash
claude mcp add github -- npx -y @modelcontextprotocol/server-github
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres
```

**Config file (`.mcp.json` at project root):**

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### Transport Types

| Type | Description |
|------|-------------|
| `stdio` | Local process communication |
| `http` | HTTP endpoints |
| `sse` | Server-Sent Events |
| `ws` | WebSocket connections |

### MCP in Sub-Agents

Sub-agents can have their own MCP servers, scoped to their lifecycle:

```yaml
---
name: browser-tester
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github  # Reference already-configured server
---
```

---

## 9. Sub-Agents

Sub-agents are specialized AI assistants that handle specific tasks in their own context window.

### Why Sub-Agents?

- **Preserve context** -- Exploration stays out of your main conversation
- **Enforce constraints** -- Limit tools per sub-agent
- **Specialize behavior** -- Focused system prompts for specific domains
- **Control costs** -- Route tasks to faster, cheaper models (e.g., Haiku)

### Built-in Sub-Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **Explore** | Haiku (fast) | Read-only codebase exploration |
| **Plan** | Inherits | Research for plan mode |
| **General-purpose** | Inherits | Complex multi-step tasks |

### Creating Custom Sub-Agents

**File location:** `.claude/agents/` (project) or `~/.claude/agents/` (personal)

```markdown
---
name: code-reviewer
description: Expert code reviewer. Use after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer. When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Review checklist:
- Code clarity and readability
- Proper error handling
- No exposed secrets
- Input validation
- Test coverage
- Performance considerations

Provide feedback by priority: Critical > Warning > Suggestion
```

### Frontmatter Reference

| Field | Description |
|-------|-------------|
| `name` | Unique identifier (lowercase, hyphens) |
| `description` | When Claude should delegate to this agent |
| `tools` | Allowed tools (inherits all if omitted) |
| `disallowedTools` | Tools to deny |
| `model` | `sonnet`, `opus`, `haiku`, or `inherit` |
| `permissionMode` | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | Maximum agentic turns |
| `skills` | Skills to preload into context |
| `mcpServers` | MCP servers scoped to this agent |
| `hooks` | Lifecycle hooks for this agent |
| `memory` | Persistent memory scope: `user`, `project`, `local` |
| `background` | `true` = always run as background task |
| `effort` | Effort level override |
| `isolation` | `worktree` = run in isolated git worktree |

### Running Sub-Agents

**Natural language:**
```
Use the code-reviewer sub-agent to review auth changes
```

**@-mention (guarantees the agent runs):**
```
@"code-reviewer (agent)" look at the auth changes
```

**Session-wide (agent replaces main system prompt):**
```bash
claude --agent code-reviewer
```

**CLI-defined (ephemeral, for testing):**
```bash
claude --agents '{
  "reviewer": {
    "description": "Code reviewer",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob"],
    "model": "sonnet"
  }
}'
```

### Foreground vs Background

- **Foreground**: Blocks main conversation, permission prompts pass through
- **Background**: Runs concurrently, pre-approved permissions, auto-denies unapproved
- Press `Ctrl+B` to background a running task

### Persistent Memory

```yaml
---
name: code-reviewer
memory: project  # user | project | local
---
```

Enables the sub-agent to build knowledge across sessions in its own memory directory.

---

## 10. Permissions & Security

### Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Standard permission prompts |
| `acceptEdits` | Auto-accept file edits |
| `plan` | Read-only exploration |
| `auto` | Classifier model handles approvals |
| `dontAsk` | Auto-deny (explicitly allowed tools still work) |
| `bypassPermissions` | Skip all prompts (use with caution) |

### Auto Mode

A separate classifier model reviews commands before execution, blocking:
- Scope escalation
- Unknown infrastructure modifications
- Hostile-content-driven actions

```bash
claude --permission-mode auto -p "fix all lint errors"
```

### Sandboxing

OS-level isolation that restricts filesystem and network access:

```bash
claude /sandbox  # Configure sandbox settings
```

### Permission Rules

Configure allowed/denied tools in settings:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(git commit *)",
      "Edit",
      "Write"
    ],
    "deny": [
      "Agent(Explore)",
      "Bash(rm -rf *)"
    ]
  }
}
```

### Settings Hierarchy

| Location | Scope | Shareable |
|----------|-------|-----------|
| Managed policy | Organization-wide | Admin-controlled |
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Project | Yes (commit to repo) |
| `.claude/settings.local.json` | Project (local) | No (gitignored) |

---

## 11. CLI Reference & Non-Interactive Mode

### Interactive Mode

```bash
claude                    # Start interactive session
claude --continue         # Resume most recent session
claude --resume           # Select from recent sessions
claude --agent <name>     # Start as specific agent
claude --model opus       # Use specific model
```

### Non-Interactive Mode

```bash
claude -p "explain this project"              # One-off query
claude -p "list endpoints" --output-format json  # JSON output
claude -p "analyze log" --output-format stream-json  # Streaming
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p "prompt"` | Non-interactive mode |
| `--continue` | Resume last session |
| `--resume` | Pick from recent sessions |
| `--agent <name>` | Run as specific agent |
| `--model <model>` | Override model |
| `--permission-mode <mode>` | Set permission mode |
| `--add-dir <path>` | Add additional directories |
| `--allowedTools <tools>` | Restrict available tools |
| `--output-format <format>` | Output format (text/json/stream-json) |
| `--verbose` | Debug output |
| `--debug` | Enable debug logging |

### Piping & Composition

```bash
# Analyze logs
tail -200 app.log | claude -p "find anomalies"

# Review changed files
git diff main --name-only | claude -p "review for security issues"

# Chain with other tools
claude -p "list all API endpoints" --output-format json | jq '.endpoints[]'
```

### Built-in Commands

| Command | Purpose |
|---------|---------|
| `/help` | Show help |
| `/clear` | Reset context |
| `/compact` | Compact conversation |
| `/rewind` | Restore checkpoint |
| `/memory` | Browse memory files |
| `/init` | Generate starter CLAUDE.md |
| `/permissions` | Manage permissions |
| `/hooks` | Browse configured hooks |
| `/agents` | Manage sub-agents |
| `/sandbox` | Configure sandboxing |
| `/rename` | Rename session |
| `/btw` | Quick question (no context cost) |
| `/context` | Check context usage |
| `/statusline` | Configure status line |
| `Ctrl+G` | Open plan in editor |
| `Esc` | Stop current action |
| `Esc+Esc` | Open rewind menu |

---

## 12. IDE Integration

### VS Code Extension

**Installation:**
- Search "Claude Code" in Extensions (`Cmd+Shift+X`)
- Or install from [VS Code Marketplace](vscode:extension/anthropic.claude-code)

**Key Features:**
- Inline diffs with accept/reject
- `@`-mentions for files and symbols
- Plan review and editing
- Conversation history
- Selection context sharing

### JetBrains Plugin

**Installation:**
- Install from [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/27310-claude-code-beta-)

**Key Features:**
- Interactive diff viewing
- Selection context sharing
- Works with IntelliJ, PyCharm, WebStorm, etc.

---

## 13. GitHub Actions & CI/CD

Claude Code can run in CI/CD pipelines for automated tasks:

```yaml
# .github/workflows/claude-review.yml
name: Claude Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | bash
      - name: Review PR
        run: |
          claude -p "Review this PR for security issues and code quality. \
            Focus on the changed files." \
            --output-format json \
            --permission-mode auto
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Common CI/CD uses:**
- Automated code review on PRs
- Issue triage and labeling
- Translation of new strings
- Documentation generation
- Dependency audit

---

## 14. Agent SDK

The Agent SDK lets you build custom agents powered by Claude Code's tools and capabilities.

### Key Features

- Programmatic access to Claude Code's tool suite
- Full control over orchestration and tool access
- Custom permission configurations
- Multi-agent workflows
- Headless execution for automation

### Usage Pattern

```bash
# Run programmatically
claude -p "your task" --output-format stream-json

# Parse events for custom orchestration
claude -p "task" --output-format stream-json | your-orchestrator
```

### Agent Teams

For tasks requiring multiple agents working in parallel:

```
┌─────────────────────────────────┐
│          AGENT TEAM             │
│                                 │
│  Team Lead ──> Worker 1         │
│           ──> Worker 2          │
│           ──> Worker 3          │
│                                 │
│  Each worker has own context,   │
│  tools, and permissions         │
│                                 │
│  Lead coordinates and merges    │
└─────────────────────────────────┘
```

---

## 15. Best Practices

### The #1 Rule: Give Claude a Way to Verify Its Work

```
# BAD
"implement email validation"

# GOOD
"write a validateEmail function. Test cases: user@example.com → true,
 invalid → false, user@.com → false. Run the tests after implementing."
```

### Workflow: Explore → Plan → Implement → Commit

1. **Explore** (Plan Mode): Read files, understand codebase
2. **Plan**: Create detailed implementation plan
3. **Implement** (Normal Mode): Code with verification
4. **Commit**: Descriptive message, open PR

### Context Management

- **`/clear` between unrelated tasks** -- The single most impactful habit
- **Use sub-agents for investigation** -- Keeps main context clean
- **Scope investigations narrowly** -- Avoid "investigate everything" prompts
- **Track context with status line** -- Monitor context usage continuously

### Prompting Patterns

| Pattern | Example |
|---------|---------|
| Scope the task | "Write a test for foo.py covering the logged-out edge case" |
| Point to sources | "Check ExecutionFactory's git history" |
| Reference patterns | "Follow the pattern in HotDogWidget.php" |
| Describe symptoms | "Login fails after session timeout. Check src/auth/" |

### CLAUDE.md Best Practices

| Include | Exclude |
|---------|---------|
| Commands Claude can't guess | Things Claude infers from code |
| Non-default style rules | Standard language conventions |
| Testing instructions | Detailed API docs (link instead) |
| Branch naming, PR conventions | Frequently changing info |
| Architecture decisions | File-by-file descriptions |
| Common gotchas | "Write clean code" platitudes |

### Common Failure Patterns

| Pattern | Fix |
|---------|-----|
| Kitchen sink session | `/clear` between unrelated tasks |
| Correcting over and over | After 2 failed corrections, `/clear` + better prompt |
| Over-specified CLAUDE.md | Ruthlessly prune, convert to hooks |
| Trust-then-verify gap | Always provide tests/scripts/screenshots |
| Infinite exploration | Scope narrowly or use sub-agents |

### Advanced Patterns

**Fan-out across files:**
```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from React to Vue" \
    --allowedTools "Edit,Bash(git commit *)"
done
```

**Writer/Reviewer pattern:**
- Session A implements the feature
- Session B reviews with fresh context (no bias toward its own code)

**Interview pattern:**
```
I want to build [brief description]. Interview me using AskUserQuestion.
Ask about implementation, UI/UX, edge cases, and tradeoffs.
Keep interviewing until we've covered everything, then write a spec to SPEC.md.
```

---

## 16. Common Interview Questions

### Conceptual

1. **How does Claude Code differ from GitHub Copilot or ChatGPT?**
   - Claude Code is an agentic tool that reads files, runs commands, edits code, and creates PRs
   - It operates in an autonomous loop rather than providing line-level suggestions
   - It has persistent memory, skills, hooks, and sub-agent capabilities

2. **What is the agentic loop and why does it matter?**
   - Reason → select tool → execute → observe → repeat
   - Enables multi-step problem solving without human intervention at each step
   - Context window is the key constraint

3. **How does the memory system work?**
   - Two systems: CLAUDE.md (you write) and auto memory (Claude writes)
   - CLAUDE.md loaded every session, scoped by directory hierarchy
   - Auto memory in `~/.claude/projects/<project>/memory/`, first 200 lines of MEMORY.md

4. **What are hooks and why are they better than CLAUDE.md for some things?**
   - Hooks are deterministic (guaranteed to run), CLAUDE.md is advisory
   - PreToolUse hooks can block/allow/modify tool calls
   - PostToolUse hooks can auto-format, lint, validate
   - Use hooks for actions that must happen every time with zero exceptions

5. **How do sub-agents manage context?**
   - Each sub-agent has its own context window
   - Exploration output stays in sub-agent, only summary returns to main
   - Can run in foreground (blocking) or background (concurrent)

### Practical

6. **How would you set up Claude Code for a new team?**
   - Create CLAUDE.md with build commands, conventions, architecture decisions
   - Set up MCP servers for external tools (Jira, Slack, etc.)
   - Create skills for common workflows (deploy, review, fix-issue)
   - Define sub-agents for specialized tasks (security review, data analysis)
   - Configure hooks for auto-formatting and validation

7. **How do you handle context window limitations?**
   - `/clear` between unrelated tasks
   - Use sub-agents for exploration-heavy work
   - Scope prompts narrowly
   - Run `/compact` with custom instructions
   - Monitor with status line

8. **How would you integrate Claude Code into CI/CD?**
   - Use `claude -p` in GitHub Actions for PR review, issue triage
   - `--permission-mode auto` for unattended execution
   - `--output-format json` for parseable output
   - Schedule recurring tasks for dependency audits, code quality

---

## 17. Quick Reference

### File Locations

| File | Purpose |
|------|---------|
| `CLAUDE.md` or `.claude/CLAUDE.md` | Project instructions |
| `~/.claude/CLAUDE.md` | User instructions |
| `.claude/rules/*.md` | Modular rule files |
| `.claude/skills/<name>/SKILL.md` | Project skills |
| `~/.claude/skills/<name>/SKILL.md` | Personal skills |
| `.claude/agents/<name>.md` | Project sub-agents |
| `~/.claude/agents/<name>.md` | Personal sub-agents |
| `.claude/settings.json` | Project settings |
| `.claude/settings.local.json` | Local settings (gitignored) |
| `~/.claude/settings.json` | User settings |
| `.mcp.json` | MCP server configuration |
| `~/.claude/projects/<project>/memory/` | Auto memory |

### Essential Commands

```bash
claude                     # Interactive mode
claude -p "prompt"         # Non-interactive
claude --continue          # Resume last session
claude --resume            # Pick from sessions
claude --agent <name>      # Run as agent
claude mcp add <name>      # Add MCP server
```

### Essential Slash Commands

```
/init          # Scaffold CLAUDE.md
/clear         # Reset context
/compact       # Compress context
/memory        # Browse memory
/rewind        # Restore checkpoint
/permissions   # Manage permissions
/hooks         # Browse hooks
/agents        # Manage sub-agents
/btw           # Quick question
/batch         # Parallel changes
```
