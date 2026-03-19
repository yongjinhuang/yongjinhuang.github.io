# Marketplace & Two-Sided Platforms

## What Is It?

A marketplace is a platform that connects two distinct groups — typically buyers and sellers — and facilitates transactions between them. Unlike a traditional e-commerce store that sells its own inventory, a marketplace doesn't own the goods. It provides the venue, the trust infrastructure, and the transaction rails. Think Amazon Marketplace, Shopee, Airbnb, Uber, and Etsy. Your job as a developer is to build the systems that make both sides want to show up and keep coming back.

## Why Should You Care?

Marketplaces are among the most valuable businesses on the internet, and they come with engineering problems you won't find in a standard web app. You need to solve for two user types simultaneously, handle money flowing between strangers, manage trust at scale, and build systems where supply and demand reinforce each other. If you've only built single-sided applications, marketplace work will challenge your assumptions about user flows, data modeling, and platform responsibility.

## How It Works (The Business Flow)

### The Chicken-and-Egg Problem

Every marketplace starts with the same dilemma: buyers won't come without sellers, and sellers won't come without buyers. This is the cold start problem, and how you solve it defines whether the platform survives.

Common strategies:

1. **Single-player mode**: Make the product useful for one side even without the other. Airbnb hosts could use it as a listing page before any bookings happened.
2. **Subsidize one side**: Uber offered guaranteed minimum earnings to early drivers. Shopee gave sellers zero-commission deals at launch.
3. **Constrain the market**: Start in one geography or category. Amazon started with books. Uber started in San Francisco.
4. **Seed supply manually**: Physically onboard sellers, create listings on their behalf, or aggregate existing supply from other platforms.

### Seller Onboarding & Verification

Before sellers can list anything, they go through onboarding:

1. **Registration**: Basic info — business name, contact, bank account for payouts
2. **Identity verification**: Government ID, business license, tax ID. The level of verification depends on risk tolerance. Airbnb verifies hosts; Amazon verifies brand owners.
3. **Store setup**: Seller configures their storefront — logo, description, shipping policies, return policies
4. **Approval**: Platform reviews the application. Some marketplaces auto-approve (eBay), others have manual review (Shopee Mall)
5. **Probation period**: New sellers may have listing limits or delayed payouts until they build a track record

### Product Listing & Catalog Management

Sellers create listings, but the platform controls the catalog structure:

1. **Category taxonomy**: A hierarchical tree of product categories (Electronics > Mobile Phones > Accessories). This taxonomy powers navigation, search filters, and ad targeting. Maintaining it is a surprisingly large operational effort.
2. **Listing creation**: Seller fills in title, description, images, price, stock, shipping options. The platform validates quality — minimum image resolution, prohibited keywords, required attributes per category.
3. **Catalog normalization**: Multiple sellers may sell the same product. Amazon groups them under one ASIN (product page), with a "Buy Box" that decides which seller gets the default purchase. Other platforms keep listings separate.
4. **Listing moderation**: Automated checks (image recognition for banned items, text scanning for policy violations) plus manual review queues for flagged content.

### Search Ranking for Sellers

Search is the marketplace's allocation mechanism. How you rank sellers determines who makes money:

- **Relevance**: Text match between query and listing title, description, attributes
- **Seller quality**: Ratings, response time, fulfillment speed, return rate
- **Conversion signals**: Click-through rate, add-to-cart rate, purchase rate for this listing
- **Recency**: Newer listings may get a temporary boost to test their performance
- **Paid placement**: Sponsored listings that sellers bid on (a major revenue stream for Shopee and Amazon)

The ranking algorithm is the invisible hand of the marketplace. Small changes can make or break a seller's business.

### Buyer-Seller Matching

Some marketplaces do explicit matching instead of search:

- **Uber**: Algorithm matches the nearest available driver to a rider request. Price is set by the platform (surge pricing), not the seller.
- **Airbnb**: Buyer searches and picks, but the platform ranks results and the host can accept or decline.
- **Shopee/Amazon**: Buyer searches, filters, compares, and picks. The platform influences through search ranking and the Buy Box.

The matching mechanism depends on whether the supply is fungible (any Uber driver works) or differentiated (each Airbnb listing is unique).

### Trust & Safety Systems

Trust is the core product of a marketplace. Without it, buyers and sellers would just transact directly.

**Reviews & Ratings:**

1. After a transaction, both sides can leave a review (rating + text)
2. Reviews are tied to verified purchases — you can't review what you didn't buy
3. Aggregate ratings (4.8 stars from 2,300 reviews) become a seller's reputation

**Fraud Detection in Reviews:**

- **Fake positive reviews**: Sellers pay for 5-star reviews. Detect via reviewer account age, purchase patterns, review timing clusters, text similarity analysis.
- **Fake negative reviews**: Competitors leave 1-star reviews. Detect via reviewer history with the competitor's products.
- **Review manipulation**: Sellers offer discounts in exchange for reviews. Monitor for keywords like "free product" in review text.
- **Behavioral signals**: Genuine reviewers browse before buying. Fraud accounts go straight to purchase and review.

**Seller Verification:**

- Identity checks, address verification, business license validation
- Ongoing monitoring: sudden changes in listing volume, category shifts, complaint spikes

### Escrow Payments

Money in a marketplace doesn't go directly from buyer to seller. It passes through the platform:

1. **Buyer pays**: Money goes to the platform's escrow account (or payment processor holds it)
2. **Order fulfilled**: Seller ships the product; buyer confirms receipt (or a timer auto-confirms)
3. **Payout**: Platform releases funds to the seller, minus the commission
4. **Settlement cycle**: Payouts happen on a schedule — daily, weekly, or after a holding period (7-14 days for new sellers)

This protects buyers (they can get refunds if things go wrong) and gives the platform control over fund flow. Shopee Guarantee and Airbnb's payment hold both work this way.

### Commission & Fee Models (Take Rate)

The take rate is the percentage of each transaction the platform keeps. This is the primary revenue model:

| Platform | Approximate Take Rate | Fee Structure                                        |
| -------- | --------------------- | ---------------------------------------------------- |
| Amazon   | 8-15%                 | Referral fee varies by category + optional FBA fees  |
| Shopee   | 2-5%                  | Commission + payment processing + optional ads       |
| Airbnb   | 14-20%                | Split between host fee (3%) and guest fee (14%+)     |
| Uber     | 20-30%                | Service fee from rider + commission from driver      |
| Etsy     | 6.5% + listing fees   | Transaction fee + payment processing + $0.20/listing |

Additional revenue streams: promoted listings (ads), subscription plans for premium seller tools, fulfillment services (Amazon FBA, Shopee Xpress), and financial products (seller loans).

### Dispute Resolution & Refunds

When things go wrong — and they will — the platform is the referee:

1. **Buyer opens a dispute**: Item not received, item not as described, damaged in transit
2. **Evidence collection**: Both sides submit proof — tracking info, photos, chat logs
3. **Resolution flow**: Automated rules handle common cases (e.g., if tracking shows delivered, deny "not received" claims after X days). Complex cases go to human reviewers.
4. **Outcomes**: Full refund, partial refund, return-and-refund, or dispute denied
5. **Seller penalties**: Too many disputes trigger warnings, listing restrictions, or account suspension

The dispute system must feel fair to both sides. Lean too far toward buyers, and sellers leave. Lean too far toward sellers, and buyers lose trust.

### Platform Governance

As the marketplace grows, you need rules and enforcement:

- **Seller policies**: What can be sold, pricing rules (no extreme gouging), shipping time requirements
- **Buyer policies**: Return windows, abuse detection (serial returners)
- **Content policies**: Prohibited items, intellectual property (counterfeit detection), listing quality standards
- **Enforcement tiers**: Warning, listing removal, temporary suspension, permanent ban
- **Appeals process**: Sellers can contest enforcement actions. This needs a queue and review workflow.

## Key Terms You'll Hear

| Term                  | What It Means                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Take rate**         | Percentage of GMV the platform keeps as revenue                                             |
| **GMV**               | Gross Merchandise Value — total value of goods sold through the platform                    |
| **Liquidity**         | Whether the marketplace has enough supply and demand for transactions to happen reliably    |
| **Network effects**   | More buyers attract more sellers, which attract more buyers. The platform's core moat       |
| **Cold start**        | The chicken-and-egg problem of getting initial supply and demand                            |
| **Buy Box**           | The default seller shown on a shared product page (Amazon's model)                          |
| **Escrow**            | Holding buyer payment until the transaction is confirmed complete                           |
| **Take-down**         | Removing a listing that violates platform policies                                          |
| **Seller tier**       | Ranking system for sellers (e.g., Shopee Preferred Seller) based on performance metrics     |
| **Chargeback**        | Buyer disputes a charge with their bank. The platform (not the seller) usually absorbs this |
| **Multi-homing**      | When sellers list on multiple platforms simultaneously (Shopee + Lazada + Amazon)           |
| **Disintermediation** | Buyers and sellers bypassing the platform to transact directly, avoiding fees               |

## Common Patterns

### Pattern 1: Managed Marketplace

The platform controls pricing, fulfillment, and customer service. The seller provides the product. Example: Uber (driver doesn't set the fare), Amazon FBA.

**Trade-off:** Consistent buyer experience, but sellers have less autonomy and margins are squeezed.

### Pattern 2: Open Marketplace

Sellers set prices, manage their own fulfillment, and handle customer service. The platform provides the venue and payment processing. Example: eBay, Etsy.

**Trade-off:** Lower operational burden for the platform, but inconsistent buyer experience.

### Pattern 3: Hybrid Marketplace

The platform sells its own inventory alongside third-party sellers. Example: Amazon (1P retail + 3P marketplace), Shopee Mall alongside regular Shopee sellers.

**Trade-off:** Platform competes with its own sellers, creating tension. But it ensures catalog coverage and quality benchmarks.

### Pattern 4: SaaS-Enabled Marketplace

The platform gives sellers tools (inventory management, analytics, marketing) that create lock-in beyond the transaction. Example: Shopify (evolving toward marketplace), Toast (restaurant POS + delivery marketplace).

**Trade-off:** Higher switching costs for sellers, but requires significant investment in tooling.

## Common Pitfalls

- **Ignoring one side**: Building features only for buyers while neglecting seller tooling. Sellers are your supply — if they churn, you have nothing to sell.
- **Wrong take rate**: Too high and sellers leave or raise prices. Too low and the platform can't sustain operations. Benchmark your category and iterate.
- **Scaling trust manually**: Human review doesn't scale. You need automated fraud detection, review moderation, and dispute resolution from early on.
- **No seller quality differentiation**: If a scammy seller looks the same as a great one, buyers lose trust. Surface seller performance metrics prominently.
- **Disintermediation risk**: If buyers and sellers connect and realize they can cut out the platform, they will. Provide ongoing value — payments, trust, dispute resolution, marketing — that makes the platform worth the fee.
- **Payout delays without communication**: Sellers live on cash flow. If you hold their money for 14 days with no visibility, they'll leave. Provide clear payout schedules and real-time balance tracking.
- **Category taxonomy debt**: Starting with a flat or poorly structured taxonomy and trying to fix it later is painful. Every listing, filter, and ad targeting system depends on it.
- **One-size-fits-all search ranking**: What works for electronics doesn't work for handmade goods. Ranking signals should be category-aware.

## Quick Reference

| Component           | Key Consideration                                                           |
| ------------------- | --------------------------------------------------------------------------- |
| Cold start          | Subsidize one side, constrain the market, seed supply manually              |
| Seller onboarding   | Identity verification, store setup, probation period                        |
| Product catalog     | Category taxonomy, listing moderation, catalog normalization                |
| Search ranking      | Relevance, seller quality, conversion signals, paid placement               |
| Trust & safety      | Verified reviews, fraud detection, seller tiers                             |
| Payments            | Escrow model, commission deduction, payout schedules                        |
| Dispute resolution  | Evidence-based, automated rules for common cases, human escalation          |
| Platform governance | Policies, enforcement tiers, appeals process                                |
| Revenue model       | Take rate, promoted listings, fulfillment services, seller tools            |
| Retention           | Prevent disintermediation by providing ongoing value beyond the transaction |
