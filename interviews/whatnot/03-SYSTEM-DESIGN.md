# Round 3: Domain Knowledge Assessment - System Design

## Format

- **Duration**: 1 hour on HackerRank
- **Style**: Open-ended system design discussion with interviewer
- **Tools**: HackerRank's drawing/text environment
- **Focus**: Architecture, trade-offs, scalability for real-time systems

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

### 1. "Design a real-time notification system for Whatnot"

Core challenge: fan-out at scale, priority management, real-time delivery.

### 2. "Trade-offs between different database technologies for high-traffic e-commerce"

Tests: understanding of SQL vs NoSQL, consistency vs availability, read/write patterns.

### 3. "How to ensure scalability and reliability in distributed systems"

Tests: load balancing, replication, circuit breakers, graceful degradation.

### 4. "Microservices vs monolith trade-offs"

Tests: deployment complexity, data consistency, team autonomy, operational overhead.

---

## Most Likely Domain Questions for Whatnot

Given Whatnot's business, prepare these system designs:

| Priority | Topic                    | Why Likely                                  | Guide                                                        |
| -------- | ------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| **P0**   | Live Auction System      | Core business — real-time bidding           | [04-LIVE-AUCTION-SYSTEM.md](04-LIVE-AUCTION-SYSTEM.md)       |
| **P0**   | Livestream Platform      | Core infrastructure — video + chat at scale | [05-LIVESTREAM-PLATFORM.md](05-LIVESTREAM-PLATFORM.md)       |
| **P1**   | Feed Ranking & Discovery | Major growth driver — recommendation engine | [06-REAL-TIME-FEED-RANKING.md](06-REAL-TIME-FEED-RANKING.md) |
| **P1**   | Notification System      | User engagement — auction alerts            | Below                                                        |
| **P2**   | Payment & Checkout       | Revenue critical — transaction processing   | Below                                                        |
| **P2**   | Admission Control        | Scalability — handling traffic surges       | Below                                                        |

---

## Quick Reference: Event-Driven Architecture

Whatnot uses Kafka as its event backbone with three key producers:

```
┌───────────┐     ┌──────────────┐     ┌──────────────┐
│   Main    │────→│              │────→│  Ranking     │
│  Backend  │     │    Kafka     │     │  Service     │
│ (Python)  │     │  Event Bus   │     │              │
└───────────┘     │              │     └──────────────┘
                  │              │
┌───────────┐     │              │     ┌──────────────┐
│   Live    │────→│              │────→│  Analytics   │
│  Service  │     │              │     │  Pipeline    │
│ (Elixir)  │     │              │     │  (Snowflake) │
└───────────┘     └──────┬───────┘     └──────────────┘
                         │
                  ┌──────┴───────┐
                  │ Notification │
                  │   Service    │
                  └──────────────┘
```

### Key Concepts for Whatnot

- **Event Sourcing**: Auction events as source of truth (bid placed, bid won, item sold)
- **CQRS**: Separate read/write models — write-heavy auction engine vs read-heavy feed
- **PubSub Topics**: Each livestream is a PubSub topic in Elixir/Phoenix
- **GenServer per Auction**: Each auction runs as an isolated Elixir process
- **Dead Letter Queue**: Handle failed event processing with retry + DLQ
- **Idempotency**: Ensure duplicate bid events don't cause double charges

---

## Quick Reference: Notification System

Relevant to Whatnot because users need alerts for:

- Auction starting (for followed sellers)
- Outbid notifications (time-critical)
- Auction won / payment required
- Livestream starting from favorite sellers
- Giveaway results

```
┌───────────┐     ┌──────────┐     ┌───────────────┐
│  Event    │────→│  Fanout  │────→│  Push (APNs/  │
│  Source   │     │  Service │     │  FCM)         │
│ (Kafka)   │     │          │────→│  In-App       │
└───────────┘     │          │────→│  Email        │
                  └──────────┘     └───────────────┘
                       │
                  ┌────┴─────┐
                  │ Priority │
                  │  Queue   │
                  │ (Redis)  │
                  └──────────┘
```

### Design Considerations

- **Priority levels**: Outbid > auction won > stream starting > marketing
- **Fan-out strategy**: Write fan-out for small groups, read fan-out for large audiences
- **Rate limiting**: Don't spam users during rapid bidding wars
- **Batching**: Group multiple outbid notifications within a time window
- **Delivery guarantees**: At-least-once for critical (payment), best-effort for social

---

## Quick Reference: Payment & Checkout

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Auction │────→│ Checkout │────→│ Payment  │────→│ Shipping │
│  Won    │     │ Service  │     │ Gateway  │     │ Service  │
└─────────┘     └──────────┘     └──────────┘     └──────────┘
                     │                │
                ┌────┴────┐     ┌────┴────┐
                │ Escrow  │     │  Fraud  │
                │ Account │     │  Check  │
                └─────────┘     └─────────┘
```

### Key Challenges

- **Rapid transactions**: Auctions end every 30-60 seconds
- **Cart bundling**: Users may win multiple items from same seller
- **Escrow model**: Hold payment until buyer confirms receipt
- **Fraud detection**: Shill bidding, fake accounts, payment fraud
- **Multi-currency**: US, UK, EU markets with different currencies

---

## Quick Reference: Admission Control

Whatnot built a dedicated service in Go for the MrBeast event:

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │────→│  Admission   │────→│  Live        │
│  (App)   │     │  Service     │     │  Service     │
│          │←────│  (Go)        │     │  (Elixir)    │
└──────────┘     └──────────────┘     └──────────────┘
                       │
                 ┌─────┴──────┐
                 │ Policies:  │
                 │ - Global   │
                 │   session  │
                 │   cap      │
                 │ - Rate     │
                 │   limit    │
                 │   joins    │
                 │ - Identity │
                 │   based    │
                 │   shedding │
                 └────────────┘
```

### Key Patterns

- **Global session cap**: Hard limit on concurrent viewers
- **Rate-limited joins**: Smooth out thundering herd on stream start
- **Deterministic load shedding**: Identity-based (consistent for same user)
- **Graceful degradation**: Reduce chat, disable non-critical features under load
- **Back-pressure**: Signal upstream services to slow down

---

## Numbers to Know

### Whatnot Scale

| Metric              | Value              | Implication                         |
| ------------------- | ------------------ | ----------------------------------- |
| GMV                 | $8B+ (2025)        | Very high transaction volume        |
| Peak concurrent     | 583K single stream | Extreme fan-out requirements        |
| Platform concurrent | 1.35M              | Multi-stream load distribution      |
| Auction duration    | 30-60 seconds      | Sub-second bid processing needed    |
| Daily engagement    | 80-95 min/user     | High real-time connection load      |
| Categories          | Hundreds           | Diverse search/recommendation needs |
| Markets             | US, UK, EU         | Multi-currency, multi-region        |

### Industry Benchmarks

| Metric                   | Target                     |
| ------------------------ | -------------------------- |
| Bid processing latency   | < 100ms                    |
| Stream latency (WebRTC)  | < 500ms                    |
| Stream latency (HLS/CDN) | < 5 seconds                |
| API latency (p99)        | < 200ms                    |
| Availability             | 99.9% (8.7h downtime/year) |
| Notification delivery    | < 2 seconds for outbid     |
| Payment processing       | < 3 seconds                |

---

## Communication Tips for System Design

1. **Start with requirements** - Don't jump to architecture
2. **Draw as you talk** - Visual communication is key
3. **State assumptions** - "I'm assuming we need to handle 583K concurrent viewers"
4. **Discuss trade-offs** - "WebRTC gives us <500ms latency but doesn't scale; HLS scales but adds 5s delay"
5. **Reference Whatnot** - "Given Whatnot's real-time auction model, consistency is critical here"
6. **Be honest** - If you don't know something, say so and reason through it
7. **Think about failure** - "What happens when the auction GenServer crashes mid-bid?"
8. **Consider the peak** - "Design for the peak, not the average" (Whatnot's own philosophy)
