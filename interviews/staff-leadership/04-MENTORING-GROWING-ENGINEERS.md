# Mentoring & Growing Engineers

[Back to Overview](./00-README.md)

---

## What Interviewers Are Looking For

At Staff+ levels, your impact is measured not just by what you build but by how much you amplify the people around you. Interviewers want evidence that you actively develop other engineers, create environments where people do their best work, and leave teams stronger than you found them.

Interviewers assess whether you can:

- **Mentor engineers** at different career stages with tailored guidance
- **Give effective feedback** that changes behavior, not just communicates displeasure
- **Use code review as a teaching tool**, not a gatekeeping mechanism
- **Design growth paths** that develop engineers from junior to senior
- **Run effective 1:1s** that build trust and surface problems early
- **Distinguish between sponsorship and mentorship** and practice both
- **Create psychological safety** so engineers take risks and learn from failure
- **Build engineering culture** through norms, rituals, and standards
- **Handle underperformers** with clarity and compassion

### Level Expectations

| Level | People Development Signal |
|-------|--------------------------|
| L5 (Senior) | Actively mentors 1-2 junior/mid engineers. Gives constructive code review feedback. Onboards new team members effectively. |
| L6 (Staff) | Designs growth frameworks for the team. Mentors senior engineers. Creates processes that scale learning (tech talks, design reviews, pairing). |
| L7 (Principal) | Shapes engineering culture across the organization. Sponsors high-potential engineers for promotion. Defines what "senior" and "staff" mean at the company. |

---

## Framework: The Growth Multiplier Model

Staff+ engineers operate as multipliers. Your goal is to create an environment where every engineer around you grows faster than they would without you.

```
+------------------------------------------------------------------+
|                   THE GROWTH MULTIPLIER MODEL                     |
+------------------------------------------------------------------+
|                                                                    |
|  DIRECT IMPACT (1:1)                                              |
|  +------------------------------------------------------------+   |
|  | Mentoring | Code review | Pairing | 1:1s | Feedback         |   |
|  +------------------------------------------------------------+   |
|  | Impact: Deep, individual growth                              |   |
|  | Scale: 3-5 people                                            |   |
|                                                                    |
|  STRUCTURAL IMPACT (1:Many)                                       |
|  +------------------------------------------------------------+   |
|  | Design reviews | Tech talks | Documentation | Standards      |   |
|  +------------------------------------------------------------+   |
|  | Impact: Moderate, team-wide learning                         |   |
|  | Scale: 10-30 people                                          |   |
|                                                                    |
|  CULTURAL IMPACT (1:Organization)                                 |
|  +------------------------------------------------------------+   |
|  | Hiring bar | Promo criteria | Learning culture | Norms       |   |
|  +------------------------------------------------------------+   |
|  | Impact: Broad, lasting culture change                        |   |
|  | Scale: 50-200+ people                                        |   |
|                                                                    |
+------------------------------------------------------------------+
```

**Key insight:** L5 operates primarily at the Direct Impact level. L6 adds Structural Impact. L7 adds Cultural Impact. An interview answer about mentoring that only covers 1:1 interactions signals L5, not L6+.

---

## The SBI Feedback Model

SBI (Situation-Behavior-Impact) is the most effective model for giving feedback that is specific, actionable, and non-threatening.

### Structure

| Component | What It Does | Example |
|-----------|-------------|---------|
| **Situation** | Grounds the feedback in a specific event | "In yesterday's design review..." |
| **Behavior** | Describes the observable action (not intent) | "...you interrupted Sarah three times while she was presenting her approach..." |
| **Impact** | Explains the effect of the behavior | "...which made it harder for the team to understand her proposal, and she seemed to disengage for the rest of the meeting." |

### SBI in Practice

**Reinforcing feedback (positive):**

"During the incident last Thursday (Situation), you immediately took charge of communication, posting updates to the status page every 10 minutes and keeping the customer success team informed (Behavior). This meant our customers knew what was happening, and we received zero escalations during a SEV-1 (Impact)."

**Developmental feedback (constructive):**

"In the RFC review for the caching proposal (Situation), you dismissed two alternatives with a single sentence each -- 'that will not scale' and 'too complex' -- without explaining your reasoning (Behavior). The authors of those proposals felt their work was not taken seriously, and two engineers told me they are hesitant to propose alternatives in future RFCs (Impact)."

### SBI Anti-patterns

| Anti-pattern | Example | Why It Fails |
|-------------|---------|-------------|
| **Vague praise** | "Great job this week!" | Not actionable. The person does not know what to repeat. |
| **Character labels** | "You are being defensive" | Attacks identity, not behavior. Triggers defensiveness. |
| **Delayed feedback** | Giving feedback 3 months later | Person cannot recall the situation. Loses impact. |
| **Feedback sandwich** | Positive-negative-positive | People learn to distrust positive feedback. |
| **Public criticism** | Calling out mistakes in team meetings | Damages psychological safety for everyone present. |
| **"You always/never"** | "You always miss deadlines" | Absolute statements feel unfair and shut down dialogue. |

---

## Code Review as Teaching

Code review is the highest-frequency mentoring opportunity most engineers have. Staff+ engineers use code review to teach, not just to gatekeep.

### The Teaching Code Review Framework

```
+------------------------------------------------------------------+
|              CODE REVIEW AS TEACHING SPECTRUM                     |
+------------------------------------------------------------------+
|                                                                    |
|  BLOCKING                      NON-BLOCKING                       |
|  (Must fix before merge)       (Suggestions for learning)         |
|                                                                    |
|  - Correctness bugs            - Design alternatives              |
|  - Security vulnerabilities    - Performance considerations       |
|  - Missing error handling      - Naming suggestions               |
|  - Breaking API contracts      - Code organization ideas          |
|  - Missing tests for           - Patterns they might not know     |
|    critical paths              - Links to relevant resources      |
|                                                                    |
+------------------------------------------------------------------+
```

### Effective Code Review Comments

| Instead Of | Write |
|-----------|-------|
| "This is wrong" | "This will fail when X is null. Consider adding a guard clause -- here is an example from our codebase: [link]" |
| "Why did you do it this way?" | "I see you chose approach A. I have seen approach B work well for similar problems because [reason]. What do you think?" |
| "LGTM" (on a junior's first complex PR) | "This is solid work. Two things stood out: [positive]. One thing to consider for next time: [learning opportunity]." |
| "Nit: rename this variable" | "nit: Consider renaming `d` to `daysUntilExpiry` -- when I first read the function, I was not sure what `d` referred to." |
| "This needs to be refactored" | "This function is doing three things: parsing, validating, and transforming. Extracting these into separate functions would make each one easier to test. Want to pair on this?" |

### Code Review as Growth Accelerator

| Junior Engineer | Mid-Level Engineer | Senior Engineer |
|----------------|-------------------|-----------------|
| Explain the "why" behind standards | Ask questions that prompt deeper thinking | Challenge architectural assumptions |
| Point to documentation and examples | Suggest they review how similar problems were solved elsewhere | Share trade-offs they may not have considered |
| Pair on complex changes | Ask them to present their approach to the team | Invite them to review your code |
| Celebrate growth: "Your error handling has improved significantly" | Give them ownership: "You clearly understand this domain -- what do you think about X?" | Treat as peers: "I had not considered that approach. Interesting trade-off." |

---

## Designing Growth Paths

Staff+ engineers do not just mentor individuals -- they create systems that develop engineers at scale.

### The Four Stages of Engineer Growth

```
+------------------------------------------------------------------+
|                 ENGINEER GROWTH STAGES                             |
+------------------------------------------------------------------+
|                                                                    |
|  STAGE 1: LEARNING (Junior / L3)                                  |
|  Focus: Learn the codebase, tools, and team processes             |
|  Need from mentor: Direction, structure, frequent feedback         |
|  Growth activities: Pair programming, small bug fixes,            |
|                     code review learning                           |
|  Transition signal: Can complete well-defined tasks independently  |
|                                                                    |
|  STAGE 2: CONTRIBUTING (Mid / L4)                                  |
|  Focus: Ship features independently, deepen technical skills      |
|  Need from mentor: Context, challenging assignments, autonomy     |
|  Growth activities: Own a feature end-to-end, design docs,        |
|                     mentoring a junior                             |
|  Transition signal: Can break down ambiguous problems into tasks   |
|                                                                    |
|  STAGE 3: LEADING (Senior / L5)                                   |
|  Focus: Technical leadership, cross-team impact, mentoring        |
|  Need from mentor: Exposure, sponsorship, feedback on influence   |
|  Growth activities: Lead a project, write RFCs, present at        |
|                     tech talks, own on-call                        |
|  Transition signal: Can set direction for a team-level initiative  |
|                                                                    |
|  STAGE 4: MULTIPLYING (Staff+ / L6+)                              |
|  Focus: Organizational impact, strategy, growing others           |
|  Need from mentor: Thought partnership, exec exposure              |
|  Growth activities: Define architecture across teams,             |
|                     build platforms, shape culture                  |
|  Transition signal: Organization works better because of them      |
|                                                                    |
+------------------------------------------------------------------+
```

### Growth Plan Template

| Dimension | Current State | 6-Month Goal | Actions | Support Needed |
|-----------|-------------|-------------|---------|---------------|
| **Technical depth** | Strong in backend, limited distributed systems exposure | Lead design of a distributed caching system | Assign as tech lead for caching project. Pair with Staff engineer on design. | Time for design exploration. Budget for training. |
| **Communication** | Good in 1:1, hesitant in large groups | Present at least 2 tech talks to the org | Start with team-level presentations. Review and coach on delivery. | Feedback after each presentation. |
| **Influence** | Influences within team | Influence one cross-team decision | Assign to cross-team working group. Debrief on stakeholder dynamics. | Introduction to key stakeholders. |
| **Mentoring** | Has not mentored before | Mentor one junior engineer for 6 months | Set up mentoring relationship. Check in monthly. | Mentoring guidelines and support. |

---

## Running Effective 1:1s

1:1s are the primary vehicle for mentoring, feedback, and growth. Ineffective 1:1s are a missed opportunity every week.

### 1:1 Structure

| Time | Activity | Purpose |
|------|----------|---------|
| 0-5 min | **Check-in** | How are they doing? Energy level? Anything on their mind? |
| 5-15 min | **Their agenda** | Always let them go first. This is their meeting. |
| 15-25 min | **Your agenda** | Feedback, growth conversations, context sharing |
| 25-30 min | **Action items and commitments** | What are we each doing before next time? |

### 1:1 Question Bank

**For understanding their experience:**
- "What is the most frustrating thing about your day-to-day right now?"
- "What would you do differently if you were in my role?"
- "On a scale of 1-10, how energized are you by your current work? What would make it a 10?"

**For growth:**
- "What skill do you most want to develop in the next 6 months?"
- "What is the most challenging thing you worked on this week? What did you learn?"
- "Where do you want to be in your career in 2 years? What is one thing we can do this quarter to move toward that?"

**For surfacing problems early:**
- "Is there anything that almost went wrong this week?"
- "If you could change one thing about how our team works, what would it be?"
- "Is there anything you are hesitant to bring up?"

### 1:1 Anti-patterns

| Anti-pattern | Why It Fails | Better Approach |
|-------------|-------------|-----------------|
| **Status updates only** | Wastes a high-value touchpoint on information that could be async | Use async standup for status. Use 1:1s for things that need trust and conversation. |
| **Canceling frequently** | Signals that their growth is not a priority | Reschedule, never cancel. If you must cancel, explain why and reschedule immediately. |
| **Doing all the talking** | The 1:1 is for them, not for you | Aim for 70% them, 30% you. |
| **Only talking about work** | Misses the human dimension | Ask about their life, energy, and motivation. People are not just workers. |
| **No follow-through** | Promising to help and not delivering | Track action items. Follow up at the next 1:1. |

---

## Sponsorship vs Mentorship

These are different activities with different impacts. Staff+ engineers need to practice both.

```
+------------------------------------------------------------------+
|              MENTORSHIP vs SPONSORSHIP                             |
+------------------------------------------------------------------+
|                                                                    |
|  MENTORSHIP                        SPONSORSHIP                    |
|  --------------------------------  --------------------------------|
|  Giving advice                     Giving opportunities           |
|  "Here is how I would approach     "I want you to lead this      |
|   this problem"                     initiative"                   |
|                                                                    |
|  Sharing experience                Sharing your reputation        |
|  "When I was in a similar          "I am recommending you for    |
|   situation..."                     the tech lead role"           |
|                                                                    |
|  Happens in private                Happens in public              |
|  1:1 conversations,               In meetings, promotion         |
|  code reviews                      discussions, staffing          |
|                                                                    |
|  Low risk for you                  High risk for you              |
|  If the advice is wrong,          If the person fails, your      |
|  they learn                        judgment is questioned         |
|                                                                    |
|  The person must self-advocate     You advocate for the person    |
|  "I told them how to get           "I put them in the room       |
|   promoted"                         and vouched for them"         |
|                                                                    |
+------------------------------------------------------------------+
```

### How to Sponsor Effectively

1. **Nominate engineers for high-visibility projects.** "I think Alex should lead the migration. Here is why."
2. **Advocate in promotion discussions.** "I have worked closely with Jordan, and here is evidence they are operating at the next level."
3. **Give credit in public.** "This approach was Priya's idea. She identified the constraint that we had all missed."
4. **Create exposure.** "I would like Sam to present the architecture proposal to the directors. I will coach them on the presentation."
5. **Share your network.** "Let me introduce you to the Principal on the platform team. Your interests overlap."

### Who to Sponsor

Sponsor people who:
- Demonstrate high potential but lack visibility
- Are doing Staff-level work but are not yet recognized for it
- Come from backgrounds that are underrepresented in your org's leadership
- Have shown they can handle increased responsibility

---

## Creating Psychological Safety

Psychological safety is the belief that you will not be punished for making mistakes, asking questions, or proposing ideas. It is the single strongest predictor of high-performing teams (Google's Project Aristotle).

### The Four Stages of Psychological Safety

| Stage | Definition | What It Enables | How You Build It |
|-------|-----------|----------------|-----------------|
| **Inclusion Safety** | "I belong here" | People feel welcome and accepted | Welcome new members actively. Use inclusive language. Value diverse perspectives. |
| **Learner Safety** | "I can ask questions" | People are not afraid to say "I do not know" | Publicly say "I do not know" yourself. Celebrate learning, not just knowing. |
| **Contributor Safety** | "I can share ideas" | People propose solutions without fear of ridicule | Respond to every idea with engagement. "That is interesting, tell me more." |
| **Challenger Safety** | "I can disagree" | People challenge the status quo and push back on senior engineers | Thank people who disagree with you publicly. "I had not considered that." |

### Practical Actions

| Action | Frequency | Impact |
|--------|-----------|--------|
| When you make a mistake, share it with the team and what you learned | As it happens | Normalizes fallibility |
| Ask genuine questions in meetings, not just rhetorical ones | Every meeting | Shows that not knowing is acceptable |
| Respond to ideas with curiosity, even ones you disagree with | Every interaction | Makes people feel heard |
| Call out good questions: "That is a great question, I had not thought about that" | Weekly | Rewards intellectual bravery |
| In postmortems, redirect blame to systems: "What process allowed this?" | Every postmortem | Builds trust that mistakes are learning opportunities |
| Share your own growth areas: "I am working on improving my X" | Monthly | Models vulnerability |

---

## Handling Underperformers

This is the hardest part of people development. Avoiding the conversation does not help the person or the team.

### The Performance Conversation Framework

```
+------------------------------------------------------------------+
|           HANDLING UNDERPERFORMANCE: STEP BY STEP                 |
+------------------------------------------------------------------+
|                                                                    |
|  STEP 1: DIAGNOSE (before the conversation)                       |
|  - Is the problem skill, will, or environment?                    |
|  - Skill: They do not know how to do it                           |
|  - Will: They can but are not motivated                           |
|  - Environment: External factors are blocking them                |
|                                                                    |
|  STEP 2: DIRECT CONVERSATION (using SBI)                          |
|  - Be specific about the gap between expected and actual          |
|  - Use examples (SBI format), not generalizations                 |
|  - Ask for their perspective: "What is your view?"                |
|  - Agree on a concrete improvement plan                           |
|                                                                    |
|  STEP 3: SUPPORT AND MONITOR                                      |
|  - Increase 1:1 frequency (weekly minimum)                       |
|  - Provide specific resources, training, or pairing               |
|  - Set clear milestones with 30-60-90 day checkpoints            |
|  - Document the plan and progress                                 |
|                                                                    |
|  STEP 4: DECIDE                                                    |
|  - If improving: Continue support. Acknowledge progress.          |
|  - If not improving: Escalate to management with documentation.   |
|  - Be honest: "I have seen some improvement in X, but Y          |
|    is still a concern. Here is what I need to see by [date]."    |
|                                                                    |
+------------------------------------------------------------------+
```

### Skill vs Will vs Environment

| Root Cause | Signs | Response |
|-----------|-------|----------|
| **Skill gap** | Tries hard but produces low-quality work. Asks for help frequently. | Training, pairing, structured learning plan. |
| **Will/motivation** | Has the skills but does not apply them consistently. Disengaged. | Understand the root cause. Is it burnout? Misalignment? Boredom? Address the cause, not the symptom. |
| **Environmental** | Was high-performing, recently declined. External stressors. | Be compassionate. Adjust expectations temporarily. Remove blockers. Check if workload is unreasonable. |

---

## Interview Questions & Strong Answers

### Q1: "How do you grow engineers on your team?"

**Strong Answer (L6 Signal):**

**Situation:** "I was the Staff engineer on a team of 8, ranging from junior (L3) to senior (L5). Our team had no formal growth framework, and two mid-level engineers had told me they were unsure what they needed to do to get promoted."

**Task:** "I decided to create a growth system that would work not just for these two engineers but for the entire team, and that would outlast my involvement."

**Action:** "I started by creating a competency matrix for our team, defining what 'good' looked like at each level across four dimensions: technical depth, execution, communication, and mentoring. I calibrated this with our engineering manager and two other Staff engineers to make sure the bar was consistent.

For each of the two mid-level engineers, I created individual growth plans. For one, the gap was in technical depth -- she could implement anything but struggled to design systems from scratch. I paired her with our senior engineer for design sessions and gave her ownership of a medium-complexity design doc, with me reviewing drafts and giving feedback.

For the other, the gap was in communication. He did excellent work that nobody knew about. I coached him on writing weekly updates, presented his work to leadership with his name attached, and had him present his architecture proposal to the team instead of having me present it.

Beyond individual mentoring, I created structural improvements: weekly design review sessions where engineers presented work-in-progress designs for feedback, a 'code review of the week' channel where I highlighted particularly good code reviews and explained why they were effective, and a quarterly 'growth chat' template for 1:1s that guided managers through career conversations.

I also practiced sponsorship deliberately. When a high-visibility project came up, I recommended the senior engineer who was ready for Staff-level work, and I coached her through the project rather than taking it myself."

**Result:** "Both mid-level engineers were promoted to senior within 12 months. The senior engineer I sponsored was promoted to Staff. The design review sessions became a team institution that continued after I moved to a different team. Most importantly, our team went from 2 engineers contributing to design discussions to 6, which directly improved our architecture quality and reduced my personal bottleneck in design reviews."

---

### Q2: "Tell me about a time you gave difficult feedback."

**Strong Answer:**

**Situation:** "A senior engineer on my team was technically brilliant but was consistently dismissive in code reviews. He would leave comments like 'This is wrong' or 'Why would you do this?' without explanation. Two junior engineers told me they dreaded submitting PRs, and one had started asking other team members to review her code first to avoid his reviews."

**Task:** "I needed to give feedback that would change his behavior without making him feel attacked, because his technical contributions were genuinely valuable to the team."

**Action:** "I used the SBI model in our next 1:1. I said: 'In the PR review for the auth refactor last Tuesday (Situation), you left a comment that said just "This is wrong" on the error handling approach (Behavior). The author spent two hours trying to figure out what was wrong and eventually came to you in person, which took time from both of you. More broadly, two team members have told me they find your review style discouraging, which means they are less likely to submit ambitious changes for review (Impact).'

I then asked for his perspective. He was genuinely surprised -- he saw himself as being efficient and direct, not dismissive. He pointed out that he reviewed more PRs than anyone else and was trying to save time.

I acknowledged this and reframed: 'Your reviews are technically the best on the team. The question is how to maintain that quality while also making them a learning experience. A 30-second investment in explaining the why -- even just linking to a doc or example -- would make your reviews twice as effective.'

We agreed on a specific change: for every blocking comment, he would include either an explanation or a link. For non-blocking suggestions, he would prefix with 'suggestion:' to make it clear the author could take it or leave it.

I followed up two weeks later by reviewing his recent code review comments. He had improved significantly. I highlighted one particularly good review in our team channel: 'Check out this review from [name] -- great example of catching a subtle bug AND explaining why the fix matters.'"

**Result:** "Within a month, the two junior engineers told me code reviews felt much better. PR submission frequency from junior engineers increased 30%. The senior engineer later told me it was the most useful feedback he had received in his career because it was specific, actionable, and did not make him feel like a bad person."

---

### Q3: "How do you create psychological safety on a team?"

**Strong Answer:**

"I focus on four concrete practices, not abstract principles.

First, I model vulnerability. When I make a mistake -- and I make them regularly -- I share it in our team standup. 'I introduced a bug in my PR yesterday because I forgot to handle the null case. I added a regression test. Here is what I learned.' This normalizes mistakes as learning opportunities, not failures.

Second, I actively create space for disagreement. In design reviews, I explicitly ask: 'What could go wrong with this approach? I want to hear the strongest argument against it.' When someone disagrees with me, I thank them publicly: 'That is a perspective I had not considered. Let me think about that.'

Third, I make it safe to say 'I do not know.' When a junior engineer asks a question that I think everyone should know the answer to, I say 'Great question' and answer it thoroughly. I never express surprise that someone does not know something.

Fourth, I pay attention to who is not speaking. In meetings, I notice when quieter team members get talked over, and I create space: 'I noticed Mei was about to say something -- Mei, what were you thinking?' After meetings, I sometimes follow up with quieter members 1:1: 'You seemed like you had thoughts during the discussion. Anything you want to share?'

The measure of success is not whether people say they feel safe -- it is whether they actually take risks. I look for leading indicators: Are engineers submitting ambitious PRs? Are they challenging my proposals? Are they admitting mistakes without being prompted?"

---

## Anti-patterns to Avoid

| Anti-pattern | Why It Fails | What to Do Instead |
|-------------|-------------|-------------------|
| **The Hero** | Doing everything yourself instead of delegating to grow others | Give away work that will stretch someone, even if you could do it faster. |
| **The Absent Mentor** | Agreeing to mentor but never following through | Schedule mentoring time. Treat it with the same priority as meetings. |
| **Generic Advice** | "Just keep doing great work and you will get promoted" | Be specific: "Here are three concrete skills to develop, with a plan for each." |
| **Mentoring Clones** | Pushing people to follow your exact career path | Understand their goals and strengths. Guide toward their path, not yours. |
| **Feedback Avoidance** | Not giving constructive feedback to avoid discomfort | Avoiding feedback is not kind -- it is cowardly. People deserve to know how to improve. |
| **Public Criticism** | Calling out mistakes in team meetings or Slack channels | Praise in public, develop in private. Always. |
| **All Mentoring, No Sponsoring** | Giving advice but never putting your reputation on the line | Sponsor people for opportunities, not just advise them on how to find opportunities. |
| **Ignoring Team Dynamics** | Focusing only on individuals, missing team-level patterns | Pay attention to team health: meeting dynamics, collaboration patterns, morale signals. |

---

## Quick Reference Cheat Sheet

```
MENTORING & PEOPLE DEVELOPMENT CHECKLIST
==========================================

SBI FEEDBACK MODEL:
[ ] Situation: Specific event or context
[ ] Behavior: Observable action (not intent or character)
[ ] Impact: Effect on the team, project, or individual
[ ] Follow up within 2 weeks to reinforce

CODE REVIEW AS TEACHING:
[ ] Blocking comments include explanation or link
[ ] Non-blocking suggestions clearly marked
[ ] Calibrate depth to the author's level
[ ] Celebrate good patterns, not just catch bad ones
[ ] Offer to pair on complex feedback

GROWTH PLAN TEMPLATE:
[ ] Identify current stage (Learning, Contributing, Leading, Multiplying)
[ ] Define 6-month goals across 4 dimensions
[ ] Create specific actions for each goal
[ ] Identify support and resources needed
[ ] Review monthly, adjust quarterly

1:1 STRUCTURE:
[ ] 5 min: Check-in (energy, mood, anything on their mind)
[ ] 10 min: Their agenda (always first)
[ ] 10 min: Your agenda (feedback, context, growth)
[ ] 5 min: Action items and commitments
[ ] Never cancel. Reschedule if needed.

SPONSORSHIP ACTIONS:
[ ] Nominate for high-visibility projects
[ ] Advocate in promotion discussions with evidence
[ ] Give credit publicly and specifically
[ ] Create exposure to senior leadership
[ ] Introduce to your network

PSYCHOLOGICAL SAFETY:
[ ] Model vulnerability (share your mistakes)
[ ] Create space for disagreement (ask for pushback)
[ ] Make it safe to say "I do not know"
[ ] Notice who is not speaking and create space
[ ] Measure: Are people taking risks?

HANDLING UNDERPERFORMANCE:
[ ] Diagnose: Skill, will, or environment?
[ ] Direct conversation using SBI
[ ] Concrete improvement plan with milestones
[ ] Increased support (weekly 1:1s, pairing)
[ ] 30-60-90 day checkpoints
[ ] Document everything

RED FLAGS INTERVIEWERS WATCH FOR:
x Only 1:1 mentoring stories (no structural/cultural impact)
x No specific examples of feedback given
x All stories about people who succeeded (no underperformance)
x Cannot articulate what makes a good growth plan
x Mentoring style is one-size-fits-all
x Takes credit for mentee's success without acknowledging their effort
```

---

[<- System Thinking](./03-SYSTEM-THINKING.md) | [Next: Execution & Delivery ->](./05-EXECUTION-DELIVERY.md)
