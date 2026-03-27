# Platform Engineering Best Practices & Adoption

A comprehensive guide to building successful platform teams, measuring outcomes, avoiding
common pitfalls, and driving adoption. Covers platform-as-product thinking, the CNCF
maturity model, service scorecards, and real-world case studies.

---

## Table of Contents

1. [Building a Platform Team](#1-building-a-platform-team)
2. [Platform as a Product](#2-platform-as-a-product)
3. [Measuring Platform Success](#3-measuring-platform-success)
4. [Adoption Strategies](#4-adoption-strategies)
5. [Common Pitfalls](#5-common-pitfalls)
6. [Incremental Platform Building](#6-incremental-platform-building)
7. [Service Scorecards & Maturity Models](#7-service-scorecards--maturity-models)
8. [CNCF Platform Engineering Maturity Model](#8-cncf-platform-engineering-maturity-model)
9. [Case Studies](#9-case-studies)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Quick Reference](#11-quick-reference)

---

## 1. Building a Platform Team

### Team Composition

| Role | Responsibility |
|------|---------------|
| **Platform Product Manager** | User research, roadmap, prioritization |
| **Platform Engineers** | Build and maintain platform services |
| **SRE/Reliability** | Platform reliability, SLOs, incident response |
| **Developer Advocate** | Adoption, documentation, training |
| **Security Engineer** | Policy-as-code, compliance, guardrails |

### Team Size Guidelines

| Org Size | Platform Team Size | Notes |
|----------|-------------------|-------|
| <50 engineers | 1-2 people (part-time) | Start with golden paths for biggest pain |
| 50-200 | 3-5 dedicated | Focus on top 2-3 golden paths |
| 200-1000 | 5-15 | Full IDP with portal, templates, self-service |
| 1000+ | 15-30+ | Multiple sub-teams by domain |

### Key Principle: Thinnest Viable Platform (TVP)

Build the **smallest platform** that accelerates delivery for stream-aligned teams.
Start thin, grow based on demand. Do not over-build.

---

## 2. Platform as a Product

### Product Mindset

```
TRADITIONAL IT                    PLATFORM AS PRODUCT
┌────────────────────┐           ┌────────────────────┐
│ Build what we think│           │ Build what devs    │
│ teams need         │           │ actually need      │
│                    │           │                    │
│ Measure: uptime,   │           │ Measure: adoption, │
│ tickets closed     │           │ satisfaction, speed │
│                    │           │                    │
│ Force adoption     │           │ Earn adoption      │
│                    │           │                    │
│ Roadmap: infra-    │           │ Roadmap: user-     │
│ driven             │           │ driven             │
└────────────────────┘           └────────────────────┘
```

### Product Management Practices

1. **User research**: Shadow developers, conduct interviews, observe pain points
2. **Roadmap**: Prioritize based on user impact, not technical interest
3. **Feedback loops**: Surveys, office hours, Slack channels, embedded liaisons
4. **Marketing**: Internal blog posts, demos, "launch" new features
5. **Support**: Documentation, FAQ, dedicated support channel

---

## 3. Measuring Platform Success

### Key Metrics

| Category | Metric | Target |
|----------|--------|--------|
| **Adoption** | % services using golden paths | >80% (voluntary) |
| **Speed** | Time to first deploy (new hire) | <1 week |
| **Speed** | Time from idea to production | Reduce 50%+ |
| **Satisfaction** | Developer NPS | >40 |
| **Efficiency** | Platform tickets per month | Decreasing |
| **Quality** | Change failure rate (DORA) | <15% |
| **Delivery** | Deployment frequency (DORA) | Multiple/day |

### Proving ROI

The strongest signal: **resource allocation shift** from infrastructure toil to product work.

```
BEFORE PLATFORM          AFTER PLATFORM
┌──────────────┐        ┌──────────────┐
│   Product    │ 40%    │   Product    │ 70%    ← More time on features
│   Roadmap    │        │   Roadmap    │
├──────────────┤        ├──────────────┤
│   Infra/     │ 35%    │   Infra/     │ 15%    ← Less toil
│   Support    │        │   Support    │
├──────────────┤        ├──────────────┤
│   Other      │ 25%    │   Other      │ 15%
└──────────────┘        └──────────────┘
```

### Anti-Metrics

- **Logins** ≠ adoption (may be forced or accidental)
- **Features shipped** ≠ value (features nobody uses)
- **Uptime** alone ≠ success (platform can be up but unused)

---

## 4. Adoption Strategies

### The Golden Rule: Evangelize, Don't Mandate

| Mandated Adoption | Voluntary Adoption |
|-------------------|-------------------|
| Workarounds and shadow IT | Genuine preference |
| Resentment | Satisfaction |
| Compliance without engagement | Active feedback |
| Metrics look good, reality doesn't | Metrics reflect reality |

### Tactics

1. **Find early adopters**: 1-2 friendly teams willing to try and give feedback
2. **Solve real pain first**: Pick the most painful, most common workflow
3. **Show, don't tell**: Demos > presentations. "Watch me create a service in 2 minutes"
4. **Document everything**: Searchable, up-to-date, with examples
5. **Office hours**: Weekly drop-in sessions for questions
6. **Champions program**: Embed platform advocates in product teams
7. **Celebrate wins**: Share metrics, testimonials, before/after comparisons
8. **Listen to resistors**: Resistance often reveals real problems with the platform

---

## 5. Common Pitfalls

### The Platform Trap

**Building without users**: One enterprise spent a year building an ambitious platform in
isolation. Near-zero adoption because developers found it slower than existing scripts.

**Fix**: Co-develop with at least one customer team from day one.

### Over-Engineering

**Premature abstraction**: Building for 50 use cases when you have 3. The platform becomes
complex, brittle, and hard to change.

**Fix**: Start with the thinnest viable platform. Expand based on demand.

### Measuring Outputs, Not Outcomes

**Vanity metrics**: "We shipped 50 features this quarter" says nothing about value delivered.

**Fix**: Measure adoption rate, developer satisfaction, time-to-production, not features shipped.

### Staffing Only Infrastructure Specialists

**Missing product thinking**: Without product-minded engineers, the platform becomes a tool
collection, not a product.

**Fix**: Include a product manager and developer advocate. Balance infra skills with UX thinking.

### Ignoring Developer Experience

**Technical-first, human-second**: Platform works technically but has terrible UX (confusing
CLI flags, inconsistent naming, no error messages).

**Fix**: Treat DX as a first-class concern. Test with real users. Iterate on usability.

---

## 6. Incremental Platform Building

### Four-Phase Framework

```
Phase 1 (Weeks 1-4)        Phase 2 (Months 2-3)
┌──────────────────┐       ┌──────────────────┐
│ Identify pain    │       │ Build first      │
│ Interview devs   │       │ golden path      │
│ Choose first     │──────>│ Deploy to early  │
│ golden path      │       │ adopters         │
└──────────────────┘       └──────────────────┘
                                    │
Phase 4 (Months 6+)        Phase 3 (Months 3-6)
┌──────────────────┐       ┌──────────────────┐
│ Scale to org     │       │ Iterate based    │
│ Add golden paths │<──────│ on feedback      │
│ Build portal     │       │ Measure metrics  │
│ Mature platform  │       │ Add 2nd path     │
└──────────────────┘       └──────────────────┘
```

### Strangler Fig Pattern

Gradually replace high-friction components with modernized versions:

1. **Wrap**: Build platform abstraction around existing tool
2. **Route**: Direct new requests to platform, existing to old system
3. **Migrate**: Gradually move teams to platform
4. **Retire**: Remove old system when migration complete

---

## 7. Service Scorecards & Maturity Models

### Scorecards

Turn abstract standards into **measurable checks**:

| Category | Check | Passing Criteria |
|----------|-------|-----------------|
| **Reliability** | Health checks configured | HTTP 200 on /health |
| **Reliability** | On-call rotation set | At least 2 people |
| **Observability** | Metrics exposed | Prometheus endpoint active |
| **Observability** | Alerts configured | At least P1 alerts defined |
| **Security** | Vulnerability scanning | No critical CVEs |
| **Security** | Secrets management | No hardcoded secrets |
| **Documentation** | README exists | Updated within 90 days |
| **Quality** | Test coverage | >80% |

### Maturity Model (5 Levels)

| Level | Name | Description |
|-------|------|-------------|
| 1 | **Ad-hoc** | No standards, each team does its own thing |
| 2 | **Managed** | Basic processes defined but inconsistent |
| 3 | **Defined** | Standardized across organization |
| 4 | **Measured** | Quantitative tracking and improvement |
| 5 | **Optimized** | Continuous improvement with automation |

---

## 8. CNCF Platform Engineering Maturity Model

### Five Dimensions

| Dimension | What It Measures |
|-----------|-----------------|
| **Investment** | Funding, staffing, executive support |
| **Adoption** | How widely the platform is used |
| **Interfaces** | Quality of developer-facing APIs and UIs |
| **Operations** | How the platform itself is maintained |
| **Measurement** | How success is tracked |

### Four Maturity Levels

| Level | Name | Characteristics |
|-------|------|----------------|
| 1 | **Provisional** | Early-stage, tactical solutions, limited investment |
| 2 | **Operational** | Dedicated team/budget, maintenance-focused |
| 3 | **Scalable** | Platform viewed as product, clear roadmap, team autonomy |
| 4 | **Optimizing** | Continuous optimization, deeply integrated into org strategy |

The transition to product management patterns typically occurs during the
**Operational → Scalable** move.

---

## 9. Case Studies

### Spotify -- Backstage

- **Problem**: 2000+ engineers, hundreds of services, no central catalog
- **Solution**: Built Backstage as internal developer portal (2016)
- **Impact**: 120+ internal plugins, reduced onboarding time
- **Open-sourced**: 2020, donated to CNCF
- **Key lesson**: Started with service catalog, expanded based on demand

### Netflix -- Paved Roads

- **Philosophy**: "Paved roads, not walled gardens"
- **Approach**: Provide well-maintained, easy paths that most teams follow
- **Freedom**: Teams CAN go off-road, but paved roads are so good most don't
- **Key lesson**: Invest in making the default path excellent rather than restricting alternatives

### Mercado Libre -- Fury Platform

- **Scale**: 10,000+ engineers across Latin America
- **Platform**: "Fury" -- self-service infrastructure for all teams
- **Impact**: Deploy thousands of services per day
- **Key lesson**: Platform must scale with the organization

---

## 10. Common Interview Questions

**Q: What is the thinnest viable platform?**
The smallest platform that accelerates delivery for stream-aligned teams. Concept from Team Topologies. Start with the minimum that removes real pain, then expand based on usage data and feedback. Avoids over-engineering.

**Q: How do you avoid building a platform nobody uses?**
Co-develop with real users from day one. Solve actual pain points (not hypothetical). Measure adoption (voluntary, not forced). Iterate on feedback. Never mandate adoption -- earn it.

**Q: Describe the CNCF Platform Engineering Maturity Model.**
5 dimensions (Investment, Adoption, Interfaces, Operations, Measurement) across 4 levels (Provisional → Operational → Scalable → Optimizing). The key transition is Operational to Scalable, where you adopt product management practices.

**Q: How would you measure platform team success?**
Primary: voluntary adoption rate, developer NPS, time-to-production. Secondary: ticket reduction, DORA metrics improvement, resource allocation shift (less infra toil, more product work). Anti-metrics: logins, features shipped.

**Q: What is the difference between scorecards and maturity models?**
Scorecards show current state ("Is monitoring configured?"). Maturity models show progression ("How mature are our monitoring practices?"). Scorecards are binary checks; maturity models are progressive levels.

---

## 11. Quick Reference

### Platform Team Checklist

- [ ] Product manager or product-minded lead
- [ ] User research before building
- [ ] Thinnest viable platform first
- [ ] Early adopter team identified
- [ ] Adoption metrics defined (voluntary)
- [ ] Feedback mechanism in place
- [ ] Documentation as first-class citizen
- [ ] Scorecards for service quality

### Adoption Playbook

1. Interview developers about pain
2. Pick highest-pain, highest-frequency workflow
3. Build golden path with one customer team
4. Measure: time saved, satisfaction, adoption
5. Iterate on feedback
6. Expand to next workflow
7. Repeat
