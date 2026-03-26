# AI Coding Tools: Comparison & Best Practices

A side-by-side comparison of Claude Code and OpenAI Codex, plus universal best practices
for maximizing productivity with AI coding agents. Covers shared patterns, architectural
differences, workflow optimization, and common pitfalls across both tools.

---

## Table of Contents

1. [Side-by-Side Comparison](#1-side-by-side-comparison)
2. [Architecture Comparison](#2-architecture-comparison)
3. [Configuration Comparison](#3-configuration-comparison)
4. [Security Model Comparison](#4-security-model-comparison)
5. [Extensibility Comparison](#5-extensibility-comparison)
6. [Universal Best Practices](#6-universal-best-practices)
7. [Workflow Patterns That Work](#7-workflow-patterns-that-work)
8. [Common Pitfalls & Anti-Patterns](#8-common-pitfalls--anti-patterns)
9. [Team Adoption Strategy](#9-team-adoption-strategy)
10. [Decision Framework: Which Tool to Use](#10-decision-framework-which-tool-to-use)
11. [Interview Questions: Comparative](#11-interview-questions-comparative)
12. [Quick Reference](#12-quick-reference)

---

## 1. Side-by-Side Comparison

### Core Features

| Feature | Claude Code | OpenAI Codex |
|---------|-------------|--------------|
| **Developer** | Anthropic | OpenAI |
| **Primary Model** | Claude Opus 4.6 / Sonnet 4.6 | GPT-5.4 |
| **Pricing** | Claude subscription or API key | ChatGPT Plus/Pro/Business/Enterprise |
| **Open Source** | Partial (Agent SDK) | Yes (Apache-2.0 CLI) |
| **Platforms** | CLI, VS Code, JetBrains, Desktop, Web, iOS | CLI, VS Code, Cursor, Windsurf, Desktop, Web |

### Project Instructions

| Aspect | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| **File Name** | `CLAUDE.md` | `AGENTS.md` |
| **Alt Location** | `.claude/CLAUDE.md` | `.codex/AGENTS.md` |
| **Global** | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` |
| **Override** | N/A (hierarchy is precedence) | `AGENTS.override.md` |
| **Discovery** | Walk CWD upward + subdirs on demand | Walk git root → CWD |
| **Imports** | `@path/to/file` syntax | Not supported (use layering) |
| **Size Limit** | Advisory (~200 lines recommended) | `project_doc_max_bytes` (32 KiB) |
| **Rules Dir** | `.claude/rules/*.md` (path-scoped) | Not supported (use override files) |
| **Cross-tool** | Reads `AGENTS.md` via import | Native format |
| **Scaffolding** | `/init` command | `/init` command |

### Configuration

| Aspect | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| **Format** | JSON (`settings.json`) | TOML (`config.toml`) |
| **User Level** | `~/.claude/settings.json` | `~/.codex/config.toml` |
| **Project Level** | `.claude/settings.json` | `.codex/config.toml` |
| **Local (gitignored)** | `.claude/settings.local.json` | N/A |
| **Managed (org)** | System paths + managed policy | `/etc/codex/config.toml` |
| **Profiles** | N/A | `--profile <name>` |
| **MCP Config** | `.mcp.json` (separate file) | Inline in `config.toml` |

### Skills

| Aspect | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| **Standard** | Agent Skills (agentskills.io) | Agent Skills (agentskills.io) |
| **Location** | `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` |
| **Personal** | `~/.claude/skills/` | `~/.agents/skills/` |
| **Frontmatter** | YAML (name, description, tools, etc.) | YAML (name, description) |
| **Auto-invoke** | Yes (via description matching) | Yes (implicit invocation) |
| **Manual-only** | `disable-model-invocation: true` | `allow_implicit_invocation: false` |
| **Subagent exec** | `context: fork` + `agent: Type` | N/A |
| **Dynamic inject** | `` !`command` `` syntax | N/A |
| **Supporting files** | templates, examples, scripts | scripts, references, assets |
| **Built-in** | `/batch`, `/debug`, `/loop`, `/simplify` | `$skill-creator`, `$skill-installer` |

### Subagents

| Aspect | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| **Format** | Markdown with YAML frontmatter | TOML files |
| **Location** | `.claude/agents/<name>.md` | `.codex/agents/<name>.toml` |
| **Built-in** | Explore, Plan, General-purpose | default, worker, explorer |
| **Auto-spawn** | Yes (based on description) | No (explicit request only) |
| **Model control** | `model: sonnet/opus/haiku/inherit` | `model = "gpt-5.4"` |
| **Tool restriction** | `tools:` allowlist or `disallowedTools:` | Via sandbox + instruction |
| **Persistent memory** | `memory: user/project/local` | N/A (session-based) |
| **Background** | `background: true` or Ctrl+B | Thread management |
| **Isolation** | `isolation: worktree` | Worktree support |
| **Hooks** | Scoped hooks in frontmatter | Via config |
| **MCP per agent** | `mcpServers:` in frontmatter | `mcp_servers` in TOML |
| **Max concurrent** | No built-in limit | `max_threads = 6` |
| **CSV batch** | N/A | `spawn_agents_on_csv` (experimental) |

### Hooks / Lifecycle Automation

| Aspect | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| **System** | Comprehensive hook events | Approval policies + sandbox rules |
| **Events** | PreToolUse, PostToolUse, Stop, etc. | Approval checkpoints |
| **Hook types** | command, http, prompt, agent | Rule-based policies |
| **Granularity** | Per-tool, per-event, with matchers | Per-action category |
| **Auto-format** | PostToolUse hook | Manual configuration |
| **Block commands** | PreToolUse with exit code 2 | Sandbox mode restrictions |
| **Config location** | `settings.json` hooks section | Approval/sandbox in config.toml |

---

## 2. Architecture Comparison

### Agentic Loop

Both tools operate on the same fundamental pattern:

```
┌──────────────────────────────────────────────────┐
│              SHARED AGENTIC PATTERN              │
│                                                  │
│   Prompt → Reason → Select Tool → Execute →      │
│   Observe Result → Decide: Done or Continue?     │
│                                                  │
│   Key difference: HOW tools are managed and      │
│   HOW permissions are enforced                   │
└──────────────────────────────────────────────────┘
```

### Context Management

| Strategy | Claude Code | OpenAI Codex |
|----------|-------------|--------------|
| **Auto-compaction** | ~95% capacity trigger | Similar mechanism |
| **Manual compact** | `/compact <instructions>` | `/compact` |
| **Clear context** | `/clear` | `/clear` |
| **Side questions** | `/btw` (no context cost) | N/A |
| **Checkpoints** | `/rewind` (restore conversation + code) | Session fork |
| **Resume** | `--continue`, `--resume` | `codex resume` |

### Model Routing

| Strategy | Claude Code | OpenAI Codex |
|----------|-------------|--------------|
| **Cost optimization** | Route to Haiku for fast tasks | Reasoning effort levels |
| **Quality max** | Opus for complex reasoning | High reasoning effort |
| **Default** | Inherits session model | gpt-5.4 |
| **Per-agent** | `model:` in agent frontmatter | `model =` in agent TOML |

---

## 3. Configuration Comparison

### Claude Code Settings Example

```json
// .claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(git commit *)",
      "Edit",
      "Write"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ]
  },
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

### OpenAI Codex Config Example

```toml
# .codex/config.toml
model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
model_reasoning_effort = "high"
web_search = "cached"

[sandbox_workspace_write]
writable_roots = ["/path/to/shared-lib"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }

[features]
multi_agent = true
```

---

## 4. Security Model Comparison

```
CLAUDE CODE                           OPENAI CODEX
┌──────────────────────┐              ┌──────────────────────┐
│  Permission Modes    │              │  Approval Policies   │
│  ┌────────────────┐  │              │  ┌────────────────┐  │
│  │ default        │  │              │  │ untrusted      │  │
│  │ acceptEdits    │  │              │  │ on-request     │  │
│  │ plan (readonly)│  │              │  │ never          │  │
│  │ auto (AI)      │  │              │  └────────────────┘  │
│  │ dontAsk        │  │              │                      │
│  │ bypassPerms    │  │              │  Sandbox Modes       │
│  └────────────────┘  │              │  ┌────────────────┐  │
│                      │              │  │ read-only      │  │
│  Sandbox             │              │  │ workspace-write│  │
│  ┌────────────────┐  │              │  │ danger-full    │  │
│  │ OS-level       │  │              │  └────────────────┘  │
│  │ isolation      │  │              │                      │
│  └────────────────┘  │              │  OS-Level Sandbox    │
│                      │              │  ┌────────────────┐  │
│  Hooks               │              │  │ macOS Sandbox  │  │
│  ┌────────────────┐  │              │  │ Linux Landlock │  │
│  │ PreToolUse     │  │              │  │ seccomp        │  │
│  │ (block/allow)  │  │              │  └────────────────┘  │
│  └────────────────┘  │              │                      │
│                      │              │  Convenience Flags   │
│  Permission Rules    │              │  ┌────────────────┐  │
│  ┌────────────────┐  │              │  │ --full-auto    │  │
│  │ allow: [...]   │  │              │  │ --yolo         │  │
│  │ deny: [...]    │  │              │  └────────────────┘  │
│  └────────────────┘  │              │                      │
└──────────────────────┘              └──────────────────────┘

KEY DIFFERENCE:
Claude Code: Fine-grained hooks that can inspect/modify each tool call
OpenAI Codex: Sandbox-first with clear mode boundaries
```

### Security Recommendations

| Scenario | Claude Code | OpenAI Codex |
|----------|-------------|--------------|
| **New repo** | `plan` mode + review | `untrusted` + `read-only` |
| **Daily dev** | `default` + allow rules | `on-request` + `workspace-write` |
| **Trusted auto** | `auto` mode | `--full-auto` |
| **CI/CD** | `auto` + `--permission-mode` | `codex exec --full-auto` |
| **Dangerous** | `bypassPermissions` (caution) | `--yolo` (caution) |

---

## 5. Extensibility Comparison

### Extension Points

```
CLAUDE CODE                              OPENAI CODEX
┌─────────────────────────┐              ┌─────────────────────────┐
│  CLAUDE.md (instructions│              │  AGENTS.md (instructions│
│  .claude/rules/ (scoped)│              │  AGENTS.override.md     │
│                         │              │                         │
│  Skills (SKILL.md)      │              │  Skills (SKILL.md)      │
│  ├─ !`cmd` injection    │              │  ├─ scripts/            │
│  ├─ context: fork       │              │  ├─ references/         │
│  └─ path-scoped         │              │  └─ agents/openai.yaml  │
│                         │              │                         │
│  Hooks (8+ event types) │              │  Approval policies      │
│  ├─ command, http       │              │  └─ 3 policy levels     │
│  ├─ prompt, agent       │              │                         │
│  └─ PreToolUse/PostTool │              │  Sandbox modes          │
│                         │              │  └─ 3 sandbox levels    │
│  Sub-agents (Markdown)  │              │                         │
│  ├─ persistent memory   │              │  Subagents (TOML)       │
│  ├─ scoped MCP          │              │  ├─ CSV batch           │
│  └─ scoped hooks        │              │  └─ max_threads config  │
│                         │              │                         │
│  MCP (.mcp.json)        │              │  MCP (config.toml)      │
│                         │              │                         │
│  Plugins (marketplace)  │              │  Agents SDK integration │
│                         │              │                         │
│  Agent SDK (headless)   │              │  Automations (app)      │
└─────────────────────────┘              └─────────────────────────┘
```

---

## 6. Universal Best Practices

These patterns work regardless of which tool you use.

### 1. Always Provide Verification

The single highest-leverage practice:

```
# BAD (in any tool)
"implement email validation"

# GOOD (in any tool)
"implement email validation with these test cases:
 user@example.com → true, invalid → false, user@.com → false.
 Run the tests after implementing and fix any failures."
```

### 2. Explore → Plan → Implement → Verify

```
Phase 1: EXPLORE
├── Read relevant files
├── Understand existing patterns
└── Identify constraints

Phase 2: PLAN
├── Create implementation plan
├── Identify files to change
└── Define success criteria

Phase 3: IMPLEMENT
├── Write code following plan
├── Run tests incrementally
└── Fix failures immediately

Phase 4: VERIFY
├── Run full test suite
├── Check linting/types
├── Review diff
└── Commit with descriptive message
```

### 3. Write Effective Project Instructions

Whether CLAUDE.md or AGENTS.md:

| Include | Why |
|---------|-----|
| Build/test/lint commands | Agent can't guess your toolchain |
| Non-default conventions | Agent follows language defaults otherwise |
| Architecture decisions | "API in src/api/, logic in src/services/" |
| Constraints | "Never modify migrations after merge" |
| Common gotchas | "Redis must be running for integration tests" |

| Exclude | Why |
|---------|-----|
| Standard language conventions | Agent already knows them |
| File-by-file descriptions | Agent can read the code |
| Detailed API docs | Link to them instead |
| Frequently changing info | Will become stale |
| "Write clean code" | Too vague to be actionable |

### 4. Manage Context Aggressively

Context window is the most important resource:

```
High-Impact Habits:
├── /clear between unrelated tasks
├── Use subagents for exploration (keeps main context clean)
├── Scope prompts narrowly (avoid "investigate everything")
├── Monitor context usage (status line / context commands)
└── Start fresh after 2+ failed corrections
```

### 5. Prompt with Specificity

| Pattern | Bad | Good |
|---------|-----|------|
| **Scope** | "add tests" | "add tests for auth module, covering logged-out edge case" |
| **Source** | "why is the API weird?" | "check the git history of ExecutionFactory" |
| **Pattern** | "add a widget" | "follow the pattern in HotDogWidget.php" |
| **Symptom** | "fix login" | "login fails after timeout. check src/auth/ token refresh" |

### 6. Use Subagents for Bounded Work

- **Exploration**: "Use a subagent to investigate the auth module"
- **Review**: "Use a subagent to review this code for security issues"
- **Testing**: "Use a subagent to run the test suite and report failures"
- **Parallel research**: "Research auth, DB, and API modules in parallel"

### 7. Configure MCP Strategically

1. Start with 1-2 tools that remove real manual loops
2. Pair MCP with skills for reliable workflows
3. Don't wire in every tool you use
4. Expand based on actual usage patterns

### 8. Create Skills for Repeated Workflows

Good skill candidates:
- PR review with team-specific checklist
- Issue fix workflow (read → implement → test → commit → PR)
- Release notes generation
- Log triage and debugging
- Migration patterns
- Deploy workflows

---

## 7. Workflow Patterns That Work

### Pattern 1: Writer / Reviewer

```
Session A (Writer)                    Session B (Reviewer)
─────────────────                    ──────────────────────
"Implement rate limiter"    ──>
                                     "Review rate limiter in
                                      @src/middleware/. Check
                                      for race conditions."
                            <──
"Address review feedback"
```

Fresh context in Session B means no bias toward code it wrote.

### Pattern 2: Interview-Driven Specification

```
"I want to build [feature]. Interview me about:
 - Technical implementation details
 - UI/UX considerations
 - Edge cases and error handling
 - Performance and scaling concerns
 - Security implications

Keep asking until we've covered everything,
then write a complete spec to SPEC.md."
```

Then start a fresh session to implement from the spec.

### Pattern 3: Fan-Out Migrations

```bash
# Generate file list
tool_cmd -p "list all files needing migration" > files.txt

# Process in parallel
for file in $(cat files.txt); do
  tool_cmd non-interactive "Migrate $file from React to Vue"
done
```

### Pattern 4: Skill-Driven Workflows

```yaml
# .claude/skills/fix-issue/SKILL.md  OR  .agents/skills/fix-issue/SKILL.md
---
name: fix-issue
description: Fix a GitHub issue by number
---

1. Read issue details with `gh issue view $ARGUMENTS`
2. Search codebase for relevant files
3. Implement the fix
4. Write and run tests
5. Create descriptive commit
6. Open a PR
```

Invoke: `/fix-issue 1234` (Claude Code) or `$fix-issue 1234` (Codex)

### Pattern 5: Scheduled Automation

| Task | Cadence | Value |
|------|---------|-------|
| Morning PR review summary | Daily 9am | Start day with context |
| CI failure analysis | On failure | Faster debugging |
| Dependency audit | Weekly | Security hygiene |
| Release notes draft | On tag | Save manual effort |
| Standup summary | Daily | Team visibility |

---

## 8. Common Pitfalls & Anti-Patterns

### The Kitchen Sink Session

**Problem:** One session handles unrelated tasks, filling context with irrelevant info.

**Fix:** `/clear` between unrelated tasks. One thread per logical unit of work.

### The Correction Spiral

**Problem:** Correcting the agent 3+ times on the same issue. Context polluted with failures.

**Fix:** After 2 failed corrections, clear context and write a better initial prompt.

### The Over-Specified Instructions File

**Problem:** CLAUDE.md / AGENTS.md is so long the agent ignores important rules.

**Fix:** Ruthlessly prune. If the agent does it correctly without the instruction, remove it.
Convert mandatory behaviors to hooks (Claude Code) or sandbox rules (Codex).

### The Trust-Then-Verify Gap

**Problem:** Agent produces plausible code that doesn't handle edge cases.

**Fix:** Always provide verification criteria (tests, scripts, screenshots).

### The Infinite Exploration

**Problem:** "Investigate everything" prompts that read hundreds of files.

**Fix:** Scope narrowly or delegate to subagents so exploration stays out of main context.

### Premature Permission Escalation

**Problem:** Granting full access before understanding what the agent needs.

**Fix:** Start with defaults. Loosen permissions as you understand the workflow.

### Duplicating Instructions

**Problem:** Putting durable rules in prompts instead of project instruction files.

**Fix:** If you'd type it in every session, put it in CLAUDE.md / AGENTS.md instead.

---

## 9. Team Adoption Strategy

### Phase 1: Individual Productivity (Week 1-2)

1. Install the tool and authenticate
2. Create project instruction file (CLAUDE.md / AGENTS.md)
3. Learn basic commands: clear, compact, rewind/resume
4. Start with code exploration and understanding
5. Progress to small, verifiable changes

### Phase 2: Workflow Integration (Week 3-4)

1. Create skills for 2-3 common workflows
2. Configure MCP for 1-2 external tools
3. Set up permission policies for the team
4. Create custom subagents for specialized tasks

### Phase 3: Team Standardization (Month 2)

1. Check project instructions and skills into version control
2. Standardize on naming conventions and patterns
3. Set up CI/CD integration for automated review
4. Create onboarding guide for new team members

### Phase 4: Advanced Patterns (Month 3+)

1. Multi-agent workflows for complex features
2. Scheduled automation for maintenance tasks
3. Cross-tool integration (MCP ecosystem)
4. Custom Agent SDK workflows

---

## 10. Decision Framework: Which Tool to Use

### Choose Claude Code When:

- You use Claude models (Opus, Sonnet, Haiku) and prefer Anthropic's approach
- You need fine-grained lifecycle hooks (PreToolUse, PostToolUse, etc.)
- You want persistent sub-agent memory across sessions
- Your team uses JetBrains IDEs
- You need scoped rules per file path (`.claude/rules/`)
- You want a plugin marketplace
- You prefer JSON configuration

### Choose OpenAI Codex When:

- You use GPT models and have a ChatGPT subscription
- You want an open-source CLI (Apache-2.0)
- You prefer TOML configuration
- You need OS-level sandbox enforcement as a primary security model
- You want built-in web search integration
- Your team uses Cursor or Windsurf IDEs
- You need CSV batch processing for subagents
- You want desktop app automations (scheduled tasks)

### Use Both When:

- Your team has mixed preferences
- Different projects benefit from different models
- You want to leverage the best features of each
- Both tools read `AGENTS.md` (natively or via import)
- Skills follow the same open standard (agentskills.io)

---

## 11. Interview Questions: Comparative

### Architecture & Design

1. **Compare the security models of Claude Code and Codex.**
   - Claude Code: Permission modes (6 levels) + hooks (inspect/modify each tool call) + sandbox
   - Codex: Sandbox modes (3 levels) + approval policies (3 levels), OS-level enforcement
   - Claude Code is more granular (per-tool hooks); Codex is more boundary-focused (sandbox-first)

2. **How do both tools handle context window limitations?**
   - Both: Auto-compaction near capacity, manual clear/compact commands
   - Claude Code: `/btw` for zero-cost side questions, `/rewind` for checkpoints
   - Codex: Session fork, resume, reasoning effort levels
   - Both: Subagents for isolating exploration from main context

3. **Compare the extensibility models.**
   - Claude Code: Hooks (8+ events, 4 types) + skills + subagents + MCP + plugins
   - Codex: Skills + subagents + MCP + Agents SDK + automations
   - Claude Code hooks are more granular; Codex sandbox is more structured
   - Both use the same Agent Skills open standard

### Practical

4. **How would you migrate a team from one tool to the other?**
   - Project instructions: Convert CLAUDE.md ↔ AGENTS.md (similar content, different format)
   - Skills: Same standard, different directories (`.claude/skills/` vs `.agents/skills/`)
   - Subagents: Convert Markdown → TOML or vice versa
   - MCP: Same servers, different config format (`.mcp.json` vs `config.toml`)
   - Hooks → Approval policies (different paradigm, requires rethinking)

5. **You're setting up AI coding tools for a 50-person engineering team. Walk through your approach.**
   - Evaluate both tools with a pilot group (5-10 engineers)
   - Standardize on project instructions (check into git)
   - Create team-shared skills for common workflows
   - Configure security policies (start restrictive, loosen with experience)
   - Set up CI/CD integration for automated code review
   - Create onboarding documentation with examples
   - Establish feedback loop for improving instructions and skills
   - Monitor usage patterns and optimize

---

## 12. Quick Reference

### Starting a Session

| Action | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| Interactive | `claude` | `codex` |
| Non-interactive | `claude -p "prompt"` | `codex exec "prompt"` |
| Resume | `claude --continue` | `codex resume` |
| As agent | `claude --agent name` | N/A (use `/agent`) |
| With model | `claude --model opus` | `codex --model gpt-5.4` |

### Managing Context

| Action | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| Clear | `/clear` | `/clear` |
| Compact | `/compact` | `/compact` |
| Checkpoint | `/rewind` | `codex fork` |
| Side question | `/btw` | N/A |
| Browse memory | `/memory` | N/A |

### Security

| Action | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| Read-only | Plan mode | `--sandbox read-only` |
| Safe default | Default mode | `--full-auto` |
| Unrestricted | `bypassPermissions` | `--yolo` |
| Manage perms | `/permissions` | `/permissions` |

### Adding Tools

| Action | Claude Code | OpenAI Codex |
|--------|-------------|--------------|
| Add MCP | `claude mcp add name` | `codex mcp add name` |
| Config file | `.mcp.json` | `config.toml` [mcp_servers] |

### File Locations

| Purpose | Claude Code | OpenAI Codex |
|---------|-------------|--------------|
| Instructions | `CLAUDE.md` | `AGENTS.md` |
| Config | `.claude/settings.json` | `.codex/config.toml` |
| Skills | `.claude/skills/` | `.agents/skills/` |
| Agents | `.claude/agents/` | `.codex/agents/` |
| Global config | `~/.claude/` | `~/.codex/` |
| MCP | `.mcp.json` | In `config.toml` |
