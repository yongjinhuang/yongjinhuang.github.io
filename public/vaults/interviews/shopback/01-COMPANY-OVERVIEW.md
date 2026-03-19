# ShopBack Company Overview

## What ShopBack Does

ShopBack is **Asia-Pacific's leading cashback and rewards platform**, founded in Singapore in 2014. The core business model:

1. User shops through ShopBack (app, browser extension, or website)
2. User gets redirected to merchant partner via affiliate link
3. Merchant pays ShopBack a referral commission on purchase
4. ShopBack keeps a cut and passes the rest as **cashback** to the user

```
┌──────────┐    Click    ┌──────────┐   Affiliate   ┌──────────┐
│   User   │───────────→│ ShopBack │──────Link────→│ Merchant │
│          │←───────────│          │←──────────────│          │
└──────────┘  Cashback   └──────────┘  Commission   └──────────┘
```

## Scale & Numbers

| Metric                 | Value                                                    |
| ---------------------- | -------------------------------------------------------- |
| Users                  | 55+ million shoppers                                     |
| Markets                | 13 countries (SG, MY, ID, PH, TH, TW, AU, VN, KR, US...) |
| Merchants              | 20,000+ partners                                         |
| Daily Transactions     | 500,000+                                                 |
| Annual Sales Powered   | US$4 billion+                                            |
| Total Cashback Awarded | S$1 billion+                                             |
| Employees              | ~946                                                     |
| Engineers              | 200+ across 4 tech hubs                                  |
| Funding                | US$350M total (Series F)                                 |
| Tech Hubs              | Singapore, Vietnam, Taiwan, Shenzhen                     |

## Product Lines

### 1. Online Cashback & Coupons

- Core product: earn cashback on online purchases
- Coupon aggregation for additional savings
- Browser extension for automatic cashback activation

### 2. ShopBack Pay

- In-store payments with cashback
- QR-based payment at physical retailers
- Extends cashback model to offline commerce

### 3. ShopBack Play

- Gamified rewards and engagement features
- Incentivizes daily app usage

### 4. Challenges

- Hyper-targeted advertiser offers
- Users complete specific shopping tasks for bonus rewards

### 5. Travel Vertical

- Real-time inventory and pricing for travel bookings
- Cashback on flights, hotels, and travel packages

## Tech Stack

### Backend

| Technology               | Usage                    |
| ------------------------ | ------------------------ |
| **Node.js + TypeScript** | Primary backend language |
| **Python**               | Secondary services       |
| **PHP**                  | Legacy services          |

### Frontend

| Technology | Usage                          |
| ---------- | ------------------------------ |
| **Svelte** | Public-facing website          |
| **React**  | Internal tools / some products |

### Data & Storage

| Technology            | Usage                       |
| --------------------- | --------------------------- |
| **Aurora PostgreSQL** | Primary relational database |
| **MongoDB**           | Document storage            |
| **NoSQL**             | Various use cases           |

### Infrastructure

| Technology        | Usage                                    |
| ----------------- | ---------------------------------------- |
| **AWS**           | Cloud provider (5+ regions, 11+ markets) |
| **Amazon S3**     | Object storage                           |
| **Cloudflare**    | CDN, bot management                      |
| **Microservices** | Architecture pattern                     |
| **Event-driven**  | Async processing                         |

### Tracking & Attribution

| Technology                 | Usage                     |
| -------------------------- | ------------------------- |
| **Server-to-Server (S2S)** | Purchase attribution      |
| **Affiliate networks**     | impact.com, Rakuten, etc. |

## Engineering Culture

### BREW (Better Engineering Weeks)

- 2-week quarterly sprints
- Cross-team collaboration on high-impact projects
- Engineers work outside their usual domains
- Recent BREW: multi-tenancy migration

### Multi-Tenancy Initiative

- **Before**: Each of 11 markets had independent stacks across 5 AWS regions
- **Problem**: Spawning new market infrastructure was slow, no standardization
- **Solution**: Shared infrastructure, centralized scaling, fewer configs
- **Impact**: Faster market expansion, better resource utilization

### Deployment

- Canary deployments for safe rollouts
- Feature flags for gradual releases
- AI tools encouraged (ChatGPT, Cursor, Claude)

## Key Engineering Challenges

### 1. Cashback Attribution

- Accurately tracking which ShopBack click led to which purchase
- Handling browser privacy changes (ITP, third-party cookie deprecation)
- S2S tracking as solution for cookie-less attribution
- 20,000+ merchants with different commission structures

### 2. Scale & Traffic

- 500K+ daily transactions across 13 markets
- Seasonal spikes: 11.11, Black Friday, Cyber Monday
- Member service handles 50%+ of all traffic
- Elastic scaling requirements

### 3. Multi-Market Complexity

- Different currencies, languages, regulations per market
- Country-specific merchant catalogs and deals
- Localized payment methods
- Timezone-aware deal scheduling

### 4. Real-Time Requirements

- Cashback status notifications
- Deal expiration tracking
- Inventory/pricing updates for travel vertical
- Browser extension real-time activation

## Competitors

- **Honey** (PayPal) - Browser extension, coupons, cashback
- **Rakuten** (formerly Ebates) - US-focused cashback
- **Cashrewards** - Australian cashback platform
- **Ibotta** - US cashback on groceries
- **TopCashback** - UK-focused cashback

## Why This Matters for Your Interview

Understanding ShopBack's business helps you:

1. **System Design**: Frame solutions around their actual problems (cashback tracking, deal systems, multi-tenancy)
2. **Coding**: Expect problems related to e-commerce domains (pricing, inventory, transactions)
3. **Behavioral**: Show genuine interest and domain knowledge
4. **Cultural Fit**: Demonstrate you understand their scale and engineering challenges
