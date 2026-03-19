# Payment Processing

## What Is It?

Payment processing is how money moves from a buyer to a seller in an online transaction. It involves multiple parties — the customer, the merchant (you), a payment gateway, a payment processor, the card networks (Visa, Mastercard), and the banks on both sides. As a web developer, you're building the checkout experience and integrating with services like Stripe, PayPal, or Adyen that handle the actual money movement.

## Why Should You Care?

Money is the most sensitive thing in your application. Bugs in payment code mean lost revenue, double charges, angry customers, and potential legal trouble. Even if you use Stripe and never touch raw card numbers, you still need to understand the business flow — when does money actually move? What happens during a refund? What's a chargeback and why should you be terrified of too many?

## How It Works (The Business Flow)

### The Checkout Flow

1. **Cart → Checkout**: User clicks "Buy" → system calculates total (items + tax + shipping - discounts)
2. **Payment Method Selection**: User picks credit card, PayPal, Apple Pay, bank transfer, etc.
3. **Payment Intent / Order Creation**: Your server creates a payment intent with the gateway (e.g., Stripe's `PaymentIntent`)
4. **Card Details Collection**: User enters card info into the gateway's secure form (never on your server)
5. **Authorization**: Gateway sends the card info to the processor → processor asks the issuing bank "Does this card have $50?" → bank says yes or no
6. **Hold**: If authorized, the money is held (not yet transferred). The order is "pending payment."
7. **Capture**: You confirm the order → gateway captures the held amount → money begins moving
8. **Settlement**: Usually 1-3 business days later, the money lands in your merchant account (minus fees)

### How Money Actually Flows

```
Customer → Issuing Bank → Card Network (Visa/MC) → Acquiring Bank → Payment Processor → Your Merchant Account
```

At each hop, someone takes a small fee. That's why payment processing costs 2-3% of each transaction.

### Refunds

1. Customer requests a refund (or you initiate one)
2. You call the gateway's refund API
3. Gateway reverses the transaction through the same chain
4. Money returns to the customer's card (3-10 business days)
5. You lose the transaction amount AND usually keep paying the processing fee

### Chargebacks (Disputes)

1. Customer calls their bank and says "I didn't authorize this" or "I never received the product"
2. Bank pulls the money back from you immediately
3. You receive a chargeback notification with a deadline to respond
4. You must provide evidence (receipts, shipping proof, logs) to fight it
5. Bank decides who wins. If you lose, you pay the amount + a chargeback fee ($15-25)
6. Too many chargebacks (>1% of transactions) → your payment account gets flagged or shut down

## Key Terms You'll Hear

| Term                  | What It Means                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Payment Gateway**   | The service you integrate with (Stripe, PayPal, Adyen). Handles secure communication with banks                                      |
| **Payment Processor** | The backend that routes transactions through card networks. Often the gateway is also the processor                                  |
| **Merchant Account**  | A bank account specifically for receiving payments from card transactions                                                            |
| **Authorization**     | Checking if the card is valid and has funds. No money moves yet                                                                      |
| **Capture**           | Actually pulling the authorized amount. Now money moves                                                                              |
| **Auth + Capture**    | The two-step process. Some businesses authorize immediately but capture later (e.g., hotels)                                         |
| **Settlement**        | When money actually arrives in your account (1-3 business days)                                                                      |
| **Chargeback**        | Customer disputes a charge through their bank. Very bad for merchants                                                                |
| **PCI DSS**           | Payment Card Industry Data Security Standard — rules for handling card data. If you use Stripe's hosted forms, you're mostly covered |
| **PCI SAQ**           | Self-Assessment Questionnaire — the form you fill out to prove PCI compliance                                                        |
| **3D Secure (3DS)**   | Extra authentication step ("Verified by Visa"). Shifts fraud liability from merchant to bank                                         |
| **Idempotency Key**   | A unique key you send with payment requests to prevent duplicate charges if a request is retried                                     |
| **Webhook**           | Payment gateways send you HTTP callbacks when events happen (payment succeeded, refund issued, dispute opened)                       |
| **PSP**               | Payment Service Provider — another name for the gateway/processor combo                                                              |

## Common Patterns

### Pattern 1: Redirect to Hosted Checkout

Customer clicks "Pay" → redirected to Stripe Checkout (or PayPal) → completes payment there → redirected back to your success page.

**When it's used:** Simplest integration. You never touch card data. Great for small businesses and MVPs.

**Trade-off:** Less control over the UI. Users leave your site temporarily.

### Pattern 2: Embedded Payment Form

You embed Stripe Elements (or similar) directly in your page. The form looks like part of your site but card data goes straight to Stripe's servers — never touches yours.

**When it's used:** Most production apps. You want a seamless checkout experience.

**Trade-off:** More integration work, but still PCI-safe because card data bypasses your server.

### Pattern 3: Server-Side Payment (API-Based)

Your server creates payment intents and manages the entire flow via API. Used for subscriptions, marketplaces, or complex flows.

**When it's used:** Recurring billing, marketplace payouts, custom checkout flows.

**Trade-off:** Most complex. You need robust error handling, webhook processing, and idempotency.

## Gotchas & Edge Cases

- **Double charges**: If a payment request times out, don't retry without an idempotency key. The first request might have succeeded.
- **Webhooks are the source of truth**: Don't rely solely on the client-side redirect. The user might close the browser. Always confirm payment status via webhook.
- **Currency matters**: $10.00 is represented as `1000` (cents) in most payment APIs. Mixing dollars and cents is a classic bug.
- **Tax calculation**: Tax rules are insanely complex (varies by state, country, product type). Use a service like Stripe Tax or Avalara. Don't try to calculate it yourself.
- **Partial refunds**: You can refund part of a payment. Track what's been refunded to avoid refunding more than the original amount.
- **Failed payments are normal**: Cards expire, funds run out, fraud checks trigger. Your app needs graceful failure handling.
- **PCI compliance**: Even using Stripe, you have some responsibilities (HTTPS, not logging card data, not storing CVV). Fill out your SAQ.
- **Testing**: Use test card numbers (Stripe: `4242 4242 4242 4242`). Never use real cards in development.
- **Marketplace payments**: If you're building a marketplace where sellers get paid, you need split payments or connected accounts (Stripe Connect). This adds significant complexity.

## Quick Reference

| Scenario                 | Recommended Approach                                   |
| ------------------------ | ------------------------------------------------------ |
| Simple one-time purchase | Hosted checkout (Stripe Checkout)                      |
| Custom checkout UI       | Embedded payment form (Stripe Elements)                |
| Recurring billing        | Subscription API with webhooks                         |
| Marketplace payouts      | Stripe Connect / PayPal Commerce                       |
| International payments   | Multi-currency support + local payment methods         |
| High-value orders        | Auth + Capture (authorize now, capture when shipping)  |
| Fraud prevention         | Enable 3D Secure + use Radar/fraud detection           |
| Refunds                  | Always process via API, never manually adjust balances |
