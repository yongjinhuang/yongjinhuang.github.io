# Web Business Knowledge for Developers

A practical guide to the business domains you'll encounter as a web developer. This isn't about code — it's about understanding the business logic behind what you're building.

## Why This Exists

You can be a great coder and still struggle in a new job because you don't understand the business. When your PM says "we need dunning logic" or "handle PCI compliance," you should know what they mean without Googling it. These articles give you that baseline.

## How to Use This Guide

Each article follows the same structure:

- **What Is It?** — Plain-English explanation
- **Why Should You Care?** — Real-world consequences for developers
- **How It Works** — The business flow, step by step
- **Key Terms** — The vocabulary your team uses
- **Common Patterns** — How most companies do it
- **Industry War Stories & Non-Obvious Best Practices** — Battle-tested production truths that textbooks rarely mention
- **Gotchas** — Things that trip people up
- **Quick Reference** — Cheat sheet for fast recall

## Topics

| #   | Topic                                                                   | One-Liner                                                          |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 01  | [Authentication & Authorization](01-AUTHENTICATION.md)                  | Who are you, and what can you do?                                  |
| 02  | [Payment Processing](02-PAYMENT.md)                                     | How money moves from buyer to seller                               |
| 03  | [E-Commerce](03-ECOMMERCE.md)                                           | The full lifecycle of online shopping                              |
| 04  | [Subscription & Billing](04-SUBSCRIPTION-BILLING.md)                    | Recurring revenue, plans, and invoices                             |
| 05  | [User Management](05-USER-MANAGEMENT.md)                                | The lifecycle of a user account                                    |
| 06  | [Email & Notifications](06-EMAIL-NOTIFICATION.md)                       | Getting messages to users reliably                                 |
| 07  | [Content Management](07-CMS.md)                                         | Creating, editing, and publishing content                          |
| 08  | [Search & Filtering](08-SEARCH-FILTERING.md)                            | Helping users find what they need                                  |
| 09  | [File Upload & Storage](09-FILE-UPLOAD-STORAGE.md)                      | Handling user files at scale                                       |
| 10  | [DevOps Pipeline](10-DEVOPS-PIPELINE.md)                                | From code commit to production                                     |
| 11  | [Analytics & Tracking](11-ANALYTICS-TRACKING.md)                        | Measuring what users actually do                                   |
| 12  | [Multi-Tenancy](12-MULTI-TENANCY.md)                                    | One app serving many customers                                     |
| 13  | [Data Privacy & Compliance](13-DATA-PRIVACY.md)                         | GDPR, CCPA, and keeping users' trust                               |
| 14  | [Third-Party Integrations](14-THIRD-PARTY-INTEGRATION.md)               | Connecting with external services                                  |
| 15  | [Internationalization](15-INTERNATIONALIZATION.md)                      | Making your app work worldwide                                     |
| 16  | [SEO](16-SEO.md)                                                        | Getting found by search engines                                    |
| 17  | [Rate Limiting & API Management](17-RATE-LIMITING-API.md)               | Protecting and productizing your API                               |
| 18  | [Caching Strategies](18-CACHING.md)                                     | Making things fast without breaking things                         |
| 19  | [Feature Flags & Rollouts](19-FEATURE-FLAGS.md)                         | Shipping safely with gradual releases                              |
| 20  | [Logging & Monitoring](20-LOGGING-MONITORING.md)                        | Knowing when things break before users tell you                    |
| 21  | [Delivery & Supply Chain](21-DELIVERY-SUPPLY-CHAIN.md)                  | How products move from warehouse to doorstep                       |
| 22  | [LLM & RAG for Business](22-LLM-RAG-BUSINESS.md)                        | How companies use AI to search, summarize, and generate            |
| 23  | [Instant Messaging & Real-time Chat](23-INSTANT-MESSAGING.md)           | How chat systems deliver messages in real time                     |
| 24  | [Social Feed & Content Moderation](24-SOCIAL-FEED-MODERATION.md)        | Building feeds and keeping platforms safe                          |
| 25  | [Marketplace & Two-Sided Platforms](25-MARKETPLACE.md)                  | Connecting buyers and sellers at scale                             |
| 26  | [Advertising & Ad Tech](26-AD-TECH.md)                                  | How ads are served, targeted, and measured                         |
| 27  | [Booking & Reservation Systems](27-BOOKING-RESERVATION.md)              | Managing finite resources over time                                |
| 28  | [Fintech & Digital Wallet](28-FINTECH-WALLET.md)                        | Moving money safely with KYC, wallets, and compliance              |
| 29  | [Video & Live Streaming](29-VIDEO-LIVE-STREAMING.md)                    | How video gets encoded, delivered, and monetized                   |
| 30  | [Customer Support & Ticketing](30-CUSTOMER-SUPPORT.md)                  | Managing user issues from ticket to resolution                     |
| 31  | [Workflow & Approval Systems](31-WORKFLOW-APPROVAL.md)                  | Routing decisions through approval chains                          |
| 32  | [Loyalty & Rewards Programs](32-LOYALTY-REWARDS.md)                     | Points, tiers, and keeping users coming back                       |
| 33  | [Food Delivery & On-Demand](33-FOOD-DELIVERY.md)                        | From order placement to doorstep delivery                          |
| 34  | [Online Education & E-Learning](34-ONLINE-EDUCATION.md)                 | Courses, progress tracking, and certificates                       |
| 35  | [Cashback & Affiliate Marketing](35-CASHBACK-AFFILIATE-MARKETING.md)    | Click attribution, S2S postbacks, and commission lifecycles        |
| 36  | [Live Commerce & Flash Sales](36-LIVE-COMMERCE-FLASH-SALES.md)          | Real-time auctions, soft-close bidding, and high-heat drop queues  |
| 37  | [Fraud, Risk & Chargeback Economics](37-FRAUD-RISK-TRUST-SAFETY.md)     | Risk engines, 3DS2, pre-dispute deflection, and card network rules |
| 38  | [Cross-Border Tax, VAT & FX](38-CROSS-BORDER-TAX-FX.md)                 | Merchant of Record, global tax nexus, DDP customs, and FX hedging  |
| 39  | [CRM, RevOps & Enterprise CPQ](39-CRM-REVOPS-CPQ.md)                    | Lead-to-cash pipelines, ramp deals, co-terming, and CRM sync       |
| 40  | [Accounting & Revenue Recognition](40-ACCOUNTING-REVENUE-RECOGNITION.md)| ASC 606 deferred revenue, ERP subledgers, and book-close cutoffs   |
| 41  | [Growth Engineering, PLG & A/B Testing](41-GROWTH-ENGINEERING-PLG.md)   | Reverse trials, viral loops, SRM checks, and orthogonal layers     |
| 42  | [CDP & Lifecycle Marketing Automation](42-CDP-MARKETING-AUTOMATION.md)  | Identity graphs, Reverse ETL, and stateful user journey canvases   |
| 43  | [Collaborative Workspaces & Doc SaaS](43-COLLABORATIVE-WORKSPACE-SAAS.md)| Hierarchical permissions, seat true-ups, and multiplayer editing  |
| 44  | [Ride-Sharing, Mobility & Local O2O](44-RIDE-SHARING-MOBILITY.md)       | Spatial dispatch, surge smoothing, and two-sided trip arbitration  |

## Reading Order

If you're new to all of this, start with **Authentication** (01), then **User Management** (05), then **Payment** (02). These three cover the most common business flows. After that, pick whatever's relevant to your current project.
