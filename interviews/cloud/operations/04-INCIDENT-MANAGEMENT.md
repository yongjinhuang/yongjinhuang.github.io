# Incident Management: On-Call, Runbooks, War Rooms, Postmortems

> Operations Interview Prep — Cloud Operations Series

---

## 1. Incident Lifecycle

Every incident follows a predictable lifecycle. Understanding each phase separates reactive firefighting from disciplined operations.

```
INCIDENT LIFECYCLE
==================

  [DETECTION]────────[TRIAGE]────────[MITIGATION]────────[RESOLUTION]────────[POSTMORTEM]
       │                 │                 │                    │                   │
  Alert fires        Confirm scope    Reduce blast          Service              Write
  User report        SEV assignment   radius               restored              document
  Anomaly            IC assigned      Rollback /            Root cause           Action items
  detection          War room open    scale-up /            confirmed            Share & learn
                                      flag disable
       │                 │                 │                    │                   │
  MTTD tracked     <15 min (SEV1)    MTTR clock          MTTR recorded        Follow-up
                                      running             Monitoring           ticket created
                                                          normalized
```

### Phase Breakdown

| Phase | Goal | Key Actions | Owner |
|-------|------|-------------|-------|
| Detection | Know something is wrong | Alert fires, anomaly detected, user report | Monitoring system / On-call |
| Triage | Understand blast radius | Confirm real vs. false alarm, assign SEV, open war room | Incident Commander (IC) |
| Mitigation | Stop the bleeding | Rollback, scale, disable feature flag, reroute traffic | IC + SMEs |
| Resolution | Restore full service | Verify metrics normal, close incident, draft timeline | IC |
| Postmortem | Learn and prevent | Timeline reconstruction, 5-whys, action items | Postmortem owner |

### Time Pressure by Phase

```
SEV1 Timeline (target):
│
│  :00  Alert fires
│  :05  IC acknowledged, war room open, initial comms posted
│  :15  Triage complete, mitigation underway
│  :30  First customer communication if user-facing
│  :60  Service restored (mitigation) OR executive update
│  :90  Full resolution or escalation to extended team
│
│  Postmortem: scheduled within 24-48h of resolution
```

---

## 2. On-Call Rotations

### Rotation Design Principles

A good on-call rotation balances coverage, fairness, and cognitive load. The worst rotations are understaffed, unpredictable, and lack defined handoff rituals.

#### Common Rotation Patterns

```
PRIMARY / SECONDARY MODEL
==========================

Week 1:   Alice (Primary) ──→ Bob (Secondary)
Week 2:   Bob   (Primary) ──→ Carol (Secondary)
Week 3:   Carol (Primary) ──→ Alice (Secondary)

Primary:  Responds first, leads triage
Secondary: Backup if primary unreachable, assists on SEV1/SEV2
```

```
FOLLOW-THE-SUN MODEL (distributed team)
=========================================

 UTC   0    4    8   12   16   20   24
       │    │    │    │    │    │    │
 APAC  ├────┤    │    │    │    ├────┤
       │    │    │    │    │    │    │
 EMEA  │    ├────┤    │    ├────┤    │
       │    │    │    │    │    │    │
 AMER  │    │    ├────┤────┤    │    │

Each region owns 8-hour window
Handoff at region boundary: APAC→EMEA→AMER→APAC
```

### PagerDuty Schedule Example

```yaml
# PagerDuty schedule via Terraform
resource "pagerduty_schedule" "primary" {
  name      = "platform-primary"
  time_zone = "UTC"

  layer {
    name                         = "Weekly rotation"
    start                        = "2024-01-01T00:00:00-00:00"
    rotation_virtual_start       = "2024-01-01T00:00:00-00:00"
    rotation_turn_length_seconds = 604800  # 1 week

    users = [
      pagerduty_user.alice.id,
      pagerduty_user.bob.id,
      pagerduty_user.carol.id,
    ]

    restriction {
      type              = "weekly_restriction"
      start_day_of_week = 1  # Monday
      start_time_of_day = "09:00:00"
      duration_seconds  = 604800
    }
  }
}
```

### Handoff Protocol

A handoff without ritual leads to dropped context. Always use a structured handoff document.

```
HANDOFF TEMPLATE
================

Date: 2024-01-08 09:00 UTC
Outgoing: Alice Chen
Incoming: Bob Park

OPEN INCIDENTS:
  - None currently active

ONGOING INVESTIGATIONS:
  - [INV-2341] Elevated p99 latency on checkout service (~180ms vs 50ms baseline)
    Context: Started 2024-01-07 22:00 UTC after deploy v2.4.1
    Status: Deploy reverted, monitoring 30 min before closing
    Dashboard: https://grafana.internal/d/checkout-perf

SCHEDULED CHANGES THIS WEEK:
  - 2024-01-09 02:00 UTC: DB maintenance window (30 min, auto-approved)
  - 2024-01-10 16:00 UTC: Certificate renewal for api.prod.example.com

KNOWN FRAGILE SYSTEMS:
  - payment-processor: circuit breaker triggered 3x last week on Stripe webhooks
    Runbook: https://wiki.internal/runbooks/payment-circuit-breaker

THINGS TO WATCH:
  - Traffic spike expected Monday 10am EST (marketing campaign launch)

ESCALATION CONTACTS:
  - DB issues: Dave Kim (Slack: @dave, phone on PD)
  - Payment: Sarah Lopez (Slack: @sarah)
```

### Burnout Prevention

| Practice | Implementation |
|----------|----------------|
| Maximum pages per night | Alert when on-call receives >3 pages/night; review alert quality |
| Minimum rotation size | Never fewer than 3 engineers; 4-5 is healthy |
| Compensation | Explicit on-call stipend or comp time policy; document it |
| Alert hygiene sprints | Quarterly rotation to reduce false alarms; track "actionable page %" |
| Business-hours escalation | SEV3/SEV4 alerts queue to next business day unless escalated |
| Guaranteed sleep window | No pages without override between 23:00–07:00 local time |
| Post-incident recovery | After SEV1: 24h before next on-call shift |

---

## 3. Severity Levels

### SEV Definitions

| Level | Name | Definition | Response SLA | Who Gets Paged |
|-------|------|------------|--------------|----------------|
| SEV1 | Critical | Complete service outage or data loss; >25% users affected | Acknowledge: 5 min; Mitigate: 60 min | Primary + Secondary + Engineering Lead + VP Eng |
| SEV2 | Major | Significant degradation; core feature broken; <25% users affected | Acknowledge: 15 min; Mitigate: 2h | Primary + Secondary + Team Lead |
| SEV3 | Minor | Non-critical feature broken; workaround exists; <5% users affected | Acknowledge: 30 min; Next business day OK | Primary only |
| SEV4 | Low | Cosmetic issue, performance slightly degraded, no user impact | Business hours | Primary (queued) |

### Escalation Matrix

```
ESCALATION MATRIX
=================

          SEV1           SEV2           SEV3           SEV4
          ─────          ─────          ─────          ─────
 0-5m     IC + SME       IC             Primary        Queue
 5-15m    Eng Lead       Team Lead      —              —
 15-30m   VP Eng         —              —              —
 30-60m   CTO / CEO      VP Eng         Eng Lead       —
 60m+     Board comms?   —              —              —

IC  = Incident Commander (on-call primary)
SME = Subject Matter Expert for affected system
```

### Severity Decision Flowchart

```
Is there complete service outage?
  YES ──→ SEV1
  NO  ──→ Is a core user flow broken (login, checkout, data access)?
            YES ──→ Are >25% of users affected?
                      YES ──→ SEV1
                      NO  ──→ SEV2
            NO  ──→ Is the feature degraded with no workaround?
                      YES ──→ SEV3
                      NO  ──→ SEV4
```

---

## 4. The First 5 Minutes of an Incident

The first 5 minutes determine how quickly you recover. A calm, systematic approach beats frantic action.

### Checklist: First 5 Minutes

```
FIRST 5 MINUTES PROTOCOL
=========================

STEP 1 — ACKNOWLEDGE (0:00–1:00)
  [ ] Acknowledge the alert in PagerDuty / OpsGenie
  [ ] Post in #incidents: "ACKed [ALERT-NAME], investigating"

STEP 2 — CONFIRM (1:00–2:00)
  [ ] Is this a real incident or false alarm?
      → Check dashboard: is the metric actually bad?
      → Check status page: is there an existing known issue?
      → Query: is the alerting system itself healthy?
  [ ] If false alarm → suppress, file ticket for alert fix, done

STEP 3 — SCOPE (2:00–3:00)
  [ ] What is broken? (service, endpoint, region, tier)
  [ ] Who is affected? (% users, internal only, external)
  [ ] Is it getting worse, stable, or improving?
  [ ] Assign SEV based on scope

STEP 4 — DECLARE (3:00–4:00)
  [ ] Open incident channel: #inc-YYYYMMDD-short-description
  [ ] Post initial message (use template below)
  [ ] Page additional people if SEV1/SEV2

STEP 5 — STABILIZE (4:00–5:00)
  [ ] Stop active change: if a recent deploy, prepare rollback
  [ ] Do NOT make changes yet — observe first
  [ ] Start the incident timeline doc
```

### Initial Incident Message Template

```
[SEV2 INCIDENT DECLARED] Checkout latency elevated

Status:     INVESTIGATING
IC:         @alice
Started:    2024-01-08 14:32 UTC
Affected:   Checkout flow — all regions
Symptoms:   p99 latency 850ms (baseline: 120ms), error rate 2.1% (baseline: 0.1%)
User impact: ~12% of checkout attempts failing

Timeline doc: https://docs.internal/incidents/2024-01-08-checkout-latency
Dashboard:    https://grafana.internal/d/checkout-overview

Next update in 15 minutes.
```

### Incident Commander Role

The IC is the single decision-maker. They do not debug — they direct.

| IC Responsibility | What It Means |
|-------------------|---------------|
| Declare and own the incident | One person calls the SEV, opens the channel, is accountable |
| Assign roles | Designate comms lead, scribe, SMEs |
| Drive mitigation | Ask "what's our next action and ETA?" every 10-15 min |
| Make go/no-go calls | Authorize rollbacks, traffic shifts, emergency changes |
| Close the incident | Declare resolution, assign postmortem owner |

---

## 5. War Rooms / Incident Bridges

### War Room Structure

```
WAR ROOM PARTICIPANTS
======================

  ┌─────────────────────────────────────────────────────┐
  │  INCIDENT COMMANDER (IC)                            │
  │  • Owns the incident end-to-end                     │
  │  • Makes all decisions                              │
  │  • Keeps meeting focused                            │
  └──────────────────┬──────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
  ┌──────▼──────┐         ┌──────▼──────┐
  │ COMMS LEAD  │         │   SCRIBE    │
  │ External    │         │ Timeline    │
  │ status page │         │ decisions   │
  │ Stakeholder │         │ actions     │
  │ updates     │         │ log         │
  └─────────────┘         └─────────────┘
         │
  ┌──────▼──────────────────────────────────┐
  │  SUBJECT MATTER EXPERTS (SMEs)          │
  │  • Database SME (if DB involved)        │
  │  • Infrastructure SME                   │
  │  • Service owner SME                    │
  │  • Security SME (if breach suspected)   │
  └─────────────────────────────────────────┘
```

### Communication Channels

| Channel | Purpose | Audience |
|---------|---------|----------|
| `#inc-YYYYMMDD-description` | Working channel: all technical discussion | Responders only |
| `#incidents` | Broadcast channel: high-level updates | All engineers |
| `#customer-success` | Customer impact updates | CS team, support |
| Status page | Public-facing updates | Customers |
| Email | Executive and customer comms for SEV1 | Leadership, enterprise customers |

### War Room Cadence

```
SEV1 WAR ROOM RHYTHM
====================

 T+0m    IC declares, opens bridge, assigns roles
 T+5m    Scribe documents: who is present, what we know
 T+10m   First SME hypothesis: "What changed? What's different?"
 T+15m   Mitigation decision: rollback? scale? flag? IC authorizes
 T+20m   Comms lead posts first external update (if user-facing)
 T+30m   Status check: is mitigation working? metrics improving?
 T+45m   Executive update from comms lead
 T+60m   Resolution OR escalate / bring in additional SMEs
```

### Scribe Log Format

```
INCIDENT SCRIBE LOG — INC-2024-0108-checkout
=============================================

14:32 UTC  Alert fired: checkout_p99_latency > 500ms for 5 min
14:33 UTC  Alice ACKed. Declared SEV2.
14:35 UTC  War room opened. Alice (IC), Bob (Scribe), Carol (Comms), Dave (DB SME)
14:38 UTC  Confirmed: checkout service returning 503s, DB CPU at 94%
14:40 UTC  Hypothesis: deploy v2.4.1 (14:20 UTC) added N+1 query in checkout flow
14:42 UTC  Decision: rollback v2.4.1 — IC authorized
14:45 UTC  Rollback initiated by Dave. ETA: 5 minutes.
14:51 UTC  Rollback complete. DB CPU dropping: 94% → 62% → 41%
14:54 UTC  p99 latency: 850ms → 210ms → 130ms. Error rate: 2.1% → 0.2%
15:00 UTC  Metrics normalized. IC declared mitigation complete.
15:05 UTC  Monitoring 30 min before full resolution.
15:35 UTC  No regression. IC declared incident RESOLVED.
15:36 UTC  Action: postmortem scheduled 2024-01-09 10:00 UTC. Owner: Alice.
```

---

## 6. Runbooks

### Runbook Structure

A runbook must answer: "What is happening, how do I confirm it, and what do I do about it?"

```
RUNBOOK TEMPLATE
================

# [SERVICE] — [PROBLEM TITLE]

## Overview
Brief description of the problem and its business impact.

## Symptoms
- Alert name and threshold
- Observable symptoms (metrics, logs, user reports)

## Prerequisites
- Tools needed (kubectl, psql, aws cli)
- Access required (production DB access, AWS console)
- Links to dashboards

## Diagnosis Steps
Step-by-step commands to confirm the problem and determine root cause.
Include expected output.

## Mitigation Steps
Ordered actions from least to most disruptive.
Each step: command + expected result + rollback if it makes things worse.

## Resolution
How to confirm the issue is fully resolved.

## Post-Resolution
- Metrics to monitor for 30 minutes
- Ticket to file
- Postmortem trigger conditions

## Escalation
Who to call if runbook doesn't resolve the issue.

## Related Runbooks
Links to related runbooks.
```

### Runbook: High CPU on Application Server

```markdown
# Application Server — High CPU (>85% for 10 min)

## Symptoms
- Alert: app_cpu_utilization > 85% for 10 min
- Degraded response times, potential 503s

## Diagnosis

# 1. Which instances are affected?
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=AutoScalingGroupName,Value=app-prod-asg \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 --statistics Average

# 2. What process is consuming CPU?
ssh app-prod-01
top -bn1 | head -20

# 3. Is there a traffic spike?
# Check: Grafana → Application → RPS dashboard

# 4. Recent deploys?
kubectl rollout history deployment/app-prod

## Mitigation (in order of preference)

### Option A — Scale out (preferred, least risk)
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name app-prod-asg \
  --desired-capacity 12   # was 8; add 4 instances

# Verify: wait 3 min, check CPU per instance
# Rollback: set desired-capacity back to 8

### Option B — Rollback recent deploy
kubectl rollout undo deployment/app-prod
kubectl rollout status deployment/app-prod

# Verify: check CPU drops within 5 min after rollout

### Option C — Kill runaway process (last resort)
ssh app-prod-01
ps aux | sort -k3 -r | head -5
kill -15 <PID>   # SIGTERM first
# If no response after 30s: kill -9 <PID>

## Resolution Criteria
- CPU < 60% across all instances for 10 continuous minutes
- Error rate < 0.1%
- p99 latency < 200ms

## Escalation
App team lead: @dave-k (Slack), +1-555-0102 (PD)
```

### Runbook: Disk Full

```markdown
# Host — Disk Full (>90% utilization)

## Diagnosis

# Which partition?
df -h

# What's consuming space?
du -sh /var/log/* | sort -rh | head -20
du -sh /tmp/* | sort -rh | head -10

# Application logs specifically:
du -sh /var/log/app/* | sort -rh | head -10

# Docker if applicable:
docker system df
docker system prune --dry-run

## Mitigation

### Step 1 — Rotate/compress logs (safe)
logrotate -f /etc/logrotate.conf
find /var/log -name "*.log" -mtime +7 -exec gzip {} \;

### Step 2 — Clear temp files (safe)
find /tmp -mtime +1 -delete
find /var/tmp -mtime +7 -delete

### Step 3 — Docker cleanup (verify no active containers first)
docker images -f "dangling=true" -q | xargs docker rmi
docker volume prune -f

### Step 4 — Expand volume (if AWS EBS)
# Increase EBS volume size (no downtime on modern kernels)
aws ec2 modify-volume --volume-id vol-XXXXXXXX --size 100  # was 50GB

# After resize, grow filesystem:
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1   # ext4
# OR: sudo xfs_growfs /     # xfs

## Resolution Criteria
- Disk utilization < 70%
- Application writing logs without errors
```

### Runbook: OOM (Out of Memory)

```markdown
# Application — OOM Kills / Memory Exhaustion

## Symptoms
- Alert: container_memory_usage_bytes > 90% of limit
- Kubernetes: OOMKilled in pod status
- Application: 502/503 errors during restart

## Diagnosis

# Kubernetes OOM check:
kubectl get pods -n production | grep -v Running
kubectl describe pod <pod-name> -n production | grep -A5 "Last State"
# Look for: Reason: OOMKilled

# Memory usage per pod:
kubectl top pods -n production --sort-by=memory | head -20

# Memory leak indicators (steady growth over time):
# Check: Grafana → Memory usage per pod → last 24h trend

## Mitigation

### Immediate: Restart affected pods
kubectl rollout restart deployment/app-prod -n production

### Short-term: Increase memory limit
kubectl patch deployment app-prod -n production \
  --patch '{"spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"2Gi"},"requests":{"memory":"1Gi"}}}]}}}}'

### If memory leak suspected: rollback
kubectl rollout undo deployment/app-prod -n production

## Escalation
- If steady growth pattern: file bug, assign to service owner
- If all pods affected simultaneously: likely traffic-related, scale out first
```

### Runbook: Connection Pool Exhaustion

```markdown
# Database — Connection Pool Exhaustion

## Symptoms
- Alert: db_connections_used / db_connections_max > 90%
- Application errors: "too many connections", "connection timeout"
- Logs: FATAL: remaining connection slots are reserved for non-replication superuser connections

## Diagnosis

# PostgreSQL: check current connections
psql -h db-prod.internal -U admin -c "
SELECT count(*), state, wait_event_type, wait_event
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY count DESC;"

# Which application is holding connections?
psql -h db-prod.internal -U admin -c "
SELECT application_name, count(*), state
FROM pg_stat_activity
WHERE state != 'idle'
GROUP BY application_name, state
ORDER BY count DESC;"

# Long-running queries (potential locks):
psql -h db-prod.internal -U admin -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;"

## Mitigation

### Step 1 — Kill idle connections (safe)
psql -h db-prod.internal -U admin -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < now() - interval '10 minutes'
  AND pid != pg_backend_pid();"

### Step 2 — Kill long-running blocking queries
# Identify blocking query PID from above, then:
psql -h db-prod.internal -U admin -c "SELECT pg_terminate_backend(<PID>);"

### Step 3 — Reduce pool size at application level
# If using PgBouncer, reduce pool_size temporarily
# If direct connections, reduce app replicas

### Step 4 — Increase max_connections (requires DB restart — last resort)
# Document in change ticket, get IC approval

## Resolution Criteria
- Connection count < 80% of max_connections
- Application error rate < 0.1%
- No connection timeout errors in logs
```

### Runbook: Certificate Expiry

```markdown
# TLS Certificate Expiring / Expired

## Detection (proactive — before expiry)
# Check cert expiry:
echo | openssl s_client -servername api.example.com \
  -connect api.example.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Or via AWS ACM:
aws acm list-certificates --query 'CertificateSummaryList[*].[DomainName,Status]'
aws acm describe-certificate --certificate-arn arn:aws:acm:... | jq '.Certificate.NotAfter'

## Mitigation

### AWS ACM (auto-renew managed certs — usually automatic)
# Verify auto-renewal is on:
aws acm describe-certificate --certificate-arn arn:aws:acm:... | \
  jq '.Certificate.RenewalEligibility'

# Trigger manual renewal if needed:
aws acm renew-certificate --certificate-arn arn:aws:acm:...

### Let's Encrypt (certbot)
certbot renew --cert-name api.example.com --dry-run
certbot renew --cert-name api.example.com
systemctl reload nginx

### Manual cert replacement
# 1. Obtain new cert from CA
# 2. Validate: openssl x509 -in new.crt -noout -text
# 3. Check key matches: openssl x509 -noout -modulus -in new.crt | md5sum
#                       openssl rsa -noout -modulus -in new.key | md5sum
# 4. Deploy to load balancer / web server
# 5. Verify: echo | openssl s_client -connect api.example.com:443
```

---

## 7. Mitigation Playbooks

### Rollback

```bash
# Kubernetes deployment rollback
kubectl rollout undo deployment/<name> -n <namespace>
kubectl rollout status deployment/<name> -n <namespace>
kubectl rollout history deployment/<name> -n <namespace>  # verify version

# Rollback to specific revision
kubectl rollout undo deployment/<name> --to-revision=3 -n <namespace>

# Verify rollback successful:
kubectl get pods -n <namespace> -w  # watch pods restart
kubectl describe deployment/<name> -n <namespace> | grep Image
```

### Feature Flag Disable

```bash
# LaunchDarkly CLI
ld-cli feature-flags update \
  --flag-key checkout-v2 \
  --project production \
  --environment production \
  --patch '[{"op":"replace","path":"/on","value":false}]'

# Verify
ld-cli feature-flags get --flag-key checkout-v2 --project production

# Internal flag service (example)
curl -X PATCH https://flags.internal/api/flags/checkout-v2 \
  -H "Authorization: Bearer $FLAG_API_TOKEN" \
  -d '{"enabled": false}'
```

### Traffic Shifting

```bash
# AWS ALB: shift traffic between target groups
aws elbv2 modify-rule \
  --rule-arn arn:aws:elasticloadbalancing:... \
  --actions '[
    {"Type":"forward","ForwardConfig":{"TargetGroups":[
      {"TargetGroupArn":"arn:aws:...v1...","Weight":100},
      {"TargetGroupArn":"arn:aws:...v2...","Weight":0}
    ]}}
  ]'

# Kubernetes: canary rollback (adjust weights)
kubectl patch virtualservice checkout -n production --patch '{
  "spec": {
    "http": [{
      "route": [
        {"destination": {"host": "checkout", "subset": "v1"}, "weight": 100},
        {"destination": {"host": "checkout", "subset": "v2"}, "weight": 0}
      ]
    }]
  }
}'
```

### Scale-Up

```bash
# Kubernetes: manual scale
kubectl scale deployment app-prod --replicas=20 -n production

# AWS Auto Scaling: force immediate scale
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name app-prod-asg \
  --desired-capacity 20

# AWS ECS: update service
aws ecs update-service \
  --cluster prod \
  --service app-prod \
  --desired-count 20
```

### Circuit Breaker Activation

```bash
# Istio: inject fault to stop traffic to unhealthy service
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: payment-circuit-breaker
  namespace: production
spec:
  host: payment-service
  trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 100
EOF
```

---

## 8. Communication During Incidents

### Status Page Update Templates

```
STATUS PAGE — INVESTIGATING (post within 15 min of SEV1 declaration)
====================================================================
Title: Elevated Error Rates — Checkout Service
Status: Investigating

We are investigating reports of elevated error rates affecting the checkout
service. Some users may experience failures when attempting to complete a
purchase. Our team is actively working to identify and resolve the issue.

Last updated: 2024-01-08 14:45 UTC | Next update: 2024-01-08 15:15 UTC
```

```
STATUS PAGE — IDENTIFIED
========================
Title: Elevated Error Rates — Checkout Service
Status: Identified

We have identified the root cause of elevated error rates in the checkout
service. The issue is related to a recent deployment that introduced a
database query regression. We are in the process of rolling back this
change.

Affected: Checkout, Payment Processing
Impact: ~12% of checkout attempts returning errors

Last updated: 2024-01-08 14:58 UTC | Next update: 2024-01-08 15:20 UTC
```

```
STATUS PAGE — RESOLVED
======================
Title: Elevated Error Rates — Checkout Service
Status: Resolved

The issue affecting the checkout service has been resolved. We rolled back
the v2.4.1 deployment at 14:51 UTC and confirmed service restoration at
15:35 UTC. Error rates have returned to baseline (<0.1%) and all checkout
flows are operating normally.

We will publish a postmortem within 48 hours.

Duration: 14:32 UTC – 15:35 UTC (63 minutes)
```

### Internal Stakeholder Update Template

```
INCIDENT UPDATE — SEV2 — [T+30 min]
=====================================
TO: #engineering-leads, #customer-success
FROM: Carol (Comms Lead)

INCIDENT: INC-2024-0108-checkout-latency
DURATION: 63 minutes (14:32–15:35 UTC)
STATUS: RESOLVED

IMPACT:
- ~12% of checkout attempts failed during incident window
- Estimated affected transactions: ~840 (based on normal traffic)
- No data loss; failed transactions must be retried by users

ROOT CAUSE (preliminary):
- Deploy v2.4.1 introduced N+1 query in checkout service
- DB CPU spiked to 94%, causing connection timeouts

RESOLUTION:
- Rolled back to v2.4.0 at 14:51 UTC
- Service normalized at 15:00 UTC

NEXT STEPS:
- Postmortem: 2024-01-09 10:00 UTC (Alice leading)
- Immediate: v2.4.1 reverted to staging for query fix
- Customer comms: CS team reaching out to affected enterprise accounts

INCIDENT TIMELINE: https://docs.internal/incidents/2024-01-08-checkout
```

### Customer Communication (Enterprise)

```
Subject: Incident Report — Checkout Service Disruption (2024-01-08)

Dear [Customer Name],

We are writing to inform you of a service disruption that affected our
checkout service on January 8, 2024, between 14:32 and 15:35 UTC (63 minutes).

WHAT HAPPENED
A software deployment introduced a performance regression in our checkout
database layer, resulting in elevated error rates. Approximately 12% of
checkout requests during this window returned errors.

IMPACT TO YOUR ACCOUNT
Our records indicate [X] failed transactions from your account during
this period. These transactions were not charged and will need to be
retried.

WHAT WE DID
Our on-call team identified and mitigated the issue within 63 minutes
by rolling back the software change. We are conducting a full postmortem
to prevent recurrence.

WHAT WE ARE DOING
- Query optimization review before re-deployment of v2.4.1
- Improved canary deployment process to catch performance regressions
- Enhanced database monitoring for query performance

We sincerely apologize for the disruption. If you have any questions
or concerns, please contact your account manager or our support team.

Regards,
[Engineering Operations Team]
```

---

## 9. Blameless Postmortems

### The Blameless Principle

Blameless postmortems assume that engineers acted with the best intentions given the information available at the time. The goal is system improvement, not individual blame. When people fear blame, they hide problems — which makes systems less safe.

### Postmortem Structure

```
POSTMORTEM TEMPLATE
===================

# Postmortem: [Short Title]
Date: YYYY-MM-DD
Author: [Name]
Severity: SEV[N]
Status: Draft / In Review / Final

## Summary
2-3 sentence executive summary: what happened, duration, impact.

## Impact
- Duration: [X minutes]
- Users affected: [N or %]
- Transactions failed: [N]
- SLO impact: [X% of error budget consumed]
- Revenue impact (if known): [$N]

## Timeline (UTC)
| Time  | Event |
|-------|-------|
| 14:20 | v2.4.1 deployed to production |
| 14:32 | Alert fired: checkout_p99_latency > 500ms |
| 14:33 | Alice acknowledged, declared SEV2 |
| ...   | ... |
| 15:35 | Incident resolved |

## Root Cause
The immediate cause was [X]. This was made possible by [Y] and [Z].

## Contributing Factors
(NOT "who did it" — "what systemic conditions allowed this")
1. No automated query performance testing in CI pipeline
2. Canary deployment did not route sufficient traffic to detect DB load
3. DB performance alerts had 10-minute window (too slow for detection)

## 5-Whys Analysis
Why did the checkout service degrade?
  → DB CPU hit 94% causing connection timeouts
Why did DB CPU spike?
  → v2.4.1 introduced N+1 query in checkout flow
Why did N+1 query reach production?
  → No query performance testing in CI; PR review missed it
Why is there no query performance testing?
  → Not in team standards; was a known gap but not prioritized
Why was it not prioritized?
  → No incident previously triggered it; risk not visible to team

## Action Items
| Item | Owner | Priority | Due Date |
|------|-------|----------|----------|
| Add query explain-plan check to CI pipeline | Dave K | P1 | 2024-01-22 |
| Reduce canary traffic window from 1h to 15m with DB monitoring | Bob P | P1 | 2024-01-15 |
| Add DB query p99 latency alert with 2-min window | Carol L | P2 | 2024-01-19 |
| Document checkout query patterns in architecture wiki | Dave K | P3 | 2024-02-01 |

## What Went Well
- IC declared incident within 60 seconds of alert
- Rollback was completed in 6 minutes (excellent)
- Clear communication to stakeholders throughout
- Runbook for DB CPU existed and was used effectively

## Lessons Learned
- Canary deployments need DB-layer observability, not just HTTP success rates
- N+1 queries are a deployment risk that needs CI gates

## Appendix
- Incident channel log: [link]
- Dashboard snapshots: [link]
- Relevant code change: [link to PR]
```

### 5-Whys Technique

```
5-WHYS FORMAT
=============

Start: "The incident occurred because..."

Why 1: Why did users see checkout errors?
Answer: Because the checkout service was returning 503s

Why 2: Why was it returning 503s?
Answer: Because DB connections were exhausted

Why 3: Why were DB connections exhausted?
Answer: Because query count per request increased ~50x

Why 4: Why did query count increase?
Answer: Because v2.4.1 introduced an N+1 query loading cart items

Why 5: Why did this reach production?
Answer: Because our CI has no query performance regression tests

ROOT CAUSE: Lack of query performance testing in CI pipeline

Note: 5-whys often branches. Follow all significant branches.
Stop when you reach something actionable (a system or process to change).
Do not stop at a person's name.
```

### Postmortem Sharing Culture

| Practice | How |
|----------|-----|
| Regular postmortem reviews | Monthly "incident review" meeting open to all engineers |
| Postmortem archive | All postmortems in searchable wiki (not private docs) |
| Action item tracking | All action items in Jira with DRI (Directly Responsible Individual) |
| 30-day check-in | Review action item completion 30 days post-incident |
| Cross-team sharing | High-value postmortems shared in eng-all Slack channel |

---

## 10. Incident Metrics

### Core Metrics Definitions

| Metric | Formula | Target | Notes |
|--------|---------|--------|-------|
| MTTD (Mean Time to Detect) | Avg time from incident start to alert fire | < 5 min | Measures monitoring quality |
| MTTA (Mean Time to Acknowledge) | Avg time from alert to first human response | < 5 min (SEV1) | Measures on-call responsiveness |
| MTTR (Mean Time to Resolve) | Avg time from detection to resolution | < 60 min (SEV1) | Primary SRE KPI |
| MTBF (Mean Time Between Failures) | Total uptime / number of incidents | Maximize | Service reliability |
| MTTM (Mean Time to Mitigate) | Avg time from detection to blast radius reduced | < 30 min (SEV1) | Mitigation vs. root cause fix |

### Operational Health Dashboard

```
MONTHLY INCIDENT METRICS DASHBOARD
====================================

Incident Volume:
  Total incidents:        23
  SEV1:                    2
  SEV2:                    7
  SEV3:                   14

Detection (MTTD):
  Average:               3m 42s  ✓ (target: <5m)
  Worst case:           18m 00s  ✗ (investigate alert gap)

Response (MTTA):
  SEV1 average:          2m 10s  ✓
  SEV2 average:          8m 45s  ✓

Resolution (MTTR):
  SEV1 average:         47m 30s  ✓ (target: <60m)
  SEV2 average:         2h 15m   ✓ (target: <4h)

Alert Quality:
  Total pages:          187
  Actionable pages:     142 (76%)  ⚠ (target: >85%)
  False positive rate:   24%       ✗ ACTION NEEDED

On-Call Load:
  Pages per shift (avg): 4.2       ✓ (target: <8)
  Night pages (23-07):   0.8/night ✓
  Escalations:            3

Postmortem Completion:
  Required:               9 (SEV1+SEV2)
  Completed on time:      8 (89%)
  Action items created:  31
  Action items closed:   18 (58%)  ⚠ track to completion
```

### SLO Error Budget Impact

```
ERROR BUDGET TRACKING
=====================

Service: checkout-api
SLO: 99.9% availability (monthly)
Error budget: 43.8 min/month

January:
  INC-0108 (SEV2):  63 min  ← EXCEEDS monthly budget
  INC-0115 (SEV3):   8 min
  INC-0122 (SEV3):   3 min

Total consumed: 74 min (169% of budget)
Budget status:  EXHAUSTED — freeze non-critical deploys
Action: SEV1 response: all feature deploys require SRE approval
```

---

## 11. Tools of the Trade

### Alert and On-Call Management

| Tool | Strengths | Best For |
|------|-----------|---------|
| PagerDuty | Mature routing, escalation policies, rich integrations, analytics | Most production environments |
| OpsGenie | Strong Jira integration, lower cost, good mobile app | Teams on Atlassian stack |
| VictorOps (Splunk On-Call) | Good for Splunk users, timeline view | Splunk-heavy environments |
| Rootly | Modern UX, Slack-native incident management | Teams wanting Slack-first workflow |
| FireHydrant | Full incident lifecycle, retrospective tooling | Teams wanting postmortem tooling bundled |

### Status Pages

| Tool | Strengths |
|------|-----------|
| Atlassian Statuspage | Industry standard, Jira/PD integration, subscriber management |
| Instatus | Modern, affordable, good API |
| Cachet | Open-source, self-hosted |
| Betteruptime | Combined monitoring + status page |

### Incident Response in Slack

```
# Slack bot commands (example: Rootly / Incident.io)

/incident declare
/incident update "Rollback complete, monitoring metrics"
/incident severity sev2
/incident assign-ic @alice
/incident resolve

# Auto-creates: incident channel, timeline doc, Jira ticket
# Auto-posts: status page updates, stakeholder notifications
```

### PagerDuty Configuration Example

```yaml
# Escalation policy (Terraform)
resource "pagerduty_escalation_policy" "platform_sev1" {
  name      = "Platform SEV1"
  num_loops = 2

  rule {
    escalation_delay_in_minutes = 5
    target {
      type = "schedule_reference"
      id   = pagerduty_schedule.primary.id
    }
  }

  rule {
    escalation_delay_in_minutes = 5
    target {
      type = "schedule_reference"
      id   = pagerduty_schedule.secondary.id
    }
  }

  rule {
    escalation_delay_in_minutes = 10
    target {
      type = "user_reference"
      id   = pagerduty_user.engineering_lead.id
    }
  }
}
```

### Alert Routing Logic

```
PAGERDUTY ROUTING
=================

Alert fires in Prometheus / CloudWatch / Datadog
          │
          ▼
    PagerDuty Event Rules
          │
     ┌────┴────────────┬──────────────────┐
     │                 │                  │
  severity=critical  severity=warning   severity=info
     │                 │                  │
  SEV1/SEV2 policy  SEV3 policy        Log only
  (page immediately) (business hours)   (no page)
```

---

## 12. Real-World Incident Walkthrough: Cascading Failure

### Scenario Setup

```
SYSTEM TOPOLOGY
===============

  [Users] → [CDN] → [ALB] → [API Gateway] → [Checkout Service]
                                                     │
                                          ┌──────────┴──────────┐
                                          │                      │
                                   [Inventory DB]         [Payment Service]
                                   (PostgreSQL RDS)              │
                                                         [Stripe API]
```

### The Cascade: Timeline

```
2024-01-08 14:00 UTC — Root Cause: Stripe webhook endpoint slow
  ├── Stripe sends webhooks for payment confirmation
  ├── Checkout service webhook handler not async
  └── Each webhook holds a DB connection for 45 seconds

14:15 UTC — Connection Pool Pressure Builds
  ├── Normal traffic + slow webhooks = connections growing
  ├── DB connections: 65/100 (normal is 40)
  └── No alert yet (threshold: 90%)

14:25 UTC — v2.4.1 Deployed (unfortunate timing)
  ├── New feature: cart item eager loading
  ├── Adds 12 queries per checkout request (was 3)
  └── DB connections: 85/100 — alert fires but is snoozed by deploying engineer

14:32 UTC — CRITICAL THRESHOLD
  ├── DB connections: 100/100 — EXHAUSTED
  ├── New checkout requests: can't get connection → 503
  ├── Alert: checkout_error_rate > 1% fires → PagerDuty pages Alice
  └── Alert: db_connections_used > 90% fires → ALSO pages Alice

14:33 UTC — Alice Acknowledges, Declares SEV2
  ├── Sees TWO alerts: error rate AND db connections
  ├── Initial hypothesis: "deploy v2.4.1 caused this"
  └── Opens #inc-20240108-checkout-cascade

14:38 UTC — War Room Assembles
  ├── IC: Alice | Scribe: Bob | Comms: Carol | DB SME: Dave | Payments SME: Sarah
  ├── Dave checks DB: "100/100 connections, lots of idle-in-transaction"
  └── Sarah: "I see webhook processing threads backed up"

14:42 UTC — TWO Hypotheses
  ├── Hypothesis A: v2.4.1 N+1 queries (Alice)
  └── Hypothesis B: Stripe webhook thread leak (Sarah)

  IC DECISION: "Both could be contributing. Rollback v2.4.1 first
               (reversible, faster). Sarah investigate webhooks in parallel."

14:45 UTC — Rollback v2.4.1 Initiated
  ├── Dave executes: kubectl rollout undo deployment/checkout-prod
  └── ETA: 4 minutes

14:49 UTC — Partial Recovery
  ├── DB connections: 100 → 78 (rollback helped but not resolved)
  ├── Error rate: 12% → 6% (improved, not resolved)
  └── Sarah: "Found it — webhook handler is SYNCHRONOUS, holding connections"

14:52 UTC — Root Cause Confirmed: Webhook Thread Exhaustion
  ├── Decision: disable webhook processing temporarily
  └── Feature flag: webhooks_sync_processing → OFF (async queue instead)

14:55 UTC — Recovery
  ├── DB connections: 78 → 45 → 32
  ├── Error rate: 6% → 1% → 0.1%
  └── p99 latency: 850ms → 220ms → 140ms

15:00 UTC — Mitigation Complete
15:35 UTC — Monitoring clear, incident RESOLVED

TOTAL DURATION: 63 minutes
ROOT CAUSE: Synchronous Stripe webhook handler (pre-existing) + v2.4.1
            query regression (timing) created cascading connection exhaustion
```

### Postmortem: Key Findings

```
CONTRIBUTING FACTORS (cascading failure analysis)
==================================================

Factor 1: Synchronous webhook handler (pre-existing technical debt)
  Risk was known: TODO comment in code since 2023-09
  Impact: Held DB connections during Stripe processing (~45s each)

Factor 2: High webhook volume on deployment day
  Stripe ran bulk webhook replay (not communicated)
  Amplified Factor 1 to near-limit levels before deploy

Factor 3: Deploy at 90% DB connection threshold
  Engineer snoozed DB alert during deploy ("probably the deploy")
  Policy: never deploy when connection alert is active

Factor 4: No circuit breaker on webhook endpoint
  If webhook processor fell behind, no backpressure to Stripe

Factor 5: DB connection alert threshold too high (90%)
  Should be 75% to provide reaction time

ACTION ITEMS:
  P0: Make webhook handler async (queued) — 1 week sprint
  P1: Add circuit breaker to webhook endpoint
  P1: Lower DB connection alert to 75%
  P2: Policy: no deployments when any DB alert is active
  P3: Add Stripe webhook volume to anomaly detection
```

### Lessons for Interviews

When asked about a cascading failure, demonstrate:

1. **Signals not causes**: "We had two alerts fire simultaneously — that told me we might have a compounding problem, not a single root cause"
2. **Parallel investigation**: "We split into two teams: one on the deploy, one on the DB connection pattern"
3. **Reversible first**: "We chose to rollback the deploy first because it was reversible in 4 minutes; the webhook fix would take longer"
4. **Systemic thinking**: "The real lesson wasn't the deploy — it was that synchronous webhook processing was a known risk we hadn't addressed"
5. **Blameless framing**: "The engineer who snoozed the alert made a reasonable judgment call with incomplete information; we fixed the process so the alert would be clearer"

---

## Quick Reference: Interview Cheat Sheet

### Common Interview Questions and Key Points

| Question | Key Points to Hit |
|----------|------------------|
| "Walk me through an incident you handled" | Use: detection→triage→mitigation→resolution→postmortem structure |
| "How do you design an on-call rotation?" | Cover: rotation size, primary/secondary, handoff ritual, burnout prevention, alert quality |
| "What makes a good runbook?" | Diagnosis steps with commands, ordered mitigation (least→most disruptive), resolution criteria, escalation |
| "How do you run a postmortem?" | Blameless, timeline reconstruction, 5-whys to systemic causes, action items with owners/dates |
| "What's your MTTR and how do you improve it?" | MTTD + MTTA + mitigation speed; improve each independently |
| "How do you prevent alert fatigue?" | Alert quality sprints, track actionable%, escalate false positive alerts as bugs |
| "What do you do in the first 5 minutes?" | Acknowledge→confirm→scope→declare→stabilize (don't make changes immediately) |

### On-Call Health Check

```
HEALTHY ON-CALL SIGNS:
  ✓ Pages are actionable >85% of the time
  ✓ Average <5 pages per on-call shift
  ✓ MTTD < 5 minutes for SEV1
  ✓ MTTR < 60 minutes for SEV1
  ✓ Postmortems completed within 48h
  ✓ Action items closed within 30 days
  ✓ Rotation has ≥ 4 engineers

UNHEALTHY SIGNS (red flags):
  ✗ Engineers dreading on-call
  ✗ Frequent alert snoozing
  ✗ Postmortems focus on individual blame
  ✗ Same incidents recurring without action items
  ✗ On-call compensation not defined
  ✗ No runbooks for top 5 alert types
```
