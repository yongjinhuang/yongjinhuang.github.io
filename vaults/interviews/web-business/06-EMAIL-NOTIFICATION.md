# Email & Notifications

## What Is It?

Email and notifications are how your app communicates with users when they're not actively looking at your screen. Order confirmations, password resets, payment failures, new message alerts — these are all notifications. They span multiple channels: email, push notifications, SMS, and in-app messages. Getting this right is critical because it's often the only touchpoint between your app and your users.

## Why Should You Care?

A great product with terrible notifications is a product people forget about. Conversely, a product that sends too many notifications gets uninstalled. As a developer, you'll build notification systems for almost every app. You need to understand the business rules: when to send, which channel to use, how to respect user preferences, and what happens when delivery fails. Mess up transactional emails and customers never get their receipts. Mess up marketing emails and you get marked as spam.

## How It Works (The Business Flow)

### Transactional Emails

These are triggered by user actions and are expected:

1. User does something (signs up, places an order, resets password)
2. Your backend creates a notification event
3. Notification service picks up the event and selects the right template
4. Template is rendered with dynamic data (user name, order details)
5. Email is sent via a delivery provider (SendGrid, Postmark, SES)
6. Delivery provider reports back: delivered, bounced, or complained

**Examples:** Welcome email, order confirmation, password reset, payment receipt, shipping update.

### Marketing Emails

These are initiated by the business, not by user actions:

1. Marketing team creates a campaign (newsletter, promo, feature announcement)
2. Audience is selected (all users, segment, cohort)
3. Email is designed and tested (A/B subject lines, preview text)
4. Campaign is scheduled or sent
5. System tracks opens, clicks, unsubscribes

**Key difference:** Marketing emails MUST include an unsubscribe link (CAN-SPAM law). Transactional emails don't need one (but they shouldn't contain marketing content).

### Push Notifications

1. User grants notification permission in their browser or mobile app
2. A device token is generated and stored on your server
3. When an event occurs, your server sends a push via APNs (Apple) or FCM (Firebase/Google)
4. Notification appears on the user's device even if the app is closed
5. User taps the notification → app opens to the relevant screen

### SMS Notifications

1. User provides phone number and opts in
2. System sends SMS via a provider (Twilio, Vonage)
3. Used sparingly for high-priority messages: 2FA codes, fraud alerts, delivery notifications
4. SMS is expensive ($0.01-0.05 per message) and has strict consent requirements

### In-App Notifications

1. While the user is in your app, a notification badge or dropdown shows new items
2. Usually backed by a notifications table in your database
3. Can be real-time (WebSocket) or polled periodically
4. User can mark as read, dismiss, or click to navigate

## Key Terms You'll Hear

| Term                         | What It Means                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Transactional Email**      | Triggered by user action, expected and necessary (receipts, password resets)                                          |
| **Marketing Email**          | Sent to promote something. Requires opt-in and unsubscribe                                                            |
| **Bounce**                   | Email failed to deliver. Soft bounce = temporary (mailbox full). Hard bounce = permanent (address doesn't exist)      |
| **Complaint / Spam Report**  | Recipient marked your email as spam. Very bad for your sender reputation                                              |
| **Sender Reputation**        | A score that email providers assign to your sending domain. Low reputation = emails go to spam                        |
| **SPF / DKIM / DMARC**       | Email authentication protocols that prove your emails are legitimately from your domain. Essential for deliverability |
| **Open Rate**                | Percentage of recipients who opened the email. Increasingly unreliable (Apple Mail Privacy Protection)                |
| **Click-Through Rate (CTR)** | Percentage who clicked a link in the email                                                                            |
| **Unsubscribe Rate**         | Percentage who opt out after receiving an email. High rate = you're sending too much or irrelevant content            |
| **CAN-SPAM**                 | US law requiring unsubscribe links in commercial emails. Violations = $50K+ fines                                     |
| **GDPR Consent**             | In the EU, you need explicit opt-in before sending marketing emails                                                   |
| **Notification Preferences** | User settings for what they want to receive and on which channels                                                     |
| **Quiet Hours**              | Time window when notifications are suppressed (e.g., no push notifications between 10pm-8am)                          |

## Common Patterns

### Pattern 1: Event-Driven Notifications

Application events are published to a queue. A notification service consumes events and decides what to send, to whom, and on which channel.

```
User Action → Event → Notification Service → Channel (email / push / SMS / in-app)
```

**When it's used:** Most production applications. Decouples notification logic from business logic.

**Trade-off:** Requires a message queue or event bus. More infrastructure.

### Pattern 2: Template-Based Emails

Email content is defined as templates (HTML with variables). At send time, variables are filled in from the event data.

**When it's used:** Every email system. Templates live in the email provider (SendGrid templates) or your codebase.

**Trade-off:** HTML email rendering is a nightmare (Outlook uses Word's rendering engine). Use a framework like MJML or React Email.

### Pattern 3: Multi-Channel with Preferences

Each notification type can be sent on multiple channels. Users choose which channels they want for each type.

```
Order shipped → User prefers: email ✓, push ✓, SMS ✗ → send email + push
```

**When it's used:** Mature products with diverse notification types.

**Trade-off:** Complex preference management. Need a good UI for users to control their notifications.

## Gotchas & Edge Cases

- **Email deliverability is a whole discipline**: Set up SPF, DKIM, and DMARC. Warm up new sending domains. Monitor bounce rates. A single spam complaint spike can tank your deliverability for weeks.
- **Don't send from noreply@**: Users reply to transactional emails. Route them somewhere or at least use a monitored address.
- **Notification fatigue**: If every feature triggers a notification, users will turn off all notifications. Be selective about what's worth interrupting someone.
- **Deduplication**: If an event fires twice (queue retry), don't send two emails. Use idempotency keys.
- **Timing**: Don't send a "You left items in your cart" email 5 minutes after someone walks away. Wait 1-24 hours. Don't send it at 3am in their timezone.
- **Unsubscribe must work instantly**: If someone unsubscribes and gets another email the next day (because of a queue delay), they'll report you as spam.
- **Push notification tokens expire**: Device tokens can change. Handle token refresh and clean up invalid tokens.
- **Regulatory differences**: CAN-SPAM (US) requires unsubscribe. GDPR (EU) requires opt-in. CASL (Canada) is somewhere in between. Know which laws apply to your users.

## Quick Reference

| Channel               | Best For                                   | Cost               | Engagement |
| --------------------- | ------------------------------------------ | ------------------ | ---------- |
| Email (transactional) | Receipts, password resets, critical alerts | Low ($0.001/email) | Medium     |
| Email (marketing)     | Newsletters, promos, feature updates       | Low                | Low-Medium |
| Push notification     | Time-sensitive updates, new messages       | Free               | High       |
| SMS                   | 2FA, critical alerts, delivery updates     | High ($0.01-0.05)  | Very High  |
| In-app                | Non-urgent updates, activity feed          | Free               | Medium     |
