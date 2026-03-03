# AI/ML Engineering Interview Preparation Guide

## Overview

This directory contains comprehensive AI/ML engineering interview preparation materials designed for **software engineers** building AI-powered products -- not ML researchers. These guides focus on practical skills: integrating LLMs, building RAG pipelines, deploying AI systems at scale, and designing AI-native architectures.

Every topic emphasizes Python code you can run, architecture patterns you can whiteboard, and trade-offs you can articulate in interviews.

## Who This Is For

- Software engineers transitioning to AI/ML engineering roles
- Backend/fullstack engineers building LLM-powered features
- Engineers interviewing at companies shipping AI products (OpenAI, Anthropic, Google, startups)
- Tech leads designing AI system architectures

## How to Use

1. **Start with Fundamentals** -- Read `01-LLM-FUNDAMENTALS.md` to build mental models of how LLMs work under the hood.
2. **Master the Core Skills** -- Prompt engineering (02), RAG (03), and agents (04) are the bread and butter of AI engineering interviews.
3. **Go Deep on Production** -- Files 05-07 cover the skills that separate junior from senior AI engineers.
4. **Practice System Design** -- File 08 gives you a framework and worked examples for AI system design interviews.
5. **Know the Guardrails** -- File 09 covers safety and ethics, increasingly asked in interviews at responsible AI companies.

## Table of Contents

### Foundations

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 1 | [01-LLM-FUNDAMENTALS.md](01-LLM-FUNDAMENTALS.md) | LLM Fundamentals | Transformer architecture, tokenization, attention, sampling parameters, model landscape |
| 2 | [02-PROMPT-ENGINEERING.md](02-PROMPT-ENGINEERING.md) | Prompt Engineering | Zero/few-shot, chain-of-thought, structured output, prompt injection, SDK examples |

### Core AI Engineering Skills

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 3 | [03-RAG-SYSTEMS.md](03-RAG-SYSTEMS.md) | RAG Systems | Chunking, embeddings, vector DBs, hybrid search, reranking, evaluation metrics |
| 4 | [04-AI-AGENTS.md](04-AI-AGENTS.md) | AI Agents | ReAct pattern, tool calling, memory systems, multi-agent orchestration, frameworks |
| 5 | [05-FINE-TUNING.md](05-FINE-TUNING.md) | Fine-Tuning | SFT, LoRA/QLoRA, RLHF, data preparation, when to fine-tune vs RAG vs prompting |

### Production & Operations

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 6 | [06-EVALUATION-TESTING.md](06-EVALUATION-TESTING.md) | Evaluation & Testing | LLM-as-judge, hallucination detection, RAGAS, regression testing, A/B testing |
| 7 | [07-PRODUCTION-DEPLOYMENT.md](07-PRODUCTION-DEPLOYMENT.md) | Production Deployment | API gateways, caching, cost optimization, observability, guardrails, streaming |

### System Design & Ethics

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 8 | [08-AI-SYSTEM-DESIGN.md](08-AI-SYSTEM-DESIGN.md) | AI System Design | Interview framework, 3 worked examples with ASCII diagrams, cost/latency analysis |
| 9 | [09-AI-SAFETY-ETHICS.md](09-AI-SAFETY-ETHICS.md) | AI Safety & Ethics | Bias mitigation, content filtering, PII handling, red teaming, EU AI Act |

## Interview Format Expectations

AI/ML engineering interviews typically include:

| Round | Duration | What They Test | Relevant Files |
|-------|----------|----------------|----------------|
| **Coding** | 45-60 min | Build an RAG pipeline, implement an agent, write evaluation harness | 03, 04, 06 |
| **System Design** | 45-60 min | Design an AI-powered product end-to-end | 08, 07, 03 |
| **ML Fundamentals** | 30-45 min | Explain how LLMs work, trade-offs between approaches | 01, 05 |
| **Applied AI** | 45-60 min | Prompt engineering, evaluation strategy, production concerns | 02, 06, 07 |
| **Ethics & Safety** | 30 min | Responsible AI, bias, content moderation | 09 |

## Quick Study Path by Time Available

### 1 Week Sprint

| Day | Focus | Files |
|-----|-------|-------|
| Mon | LLM fundamentals + prompt engineering | 01, 02 |
| Tue | RAG systems deep dive | 03 |
| Wed | AI agents + fine-tuning decision framework | 04, 05 |
| Thu | Evaluation and production deployment | 06, 07 |
| Fri | AI system design practice (all 3 examples) | 08 |
| Sat | Safety/ethics + review weak areas | 09 |
| Sun | Mock interviews, review quick reference sections | All |

### 1 Day Crash Course

Focus on: 01 (skim), 02, 03, 07 (production section), 08 (framework + 1 example)

## Prerequisites

These guides assume you already know:

- Python programming (intermediate+)
- REST API design
- Basic distributed systems concepts (caching, queues, databases)
- Git, Docker, cloud basics (AWS/GCP/Azure)

No deep math or ML research background required.
