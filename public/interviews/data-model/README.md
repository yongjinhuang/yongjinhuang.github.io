# Data Model Design for System Design Interviews

This topic covers **how to design data models** for the 43 system design problems. Each file provides:

- **Table Responsibilities** -- what each table stores and why it exists
- **Detailed Field Descriptions** -- every field with its type and purpose
- **ER Diagrams** -- ASCII entity-relationship diagrams showing table relationships
- **Data Flow** -- step-by-step description of how data moves through the tables

## Why Data Models Matter in Interviews

Data model design reveals your understanding of:

1. **Entity identification** -- what are the core objects in the system?
2. **Relationship modeling** -- 1:1, 1:N, N:M between entities
3. **Storage engine selection** -- PostgreSQL vs Cassandra vs Redis vs ClickHouse
4. **Consistency trade-offs** -- strong consistency for payments, eventual for feeds
5. **Access pattern optimization** -- partition keys, indexes, denormalization

## Problem Index

### Tier 1 -- Most Frequently Asked

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 01 | URL Shortener | Hash-based dedup, analytics partitioning |
| 02 | Rate Limiter | Redis counters, token bucket state |
| 03 | Chat System | Cassandra partitioning by conversation, message status tracking |
| 04 | News Feed | Fan-out cache (Redis sorted sets), follow graph |
| 05 | Notification System | Multi-channel preferences, delivery log, idempotency |
| 06 | Distributed Cache | Hash slots, consistent hashing ring topology |

### Tier 2 -- Common

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 07 | Search Autocomplete | Trie structure, frequency aggregation |
| 08 | Video Streaming | Multi-resolution encodings, watch history (time-series) |
| 09 | Message Queue | Append-only log segments, consumer offset tracking |
| 10 | Key-Value Store | Vector clocks for versioning, ring topology |
| 11 | Web Crawler | URL frontier with priority, content dedup (SimHash) |
| 12 | Proximity Service | Geohash indexing, spatial queries |

### Tier 3 -- Important

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 13 | RAG & LLM Serving | Vector embeddings, chunk-document hierarchy |
| 14 | ML Recommendation | Feature store (online/offline), interaction events |
| 15 | Payment System | Double-entry ledger, payment state machine |
| 16 | Google Maps | Road graph (nodes/edges), map tile hierarchy |
| 17 | Ride-Sharing | Real-time geo index (Redis GEOADD), trip state machine |
| 18 | Distributed Logging | Time-series metrics, trace spans, log events |

### Tier 4 -- Specialized

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 19 | Unique ID Generator | Snowflake bit layout, worker lease coordination |
| 20 | Collaborative Editor | Append-only ops log, periodic snapshots |
| 21 | Object Storage | Bucket/object metadata, multipart upload, erasure coding |
| 22 | Task Scheduler | Workflow DAG, task queues, event sourcing |
| 23 | AI Agent Orchestration | ReAct step logging, vector memory, tool registry |
| 24 | Event Sourcing & CQRS | Immutable event store, read projections, snapshots |

### Tier 5 -- Infrastructure

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 25 | CDN | 3-tier cache entries, POP topology, routing rules |
| 26 | E-commerce Inventory | TTL-based reservations, optimistic locking, price snapshots |
| 27 | Auth & SSO | OAuth flows (codes/tokens/sessions), RBAC, MFA credentials |
| 28 | Ad Serving & RTB | Campaign hierarchy, ClickHouse event tables, budget counters |

### Tier 6 -- Business Domain

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 29 | Booking & Reservation | Per-date availability, hold TTL, pricing rules |
| 30 | Food Delivery | 3-party coordination, driver geo-matching, split payouts |
| 31 | Search Engine | Inverted index, term dictionary (FST), immutable segments |
| 32 | Analytics Platform | Identity graph, HyperLogLog uniques, pre-aggregation |
| 33 | Marketplace | Escrow payments, bilateral reviews, category hierarchy |

### Tier 7 -- Platform & SaaS

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 34 | Content Moderation | ML pipeline + human review queue, perceptual hashing |
| 35 | Digital Wallet | Double-entry bookkeeping, append-only ledger, idempotency |
| 36 | API Gateway | Route config, circuit breaker state, rate limit counters |
| 37 | Subscription Billing | Plan/price separation, metered usage, dunning retry |
| 38 | Multi-Tenant SaaS | RLS isolation, per-tenant config, usage quotas |
| 39 | Feature Flags | Local SDK evaluation, targeting rules, experiment tracking |

### Tier 8 -- Vertical Applications

| # | Problem | Key Data Model Concepts |
|---|---------|------------------------|
| 40 | CMS | User-defined content types, version history, locale-aware fields |
| 41 | Ticketing System | SLA tracking, skill-based routing, automation rules |
| 42 | Loyalty & Rewards | FIFO lot expiration, append-only ledger, tier qualification |
| 43 | E-Learning Platform | Course hierarchy, HLS video assets, progress tracking |

## Cross-Cutting Patterns

| Pattern | Used In | Purpose |
|---------|---------|---------|
| **Double-entry ledger** | 15, 35, 42 | Financial accuracy, audit trail |
| **Append-only log** | 09, 20, 24, 35, 42 | Immutability, replay, audit |
| **Optimistic locking (version)** | 26, 29, 35, 42 | Concurrent write safety without locks |
| **Idempotency key** | 05, 15, 26, 29, 33, 35, 37, 42 | Exactly-once semantics |
| **FIFO lot tracking** | 42 | Points/inventory expiration |
| **Snowflake IDs** | 03, 04, 08, 19 | Sortable distributed unique IDs |
| **Geohash / geo-index** | 12, 17, 30 | Spatial proximity queries |
| **Redis sorted sets** | 04, 07 | Ranked feeds, leaderboards |
| **Cassandra time-series** | 03, 08, 17, 18 | High-write append, time-ordered reads |
| **ClickHouse columnar** | 18, 28, 32 | Analytics aggregation at scale |
| **Vector embeddings** | 13, 14, 23 | Semantic similarity search |
| **TTL-based holds** | 26, 29 | Temporary resource reservation |
| **State machine** | 15, 17, 26, 30, 37 | Lifecycle management with valid transitions |
| **Row-level security** | 38 | Multi-tenant data isolation |

## Study Approach

1. **Start with Tier 1-2** -- these are asked most frequently
2. **For each problem**, understand the core entities first, then relationships
3. **Draw the ER diagram** from memory before checking the reference
4. **Trace the data flow** end-to-end for each major operation
5. **Know the storage engine** choice and why (SQL vs NoSQL vs in-memory)
6. **Identify cross-cutting patterns** -- interviewers love when you reference similar solutions from other systems
