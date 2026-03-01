# Microservices vs Monolith

## Overview

Every full-stack engineer will face the question: "Should this be a monolith or microservices?" The answer is never absolute -- it depends on team size, product maturity, deployment requirements, and organizational structure. Interviewers ask about this topic because it reveals whether you can think beyond code and reason about system architecture, team dynamics, and operational complexity. Getting the architecture wrong is expensive: premature microservices add crippling complexity, and an overgrown monolith becomes unmaintainable.

This guide covers when to use each approach, service boundaries and bounded contexts, communication patterns, API gateways, service discovery, distributed transactions, data consistency, the database question, migration strategies, and the modular monolith as a middle ground.

---

## Core Concepts

### 1. The Monolith

A monolith is a single deployable unit containing all application logic. All code runs in one process, shares one database, and is deployed together.

**Advantages:**

- **Simple development:** One codebase, one IDE, one build
- **Simple deployment:** Deploy one artifact
- **Simple testing:** End-to-end tests run against one service
- **No network overhead:** Function calls, not HTTP calls
- **Strong consistency:** One database, ACID transactions
- **Easier debugging:** One process, one log stream, no distributed tracing needed

**Disadvantages:**

- **Scaling is all-or-nothing:** Cannot scale the checkout service independently of the search service
- **Deployment coupling:** A change to one module requires redeploying everything
- **Technology lock-in:** The entire application uses one language, one framework, one database
- **Team coupling:** Multiple teams working on the same codebase leads to merge conflicts and coordination overhead
- **Failure blast radius:** A memory leak in one module crashes the entire application

### 2. Microservices

Microservices decompose the application into independently deployable services, each owning a specific business capability and its own data.

**Advantages:**

- **Independent deployment:** Deploy the payments service without touching the user service
- **Independent scaling:** Scale the search service to 20 instances while keeping the admin service at 2
- **Technology flexibility:** Each service can use the best language/framework for its task
- **Team autonomy:** Each team owns their services end-to-end
- **Fault isolation:** A crashed service does not take down the entire system (if resilience patterns are in place)

**Disadvantages:**

- **Operational complexity:** Dozens of services to deploy, monitor, and debug
- **Distributed system problems:** Network failures, partial failures, eventual consistency
- **Data consistency:** No cross-service ACID transactions
- **Debugging difficulty:** A bug might span 5 services; requires distributed tracing
- **Infrastructure overhead:** Service discovery, API gateway, container orchestration, CI/CD per service
- **Latency:** Network calls are orders of magnitude slower than function calls

### 3. Service Boundaries and Bounded Contexts

The hardest part of microservices is deciding where to draw the boundaries. Domain-Driven Design (DDD) provides the concept of **bounded contexts** -- areas of the domain where a particular model applies.

**Guidelines for good service boundaries:**

- **Business capability alignment:** Each service maps to a business function (orders, payments, inventory, shipping)
- **Data ownership:** Each service owns its data and is the single source of truth for it
- **Loose coupling:** Services should be able to change independently. If changing service A always requires changing service B, the boundary is wrong.
- **High cohesion:** Related functionality belongs together. If two operations always need each other, they should be in the same service.
- **Team ownership:** One team should own each service. Conway's Law applies: system architecture mirrors organizational structure.

**Bad boundaries:**

- Splitting by technical layer (a "database service," a "validation service") -- these create tight coupling
- Too small ("nano-services") -- the overhead outweighs the benefits
- Splitting too early -- you do not understand the domain well enough yet

### 4. Communication Patterns

Services need to talk to each other. There are two fundamental approaches.

**Synchronous (Request/Response):**

| Protocol | When to Use | Trade-offs |
|----------|-------------|------------|
| **REST/HTTP** | Standard CRUD operations, broad compatibility | Simple, well-understood; couples caller to callee |
| **gRPC** | Internal service-to-service, performance-critical | Strongly typed (protobuf), efficient binary protocol; harder to debug |
| **GraphQL** | API gateway to frontend, flexible queries | Client gets exactly the data it needs; complex server implementation |

**Asynchronous (Event-Driven):**

| Pattern | When to Use | Trade-offs |
|---------|-------------|------------|
| **Message Queue** (RabbitMQ, SQS) | Task dispatch, work distribution | Decoupled, reliable delivery; more complex to reason about |
| **Event Streaming** (Kafka) | Event sourcing, real-time data pipelines | High throughput, replay capability; operational complexity |
| **Pub/Sub** (SNS, Redis Pub/Sub) | Notifications, broadcasting | Simple fan-out; no persistence (except Kafka) |

**When to use synchronous:**
- The caller needs the result immediately to proceed
- Simple request/response patterns
- Low latency requirement

**When to use asynchronous:**
- The caller does not need an immediate result
- Multiple services need to react to the same event
- You need to buffer work during traffic spikes
- You want temporal decoupling (services do not need to be online simultaneously)

### 5. API Gateway

An API gateway sits between clients and backend services, providing a single entry point.

**Responsibilities:**

- **Routing:** Direct requests to the correct service
- **Authentication:** Verify tokens before forwarding requests
- **Rate limiting:** Protect backend services from abuse
- **Load balancing:** Distribute traffic across service instances
- **Protocol translation:** REST to gRPC, WebSocket management
- **Response aggregation:** Combine responses from multiple services into one

**Popular options:** Kong, AWS API Gateway, Nginx, Envoy, Traefik

**BFF (Backend for Frontend):** A pattern where each frontend (web, mobile, TV) gets its own gateway that aggregates and transforms data specifically for that client. This prevents the mobile app from over-fetching data designed for the web UI.

### 6. Service Discovery

In a dynamic environment (containers, auto-scaling), services need to find each other without hardcoded addresses.

**Two approaches:**

- **Client-side discovery:** The client queries a service registry (Consul, Eureka) to get the address of an available instance, then connects directly.
- **Server-side discovery:** The client sends requests to a load balancer (AWS ALB, Kubernetes Service), which queries the registry and forwards the request.

In Kubernetes, service discovery is built in. Each service gets a DNS name (`order-service.default.svc.cluster.local`) that resolves to healthy pod IPs.

### 7. Distributed Transactions

In a monolith, you can wrap multiple operations in a single database transaction. In microservices, each service has its own database, so you cannot use a single transaction.

**The Saga Pattern:**

A saga is a sequence of local transactions. Each service performs its transaction and publishes an event. If a step fails, compensating transactions are executed to undo previous steps.

**Two saga coordination styles:**

| Style | How It Works | When to Use |
|-------|-------------|-------------|
| **Choreography** | Each service listens for events and decides what to do next | Simple flows, few services |
| **Orchestration** | A central orchestrator tells each service what to do and when | Complex flows, many steps, easier to understand |

**Example: Order Placement Saga (Orchestration)**

```
1. OrderService: Create order (PENDING)
2. PaymentService: Reserve payment → success
3. InventoryService: Reserve items → success
4. ShippingService: Create shipment → success
5. OrderService: Update order (CONFIRMED)

If step 3 fails (item out of stock):
3a. PaymentService: Release payment (compensating transaction)
3b. OrderService: Update order (CANCELLED)
```

**Two-Phase Commit (2PC):**

A distributed transaction protocol where a coordinator asks all participants to prepare, then asks them all to commit. Provides strong consistency but has serious drawbacks:

- Blocking: participants hold locks until the coordinator decides
- Single point of failure: if the coordinator crashes, participants are stuck
- Performance: network round trips add latency

2PC is rarely used across microservices. It is more common within a single database cluster (for example, across shards).

### 8. Data Consistency

**Strong consistency** (as in a monolith) means all readers see the latest write immediately. **Eventual consistency** (common in microservices) means readers will eventually see the latest write, but there is a lag.

**Strategies for handling eventual consistency:**

- **Communicate through events:** When the Order service creates an order, it publishes an event. The Inventory service consumes it and updates its data.
- **Idempotent operations:** Design all consumers to handle duplicate events safely. Use idempotency keys.
- **Read-your-own-writes:** After a write, read from the same service (not a replica or cache) to ensure the user sees their own change immediately.
- **Compensating transactions:** If you discover an inconsistency later, fix it with a compensating action.

### 9. Database Per Service vs Shared Database

| Approach | Pros | Cons |
|----------|------|------|
| **Database per service** | Full autonomy, independent scaling, technology choice per service | No cross-service joins, eventual consistency, data duplication |
| **Shared database** | Simple queries, strong consistency, no data duplication | Tight coupling, schema changes affect all services, scaling bottleneck |

**Recommendation:** For true microservices, use database-per-service. A shared database defeats the purpose of independent deployment -- schema changes become coordination nightmares.

**Data duplication is acceptable** in microservices. The Shipping service can maintain its own copy of the customer's address. It receives updates via events from the Customer service.

### 10. The Modular Monolith

A modular monolith is a single deployable unit with strict internal boundaries between modules. Each module:

- Has its own directory/namespace
- Owns its own database tables (no cross-module table access)
- Communicates with other modules through defined interfaces (not direct database queries)
- Can be extracted into a separate service later if needed

**Why it matters:**

The modular monolith gives you most of the organizational benefits of microservices (clear boundaries, team ownership, independent development) without the operational complexity (distributed systems, network failures, eventual consistency).

It is the recommended starting point for most new projects. Extract services only when you have a clear, proven need (different scaling requirements, different deployment cadence, different technology needs).

### 11. Migration: Monolith to Microservices

**The Strangler Fig Pattern:**

Named after a vine that gradually envelops a tree, this pattern lets you incrementally extract services from a monolith:

1. Identify a bounded context to extract (start with the least coupled one)
2. Build the new service alongside the monolith
3. Route traffic for that capability to the new service (via API gateway or proxy)
4. Migrate data from the monolith's database to the new service's database
5. Remove the old code from the monolith
6. Repeat for the next bounded context

**Anti-corruption layer:** When the new service and the monolith need to communicate, use a translation layer that maps between the old and new data models. This prevents the new service from being contaminated by the monolith's legacy design.

---

## Practical Scenarios

### Scenario 1: Startup Building an MVP

**Context:** 3 engineers, no product-market fit yet, rapid iteration needed.

**Recommendation:** Monolith (specifically, a modular monolith).

**Reasoning:**
- Team is too small for the operational overhead of microservices
- Requirements are changing rapidly; you do not know the domain boundaries yet
- Deployment simplicity lets you iterate faster
- You can extract services later once you understand the domain

### Scenario 2: E-Commerce Platform at Scale

**Context:** 50 engineers, 10 million daily users, different features scale differently.

**Recommendation:** Microservices, extracted from the original monolith.

**Reasoning:**
- Search needs to scale independently (heavy read load)
- Checkout and payments need independent deployment (high reliability requirements, PCI compliance)
- Recommendations benefit from a different technology stack (ML models, Python)
- Multiple teams need autonomous deployment cycles
- Different services have different availability requirements

**Service decomposition:**

```
Product Catalog Service  -- owns products, categories, search index
User Service             -- owns accounts, profiles, preferences
Cart Service             -- owns shopping carts (likely Redis-backed)
Order Service            -- owns order lifecycle, saga orchestrator
Payment Service          -- owns payment processing (PCI scope isolated)
Inventory Service        -- owns stock levels, reservations
Shipping Service         -- owns shipment tracking, carrier integration
Notification Service     -- owns email, SMS, push notifications
Recommendation Service   -- owns ML models, personalization
```

### Scenario 3: Real-Time Feature in a Monolith

**Context:** Existing monolith needs a real-time chat feature. The rest of the application is request/response.

**Recommendation:** Extract chat as a separate service.

**Reasoning:**
- Chat requires persistent WebSocket connections (different runtime characteristics)
- Chat needs to scale independently based on concurrent users
- Chat technology stack differs (WebSocket server, Redis Pub/Sub for presence)
- The rest of the monolith can remain as-is

This is a good example of extracting a single service for a clear technical reason, not a dogmatic decision to "go microservices."

### Scenario 4: Deciding Between Sync and Async Communication

**Context:** When an order is placed, the inventory needs to be reserved and a confirmation email needs to be sent.

**Analysis:**

```
Inventory reservation → Synchronous
  - The order cannot be confirmed without reserved inventory
  - The user needs to know immediately if items are available
  - Failure means the order should not proceed

Confirmation email → Asynchronous
  - The user does not need to wait for the email to be sent
  - Email delivery can be retried if it fails
  - A 2-second email delay is acceptable
  - Email service downtime should not block order placement
```

---

## Interview Questions

### Question 1: When would you choose microservices over a monolith?

**Answer:**

I would choose microservices when the organization and system have outgrown a monolith in specific, measurable ways:

1. **Team scale:** When multiple teams (4+) need to deploy independently. If teams are stepping on each other with merge conflicts and deployment coordination, service boundaries help.

2. **Differential scaling:** When parts of the system have dramatically different resource needs. If search handles 100x the traffic of admin, scaling them independently saves infrastructure cost.

3. **Technology diversity:** When a specific capability genuinely benefits from a different technology stack. ML recommendations in Python while the rest is in Node.js.

4. **Deployment independence:** When a bug in one feature should not prevent deploying another. If the payments team needs a hotfix, they should not have to wait for the product team's unfinished feature.

5. **Fault isolation:** When the blast radius of a failure must be contained. A bug in recommendations should not crash the checkout flow.

I would NOT choose microservices for a startup, a small team, or an application where the domain boundaries are not well understood yet. The operational overhead is significant and not justified until the problems above are real, not hypothetical.

### Question 2: Explain the Saga pattern. When would you use it?

**Answer:**

A saga is a pattern for managing distributed transactions across multiple services. Instead of one ACID transaction spanning multiple databases (which is not possible across services), a saga breaks the transaction into a sequence of local transactions, each within a single service.

Each step either succeeds and triggers the next step, or fails and triggers compensating transactions to undo previous steps.

**Two styles:**

- **Choreography:** Each service publishes events and reacts to events from other services. No central coordinator. Works well for simple flows (2-3 services) but becomes hard to trace and debug as complexity grows.

- **Orchestration:** A central saga orchestrator (often a state machine) directs each service. It knows the sequence, handles failures, and triggers compensations. Easier to understand and debug but introduces a single point of coordination.

**When to use it:** Whenever a business operation spans multiple services that each own their own data. Common examples: order placement (order + payment + inventory + shipping), account creation with external integrations, booking workflows.

**Key requirement:** Every step must have a compensating action. If "charge credit card" is a step, "refund credit card" is the compensation. If the compensation is impossible or expensive, consider whether the boundary is drawn correctly.

### Question 3: What is the modular monolith and why is it gaining popularity?

**Answer:**

A modular monolith is a single deployable application organized into well-defined modules with strict boundaries. Each module owns its data, exposes a public API to other modules, and does not access other modules' internals (no direct database queries across module boundaries).

It is gaining popularity because teams realized that microservices solve organizational problems (team independence) but introduce enormous technical problems (distributed systems). A modular monolith provides the organizational benefits -- clear ownership, defined interfaces, independent development -- without the distributed systems tax.

**Key principles:**

1. Each module has its own directory structure and namespace
2. Modules communicate through defined interfaces (function calls, not HTTP)
3. Each module manages its own database tables (enforced by convention or tooling)
4. No module reaches into another module's database or internal classes
5. Modules can be extracted into services later by replacing function calls with HTTP/gRPC calls

The modular monolith is the recommended starting architecture for most new projects. You can always extract services later when you have evidence that you need them. Going the other direction -- merging microservices back into a monolith -- is much harder.

### Question 4: How do you handle data consistency across microservices?

**Answer:**

You accept eventual consistency and design around it. Cross-service ACID transactions are not practical.

**Strategies:**

1. **Event-driven updates:** When service A changes data, it publishes an event. Service B consumes the event and updates its own data. There is a lag (milliseconds to seconds), but eventually all services converge.

2. **Idempotent consumers:** Events may be delivered more than once (at-least-once delivery). Every consumer must handle duplicates safely, typically by using an idempotency key and checking if the event was already processed.

3. **Outbox pattern:** To avoid the dual-write problem (writing to the database and publishing an event as two separate operations that could partially fail), write the event to an "outbox" table in the same database transaction as the data change. A separate process polls the outbox and publishes events to the message broker.

4. **Sagas for multi-step operations:** When a business operation spans services, use the saga pattern with compensating transactions.

5. **Read your own writes:** After a user performs a write, read the response from the source service (not from a cache or replica) so the user sees their own change immediately, even if other services have not caught up yet.

6. **Eventual consistency in the UI:** Design the frontend to handle temporary inconsistencies gracefully. Show optimistic updates with loading indicators.

### Question 5: What is the Strangler Fig pattern and how would you use it to break apart a monolith?

**Answer:**

The Strangler Fig pattern is an incremental approach to migrating from a monolith to microservices. Named after the strangler fig vine that grows around a host tree and eventually replaces it.

**Steps:**

1. **Identify a candidate:** Choose a bounded context that is well-defined and relatively decoupled from the rest of the monolith. Good first candidates: notifications, search, reporting.

2. **Build the new service:** Implement the functionality in a new, independent service with its own database and deployment pipeline.

3. **Route traffic:** Place an API gateway or reverse proxy in front of the monolith. Route requests for the extracted capability to the new service. All other traffic continues to the monolith.

4. **Migrate data:** Move the relevant data from the monolith's database to the new service's database. Use an anti-corruption layer to translate between old and new data models during the transition.

5. **Remove dead code:** Once the new service is handling all traffic and the data is migrated, remove the old code from the monolith.

6. **Repeat:** Choose the next bounded context and repeat.

**Key principles:**
- Never rewrite from scratch ("big bang" rewrites almost always fail)
- Run old and new in parallel during migration
- Use feature flags to gradually shift traffic
- Each extraction should deliver incremental value, not just architectural purity

### Question 6: How would you design inter-service communication for an order processing system?

**Answer:**

For an order processing system, I would use a mix of synchronous and asynchronous communication based on the requirement of each interaction:

**Synchronous (API calls):**

- Cart Service to Product Catalog: Get current prices (needs latest data)
- Order Service to Payment Service: Process payment (order flow cannot proceed without result)
- Order Service to Inventory Service: Reserve items (must confirm availability before accepting the order)

**Asynchronous (events/messages):**

- Order confirmed event: Published by Order Service, consumed by:
  - Notification Service (send confirmation email)
  - Analytics Service (track conversion)
  - Shipping Service (prepare shipment)
- Payment completed event: Published by Payment Service
- Shipment dispatched event: Published by Shipping Service, consumed by:
  - Notification Service (send tracking info)
  - Order Service (update order status)

**Why this split:**

The synchronous calls are on the critical path -- the user is waiting and needs an immediate answer. The asynchronous events are fire-and-forget from the producer's perspective. If the notification service is down, the order should still succeed; the email will be sent when the service recovers.

I would use an orchestrated saga for the order placement flow (the critical path) and choreography-based events for the non-critical downstream updates.

### Question 7: What are the operational challenges of microservices and how do you address them?

**Answer:**

**Challenges and solutions:**

1. **Observability:** With 20+ services, you cannot SSH into a box and read logs. Solution: centralized logging (ELK/Loki), distributed tracing (Jaeger/Tempo), metrics (Prometheus/Grafana), and correlation IDs propagated across all services.

2. **Deployment complexity:** Each service needs its own CI/CD pipeline, container image, and deployment configuration. Solution: standardized templates (Helm charts, Terraform modules), platform team that provides golden paths.

3. **Network reliability:** Network calls fail. Solution: retries with exponential backoff, circuit breakers, timeouts, bulkheads, graceful degradation.

4. **Configuration management:** Each service has its own configuration. Solution: centralized config (Consul, AWS Parameter Store), environment-specific overrides.

5. **Testing:** End-to-end tests are slow and flaky across services. Solution: contract testing (Pact), consumer-driven contracts, service virtualization for integration tests.

6. **Local development:** Running 20 services on a laptop is impractical. Solution: run only the service under development locally, use stubs or a shared dev environment for dependencies. Docker Compose for small subsets.

7. **Security:** Each service is a potential attack surface. Solution: mTLS between services (service mesh), authentication/authorization at the gateway, least-privilege IAM roles.

---

## Code Examples

### Example 1: Saga Orchestrator

```typescript
// sagas/order-saga.ts
interface SagaStep {
  name: string;
  execute: (context: SagaContext) => Promise<void>;
  compensate: (context: SagaContext) => Promise<void>;
}

interface SagaContext {
  orderId: string;
  userId: string;
  items: OrderItem[];
  paymentId?: string;
  reservationId?: string;
  shipmentId?: string;
}

class SagaOrchestrator {
  private steps: SagaStep[] = [];
  private completedSteps: SagaStep[] = [];

  addStep(step: SagaStep): SagaOrchestrator {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), {
      ...this,
      steps: [...this.steps, step],
      completedSteps: [...this.completedSteps],
    });
  }

  async execute(context: SagaContext): Promise<SagaContext> {
    const completed: SagaStep[] = [];

    for (const step of this.steps) {
      try {
        await step.execute(context);
        completed.push(step);
      } catch (error) {
        // Compensate in reverse order
        for (const completedStep of [...completed].reverse()) {
          try {
            await completedStep.compensate(context);
          } catch (compensateError) {
            // Log compensation failure for manual intervention
            console.error(`Compensation failed for ${completedStep.name}:`, compensateError);
          }
        }
        throw new SagaError(`Saga failed at step: ${step.name}`, error, completed.map(s => s.name));
      }
    }

    return context;
  }
}

// Define the order placement saga
const orderSaga = new SagaOrchestrator()
  .addStep({
    name: 'reservePayment',
    execute: async (ctx) => {
      const result = await paymentService.reserve(ctx.userId, ctx.items);
      ctx.paymentId = result.paymentId;
    },
    compensate: async (ctx) => {
      if (ctx.paymentId) {
        await paymentService.releaseReservation(ctx.paymentId);
      }
    },
  })
  .addStep({
    name: 'reserveInventory',
    execute: async (ctx) => {
      const result = await inventoryService.reserve(ctx.items);
      ctx.reservationId = result.reservationId;
    },
    compensate: async (ctx) => {
      if (ctx.reservationId) {
        await inventoryService.releaseReservation(ctx.reservationId);
      }
    },
  })
  .addStep({
    name: 'createShipment',
    execute: async (ctx) => {
      const result = await shippingService.createShipment(ctx.orderId, ctx.items);
      ctx.shipmentId = result.shipmentId;
    },
    compensate: async (ctx) => {
      if (ctx.shipmentId) {
        await shippingService.cancelShipment(ctx.shipmentId);
      }
    },
  })
  .addStep({
    name: 'confirmPayment',
    execute: async (ctx) => {
      await paymentService.capture(ctx.paymentId);
    },
    compensate: async (ctx) => {
      await paymentService.refund(ctx.paymentId);
    },
  });

// Usage
async function placeOrder(userId: string, items: OrderItem[]) {
  const orderId = generateOrderId();
  const context: SagaContext = { orderId, userId, items };

  try {
    await orderSaga.execute(context);
    await orderRepository.updateStatus(orderId, 'CONFIRMED');
    return { orderId, status: 'CONFIRMED' };
  } catch (error) {
    await orderRepository.updateStatus(orderId, 'FAILED');
    throw error;
  }
}
```

### Example 2: Outbox Pattern

```typescript
// outbox/outbox-publisher.ts
// Ensures atomicity between database writes and event publishing

interface OutboxMessage {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  publishedAt: Date | null;
}

// Step 1: Write data and outbox message in the same transaction
async function createOrderWithEvent(order: CreateOrderInput): Promise<Order> {
  return db.transaction(async (tx) => {
    // Write the order
    const newOrder = await tx.orders.create({
      userId: order.userId,
      items: order.items,
      status: 'PENDING',
      totalAmount: order.totalAmount,
    });

    // Write the event to the outbox table (same transaction)
    await tx.outbox.create({
      id: randomUUID(),
      aggregateType: 'Order',
      aggregateId: newOrder.id,
      eventType: 'OrderCreated',
      payload: {
        orderId: newOrder.id,
        userId: order.userId,
        items: order.items,
        totalAmount: order.totalAmount,
      },
      createdAt: new Date(),
      publishedAt: null,
    });

    return newOrder;
  });
}

// Step 2: Separate process polls outbox and publishes to message broker
async function processOutbox() {
  const unpublished = await db.outbox.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  for (const message of unpublished) {
    try {
      await messageBroker.publish(message.eventType, {
        id: message.id,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        payload: message.payload,
        timestamp: message.createdAt.toISOString(),
      });

      await db.outbox.update({
        where: { id: message.id },
        data: { publishedAt: new Date() },
      });
    } catch (error) {
      console.error(`Failed to publish outbox message ${message.id}:`, error);
      // Will be retried on next poll
    }
  }
}
```

### Example 3: Circuit Breaker

```typescript
// resilience/circuit-breaker.ts
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;    // Failures before opening
  recoveryTimeout: number;     // Milliseconds before trying again
  successThreshold: number;    // Successes in half-open before closing
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.options.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure() {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Usage
const paymentCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  successThreshold: 3,
});

async function processPayment(paymentData: PaymentInput) {
  try {
    return await paymentCircuitBreaker.execute(() =>
      paymentGateway.charge(paymentData)
    );
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Fallback: queue for later processing
      await paymentQueue.add(paymentData);
      return { status: 'QUEUED', message: 'Payment will be processed shortly' };
    }
    throw error;
  }
}
```

### Example 4: API Gateway Routing (Express-based BFF)

```typescript
// gateway/routes.ts
import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = Router();

// Route to backend services
const serviceRoutes = {
  '/api/users': process.env.USER_SERVICE_URL,
  '/api/products': process.env.PRODUCT_SERVICE_URL,
  '/api/orders': process.env.ORDER_SERVICE_URL,
  '/api/payments': process.env.PAYMENT_SERVICE_URL,
};

for (const [path, target] of Object.entries(serviceRoutes)) {
  router.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^${path}`]: '' },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${path}:`, err.message);
        res.status(502).json({ error: 'Service temporarily unavailable' });
      },
    })
  );
}

// Aggregated endpoint: combine data from multiple services
router.get('/api/dashboard', async (req, res) => {
  try {
    const [user, recentOrders, recommendations] = await Promise.allSettled([
      fetch(`${process.env.USER_SERVICE_URL}/profile`, {
        headers: { Authorization: req.headers.authorization },
      }).then(r => r.json()),

      fetch(`${process.env.ORDER_SERVICE_URL}/recent?limit=5`, {
        headers: { Authorization: req.headers.authorization },
      }).then(r => r.json()),

      fetch(`${process.env.RECOMMENDATION_SERVICE_URL}/for-user`, {
        headers: { Authorization: req.headers.authorization },
      }).then(r => r.json()),
    ]);

    res.json({
      user: user.status === 'fulfilled' ? user.value : null,
      recentOrders: recentOrders.status === 'fulfilled' ? recentOrders.value : [],
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : [],
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
```

### Example 5: Modular Monolith Structure

```
src/
├── modules/
│   ├── orders/
│   │   ├── index.ts              # Public API (exported functions)
│   │   ├── order.model.ts        # Database model
│   │   ├── order.service.ts      # Business logic
│   │   ├── order.repository.ts   # Data access
│   │   ├── order.routes.ts       # HTTP routes
│   │   └── order.events.ts       # Events this module publishes/consumes
│   ├── payments/
│   │   ├── index.ts
│   │   ├── payment.model.ts
│   │   ├── payment.service.ts
│   │   ├── payment.repository.ts
│   │   ├── payment.routes.ts
│   │   └── payment.events.ts
│   ├── inventory/
│   │   ├── index.ts
│   │   └── ...
│   └── users/
│       ├── index.ts
│       └── ...
├── shared/
│   ├── event-bus.ts              # In-process event bus
│   ├── database.ts               # Database connection
│   └── middleware.ts             # Shared middleware
└── app.ts                        # Compose modules
```

```typescript
// modules/orders/index.ts -- Public API
// Other modules can ONLY use functions exported from here
export { createOrder, getOrderById, getOrdersByUser } from './order.service';
export type { Order, CreateOrderInput } from './order.model';
export { OrderEvents } from './order.events';

// modules/orders/order.service.ts
// Uses the payment module's public API, not its internals
import { processPayment } from '../payments';
import { reserveItems } from '../inventory';

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const reservation = await reserveItems(input.items);
  const payment = await processPayment(input.userId, input.totalAmount);

  const order = await orderRepository.create({
    ...input,
    reservationId: reservation.id,
    paymentId: payment.id,
    status: 'CONFIRMED',
  });

  eventBus.publish(OrderEvents.CREATED, { orderId: order.id });
  return order;
}
```

---

## Quick Reference

### Decision Framework: Monolith vs Microservices

```
Start with a monolith (modular) UNLESS you have:
  ✓ Multiple teams (4+) needing independent deployment
  ✓ Parts of the system with different scaling needs
  ✓ Clear, well-understood domain boundaries
  ✓ Team with distributed systems experience
  ✓ Investment in infrastructure (CI/CD, observability, orchestration)

If you don't have ALL of the above → stay with the monolith.
```

### Communication Pattern Decision Tree

```
Does the caller need an immediate response?
  Yes → Synchronous (REST or gRPC)
    Is it internal service-to-service?
      Yes → gRPC (performance, type safety)
      No  → REST (simplicity, broad compatibility)
  No  → Asynchronous
    Do multiple consumers need the event?
      Yes → Event streaming (Kafka) or Pub/Sub
      No  → Message queue (RabbitMQ, SQS)
```

### Saga Decision: Choreography vs Orchestration

| Factor | Choreography | Orchestration |
|--------|-------------|---------------|
| Number of steps | 2-3 | 4+ |
| Complexity | Simple | Complex |
| Visibility | Hard to trace | Easy to trace |
| Coupling | Loosely coupled | Central coordinator |
| Debugging | Follow events across services | Look at orchestrator state |
| Error handling | Distributed | Centralized |

### Data Consistency Patterns

| Pattern | Use When | Trade-off |
|---------|----------|-----------|
| Event-driven updates | Data needs to propagate across services | Eventual consistency, delay |
| Outbox pattern | Need atomicity between DB write and event | Additional table, polling process |
| CQRS | Read and write patterns differ significantly | Complexity, eventual consistency on reads |
| Saga | Multi-step transaction across services | Compensating transactions required |
| 2PC | Strong consistency required (rare) | Performance, availability trade-offs |

### Key Takeaways

1. **Start with a modular monolith.** Extract services only when you have evidence you need them.
2. **Microservices are an organizational solution**, not a technical one. They solve team scaling problems.
3. **Boundaries are everything.** Wrong boundaries cause more problems than a monolith ever did.
4. **Accept eventual consistency.** Design your UI and business logic around it.
5. **Use synchronous communication for the critical path**, asynchronous for everything else.
6. **The outbox pattern solves the dual-write problem.** Use it whenever you need to write to a database and publish an event atomically.
7. **Never rewrite from scratch.** Use the Strangler Fig pattern for migrations.
8. **Conway's Law is real.** Your architecture will mirror your team structure. Design both together.
