# System Thinking

[Back to Overview](./00-README.md)

---

## What Interviewers Are Looking For

System thinking is the ability to see the organization as a complex, interconnected system -- not just a collection of independent teams and services. Staff+ engineers are expected to identify bottlenecks that no single team owns, make trade-offs that span organizational boundaries, and design solutions that optimize for the whole, not just their part.

Interviewers assess whether you can:

- **Identify organizational bottlenecks** that cross team boundaries
- **Balance platform vs product engineering** investments
- **Prioritize technical debt** using principled frameworks
- **Make build/buy/partner decisions** that consider long-term consequences
- **Plan capacity** ahead of demand, not in response to outages
- **Drive incident management and postmortem culture** that produces systemic improvement
- **Define and manage SLOs, SLIs, and error budgets** that balance reliability with velocity

### Level Expectations

| Level          | System Thinking Signal                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| L5 (Senior)    | Understands how their system fits into the broader architecture. Identifies upstream/downstream dependencies.                                        |
| L6 (Staff)     | Maps organizational bottlenecks across teams. Proposes platform investments that accelerate multiple teams. Defines SLOs for their domain.           |
| L7 (Principal) | Shapes company-wide platform strategy. Makes capacity investments that anticipate 2-3 year growth. Defines reliability culture for the organization. |

---

## Framework: The Organizational Systems Map

Before you can improve a system, you need to see it. Most engineers think about their team's systems. Staff+ engineers think about the organization as a system.

```
+------------------------------------------------------------------+
|                  ORGANIZATIONAL SYSTEMS MAP                       |
+------------------------------------------------------------------+
|                                                                    |
|  EXTERNAL FORCES                                                   |
|  +------------------------------------------------------------+   |
|  | Customer demand | Competitor moves | Regulatory changes     |   |
|  +------------------------------------------------------------+   |
|         |                    |                   |                  |
|         v                    v                   v                  |
|  BUSINESS LAYER                                                    |
|  +------------------------------------------------------------+   |
|  | Revenue targets | Product roadmap | Hiring plan              |   |
|  +------------------------------------------------------------+   |
|         |                    |                   |                  |
|         v                    v                   v                  |
|  ENGINEERING LAYER                                                 |
|  +------------------------------------------------------------+   |
|  | Team structure | Tech stack | Processes | Culture            |   |
|  +------------------------------------------------------------+   |
|         |                    |                   |                  |
|         v                    v                   v                  |
|  INFRASTRUCTURE LAYER                                              |
|  +------------------------------------------------------------+   |
|  | Compute | Storage | Networking | Observability               |   |
|  +------------------------------------------------------------+   |
|         |                    |                   |                  |
|         v                    v                   v                  |
|  OUTPUT                                                            |
|  +------------------------------------------------------------+   |
|  | Shipping velocity | Reliability | Developer experience       |   |
|  +------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

**Key insight:** Problems at the output layer (slow shipping, low reliability) are almost always caused by constraints at higher layers (team structure, process, hiring). Fixing the symptom without addressing the cause is the most common mistake.

---

## Identifying Bottlenecks Across Teams

### The Theory of Constraints Applied to Engineering

Every engineering organization has one (or a few) constraints that limit overall throughput. Improving anything other than the constraint is waste.

```
+------------------------------------------------------------------+
|          THEORY OF CONSTRAINTS: FIVE FOCUSING STEPS               |
+------------------------------------------------------------------+
|                                                                    |
|  1. IDENTIFY the constraint                                        |
|     "What is the one thing slowing the entire organization?"       |
|                                                                    |
|  2. EXPLOIT the constraint                                         |
|     "How can we maximize throughput of the bottleneck              |
|      without adding resources?"                                    |
|                                                                    |
|  3. SUBORDINATE everything else                                    |
|     "Align other teams to feed the bottleneck efficiently."        |
|                                                                    |
|  4. ELEVATE the constraint                                         |
|     "Invest to increase the capacity of the bottleneck."           |
|                                                                    |
|  5. REPEAT                                                         |
|     "Once this constraint is broken, find the next one."           |
|                                                                    |
+------------------------------------------------------------------+
```

### Common Engineering Bottleneck Patterns

| Bottleneck                   | Symptoms                                                                   | Typical Root Cause                                                       |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Shared service team**      | Every team is waiting on one team for API changes, reviews, or deployments | Centralized ownership of a critical capability                           |
| **CI/CD pipeline**           | Builds take 30+ minutes, developers batch changes, feedback loops are slow | Underinvestment in build infrastructure, monorepo without proper caching |
| **Code review**              | PRs sit for 2+ days waiting for review from overloaded senior engineers    | Too few qualified reviewers, no review SLOs, unclear ownership           |
| **On-call burden**           | Key engineers spend 30%+ time on incidents, reducing feature velocity      | Underinvestment in reliability, no error budgets, reactive firefighting  |
| **Data team**                | Product teams wait weeks for data pipeline changes or new metrics          | Centralized data ownership, no self-serve analytics                      |
| **Environment provisioning** | Teams wait days for test environments or staging resources                 | Manual provisioning, shared environments with contention                 |

### How to Present Bottleneck Analysis in Interviews

Use this structure:

1. **I noticed...** (the symptom across multiple teams)
2. **I traced it to...** (the root cause, using data)
3. **I proposed...** (a systemic fix, not a point solution)
4. **The trade-off was...** (what we gave up)
5. **The result was...** (measurable improvement)

---

## Platform vs Product Engineering Trade-offs

One of the most important and recurring decisions for Staff+ engineers: how much should the organization invest in platform capabilities (shared infrastructure, developer tools, internal APIs) vs product features (customer-facing functionality)?

### The Platform Investment Framework

```
+------------------------------------------------------------------+
|              PLATFORM INVESTMENT DECISION MATRIX                  |
+------------------------------------------------------------------+
|                                                                    |
|  High   |  INVEST IN PLATFORM    |  CRITICAL PLATFORM            |
|  Reuse  |  (3+ teams will use)   |  (Everyone depends on it)     |
|  Across |  ROI is clear.         |  Must be reliable, scalable.  |
|  Teams  |  Build for reuse.      |  Dedicated team.              |
|         |------------------------|-------------------------------|
|  Low    |  LEAVE IN PRODUCT      |  EXTRACT LATER                |
|  Reuse  |  (Only 1 team uses)    |  (1 team now, growing)        |
|  Across |  Build in product team.|  Build in product, design     |
|  Teams  |  Do not over-engineer. |  for extraction when needed.  |
|         |------------------------|-------------------------------|
|         |  Low Complexity         |  High Complexity              |
|                                                                    |
+------------------------------------------------------------------+
```

### When to Invest in Platform

| Signal                       | Invest in Platform                            | Keep in Product Teams          |
| ---------------------------- | --------------------------------------------- | ------------------------------ |
| **Number of teams affected** | 3+ teams building similar things              | Only 1 team needs it           |
| **Rate of change**           | Stable, well-understood domain                | Rapidly evolving requirements  |
| **Operational burden**       | Centralized ops reduces total cost            | Each team can manage their own |
| **Expertise required**       | Specialized knowledge (security, ML infra)    | General engineering skills     |
| **Consistency requirements** | Must work the same everywhere (auth, logging) | Can vary by team               |

### The Platform Tax Conversation

Staff+ engineers must be able to have the "platform tax" conversation: explaining to product teams why they should use the platform instead of building their own, and explaining to leadership why platform investment slows feature delivery in the short term but accelerates it long term.

**Template for this conversation:**

"Right now, each of our 8 product teams spends approximately 15% of their time on [capability X] -- things like setting up logging, configuring deployments, managing secrets. That is the equivalent of 1.2 full-time engineers per team, or 9.6 engineers total. A 4-person platform team can provide this as a shared service, saving 5.6 engineer-equivalents of effort that goes back to product work. The payback period is approximately 6 months."

---

## Technical Debt Prioritization Frameworks

Technical debt is inevitable. The Staff+ skill is not eliminating all debt -- it is prioritizing which debt to pay down and when.

### Framework 1: Cost of Delay Matrix

Evaluate tech debt by the cost of NOT addressing it, measured over time.

| Debt Item              | Monthly Cost If Ignored                       | Fix Effort        | Payback Period            | Priority |
| ---------------------- | --------------------------------------------- | ----------------- | ------------------------- | -------- |
| Flaky test suite       | $15K (wasted CI, manual retries, missed bugs) | 3 engineer-weeks  | 2 months                  | High     |
| Monolith coupling      | $40K (slow feature delivery, merge conflicts) | 3 engineer-months | 7.5 months                | Medium   |
| Legacy auth system     | $5K (workarounds) but $500K if breached       | 2 engineer-months | Depends on risk tolerance | Depends  |
| Outdated documentation | $3K (onboarding delays)                       | 2 engineer-weeks  | 6.7 months                | Low      |

**Prioritization rule:** Pay back debt with the shortest payback period first, unless risk-based items have catastrophic downside.

### Framework 2: Risk Matrix

For debt items where the cost is probabilistic (security vulnerabilities, scalability limits), use a risk matrix.

```
+------------------------------------------------------------------+
|                     TECH DEBT RISK MATRIX                         |
+------------------------------------------------------------------+
|                                                                    |
|  High     |  MONITOR        |  ACT NOW         |  ACT NOW        |
|  Impact   |  Schedule fix   |  This quarter     |  This sprint    |
|           |  next quarter   |                   |                  |
|           |-----------------|-------------------|-----------------|
|  Medium   |  ACCEPT         |  MONITOR          |  ACT NOW        |
|  Impact   |  Track but      |  Schedule fix     |  This quarter   |
|           |  do not fix yet |  next quarter     |                  |
|           |-----------------|-------------------|-----------------|
|  Low      |  ACCEPT         |  ACCEPT           |  MONITOR        |
|  Impact   |  Ignore unless  |  Track but        |  Schedule if    |
|           |  it worsens     |  do not fix yet   |  easy win       |
|           |-----------------|-------------------|-----------------|
|           |  Low             Medium              High              |
|           |              Probability                               |
|                                                                    |
+------------------------------------------------------------------+
```

### Framework 3: The Four Types of Tech Debt

Not all tech debt is created equal. Different types require different strategies.

| Type                     | Description                                                   | Strategy                                                       |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| **Deliberate-Prudent**   | "We know this is a shortcut, and we will fix it after launch" | Track on the roadmap. Fix within the committed timeline.       |
| **Deliberate-Reckless**  | "We do not have time for testing"                             | This is not debt -- it is negligence. Push back in the moment. |
| **Inadvertent-Prudent**  | "Now that we have shipped, we see a better design"            | Normal evolution. Refactor when the area is next touched.      |
| **Inadvertent-Reckless** | "We did not know what we were doing"                          | Invest in education and code review. Fix highest-risk areas.   |

---

## Capacity Planning

Capacity planning is the practice of ensuring your systems can handle expected load growth before it becomes a crisis.

### Capacity Planning Process

```
+------------------------------------------------------------------+
|                   CAPACITY PLANNING CYCLE                         |
+------------------------------------------------------------------+
|                                                                    |
|  1. MEASURE current utilization                                    |
|     - CPU, memory, storage, network for each service              |
|     - Request rates, queue depths, connection counts              |
|     - Database query volume and storage growth                     |
|                                                                    |
|  2. MODEL growth trajectory                                        |
|     - Historical growth rates (3-6 month trend)                   |
|     - Planned business events (launches, marketing pushes)        |
|     - Organic growth projections from product/business            |
|                                                                    |
|  3. IDENTIFY constraints                                           |
|     - Which resource hits its limit first?                        |
|     - At what date does current capacity run out?                 |
|     - What is the lead time to add capacity?                      |
|                                                                    |
|  4. PLAN additions                                                 |
|     - Scale ahead of demand (minimum 3-month buffer)              |
|     - Factor in procurement/provisioning lead times               |
|     - Budget for burst capacity (1.5-2x steady state)            |
|                                                                    |
|  5. VALIDATE                                                       |
|     - Load test at projected capacity                             |
|     - Identify new bottlenecks that emerge at higher scale        |
|     - Update models with actual data                              |
|                                                                    |
+------------------------------------------------------------------+
```

### Capacity Planning Table

| Resource        | Current Usage  | Growth Rate   | Limit | Exhaustion Date | Action Required By                 |
| --------------- | -------------- | ------------- | ----- | --------------- | ---------------------------------- |
| Database IOPS   | 8K/s           | +15%/month    | 15K/s | 4 months        | 2 months (migration takes 8 weeks) |
| Storage         | 2.1 TB         | +200 GB/month | 5 TB  | 14 months       | 10 months                          |
| API connections | 12K concurrent | +10%/month    | 20K   | 5 months        | 3 months                           |

---

## Incident Management and Postmortem Culture

Staff+ engineers do not just respond to incidents -- they build the systems and culture that prevent recurring incidents and improve response when they do occur.

### Incident Severity Framework

| Severity  | Definition                                                | Response Time       | Who Responds                                         |
| --------- | --------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| **SEV-1** | Complete outage or data loss affecting all users          | Immediate (< 5 min) | Incident commander + on-call from all affected teams |
| **SEV-2** | Major feature degraded or affecting large subset of users | < 15 min            | On-call engineer + team lead                         |
| **SEV-3** | Minor feature broken or small user subset affected        | < 1 hour            | On-call engineer                                     |
| **SEV-4** | Cosmetic issue or workaround available                    | Next business day   | Assigned engineer                                    |

### The Blameless Postmortem

Blameless postmortems are the cornerstone of a learning culture. The goal is systemic improvement, not finding someone to blame.

**Postmortem Template:**

```
INCIDENT POSTMORTEM: [Title]
Date: [Date of incident]
Duration: [Start time - End time]
Severity: [SEV-1/2/3/4]
Author: [Who wrote this]
Participants: [Who was in the postmortem meeting]

SUMMARY
[2-3 sentences describing what happened and the impact]

TIMELINE
[Time] - [Event]
[Time] - [Event]
[Time] - [Event]

IMPACT
- Users affected: [number]
- Revenue impact: [amount]
- Duration: [time]
- Data loss: [yes/no, details]

ROOT CAUSE
[Clear explanation of why this happened.
Focus on systemic causes, not human error.
"Engineer X made a mistake" is NOT a root cause.
"Our deployment process does not verify X" IS a root cause.]

CONTRIBUTING FACTORS
1. [Factor that made the incident more likely or more severe]
2. [Factor]
3. [Factor]

WHAT WENT WELL
1. [Detection was fast because...]
2. [Rollback worked because...]

WHAT WENT POORLY
1. [We did not have a runbook for...]
2. [Alerting was delayed because...]

ACTION ITEMS
| # | Action | Owner | Priority | Due Date |
|---|--------|-------|----------|----------|
| 1 | [Specific, measurable action] | [Name] | P1 | [Date] |
| 2 | [Action] | [Name] | P2 | [Date] |

LESSONS LEARNED
[What does this incident teach us about our systems,
processes, or culture?]
```

### Building Postmortem Culture

| Practice                                    | Why It Matters                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **No blame, ever**                          | If people fear punishment, they hide information. Hiding information makes incidents worse. |
| **Action items tracked to completion**      | Postmortems without follow-through are theater. Track completion rates.                     |
| **Share widely**                            | Send postmortems to all of engineering. Normalize learning from failure.                    |
| **Celebrate thorough postmortems**          | Reward the quality of the investigation, not the severity of the incident.                  |
| **Review action item completion quarterly** | If action items are not getting done, the postmortem process is not working.                |

---

## SLOs, SLIs, and Error Budgets

Defining reliability targets is how Staff+ engineers balance the tension between "move fast" and "do not break things."

### Definitions

| Term                              | Definition                                       | Example                                            |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| **SLI (Service Level Indicator)** | A quantitative measure of a service attribute    | Percentage of requests completed in < 200ms        |
| **SLO (Service Level Objective)** | A target value for an SLI                        | 99.9% of requests complete in < 200ms              |
| **SLA (Service Level Agreement)** | A contract with consequences for missing an SLO  | If uptime drops below 99.9%, customer gets credits |
| **Error Budget**                  | The allowed amount of unreliability (100% - SLO) | 0.1% = 43.8 minutes of downtime per month          |

### Choosing SLOs

```
+------------------------------------------------------------------+
|                   SLO SELECTION PROCESS                            |
+------------------------------------------------------------------+
|                                                                    |
|  1. Identify what users care about                                 |
|     - Availability (can they use the service?)                    |
|     - Latency (is it fast enough?)                                |
|     - Correctness (does it return the right answer?)              |
|     - Freshness (is the data up to date?)                         |
|                                                                    |
|  2. Measure current performance                                    |
|     - What is the actual SLI today?                               |
|     - What do users complain about?                               |
|                                                                    |
|  3. Set targets just above current performance                    |
|     - Do NOT set aspirational targets                              |
|     - Set targets you can actually meet                           |
|     - Tighten over time as reliability improves                   |
|                                                                    |
|  4. Define error budget policy                                     |
|     - What happens when the budget is exhausted?                  |
|     - Who decides to spend error budget on velocity?              |
|     - How is the budget tracked and communicated?                 |
|                                                                    |
+------------------------------------------------------------------+
```

### Error Budget Policy Example

| Error Budget Status  | Engineering Response                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **> 50% remaining**  | Normal development velocity. Ship features. Take calculated risks.                               |
| **25-50% remaining** | Increase caution. Require additional review for risky changes. Run more thorough testing.        |
| **10-25% remaining** | Slow down. Prioritize reliability work. No risky deployments without explicit approval.          |
| **< 10% remaining**  | Feature freeze. All engineering effort goes to reliability until budget recovers.                |
| **Exhausted**        | Full stop on features. Postmortem on budget consumption. Recovery plan required before resuming. |

---

## Interview Questions & Strong Answers

### Q1: "How do you identify and address bottlenecks that span multiple teams?"

**Strong Answer (L6 Signal):**

**Situation:** "At my previous company, our release cadence had slowed from weekly to bi-weekly to monthly over 6 months, despite adding 15 engineers across 4 teams. Leadership was frustrated because they had invested in headcount but velocity was declining."

**Task:** "I volunteered to investigate the root cause because the symptoms were crossing team boundaries and no single team owned the problem."

**Action:** "I started by mapping the entire software delivery lifecycle from code commit to production. I measured every stage: time in code review, CI pipeline duration, staging deployment, QA validation, production deployment. I created a value stream map that showed where time was being spent.

The data revealed that 60% of lead time was spent waiting -- waiting for code review (average 28 hours), waiting for staging environment availability (shared staging, constant conflicts), and waiting for QA sign-off (manual regression testing taking 3 days).

The bottleneck was not any single team -- it was the intersection of three problems that no one owned. I presented the value stream map to all four engineering leads and the VP of Engineering.

I proposed three interventions prioritized by impact: First, implement review SLOs (all PRs reviewed within 4 hours during business hours) and add a second reviewer for each team so reviews did not depend on one person. Second, give each team its own staging environment using ephemeral environments spun up from infrastructure-as-code. Third, automate the top 50 regression tests (which covered 80% of the manual suite) so QA could sign off in hours instead of days.

I created an execution plan where each intervention could be delivered independently, so we did not have to wait for all three. The review SLO was the fastest win and required no tooling investment."

**Result:** "Within 3 months, our release cadence was back to weekly. Lead time from commit to production dropped from 18 days to 4 days. The key insight that I shared with leadership was that adding engineers without removing systemic bottlenecks actually makes things worse because more engineers means more PRs competing for the same constrained reviewers and staging environments."

---

### Q2: "How do you decide how much to invest in platform vs product engineering?"

**Strong Answer (L6 Signal):**

**Situation:** "I was the Staff engineer responsible for backend architecture at a company with 6 product teams and no dedicated platform team. Each product team was building their own observability, deployment pipelines, and internal tooling. I estimated that 20-25% of each team's capacity was spent on undifferentiated infrastructure work."

**Task:** "I needed to make the case for creating a platform team and determine what it should own versus what should stay with product teams."

**Action:** "I conducted a survey across all 6 teams, asking each tech lead to estimate the percentage of time their team spent on different categories: customer features, internal tooling, infrastructure, and operational overhead. I also cataloged the 'shadow platforms' -- cases where multiple teams had built similar solutions.

The data showed: 3 separate logging implementations, 2 deployment pipelines, 4 different approaches to feature flags, and every team had built their own health check endpoints. Estimated duplicated effort: 8 engineer-months per year.

I proposed a platform team charter using a simple framework: the platform team would own any capability used by 3 or more product teams, with the constraint that the platform team would treat product teams as customers with SLOs. I explicitly excluded capabilities used by only 1-2 teams to avoid over-centralizing.

I presented three funding models: (1) tax each product team by 0.5 headcount, (2) hire 3 new platform engineers, or (3) rotate engineers from product teams for 6-month platform stints. I recommended option 2 for the first year with option 3 as a long-term model to keep the platform team connected to product needs."

**Result:** "Leadership approved hiring 3 platform engineers. In the first 6 months, the platform team consolidated logging, built a shared deployment pipeline, and provided a feature flag service. Product teams reported getting back approximately 15% of their capacity. The most telling metric: time to onboard a new engineer dropped from 3 weeks to 1 week because the platform provided a consistent development environment."

---

### Q3: "How do you prioritize technical debt?"

**Strong Answer:**

"I use a combination of two frameworks. First, the cost of delay analysis: for each piece of technical debt, I estimate the monthly cost of not fixing it. This includes direct costs like incident response time, developer productivity loss, and workaround maintenance, plus indirect costs like slower feature delivery and onboarding friction.

Second, for items where the cost is probabilistic -- like security vulnerabilities or scalability limits -- I use a risk matrix that plots probability against impact.

I then calculate a payback period for each item: fix effort divided by monthly cost. Items with payback periods under 3 months are easy wins and should be prioritized immediately. Items with payback periods of 3-12 months go into quarterly planning. Items over 12 months need strong strategic justification.

The critical nuance is that I always present tech debt priorities alongside product priorities, not as a separate list. If tech debt is a separate backlog, it will always lose to features. When I show that fixing our flaky test suite will give the team 2 extra days per sprint for feature work, it becomes a product investment, not a tax."

---

## Anti-patterns to Avoid

| Anti-pattern                            | Why It Fails                                                        | What to Do Instead                                                |
| --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Local optimization**                  | Speeding up one team while slowing the org                          | Map the entire value stream before optimizing                     |
| **Platform for platform's sake**        | Building shared infrastructure nobody asked for                     | Start from product team pain points, not from what seems elegant  |
| **Zero tech debt tolerance**            | Spending all time on perfection, shipping nothing                   | Tech debt is a tool. Deliberate, managed debt is acceptable.      |
| **Reactive capacity planning**          | Scaling only after outages                                          | Build a capacity model. Scale 3 months ahead of demand.           |
| **Blame-driven postmortems**            | Engineers hide information, incidents repeat                        | Blameless postmortems, systemic root causes, tracked action items |
| **SLOs as aspirations**                 | Setting targets you cannot meet, budget always exhausted            | Set SLOs based on current performance, tighten over time          |
| **Ignoring organizational dynamics**    | Proposing a perfect system that requires reorgs nobody will approve | Design solutions that work with the current org structure         |
| **Treating every problem as technical** | Building tools when the problem is process or communication         | Ask "is this a people, process, or technology problem?" first     |

---

## Quick Reference Cheat Sheet

```
SYSTEM THINKING INTERVIEW CHECKLIST
=====================================

BOTTLENECK IDENTIFICATION:
[ ] Map the full value stream (commit to production)
[ ] Measure wait times, not just work times
[ ] Look for constraints at team boundaries
[ ] Use data, not anecdotes
[ ] Present bottleneck analysis as: observed -> traced -> proposed -> trade-off -> result

PLATFORM vs PRODUCT:
[ ] Count how many teams need the same capability
[ ] 3+ teams = platform candidate
[ ] 1-2 teams = keep in product, design for extraction
[ ] Platform team treats product teams as customers with SLOs
[ ] Track platform ROI (time saved across all product teams)

TECH DEBT PRIORITIZATION:
[ ] Calculate monthly cost of NOT fixing each item
[ ] Calculate fix effort
[ ] Payback period = fix effort / monthly cost
[ ] < 3 months payback = do now
[ ] 3-12 months payback = quarterly planning
[ ] > 12 months = needs strategic justification
[ ] Present alongside product priorities, not separately

CAPACITY PLANNING:
[ ] Measure current utilization of all critical resources
[ ] Model growth using historical trends + planned events
[ ] Identify which resource exhausts first
[ ] Plan additions with 3-month buffer minimum
[ ] Validate with load testing

SLOs AND ERROR BUDGETS:
[ ] SLI = what you measure
[ ] SLO = target for the measurement
[ ] Error budget = 100% - SLO (the allowed unreliability)
[ ] Set SLOs based on current performance
[ ] Define error budget policy (what happens when budget runs low)
[ ] Use error budgets to negotiate velocity vs reliability

INCIDENT MANAGEMENT:
[ ] Severity levels defined with response times
[ ] Blameless postmortem process
[ ] Root causes are systemic, not individual
[ ] Action items tracked to completion
[ ] Postmortems shared across engineering
[ ] Quarterly review of action item completion rates

FRAMING FOR INTERVIEWS:
[ ] Always show multi-team scope
[ ] Use data and metrics, not opinions
[ ] Demonstrate the "why" behind the "what"
[ ] Show trade-offs you considered
[ ] Connect technical decisions to business outcomes
```

---

[<- Influencing Without Authority](./02-INFLUENCING-WITHOUT-AUTHORITY.md) | [Next: Mentoring & Growing Engineers ->](./04-MENTORING-GROWING-ENGINEERS.md)
