# Fintech & Digital Wallet

## What Is It?

A digital wallet is a software-based system that stores a user's funds electronically so they can make payments, transfer money, and manage balances without reaching for a physical card or bank account every time. Think PayPal, GrabPay, ShopeePay, or Apple Pay. From a fintech perspective, building a wallet means you're essentially building a mini bank — you hold money on behalf of users, move it between accounts, and comply with financial regulations in every country you operate in.

The scope ranges from simple stored-value wallets (prepaid balance for a single platform) to full-featured financial super-apps that offer P2P transfers, bill payments, virtual cards, investments, lending, and insurance — all within one app. Grab and Shopee in Southeast Asia, and PayPal and Stripe in the West, represent different points on this spectrum.

## Why Should You Care?

If you're building anything that touches money — e-commerce, ride-hailing, food delivery, peer-to-peer payments — you'll likely encounter wallet systems. Even if you never build one from scratch, understanding how they work helps you design better payment flows, spot fraud risks, and avoid regulatory landmines. Wallets also introduce concepts like ledger systems, settlement, and compliance that show up in technical interviews and system design discussions constantly.

The stakes are high. A bug in a social media feed shows the wrong post. A bug in a wallet system loses real money. Financial regulators can fine you, revoke your license, or shut you down entirely. Understanding this domain isn't just good engineering — it's the difference between a product that scales and one that gets banned from operating.

## How It Works (The Business Flow)

### Onboarding & KYC

1. **User Registration**: User signs up with email/phone and basic identity info
2. **KYC Verification**: You verify their identity — government ID scan, selfie match, address proof. This is legally required before they can transact above certain thresholds. Many wallets use third-party KYC providers (Jumio, Onfido) to automate document verification and liveness detection
3. **Sanctions & Watchlist Check**: The user's name and details are screened against global sanctions lists (OFAC, UN, EU) and politically exposed persons (PEP) databases
4. **Tiering**: Most wallets use tiered KYC. Unverified users get low limits ($200/month). Fully verified users get higher limits ($10,000+). This is how GrabPay and ShopeePay operate across Southeast Asia
5. **Wallet Creation**: Once verified, a virtual wallet account is created with a zero balance and a unique ledger entry

### Top-Up (Loading Funds)

1. **User selects top-up method**: Bank transfer, credit/debit card, convenience store cash-in, or another wallet
2. **Payment processed**: The payment gateway charges the user's funding source
3. **Holding period (conditional)**: For card-funded top-ups, many wallets impose a holding period (24-72 hours) before funds are transferable. This protects against chargebacks — if a user tops up with a stolen card and immediately transfers the money out, you're left holding the loss
4. **Balance credited**: Once confirmed, the wallet balance increases. A credit entry is recorded in the ledger
5. **Notification sent**: User receives confirmation of the top-up

The top-up flow varies dramatically by region. In Southeast Asia, convenience store cash-in (7-Eleven, Alfamart) is a major channel. In Europe, bank transfers via SEPA are common. In the US, debit card and ACH dominate. Your wallet needs to support the funding methods your users actually use.

### Payments & P2P Transfers

1. **User initiates payment**: Scan QR code at a merchant, select a contact for P2P, or pay at online checkout
2. **Fraud screening**: Device fingerprint, IP geolocation, and behavioral signals are evaluated in real-time
3. **Velocity checks**: System checks if this transaction exceeds daily/monthly limits or triggers suspicious patterns (e.g., 20 transfers in 5 minutes)
4. **Balance check**: Does the user have enough funds? If not, reject or offer top-up
5. **Debit sender, credit receiver**: Both sides of the transaction are recorded atomically in the ledger. This must happen in a single database transaction — partial writes (debit succeeded but credit failed) are catastrophic
6. **Rewards evaluation**: The cashback/rewards engine checks if this transaction qualifies for any active promotions
7. **Settlement**: For merchant payments, actual money movement to the merchant's bank happens later (often T+1 or T+2)

For P2P transfers specifically, many wallets allow sending to phone numbers or email addresses. If the recipient doesn't have a wallet yet, the funds are held in escrow and the recipient gets an invitation to sign up and claim them — a powerful growth mechanism that PayPal pioneered in its early days.

### Withdrawal

1. **User requests withdrawal** to a linked bank account
2. **AML screening**: System checks the withdrawal against anti-money laundering rules — is this user cashing out suspiciously fast after receiving funds? Has the source of funds been verified?
3. **Balance debited**: Funds are deducted from the wallet
4. **Bank transfer initiated**: An outbound transfer is queued and processed (ACH in the US, SEPA in Europe, SWIFT for international, or local fast-payment rails like PayNow in Singapore or PromptPay in Thailand)
5. **Confirmation**: User is notified once the bank confirms receipt (can take 1-3 business days)

### Virtual Card Issuance

1. **User requests a virtual card** from within the wallet app
2. **Card generated**: A card number, expiry, and CVV are generated via a card issuing partner (Marqeta, Stripe Issuing, or a banking partner)
3. **Linked to wallet balance**: Transactions on the virtual card draw from the wallet balance in real-time
4. **Authorization**: When used at checkout, the merchant's payment processor sends an authorization request that your system approves or declines based on available balance and fraud rules
5. **Use cases**: Online shopping, subscription payments, or adding to Apple Pay / Google Pay for in-store contactless payments

## Key Terms You'll Hear

| Term                            | What It Means                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KYC (Know Your Customer)**    | Identity verification process required by law before users can transact. Involves ID checks, address verification, and sometimes biometrics                                |
| **AML (Anti-Money Laundering)** | Rules and systems that detect and prevent money laundering. Includes transaction monitoring, suspicious activity reports, and sanctions screening                          |
| **Ledger**                      | The authoritative record of all financial transactions. Wallet systems use double-entry bookkeeping — every debit has a matching credit                                    |
| **Double-Entry Bookkeeping**    | Every transaction creates two entries: a debit from one account and a credit to another. Ensures the books always balance to zero                                          |
| **Velocity Check**              | Rules that limit how fast or how often a user can transact. Example: max 5 transfers per hour, max $5,000 per day                                                          |
| **Settlement**                  | The actual movement of real money between banks, which happens after the wallet transaction is recorded. Often batched daily                                               |
| **Reconciliation**              | The process of matching your internal ledger records against external bank statements to make sure nothing is missing or duplicated                                        |
| **Float**                       | Money sitting in your system between when a user tops up and when a merchant withdraws. Regulated heavily — you often must hold it in trust accounts                       |
| **Virtual Card**                | A programmatically generated card number linked to the wallet balance. Users can shop online as if they had a physical card                                                |
| **Chargeback**                  | When a user disputes a card-funded transaction through their bank. The bank pulls the money back, and you eat the loss unless you can prove the transaction was legitimate |
| **E-Money License**             | A regulatory license required in many countries to operate a digital wallet. Without it, you're operating illegally                                                        |
| **Cashback**                    | A percentage of the transaction returned to the user as a reward. Funded by the wallet operator or merchant as a growth incentive                                          |
| **P2P Transfer**                | Person-to-person money transfer within the wallet ecosystem. User A sends $20 to User B                                                                                    |
| **Sanctions Screening**         | Checking users and transactions against government watchlists (OFAC, EU sanctions) to ensure you're not facilitating terrorism financing                                   |
| **STR / SAR**                   | Suspicious Transaction Report / Suspicious Activity Report — a mandatory filing to regulators when you detect potentially illegal activity                                 |
| **PEP**                         | Politically Exposed Person — individuals in prominent public positions who require enhanced due diligence due to higher corruption risk                                    |
| **T+1 / T+2**                   | Settlement timing notation. T+1 means settlement happens one business day after the transaction date                                                                       |
| **Trust Account / Escrow**      | A segregated bank account where user funds are held separately from the company's operating funds, often legally required                                                  |

## Common Patterns

### Pattern 1: Tiered KYC with Progressive Access

Start users with minimal verification and low limits. As they provide more identity documents, unlock higher transaction limits and features like withdrawals or virtual cards.

**Typical tiers:**

- **Tier 0**: Email/phone only. Can receive money but not send or withdraw. Balance cap of $100.
- **Tier 1**: ID verified. Can send/receive up to $1,000/month. No withdrawals yet.
- **Tier 2**: Full KYC (ID + address + selfie). Full access to all features with limits up to $10,000+/month.

**Why it works:** Reduces onboarding friction. Users can start using the wallet immediately for small transactions while you collect verification documents in the background. PayPal and GrabPay both use this model.

**Trade-off:** You need robust systems to enforce tier-based limits and prompt users to upgrade at the right moment.

### Pattern 2: Double-Entry Ledger System

Every transaction creates exactly two entries — a debit and a credit. User A sends $50 to User B: debit User A's account $50, credit User B's account $50. The sum of all entries always equals zero.

```
Transaction: User A pays User B $50
  Entry 1: DEBIT  User_A_Wallet  -$50.00
  Entry 2: CREDIT User_B_Wallet  +$50.00
  Net: $0.00 (balanced)
```

**Why it works:** This is the foundation of financial accounting. It makes reconciliation possible, catches errors automatically (if entries don't balance, something is wrong), and provides an auditable trail for regulators. Every balance is derived by summing all ledger entries for that account — the balance is never stored as a mutable field.

**Trade-off:** More complex than a simple "update the balance" approach. You need immutable append-only logs — never delete or modify ledger entries. Corrections are made by adding reversal entries. Query performance can suffer as the ledger grows, so many systems maintain a materialized balance that's updated transactionally alongside the ledger entry.

### Pattern 3: Asynchronous Settlement with Batch Processing

Wallet transactions are instant for users, but actual bank-to-bank money movement is batched and settled later (usually daily). Your system maintains an internal ledger that's always up-to-date, even though the underlying bank transfers are lagging behind.

**Why it works:** Instant user experience without waiting for slow banking rails. Stripe and PayPal both operate this way — the wallet shows the transaction immediately, but settlement happens on a schedule.

**Trade-off:** You're effectively extending credit between settlement windows. You need enough float to cover the gap and robust reconciliation to catch discrepancies.

**How reconciliation works in practice:** Every day, your system generates a settlement file of all transactions that need to move real money. This file is sent to your banking partner. The bank processes the transfers and sends back a confirmation file. Your reconciliation engine matches every entry in your ledger against the bank's response and flags mismatches for manual investigation.

### Pattern 4: Multi-Currency Wallets

Users hold balances in multiple currencies within a single wallet. Each currency gets its own sub-ledger. Conversions happen at transaction time using real-time exchange rates, with a markup (typically 0.5-3%) that becomes your revenue.

**Why it works:** Essential for cross-border payments. GrabPay users in Singapore paying merchants in Malaysia need seamless currency conversion. PayPal supports 25+ currencies and makes significant revenue from FX markups.

**Trade-off:** Exchange rate volatility means you need to hedge your exposure. You also need to display rates transparently — regulators in many countries require this. You'll also need to handle rounding rules correctly per currency (JPY has no decimal places, BHD has three).

### Pattern 5: Rewards & Cashback Engine

A rules engine that evaluates each transaction and determines if cashback, points, or other rewards apply. Rules can be merchant-specific, category-based, time-limited, or tiered by spend amount.

**Why it works:** Drives adoption and repeat usage. ShopeePay's cashback campaigns are a major growth lever across Southeast Asia.

**Trade-off:** Rewards are a liability on your balance sheet. You need caps, expiration policies, and fraud detection to prevent abuse (e.g., users creating circular transactions to farm cashback).

### Pattern 6: Fraud Detection Pipeline

A multi-layered approach where each transaction passes through a series of checks: device fingerprinting, IP geolocation, velocity rules, machine learning risk scoring, and manual review queues for flagged transactions.

**Why it works:** No single check catches everything. Device fingerprinting catches account takeovers, velocity checks catch bots, and ML models catch sophisticated patterns that rule-based systems miss. PayPal runs transactions through hundreds of risk signals before approving them.

**Trade-off:** False positives frustrate legitimate users. You need tunable thresholds and a fast manual review process so flagged transactions don't sit in limbo for hours.

### Pattern 7: Event Sourcing for Financial State

Instead of storing just the current state (balance = $150), store every event that led to that state (topped up $200, paid $30, received $15, withdrew $35). The current balance is derived by replaying events.

**Why it works:** Perfect audit trail. You can reconstruct the state of any account at any point in time. Regulators love this. It also makes debugging easier — you can see exactly what happened and in what order.

**Trade-off:** Storage grows fast. You need snapshots and projections for read performance so you're not replaying thousands of events on every balance check.

## Common Pitfalls

- **Mutable balances**: Never update a balance field directly. Always append to the ledger and derive the balance from the sum of entries. Direct balance updates are how money goes missing.
- **Missing idempotency**: Network failures happen. If a top-up request is retried without an idempotency key, the user gets charged twice. Every financial endpoint needs idempotent handling.
- **Ignoring regulatory differences**: A wallet licensed in Singapore cannot legally operate in Indonesia without separate licensing. Each country has its own e-money regulations, KYC requirements, and transaction limits. GrabPay operates under different licenses in each Southeast Asian market.
- **Weak velocity checks**: Without proper rate limiting, a compromised account can drain its balance in seconds. Implement per-user, per-device, and per-IP velocity checks on all money-movement endpoints.
- **Poor reconciliation**: If you don't reconcile your ledger against bank statements daily, discrepancies will compound silently. By the time you notice, untangling months of mismatches is a nightmare.
- **Cashback abuse**: Users will find creative ways to exploit rewards — circular transfers between accounts, fake merchants, rapid refund-and-rebuy cycles. Build anomaly detection from day one.
- **Chargeback exposure**: When users top up via credit card and then transfer funds out, a subsequent chargeback means you lose the money. Many wallets add holding periods for card-funded top-ups to mitigate this.
- **Floating-point math**: Never use floating-point numbers for money. Use integers (cents) or decimal types. `0.1 + 0.2 !== 0.3` in most languages, and that rounding error adds up across millions of transactions.
- **Neglecting fraud signals**: Device fingerprinting, geolocation, behavioral biometrics, and transaction pattern analysis are not optional for wallets handling real money. PayPal's fraud detection system evaluates hundreds of signals per transaction.
- **Audit trail gaps**: Regulators will ask you to produce a complete history of any account's activity. If you've been deleting logs or overwriting records, you're in serious trouble. Every state change must be immutable and timestamped.
- **Licensing as an afterthought**: You cannot launch a wallet and get licensed later. In most jurisdictions, operating without an e-money license (or equivalent) is a criminal offense. The EU requires an EMI license, Singapore requires a Major Payment Institution license, and the US has state-by-state money transmitter licensing. Stripe and PayPal spent years and significant resources obtaining licenses in each market.
- **Ignoring timezone and cutoff issues**: Daily transaction limits reset at midnight — but midnight in which timezone? Settlement batches cut off at specific times. Getting this wrong means users see incorrect available balances or hit limits at unexpected times.
- **Not planning for disputes**: Users will claim they didn't authorize a transaction, or that they paid a merchant who didn't deliver. You need a dispute resolution process with investigation workflows, temporary credits, and communication templates. Regulators often mandate specific timelines for resolving disputes.

## Quick Reference

| Scenario              | Recommended Approach                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| User onboarding       | Tiered KYC — start light, progressively verify                                          |
| Storing balances      | Double-entry ledger with immutable entries, never mutable balance fields                |
| P2P transfers         | Atomic debit + credit in a single database transaction                                  |
| Top-up via card       | Use a payment gateway (Stripe, Adyen), add holding period before funds are transferable |
| Withdrawals           | AML screening, then queue for batch bank transfer                                       |
| Fraud detection       | Velocity checks + device fingerprinting + behavioral analysis                           |
| Multi-currency        | Separate sub-ledgers per currency, real-time FX rates with markup                       |
| Cashback/rewards      | Rules engine with caps, expiration, and abuse detection                                 |
| Virtual cards         | Partner with a card issuer (Marqeta, Stripe Issuing) to generate card numbers on demand |
| Reconciliation        | Daily automated matching of internal ledger vs. bank statements                         |
| Regulatory compliance | Obtain e-money license per country, implement KYC/AML per local requirements            |
| Chargebacks           | Holding periods on card-funded top-ups, evidence collection for disputes                |
| Settlement            | Batch processing on a schedule (T+1), with real-time internal ledger updates            |
| Licensing             | Research requirements early — EMI in EU, MPI in Singapore, MTL per state in US          |
| Audit readiness       | Immutable ledger, event sourcing, and comprehensive logging from day one                |
| Dispute resolution    | Built-in investigation workflow with temporary credits and resolution timelines         |
| Cross-border payments | Multi-currency sub-ledgers + transparent FX rates + local payment rail integration      |
