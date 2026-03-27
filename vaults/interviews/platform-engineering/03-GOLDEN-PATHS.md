# Golden Paths & Developer Experience

A comprehensive guide to golden paths, developer experience measurement, and productivity
metrics. Covers the Spotify golden path concept, DORA metrics, SPACE framework, self-service
infrastructure, and strategies for reducing cognitive load on engineering teams.

---

## Table of Contents

1. [What Are Golden Paths](#1-what-are-golden-paths)
2. [Designing Golden Paths](#2-designing-golden-paths)
3. [Self-Service Infrastructure](#3-self-service-infrastructure)
4. [DORA Metrics](#4-dora-metrics)
5. [SPACE Framework](#5-space-framework)
6. [Measuring Developer Experience](#6-measuring-developer-experience)
7. [Reducing Cognitive Load](#7-reducing-cognitive-load)
8. [Common Interview Questions](#8-common-interview-questions)
9. [Quick Reference](#9-quick-reference)

---

## 1. What Are Golden Paths

A **golden path** is a preconfigured, opinionated workflow that guides developers through
common tasks via an Internal Developer Platform. The term was coined by Spotify.

```
┌──────────────────────────────────────────────────────┐
│                GOLDEN PATH SPECTRUM                   │
│                                                       │
│  Guardrails       Paved Roads       Golden Paths      │
│  ┌──────────┐    ┌──────────┐     ┌──────────────┐   │
│  │ "Don't   │    │ "Here's  │     │ "Follow this │   │
│  │  do this"│    │ a good   │     │ and you'll   │   │
│  │          │    │ path"    │     │ be done in   │   │
│  │ Prevent  │    │ Suggest  │     │ 5 minutes"   │   │
│  │ bad      │    │ good     │     │              │   │
│  │ outcomes │    │ patterns │     │ Optimized    │   │
│  └──────────┘    └──────────┘     │ end-to-end   │   │
│                                   └──────────────┘   │
│  Policy-as-code   Templates        Self-service +    │
│  Admission ctrl   Documentation    automation +      │
│  OPA/Kyverno      Best practices   guardrails        │
└──────────────────────────────────────────────────────┘
```

### Key Principle: Not Mandates

Golden paths are **voluntary**. They make the right way the easiest way. Developers CAN
go off-path, but the golden path is so convenient that most choose not to.

- **Forced adoption** → workarounds, resentment, shadow IT
- **Attractive adoption** → voluntary uptake, satisfaction, consistency

### Common Golden Paths

| Golden Path | What It Automates |
|-------------|-------------------|
| New service creation | Repo + CI/CD + monitoring + docs in one click |
| Deployment | Push-to-deploy with canary/rollback built in |
| Database provisioning | Self-service DB with backups, monitoring pre-configured |
| Environment creation | Ephemeral dev/staging environments per PR |
| Secret management | Self-service secrets with auto-rotation |

---

## 2. Designing Golden Paths

### Process

1. **Identify pain points**: What do developers complain about? What takes days?
2. **Co-develop with users**: Platform team + at least one customer team from day one
3. **Start narrow**: One golden path for the most painful workflow
4. **Iterate on feedback**: Measure usage, survey satisfaction, refine
5. **Expand gradually**: Add golden paths based on demand, not speculation

### Architecture

```
┌──────────────────────────────────────────────────────┐
│              GOLDEN PATH: New Service                  │
│                                                       │
│  Developer clicks "Create Service" in portal          │
│                    │                                   │
│                    ▼                                   │
│  ┌─────────────────────────────────┐                  │
│  │ 1. GitHub repo from template    │                  │
│  │ 2. CI/CD pipeline configured    │                  │
│  │ 3. K8s namespace + RBAC         │                  │
│  │ 4. Monitoring dashboards        │                  │
│  │ 5. Log aggregation enabled      │                  │
│  │ 6. Service registered in catalog│                  │
│  │ 7. Documentation scaffold       │                  │
│  └─────────────────────────────────┘                  │
│                    │                                   │
│                    ▼                                   │
│  Developer has production-ready service in minutes     │
└──────────────────────────────────────────────────────┘
```

---

## 3. Self-Service Infrastructure

### Components

| Component | Purpose | Tools |
|-----------|---------|-------|
| **Developer Portal** | UI for all self-service actions | Backstage, Port, Cortex |
| **Software Catalog** | Service discovery and ownership | Backstage Catalog |
| **Templates** | Standardized project scaffolding | Backstage Scaffolder |
| **CI/CD Abstraction** | Pipeline-as-a-service | GitHub Actions, Tekton |
| **Infrastructure** | Self-service cloud resources | Crossplane, Terraform |
| **Secrets** | Self-service credential management | Vault, External Secrets |
| **Environments** | On-demand dev/staging | Kubernetes namespaces |

### Day-1 vs Day-2 Operations

| Day-1 (Initial Setup) | Day-2 (Ongoing) |
|----------------------|-----------------|
| Create service from template | Scale up/down |
| Provision database | Rotate secrets |
| Set up CI/CD | Patch dependencies |
| Configure monitoring | Handle incidents |
| Register in catalog | Update documentation |

---

## 4. DORA Metrics

**DevOps Research and Assessment** -- the four key metrics for software delivery performance.

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| **Deployment Frequency** | Multiple/day | Weekly-monthly | Monthly-6months | >6 months |
| **Lead Time for Changes** | <1 hour | 1 day-1 week | 1-6 months | >6 months |
| **Mean Time to Restore** | <1 hour | <1 day | 1 day-1 week | >6 months |
| **Change Failure Rate** | 0-15% | 16-30% | 16-30% | >30% |

### How Golden Paths Improve DORA

- **Deployment Frequency** ↑: Self-service CI/CD removes bottlenecks
- **Lead Time** ↓: Templates + automation reduce setup time
- **MTTR** ↓: Pre-configured monitoring enables faster detection
- **Change Failure Rate** ↓: Guardrails catch issues before production

### Measuring DORA

```
Deployment Frequency = deployments / time period
Lead Time = median(deploy_timestamp - first_commit_timestamp)
MTTR = median(resolved_timestamp - incident_start_timestamp)
Change Failure Rate = failed_deployments / total_deployments
```

---

## 5. SPACE Framework

**S**atisfaction, **P**erformance, **A**ctivity, **C**ommunication, **E**fficiency.
From Microsoft Research, GitHub, and University of Victoria.

| Dimension | What It Measures | Example Metrics |
|-----------|-----------------|-----------------|
| **Satisfaction** | How fulfilled developers feel | Developer NPS, survey scores |
| **Performance** | Outcomes and impact | Code quality, user satisfaction |
| **Activity** | Volume of actions | Commits, PRs, deployments, reviews |
| **Communication** | Team interactions | PR review time, documentation quality |
| **Efficiency** | Flow and minimal friction | Build time, CI wait time, handoff count |

### DORA + SPACE Together

- **DORA** measures delivery pipeline performance (team/org level)
- **SPACE** measures holistic engineering health (individual to org)
- Use DORA for delivery metrics, expand to SPACE for complete picture
- Golden paths improve both: faster delivery (DORA) + less friction (SPACE)

---

## 6. Measuring Developer Experience

### Key Metrics

| Metric | How to Measure | Target |
|--------|---------------|--------|
| **Time to First Deploy** | New hire → first production deploy | <1 week |
| **Time to Production** | Feature start → production | Reduce by 50% |
| **Developer NPS** | Quarterly survey | >40 (promoters > detractors) |
| **Template Adoption** | % new services using golden paths | >80% |
| **Ticket Reduction** | Infra/platform tickets over time | Decrease month-over-month |
| **Cognitive Load** | Survey + observation | Decreasing over time |

### Survey Questions

- "I can easily create a new service without help" (1-5)
- "I spend most of my time writing code, not fighting tooling" (1-5)
- "I can find the documentation I need quickly" (1-5)
- "Deploying to production is straightforward" (1-5)

---

## 7. Reducing Cognitive Load

### The Problem

DevOps made developers responsible for: code + CI/CD + cloud + security + monitoring + networking + databases + secrets + compliance. This is **unsustainable cognitive load**.

### The Solution

```
WITHOUT PLATFORM                  WITH PLATFORM
┌─────────────────┐              ┌─────────────────┐
│  Developer must  │              │  Developer       │
│  know:           │              │  focuses on:     │
│  - Kubernetes    │              │  - Business logic│
│  - Terraform     │              │  - Tests         │
│  - Helm          │              │  - Code review   │
│  - ArgoCD        │              │                  │
│  - Prometheus    │              │  Platform handles:│
│  - Grafana       │              │  - Infra          │
│  - OPA           │              │  - CI/CD          │
│  - Vault         │              │  - Monitoring     │
│  - Networking    │              │  - Security       │
│  15+ tools       │              │  - Compliance     │
└─────────────────┘              └─────────────────┘
```

### Strategies

1. **Abstraction**: Hide infrastructure behind simple interfaces
2. **Opinionated defaults**: Pre-configure best practices
3. **Standardized tooling**: Reduce tool sprawl (avg 7.4 tools per team)
4. **Self-service**: Eliminate ticket-based workflows
5. **Documentation**: Searchable, up-to-date, integrated in portal

---

## 8. Common Interview Questions

**Q: What are golden paths and how do they differ from guardrails?**
Golden paths are preconfigured, opinionated workflows that make the right way the easiest way (voluntary). Guardrails are policies that prevent bad outcomes (enforced). Golden paths guide; guardrails restrict. Both are needed.

**Q: Name the four DORA metrics and explain why they matter.**
Deployment Frequency, Lead Time, MTTR, Change Failure Rate. They measure software delivery performance across speed and stability. Elite performers score well on ALL four -- they're not in tension.

**Q: What is the SPACE framework?**
Five dimensions: Satisfaction, Performance, Activity, Communication, Efficiency. Provides a holistic view of developer productivity beyond just output metrics. Complements DORA by adding human and quality dimensions.

**Q: How would you measure the success of a platform team?**
Track: voluntary adoption rate, time-to-first-deploy, ticket reduction, developer NPS, DORA metrics improvement, shift from infra toil to product work. The key indicator is developers choosing to use the platform without being forced.

**Q: How do you reduce cognitive load on developers?**
Abstract infrastructure behind simple interfaces, provide opinionated defaults, standardize tooling, replace tickets with self-service, integrate documentation into the developer portal. The goal: developers focus on business logic, not infrastructure.

---

## 9. Quick Reference

### DORA Metrics

| Metric | Measures | Improve With |
|--------|----------|-------------|
| Deployment Frequency | Speed | CI/CD automation |
| Lead Time | Speed | Template scaffolding |
| MTTR | Stability | Pre-configured monitoring |
| Change Failure Rate | Stability | Guardrails, testing |

### Golden Path Checklist

- [ ] Solves a real pain point (not hypothetical)
- [ ] Co-developed with customer teams
- [ ] Voluntary, not mandated
- [ ] Measurable adoption metrics
- [ ] Documentation included
- [ ] Feedback mechanism in place
