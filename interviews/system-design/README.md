# System Design Interview Preparation Guide

## Overview

This directory contains comprehensive system design interview preparation materials covering **36 topics** across classic fundamentals, infrastructure deep dives, domain-specific systems, and emerging 2025-2026 trends. Each guide follows a structured approach with data modeling, architecture diagrams, trade-off analysis, and scaling strategies.

## How to Use

1. **Start with the Framework** - Read `00-FRAMEWORK.md` first. It teaches you the 4-step method to tackle ANY system design question.
2. **Study Topics by Priority** - Topics are ordered by interview frequency. Focus on Tier 1 first.
3. **Practice with Diagrams** - Each topic includes ASCII architecture diagrams you can redraw on a whiteboard.
4. **Review Data Models** - Understand the schema decisions and why they matter.
5. **Know the Trade-offs** - Interviewers care more about your reasoning than the "right" answer.

## Table of Contents

### Framework

| # | File | Description |
|---|------|-------------|
| 0 | [00-FRAMEWORK.md](00-FRAMEWORK.md) | The 4-step system design interview framework |

### Tier 1: Must Know (Asked in 80%+ of interviews)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 1 | [01-URL-SHORTENER.md](01-URL-SHORTENER.md) | URL Shortener (TinyURL) | Hashing, Base62, read-heavy systems |
| 2 | [02-RATE-LIMITER.md](02-RATE-LIMITER.md) | Rate Limiter | Token bucket, sliding window, distributed counting |
| 3 | [03-CHAT-SYSTEM.md](03-CHAT-SYSTEM.md) | Chat System (WhatsApp) | WebSocket, message queue, presence |
| 4 | [04-NEWS-FEED.md](04-NEWS-FEED.md) | News Feed (Twitter/Facebook) | Fan-out, ranking, caching |

### Tier 2: Frequently Asked (Asked in 50-80% of interviews)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 5 | [05-NOTIFICATION-SYSTEM.md](05-NOTIFICATION-SYSTEM.md) | Notification System | Push/pull, priority queue, deduplication |
| 6 | [06-DISTRIBUTED-CACHE.md](06-DISTRIBUTED-CACHE.md) | Distributed Cache (Redis) | Consistent hashing, eviction, replication |
| 7 | [07-SEARCH-AUTOCOMPLETE.md](07-SEARCH-AUTOCOMPLETE.md) | Search Autocomplete | Trie, prefix matching, ranking |
| 8 | [08-VIDEO-STREAMING.md](08-VIDEO-STREAMING.md) | Video Streaming (YouTube) | CDN, transcoding, adaptive bitrate |

### Tier 3: Advanced Topics (Asked in 30-50% of interviews)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 9 | [09-MESSAGE-QUEUE.md](09-MESSAGE-QUEUE.md) | Distributed Message Queue (Kafka) | Partitioning, offset, consumer groups |
| 10 | [10-KEY-VALUE-STORE.md](10-KEY-VALUE-STORE.md) | Key-Value Store | LSM tree, consistent hashing, replication |
| 11 | [11-WEB-CRAWLER.md](11-WEB-CRAWLER.md) | Web Crawler | BFS, politeness, deduplication |
| 12 | [12-PROXIMITY-SERVICE.md](12-PROXIMITY-SERVICE.md) | Proximity Service (Yelp) | Geohash, quadtree, spatial indexing |

### Tier 4: Emerging Topics for 2025-2026

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 13 | [13-RAG-LLM-SERVING.md](13-RAG-LLM-SERVING.md) | RAG Pipeline & LLM Serving | Vector DB, embeddings, retrieval, chunking, inference scaling |
| 14 | [14-ML-RECOMMENDATION.md](14-ML-RECOMMENDATION.md) | ML Recommendation System | Feature store, collaborative filtering, two-tower model, A/B testing |
| 15 | [15-PAYMENT-SYSTEM.md](15-PAYMENT-SYSTEM.md) | Payment System (Stripe) | Exactly-once, idempotency, double-entry ledger, PCI compliance |
| 16 | [16-GOOGLE-MAPS.md](16-GOOGLE-MAPS.md) | Google Maps / Navigation | Contraction hierarchies, tile rendering, real-time traffic, ETA |
| 17 | [17-RIDE-SHARING.md](17-RIDE-SHARING.md) | Ride-Sharing (Uber/Lyft) | Geospatial matching, surge pricing, trip state machine, ETA |
| 18 | [18-DISTRIBUTED-LOGGING.md](18-DISTRIBUTED-LOGGING.md) | Distributed Logging (ELK/Datadog) | Log ingestion, Elasticsearch, tracing, alerting, observability |

### Tier 5: Infrastructure & Architecture Deep Dives (2025-2026)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 19 | [19-UNIQUE-ID-GENERATOR.md](19-UNIQUE-ID-GENERATOR.md) | Unique ID Generator (Snowflake) | Snowflake bit layout, ULID, UUID v7, clock drift, k-sortability |
| 20 | [20-COLLABORATIVE-EDITOR.md](20-COLLABORATIVE-EDITOR.md) | Collaborative Editor (Google Docs) | CRDT, Operational Transform, real-time sync, presence, conflict resolution |
| 21 | [21-OBJECT-STORAGE.md](21-OBJECT-STORAGE.md) | Object Storage (Amazon S3) | Erasure coding, 11-nines durability, multipart upload, lifecycle policies |
| 22 | [22-DISTRIBUTED-TASK-SCHEDULER.md](22-DISTRIBUTED-TASK-SCHEDULER.md) | Distributed Task Scheduler (Temporal) | DAG execution, durable execution, saga pattern, workflow orchestration |
| 23 | [23-AI-AGENT-ORCHESTRATION.md](23-AI-AGENT-ORCHESTRATION.md) | AI Agent Orchestration Platform | Multi-agent systems, tool calling, guardrails, memory, model routing |
| 24 | [24-EVENT-SOURCING-CQRS.md](24-EVENT-SOURCING-CQRS.md) | Event Sourcing & CQRS | Append-only event log, projections, saga, schema evolution, DDD |
| 25 | [25-CONTENT-DELIVERY-NETWORK.md](25-CONTENT-DELIVERY-NETWORK.md) | Content Delivery Network (Cloudflare) | Edge compute, cache hierarchy, anycast, HTTP/3 QUIC, DDoS protection |
| 26 | [26-ECOMMERCE-INVENTORY.md](26-ECOMMERCE-INVENTORY.md) | E-commerce Inventory & Orders (Amazon) | Stock reservation, saga pattern, flash sales, order state machine |

### Tier 6: Domain-Specific Systems (High Interview Frequency)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 27 | [27-AUTH-SSO-SYSTEM.md](27-AUTH-SSO-SYSTEM.md) | Auth & SSO System | OAuth 2.0, OIDC, SAML, JWT, MFA, WebAuthn, session management |
| 28 | [28-AD-SERVING-RTB.md](28-AD-SERVING-RTB.md) | Ad Serving & Real-Time Bidding | RTB auction, DSP/SSP, CTR prediction, frequency capping, attribution |
| 29 | [29-BOOKING-RESERVATION.md](29-BOOKING-RESERVATION.md) | Booking & Reservation (Airbnb) | Double-booking prevention, overbooking, waitlist, dynamic pricing |
| 30 | [30-FOOD-DELIVERY.md](30-FOOD-DELIVERY.md) | Food Delivery (DoorDash) | Three-sided marketplace, dispatch, driver batching, ETA prediction |
| 31 | [31-SEARCH-ENGINE.md](31-SEARCH-ENGINE.md) | Full-Text Search Engine (Elasticsearch) | Inverted index, BM25, faceted search, hybrid search, NRT indexing |

### Tier 7: Platform & Trust Systems (Medium Interview Frequency)

| # | File | Topic | Key Concepts |
|---|------|-------|--------------|
| 32 | [32-ANALYTICS-PLATFORM.md](32-ANALYTICS-PLATFORM.md) | Analytics Platform (Mixpanel) | Event ingestion, funnels, cohorts, retention, OLAP, HyperLogLog |
| 33 | [33-MARKETPLACE.md](33-MARKETPLACE.md) | Marketplace Platform (Airbnb/Etsy) | Two-sided matching, escrow, trust/safety, reviews, cold start |
| 34 | [34-CONTENT-MODERATION.md](34-CONTENT-MODERATION.md) | Content Moderation (Facebook) | ML classification, hash matching, human review, appeals, policy engine |
| 35 | [35-DIGITAL-WALLET.md](35-DIGITAL-WALLET.md) | Digital Wallet & Ledger (PayPal) | Double-entry bookkeeping, P2P, KYC/AML, reconciliation, fraud |
| 36 | [36-API-GATEWAY.md](36-API-GATEWAY.md) | API Gateway & Service Mesh (Kong/Envoy) | Routing, circuit breaker, mTLS, service discovery, sidecar proxy |

## Quick Reference: Common Building Blocks

These building blocks appear across multiple system design questions:

| Building Block | Used In | Purpose |
|---------------|---------|---------|
| **Load Balancer** | All systems | Distribute traffic across servers |
| **CDN** | Video, News Feed | Cache static content near users |
| **Message Queue** | Chat, Notification, Feed | Async processing, decoupling |
| **Cache (Redis)** | All read-heavy systems | Reduce database load |
| **Database Sharding** | All large-scale systems | Horizontal data partitioning |
| **Consistent Hashing** | Cache, KV Store | Even data distribution |
| **Rate Limiter** | All public APIs | Protect against abuse |
| **WebSocket** | Chat, Notification | Real-time bidirectional communication |
| **Bloom Filter** | Crawler, Cache | Probabilistic membership testing |
| **Zookeeper** | Queue, KV Store | Distributed coordination |
| **Vector Database** | RAG, Recommendation | Similarity search on embeddings |
| **Feature Store** | Recommendation, ML | Serve ML features online/offline |
| **Graph Algorithms** | Maps, Social Networks | Shortest path, matching |
| **State Machine** | Payment, Ride-Sharing | Model entity lifecycles |
| **OpenTelemetry** | Logging, Tracing | Observability instrumentation |
| **CRDT / OT** | Collaborative Editor | Conflict-free replicated data types |
| **Erasure Coding** | Object Storage | Fault-tolerant storage with low overhead |
| **Snowflake IDs** | ID Generator, all systems | Time-sortable distributed unique IDs |
| **Saga Pattern** | Task Scheduler, E-commerce | Distributed transaction coordination |
| **Edge Compute** | CDN | Run code at edge locations (Workers, Lambda@Edge) |
| **Event Sourcing** | CQRS, Audit Systems | Append-only event log as source of truth |
| **LLM Routing** | AI Agent Orchestration | Cost/quality model selection and cascading |
| **Inverted Index** | Search Engine | Full-text search with BM25 scoring |
| **Escrow** | Marketplace, Wallet | Hold funds until transaction completes |
| **Double-Entry Ledger** | Wallet, Payment | Every debit has a matching credit |
| **Circuit Breaker** | API Gateway | Prevent cascade failures across services |
| **RTB Auction** | Ad Serving | Real-time bidding within 100ms budget |
| **Sidecar Proxy** | Service Mesh | Per-pod network proxy (Envoy) |
| **Hash Matching** | Content Moderation | PhotoDNA/pHash for known bad content |

## Coverage Map: System Design vs Web Business

Cross-reference with the [Web Business Knowledge](../web-business/00-README.md) guide. This helps you study both the **how** (system design) and the **why** (business logic) together.

### Covered (system design topic exists)

| Web Business | System Design | Notes |
|---|---|---|
| 01 - Authentication | [27-AUTH-SSO-SYSTEM](27-AUTH-SSO-SYSTEM.md) | OAuth 2.0, OIDC, SAML, JWT, MFA, SSO |
| 02 - Payment Processing | [15-PAYMENT-SYSTEM](15-PAYMENT-SYSTEM.md) | Full coverage |
| 03 - E-Commerce | [26-ECOMMERCE-INVENTORY](26-ECOMMERCE-INVENTORY.md) | Inventory, orders, checkout |
| 06 - Email & Notifications | [05-NOTIFICATION-SYSTEM](05-NOTIFICATION-SYSTEM.md) | Push/pull, priority, dedup |
| 08 - Search & Filtering | [07-SEARCH-AUTOCOMPLETE](07-SEARCH-AUTOCOMPLETE.md) + [31-SEARCH-ENGINE](31-SEARCH-ENGINE.md) | Autocomplete + full-text search |
| 09 - File Upload & Storage | [21-OBJECT-STORAGE](21-OBJECT-STORAGE.md) | S3 architecture, erasure coding |
| 11 - Analytics & Tracking | [32-ANALYTICS-PLATFORM](32-ANALYTICS-PLATFORM.md) | Funnels, cohorts, OLAP, HLL |
| 14 - Third-Party Integration | [36-API-GATEWAY](36-API-GATEWAY.md) | Gateway, routing, service mesh |
| 17 - Rate Limiting & API | [02-RATE-LIMITER](02-RATE-LIMITER.md) | Token bucket, sliding window |
| 18 - Caching Strategies | [06-DISTRIBUTED-CACHE](06-DISTRIBUTED-CACHE.md) | Redis, consistent hashing |
| 20 - Logging & Monitoring | [18-DISTRIBUTED-LOGGING](18-DISTRIBUTED-LOGGING.md) | ELK, tracing, alerting |
| 22 - LLM & RAG for Business | [13-RAG-LLM-SERVING](13-RAG-LLM-SERVING.md) | Vector DB, retrieval, inference |
| 23 - Instant Messaging | [03-CHAT-SYSTEM](03-CHAT-SYSTEM.md) | WebSocket, presence, delivery |
| 24 - Social Feed & Moderation | [04-NEWS-FEED](04-NEWS-FEED.md) + [34-CONTENT-MODERATION](34-CONTENT-MODERATION.md) | Feed + ML moderation pipeline |
| 25 - Marketplace | [33-MARKETPLACE](33-MARKETPLACE.md) | Two-sided, escrow, trust/safety |
| 26 - Ad Tech | [28-AD-SERVING-RTB](28-AD-SERVING-RTB.md) | RTB, auction, targeting, attribution |
| 27 - Booking & Reservation | [29-BOOKING-RESERVATION](29-BOOKING-RESERVATION.md) | Double-booking prevention, overbooking |
| 28 - Fintech & Wallet | [35-DIGITAL-WALLET](35-DIGITAL-WALLET.md) | Double-entry ledger, P2P, KYC |
| 29 - Video & Live Streaming | [08-VIDEO-STREAMING](08-VIDEO-STREAMING.md) | CDN, transcoding, ABR |
| 33 - Food Delivery | [30-FOOD-DELIVERY](30-FOOD-DELIVERY.md) | Dispatch, batching, ETA |

### Partial coverage

| Web Business | System Design | Gap |
|---|---|---|
| 21 - Delivery & Supply Chain | [17-RIDE-SHARING](17-RIDE-SHARING.md) + [30-FOOD-DELIVERY](30-FOOD-DELIVERY.md) | Last-mile covered; warehouse logistics, fleet management missing |
| 31 - Workflow & Approval | [22-DISTRIBUTED-TASK-SCHEDULER](22-DISTRIBUTED-TASK-SCHEDULER.md) | DAG execution covered; business approval chains, delegation, SLA missing |

### Not covered (potential future topics)

| Priority | Web Business Topic | Potential System Design Topic | Key Concepts |
|---|---|---|---|
| Low | 04 - Subscription & Billing | Design Subscription System | Plan mgmt, dunning, proration, metering |
| Low | 12 - Multi-Tenancy | Design Multi-Tenant SaaS | Schema isolation, resource quotas, routing |
| Low | 19 - Feature Flags | Design Feature Flag System | Flag evaluation, targeting rules, gradual rollout |
| Low | 07 - Content Management | Design a CMS | Content modeling, workflows, versioning |
| Low | 30 - Customer Support | Design Ticketing System | Queue routing, SLA tracking, escalation |
| Low | 32 - Loyalty & Rewards | Design Loyalty System | Points ledger, tier calculation, redemption |
| Low | 34 - Online Education | Design E-Learning Platform | Progress tracking, video delivery, certificates |
| N/A | 05 - User Management | (subsumed by [27-AUTH-SSO-SYSTEM](27-AUTH-SSO-SYSTEM.md)) | — |
| N/A | 10 - DevOps Pipeline | (DevOps interview, not SD) | — |
| N/A | 13 - Data Privacy | (cross-cutting concern) | — |
| N/A | 15 - Internationalization | (not a system design topic) | — |
| N/A | 16 - SEO | (not a system design topic) | — |

## Study Timeline Suggestion

| Week | Focus | Topics |
|------|-------|--------|
| Week 1 | Framework + Tier 1 | Framework, URL Shortener, Rate Limiter |
| Week 2 | Tier 1 continued | Chat System, News Feed |
| Week 3 | Tier 2 | Notification, Cache, Autocomplete, Video |
| Week 4 | Tier 3 | Message Queue, KV Store, Crawler, Proximity |
| Week 5 | Tier 4 (Emerging) | RAG/LLM, ML Recommendation, Payment System |
| Week 6 | Tier 4 continued | Google Maps, Ride-Sharing, Distributed Logging |
| Week 7 | Tier 5 (Deep Dives) | Unique ID Generator, Collaborative Editor, Object Storage |
| Week 8 | Tier 5 continued | Task Scheduler, AI Agents, Event Sourcing, CDN, E-commerce |
| Week 9 | Tier 6 (Domain) | Auth & SSO, Ad Serving/RTB, Booking System |
| Week 10 | Tier 6 continued | Food Delivery, Search Engine |
| Week 11 | Tier 7 (Platform) | Analytics, Marketplace, Content Moderation |
| Week 12 | Tier 7 continued | Digital Wallet, API Gateway & Service Mesh |

Good luck with your interviews!
