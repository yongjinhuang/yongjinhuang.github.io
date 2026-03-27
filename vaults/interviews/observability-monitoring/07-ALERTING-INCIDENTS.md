# Alerting & Incident Management

A comprehensive guide to alerting design, on-call practices, incident response, and
SRE principles. Covers alert fatigue mitigation, severity levels, blameless postmortems,
error budgets, and chaos engineering.

---

## Table of Contents

1. [Alert Design Principles](#1-alert-design-principles)
2. [Alert Fatigue](#2-alert-fatigue)
3. [Alert Routing & Escalation](#3-alert-routing--escalation)
4. [On-Call Practices](#4-on-call-practices)
5. [Incident Response Lifecycle](#5-incident-response-lifecycle)
6. [Key Metrics](#6-key-metrics)
7. [Incident Management Tools](#7-incident-management-tools)
8. [Runbooks](#8-runbooks)
9. [Blameless Postmortems](#9-blameless-postmortems)
10. [SRE Practices](#10-sre-practices)
11. [Chaos Engineering](#11-chaos-engineering)
12. [Common Interview Questions](#12-common-interview-questions)
13. [Quick Reference](#13-quick-reference)

---

## 1. Alert Design Principles

### Good Alerts Are

| Principle | Description | Anti-Pattern |
|-----------|-------------|-------------|
| **Actionable** | Someone needs to DO something | "CPU is at 72%" (so what?) |
| **Informative** | Contains enough context to act | "Something is wrong" |
| **Relevant** | Affects real users or business | Alert on dev environment |
| **Timely** | Fires before users notice | Alert fires 30 min late |
| **Unique** | Not duplicated by other alerts | 5 alerts for same issue |

### Symptom-Based vs Cause-Based

```
SYMPTOM-BASED (Preferred)           CAUSE-BASED (Avoid)
┌───────────────────────┐          ┌───────────────────────┐
│ "Error rate > 5%"     │          │ "CPU > 90%"           │
│ "P99 latency > 2s"   │          │ "Memory > 85%"        │
│ "Success rate < 99.9%"│          │ "Disk > 80%"          │
└───────────────────────┘          └───────────────────────┘
 Tells you users are affected       CPU can be 95% and fine
 Direct link to SLO violation        Memory at 90% may be normal
 Always actionable                   Often not actionable
```

**Best practice**: Alert on symptoms (user-facing impact), investigate causes (infrastructure metrics) during response.

---

## 2. Alert Fatigue

### What It Is

When responders receive so many alerts that they start ignoring them. Like the boy who cried wolf.

### Causes

| Cause | Example |
|-------|---------|
| Too many alerts | 100+ alerts per on-call shift |
| Low signal-to-noise | 80% of alerts are false positives |
| Duplicate alerts | Same issue triggers 5 different rules |
| Missing context | Alert says "error" but not which service |
| Non-actionable | Alert fires but nothing to do about it |

### Solutions

1. **Tune thresholds**: Based on historical data, not guesses
2. **Add `for` duration**: Require condition to persist (e.g., 5 minutes)
3. **Deduplicate**: Group related alerts (Alertmanager grouping)
4. **Correlate**: Link related alerts to a single incident
5. **Review regularly**: Monthly alert review -- delete or tune noisy alerts
6. **Severity levels**: Only page for critical; notification for warning
7. **SLO-based alerting**: Alert on burn rate, not raw thresholds

---

## 3. Alert Routing & Escalation

```
Alert Fires
    │
    ▼
┌──────────────────┐
│ Severity Check    │
├──────────────────┤
│ SEV1 (Critical)  │──> Page on-call immediately
│                  │    Escalate to team lead in 15 min
│                  │    Escalate to engineering manager in 30 min
├──────────────────┤
│ SEV2 (Major)     │──> Page on-call
│                  │    Escalate to team lead in 30 min
├──────────────────┤
│ SEV3 (Minor)     │──> Slack notification
│                  │    On-call addresses during business hours
├──────────────────┤
│ SEV4 (Low)       │──> Ticket created
│                  │    Addressed in next sprint
└──────────────────┘
```

### Severity Definitions

| Severity | Impact | Response Time | Example |
|----------|--------|---------------|---------|
| **SEV1** | Service down, data loss, security breach | Immediate (5 min) | Complete outage |
| **SEV2** | Major feature degraded, affecting many users | 15 minutes | Payment failures |
| **SEV3** | Minor feature impacted, workaround exists | Business hours | Slow search |
| **SEV4** | Cosmetic, no user impact | Next sprint | UI glitch |

---

## 4. On-Call Practices

### Rotation Patterns

| Pattern | How It Works | Pros | Cons |
|---------|-------------|------|------|
| **Weekly** | One person per week | Simple | Burnout risk |
| **Follow-the-sun** | Rotate across time zones | No night pages | Requires global team |
| **Primary/Secondary** | Two people on-call | Backup available | More people needed |
| **Business hours** | On-call only during work | Less burden | Off-hours gaps |

### Burnout Prevention

- **Limit on-call frequency**: No more than 1 week in 4
- **Compensate**: Extra pay, comp time, or both
- **Cap pages**: If >2 pages per on-call shift on average, fix root causes
- **Post-incident follow-through**: Actually fix the issues that page people
- **Handoff rituals**: Document ongoing issues, context for next person

### Handoff Template

```markdown
## On-Call Handoff

### Active Issues
- [SEV2] Payment timeout intermittent since Tuesday. Tracking in JIRA-1234.

### Recent Changes
- Deployed v2.3.0 to production Thursday 14:00 UTC
- Database migration ran Wednesday night

### Upcoming Risks
- Load test scheduled for Monday 10:00 UTC
- Infrastructure maintenance window Friday 02:00-04:00 UTC
```

---

## 5. Incident Response Lifecycle

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ DETECT   │──>│ TRIAGE   │──>│ MITIGATE │──>│ RESOLVE  │──>│FOLLOW-UP │
│          │   │          │   │          │   │          │   │          │
│ Alert    │   │ Severity │   │ Stop the │   │ Fix root │   │Postmortem│
│ fires    │   │ assign   │   │ bleeding │   │ cause    │   │ Action   │
│ or user  │   │ IC named │   │ Rollback?│   │          │   │ items    │
│ reports  │   │ Comms    │   │ Scale?   │   │          │   │          │
└──────────┘   │ started  │   │ Block?   │   │          │   │          │
               └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Incident Commander (IC) Role

The IC **coordinates**, not fixes:
- Declare incident severity
- Assign roles (communications, technical lead)
- Make decisions (rollback? escalate?)
- Track timeline
- Communicate status to stakeholders
- Call for postmortem

### Communication During Incidents

```
Internal (Slack #incidents):
  10:23 - IC: SEV1 declared. Payment service down. IC: @alice, Tech Lead: @bob
  10:28 - Bob: Root cause identified - database connection pool exhaustion
  10:35 - Bob: Mitigation in progress - scaling connection pool
  10:42 - IC: Service recovering. Monitoring.
  10:55 - IC: All clear. Payment success rate back to 99.9%.

External (Status Page):
  10:25 - Investigating: We're investigating payment processing issues.
  10:40 - Identified: Root cause identified. Fix in progress.
  10:55 - Resolved: Payment processing has been restored.
```

---

## 6. Key Metrics

| Metric | What It Measures | Formula | Target |
|--------|-----------------|---------|--------|
| **MTTD** | Mean Time to Detect | avg(alert_time - incident_start) | <5 min |
| **MTTA** | Mean Time to Acknowledge | avg(ack_time - alert_time) | <5 min |
| **MTTR** | Mean Time to Resolve | avg(resolved_time - incident_start) | <1 hour |
| **MTTF** | Mean Time to Failure | avg(time between incidents) | Increasing |

### Improving Each Metric

| Metric | How to Improve |
|--------|---------------|
| **MTTD** | Better monitoring, SLO-based alerting, anomaly detection |
| **MTTA** | Clear escalation paths, mobile alerts, auto-routing |
| **MTTR** | Runbooks, automated remediation, blameless culture |
| **MTTF** | Postmortem action items, chaos engineering, testing |

---

## 7. Incident Management Tools

| Tool | Type | Strengths | Pricing |
|------|------|-----------|---------|
| **PagerDuty** | Industry standard | Robust scheduling, AI noise reduction | $21-49/user/mo |
| **OpsGenie** | Atlassian (Jira integration) | Alert routing, Jira/Confluence integration | $9-35/user/mo |
| **Incident.io** | Modern, Slack-native | Slack workflows, auto-documentation | $16-25/user/mo |
| **Grafana OnCall** | Open-source | Free, Grafana integration | Free / Cloud |

---

## 8. Runbooks

### Structure

```markdown
# Runbook: High Error Rate on Payment Service

## Trigger
- Alert: `payment_error_rate > 5%` for 5 minutes

## Impact
- Users cannot complete purchases
- Revenue loss: ~$X per minute

## Diagnosis Steps
1. Check payment service logs: `{service="payment"} |= "error"`
2. Check database connectivity: `SELECT 1` on payment DB
3. Check external payment gateway status: https://status.stripe.com
4. Check recent deployments: `gh pr list --state merged --limit 5`

## Mitigation
- If recent deploy: Rollback with `kubectl rollout undo deployment/payment`
- If DB issues: Check connection pool, restart if needed
- If external gateway: Enable fallback payment processor

## Escalation
- If unresolved in 15 min: Page @payment-team-lead
- If unresolved in 30 min: Page @engineering-manager
```

### Automation

Runbook steps that are always the same should become automated remediation:

```yaml
# Auto-remediation rule
trigger: payment_error_rate > 5%
actions:
  - scale_up: deployment/payment replicas=5
  - notify: slack #payment-team "Auto-scaled payment to 5 replicas"
  - if_not_resolved_in: 10m
    then: page payment-oncall
```

---

## 9. Blameless Postmortems

### Format

```markdown
# Postmortem: Payment Service Outage - 2024-01-15

## Summary
Payment service was unavailable for 23 minutes affecting ~5,000 users.

## Timeline (UTC)
- 10:15 - Deploy v2.3.0 to production
- 10:20 - Error rate starts increasing
- 10:23 - Alert fires, IC paged
- 10:28 - Root cause identified: DB connection pool exhaustion
- 10:35 - Rollback initiated
- 10:42 - Service recovering
- 10:43 - All clear

## Impact
- 23 minutes of degraded payment processing
- ~5,000 users affected, ~$15,000 estimated revenue impact
- No data loss

## Root Cause
v2.3.0 introduced a new query that opened connections but didn't release them
under error conditions. Connection pool exhausted within 5 minutes under load.

## What Went Well
- Alert fired within 3 minutes of degradation
- IC mobilized team quickly
- Rollback was fast and clean

## What Went Wrong
- No load testing on the new query path
- Connection pool exhaustion wasn't covered by integration tests

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Add connection pool monitoring alert | @alice | 2024-01-22 | Done |
| Add load test for payment flow | @bob | 2024-01-29 | In Progress |
| Implement connection timeout | @carol | 2024-01-29 | Open |
| Add integration test for error path | @dave | 2024-02-05 | Open |
```

### Key Principles

- **Blameless**: Focus on systems and processes, not individuals
- **Honest**: Document what actually happened, not what should have
- **Action-oriented**: Every postmortem produces trackable action items
- **Follow-through**: Track action items to completion (this is where most orgs fail)

---

## 10. SRE Practices

### Error Budgets

```
SLO: 99.9% availability = 43.2 minutes of downtime per month

Error Budget = 1 - SLO = 0.1% = 43.2 minutes

If budget remaining > 50%: Ship features aggressively
If budget remaining < 25%: Slow down, focus on reliability
If budget exhausted:       Feature freeze until budget replenishes
```

Error budgets create a **shared language** between product and engineering:
- Product wants features → needs error budget
- Engineering wants reliability → error budget protects them
- Both are incentivized to keep the budget healthy

### SLO-Based Alerting

Instead of alerting on raw thresholds, alert on **burn rate**:

```
Burn rate = rate of SLO consumption

If burning 14.4x normal → 1 hour to exhaust monthly budget → PAGE NOW
If burning 6x normal    → 6 hours to exhaust → PAGE IN 30 MIN
If burning 1x normal    → On track → NO ALERT
```

### Toil Reduction

**Toil**: Manual, repetitive, automatable operational work.

```
TOIL EXAMPLES              →  AUTOMATION
Manual deploys             →  CI/CD pipeline
Manual scaling             →  Auto-scaling
Copy-paste runbook steps   →  Automated remediation
Manual certificate renewal →  cert-manager
Manual incident paging     →  Auto-routing rules
```

**Target**: <50% of SRE time spent on toil (Google SRE principle).

---

## 11. Chaos Engineering

Proactively test system resilience by **deliberately introducing failures**.

### Principles

1. **Define steady state**: What does "healthy" look like? (SLIs within SLO)
2. **Hypothesize**: "If X fails, the system should still meet SLOs"
3. **Inject failure**: Kill a pod, add latency, drop network packets
4. **Observe**: Did the system behave as hypothesized?
5. **Learn**: Fix gaps exposed by the experiment

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| **Chaos Monkey** (Netflix) | Instance termination | Kill random instances |
| **Litmus** (CNCF) | K8s-native chaos | Pod/node/network experiments |
| **Gremlin** | Commercial SaaS | Full chaos engineering platform |
| **Chaos Mesh** | K8s-native | Network, IO, time, stress chaos |

### Connection to Observability

Chaos experiments **validate your observability**:
- Did the alert fire when you killed the service?
- Did the dashboard show the impact?
- Did the runbook work?
- Did the auto-scaling respond?

---

## 12. Common Interview Questions

**Q: How do you design alerts that don't cause fatigue?**
Alert on symptoms (user impact), not causes (infra metrics). Require persistence (`for: 5m`). Deduplicate and group related alerts. Review alerts monthly -- delete or tune noisy ones. Use SLO-based burn rate alerting instead of static thresholds.

**Q: What is a blameless postmortem?**
A structured review focused on systems and processes, not blame. Documents timeline, impact, root cause, what went well/wrong, and action items. Key: actually track action items to completion.

**Q: Explain error budgets and how they affect release velocity.**
Error budget = 1 - SLO. If SLO is 99.9%, budget is 0.1% (43 min/month). Budget remaining → ship aggressively. Budget low → slow down. Budget exhausted → feature freeze. Creates shared incentive between product and reliability.

**Q: What is the difference between MTTD, MTTA, and MTTR?**
MTTD: time to detect (when did we know?). MTTA: time to acknowledge (when did someone respond?). MTTR: time to resolve (when was it fixed?). Each represents a stage of incident response that can be independently optimized.

**Q: How would you set up on-call for a small team?**
Weekly rotation with primary/secondary. Write runbooks for known issues. Set clear severity definitions. Compensate (time off or pay). Cap at 1 week in 4. Track pages-per-shift and fix root causes if >2 average.

**Q: What is chaos engineering and how does it relate to observability?**
Deliberately inject failures to test system resilience. Validates that monitoring, alerting, runbooks, and auto-remediation work correctly. Catches gaps before real incidents do.

---

## 13. Quick Reference

### Severity Matrix

| SEV | Impact | Response | Notify | Example |
|-----|--------|----------|--------|---------|
| 1 | Service down | Immediate | Page + statuspage | Full outage |
| 2 | Major degradation | 15 min | Page | Payment failures |
| 3 | Minor impact | Business hours | Slack | Slow search |
| 4 | No user impact | Next sprint | Ticket | UI glitch |

### Postmortem Checklist

- [ ] Timeline with UTC timestamps
- [ ] Impact quantified (users, revenue, duration)
- [ ] Root cause identified (not just symptoms)
- [ ] What went well
- [ ] What went wrong
- [ ] Action items with owners and due dates
- [ ] Shared with broader team
- [ ] Action items tracked to completion
