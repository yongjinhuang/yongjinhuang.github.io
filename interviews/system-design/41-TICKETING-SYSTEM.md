# Design a Customer Support Ticketing System (Zendesk / Intercom / Freshdesk)

A customer support ticketing system is the backbone of enterprise customer service operations. It ingests requests from multiple channels (email, chat, web forms, APIs), routes them to the right agents, enforces SLA commitments, and provides analytics to optimize support operations. The core challenge lies in building a real-time, multi-tenant system that handles millions of tickets daily while maintaining strict SLA guarantees and enabling seamless collaboration between agents.

## Table of Contents

1. [Requirements Clarification](#requirements-clarification)
2. [API Design](#api-design)
3. [Data Model](#data-model)
4. [High-Level Architecture](#high-level-architecture)
5. [Deep Dive: Ticket Lifecycle](#deep-dive-ticket-lifecycle)
6. [Deep Dive: Routing & Assignment](#deep-dive-routing--assignment)
7. [Deep Dive: SLA Management](#deep-dive-sla-management)
8. [Deep Dive: Multi-Channel Intake](#deep-dive-multi-channel-intake)
9. [Deep Dive: Real-Time Collaboration](#deep-dive-real-time-collaboration)
10. [Deep Dive: Knowledge Base & Self-Service](#deep-dive-knowledge-base--self-service)
11. [Deep Dive: AI/ML Integration](#deep-dive-aiml-integration)
12. [Deep Dive: Reporting & Analytics](#deep-dive-reporting--analytics)
13. [Scaling Strategy](#scaling-strategy)
14. [Deployment Architecture](#deployment-architecture)
15. [Trade-offs](#trade-offs)
16. [Common Interview Follow-ups](#common-interview-follow-ups)
17. [Summary](#summary)

---

## Requirements Clarification

### Clarifying Questions to Ask

- How many support agents will the system serve? (10s for SMB vs. 10,000s for enterprise)
- What channels need to be supported at launch? (email, chat, web form, API, social media, phone)
- Do we need multi-tenant support for a SaaS offering or single-tenant for internal use?
- What are the SLA tiers? (first response time, resolution time, business hours vs. 24/7)
- Do we need real-time collaboration features (collision detection, internal notes)?
- Is a customer-facing portal required?
- What compliance requirements exist? (GDPR, HIPAA, SOC 2, data residency)
- Do we need AI features (auto-classification, suggested responses, chatbot deflection)?

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Ticket CRUD | Create, read, update, close tickets with rich metadata (priority, category, tags, custom fields) |
| 2 | Multi-Channel Intake | Ingest tickets from email, live chat, web forms, REST API, and social media channels |
| 3 | Assignment & Routing | Automatically route tickets to the correct team/agent based on rules, skills, and workload |
| 4 | SLA Tracking | Define SLA policies with first response and resolution time targets; track compliance in real time |
| 5 | Agent Workspace | Unified inbox with filters, views, bulk actions, and keyboard shortcuts for agent productivity |
| 6 | Internal Collaboration | Internal notes, @mentions, ticket followers, collision detection for concurrent edits |
| 7 | Customer Portal | Self-service portal where customers can submit, track, and respond to tickets |
| 8 | Knowledge Base | Article management system with search, categorization, and AI-powered suggestions |
| 9 | Macros & Templates | Pre-built response templates and multi-step automation macros for common scenarios |
| 10 | Automation Rules | Trigger-based rules (on create, on update, time-based) to automate ticket workflows |
| 11 | Reporting & Analytics | Agent performance, SLA compliance, CSAT scores, queue health, and custom dashboards |
| 12 | AI Features | Auto-classification, sentiment analysis, suggested responses, chatbot handoff |
| 13 | Audit Trail | Complete history of every action on every ticket for compliance and debugging |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Real-time update latency | < 500ms for ticket changes visible to all viewers |
| 2 | Availability | 99.99% (< 52 minutes downtime/year) |
| 3 | Search latency | < 200ms for full-text ticket search |
| 4 | Ticket creation throughput | 50,000 tickets/minute at peak |
| 5 | API response latency | < 100ms p95 for reads, < 300ms p95 for writes |
| 6 | Data retention | 7 years for audit compliance |
| 7 | Multi-tenancy | 100,000+ tenants with strict data isolation |
| 8 | SLA timer accuracy | < 1 second drift |
| 9 | Email processing latency | < 30 seconds from receipt to ticket creation |
| 10 | Horizontal scalability | Linear scale-out with no single bottleneck |

### Scale Estimation

```
Tenants & Users:
  Total tenants (orgs):        100,000
  Agents per tenant (avg):     20 (range: 1 to 50,000)
  Total agents:                2,000,000
  End customers:               500,000,000 (across all tenants)

Ticket Volume:
  Tickets created/day:         10,000,000 (10M)
  Peak tickets/second:         ~500 TPS (avg 115 TPS, 4x peak)
  Comments per ticket (avg):   5
  Comments/day:                50,000,000
  Ticket updates/day:          100,000,000 (status changes, assignments, tags)

Data Size:
  Ticket record:               ~2 KB (metadata + fields)
  Comment record:              ~1 KB (text + metadata)
  Attachment avg size:          500 KB
  Attachments per ticket:       0.5 avg

  Daily ticket storage:        10M * 2 KB = 20 GB/day
  Daily comment storage:       50M * 1 KB = 50 GB/day
  Daily attachment storage:    5M * 500 KB = 2.5 TB/day
  Annual ticket + comment:     ~25 TB/year
  Annual attachments:          ~900 TB/year

Search Index:
  Total searchable tickets:    3 billion (7-year retention)
  Index size (Elasticsearch):  ~30 TB (with replicas)
  Search QPS:                  10,000 queries/sec

Real-Time Events:
  WebSocket connections:        500,000 concurrent agents
  Events per second:            200,000 (ticket updates broadcast)

Email Volume:
  Inbound emails/day:          5,000,000
  Email parsing throughput:    ~60 emails/sec avg, 250/sec peak
  Email size (avg):            50 KB (with headers)
  Daily email ingress:         5M * 50 KB = 250 GB/day
```

---

## API Design

### Ticket Endpoints

```
POST   /api/v1/tickets                          Create a new ticket
GET    /api/v1/tickets                          List tickets (with filters, pagination)
GET    /api/v1/tickets/{ticketId}               Get ticket details
PATCH  /api/v1/tickets/{ticketId}               Update ticket fields
DELETE /api/v1/tickets/{ticketId}               Soft-delete a ticket

POST   /api/v1/tickets/{ticketId}/comments      Add a comment (public or internal)
GET    /api/v1/tickets/{ticketId}/comments      List comments on a ticket
PUT    /api/v1/tickets/{ticketId}/comments/{id} Edit a comment

POST   /api/v1/tickets/{ticketId}/tags          Add tags to a ticket
DELETE /api/v1/tickets/{ticketId}/tags/{tag}    Remove a tag

POST   /api/v1/tickets/{ticketId}/followers     Add a follower
DELETE /api/v1/tickets/{ticketId}/followers/{id} Remove a follower

POST   /api/v1/tickets/{ticketId}/merge         Merge another ticket into this one
POST   /api/v1/tickets/{ticketId}/split         Split a ticket into multiple tickets

GET    /api/v1/tickets/{ticketId}/audit-log     Get full audit trail
GET    /api/v1/tickets/{ticketId}/sla           Get SLA status and deadlines
```

### Agent & Team Endpoints

```
GET    /api/v1/agents                           List agents
GET    /api/v1/agents/{agentId}                 Get agent details
PATCH  /api/v1/agents/{agentId}                 Update agent profile/status
GET    /api/v1/agents/{agentId}/tickets         Get agent's assigned tickets
PUT    /api/v1/agents/{agentId}/availability    Set availability (online/away/offline)

GET    /api/v1/teams                            List teams
POST   /api/v1/teams                            Create a team
GET    /api/v1/teams/{teamId}/members           List team members
POST   /api/v1/teams/{teamId}/members           Add member to team
```

### Queue & Routing Endpoints

```
GET    /api/v1/queues                           List ticket queues (views)
POST   /api/v1/queues                           Create a custom queue
GET    /api/v1/queues/{queueId}/tickets         Get tickets in a queue
POST   /api/v1/queues/{queueId}/next            Pull next ticket from queue (round-robin)

GET    /api/v1/routing-rules                    List routing rules
POST   /api/v1/routing-rules                    Create a routing rule
PUT    /api/v1/routing-rules/{ruleId}           Update a routing rule
PUT    /api/v1/routing-rules/reorder            Reorder rule execution priority
```

### SLA Policy Endpoints

```
GET    /api/v1/sla-policies                     List SLA policies
POST   /api/v1/sla-policies                     Create an SLA policy
PUT    /api/v1/sla-policies/{policyId}          Update an SLA policy
DELETE /api/v1/sla-policies/{policyId}          Delete an SLA policy

GET    /api/v1/sla-policies/{policyId}/breaches List SLA breaches for a policy
GET    /api/v1/sla/dashboard                    Get SLA compliance summary
```

### Knowledge Base Endpoints

```
GET    /api/v1/articles                         List knowledge base articles
POST   /api/v1/articles                         Create an article
PUT    /api/v1/articles/{articleId}             Update an article
DELETE /api/v1/articles/{articleId}             Archive an article
GET    /api/v1/articles/search?q={query}        Search articles

POST   /api/v1/articles/{articleId}/feedback    Submit article helpfulness feedback
GET    /api/v1/articles/suggestions?ticketId={id} Get AI-suggested articles for a ticket
```

### Macro & Automation Endpoints

```
GET    /api/v1/macros                           List macros
POST   /api/v1/macros                           Create a macro
POST   /api/v1/macros/{macroId}/apply           Apply macro to a ticket
PUT    /api/v1/macros/{macroId}                 Update a macro

GET    /api/v1/automations                      List automation rules
POST   /api/v1/automations                      Create an automation rule
PUT    /api/v1/automations/{ruleId}             Update an automation rule
PUT    /api/v1/automations/{ruleId}/toggle      Enable/disable an automation
```

### Example: Create Ticket Request

```json
POST /api/v1/tickets
{
  "subject": "Cannot access my account after password reset",
  "description": "I reset my password 2 hours ago and still cannot login.",
  "channel": "web_form",
  "priority": "high",
  "category": "account_access",
  "requester": {
    "email": "customer@example.com",
    "name": "Jane Doe"
  },
  "custom_fields": {
    "product": "enterprise_plan",
    "browser": "Chrome 120"
  },
  "tags": ["login", "password-reset"],
  "attachments": ["upload://abc123"]
}
```

### Example: Create Ticket Response

```json
{
  "id": "tkt_01HQ3K5M7XNPJ",
  "subject": "Cannot access my account after password reset",
  "status": "new",
  "priority": "high",
  "category": "account_access",
  "channel": "web_form",
  "requester_id": "usr_01HQ3K5M7X",
  "assignee_id": null,
  "team_id": null,
  "sla": {
    "policy_id": "sla_high_priority",
    "first_response_due": "2026-03-03T15:00:00Z",
    "resolution_due": "2026-03-04T09:00:00Z",
    "business_hours": true
  },
  "tags": ["login", "password-reset"],
  "custom_fields": {
    "product": "enterprise_plan",
    "browser": "Chrome 120"
  },
  "created_at": "2026-03-03T14:00:00Z",
  "updated_at": "2026-03-03T14:00:00Z"
}
```

---

## Data Model

### Core Tables

```sql
-- Multi-tenant organization
CREATE TABLE organizations (
    id              BIGINT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    subdomain       VARCHAR(63) UNIQUE NOT NULL,
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    business_hours  JSONB NOT NULL DEFAULT '{}',
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support agents
CREATE TABLE agents (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'agent',  -- admin, agent, light_agent
    status          VARCHAR(20) NOT NULL DEFAULT 'offline', -- online, away, offline
    skills          TEXT[] NOT NULL DEFAULT '{}',
    max_capacity    INT NOT NULL DEFAULT 20,
    current_load    INT NOT NULL DEFAULT 0,
    signature       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- Teams / groups
CREATE TABLE teams (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    assignment_mode VARCHAR(50) NOT NULL DEFAULT 'round_robin',
    -- round_robin, load_balanced, manual, skill_based
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id         BIGINT NOT NULL REFERENCES teams(id),
    agent_id        BIGINT NOT NULL REFERENCES agents(id),
    is_lead         BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (team_id, agent_id)
);

-- Tickets (the core entity)
CREATE TABLE tickets (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    external_id     VARCHAR(255),            -- customer-facing ticket number
    subject         VARCHAR(500) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'new',
    -- new, open, pending, on_hold, solved, closed
    priority        VARCHAR(20) NOT NULL DEFAULT 'normal',
    -- urgent, high, normal, low
    category        VARCHAR(100),
    subcategory     VARCHAR(100),
    channel         VARCHAR(50) NOT NULL,    -- email, chat, web_form, api, phone
    source_ref      VARCHAR(500),            -- original email message-id, chat session id

    requester_id    BIGINT NOT NULL,          -- customer who submitted
    assignee_id     BIGINT REFERENCES agents(id),
    team_id         BIGINT REFERENCES teams(id),

    -- SLA tracking
    sla_policy_id   BIGINT REFERENCES sla_policies(id),
    first_response_at    TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    first_response_due   TIMESTAMPTZ,
    resolution_due       TIMESTAMPTZ,
    sla_paused_at        TIMESTAMPTZ,        -- set when status = pending
    sla_paused_duration  INTERVAL DEFAULT '0',

    -- AI enrichment
    ai_sentiment    VARCHAR(20),              -- positive, neutral, negative, angry
    ai_confidence   FLOAT,
    ai_category     VARCHAR(100),
    ai_summary      TEXT,

    -- Metadata
    tags            TEXT[] NOT NULL DEFAULT '{}',
    custom_fields   JSONB NOT NULL DEFAULT '{}',
    satisfaction    VARCHAR(20),               -- good, bad (CSAT)

    merged_into_id  BIGINT REFERENCES tickets(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_tickets_org_status (org_id, status),
    INDEX idx_tickets_assignee (assignee_id, status),
    INDEX idx_tickets_team (team_id, status),
    INDEX idx_tickets_sla_due (org_id, first_response_due),
    INDEX idx_tickets_created (org_id, created_at DESC)
);

-- Comments / replies on tickets
CREATE TABLE comments (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    author_id       BIGINT NOT NULL,          -- agent_id or requester_id
    author_type     VARCHAR(20) NOT NULL,     -- agent, customer, system
    body            TEXT NOT NULL,
    body_html       TEXT,
    is_internal     BOOLEAN NOT NULL DEFAULT false,  -- internal note vs public reply
    channel         VARCHAR(50),              -- channel the reply was sent through

    -- For email threading
    message_id      VARCHAR(500),
    in_reply_to     VARCHAR(500),

    attachments     JSONB NOT NULL DEFAULT '[]',
    mentions        BIGINT[] DEFAULT '{}',    -- @mentioned agent IDs

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_comments_ticket (ticket_id, created_at)
);

-- SLA policy definitions
CREATE TABLE sla_policies (
    id                      BIGINT PRIMARY KEY,
    org_id                  BIGINT NOT NULL REFERENCES organizations(id),
    name                    VARCHAR(255) NOT NULL,
    description             TEXT,
    priority                INT NOT NULL DEFAULT 0,  -- higher = matched first

    -- Conditions: which tickets this SLA applies to
    conditions              JSONB NOT NULL,
    -- e.g. {"priority": ["urgent","high"], "channel": ["email"]}

    -- Targets (in minutes)
    first_response_urgent   INT,    -- e.g. 30 minutes
    first_response_high     INT,    -- e.g. 60 minutes
    first_response_normal   INT,    -- e.g. 240 minutes
    first_response_low      INT,    -- e.g. 480 minutes

    resolution_urgent       INT,    -- e.g. 240 minutes
    resolution_high         INT,    -- e.g. 480 minutes
    resolution_normal       INT,    -- e.g. 1440 minutes
    resolution_low          INT,    -- e.g. 2880 minutes

    -- Business hours
    use_business_hours      BOOLEAN NOT NULL DEFAULT true,
    business_hours_id       BIGINT,

    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SLA breach records
CREATE TABLE sla_breaches (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    org_id          BIGINT NOT NULL,
    policy_id       BIGINT NOT NULL REFERENCES sla_policies(id),
    breach_type     VARCHAR(30) NOT NULL,  -- first_response, resolution
    target_minutes  INT NOT NULL,
    actual_minutes  INT NOT NULL,
    breached_at     TIMESTAMPTZ NOT NULL,

    INDEX idx_breaches_org (org_id, breached_at DESC)
);

-- Audit log for every ticket action
CREATE TABLE ticket_audit_logs (
    id              BIGINT PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id),
    org_id          BIGINT NOT NULL,
    actor_id        BIGINT NOT NULL,
    actor_type      VARCHAR(20) NOT NULL,    -- agent, customer, system, automation
    action          VARCHAR(50) NOT NULL,
    -- created, status_changed, assigned, priority_changed,
    -- comment_added, tag_added, merged, sla_breached, etc.
    changes         JSONB NOT NULL,          -- {"field": "status", "from": "new", "to": "open"}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_audit_ticket (ticket_id, created_at)
);

-- Tags (denormalized into tickets.tags[] but also stored for management)
CREATE TABLE tags (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7),
    ticket_count    INT NOT NULL DEFAULT 0,
    UNIQUE(org_id, name)
);

-- Custom field definitions per organization
CREATE TABLE custom_field_definitions (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    field_key       VARCHAR(100) NOT NULL,
    field_type      VARCHAR(30) NOT NULL,   -- text, number, dropdown, checkbox, date
    options         JSONB,                   -- for dropdown: ["option1", "option2"]
    is_required     BOOLEAN NOT NULL DEFAULT false,
    is_visible_to_customer BOOLEAN NOT NULL DEFAULT false,
    display_order   INT NOT NULL DEFAULT 0,
    UNIQUE(org_id, field_key)
);

-- Macros (saved response templates + actions)
CREATE TABLE macros (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    actions         JSONB NOT NULL,
    -- [
    --   {"type": "set_field", "field": "status", "value": "solved"},
    --   {"type": "set_field", "field": "priority", "value": "low"},
    --   {"type": "add_comment", "body": "Thanks for contacting us...", "is_internal": false}
    -- ]
    scope           VARCHAR(20) NOT NULL DEFAULT 'personal',  -- personal, team, global
    created_by      BIGINT NOT NULL REFERENCES agents(id),
    usage_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automation rules (trigger-based)
CREATE TABLE automation_rules (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    trigger_event   VARCHAR(50) NOT NULL,    -- on_create, on_update, time_based
    conditions      JSONB NOT NULL,
    actions         JSONB NOT NULL,
    execution_order INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer / requester records
CREATE TABLE customers (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    email           VARCHAR(255),
    name            VARCHAR(255),
    phone           VARCHAR(50),
    external_id     VARCHAR(255),            -- customer ID from client's system
    metadata        JSONB NOT NULL DEFAULT '{}',
    ticket_count    INT NOT NULL DEFAULT 0,
    last_ticket_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- Knowledge base articles
CREATE TABLE articles (
    id              BIGINT PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    title           VARCHAR(500) NOT NULL,
    body            TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    category_id     BIGINT,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, published, archived
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',
    author_id       BIGINT NOT NULL REFERENCES agents(id),
    view_count      INT NOT NULL DEFAULT 0,
    helpful_count   INT NOT NULL DEFAULT 0,
    not_helpful_count INT NOT NULL DEFAULT 0,
    embedding       VECTOR(1536),            -- for semantic search
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Entity Relationship Diagram

```
+------------------+       +------------------+       +------------------+
| organizations    |       | agents           |       | teams            |
|------------------|       |------------------|       |------------------|
| id (PK)          |<------| org_id (FK)      |       | id (PK)          |
| name             |       | email            |   +-->| org_id (FK)      |
| subdomain        |       | name             |   |   | name             |
| plan             |       | role             |   |   | assignment_mode  |
| timezone         |       | status           |   |   +------------------+
| business_hours   |       | skills[]         |   |          |
+------------------+       | max_capacity     |   |   +------+-------+
        |                  +------------------+   |   | team_members   |
        |                         |               |   |----------------|
        v                         v               |   | team_id (FK)   |
+------------------+       +------------------+   |   | agent_id (FK)  |
| sla_policies     |       | tickets          |   |   +----------------+
|------------------|       |------------------|   |
| id (PK)          |<------| sla_policy_id    |   |
| org_id (FK)      |       | org_id (FK)      |---+
| conditions       |       | subject          |
| first_resp_*     |       | status           |
| resolution_*     |       | priority         |
+------------------+       | requester_id (FK)|----->+------------------+
                           | assignee_id (FK) |----->| customers        |
                           | team_id (FK)     |      |------------------|
                           | channel          |      | id (PK)          |
                           | tags[]           |      | org_id (FK)      |
                           | custom_fields    |      | email            |
                           +------------------+      +------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
             +------+---+  +-----+------+  +---+--------+
             | comments  |  | audit_logs |  | sla_breaches|
             |-----------|  |------------|  |-------------|
             | ticket_id |  | ticket_id  |  | ticket_id   |
             | author_id |  | actor_id   |  | breach_type |
             | body      |  | action     |  | target_min  |
             | is_internal| | changes    |  | actual_min  |
             +-----------+  +------------+  +-------------+
```

---

## High-Level Architecture

```
                         ┌──────────────────────────────────────────────────┐
                         │              OMNICHANNEL INTAKE                  │
                         │                                                  │
                         │  ┌─────┐ ┌──────┐ ┌───────┐ ┌─────┐ ┌───────┐ │
                         │  │Email│ │ Chat │ │Web    │ │ API │ │Social │ │
                         │  │     │ │      │ │Form   │ │     │ │Media  │ │
                         │  └──┬──┘ └──┬───┘ └──┬────┘ └──┬──┘ └──┬────┘ │
                         └─────┼───────┼────────┼─────────┼───────┼──────┘
                               │       │        │         │       │
                               v       v        v         v       v
                         ┌──────────────────────────────────────────────────┐
                         │              API GATEWAY / LOAD BALANCER         │
                         │         (Rate Limiting, Auth, Tenant ID)        │
                         └──────────────────────┬───────────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    v                           v                           v
          ┌─────────────────┐      ┌─────────────────────┐    ┌────────────────────┐
          │  TICKET SERVICE  │      │  COMMENT SERVICE     │    │  CUSTOMER SERVICE   │
          │                  │      │                      │    │                     │
          │ - CRUD           │      │ - Add/edit comments  │    │ - Customer profiles │
          │ - Status mgmt    │      │ - Internal notes     │    │ - Contact merge     │
          │ - Field updates  │      │ - Attachments        │    │ - History lookup    │
          └───────┬──────────┘      └──────────┬───────────┘    └────────────────────┘
                  │                             │
                  v                             v
          ┌──────────────────────────────────────────────┐
          │              EVENT BUS (Kafka)                │
          │   ticket.created | ticket.updated |          │
          │   comment.added  | sla.breached   |          │
          └───┬───────┬──────────┬──────────┬────────────┘
              │       │          │          │
              v       v          v          v
    ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐
    │ ROUTING  │ │  SLA    │ │NOTIFICA- │ │  SEARCH       │
    │ ENGINE   │ │ MONITOR │ │TION SVC  │ │  INDEXER      │
    │          │ │         │ │          │ │               │
    │ - Rules  │ │ - Timer │ │ - Email  │ │ - Elastic-    │
    │ - Skills │ │ - Breach│ │ - Push   │ │   search      │
    │ - Load   │ │ - Pause │ │ - WS     │ │ - Full-text   │
    │   balance│ │ - Escal.│ │ - Slack  │ │ - Faceted     │
    └──────────┘ └─────────┘ └──────────┘ └───────────────┘
              │       │          │
              v       v          v
    ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐
    │AUTOMATION│ │AI / ML  │ │ANALYTICS │ │ KNOWLEDGE     │
    │ENGINE    │ │SERVICE  │ │SERVICE   │ │ BASE          │
    │          │ │         │ │          │ │               │
    │ - Trigger│ │ - Class.│ │ - CSAT   │ │ - Articles    │
    │ - Time-  │ │ - Senti.│ │ - Agent  │ │ - Search      │
    │   based  │ │ - Suggest│ │  perf   │ │ - Suggestions │
    │ - Rules  │ │ - Chatbot│ │ - SLA   │ │ - Deflection  │
    └──────────┘ └─────────┘ └──────────┘ └───────────────┘
              │       │          │              │
              v       v          v              v
    ┌────────────────────────────────────────────────────────┐
    │                    DATA LAYER                          │
    │                                                        │
    │  ┌──────────┐  ┌───────────┐  ┌──────┐  ┌──────────┐ │
    │  │PostgreSQL│  │Elastic-   │  │Redis │  │Object    │ │
    │  │(sharded) │  │search     │  │Cache │  │Storage   │ │
    │  │          │  │Cluster    │  │      │  │(S3)      │ │
    │  │- Tickets │  │- Full-text│  │- Hot │  │- Attach- │ │
    │  │- Comments│  │  search   │  │  data│  │  ments   │ │
    │  │- Agents  │  │- Analytics│  │- WS  │  │- Exports │ │
    │  │- SLA     │  │- Suggest  │  │  pub/│  │          │ │
    │  │- Audit   │  │           │  │  sub │  │          │ │
    │  └──────────┘  └───────────┘  └──────┘  └──────────┘ │
    └────────────────────────────────────────────────────────┘
```

---

## Deep Dive: Ticket Lifecycle

### State Machine

```
                          ┌─────────────────────────┐
                          │    TICKET LIFECYCLE      │
                          │      STATE MACHINE       │
                          └─────────────────────────┘

    ┌───────┐    Agent picks up     ┌───────┐
    │  NEW  │ ──────────────────>   │ OPEN  │
    │       │    or auto-assigned   │       │
    └───┬───┘                       └───┬───┘
        │                               │
        │  Auto-route                   │  Agent replies, awaiting
        │  (no agent available)         │  customer response
        │                               │
        │         ┌─────────────────────v───────┐
        │         │         PENDING             │
        │         │  (SLA timer PAUSED)         │
        │         └────────────┬────────────────┘
        │                      │
        │                      │  Customer responds
        │                      │  (SLA timer RESUMES)
        │                      │
        │         ┌──────��─────v────────────────┐
        │         │         OPEN                │
        │         │  (back to agent)            │◄─────────────────┐
        │         └────────────┬────────────────┘                  │
        │                      │                                    │
        │         ┌────────────v────────────────┐                  │
        │         │        ON_HOLD              │                  │
        │         │  (waiting on 3rd party)     │                  │
        │         │  (SLA timer PAUSED)         │──────────────────┘
        │         └─────────────────────────────┘   3rd party responds
        │
        │         ┌─────────────────────────────┐
        └────────>│        SOLVED               │
                  │  (agent marks resolved)      │
                  └────────────┬────────────────┘
                               │
                               │  Auto-close after
                               │  X days (configurable)
                               │
                  ┌────────────v────────────────┐
                  │        CLOSED               │
                  │  (final, immutable)          │
                  └─────────────────────────────┘

    Re-opening Rules:
    ──────────────────
    SOLVED → OPEN   : Customer replies within auto-close window
    CLOSED → NEW    : Creates a follow-up ticket (linked to original)
    Any    → OPEN   : Agent manually re-opens (audit logged)
```

### Transition Rules (Enforced in Code)

```python
VALID_TRANSITIONS = {
    "new":      ["open", "pending", "solved"],
    "open":     ["pending", "on_hold", "solved"],
    "pending":  ["open", "solved"],
    "on_hold":  ["open", "solved"],
    "solved":   ["open", "closed"],
    "closed":   [],   # terminal state -- no transitions out
}

def transition_ticket(ticket, new_status, actor):
    """Transition a ticket to a new status with validation."""
    if new_status not in VALID_TRANSITIONS[ticket.status]:
        raise InvalidTransitionError(
            f"Cannot transition from {ticket.status} to {new_status}"
        )

    old_status = ticket.status

    # Handle SLA timer pause/resume
    if new_status in ("pending", "on_hold") and old_status in ("new", "open"):
        sla_pause(ticket)
    elif new_status == "open" and old_status in ("pending", "on_hold"):
        sla_resume(ticket)
    elif new_status == "solved":
        record_resolution_time(ticket)

    # Create new ticket state (immutable pattern)
    updated_ticket = {
        **ticket,
        "status": new_status,
        "updated_at": now(),
    }

    # Persist and emit event
    save_ticket(updated_ticket)
    emit_event("ticket.status_changed", {
        "ticket_id": ticket.id,
        "from": old_status,
        "to": new_status,
        "actor_id": actor.id,
        "actor_type": actor.type,
        "timestamp": now(),
    })

    return updated_ticket
```

### Auto-Close Logic

```python
# Runs as a scheduled job every 5 minutes
def auto_close_solved_tickets(org_id):
    """Close tickets that have been in 'solved' status past the auto-close window."""
    auto_close_days = get_org_setting(org_id, "auto_close_days", default=7)
    cutoff = now() - timedelta(days=auto_close_days)

    solved_tickets = query(
        "SELECT id FROM tickets WHERE org_id = %s AND status = 'solved' "
        "AND updated_at < %s LIMIT 1000",
        [org_id, cutoff]
    )

    for ticket in solved_tickets:
        transition_ticket(ticket, "closed", actor=SYSTEM_ACTOR)

# Re-open on customer reply
def handle_customer_reply(ticket, comment):
    """Re-open a solved ticket when the customer replies."""
    if ticket.status == "solved":
        transition_ticket(ticket, "open", actor=comment.author)
    elif ticket.status == "closed":
        follow_up = create_follow_up_ticket(ticket, comment)
        return follow_up
    return ticket
```

---

## Deep Dive: Routing & Assignment

### Routing Architecture

```
                    New Ticket Created
                          │
                          v
                ┌─────────────────────┐
                │  ROUTING ENGINE     │
                └─────────┬───────────┘
                          │
              ┌───────────┼───────────────┐
              │           │               │
              v           v               v
     ┌──────────────┐ ┌────────────┐ ┌─────────────┐
     │ Rule-Based   │ │ Skill-Based│ │ AI-Predicted │
     │ Routing      │ │ Matching   │ │ Routing      │
     │              │ │            │ │              │
     │ IF category= │ │ Match      │ │ ML model     │
     │ "billing"    │ │ ticket     │ │ predicts     │
     │ THEN team=   │ │ skills to  │ │ best team    │
     │ "billing"    │ │ agent      │ │ from content │
     │              │ │ skills     │ │              │
     └──────┬───────┘ └─────┬──────┘ └──────┬──────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                            v
                 ┌──────────────────────┐
                 │  ASSIGNMENT ENGINE   │
                 └──────────┬───────────┘
                            │
              ┌─────────────┼────────────────┐
              │             │                │
              v             v                v
     ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
     │ Round-Robin  │ │ Load-       │ │ Priority     │
     │              │ │ Balanced    │ │ Queue        │
     │ Circular     │ │             │ │              │
     │ rotation     │ │ Assign to   │ │ Urgent first │
     │ across       │ │ agent with  │ │ then FIFO    │
     │ available    │ │ lowest      │ │ within same  │
     │ agents       │ │ current_load│ │ priority     │
     └──────────────┘ └─────────────┘ └──────────────┘
```

### Routing Rules Evaluation

```python
def evaluate_routing_rules(ticket, org_rules):
    """Evaluate routing rules in priority order. First match wins."""
    sorted_rules = sorted(org_rules, key=lambda r: r.execution_order)

    for rule in sorted_rules:
        if not rule.is_active:
            continue
        if matches_conditions(ticket, rule.conditions):
            return apply_routing_actions(ticket, rule.actions)

    # Fallback: assign to default queue
    return assign_to_default_queue(ticket)

def matches_conditions(ticket, conditions):
    """Check if a ticket matches all rule conditions."""
    for condition in conditions:
        field_value = get_field(ticket, condition["field"])
        operator = condition["operator"]
        target = condition["value"]

        if operator == "equals" and field_value != target:
            return False
        elif operator == "contains" and target not in field_value:
            return False
        elif operator == "in" and field_value not in target:
            return False
        elif operator == "regex" and not re.match(target, field_value):
            return False

    return True  # all conditions satisfied
```

### Round-Robin Assignment with Redis

```python
ROUND_ROBIN_KEY = "rr:{org_id}:{team_id}"

def assign_round_robin(ticket, team_id):
    """Assign a ticket to the next available agent using Redis-backed round-robin."""
    available_agents = get_available_agents(team_id)

    if not available_agents:
        return None  # ticket stays in queue unassigned

    agent_ids = [a.id for a in available_agents]

    # Atomic increment to get next agent index
    idx = redis.incr(ROUND_ROBIN_KEY.format(
        org_id=ticket.org_id, team_id=team_id
    ))

    selected_idx = idx % len(agent_ids)
    selected_agent = available_agents[selected_idx]

    # Check capacity
    if selected_agent.current_load >= selected_agent.max_capacity:
        # Try next agents until one has capacity
        for offset in range(1, len(agent_ids)):
            candidate_idx = (selected_idx + offset) % len(agent_ids)
            candidate = available_agents[candidate_idx]
            if candidate.current_load < candidate.max_capacity:
                return assign_to_agent(ticket, candidate)
        return None  # all agents at capacity

    return assign_to_agent(ticket, selected_agent)

def get_available_agents(team_id):
    """Get agents who are online and not at max capacity."""
    return query(
        "SELECT * FROM agents a "
        "JOIN team_members tm ON tm.agent_id = a.id "
        "WHERE tm.team_id = %s AND a.status = 'online' "
        "AND a.current_load < a.max_capacity "
        "ORDER BY a.current_load ASC",
        [team_id]
    )
```

### Skill-Based Routing

```python
def skill_based_assignment(ticket, team_id):
    """Assign ticket to agent with best skill match."""
    required_skills = infer_required_skills(ticket)
    agents = get_available_agents(team_id)

    scored_agents = []
    for agent in agents:
        # Calculate skill match score
        matched = set(agent.skills) & set(required_skills)
        skill_score = len(matched) / len(required_skills) if required_skills else 0

        # Factor in current load (prefer less busy agents)
        load_score = 1 - (agent.current_load / agent.max_capacity)

        # Composite score: 70% skill match, 30% availability
        composite = (0.7 * skill_score) + (0.3 * load_score)
        scored_agents.append((agent, composite))

    scored_agents.sort(key=lambda x: x[1], reverse=True)

    if scored_agents and scored_agents[0][1] > 0.3:
        return assign_to_agent(ticket, scored_agents[0][0])

    # Fallback to round-robin if no good skill match
    return assign_round_robin(ticket, team_id)

def infer_required_skills(ticket):
    """Derive required skills from ticket metadata and content."""
    skills = []

    if ticket.category:
        skills.append(ticket.category)
    if ticket.channel == "chat":
        skills.append("live_chat")
    if ticket.custom_fields.get("product"):
        skills.append(ticket.custom_fields["product"])
    if ticket.priority == "urgent":
        skills.append("escalation_handling")

    # AI-predicted skills from ticket content
    ai_skills = ml_service.predict_skills(ticket.subject, ticket.description)
    skills.extend(ai_skills)

    return list(set(skills))
```

### Escalation Rules

```
Escalation Matrix:
+----------------------------+------------------+------------------+-------------------+
| Condition                  | Escalation Level | Action           | Notify            |
+----------------------------+------------------+------------------+-------------------+
| SLA 50% elapsed,           | Level 1          | Bump priority    | Assigned agent    |
| no first response          |                  | to "high"        | via push + email  |
+----------------------------+------------------+------------------+-------------------+
| SLA 75% elapsed,           | Level 2          | Reassign to      | Team lead via     |
| no first response          |                  | team lead        | Slack + push      |
+----------------------------+------------------+------------------+-------------------+
| SLA breached (100%),       | Level 3          | Assign to        | Manager via       |
| first response             |                  | manager          | PagerDuty         |
+----------------------------+------------------+------------------+-------------------+
| SLA 50% elapsed,           | Level 1          | Highlight in     | Assigned agent    |
| no resolution              |                  | agent dashboard  |                   |
+----------------------------+------------------+------------------+-------------------+
| SLA breached,              | Level 3          | Escalate to      | VP Support via    |
| resolution (urgent ticket) |                  | senior engineer  | PagerDuty         |
+----------------------------+------------------+------------------+-------------------+
| Customer replied 3+ times, | Frustration      | Auto-bump        | Team lead         |
| no agent response          | escalation       | priority         |                   |
+----------------------------+------------------+------------------+-------------------+
```

---

## Deep Dive: SLA Management

### SLA Policy Matching

```python
def match_sla_policy(ticket, org_policies):
    """Match a ticket to the highest-priority applicable SLA policy."""
    sorted_policies = sorted(org_policies, key=lambda p: p.priority, reverse=True)

    for policy in sorted_policies:
        if not policy.is_active:
            continue
        if sla_conditions_match(ticket, policy.conditions):
            return policy

    return None  # no SLA applies (use org default if exists)

def sla_conditions_match(ticket, conditions):
    """Check if ticket matches SLA policy conditions."""
    # conditions: {"priority": ["urgent", "high"], "channel": ["email"], "tags": ["vip"]}
    for field, values in conditions.items():
        ticket_value = getattr(ticket, field, None)
        if ticket_value is None:
            return False
        # Handle array fields (tags)
        if isinstance(ticket_value, list):
            if not set(values) & set(ticket_value):
                return False
        elif ticket_value not in values:
            return False
    return True
```

### Business Hours Calculation

```python
def calculate_due_time(start_time, target_minutes, business_hours_config):
    """
    Calculate SLA due time respecting business hours.

    business_hours_config example:
    {
        "timezone": "America/New_York",
        "schedule": {
            "monday":    {"start": "09:00", "end": "17:00"},
            "tuesday":   {"start": "09:00", "end": "17:00"},
            "wednesday": {"start": "09:00", "end": "17:00"},
            "thursday":  {"start": "09:00", "end": "17:00"},
            "friday":    {"start": "09:00", "end": "17:00"},
            "saturday":  null,
            "sunday":    null
        },
        "holidays": ["2026-01-01", "2026-12-25"]
    }
    """
    tz = pytz.timezone(business_hours_config["timezone"])
    current = start_time.astimezone(tz)
    remaining_minutes = target_minutes

    while remaining_minutes > 0:
        day_name = current.strftime("%A").lower()
        schedule = business_hours_config["schedule"].get(day_name)
        date_str = current.strftime("%Y-%m-%d")

        # Skip holidays and non-business days
        if schedule is None or date_str in business_hours_config.get("holidays", []):
            current = next_business_day_start(current, business_hours_config)
            continue

        biz_start = parse_time(schedule["start"], current.date(), tz)
        biz_end = parse_time(schedule["end"], current.date(), tz)

        # If before business hours, jump to start
        if current < biz_start:
            current = biz_start

        # If after business hours, jump to next day
        if current >= biz_end:
            current = next_business_day_start(current, business_hours_config)
            continue

        # Calculate available minutes today
        available = (biz_end - current).total_seconds() / 60

        if remaining_minutes <= available:
            return current + timedelta(minutes=remaining_minutes)

        remaining_minutes -= available
        current = next_business_day_start(current, business_hours_config)

    return current
```

### SLA Timer with Pause/Resume

```python
def sla_pause(ticket):
    """Pause SLA timer when ticket enters pending or on_hold status."""
    return {
        **ticket,
        "sla_paused_at": now(),
    }

def sla_resume(ticket):
    """Resume SLA timer when ticket returns to open status."""
    if ticket.sla_paused_at is None:
        return ticket

    paused_duration = now() - ticket.sla_paused_at
    total_paused = ticket.sla_paused_duration + paused_duration

    # Extend due dates by the paused duration
    updated = {
        **ticket,
        "sla_paused_at": None,
        "sla_paused_duration": total_paused,
    }

    if ticket.first_response_due and not ticket.first_response_at:
        updated["first_response_due"] = ticket.first_response_due + paused_duration

    if ticket.resolution_due:
        updated["resolution_due"] = ticket.resolution_due + paused_duration

    return updated
```

### SLA Monitor Service

```python
# Runs continuously, checking SLA deadlines
class SLAMonitor:
    """
    Polls for tickets approaching or past SLA deadlines.
    Runs every 30 seconds to ensure < 1 minute detection latency.
    """

    def check_approaching_breaches(self):
        """Find tickets approaching SLA breach (within escalation thresholds)."""
        thresholds = [
            (0.50, "sla_50_percent"),
            (0.75, "sla_75_percent"),
            (1.00, "sla_breached"),
        ]

        for fraction, event_type in thresholds:
            # First response SLA
            at_risk_tickets = query("""
                SELECT t.* FROM tickets t
                WHERE t.status IN ('new', 'open')
                  AND t.first_response_at IS NULL
                  AND t.first_response_due IS NOT NULL
                  AND t.sla_paused_at IS NULL
                  AND t.first_response_due - (
                      (t.first_response_due - t.created_at) * (1 - %s)
                  ) <= NOW()
                  AND NOT EXISTS (
                      SELECT 1 FROM sla_escalations se
                      WHERE se.ticket_id = t.id AND se.threshold = %s
                  )
                LIMIT 500
            """, [fraction, event_type])

            for ticket in at_risk_tickets:
                self.handle_escalation(ticket, "first_response", fraction, event_type)

    def handle_escalation(self, ticket, sla_type, fraction, event_type):
        """Apply escalation action based on threshold."""
        if fraction >= 1.0:
            # SLA breached -- record breach
            create_sla_breach(ticket, sla_type)
            emit_event("sla.breached", {
                "ticket_id": ticket.id,
                "breach_type": sla_type,
                "org_id": ticket.org_id,
            })

        # Record that we handled this threshold (prevent duplicate alerts)
        record_escalation(ticket.id, event_type)

        # Execute escalation actions from org config
        escalation_config = get_escalation_config(ticket.org_id, fraction)
        for action in escalation_config.actions:
            execute_escalation_action(ticket, action)
```

### SLA Dashboard Data

```
SLA Compliance Dashboard:
+------------------------------------------------------+
|  SLA Compliance - Last 30 Days                       |
+------------------------------------------------------+
|                                                      |
|  First Response SLA                                  |
|  ┌────────────────────────────────────────────────┐  |
|  │ ████████████████████████████████████░░░░ 91.2% │  |
|  └────────────────────────────────────────────────┘  |
|  Target: 95%  |  Breached: 879 / 10,000              |
|                                                      |
|  Resolution SLA                                      |
|  ┌────────────────────────────────────────────────┐  |
|  │ ██████████████████████████████████████░░ 94.5%  │  |
|  └────────────────────────────────────────────────┘  |
|  Target: 90%  |  Breached: 550 / 10,000              |
|                                                      |
|  By Priority:                                        |
|  +----------+--------+-----------+--------+          |
|  | Priority | Target | Achieved  | Status |          |
|  +----------+--------+-----------+--------+          |
|  | Urgent   | 30 min | 28 min    | PASS   |          |
|  | High     | 1 hr   | 52 min    | PASS   |          |
|  | Normal   | 4 hr   | 4.2 hr    | FAIL   |          |
|  | Low      | 8 hr   | 5.1 hr    | PASS   |          |
|  +----------+--------+-----------+--------+          |
+------------------------------------------------------+
```

---

## Deep Dive: Multi-Channel Intake

### Channel Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    MULTI-CHANNEL INTAKE                          │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  EMAIL   │  │   CHAT   │  │ WEB FORM │  │   API    │       │
│  │          │  │          │  │          │  │          │       │
│  │ SMTP/    │  │ WebSocket│  │ REST     │  │ REST/    │       │
│  │ IMAP     │  │ Session  │  │ POST     │  │ Webhook  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─��──┬─────┘       │
│       │             │             │             │              │
│       v             v             v             v              │
│  ┌──────────────────────────────────────────────────────┐      │
│  │           CHANNEL NORMALIZER                         │      │
│  │                                                      │      │
│  │  - Extract subject, body, sender, attachments        │      │
│  │  - Detect language                                   │      │
│  │  - Map to unified ticket schema                      │      │
│  │  - Deduplicate (email Message-ID, idempotency keys)  │      │
│  │  - Match to existing ticket (threading)              │      │
│  └──────────────────────┬───────────────────────────────┘      │
│                         │                                       │
│                         v                                       │
│              ┌─────────────────────┐                           │
│              │  TICKET SERVICE     │                           │
│              │  (create or update)  │                           │
│              └─────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

### Email-to-Ticket Processing

```python
class EmailProcessor:
    """
    Processes inbound emails into tickets.

    Email routing: Each tenant gets a support address like
    support@{subdomain}.ticketsystem.com
    Inbound emails are received via webhook from an email provider
    (SendGrid, Mailgun, AWS SES).
    """

    def process_inbound_email(self, raw_email):
        """Parse raw email and create or update a ticket."""
        parsed = self.parse_email(raw_email)

        # Determine tenant from recipient address
        org = self.resolve_org(parsed.to_address)
        if org is None:
            return  # bounce or ignore

        # Check if this is a reply to an existing ticket
        existing_ticket = self.find_existing_ticket(parsed, org.id)

        if existing_ticket:
            return self.add_reply_to_ticket(existing_ticket, parsed)

        return self.create_ticket_from_email(org, parsed)

    def parse_email(self, raw_email):
        """Extract structured data from raw email."""
        return {
            "message_id": extract_header("Message-ID"),
            "in_reply_to": extract_header("In-Reply-To"),
            "references": extract_header("References"),
            "from_address": extract_header("From"),
            "from_name": extract_name("From"),
            "to_address": extract_header("To"),
            "subject": extract_header("Subject"),
            "body_text": extract_text_body(raw_email),
            "body_html": extract_html_body(raw_email),
            "attachments": extract_attachments(raw_email),
            "received_at": now(),
        }

    def find_existing_ticket(self, parsed, org_id):
        """Thread email into existing ticket via Message-ID references."""
        # Check In-Reply-To header
        if parsed["in_reply_to"]:
            ticket = find_ticket_by_message_id(org_id, parsed["in_reply_to"])
            if ticket:
                return ticket

        # Check References header chain
        if parsed["references"]:
            for ref in reversed(parsed["references"].split()):
                ticket = find_ticket_by_message_id(org_id, ref.strip())
                if ticket:
                    return ticket

        # Fallback: check subject line for ticket ID pattern [#12345]
        ticket_id_match = re.search(r'\[#(\d+)\]', parsed["subject"])
        if ticket_id_match:
            return find_ticket_by_external_id(org_id, ticket_id_match.group(1))

        return None

    def create_ticket_from_email(self, org, parsed):
        """Create a new ticket from an inbound email."""
        customer = find_or_create_customer(org.id, parsed["from_address"], parsed["from_name"])

        attachments = []
        for att in parsed["attachments"]:
            url = upload_to_object_storage(att["filename"], att["content"], att["content_type"])
            attachments.append({
                "filename": att["filename"],
                "url": url,
                "size": len(att["content"]),
                "content_type": att["content_type"],
            })

        ticket = create_ticket({
            "org_id": org.id,
            "subject": strip_re_fwd(parsed["subject"]),
            "channel": "email",
            "source_ref": parsed["message_id"],
            "requester_id": customer.id,
            "priority": "normal",  # may be overridden by automation
        })

        add_comment({
            "ticket_id": ticket.id,
            "author_id": customer.id,
            "author_type": "customer",
            "body": parsed["body_text"],
            "body_html": parsed["body_html"],
            "message_id": parsed["message_id"],
            "attachments": attachments,
            "is_internal": False,
        })

        return ticket
```

### Chat-to-Ticket Conversion

```python
def convert_chat_to_ticket(chat_session):
    """
    Convert a completed chat session into a ticket for follow-up.
    Called when:
    1. Chat agent cannot resolve in real-time
    2. Chat session ends without resolution
    3. Customer requests email follow-up
    """
    transcript = build_chat_transcript(chat_session.messages)

    ticket = create_ticket({
        "org_id": chat_session.org_id,
        "subject": chat_session.topic or f"Chat conversation on {chat_session.started_at}",
        "channel": "chat",
        "source_ref": chat_session.id,
        "requester_id": chat_session.customer_id,
        "assignee_id": chat_session.agent_id,  # keep same agent
        "priority": "normal",
    })

    # Add full transcript as first comment
    add_comment({
        "ticket_id": ticket.id,
        "author_type": "system",
        "body": transcript,
        "is_internal": False,
    })

    # Add internal note with chat metadata
    add_comment({
        "ticket_id": ticket.id,
        "author_type": "system",
        "body": (
            f"Converted from chat session {chat_session.id}.\n"
            f"Duration: {chat_session.duration_minutes} min\n"
            f"Messages exchanged: {len(chat_session.messages)}\n"
            f"Customer sentiment: {chat_session.sentiment}"
        ),
        "is_internal": True,
    })

    return ticket
```

### Channel Unification Rules

```
Channel Unification:
+------------------+---------------------+----------------------------+
| Channel          | Ticket Creation     | Threading                   |
+------------------+---------------------+----------------------------+
| Email            | Auto-create on      | In-Reply-To / References    |
|                  | new inbound email   | headers; [#ID] in subject   |
+------------------+---------------------+----------------------------+
| Chat             | Agent converts, or  | Chat session ID links       |
|                  | auto on timeout     | to ticket source_ref        |
+------------------+---------------------+----------------------------+
| Web Form         | Immediate creation  | Customer email used to      |
|                  | on submit           | link to existing customer   |
+------------------+---------------------+----------------------------+
| API              | POST /api/v1/tickets| Idempotency key prevents    |
|                  | from client system  | duplicates; external_id     |
+------------------+---------------------+----------------------------+
| Social Media     | Webhook from        | Platform thread ID          |
| (Twitter, FB)    | social monitoring   | tracks conversation         |
+------------------+---------------------+----------------------------+

De-duplication Strategy:
  1. Email: Message-ID is globally unique → store in comments.message_id
  2. API: Client sends Idempotency-Key header → store in Redis (TTL 24h)
  3. Web Form: Rate limit per customer email (max 5/minute)
  4. Chat: One ticket per chat session ID
```

---

## Deep Dive: Real-Time Collaboration

### Agent Collision Detection

```
Problem: Two agents open the same ticket simultaneously.
         Both type responses. One overwrites the other's work.

Solution: Real-time presence + optimistic locking

┌──────────────┐                    ┌──────────────┐
│   Agent A    │                    │   Agent B    │
│   (Chrome)   │                    │   (Firefox)  │
└──────┬───────┘                    └──────┬───────┘
       │                                    │
       │  Open ticket #123                  │
       │  ─────────────────>                │
       │                     WebSocket      │
       │  <── presence: "Agent A viewing"   │
       │                                    │
       │                          Open ticket #123
       │                          ─────────────────>
       │                                    │
       │  <── presence: "Agent B viewing"   │
       │  ┌──────────────────────┐          │
       │  │ ⚠ Agent B is also   │          │
       │  │ viewing this ticket  │          │
       │  └──────────────────────┘          │
       │                                    │
       │  Start typing reply                │
       │  ─────────────────>                │
       │                                    │
       │  <── "Agent A is typing..."        │
       │                          ┌─────────────────────┐
       │                          │ ⚠ Agent A is typing │
       │                          │   a reply...        │
       │                          └─────────────────────┘
```

### WebSocket Event System

```python
# WebSocket event types for real-time collaboration
EVENTS = {
    # Ticket updates (broadcast to all viewers)
    "ticket.updated":       "Ticket fields changed",
    "ticket.status_changed": "Status transition",
    "ticket.assigned":       "New assignee",

    # Comment events
    "comment.added":        "New comment on ticket",
    "comment.edited":       "Comment text modified",

    # Presence events (per-ticket)
    "presence.viewing":     "Agent opened this ticket",
    "presence.left":        "Agent closed this ticket",
    "presence.typing":      "Agent is composing a reply",
    "presence.stopped_typing": "Agent stopped typing",

    # SLA events
    "sla.warning":          "SLA approaching breach",
    "sla.breached":         "SLA has been breached",

    # Queue events
    "queue.new_ticket":     "New ticket in agent's queue",
    "queue.ticket_removed": "Ticket removed from queue",
}

class TicketWebSocketManager:
    """Manages real-time events for ticket collaboration."""

    def __init__(self):
        self.redis_pubsub = Redis()

    def subscribe_to_ticket(self, agent_id, ticket_id, ws_connection):
        """Subscribe an agent to real-time updates for a ticket."""
        channel = f"ticket:{ticket_id}"

        # Publish presence event
        self.redis_pubsub.publish(channel, json.dumps({
            "type": "presence.viewing",
            "agent_id": agent_id,
            "agent_name": get_agent_name(agent_id),
            "timestamp": now().isoformat(),
        }))

        # Track active viewers in Redis sorted set (score = timestamp)
        self.redis_pubsub.zadd(
            f"viewers:{ticket_id}",
            {str(agent_id): time.time()}
        )

        # Subscribe connection to channel
        self.redis_pubsub.subscribe(channel, callback=ws_connection.send)

    def broadcast_ticket_update(self, ticket_id, event_type, payload):
        """Broadcast an event to all agents viewing a ticket."""
        channel = f"ticket:{ticket_id}"
        self.redis_pubsub.publish(channel, json.dumps({
            "type": event_type,
            **payload,
            "timestamp": now().isoformat(),
        }))

    def get_active_viewers(self, ticket_id):
        """Get list of agents currently viewing a ticket."""
        cutoff = time.time() - 300  # 5-minute heartbeat timeout
        return self.redis_pubsub.zrangebyscore(
            f"viewers:{ticket_id}", cutoff, "+inf"
        )
```

### Internal Notes and @Mentions

```python
def add_comment_with_mentions(ticket_id, author_id, body, is_internal):
    """Add a comment, extract @mentions, and notify mentioned agents."""
    # Extract @mentions from comment body
    mentions = extract_mentions(body)  # returns list of agent IDs

    comment = add_comment({
        "ticket_id": ticket_id,
        "author_id": author_id,
        "author_type": "agent",
        "body": body,
        "is_internal": is_internal,
        "mentions": mentions,
    })

    # Notify mentioned agents
    for agent_id in mentions:
        send_notification(agent_id, {
            "type": "mention",
            "message": f"You were mentioned in ticket #{ticket_id}",
            "ticket_id": ticket_id,
            "comment_id": comment.id,
            "mentioned_by": author_id,
        })

        # Auto-add as follower
        add_follower(ticket_id, agent_id)

    # Notify all followers of the ticket
    followers = get_followers(ticket_id)
    for follower_id in followers:
        if follower_id != author_id:
            send_notification(follower_id, {
                "type": "new_comment",
                "ticket_id": ticket_id,
                "comment_id": comment.id,
                "is_internal": is_internal,
            })

    return comment

def extract_mentions(body):
    """Extract @mentioned agents from comment text."""
    # Pattern: @[Agent Name](agent:123)
    pattern = r'@\[([^\]]+)\]\(agent:(\d+)\)'
    matches = re.findall(pattern, body)
    return [int(agent_id) for _, agent_id in matches]
```

---

## Deep Dive: Knowledge Base & Self-Service

### Knowledge Base Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 CUSTOMER PORTAL                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Search Bar   │  │  Article     │  │  Submit       │  │
│  │              │  │  Browser     │  │  Ticket       │  │
│  │ "How do I    │  │              │  │              │  │
│  │  reset my    │  │ Categories:  │  │  (shown only  │  │
│  │  password?"  │  │ - Getting    │  │  if articles  │  │
│  │              │  │   Started    │  │  don't solve  │  │
│  │              │  │ - Billing    │  │  the issue)   │  │
│  │              │  │ - API Docs   │  │              │  │
│  └──────┬───────┘  └──────────────┘  └───────────────┘  │
│         │                                                │
│         v                                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │         AI-POWERED SEARCH & SUGGESTIONS          │    │
│  │                                                  │    │
│  │  1. Keyword search (Elasticsearch)               │    │
│  │  2. Semantic search (vector embeddings)          │    │
���  │  3. Rank by relevance + view count + helpfulness │    │
│  │  4. Track deflection (customer did NOT submit    │    │
│  │     a ticket after viewing article)              │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Article Suggestion for Agents

```python
def suggest_articles_for_ticket(ticket):
    """
    Suggest relevant knowledge base articles for an open ticket.
    Used by agents to quickly find solutions and by the customer portal
    to deflect tickets before submission.
    """
    # Build search query from ticket content
    query_text = f"{ticket.subject} {ticket.description}"

    # Hybrid search: keyword + semantic
    keyword_results = elasticsearch.search(
        index=f"articles_{ticket.org_id}",
        query={
            "bool": {
                "must": [
                    {"multi_match": {
                        "query": query_text,
                        "fields": ["title^3", "body"],
                        "type": "best_fields"
                    }},
                    {"term": {"status": "published"}}
                ]
            }
        },
        size=10
    )

    # Semantic search using embeddings
    query_embedding = embedding_model.encode(query_text)
    vector_results = pgvector.query(
        "SELECT id, title, 1 - (embedding <=> %s) AS similarity "
        "FROM articles WHERE org_id = %s AND status = 'published' "
        "ORDER BY embedding <=> %s LIMIT 10",
        [query_embedding, ticket.org_id, query_embedding]
    )

    # Merge and re-rank results
    combined = merge_results(keyword_results, vector_results)
    reranked = rerank_by_helpfulness(combined)

    return reranked[:5]

def track_deflection(customer_id, article_id, org_id):
    """
    Track when a customer views an article and does NOT submit a ticket.
    Called when customer leaves the help center without creating a ticket.
    """
    record_event("article.deflection", {
        "customer_id": customer_id,
        "article_id": article_id,
        "org_id": org_id,
        "timestamp": now(),
    })

    increment_counter(f"article:{article_id}:deflections")
```

### Deflection Metrics

```
Knowledge Base Effectiveness:
+------------------------------------------------------+
|  Deflection Rate: 34.2% (target: 30%)               |
|  ──────────────────────────────────────              |
|                                                      |
|  Top Deflecting Articles (this month):               |
|  +----+-------------------------------+--------+----+
|  | #  | Article Title                 | Views  | Defl|
|  +----+-------------------------------+--------+----+
|  | 1  | How to reset your password    | 12,400 | 62% |
|  | 2  | Billing FAQ                   |  8,200 | 48% |
|  | 3  | API rate limits explained     |  5,100 | 55% |
|  | 4  | Connecting your email account |  4,800 | 41% |
|  | 5  | Troubleshooting login issues  |  4,200 | 37% |
|  +----+-------------------------------+--------+----+
|                                                      |
|  Articles Needing Improvement (low helpfulness):     |
|  +----+-------------------------------+--------+----+
|  | #  | Article Title                 | Helpful| Defl|
|  +----+-------------------------------+--------+----+
|  | 1  | Setting up SSO                |   22%  | 11% |
|  | 2  | Data export guide             |   31%  | 15% |
|  | 3  | Webhook configuration         |   28%  | 13% |
|  +----+-------------------------------+--------+----+
+------------------------------------------------------+
```

---

## Deep Dive: AI/ML Integration

### AI Pipeline for Ticket Processing

```
                    New Ticket
                        │
                        v
              ┌─────────────────────┐
              │  AI ENRICHMENT      │
              │  PIPELINE           │
              └─────────┬───────────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
          v             v                 v
   ┌────────────┐ ┌──────────────┐ ┌────────────────┐
   │ CLASSIFIER │ │  SENTIMENT   │ │  LANGUAGE      │
   │            │ │  ANALYZER    │ │  DETECTOR      │
   │ Priority:  │ │              │ │                │
   │  urgent/   │ │  positive/   │ │  en/es/fr/     │
   │  high/     │ │  neutral/    │ │  de/ja/zh/...  │
   │  normal/   │ │  negative/   │ │                │
   │  low       │ │  angry       │ │                │
   │            │ │              │ │                │
   │ Category:  │ │  Confidence: │ │                │
   │  billing/  │ │  0.0 - 1.0   │ │                │
   │  technical/│ │              │ │                │
   │  account/  │ │              │ │                │
   │  feature/  │ │              │ │                │
   └──────┬─────┘ └──────┬───────┘ └───────┬────────┘
          │              │                  │
          v              v                  v
   ┌────────────────────────────────────────────────┐
   │          SUGGESTED RESPONSE ENGINE             │
   │                                                │
   │  1. Retrieve similar resolved tickets          │
   │  2. Match knowledge base articles              │
   │  3. Generate draft response via LLM            │
   │  4. Agent reviews and sends (human-in-loop)    │
   └────────────────────────────────────────────────┘
```

### Auto-Classification

```python
class TicketClassifier:
    """
    Classifies tickets by priority and category using a fine-tuned model.
    Trained on historical ticket data with agent-assigned labels.
    """

    def classify(self, ticket):
        """Classify a ticket's priority and category."""
        text = f"{ticket.subject}\n\n{ticket.description}"

        # Priority classification
        priority_result = self.priority_model.predict(text)
        # Category classification
        category_result = self.category_model.predict(text)

        return {
            "ai_priority": priority_result.label,
            "ai_priority_confidence": priority_result.confidence,
            "ai_category": category_result.label,
            "ai_category_confidence": category_result.confidence,
        }

    def auto_apply(self, ticket, classification):
        """
        Auto-apply classification only if confidence exceeds threshold.
        Otherwise, suggest to the agent.
        """
        updates = {}

        if classification["ai_priority_confidence"] > 0.85:
            updates["priority"] = classification["ai_priority"]

        if classification["ai_category_confidence"] > 0.80:
            updates["category"] = classification["ai_category"]

        if updates:
            update_ticket(ticket.id, updates)
            log_audit("ai_auto_classified", ticket.id, updates)

        return updates
```

### Suggested Responses with LLM

```python
def generate_suggested_response(ticket, comments):
    """
    Generate a draft response for the agent using an LLM.
    Agent must review and approve before sending.
    """
    # Retrieve context
    similar_tickets = find_similar_resolved_tickets(ticket, limit=3)
    relevant_articles = suggest_articles_for_ticket(ticket)

    # Build prompt
    prompt = f"""You are a customer support agent for {ticket.org_name}.

Customer Ticket:
Subject: {ticket.subject}
Description: {ticket.description}
Priority: {ticket.priority}
Category: {ticket.category}

Conversation History:
{format_comments(comments)}

Similar Resolved Tickets:
{format_similar_tickets(similar_tickets)}

Relevant Knowledge Base Articles:
{format_articles(relevant_articles)}

Draft a helpful, professional response to the customer.
Be empathetic, concise, and provide actionable next steps.
Do not make up information not found in the knowledge base or ticket history.
"""

    response = llm.generate(
        prompt=prompt,
        max_tokens=500,
        temperature=0.3,  # low temperature for consistency
    )

    return {
        "suggested_response": response.text,
        "sources": {
            "similar_tickets": [t.id for t in similar_tickets],
            "articles": [a.id for a in relevant_articles],
        },
        "confidence": response.confidence,
    }
```

### Chatbot Handoff to Agent

```python
def chatbot_handoff_decision(conversation):
    """
    Decide whether the chatbot should hand off to a human agent.

    Handoff triggers:
    1. Customer explicitly asks for a human
    2. Sentiment turns negative (anger/frustration detected)
    3. Chatbot confidence drops below threshold for 2+ turns
    4. Conversation exceeds max turns without resolution
    5. Topic is in "always handoff" list (billing disputes, legal)
    """
    reasons = []

    # Check explicit request
    last_message = conversation.messages[-1].text.lower()
    human_keywords = ["speak to a human", "real person", "agent", "representative"]
    if any(kw in last_message for kw in human_keywords):
        reasons.append("customer_requested_human")

    # Check sentiment
    sentiment = analyze_sentiment(last_message)
    if sentiment.label in ("angry", "frustrated") and sentiment.confidence > 0.7:
        reasons.append("negative_sentiment")

    # Check bot confidence
    low_confidence_turns = sum(
        1 for m in conversation.messages[-3:]
        if m.author_type == "bot" and m.confidence < 0.5
    )
    if low_confidence_turns >= 2:
        reasons.append("low_bot_confidence")

    # Check turn count
    if len(conversation.messages) > 10:
        reasons.append("max_turns_exceeded")

    # Check always-handoff topics
    always_handoff = ["billing_dispute", "account_cancellation", "legal"]
    if conversation.detected_topic in always_handoff:
        reasons.append("mandatory_handoff_topic")

    should_handoff = len(reasons) > 0

    if should_handoff:
        ticket = convert_chat_to_ticket(conversation)
        notify_agent_of_handoff(ticket, reasons)

    return {"handoff": should_handoff, "reasons": reasons}
```

---

## Deep Dive: Reporting & Analytics

### Core Metrics

```
Agent Performance Dashboard:
+----------------------------------------------------------------------+
|                                                                      |
|  Agent: Sarah Chen    |    Period: Last 7 Days    |    Team: Billing  |
|                                                                      |
|  ┌─────────────────────┐  ┌─────────────────────┐                   |
|  │ Tickets Resolved    │  │ First Response Time  │                   |
|  │       142           │  │     23 min (avg)     │                   |
|  │  ▲ 12% vs last week │  │  ▼ 15% vs last week │                   |
|  └─────────────────────┘  └─────────────────────┘                   |
|                                                                      |
|  ┌─────────────────────┐  ┌─────────────────────┐                   |
|  │ CSAT Score          │  │ SLA Compliance       │                   |
|  │     4.6 / 5.0       │  │       97.2%          │                   |
|  │  ████████████████░░  │  │  ████████████████░░  │                   |
|  └─────────────────────┘  └─────────────────────┘                   |
|                                                                      |
|  Resolution Time Distribution:                                       |
|  < 1 hr  ████████████████████  45%                                   |
|  1-4 hr  ████████████         28%                                    |
|  4-8 hr  ██████               15%                                    |
|  8-24 hr ███                   8%                                    |
|  > 24 hr ██                    4%                                    |
|                                                                      |
+----------------------------------------------------------------------+
```

### CSAT Survey System

```python
def send_csat_survey(ticket):
    """
    Send a CSAT survey after ticket resolution.
    Triggered when ticket transitions to 'solved' status.
    """
    # Don't send for internal tickets or merged tickets
    if ticket.merged_into_id or ticket.channel == "internal":
        return

    # Rate limit: max 1 survey per customer per 7 days
    recent_survey = find_recent_survey(ticket.requester_id, days=7)
    if recent_survey:
        return

    survey = create_survey({
        "ticket_id": ticket.id,
        "org_id": ticket.org_id,
        "requester_id": ticket.requester_id,
        "assignee_id": ticket.assignee_id,
        "question": "How would you rate the support you received?",
        "scale": "good_bad",  # simple good/bad or 1-5 scale
        "sent_at": now(),
        "expires_at": now() + timedelta(days=7),
    })

    send_notification(ticket.requester_id, {
        "type": "csat_survey",
        "channel": ticket.channel,
        "survey_id": survey.id,
        "ticket_id": ticket.id,
    })

def record_csat_response(survey_id, rating, comment):
    """Record a CSAT response and update ticket + agent metrics."""
    survey = get_survey(survey_id)

    if survey.expires_at < now():
        raise SurveyExpiredError()

    update_survey(survey_id, {
        "rating": rating,
        "comment": comment,
        "responded_at": now(),
    })

    # Update ticket satisfaction field
    satisfaction = "good" if rating >= 4 else "bad"
    update_ticket(survey.ticket_id, {"satisfaction": satisfaction})

    # Update agent rolling CSAT score
    update_agent_csat(survey.assignee_id, rating)

    # If negative, trigger alert for team lead
    if rating <= 2:
        alert_team_lead(survey.assignee_id, survey.ticket_id, rating, comment)
```

### Queue Health Monitoring

```
Queue Health Dashboard:
+----------------------------------------------------------------------+
|                                                                      |
|  Queue Overview (Real-Time)                                          |
|                                                                      |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | Queue            | Open   | New    | Avg    | SLA At  | Agents  | |
|  |                  | Tickets| (1hr)  | Wait   | Risk    | Online  | |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | Billing          |   45   |   12   | 18 min |    3    |   8/12  | |
|  | Technical        |   89   |   23   | 42 min |   11    |  15/20  | |
|  | Account Access   |   23   |    8   |  8 min |    0    |   5/6   | |
|  | Enterprise       |   12   |    2   |  5 min |    0    |   4/4   | |
|  | General          |   67   |   18   | 35 min |    7    |  10/15  | |
|  +------------------+--------+--------+--------+---------+---------+ |
|  | TOTAL            |  236   |   63   | 28 min |   21    |  42/57  | |
|  +------------------+--------+--------+--------+---------+---------+ |
|                                                                      |
|  Alerts:                                                             |
|  🔴 Technical queue: 11 tickets at SLA risk (need 5 more agents)     |
|  🟡 General queue: Avg wait time exceeds 30-min threshold            |
|  🟢 Enterprise queue: All SLAs on track                              |
|                                                                      |
+----------------------------------------------------------------------+
```

### Analytics Query Patterns

```sql
-- SLA compliance rate by team (last 30 days)
SELECT
    t2.name AS team_name,
    COUNT(*) AS total_tickets,
    COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
               THEN 1 END) AS first_response_met,
    COUNT(CASE WHEN tk.resolved_at <= tk.resolution_due
               THEN 1 END) AS resolution_met,
    ROUND(
        COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
                   THEN 1 END)::NUMERIC / COUNT(*) * 100, 1
    ) AS first_response_pct,
    ROUND(
        COUNT(CASE WHEN tk.resolved_at <= tk.resolution_due
                   THEN 1 END)::NUMERIC / COUNT(*) * 100, 1
    ) AS resolution_pct
FROM tickets tk
JOIN teams t2 ON t2.id = tk.team_id
WHERE tk.org_id = :org_id
  AND tk.created_at >= NOW() - INTERVAL '30 days'
  AND tk.status IN ('solved', 'closed')
GROUP BY t2.name
ORDER BY first_response_pct ASC;

-- Agent leaderboard (tickets resolved, CSAT, response time)
SELECT
    a.name AS agent_name,
    COUNT(tk.id) AS tickets_resolved,
    AVG(EXTRACT(EPOCH FROM (tk.first_response_at - tk.created_at)) / 60)
        AS avg_first_response_min,
    AVG(EXTRACT(EPOCH FROM (tk.resolved_at - tk.created_at)) / 60)
        AS avg_resolution_min,
    AVG(s.rating) AS avg_csat,
    COUNT(CASE WHEN tk.first_response_at <= tk.first_response_due
               THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100
        AS sla_compliance_pct
FROM agents a
JOIN tickets tk ON tk.assignee_id = a.id
LEFT JOIN surveys s ON s.ticket_id = tk.id AND s.rating IS NOT NULL
WHERE a.org_id = :org_id
  AND tk.resolved_at >= NOW() - INTERVAL '7 days'
GROUP BY a.id, a.name
ORDER BY tickets_resolved DESC;

-- Ticket volume trend (hourly, for capacity planning)
SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS ticket_count,
    COUNT(CASE WHEN priority = 'urgent' THEN 1 END) AS urgent_count,
    COUNT(CASE WHEN channel = 'email' THEN 1 END) AS email_count,
    COUNT(CASE WHEN channel = 'chat' THEN 1 END) AS chat_count
FROM tickets
WHERE org_id = :org_id
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour;
```

---

## Scaling Strategy

### Multi-Tenant Architecture

```
Tenant Isolation Strategy:
+-------------------------------------------------------------------+
|                                                                   |
|  Option 1: Shared Database, Shared Schema (chosen for scale)      |
|  ──────────────────────────────────────────                       |
|  All tenants in same database, org_id column on every table.      |
|  Row-Level Security (RLS) enforced at DB level.                   |
|                                                                   |
|  Pros: Simple ops, efficient resource usage, easy migrations      |
|  Cons: Noisy neighbor risk, single DB failure affects all         |
|                                                                   |
|  Mitigation: Shard by org_id range for large tenants              |
|                                                                   |
|  ┌─────────────────────────────────────────────────────────┐     |
|  │  PostgreSQL Cluster (Citus / Vitess sharding)           │     |
|  │                                                         │     |
|  │  Shard 1: org_id 1-10,000       (small tenants)         │     |
|  │  Shard 2: org_id 10,001-20,000  (small tenants)         │     |
|  │  ...                                                     │     |
|  │  Shard N: org_id 99,001-100,000 (small tenants)         │     |
|  │                                                         │     |
|  │  Dedicated Shard: org_id 500001  (enterprise tenant A)   │     |
|  │  Dedicated Shard: org_id 500002  (enterprise tenant B)   │     |
|  └─────────────────────────────────────────────────────────┘     |
|                                                                   |
|  Option 2: Shared Database, Separate Schema (mid-tier)            |
|  ──────────────────────────────────────────                       |
|  Each tenant gets its own schema. Good isolation, harder ops.     |
|                                                                   |
|  Option 3: Separate Database per Tenant (enterprise only)         |
|  ──────────────────────────────────────────                       |
|  Maximum isolation. Used for compliance-heavy customers.          |
+-------------------------------------------------------------------+

Chosen Approach: Hybrid
  - Small/Medium tenants: Shared schema, sharded by org_id hash
  - Enterprise tenants: Dedicated shard (same infra, isolated data)
  - Regulated tenants: Dedicated database in specific region
```

### Search Indexing Strategy

```
Elasticsearch Cluster Design:
+-------------------------------------------------------------------+
|                                                                   |
|  Index Strategy: Per-tenant index (for large tenants)             |
|                  Shared index with routing (for small tenants)    |
|                                                                   |
|  Small tenant (< 100K tickets):                                   |
|    Index: tickets_shared_shard_01                                 |
|    Routing key: org_id (all docs for one org on same shard)       |
|    Benefits: Efficient queries, simpler management                |
|                                                                   |
|  Large tenant (> 100K tickets):                                   |
|    Index: tickets_org_500001                                      |
|    Dedicated index with custom shard count                        |
|    Benefits: Independent scaling, no noisy-neighbor               |
|                                                                   |
|  Index Mapping:                                                   |
|  {                                                                |
|    "ticket_id":     keyword,                                      |
|    "org_id":        keyword (routing),                            |
|    "subject":       text (analyzed),                              |
|    "description":   text (analyzed),                              |
|    "comments":      nested [{ body: text, author: keyword }],     |
|    "status":        keyword,                                      |
|    "priority":      keyword,                                      |
|    "category":      keyword,                                      |
|    "tags":          keyword[],                                    |
|    "assignee_id":   keyword,                                      |
|    "requester_email": keyword,                                    |
|    "custom_fields": object (dynamic),                             |
|    "created_at":    date,                                         |
|    "updated_at":    date                                          |
|  }                                                                |
|                                                                   |
|  Cluster: 9 nodes (3 master, 6 data)                              |
|  Replication: 1 replica per shard                                 |
|  Refresh interval: 1 second (near-real-time)                      |
|  Retention: Hot (30 days SSD) → Warm (1 year HDD) → Cold (S3)    |
+-------------------------------------------------------------------+
```

### Real-Time Event Streaming

```
Kafka Topic Design:
+-------------------------------------------------------------------+
|                                                                   |
|  Topic: ticket.events                                             |
|    Partitions: 64 (keyed by org_id for ordering per tenant)       |
|    Retention: 7 days                                              |
|    Consumers:                                                     |
|      - search-indexer (Elasticsearch sync)                        |
|      - sla-monitor (SLA deadline checking)                        |
|      - notification-service (email, push, Slack)                  |
|      - analytics-aggregator (real-time dashboards)                |
|      - automation-engine (trigger-based rules)                    |
|      - ai-enrichment (classification, sentiment)                  |
|      - audit-log-writer (compliance log)                          |
|                                                                   |
|  Topic: agent.events                                              |
|    Partitions: 16                                                 |
|    Events: status_changed, capacity_updated, logged_in/out        |
|                                                                   |
|  Topic: email.inbound                                             |
|    Partitions: 32                                                 |
|    Events: raw email received from SMTP relay                     |
|    Consumer: email-processor service                              |
|                                                                   |
|  Event Schema (Avro):                                             |
|  {                                                                |
|    "event_id":    "evt_01HQ...",                                  |
|    "event_type":  "ticket.created",                               |
|    "org_id":      12345,                                          |
|    "entity_id":   "tkt_01HQ...",                                  |
|    "actor":       { "id": 67890, "type": "agent" },              |
|    "payload":     { ... },                                        |
|    "timestamp":   "2026-03-03T14:00:00.000Z",                    |
|    "version":     1                                               |
|  }                                                                |
|                                                                   |
|  Consumer Group Lag Monitoring:                                   |
|    Alert if any consumer group > 10,000 messages behind           |
|    SLA monitor consumer: alert if > 100 messages behind           |
+-------------------------------------------------------------------+
```

### Caching Strategy

```
Cache Layers:
+-------------------------------------------------------------------+
|                                                                   |
|  Layer 1: CDN (Cloudflare)                                        |
|    - Knowledge base articles (public)                             |
|    - Static assets (customer portal)                              |
|    - TTL: 5 minutes                                               |
|                                                                   |
|  Layer 2: Redis (Application Cache)                               |
|    - Agent session data: agent:{id} → {status, capacity, teams}   |
|      TTL: 10 min, refresh on heartbeat                            |
|    - Ticket hot data: ticket:{id}:summary → {status, assignee}    |
|      TTL: 1 min, invalidate on update                             |
|    - Org settings: org:{id}:settings → {sla, routing, etc.}      |
|      TTL: 5 min, invalidate on config change                      |
|    - SLA policy cache: org:{id}:sla_policies → [policies]         |
|      TTL: 5 min                                                   |
|    - Round-robin counters: rr:{org}:{team} → integer              |
|      No TTL (persistent counter)                                  |
|    - WebSocket presence: viewers:{ticket_id} → sorted set         |
|      TTL: auto-expire members after 5 min without heartbeat       |
|                                                                   |
|  Layer 3: Connection Pooling (PgBouncer)                          |
|    - Pool per shard, max 100 connections per pool                 |
|    - Transaction-level pooling                                    |
|                                                                   |
|  Cache Invalidation Strategy:                                     |
|    - Write-through for critical data (ticket status, SLA)         |
|    - Event-driven invalidation via Kafka consumers                |
|    - TTL-based expiry for non-critical data (settings, profiles)  |
+-------------------------------------------------------------------+
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT ARCHITECTURE                         │
│                                                                        │
│  Region: US-East                       Region: EU-West                 │
│  ┌────────────────────────────────┐   ┌────────────────────────────┐  │
│  │         Cloudflare CDN         │   │       Cloudflare CDN       │  │
│  └──────────────┬─────────────────┘   └──────────────┬─────────────┘  │
│                 │                                     │                │
│  ┌──────────────v─────────────────┐   ┌──────────────v─────────────┐  │
│  │     ALB (Application LB)       │   │     ALB (Application LB)   │  │
│  └──────────────┬─────────────────┘   └──────────────┬─────────────┘  │
│                 │                                     │                │
│  ┌──────────────v─────────────────┐   ┌──────────────v─────────────┐  │
│  │   Kubernetes Cluster (EKS)     │   │   Kubernetes Cluster (EKS) │  │
│  │                                │   │                            │  │
│  │  ┌───────────────────────────┐ │   │  ┌───────────────────────┐ │  │
│  │  │ API Gateway (Kong)        │ │   │  │ API Gateway (Kong)    │ │  │
│  │  │ - Auth, Rate Limit        │ │   │  │ - Auth, Rate Limit    │ │  │
│  │  │ - Tenant Identification   │ │   │  │ - Tenant Ident.       │ │  │
│  │  └───────────┬───────────────┘ │   │  └───────────┬───────────┘ │  │
│  │              │                  │   │              │              │  │
│  │  ┌───────────v───────────────┐ │   │  (Same service topology    │  │
│  │  │ Microservices             │ │   │   as US-East)              │  │
│  │  │                           │ │   │                            │  │
│  │  │ ticket-service   (6 pods) │ │   └────────────────────────────┘  │
│  │  │ comment-service  (4 pods) │ │                                   │
│  │  │ routing-engine   (3 pods) │ │   Shared Services:               │
│  │  │ sla-monitor      (2 pods) │ │   ┌────────────────────────────┐  │
│  │  │ notification-svc (4 pods) │ │   │  Kafka Cluster             │  │
│  │  │ search-indexer   (3 pods) │ │   │  (3 brokers, cross-region) │  │
│  │  │ email-processor  (4 pods) │ │   └────────────────────────────┘  │
│  │  │ ai-service       (3 pods) │ │                                   │
│  │  │ analytics-svc    (2 pods) │ │   ┌────────────────────────────┐  │
│  │  │ automation-engine(2 pods) │ │   │  Object Storage (S3)       │  │
│  │  │ websocket-gw     (4 pods) │ │   │  (attachments, exports)    │  │
│  │  └───────────────────────────┘ │   └────────────────────────────┘  │
│  │                                │                                   │
│  │  Data Layer:                   │                                   │
│  │  ┌───────────────────────────┐ │                                   │
│  │  │ PostgreSQL (Citus)        │ │                                   │
│  │  │ - 1 coordinator + 8 workers│ │                                   │
│  │  │ - Read replicas (2x)      │ │                                   │
│  │  │                           │ │                                   │
│  │  │ Redis Cluster (6 nodes)   │ │                                   │
│  │  │ - Cache + Pub/Sub + Queues│ │                                   │
│  │  │                           │ │                                   │
│  │  │ Elasticsearch (9 nodes)   │ │                                   │
│  │  │ - 3 master + 6 data       │ │                                   │
│  │  └───────────────────────────┘ │                                   │
│  └────────────────────────────────┘                                   │
│                                                                        │
│  Monitoring:                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Datadog (metrics + traces) | PagerDuty (alerts) | Sentry (errors)│  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Trade-offs

### Push vs. Pull for Agent Queue

| Dimension | Push (auto-assign) | Pull (agent picks from queue) |
|-----------|-------------------|-------------------------------|
| Agent autonomy | Low - system decides | High - agent chooses |
| Fairness | Even distribution guaranteed | Some agents cherry-pick easy tickets |
| Response time | Faster (immediate assignment) | Slower (depends on agent initiative) |
| Agent satisfaction | Lower (feeling of being "fed") | Higher (sense of control) |
| SLA compliance | Better (system optimizes for SLA) | Riskier (hard tickets ignored) |

**Decision: Hybrid -- auto-assign urgent/high priority tickets; let agents pull normal/low from queue**

### Relational DB vs. NoSQL for Tickets

| Dimension | PostgreSQL (chosen) | MongoDB / DynamoDB |
|-----------|--------------------|--------------------|
| Schema flexibility | Moderate (JSONB for custom fields) | High (schemaless) |
| Complex queries | Excellent (SQL joins, aggregations) | Limited (denormalized reads) |
| Transactions | Full ACID | Limited / eventual consistency |
| Multi-tenant partitioning | Row-level security + sharding | Collection-per-tenant or partition key |
| Reporting | Native SQL analytics | Requires ETL to analytics DB |
| Operational maturity | Very high | High |

**Decision: PostgreSQL with JSONB for custom fields -- best balance of structure and flexibility for a multi-tenant ticketing system**

### Synchronous vs. Asynchronous Processing

| Dimension | Synchronous | Asynchronous (event-driven) |
|-----------|-------------|----------------------------|
| Latency | Lower for simple operations | Higher (queue processing) |
| Reliability | Coupled failure modes | Decoupled, resilient |
| Throughput | Limited by slowest step | Each service scales independently |
| Consistency | Strong | Eventually consistent |
| Complexity | Simple | Higher (event ordering, idempotency) |

**Decision: Synchronous for ticket CRUD (users expect immediate feedback); asynchronous for SLA monitoring, search indexing, notifications, AI enrichment**

---

## Common Interview Follow-ups

**Q: How do you handle a noisy tenant that sends 100x more tickets than average?**

Per-tenant rate limiting at the API gateway level. Each tenant has a tier-based rate limit (free: 100 tickets/hour, pro: 10,000/hour, enterprise: custom). Beyond rate limits, use fair-use scheduling in Kafka consumers: partition by org_id and apply weighted fair queuing so one tenant's burst doesn't starve others. For truly extreme cases, large tenants get dedicated shards and dedicated consumer group instances. Monitor per-tenant QPS in real-time and alert on anomalies.

**Q: How would you migrate from a monolith to this microservices architecture?**

Strangler fig pattern. Start with the monolith handling everything. Extract services one at a time, starting with the least coupled (e.g., notification service, then search indexer). Use the event bus (Kafka) as the integration layer. Run both old and new paths in parallel with shadow mode (new service processes events but results are discarded, comparing with monolith output). Cut over one service at a time. The ticket service (core CRUD) is the last to migrate since everything depends on it.

**Q: How do you ensure exactly-once processing for SLA breach detection?**

Use idempotent event processing. Each SLA check produces an escalation record with a composite key: (ticket_id, threshold_level, sla_type). Before creating a breach record, check if one already exists for that key (INSERT ... ON CONFLICT DO NOTHING). The SLA monitor processes events from Kafka with at-least-once delivery, but the deduplication at the database level ensures each breach is recorded exactly once. Consumer offsets are committed only after successful processing.

**Q: How do you handle data residency requirements (GDPR, data sovereignty)?**

Deploy regional clusters (US, EU, APAC). Each organization is assigned a home region at signup based on their location or explicit choice. All ticket data stays within that region's database and search cluster. Kafka topics are per-region (no cross-region replication of PII). Global services (auth, billing) store only non-PII metadata. For customers needing specific country-level residency, offer dedicated database instances in the required country. Implement data export (GDPR Article 20) and right-to-erasure (Article 17) as automated workflows that purge data across all stores: PostgreSQL, Elasticsearch, Redis, S3 attachments, and Kafka tombstone records.

**Q: What happens when the SLA monitor service goes down?**

The SLA monitor is stateless and pulls work from the database, so it can simply restart. However, during downtime, SLA breaches may not be detected immediately. Mitigation: (1) Run at least 2 replicas with leader election for the polling loop; (2) SLA check timestamps are persisted, so on restart the service catches up by scanning all tickets with SLA deadlines between last-check-time and now; (3) SLA due times are stored on the ticket itself (first_response_due, resolution_due), so a simple query finds all currently-breached tickets. Maximum detection delay equals the poll interval (30 seconds) plus restart time.

**Q: How would you implement a ticket merge feature?**

Ticket merge is a soft operation. When ticket B is merged into ticket A: (1) Copy all comments from B to A (preserving timestamps and authorship); (2) Set B.merged_into_id = A.id; (3) Set B.status = 'closed' with a system comment noting the merge; (4) Move all followers from B to A; (5) Update customer's ticket references; (6) Redirect any future emails to B's thread to A instead. The original ticket B is preserved for audit purposes but hidden from default views. This is wrapped in a database transaction to ensure atomicity. Emit a ticket.merged event so search indexes and analytics update accordingly.

**Q: How do you handle ticket volume spikes during an outage (e.g., service goes down and 10,000 customers report it)?**

Multiple strategies: (1) Duplicate detection: use NLP similarity to group incoming tickets about the same issue and link them to a single "incident" ticket; (2) Auto-response: when an incident is declared, automatically respond to new tickets matching the incident pattern with a status update and the knowledge base article; (3) Proactive communication: trigger a status page update and email blast to affected customers, reducing inbound volume; (4) Bulk resolution: when the incident resolves, bulk-update all linked tickets with the resolution and close them. The routing engine temporarily suspends normal assignment for incident-related tickets and routes them to a dedicated incident queue.

**Q: How do you build a real-time dashboard that shows queue metrics for 50,000+ concurrent agents?**

The dashboard does not query the database directly. Instead: (1) A Kafka Streams or Flink job continuously aggregates ticket events into materialized views (tickets per queue, average wait time, SLA at-risk count); (2) These aggregates are stored in Redis as pre-computed counters updated every second; (3) The dashboard WebSocket service subscribes to Redis Pub/Sub for these aggregate updates; (4) Each agent's browser maintains a single WebSocket connection that receives only the queues they care about (filtered server-side); (5) Client-side, updates are applied to a local state that renders the dashboard without full re-fetches. This design handles 50,000 concurrent connections at approximately 1 update per second per connection.

---

## Summary

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary Database | PostgreSQL (Citus sharding) | ACID transactions, complex queries, JSONB for custom fields, mature ecosystem |
| Multi-tenancy | Shared schema with org_id + RLS | Operational simplicity; dedicated shards for enterprise |
| Event Streaming | Apache Kafka | Decouples services, enables async processing, reliable event sourcing |
| Search | Elasticsearch | Full-text search, faceted filtering, near-real-time indexing |
| Caching | Redis Cluster | Session data, pub/sub for WebSockets, round-robin counters, hot ticket cache |
| Real-time | WebSockets via Redis Pub/Sub | Agent collaboration, live ticket updates, presence detection |
| SLA Monitoring | Polling-based with catch-up | Simple, reliable, sub-minute detection; no complex timer scheduling |
| AI Integration | Async pipeline via Kafka | Non-blocking enrichment; human-in-the-loop for responses |
| Email Processing | Webhook-based (SendGrid/SES) | No SMTP server to manage; reliable delivery with retry |
| Attachment Storage | S3 (object storage) | Cost-effective, durable, CDN-friendly for serving |
| Deployment | Multi-region Kubernetes | Regional data residency, disaster recovery, low latency |
| Routing | Rule-based + skill-based hybrid | Flexible for diverse org needs; AI-assisted for advanced tenants |

### Critical Trade-offs Summary

```
+------------------------------------------------------------------+
| Trade-off Spectrum                                               |
+------------------------------------------------------------------+
|                                                                  |
| Consistency ◄──────────────────────────────────► Availability    |
|     ■■■■■■■■■■░░░░░                                             |
|     Strong consistency for ticket writes;                        |
|     eventual consistency for search/analytics                    |
|                                                                  |
| Simplicity ◄───────────────────────────────────► Flexibility     |
|          ■■■■■■■■■■■■■░░░                                       |
|     Microservices add complexity but enable                      |
|     independent scaling and deployment                           |
|                                                                  |
| Latency ◄─────────────────────────────────────► Throughput       |
|       ■■■■■■■■■■░░░░░                                           |
|     Synchronous for user-facing CRUD;                            |
|     async for background processing                              |
|                                                                  |
| Isolation ◄────────────────────────────────────► Efficiency      |
|          ■■■■■■■■■■■░░░░                                        |
|     Shared infrastructure for cost;                              |
|     dedicated resources for enterprise tenants                   |
|                                                                  |
+------------------------------------------------------------------+
```
