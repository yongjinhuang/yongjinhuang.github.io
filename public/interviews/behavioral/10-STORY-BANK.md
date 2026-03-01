# Story Bank

## What Is a Story Bank?

A story bank is a curated collection of real stories from your career that you can adapt and deploy across many different behavioral interview questions. Instead of preparing a unique answer for every possible question, you prepare 10-15 strong stories and learn which questions each story can answer.

This approach is more effective because:

- **Depth over breadth** -- A well-rehearsed real story is always more compelling than a half-remembered anecdote
- **Flexibility** -- One great story can answer five different question types by shifting emphasis
- **Authenticity** -- You sound natural because you are telling stories you know well
- **Confidence** -- Walking into an interview with a prepared bank eliminates the "blank mind" panic

### How to Use This Document

1. Read through the pre-filled example stories to understand the format and level of detail expected
2. Fill in the blank templates with your own experiences
3. For each story, note which question types it works for
4. Practice telling each story out loud in under 3 minutes
5. Before an interview, review the "Best Used For" tags and make sure you have coverage across all major categories

---

## Pre-Filled Example Stories

These examples are based on a senior software engineer who worked at Shopee (a large e-commerce company) for 3.5 years on a billing platform in the supply chain domain. Use them as a reference for the level of detail and structure your own stories should have.

---

### Example Story A: Billing API Performance Optimization

**Theme**: Technical problem-solving, ambiguity, impact

**Situation**: The billing platform I owned at Shopee was experiencing severe performance degradation during peak hours. Our billing API was handling approximately 2,000 queries per second (QPS) and maintaining around 4,000 concurrent database connections. During flash sales and promotional events, the system would frequently hit connection pool limits, causing request timeouts and failed invoice generations. The supply chain operations team was escalating daily because delayed billing was blocking shipment processing.

**Task**: I was the senior engineer responsible for the billing API service. My mandate was to improve the system's throughput and reliability, but the requirements were vague: "make billing faster and stop the outages." There was no specific target, no allocated timeline, and the codebase had accumulated three years of organic growth with minimal performance profiling.

**Action**: I started by instrumenting the entire request lifecycle with distributed tracing, which we had not done before. This took about a week and immediately revealed several surprises. The 4,000 database connections were not caused by high load alone. They were caused by three issues: (1) an N+1 query pattern in the invoice generation path that opened a new connection for each line item, (2) a misconfigured connection pool that created new connections instead of reusing idle ones, and (3) a synchronous call to an external tax calculation service that held connections open while waiting for a response.

I prioritized fixes by impact. First, I refactored the N+1 query into a batch operation using Django's `prefetch_related` and a custom bulk query, which immediately dropped connection usage by 40%. Second, I reconfigured the connection pool with proper max/min/idle settings and added connection recycling. Third, I made the tax service call asynchronous by introducing a task queue with Celery, so the database connection was released while waiting for the external response.

I also rewrote the hottest query path in Golang (Gin framework) as a separate microservice because profiling showed that Python's GIL was a bottleneck for the concurrent connection handling. I designed the service boundary carefully, discussed it with the team in a design review, and implemented a gradual traffic migration using feature flags.

**Result**: Database connections dropped from approximately 4,000 to approximately 1,000 concurrent. QPS capacity increased from 2,000 to 5,000 -- a 2.5x improvement. Zero billing-related outages during the next three flash sale events. The supply chain team stopped escalating billing issues entirely. The optimization approach and the distributed tracing setup became a template that two other teams adopted for their own performance work.

**Best used for**:
- "Tell me about a complex technical problem you solved"
- "Describe a time you worked with ambiguous requirements"
- "Tell me about your biggest technical achievement"
- "How do you approach performance optimization?"
- "Tell me about a time you had significant impact"

---

### Example Story B: Code Review Culture and Deployment Quality

**Theme**: Teamwork, leadership, process improvement

**Situation**: When I joined the billing team at Shopee, we had a culture of superficial code reviews. Most PRs received a quick "LGTM" within minutes, and the team treated reviews as a checkbox rather than a quality gate. We were averaging two to three deployment-related defects per month, some of which caused billing discrepancies that required manual correction by the operations team. The defects ranged from unhandled edge cases to incorrect SQL migrations.

**Task**: As a senior engineer, I was not in a management role, but I felt responsible for improving the team's engineering practices. I wanted to raise the quality of our code reviews without creating a culture of nitpicking or slowing down delivery.

**Action**: I started with my own pull requests. I began writing detailed PR descriptions that included the context, the approach, the alternatives I considered, and specific areas where I wanted careful review. I also started tagging my code review comments with categories: "blocking" (must fix before merge), "suggestion" (consider for this PR or future work), and "nit" (style preference, non-blocking). This helped authors prioritize feedback without feeling overwhelmed.

Next, I created a lightweight code review checklist tailored to our billing domain. It covered common issues I had observed: decimal precision handling (critical for financial calculations), SQL migration rollback plans, error handling for external service calls, and concurrency edge cases. I presented the checklist at a team meeting and asked for input, and we iterated on it as a team.

I also introduced a weekly "review spotlight" practice where I would highlight one particularly good code review interaction in our team Slack channel. This could be a reviewer who caught a subtle bug, or an author who responded to feedback by improving the design. I wanted to make thorough reviews something the team was proud of, not something they resented.

For junior engineers who were uncomfortable reviewing senior engineers' code, I spent time pairing with them on reviews. I would ask them to review a PR first, then we would compare notes. This built their confidence and often surfaced fresh perspectives that more experienced reviewers missed.

**Result**: Over two quarters, deployment-related defects decreased by approximately 30%. More importantly, the quality of technical discussions improved. Engineers started catching design issues in review before they became production problems. PR descriptions across the team became more detailed, and two junior engineers grew confident enough to push back on senior engineers' designs during review. The checklist was adopted by two neighboring teams. In my performance review, my manager specifically called out the review culture improvement as one of the most impactful things I did that year.

**Best used for**:
- "Tell me about a time you improved a process"
- "How do you approach code reviews?"
- "Describe a time you showed leadership without a management title"
- "Tell me about a time you mentored others"
- "How have you improved team quality?"

---

### Example Story C: Tech Talks and Knowledge Sharing

**Theme**: Growth, communication, teamwork, culture

**Situation**: Shopee's supply chain engineering organization had about 80 engineers, but knowledge sharing was siloed. Each team worked on its own domain and there was little cross-pollination of ideas. Engineers on my billing team would re-discover solutions that the inventory team had already implemented, and vice versa. I had personally benefited from tech talks at a previous company and believed our organization was missing an opportunity.

**Task**: I wanted to create a regular knowledge-sharing practice. I decided to lead by example rather than trying to mandate it.

**Action**: I prepared and delivered my first internal tech talk on "Optimizing Database Connection Patterns in Python and Go," drawing from my billing API performance work. I spent about a week preparing slides and rehearsing, deliberately focusing on making the content accessible to engineers who did not work on billing. I included concrete before-and-after metrics, code snippets, and three takeaways that any team could apply to their own services.

The talk was well received, and I used that momentum to propose a monthly tech talk series to our engineering director. I volunteered to organize the first five sessions and committed to giving two more talks myself. I recruited speakers by identifying engineers who had recently solved interesting problems and offering to help them prepare their content. I found that many engineers wanted to present but were nervous, so I offered to do a dry run with each speaker before the actual talk.

Over the next year, I delivered five talks total. Topics included: connection pool optimization, event-driven architecture patterns for financial systems, debugging production memory leaks, migrating from monolith to microservices (lessons learned), and TypeScript/React best practices for internal tools. Each talk drew between 30 and 60 attendees from across the supply chain organization.

**Result**: The monthly tech talk series became self-sustaining. After I organized the first five, other engineers started volunteering to both speak and organize. Within a year, 15 engineers from six different teams had presented. Two of my talks directly led to other teams adopting the connection pooling patterns, which improved their service reliability. The series was recognized in our organization's quarterly review as a cultural highlight. For me personally, the preparation forced me to clarify my thinking, and the Q&A sessions exposed blind spots I would not have discovered otherwise. I also built relationships across teams that made future cross-team collaboration much smoother.

**Best used for**:
- "Tell me about a time you shared knowledge with your team"
- "Describe a time you took initiative"
- "How do you contribute to engineering culture?"
- "Tell me about a time you influenced beyond your team"
- "What motivates you as an engineer?"
- "Give an example of leadership without authority"

---

## Blank Story Templates

Fill in these templates with your own experiences. Each template is organized by theme and includes guidance on which question types the story can answer.

---

### Story 1: Technical Achievement

**Theme**: Problem-solving, impact, technical depth

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the system, the problem, the scale, and why it mattered.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was your specific responsibility? What was the goal or constraint?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(Walk through your approach step by step. What did you investigate? What options did you consider? What did you build? How did you validate it?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(Quantify the improvement. What was the lasting impact? What did others adopt from your work?)

**Best used for**:
- "Tell me about a complex technical problem you solved"
- "What is your biggest technical achievement?"
- "Describe a time you optimized something"
- "Tell me about a time you had significant impact"

---

### Story 2: Leadership Without Authority

**Theme**: Leadership, influence, process improvement

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the team dynamic, the problem, and why formal authority was not an option.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What did you want to change or improve? What was at stake?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you lead by example? How did you build buy-in? How did you handle resistance?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What changed? How did the team respond? What is the lasting impact?)

**Best used for**:
- "Tell me about a time you showed leadership"
- "Describe a time you improved a process"
- "How do you influence without authority?"
- "Tell me about a time you drove change"

---

### Story 3: Conflict Resolution

**Theme**: Conflict, communication, collaboration

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the disagreement, the people involved, and the stakes.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was your role? What needed to be resolved?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you listen to both sides? How did you find common ground? What compromise or solution did you propose?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(How was the conflict resolved? What was the impact on the relationship and the project?)

**Best used for**:
- "Tell me about a time you disagreed with a coworker"
- "Describe a conflict on your team"
- "How do you handle disagreements about technical decisions?"
- "Tell me about a difficult conversation you had"

---

### Story 4: Failure and Recovery

**Theme**: Resilience, learning, self-awareness

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe what went wrong and why.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What needed to be fixed or recovered?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you respond? How did you fix the immediate problem? What did you change going forward?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What was the outcome? What did you learn? How did it change your approach?)

**Best used for**:
- "Tell me about a time you failed"
- "Describe a mistake you made and how you handled it"
- "Tell me about a time you received critical feedback"
- "What is your biggest professional regret?"

---

### Story 5: Mentoring and Growing Others

**Theme**: Mentoring, teamwork, leadership

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Who did you mentor? What was their situation or challenge?)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was your goal as a mentor?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you approach mentoring? What specific techniques did you use? How did you balance guidance with letting them figure things out?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(How did the person grow? What did they accomplish? What did you learn from the experience?)

**Best used for**:
- "Tell me about a time you mentored someone"
- "How do you help junior engineers grow?"
- "Describe a time you invested in someone else's development"
- "Tell me about a time you showed patience"

---

### Story 6: Working Under Pressure / Tight Deadline

**Theme**: Prioritization, execution, communication

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the deadline, the scope, and why it was challenging.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was expected of you? What constraints did you face?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you prioritize? What did you cut or defer? How did you communicate with stakeholders?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(Did you meet the deadline? What was shipped vs. deferred? What did stakeholders think?)

**Best used for**:
- "Tell me about a time you faced a tight deadline"
- "How do you handle pressure?"
- "Describe a time you had to negotiate scope"
- "Tell me about a time you had to make trade-offs"

---

### Story 7: Cross-Team Collaboration

**Theme**: Collaboration, communication, influence

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the teams involved, the project, and the coordination challenge.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was your role in the cross-team effort?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you align the teams? How did you handle conflicting priorities? What communication practices did you use?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What was delivered? How did the collaboration go? What was the lasting impact?)

**Best used for**:
- "Tell me about a time you worked across teams"
- "How do you handle dependencies on other teams?"
- "Describe a time you built consensus"
- "Tell me about a time you navigated organizational complexity"

---

### Story 8: Dealing with Ambiguity

**Theme**: Problem-solving, initiative, communication

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe what was unclear and why.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What did you need to figure out?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you reduce ambiguity? What questions did you ask? How did you make progress without complete information?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What clarity did you create? What was the outcome?)

**Best used for**:
- "Tell me about a time you worked with unclear requirements"
- "How do you handle ambiguity?"
- "Describe a time you defined a problem that was not well understood"
- "Tell me about a time you took initiative"

---

### Story 9: Adapting to Change

**Theme**: Adaptability, resilience, growth

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the change: reorganization, pivot, new technology, role change.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What did you need to adapt to?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you adjust? What was difficult? How did you support others through the change?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(How did the adaptation go? What did you learn about yourself?)

**Best used for**:
- "Tell me about a time you had to adapt"
- "How do you handle change?"
- "Describe a career transition"
- "Tell me about a time something unexpected happened"

---

### Story 10: Making a Difficult Decision

**Theme**: Decision-making, ownership, trade-offs

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the decision and why it was difficult.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What were the options? What were the stakes?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you evaluate the options? Who did you consult? How did you communicate your decision?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What was the outcome? Would you make the same decision again?)

**Best used for**:
- "Tell me about a difficult decision you made"
- "How do you make trade-offs?"
- "Describe a time you took a risk"
- "Tell me about a time you had to choose between two good options"

---

### Story 11: Going Above and Beyond

**Theme**: Initiative, ownership, impact

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe what you noticed that was outside your explicit responsibility.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What did you decide to do about it, even though it was not your job?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(What did you build, fix, or improve? How did you balance it with your regular responsibilities?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What was the impact? How was it received?)

**Best used for**:
- "Tell me about a time you went above and beyond"
- "Describe a time you took ownership"
- "Tell me about a time you identified and solved a problem proactively"
- "What is something you did that was not in your job description?"

---

### Story 12: Customer or User Focus

**Theme**: Empathy, product sense, impact

**Situation**: _____________________________________________________________________________
_____________________________________________________________________________
(Describe the user problem or customer pain point.)

**Task**: _____________________________________________________________________________
_____________________________________________________________________________
(What was your role in addressing it?)

**Action**: _____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
(How did you understand the user's needs? What did you build or change? How did you validate it?)

**Result**: _____________________________________________________________________________
_____________________________________________________________________________
(What was the user impact? How did you measure it?)

**Best used for**:
- "Tell me about a time you advocated for the user"
- "How do you balance engineering excellence with user needs?"
- "Describe a time you improved the user experience"
- "Tell me about a time you used data to make a decision"

---

## Story Coverage Matrix

Use this matrix to ensure you have at least one strong story for every major question category. Put a checkmark or the story number next to each category you have covered.

| Question Category | Story # | Confidence (1-5) |
|-------------------|---------|-------------------|
| Technical problem-solving | _____ | _____ |
| Leadership / influence | _____ | _____ |
| Conflict resolution | _____ | _____ |
| Failure and recovery | _____ | _____ |
| Mentoring / growing others | _____ | _____ |
| Tight deadline / pressure | _____ | _____ |
| Cross-team collaboration | _____ | _____ |
| Ambiguity / unclear requirements | _____ | _____ |
| Adapting to change | _____ | _____ |
| Difficult decision / trade-offs | _____ | _____ |
| Going above and beyond | _____ | _____ |
| Customer / user focus | _____ | _____ |
| Career growth / learning | _____ | _____ |
| Why this company / why leaving | _____ | _____ |

**Target**: Have at least one story with confidence level 4 or 5 for every row.

---

## Tips for Building Your Story Bank

### Sourcing Stories

- Review your last 2-3 performance reviews for accomplishments you may have forgotten
- Look through old PRs, design documents, and Slack messages for project details
- Ask former colleagues what they remember you doing well
- Think about projects that were difficult, not just successful
- Consider non-technical situations too: onboarding, team-building, process changes

### Practicing Stories

- Tell each story out loud and time it. Aim for 2-3 minutes
- Record yourself and listen back. Are you rambling? Missing the point?
- Practice with a friend and ask them: "What signal did that story give you about me?"
- Prepare two versions of each story: a 2-minute version and a 1-minute version for follow-ups

### Adapting Stories to Different Questions

The same story can answer different questions by shifting emphasis:

| Question Type | Emphasize |
|---------------|-----------|
| Technical | The technical approach, tools, debugging process |
| Leadership | How you influenced others, built consensus, led by example |
| Conflict | The disagreement, how you listened, how you resolved it |
| Failure | What went wrong, your honest reflection, what you changed |
| Impact | The quantified result, the business value, the lasting change |
| Growth | What you did not know before, how you learned, how you improved |

### Story Freshness

- Update your story bank every 6 months with new experiences
- Retire stories that are more than 5 years old (unless they are exceptional)
- Add stories from your current role as soon as they happen, while details are fresh
- Keep notes in a document you can review before interviews
