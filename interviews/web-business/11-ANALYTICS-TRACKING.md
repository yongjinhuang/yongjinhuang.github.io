# Analytics & Tracking

## What Is It?

Analytics is measuring what users do in your app so you can make better decisions. Tracking is the mechanism — recording events like page views, button clicks, sign-ups, and purchases. Together they answer questions like: Where do users drop off? Which feature gets used most? Is the new landing page converting better? As a developer, you're instrumenting the code to collect this data and piping it to tools where product managers and marketers can analyze it.

## Why Should You Care?

Product decisions should be data-driven, not gut-driven. The PM asks "How many users complete onboarding?" and if nobody tracked that event, there's no answer. As a developer, you'll be asked to add tracking to almost everything you build. You need to understand: what events to track, how to structure event data, where to send it, and how to do it without killing performance or violating privacy laws.

## How It Works (The Business Flow)

### Event Tracking

Everything is an event. An event has a name and properties:

```
Event: "Button Clicked"
Properties:
  button_name: "Sign Up"
  page: "/pricing"
  user_id: "abc123"
  timestamp: "2026-03-01T10:30:00Z"
```

Events are sent from the client (browser/mobile) or server to an analytics platform (Mixpanel, Amplitude, Google Analytics, PostHog).

### The Tracking Plan

Before writing any tracking code, define a tracking plan — a spreadsheet or document listing:

| Event Name | When It Fires | Properties | Tracked By |
|-----------|---------------|------------|------------|
| Page Viewed | Every page load | page_url, referrer | Client |
| Sign Up Started | User opens signup form | source (organic, ad, referral) | Client |
| Sign Up Completed | User finishes registration | method (email, google, github) | Server |
| Purchase Completed | Payment succeeds | amount, currency, plan_name | Server |

A tracking plan prevents chaos. Without it, you'll end up with duplicate events, inconsistent naming, and missing data.

### Funnels

A funnel tracks users through a multi-step process:

```
Landing Page → Sign Up Page → Fill Form → Submit → Verify Email → Active User
   1000            400           300        250        200           180
```

Each step has a conversion rate. The biggest drops show where to focus improvement efforts.

### Cohort Analysis

Group users by when they signed up (or any shared characteristic) and compare their behavior:

- "Users who signed up in January" vs "Users who signed up in February"
- Track retention: what percentage are still active after 7 days, 30 days, 90 days?

### A/B Testing

1. Split users into two groups randomly
2. Group A sees the current version (control)
3. Group B sees the new version (variant)
4. Track the metric you care about (conversion rate, click-through, revenue)
5. After enough data, determine which version wins with statistical significance
6. Roll out the winner to everyone

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Event** | A tracked user action (page view, click, purchase) |
| **Property** | Metadata attached to an event (page URL, button name, amount) |
| **Funnel** | A sequence of steps users go through, with drop-off rates at each step |
| **Conversion Rate** | Percentage of users who complete a desired action |
| **Cohort** | A group of users who share a characteristic (signup date, source) |
| **Retention** | What percentage of users come back after a given time period |
| **DAU/MAU** | Daily/Monthly Active Users — the most basic engagement metrics |
| **Session** | A period of user activity. Typically ends after 30 minutes of inactivity |
| **Attribution** | Determining which marketing channel (ad, email, organic) led to a conversion |
| **UTM Parameters** | URL parameters (`utm_source`, `utm_medium`, `utm_campaign`) that track where traffic comes from |
| **CTR** | Click-Through Rate — clicks divided by impressions |
| **LTV / CLV** | Lifetime Value / Customer Lifetime Value — total revenue a customer generates over their relationship with you |
| **CAC** | Customer Acquisition Cost — how much you spend to acquire one customer |
| **Statistical Significance** | Confidence that A/B test results are real, not random chance. Usually p < 0.05 |

## Common Patterns

### Pattern 1: Client-Side Tracking

JavaScript SDK in the browser captures events and sends them to the analytics platform.

**When it's used:** Page views, clicks, form interactions, UI engagement.

**Trade-off:** Can be blocked by ad blockers (30-40% of users). Subject to client-side bugs and race conditions.

### Pattern 2: Server-Side Tracking

Your server sends events to the analytics platform. Triggered by API calls, database changes, or business logic.

**When it's used:** Revenue events, sign-ups, critical business metrics that must be accurate.

**Trade-off:** Can't be ad-blocked. More reliable. But can't track UI interactions (what users hover over, scroll depth).

### Pattern 3: Event Streaming (Data Pipeline)

Events are sent to a central data pipeline (Segment, Rudderstack) that fans out to multiple destinations (analytics, CRM, data warehouse, marketing tools).

```
App → Segment → Mixpanel (product analytics)
              → Google Analytics (web analytics)
              → Salesforce (CRM)
              → BigQuery (data warehouse)
```

**When it's used:** Companies that use multiple analytics tools and want a single source of truth.

**Trade-off:** Extra infrastructure cost. But changing analytics tools becomes trivial (just add/remove a destination).

## Gotchas & Edge Cases

- **Naming conventions**: `signUp`, `sign_up`, `Sign Up`, `user_signed_up` — pick ONE convention and enforce it. Inconsistent naming makes data analysis a nightmare.
- **Don't track everything**: It's tempting to track every click. But too much data is as useless as too little. Focus on events that answer specific business questions.
- **PII in events**: Never put emails, names, or other personally identifiable information in event properties unless your analytics platform is set up for it. Some tools send data to third parties.
- **Ad blockers**: 30-40% of users block analytics scripts. For critical metrics, use server-side tracking.
- **Consent management**: GDPR requires consent before tracking. Implement a cookie banner and only fire analytics after the user opts in.
- **Clock skew**: Client timestamps can be wrong (user's device clock is off). Use server timestamps for anything time-sensitive.
- **Sampling**: At high volume, some analytics tools sample data (analyze a subset, not all events). Know when your data is sampled and what that means for accuracy.
- **Attribution is hard**: User sees an ad on Monday, googles you on Wednesday, clicks a friend's link on Friday, and buys on Saturday. Who gets credit? There's no perfect answer — that's why there are different attribution models (first touch, last touch, linear, etc.).

## Quick Reference

| What to Track | Where to Track | Why |
|--------------|----------------|-----|
| Page views, clicks, scrolls | Client-side | UI engagement |
| Sign-ups, purchases, subscriptions | Server-side | Accurate business metrics |
| Feature usage | Both | Product decisions |
| Errors and exceptions | Both | Reliability monitoring |
| Marketing attribution | Client-side (UTM params) | ROI on marketing spend |
