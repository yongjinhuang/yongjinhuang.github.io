# Infrastructure Abstraction

A comprehensive guide to infrastructure abstraction -- hiding complexity behind simple
interfaces to enable developer self-service. Covers Crossplane, GitOps, Kubernetes operators,
Terraform, Pulumi, and Internal Developer Portal tools.

---

## Table of Contents

1. [Why Abstract Infrastructure](#1-why-abstract-infrastructure)
2. [Crossplane](#2-crossplane)
3. [GitOps (ArgoCD & Flux)](#3-gitops-argocd--flux)
4. [Kubernetes Operators](#4-kubernetes-operators)
5. [Terraform as Platform Building Blocks](#5-terraform-as-platform-building-blocks)
6. [Pulumi](#6-pulumi)
7. [IaC Tools Comparison](#7-iac-tools-comparison)
8. [Internal Developer Portal Tools](#8-internal-developer-portal-tools)
9. [Common Interview Questions](#9-common-interview-questions)
10. [Quick Reference](#10-quick-reference)

---

## 1. Why Abstract Infrastructure

```
WITHOUT ABSTRACTION                WITH ABSTRACTION

Developer writes:                  Developer writes:
  200-line Terraform               ┌──────────────────┐
  50-line Helm chart               │ kind: Database    │
  30-line ArgoCD app               │ spec:             │
  20-line service account          │   engine: postgres│
  15-line network policy           │   size: medium    │
  ─────────────────                │   backup: daily   │
  315 lines of infra code          └──────────────────┘
                                   10 lines. Platform handles the rest.
```

**Benefits:**
- **Cognitive load reduction**: Developers focus on business logic
- **Consistency**: Same infra patterns across all teams
- **Governance**: Security and compliance built into abstractions
- **Speed**: Minutes instead of days to provision infrastructure

---

## 2. Crossplane

Kubernetes-native infrastructure-as-code using the Kubernetes API.

### Architecture

```
┌──────────────────────────────────────────────────┐
│              CROSSPLANE ON KUBERNETES             │
│                                                   │
│  Developer submits Claim:                         │
│  ┌──────────────────┐                             │
│  │ kind: DBClaim     │                             │
│  │ spec:             │                             │
│  │   engine: postgres│                             │
│  │   size: medium    │                             │
│  └────────┬─────────┘                             │
│           │                                        │
│           ▼                                        │
│  ┌──────────────────┐    ┌──────────────────────┐ │
│  │   Composition    │    │   XRD (schema)       │ │
│  │ (how to build)   │    │ (what devs can ask)  │ │
│  └────────┬─────────┘    └──────────────────────┘ │
│           │                                        │
│           ▼                                        │
│  ┌──────────────────┐                             │
│  │  Provider-AWS    │  Manages actual cloud        │
│  │  (or GCP, Azure) │  resources via APIs          │
│  └──────────────────┘                             │
│           │                                        │
│           ▼                                        │
│  ┌──────────────────┐                             │
│  │  AWS RDS Instance│  Actual cloud resource       │
│  │  + VPC + SG      │                             │
│  └──────────────────┘                             │
└──────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Provider** | Plugin for a cloud/service (AWS, GCP, Azure, Helm, K8s) |
| **Managed Resource** | 1:1 mapping to a cloud resource (RDS, S3, etc.) |
| **Composition** | Template combining multiple managed resources |
| **XRD** | Schema defining what developers can request |
| **Claim** | Developer's simplified request for infrastructure |

### Claim Example

```yaml
# What the developer writes (simple)
apiVersion: database.example.com/v1alpha1
kind: PostgreSQLClaim
metadata:
  name: my-app-db
spec:
  parameters:
    storageGB: 20
    version: "15"
```

The Composition (written by the platform team) expands this into RDS instance + security group + subnet group + parameter group + IAM role.

### Crossplane vs Terraform

| Aspect | Crossplane | Terraform |
|--------|-----------|-----------|
| **Execution** | Continuous reconciliation | One-shot apply |
| **State** | Kubernetes API (CRDs) | State file |
| **Drift Detection** | Automatic, continuous | Only on plan/apply |
| **Language** | YAML (K8s manifests) | HCL |
| **GitOps** | Native (K8s objects in Git) | Requires wrapper |
| **RBAC** | Kubernetes native | External |
| **Best For** | K8s-native platforms | Established DevOps workflows |

---

## 3. GitOps (ArgoCD & Flux)

### GitOps Principles

1. **Declarative**: Desired state described declaratively
2. **Versioned**: Desired state stored in Git
3. **Automated**: Changes automatically applied
4. **Reconciled**: Continuous monitoring and correction

### ArgoCD Architecture

```
┌────────────────────────────────────────────┐
│                ARGOCD                       │
│                                             │
│  ┌──────────┐   ┌───────────────────────┐  │
│  │ Git Repo │──>│ Repo Server           │  │
│  │ (desired │   │ (fetch + render       │  │
│  │  state)  │   │  manifests)           │  │
│  └──────────┘   └───────────┬───────────┘  │
│                             │               │
│                             ▼               │
│                 ┌───────────────────────┐   │
│                 │ Application Controller│   │
│                 │ (compare desired vs   │   │
│                 │  actual, sync)        │   │
│                 └───────────┬───────────┘   │
│                             │               │
│                             ▼               │
│                 ┌───────────────────────┐   │
│                 │ Kubernetes Cluster    │   │
│                 │ (actual state)        │   │
│                 └───────────────────────┘   │
│                                             │
│  ┌──────────┐                               │
│  │ API/UI   │  Dashboard + CLI               │
│  └──────────┘                               │
└────────────────────────────────────────────┘
```

### Crossplane + ArgoCD Pattern

```
Git Repo                ArgoCD              Crossplane           Cloud
┌──────┐     sync      ┌──────┐   apply    ┌──────┐  provision ┌──────┐
│YAML  │────────────>│ Argo │──────────>│Cross │──────────>│ AWS  │
│files │              │ CD   │           │plane │           │ RDS  │
└──────┘              └──────┘           └──────┘           └──────┘

One Git repo defines, deploys, and maintains everything.
Crossplane resources are K8s manifests -- ArgoCD syncs them natively.
```

### Flux

Alternative GitOps controller, lighter-weight than ArgoCD. Tight integration with
Helm, Kustomize, and Crossplane. Good for teams wanting minimal operator overhead.

---

## 4. Kubernetes Operators

### Controller Pattern

```
┌──────────────────────────────────────┐
│       RECONCILIATION LOOP            │
│                                       │
│  1. Watch: Observe resource changes   │
│  2. Diff: Compare desired vs actual   │
│  3. Act: Make changes to converge     │
│  4. Update: Report status             │
│  5. Repeat                            │
└──────────────────────────────────────┘
```

Operators extend Kubernetes with **Custom Resource Definitions (CRDs)** and controllers
that encode operational knowledge. Examples: PostgreSQL Operator, Redis Operator, Prometheus Operator.

### When to Build Custom Operators

- Complex Day-2 operations (backup, scaling, upgrades)
- Domain-specific automation
- Self-service provisioning with custom business logic
- When Crossplane Compositions aren't flexible enough

---

## 5. Terraform as Platform Building Blocks

### Module Strategy

```
modules/
├── networking/          # VPC, subnets, security groups
│   └── main.tf
├── database/            # RDS with standard config
│   └── main.tf
├── service/             # ECS/K8s service template
│   └── main.tf
└── monitoring/          # CloudWatch/Datadog setup
    └── main.tf

teams/
├── team-alpha/          # Uses modules with team-specific vars
│   └── main.tf
└── team-beta/
    └── main.tf
```

### Terraform Workspaces

Separate state per environment:

```bash
terraform workspace new staging
terraform workspace new production
terraform apply -var-file=staging.tfvars
```

---

## 6. Pulumi

Infrastructure as **real code** (TypeScript, Python, Go, C#, Java).

```typescript
import * as aws from "@pulumi/aws";

// Create RDS instance with full programming language
const db = new aws.rds.Instance("my-db", {
    engine: "postgres",
    engineVersion: "15",
    instanceClass: "db.t3.medium",
    allocatedStorage: 20,
    dbName: "myapp",
    masterUsername: "admin",
    masterPassword: secret.apply(s => s.value),
    skipFinalSnapshot: true,
    tags: {
        Environment: pulumi.getStack(),
        Team: "platform",
    },
});

export const endpoint = db.endpoint;
```

**When to choose Pulumi**: Strong engineering team, need loops/conditionals/testing, existing language expertise, complex dynamic infrastructure.

---

## 7. IaC Tools Comparison

| Aspect | Terraform | Crossplane | Pulumi |
|--------|-----------|-----------|--------|
| **Language** | HCL | YAML (K8s) | TypeScript/Python/Go |
| **Execution** | One-shot CLI | Continuous reconciliation | One-shot CLI |
| **State** | State file | Kubernetes API | State backend |
| **Drift** | On plan/apply | Automatic | On plan/apply |
| **RBAC** | External | Kubernetes native | External |
| **Testing** | Terratest | K8s testing tools | Native unit tests |
| **GitOps** | Requires wrapper | Native | Requires wrapper |
| **Learning Curve** | Moderate | Steep (needs K8s) | Moderate |
| **Ecosystem** | Largest (5000+ providers) | Growing | Large |
| **Best For** | General IaC | K8s-native platforms | Complex dynamic infra |
| **Adoption** | 71% | Growing | Growing |

---

## 8. Internal Developer Portal Tools

| Tool | Type | Setup | Pricing | Customization | Best For |
|------|------|-------|---------|---------------|----------|
| **Backstage** | Open-source | Months, 3-15 FTEs | Free + eng cost | Maximum | Large orgs, unique needs |
| **Port** | SaaS | Weeks | Free-$30/user/mo | High (no-code) | Quick ROI, flexibility |
| **Cortex** | SaaS | ~6 months | ~$65/user/mo | Moderate | Standards enforcement |
| **OpsLevel** | SaaS | 30-45 days | ~$39/user/mo | Limited | Fast service governance |
| **Humanitec** | Orchestrator | Varies | Contact sales | Backend API | Pair with portal UI |

### Decision Framework

- **Build** (Backstage): Maximum control, unique requirements, dedicated platform team
- **Buy** (Port/Cortex/OpsLevel): Faster time-to-value, less engineering investment
- **Hybrid** (Managed Backstage -- Roadie): Open-source benefits without maintenance burden

---

## 9. Common Interview Questions

**Q: What is Crossplane and how does it differ from Terraform?**
Crossplane manages infrastructure as Kubernetes CRDs with continuous reconciliation. Terraform uses HCL with one-shot apply. Crossplane: automatic drift correction, native K8s RBAC, GitOps-friendly. Terraform: larger ecosystem, simpler for non-K8s teams.

**Q: Explain the GitOps pattern.**
Desired state stored in Git. A controller (ArgoCD/Flux) continuously watches the repo, compares desired vs actual state in the cluster, and automatically reconciles differences. Benefits: audit trail, rollback via git revert, declarative, automated.

**Q: How would you design self-service database provisioning?**
Platform team creates a Crossplane Composition for databases. Developers submit a simple Claim (10 lines of YAML). ArgoCD syncs the Claim from Git to the cluster. Crossplane provisions RDS with all security, networking, and monitoring pre-configured. Developer gets a connection string back.

**Q: Compare Backstage with commercial portal tools.**
Backstage: open-source, maximum customization, CNCF-backed, but needs 3-15 FTEs to maintain. Port: SaaS, no-code, quick setup, flexible. Cortex: focused on standards/scorecards. OpsLevel: fastest time-to-value for service governance. Choice depends on team size, budget, and customization needs.

---

## 10. Quick Reference

### IaC Tool Selection

| Situation | Recommended Tool |
|-----------|-----------------|
| General IaC, established team | Terraform |
| Kubernetes-native platform | Crossplane |
| Complex dynamic infrastructure | Pulumi |
| Existing K8s + GitOps | Crossplane + ArgoCD |
| Multi-cloud, wide provider needs | Terraform |
