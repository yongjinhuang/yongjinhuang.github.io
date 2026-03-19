# Technical Strategy

[Back to Overview](./00-README.md)

---

## What Interviewers Are Looking For

Technical strategy is the single most important pillar for Staff+ interviews. It is the ability to look beyond the immediate problem, evaluate options systematically, communicate a clear direction, and get an organization to follow that direction.

Interviewers assess whether you can:

- **Set a technical vision** that aligns with business goals over a 1-3 year horizon
- **Evaluate technology choices** using principled frameworks rather than hype or familiarity
- **Write RFCs and design documents** that drive alignment across teams
- **Make build vs buy decisions** with clear reasoning
- **Plan and execute migrations** without disrupting the business
- **Communicate technical direction** to non-technical stakeholders
- **Create Architecture Decision Records (ADRs)** that preserve institutional knowledge

### Level Expectations

| Level          | Technical Strategy Signal                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| L5 (Senior)    | Writes design docs for team-level systems. Evaluates 2-3 options with trade-offs. Proposes solutions to tech leads.                               |
| L6 (Staff)     | Authors RFCs that shape org direction. Defines architecture for cross-team systems. Creates technology evaluation frameworks others use.          |
| L7 (Principal) | Sets company-wide technical strategy. Makes technology bets. Defines standards that last 3-5 years. Represents engineering in exec conversations. |

---

## Framework: The Technical Strategy Pyramid

Every technical strategy decision exists at one of three levels. Staff+ engineers need fluency at all three.

```
+------------------------------------------------------------------+
|                   TECHNICAL STRATEGY PYRAMID                      |
+------------------------------------------------------------------+
|                                                                    |
|                        /\                                         |
|                       /  \                                        |
|                      / L7 \    VISION                             |
|                     / Where \   "Where is the industry going?     |
|                    / are we  \   What should our architecture     |
|                   / going in  \  look like in 3 years?"           |
|                  / 3 years?    \                                  |
|                 /________________\                                |
|                /                  \                                |
|               /       L6          \   STRATEGY                    |
|              / What capabilities   \  "What capabilities do       |
|             / do we need to build?  \ we need? In what order?     |
|            / In what order?          \ What are the trade-offs?"  |
|           /____________________________\                          |
|          /                              \                         |
|         /           L5                   \   EXECUTION            |
|        / How do we build this specific    \  "How do we build     |
|       / system? What are the trade-offs    \ this? What tech      |
|      / for this component?                  \ do we use?"         |
|     /________________________________________\                    |
|                                                                    |
+------------------------------------------------------------------+
```

---

## RFC (Request for Comments) Process

RFCs are the primary vehicle for driving technical decisions at Staff+ level. A well-written RFC does not just propose a solution -- it builds consensus, documents trade-offs, and creates a record of decisions.

### RFC Template

```markdown
# RFC: [Short descriptive title]

**Author:** [Your name]
**Status:** Draft | In Review | Accepted | Rejected | Superseded
**Created:** [Date]
**Last Updated:** [Date]
**Reviewers:** [List of required reviewers]
**Decision Deadline:** [Date]

## Summary

[2-3 sentences. What are you proposing and why?]

## Motivation

[Why is this needed now? What problem does this solve?
What is the cost of NOT doing this?]

## Current State

[Describe the existing system/process. Include metrics
if available. What are the pain points?]

## Proposed Solution

[Detailed description of the proposed approach.
Include architecture diagrams, data flow, and
interface contracts.]

## Alternatives Considered

[For each alternative:]

### Alternative A: [Name]

- **Description:** [What is it?]
- **Pros:** [Why it could work]
- **Cons:** [Why it was not chosen]
- **Reason for rejection:** [Specific reason]

### Alternative B: [Name]

[Same structure]

## Trade-offs and Risks

| Trade-off     | Accepted Risk         | Mitigation         |
| ------------- | --------------------- | ------------------ |
| [Trade-off 1] | [What could go wrong] | [How we handle it] |
| [Trade-off 2] | [What could go wrong] | [How we handle it] |

## Migration Plan

[How do we get from current state to proposed state?
Phases, rollback strategy, feature flags.]

## Success Metrics

[How do we know this worked? Specific, measurable criteria.]

## Open Questions

[Things that still need to be resolved before implementation.]

## Timeline

| Phase   | Duration  | Deliverable         |
| ------- | --------- | ------------------- |
| Phase 1 | [X weeks] | [What is delivered] |
| Phase 2 | [X weeks] | [What is delivered] |

## References

[Links to related RFCs, design docs, external resources.]
```

### RFC Anti-patterns

| Anti-pattern                   | Why It Fails                              | Better Approach                                             |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| RFC as rubber stamp            | Decision already made, RFC is theater     | Write the RFC before you have a preferred solution          |
| No alternatives                | Looks like you did not explore the space  | Always include 2-3 genuine alternatives                     |
| Implementation detail overload | Readers lose the forest for the trees     | Lead with the "why" and defer implementation to design docs |
| No migration plan              | Great destination, no path to get there   | Migration plan is as important as the solution              |
| Infinite review cycle          | RFC never gets decided                    | Set a decision deadline. Silence is consent.                |
| Solo authorship at L7          | Looks like you are not building consensus | Co-author with key stakeholders to build ownership          |

---

## Architecture Decision Records (ADRs)

ADRs are lightweight documents that capture **why** a decision was made. They are different from RFCs: an RFC proposes a change, while an ADR records the outcome of a decision for future engineers.

### ADR Template

```markdown
# ADR-[NUMBER]: [Short title of decision]

**Date:** [Date decided]
**Status:** Accepted | Deprecated | Superseded by ADR-[N]
**Deciders:** [Who was involved]
**Context Level:** Team | Org | Company

## Context

[What is the situation that requires a decision?
What forces are at play? What constraints exist?]

## Decision

[What did we decide? State it clearly and directly.]

## Rationale

[Why this decision? What were the key factors?
What trade-offs did we accept?]

## Alternatives Rejected

| Alternative | Reason Rejected |
| ----------- | --------------- |
| [Option A]  | [Why not]       |
| [Option B]  | [Why not]       |

## Consequences

### Positive

- [Expected benefit 1]
- [Expected benefit 2]

### Negative

- [Accepted downside 1]
- [Accepted downside 2]

### Risks

- [Risk 1 and mitigation]

## Review Date

[When should this decision be revisited?]
```

### When to Write an ADR

| Write an ADR                        | Do Not Write an ADR                           |
| ----------------------------------- | --------------------------------------------- |
| Choosing a database technology      | Picking a variable name                       |
| Defining an API versioning strategy | Refactoring internal code                     |
| Setting a testing strategy          | Fixing a bug                                  |
| Adopting a new framework            | Updating a dependency version                 |
| Changing deployment topology        | Adding a feature within existing architecture |

---

## Technology Evaluation Framework

When evaluating technologies for adoption, use a structured scoring framework rather than gut feeling or familiarity.

### Evaluation Criteria Matrix

| Criterion                   | Weight | Description                                                                     |
| --------------------------- | ------ | ------------------------------------------------------------------------------- |
| **Fitness for purpose**     | 25%    | Does it solve the actual problem well?                                          |
| **Operational maturity**    | 20%    | Can we run it in production? Monitoring, debugging, on-call?                    |
| **Team capability**         | 15%    | Does our team know it or can they learn it quickly?                             |
| **Community & ecosystem**   | 15%    | Is there a healthy community? Good documentation? Libraries?                    |
| **Total cost of ownership** | 15%    | Licensing, infrastructure, training, maintenance over 3 years                   |
| **Strategic alignment**     | 10%    | Does it fit our existing stack? Does it move us toward our target architecture? |

### Scoring Guide

| Score | Meaning                                            |
| ----- | -------------------------------------------------- |
| 1     | Unacceptable. Blocking issue.                      |
| 2     | Below average. Significant effort to make it work. |
| 3     | Acceptable. Meets requirements with some caveats.  |
| 4     | Good. Exceeds requirements in most areas.          |
| 5     | Excellent. Best-in-class for this criterion.       |

### Example: Evaluating Message Queue Technologies

```
Criterion (Weight)        | Kafka (Score) | RabbitMQ (Score) | SQS (Score)
--------------------------|---------------|------------------|-----------
Fitness (25%)             | 5 (1.25)      | 4 (1.00)         | 3 (0.75)
Operational maturity (20%)| 3 (0.60)      | 4 (0.80)         | 5 (1.00)
Team capability (15%)     | 2 (0.30)      | 4 (0.60)         | 4 (0.60)
Community (15%)           | 5 (0.75)      | 4 (0.60)         | 4 (0.60)
Total cost (15%)          | 2 (0.30)      | 3 (0.45)         | 4 (0.60)
Strategic alignment (10%) | 4 (0.40)      | 3 (0.30)         | 3 (0.30)
--------------------------|---------------|------------------|-----------
TOTAL                     | 3.60          | 3.75             | 3.85
```

This framework does not make the decision for you -- it structures the discussion and ensures you are comparing options on the same dimensions.

---

## Build vs Buy Decisions

One of the most common and highest-impact decisions Staff+ engineers make. The wrong choice wastes months or years of engineering effort.

### Decision Framework

```
+------------------------------------------------------------------+
|                    BUILD vs BUY DECISION TREE                     |
+------------------------------------------------------------------+
|                                                                    |
|  Is this a core differentiator for our business?                  |
|  |                                                                 |
|  +-- YES --> Is the build cost < 3x the buy cost over 3 years?   |
|  |           |                                                     |
|  |           +-- YES --> BUILD (invest in your differentiator)    |
|  |           |                                                     |
|  |           +-- NO --> BUILD with limited scope (MVP first,      |
|  |                      revisit in 6 months)                      |
|  |                                                                 |
|  +-- NO --> Does a mature off-the-shelf solution exist?           |
|             |                                                      |
|             +-- YES --> Does it meet 80%+ of requirements?        |
|             |           |                                          |
|             |           +-- YES --> BUY                            |
|             |           |                                          |
|             |           +-- NO --> Can we extend it? --> BUY+EXT  |
|             |                                                      |
|             +-- NO --> Is the build effort < 1 quarter?           |
|                        |                                           |
|                        +-- YES --> BUILD (simple enough)           |
|                        |                                           |
|                        +-- NO --> PARTNER or delay                 |
|                                                                    |
+------------------------------------------------------------------+
```

### Build vs Buy Evaluation Table

| Factor                 | Favors Build                                        | Favors Buy                       |
| ---------------------- | --------------------------------------------------- | -------------------------------- |
| **Differentiation**    | Core to competitive advantage                       | Commodity capability             |
| **Control**            | Need full control over behavior and roadmap         | Standard behavior is sufficient  |
| **Integration**        | Deep integration with proprietary systems           | Standard integrations available  |
| **Timeline**           | Have time to build                                  | Need it yesterday                |
| **Team expertise**     | Domain experts on staff                             | Would need to hire               |
| **Maintenance burden** | Have ops capacity                                   | Do not want to maintain          |
| **Vendor risk**        | Vendor could sunset, raise prices, or pivot         | Vendor is stable and well-funded |
| **Data sensitivity**   | Regulatory or security constraints on third parties | Standard data handling           |

---

## Migration Strategies

Migration is where most technical strategies succeed or fail. The ability to get from current state to target state without disrupting the business is a core Staff+ competency.

### The Three Migration Patterns

#### 1. Strangler Fig Pattern

Gradually replace the old system by building new capabilities alongside it and routing traffic incrementally.

```
Phase 1: New system handles 0% of traffic
+------------------+     +------------------+
|   Old System     |<----|    All Traffic    |
|   (100%)         |     |                  |
+------------------+     +------------------+

Phase 2: New system handles some traffic via router
+------------------+     +------------------+     +------------------+
|   Old System     |<----|    Router /       |<----|    All Traffic    |
|   (70%)          |     |    Feature Flag   |     |                  |
+------------------+     +------------------+     +------------------+
         ^                       |
         |                       v
         |               +------------------+
         +---------------|   New System     |
                         |   (30%)          |
                         +------------------+

Phase 3: Old system decommissioned
+------------------+     +------------------+
|   New System     |<----|    All Traffic    |
|   (100%)         |     |                  |
+------------------+     +------------------+
```

**When to use:** Large monolith-to-microservice migrations, API versioning, database migrations.

**Key risk:** The "middle state" persists forever. Set a hard deadline for decommissioning the old system.

#### 2. Parallel Run Pattern

Run both old and new systems simultaneously, comparing outputs to validate correctness before switching.

```
+------------------+
|    All Traffic    |----+
+------------------+    |
                        |
                   +----v----+
                   | Splitter |
                   +----+----+
                        |
              +---------+---------+
              |                   |
        +-----v------+    +------v-----+
        | Old System |    | New System |
        | (Primary)  |    | (Shadow)   |
        +-----+------+    +------+-----+
              |                   |
              v                   v
        +-----+------+    +------+-----+
        |  Response  |    |  Response  |
        |  (Served)  |    |  (Logged)  |
        +-----+------+    +------+-----+
              |                   |
              +--------+----------+
                       |
                 +-----v------+
                 | Comparator |
                 | (Diff Log) |
                 +------------+
```

**When to use:** Financial systems, systems where correctness is critical, data pipeline migrations.

**Key risk:** Running two systems doubles operational cost. Time-box the parallel run.

#### 3. Feature Flag Migration

Use feature flags to gradually roll out the new system to users, starting with internal users, then a small percentage, then everyone.

```
Rollout Timeline:
Day 1:   [Internal only     ] ████░░░░░░░░░░░░░░░░  5%
Week 1:  [Internal + beta   ] ████████░░░░░░░░░░░░  10%
Week 2:  [Expand to 25%     ] ████████████░░░░░░░░  25%
Week 3:  [Expand to 50%     ] ████████████████░░░░  50%
Week 4:  [Expand to 100%    ] ████████████████████  100%
```

**When to use:** User-facing features, gradual rollouts, A/B testing migration quality.

**Key risk:** Feature flag debt. Remove the flag and old code path after migration completes.

### Migration Planning Checklist

| Phase           | Tasks                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Discovery**   | Map all dependencies on the old system. Identify data migration needs. Catalog all consumers. |
| **Design**      | Choose migration pattern. Define rollback triggers. Set success metrics.                      |
| **Preparation** | Build observability for old and new systems. Create runbooks. Communicate timeline.           |
| **Execution**   | Migrate incrementally. Monitor closely. Hold go/no-go checkpoints.                            |
| **Validation**  | Compare outputs. Run integration tests. Validate performance under load.                      |
| **Cleanup**     | Decommission old system. Remove feature flags. Update documentation.                          |

---

## Technical Roadmapping

A technical roadmap communicates what you are building, why, and in what order. It is the artifact that turns strategy into execution.

### Roadmap Structure

```
+------------------------------------------------------------------+
|                     TECHNICAL ROADMAP                              |
+------------------------------------------------------------------+
|                                                                    |
|  NOW (This Quarter)           NEXT (Next Quarter)                 |
|  ----------------------       ----------------------               |
|  - Migrate auth to OAuth2     - Unified API gateway               |
|  - Add structured logging     - Self-service onboarding           |
|  - Fix top 3 perf issues      - Event-driven architecture v1     |
|                                                                    |
|  LATER (Next Half)            FUTURE (Aspirational)               |
|  ----------------------       ----------------------               |
|  - Multi-region deployment    - Real-time ML feature store        |
|  - GraphQL federation         - Zero-trust networking             |
|  - Automated canary deploys   - Fully serverless compute          |
|                                                                    |
+------------------------------------------------------------------+
```

### Roadmap Principles

1. **Sequence by dependency, not desire.** Build foundations before features.
2. **Include tech debt explicitly.** If tech debt is not on the roadmap, it will not get done.
3. **Show the "why" for each item.** Link to business goals, OKRs, or risk reduction.
4. **Leave slack.** A roadmap at 100% capacity will fail. Plan for 70% utilization.
5. **Review quarterly.** The roadmap is a living document, not a contract.

---

## Communicating Technical Vision to Non-Technical Stakeholders

This is the skill that separates Staff engineers from Principals. If you cannot explain your technical strategy to a VP of Product or a CFO, you cannot get it funded.

### The Three Audiences

| Audience        | They Care About                      | Speak In Terms Of                           |
| --------------- | ------------------------------------ | ------------------------------------------- |
| **Engineering** | Architecture, patterns, correctness  | Systems, latency, throughput, reliability   |
| **Product**     | Features, timelines, user impact     | Capabilities, velocity, customer experience |
| **Executive**   | Revenue, risk, competitive advantage | Investment, ROI, strategic positioning      |

### Translation Examples

| Technical Concept                                      | For Product                                                                                                                        | For Executives                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "We need to decompose the monolith into microservices" | "This will let us ship features 3x faster because teams can deploy independently"                                                  | "This reduces our time-to-market from 3 months to 1 month per feature, directly impacting our competitive response time" |
| "We should adopt event-driven architecture"            | "This means different parts of the product can react to changes in real-time without us building custom integrations for each one" | "This reduces integration cost for each new product line from 2 engineer-months to 2 engineer-weeks"                     |
| "Our test coverage is at 30%, we need to reach 80%"    | "Right now, one in three releases has a bug that reaches customers. This investment cuts that to one in ten"                       | "Our current defect rate costs us approximately $200K/quarter in support escalations and customer churn"                 |

---

## Interview Questions & Strong Answers

### Q1: "Describe a time you set technical direction for your team or organization."

**Strong Answer (L6 Signal):**

**Situation:** "I was a Staff engineer at a mid-size e-commerce company. Our backend was a Python monolith that had grown over 5 years. Deploy times were 45 minutes, test suites took 2 hours, and teams were stepping on each other with merge conflicts daily. We had 8 backend teams and shipping velocity had declined 40% year-over-year despite headcount growing 50%."

**Task:** "I took on the responsibility of defining our backend architecture strategy for the next 2 years. No one had explicitly asked me to do this, but I saw that every team was working around the monolith problem in their own way, creating more fragmentation."

**Action:** "I started by gathering data. I instrumented our CI/CD pipeline to measure deploy frequency, lead time, and change failure rate. I interviewed tech leads from all 8 teams to understand their pain points. I created a technical vision document proposing a modular monolith as an intermediate step before microservices -- most teams wanted to jump straight to microservices, but I calculated that a full microservice migration would take 18 months and require infrastructure we did not have.

I wrote an RFC proposing the modular monolith approach with clear module boundaries based on domain-driven design. I included a technology evaluation comparing three approaches: (1) immediate microservice extraction, (2) modular monolith, and (3) monolith with better tooling. I presented this to the engineering directors and all 8 tech leads in a 90-minute session.

Two tech leads pushed back, arguing microservices were the industry standard and we should not waste time on an intermediate step. I addressed this by showing the dependency graph of our codebase -- teams could not extract services cleanly because the boundaries were not defined. The modular monolith would define those boundaries first, making future service extraction trivial.

I created a phased roadmap: Q1 for establishing module boundaries and build tooling, Q2 for migrating the three highest-contention modules, Q3-Q4 for remaining modules with optional service extraction for modules that needed independent scaling."

**Result:** "After 6 months, deploy times dropped from 45 minutes to 12 minutes because modules could be tested independently. Merge conflict rate dropped 60%. Two modules were extracted as services in Q4 because they needed independent scaling, and the extraction took 2 weeks each instead of the estimated 2 months. The approach became a case study shared across engineering."

---

### Q2: "Tell me about a build vs buy decision you made. What was your reasoning?"

**Strong Answer (L6 Signal):**

**Situation:** "Our company needed a feature flagging system. We had 12 engineering teams shipping features to 4 million users, and we were doing code-based feature toggles -- if/else blocks committed to the codebase with no central management."

**Task:** "I was asked to evaluate whether we should build a custom system or buy an existing solution like LaunchDarkly, Split, or Flagsmith."

**Action:** "I created an evaluation framework with six criteria: fitness for purpose, operational maturity, team capability, ecosystem, total cost of ownership over 3 years, and strategic alignment. I scored three build options (custom from scratch, open-source Flagsmith self-hosted, custom on top of Redis) and two buy options (LaunchDarkly, Split).

The total cost analysis was the deciding factor. LaunchDarkly would cost $180K/year at our scale. Building from scratch would cost approximately 3 engineer-months for v1 plus ongoing maintenance. But when I factored in the operational burden -- on-call, reliability engineering, feature development to keep pace -- the build option was actually more expensive over 3 years.

However, I recommended a nuanced approach: buy LaunchDarkly for user-facing feature flags (where reliability is critical and we need targeting rules), but build a lightweight internal system for backend operational flags (kill switches, traffic routing) using our existing configuration service. This gave us 90% of the value at 60% of the cost of a full buy.

I presented this analysis to the engineering directors with a clear recommendation and invited the tech leads who would be most affected to challenge my assumptions. Two teams had concerns about vendor lock-in, so I also designed an abstraction layer that would let us swap providers without changing application code."

**Result:** "We adopted the hybrid approach. LaunchDarkly was rolled out to all teams within 6 weeks. The internal operational flags system took one engineer 3 weeks to build. Two years later, the abstraction layer proved its value when we renegotiated our LaunchDarkly contract with credible alternatives."

---

### Q3: "How would you approach migrating a critical system with zero downtime?"

**Strong Answer (L6 Signal):**

**Situation:** "We needed to migrate our payment processing from a legacy system to a new platform. The old system processed $2M in transactions daily, and any downtime would directly impact revenue."

**Action:** "I chose the parallel run pattern combined with feature flags. The approach had four phases:

Phase 1 -- Shadow mode: The new system received all requests but its responses were logged, not served. We ran a comparator that flagged any discrepancy between old and new system responses. This ran for 3 weeks and we found and fixed 14 edge cases.

Phase 2 -- Canary: We routed 1% of traffic to the new system, starting with internal test accounts, then expanding to low-value transactions. We monitored error rates, latency, and financial reconciliation daily.

Phase 3 -- Gradual rollout: We expanded from 1% to 10%, 25%, 50%, 100% over 4 weeks. Each expansion had explicit go/no-go criteria: error rate below 0.01%, p99 latency within 10% of the old system, and zero financial discrepancies.

Phase 4 -- Cleanup: After 2 weeks at 100% on the new system, we decommissioned the old system, removed the routing layer, and cleaned up the feature flags.

I also designed a rollback plan at every phase. If any go/no-go criterion was violated, we could revert to the old system within 5 minutes by flipping the feature flag."

**Result:** "The migration completed with zero downtime and zero financial discrepancies. The new system reduced payment processing latency by 40% and gave us PCI DSS Level 1 compliance, which the old system lacked."

---

### Q4: "How do you communicate a technical strategy to a non-technical executive?"

**Strong Answer:**

"I follow a three-part structure: problem in business terms, proposed investment, and expected return.

First, I frame the technical problem as a business problem. Instead of 'our monolith has tight coupling,' I say 'it takes us 3 months to ship a new feature that our competitor ships in 3 weeks, and we are losing deals because of it.'

Second, I describe the investment in terms they understand. Not 'we need to decompose into microservices' but 'we need to invest 4 engineers for 2 quarters to restructure our platform so that teams can ship independently.'

Third, I quantify the expected return. 'After this investment, feature delivery time drops from 3 months to 3 weeks. Based on our pipeline, that is an estimated $2M in deals we can close 2 months faster.'

I always bring a one-page summary with a visual timeline, and I prepare for the three questions executives always ask: 'What happens if we do not do this?', 'How confident are you in these estimates?', and 'What are the risks?'"

---

## Anti-patterns to Avoid

| Anti-pattern                        | Why It Fails                                             | What to Do Instead                                                                      |
| ----------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Resume-driven architecture**      | Choosing tech because it looks good on your resume       | Use the evaluation framework. Choose boring technology for non-differentiating systems. |
| **Boiling the ocean**               | Trying to fix everything at once                         | Phase your strategy. Ship value incrementally.                                          |
| **Ivory tower architecture**        | Designing without input from the teams who will build it | Co-author RFCs with tech leads. Run design reviews before finalizing.                   |
| **Analysis paralysis**              | Evaluating forever, never deciding                       | Set decision deadlines. "Reversible decisions should be made quickly."                  |
| **Not invented here syndrome**      | Building everything custom when great solutions exist    | Apply the build vs buy framework honestly.                                              |
| **Hype-driven development**         | Adopting every new framework                             | Ask "what problem does this solve for us specifically?"                                 |
| **Strategy without execution plan** | Vision document with no migration path                   | Every strategy document must include a phased execution plan.                           |
| **Ignoring organizational context** | Technically optimal but organizationally impossible      | Factor in team skills, political dynamics, and change capacity.                         |

---

## Quick Reference Cheat Sheet

```
TECHNICAL STRATEGY INTERVIEW CHECKLIST
=======================================

BEFORE ANSWERING:
[ ] Identify the level signal expected (L5/L6/L7)
[ ] Frame your answer at strategy level, not implementation level
[ ] Prepare to explain WHY, not just WHAT

RFC ESSENTIALS:
[ ] Problem statement with business impact
[ ] 2-3 alternatives with honest trade-offs
[ ] Recommended approach with clear rationale
[ ] Migration plan with rollback strategy
[ ] Success metrics (measurable)
[ ] Decision deadline

ADR ESSENTIALS:
[ ] Context that motivated the decision
[ ] The decision itself (clear, direct)
[ ] Rationale connecting decision to context
[ ] Alternatives rejected with reasons
[ ] Known consequences (positive and negative)

TECHNOLOGY EVALUATION:
[ ] Fitness for purpose (does it solve the problem?)
[ ] Operational maturity (can we run it?)
[ ] Team capability (can we use it?)
[ ] Total cost of ownership (over 3 years)
[ ] Strategic alignment (does it fit?)

BUILD vs BUY:
[ ] Is it a core differentiator? --> Lean build
[ ] Is it a commodity? --> Lean buy
[ ] Factor in maintenance, not just build cost
[ ] Design for switchability (abstraction layers)

MIGRATION:
[ ] Choose pattern: Strangler Fig, Parallel Run, Feature Flag
[ ] Define rollback triggers at every phase
[ ] Set go/no-go criteria with metrics
[ ] Time-box the "middle state"
[ ] Clean up after migration completes

COMMUNICATING TO EXECUTIVES:
[ ] Problem in business terms (revenue, time, risk)
[ ] Investment in people and time, not technologies
[ ] Expected return with quantified impact
[ ] Risks and mitigations
[ ] One-page visual summary
```

---

[<- Back to Overview](./00-README.md) | [Next: Influencing Without Authority ->](./02-INFLUENCING-WITHOUT-AUTHORITY.md)
