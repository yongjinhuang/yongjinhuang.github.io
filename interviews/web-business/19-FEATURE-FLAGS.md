# Feature Flags & Rollouts

## What Is It?

Feature flags (also called feature toggles) are switches in your code that let you turn features on or off without deploying new code. Instead of deploying a feature to everyone at once, you deploy the code with the feature behind a flag, then gradually enable it — first for internal testers, then beta users, then 10% of all users, then everyone. It separates "deploying code" from "releasing a feature," and that separation is powerful.

## Why Should You Care?

Without feature flags, releasing a new feature means deploying code and hoping nothing breaks. If it does break, you have to roll back the entire deployment. With feature flags, you can instantly disable a broken feature without touching the deployment. You can test in production with real users, run A/B experiments, and give enterprise customers early access. It's how companies like Facebook, Netflix, and Google ship features to billions of users safely.

## How It Works (The Business Flow)

### Basic Feature Flag

```javascript
if (featureFlags.isEnabled('new-checkout-flow', user)) {
  renderNewCheckout();
} else {
  renderOldCheckout();
}
```

The flag evaluation happens at runtime. The flag's state can be changed without redeploying code.

### Flag Lifecycle

1. **Create**: Developer creates a flag for a new feature (default: OFF)
2. **Development**: Code is written behind the flag. Only developers see it (flag is ON for dev environment)
3. **Internal Testing**: Flag is enabled for internal users / QA team
4. **Beta / Early Access**: Flag is enabled for a group of beta users
5. **Gradual Rollout**: Flag is enabled for 5% → 25% → 50% → 100% of users
6. **Full Release**: Flag is ON for everyone. The feature is fully released
7. **Cleanup**: Remove the flag from code. This step is often forgotten (see Gotchas)

### Targeting Rules

Flags aren't just ON or OFF. They can target specific users or groups:

- **User ID**: Enable for user "abc123" (QA testing)
- **Email domain**: Enable for `@yourcompany.com` (internal testing)
- **Country**: Enable for users in Canada first (regional rollout)
- **Plan tier**: Enable for Enterprise customers only
- **Percentage**: Enable for 10% of all users (random, consistent per user)
- **Custom attributes**: Enable for users who signed up after January 2026

### A/B Testing with Flags

1. Create a flag with multiple variants (not just on/off)
2. Variant A: current design. Variant B: new design
3. Users are randomly assigned to a variant (and stay in that variant — "sticky bucketing")
4. Track the metric you care about (conversion rate, engagement, revenue)
5. After reaching statistical significance, pick the winner and roll it out to 100%

### Kill Switch

The most basic use of a feature flag — an emergency OFF switch for a feature that's causing problems.

1. Feature is live and working
2. Something goes wrong (performance issue, bug, third-party dependency failure)
3. On-call engineer toggles the flag OFF in the feature flag dashboard
4. Feature is instantly disabled for all users
5. No deployment needed. Incident resolved in seconds.

## Key Terms You'll Hear

| Term                        | What It Means                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Feature Flag / Toggle**   | A conditional switch that controls feature visibility                                                    |
| **Flag Evaluation**         | The process of determining if a flag is on or off for a specific user/request                            |
| **Targeting Rule**          | Conditions that determine who sees the feature (user ID, percentage, attribute)                          |
| **Rollout**                 | Gradually increasing the percentage of users who see a feature                                           |
| **Canary Release**          | Releasing to a tiny percentage first, monitoring, then expanding                                         |
| **Kill Switch**             | Instantly disabling a feature in production without deploying                                            |
| **Variant**                 | One of multiple options in a flag (control, variant A, variant B)                                        |
| **Sticky Bucketing**        | Ensuring a user always sees the same variant once assigned                                               |
| **Flag Debt**               | Old, unused flags still in the code. Technical debt that must be cleaned up                              |
| **Trunk-Based Development** | Committing to main branch frequently, using flags to hide incomplete features                            |
| **Dark Launch**             | Deploying a feature to production but not showing it to users (backend processing happens, UI is hidden) |
| **Percentage Rollout**      | Enabling a feature for X% of users, gradually increasing                                                 |
| **Feature Gate**            | A flag that controls access to a feature (usually tied to a plan or permission)                          |

## Common Patterns

### Pattern 1: Boolean Flag (Simple On/Off)

The simplest flag. Feature is either enabled or disabled.

**When it's used:** Kill switches, feature launches, hiding incomplete features.

**Trade-off:** No nuance. Can't target specific users or run experiments.

### Pattern 2: Percentage Rollout

Enable for X% of users. Increase gradually.

```
Day 1: 5% (monitor metrics)
Day 3: 25% (still good)
Day 5: 50%
Day 7: 100% (full release)
```

**When it's used:** Any risky feature launch. Reduces blast radius of bugs.

**Trade-off:** Need consistent hashing so users don't flip between seeing and not seeing the feature.

### Pattern 3: User Segment Targeting

Enable based on user attributes (plan, country, role, signup date).

**When it's used:** Beta programs, enterprise-only features, regional launches.

**Trade-off:** More complex targeting rules. Need up-to-date user attributes available at evaluation time.

### Pattern 4: Multivariate Flag (A/B/C Testing)

Flag has multiple variants, not just on/off. Used for experiments.

**When it's used:** Testing different designs, pricing, copy, algorithms.

**Trade-off:** Requires experiment tracking infrastructure and statistical analysis.

## Gotchas & Edge Cases

- **Flag cleanup is essential**: Every flag you add is technical debt. Set a reminder to remove the flag after full rollout. Companies accumulate hundreds of dead flags that make code harder to read and maintain.
- **Testing all paths**: With 5 active flags, you have 32 possible combinations. Testing becomes exponential. Minimize active flags and test the most important combinations.
- **Server vs client evaluation**: Evaluating flags on the server is more secure (users can't see/modify flag values). Client-side evaluation is faster (no server round-trip) but exposes flag configuration.
- **Flag dependency chains**: Flag A enables a feature that depends on Flag B being ON. Document dependencies and test them.
- **Database migrations behind flags**: You can flag-gate code, but you can't easily flag-gate a database schema change. Plan database changes to be compatible with both flag states.
- **Consistent experience**: If a user sees the new checkout on Monday (flag ON for them) and the old checkout on Tuesday (flag turned OFF for maintenance), it's confusing. Changes to flag state should be deliberate.
- **Flag service outage**: What happens if your feature flag service (LaunchDarkly, Split) goes down? Your app must have sensible defaults. Most SDKs cache flag values locally.
- **Permissions vs flags**: Don't use feature flags as a permanent authorization system. Flags are temporary. Use proper RBAC for long-term access control.

## Quick Reference

| Use Case                | Flag Type          | Example                                            |
| ----------------------- | ------------------ | -------------------------------------------------- |
| Hide incomplete feature | Boolean (OFF)      | `new-dashboard: false`                             |
| Safe feature launch     | Percentage rollout | `new-search: 5% → 25% → 100%`                      |
| Beta program            | User segment       | `advanced-analytics: enterprise-plan-only`         |
| A/B experiment          | Multivariate       | `checkout-layout: [control, variant-a, variant-b]` |
| Emergency shutoff       | Kill switch        | `payment-processing: true → false in 2 seconds`    |
| Regional launch         | Targeting rule     | `new-feature: country in [US, CA]`                 |

| Tool                     | Type               | Notes                                       |
| ------------------------ | ------------------ | ------------------------------------------- |
| LaunchDarkly             | SaaS               | Most popular. Enterprise-focused. Expensive |
| Flagsmith                | Open source / SaaS | Good balance of features and cost           |
| Unleash                  | Open source        | Self-hosted, no vendor lock-in              |
| PostHog                  | SaaS + self-hosted | Feature flags + analytics + experiments     |
| Custom (database/config) | DIY                | Simple, no dependencies, limited features   |
