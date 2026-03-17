# Round 3: Domain Knowledge Assessment - System Design

## Format
- **Duration**: 1 hour on HackerRank
- **Style**: Open-ended system design discussion with interviewer
- **Tools**: HackerRank's drawing/text environment
- **Focus**: Architecture, trade-offs, scalability at ShopBack's scale

## The 4-Step Framework

### Step 1: Requirements Clarification (5-8 min)
- **Functional requirements**: What does the system do?
- **Non-functional requirements**: Scale, latency, availability, consistency
- **Constraints**: Budget, team size, existing infrastructure
- **Out of scope**: What are we NOT building?

### Step 2: High-Level Design (10-15 min)
- Draw the architecture diagram
- Identify core components and their interactions
- Define API contracts
- Choose data storage strategy

### Step 3: Deep Dive (20-25 min)
- Detail the most critical component
- Discuss data model and schema
- Address scaling bottlenecks
- Handle failure modes

### Step 4: Trade-offs & Extensions (5-10 min)
- Discuss alternatives you considered
- What would change at 10x scale?
- Monitoring and observability
- Future improvements

---

## Reported System Design Questions

### 1. "Design frontend and backend for effective deployment"
This is about **CI/CD and deployment architecture**. See framework below.

### 2. "Given a design on a whiteboard, critique and improve it"
Tests your ability to evaluate existing systems. Practice finding:
- Single points of failure
- Bottlenecks
- Missing caching layers
- Inadequate error handling
- Security gaps

### 3. "Handle stuck messages in a message queue"
This is a **real operational problem** at ShopBack. Key solutions:
- Dead letter queues (DLQ)
- Message TTL and retry policies
- Circuit breakers
- Monitoring and alerting
- Manual replay mechanisms

### 4. "Design a session-based authentication system"
Covers auth fundamentals. Consider:
- Session storage (Redis, database)
- Token vs session trade-offs
- Cross-domain auth for 13 markets
- Session invalidation strategies

---

## Most Likely Domain Questions for ShopBack

Given ShopBack's business, prepare these system designs:

| Priority | Topic | Why Likely | Guide |
|----------|-------|------------|-------|
| **P0** | Cashback Tracking System | Core business | [04-CASHBACK-TRACKING-SYSTEM.md](04-CASHBACK-TRACKING-SYSTEM.md) |
| **P0** | Deals/Promotion Platform | Major revenue driver | [05-DEALS-PROMOTION-SYSTEM.md](05-DEALS-PROMOTION-SYSTEM.md) |
| **P1** | Multi-Tenant Architecture | Active engineering initiative | [06-MULTI-TENANT-ARCHITECTURE.md](06-MULTI-TENANT-ARCHITECTURE.md) |
| **P1** | Notification System | User engagement | See system-design/05-NOTIFICATION-SYSTEM.md |
| **P2** | Event-Driven Architecture | Core infra pattern | Below |
| **P2** | API Gateway & Rate Limiting | Cross-cutting concern | See system-design/02-RATE-LIMITER.md |

---

## Quick Reference: Event-Driven Architecture

ShopBack uses event-driven architecture heavily. Be ready to discuss:

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐
│ Click   │────→│ Event Bus    │────→│ Attribution  │
│ Service │     │ (Kafka/SQS)  │     │ Service      │
└─────────┘     └──────┬───────┘     └──────────────┘
                       │
                ┌──────┴───────┐
                │              │
         ┌──────┴──┐    ┌─────┴──────┐
         │Analytics│    │Notification│
         │Service  │    │Service     │
         └─────────┘    └────────────┘
```

### Key Concepts
- **Event Sourcing**: Store events as the source of truth, derive state
- **CQRS**: Separate read and write models for different scaling needs
- **Saga Pattern**: Coordinate multi-service transactions (click → purchase → cashback)
- **Dead Letter Queue**: Handle failed event processing
- **Idempotency**: Ensure duplicate events don't cause double cashback

---

## Quick Reference: Deployment & CI/CD Design

Since this was reported as a question:

```
┌──────────┐    ┌────────┐    ┌───────────┐    ┌───────────┐
│ Git Push │───→│ CI/CD  │───→│  Canary   │───→│  Full     │
│          │    │Pipeline│    │  Deploy   │    │  Rollout  │
└──────────┘    └────────┘    └───────────┘    └───────────┘
                    │              │
                    ▼              ▼
               ┌────────┐    ┌───────────┐
               │ Tests  │    │ Metrics   │
               │ Lint   │    │ Monitoring│
               │ Build  │    │ Alerts    │
               └────────┘    └───────────┘
```

### ShopBack-Relevant Points
- **Multi-region deployment**: 5 AWS regions, 13 markets
- **Canary strategy**: Route 1-5% traffic to new version, monitor errors
- **Feature flags**: Enable features per market without redeployment
- **Rollback**: Automated rollback on error rate spike
- **Blue/green**: Zero-downtime deployments for critical services

---

## Numbers to Know

### ShopBack Scale
| Metric | Value | Implication |
|--------|-------|-------------|
| DAU | ~5-10M (estimated from 55M total) | High read throughput |
| Daily transactions | 500K+ | ~6 TPS average, ~100+ TPS peak |
| Merchants | 20,000+ | Large catalog, frequent updates |
| Markets | 13 | Multi-region, multi-currency |
| Click-to-purchase ratio | ~2-5% (industry avg) | 10M+ clicks/day |

### Industry Benchmarks
| Metric | Target |
|--------|--------|
| Page load time | < 2 seconds |
| API latency (p99) | < 200ms |
| Availability | 99.9% (8.7h downtime/year) |
| Cashback attribution accuracy | > 99.5% |
| Notification delivery | < 5 seconds |

---

## Communication Tips for System Design

1. **Start with requirements** - Don't jump to architecture
2. **Draw as you talk** - Visual communication is key
3. **State assumptions** - "I'm assuming we need to handle 500K transactions/day"
4. **Discuss trade-offs** - "We could use X or Y. X is better for consistency, Y for latency"
5. **Reference ShopBack** - "Given ShopBack's multi-market model, I'd consider..."
6. **Be honest** - If you don't know something, say so and reason through it
7. **Think about failure** - "What happens when this service goes down?"
