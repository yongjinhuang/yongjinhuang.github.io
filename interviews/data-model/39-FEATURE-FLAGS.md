# Data Model: Feature Flags (LaunchDarkly)

A feature flag system enables teams to decouple deployment from release by toggling features at runtime without code changes. The data model must support complex targeting rules (user attributes, segments, percentage rollouts), per-environment configuration, experimentation (A/B testing), and near-real-time propagation to client SDKs. The key challenge is evaluating flags locally in the SDK without network calls, which means the entire flag configuration must be streamable and cacheable.

---

## Table Responsibilities

| Table                 | Purpose                                  | Why It Exists                                                                                                 |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **organizations**     | Top-level account grouping               | Billing, access control, and plan tier are organization-level concerns                                        |
| **projects**          | Logical grouping of flags                | Separates flags by product or team; prevents one team's flags from cluttering another's                       |
| **environments**      | Deployment stages (dev/staging/prod)     | A flag may be enabled in dev but disabled in prod; environments provide per-stage configuration               |
| **flags**             | Core flag definition                     | Defines what the flag is and its type; separated from environment-specific state                              |
| **flag_environments** | Per-environment flag state and targeting | The actual toggle and targeting rules; composite PK ensures one config per flag per environment               |
| **segments**          | Reusable user groups                     | Named user groups (e.g., "beta_testers", "enterprise_customers") that can be referenced across multiple flags |
| **experiments**       | A/B test configurations tied to flags    | Enables data-driven decisions by measuring the impact of flag variations on business metrics                  |
| **audit_log**         | Change history for all flag operations   | Compliance and debugging; answers "who changed what, when, and why"                                           |
| **sdk_connections**   | Live SDK connection tracking (Redis)     | Monitors connected SDKs for health and enables targeted pushes                                                |

---

## Detailed Field Descriptions

### organizations

| Field     | Type     | Description                                                                   |
| --------- | -------- | ----------------------------------------------------------------------------- |
| org_id    | PK, UUID | Unique organization identifier                                                |
| name      | VARCHAR  | Organization display name                                                     |
| plan_tier | ENUM     | free, pro, enterprise; determines feature access (segments, experiments, SSO) |

### projects

| Field      | Type               | Description                                         |
| ---------- | ------------------ | --------------------------------------------------- |
| project_id | PK, UUID           | Unique project identifier                           |
| org_id     | FK → organizations | Which organization owns this project                |
| name       | VARCHAR            | Project name (e.g., "Web App", "Mobile App", "API") |

### environments

| Field      | Type          | Description                                                       |
| ---------- | ------------- | ----------------------------------------------------------------- |
| env_id     | PK, UUID      | Unique environment identifier                                     |
| project_id | FK → projects | Which project this environment belongs to                         |
| name       | VARCHAR       | Environment name: dev, staging, prod; custom names also supported |

### flags

| Field         | Type                        | Description                                                                    |
| ------------- | --------------------------- | ------------------------------------------------------------------------------ |
| flag_id       | PK, UUID                    | Unique flag identifier                                                         |
| project_id    | FK → projects               | Which project this flag belongs to                                             |
| key           | VARCHAR, UNIQUE per project | Machine-readable flag key used in code (e.g., "new_checkout_flow")             |
| name          | VARCHAR                     | Human-readable flag name shown in the dashboard                                |
| description   | TEXT                        | What this flag controls and why it exists                                      |
| flag_type     | ENUM                        | boolean, string, number, json; determines what values the flag can return      |
| default_value | JSONB                       | Fallback value when targeting rules do not match or SDK cannot connect         |
| is_archived   | BOOLEAN                     | Soft-delete; archived flags are hidden from UI but preserved for audit history |

### flag_environments

| Field                 | Type             | Description                                                                                                                                    |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| flag_id               | FK, composite PK | Which flag this configuration applies to                                                                                                       |
| env_id                | FK, composite PK | Which environment this configuration applies to                                                                                                |
| enabled               | BOOLEAN          | Master toggle; if false, the off_variation is returned for all users                                                                           |
| targeting_rules_json  | JSONB            | Ordered list of targeting rules, each with: clauses (attribute/operator/values), rollout percentage, bucketing key, and the variation to serve |
| fallthrough_variation | JSONB            | The variation returned when the flag is enabled but no targeting rules match                                                                   |
| off_variation         | JSONB            | The variation returned when the flag is disabled (enabled = false)                                                                             |

### segments

| Field          | Type          | Description                                                                       |
| -------------- | ------------- | --------------------------------------------------------------------------------- |
| segment_id     | PK, UUID      | Unique segment identifier                                                         |
| project_id     | FK → projects | Which project this segment belongs to                                             |
| name           | VARCHAR       | Segment name (e.g., "beta_testers", "internal_employees")                         |
| rules_json     | JSONB         | Attribute-based rules for dynamic membership (e.g., email ends with @company.com) |
| included_users | ARRAY         | Explicitly included user keys; always in the segment regardless of rules          |
| excluded_users | ARRAY         | Explicitly excluded user keys; never in the segment regardless of rules           |

### experiments

| Field         | Type              | Description                                                              |
| ------------- | ----------------- | ------------------------------------------------------------------------ |
| experiment_id | PK, UUID          | Unique experiment identifier                                             |
| flag_id       | FK → flags        | Which flag this experiment is testing                                    |
| env_id        | FK → environments | Which environment the experiment runs in (typically prod)                |
| metric_name   | VARCHAR           | What metric is being measured (e.g., "conversion_rate", "latency_p99")   |
| variants_json | JSONB             | Experiment variants with traffic allocation percentages                  |
| status        | ENUM              | draft, running, concluded; controls whether data is being collected      |
| start_date    | TIMESTAMP         | When the experiment started; data before this is excluded from analysis  |
| end_date      | TIMESTAMP         | When the experiment ended; null while running                            |
| results_json  | JSONB             | Statistical results: per-variant metrics, confidence intervals, p-values |

### audit_log

| Field          | Type               | Description                                                               |
| -------------- | ------------------ | ------------------------------------------------------------------------- |
| id             | PK, UUID           | Unique audit entry identifier                                             |
| org_id         | FK → organizations | Which organization this event belongs to                                  |
| user_id        | UUID               | Who made the change                                                       |
| action         | VARCHAR            | What happened (flag.created, flag.updated, flag.toggled, segment.updated) |
| resource_type  | VARCHAR            | Type of resource changed (flag, segment, environment)                     |
| resource_id    | UUID               | Which specific resource was changed                                       |
| old_value_json | JSONB              | State before the change; enables diff view and rollback                   |
| new_value_json | JSONB              | State after the change                                                    |
| created_at     | TIMESTAMP          | When the change was made                                                  |

### sdk_connections (Redis)

| Field          | Type      | Description                                                                    |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| connection_id  | KEY       | Unique connection identifier                                                   |
| env_id         | VARCHAR   | Which environment this SDK is connected to; determines which flags it receives |
| last_heartbeat | TIMESTAMP | Last time this SDK sent a heartbeat; stale connections are cleaned up          |
| sdk_version    | VARCHAR   | SDK version for compatibility tracking and deprecation management              |

---

## ER Diagram

```
+------------------+
|  organizations   |
|------------------|
| org_id (PK)      |
| name             |
| plan_tier        |
+------------------+
        |
        | 1
        |
        +───* projects
        |
+------------------+
|    projects      |
|------------------|
| project_id (PK)  |
| org_id (FK)      |
| name             |
+------------------+
   |         |         |
   | 1       | 1       | 1
   |         |         |
   +──* environments   +───* segments
   |         |
   |  +------+----------+
   |  |  environments   |
   |  |-----------------|
   |  | env_id (PK)     |
   |  | project_id (FK) |
   |  | name            |
   |  +-----------------+
   |         |
   | 1       | (via flag_environments)
   |         |
   +───* flags
   |
+------------------+
|      flags       |
|------------------|
| flag_id (PK)     |
| project_id (FK)  |
| key              |
| name             |
| description      |
| flag_type        |
| default_value    |
| is_archived      |
+------------------+
        |                     +--------------------+
        | 1                   | flag_environments  |
        |                     |--------------------|
        +───* flag_           | flag_id (FK, PK)   |
        |    environments     | env_id (FK, PK)    |
        |                     | enabled            |
        | 1                   | targeting_rules_   |
        |                     |  json              |
        +───* experiments     | fallthrough_       |
                              |  variation         |
+------------------+          | off_variation      |
|   experiments    |          +--------------------+
|------------------|
| experiment_id(PK)|   +------------------+
| flag_id (FK)     |   |    segments      |
| env_id (FK)      |   |------------------|
| metric_name      |   | segment_id (PK)  |
| variants_json    |   | project_id (FK)  |
| status           |   | name             |
| start_date       |   | rules_json       |
| end_date         |   | included_users   |
| results_json     |   | excluded_users   |
+------------------+   +------------------+

+------------------+   +-------------------+
|   audit_log      |   | sdk_connections   |
|------------------|   |    (Redis)        |
| id (PK)          |   |-------------------|
| org_id (FK)      |   | connection_id(KEY)|
| user_id          |   | env_id            |
| action           |   | last_heartbeat    |
| resource_type    |   | sdk_version       |
| resource_id      |   +-------------------+
| old_value_json   |
| new_value_json   |
| created_at       |
+------------------+

Relationships:
  organizations 1───* projects
  projects 1───* environments
  projects 1───* flags
  projects 1───* segments
  flags *───* environments   (via flag_environments, composite PK)
  flags 1───* experiments
  experiments *───1 environments
  segments: referenced by key in targeting_rules_json (not FK)
  sdk_connections: keyed by env_id (Redis, not relational)
```

---

## Data Flow

1. **Flag Creation**: Admin creates a `flag` with a key, type, and default value. This creates the flag definition but no environment-specific configuration yet.

2. **Environment Configuration**: For each relevant environment (dev, staging, prod), a `flag_environments` record is created. Initially, `enabled = false` with targeting_rules_json empty. The admin then configures targeting rules.

3. **Targeting Rules**: Rules are evaluated in order. Each rule has clauses (e.g., `user.country == "US" AND user.plan == "enterprise"`), an optional segment reference, and a rollout percentage. The first matching rule determines the variation returned.

4. **Flag Update & Propagation**: When a flag or its targeting rules change, a version counter is incremented on the flag_environments record. A Redis pub/sub message is broadcast to all connected SDKs for that environment. SDKs receive the update within 500ms.

5. **SDK Evaluation (Local)**: Connected SDKs maintain a local cache of all flag configurations for their environment. When application code calls `getFlag("new_checkout_flow", user)`, the SDK evaluates locally with no network call:

   - Check if flag is enabled → if not, return off_variation
   - Evaluate targeting_rules in order → check user attributes against clauses
   - If a rule matches, use the rule's rollout percentage with consistent hashing (bucketing key) to determine the variation
   - If no rules match, return fallthrough_variation

6. **Segment Matching**: During rule evaluation, if a clause references a segment, the SDK checks if the user matches the segment's rules, included_users, or excluded_users lists.

7. **Experimentation**: When an experiment is running, the SDK reports which variation each user received and whether the metric event occurred. Results are aggregated server-side with statistical significance testing (p-values, confidence intervals).

8. **Audit Trail**: Every change to flags, segments, or environments creates an `audit_log` entry with the old and new state. This enables one-click rollback and regulatory compliance.

---

## Key Design Decisions for Interviews

- **Why separate flags from flag_environments?** A flag's identity (key, type, description) is the same across all environments, but its state (enabled/disabled, targeting rules) differs. Separating them prevents the need to duplicate flag metadata for every environment.

- **Why evaluate flags locally in the SDK?** Network calls on every flag evaluation would add latency to every request and create a single point of failure. Local evaluation is sub-millisecond and works even when the flag service is down (using cached state). The trade-off is eventual consistency -- there is a brief window after a flag change where some SDKs serve the old value.

- **Why targeting_rules_json as JSONB instead of normalized tables?** Targeting rules have a recursive, tree-like structure (clauses within rules, with AND/OR operators). Normalizing this into relational tables would require many joins and complex queries. JSONB keeps the rule structure intact and enables atomic updates. The rules are always read as a whole unit, never queried by individual clause.

- **Why consistent hashing for percentage rollouts?** A user must always see the same variation for a given flag, even across different SDK instances and server restarts. Consistent hashing (hash(user_key + flag_key) % 100) provides deterministic assignment without any shared state.

- **Why explicit included/excluded users on segments?** Attribute-based rules handle the general case, but sometimes you need to force-include a specific user (e.g., the CEO during a demo) or force-exclude a user (e.g., a test account). Explicit lists take priority over rules.

- **Why Redis pub/sub for propagation?** Polling would introduce unacceptable lag (at 1-minute polling, a critical flag change could take up to 60 seconds to propagate). Pub/sub delivers changes within 500ms. Redis is the right choice because it is already in most stacks and handles millions of connections efficiently.

- **Why store old_value_json and new_value_json in audit_log?** Knowing that a flag was "updated" is not enough for debugging production issues. You need to see exactly what changed. Storing both states enables a diff view in the UI and one-click rollback to any previous state.
