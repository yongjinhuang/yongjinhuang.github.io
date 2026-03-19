# Customer Support & Ticketing

## What Is It?

A customer support system is how businesses handle incoming questions, problems, and requests from their users. At its core, you're turning an unstructured "I need help" into a tracked, prioritized, routable work item called a ticket. That ticket moves through a lifecycle — created, assigned, worked on, resolved, closed — while the system enforces response time commitments (SLAs), routes work to the right people, and measures how well the team is doing. Whether it's Zendesk, Freshdesk, Intercom, or a custom-built solution, the fundamentals are the same: capture the issue, get it to someone who can fix it, track it until it's done, and learn from the data.

## Why Should You Care?

Support systems touch nearly every product once it has real users. As a developer, you'll either build one, integrate with one, or build features that feed into one. A poorly designed ticketing system means lost customer issues, blown SLAs, frustrated agents, and churn. A well-designed one gives the business visibility into product pain points, reduces resolution time, and directly impacts retention. The patterns here — state machines, routing logic, SLA timers, escalation workflows — show up across many domains. Understanding them makes you better at designing any workflow-driven system.

## How It Works (The Business Flow)

### Ticket Creation Channels

Customers reach out through multiple channels, and all of them need to funnel into the same ticketing system:

- **Email**: Customer sends an email to support@company.com. The system parses the email, creates a ticket, and threads all replies under the same ticket ID.
- **Web form / Help center**: A structured form on the website with dropdowns for category, priority, and a description field. Gives the support team cleaner data upfront.
- **Live chat**: Real-time widget on the site. If the issue isn't resolved in-chat, it converts into a ticket for follow-up.
- **Phone / Voice**: Agent takes the call, creates a ticket manually or the phone system (IVR) creates one automatically. Call recordings attach to the ticket.
- **Social media**: Mentions on Twitter/X, Facebook, Instagram get pulled in via integrations. Public complaints often get escalated faster.
- **In-app**: A "Report a problem" button inside the product that auto-attaches context — user ID, browser info, current page, error logs.
- **API**: Other internal systems create tickets programmatically — a monitoring alert that fires when a service goes down, or an automated fraud detection flag.

The key principle is omnichannel: no matter how the customer reaches out, the agent sees one unified view of the conversation and history.

### Ticket Lifecycle and States

A ticket follows a clear state machine:

```
new → open → pending → on_hold → solved → closed
               ↓                    ↓
           escalated            reopened → open
```

- **New**: Just created, not yet seen by any agent.
- **Open**: An agent is actively working on it.
- **Pending**: Waiting on the customer to respond (e.g., "Can you send a screenshot?"). SLA clocks typically pause here.
- **On Hold**: Waiting on an internal team or third party (e.g., engineering needs to deploy a fix). SLA clocks may pause depending on policy.
- **Escalated**: Moved to a higher-tier agent or manager because the current agent can't resolve it.
- **Solved**: Agent believes the issue is resolved. Customer has a window (e.g., 48 hours) to reopen if not satisfied.
- **Closed**: Finalized. No further action. Typically auto-closed X days after solved if the customer doesn't respond.
- **Reopened**: Customer replied after the ticket was solved, restarting the workflow.

### SLA Management

Service Level Agreements define how fast the team must respond and resolve:

- **First Response Time (FRT)**: How quickly the customer gets a non-automated reply. Typical targets: 1 hour for urgent, 4 hours for high, 8 hours for normal, 24 hours for low.
- **Resolution Time**: How long until the issue is fully resolved. Targets vary by severity: 4 hours for critical production outages, days for feature requests.
- **Business Hours vs. Calendar Hours**: SLAs usually tick during business hours only (Mon-Fri 9-5). Critical/emergency SLAs may run 24/7.
- **SLA Breach**: When a target is missed. Triggers alerts, manager notifications, and shows up in reports. Repeated breaches signal staffing or process problems.
- **SLA Pausing**: The clock stops when the ticket is in a "waiting on customer" state. Otherwise teams get penalized for slow customer replies.

### Priority and Severity Levels

Priority determines the order of work. Severity describes the impact:

| Level         | Severity                                | Example                                  | Typical FRT |
| ------------- | --------------------------------------- | ---------------------------------------- | ----------- |
| P1 / Critical | System down, all users affected         | Payment processing is broken             | 15 min      |
| P2 / High     | Major feature broken, workaround exists | Export function fails for large datasets | 1 hour      |
| P3 / Medium   | Minor feature issue, non-blocking       | Formatting bug in reports                | 4 hours     |
| P4 / Low      | Cosmetic or nice-to-have request        | Typo in UI, feature suggestion           | 24 hours    |

Priority can be set by the customer, auto-assigned by rules (e.g., enterprise customers always get P2+), or adjusted by the agent after triage.

### Escalation Policies

When a ticket can't be resolved at the current level or is about to breach SLA:

- **Tier 1 → Tier 2 → Tier 3**: L1 handles common questions with scripts and knowledge base articles. L2 handles technical troubleshooting. L3 involves engineering or specialists.
- **Time-based escalation**: If a P1 ticket isn't acknowledged within 15 minutes, auto-escalate to the team lead. If still unresolved after 1 hour, escalate to the engineering on-call.
- **Manager escalation**: Customer explicitly asks for a manager, or the agent flags the issue as needing senior judgment.
- **VIP escalation**: High-value customers (enterprise accounts, high-spend users) get automatically routed to senior agents or dedicated account teams.

### Agent Assignment and Routing

How tickets land on the right agent's queue:

- **Round-robin**: Distribute evenly across available agents. Simple and fair but ignores skill match.
- **Skill-based routing**: Route billing tickets to billing specialists, technical tickets to engineering support. Tags, categories, or NLP classification drive the routing.
- **Load-balanced**: Assign to the agent with the fewest open tickets. Prevents one agent from being overwhelmed.
- **Geographical / Language-based**: Route to agents who speak the customer's language or are in the customer's time zone.
- **Queue-based**: Tickets sit in team queues (Billing, Technical, Account) and agents pull from their queue. Works well with specialized teams.
- **AI-assisted**: Machine learning classifies the ticket type and suggests or auto-assigns the best agent based on historical resolution data.

### Knowledge Base and FAQ

A self-service layer that deflects tickets before they're created:

- Searchable library of articles organized by category.
- Surfaced contextually — when a user types "reset password" in the help widget, the relevant article appears before they submit a ticket.
- Internal knowledge base for agents: troubleshooting runbooks, escalation procedures, common solutions.
- Must be actively maintained. Outdated articles cause more tickets than they prevent.

### Chatbot Integration

Automated first line of defense:

- **Rule-based bots**: Decision trees that handle known flows ("Want to reset your password? Click here."). Cheap to build, limited in scope.
- **AI/LLM-powered bots**: Understand natural language, search the knowledge base, and generate responses. Can handle a wider range of questions but need guardrails to avoid hallucination.
- **Handoff protocol**: When the bot can't resolve the issue, it transfers to a human agent with the full conversation context attached. A bad handoff (losing context, making the customer repeat themselves) is worse than no bot at all.
- **Deflection rate**: The percentage of conversations resolved by the bot without human intervention. A good target is 20-40% for general support.

### Customer Satisfaction (CSAT / NPS)

Measuring how well support is performing:

- **CSAT (Customer Satisfaction Score)**: "How satisfied were you with this interaction?" Usually a 1-5 scale sent after ticket resolution. Target: 4.0+ average or 85%+ positive.
- **NPS (Net Promoter Score)**: "How likely are you to recommend us?" 0-10 scale. Detractors (0-6), Passives (7-8), Promoters (9-10). Score = % Promoters - % Detractors.
- **CES (Customer Effort Score)**: "How easy was it to resolve your issue?" Lower effort correlates with higher retention.
- Survey timing matters. Send immediately after resolution for CSAT. Send periodically (quarterly) for NPS. Low response rates skew data — don't over-survey.

### Macros and Templates

Pre-written responses that agents insert with one click:

- Standardize common responses ("Your refund has been processed and will appear in 3-5 business days.").
- Include dynamic placeholders: `{{customer_name}}`, `{{ticket_id}}`, `{{order_number}}`.
- Speed up response time and ensure consistency. But over-reliance on templates makes responses feel robotic — agents should personalize.

### Reporting Dashboards

What the support team and leadership track:

- **Volume**: Tickets created per day/week/month, by channel and category. Spikes indicate product issues or incidents.
- **FRT and Resolution Time**: Averages and distributions, broken down by priority level.
- **SLA Compliance**: Percentage of tickets resolved within SLA targets.
- **CSAT Trends**: Satisfaction scores over time, by agent, by category.
- **Backlog**: Number of open tickets and how long they've been open. Growing backlog means the team is underwater.
- **Deflection Rate**: How many issues were resolved by self-service or bots before becoming tickets.
- **Top Contact Reasons**: What customers are asking about most. Feeds back into product improvements — if 30% of tickets are about the same confusing feature, fix the feature.

## Key Terms You'll Hear

| Term               | What It Means                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Ticket**         | A tracked unit of work representing a customer issue, question, or request                   |
| **SLA**            | Service Level Agreement — contractual response and resolution time targets                   |
| **FRT**            | First Response Time — how fast the customer gets a human reply                               |
| **CSAT**           | Customer Satisfaction Score — post-interaction rating (1-5 scale)                            |
| **NPS**            | Net Promoter Score — overall loyalty metric (-100 to +100)                                   |
| **Escalation**     | Moving a ticket to a higher-tier agent, team, or manager                                     |
| **Triage**         | The initial assessment of a ticket's priority, category, and routing                         |
| **Macro**          | A pre-built response template agents can insert into replies                                 |
| **Deflection**     | Resolving an issue via self-service (knowledge base, bot) before a ticket is created         |
| **Omnichannel**    | Unified support across email, chat, phone, social, and in-app — one view for the agent       |
| **Queue**          | A pool of unassigned tickets organized by team, skill, or priority                           |
| **Backlog**        | The accumulation of open, unresolved tickets                                                 |
| **IVR**            | Interactive Voice Response — the automated phone menu ("Press 1 for billing")                |
| **MTTR**           | Mean Time to Resolution — average time from ticket creation to resolution                    |
| **Reopened Rate**  | Percentage of solved tickets that customers reopen. High rates indicate premature resolution |
| **Contact Reason** | The categorized "why" behind a ticket, used for reporting and product feedback               |

## Common Patterns

### Tiered Support Structure

Most companies use a 3-tier model. L1 agents handle 70-80% of volume using knowledge base articles and macros — password resets, order status, basic how-to questions. L2 agents handle technical troubleshooting, account issues, and anything requiring investigation. L3 involves engineering, product, or specialized teams for bugs, infrastructure issues, and edge cases. The goal is to resolve as much as possible at L1 to keep costs low and L2/L3 agents focused on hard problems.

### Tagging and Categorization

Every ticket gets tagged with a category (billing, technical, account), a subcategory (refund, bug report, login issue), and sometimes a product area. These tags drive routing, reporting, and trend analysis. Auto-tagging with NLP models is common — classify the ticket based on the subject and description before an agent even sees it.

### Internal Notes vs. Public Replies

Tickets have two communication threads: public replies (visible to the customer) and internal notes (visible only to agents). Agents use internal notes to document investigation steps, tag colleagues, and leave context for the next shift. Never mix up the two — an internal note accidentally sent as a public reply is a common and embarrassing mistake.

### Merge and Link

Duplicate tickets happen constantly — the same customer emails twice, or contacts via chat and email about the same issue. Agents merge duplicates into a single ticket. Related tickets (multiple customers reporting the same bug) get linked so that when the bug is fixed, all linked tickets can be resolved in batch.

### SLA by Customer Tier

Enterprise customers paying $100K/year get a 1-hour FRT. Free-tier users get 48 hours. SLA policies are attached to the customer's account tier, and the ticketing system automatically applies the correct SLA when a ticket is created. This is standard practice and directly tied to contract terms.

### Incident-Linked Support

When a production incident occurs, hundreds of tickets may come in about the same issue. A support-engineering bridge links the incident to a parent ticket. All incoming tickets about the same issue get auto-linked. When the incident is resolved, a bulk update closes all related tickets with a single communication.

## Gotchas

- **SLA clock misconfiguration**: If you don't pause the SLA timer when waiting on the customer, your metrics will be skewed and agents will be penalized unfairly. Get the pause/resume logic right from day one.
- **Lost context on channel switch**: Customer starts on chat, then follows up via email. If the system creates a separate ticket instead of threading it, the agent asks the customer to repeat everything. Omnichannel unification is hard but essential.
- **Bot-to-human handoff failure**: The bot collects five minutes of context, then drops it all when transferring to an agent. The customer has to start over. Always pass the full conversation transcript and any extracted data (order ID, issue type) to the agent.
- **Over-automating empathy**: Templates and bots save time, but a customer whose account was hacked doesn't want a canned response. Train agents and build systems to detect high-emotion situations and switch to personalized handling.
- **Ignoring reopened rate**: If 25% of "solved" tickets get reopened, agents are closing tickets prematurely to hit metrics. Reopened rate is a quality signal — track it and address the root cause.
- **No feedback loop to product**: Support teams sit on a goldmine of user pain data. If there's no process to surface top contact reasons to the product team, the same issues generate tickets indefinitely.
- **Timezone-unaware SLAs**: An SLA that says "respond within 4 business hours" means nothing if you don't define whose business hours. Store the customer's timezone and the support team's operating hours explicitly.
- **Agent burnout from queue pressure**: Optimizing purely for speed (tickets per hour, handle time) burns out agents and degrades quality. Balance efficiency metrics with quality metrics like CSAT and reopened rate.
- **Stale knowledge base**: Articles written two years ago for a feature that's been redesigned three times. Customers follow outdated instructions, get confused, and submit tickets. Schedule regular content audits.
- **Missing audit trail**: Who changed the ticket priority? When was it reassigned? Without a full activity log on every ticket, disputes and post-mortems become guesswork.

## Quick Reference

```
Channels In:
  Email | Web form | Live chat | Phone/IVR | Social media | In-app | API

Ticket Lifecycle:
  new → open → pending → on_hold → solved → closed
                 ↓                    ↓
             escalated            reopened → open

Priority Levels:
  P1 Critical  → 15 min FRT, 4 hr resolution (system down)
  P2 High      → 1 hr FRT, 8 hr resolution (major feature broken)
  P3 Medium    → 4 hr FRT, 24 hr resolution (minor issue)
  P4 Low       → 24 hr FRT, 72 hr resolution (cosmetic/request)

Support Tiers:
  L1 → scripts, knowledge base, common issues (70-80% of volume)
  L2 → technical troubleshooting, investigation
  L3 → engineering, specialists, bugs

Routing Methods:
  Round-robin | Skill-based | Load-balanced | Language/Geo | AI-assisted

Key Metrics:
  FRT (First Response Time) | MTTR (Mean Time to Resolution)
  CSAT (satisfaction) | NPS (loyalty) | CES (effort)
  SLA compliance % | Deflection rate | Reopened rate | Backlog size

Satisfaction Targets:
  CSAT → 85%+ positive (4+ out of 5)
  NPS  → 30+ is good, 50+ is excellent
  Deflection → 20-40% via self-service/bots

Escalation Triggers:
  SLA breach approaching | Agent can't resolve | Customer requests manager
  VIP account | Repeated contacts for same issue

Key Data Per Ticket:
  ticket_id, customer_id, channel, category, subcategory, priority,
  status, assigned_agent, created_at, first_response_at, resolved_at,
  sla_policy, sla_breached, csat_score, tags, linked_tickets,
  internal_notes, public_replies, activity_log
```
