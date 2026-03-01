# Technical Decisions

[Back to Framework](./00-FRAMEWORK.md) | [Previous: Conflict Resolution](./02-CONFLICT-RESOLUTION.md)

---

## What Interviewers Are Looking For

Technical decision questions test whether you can think beyond code. Interviewers want to see that you:

- **Evaluate trade-offs explicitly** rather than defaulting to what you know or what is trendy
- **Consider multiple dimensions** including performance, maintainability, team capability, timeline, cost, and risk
- **Communicate technical reasoning to different audiences** adapting depth for engineers vs. PMs vs. executives
- **Defend your choices with evidence** using data, benchmarks, prototypes, or prior experience
- **Know when to push back on requirements** while still delivering value
- **Accept that there is rarely a "right" answer** and demonstrate comfort with trade-off analysis
- **Think about second-order effects** such as maintenance burden, team learning curve, and operational complexity
- **Revisit decisions when new information arrives** showing intellectual flexibility rather than stubbornness

### Common Technical Decision Areas

| Area | Example Decisions |
|------|------------------|
| **Architecture** | Monolith vs. microservices, sync vs. async, event-driven vs. request-response |
| **Technology Selection** | Language choice, database selection, framework adoption, cloud provider |
| **Build vs. Buy** | Custom solution vs. third-party service, OSS adoption vs. internal tooling |
| **Scale and Performance** | Caching strategies, denormalization, eventual consistency trade-offs |
| **Migration** | When to rewrite vs. refactor, incremental vs. big-bang migration |
| **Technical Debt** | When to pay it down, how to prioritize, how to communicate the cost |

---

## Sample Questions

1. Tell me about a technical decision you made that had significant impact on your team or product.
2. Describe a time you had to choose between two technologies or approaches. How did you decide?
3. Tell me about a time you had to push back on a technical requirement that did not make sense.
4. Give me an example of when you had to explain a complex technical trade-off to a non-technical stakeholder.
5. Tell me about an architecture decision you made. What were the trade-offs, and how has it held up over time?
6. Describe a situation where you chose a simpler solution over a more technically elegant one. Why?
7. Tell me about a time you advocated for paying down technical debt. How did you make the case?
8. Give me an example of a build-vs-buy decision you were involved in. What factors did you consider?
9. Tell me about a time you had to convince your team or manager to adopt a different technical approach.
10. Describe a technical decision you made that turned out to be wrong. What happened, and what did you learn?

---

## How to Structure Your Answer

Technical decision stories should demonstrate structured thinking. The interviewer wants to see your decision-making process, not just the outcome.

### STAR Tailored for Technical Decisions

**Situation:**
Establish the technical context. Make sure the interviewer understands the constraints and stakes. Avoid jargon overload, but do not oversimplify if you are speaking with a technical interviewer.

> "Our e-commerce platform was processing 50,000 orders per day through a monolithic Rails application. During flash sales, the system would struggle above 200 concurrent users, and we had lost approximately $300K in revenue from two outages in the previous quarter."

**Task:**
Clarify your role in the decision and what success looked like.

> "As the senior engineer responsible for the ordering pipeline, I was tasked with proposing an architecture that could handle 10x our current peak load while maintaining the reliability our customers expected."

**Action:**
Walk through your decision-making process:
- What options did you evaluate?
- What criteria did you use?
- What trade-offs did you weigh?
- How did you validate your approach?
- How did you get buy-in from stakeholders?

> "I evaluated three options: vertical scaling of the monolith, a full microservices rewrite, and a targeted extraction of the order processing pipeline into a separate service. I created a decision matrix weighing development time, operational complexity, risk, team expertise, and cost..."

**Result:**
Include both the technical outcome and the business impact. If possible, share how the decision held up over time.

> "We extracted the order pipeline into a separate service using an event-driven architecture. The system handled 12x our previous peak during the next flash sale with zero downtime. Over the following year, the approach proved its value as we extracted two more services using the same pattern."

---

## Strong Answer Examples

### Example 1: Architecture Decision with Trade-off Analysis

**Question:** Tell me about an architecture decision you made and the trade-offs involved.

**Situation:**
"I was the tech lead for a SaaS platform that provided analytics dashboards to enterprise clients. Each client had their own dataset, ranging from a few thousand rows to hundreds of millions. We were running a single multi-tenant PostgreSQL database. Our largest client's queries were starting to affect performance for all other clients, and we had already exhausted the easy optimizations: indexes, query tuning, read replicas. We were losing one enterprise prospect per month because performance during demos was inconsistent."

**Task:**
"I needed to design a data isolation strategy that would guarantee consistent performance per client while keeping operational complexity manageable. Our team was four engineers, so any solution had to be operationally realistic for a small team."

**Action:**
"I evaluated four approaches and created a comparison document for each:

First, database-per-tenant. Complete isolation and performance guarantees, but with 200 clients, we would be managing 200 databases. Schema migrations would become a major operational burden. I estimated the migration effort at eight weeks and ongoing operational cost as high.

Second, schema-per-tenant within the same database instance. Better isolation than our current setup, but still some shared resource contention. Migration effort was six weeks, and operational cost was moderate.

Third, a tiered approach where our top 10 clients (by data volume) got dedicated databases and the remaining 190 shared a multi-tenant database with row-level security. Migration effort was four weeks, and it addressed 90% of our performance problems.

Fourth, migrating to a columnar database optimized for analytics workloads. This would solve the underlying performance issue but require rewriting our entire query layer. Estimated at twelve weeks.

I presented all four options to the team with a scoring matrix covering: development effort, operational overhead, performance guarantee strength, migration risk, and cost. I recommended the tiered approach because it addressed the immediate business problem (losing enterprise prospects) with the lowest risk and allowed us to learn from operating dedicated databases before committing to database-per-tenant for everyone.

I also proposed a specific migration plan: we would start by moving our single largest client to a dedicated database as a pilot, instrument everything, document the operational runbooks, and then migrate the remaining top 10 over the following month. This way, we would catch problems early with minimal blast radius.

The VP of Engineering pushed back, preferring the database-per-tenant approach for its clean architecture. I acknowledged that it was the better long-term architecture but argued that the operational burden was too high for our current team size. I offered a compromise: we would adopt the tiered approach now, with a commitment to revisit database-per-tenant once we had a dedicated SRE team, which was planned for the next quarter."

**Result:**
"We migrated the top 10 clients to dedicated databases over five weeks. Query performance for those clients improved by 8x on average. Performance for the remaining clients improved by 3x because the largest datasets were no longer competing for resources. We stopped losing enterprise prospects immediately. Six months later, when the SRE team was in place, we revisited the decision and migrated all clients to dedicated databases using the runbooks and tooling we had built during the tiered phase. The phased approach meant that the full migration was significantly easier because we had already solved the hard operational problems. The VP of Engineering later told me that the tiered approach was the right call given our constraints at the time."

**Why this is strong:**
- Evaluated multiple options systematically, not just the one chosen
- Used a scoring matrix to make the comparison transparent
- Considered team size and operational reality, not just architecture purity
- Proposed a phased approach that reduced risk
- Handled pushback from leadership with a compromise and rationale
- Followed up: the decision held up and led to a smooth full migration

---

### Example 2: Build vs. Buy Decision

**Question:** Tell me about a build-vs-buy decision you were involved in.

**Situation:**
"I was the backend lead for a B2B platform that needed to add a notification system. Users needed to receive alerts through email, SMS, push notifications, and in-app messages. The PM had scoped it as a two-sprint project assuming we would build it in-house."

**Task:**
"Before we started building, I wanted to evaluate whether building in-house was truly the best use of our engineering time. Notification systems are solved problems, and I suspected the PM's two-sprint estimate underestimated the complexity of handling delivery guarantees, rate limiting, template management, and multi-channel orchestration."

**Action:**
"I spent two days on analysis. First, I broke down the full scope of a production notification system, not just the initial MVP. I listed every feature we would eventually need: delivery tracking, bounce handling, unsubscribe management, template versioning, A/B testing for notification content, rate limiting, retry logic, and compliance (CAN-SPAM, GDPR). The two-sprint estimate covered maybe 30% of this.

Then I evaluated three third-party services. I created accounts, sent test notifications through each channel, measured delivery times, and reviewed their pricing against our projected volume. I also assessed their APIs for how cleanly they would integrate with our existing event system.

I compiled my findings into a one-page recommendation document with three columns: build in-house (estimated 14 engineer-weeks to reach feature parity with the third-party options, plus ongoing maintenance), Service A ($800/month at our scale, strong API, missing in-app notifications), and Service B ($1,200/month, all channels supported, webhook-based delivery tracking that integrated with our event pipeline).

I presented this to the PM and my manager together. I framed it as: 'We can either invest 14 engineer-weeks in a solved problem, or we can spend those weeks building our competitive differentiator features, which are the analytics dashboards our prospects keep asking about.' I recommended Service B despite the higher cost because the in-app notification channel would save us from having to build and maintain that component ourselves."

**Result:**
"We adopted Service B and had the notification system integrated within one sprint. The 13 engineer-weeks we saved were redirected to building the analytics features that became our primary selling point in the next two quarters. The notification service cost us $1,200 per month compared to my estimate of roughly $8,000 per month in ongoing engineering maintenance if we had built it ourselves. After 18 months, we are still on Service B with zero significant issues. The PM adopted a 'build-vs-buy analysis required' step for all feature requests estimated at more than four weeks, which has saved the team from several other build-it-ourselves traps."

**Why this is strong:**
- Proactively questioned the assumption rather than just building
- Thorough analysis with concrete numbers
- Compared total cost of ownership, not just initial build time
- Framed the recommendation in business terms (opportunity cost)
- Showed lasting process improvement

---

### Example 3: Convincing Stakeholders on Technical Direction

**Question:** Tell me about a time you had to convince stakeholders to accept a different technical approach.

**Situation:**
"Our product team wanted to add a real-time analytics dashboard to our platform. The initial technical plan, written by a contractor who had since left, proposed using Apache Kafka for event streaming, Apache Flink for real-time processing, and Apache Druid for the analytics store. The plan looked impressive on paper, but our team of six engineers had zero production experience with any of these technologies."

**Task:**
"As the tech lead, I needed to raise concerns about the proposed stack without appearing to resist innovation or block a high-priority feature. The CPO had already presented the real-time analytics dashboard to the board as a Q2 deliverable."

**Action:**
"I started by acknowledging the strengths of the proposed architecture. Kafka, Flink, and Druid were excellent technologies for real-time analytics at scale. The question was whether they were right for us, right now.

I prepared a risk analysis with three dimensions. First, learning curve: based on blog posts, conference talks, and our own engineers' self-assessment, I estimated four to six weeks before the team would be productive with this stack. Second, operational complexity: we would be introducing three new distributed systems to operate, each with its own failure modes, monitoring requirements, and upgrade procedures. Third, cost: I estimated the infrastructure cost at $4,000 per month for development and staging environments alone, before production.

I proposed an alternative: use our existing PostgreSQL database with materialized views refreshed on a schedule, combined with a lightweight event pipeline using Redis Streams. This would handle our current data volume (roughly 10 million events per day) with sub-second query times. It was not real-time in the strictest sense, but with one-minute refresh intervals, it was 'real enough' for our users' needs.

I created a proof of concept in three days that demonstrated the materialized view approach handling our actual data volume with 800ms p95 query latency. I presented both options to the CTO and CPO: the original plan with the risk analysis, and the alternative with the working proof of concept. I was explicit that the original plan was the better long-term architecture but that the alternative would ship in one-third the time and could be evolved later.

I also proposed a trigger for revisiting the decision: when our event volume exceeded 100 million events per day, we would begin the migration to the Kafka/Flink/Druid stack, and our experience with the simpler system would inform the migration."

**Result:**
"The CTO and CPO approved the simpler approach. We shipped the analytics dashboard in five weeks instead of the estimated fourteen. User adoption was strong, with 78% of enterprise clients using the dashboard within the first month. Query performance was within the targets we had set. Eighteen months later, we hit 50 million events per day and had not yet needed to migrate. The materialized view approach scaled better than I had initially estimated because PostgreSQL's parallel query capabilities continued to improve. We documented a migration plan for the future but avoided spending months on a complex infrastructure project that was not yet necessary."

**Why this is strong:**
- Respects the original proposal and the people behind it
- Uses a structured risk analysis, not just opinions
- Builds a working proof of concept as evidence
- Presents both options fairly, letting stakeholders decide
- Defines a clear trigger for when to revisit the decision
- Honest follow-up: the simpler approach lasted longer than expected

---

## Weak Answer Examples

### Weak Example 1: No Trade-off Discussion

**Question:** Tell me about a technical decision you made.

> "We needed a database, and I chose PostgreSQL because it's the best database. It's reliable, it's open source, it has great community support, and it handles everything we need. We set it up and it worked great."

**Why this is weak:**
- No alternatives considered or discussed.
- "It's the best database" is not a trade-off analysis.
- No mention of what requirements drove the decision.
- No discussion of what was sacrificed by choosing PostgreSQL over alternatives.
- No measurable outcome.

### Weak Example 2: Decision by Trend

**Question:** Why did you choose that technology?

> "We went with microservices and Kubernetes because that's what all the top companies are using. Netflix uses it, Uber uses it, and we wanted to be on the cutting edge. It was a lot of work to set up, but now we have a modern architecture."

**Why this is weak:**
- Decision driven by trends, not requirements.
- "Netflix uses it" is not relevant to your context.
- "A lot of work" suggests the cost was not properly evaluated.
- No mention of whether the complexity was justified by the scale.
- No business impact described.

### Weak Example 3: Pure Technical Detail

**Question:** Tell me about an architecture decision.

> "We used a CQRS pattern with event sourcing. Events are serialized with Protocol Buffers and stored in Kafka topics with a retention period of 7 days. Read models are projected into Elasticsearch with a custom projection engine I built using the actor model. We use snapshotting every 1000 events to keep replay times under 2 seconds."

**Why this is weak:**
- All technical implementation, no context or reasoning.
- Does not explain WHY these choices were made.
- No discussion of alternatives or trade-offs.
- No business impact or result.
- Would lose a non-technical interviewer entirely.

---

## Your Stories Template

### Template 1: Architecture Decision

**Situation:**
"Our [product/system] was facing [performance/scalability/reliability problem]. We had [current architecture] which [limitation]. The business impact was [revenue, users, growth affected]."

**Task:**
"As [your role], I was responsible for [proposing/designing/deciding] the new architecture. Success meant [performance target, timeline, constraints]."

**Action:**
"I evaluated [number] approaches:
1. [Option A]: [pros]. Trade-offs: [cons]. Estimated effort: [time].
2. [Option B]: [pros]. Trade-offs: [cons]. Estimated effort: [time].
3. [Option C]: [pros]. Trade-offs: [cons]. Estimated effort: [time].

I recommended [chosen option] because [key deciding factors]. I validated the approach by [prototype, benchmarks, prior experience]. When [stakeholder] raised concerns about [specific concern], I addressed it by [response]. I proposed [risk mitigation: phased rollout, rollback plan, trigger for revisiting]."

**Result:**
"[Performance metrics achieved]. [Business impact]. The decision [held up / needed adjustment] over [timeframe] because [reason]. I learned [insight about technical decision-making]."

### Template 2: Build vs. Buy

**Situation:**
"Our team needed [capability]. The initial plan was to [build it in-house / buy a service]. [Why the assumption needed to be questioned]."

**Task:**
"I wanted to ensure we were making the best use of [engineering time / budget / resources]. My goal was [objective analysis, not a predetermined outcome]."

**Action:**
"I analyzed the full scope of [the capability], including [features typically underestimated: maintenance, compliance, edge cases]. I evaluated [number] options:
- Build: [effort estimate, ongoing cost, advantages]
- [Service A]: [cost, capabilities, limitations]
- [Service B]: [cost, capabilities, limitations]

I framed the recommendation as [how you communicated: opportunity cost, total cost of ownership, etc.]. I presented to [who] with [supporting evidence]."

**Result:**
"We chose [option]. [Time/money saved or invested]. [Impact on the product/team]. [How the decision held up over time]. The team adopted [process improvement] for future similar decisions."

### Template 3: Pushing Back on Requirements

**Situation:**
"[Stakeholder] requested [feature/requirement]. The requirement as stated would [why it was problematic: too complex, wrong approach, unnecessary]."

**Task:**
"I needed to [redirect the conversation] without simply saying 'no.' I wanted to [understand the underlying need and propose a better path]."

**Action:**
"I asked [clarifying questions] to understand [the real need behind the requirement]. I discovered that [the actual goal]. I proposed [alternative approach] that [met the real need]. I supported my proposal with [evidence: prototype, data, cost comparison]. I addressed [stakeholder's specific concerns] by [how you reassured them]."

**Result:**
"We implemented [the alternative]. The outcome was [measurable: time saved, users served, cost reduced]. [Stakeholder] [reaction and ongoing impact on the relationship]. This experience reinforced [principle about requirements and technical decisions]."

---

## Quick Reference

### Decision-Making Framework

When telling technical decision stories, demonstrate this process:

```
1. DEFINE the problem clearly
   What are we solving? Why does it matter now?

2. IDENTIFY constraints
   Timeline, budget, team skills, existing systems, scale

3. GENERATE options (at least 3)
   Include the obvious choice, a creative alternative, and the status quo

4. EVALUATE with explicit criteria
   Performance, cost, complexity, risk, team capability, maintainability

5. VALIDATE before committing
   Prototype, benchmark, consult experts, check assumptions

6. DECIDE and document
   Make the call, record the reasoning, define success metrics

7. PLAN for the future
   Set triggers for revisiting, define a migration path, monitor outcomes
```

### Do's and Don'ts

| Do | Don't |
|----|-------|
| Evaluate multiple options explicitly | Present only the option you chose |
| Explain your criteria and why they mattered | Let the interviewer guess why you chose something |
| Discuss what you traded away, not just what you gained | Present your choice as having no downsides |
| Tailor technical depth to your audience | Use the same explanation for a PM and a staff engineer |
| Connect technical decisions to business outcomes | Stop at "it was technically better" |
| Show willingness to revisit decisions with new data | Treat decisions as permanent and final |
| Acknowledge uncertainty and risk | Present yourself as always certain |
| Credit others who contributed to the decision | Present complex decisions as solo efforts |

### Key Phrases for Technical Decision Stories

| Use These | Avoid These |
|-----------|-------------|
| "I evaluated three options..." | "I just knew this was the right choice" |
| "The key trade-off was..." | "There was no downside" |
| "I validated the approach by..." | "I was confident it would work" |
| "Given our constraints of..." | "In an ideal world..." |
| "The deciding factor was..." | "It was obvious" |
| "I proposed a phased approach to reduce risk..." | "We just went for it" |
| "When [stakeholder] raised [concern], I..." | "Nobody questioned my decision" |
| "Looking back, I would have..." | "I wouldn't change anything" |

---

*Next: [04 - Failure & Learning](./04-FAILURE-LEARNING.md)*
