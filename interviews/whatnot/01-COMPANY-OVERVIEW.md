# Whatnot Company Overview

## What Whatnot Does

Whatnot is the **largest livestream shopping platform** in North America and Europe, founded in 2019 (Y Combinator W20). It combines eBay-style auctions with Twitch-like live video, creating a social commerce experience where sellers broadcast live and buyers bid in real-time.

```
┌──────────┐   Watch/Bid   ┌──────────┐   Live Video   ┌──────────┐
│  Buyer   │──────────────→│ Whatnot  │←──────────────│  Seller  │
│          │←──────────────│ Platform │───────────────→│          │
└──────────┘   Won Item    └──────────┘   8% Commission └──────────┘
                                │
                         ┌──────┴──────┐
                         │  Real-time  │
                         │  Auction    │
                         │  Engine     │
                         └─────────────┘
```

## Scale & Numbers

| Metric | Value |
|--------|-------|
| GMV (2025) | $8B+ (doubled from $3B in 2024) |
| Valuation | $11.5B (Series F, Oct 2025) |
| Revenue (2024) | ~$359M, targeting ~$1B for 2025 |
| Total Funding | ~$975M |
| Users | 20M+ new accounts in 2025 |
| Peak Concurrent | 583K viewers (MrBeast event, Feb 2026) |
| Platform Peak | 1.35M concurrent viewers |
| Daily Engagement | 80-95 min/day per user |
| Month-over-Month Retention | 80%+ |
| Sellers at $1M+ | 500+ sellers |
| Employees | ~1,644 |
| App Downloads (Nov 2025) | 1.61M (541% YoY growth) |
| Headquarters | Remote-first (US, UK, Ireland, Poland, Germany) |

## Business Model

### Revenue Streams
- **Seller Commission**: 8% (US) / 6.67% (UK/EU) on each sale
- **Payment Processing**: 2.9% + $0.30 per transaction
- **Advertising**: Boosted livestreams (launched 2023)
- **Blended Take Rate**: ~12-12.5%

### Product Categories
- Originally: Funko Pops and collectibles
- Now: Sports cards, coins, sneakers, fashion, beauty (+791% YoY), electronics (+444% YoY), jewelry (+259% YoY), and hundreds more
- Women shoppers more than doubled in 2025

### Auction Mechanics
- Sellers go live with video stream
- Items auctioned in 30-second to 1-minute windows
- Buyers bid in real-time via the app
- "Secret Max Bid" allows auto-bidding (proxy bidding)
- Also supports "Buy It Now" fixed-price listings and giveaways

## Tech Stack

### Backend Services

| Service | Technology | Responsibility |
|---------|-----------|----------------|
| **Main Backend** | Python/Flask, GraphQL | User profiles, inventory, payments, seller tools |
| **Live Service** | Elixir/Phoenix | Real-time auctions, chat, live interactions |
| **Admission Service** | Go | Rate limiting, load shedding, session caps |

### Live Service Architecture (Elixir)
- **Phoenix Channels**: WebSocket-based real-time communication
- **PubSub**: Livestreams modeled as PubSub topics
- **GenServer**: Each auction runs as an Elixir GenServer process
- **Horde**: Distributed process registry across cluster
- **Redis**: Giveaway state management

### Infrastructure

| Technology | Usage |
|-----------|-------|
| **AWS** | Primary cloud (EC2, ECS, EKS, Lambda, S3, Kinesis) |
| **Kubernetes** | Container orchestration |
| **Terraform** | Infrastructure as code |
| **Docker** | Containerization |
| **Apache Kafka** | Event bus backbone |
| **Elasticsearch/OpenSearch** | Search and discovery |
| **Datadog/Grafana** | Monitoring and observability |

### Data & ML

| Technology | Usage |
|-----------|-------|
| **Snowflake** | Data warehouse |
| **dbt** | Data transformation |
| **Dagster/Airflow** | Orchestration |
| **Spark/Flink** | Stream processing |
| **SageMaker** | ML model training and inference |
| **Statsig** | Experimentation (400+ experiments/year) |
| **Rockset** | Real-time aggregations |

### Video Delivery

| Technology | Usage |
|-----------|-------|
| **WebRTC** | Low-latency streams (small audiences) |
| **Amazon IVS** | Resilient streaming at scale |
| **Agora** | Ultra-high concurrency events |
| Multi-vendor | Dynamic provider selection based on stream size |

### Frontend
- React and GraphQL for web seller tooling
- Native iOS and Android apps

## Engineering Culture

### Core Principles
1. **Customer Obsession** - Team members actively use Whatnot
2. **Speed** - Ship for the community now, don't wait for perfection
3. **High Impact Focus** - Only work on the highest-impact problems
4. **Ownership** - See things through to completion

### Work Environment
- Remote-first ("office optional")
- Hubs in US, UK, Ireland, Poland, Germany
- Flexible PTO with company-wide Winter and Summer breaks
- 4.0/5.0 on Glassdoor (80% would recommend)

### Engineering Approach
- Engineers work across the full stack
- ~30 open engineering roles at any time
- Spans: frontend, backend, ML/AI, mobile, ads, merchant tooling, developer productivity
- Active experimentation culture (400+ annual experiments via Statsig)

## Key Engineering Challenges

### 1. Real-Time Bidding at Scale
- Auctions last 30-60 seconds with many concurrent bidders
- "Secret Max Bid" requires auto-bidding with sub-second consistency
- Must handle fast-paced bid events without race conditions

### 2. Live Streaming Scalability
- WebRTC works for small rooms but doesn't scale to massive audiences
- MrBeast event required 583K concurrent viewers on a single stream
- Solution: multi-vendor streaming with dynamic provider selection
- Chat priority management: auction events must take precedence over chat

### 3. Admission Control & Traffic Surges
- Design philosophy: "design for the peak, not the average"
- Every system must handle 3x traffic spikes
- Client Admission Service (Go): global session cap, rate-limited joins, deterministic load shedding
- Load shedding in Main Backend during zero-commission promotions

### 4. Real-Time Recommendations
- Livestreams are ephemeral: "you can't recommend yesterday's streams to today's users"
- Migrated from batch to online inference to eliminate cold-start problems
- Requires real-time signals: user behavior, seller activity, livestream metadata

### 5. Chat at Scale
- 50 people: 10 msgs/sec = 500 messages on the wire
- 50,000 people: 10 msgs/sec = 500,000 messages competing with auction events
- Priority management between chat and time-critical auction state

## Competitors
- **TikTok Shop** - Aggressive 6% commission, integrated with TikTok
- **Amazon Live** - Amazon's livestream shopping feature
- **eBay Live** - eBay's live auction platform
- **Poshmark** - Social commerce for fashion
- **NTWRK** - Livestream shopping for collectibles

Note: 62% of Whatnot sellers remain exclusive to the platform despite competition.

## Key Investors
- Andreessen Horowitz (a16z)
- Y Combinator
- DST Global
- CapitalG (Alphabet)
- Greycroft
- Avra

## Notable Engineering Blog Posts
- "Scaling Whatnot: Behind the Largest Live Shopping Stream in US History" (Feb 2026)
- "Expecting the Unexpected: Managing 3x Traffic Surges at Whatnot" (Sep 2024)
- "Evolving Feed Ranking at Whatnot" - Batch to online inference migration
- "Peeking Behind the Curtain of Secret Max Bid" - Auto-bidding engineering
- "Keeping Up with the Fans: Scaling with Elixir and Phoenix" (Apr 2022)
- "Scaling Data Stack with Kafka and Real-Time Stream Processing"
- Blog: medium.com/whatnot-engineering

## Why This Matters for Your Interview

Understanding Whatnot's business helps you:
1. **System Design**: Frame solutions around their actual problems (real-time auctions, livestream scaling, admission control)
2. **Coding**: Expect problems involving tries, BFS/DFS, graphs, hash maps (Medium to Medium-Hard)
3. **Behavioral**: Show genuine interest in live commerce and their engineering challenges
4. **Cultural Fit**: Demonstrate you understand their scale and "move fast" culture
