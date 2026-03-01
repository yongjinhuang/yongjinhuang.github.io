# System Design Interview Preparation Guide

## Overview

This directory contains comprehensive system design interview preparation materials covering **18 topics** across classic fundamentals and emerging 2025-2026 trends. Each guide follows a structured approach with data modeling, architecture diagrams, trade-off analysis, and scaling strategies.

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

## Study Timeline Suggestion

| Week | Focus | Topics |
|------|-------|--------|
| Week 1 | Framework + Tier 1 | Framework, URL Shortener, Rate Limiter |
| Week 2 | Tier 1 continued | Chat System, News Feed |
| Week 3 | Tier 2 | Notification, Cache, Autocomplete, Video |
| Week 4 | Tier 3 | Message Queue, KV Store, Crawler, Proximity |
| Week 5 | Tier 4 (Emerging) | RAG/LLM, ML Recommendation, Payment System |
| Week 6 | Tier 4 + Review | Google Maps, Ride-Sharing, Distributed Logging |

Good luck with your interviews!
