# Multi-Tenancy (SaaS)

## What Is It?

Multi-tenancy is running one application that serves multiple customers (tenants), where each tenant's data is isolated from the others. Think Slack — thousands of companies use Slack, each with their own workspace, users, channels, and messages. They all run on the same Slack infrastructure, but Company A can never see Company B's data. As a developer building SaaS, multi-tenancy is the architectural foundation of your product.

## Why Should You Care?

If you're building a B2B SaaS product, multi-tenancy is not optional — it's the core pattern. Every query, every API call, every page render must be scoped to the correct tenant. A single bug that leaks data between tenants is a catastrophic security incident. Understanding the business model (how tenants are created, billed, isolated, and managed) helps you make the right architectural decisions early.

## How It Works (The Business Flow)

### Tenant Lifecycle

1. **Signup**: A new company signs up → a tenant is created with an organization name, admin user, and billing info
2. **Onboarding**: Admin invites team members, configures settings, imports data
3. **Active Usage**: Tenant uses the product daily. Data grows. More users are added
4. **Plan Changes**: Tenant upgrades/downgrades their subscription. Feature access changes
5. **Offboarding**: Tenant cancels → data retention period → data deletion

### Tenant Identification

Every request must know which tenant it belongs to. Common approaches:

- **Subdomain**: `acme.yourapp.com` → tenant is "acme"
- **Path**: `yourapp.com/acme/dashboard` → tenant is "acme"
- **Header/Token**: API requests include a tenant ID in the header or JWT
- **Database lookup**: Authenticated user → look up their tenant from the user-tenant relationship

### Data Isolation

Every database query must be scoped to the current tenant. A user in Tenant A must never see Tenant B's data.

```sql
-- WRONG: Returns all invoices from all tenants
SELECT * FROM invoices WHERE status = 'paid';

-- RIGHT: Scoped to tenant
SELECT * FROM invoices WHERE tenant_id = 'acme' AND status = 'paid';
```

This seems simple but it's easy to miss in complex queries, background jobs, and reports.

### Feature Gating

Different tenants have different plans with different features:

```
Free Plan:    5 users, 1GB storage, basic features
Pro Plan:     50 users, 100GB storage, advanced features + API access
Enterprise:   unlimited users, unlimited storage, SSO + audit logs + custom branding
```

Your code needs to check the tenant's plan before allowing access to gated features.

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Tenant** | A customer organization using your SaaS product |
| **Tenant Isolation** | Ensuring one tenant cannot access another tenant's data |
| **Single-Tenant** | Each customer gets their own instance of the application (separate servers, databases) |
| **Multi-Tenant** | All customers share the same infrastructure with logical isolation |
| **Shared Database** | All tenants' data in one database, separated by a `tenant_id` column |
| **Database per Tenant** | Each tenant gets their own database (stronger isolation, more operational complexity) |
| **Schema per Tenant** | Each tenant gets their own schema within a shared database (middle ground) |
| **Tenant Context** | The current tenant, resolved from the request and available throughout the request lifecycle |
| **Cross-Tenant** | Anything that spans multiple tenants (reporting, admin operations). Rare and carefully controlled |
| **Noisy Neighbor** | One tenant's heavy usage degrading performance for others |
| **Custom Domain** | Enterprise tenants want `app.acme.com` instead of `acme.yourapp.com` |
| **White-Labeling** | Tenant's branding (logo, colors, domain) on your product, so it looks like theirs |
| **Data Residency** | Requirement to store tenant data in a specific geographic region (EU, US, etc.) |

## Common Patterns

### Pattern 1: Shared Database with Tenant ID

All tenants share one database. Every table has a `tenant_id` column. Every query includes a `WHERE tenant_id = ?` filter.

**When it's used:** Most SaaS startups. Simple, cost-effective, easy to manage.

**Trade-off:** Risk of data leaks if you forget the tenant filter. Noisy neighbor problem (one tenant's heavy query slows everyone). Use Row-Level Security (PostgreSQL RLS) to enforce isolation at the database level.

### Pattern 2: Database per Tenant

Each tenant gets their own database instance. Complete data isolation at the infrastructure level.

**When it's used:** Enterprise customers with strict compliance/security requirements. Highly regulated industries (healthcare, finance).

**Trade-off:** Expensive to operate. Schema migrations must run on every database. Hard to do cross-tenant analytics.

### Pattern 3: Schema per Tenant

Shared database server, but each tenant has their own schema (PostgreSQL schemas, for example).

**When it's used:** Middle ground between shared and separate databases.

**Trade-off:** Better isolation than shared tables, less overhead than separate databases. But schema migrations still need to run per tenant.

### Pattern 4: Hybrid

Most tenants share infrastructure. Enterprise tenants get dedicated databases or even dedicated application instances.

**When it's used:** SaaS products with both self-serve (small tenants) and enterprise (large tenants) customers.

**Trade-off:** Most complex to operate but matches business reality.

## Gotchas & Edge Cases

- **Background jobs forget tenant context**: A cron job or queue worker processing data must know which tenant it's operating on. If it doesn't, it might process the wrong tenant's data or leak data across tenants.
- **Global search leaking data**: Your search index must be tenant-scoped. A shared Elasticsearch index without proper filtering is a data leak waiting to happen.
- **Admin panels need tenant switching**: Your internal admin tool needs to "impersonate" a tenant for debugging. This must be audit-logged.
- **Migrations on live data**: When you add a new column or change a schema, you're doing it for all tenants at once (shared DB) or for each tenant individually (DB per tenant). Both are painful at scale.
- **Tenant deletion**: When a tenant cancels, you need to delete all their data — users, files, database records, search index entries, cache entries, backups. This is harder than it sounds.
- **Rate limiting per tenant**: Don't let one tenant's API usage impact others. Set per-tenant rate limits.
- **Testing**: Your test suite should verify tenant isolation. Create two test tenants, create data in Tenant A, and assert Tenant B can never see it.
- **Billing per tenant**: Track usage (storage, API calls, users) per tenant for metered billing. This requires instrumentation at every usage point.

## Quick Reference

| Factor | Shared DB | Schema per Tenant | DB per Tenant |
|--------|-----------|-------------------|---------------|
| Cost | Low | Medium | High |
| Isolation | Logical (tenant_id) | Schema-level | Full |
| Operations | Simple | Medium complexity | Complex |
| Compliance | May need RLS | Better for audits | Best for compliance |
| Scale | Millions of tenants | Thousands | Hundreds |
| Best for | Startups, self-serve SaaS | Mid-market SaaS | Enterprise, regulated |
