# Interview Formats & Preparation

[Back to Overview](./00-README.md)

---

## Overview

Staff+ interview loops are structurally different from IC loops. Instead of 4-5 rounds of coding and system design, you will encounter rounds specifically designed to assess leadership, influence, strategic thinking, and organizational impact. This file covers each format, what signals interviewers look for, and how to prepare.

---

## Staff+ Interview Round Types

```
+------------------------------------------------------------------+
|              TYPICAL STAFF+ INTERVIEW LOOP                        |
+------------------------------------------------------------------+
|                                                                    |
|  ROUND 1: Architecture Review (60 min)                            |
|  Present a system you designed. Deep-dive on trade-offs.          |
|                                                                    |
|  ROUND 2: System Design (45-60 min)                               |
|  Design a new system. Higher expectations than L5 design round.   |
|                                                                    |
|  ROUND 3: Cross-Functional Collaboration (45 min)                 |
|  Behavioral round focused on influence and stakeholder mgmt.      |
|                                                                    |
|  ROUND 4: Leadership & Mentoring (45 min)                         |
|  Behavioral round focused on people development and culture.      |
|                                                                    |
|  ROUND 5: Domain Deep-Dive (45-60 min)                            |
|  Technical depth in your area of expertise.                       |
|                                                                    |
|  ROUND 6: Bar Raiser / Hiring Manager (45-60 min)                 |
|  Holistic assessment. Fills gaps from other rounds.               |
|                                                                    |
+------------------------------------------------------------------+
```

Not every company uses all six rounds. The exact structure varies:

| Company | Notable Differences |
|---------|-------------------|
| **Google** | "Googleyness & Leadership" round. System design expectations are higher. Packet-based hiring committee review. |
| **Meta** | "System Design" round is the primary signal. "Behavioral / Leadership" round. Bar is calibrated to team need. |
| **Amazon** | Leadership Principles mapped to every round. "Bar Raiser" round from a different org. Strong bias toward STAR stories. |
| **Apple** | Heavy culture fit assessment. Technical depth is deeply valued. May include a presentation round. |
| **Microsoft** | "As Appropriate" (AA) round with a senior leader is the final decision maker. "Design" round. |
| **Stripe / Airbnb / Netflix** | Often include a "work sample" or take-home architecture exercise presented during the loop. |

---

## Round 1: Architecture Review

### What It Is

You present a system you designed and built in a previous role. The interviewer asks probing questions about your design decisions, trade-offs, and lessons learned. This round assesses your technical depth, decision-making, and ability to articulate complex systems clearly.

### How to Prepare

**Step 1: Choose your system.** Pick a system that:
- You were the primary architect (not just a contributor)
- Had meaningful scale or complexity
- Required non-obvious trade-offs
- You can discuss for 60 minutes with depth

**Step 2: Prepare a 15-minute presentation.** Structure it as:

```
ARCHITECTURE REVIEW PRESENTATION STRUCTURE
============================================

1. CONTEXT (3 min)
   - What business problem did this solve?
   - What were the constraints (timeline, team, scale)?
   - Why was a new system needed?

2. HIGH-LEVEL ARCHITECTURE (4 min)
   - Draw the system on a whiteboard (practice this)
   - Major components and their responsibilities
   - Data flow through the system
   - Key external dependencies

3. KEY DECISIONS (5 min)
   - 2-3 critical design decisions you made
   - For each: options considered, why you chose this one
   - Trade-offs you accepted

4. RESULTS AND LEARNINGS (3 min)
   - How did it perform? Metrics.
   - What would you do differently?
   - What did you learn?
```

**Step 3: Prepare for deep-dive questions.** The interviewer will spend 30-45 minutes probing your design. Be ready for:

| Question Type | Example | What They Assess |
|--------------|---------|-----------------|
| **Why not X?** | "Why did you choose Kafka over RabbitMQ?" | Whether you explored alternatives seriously |
| **What if Y?** | "What happens if the database goes down?" | Failure mode thinking |
| **Scale challenge** | "How would this work at 100x the current load?" | Understanding of scaling limits |
| **Retrospective** | "What would you change if you started over?" | Self-awareness and growth |
| **Organizational** | "How did you get buy-in for this architecture?" | Influence and communication |

### Signals by Level

| Signal | L5 (Senior) | L6 (Staff) | L7 (Principal) |
|--------|-------------|------------|----------------|
| **Scope** | Owned one complex component | Designed the multi-component system | Defined the architecture that multiple teams built |
| **Trade-offs** | Understood trade-offs within their component | Made trade-offs across components and teams | Made strategic trade-offs affecting the org |
| **Influence** | Proposed the design to their team | Got buy-in from multiple teams | Influenced company-wide technical direction |
| **Learning** | "I learned about X technology" | "I learned about organizational dynamics" | "I reshaped how the company thinks about Y" |

---

## Round 2: System Design (Staff+ Level)

### How Staff+ System Design Differs from L5

At L5, the interviewer wants to see you design a working system. At L6+, they want to see you make **strategic decisions about what to build, what to buy, how to evolve the system over time, and how multiple teams would collaborate to build it**.

### What Changes at Staff+ Level

| Dimension | L5 System Design | L6+ System Design |
|-----------|-----------------|-------------------|
| **Scope** | Design one system | Design a system within an organizational context |
| **Trade-offs** | Technical trade-offs (latency vs throughput) | Organizational trade-offs (build speed vs reusability) |
| **Evolution** | Design for current requirements | Design for 3-year evolution with migration path |
| **Team structure** | Implicit (one team builds it) | Explicit (how would you split this across teams?) |
| **Buy vs build** | Assumed build | You should propose buy/build for each component |
| **Operational** | Mentioned in wrap-up | Core to the design (SLOs, on-call, runbooks) |

### Staff+ System Design Framework

```
1. REQUIREMENTS & SCOPE (5 min)
   Same as L5, but also:
   - "How many teams would build this?"
   - "What is the expected growth over 3 years?"
   - "What existing systems can we leverage?"

2. HIGH-LEVEL ARCHITECTURE (10 min)
   Same as L5, but also:
   - Identify which components to build vs buy
   - Show team ownership boundaries
   - Name the critical path and risks

3. DETAILED DESIGN (15 min)
   Same as L5, but also:
   - Explain how this evolves over time
   - Show the migration path from current state
   - Discuss operational concerns (SLOs, monitoring)

4. ORGANIZATIONAL DESIGN (5 min) -- NEW at Staff+
   - How would you split this across teams?
   - What are the interfaces between teams?
   - What is the rollout strategy?

5. WRAP-UP (5 min)
   - Key risks and mitigations
   - What you would monitor
   - Future improvements
```

---

## Round 3: Cross-Functional Collaboration

### What It Is

A behavioral round focused on how you work with people outside your team: product managers, designers, other engineering teams, leadership. This round directly assesses the Influence pillar.

### Common Questions

1. "Tell me about a time you worked with a product manager to make a technical trade-off."
2. "Describe a situation where you had to align multiple teams with different priorities."
3. "How do you communicate technical decisions to non-technical stakeholders?"
4. "Tell me about a time you influenced a decision outside your area of ownership."
5. "Describe a time when cross-team collaboration was difficult. How did you handle it?"

### What Strong Answers Include

| Element | Why It Matters |
|---------|---------------|
| **Multiple stakeholders** | Shows you operate across boundaries |
| **Different perspectives understood** | Shows empathy and strategic thinking |
| **Specific influence tactic used** | Shows a repeatable methodology |
| **Compromise or creative solution** | Shows you optimize for the org, not yourself |
| **Quantified outcome** | Makes the impact concrete |
| **Relationship maintained** | Shows long-term thinking |

### Preparation Strategy

Prepare 3 stories that cover:
- Working with Product (different incentives)
- Working with another engineering team (shared resources, competing priorities)
- Working with leadership (managing up, getting investment)

---

## Round 4: Leadership & Mentoring

### What It Is

A behavioral round focused on how you develop people, build culture, and demonstrate leadership without management authority.

### Common Questions

1. "How do you grow engineers on your team?"
2. "Tell me about a time you gave difficult feedback."
3. "Describe how you handled a situation with an underperforming engineer."
4. "How do you create an environment where people do their best work?"
5. "Tell me about someone you mentored. What was your approach?"
6. "How do you handle disagreements between engineers on your team?"
7. "What is your approach to code review?"
8. "How do you onboard new engineers effectively?"

### What Interviewers Are Looking For

```
+------------------------------------------------------------------+
|           LEADERSHIP ROUND SCORING SIGNALS                        |
+------------------------------------------------------------------+
|                                                                    |
|  STRONG HIRE:                                                      |
|  + Specific examples of people they developed                     |
|  + Systematic approach (not just ad-hoc mentoring)                |
|  + Understands different needs at different career stages         |
|  + Has given difficult feedback and it changed behavior           |
|  + Creates structural improvements (processes, rituals)           |
|  + Shows genuine care for individuals, not just output            |
|  + Demonstrates sponsorship, not just mentorship                  |
|                                                                    |
|  LEAN HIRE:                                                        |
|  + Good examples but limited to 1:1 mentoring                    |
|  + Feedback approach works but is not structured                  |
|  + Cares about people but has not built systems                   |
|                                                                    |
|  NO HIRE:                                                          |
|  - No concrete examples of developing others                      |
|  - Feedback is vague or avoided                                    |
|  - Leadership means "telling people what to do"                   |
|  - Cannot articulate a mentoring philosophy                       |
|  - Only talks about technical leadership, not people              |
|                                                                    |
+------------------------------------------------------------------+
```

---

## Round 5: Domain Deep-Dive

### What It Is

A technical round where the interviewer explores your depth of expertise in your domain. Unlike a coding interview, this is a conversation about your mental models, opinions, and expertise in a specific area (distributed systems, ML infrastructure, frontend platform, etc.).

### How to Prepare

1. **Know your domain deeply.** Be prepared to discuss the state of the art, common pitfalls, and your opinions on open questions.
2. **Have opinions, and back them up.** "I believe X because of evidence Y and Z" is much stronger than "it depends."
3. **Know the trade-offs.** For any technology or pattern in your domain, be able to articulate when it is the right choice and when it is not.
4. **Stay current.** Read recent papers, blog posts, and conference talks in your domain.

### Example Domain Deep-Dive Questions

| Domain | Example Questions |
|--------|------------------|
| **Distributed Systems** | "How would you design a consensus protocol for our use case?" "What are the trade-offs between strong and eventual consistency in practice?" |
| **Frontend Platform** | "How would you design a micro-frontend architecture for 10 teams?" "What is your approach to managing shared state across independently deployed applications?" |
| **Data Infrastructure** | "How would you design a real-time feature store?" "What are the trade-offs between lambda and kappa architectures?" |
| **ML Infrastructure** | "How would you design a model serving platform that handles 1M predictions/sec?" "How do you handle model versioning and rollback?" |
| **Developer Experience** | "How would you measure developer productivity?" "What is the most impactful investment for improving build times?" |

---

## Round 6: Bar Raiser

### What It Is

A final round designed to evaluate you holistically and fill gaps from other rounds. The bar raiser may be from a completely different team or org. They have veto power and are calibrated to maintain a consistent hiring bar.

### What Makes Bar Raiser Rounds Different

| Characteristic | Regular Round | Bar Raiser |
|---------------|--------------|------------|
| **Interviewer** | Likely from the hiring team | Often from a different org |
| **Focus** | Specific pillar (design, leadership, etc.) | Holistic assessment |
| **Calibration** | Team-level expectations | Company-wide bar |
| **Power** | One signal among many | Often has veto power |
| **Flexibility** | Follows a structured rubric | May improvise based on gaps |

### How to Prepare

You cannot prepare for the specific questions because they vary. Instead:

1. **Be consistent.** The bar raiser will have seen feedback from other rounds. Inconsistencies between your stories will be probed.
2. **Have backup stories.** If you used your best influence story in Round 3, have a second one ready.
3. **Be genuine.** Bar raisers are experienced interviewers who detect rehearsed or exaggerated stories.
4. **Show self-awareness.** When asked about failures or weaknesses, give real examples with genuine reflection.

---

## "How Would You Improve X?" Format

### What It Is

Some companies present their actual system or a described system and ask you to critique it and propose improvements. This is common at Stripe, Airbnb, and Netflix.

### How to Structure Your Response

```
SYSTEM CRITIQUE FRAMEWORK
===========================

1. UNDERSTAND THE SYSTEM (10 min)
   - Ask clarifying questions about the current state
   - Understand the constraints and business context
   - Identify what is working well (do not only criticize)

2. IDENTIFY PROBLEMS (10 min)
   - Categorize issues by severity and type
   - Prioritize by impact on users and business
   - Distinguish between symptoms and root causes

3. PROPOSE IMPROVEMENTS (15 min)
   - Start with the highest-impact, lowest-effort changes
   - For each improvement: what, why, trade-offs, effort
   - Show a phased approach (quick wins then structural changes)

4. IMPLEMENTATION PLAN (10 min)
   - How would you sequence the changes?
   - What risks does the migration create?
   - How would you measure success?
```

### Common Pitfalls

| Pitfall | Why It Fails | Better Approach |
|---------|-------------|-----------------|
| **Only criticizing** | Makes you seem negative and unaware of constraints | Start by acknowledging what works and why |
| **Proposing a full rewrite** | Rewrites almost always fail in practice | Propose incremental improvements |
| **Ignoring organizational context** | The "perfect" system is meaningless if the team cannot build it | Factor in team size, skills, and current velocity |
| **Only technical improvements** | Misses process, observability, and operational improvements | Cover the full spectrum: code, architecture, process, operations |

---

## What Signals Interviewers Look For: L6 vs L7

### L6 (Staff) Signals

| Signal | Example |
|--------|---------|
| **Multi-team scope** | "I coordinated the migration across 4 teams" |
| **Influence without authority** | "I convinced the platform team to change their roadmap" |
| **Technical strategy** | "I authored the RFC that defined our API versioning approach" |
| **People development** | "I created a mentoring program that graduated 3 senior engineers" |
| **Trade-off articulation** | "We chose eventual consistency because our SLA allowed 5-second staleness, and the alternative added 200ms of latency" |

### L7 (Principal) Signals

| Signal | Example |
|--------|---------|
| **Company-wide scope** | "I defined the company's approach to microservice boundaries" |
| **Executive influence** | "I presented the technology strategy to the board" |
| **Industry awareness** | "I recognized that the industry was moving toward X and positioned us to lead" |
| **Organizational design** | "I proposed the team structure that enabled our platform strategy" |
| **Multi-year vision** | "I authored the 3-year technology roadmap that we are still executing" |

---

## Common Mistakes Staff+ Candidates Make

### Mistake 1: Answering at the Wrong Level

The single most common failure. You describe L5 work when the interviewer is evaluating for L6.

**How to calibrate:** Before answering any question, ask yourself: "Does this story demonstrate multi-team impact, influence, and strategic thinking?" If not, pick a different story.

### Mistake 2: All Technology, No People

Staff+ engineers work through people. If every story is about a technical achievement with no mention of how you influenced, mentored, or collaborated, you are signaling L5.

### Mistake 3: No Failures or Weaknesses

Staff+ candidates who present a perfect track record seem either dishonest or lacking self-awareness. Prepare 2-3 stories about failures, mistakes, or things you would do differently.

### Mistake 4: Vague Impact

"The project was successful" is not a result. "We reduced deployment time from 45 minutes to 8 minutes, which increased deployment frequency from 2x/week to daily" is a result.

### Mistake 5: Not Asking Good Questions

At Staff+ level, the questions you ask your interviewer signal your seniority. Prepare 3-5 thoughtful questions about technical strategy, engineering culture, and team challenges.

**Strong questions:**
- "What is the biggest technical challenge your organization is facing in the next year?"
- "How do you balance platform investment with product delivery?"
- "What does the Staff engineer role look like day-to-day on your team?"
- "How are technical decisions made across teams? Is there an RFC process?"
- "What is the biggest thing you would want a Staff engineer to change?"

**Weak questions:**
- "What tech stack do you use?" (could find this on the website)
- "What is the work-life balance like?" (save for recruiter)
- "When is the next promotion cycle?" (focus on the role, not advancement)

### Mistake 6: Not Driving the Conversation

At L5, the interviewer drives. At L6+, you are expected to drive. If the interviewer is doing most of the talking or asking all the questions, you are not demonstrating the right level.

---

## Salary Negotiation for Staff+ Roles

### Understanding Staff+ Compensation Structure

Staff+ compensation is qualitatively different from senior engineer compensation.

| Component | Senior (L5) | Staff (L6) | Principal (L7) |
|-----------|-------------|------------|----------------|
| **Base salary** | 60-70% of total comp | 40-50% of total comp | 30-40% of total comp |
| **Equity** | 20-30% of total comp | 35-45% of total comp | 40-55% of total comp |
| **Bonus** | 10-15% of total comp | 10-15% of total comp | 10-15% of total comp |
| **Total comp (FAANG, 2024-2025)** | $250K-$400K | $400K-$650K | $600K-$1M+ |

**Key insight:** At Staff+, equity is a larger percentage of total comp. This makes the equity structure (RSU vesting schedule, refresh grants, equity type) as important as the base salary number.

### Negotiation Principles

1. **Never give a number first.** When asked for salary expectations, deflect: "I would like to understand the full scope of the role before discussing compensation. What is the range for this level?"

2. **Negotiate total compensation, not just base.** A $20K base increase is $20K. A $50K equity increase at a growing company could be worth much more.

3. **Use competing offers as leverage.** Having multiple offers is the single strongest negotiation position. Even one alternative offer strengthens your hand significantly.

4. **Negotiate non-compensation items.** These are often easier for companies to give and can be very valuable:

| Item | Value | Ease of Approval |
|------|-------|------------------|
| **Signing bonus** | One-time cash to offset equity vesting cliff | Medium |
| **Level** | Being hired at L6 vs L5 affects all future comp | Hard but highest value |
| **Equity refresh** | Guaranteed first-year refresh grant | Medium |
| **Start date** | Flexibility on when you start | Easy |
| **Scope of role** | Which team, what projects, what impact area | Medium |
| **Remote work** | Flexibility on location | Varies by company |

5. **Get everything in writing.** Verbal offers mean nothing. Do not accept until you have the written offer with all negotiated items included.

### Negotiation Script

**When asked for expectations:**
"I am focused on finding the right role and team fit. I would be happy to discuss compensation once we are both excited about the opportunity. Can you share the band for this level?"

**When you receive an offer:**
"Thank you for the offer. I am excited about the role. I would like a few days to review the complete package. Can you walk me through the equity structure and vesting schedule?"

**When countering:**
"I appreciate the offer of $X. Based on my research and the scope of this role, I was expecting something closer to $Y. Can we discuss how to bridge that gap? I am flexible on the structure -- I am open to adjusting the split between base, equity, and signing bonus."

**When you have a competing offer:**
"I want to be transparent: I am also in conversations with [company]. They have made a competitive offer. I prefer your role because of [genuine reason], but I want to make sure the compensation is aligned. Is there flexibility in the package?"

---

## Preparation Timeline

### 4 Weeks Before the Interview

| Week | Focus | Activities |
|------|-------|-----------|
| **Week 1** | Story bank | Identify 6-8 stories. Map to pillars. Draft STAR outlines. |
| **Week 2** | Architecture review | Choose your system. Prepare 15-min presentation. Practice drawing it. |
| **Week 3** | System design practice | Do 3-4 practice system designs at Staff+ level. Focus on strategy and trade-offs. |
| **Week 4** | Mock interviews | 2-3 mock interviews with Staff+ engineers. Get calibration feedback. |

### Daily Practice (30 min/day)

| Day | Activity |
|-----|----------|
| Monday | Tell one story from your bank aloud. Time it. |
| Tuesday | Practice your architecture presentation. |
| Wednesday | Read one blog post about the company's technical challenges. |
| Thursday | Practice one system design problem (45 min). |
| Friday | Review this guide. Update stories based on what you learn. |

---

## Anti-patterns to Avoid

| Anti-pattern | Why It Fails | What to Do Instead |
|-------------|-------------|-------------------|
| **Over-preparing scripts** | Sounds rehearsed, cannot handle follow-ups | Prepare frameworks and key points, not scripts |
| **Studying only coding** | Coding is a small part of Staff+ loops | Balance: 30% coding, 30% design, 40% behavioral/leadership |
| **Ignoring the company's context** | Generic answers do not resonate | Research the company's tech blog, challenges, and scale |
| **Practicing alone** | Cannot calibrate without feedback | Do mock interviews with Staff+ engineers |
| **Accepting the first offer** | Companies expect negotiation at this level | Always negotiate. Be respectful but firm. |
| **Interviewing at only one company** | No negotiation leverage, no calibration | Interview at 2-3 companies in the same time window |

---

## Quick Reference Cheat Sheet

```
INTERVIEW FORMAT PREPARATION CHECKLIST
========================================

ARCHITECTURE REVIEW:
[ ] System chosen (you were the primary architect)
[ ] 15-min presentation prepared and practiced
[ ] Can draw the architecture from memory
[ ] Prepared for "why not X?" questions (3 alternatives per decision)
[ ] Prepared for "what would you change?" reflection
[ ] Practiced 3+ times with a timer

SYSTEM DESIGN (STAFF+):
[ ] Practice at Staff+ level (strategy, not just implementation)
[ ] Include build vs buy analysis for each component
[ ] Include team ownership boundaries
[ ] Include migration and rollout strategy
[ ] Include SLOs and operational design
[ ] Practiced 3+ different problems

CROSS-FUNCTIONAL COLLABORATION:
[ ] 3 stories: PM collaboration, cross-team, managing up
[ ] Each story shows influence tactics used
[ ] Each story has quantified outcomes
[ ] Practiced telling each in 3 min and 5 min versions

LEADERSHIP & MENTORING:
[ ] 3 stories: growing someone, difficult feedback, culture building
[ ] At least 1 story about structural/cultural impact (not just 1:1)
[ ] Can articulate mentoring philosophy
[ ] Prepared for underperformance questions

DOMAIN DEEP-DIVE:
[ ] Can discuss state of the art in your domain
[ ] Have 3+ strong opinions backed by evidence
[ ] Know trade-offs of major technologies in your domain
[ ] Read 5+ recent posts/papers in your domain

BAR RAISER:
[ ] Backup stories for every pillar
[ ] Consistent narrative across all rounds
[ ] 2-3 genuine failure/weakness stories
[ ] Self-awareness demonstrated

QUESTIONS TO ASK:
[ ] 3-5 thoughtful questions about technical strategy
[ ] At least 1 question about engineering culture
[ ] At least 1 question about the biggest challenge

NEGOTIATION:
[ ] Know your market value (levels.fyi, blind)
[ ] Never give a number first
[ ] Negotiate total comp, not just base
[ ] Have competing offers or alternatives
[ ] Get everything in writing

L6 vs L7 SELF-CHECK:
[ ] L6: Multi-team scope, org-level strategy, influence peers
[ ] L7: Company-wide scope, executive influence, industry impact
[ ] Tailor stories to the level you are interviewing for
```

---

[<- Execution & Delivery](./05-EXECUTION-DELIVERY.md) | [Back to Overview](./00-README.md)
