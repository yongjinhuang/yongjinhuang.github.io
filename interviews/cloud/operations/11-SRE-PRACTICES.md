# SRE Practices: SLOs, Error Budgets, Toil Reduction, Production Readiness

> Operations perspective: how Site Reliability Engineering translates reliability intentions into measurable, actionable systems.

---

## 1. SRE vs DevOps vs Platform Engineering

### Philosophy Differences

```
                     PHILOSOPHY SPECTRUM
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  DevOps             SRE                  Platform Eng.      │
│  ─────────          ───                  ──────────────     │
│  Cultural           Prescriptive         Product-driven     │
│  movement           methodology          approach           │
│                                                             │
│  "Dev and Ops       "SWE skills          "Build internal     │
│  collaborate"       applied to ops"      developer platforms"│
│                                                             │
│  Outcome:           Outcome:             Outcome:            │
│  Better             Reliability          Developer           │
│  velocity           via SLOs             self-service        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Google's SRE Book Principles (7 Core Tenets)

1. **Embrace risk** — 100% reliability is wrong; find the right reliability level
2. **SLOs are everything** — SLOs define the work, not the org chart
3. **Eliminate toil** — No more than 50% ops work; rest is project/engineering
4. **Monitor deliberately** — Symptom-based alerting, not cause-based
5. **Automate carefully** — Automation has a cost; safe automation first
6. **Release engineering** — Reliable, reproducible builds and deployments
7. **Simplicity** — Complexity is the enemy of reliability

### Organizational Models

| Model | Embedded SRE | Centralized SRE | Consulting SRE |
|---|---|---|---|
| Structure | SREs in product teams | Separate SRE org | SREs as advisors |
| Pros | Deep domain knowledge | Consistent standards | Scales broadly |
| Cons | Inconsistent practices | Org silos | Shallow impact |
| Best for | Large product orgs | Early SRE practice | Platform teams |
| On-call | Product team rotation | SRE-only rotation | Hybrid |

### SRE vs DevOps: The Key Distinction

```
DevOps asks: "How do we ship faster and more safely?"

SRE asks:    "What is the right level of reliability,
              and are we engineering toward it?"
```

SRE is a **role and methodology**. DevOps is a **philosophy**. Platform Engineering is an **implementation pattern**. They are not mutually exclusive.

---

## 2. Service Level Hierarchy

```
                    SLA (Legal/Business)
                   ┌─────────────────────┐
                   │  Contractual         │
                   │  Customer-facing     │
                   │  Consequences: $$$   │
                   │  e.g., 99.9% uptime  │
                   └──────────┬──────────┘
                              │ tighter than
                    SLO (Engineering)
                   ┌─────────────────────┐
                   │  Internal target     │
                   │  Team-owned          │
                   │  Consequences: EB    │
                   │  e.g., 99.95% avail  │
                   └──────────┬──────────┘
                              │ measured by
                    SLI (Measurement)
                   ┌─────────────────────┐
                   │  Metric              │
                   │  What we measure     │
                   │  e.g., HTTP 5xx rate │
                   │  Prometheus query    │
                   └─────────────────────┘
```

### Ownership Matrix

| Layer | Owner | Audience | Cadence |
|---|---|---|---|
| SLI | SRE / Observability team | Engineering | Real-time |
| SLO | Product + SRE jointly | Engineering + leadership | Weekly |
| SLA | Legal + Product | Customers | Contract term |
| Error Budget | SRE | Dev + SRE | Daily |

### The Key Rule

**SLO must always be tighter than SLA.** If SLO = SLA, any SLO breach is immediately an SLA violation with financial penalties.

```
Recommended gap:  SLO target >= SLA target + 0.1% to 1%

Example:
  SLA: 99.9% availability
  SLO: 99.95% availability
  Gap: 0.05% = 21.9 minutes/month headroom before SLA breach
```

---

## 3. Defining SLIs

### Four Golden Signals as SLI Candidates

```
┌────────────────────────────────────────────────────────────┐
│              FOUR GOLDEN SIGNALS                            │
│                                                             │
│  LATENCY      TRAFFIC       ERRORS        SATURATION        │
│  ────────     ───────       ──────        ──────────        │
│  p50/p95/     RPS, QPS,     Rate,         CPU, mem,         │
│  p99/p999     bandwidth     ratio,        queue depth,      │
│               user          categories    disk I/O          │
│               sessions                                      │
│                                                             │
│  Most SLIs live here ──────────────────────────────────►   │
└────────────────────────────────────────────────────────────┘
```

### Good vs Bad SLI Design

| Property | Good SLI | Bad SLI |
|---|---|---|
| User-centric | "Requests served < 200ms" | "CPU < 70%" |
| Measurable | Prometheus/metric | Human judgment |
| Ratio-based | 0.0 to 1.0 | Absolute counts |
| Aggregatable | Sums across instances | Per-instance only |
| Leading indicator | Latency p99 | Error count |

### SLI Measurement Methods

**Availability SLI:**
```promql
# Good: ratio of successful requests
sum(rate(http_requests_total{status!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

**Latency SLI:**
```promql
# Good: proportion of requests under threshold
sum(rate(http_request_duration_seconds_bucket{le="0.2"}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

**Throughput SLI:**
```promql
# Good: successful writes per second (as ratio of target)
sum(rate(writes_total{result="success"}[5m]))
/
scalar(target_write_rate)
```

**Correctness SLI (hardest to measure):**
```
Options:
  1. Canary validation — run shadow requests against known-good oracle
  2. Data consistency checks — probe for expected outputs
  3. Synthetic monitors — scripted user journeys with assertions
  4. Client-side error tracking — JS errors, API response validation
```

### SLI Selection Decision Tree

```
Does it reflect USER EXPERIENCE?
  NO  → Don't use it as SLI (use as diagnostic metric)
  YES ↓
Can it be expressed as a RATIO (good / total)?
  NO  → Convert it: "p99 < threshold" becomes
        (requests where latency < threshold) / total_requests
  YES ↓
Is it MEASURABLE in real time?
  NO  → Use synthetic monitoring or batch checks
  YES → Good SLI candidate
```

---

## 4. Setting SLOs

### Target Selection Process

```
Step 1: Measure current state (baseline)
  ↓
Step 2: Identify user happiness threshold
  (ask: what makes users complain? what do they not notice?)
  ↓
Step 3: Gap analysis
  (current reliability vs user happiness point)
  ↓
Step 4: Set SLO just above current state
  (don't over-promise; leave room for improvement)
  ↓
Step 5: Stakeholder negotiation
  (product wants higher; SRE wants lower; find balance)
  ↓
Step 6: Document and commit
```

### The SLO Document Template

```markdown
## SLO: Payment Service — Transaction Success Rate

**Owner:** Payments SRE + Payments Product
**Version:** 2.1
**Review Date:** Quarterly

### SLI Definition
Ratio of payment transactions completing without server-side
error, measured over rolling 28-day window.

Numerator:   payment_transactions_total{result="success"}
Denominator: payment_transactions_total

Exclusions:
- Client-side validation errors (4xx)
- Planned maintenance windows (declared >24h in advance)

### SLO Target
99.95% over 28-day rolling window

### Error Budget
- Monthly budget: 0.05% × 28 days × 24h × 60m = 20.16 minutes
- Budget burn alert thresholds: 2%, 5%, 10%, 50%

### Reporting
- Dashboard: [link]
- Weekly report: SRE Monday standup
- Owner escalation: At 50% budget consumed
```

### Multi-Window Multi-Burn-Rate Alerting

This is the Google SRE recommended alerting strategy (from _The Site Reliability Workbook_):

```
BURN RATE CONCEPT:
  If SLO = 99.9%, error budget = 0.1%
  Burn rate 1x = consuming budget at exactly the rate that
                 exhausts it over 30 days
  Burn rate 14.4x = would exhaust budget in 2 hours (30d / 14.4 ≈ 2h)

MULTI-WINDOW ALERT TABLE:
┌────────────────┬──────────────┬──────────────┬───────────┐
│ Severity       │ Burn Rate    │ Short Window │ Long Win  │
├────────────────┼──────────────┼──────────────┼───────────┤
│ Page (SEV1)    │ 14.4x        │ 5m           │ 1h        │
│ Page (SEV2)    │ 6x           │ 30m          │ 6h        │
│ Ticket (SEV3)  │ 3x           │ 6h           │ 3d        │
│ Ticket (SEV4)  │ 1x           │ 3d           │ –         │
└────────────────┴──────────────┴──────────────┴───────────┘

Alert fires when BOTH windows exceed burn rate threshold.
Two windows prevent alert flapping on short spikes.
```

**Prometheus alert example:**
```yaml
groups:
  - name: slo_payment_availability
    rules:
      - alert: PaymentSLOBurnRateHigh
        expr: |
          (
            sum(rate(payment_errors_total[1h]))
            / sum(rate(payment_requests_total[1h]))
          ) > (14.4 * 0.001)
          and
          (
            sum(rate(payment_errors_total[5m]))
            / sum(rate(payment_requests_total[5m]))
          ) > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Payment SLO burning at >14.4x rate"
          description: "Error budget will be exhausted in ~2h"
```

### Stakeholder Negotiation Framework

```
Product wants: 99.99% (unrealistic, no budget for it)
Engineering has: 99.7% (current baseline)
User tolerance: Users don't notice < 0.1% errors

Negotiation approach:
  1. Show baseline data (don't promise what you can't deliver)
  2. Show cost curve (9s of reliability: 99.9% → 99.99% = 10x infra cost)
  3. Propose improvement roadmap (99.7% → 99.9% in Q1, 99.95% by Q3)
  4. Define what budget buys (each 9 costs N engineer-weeks)
  5. Agree on review cadence (quarterly SLO review)
```

---

## 5. Error Budgets

### Calculation

```
SLO = 99.9% over 30-day rolling window

Total minutes in 30 days:
  30 × 24 × 60 = 43,200 minutes

Error budget (allowed downtime):
  43,200 × (1 - 0.999) = 43.2 minutes/month

Error budget as request ratio (at 1000 RPS):
  43,200s × 1000 req/s × 0.001 = 43,200,000 failed requests/month
```

### Error Budget State Machine

```
                    ┌─────────────────┐
                    │  Budget Healthy  │
                    │  (>50% remain)   │
                    └────────┬────────┘
                             │ burn accelerates
                    ┌────────▼────────┐
                    │  Budget Warning  │
                    │  (10-50% remain) │
                    │  → slow features │
                    └────────┬────────┘
                             │ continued burn
                    ┌────────▼────────┐
                    │  Budget Critical │
                    │  (<10% remain)   │
                    │  → freeze deploy │
                    └────────┬────────┘
                             │ budget exhausted
                    ┌────────▼────────┐
                    │  Budget Gone     │
                    │  (0% remain)     │
                    │  → ops work only │
                    └─────────────────┘
```

### Burn Rate Analysis

```
Current error rate: 0.5%
SLO target:        99.9% (error budget: 0.1%)
Burn rate:         0.5% / 0.1% = 5x

At 5x burn rate:
  Budget exhausted in: 30 days / 5 = 6 days

Action required: Incident declared, fixes prioritized
```

### Error Budget Policy (Template)

```markdown
## Error Budget Policy: API Platform

### Policy Triggers

| Budget Remaining | State    | Required Actions                              |
|-----------------|----------|-----------------------------------------------|
| 100% - 50%      | Healthy  | Normal operations, features ship freely        |
| 50% - 25%       | Warning  | SRE review of all high-risk deployments        |
| 25% - 10%       | Danger   | Freeze non-critical feature deployments        |
| 10% - 0%        | Critical | Full deployment freeze; reliability work only  |
| 0% (exhausted)  | Breached | Exec review; SLO renegotiation consideration   |

### Development Freeze Mechanics
1. SRE sends freeze notification to #engineering channel
2. All deploy pipelines require SRE approval (Slack workflow)
3. Exception process: VP-level approval for critical fixes
4. Freeze lifts at start of next calendar month (budget resets)
5. Post-freeze: retrospective on what consumed budget

### Budget Restoration (when exhausted)
- Option A: Wait for monthly reset
- Option B: Negotiate SLO reduction with stakeholders
- Option C: Demonstrate sustained reliability improvement
  (3 consecutive days at SLO = early budget restoration)
```

---

## 6. Toil Identification & Reduction

### What Is Toil?

Toil has six characteristics (Google SRE definition):

```
┌──────────────────────────────────────────────────────────┐
│                    TOIL CHARACTERISTICS                   │
│                                                           │
│  1. MANUAL        — Requires human to run a script        │
│  2. REPETITIVE    — Done repeatedly, same task            │
│  3. AUTOMATABLE   — Could be done by a machine            │
│  4. REACTIVE      — Triggered by external request         │
│  5. NO ENDURING   — No permanent improvement results      │
│     VALUE                                                 │
│  6. O(n) GROWTH   — Grows linearly with service scale     │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Toil Examples vs Non-Toil

| Task | Toil? | Why |
|---|---|---|
| Restart stuck cron job | Yes | Manual, repetitive, automatable |
| Respond to capacity alert, scale up | Yes | Reactive, automatable |
| Write runbook for issue | No | Enduring value |
| Design auto-scaling policy | No | Engineering work |
| Run weekly cert rotation script | Yes | Repetitive, no enduring value |
| Automate cert rotation | No | Eliminates toil |
| Handle oncall escalation | Partial | If escalation → systemic fix = not toil |

### Measuring Toil

```bash
# Time tracking categories (use JIRA or similar)
# Each ticket tagged: [toil] [project] [incident] [oncall]

# Weekly toil report query
jira_query="project=SRE AND labels=toil AND created >= -7d"

# Calculate toil percentage
toil_hours=$(jira_time_spent --filter "labels=toil" --last 30d)
total_hours=$(jira_time_spent --last 30d)
toil_pct=$(echo "scale=1; $toil_hours / $total_hours * 100" | bc)
echo "Toil: ${toil_pct}% (target: <50%)"
```

### The 50% Rule

```
Google's mandate: SRE teams must spend < 50% of time on ops/toil.
Remaining > 50% must be engineering/project work.

If toil > 50%:
  ┌─────────────────────────────────────────────────────┐
  │  ESCALATION PATH                                     │
  │                                                      │
  │  1. Report to management with data                   │
  │  2. Temporarily return ops work to dev teams         │
  │  3. Negotiate: dev team fixes root causes            │
  │  4. SRE handles until automation is built            │
  │  5. Track and trend — continuous improvement         │
  └─────────────────────────────────────────────────────┘
```

### Automation ROI Calculation

```
Problem: Manual database backup verification
  - Frequency: Daily
  - Time per run: 45 minutes
  - Monthly cost: 45 min × 30 days = 22.5 hours

Automation investment:
  - Engineer time to automate: 16 hours
  - Ongoing maintenance: 1 hour/month

ROI calculation:
  Monthly savings: 22.5h - 1h = 21.5 hours
  Breakeven: 16h / 21.5h ≈ 0.74 months (~3 weeks)
  Annual savings: 21.5h × 12 = 258 engineer-hours
  At $150/hr fully loaded: $38,700/year

Decision: AUTOMATE (ROI payback < 1 month)
```

### Toil Budget Framework

```
Team of 5 SREs, 40h/week each = 200 hours/week

Toil budget (50% cap): 100 hours/week

Current toil inventory:
  - Oncall response handling:    30h/week
  - Manual deployments:          25h/week
  - Ticket-driven DB queries:    20h/week
  - Weekly capacity reports:     15h/week
  Total:                         90h/week ← under budget, OK

Next quarter projections (organic growth +30%):
  Projected toil:               117h/week ← BREACH

Action plan:
  - Automate manual deployments (saves 25h): Q1 priority
  - Self-service DB query tool (saves 20h): Q2 priority
```

---

## 7. Production Readiness Reviews

### PRR Checklist

```
PRR CHECKLIST v2.0
Service: ________________   Date: ________   Reviewer: ________

RELIABILITY
  [ ] Defined SLIs for all user-facing operations
  [ ] SLO document signed off by product and SRE
  [ ] Error budget policy written and acknowledged
  [ ] Load tested to 2x expected peak traffic
  [ ] Chaos testing performed (at least 1 failure scenario)
  [ ] Graceful degradation behavior documented

MONITORING & ALERTING
  [ ] All SLI metrics instrumented and emitting
  [ ] Multi-window burn-rate alerts configured
  [ ] Dashboards created (SLI/SLO, latency, saturation)
  [ ] Runbooks written for all P1/P2 alerts
  [ ] Synthetic monitoring / health checks in place
  [ ] Distributed tracing integrated (sample rate configured)

INCIDENT MANAGEMENT
  [ ] Oncall rotation established
  [ ] Escalation path documented
  [ ] War room / incident channel set up
  [ ] Postmortem template linked
  [ ] On-call documentation complete (service overview, dependencies)

DEPLOYMENT & CHANGE
  [ ] CI/CD pipeline with automated tests (>80% coverage)
  [ ] Feature flags implemented for major features
  [ ] Canary/progressive rollout configured
  [ ] Automated rollback trigger defined (error rate threshold)
  [ ] Deployment runbook / change procedure documented

CAPACITY & SCALING
  [ ] Autoscaling configured with tested HPA/VPA policies
  [ ] Resource limits set on all containers
  [ ] Capacity model documented (units, growth assumptions)
  [ ] Load shedding configured (circuit breakers, rate limits)
  [ ] Database connection pooling configured

SECURITY & COMPLIANCE
  [ ] Secret management via vault/KMS (no hardcoded secrets)
  [ ] RBAC roles defined (least privilege)
  [ ] Network policies applied
  [ ] Audit logging enabled
  [ ] Compliance review completed (if required)

DEPENDENCIES
  [ ] Upstream SLOs reviewed and dependencies mapped
  [ ] Fallback behavior for each critical dependency defined
  [ ] Timeout + retry policies set for all outbound calls
  [ ] Dependency SLOs support your own SLO math
```

### Launch Criteria and Gates

```
PROGRESSIVE LAUNCH MODEL:

  Phase 0: Internal (employees only)
  ┌────────────────────────────────┐
  │ Gate: PRR checklist 100%       │
  │ Gate: Load test passed         │
  │ Gate: Runbooks complete        │
  └───────────────┬────────────────┘
                  │ 1 week at p0
  Phase 1: 1% of production traffic
  ┌────────────────────────────────┐
  │ Gate: Error rate < 0.1%        │
  │ Gate: Latency p99 within SLO   │
  │ Gate: No SEV1/SEV2 incidents   │
  └───────────────┬────────────────┘
                  │ 48 hours at 1%
  Phase 2: 10% of traffic
  ┌────────────────────────────────┐
  │ Gate: Same as Phase 1          │
  │ Gate: Error budget burn < 1x   │
  └───────────────┬────────────────┘
                  │ 72 hours at 10%
  Phase 3: 100% rollout
```

---

## 8. Reliability Engineering Patterns

### Circuit Breaker

```
CIRCUIT BREAKER STATE MACHINE:

  ┌─────────┐   failure threshold   ┌──────────┐
  │  CLOSED  ├──────────────────────►   OPEN    │
  │ (normal) │                       │(reject all│
  └────┬─────┘                       │ requests) │
       │                             └─────┬─────┘
       │                                   │ timeout
       │                                   ▼
       │                          ┌─────────────────┐
       └──────────────────────────┤  HALF-OPEN       │
          success threshold       │  (probe with     │
                                  │  limited traffic) │
                                  └─────────────────-┘

Configuration example (Go/resilience4j):
  failureRateThreshold: 50%     # open when 50% fail
  slowCallRateThreshold: 80%    # or 80% are slow
  slowCallDurationThreshold: 2s # "slow" defined as > 2s
  waitDurationInOpenState: 30s  # probe after 30s
  permittedCallsInHalfOpenState: 5
```

### Retry with Exponential Backoff and Jitter

```python
import random
import time

def retry_with_backoff(func, max_attempts=5, base_delay=0.1):
    for attempt in range(max_attempts):
        try:
            return func()
        except TransientError as e:
            if attempt == max_attempts - 1:
                raise
            # Exponential backoff with full jitter
            cap = 30  # max 30 seconds
            base = base_delay * (2 ** attempt)
            delay = random.uniform(0, min(cap, base))
            time.sleep(delay)

# Key: jitter prevents thundering herd on recovery
# Full jitter: sleep = random(0, min(cap, base * 2^attempt))
```

### Timeout Hierarchy

```
TIMEOUT LAYERS:

  User request (browser)    30s timeout
       │
  API Gateway               10s timeout
       │
  Service A                  5s timeout
       │
  Service B (downstream)     2s timeout
       │
  Database query             1s timeout

Rule: each layer timeout < parent layer timeout
      prevents cascading wait chains
```

### Graceful Degradation

```
FEATURE PRIORITY TIERS:

  Tier 1 (Core — never shed):
    - Authentication
    - Primary data read path
    - Payment processing

  Tier 2 (Important — shed under load):
    - Recommendations
    - Analytics events
    - Real-time notifications

  Tier 3 (Nice-to-have — shed first):
    - A/B experiment tracking
    - Non-critical logging
    - Third-party enrichment

Implementation:
  if (load_shedder.is_overloaded()) {
    skip_tier3_features();
    if (critically_overloaded()) {
      skip_tier2_features();
    }
  }
```

### Bulkhead Pattern

```
WITHOUT BULKHEADS:          WITH BULKHEADS:
┌──────────────────┐        ┌──────┐ ┌──────┐ ┌──────┐
│   Thread Pool    │        │ Pool │ │ Pool │ │ Pool │
│   (shared)       │        │ A    │ │ B    │ │ C    │
│                  │        │(10)  │ │(10)  │ │(10)  │
│  A: 28 threads   │        └──────┘ └──────┘ └──────┘
│  B:  2 threads   │
│  C:  0 threads   │        Service A surge uses
│  (A exhausted    │        only Pool A — B and C
│   all threads)   │        remain available
└──────────────────┘
```

---

## 9. Capacity Planning the SRE Way

### Traffic Modeling

```
CAPACITY MODEL TEMPLATE:

Service: API Gateway
Current P95 RPS:   5,000 req/s
Current headroom:  40% (at 5,000 RPS, capacity = 8,333 RPS)

GROWTH COMPONENTS:
  Organic (YoY):          +25%/year = +2.08%/month
  Known launches (Q2):    +15% one-time bump (May 1)
  Marketing campaigns:    +40% for 48h (3 planned/quarter)
  Seasonal peak (Dec):    +60% vs annual average

12-MONTH PROJECTION:
  Month  | Organic | Launch | Campaign | Peak RPS | Capacity Req
  -------|---------|--------|----------|----------|-------------
  Apr    | +2%     | -      | -        | 5,100    | 8,500
  May    | +4%     | +15%   | -        | 6,040    | 10,067
  Jun    | +6%     | -      | +40%*    | 7,280    | 12,133
  ...
  Dec    | +28%    | -      | -        | 8,320×1.6| 22,187

  *Campaign: peak lasts 48h; provision for it or use burst

RECOMMENDATION:
  Provision baseline for May post-launch (6,040 RPS = 10,067 cap)
  Configure autoscaling burst headroom for campaigns/seasonal
  Set max scale ceiling for Dec + 20% buffer = 26,624 RPS cap
```

### Headroom Targets

```
Headroom policy (example):
  Normal operations:    30% headroom above P95 traffic
  Pre-launch:          50% headroom (absorb ramp)
  Holiday/peak season: 60% headroom (reduced risk)
  Critical path svcs:  Minimum 2× peak capacity at all times
```

### Organic vs Inorganic Growth

| Growth Type | Planning Horizon | Data Source | Who Provides |
|---|---|---|---|
| Organic | 12-18 months | Historical trend + MoM | Analytics |
| Product launch | Event-specific | PM roadmap | Product |
| Marketing campaign | Event-specific | Campaign calendar | Marketing |
| External event | Reactive | News monitoring | Sales |
| Viral/unexpected | N/A — must have burst | Circuit breakers | SRE |

---

## 10. Change Management

### Change Velocity vs Reliability

```
CHANGE RISK MODEL:

  Risk = f(blast_radius × exposure_time × change_complexity)

  High risk:  Large blast radius + long exposure + complex change
  Low risk:   Narrow blast radius + short exposure + simple change

  Example:
    Database schema migration (prod, all users):
      blast_radius = HIGH, exposure = MEDIUM, complexity = HIGH
      → requires change window, staged rollout, DBA review

    CSS color update behind feature flag (1% users):
      blast_radius = LOW, exposure = SHORT, complexity = LOW
      → deploy anytime, no window required
```

### Change Advisory Board (CAB) Tiering

| Change Tier | Description | Approval Required | Timing |
|---|---|---|---|
| Standard | Pre-approved, documented | None | Anytime |
| Normal | Reviewed, tested | Team lead | Change window |
| Major | High blast radius | CAB + SRE | Scheduled window |
| Emergency | Break-fix under incident | On-call lead + manager | Immediately |

### Progressive Rollout with Automated Rollback

```yaml
# Argo Rollouts example
apiVersion: argoproj.io/v1alpha1
kind: Rollout
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: {duration: 10m}
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
        - setWeight: 100
      analysis:
        templates:
          - templateName: error-rate
        args:
          - name: slo-threshold
            value: "0.001"
      # If analysis fails at any step → auto-rollback
```

### Change Window Policy

```
CHANGE WINDOWS:

  LOW TRAFFIC WINDOWS (recommended for major changes):
    Weekdays:  02:00 - 06:00 UTC (low global traffic)
    Weekend:   Saturday 06:00 - Sunday 10:00 UTC

  FROZEN PERIODS (no changes):
    - 72h before major launches
    - Black Friday / Cyber Monday window (Nov 25 - Dec 2)
    - End-of-quarter financial close (last 3 days of quarter)
    - Active P1 incidents (until resolved + 2h)

  CHANGE FREQUENCY TARGETS:
    Deployment frequency:  Multiple times/day (DORA Elite)
    Lead time for changes: < 1 hour (DORA Elite)
    Change failure rate:   < 5%
    MTTR:                  < 1 hour
```

---

## 11. Operational Overload

### Recognizing Overload Signals

```
OVERLOAD INDICATORS:
  ☐ Toil > 60% of engineering time
  ☐ Postmortems not completed (backlog > 5 open)
  ☐ Runbooks outdated (last updated > 6 months)
  ☐ Oncall engineers regularly paged > 5 times/night
  ☐ Project work stalled for > 2 sprints
  ☐ SRE team attrition rate increasing
  ☐ Incidents reopening without root cause fix
```

### Escalation Path When Underwater

```
OVERLOAD RESPONSE PROTOCOL:

  Step 1: Document and quantify (data, not feelings)
    - Toil hours per week (tracked in JIRA)
    - Oncall burden metrics (PagerDuty reports)
    - Backlog of unfixed reliability debt

  Step 2: Immediate triage
    - Identify top 3 toil sources (80/20 rule)
    - Temporarily return low-priority tickets to dev teams
    - Cancel non-essential meetings for 2 weeks

  Step 3: Escalate to management with data
    - "We are at 70% toil, target is 50%"
    - "Without relief, we project SRE burnout in 8 weeks"
    - Propose: hire 1 SRE, or dev team takes 3 toil items

  Step 4: Structural fixes (medium term)
    - Embed SRE with highest-burden team for 1 sprint
    - Reliability sprints: dev teams fix their toil
    - Prioritize automation projects

  Step 5: Staffing model review
    - Rule of thumb: 1 SRE per 10-12 engineers
    - If SRE covers > 15 engineers: understaffed signal
```

### Project vs Ops Work Balance

```
TIME ALLOCATION MODEL:

  Ideal (Google SRE model):
  ┌────────────────────────────────────────────┐
  │  Project/Engineering  ████████████  50-60%  │
  │  Oncall response      ████          20-25%  │
  │  Toil                 ████          15-25%  │
  │  Admin/meetings       ██            5-10%   │
  └────────────────────────────────────────────┘

  Overloaded state:
  ┌────────────────────────────────────────────┐
  │  Project/Engineering  ███           10-15%  │
  │  Oncall response      ████████      35-40%  │
  │  Toil                 █████████     40-45%  │
  │  Admin/meetings       ██             5-10%  │
  └────────────────────────────────────────────┘
  → Trigger escalation
```

---

## 12. Building an SRE Culture

### Blamelessness

```
BLAMELESS POSTMORTEM PRINCIPLES:

  BLAME-ORIENTED (WRONG):
    "Bob didn't run the checklist"
    "The on-call engineer should have caught this"
    "This was an obvious mistake"

  BLAMELESS (CORRECT):
    "The checklist didn't surface this failure mode"
    "Our monitoring didn't alert until users were impacted"
    "The runbook didn't cover this edge case"

BLAMELESS FRAME:
  Assume people are doing their best with:
    - The information they had at the time
    - The tools available to them
    - The constraints they were operating under

  System failure → system fix (not person fix)
```

### Learning From Failure

**Postmortem Template:**

```markdown
## Incident Postmortem: [Incident Title] — [Date]

**Severity:** P1 / P2 / P3
**Duration:** [start] → [end] (total: X hours Y minutes)
**Impact:** [quantified: N users affected, $X revenue impact]
**SLO Impact:** Consumed X minutes of error budget (Y% of monthly)

### Timeline (UTC)
| Time  | Event                                          |
|-------|------------------------------------------------|
| 14:02 | Alert fires: Payment error rate >2%            |
| 14:07 | On-call acknowledges, begins investigation     |
| 14:23 | Root cause identified: DB connection pool leak |
| 14:31 | Mitigation applied: service restart            |
| 14:35 | Error rate returns to normal                   |
| 14:50 | Incident closed, monitoring for recurrence     |

### Root Cause Analysis (5 Whys)
1. Why? Payment errors spiked
2. Why? DB connections exhausted
3. Why? Connection pool not released on exception path
4. Why? Exception handler missing `finally` block
5. Why? Code review didn't catch this pattern

### Contributing Factors
- No automated test for connection exhaustion scenario
- Alert threshold too conservative (2% not 0.5%)
- Runbook didn't include connection pool diagnostics

### Action Items
| Item                               | Owner   | Due    | Priority |
|------------------------------------|---------|--------|----------|
| Fix exception handler with finally | Dev team| +3 days| P0       |
| Add connection pool exhaustion test| Dev team| +1 week| P1       |
| Lower alert threshold to 0.5%      | SRE     | +2 days| P1       |
| Update DB runbook                  | SRE     | +1 week| P2       |
```

### Documentation Culture

```
DOCUMENTATION HIERARCHY:
  ┌─────────────────────────────────────────────┐
  │  RUNBOOKS          ← operational how-tos    │
  │  (when alert X fires, do steps A, B, C)     │
  ├─────────────────────────────────────────────┤
  │  PLAYBOOKS         ← incident response      │
  │  (for incident type Y, follow this process) │
  ├─────────────────────────────────────────────┤
  │  POSTMORTEMS       ← learning artifacts     │
  │  (what happened, what we learned, fixes)    │
  ├─────────────────────────────────────────────┤
  │  ARCHITECTURE DOCS ← how the system works   │
  │  (for new team members, onboarding)         │
  └─────────────────────────────────────────────┘

QUALITY SIGNAL: Is your new hire on-call alone in week 3?
  If yes → your runbooks are insufficient
  If no  → documentation is doing its job
```

---

## 13. SRE Toolchain

### The Integrated Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    SRE TOOLCHAIN                             │
│                                                             │
│  OBSERVABILITY          INCIDENT MGMT    CHANGE MGMT        │
│  ─────────────          ─────────────    ──────────         │
│  Prometheus/Thanos      PagerDuty        ArgoCD             │
│  Grafana                OpsGenie         Spinnaker          │
│  Jaeger/Tempo           Statuspage       GitHub Actions     │
│  Loki/ELK               Incident.io      Flux               │
│  OpenTelemetry          Jira/Linear      Atlantis (TF)      │
│                                                             │
│  CAPACITY PLANNING      SLO MANAGEMENT   CHAOS              │
│  ─────────────────      ──────────────   ─────              │
│  KEDA metrics           Nobl9            Chaos Monkey       │
│  Goldilocks (VPA)       Sloth            LitmusChaos        │
│  Kubecost               OpenSLO          Gremlin            │
│  AWS Cost Explorer      Pyrra            Chaos Mesh         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sloth: SLO as Code

```yaml
# sloth.yaml — SLO definition as code
version: "prometheus/v1"
service: "payment-service"
labels:
  team: "payments-sre"
slos:
  - name: "requests-availability"
    objective: 99.9
    description: "99.9% of payment requests succeed"
    sli:
      events:
        error_query: sum(rate(http_requests_total{job="payment",code=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total{job="payment"}[{{.window}}]))
    alerting:
      name: PaymentAvailability
      page_alert:
        labels: {severity: "page"}
      ticket_alert:
        labels: {severity: "ticket"}
```

### Monitoring Stack Integration

```
DATA FLOW:

  Application
    │ (metrics via /metrics endpoint)
    ▼
  Prometheus (scrape every 15s)
    │ (long-term storage)
    ▼
  Thanos (global query view, dedup)
    │ (visualization)
    ▼
  Grafana (dashboards, alerts)
    │ (alert routing)
    ▼
  Alertmanager → PagerDuty → On-call engineer
                           → Slack #incidents
                           → Statuspage (auto-update)
```

---

## 14. Real-World SRE Implementation

### Building SRE from Scratch: 200-Engineer Organization

**Phase 1: Foundation (Months 1-3)**

```
STARTING POINT:
  - No SLOs defined
  - Monitoring = mostly infrastructure metrics
  - Oncall = everyone panics
  - No postmortems
  - Deployments manual/inconsistent

PHASE 1 GOALS:
  1. Hire first 3 SREs (generalist with SWE + ops background)
  2. Baseline: instrument top 5 services, capture SLIs
  3. Define SLOs for top 5 services (provisional — can change)
  4. Establish oncall rotation: one SRE + shadow from dev team
  5. First postmortem process: template + blameless norm set
  6. Tooling: deploy Prometheus + Grafana + PagerDuty
```

**Phase 2: Maturity (Months 4-9)**

```
PHASE 2 GOALS:
  1. All production services have SLOs + error budget dashboards
  2. PRR process launched: gate new services through PRR
  3. Toil measurement started: JIRA labels + weekly report
  4. Automated rollback for all services (Argo Rollouts)
  5. Oncall runbooks for all P1/P2 alert categories
  6. Reliability sprints: dev teams take toil items quarterly
  7. Error budget policy active: deployment freeze mechanics tested
```

**Phase 3: Scale (Months 10-18)**

```
PHASE 3 GOALS:
  1. SRE embedded in top 3 product teams (5-6 engineers each)
  2. Platform SRE team owns common tooling
  3. Chaos engineering program (monthly game days)
  4. Capacity planning model for all services
  5. Developer self-service reliability tooling
  6. SRE community of practice across all teams
  7. DORA metrics tracked: deploy frequency, MTTR, CFR, lead time
```

### DORA Metrics Baseline + Targets

```
DORA METRICS (DevOps Research & Assessment):

                Current Baseline  Target (12mo)  Elite Level
Deployment Freq  Weekly           Daily           Multiple/day
Lead Time        1-2 weeks        < 1 day         < 1 hour
Change Fail Rate 20%              <10%            <5%
MTTR             4 hours          <1 hour         <1 hour
```

### Org Model at 200 Engineers

```
SRE TEAM STRUCTURE (200-engineer org):

  Total SREs: 10-14 (ratio: ~1:15-20 engineers)

  ┌─────────────────────────────────────────────────┐
  │  PLATFORM SRE (4 SREs)                          │
  │  - Monitoring infra (Prom/Grafana/Thanos)        │
  │  - Incident management tooling                  │
  │  - CI/CD reliability (pipeline SLOs)            │
  │  - SRE education + PRR process owner            │
  ├─────────────────────────────────────────────────┤
  │  EMBEDDED SRE — Product Area A (3 SREs)         │
  │  - Dedicated to top-revenue product area        │
  │  - SLO ownership + oncall + project work        │
  ├─────────────────────────────────────────────────┤
  │  EMBEDDED SRE — Product Area B (3 SREs)         │
  │  - Same model, different product area           │
  ├─────────────────────────────────────────────────┤
  │  CONSULTING SRE (2-4 SREs)                      │
  │  - PRR reviews for all other services           │
  │  - Reliability consulting on demand             │
  │  - Training and documentation                   │
  └─────────────────────────────────────────────────┘
```

### SRE Implementation Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|---|---|---|
| SLOs set to current baseline | No improvement pressure | Set SLO 0.1-0.5% above baseline |
| 100% availability SLO | Impossible; no error budget | Find user happiness threshold |
| SRE owns all oncall | Dev teams ignore reliability | Dev teams share oncall burden |
| No PRR gate | Unreliable services deployed | PRR required for GA launch |
| Toil accepted as normal | Engineers burn out; attrition | Treat 50% toil as P1 issue |
| Blameful postmortems | Engineers hide incidents | Blameless; learning focus |
| Alert on every metric | Alert fatigue | Alert only on SLI/SLO burns |

---

## Quick Reference: Key Formulas

```
ERROR BUDGET:
  budget_minutes = window_minutes × (1 - slo_target)
  Example: 43,200 × (1 - 0.999) = 43.2 min/month

BURN RATE:
  burn_rate = current_error_rate / error_budget_rate
  time_to_exhaustion = window_duration / burn_rate

TOIL PERCENTAGE:
  toil_pct = toil_hours / total_hours × 100
  Target: < 50%

HEADROOM:
  headroom = (capacity - current_load) / capacity × 100
  Target: > 30% for normal ops

DORA CHANGE FAILURE RATE:
  cfr = failed_deployments / total_deployments × 100
  Elite: < 5%

SLO TIGHTENING RULE:
  slo_internal > sla_external
  Minimum gap: 0.05% to 0.1% (depending on service criticality)
```

---

*Next: [12-INCIDENT-MANAGEMENT.md](./12-INCIDENT-MANAGEMENT.md) — Incident command structure, war rooms, blameless postmortems in depth*
