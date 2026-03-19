# Agentic Engineering Interview Preparation Guide

## Overview

This directory contains a comprehensive interview preparation series for **agentic engineering** -- the discipline of building reliable, production-grade AI agent systems. These guides cover everything from single-agent architectures to multi-agent orchestration, from tool design to agent infrastructure at scale.

The series is organized into two tracks that mirror how the industry thinks about agents today:

```
                    AGENTIC ENGINEERING
                           |
            +--------------+--------------+
            |                             |
   TRACK A: PRODUCTION            TRACK B: CODING
   AGENTIC SYSTEMS                AGENTS / SWE AGENTS
            |                             |
  +----+----+----+----+         +----+----+----+
  |    |    |    |    |         |    |    |    |
 01   02   03   04   05        09   06   07   08
 Arch Tool Mem Plan  Multi     Code Frmw Rely Eval
           |              |         |
           +------+-------+    10  Infrastructure
                  |            11  Case Studies
            Shared Foundation
```

Every topic emphasizes patterns you can whiteboard, code you can write, trade-offs you can articulate, and real-world failure modes you should anticipate.

## Who This Is For

- Software engineers building AI agent products (Claude Code, Cursor, Copilot, Devin, etc.)
- Backend engineers designing agent orchestration and infrastructure
- Engineers interviewing at companies shipping agent-native products (Anthropic, OpenAI, Google DeepMind, Cognition, startups)
- Tech leads evaluating agent frameworks and making build-vs-buy decisions
- ML engineers moving from model training to agent systems engineering

## How to Use

1. **Start with Architecture** -- Read `01-AGENT-ARCHITECTURES.md` to build mental models for how agents work at the loop level.
2. **Master the Primitives** -- Tools (02), memory (03), and planning (04) are the building blocks every agent system depends on.
3. **Scale Up** -- Multi-agent orchestration (05) and frameworks (06) teach you to compose agents into complex systems.
4. **Harden for Production** -- Reliability (07), evaluation (08), and infrastructure (10) separate toy demos from shipped products.
5. **Go Deep on Coding Agents** -- File 09 covers the fast-moving world of SWE agents, code generation, and IDE integration.
6. **Learn from the Field** -- File 11 distills lessons from real-world agent deployments.

## Table of Contents

### Track A: Production Agentic Systems

| #   | File                                                               | Topic                     | Key Concepts                                                                               |
| --- | ------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | [01-AGENT-ARCHITECTURES.md](01-AGENT-ARCHITECTURES.md)             | Agent Architectures       | ReAct loops, plan-and-execute, reflection patterns, tool-use loops, router agents          |
| 2   | [02-TOOL-DESIGN.md](02-TOOL-DESIGN.md)                             | Tool & Function Design    | Function calling, MCP protocol, tool registries, schema design, tool selection             |
| 3   | [03-MEMORY-STATE.md](03-MEMORY-STATE.md)                           | Memory & State            | Short/long-term memory, context window management, state persistence, conversation history |
| 4   | [04-PLANNING-REASONING.md](04-PLANNING-REASONING.md)               | Planning & Reasoning      | Chain-of-thought, tree-of-thought, self-reflection, plan decomposition, re-planning        |
| 5   | [05-MULTI-AGENT-ORCHESTRATION.md](05-MULTI-AGENT-ORCHESTRATION.md) | Multi-Agent Orchestration | Supervisor/worker, handoffs, swarms, communication protocols, consensus                    |

### Track B: Coding Agents & Frameworks

| #   | File                                             | Topic               | Key Concepts                                                                       |
| --- | ------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| 6   | [06-AGENT-FRAMEWORKS.md](06-AGENT-FRAMEWORKS.md) | Agent Frameworks    | LangGraph, CrewAI, Claude Agent SDK, AutoGen, OpenAI Agents SDK, comparison matrix |
| 9   | [09-CODING-AGENTS.md](09-CODING-AGENTS.md)       | Coding & SWE Agents | SWE-bench, code generation, repo-level reasoning, IDE integration, edit-test loops |

### Production Hardening & Operations

| #   | File                                                             | Topic                      | Key Concepts                                                                                |
| --- | ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| 7   | [07-RELIABILITY-GUARDRAILS.md](07-RELIABILITY-GUARDRAILS.md)     | Reliability & Guardrails   | Error recovery, retries, human-in-the-loop, safety layers, sandboxing, graceful degradation |
| 8   | [08-EVALUATION-OBSERVABILITY.md](08-EVALUATION-OBSERVABILITY.md) | Evaluation & Observability | Agent evals, tracing, debugging, cost monitoring, SWE-bench, benchmarks, LLM-as-judge       |
| 10  | [10-AGENT-INFRASTRUCTURE.md](10-AGENT-INFRASTRUCTURE.md)         | Agent Infrastructure       | Deployment, scaling, cost optimization, runtime environments, container isolation           |
| 11  | [11-CASE-STUDIES.md](11-CASE-STUDIES.md)                         | Case Studies               | Real-world agent systems, failure postmortems, lessons learned, production war stories      |

## Interview Format Expectations

Agentic engineering interviews vary by company, but typically include:

| Round                            | Duration  | What They Test                                                             | Relevant Files |
| -------------------------------- | --------- | -------------------------------------------------------------------------- | -------------- |
| **Agent System Design**          | 45-60 min | Design an agent system end-to-end (tool selection, memory, error handling) | 01, 02, 03, 05 |
| **Coding: Agent Implementation** | 45-60 min | Build a ReAct loop, implement tool calling, write an agent harness         | 01, 02, 06     |
| **Coding: SWE Agent**            | 45-60 min | Code search, edit-test loop, file navigation, repo reasoning               | 09             |
| **Production & Reliability**     | 30-45 min | How to make agents reliable, safe, cost-effective at scale                 | 07, 08, 10     |
| **Deep Dive / Architecture**     | 45-60 min | Multi-agent design, planning strategies, framework trade-offs              | 04, 05, 06     |
| **Behavioral / Case Study**      | 30-45 min | Walk through a past agent project, debugging a failure                     | 11             |

## Study Paths

### 1-Week Sprint (Intensive)

For engineers with limited time before an interview. Covers the essentials.

```
Mon     Tue     Wed     Thu     Fri     Sat     Sun
 |       |       |       |       |       |       |
 v       v       v       v       v       v       v
01      02      04      05      07      09      Review
Agent   Tool    Plan    Multi   Rely    Code    + Mock
Arch    Design  +03     Agent   +08     Agent   Interview
                Mem     Orch    Eval    +10
                State                   Infra
```

| Day | Focus                            | Files   | Goal                                                      |
| --- | -------------------------------- | ------- | --------------------------------------------------------- |
| Mon | Agent architecture patterns      | 01      | Whiteboard any agent loop pattern from memory             |
| Tue | Tool design and function calling | 02      | Design a tool schema and explain MCP                      |
| Wed | Memory systems + planning        | 03, 04  | Explain context window strategies and planning algorithms |
| Thu | Multi-agent orchestration        | 05      | Design a supervisor/worker system on a whiteboard         |
| Fri | Reliability + evaluation         | 07, 08  | Articulate error handling and eval strategies             |
| Sat | Coding agents + infrastructure   | 09, 10  | Walk through how SWE agents work, deployment patterns     |
| Sun | Case studies + mock interviews   | 11, All | Practice explaining systems end-to-end                    |

### 2-Week Sprint (Comprehensive)

For engineers who want thorough preparation across both tracks.

**Week 1: Foundations and Core Patterns**

| Day | Focus                        | Files | Activities                                                |
| --- | ---------------------------- | ----- | --------------------------------------------------------- |
| Mon | Agent architecture deep dive | 01    | Diagram all patterns, implement a ReAct loop from scratch |
| Tue | Tool design and MCP          | 02    | Design tool schemas, study MCP protocol details           |
| Wed | Memory and state management  | 03    | Build a memory system, compare approaches                 |
| Thu | Planning and reasoning       | 04    | Implement chain-of-thought, study tree-of-thought         |
| Fri | Multi-agent orchestration    | 05    | Design 2-3 multi-agent systems on paper                   |
| Sat | Framework comparison         | 06    | Build the same agent in 2 different frameworks            |
| Sun | Review week 1, fill gaps     | 01-06 | Revisit weak areas, practice whiteboarding                |

**Week 2: Production, Coding Agents, and Practice**

| Day | Focus                           | Files | Activities                                                |
| --- | ------------------------------- | ----- | --------------------------------------------------------- |
| Mon | Reliability and guardrails      | 07    | Design error handling for a complex agent flow            |
| Tue | Evaluation and observability    | 08    | Build an eval harness, study tracing tools                |
| Wed | Coding agents deep dive         | 09    | Study SWE-bench, trace through a coding agent's reasoning |
| Thu | Infrastructure and scaling      | 10    | Design deployment architecture, cost analysis             |
| Fri | Case studies                    | 11    | Analyze each case study, extract patterns                 |
| Sat | Mock system design interviews   | All   | Practice 2-3 agent system design problems                 |
| Sun | Mock coding interviews + review | All   | Practice agent implementation, final review               |

### Priority Reading Order (If Short on Time)

If you only have a few hours, read these sections in order:

```
MUST READ          SHOULD READ         NICE TO HAVE
-----------        ------------        -------------
01 Architectures   03 Memory           06 Frameworks
02 Tool Design     04 Planning         10 Infrastructure
07 Reliability     05 Multi-Agent      11 Case Studies
09 Coding Agents   08 Evaluation
```

## Key Themes Across All Files

These concepts recur throughout the series. Interviewers expect you to reason about them fluently:

| Theme                       | What It Means                                              | Where It Appears |
| --------------------------- | ---------------------------------------------------------- | ---------------- |
| **Observe-Think-Act loops** | Every agent is a loop: perceive, reason, act, repeat       | 01, 04, 09       |
| **Tool abstraction**        | Clean tool interfaces are the API of the agent world       | 02, 06           |
| **Context window as RAM**   | Managing what the LLM sees is a core engineering challenge | 03, 04           |
| **Graceful degradation**    | Agents must fail safely, not catastrophically              | 07, 10           |
| **Eval-driven development** | You cannot improve what you cannot measure                 | 08               |
| **Human-in-the-loop**       | Knowing when to ask for help is a feature, not a bug       | 05, 07           |
| **Cost-aware design**       | Token usage = money; good architecture minimizes waste     | 08, 10           |

## Prerequisites

These guides assume you already know:

- Python programming (intermediate+)
- How LLMs work at a high level (transformer architecture, tokenization, inference)
- REST API design and JSON schema
- Basic distributed systems concepts (queues, caching, load balancing)
- Familiarity with at least one LLM provider API (OpenAI, Anthropic, etc.)

If you need to brush up on LLM fundamentals, start with the [AI Engineering series](../ai-engineering/00-README.md) first, especially files 01-02.

## Companion Resources

- **AI Engineering Series**: `../ai-engineering/` -- Covers LLM fundamentals, RAG, prompting, and broader AI engineering
- **System Design Series**: `../system-design/` -- General distributed systems design patterns
- **DSA Series**: `../dsa/` -- Data structures and algorithms for coding rounds
