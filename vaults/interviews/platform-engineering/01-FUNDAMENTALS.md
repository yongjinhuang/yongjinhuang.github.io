# Platform Engineering Fundamentals

Platform engineering is the discipline of designing and building toolchains and workflows that enable software engineering organizations to be self-serving. It represents a shift from ticket-driven operations to product-oriented internal platforms that abstract away infrastructure complexity and reduce the cognitive load on development teams. This guide covers the foundational concepts, history, frameworks, and interview preparation for platform engineering roles.

---

## Table of Contents

1. [What Is Platform Engineering](#1-what-is-platform-engineering)
2. [History and Evolution](#2-history-and-evolution)
3. [Internal Developer Platforms (IDPs)](#3-internal-developer-platforms-idps)
4. [Platform-as-Product Mindset](#4-platform-as-product-mindset)
5. [Team Topologies](#5-team-topologies)
6. [Cognitive Load Theory Applied to Platforms](#6-cognitive-load-theory-applied-to-platforms)
7. [Thinnest Viable Platform](#7-thinnest-viable-platform)
8. [Platform Engineering vs DevOps vs SRE](#8-platform-engineering-vs-devops-vs-sre)
9. [CNCF Platform Engineering Maturity Model](#9-cncf-platform-engineering-maturity-model)
10. [Common Interview Questions](#10-common-interview-questions)
11. [Quick Reference](#11-quick-reference)

---

## 1. What Is Platform Engineering

Platform engineering is the practice of building and maintaining an integrated product — the Internal Developer Platform (IDP) — that provides self-service capabilities to software development teams. The goal is to reduce the friction developers face when shipping code to production.

### Core Principles

- **Self-service**: Developers can provision infrastructure, deploy services, and manage environments without filing tickets or waiting for ops teams.
- **Abstraction**: Complex infrastructure details are hidden behind simple, well-documented interfaces.
- **Automation**: Repetitive tasks are automated, freeing engineers to focus on business logic.
- **Standardization**: Consistent patterns and templates ensure reliability and security across the organization.
- **Product thinking**: The platform is treated as a product with internal users (developers) whose needs are continuously discovered and addressed.

### Why Platform Engineering Matters

```
Without Platform Engineering:
+----------+    ticket    +----------+    ticket    +----------+
|Developer | ----------> |   Ops    | ----------> |  Infra   |
|  Team    | <---------- |  Team    | <---------- |  Team    |
+----------+   wait 3d   +----------+   wait 5d   +----------+

With Platform Engineering:
+----------+  self-serve  +-------------------+
|Developer | ----------> | Internal Developer |
|  Team    | <---------- |    Platform (IDP)  |
+----------+   minutes   +-------------------+
                              |       |
                         +----+       +----+
                         | K8s |     | CI/CD|
                         +-----+     +------+
```

### Key Outcomes

| Metric | Before Platform | After Platform |
|--------|----------------|----------------|
| Time to provision environment | Days to weeks | Minutes |
| Onboarding new developer | 2-4 weeks | 1-3 days |
| Deployment frequency | Monthly | Multiple per day |
| Cognitive load on devs | High (must know infra) | Low (abstracted) |
| Compliance adherence | Manual, inconsistent | Automated, built-in |

---

## 2. History and Evolution

### The Journey from Ops to Platform Engineering

```
Timeline of Evolution:

2000s          2010s            2015s           2020s+
+--------+    +-----------+    +----------+    +------------------+
| Manual |    |  DevOps   |    |   SRE    |    |    Platform      |
|  Ops   | -> | Movement  | -> | Practice | -> |   Engineering    |
+--------+    +-----------+    +----------+    +------------------+
  Silos       "You build it,   Reliability     Self-service +
  Tickets      you run it"     Engineering     Product thinking
  Waterfall   CI/CD adoption   SLOs/SLIs       Developer portals
```

### Phase 1: Traditional Operations (Pre-2009)

- Separate development and operations teams
- Ticket-based workflows for infrastructure changes
- Long release cycles (months to quarters)
- Manual server provisioning and configuration

### Phase 2: DevOps Movement (2009-2015)

- Patrick Debois coins "DevOps" at DevOpsDays (2009)
- "You build it, you run it" philosophy
- Rise of CI/CD, Infrastructure as Code
- Tools: Jenkins, Chef, Puppet, Ansible
- Problem: cognitive overload — developers needed to know too many tools

### Phase 3: SRE Practice (2015-2020)

- Google publishes the SRE book (2016)
- Focus on reliability: SLOs, SLIs, error budgets
- Dedicated reliability engineering teams
- Tools: Prometheus, Grafana, PagerDuty
- Problem: SRE teams became bottlenecks

### Phase 4: Platform Engineering (2020+)

- Gartner predicts 80% of engineering orgs will have platform teams by 2026
- CNCF forms the Platform Working Group
- Focus on developer experience and self-service
- Tools: Backstage, Crossplane, ArgoCD, Port
- Platform teams treat developers as customers

### Key Catalysts

1. **Kubernetes complexity**: K8s solved orchestration but created a steep learning curve
2. **Microservices explosion**: More services meant more infrastructure to manage
3. **DevOps fatigue**: "You build it, you run it" led to developer burnout
4. **Cloud-native ecosystem growth**: Too many tools for any single developer to master

---

## 3. Internal Developer Platforms (IDPs)

An Internal Developer Platform (IDP) is the sum of all the technology and tools that a platform engineering team binds together to pave golden paths for developers. It covers the full lifecycle of an application.

### IDP Reference Architecture

```
+------------------------------------------------------------------+
|                    Developer Portal (UI Layer)                     |
|  (Backstage, Port, Cortex, OpsLevel)                             |
+------------------------------------------------------------------+
|                    Integration & Delivery                         |
|  CI/CD Pipelines | GitOps | Image Registry | Artifact Store      |
+------------------------------------------------------------------+
|                    Security & Compliance                          |
|  Policy Engine | Secret Management | RBAC | Scanning             |
+------------------------------------------------------------------+
|                    Observability                                  |
|  Metrics | Logs | Traces | Dashboards | Alerting                 |
+------------------------------------------------------------------+
|                    Infrastructure Orchestration                   |
|  Kubernetes | Crossplane | Terraform | Cloud APIs                |
+------------------------------------------------------------------+
|                    Infrastructure                                 |
|  AWS / GCP / Azure / On-Prem                                     |
+------------------------------------------------------------------+
```

### Five Core Components of an IDP

#### 1. Application Configuration Management
- Manages app configs across environments
- Tools: Helm, Kustomize, CUE, Jsonnet
- Separates config from code

#### 2. Infrastructure Orchestration
- Provisions and manages infrastructure resources
- Tools: Crossplane, Terraform, Pulumi
- Dynamic environment creation

#### 3. Environment Management
- Manages dev, staging, production environments
- Namespace isolation, resource quotas
- Environment parity

#### 4. Deployment Management
- CI/CD pipelines and GitOps workflows
- Tools: ArgoCD, Flux, GitHub Actions, Tekton
- Progressive delivery (canary, blue-green)

#### 5. Role-Based Access Control
- Fine-grained permissions
- Integration with identity providers
- Audit trails and compliance

### IDP Maturity Levels

```
Level 0: Ad Hoc
  - Tribal knowledge
  - Manual processes
  - No standardization

Level 1: Managed
  - Basic CI/CD pipelines
  - Some automation scripts
  - Wikis for documentation

Level 2: Defined
  - Standardized templates
  - Self-service for common tasks
  - Developer portal in place

Level 3: Optimized
  - Full self-service
  - Golden paths for all common workflows
  - Metrics-driven platform improvement

Level 4: Strategic
  - Platform as competitive advantage
  - AI-assisted operations
  - Predictive scaling and optimization
```

---

## 4. Platform-as-Product Mindset

Treating the platform as a product rather than a project is the defining characteristic of successful platform engineering.

### Product vs Project Thinking

| Aspect | Project Thinking | Product Thinking |
|--------|-----------------|-----------------|
| Lifecycle | Finite (start/end) | Continuous evolution |
| Success metric | On-time delivery | User adoption & satisfaction |
| Users | Stakeholders approve | Developers use daily |
| Feedback | Post-project review | Continuous user research |
| Funding | Budget per project | Ongoing investment |
| Team | Disbanded after delivery | Persistent, product-oriented |

### The Platform Product Canvas

```
+-------------------+-------------------+-------------------+
|   USER SEGMENTS   |  VALUE PROPOSITION |    CHANNELS      |
| - Backend devs    | - Faster deploys  | - Developer      |
| - Frontend devs   | - Less ops burden |   portal         |
| - Data engineers  | - Built-in        | - CLI tool       |
| - ML engineers    |   compliance      | - Slack bot      |
+-------------------+-------------------+-------------------+
|               KEY METRICS             |    COST STRUCTURE  |
| - Adoption rate                       | - Platform team   |
| - Time to first deploy               |   headcount       |
| - Developer NPS                       | - Infrastructure  |
| - Support ticket volume               |   costs           |
+-------------------+-------------------+-------------------+
```

### Product Management Practices for Platforms

1. **User Research**: Regular interviews with developer teams
2. **Roadmap**: Public roadmap visible to all engineering teams
3. **Feedback Loops**: Built-in feedback mechanisms (surveys, NPS, usage analytics)
4. **Prioritization**: Use frameworks like RICE to prioritize features
5. **Communication**: Regular "state of the platform" updates
6. **Documentation**: Treat docs as a first-class product feature

### Anti-Patterns to Avoid

- **Build It and They Will Come**: Building features nobody asked for
- **Mandate Adoption**: Forcing teams to use the platform without proving value
- **One Size Fits All**: Ignoring that different teams have different needs
- **Infrastructure Team Rebrand**: Renaming an ops team without changing the approach

---

## 5. Team Topologies

Team Topologies, introduced by Matthew Skelton and Manuel Pais, provides a framework for organizing teams to optimize for fast flow of change. It is foundational to platform engineering.

### Four Fundamental Team Types

```
+------------------------------------------------------+
|                                                      |
|  Stream-Aligned Team                                 |
|  (aligned to a single flow of work)                  |
|                                                      |
|    +----+  +----+  +----+  +----+                    |
|    |Dev1|  |Dev2|  |QA  |  |UX  |                    |
|    +----+  +----+  +----+  +----+                    |
|                                                      |
+------------------------------------------------------+
        |                    |
        | X-as-a-Service     | Facilitating
        |                    |
+----------------+    +-----------------+
| Platform Team  |    | Enabling Team   |
| (provides      |    | (helps stream   |
|  self-service  |    |  teams adopt    |
|  capabilities) |    |  new practices) |
+----------------+    +-----------------+
        |
+------------------------------------------------------+
| Complicated-Subsystem Team                            |
| (manages complex domain requiring specialist skills)  |
| e.g., ML model, video codec, financial engine         |
+------------------------------------------------------+
```

### 1. Stream-Aligned Teams

- Aligned to a single, valuable stream of work (product feature, user journey, business domain)
- Has end-to-end ownership of their services
- Can independently build, test, deploy, and operate
- Should not need to wait on other teams for most work
- Represents the primary team type (most teams should be stream-aligned)

### 2. Platform Teams

- Provide internal services to reduce cognitive load on stream-aligned teams
- Work on self-service APIs, tools, and documentation
- Treat stream-aligned teams as their customers
- Should provide a "thinnest viable platform" (see Section 7)
- Measured by adoption and developer satisfaction, not by features shipped

### 3. Enabling Teams

- Help stream-aligned teams adopt new technologies or practices
- Provide coaching, guidance, and temporary hands-on help
- Examples: DevOps enablement, SRE coaching, cloud migration assistance
- Should work themselves out of a job — their goal is knowledge transfer

### 4. Complicated-Subsystem Teams

- Own a subsystem that requires deep specialist knowledge
- Examples: video processing engine, ML inference pipeline, financial calculation engine
- Reduce cognitive load by encapsulating complexity behind clear APIs
- Should be rare — only when the subsystem truly demands specialization

### Three Interaction Modes

| Mode | Description | Example |
|------|------------|---------|
| **Collaboration** | Two teams work closely together for a defined period | Platform + stream team building a new feature |
| **X-as-a-Service** | One team provides a service, the other consumes it | Platform provides CI/CD, stream team uses it |
| **Facilitating** | One team helps another learn or adopt something new | Enabling team teaching stream team about K8s |

### Applying Team Topologies to Platform Engineering

```
Stream-Aligned Teams (Product Teams)
    |
    | consume self-service capabilities
    |
Platform Team
    |
    |-- Developer Portal (Backstage)
    |-- CI/CD Pipelines (standardized)
    |-- Infrastructure Templates (Crossplane)
    |-- Observability Stack (Grafana/Prometheus)
    |-- Security Tooling (policy-as-code)
    |
    | facilitated by
    |
Enabling Team (Cloud Enablement)
    |-- Helps teams migrate to K8s
    |-- Trains on new deployment patterns
    |-- Shares best practices
```

---

## 6. Cognitive Load Theory Applied to Platforms

Cognitive load theory, originally from educational psychology, explains why platform engineering matters: developers have limited cognitive capacity, and platform teams should minimize the extraneous load developers face.

### Three Types of Cognitive Load

```
+--------------------------------------------+
|          Total Cognitive Capacity           |
|  +--------------------------------------+  |
|  |  Intrinsic Load                      |  |
|  |  (Inherent complexity of the task)   |  |
|  |  - Business logic                    |  |
|  |  - Algorithm design                  |  |
|  |  - Data modeling                     |  |
|  +--------------------------------------+  |
|  +--------------------------------------+  |
|  |  Extraneous Load                     |  |
|  |  (Unnecessary complexity)            |  |
|  |  - Infrastructure provisioning       |  |
|  |  - Build system configuration        |  |
|  |  - Deployment pipeline setup         |  |
|  |  - Monitoring setup                  |  |
|  +--------------------------------------+  |
|  +--------------------------------------+  |
|  |  Germane Load                        |  |
|  |  (Learning and growth)              |  |
|  |  - New frameworks                    |  |
|  |  - Domain knowledge                  |  |
|  |  - Architecture patterns             |  |
|  +--------------------------------------+  |
+--------------------------------------------+
```

### Platform Engineering's Impact on Cognitive Load

| Load Type | Without Platform | With Platform |
|-----------|-----------------|---------------|
| Intrinsic | Same (business logic) | Same (business logic) |
| Extraneous | High: must manage infra, CI/CD, monitoring | Low: abstracted by platform |
| Germane | Limited: no capacity to learn | Higher: freed-up capacity for growth |

### Strategies to Reduce Cognitive Load

1. **Abstract infrastructure**: Developers declare what they need, not how to provision it
2. **Standardize tools**: Fewer tools means less context switching
3. **Golden paths**: Pre-built, tested, documented paths for common tasks
4. **Self-service**: No waiting means no mental overhead of tracking tickets
5. **Good documentation**: Reduce the need for tribal knowledge
6. **Sensible defaults**: 80% of cases should work with zero configuration

### Measuring Cognitive Load

- Developer surveys (Likert scale questions about complexity)
- Time-to-first-deploy for new team members
- Number of tools a developer must interact with
- Frequency of "how do I..." questions in Slack

---

## 7. Thinnest Viable Platform

The concept of the Thinnest Viable Platform (TVP) comes from Team Topologies. It suggests that a platform should be the smallest set of APIs, documentation, and tools that accelerates delivery by stream-aligned teams.

### What TVP Means

```
Thinnest Viable Platform Spectrum:

Too Thin                                          Too Thick
|-------|-------------|--------------|--------------|
Wiki    Templates +   Self-service   Full PaaS     Custom
only    best          portal +       with every     cloud
        practices     core services  integration    OS

        <--- Start here, iterate --->
```

### TVP Could Be Just Documentation

At its simplest, a platform can be a wiki page that says:
- "Use AWS EKS for container workloads"
- "Use GitHub Actions for CI/CD"
- "Use Datadog for monitoring"
- "Here are the Terraform modules to get started"

This is still a platform. It reduces cognitive load by removing decision fatigue.

### Building the TVP Incrementally

```
Phase 1 (Month 1-3):
  - Document current best practices
  - Standardize CI/CD pipeline templates
  - Create starter project templates

Phase 2 (Month 4-6):
  - Build a basic developer portal
  - Add self-service environment provisioning
  - Integrate monitoring dashboards

Phase 3 (Month 7-12):
  - Add service catalog
  - Implement golden paths
  - Self-service database provisioning
  - Automated security scanning

Phase 4 (Year 2+):
  - Advanced self-service capabilities
  - Cost management and optimization
  - AI-assisted operations
  - Cross-team collaboration features
```

### Key Principle: Iterate Based on Feedback

```yaml
# Platform Backlog Prioritization
platform_backlog:
  - feature: "Standardized CI/CD templates"
    requested_by: 12 teams
    impact: high
    effort: medium
    priority: P0

  - feature: "Self-service database provisioning"
    requested_by: 8 teams
    impact: high
    effort: high
    priority: P1

  - feature: "Custom Kubernetes dashboard"
    requested_by: 1 team
    impact: low
    effort: high
    priority: P3  # Do not build yet
```

---

## 8. Platform Engineering vs DevOps vs SRE

These three disciplines are complementary, not competitive. Understanding their differences and overlaps is essential for interviews.

### Comparison Table

| Dimension | DevOps | SRE | Platform Engineering |
|-----------|--------|-----|---------------------|
| **Origin** | Patrick Debois, 2009 | Google, 2003 (published 2016) | Evolution of both, ~2020 |
| **Primary goal** | Break down silos between dev and ops | Ensure system reliability | Enable developer self-service |
| **Focus** | Culture + automation | Reliability + engineering | Developer experience + product |
| **Key artifact** | CI/CD pipeline | SLOs / error budgets | Internal Developer Platform |
| **Team structure** | Embedded in teams or center of excellence | Dedicated SRE team | Dedicated platform team |
| **Success metric** | Deployment frequency, lead time | Availability, latency, error budget | Developer satisfaction, adoption |
| **Relationship with devs** | "You build it, you run it" | Shared responsibility with error budgets | "We build the platform, you build on it" |
| **Scaling approach** | Embed DevOps engineers in every team | SRE team engages top-N critical services | Platform scales through self-service tools |

### How They Work Together

```
+----------------------------------------------------------+
|                                                          |
|   DevOps Culture                                         |
|   (shared responsibility, automation, CI/CD)             |
|                                                          |
|   +----------------------+  +-------------------------+  |
|   |  SRE Practices       |  |  Platform Engineering   |  |
|   |  - SLOs/SLIs         |  |  - Developer portal     |  |
|   |  - Error budgets     |  |  - Golden paths         |  |
|   |  - Incident mgmt     |  |  - Self-service infra   |  |
|   |  - Reliability       |  |  - Service templates    |  |
|   |  - Toil reduction    |  |  - Standardization     |  |
|   +----------------------+  +-------------------------+  |
|              |                         |                  |
|              +--- overlap: both -------+                  |
|                   reduce toil and                        |
|                   improve reliability                    |
|                                                          |
+----------------------------------------------------------+
```

### When to Choose What

- **DevOps**: You need to transform culture and break down silos
- **SRE**: You need to improve reliability of critical systems
- **Platform Engineering**: You need to scale DevOps/SRE practices across the organization through self-service tooling

### The Evolution Narrative

```
"DevOps said: everyone should care about operations.
 SRE said: let's apply software engineering to operations.
 Platform Engineering said: let's build a product that
 makes operations invisible to developers."
```

---

## 9. CNCF Platform Engineering Maturity Model

The CNCF published a platform engineering maturity model to help organizations assess and improve their platform capabilities.

### Maturity Dimensions

The model evaluates platforms across several dimensions:

#### 1. Investment

| Level | Description |
|-------|-------------|
| Provisional | Voluntary, unfunded effort by individual contributors |
| Operational | Dedicated team with allocated budget |
| Scalable | Organization-wide investment with clear ROI |
| Optimizing | Strategic initiative with executive sponsorship |

#### 2. Adoption

| Level | Description |
|-------|-------------|
| Provisional | Few early adopters, mostly platform team members |
| Operational | Multiple teams using the platform regularly |
| Scalable | Most teams use the platform; it is the default |
| Optimizing | Platform is integral to engineering culture |

#### 3. Interfaces

| Level | Description |
|-------|-------------|
| Provisional | CLI scripts, wikis, manual processes |
| Operational | Basic web portal, templated pipelines |
| Scalable | Full self-service portal with integrated workflows |
| Optimizing | AI-assisted, context-aware developer experience |

#### 4. Operations

| Level | Description |
|-------|-------------|
| Provisional | Manual operations, reactive firefighting |
| Operational | Basic monitoring, some automation |
| Scalable | Full observability, automated incident response |
| Optimizing | Predictive operations, self-healing systems |

#### 5. Measurement

| Level | Description |
|-------|-------------|
| Provisional | No metrics collected |
| Operational | Basic usage metrics |
| Scalable | Comprehensive KPIs (DORA, developer satisfaction) |
| Optimizing | Data-driven decision making, continuous improvement |

### Assessment Framework

```yaml
# Platform Maturity Assessment Example
assessment:
  organization: "Acme Corp"
  date: "2024-Q4"
  dimensions:
    investment:
      current: "Operational"
      target: "Scalable"
      gap_actions:
        - "Secure executive sponsorship"
        - "Define ROI metrics"
    adoption:
      current: "Operational"
      target: "Scalable"
      gap_actions:
        - "Onboard remaining 15 teams"
        - "Deprecate legacy provisioning"
    interfaces:
      current: "Provisional"
      target: "Operational"
      gap_actions:
        - "Deploy Backstage developer portal"
        - "Build self-service templates"
    operations:
      current: "Operational"
      target: "Scalable"
      gap_actions:
        - "Implement full observability stack"
        - "Automate incident response"
    measurement:
      current: "Provisional"
      target: "Operational"
      gap_actions:
        - "Implement DORA metrics tracking"
        - "Run first developer satisfaction survey"
```

---

## 10. Common Interview Questions

### Conceptual Questions

**Q: What is platform engineering and why has it become important?**
A: Platform engineering is the discipline of building and maintaining an Internal Developer Platform that provides self-service capabilities to development teams. It became important because DevOps "you build it, you run it" created cognitive overload as cloud-native ecosystems grew more complex. Developers were spending too much time on infrastructure tasks rather than building business features.

**Q: How does platform engineering differ from just having an infrastructure team?**
A: An infrastructure team typically operates reactively through tickets. A platform engineering team builds a self-service product with developer experience at its center. The difference is product thinking: user research, roadmaps, adoption metrics, and continuous iteration based on developer feedback.

**Q: Explain the concept of cognitive load in the context of platforms.**
A: Cognitive load in platform engineering refers to the mental effort developers must spend on tasks outside their core domain. Platforms reduce extraneous cognitive load (infrastructure, tooling, compliance) so developers can focus their intrinsic cognitive load (business logic) and have capacity for germane load (learning and growth).

**Q: What is the Thinnest Viable Platform?**
A: The TVP is the minimum set of tools, APIs, and documentation that meaningfully accelerates delivery by stream-aligned teams. It could start as simple as a wiki with agreed standards and evolve into a full self-service portal. The key is starting small and iterating based on real user needs.

### Architecture Questions

**Q: Describe the components of an Internal Developer Platform.**
A: An IDP typically includes five layers: (1) Application Configuration Management for managing app configs, (2) Infrastructure Orchestration for provisioning resources, (3) Environment Management for dev/staging/prod, (4) Deployment Management for CI/CD and GitOps, and (5) Role-Based Access Control for permissions. These are exposed through a developer portal as the user-facing layer.

**Q: How would you design a platform for an organization with 50 development teams?**
A: Start with user research across representative teams. Identify the highest-pain-point workflows. Build a TVP addressing those first — likely standardized CI/CD templates and a service catalog. Deploy a developer portal (Backstage) for discoverability. Create golden paths for the top 2-3 languages/frameworks. Measure adoption and iterate. Staff a platform team of 5-8 engineers with a product manager.

### Scenario Questions

**Q: A team wants to use a tool not supported by your platform. How do you handle it?**
A: First, understand why — is it a legitimate need or a preference? If it serves a real need not met by the platform, work with the team to evaluate integration. If it is already covered by a platform offering, share the golden path and its benefits. Never mandate — show value. If the request is common, consider adding it to the platform roadmap.

**Q: How would you measure the success of a platform engineering initiative?**
A: Use a combination of quantitative and qualitative metrics: adoption rate (% of teams using the platform), time-to-production for new services, DORA metrics (deployment frequency, lead time, MTTR, change failure rate), developer satisfaction surveys (NPS), support ticket volume reduction, and onboarding time for new developers.

**Q: Your platform has low adoption after 6 months. What do you do?**
A: Diagnose the root cause: (1) Talk to non-adopting teams about their blockers, (2) Check if the platform solves real problems they have, (3) Evaluate if the UX is too complex, (4) Look for competing internal tools or scripts, (5) Consider whether leadership is supporting the initiative. Then iterate: simplify the onboarding experience, build features that address the most common pain points, find champion teams and publicize their success stories.

---

## 11. Quick Reference

### Key Definitions

| Term | Definition |
|------|-----------|
| **IDP** | Internal Developer Platform — the product built by platform teams |
| **TVP** | Thinnest Viable Platform — the minimum valuable platform |
| **Golden Path** | A pre-built, tested, supported workflow for common tasks |
| **Stream-Aligned Team** | A team aligned to a flow of business value |
| **Platform Team** | A team that builds and maintains the IDP |
| **Cognitive Load** | Mental effort required to perform a task |
| **DORA Metrics** | Deployment frequency, lead time, MTTR, change failure rate |
| **Developer Portal** | The UI layer of a platform (e.g., Backstage) |

### Key People and Publications

| Person/Publication | Contribution |
|-------------------|-------------|
| Matthew Skelton & Manuel Pais | Team Topologies (2019) |
| Gregor Hohpe | Platform Strategy |
| Evan Bottcher | "What I Talk About When I Talk About Platforms" |
| CNCF Platform Working Group | Platform maturity model, white papers |
| Gartner | Platform Engineering as top strategic trend (2023) |
| Camille Fournier | Engineering management and platform team structure |

### Recommended Resources

- Book: "Team Topologies" by Skelton & Pais
- Book: "Platform Strategy" by Gregor Hohpe
- CNCF Platform White Paper: https://tag-app-delivery.cncf.io/whitepapers/platforms/
- PlatformEngineering.org community
- PlatformCon (annual conference)

### Mental Model for Interviews

```
Platform Engineering = Product Thinking + Infrastructure Automation
                     + Developer Experience + Self-Service

Key Narrative:
1. DevOps created shared responsibility -> good
2. Cognitive load on devs became unsustainable -> problem
3. Platform teams build self-service products -> solution
4. Developers stay focused on business logic -> outcome
```
