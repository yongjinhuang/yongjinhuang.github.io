# Cloud Operations — How Ops Teams Run Thousands of Servers

> This series covers the operational side of cloud infrastructure: how teams actually manage, monitor, deploy to, and keep alive fleets of hundreds to thousands of servers in production.

---

## Who This Is For

- Engineers interviewing for **SRE / DevOps / Platform Engineering** roles
- Backend engineers who want to understand the ops side of things
- Anyone curious about what happens **after** code is merged

---

## Series Overview

| # | Topic | What You'll Learn |
|---|-------|-------------------|
| 01 | [Fleet Management](01-FLEET-MANAGEMENT.md) | Inventory, provisioning, immutable infra, golden images, auto-scaling groups |
| 02 | [Configuration Management](02-CONFIGURATION-MANAGEMENT.md) | Ansible, Puppet, Chef — pushing config to 10K hosts without breaking things |
| 03 | [Monitoring & Alerting](03-MONITORING-ALERTING.md) | Prometheus, Grafana, PagerDuty — the observability stack at scale |
| 04 | [Incident Management](04-INCIDENT-MANAGEMENT.md) | On-call rotations, runbooks, war rooms, blameless postmortems |
| 05 | [CI/CD Pipelines](05-CICD-PIPELINES.md) | Deploying to hundreds of servers safely — canary, blue-green, progressive rollout |
| 06 | [Capacity Planning](06-CAPACITY-PLANNING.md) | Forecasting, right-sizing, auto-scaling, headroom, load testing |
| 07 | [Networking Operations](07-NETWORKING-OPS.md) | DNS, load balancers, CDN, service mesh, VPN — the network plumbing |
| 08 | [Security Operations](08-SECURITY-OPS.md) | Patching 5K servers, compliance scanning, hardening, secrets rotation |
| 09 | [Cost Optimization](09-COST-OPTIMIZATION.md) | FinOps, reserved instances, spot fleets, rightsizing, tagging strategy |
| 10 | [Disaster Recovery](10-DISASTER-RECOVERY.md) | Backups, failover, chaos engineering, RTO/RPO, multi-region |
| 11 | [SRE Practices](11-SRE-PRACTICES.md) | SLOs, error budgets, toil reduction, production readiness reviews |

---

## The Operations Mental Model

```
                        ┌─────────────────────────┐
                        │   BUSINESS REQUIREMENTS  │
                        │  "99.99% uptime, <200ms  │
                        │   latency, $X/month"     │
                        └────────────┬────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
     ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
     │   PROVISION     │    │    DEPLOY       │    │    OBSERVE      │
     │                │    │                │    │                │
     │ Terraform      │    │ CI/CD Pipeline │    │ Metrics        │
     │ Auto-scaling   │    │ Canary/B-G     │    │ Logs           │
     │ Golden images  │    │ Feature flags  │    │ Traces         │
     │ Config mgmt    │    │ Rollback       │    │ Alerts         │
     └───────┬────────┘    └───────┬────────┘    └───────┬────────┘
             │                     │                     │
             └──────────────────────┼──────────────────────┘
                                    ▼
                        ┌─────────────────────────┐
                        │      FEEDBACK LOOP       │
                        │                         │
                        │  Incidents → Postmortems │
                        │  Metrics  → Capacity     │
                        │  Costs    → Optimization  │
                        │  Toil     → Automation    │
                        └─────────────────────────┘
```

---

## Scale Reference Points

Throughout this series, we reference these operational scales:

| Scale | Hosts | Typical Org | Ops Challenges |
|-------|-------|-------------|----------------|
| **Small** | 10–50 | Startup | Manual is OK, but don't start bad habits |
| **Medium** | 50–500 | Growth-stage | Automation mandatory, on-call begins |
| **Large** | 500–5,000 | Mid-size company | Fleet management, dedicated SRE team |
| **Massive** | 5,000–100K+ | Big tech / Hyperscaler | Custom tooling, regional ops, dedicated platform teams |

**Key insight:** The practices in this series apply at every scale. The difference is that at small scale you can get away without them. At large scale, you cannot survive without them.
