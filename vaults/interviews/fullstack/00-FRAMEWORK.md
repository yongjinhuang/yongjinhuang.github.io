# Full-Stack Interview Framework

## Table of Contents - Full-Stack Interview Series

| #                                          | Topic                              | Key Areas                                 |
| ------------------------------------------ | ---------------------------------- | ----------------------------------------- |
| [00](./00-FRAMEWORK.md)                    | **Interview Framework**            | Format, strategy, preparation             |
| [01](./01-API-DESIGN.md)                   | **API Design**                     | REST, GraphQL, gRPC, versioning           |
| [02](./02-DATABASE-FUNDAMENTALS.md)        | **Database Fundamentals**          | SQL, NoSQL, optimization, ORMs            |
| [03](./03-AUTHENTICATION-AUTHORIZATION.md) | **Authentication & Authorization** | JWT, OAuth 2.0, RBAC, security            |
| [04](./04-SYSTEM-DESIGN.md)                | **System Design**                  | Architecture, scaling, trade-offs         |
| [05](./05-DEVOPS-DEPLOYMENT.md)            | **DevOps & Deployment**            | CI/CD, Docker, Kubernetes, IaC            |
| [06](./06-TESTING-STRATEGIES.md)           | **Testing Strategies**             | Unit, integration, E2E, TDD               |
| [07](./07-PERFORMANCE-OPTIMIZATION.md)     | **Performance Optimization**       | Frontend, backend, database tuning        |
| [08](./08-SECURITY.md)                     | **Security**                       | OWASP, XSS, CSRF, injection, encryption   |
| [09](./09-REAL-TIME-SYSTEMS.md)            | **Real-Time Systems**              | WebSockets, SSE, message queues           |
| [10](./10-MICROSERVICES.md)                | **Microservices**                  | Patterns, communication, observability    |
| [11](./11-FRONTEND-BACKEND-INTEGRATION.md) | **Frontend-Backend Integration**   | State management, data fetching, SSR      |
| [12](./12-BEHAVIORAL-AND-LEADERSHIP.md)    | **Behavioral & Leadership**        | Cross-functional collaboration, ownership |

---

## Overview

Full-stack engineering interviews differ fundamentally from specialist roles. You are not expected to be the deepest expert in any single domain. Instead, interviewers evaluate your ability to **think across boundaries**, reason about trade-offs between layers of the stack, and build complete, working systems.

This guide provides a framework for preparing for full-stack interviews. It covers interview formats, what distinguishes strong full-stack candidates, and how to structure your preparation to demonstrate both breadth and depth.

### Why Full-Stack Interviews Are Different

A frontend specialist might be asked to implement a complex animation system. A backend specialist might be asked to design a distributed consensus protocol. A full-stack engineer is more likely to be asked:

- "Design and build a feature that lets users upload, process, and view images."
- "Walk me through how you would add real-time notifications to this application."
- "Here is a slow page. Diagnose and fix the performance issues."

The distinguishing factor is **end-to-end thinking**. You need to demonstrate that you can:

1. Understand user requirements and translate them to technical decisions
2. Choose appropriate technologies across the stack
3. Identify where complexity lives and make principled trade-offs
4. Debug problems that span multiple layers
5. Ship complete features, not just components

### The T-Shaped Engineer

The ideal full-stack candidate has a **T-shaped** skill profile:

```
Breadth (wide bar of the T):
├── Frontend: HTML, CSS, JS frameworks, accessibility, performance
├── Backend: APIs, server architecture, middleware, caching
├── Database: Modeling, queries, indexing, migrations
├── Infrastructure: Deployment, CI/CD, monitoring, containers
└── Security: Auth, encryption, OWASP basics

Depth (vertical bar of the T):
└── One or two areas where you have deep expertise
    Examples:
    - React performance optimization and architecture
    - Database design and query optimization
    - Distributed systems and scaling patterns
    - DevOps and infrastructure automation
```

Interviewers are looking for this shape. They want to see that you can hold a conversation about any part of the stack, and that you can go deep when the problem demands it.

---

## Core Concepts

### Interview Formats

Full-stack interviews typically combine multiple formats. Understanding each format helps you prepare effectively.

#### 1. Take-Home Projects

**What to expect**: Build a small application (4-8 hours) that demonstrates full-stack capability. Common examples include a task management app, a URL shortener, or a simplified social feed.

**What interviewers evaluate**:

- Code organization and architecture decisions
- Data modeling and API design
- Error handling and edge cases
- Testing coverage
- README and documentation quality
- Git history (clean, meaningful commits)

**How to excel**:

```
DO:
├── Use a well-structured project layout
├── Write meaningful tests (not 100% coverage, but thoughtful)
├── Include a clear README with setup instructions
├── Handle errors gracefully on both frontend and backend
├── Use environment variables for configuration
├── Make atomic, descriptive commits
└── Deploy it somewhere (Vercel, Railway, etc.)

DON'T:
├── Over-engineer with unnecessary abstractions
├── Skip error handling to save time
├── Use technologies you are not comfortable discussing
├── Submit without testing the happy path end-to-end
└── Leave TODO comments or dead code
```

#### 2. Live Coding Sessions

**What to expect**: 45-90 minutes building a feature or small application with an interviewer watching. May involve a pre-built codebase you extend.

**What interviewers evaluate**:

- How you break down a problem
- Communication while coding
- Debugging approach
- Code quality under time pressure
- Ability to ask clarifying questions

**How to excel**:

```
1. Clarify requirements BEFORE writing code (2-3 minutes)
2. Outline your approach verbally (2-3 minutes)
3. Start with the data model / API contract
4. Build the simplest working version first
5. Refactor and add features incrementally
6. Talk through your decisions as you make them
```

#### 3. System Design Interviews

**What to expect**: Design a system at a high level. Full-stack system design differs from backend-only design because you need to address the entire user experience.

**What interviewers evaluate**:

- Ability to scope the problem
- Understanding of how frontend and backend interact
- Knowledge of trade-offs (consistency vs availability, latency vs throughput)
- Awareness of operational concerns (monitoring, deployment, failure modes)

**Full-stack system design template**:

```
1. Requirements Clarification (5 min)
   - Functional requirements (what the system does)
   - Non-functional requirements (scale, latency, availability)
   - Constraints (budget, team size, timeline)

2. High-Level Architecture (10 min)
   - Client layer (web, mobile, API consumers)
   - API layer (gateway, load balancer, services)
   - Data layer (databases, caches, queues)
   - External integrations

3. API Design (10 min)
   - Key endpoints
   - Request/response shapes
   - Authentication flow

4. Data Model (10 min)
   - Core entities and relationships
   - Storage technology choices
   - Indexing strategy

5. Deep Dive (15 min)
   - Pick 1-2 areas to go deep on
   - Address scaling challenges
   - Discuss failure modes and recovery

6. Frontend Architecture (5 min)
   - State management approach
   - Data fetching strategy
   - Offline/optimistic updates
   - Rendering strategy (SSR, CSR, ISR)
```

#### 4. Debugging / Troubleshooting Sessions

**What to expect**: Given a buggy application or a production incident scenario, diagnose and fix the problem.

**What interviewers evaluate**:

- Systematic debugging approach
- Ability to read unfamiliar code quickly
- Understanding of how layers interact
- Communication of findings and hypotheses

**Debugging framework**:

```
1. Reproduce the issue
2. Isolate the layer (frontend, API, database, infrastructure)
3. Form a hypothesis
4. Test the hypothesis with minimal changes
5. Fix and verify
6. Consider what monitoring/testing would have caught this
```

---

### What Interviewers Expect at Each Level

#### Junior Full-Stack (0-2 years)

```
Must demonstrate:
├── Can build CRUD applications end-to-end
├── Understands HTTP, REST basics
├── Comfortable with one frontend framework and one backend framework
├── Can write basic SQL queries
├── Understands Git workflow
└── Can debug with browser DevTools and server logs

Nice to have:
├── Testing experience
├── Deployment experience
└── Basic Docker knowledge
```

#### Mid-Level Full-Stack (2-5 years)

```
Must demonstrate:
├── Designs clean APIs with proper error handling
├── Makes informed database choices (SQL vs NoSQL)
├── Implements authentication/authorization properly
├── Writes meaningful tests
├── Understands caching strategies
├── Can optimize performance across the stack
└── Communicates trade-offs clearly

Nice to have:
├── CI/CD pipeline experience
├── System design fundamentals
├── Experience with message queues or real-time systems
└── Mentoring experience
```

#### Senior Full-Stack (5+ years)

```
Must demonstrate:
├── Leads technical design discussions
├── Makes architecture decisions with long-term thinking
├── Considers operational concerns (monitoring, alerting, on-call)
├── Designs for scale, security, and maintainability
├── Mentors and elevates team capability
├── Can navigate ambiguity and make progress without perfect information
└── Understands business context and aligns technical decisions

Nice to have:
├── Experience with distributed systems
├── Cross-team collaboration examples
├── Open-source contributions or technical writing
└── Experience building developer tools or platforms
```

---

## Practical Scenarios

### Scenario 1: "We Need This Feature by Friday"

**Context**: Product manager asks you to add a commenting system to a blog application. The existing stack is React + Node.js + PostgreSQL. You have 4 days.

**How to approach it**:

```
Day 1: Design and Data Model
- Clarify requirements (nested comments? editing? moderation?)
- Design the database schema
- Define the API endpoints
- Set up migrations

Day 2: Backend Implementation
- Build API endpoints with validation
- Add authorization (who can edit/delete?)
- Write integration tests for the API

Day 3: Frontend Implementation
- Build the comment component tree
- Implement optimistic updates
- Handle loading and error states
- Add basic form validation

Day 4: Polish and Deploy
- Manual testing of edge cases
- Add rate limiting
- Review security (XSS in comment content)
- Deploy to staging, then production
```

**What this demonstrates**: Scoping, prioritization, end-to-end execution, and shipping complete features.

### Scenario 2: "The Page Is Slow"

**Context**: Users report that the dashboard page takes 8 seconds to load. You need to diagnose and fix it.

**Systematic approach**:

```
1. Measure first
   - Browser DevTools: Network tab, Performance tab
   - Server-side: Add timing logs to the request handler
   - Database: Check query execution time

2. Common findings and fixes:

   Frontend:
   ├── Bundle too large → Code splitting, lazy loading
   ├── Too many re-renders → Memoization, state restructuring
   ├── Large images → Compression, lazy loading, CDN
   └── Blocking resources → Defer non-critical JS/CSS

   Backend:
   ├── Slow database queries → Add indexes, optimize joins
   ├── N+1 queries → Use eager loading or DataLoader
   ├── No caching → Add Redis cache for expensive computations
   └── Synchronous external calls → Make async or move to background

   Infrastructure:
   ├── No CDN → Add CloudFront/Cloudflare
   ├── Server far from users → Deploy to edge or regional servers
   └── Cold starts → Keep-alive or provisioned concurrency
```

### Scenario 3: "Design a Multi-Tenant SaaS"

**Context**: System design interview. Design a project management tool (like Jira) for multiple organizations.

**Key decisions**:

```
Data Isolation Strategy:
├── Shared database, shared schema (simplest, uses tenant_id column)
├── Shared database, separate schemas (moderate isolation)
└── Separate databases per tenant (strongest isolation, highest cost)

Recommendation for most cases: Shared database with tenant_id
- Add tenant_id to every table
- Enforce tenant isolation at the query layer
- Use Row-Level Security (RLS) in PostgreSQL as a safety net

API Design:
- Tenant identified via subdomain (acme.app.com) or header
- Middleware extracts tenant context
- All queries scoped to tenant automatically

Frontend:
- Tenant-specific theming (logo, colors)
- Role-based UI (admin vs member views)
- Shared component library across tenants
```

---

## Interview Questions

### Q1: "Walk me through how a user request travels through your application."

**Strong answer structure**:

```
1. User clicks a button in the React frontend
2. Frontend makes an HTTP request (fetch/axios)
   - Includes JWT token in Authorization header
   - Sends JSON payload in request body

3. Request hits the load balancer / reverse proxy (Nginx, ALB)
   - TLS termination happens here
   - Routes to appropriate service

4. Application server receives the request
   - Middleware chain executes:
     a. CORS validation
     b. Rate limiting check
     c. JWT verification and user extraction
     d. Request logging
     e. Body parsing and validation

5. Route handler processes the business logic
   - Validates input (Zod, Joi)
   - Calls service layer
   - Service interacts with database via ORM or raw queries

6. Database executes the query
   - Connection pool provides a connection
   - Query is executed (with prepared statements)
   - Results returned to service layer

7. Response flows back
   - Service returns domain objects
   - Controller serializes to API response format
   - Middleware adds response headers (CORS, cache-control)
   - HTTP response sent to client

8. Frontend handles the response
   - Updates local state / cache
   - Re-renders affected components
   - Shows success/error feedback to user
```

### Q2: "How do you decide between building something from scratch vs using a third-party service?"

**Framework for answering**:

```
Build when:
- It is core to your product differentiation
- You need deep customization
- Third-party costs scale poorly with your usage
- You need full control over data (compliance)

Buy/use a service when:
- It is commodity infrastructure (email, payments, auth)
- Time-to-market matters more than customization
- The service has better expertise (Stripe for payments)
- Maintenance burden of building is too high

Example: Authentication
- For a startup MVP: Use Auth0 or Firebase Auth
  - Fast to implement, handles edge cases (MFA, social login)
  - Cost is minimal at low scale
- For a large enterprise: Consider building with Passport.js
  - Full control over user data
  - Custom flows for enterprise SSO
  - Lower cost at scale
```

### Q3: "How do you handle a situation where frontend and backend teams disagree on API design?"

**What they are really asking**: Can you collaborate across domains?

```
Answer approach:
1. Start with the user experience
   - What does the frontend need to render this view efficiently?
   - What data transformations are expensive on the client?

2. Consider backend constraints
   - What is the natural shape of the data in the database?
   - What are the performance implications of reshaping data?

3. Find common ground
   - API contracts defined together (OpenAPI spec)
   - Backend provides efficient data access
   - Frontend can request specific fields (sparse fieldsets or GraphQL)
   - BFF (Backend for Frontend) pattern as a compromise

4. Process improvements
   - Co-design API contracts before implementation
   - Use mock servers to unblock frontend development
   - Review API changes together
```

### Q4: "Describe a time you had to debug an issue that spanned multiple services."

**Use STAR format with technical depth**:

```
Situation: Users reported intermittent 500 errors on checkout page.

Task: Diagnose and fix the issue. Checkout involved 3 services:
- Web frontend (React)
- Order service (Node.js)
- Payment service (Python)

Action:
1. Checked frontend error tracking (Sentry)
   - Errors were "Network Error" - unhelpful
2. Checked order service logs
   - Found timeout errors calling payment service
3. Checked payment service metrics
   - Response times spiked from 200ms to 5s at peak hours
4. Investigated payment service
   - Database connection pool exhausted (max 10 connections)
   - Long-running transactions holding connections
5. Root cause: A recent migration added a new index concurrently,
   which was locking rows during peak traffic

Resolution:
- Increased connection pool size (short-term)
- Scheduled migrations during off-peak hours (process fix)
- Added connection pool monitoring and alerting (prevention)
- Added circuit breaker between order and payment service

Result: Zero checkout errors in the following month.
```

### Q5: "How do you stay current with technology across the full stack?"

```
Practical answer:
- Follow key newsletters (JavaScript Weekly, DB Weekly, DevOps Weekly)
- Read engineering blogs from companies (Netflix, Stripe, Airbnb)
- Build side projects that force learning new tools
- Attend meetups or conferences (1-2 per year)
- Contribute to open source when possible
- Read RFCs and proposals for technologies I use daily

Key insight: Focus on fundamentals that transfer.
- HTTP protocol knowledge applies everywhere
- Database indexing concepts apply to any RDBMS
- Caching patterns are universal
- Security principles do not change with frameworks
```

### Q6: "How would you add a new feature to a legacy codebase you have never seen before?"

```
Step-by-step approach:

1. Understand the existing system (1-2 days)
   - Read the README and architecture docs
   - Run the application locally
   - Trace a request through the codebase
   - Identify testing patterns and coverage

2. Understand the feature requirements
   - Talk to the product owner
   - Identify affected areas of the codebase
   - Map data flow for the new feature

3. Plan the implementation
   - Write a brief technical design document
   - Identify risks and unknowns
   - Get feedback from team members who know the codebase

4. Implement incrementally
   - Start with the data model changes
   - Build and test backend changes
   - Build and test frontend changes
   - Write integration tests

5. Ship safely
   - Deploy behind a feature flag
   - Monitor error rates and performance
   - Roll out gradually
```

---

## Code Examples

### Example 1: Full-Stack Feature - Task List with Real-Time Updates

**Database Schema (PostgreSQL)**:

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    assignee_id UUID REFERENCES users(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
```

**Backend API (Node.js + Express)**:

```typescript
// routes/tasks.ts
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../websocket';

const router = Router();

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

// GET /api/tasks?status=todo&page=1&limit=20
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20)
    );
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const params: (string | number)[] = [limit, offset];
    let whereClause = '';

    if (status) {
      whereClause = 'WHERE status = $3';
      params.push(status);
    }

    const [tasksResult, countResult] = await Promise.all([
      pool.query(
        `SELECT t.*, u.name as assignee_name
         FROM tasks t
         LEFT JOIN users u ON t.assignee_id = u.id
         ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM tasks ${whereClause}`,
        status ? [status] : []
      ),
    ]);

    return res.json({
      success: true,
      data: tasksResult.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
    });
  }
});

// POST /api/tasks
router.post('/', authenticate, async (req, res) => {
  try {
    const input = CreateTaskSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO tasks (title, description, assignee_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.title,
        input.description || null,
        input.assigneeId || null,
        req.user.id,
      ]
    );

    const task = result.rows[0];

    broadcast('task:created', task);

    return res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }
    console.error('Failed to create task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create task',
    });
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const taskId = z.string().uuid().parse(req.params.id);
    const input = UpdateTaskSchema.parse(req.body);

    const setClauses: string[] = [];
    const params: (string | null)[] = [taskId];
    let paramIndex = 2;

    if (input.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(input.title);
    }
    if (input.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(input.status);
    }
    if (input.assigneeId !== undefined) {
      setClauses.push(`assignee_id = $${paramIndex++}`);
      params.push(input.assigneeId);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    setClauses.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    const task = result.rows[0];
    broadcast('task:updated', task);

    return res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }
    console.error('Failed to update task:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update task',
    });
  }
});

export default router;
```

**Frontend (React + TypeScript)**:

```tsx
// hooks/useTasks.ts
import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  assignee_name: string | null;
  created_at: string;
}

interface TasksResponse {
  success: boolean;
  data: Task[];
  meta: { total: number; page: number; limit: number };
}

export function useTasks(status?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);

      const response = await fetch(`/api/tasks?${params}`);
      const data: TasksResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch tasks');
      }

      setTasks(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Listen for real-time updates
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'task:created') {
        setTasks((prev) => [message.payload, ...prev]);
      }

      if (message.type === 'task:updated') {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === message.payload.id ? message.payload : task
          )
        );
      }
    };

    return () => ws.close();
  }, []);

  return { tasks, loading, error, refetch: fetchTasks };
}
```

### Example 2: Environment-Aware Configuration

```typescript
// config/index.ts - Server-side configuration pattern
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

function loadConfig() {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid configuration:\n${missing}`);
  }

  return result.data;
}

export const config = loadConfig();
```

---

## Quick Reference

### Full-Stack Interview Preparation Checklist

```
Week 1: Foundations
├── [ ] Review HTTP protocol (methods, status codes, headers)
├── [ ] Practice SQL queries (joins, aggregations, subqueries)
├── [ ] Build a CRUD API from scratch
├── [ ] Implement JWT authentication
└── [ ] Review basic system design patterns

Week 2: Depth
├── [ ] Study database indexing and query optimization
├── [ ] Learn caching strategies (application, database, CDN)
├── [ ] Practice API design with proper error handling
├── [ ] Implement WebSocket communication
└── [ ] Review security fundamentals (OWASP Top 10)

Week 3: Breadth
├── [ ] Study Docker and container basics
├── [ ] Review CI/CD pipeline concepts
├── [ ] Practice system design problems
├── [ ] Learn about message queues and async processing
└── [ ] Study monitoring and observability

Week 4: Practice
├── [ ] Complete 2-3 take-home-style projects
├── [ ] Practice explaining your decisions out loud
├── [ ] Do mock system design interviews
├── [ ] Review behavioral question responses (STAR format)
└── [ ] Prepare questions to ask interviewers
```

### Key Phrases That Signal Strong Full-Stack Thinking

```
"It depends on the requirements..."     → Shows you think about context
"The trade-off here is..."              → Shows you weigh options
"From the user's perspective..."         → Shows you think about UX
"For observability, we would need..."    → Shows production awareness
"At this scale, we might need to..."     → Shows you think about growth
"The security concern here is..."        → Shows security awareness
"We could start simple and iterate..."   → Shows pragmatism
```

### Common Mistakes in Full-Stack Interviews

```
1. Going too deep in one area
   Fix: Set a time limit for each topic, then move on

2. Not asking clarifying questions
   Fix: Always start with "What are the requirements?"

3. Jumping to implementation before design
   Fix: Spend 20% of your time planning

4. Ignoring error cases
   Fix: Explicitly discuss "What happens when X fails?"

5. Not mentioning testing
   Fix: Describe your testing strategy for every feature

6. Treating frontend and backend as separate problems
   Fix: Think about the full data flow from user action to database

7. Over-engineering solutions
   Fix: Start with the simplest solution that meets requirements

8. Not discussing deployment and operations
   Fix: Mention how you would deploy, monitor, and maintain
```

### The RAPID Framework for Answering Technical Questions

```
R - Requirements: Clarify what is being asked
A - Approach: Outline your high-level strategy
P - Plan: Break it into concrete steps
I - Implement: Walk through the implementation (or code it)
D - Discussion: Discuss trade-offs, alternatives, and improvements
```

### Technology Comparison Cheat Sheet

```
Rendering:
├── CSR (Create React App) → Dashboards, internal tools
├── SSR (Next.js) → SEO-critical, dynamic content
├── SSG (Astro, Next.js) → Blogs, marketing sites
└── ISR (Next.js) → Best of SSR + SSG for semi-static content

Databases:
├── PostgreSQL → Complex queries, ACID, JSON support
├── MySQL → Simpler needs, read-heavy workloads
├── MongoDB → Flexible schema, rapid prototyping
├── Redis → Caching, sessions, rate limiting
└── DynamoDB → Serverless, auto-scaling, key-value access

API Styles:
├── REST → Standard CRUD, wide adoption
├── GraphQL → Complex data requirements, mobile clients
├── gRPC → Internal services, high performance
└── WebSocket → Real-time, bidirectional communication

Authentication:
├── JWT → Stateless, distributed systems
├── Sessions → Simple apps, server-rendered pages
├── OAuth 2.0 → Third-party login, delegated access
└── API Keys → Service-to-service, public APIs
```
