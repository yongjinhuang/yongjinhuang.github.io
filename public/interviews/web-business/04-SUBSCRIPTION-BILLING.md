# Subscription & Billing

## What Is It?

Subscription billing is recurring revenue — customers pay on a regular schedule (monthly, yearly) for ongoing access to your product or service. Think Netflix, Spotify, SaaS tools like Slack or Notion. As a developer, you're building the plan selection, payment collection, and the logic that decides what happens when a payment fails, a customer upgrades, or a trial expires.

## Why Should You Care?

Subscriptions are the dominant business model for modern SaaS. Most of the web apps you'll build for companies will have some form of recurring billing. The business logic is deceptively complex — proration, dunning, plan changes mid-cycle, tax calculations, and free trials all have subtle edge cases that can cost real money if you get them wrong.

## How It Works (The Business Flow)

### Signing Up

1. User picks a plan (Free, Pro, Enterprise)
2. User enters payment method (credit card, usually)
3. System creates a subscription with the payment gateway (Stripe, etc.)
4. First payment is charged immediately (or after trial period)
5. User gets access to the features included in their plan

### The Billing Cycle

1. On each billing date, the gateway automatically charges the customer
2. If successful → invoice generated → receipt emailed → subscription stays active
3. If failed → retry logic kicks in (see "Dunning" below)
4. Gateway sends a webhook to your server for every event (payment succeeded, failed, etc.)

### Plan Changes (Upgrades / Downgrades)

**Upgrading mid-cycle (e.g., Basic → Pro):**

1. Customer clicks "Upgrade"
2. System calculates proration: "You've used 15 days of your Basic plan. Here's the credit. The Pro plan costs X more."
3. Customer is charged the prorated difference immediately (or on next invoice)
4. Access to Pro features is granted right away

**Downgrading:**

1. Customer clicks "Downgrade"
2. Usually takes effect at the end of the current billing period (so they keep access until they've paid for)
3. Next invoice reflects the lower plan price

### Free Trials

1. User signs up for a trial (7 days, 14 days, 30 days)
2. Some trials require a credit card upfront, some don't
3. During trial, user has full (or limited) access
4. When trial ends: if card is on file → auto-charge and start subscription. If no card → account is downgraded or locked
5. Send reminder emails before trial expires (3 days out, 1 day out)

### Cancellation

1. Customer clicks "Cancel"
2. Two options:
   - **Cancel at period end**: Keep access until the current period expires, then stop billing
   - **Cancel immediately**: Stop access and billing now, possibly with a prorated refund
3. Most SaaS companies use "cancel at period end" — it's less jarring and sometimes customers come back before the period ends

### Dunning (Failed Payment Recovery)

1. Payment fails (expired card, insufficient funds)
2. System retries automatically (typically: retry after 3 days, 5 days, 7 days)
3. Send email to customer: "Your payment failed, please update your card"
4. If all retries fail → subscription is paused or cancelled
5. Good dunning can recover 20-40% of failed payments

## Key Terms You'll Hear

| Term                    | What It Means                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| **MRR**                 | Monthly Recurring Revenue — the holy metric for subscription businesses                                  |
| **ARR**                 | Annual Recurring Revenue — MRR × 12                                                                      |
| **Churn**               | Percentage of customers who cancel per period. 5% monthly churn = you lose half your customers in a year |
| **Proration**           | Adjusting charges when a customer changes plans mid-cycle                                                |
| **Dunning**             | The process of recovering failed payments through retries and emails                                     |
| **Seat-Based Pricing**  | Charging per user (e.g., $10/user/month). Common in B2B SaaS                                             |
| **Usage-Based Pricing** | Charging based on consumption (API calls, storage, compute hours)                                        |
| **Tiered Pricing**      | Different price per unit at different volume levels                                                      |
| **Flat-Rate Pricing**   | One price for everything. Simple but less flexible                                                       |
| **Freemium**            | Free tier with limited features + paid tiers with more. Not the same as a free trial                     |
| **Invoice**             | A formal billing document sent to the customer for each charge                                           |
| **Billing Period**      | The time between charges (monthly, quarterly, annually)                                                  |
| **Grace Period**        | Extra time given after a failed payment before cutting off access                                        |
| **Entitlements**        | What features/resources a plan includes (e.g., Pro plan gets 100GB storage)                              |
| **Coupon / Discount**   | A reduction applied to the subscription price (percentage or fixed amount, limited or ongoing)           |

## Common Patterns

### Pattern 1: Plan-Based (Most Common)

Fixed plans with fixed prices. Free → Pro → Enterprise. Each plan has a defined set of features.

**When it's used:** Most SaaS products. Simple for customers to understand.

**Trade-off:** Hard to capture value from heavy users. Light users might feel overpaying.

### Pattern 2: Seat-Based

Charge per user. The more team members, the higher the bill.

**When it's used:** Collaboration tools (Slack, Notion, Jira).

**Trade-off:** Customers game the system (sharing accounts). You need to decide: what counts as a "seat"?

### Pattern 3: Usage-Based

Charge for what you use. Like a utility bill.

**When it's used:** Infrastructure (AWS), API services (Twilio), AI APIs (OpenAI).

**Trade-off:** Revenue is unpredictable. Customers may fear surprise bills. You need metering infrastructure.

### Pattern 4: Hybrid

Base plan + usage overage. "Pro plan includes 10,000 API calls. After that, $0.01 per call."

**When it's used:** The best-of-both-worlds approach. Increasingly popular.

**Trade-off:** Billing logic is the most complex. Clear communication is essential so customers understand what they'll pay.

## Gotchas & Edge Cases

- **Proration math is tricky**: If a customer upgrades from $10/month to $20/month on day 15 of a 30-day cycle, how much do you charge? ($5 credit + $10 charge = $5 net). Let your payment gateway handle this.
- **Timezone issues**: When does a billing cycle start? Midnight in which timezone? Be consistent.
- **Annual vs monthly switching**: Customer on annual plan wants to switch to monthly mid-year. Do you refund the remaining annual balance? What if they got a discount for annual?
- **Grandfathering**: When you raise prices, existing customers usually keep their old price. Your billing system needs to support this.
- **Multiple subscriptions**: Can a user have more than one active subscription? (e.g., a personal plan and a team plan). This adds complexity.
- **Tax on subscriptions**: Subscription tax rules differ by jurisdiction. Digital services are taxed differently than physical goods in many places.
- **Free trial abuse**: Users sign up for a trial, cancel, create a new account, repeat. You need device fingerprinting or card uniqueness checks.
- **Webhook reliability**: Your webhook handler must be idempotent. Stripe may send the same event multiple times.

## Quick Reference

| Scenario             | Recommended Approach                                 |
| -------------------- | ---------------------------------------------------- |
| Starting out         | Simple plan-based pricing (2-3 tiers)                |
| B2B SaaS             | Seat-based + plan tiers                              |
| API / Infrastructure | Usage-based or hybrid                                |
| Free trial           | 14 days with card required → higher conversion       |
| Failed payments      | Automated dunning (3+ retries over 2 weeks)          |
| Plan changes         | Use gateway's proration logic (don't build your own) |
| Cancellation         | Cancel at period end + winback email sequence        |
| Revenue tracking     | Track MRR, churn rate, LTV, CAC                      |
