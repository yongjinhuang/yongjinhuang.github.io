# Design a Feature Flag System

A feature flag system (also called feature toggles) allows engineering teams to decouple code deployment from feature release by wrapping new functionality behind runtime-configurable flags. Systems like LaunchDarkly, Unleash, and Flagsmith provide centralized flag management, user targeting, percentage rollouts, A/B experimentation, and real-time propagation to server-side and client-side SDKs, enabling progressive delivery, canary releases, and instant kill switches without redeployment.

---

## Table of Contents

1. [Requirements Clarification](#1-requirements-clarification)
2. [API Design](#2-api-design)
3. [Data Model](#3-data-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Deep Dive: Flag Evaluation Engine](#5-deep-dive-flag-evaluation-engine)
6. [Deep Dive: Targeting Rules](#6-deep-dive-targeting-rules)
7. [Deep Dive: SDK Architecture](#7-deep-dive-sdk-architecture)
8. [Deep Dive: Real-Time Flag Updates](#8-deep-dive-real-time-flag-updates)
9. [Deep Dive: Experimentation & A/B Testing](#9-deep-dive-experimentation--ab-testing)
10. [Deep Dive: Flag Lifecycle Management](#10-deep-dive-flag-lifecycle-management)
11. [Deep Dive: Multi-Environment Support](#11-deep-dive-multi-environment-support)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Common Interview Follow-ups](#14-common-interview-follow-ups)
15. [Summary](#15-summary)

---

## 1. Requirements Clarification

### Functional Requirements

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Flag Creation & Management | Create boolean, string, number, and JSON multivariate flags with default values per environment |
| 2 | Targeting Rules | Evaluate flags against user attributes (email, country, plan, custom attributes) with AND/OR conditions |
| 3 | Percentage Rollout | Gradually roll out a flag to a percentage of users with consistent assignment (same user always sees the same value) |
| 4 | A/B Testing / Experimentation | Assign users to experiment variants, track events, and calculate statistical significance |
| 5 | Kill Switch | Instantly disable a flag globally across all environments and SDKs within seconds |
| 6 | Audit Log | Immutable record of every flag change, who made it, when, and what the previous value was |
| 7 | Segments | Define reusable groups of users (e.g., "Beta Testers", "Enterprise Customers") and target flags to segments |
| 8 | Scheduled Rollouts | Schedule flag state changes for a future date/time (e.g., launch at midnight) |
| 9 | Flag Dependencies | Define prerequisite flags — flag B only evaluates if flag A is enabled |
| 10 | Webhooks & Integrations | Notify external systems (Slack, Datadog, CI/CD) when flags change |
| 11 | SDK Support | Provide server-side SDKs (Node, Python, Go, Java) and client-side SDKs (JavaScript, React, iOS, Android) |
| 12 | Multi-Environment | Separate flag configurations for development, staging, and production environments |

### Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| 1 | Flag evaluation latency (server-side SDK) | < 1ms (local evaluation, no network call) |
| 2 | Flag evaluation latency (client-side SDK) | < 10ms (bootstrap from cache, then streaming updates) |
| 3 | Flag update propagation | < 500ms from save to all connected SDKs |
| 4 | Availability | 99.99% (< 52.6 min downtime/year) |
| 5 | SDK resilience | Graceful degradation to cached/default values when service is unreachable |
| 6 | Consistency | Same user always gets same flag value for a given flag configuration (sticky bucketing) |
| 7 | Scalability | 100K connected SDKs, 1B flag evaluations/day |
| 8 | Audit retention | 2 years hot, 7 years cold storage |
| 9 | Security | RBAC on projects/environments, API key scoping, no PII in flag rules |
| 10 | Multi-tenancy | Isolated projects per team with separate API keys and permissions |

### Capacity Estimation

```
Flag Configurations:
  Organizations:         10,000
  Projects per org:      5 (avg)
  Environments per proj: 3 (dev, staging, prod)
  Flags per project:     200 (avg)
  Total flag configs:    10K * 5 * 3 * 200 = 30M flag-environment pairs
  Avg config size:       2 KB (flag + rules + segments)
  Total config storage:  30M * 2 KB = 60 GB

SDK Connections:
  Server-side SDKs:      50,000 connected instances (long-lived)
  Client-side SDKs:      500,000 concurrent browser/mobile sessions
  Total connections:     550,000 persistent SSE/WebSocket connections

Flag Evaluations:
  Server-side:           500M evals/day (local, no network)
  Client-side:           500M evals/day (local after bootstrap)
  Total:                 1B evals/day
  Note: Evaluations happen locally in SDK — zero load on server

API Traffic (Management + Streaming):
  Flag config fetches:   550K initial bootstraps/hour (SDK restarts, new sessions)
  SSE connections:       550K persistent connections
  Management API:        10K flag changes/day (writes)
  Webhook deliveries:    10K/day * 3 integrations = 30K/day

Streaming Infrastructure:
  SSE connections per node: 50K (with epoll/kqueue)
  Nodes needed:          550K / 50K = 11 nodes (minimum)
  With 3x headroom:      33 nodes across 3 regions

Event Collection (Experimentation):
  Experiment events:     100M events/day
  Event size:            200 bytes
  Daily ingest:          100M * 200B = 20 GB/day
  Monthly storage:       600 GB/month

Audit Log:
  Flag changes/day:      10K
  Audit entry size:      1 KB (includes before/after snapshots)
  Daily:                 10 MB
  Annual:                3.6 GB (small — keep in PostgreSQL)
```

---

## 2. API Design

### Flag Management API

```
POST   /api/v1/projects/{projectId}/flags                Create a new flag
GET    /api/v1/projects/{projectId}/flags                List flags (with pagination, search, tags)
GET    /api/v1/projects/{projectId}/flags/{flagKey}      Get flag details
PUT    /api/v1/projects/{projectId}/flags/{flagKey}      Update flag metadata
DELETE /api/v1/projects/{projectId}/flags/{flagKey}      Archive a flag (soft delete)

PATCH  /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey}
       Update flag configuration for a specific environment (rules, rollout, enabled)

POST   /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey}/toggle
       Toggle flag on/off (kill switch)

GET    /api/v1/projects/{projectId}/flags/{flagKey}/audit
       Get audit history for a flag
```

**POST /api/v1/projects/{projectId}/flags Request:**
```json
{
  "key": "new-checkout-flow",
  "name": "New Checkout Flow",
  "description": "Redesigned checkout with single-page experience",
  "tags": ["checkout", "q1-2026"],
  "flagType": "boolean",
  "variations": [
    { "value": true, "name": "Enabled", "description": "Show new checkout" },
    { "value": false, "name": "Disabled", "description": "Show legacy checkout" }
  ],
  "defaults": {
    "onVariation": 0,
    "offVariation": 1
  },
  "temporary": true
}
```

**PATCH /api/v1/projects/{projectId}/flags/{flagKey}/environments/{envKey} Request:**
```json
{
  "enabled": true,
  "rules": [
    {
      "description": "Beta testers get new checkout",
      "clauses": [
        {
          "attribute": "segment",
          "op": "segmentMatch",
          "values": ["beta-testers"]
        }
      ],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 100000 }
        ]
      }
    },
    {
      "description": "10% rollout to all users",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 10000 },
          { "variation": 1, "weight": 90000 }
        ],
        "bucketBy": "userId"
      }
    }
  ],
  "fallthrough": {
    "variation": 1
  },
  "offVariation": 1
}
```

### Segment Management API

```
POST   /api/v1/projects/{projectId}/segments            Create a segment
GET    /api/v1/projects/{projectId}/segments            List segments
PUT    /api/v1/projects/{projectId}/segments/{segKey}   Update segment
DELETE /api/v1/projects/{projectId}/segments/{segKey}   Delete segment
```

**POST /api/v1/projects/{projectId}/segments Request:**
```json
{
  "key": "beta-testers",
  "name": "Beta Testers",
  "description": "Users who opted into the beta program",
  "rules": [
    {
      "clauses": [
        { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
      ]
    },
    {
      "clauses": [
        { "attribute": "plan", "op": "in", "values": ["enterprise", "business"] },
        { "attribute": "betaOptIn", "op": "eq", "values": [true] }
      ]
    }
  ],
  "included": ["user-123", "user-456"],
  "excluded": ["user-789"]
}
```

### Server-Side SDK Endpoints

```
GET    /sdk/v1/flags/{envKey}
       Fetch all flag configurations for an environment
       Headers: Authorization: sdk-key-{envKey}
       Response: Full flag ruleset for local evaluation

GET    /sdk/v1/flags/{envKey}/stream
       SSE stream of flag configuration changes
       Headers: Authorization: sdk-key-{envKey}
       Response: text/event-stream with incremental updates

POST   /sdk/v1/events/bulk
       Submit evaluation and analytics events in batch
       Headers: Authorization: sdk-key-{envKey}
```

### Client-Side SDK Endpoints

```
GET    /sdk/v1/evaluate/{envClientId}?user={base64UserContext}
       Evaluate all flags for a given user context (server-evaluated)
       Returns: pre-evaluated flag values (no rules exposed to client)

GET    /sdk/v1/evaluate/{envClientId}/stream?user={base64UserContext}
       SSE stream of evaluated flag values for a user
       Returns: updated flag values when configuration changes

POST   /sdk/v1/events/client
       Submit client-side events (impressions, goals)
```

**GET /sdk/v1/flags/{envKey} Response:**
```json
{
  "flags": {
    "new-checkout-flow": {
      "key": "new-checkout-flow",
      "version": 42,
      "enabled": true,
      "variations": [true, false],
      "rules": [
        {
          "clauses": [
            { "attribute": "segment", "op": "segmentMatch", "values": ["beta-testers"] }
          ],
          "rollout": { "variations": [{ "variation": 0, "weight": 100000 }] }
        },
        {
          "clauses": [],
          "rollout": {
            "variations": [
              { "variation": 0, "weight": 10000 },
              { "variation": 1, "weight": 90000 }
            ],
            "bucketBy": "userId"
          }
        }
      ],
      "fallthrough": { "variation": 1 },
      "offVariation": 1
    }
  },
  "segments": {
    "beta-testers": {
      "key": "beta-testers",
      "version": 7,
      "included": ["user-123", "user-456"],
      "excluded": ["user-789"],
      "rules": [
        {
          "clauses": [
            { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
          ]
        }
      ]
    }
  }
}
```

---

## 3. Data Model

### PostgreSQL Schema

```sql
-- Organizations and projects
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(256) NOT NULL,
    slug        VARCHAR(128) UNIQUE NOT NULL,
    plan        VARCHAR(32) DEFAULT 'free',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL,
    slug        VARCHAR(128) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, slug)
);

-- Environments (dev, staging, production)
CREATE TABLE environments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(128) NOT NULL,
    key             VARCHAR(64) NOT NULL,        -- "production", "staging", "development"
    color           VARCHAR(7),                  -- hex color for UI
    require_approval BOOLEAN DEFAULT FALSE,      -- require approval for changes
    sdk_key         VARCHAR(256) UNIQUE NOT NULL, -- server-side SDK key
    client_id       VARCHAR(256) UNIQUE NOT NULL, -- client-side SDK identifier
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

-- Feature flags
CREATE TABLE flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(256) NOT NULL,       -- "new-checkout-flow"
    name            VARCHAR(512) NOT NULL,       -- "New Checkout Flow"
    description     TEXT,
    flag_type       VARCHAR(16) NOT NULL,        -- 'boolean', 'string', 'number', 'json'
    variations      JSONB NOT NULL,              -- [{"value": true}, {"value": false}]
    tags            TEXT[],
    temporary       BOOLEAN DEFAULT FALSE,       -- marks flag for eventual cleanup
    archived        BOOLEAN DEFAULT FALSE,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

CREATE INDEX idx_flags_project_archived ON flags(project_id, archived);
CREATE INDEX idx_flags_tags ON flags USING GIN(tags);

-- Flag configuration per environment
CREATE TABLE flag_environments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id         UUID REFERENCES flags(id) ON DELETE CASCADE,
    environment_id  UUID REFERENCES environments(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT FALSE,
    version         INTEGER DEFAULT 1,           -- incremented on every change
    rules           JSONB DEFAULT '[]',          -- ordered array of targeting rules
    fallthrough     JSONB NOT NULL,              -- default rule when no rules match
    off_variation   INTEGER NOT NULL,            -- variation index when flag is disabled
    prerequisites   JSONB DEFAULT '[]',          -- prerequisite flag conditions
    scheduled_changes JSONB DEFAULT '[]',        -- future-dated changes
    updated_at      TIMESTAMPTZ DEFAULT now(),
    updated_by      UUID,
    UNIQUE(flag_id, environment_id)
);

CREATE INDEX idx_flag_env_environment ON flag_environments(environment_id);
CREATE INDEX idx_flag_env_version ON flag_environments(environment_id, version);

-- User segments
CREATE TABLE segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(256) NOT NULL,
    name            VARCHAR(512) NOT NULL,
    description     TEXT,
    rules           JSONB DEFAULT '[]',          -- segment matching rules
    included_users  TEXT[] DEFAULT '{}',          -- explicitly included user keys
    excluded_users  TEXT[] DEFAULT '{}',          -- explicitly excluded user keys
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

-- Audit log (append-only)
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    project_id      UUID,
    environment_id  UUID,
    flag_key        VARCHAR(256),
    action          VARCHAR(64) NOT NULL,        -- 'flag.created', 'flag.updated', 'flag.toggled', etc.
    actor_id        UUID NOT NULL,
    actor_email     VARCHAR(256),
    before_value    JSONB,                       -- snapshot before change
    after_value     JSONB,                       -- snapshot after change
    comment         TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_flag ON audit_log(flag_key, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);

-- Experimentation
CREATE TABLE experiments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id         UUID REFERENCES flags(id) ON DELETE CASCADE,
    environment_id  UUID REFERENCES environments(id) ON DELETE CASCADE,
    name            VARCHAR(512) NOT NULL,
    hypothesis      TEXT,
    metric_keys     TEXT[] NOT NULL,              -- ["checkout_conversion", "revenue_per_user"]
    status          VARCHAR(32) DEFAULT 'draft',  -- 'draft', 'running', 'paused', 'completed'
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    winner_variation INTEGER,
    results         JSONB,                       -- statistical results
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- API keys and RBAC
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(256) NOT NULL,
    key_hash        VARCHAR(256) NOT NULL,       -- bcrypt hash of the API key
    key_prefix      VARCHAR(16) NOT NULL,        -- first 8 chars for identification
    role            VARCHAR(32) NOT NULL,        -- 'admin', 'writer', 'reader'
    scoped_projects UUID[],                      -- NULL = all projects
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Redis Schema (Caching & Streaming)

```
# Full flag config cache per environment (used for SDK bootstrap)
Key:     config:{env_sdk_key}
Type:    String (compressed JSON)
TTL:     None (updated on every flag change)
Size:    ~50-200 KB per environment

# Flag config version counter
Key:     version:{env_sdk_key}
Type:    String (integer)
Use:     SDK polls version; if changed, re-fetches config

# Pub/Sub channel for real-time flag updates
Channel: flag_updates:{env_sdk_key}
Payload: {"flagKey": "new-checkout", "version": 43, "action": "update"}

# Client-side evaluated flag cache per user
Key:     eval:{env_client_id}:{user_hash}
Type:    String (JSON of evaluated flag values)
TTL:     5 minutes
Size:    ~5-20 KB per user context

# Connected SDK tracking
Key:     sdk_connections:{env_sdk_key}
Type:    Sorted Set (member = instanceId, score = last_heartbeat)
TTL:     None (entries expire via score-based cleanup)
```

### Flag Rule JSON Structure (stored in `flag_environments.rules`)

```json
[
  {
    "id": "rule-001",
    "description": "Internal employees",
    "clauses": [
      {
        "attribute": "email",
        "op": "endsWith",
        "values": ["@company.com"],
        "negate": false
      }
    ],
    "rollout": {
      "variations": [
        { "variation": 0, "weight": 100000 }
      ]
    }
  },
  {
    "id": "rule-002",
    "description": "Gradual rollout to paid users",
    "clauses": [
      {
        "attribute": "plan",
        "op": "in",
        "values": ["pro", "enterprise"]
      }
    ],
    "rollout": {
      "variations": [
        { "variation": 0, "weight": 25000 },
        { "variation": 1, "weight": 75000 }
      ],
      "bucketBy": "userId",
      "seed": 12345
    }
  }
]
```

---

## 4. High-Level Architecture

```
                                   ┌──────────────────────┐
                                   │   Management Web UI  │
                                   │  (React Dashboard)   │
                                   └──────────┬───────────┘
                                              │ REST API
                                              ▼
                  ┌────────────────────────────────────────────────────┐
                  │              API Gateway / Load Balancer           │
                  └──────────┬───────────────────────┬────────────────┘
                             │                       │
                   ┌─────────▼──────────┐  ┌────────▼─────────────┐
                   │   Flag Management  │  │   SDK Service        │
                   │   Service          │  │   (Evaluation +      │
                   │   (CRUD, Rules,    │  │    Streaming)        │
                   │    Segments)       │  │                      │
                   └────────┬───────────┘  └───┬──────────┬───────┘
                            │                  │          │
                   ┌────────▼──────────────────▼──┐      │
                   │        PostgreSQL             │      │
                   │   (Flags, Rules, Segments,    │      │
                   │    Audit Log, Experiments)    │      │
                   └──────────────────────────┬────┘      │
                                              │           │
                   ┌──────────────────────────▼───────────▼───────┐
                   │              Redis Cluster                    │
                   │  (Config Cache, Pub/Sub, Eval Cache)         │
                   └──────┬──────────────────────┬───────────────┘
                          │                      │
            ┌─────────────▼────┐     ┌───────────▼──────────┐
            │  SSE/Streaming   │     │   Event Collector    │
            │  Gateway         │     │   Service            │
            │  (Flag Updates)  │     │   (Batch Ingest)     │
            └──┬─────────┬────┘     └──────────┬───────────┘
               │         │                     │
    ┌──────────▼──┐  ┌───▼──────────┐   ┌─────▼─────────────┐
    │ Server SDK  │  │ Client SDK   │   │  Analytics /       │
    │ (Node, Go,  │  │ (JS, React,  │   │  ClickHouse        │
    │  Python,    │  │  iOS,        │   │  (Experiment       │
    │  Java)      │  │  Android)    │   │   Results)         │
    │             │  │              │   └────────────────────┘
    │ ┌─────────┐ │  │ ┌─────────┐ │
    │ │ Local   │ │  │ │ Local   │ │
    │ │ Rule    │ │  │ │ Flag    │ │
    │ │ Engine  │ │  │ │ Cache   │ │
    │ └─────────┘ │  │ └─────────┘ │
    └─────────────┘  └─────────────┘
```

### Data Flow

```
Flag Creation / Update Flow:
┌────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐    ┌───────────┐
│  UI /  │───▶│  Flag    │───▶│PostgreSQL│───▶│ Redis │───▶│SSE Gateway│
│  API   │    │  Service │    │  (write) │    │Pub/Sub│    │(broadcast)│
└────────┘    └──────────┘    └──────────┘    └───────┘    └─────┬─────┘
                    │                                            │
                    ▼                                            ▼
              ┌──────────┐                              ┌──────────────┐
              │Audit Log │                              │ Connected    │
              │  (write) │                              │ SDKs receive │
              └──────────┘                              │ update       │
                                                        └──────────────┘

Flag Evaluation Flow (Server-Side SDK):
┌──────────────────────────────────────────────────────────┐
│                Server-Side SDK (in-process)              │
│                                                          │
│  evaluate("new-checkout", user) ──▶ Local Rule Engine    │
│                                     │                    │
│                                     ├─ Check prereqs     │
│                                     ├─ Match rules       │
│                                     ├─ Evaluate clauses  │
│                                     ├─ Hash for rollout  │
│                                     └─ Return variation  │
│                                                          │
│  No network call — sub-millisecond evaluation            │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Deep Dive: Flag Evaluation Engine

### Evaluation Algorithm

The flag evaluation engine is the core of the system. It runs locally within each SDK to achieve sub-millisecond evaluation with zero network calls.

```
evaluate(flagKey, userContext):
  1. Lookup flag config from local store
  2. If flag not found → return default value
  3. If flag.enabled == false → return offVariation
  4. Check prerequisites (if any prerequisite fails → return offVariation)
  5. Check individual user targeting (explicit include/exclude lists)
  6. Evaluate rules in order (first match wins):
     a. For each rule, evaluate all clauses (AND logic)
     b. If all clauses match → apply rule's rollout/variation
     c. If rollout → hash user into bucket, select variation by weight
  7. If no rules match → apply fallthrough rule
  8. Record evaluation event (async, batched)
```

### Pseudocode Implementation

```python
class FlagEvaluator:
    def evaluate(self, flag_key: str, user: UserContext) -> EvalResult:
        flag = self.store.get_flag(flag_key)
        if flag is None:
            return EvalResult(
                value=self.defaults.get(flag_key),
                reason="FLAG_NOT_FOUND"
            )

        if not flag.enabled:
            return EvalResult(
                value=flag.variations[flag.off_variation],
                reason="FLAG_DISABLED"
            )

        # Check prerequisites
        for prereq in flag.prerequisites:
            prereq_result = self.evaluate(prereq.flag_key, user)
            if prereq_result.variation_index != prereq.variation:
                return EvalResult(
                    value=flag.variations[flag.off_variation],
                    reason="PREREQUISITE_FAILED"
                )

        # Check individual targeting (explicit user lists)
        for target in flag.targets:
            if user.key in target.values:
                return EvalResult(
                    value=flag.variations[target.variation],
                    reason="TARGET_MATCH"
                )

        # Evaluate rules in order
        for rule in flag.rules:
            if self._match_rule(rule, user):
                variation_index = self._apply_rollout(
                    rule.rollout, user, flag_key, rule.id
                )
                return EvalResult(
                    value=flag.variations[variation_index],
                    reason="RULE_MATCH",
                    rule_id=rule.id
                )

        # Fallthrough
        variation_index = self._apply_rollout(
            flag.fallthrough, user, flag_key, "fallthrough"
        )
        return EvalResult(
            value=flag.variations[variation_index],
            reason="FALLTHROUGH"
        )

    def _match_rule(self, rule: Rule, user: UserContext) -> bool:
        """All clauses must match (AND logic)."""
        return all(
            self._match_clause(clause, user)
            for clause in rule.clauses
        )

    def _match_clause(self, clause: Clause, user: UserContext) -> bool:
        user_value = user.get_attribute(clause.attribute)
        if user_value is None:
            return False

        result = False
        if clause.op == "in":
            result = user_value in clause.values
        elif clause.op == "endsWith":
            result = any(user_value.endswith(v) for v in clause.values)
        elif clause.op == "startsWith":
            result = any(user_value.startswith(v) for v in clause.values)
        elif clause.op == "contains":
            result = any(v in user_value for v in clause.values)
        elif clause.op == "greaterThan":
            result = user_value > clause.values[0]
        elif clause.op == "lessThan":
            result = user_value < clause.values[0]
        elif clause.op == "semVerGreaterThan":
            result = parse_semver(user_value) > parse_semver(clause.values[0])
        elif clause.op == "segmentMatch":
            result = any(
                self._user_in_segment(seg_key, user)
                for seg_key in clause.values
            )
        elif clause.op == "regex":
            result = any(re.match(v, user_value) for v in clause.values)

        return (not result) if clause.negate else result
```

### Consistent Hashing for Percentage Rollout

Sticky bucketing ensures the same user always receives the same variation for a given flag configuration. This uses consistent hashing rather than random assignment.

```python
import hashlib

def _apply_rollout(
    self,
    rollout: Rollout,
    user: UserContext,
    flag_key: str,
    salt: str
) -> int:
    """Determine which variation a user gets based on percentage rollout."""
    if len(rollout.variations) == 1:
        return rollout.variations[0].variation

    # Determine the bucket key
    bucket_by = rollout.bucket_by or "key"
    bucket_value = user.get_attribute(bucket_by)
    if bucket_value is None:
        return rollout.variations[-1].variation

    # Create a deterministic hash
    seed = rollout.seed or 0
    hash_input = f"{flag_key}.{salt}.{bucket_value}.{seed}"
    hash_bytes = hashlib.sha1(hash_input.encode()).digest()

    # Convert first 4 bytes to integer, map to 0-99999 range
    hash_int = int.from_bytes(hash_bytes[:4], byteorder='big')
    bucket = hash_int % 100000  # 100,000 buckets for 0.001% precision

    # Walk through variation weights to find the matching bucket
    cumulative = 0
    for weighted_var in rollout.variations:
        cumulative += weighted_var.weight
        if bucket < cumulative:
            return weighted_var.variation

    # Fallback to last variation
    return rollout.variations[-1].variation
```

### Bucket Distribution Visualization

```
Flag: "new-checkout-flow"
Rollout: 30% variation A (new), 70% variation B (old)

Hash space (0 - 99,999):

|<---------- 30,000 ----------->|<--------------- 70,000 ----------------->|
|        Variation A             |            Variation B                   |
|        (new checkout)          |            (old checkout)                |
0                             30,000                                   99,999

User "alice" → SHA1("new-checkout-flow.rule-002.alice.0")
             → hash_int = 0x3A2B1C0D → 23847
             → bucket 23847 < 30000 → Variation A ✓

User "bob"   → SHA1("new-checkout-flow.rule-002.bob.0")
             → hash_int = 0x8F1E2D3C → 72341
             → bucket 72341 >= 30000 → Variation B ✓

Key property: Changing the rollout from 30% → 50% only ADDS users.
              Users who were in A stay in A. No one switches from A to B.
```

### Evaluation Reason Codes

| Reason | Description |
|--------|-------------|
| `FLAG_NOT_FOUND` | Flag key does not exist in the configuration |
| `FLAG_DISABLED` | Flag is toggled off; returns off variation |
| `PREREQUISITE_FAILED` | A prerequisite flag did not match expected variation |
| `TARGET_MATCH` | User matched an individual targeting list |
| `RULE_MATCH` | User matched a targeting rule |
| `FALLTHROUGH` | No rules matched; default variation used |
| `ERROR` | Evaluation error; returns application default |

---

## 6. Deep Dive: Targeting Rules

### Rule Evaluation Order

```
┌─────────────────────────────────────────────────────────────┐
│                    Flag Evaluation Pipeline                  │
│                                                             │
│  1. Flag Disabled? ──yes──▶ Return offVariation             │
│         │ no                                                │
│         ▼                                                   │
│  2. Prerequisites Met? ──no──▶ Return offVariation          │
│         │ yes                                               │
│         ▼                                                   │
│  3. Individual Targets                                      │
│     User in explicit include list? ──yes──▶ Return target   │
│         │ no                                    variation    │
│         ▼                                                   │
│  4. Rule 1 (highest priority)                               │
│     All clauses match? ──yes──▶ Apply rollout ──▶ Return    │
│         │ no                                                │
│         ▼                                                   │
│  5. Rule 2                                                  │
│     All clauses match? ──yes──▶ Apply rollout ──▶ Return    │
│         │ no                                                │
│         ▼                                                   │
│  6. ... (remaining rules)                                   │
│         │                                                   │
│         ▼                                                   │
│  7. Fallthrough ──▶ Apply default rollout ──▶ Return        │
└─────────────────────────────────────────────────────────────┘
```

### Supported Operators

| Operator | Type | Description | Example |
|----------|------|-------------|---------|
| `in` | String, Number | Exact match in list | `country in ["US", "CA"]` |
| `notIn` | String, Number | Not in list | `plan notIn ["free"]` |
| `endsWith` | String | String suffix match | `email endsWith ["@company.com"]` |
| `startsWith` | String | String prefix match | `email startsWith ["admin"]` |
| `contains` | String | Substring match | `userAgent contains ["Mobile"]` |
| `regex` | String | Regular expression | `email regex ["^test.*@example"]` |
| `greaterThan` | Number | Numeric comparison | `age greaterThan 18` |
| `lessThan` | Number | Numeric comparison | `loginCount lessThan 5` |
| `before` | Date | Date comparison | `signupDate before "2026-01-01"` |
| `after` | Date | Date comparison | `signupDate after "2025-06-01"` |
| `semVerEqual` | SemVer | Semantic version eq | `appVersion semVerEqual "2.1.0"` |
| `semVerGreaterThan` | SemVer | Semantic version gt | `appVersion semVerGreaterThan "2.0.0"` |
| `segmentMatch` | Segment | User is in segment | `segment segmentMatch ["beta-testers"]` |

### Segment-Based Targeting

Segments are reusable groups of users that can be referenced across multiple flags.

```
Segment: "enterprise-customers"
┌──────────────────────────────────────────────┐
│  Included Users: [user-ceo-1, user-ceo-2]   │  ← Always included
│                                              │
│  Rule 1 (OR with Rule 2):                    │
│    plan == "enterprise"                      │
│                                              │
│  Rule 2:                                     │
│    company_size > 500 AND plan == "business"  │
│                                              │
│  Excluded Users: [user-test-1]               │  ← Always excluded
└──────────────────────────────────────────────┘

Evaluation:
1. If user in excluded list → NOT in segment
2. If user in included list → IN segment
3. If any rule matches → IN segment
4. Otherwise → NOT in segment
```

### Percentage Rollout Strategies

**Simple Percentage Rollout:**
```json
{
  "description": "Gradual rollout to 25% of users",
  "clauses": [],
  "rollout": {
    "variations": [
      { "variation": 0, "weight": 25000 },
      { "variation": 1, "weight": 75000 }
    ],
    "bucketBy": "userId"
  }
}
```

**Targeted Percentage Rollout:**
```json
{
  "description": "50% of enterprise users get new feature",
  "clauses": [
    { "attribute": "plan", "op": "in", "values": ["enterprise"] }
  ],
  "rollout": {
    "variations": [
      { "variation": 0, "weight": 50000 },
      { "variation": 1, "weight": 50000 }
    ],
    "bucketBy": "orgId"
  }
}
```

**Canary Release Pattern (multi-rule):**
```json
{
  "rules": [
    {
      "description": "Step 1: Internal dogfood (always on)",
      "clauses": [
        { "attribute": "email", "op": "endsWith", "values": ["@company.com"] }
      ],
      "rollout": {
        "variations": [{ "variation": 0, "weight": 100000 }]
      }
    },
    {
      "description": "Step 2: 5% canary to pro users",
      "clauses": [
        { "attribute": "plan", "op": "in", "values": ["pro"] }
      ],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 5000 },
          { "variation": 1, "weight": 95000 }
        ],
        "bucketBy": "userId"
      }
    },
    {
      "description": "Step 3: 1% canary to everyone else",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 1000 },
          { "variation": 1, "weight": 99000 }
        ],
        "bucketBy": "userId"
      }
    }
  ]
}
```

### Gradual Rollout Timeline

```
Day 1    Day 3    Day 5    Day 7    Day 10   Day 14
  │        │        │        │        │        │
  ▼        ▼        ▼        ▼        ▼        ▼
┌────┐  ┌────┐  ┌─────┐  ┌──────┐ ┌───────┐ ┌──────────┐
│ 1% │  │ 5% │  │ 10% │  │ 25%  │ │  50%  │ │  100%    │
└────┘  └────┘  └─────┘  └──────┘ └───────┘ └──────────┘
  │        │        │        │        │        │
  └── Monitor error rates, latency, support tickets ──┘
       If anomaly detected → automatic rollback to 0%
```

---

## 7. Deep Dive: SDK Architecture

### Server-Side SDK (Node.js Example)

```
┌─────────────────────────────────────────────────────────┐
│              Server-Side SDK Architecture                │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Flag Store   │    │  Rule Engine  │    │  Event    │ │
│  │  (in-memory)  │◀──│  (evaluator)  │    │  Buffer   │ │
│  └──────┬───────┘    └──────────────┘    └─────┬─────┘ │
│         │                                      │       │
│  ┌──────▼────────┐                      ┌──────▼─────┐ │
│  │  Update       │                      │  Event     │ │
│  │  Processor    │                      │  Sender    │ │
│  │  (SSE stream) │                      │  (batch)   │ │
│  └──────┬────────┘                      └──────┬─────┘ │
│         │                                      │       │
└─────────┼──────────────────────────────────────┼───────┘
          │ SSE connection                       │ POST /events/bulk
          ▼                                      ▼
   ┌──────────────┐                     ┌──────────────┐
   │ Flag Service  │                     │Event Collector│
   └──────────────┘                     └──────────────┘
```

```typescript
// Server-side SDK usage
import { FeatureFlagClient } from '@flags/node-sdk';

const client = FeatureFlagClient.init({
  sdkKey: 'sdk-prod-xxxx',
  baseUrl: 'https://flags.example.com',
  updateMode: 'streaming',       // 'streaming' | 'polling'
  pollingInterval: 30_000,       // fallback polling interval (ms)
  connectTimeout: 5_000,
  flushInterval: 5_000,          // event flush interval (ms)
  flushBatchSize: 500,
  offlineMode: false,
});

// Wait for initial flag data
await client.waitForInitialization();

// Evaluate a flag (local, sub-millisecond)
const user = {
  key: 'user-123',
  email: 'alice@example.com',
  plan: 'enterprise',
  country: 'US',
  custom: {
    signupDate: '2025-03-15',
    betaOptIn: true,
  },
};

const showNewCheckout = client.boolVariation(
  'new-checkout-flow',
  user,
  false  // default value if flag not found
);

// Get evaluation details for debugging
const detail = client.boolVariationDetail(
  'new-checkout-flow',
  user,
  false
);
// detail = {
//   value: true,
//   variationIndex: 0,
//   reason: { kind: 'RULE_MATCH', ruleIndex: 0, ruleId: 'rule-001' }
// }

// Track conversion event for experiments
client.track('checkout_completed', user, {
  revenue: 49.99,
  currency: 'USD',
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await client.close();  // Flushes pending events, closes SSE
});
```

### Client-Side SDK (React Example)

```
┌─────────────────────────────────────────────────────────┐
│              Client-Side SDK Architecture                │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Flag Values  │    │  React       │    │  Event    │ │
│  │  (in-memory)  │    │  Hooks       │    │  Buffer   │ │
│  └──────┬───────���    └──────────────┘    └─────┬─────┘ │
│         │                                      │       │
│  ┌──────▼────────┐                      ┌──────▼─────┐ │
│  │  SSE Stream   │                      │  Event     │ │
│  │  (evaluated   │                      │  Beacon    │ │
│  │   values)     │                      │  (sendBcn) │ │
│  └──────┬────────┘                      └──────┬─────┘ │
│         │                                      │       │
└─────────┼──────────────────────────────────────┼───────┘
          │ SSE (evaluated values only)          │ POST /events/client
          ▼                                      ▼
   ┌──────────────┐                     ┌──────────────┐
   │ SDK Service   │                     │Event Collector│
   │(evaluates on  │                     └──────────────┘
   │ server side)  │
   └──────────────┘
```

Key difference: Client-side SDKs receive **pre-evaluated values**, never the raw rules. This prevents exposing targeting logic, user segments, and rollout percentages to the browser.

```tsx
// Client-side SDK usage (React)
import { FlagProvider, useFlag, useFlags } from '@flags/react-sdk';

function App() {
  const userContext = {
    key: 'user-123',
    email: 'alice@example.com',
    plan: 'enterprise',
  };

  return (
    <FlagProvider
      clientId="client-prod-xxxx"
      user={userContext}
      options={{
        bootstrap: 'localStorage',  // Use cached values while loading
        streaming: true,
      }}
    >
      <CheckoutPage />
    </FlagProvider>
  );
}

function CheckoutPage() {
  const showNewCheckout = useFlag('new-checkout-flow', false);
  const { flags, loading } = useFlags();

  if (loading) return <Skeleton />;

  return showNewCheckout
    ? <NewCheckoutFlow />
    : <LegacyCheckoutFlow />;
}
```

### Local Evaluation vs. Remote Evaluation

| Aspect | Local (Server-Side SDK) | Remote (Client-Side SDK) |
|--------|------------------------|--------------------------|
| Where rules execute | In-process (SDK) | On the flag service |
| Data sent to SDK | Full ruleset + segments | Pre-evaluated values only |
| Latency | < 1ms | Network RTT + evaluation |
| Security | Rules visible in process memory | Rules never leave server |
| Network dependency | Only for updates | Every evaluation (or cached) |
| Use case | Backend services | Browsers, mobile apps |
| Offline support | Full (uses cached rules) | Partial (uses cached values) |

### Caching Strategy

```
Server-Side SDK Caching:
┌─────────────────────────────────────────────────┐
│ Layer 1: In-Memory Store                         │
│   Full flag config loaded on init                │
│   Updated via SSE stream in real-time            │
│   Evaluation: O(rules) per flag, ~microseconds   │
├─────────────────────────────────────────────────┤
│ Layer 2: Persistent Cache (optional)             │
│   File-based or Redis cache                      │
│   Used for fast startup (skip network bootstrap) │
│   Written on every config update                 │
├─────────────────────────────────────────────────┤
│ Layer 3: Application Defaults                    │
│   Hardcoded defaults in SDK init                 │
│   Used when flag not found or SDK not ready      │
└─────────────────────────────────────────────────┘

Client-Side SDK Caching:
┌─────────────────────────────────────────────────┐
│ Layer 1: In-Memory (current session)             │
│   Evaluated flag values                          │
│   Updated via SSE stream                         │
├─────────────────────────────────────────────────┤
│ Layer 2: localStorage / AsyncStorage             │
│   Persisted across page loads / app restarts     │
│   Bootstrap from cache → show content instantly  │
│   Replace with fresh values when SSE connects    │
├─────────────────────────────────────────────────┤
│ Layer 3: Application Defaults                    │
│   Fallback when no cache and no connection       │
└─────────────────────────────────────────────────┘
```

---

## 8. Deep Dive: Real-Time Flag Updates

### Streaming Architecture (SSE)

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────────────────┐
│ Flag Service │────▶│    Redis     │────▶│    SSE Gateway Cluster         │
│ (writes)     │     │   Pub/Sub   │     │                               │
└──────────────┘     └──────────────┘     │  Node 1: 50K connections     │
                                          │  Node 2: 50K connections     │
                                          │  Node 3: 50K connections     │
                                          │  ...                          │
                                          │  Node N: 50K connections     │
                                          └──────┬──────┬──────┬─────────┘
                                                 │      │      │
                                           ┌─────▼──┐ ┌─▼────┐ │
                                           │SDK A   │ │SDK B │ │...
                                           └────────┘ └──────┘
```

### Update Propagation Flow

```python
# Flag Service: On flag update
async def update_flag(flag_key: str, env_key: str, changes: dict) -> None:
    # 1. Write to PostgreSQL
    new_version = await db.update_flag_environment(flag_key, env_key, changes)

    # 2. Write audit log
    await db.insert_audit_log(
        flag_key=flag_key,
        action="flag.updated",
        before_value=old_config,
        after_value=new_config,
    )

    # 3. Update Redis cache
    config = await db.get_full_environment_config(env_key)
    await redis.set(f"config:{env_sdk_key}", compress(json.dumps(config)))
    await redis.set(f"version:{env_sdk_key}", new_version)

    # 4. Publish update event via Redis Pub/Sub
    await redis.publish(f"flag_updates:{env_sdk_key}", json.dumps({
        "type": "flag_update",
        "flagKey": flag_key,
        "version": new_version,
        "timestamp": now_ms(),
    }))

    # 5. Fire webhooks asynchronously
    await webhook_queue.enqueue(
        event="flag.updated",
        payload={"flagKey": flag_key, "environment": env_key},
    )
```

```python
# SSE Gateway: Broadcasting updates to connected SDKs
class SSEGateway:
    def __init__(self):
        self.connections: dict[str, list[SSEConnection]] = {}

    async def handle_connection(self, request) -> StreamingResponse:
        env_sdk_key = authenticate(request)
        conn = SSEConnection(env_sdk_key)
        self.connections.setdefault(env_sdk_key, []).append(conn)

        # Send initial config
        config = await redis.get(f"config:{env_sdk_key}")
        await conn.send_event("put", config)

        # Subscribe to Redis Pub/Sub for this environment
        async for message in redis.subscribe(f"flag_updates:{env_sdk_key}"):
            update = json.loads(message)
            # Send incremental patch to SDK
            flag_config = await redis.hget(
                f"config:{env_sdk_key}", update["flagKey"]
            )
            await conn.send_event("patch", json.dumps({
                "path": f"/flags/{update['flagKey']}",
                "data": flag_config,
            }))

    async def on_disconnect(self, conn: SSEConnection) -> None:
        self.connections[conn.env_key].remove(conn)
```

### SSE Event Format

```
Server-Side SDK SSE Events:

# Initial full configuration
event: put
data: {"flags": {...}, "segments": {...}}

# Incremental flag update
event: patch
data: {"path": "/flags/new-checkout-flow", "data": {"key": "new-checkout-flow", "version": 43, ...}}

# Flag deleted
event: delete
data: {"path": "/flags/old-flag-key", "version": 44}

# Heartbeat (every 30 seconds)
:heartbeat


Client-Side SDK SSE Events:

# Initial evaluated values
event: put
data: {"new-checkout-flow": true, "pricing-tier-v2": "control", "max-upload-mb": 100}

# Single flag value changed
event: patch
data: {"key": "new-checkout-flow", "value": false}

# Heartbeat
:heartbeat
```

### Polling Fallback

When SSE connections fail (firewalls, proxies, corporate networks), the SDK falls back to polling.

```typescript
class UpdateProcessor {
  private mode: 'streaming' | 'polling' = 'streaming';
  private pollInterval: number = 30_000;
  private consecutiveFailures: number = 0;

  async start(): Promise<void> {
    try {
      await this.connectSSE();
    } catch {
      this.fallbackToPolling();
    }
  }

  private async connectSSE(): Promise<void> {
    const eventSource = new EventSource(
      `${this.baseUrl}/sdk/v1/flags/${this.envKey}/stream`,
      { headers: { Authorization: this.sdkKey } }
    );

    eventSource.onmessage = (event) => {
      this.consecutiveFailures = 0;
      this.processUpdate(event);
    };

    eventSource.onerror = () => {
      this.consecutiveFailures++;
      if (this.consecutiveFailures > 3) {
        eventSource.close();
        this.fallbackToPolling();
      }
    };
  }

  private fallbackToPolling(): void {
    this.mode = 'polling';
    setInterval(async () => {
      const currentVersion = this.store.getVersion();
      const serverVersion = await this.fetchVersion();
      if (serverVersion > currentVersion) {
        const config = await this.fetchFullConfig();
        this.store.replaceAll(config);
      }
    }, this.pollInterval);

    // Attempt to reconnect SSE periodically
    setInterval(() => this.connectSSE(), 60_000);
  }
}
```

### Consistency Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Ordering | Monotonic version numbers; SDK rejects updates with version <= current |
| Atomicity | Full flag config updated as single JSON document; no partial states |
| Delivery | SSE with automatic reconnection + polling fallback |
| Convergence | Version-based: SDK fetches full config if version gap detected |
| Consistency window | < 500ms typical (Redis Pub/Sub + SSE); < 30s worst case (polling) |

---

## 9. Deep Dive: Experimentation & A/B Testing

### Experiment Lifecycle

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐
│  Draft   │──▶│ Running   │──▶│ Enough   │──▶│ Analyze   │──▶│ Decision  │
│          │    │           │    │ Sample   │    │ Results   │    │           │
│ Define   │    │ Assign    │    │ Size     │    │           │    │ Ship or   │
│ metrics  │    │ users to  │    │ reached  │    │ Stat sig  │    │ Rollback  │
│ & hypo   │    │ variants  │    │          │    │ calc      │    │           │
└─────────┘    └──────────┘    └──────────┘    └───────────┘    └───────────┘
```

### Variant Assignment

Experiments use the same consistent hashing mechanism as percentage rollouts but with specific experiment semantics:

```python
class ExperimentEvaluator:
    def assign_variant(
        self,
        experiment: Experiment,
        user: UserContext,
        flag_key: str,
    ) -> VariantAssignment:
        """
        Assign a user to an experiment variant.
        Uses the same hashing as rollouts for consistency.
        """
        # Check mutual exclusion groups
        if experiment.exclusion_group:
            group = self.get_exclusion_group(experiment.exclusion_group)
            # Hash user into group slot
            slot = self._hash_to_slot(
                user.key,
                f"exclusion:{group.key}",
                group.total_slots,
            )
            # Check if this experiment owns the slot
            if not group.owns_slot(experiment.id, slot):
                return VariantAssignment(
                    variant=None,
                    reason="EXCLUDED_BY_MUTUAL_EXCLUSION",
                )

        # Hash user to variant using same mechanism as rollout
        bucket = self._hash_bucket(user.key, flag_key, experiment.salt)

        cumulative = 0
        for variant in experiment.variants:
            cumulative += variant.weight
            if bucket < cumulative:
                return VariantAssignment(
                    variant=variant,
                    reason="EXPERIMENT_ASSIGNED",
                    experiment_id=experiment.id,
                )

        return VariantAssignment(
            variant=experiment.variants[-1],
            reason="EXPERIMENT_FALLTHROUGH",
        )

    def _hash_bucket(
        self, user_key: str, flag_key: str, salt: int
    ) -> int:
        hash_input = f"{flag_key}.{salt}.{user_key}"
        hash_bytes = hashlib.sha1(hash_input.encode()).digest()
        return int.from_bytes(hash_bytes[:4], byteorder='big') % 100000
```

### Multivariate Flag for A/B/C Testing

```json
{
  "key": "checkout-button-color",
  "flagType": "string",
  "variations": [
    { "value": "blue", "name": "Control" },
    { "value": "green", "name": "Variant A" },
    { "value": "orange", "name": "Variant B" }
  ],
  "rules": [
    {
      "description": "A/B/C test on checkout button",
      "clauses": [],
      "rollout": {
        "variations": [
          { "variation": 0, "weight": 34000 },
          { "variation": 1, "weight": 33000 },
          { "variation": 2, "weight": 33000 }
        ],
        "bucketBy": "userId",
        "seed": 98765
      }
    }
  ]
}
```

### Event Collection & Analysis Pipeline

```
┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌─────────────┐
│  SDKs    │────▶│   Event      │────▶│   Kafka   │────▶│ ClickHouse  │
│ (track)  │     │   Collector  │     │           │     │ (analytics) │
└──────────┘     └──────────────┘     └───────────┘     └──────┬──────┘
                                                               │
                                                        ┌──────▼──────┐
                                                        │  Results    │
                                                        │  Calculator │
                                                        │  (Bayesian/ │
                                                        │   Frequen.) │
                                                        └──────┬──────┘
                                                               │
                                                        ┌──────▼──────┐
                                                        │  Dashboard  │
                                                        │  (results)  │
                                                        └─────────────┘
```

### Event Schema

```json
{
  "kind": "feature",
  "timestamp": 1709500800000,
  "flagKey": "checkout-button-color",
  "userKey": "user-123",
  "variation": 1,
  "value": "green",
  "reason": "RULE_MATCH",
  "experimentId": "exp-checkout-btn-001"
}

{
  "kind": "custom",
  "timestamp": 1709500850000,
  "key": "checkout_completed",
  "userKey": "user-123",
  "data": {
    "revenue": 49.99,
    "currency": "USD",
    "items": 3
  }
}
```

### Statistical Significance Calculation

```python
from scipy import stats
import math

class ExperimentAnalyzer:
    def analyze_conversion(
        self,
        control_conversions: int,
        control_total: int,
        variant_conversions: int,
        variant_total: int,
        confidence_level: float = 0.95,
    ) -> ExperimentResult:
        control_rate = control_conversions / control_total
        variant_rate = variant_conversions / variant_total
        lift = (variant_rate - control_rate) / control_rate

        # Two-proportion z-test
        pooled_rate = (
            (control_conversions + variant_conversions)
            / (control_total + variant_total)
        )
        se = math.sqrt(
            pooled_rate * (1 - pooled_rate)
            * (1 / control_total + 1 / variant_total)
        )
        z_score = (variant_rate - control_rate) / se
        p_value = 2 * (1 - stats.norm.cdf(abs(z_score)))

        return ExperimentResult(
            control_rate=control_rate,
            variant_rate=variant_rate,
            lift=lift,
            p_value=p_value,
            significant=p_value < (1 - confidence_level),
            confidence=confidence_level,
            sample_size_sufficient=(
                control_total >= self.min_sample_size(control_rate)
            ),
        )

    def min_sample_size(
        self,
        baseline_rate: float,
        mde: float = 0.05,          # minimum detectable effect
        alpha: float = 0.05,
        power: float = 0.8,
    ) -> int:
        """Calculate minimum sample size per variant."""
        z_alpha = stats.norm.ppf(1 - alpha / 2)
        z_beta = stats.norm.ppf(power)
        p1 = baseline_rate
        p2 = baseline_rate * (1 + mde)
        n = (
            (z_alpha * math.sqrt(2 * p1 * (1 - p1))
             + z_beta * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)))
            ** 2
            / (p2 - p1) ** 2
        )
        return math.ceil(n)
```

### Mutual Exclusion Groups

Mutual exclusion ensures a user can only be in one experiment at a time within a group.

```
Exclusion Group: "checkout-experiments"
Total slots: 100,000

┌──────────────────────────────────────────────────────────────┐
│ Slots: 0          25,000       50,000        75,000  100,000│
│        │            │            │              │         │  │
│        ├────────────┤            │              │         │  │
│        │ Experiment │            │              │         │  │
│        │ A (25%)    │            │              │         │  │
│        │            ├────────────┤              │         │  │
│        │            │ Experiment │              │         │  │
│        │            │ B (25%)    │              │         │  │
│        │            │            ├──────────────┤         │  │
│        │            │            │ Experiment   │         │  │
│        │            │            │ C (25%)      │         │  │
│        │            │            │              ├─────────┤  │
│        │            │            │              │ Reserve │  │
│        │            │            │              │ (25%)   │  │
└──────────────────────────────────────────────────────────────┘

User "alice" → hash("checkout-experiments.alice") = 12,345
            → Slot 12,345 belongs to Experiment A
            → alice participates in Experiment A only
```

---

## 10. Deep Dive: Flag Lifecycle Management

### Flag States

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  Draft   │───▶│  Active   │───▶│  Stale    │───▶│ Archived │
│          │    │           │    │           │    │          │
│ Created, │    │ Being     │    │ No change │    │ Soft     │
│ not yet  │    │ evaluated │    │ in 90+    │    │ deleted, │
│ enabled  │    │ in ≥1 env │    │ days      │    │ rules    │
│          │    │           │    │           │    │ removed  │
└──────────┘    └──────────┘    └───────────┘    └──────────┘
                     │                                 │
                     │          ┌──────────┐           │
                     └─────────▶│ Permanent│           │
                                │          │           │
                                │ Marked   │           │
                                │ non-temp │           │
                                └──────────┘           │
                                                       ▼
                                                ┌──────────┐
                                                │ Purged   │
                                                │          │
                                                │ Code refs│
                                                │ removed  │
                                                └──────────┘
```

### Stale Flag Detection

```python
class StaleFlagDetector:
    STALE_THRESHOLD_DAYS = 90
    WARNING_THRESHOLD_DAYS = 60

    async def detect_stale_flags(self, project_id: str) -> list[StaleFlag]:
        stale_flags = []

        flags = await self.db.get_flags(project_id, archived=False)
        for flag in flags:
            if not flag.temporary:
                continue  # Only check temporary flags

            days_since_change = (now() - flag.updated_at).days
            last_evaluation = await self.analytics.get_last_evaluation(
                flag.key, project_id
            )
            days_since_eval = (
                (now() - last_evaluation).days
                if last_evaluation
                else days_since_change
            )

            # Check if flag is fully rolled out (100% to one variation)
            is_fully_rolled_out = await self._is_fully_rolled_out(flag)

            if days_since_change > self.STALE_THRESHOLD_DAYS:
                stale_flags.append(StaleFlag(
                    flag=flag,
                    reason="NO_CHANGES",
                    days_stale=days_since_change,
                    recommendation=(
                        "REMOVE" if is_fully_rolled_out else "REVIEW"
                    ),
                ))
            elif (
                is_fully_rolled_out
                and days_since_change > self.WARNING_THRESHOLD_DAYS
            ):
                stale_flags.append(StaleFlag(
                    flag=flag,
                    reason="FULLY_ROLLED_OUT",
                    days_stale=days_since_change,
                    recommendation="REMOVE",
                ))

        return stale_flags

    async def _is_fully_rolled_out(self, flag) -> bool:
        """Check if flag is 100% on one variation in all environments."""
        envs = await self.db.get_flag_environments(flag.id)
        return all(
            env.enabled
            and len(env.rules) == 0
            and env.fallthrough.get("variation") is not None
            for env in envs
        )
```

### Flag Retirement Workflow

```
Step 1: Identify stale flag
  └─ Automated scan finds "new-checkout-flow" at 100% for 45 days

Step 2: Notify owners
  └─ Slack: "@alice: Flag 'new-checkout-flow' has been at 100%
            for 45 days. Ready to remove?"

Step 3: Code search
  └─ Find all code references:
     grep -r "new-checkout-flow" src/
       src/checkout/CheckoutPage.tsx:12
       src/checkout/CheckoutPage.tsx:45
       src/api/routes/checkout.ts:28
       tests/checkout.test.ts:15

Step 4: Create cleanup PR
  └─ Remove flag checks, keep the "on" code path,
     delete the "off" code path

Step 5: Archive flag
  └─ POST /api/v1/projects/{id}/flags/new-checkout-flow
     { "archived": true }

Step 6: Code references removed
  └─ Verify no remaining references in codebase
```

### Technical Debt Tracking Dashboard

```
┌────────────────────────────────────────────────────────────┐
│              Feature Flag Health Dashboard                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Total Flags: 187    Active: 142    Stale: 31    Dead: 14 │
│                                                            │
│  ⚠ Stale Flags (no changes in 60+ days):                  │
│  ┌──────────────────────┬────────┬───────────┬──────────┐ │
│  │ Flag Key             │ Days   │ Status    │ Action   │ │
│  ├──────────────────────┼────────┼───────────┼──────────┤ │
│  │ new-checkout-flow    │ 92     │ 100% on   │ REMOVE   │ │
│  │ dark-mode-v2         │ 78     │ 100% on   │ REMOVE   │ │
│  │ experiment-pricing   │ 65     │ 50/50     │ REVIEW   │ │
│  │ legacy-api-compat    │ 120    │ permanent │ OK       │ │
│  └──────────────────────┴────────┴───────────┴──────────┘ │
│                                                            │
│  Technical Debt Score: 23/100 (Good)                       │
│  Recommendation: Remove 2 flags to improve to 18/100      │
└────────────────────────────────────────────────────────────┘
```

### Flag Dependencies

```json
{
  "key": "new-checkout-payment",
  "prerequisites": [
    {
      "flagKey": "new-checkout-flow",
      "variation": 0
    }
  ]
}
```

```
Dependency graph:

new-checkout-flow (parent)
├── new-checkout-payment (requires parent = variation 0)
├── new-checkout-address-autocomplete (requires parent = variation 0)
└── checkout-analytics-v2 (requires parent = variation 0)

Evaluation: If "new-checkout-flow" is OFF or evaluates to variation 1,
            all dependent flags return their offVariation.
```

---

## 11. Deep Dive: Multi-Environment Support

### Environment Hierarchy

```
┌──────────────────────────────────────────────────────┐
│                     Project                          │
│                  "E-Commerce App"                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Development  │  │  Staging    │  │ Production  │ │
│  │             │  │             │  │             │ │
│  │ SDK Key:    │  │ SDK Key:    │  │ SDK Key:    │ │
│  │ sdk-dev-... │  │ sdk-stg-... │  │ sdk-prod-...│ │
│  │             │  │             │  │             │ │
│  │ Flags:      │  │ Flags:      │  │ Flags:      │ │
│  │ All enabled │  │ Same config │  │ Controlled  │ │
│  │ for testing │  │ as prod     │  │ rollout     │ │
│  │             │  │ (mirror)    │  │             │ │
│  │ Approval:   │  │ Approval:   │  │ Approval:   │ │
│  │ None        │  │ None        │  │ Required    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Environment-Specific Configuration

Each flag has independent configuration per environment:

```
Flag: "new-checkout-flow"

Development Environment:
  enabled: true
  rules: [] (no targeting — everyone gets it)
  fallthrough: variation 0 (true)

Staging Environment:
  enabled: true
  rules:
    - QA team segment → variation 0
  fallthrough: variation 1 (false)

Production Environment:
  enabled: true
  rules:
    - Beta testers → variation 0 (100%)
    - All users → 10% variation 0, 90% variation 1
  fallthrough: variation 1 (false)
  approval_required: true
```

### Environment Promotion

```python
async def promote_flag_config(
    flag_key: str,
    source_env: str,
    target_env: str,
    actor_id: str,
) -> PromotionResult:
    """Copy flag configuration from one environment to another."""
    source_config = await db.get_flag_environment(flag_key, source_env)
    target_config = await db.get_flag_environment(flag_key, target_env)

    # Check if target environment requires approval
    target_env_settings = await db.get_environment(target_env)
    if target_env_settings.require_approval:
        return await create_approval_request(
            flag_key=flag_key,
            source_env=source_env,
            target_env=target_env,
            proposed_config=source_config,
            requester=actor_id,
        )

    # Apply promotion
    new_config = {
        **target_config,
        "enabled": source_config.enabled,
        "rules": source_config.rules,
        "fallthrough": source_config.fallthrough,
        "version": target_config.version + 1,
        "updated_by": actor_id,
    }

    await db.update_flag_environment(flag_key, target_env, new_config)

    await audit_log.record(
        action="flag.promoted",
        flag_key=flag_key,
        before_value=target_config,
        after_value=new_config,
        actor_id=actor_id,
        comment=f"Promoted from {source_env} to {target_env}",
    )

    await notify_connected_sdks(target_env, flag_key)

    return PromotionResult(success=True, new_version=new_config["version"])
```

### Configuration Inheritance

```
Default Template (optional):
┌─────────────────────────────────┐
│  flag_type: boolean             │
│  variations: [true, false]      │
│  off_variation: 1               │
│  fallthrough: variation 1       │
│  enabled: false                 │
└───────────┬─────────────────────┘
            │ inherit (override)
    ┌───────┼───────────────┐
    ▼       ▼               ▼
┌───────┐ ┌───────┐  ┌──────────┐
│  Dev  │ │ Stage │  │  Prod    │
│       │ │       │  │          │
│enable:│ │enable:│  │ enable:  │
│ true  │ │ true  │  │ true     │
│       │ │       │  │ rules:   │
│       │ │       │  │ [10%     │
│       │ │       │  │  rollout]│
└───────┘ └───────┘  └──────────┘

Each environment overrides the template.
Non-overridden fields inherit from the template.
```

---

## 12. Scaling Strategy

### Edge Evaluation Architecture

For global low-latency flag evaluation, push flag configurations to edge locations.

```
┌────────────────────────────────────────────────────────────────────┐
│                      Edge Evaluation                               │
│                                                                    │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐               │
│  │ Edge PoP   │    │ Edge PoP   │    │ Edge PoP   │               │
│  │ US-East    │    │ EU-West    │    │ AP-South   │               │
│  │            │    │            │    │            │               │
│  │ ┌────────┐ │    │ ┌────────┐ │    │ ┌────────┐ │               │
│  │ │Flag    │ │    │ │Flag    │ │    │ │Flag    │ │               │
│  │ │Config  │ │    │ │Config  │ │    │ │Config  │ │               │
│  │ │Cache   │ │    │ │Cache   │ │    │ │Cache   │ │               │
│  │ └────────┘ │    │ └────────┘ │    │ └────────┘ │               │
│  │            │    │            │    │            │               │
│  │ ┌────────┐ │    │ ┌────────┐ │    │ ┌────────┐ │               │
│  │ │Rule    │ │    │ │Rule    │ │    │ │Rule    │ │               │
│  │ │Engine  │ │    │ │Engine  │ │    │ │Engine  │ │               │
│  │ └────────┘ │    │ └────────┘ │    │ └────────┘ │               │
│  └──────┬─────┘    └──────┬─────┘    └──────┬─────┘               │
│         │                 │                 │                      │
│         └────────────┬────┴────────────────┘                      │
│                      │ SSE / Config sync                           │
│                      ▼                                             │
│              ┌──────────────┐                                      │
│              │ Origin Flag  │                                      │
│              │ Service      │                                      │
│              └──────────────┘                                      │
└────────────────────────────────────────────────────────────────────┘
```

### CDN Caching for Client-Side Evaluations

```
Client-Side Evaluation Caching:

Browser/App ──▶ CDN Edge ──▶ SDK Service ──▶ Redis ──▶ PostgreSQL

Cache Headers:
  GET /sdk/v1/evaluate/{envClientId}?user={hash}

  Response Headers:
    Cache-Control: public, max-age=60, stale-while-revalidate=300
    ETag: "v42-{user_hash}"
    Vary: Authorization

  CDN caches evaluated results per user context hash.
  TTL: 60 seconds (fresh), 300 seconds (stale-while-revalidate).
  Cache invalidation: Purge by flag key prefix on update.

  Trade-off: 60s max staleness vs. massive reduction in origin traffic.
  Most use cases tolerate 60s delay for non-critical flags.
```

### Read-Heavy Optimization

```
Read/Write Ratio: ~100,000:1
  Reads:  1B evaluations/day (local SDK, zero server load)
  Reads:  550K config fetches/hour (SDK bootstrap)
  Writes: 10K flag changes/day

Optimization Strategy:

1. Server-side SDKs: Zero read load on servers after bootstrap
   - Initial fetch: GET /sdk/v1/flags/{env} (once on startup)
   - Updates: SSE stream (persistent connection, push-based)
   - Evaluation: Local, in-process, sub-millisecond

2. Client-side SDKs: Minimal read load with caching
   - Bootstrap from localStorage (zero network)
   - SSE stream for updates (persistent connection)
   - CDN cache for new sessions (60s TTL)

3. Config cache hierarchy:
   ┌──────────────────────────────┐
   │ L1: SDK in-memory (< 1ms)   │  ← All evaluations
   ├──────────────────────────────┤
   │ L2: Redis (< 5ms)           │  ← SDK bootstrap
   ├──────────────────────────────┤
   │ L3: CDN edge (< 20ms)       │  ← Client-side bootstrap
   ├──────────────────────────────┤
   │ L4: PostgreSQL (< 50ms)     │  ← Cache miss, writes
   └──────────────────────────────┘

4. Write amplification management:
   One flag change → 1 PostgreSQL write
                   → 1 Redis cache update
                   → 1 Redis Pub/Sub publish
                   → N SSE broadcasts (fan-out at SSE gateway)
   Total write amplification: O(connected SDKs)
   Handled by SSE gateway cluster, not the flag service.
```

### Horizontal Scaling Plan

| Component | Scaling Strategy | Instances |
|-----------|-----------------|-----------|
| Flag Management API | Stateless, behind LB | 3-6 per region |
| SDK Service | Stateless, behind LB | 6-12 per region |
| SSE Gateway | Stateful (connections), shard by env key | 10-15 per region |
| PostgreSQL | Primary + read replicas | 1 primary + 2 replicas |
| Redis Cluster | Sharded by environment key | 6 shards, 3 replicas each |
| Event Collector | Stateless, auto-scaling | 3-10 per region |
| ClickHouse | Sharded by time | 3-node cluster |

---

## 13. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Region: US-East                             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Kubernetes Cluster                          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │  │
│  │  │ Ingress /   │  │ Management  │  │  SDK Service          │ │  │
│  │  │ API Gateway │  │ API         │  │  (bootstrap +         │ │  │
│  │  │ (NGINX)     │──│ (3 pods)    │  │   client eval)        │ │  │
│  │  │             │  │             │  │  (6 pods)             │ │  │
│  │  │  Rate limit │  └──────┬──────┘  └──────────┬───────────┘ │  │
│  │  │  TLS term   │         │                    │             │  │
│  │  │  Auth       │         │                    │             │  │
│  │  └──────┬──────┘         │                    │             │  │
│  │         │                │                    │             │  │
│  │  ┌──────▼──────────────────────────────────────────────────┐ │  │
│  │  │                SSE Gateway (StatefulSet)                 │ │  │
│  │  │                                                         │ │  │
│  │  │  Pod 1         Pod 2         Pod 3        Pod 4         │ │  │
│  │  │  50K conns     50K conns     50K conns    50K conns     │ │  │
│  │  │                                                         │ │  │
│  │  │  Sharded by environment SDK key (consistent hashing)    │ │  │
│  │  └──────────────────────┬──────────────────────────────────┘ │  │
│  │                         │                                    │  │
│  │  ┌──────────────────────▼──────────────────────────────────┐ │  │
│  │  │                Redis Cluster                             │ │  │
│  │  │  Shard 1    Shard 2    Shard 3    (3 replicas each)     │ │  │
│  │  │  Config     Config     Pub/Sub                          │ │  │
│  │  │  Cache      Cache      Channels                         │ │  │
│  │  └─────────────────────────────────────────────────────────┘ │  │
│  │                                                               │  │
│  │  ┌──────────────────────┐  ┌────────────────────────────┐    │  │
│  │  │   PostgreSQL         │  │  Event Pipeline             │    │  │
│  │  │   Primary            │  │                             │    │  │
│  │  │   + 2 Read Replicas  │  │  Event Collector → Kafka    │    │  │
│  │  │                      │  │  → ClickHouse               │    │  │
│  │  │   Flags, Rules,      │  │                             │    │  │
│  │  │   Segments, Audit    │  │  Experiment results,        │    │  │
│  │  │                      │  │  flag usage analytics       │    │  │
│  │  └──────────────────────┘  └────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              CDN (CloudFront / Fastly)                         │  │
│  │                                                               │  │
│  │  Edge caching for client-side SDK bootstrap responses         │  │
│  │  Cache key: env_client_id + user_context_hash                 │  │
│  │  TTL: 60s, stale-while-revalidate: 300s                      │  │
│  │  Purge on flag update (via API)                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          Region: EU-West                             │
│                    (Same architecture, replicated)                    │
│                                                                     │
│  PostgreSQL: Read replica (async replication from US-East primary)   │
│  Redis: Independent cluster (synced via flag service on write)       │
│  SSE Gateway: Independent cluster (subscribes to local Redis)        │
│  SDK connections: Routed to nearest region via GeoDNS                │
└─────────────────────────────────────────────────────────────────────┘
```

### Disaster Recovery

```
Failure Mode            │ Impact                    │ Recovery
────────────────────────┼───────────────────────────┼─────────────────────────
PostgreSQL primary down │ No flag changes           │ Promote replica; SDKs
                        │ SDKs unaffected (cached)  │ continue on cached config
────────────────────────┼───────────────────────────┼─────────────────────────
Redis cluster down      │ SDK bootstrap slower      │ Fall back to PostgreSQL
                        │ SSE updates delayed       │ direct reads; polling mode
────────────────────────┼───────────────────────────┼─────────────────────────
SSE Gateway down        │ No real-time updates      │ SDKs fall back to polling
                        │ SDKs use cached config    │ (30s interval)
────────────────────────┼───────────────────────────┼─────────────────────────
Full region outage      │ SDKs in region offline    │ GeoDNS failover to
                        │ temporarily               │ secondary region; SDKs
                        │                           │ use local cache until
                        │                           │ reconnected
────────────────────────┼───────────────────────────┼─────────────────────────
SDK process restart     │ Brief period with         │ Bootstrap from persistent
                        │ defaults only             │ cache or fetch from
                        │                           │ SDK service
```

---

## 14. Common Interview Follow-ups

**Q: How do you ensure a user always sees the same flag value (sticky bucketing)?**

The key is deterministic hashing. We hash `SHA1(flagKey + salt + userId)` and map the result to a bucket in the range [0, 99999]. This hash is pure — same inputs always produce the same output. No state is stored per user. When the rollout percentage increases from 30% to 50%, users in buckets 0-29999 were already in the treatment group and remain there. Users in buckets 30000-49999 are newly added. No existing user switches from treatment to control. The `seed` parameter allows running independent rollouts on the same users: changing the seed reshuffles bucket assignments, which is useful when you want two flags to have independent rollout populations.

---

**Q: How does the system handle a kill switch that needs to propagate in under 1 second?**

Kill switch is the highest priority operation. When a flag is toggled off: (1) PostgreSQL is updated with `enabled = false`. (2) Redis cache is updated immediately. (3) Redis Pub/Sub publishes the update to all SSE Gateway nodes. (4) SSE Gateways broadcast an SSE `patch` event to all connected SDKs. The critical path is Redis Pub/Sub to SSE broadcast — this is sub-100ms within a region. For client-side SDKs using polling, we also update the CDN cache and issue a cache purge. Worst case for polling clients is one poll interval (30 seconds), but for SSE-connected clients, propagation is typically under 500ms. The management UI also shows a real-time indicator of how many SDK instances have acknowledged the update.

---

**Q: What happens when the flag service is completely down and an SDK starts up?**

The SDK has a multi-layer resilience strategy. (1) On startup, it first checks a local persistent cache (file on disk or localStorage). If a previous instance wrote a config file, the new instance uses it immediately — zero network dependency. (2) If no persistent cache exists, the SDK uses the application-provided default values for each flag. (3) The SDK continues attempting to connect to the flag service in the background with exponential backoff. (4) Once connected, it fetches the full configuration and begins normal operation. The key design principle: flag evaluation must never block on a network call and must never throw an exception. It always returns a value — the best available value given current state.

---

**Q: How do you prevent flag configurations from becoming inconsistent across environments?**

We use environment-specific configurations (not shared global state) to prevent cross-environment interference. Each environment has its own SDK key, its own set of rules, and its own version counter. Flag changes in development cannot accidentally affect production. For consistency between environments, we provide an explicit "promote" workflow — copy configuration from staging to production — which requires approval for production environments. The audit log tracks every promotion with before/after snapshots. We also provide a "compare environments" view that highlights configuration drift between staging and production, helping teams catch unintended differences.

---

**Q: How do you handle experimentation with percentage rollouts without introducing selection bias?**

Selection bias is the primary statistical risk. We mitigate it through: (1) Consistent hashing ensures deterministic assignment — a user is in the same variant every time, eliminating treatment switching bias. (2) The hash function uses a unique `seed` per experiment, so assignment in experiment A is independent of assignment in experiment B. (3) Mutual exclusion groups prevent a user from being in two conflicting experiments simultaneously. (4) We require minimum sample sizes calculated using power analysis before declaring results significant. (5) We use sequential testing (not just fixed-horizon tests) to allow early stopping without inflating false positive rates. (6) The system tracks "exposure events" — a user is only counted in the experiment when the flag is actually evaluated in their code path, not just when they are assigned a variant.

---

**Q: How do you scale SSE connections to millions of concurrent clients?**

The SSE Gateway is the scaling bottleneck. Each node handles ~50K concurrent SSE connections using async I/O (epoll on Linux, kqueue on macOS). We scale by: (1) Sharding connections by environment SDK key — all SDKs for the same environment connect to the same subset of gateway nodes, minimizing Pub/Sub fan-out. (2) Using Redis Pub/Sub for inter-node communication — when a flag changes, the flag service publishes once to Redis, and only the gateway nodes serving that environment receive the message. (3) For very large deployments (millions of connections), we introduce an edge layer using Cloudflare Workers or AWS Lambda@Edge that acts as an SSE proxy, caching the event stream at edge locations and fanning out to clients locally. (4) Client-side SDKs can also use long-polling as a fallback, which is more CDN-friendly and can serve many clients from a single cached response.

---

**Q: How do you manage technical debt from accumulating feature flags?**

Feature flags are a form of technical debt if not managed. Our approach: (1) Every flag is created as either `temporary` or `permanent`. Temporary flags have an expected removal date. (2) Automated stale flag detection runs weekly — if a temporary flag has been at 100% rollout for 90+ days, it is flagged for cleanup. (3) We integrate with the code repository via static analysis: a CI job scans for flag key references in code and cross-references them with the flag service. Flags with zero code references are candidates for deletion. (4) The management dashboard shows a "technical debt score" based on number of stale flags, age distribution, and flags without owners. (5) We send weekly Slack digests to flag owners listing their stale flags. This combination of automation and social pressure keeps flag counts manageable.

---

**Q: How would you support server-side rendering (SSR) with feature flags?**

SSR requires flag values to be available synchronously during the render pass on the server. The server-side SDK handles this naturally: it keeps the full flag configuration in memory and evaluates locally in microseconds. The challenge is hydration mismatch — the server renders with one set of flag values, and the client must render identically on hydration. Our approach: (1) The server evaluates all flags for the user during SSR and serializes the results into a `<script>` tag in the HTML (bootstrap data). (2) The client-side SDK initializes from this bootstrap data instead of making a network request. (3) This guarantees server and client see identical flag values during first render. (4) After hydration, the client-side SDK connects to the SSE stream for real-time updates. Flag changes after initial render trigger a React state update, causing a re-render with the new values.

---

**Q: How do you handle flag evaluation for anonymous users who do not have a stable user ID?**

Anonymous users need stable identifiers for consistent bucketing. The approach: (1) On the first visit, the client-side SDK generates a random UUID and stores it in a first-party cookie or localStorage. This becomes the user's `key` for flag evaluation. (2) The hash function uses this anonymous key for percentage rollouts, so the user sees consistent flag values across sessions (as long as the cookie persists). (3) When the user signs up or logs in, the SDK provides an "alias" or "identify" call that links the anonymous key to the authenticated user ID. (4) For server-side SDKs, the application must provide some identifier — if no user ID is available, the SDK falls back to the request IP or a session ID. (5) The analytics pipeline tracks anonymous-to-known identity mapping so experiment results properly attribute conversions across the anonymous and authenticated portions of a user journey.

---

## 15. Summary

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Evaluation location | Local (in SDK) for server-side; server-evaluated for client-side | Sub-millisecond latency; no network dependency for hot path |
| Update propagation | SSE streaming with polling fallback | Real-time updates (< 500ms); works through firewalls |
| Consistency model | Deterministic hashing (no stored state) | Same user always gets same value; no per-user storage; O(1) evaluation |
| Rule storage | JSON in PostgreSQL | Flexible schema for rules; ACID for flag changes; good enough for write volume |
| Caching | Redis for config + CDN for client bootstrap | Config fits in memory; CDN offloads client traffic |
| Event pipeline | Kafka + ClickHouse | High-throughput event ingestion; fast analytical queries for experiment results |
| Multi-environment | Separate config per environment, shared flag definition | Isolation prevents cross-environment incidents; promotion workflow for consistency |
| Client-side security | Server-evaluated values only (no rules exposed) | Prevents exposing targeting logic, segments, and rollout percentages |

### Trade-offs

| Decision | Option A | Option B | Recommendation |
|----------|----------|----------|----------------|
| Local vs. remote evaluation | Local (full rules in SDK) | Remote (server evaluates per request) | Local for server SDKs (performance); remote for client SDKs (security) |
| SSE vs. WebSocket | SSE (unidirectional, HTTP-based) | WebSocket (bidirectional) | SSE — simpler, works through HTTP proxies/CDNs, unidirectional is sufficient for flag updates |
| Polling interval | Short (5s) — faster updates | Long (60s) — less server load | 30s default with SSE as primary; polling is fallback only |
| Flag storage format | Relational (normalized tables) | Document (JSON blob per flag) | Hybrid — relational for metadata/search, JSON for rules (flexible schema) |
| Consistency on rollout change | Repartition all users | Monotonic expansion only | Monotonic — increasing rollout never moves users out of treatment group |
| Client-side bootstrap | Network fetch | localStorage cache | localStorage first (instant), then SSE stream for updates (no flash of wrong content) |
| Experiment assignment | Real-time (on evaluation) | Pre-computed (batch) | Real-time — no batch job dependency; deterministic hash is O(1) |
| Stale flag cleanup | Manual | Automated removal | Semi-automated — detect and notify automatically, require human approval to remove |
| Multi-region config | Single primary, async replicate | Multi-primary with conflict resolution | Single primary — flag changes are low-volume; avoid conflict resolution complexity |
| Audit log storage | Same DB (PostgreSQL) | Dedicated append-only store | Same DB for volume under 10K changes/day; separate store (e.g., S3 + Athena) for compliance archive |
