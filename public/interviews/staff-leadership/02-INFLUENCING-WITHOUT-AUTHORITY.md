# Influencing Without Authority

[Back to Overview](./00-README.md)

---

## What Interviewers Are Looking For

At Staff+ levels, your ability to get things done depends almost entirely on influence rather than positional authority. You do not manage the people you need to align. You cannot mandate adoption. You must persuade, build coalitions, and sometimes compromise -- all while maintaining strong technical conviction.

Interviewers assess whether you can:

- **Build consensus** among senior engineers with competing priorities
- **Navigate disagreements** productively without escalating or capitulating
- **Get buy-in** for technical initiatives from people who do not report to you
- **Work effectively with product and business stakeholders** who have different incentives
- **Manage up** by framing technical decisions in terms leadership cares about
- **Apply "disagree and commit"** when the decision goes against your recommendation
- **Maintain relationships** even through conflict

### Level Expectations

| Level          | Influence Signal                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| L5 (Senior)    | Influences team-level decisions through technical credibility. Persuades 1-2 peers.                                    |
| L6 (Staff)     | Builds consensus across 3-5 teams. Navigates disagreements between senior engineers. Influences engineering directors. |
| L7 (Principal) | Shapes VP-level decisions. Influences company-wide technical direction. Resolves deep organizational disagreements.    |

---

## Framework: The Influence Stack

Influence is not a single skill -- it is a stack of capabilities that build on each other.

```
+------------------------------------------------------------------+
|                      THE INFLUENCE STACK                           |
+------------------------------------------------------------------+
|                                                                    |
|  Level 5: ORGANIZATIONAL ALIGNMENT                                |
|  Aligning teams toward a shared technical direction               |
|  "We need all backend teams to adopt this API standard"           |
|                                                                    |
|  Level 4: STAKEHOLDER MANAGEMENT                                  |
|  Working across functions (PM, Design, Ops, Leadership)           |
|  "I need Product to prioritize tech debt this quarter"            |
|                                                                    |
|  Level 3: CONSENSUS BUILDING                                      |
|  Getting agreement among peers with competing views               |
|  "Three tech leads disagree on the migration approach"            |
|                                                                    |
|  Level 2: PERSUASION                                              |
|  Making a compelling case for your technical position              |
|  "I believe we should use Kafka instead of SQS"                   |
|                                                                    |
|  Level 1: TECHNICAL CREDIBILITY                                   |
|  Being respected for your engineering judgment                     |
|  "Others trust my technical opinions"                              |
|                                                                    |
+------------------------------------------------------------------+
```

You must have each level before you can operate at the next. You cannot build consensus (Level 3) without persuasion skills (Level 2), and you cannot persuade without credibility (Level 1).

---

## The Six Influence Tactics

### 1. Data-Driven Arguments

The most powerful influence tool. Hard to argue with numbers.

**How to use it:**

- Instrument systems before proposing changes so you have evidence
- Benchmark alternatives with real workloads, not theoretical analysis
- Show cost in terms the audience cares about (latency for engineers, dollars for leadership)

**Example:** "Our current deployment process causes an average of 2.3 incidents per month. Each incident costs 4 engineer-hours to resolve plus $15K in lost revenue. The proposed CI/CD improvements would cost 6 engineer-weeks but are projected to reduce incidents by 70%."

### 2. Prototype and Demonstrate

Show, do not tell. A working prototype is worth a thousand slides.

**How to use it:**

- Build a minimal proof-of-concept before the debate, not after
- Demonstrate it in a live session where skeptics can ask questions
- Frame it as "exploration" rather than "the answer" to avoid defensiveness

**Example:** Instead of writing a doc arguing for GraphQL, build a thin GraphQL layer over one existing REST endpoint and show the before/after developer experience in a live demo.

### 3. Coalition Building

Get allies before the big meeting. Never walk into a decision meeting cold.

**How to use it:**

- Identify the key decision-makers and their concerns before formal discussions
- Have 1:1 conversations to understand objections and incorporate feedback
- Find the 1-2 people whose support will sway the group and get them on board first
- Give credit to allies publicly ("As Sarah pointed out in our earlier discussion...")

**Example:** Before presenting your RFC to 8 tech leads, have coffee chats with the 3 most influential ones. Incorporate their feedback. When you present, they are already advocates rather than skeptics.

### 4. Finding Common Ground

When people disagree, they usually agree on the problem -- they disagree on the solution. Start from shared ground.

**How to use it:**

- Explicitly acknowledge the other person's concerns and constraints
- Reframe the discussion around shared goals rather than competing solutions
- Propose a decision framework that all parties agree to before evaluating options

**Example:** "We both agree that the current system cannot handle 10x growth. Let me propose criteria for evaluating migration approaches, and then we can score each option against those criteria together."

### 5. Incremental Commitment

Large, scary changes get rejected. Small, reversible steps get approved.

**How to use it:**

- Propose a pilot or proof-of-concept rather than a full migration
- Set success criteria upfront: "If the pilot shows X, we proceed. If not, we revert."
- Use the results of each step to build momentum for the next

**Example:** Instead of "We should migrate all 15 services to Kubernetes," propose "Let us migrate the staging environment for one non-critical service. If deploy time drops by 50% and we have no operational issues in 30 days, we expand to two more services."

### 6. Managing Up

Framing technical decisions for leadership in terms they value.

**How to use it:**

- Translate technical benefits into business outcomes
- Present options with trade-offs rather than a single recommendation
- Anticipate their questions: "What is the risk?", "What is the cost of delay?", "Can we do this faster?"
- Provide a clear recommendation but make them feel they are choosing

**Example:** Instead of "We need to refactor the authentication system," say "Our current auth system is the bottleneck preventing us from launching in the EU market. Option A gets us there in 3 months with moderate risk. Option B is faster but has compliance gaps. I recommend Option A."

---

## The "Disagree and Commit" Framework

One of the most important influence concepts for Staff+ engineers. It means advocating strongly for your position, but if the decision goes the other way, committing fully to the chosen direction.

### When to Apply It

```
+------------------------------------------------------------------+
|              DISAGREE AND COMMIT DECISION TREE                    |
+------------------------------------------------------------------+
|                                                                    |
|  A decision has been made that you disagree with.                 |
|  |                                                                 |
|  +-- Is this a one-way door (irreversible)?                       |
|  |   |                                                             |
|  |   +-- YES --> Escalate one more time with new data.            |
|  |   |          If still overruled, document your concerns         |
|  |   |          and commit fully.                                  |
|  |   |                                                             |
|  |   +-- NO --> Commit immediately.                                |
|  |             It can be reversed if it does not work out.         |
|  |                                                                 |
|  +-- Does it violate safety, security, or ethical principles?     |
|      |                                                             |
|      +-- YES --> Do NOT commit. Escalate formally.                 |
|      |          This is a hard stop, not a disagree-and-commit.   |
|      |                                                             |
|      +-- NO --> Commit fully. Support the decision publicly.      |
|                 Do not undermine it through passive resistance.    |
|                                                                    |
+------------------------------------------------------------------+
```

### What "Commit" Actually Means

| Commit Means                                | Commit Does NOT Mean                            |
| ------------------------------------------- | ----------------------------------------------- |
| Supporting the decision publicly            | Pretending you agree                            |
| Doing your best to make it succeed          | Doing the minimum to not get blamed             |
| Giving honest feedback on execution         | Saying "I told you so" when problems arise      |
| Recording your concerns in an ADR or doc    | Bringing it up in every meeting for months      |
| Revisiting the decision if new data emerges | Waiting for it to fail so you can be vindicated |

---

## Navigating Disagreements with Senior Engineers

Disagreements between senior engineers are inevitable and healthy. The question is not whether you disagree, but how you disagree.

### The Productive Disagreement Process

1. **Separate the person from the position.** Attack the idea, never the person. "I have a different perspective on this approach" not "Your approach is wrong."

2. **Seek to understand first.** Ask questions before making counterarguments. "Help me understand why you favor approach A over B -- what am I missing about the constraints?"

3. **Make your reasoning visible.** Do not just state your conclusion. Show your chain of reasoning so others can identify where they diverge. "My thinking is: given constraints X and Y, we need property Z, which approach A provides but B does not. Where do you see it differently?"

4. **Identify the crux.** Most disagreements have one or two key points of divergence. Find them. "It sounds like we agree on everything except whether latency or throughput is the primary constraint. How can we resolve that?"

5. **Propose a test.** If the disagreement persists, suggest a time-boxed experiment. "What if we spike both approaches for a week and compare the results against our acceptance criteria?"

6. **Escalate gracefully if needed.** If two peers cannot resolve a disagreement, escalating to a shared manager is not failure -- it is mature. "We have been going back and forth on this for two weeks. I think we should bring this to [Director] with both perspectives laid out."

### Disagreement Anti-patterns

| Anti-pattern                        | Why It Damages Influence                                  | Better Approach                                                     |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| **Anchoring to your first opinion** | Looks like ego, not conviction                            | "I have updated my thinking based on what you shared"               |
| **Appealing to authority**          | "Google does it this way" is not a reason                 | "Given our specific constraints, this approach works because..."    |
| **Weaponizing data**                | Cherry-picking metrics to win                             | Present data honestly, including data that challenges your position |
| **Silent disagreement**             | Not raising concerns, then saying "I told you so"         | Voice concerns clearly during the decision process                  |
| **Escalating prematurely**          | Going to management before trying to resolve peer-to-peer | Always attempt direct resolution first                              |
| **Making it personal**              | "You always choose the complex solution"                  | "This particular approach has more moving parts than we need"       |

---

## Working with Product Managers and Leadership

Staff+ engineers are embedded in cross-functional decision-making. Your relationship with product and leadership directly affects your ability to execute technical strategy.

### The Product-Engineering Partnership Model

```
+------------------------------------------------------------------+
|           PRODUCT-ENGINEERING DECISION MATRIX                     |
+------------------------------------------------------------------+
|                                                                    |
|             Product Decides    |    Engineering Decides            |
|  (WHAT and WHEN)               |    (HOW and architecture)         |
|  +-----------------------------|-------------------------------+   |
|  | Feature prioritization      | Technology choices            |   |
|  | User-facing requirements    | System architecture           |   |
|  | Business metrics/OKRs       | Technical debt prioritization |   |
|  | Go-to-market timing         | Code quality standards        |   |
|  | Customer segmentation       | Infrastructure decisions      |   |
|  +-----------------------------|-------------------------------+   |
|                                                                    |
|             Shared Decisions                                       |
|  +---------------------------------------------------------+      |
|  | Scope trade-offs (feature richness vs delivery speed)    |      |
|  | Technical investment allocation (features vs platform)   |      |
|  | Risk tolerance (move fast vs reliability)                |      |
|  | Staffing and team structure                              |      |
|  +---------------------------------------------------------+      |
|                                                                    |
+------------------------------------------------------------------+
```

### How to Influence Product Priorities

1. **Frame technical needs as business risks.** Not "We need to reduce tech debt" but "If we do not address database scaling this quarter, we will hit a hard limit at 500K users that will cause outages during our peak launch."

2. **Propose trade-offs, not mandates.** "We can ship Feature X in 4 weeks with temporary workarounds, or in 6 weeks with a sustainable architecture. The workaround will add 2 weeks of debt remediation next quarter."

3. **Build a track record.** If you consistently make accurate predictions about technical risk, product will start trusting your judgment. Track your predictions.

4. **Speak their language.** Velocity. User impact. Revenue. Time-to-market. These are the terms that resonate with product leaders.

---

## STAR-Format Example Stories

### Story 1: Influencing a Cross-Team Architecture Decision

**Question:** "Tell me about a time you influenced a technical decision you did not own."

**Situation:** "I was a Staff engineer on the payments team. The platform team was building a new API gateway that would affect all 10 product teams. They had chosen a custom-built solution in Go. I believed this was the wrong approach -- we should use an existing solution like Kong or Envoy -- but the decision sat with the platform team's tech lead."

**Task:** "I needed to influence a decision I did not own, made by a peer who had strong technical opinions and organizational authority over the gateway project."

**Action:** "I started by understanding their reasoning. I scheduled a 1:1 with the platform tech lead and asked genuine questions about why they chose to build custom. I learned their primary concern was that off-the-shelf solutions did not support our custom authentication flow well.

I validated this concern by spiking a proof-of-concept with Envoy and our auth system over three days. I found that with a custom auth plugin -- about 2 weeks of work -- Envoy could handle our auth flow. I documented the spike with benchmarks showing Envoy matching the custom solution's performance while providing routing, rate limiting, and observability for free.

Rather than presenting this as 'you are wrong,' I shared the spike results in our architecture review meeting as 'I was curious about this and wanted to share what I found.' I highlighted the maintenance burden: a custom gateway would need 2 dedicated engineers for ongoing development, while Envoy would need 0.5.

The platform tech lead initially pushed back, concerned about losing control. I acknowledged this was a real trade-off and proposed a compromise: use Envoy for the data plane but build a custom control plane for configuration, giving us the reliability of a battle-tested proxy with the flexibility of custom routing rules.

I also spoke privately with two other tech leads whose teams would be affected. They raised the same concerns about the custom build during the next review meeting, which meant the feedback was coming from multiple directions, not just me."

**Result:** "The platform team adopted the hybrid approach. We shipped the API gateway in 8 weeks instead of the estimated 16 weeks for the custom build. In the first year, the Envoy-based gateway handled 2 billion requests with 99.99% availability. The platform tech lead later told me he was glad I pushed back and appreciated that I had done the homework rather than just arguing from opinion."

---

### Story 2: Getting Buy-In for a Large Technical Investment

**Question:** "How did you convince leadership to invest in a technical initiative?"

**Situation:** "Our company's observability was fragmented: different teams used different logging, metrics, and tracing tools. When incidents occurred, it took an average of 45 minutes just to correlate signals across systems. We were losing approximately $50K per major incident in engineering time and customer impact."

**Task:** "I wanted to drive adoption of a unified observability platform across the engineering organization, but this would require a $200K annual tool investment and 3 months of migration effort from every team."

**Action:** "I knew that a proposal this large needed a coalition, not a lone advocate. I started by gathering data from the last 20 incident postmortems, calculating the time spent on signal correlation versus actual diagnosis. The data showed that 40% of incident resolution time was spent just finding the right logs.

Next, I built a coalition. I identified three allies: a Staff SRE who was frustrated with the current state, a Director of Engineering who had lost a major customer due to a slow incident response, and the VP of Product who was concerned about our reliability reputation. I had separate conversations with each, tailoring my pitch to their concerns.

I wrote an RFC with three options: (1) standardize on our existing fragmented tools with better integration, (2) adopt a commercial platform (Datadog), and (3) build a custom platform on open-source (OpenTelemetry + Grafana stack). I included 3-year total cost analysis for each option.

I presented the RFC at our monthly engineering leadership meeting. The VP of Engineering was concerned about the $200K annual cost. I was prepared for this: I showed that our current fragmented approach was costing us $300K annually in incident response inefficiency, plus the unquantified cost of engineer frustration and attrition. The investment would pay for itself in 8 months.

Three team leads raised concerns about migration effort competing with their feature roadmaps. I addressed this by proposing a phased approach: the observability team would handle 80% of the migration work, and each product team would only need to allocate 1 engineer for 1 week to instrument their services."

**Result:** "Leadership approved the investment. We completed the migration in 4 months. Mean time to resolution for incidents dropped from 45 minutes to 12 minutes. Three teams that had been the most resistant became the strongest advocates after experiencing the improvement. The VP of Engineering cited this initiative in the next board meeting as an example of smart technical investment."

---

### Story 3: Disagree and Commit

**Question:** "Tell me about a time the decision went against your recommendation. What did you do?"

**Situation:** "I strongly advocated for adopting TypeScript across our frontend organization. I had written an RFC, built a migration tool, and gotten buy-in from 4 of 6 frontend tech leads. However, the Director of Frontend Engineering decided against it, citing the migration cost and the fact that we were about to enter a critical product launch period."

**Task:** "I needed to accept a decision I disagreed with and support it without undermining the initiative or damaging my relationship with the Director."

**Action:** "I asked the Director for a 30-minute 1:1 to understand her full reasoning. She shared concerns I had not fully considered: two teams were already behind on their launch milestones, and adding a migration would create real risk. She also mentioned that several senior engineers had raised concerns about TypeScript's learning curve privately.

I told her I understood the decision and would support it. I documented my concerns and the data I had gathered in an ADR so the reasoning would be preserved. I then sent a brief message to the tech leads who had supported the TypeScript initiative, explaining the decision, the reasoning behind it, and asking them to commit to the current JavaScript approach for the launch.

Critically, when engineers on my team complained about the decision, I defended it: 'The Director weighed factors we were not considering, and the timing is wrong. Let us focus on shipping the launch.'

Six months later, after the launch, the Director proactively brought up the TypeScript initiative. She asked me to revive the RFC. Two of the concerns -- the learning curve and team readiness -- had been addressed because several engineers had started using TypeScript in personal projects during the interim."

**Result:** "We adopted TypeScript 8 months later than I originally proposed, but with broader support and better timing. The migration went smoother because more engineers were already familiar with TypeScript. The Director told me that my willingness to commit to her decision and not relitigate it was a key reason she trusted me to lead the eventual migration."

---

## Interview Questions Bank

### Common Questions

1. "Tell me about a time you influenced a technical decision you did not own."
2. "Describe a time you had to get buy-in from multiple teams with competing priorities."
3. "How do you handle disagreements with other senior engineers?"
4. "Tell me about a time you worked with a PM who had a different technical opinion."
5. "Describe a situation where you had to manage up -- influencing your skip-level or above."
6. "Tell me about a time the decision went against your recommendation."
7. "How do you build trust with teams you do not work with daily?"
8. "Describe a time you changed your mind based on someone else's argument."
9. "Tell me about a time you had to drive alignment across an organization."
10. "How do you handle a situation where a team is not adopting a standard you helped define?"

### What Great Answers Have in Common

| Element                             | Why It Matters                                                    |
| ----------------------------------- | ----------------------------------------------------------------- |
| **Empathy for the other side**      | Shows you understand that reasonable people can disagree          |
| **Process, not just outcome**       | Shows your influence methodology is repeatable                    |
| **Willingness to compromise**       | Shows you optimize for org outcomes, not personal wins            |
| **Data and evidence**               | Shows you persuade with substance, not politics                   |
| **Long-term relationship thinking** | Shows you value working relationships over winning arguments      |
| **Self-awareness**                  | Shows you recognize when you were wrong or could have done better |

---

## Anti-patterns to Avoid

| Anti-pattern              | Why It Fails                                                         | What to Do Instead                                                        |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **The Lone Wolf**         | Building a solution alone and presenting it as a fait accompli       | Involve stakeholders early. Co-design, do not present.                    |
| **The Politician**        | Saying different things to different audiences                       | Be consistent. People compare notes.                                      |
| **The Bulldozer**         | Using seniority or technical depth to overpower rather than persuade | Win with evidence and empathy, not authority.                             |
| **The Conflict Avoider**  | Never raising disagreements to maintain harmony                      | Productive conflict is essential. Avoiding it creates bigger problems.    |
| **The Passive Aggressor** | Saying "I support this" but undermining it through inaction          | If you commit, commit fully. If you cannot, say so.                       |
| **The Credit Taker**      | Presenting shared ideas as solely your own                           | Give credit generously. It builds your coalition for next time.           |
| **The Perfectionist**     | Refusing to compromise because the solution is not ideal             | Perfect is the enemy of shipped. Find the 80% solution everyone supports. |
| **The Memo Writer**       | Relying solely on written communication for persuasion               | Documents inform, but relationships persuade. Have the 1:1 conversations. |

---

## Quick Reference Cheat Sheet

```
INFLUENCE INTERVIEW CHECKLIST
==============================

PREPARING STORIES:
[ ] Each story shows multi-team or cross-functional influence
[ ] You can articulate the other side's perspective genuinely
[ ] Each story includes a specific influence tactic you used
[ ] At least one story involves "disagree and commit"
[ ] At least one story involves managing up (Director+ level)
[ ] Outcomes are measurable and tied to business impact

THE SIX INFLUENCE TACTICS:
1. Data-Driven Arguments -- Lead with evidence, not opinion
2. Prototype and Demonstrate -- Show, do not tell
3. Coalition Building -- Get allies before the big meeting
4. Finding Common Ground -- Start from shared goals
5. Incremental Commitment -- Propose small, reversible steps
6. Managing Up -- Frame in business terms

DURING THE INTERVIEW:
[ ] Show empathy for opposing viewpoints
[ ] Explain your reasoning chain, not just conclusions
[ ] Demonstrate willingness to compromise
[ ] Show long-term relationship awareness
[ ] Mention what you learned or would do differently

PRODUCTIVE DISAGREEMENT PROCESS:
1. Separate person from position
2. Seek to understand first (ask questions)
3. Make your reasoning visible (show the chain)
4. Identify the crux of disagreement
5. Propose a test or experiment
6. Escalate gracefully if needed

DISAGREE AND COMMIT:
[ ] Voice concerns clearly during the decision process
[ ] Once decided, support publicly and privately
[ ] Document concerns for future reference (ADR)
[ ] Do NOT undermine through passive resistance
[ ] Revisit only if genuinely new data emerges

RED FLAGS INTERVIEWERS WATCH FOR:
x Story has no real conflict or disagreement
x You always got your way (signals lack of humility)
x You cannot articulate the other side's reasoning
x Outcome is vague ("it worked out")
x No mention of what you would do differently
x Story is purely about individual contribution
```

---

[<- Technical Strategy](./01-TECHNICAL-STRATEGY.md) | [Next: System Thinking ->](./03-SYSTEM-THINKING.md)
