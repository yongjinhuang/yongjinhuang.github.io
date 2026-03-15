# Monetization & Ad Metrics

## Table of Contents

1. [The Ad Ecosystem](#the-ad-ecosystem)
2. [Key Metrics with Formulas and Benchmarks](#key-metrics-with-formulas-and-benchmarks)
3. [Why Playable Ads Outperform](#why-playable-ads-outperform)
4. [Creative Optimization](#creative-optimization)
5. [Production Pipeline](#production-pipeline)
6. [Business Models](#business-models)
7. [Interview Questions](#interview-questions)

---

## The Ad Ecosystem

### The Value Chain

```
Advertiser → Ad Network → Publisher

Example flow:
1. "Puzzle Game Inc." (advertiser) wants new players
2. They create a playable ad showing their game
3. They upload it to Facebook, Unity Ads, IronSource, etc. (ad networks)
4. The ad network shows it inside "News App" (publisher)
5. A user plays the ad, clicks "Install", downloads the game
6. Puzzle Game Inc. pays for that install
```

### Key Players

```
┌─────────────────────────────────────────────────────┐
│                    ADVERTISER                        │
│  (Game studio that PAYS for user acquisition)        │
│  Examples: King, Supercell, Zynga, indie studios     │
│                                                      │
│  Goal: Acquire high-quality users at low cost        │
│  Metric they care about: CPI, ROAS, LTV              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                   AD NETWORK                         │
│  (Platform that CONNECTS advertisers and publishers) │
│  Examples: Unity Ads, ironSource, AppLovin,          │
│            Facebook, Google Ads, Mintegral            │
│                                                      │
│  Revenue model: Takes % cut of ad spend              │
│  Key role: Targeting, optimization, fraud prevention  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                   PUBLISHER                          │
│  (App that SHOWS ads to earn revenue)                │
│  Examples: Free-to-play games, news apps, utilities  │
│                                                      │
│  Revenue model: Paid per impression or engagement    │
│  Metric they care about: eCPM, fill rate, UX impact  │
└─────────────────────────────────────────────────────┘
```

### Ad Formats

| Format | Description | Typical CPM | User Experience |
|--------|-------------|-------------|-----------------|
| Banner | Small bar at top/bottom | $0.50 - $2 | Low disruption, low engagement |
| Interstitial | Full-screen static/video | $5 - $15 | Medium disruption |
| Rewarded Video | User chooses to watch for reward | $10 - $30 | Good UX (opt-in) |
| Playable | Interactive mini-game | $15 - $50 | Best UX, highest engagement |
| Native | Blends with app content | $3 - $10 | Low disruption |

### Real-Time Bidding (RTB)

```
User opens app → Ad request sent → Multiple ad networks bid → Highest bid wins → Ad displayed

Timeline:
0ms     - User triggers ad opportunity
5ms     - Publisher's SDK sends bid request to ad exchange
10ms    - Exchange broadcasts to demand-side platforms (DSPs)
50ms    - DSPs evaluate user data, bid accordingly
100ms   - Auction closes, winner determined
150ms   - Winning ad creative delivered
200ms   - Ad begins rendering

Key factors in bid price:
- User demographics (age, gender, location)
- User behavior history (past installs, in-app purchases)
- Device type (iOS users typically more valuable)
- Time of day (evening = higher engagement)
- Ad format (playable commands higher bids)
- Creative performance history
```

### Ad Mediation

```
What: Platform that manages multiple ad networks simultaneously
Why: No single network fills 100% of inventory at optimal price

Mediation flow:
1. Ad opportunity arises
2. Mediation layer queries multiple networks
3. Uses waterfall or in-app bidding to select best option
4. Serves the winning ad

Waterfall vs. In-App Bidding:

WATERFALL (Legacy):
Network A (floor: $20 CPM) → miss
Network B (floor: $15 CPM) → miss
Network C (floor: $10 CPM) → fill!
Problem: Sequential, slow, may miss higher bids from lower-priority networks

IN-APP BIDDING (Modern):
All networks bid simultaneously
Network A bids: $12
Network B bids: $18  ← wins!
Network C bids: $8
Advantage: Fair auction, higher revenue, faster

Popular mediation platforms:
- ironSource (now Unity)
- AppLovin MAX
- Google AdMob
- Facebook Audience Network
```

---

## Key Metrics with Formulas and Benchmarks

### CPM (Cost Per Mille / Cost Per Thousand Impressions)

```
Formula:
  CPM = (Total Ad Spend / Total Impressions) × 1000

Example:
  Spent $500, got 100,000 impressions
  CPM = ($500 / 100,000) × 1000 = $5.00

Benchmarks by format:
┌──────────────────────────┬────────────┐
│ Format                   │ Typical CPM│
├──────────────────────────┼────────────┤
│ Banner                   │ $0.50 - $2 │
│ Interstitial (static)    │ $3 - $8    │
│ Interstitial (video)     │ $5 - $15   │
│ Rewarded Video           │ $10 - $30  │
│ Playable Ad              │ $15 - $50  │
└──────────────────────────┴────────────┘

Platform benchmarks:
- Facebook: $5 - $20 CPM
- Unity Ads: $8 - $25 CPM
- ironSource: $10 - $30 CPM
- Google Ads: $3 - $15 CPM
```

### CPI (Cost Per Install)

```
Formula:
  CPI = Total Ad Spend / Number of Installs

Example:
  Spent $10,000, got 5,000 installs
  CPI = $10,000 / 5,000 = $2.00

Benchmarks by genre (mobile games):
┌──────────────────────────┬────────────────┐
│ Genre                    │ Typical CPI    │
├──────────────────────────┼────────────────┤
│ Hyper-casual             │ $0.20 - $1.00  │
│ Casual (puzzle, match-3) │ $1.00 - $3.00  │
│ Mid-core (strategy, RPG) │ $3.00 - $8.00  │
│ Hardcore (MOBA, FPS)     │ $5.00 - $15.00 │
└──────────────────────────┴────────────────┘

Platform benchmarks:
- Android global avg: $1.50 - $3.00
- iOS global avg: $2.50 - $5.00
- iOS US: $3.00 - $8.00
- Android India: $0.30 - $0.80
```

### CPC (Cost Per Click)

```
Formula:
  CPC = Total Ad Spend / Number of Clicks

Example:
  Spent $1,000, got 2,500 clicks
  CPC = $1,000 / 2,500 = $0.40

Less commonly used in mobile game advertising,
more relevant for web/search campaigns.
```

### CTR (Click-Through Rate)

```
Formula:
  CTR = (Clicks / Impressions) × 100%

Example:
  10,000 impressions, 350 clicks
  CTR = (350 / 10,000) × 100% = 3.5%

Benchmarks:
┌──────────────────────────┬────────────┐
│ Format                   │ Typical CTR│
├──────────────────────────┼────────────┤
│ Banner                   │ 0.5 - 1.5% │
│ Interstitial (static)    │ 1 - 3%     │
│ Interstitial (video)     │ 2 - 5%     │
│ Rewarded Video           │ 3 - 8%     │
│ Playable Ad              │ 2 - 8%     │
└──────────────────────────┴────────────┘

Why playable CTR is high:
- User is already engaged (played the game)
- CTA appears at a natural stopping point
- User has "investment" from playing
```

### IVR (Install-per-View Rate) / CVR (Conversion Rate)

```
Formula:
  IVR = (Installs / Impressions) × 100%

Alternative:
  CVR = (Installs / Clicks) × 100%

Example:
  50,000 impressions, 2,500 installs
  IVR = (2,500 / 50,000) × 100% = 5.0%

  2,500 installs from 8,000 clicks
  CVR = (2,500 / 8,000) × 100% = 31.25%

Benchmarks:
┌──────────────────────────┬─────────────┐
│ Format                   │ Typical IVR │
├──────────────────────────┼─────────────┤
│ Static interstitial      │ 1 - 3%      │
│ Video                    │ 2 - 5%      │
│ Playable Ad              │ 3 - 10%     │
└──────────────────────────┴─────────────┘
```

### IPM (Installs Per Mille / Installs Per Thousand Impressions)

```
Formula:
  IPM = (Installs / Impressions) × 1000

  Or equivalently:
  IPM = IVR × 10

Example:
  50,000 impressions, 250 installs
  IPM = (250 / 50,000) × 1000 = 5.0

Why IPM matters:
- Ad networks optimize for IPM internally
- Higher IPM = more efficient spend
- A playable ad with 50 IPM massively outperforms
  a video ad with 10 IPM

Benchmarks:
- Below average: < 10 IPM
- Average: 10-30 IPM
- Good: 30-50 IPM
- Excellent: 50+ IPM
```

### ROAS (Return On Ad Spend)

```
Formula:
  ROAS = Revenue from Acquired Users / Ad Spend × 100%

Example:
  Spent $10,000 on ads
  Those users generated $15,000 in revenue
  ROAS = ($15,000 / $10,000) × 100% = 150%

Time-based ROAS:
  D0 ROAS:  Revenue on install day / Spend     (target: >5%)
  D7 ROAS:  Revenue in first 7 days / Spend    (target: >30%)
  D30 ROAS: Revenue in first 30 days / Spend   (target: >80%)
  D90 ROAS: Revenue in first 90 days / Spend   (target: >100%)

Breakeven:
  ROAS = 100% means you earned back exactly what you spent
  Target: >100% for profitability
  Many games need D180+ to hit 100% ROAS

Why it matters:
  CPI alone doesn't tell profitability.
  A $5 CPI user who spends $50 in-game is better than
  a $0.50 CPI user who churns on day 1.
```

### LTV (Lifetime Value)

```
Formula (simplified):
  LTV = ARPU × Average Lifetime (in months)

Formula (detailed):
  LTV = Σ(Revenue_day_n × Retention_day_n) for n = 0 to ∞

Practical LTV calculation:
  LTV_D30 = Σ(ARPU_day × retention_day) for days 0-30

Example:
  D1 retention: 40%, ARPU D1: $0.10
  D7 retention: 20%, ARPU D7: $0.08
  D30 retention: 8%, ARPU D30: $0.05

  Rough LTV_D30 ≈ $0.10 + (6 × $0.08 × 0.40) + (23 × $0.05 × 0.20)
                 ≈ $0.10 + $0.19 + $0.23
                 ≈ $0.52

LTV by genre:
┌──────────────────────────┬──────────────────┐
│ Genre                    │ Typical LTV (D90)│
├──────────────────────────┼──────────────────┤
│ Hyper-casual             │ $0.10 - $0.50    │
│ Casual                   │ $0.50 - $3.00    │
│ Mid-core                 │ $3.00 - $20.00   │
│ RPG/Strategy             │ $10.00 - $50.00  │
│ Casino                   │ $20.00 - $100.00 │
└──────────────────────────┴──────────────────┘

Profitability rule:
  LTV > CPI → Profitable
  LTV < CPI → Losing money

  Target: LTV/CPI ratio > 1.3 (30% margin)
```

### Retention (D1, D7, D30)

```
Formula:
  D(N) Retention = (Users active on day N / Users who installed) × 100%

Example:
  10,000 installs on Monday
  D1: 4,000 opened app Tuesday → 40%
  D7: 1,800 opened app next Monday → 18%
  D30: 600 opened app in 30 days → 6%

Industry benchmarks (mobile games):
┌──────────┬────────────────────────┐
│ Metric   │ Good / Great           │
├──────────┼────────────────────────┤
│ D1       │ 35% / 45%+             │
│ D7       │ 15% / 22%+             │
│ D30      │ 5% / 10%+              │
│ D90      │ 2% / 5%+               │
└──────────┴────────────────────────┘

Why retention matters for playable ads:
- Playable ads show gameplay before install
- Users self-select: only interested users install
- Result: higher D1 retention vs video ads (typically 5-15% higher)
- Higher retention → higher LTV → can afford higher CPI
```

### ARPU / ARPPU

```
ARPU (Average Revenue Per User):
  ARPU = Total Revenue / Total Active Users

ARPPU (Average Revenue Per Paying User):
  ARPPU = Total Revenue / Number of Paying Users

Example:
  10,000 monthly active users
  Total revenue: $5,000
  200 users made purchases

  ARPU = $5,000 / 10,000 = $0.50
  ARPPU = $5,000 / 200 = $25.00
  Conversion rate = 200 / 10,000 = 2%

Typical mobile game metrics:
- Free-to-play conversion rate: 2-5%
- ARPU: $0.10 - $2.00 / month
- ARPPU: $5 - $50 / month
- Whale ARPPU: $100+ / month
```

### eCPM (Effective Cost Per Mille)

```
Formula:
  eCPM = (Total Earnings / Total Impressions) × 1000

This is the PUBLISHER's metric (how much they earn per 1000 ad views).

Example:
  Publisher showed 50,000 ads, earned $750
  eCPM = ($750 / 50,000) × 1000 = $15.00

Why publishers prefer playable ads:
  Banner eCPM: $1-3
  Interstitial eCPM: $5-15
  Rewarded Video eCPM: $15-30
  Playable eCPM: $20-50

Higher eCPM = publisher earns more = more willing to show your ads.
```

### Metric Relationships Map

```
                    ┌──────────┐
                    │ Ad Spend │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │  CPM   │ │  CPC   │ │  CPI   │
         └───┬────┘ └───┬────┘ └───┬────┘
             │          │          │
             ▼          ▼          ▼
        ┌─────────┐ ┌───────┐ ┌────────┐
        │Impressions│ │Clicks │ │Installs│
        └────┬────┘ └───┬───┘ └───┬────┘
             │          │          │
             └──────────┼──────────┘
                        │
                   ┌────▼────┐
                   │   CTR   │ = Clicks / Impressions
                   │   IVR   │ = Installs / Impressions
                   │   CVR   │ = Installs / Clicks
                   └────┬────┘
                        │
                   ┌────▼────┐
                   │Retention│ D1/D7/D30
                   └────┬────┘
                        │
                   ┌────▼────┐
                   │ Revenue │ (IAP + Ads)
                   └────┬────┘
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
         ┌────────┐ ┌──────┐ ┌──────┐
         │  ARPU  │ │ LTV  │ │ ROAS │
         └────────┘ └──────┘ └──────┘
```

---

## Why Playable Ads Outperform

### Engagement Advantage

```
Traditional funnel (video ad):
  See ad → Maybe watch → Click → App Store → Install → Try game → Like?

  Impression: 100,000
  Watched 75%: 60,000
  Clicked: 3,000 (3% CTR)
  Installed: 900 (30% CVR from click)
  D1 Retained: 270 (30% D1)
  Result: 270 engaged users from 100K impressions

Playable ad funnel:
  See ad → Play mini-game → Enjoy → Click → Install → Already know game → Like!

  Impression: 100,000
  Engaged (played): 80,000
  Completed play: 50,000
  Clicked CTA: 5,000 (5% CTR)
  Installed: 2,000 (40% CVR from click)
  D1 Retained: 800 (40% D1)
  Result: 800 engaged users from 100K impressions → 3x better!
```

### User Quality Advantage

```
Video ad users:
- May install based on misleading trailer
- First experience is loading/tutorial (not exciting)
- High "expectation mismatch" churn
- Lower IAP conversion (less committed)

Playable ad users:
- Already experienced core gameplay
- Installed because they LIKED the gameplay
- Expectations match reality
- Higher IAP conversion (already invested)

Measured differences:
┌──────────────────┬────────────┬────────────────┐
│ Metric           │ Video Ads  │ Playable Ads   │
├──────────────────┼────────────┼────────────────┤
│ D1 Retention     │ 30-35%     │ 38-45%         │
│ D7 Retention     │ 12-18%     │ 18-25%         │
│ IAP Conversion   │ 1.5-3%     │ 3-5%           │
│ LTV (D30)        │ $1.00      │ $1.50-2.50     │
│ CPI              │ $1.50      │ $1.00-2.00     │
└──────────────────┴────────────┴────────────────┘

Net effect: Higher LTV + Lower CPI = Much better ROAS
```

### Lower CPI Through Higher Engagement

```
How ad networks set CPI:

  CPI = CPM / (IPM)
  CPI = CPM / (CTR × CVR × 1000)

Example with video ad:
  CPM = $10, CTR = 2%, CVR = 25%
  IPM = 0.02 × 0.25 × 1000 = 5
  CPI = $10 / 5 = $2.00

Example with playable ad:
  CPM = $20 (higher!), CTR = 5%, CVR = 35%
  IPM = 0.05 × 0.35 × 1000 = 17.5
  CPI = $20 / 17.5 = $1.14

Even though playable CPM is 2x higher,
the CPI is 43% lower because engagement is so much higher!
```

---

## Creative Optimization

### A/B Testing Framework

```typescript
interface CreativeVariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly changes: readonly string[];
}

interface ABTestConfig {
  readonly testName: string;
  readonly hypothesis: string;
  readonly primaryMetric: string;
  readonly secondaryMetrics: readonly string[];
  readonly variants: readonly CreativeVariant[];
  readonly trafficSplit: Record<string, number>;
  readonly minSampleSize: number;
  readonly maxDuration: number; // days
}

// Example test configuration
const colorSchemeTest: ABTestConfig = {
  testName: 'Match-3 Color Scheme',
  hypothesis: 'Brighter colors will increase CTR by 10%+',
  primaryMetric: 'CTR',
  secondaryMetrics: ['IVR', 'completion_rate', 'avg_play_time'],
  variants: [
    {
      id: 'control',
      name: 'Original Colors',
      description: 'Current pastel color palette',
      changes: [],
    },
    {
      id: 'variant_a',
      name: 'Bright Neon',
      description: 'Saturated neon color palette',
      changes: ['Increased color saturation by 40%', 'Added glow effects'],
    },
    {
      id: 'variant_b',
      name: 'Candy Theme',
      description: 'Warm candy-like colors',
      changes: ['Warm orange/pink palette', 'Rounded gem shapes'],
    },
  ],
  trafficSplit: { control: 34, variant_a: 33, variant_b: 33 },
  minSampleSize: 10000, // impressions per variant
  maxDuration: 7,
};
```

### What to Test

```
High-Impact Variables (test these first):
┌─────────────────────────┬──────────────────────────────────────┐
│ Variable                │ What to Try                          │
├─────────────────────────┼──────────────────────────────────────┤
│ Game difficulty          │ Easy (more wins) vs. Hard (challenge)│
│ Tutorial length          │ No tutorial vs. 1-step vs. 3-step   │
│ CTA timing              │ After win vs. after loss vs. timed   │
│ CTA text                │ "Play Now" vs. "Download" vs. custom │
│ End card design          │ Simple vs. elaborate vs. animated    │
│ Game duration            │ 10s vs. 15s vs. 25s vs. 30s         │
│ Hook strategy            │ Start near win vs. cold start        │
│ Color palette            │ Warm vs. cool vs. neon               │
│ Sound effects            │ On vs. off vs. minimal               │
└─────────────────────────┴──────────────────────────────────────┘

Medium-Impact Variables:
┌─────────────────────────┬──────────────────────────────────────┐
│ Variable                │ What to Try                          │
├─────────────────────────┼──────────────────────────────────────┤
│ Orientation              │ Portrait vs. landscape vs. both      │
│ UI layout                │ Score position, timer visibility      │
│ Animation style          │ Smooth vs. bouncy vs. minimal        │
│ Character design         │ Cute vs. cool vs. abstract           │
│ Reward visualization     │ Coins vs. stars vs. progress bar     │
│ Idle behavior            │ Auto-play vs. hint vs. nothing       │
└─────────────────────────┴──────────────────────────────────────┘
```

### Creative Fatigue

```
What: Performance degradation of an ad creative over time
Why: Same users see the ad repeatedly, engagement drops

Fatigue timeline (typical):
Day 1-3:   Peak performance (novel creative)
Day 4-7:   Slight decline (5-10%)
Day 8-14:  Moderate decline (15-25%)
Day 15-30: Significant decline (30-50%)
Day 30+:   Severe fatigue, should be replaced

Detection:
- Monitor CTR daily
- Flag when CTR drops >15% from 7-day moving average
- Track frequency (avg times same user sees the ad)

Mitigation:
1. Creative rotation: 3-5 variants active simultaneously
2. Network-level frequency capping: max 3 views per user per day
3. Iterative refreshes: small changes to reset novelty
   - New color scheme
   - Different level layout
   - Updated end card
   - New character/theme
4. Full replacement every 3-4 weeks
```

### Statistical Significance

```typescript
// Simplified significance testing for A/B creative tests

interface TestResult {
  readonly impressions: number;
  readonly conversions: number;
  readonly rate: number;
}

function calculateSignificance(
  control: TestResult,
  variant: TestResult
): {
  zScore: number;
  pValue: number;
  isSignificant: boolean;
  liftPercent: number;
} {
  const p1 = control.rate;
  const p2 = variant.rate;
  const n1 = control.impressions;
  const n2 = variant.impressions;

  // Pooled proportion
  const pPool = (control.conversions + variant.conversions) / (n1 + n2);

  // Standard error
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

  // Z-score
  const zScore = se > 0 ? (p2 - p1) / se : 0;

  // Approximate p-value (two-tailed)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

  return {
    zScore,
    pValue,
    isSignificant: pValue < 0.05, // 95% confidence
    liftPercent: p1 > 0 ? ((p2 - p1) / p1) * 100 : 0,
  };
}

// Approximation of normal CDF
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const p =
    d *
    Math.exp((-x * x) / 2) *
    (t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))));
  return x > 0 ? 1 - p : p;
}

// Example usage:
const controlResult: TestResult = {
  impressions: 50000,
  conversions: 1500,
  rate: 0.03, // 3% CTR
};

const variantResult: TestResult = {
  impressions: 50000,
  conversions: 1850,
  rate: 0.037, // 3.7% CTR
};

const result = calculateSignificance(controlResult, variantResult);
// result.liftPercent ≈ 23.3%
// result.isSignificant ≈ true (p < 0.05)
```

---

## Production Pipeline

### Timeline Overview

```
Typical playable ad production timeline: 7-12 business days

┌─────────────────────────────────────────────────────────────┐
│ Day 1         │ CONCEPT & BRIEF                             │
│               │ - Review game (play for 1-2 hours)          │
│               │ - Identify core hook mechanic                │
│               │ - Define target audience                     │
│               │ - Choose game genre/template                 │
│               │ - Wireframe key screens                      │
│               │ - Get stakeholder sign-off                   │
├───────────────┼─────────────────────────────────────────────┤
│ Day 2-4       │ PROTOTYPE                                   │
│               │ - Implement core mechanic                    │
│               │ - Basic placeholder art                      │
│               │ - Touch input handling                       │
│               │ - Game flow: tutorial → game → end card      │
│               │ - Test on 2-3 devices                        │
│               │ - Internal review & feedback                 │
├───────────────┼─────────────────────────────────────────────┤
│ Day 5-7       │ POLISH                                      │
│               │ - Final art assets                           │
│               │ - Animations & juice (particles, shake)      │
│               │ - Sound effects                              │
│               │ - End card design & CTA                      │
│               │ - MRAID integration                          │
│               │ - Performance optimization                   │
│               │ - Size optimization                          │
├───────────────┼─────────────────────────────────────────────┤
│ Day 8         │ QA & TESTING                                │
│               │ - Cross-device testing (5-10 devices)        │
│               │ - Ad network validation tools                │
│               │ - MRAID compliance check                     │
│               │ - Performance benchmarks                     │
│               │ - Size verification                          │
│               │ - Bug fixes                                  │
├───────────────┼─────────────────────────────────────────────┤
│ Day 9-10      │ DEPLOYMENT & REVIEW                         │
│               │ - Upload to ad networks                      │
│               │ - Network creative review (1-3 days)         │
│               │ - Address rejection feedback                 │
│               │ - Resubmit if needed                         │
├───────────────┼─────────────────────────────────────────────┤
│ Day 11-12     │ LIVE & ITERATE                              │
│               │ - Monitor initial metrics                    │
│               │ - A/B test variants                          │
│               │ - Optimize based on data                     │
│               │ - Plan next creative                         │
└───────────────┴─────────────────────────────────────────────┘
```

### Rapid Iteration Workflow

```
Week 1: Ship initial creative
Week 2: Analyze metrics, create 2-3 variants
Week 3: Test variants, identify winner
Week 4: Polish winner, create new concept

Monthly output target:
- 2-4 new concepts per month
- 5-10 variants per concept
- Top performer gets scaled across networks

Speed matters because:
- Creative fatigue: best creative loses 30% effectiveness in 3 weeks
- Seasonal trends: holiday themes, events
- Competitive pressure: competitors test constantly
- Network algorithms favor fresh creatives
```

### Asset Preparation

```typescript
interface AssetSpec {
  readonly name: string;
  readonly format: string;
  readonly maxSize: string;
  readonly dimensions: string;
  readonly notes: string;
}

const playableAdAssetSpecs: readonly AssetSpec[] = [
  {
    name: 'Sprite Atlas',
    format: 'PNG (RGBA)',
    maxSize: '500KB',
    dimensions: '1024x1024 or 2048x2048',
    notes: 'Pack all game sprites into single atlas. Use TexturePacker.',
  },
  {
    name: 'Background',
    format: 'JPEG or generated',
    maxSize: '100KB',
    dimensions: 'Match canvas size',
    notes: 'Consider generating programmatically to save size.',
  },
  {
    name: 'End Card BG',
    format: 'JPEG',
    maxSize: '80KB',
    dimensions: '1080x1920 (portrait), 1920x1080 (landscape)',
    notes: 'Show app store screenshot or game scene.',
  },
  {
    name: 'App Icon',
    format: 'PNG',
    maxSize: '20KB',
    dimensions: '128x128',
    notes: 'Shown on end card near CTA button.',
  },
  {
    name: 'CTA Button',
    format: 'PNG or CSS',
    maxSize: '10KB',
    dimensions: 'Variable',
    notes: 'CSS-generated buttons save file size.',
  },
  {
    name: 'Sound Effects',
    format: 'MP3/OGG or Web Audio',
    maxSize: '100KB total',
    dimensions: 'N/A',
    notes: 'Web Audio oscillators = 0KB file size.',
  },
  {
    name: 'Tutorial Hand',
    format: 'PNG or CSS',
    maxSize: '5KB',
    dimensions: '64x64',
    notes: 'Animated finger/hand for tutorial overlay.',
  },
];
```

---

## Business Models

### In-House Teams

```
Structure:
- 2-5 developers (JavaScript/TypeScript)
- 1-2 designers (2D art, UI/UX)
- 1 product/creative manager
- Often shared with marketing team

Pros:
- Deep knowledge of the game
- Fast iteration
- Lower cost per creative over time
- Direct access to game assets and data
- Can align closely with UA strategy

Cons:
- High fixed cost ($500K-1M+ annually)
- Needs enough creative volume to justify team
- Risk of creative tunnel vision
- Recruitment challenge (niche skillset)

Best for:
- Studios spending >$1M/month on UA
- Games with long lifespans (2+ years)
- Studios that want creative as competitive advantage

Cost per creative (amortized):
  $200-500 per playable ad
  (at 20+ creatives/month volume)
```

### Creative Agency Model

```
Structure:
- Client provides game build, assets, brand guidelines
- Agency produces playable ads
- Typically 5-15 day turnaround

Pricing models:
┌───────────────────────┬──────────────────┬────────────────────┐
│ Model                 │ Price Range      │ What's Included    │
├───────────────────────┼──────────────────┼────────────────────┤
│ Per creative          │ $1,000 - $5,000  │ 1 playable + 2-3   │
│                       │                  │ minor variants      │
├───────────────────────┼──────────────────┼────────────────────┤
│ Monthly retainer      │ $5,000 - $20,000 │ 4-8 creatives/month│
│                       │                  │ + variants + A/B    │
├───────────────────────┼──────────────────┼────────────────────┤
│ Performance-based     │ Base + bonus     │ Bonus for beating   │
│                       │                  │ KPI targets         │
├───────────────────────┼──────────────────┼────────────────────┤
│ Full-service          │ $15,000-50,000/mo│ Strategy + creative │
│                       │                  │ + optimization      │
└───────────────────────┴──────────────────┴────────────────────┘

Pros:
- No fixed headcount costs
- Access to diverse creative talent
- Experience across many game genres
- Scalable up/down with campaigns

Cons:
- Higher per-unit cost
- Less game knowledge
- Communication overhead
- IP/NDA concerns
- Quality variance between agencies

Notable agencies:
- Supersonic (Voodoo) - In-house + agency
- CraftedGames
- ConsultMyApp
- Various boutique studios

Best for:
- Studios spending $50K-500K/month on UA
- Testing whether playable ads work before building a team
- Supplementing in-house capacity during peaks
```

### Freelance Model

```
Platforms:
- Upwork, Fiverr (general)
- Specialized game dev freelance platforms
- LinkedIn/personal networks
- Game jams (talent scouting)

Typical rates:
- Junior developer: $30-60/hour
- Senior developer: $60-120/hour
- Specialist (playable ad expert): $80-150/hour
- Per-project: $500-3,000 per creative

Pros:
- Lowest cost
- Flexible engagement
- Can find niche expertise
- No long-term commitment

Cons:
- Quality varies enormously
- Availability uncertainty
- IP concerns
- Communication challenges
- No institutional knowledge built

Best for:
- Testing the playable ad market
- One-off projects
- Very specific technical needs
- Small studios with limited budget
```

### Build vs. Buy Decision Framework

```typescript
interface BuildVsBuyFactors {
  readonly monthlyUASpend: number;
  readonly creativesPerMonth: number;
  readonly gameLifespan: number; // months
  readonly inHouseDevAvailable: boolean;
  readonly currentROAS: number;
}

function recommendModel(factors: BuildVsBuyFactors): string {
  const { monthlyUASpend, creativesPerMonth, gameLifespan, inHouseDevAvailable } = factors;

  // In-house team justified at scale
  if (monthlyUASpend > 500000 && gameLifespan > 24 && creativesPerMonth > 15) {
    return 'IN-HOUSE: Volume and spend justify dedicated team';
  }

  // Agency for mid-scale
  if (monthlyUASpend > 50000 && creativesPerMonth > 4) {
    return 'AGENCY: Good balance of quality and flexibility';
  }

  // Hybrid if you have developers
  if (inHouseDevAvailable && monthlyUASpend > 100000) {
    return 'HYBRID: In-house prototypes + agency polish';
  }

  // Freelance for testing
  if (monthlyUASpend < 50000 || creativesPerMonth < 4) {
    return 'FREELANCE: Test market viability before committing';
  }

  return 'AGENCY: Default recommendation for most studios';
}
```

---

## Interview Questions

### Q1: "Calculate the CPI given the following scenario: CPM is $15, CTR is 4%, and CVR (click-to-install) is 30%."

**Strong Answer:**

"Let me work through this step by step.

First, I'll calculate IPM (installs per 1000 impressions):
```
IPM = CTR × CVR × 1000
IPM = 0.04 × 0.30 × 1000
IPM = 12
```

Then CPI:
```
CPI = CPM / IPM
CPI = $15 / 12
CPI = $1.25
```

To verify: for every 1,000 impressions, we get 40 clicks (4% CTR), and 12 installs (30% of 40 clicks). At $15 per 1,000 impressions, that's $15/12 = $1.25 per install.

This is a strong CPI for most casual game genres. The 4% CTR suggests an engaging creative (likely a playable ad), and the 30% CVR indicates good expectation-to-reality match."

---

### Q2: "A playable ad has 500,000 impressions, 25,000 clicks, 8,000 installs. Of those installers, 3,200 are active on D1 and 400 are active on D30. The total revenue from these users after 30 days is $6,000. Calculate all relevant metrics."

**Strong Answer:**

```
Given:
- Impressions: 500,000
- Clicks: 25,000
- Installs: 8,000
- D1 active: 3,200
- D30 active: 400
- Revenue (D30): $6,000

Calculated metrics:

CTR = Clicks / Impressions = 25,000 / 500,000 = 5.0%
CVR = Installs / Clicks = 8,000 / 25,000 = 32.0%
IVR = Installs / Impressions = 8,000 / 500,000 = 1.6%
IPM = IVR × 1000 = 16.0

D1 Retention = 3,200 / 8,000 = 40.0%
D30 Retention = 400 / 8,000 = 5.0%

ARPU (D30) = $6,000 / 8,000 = $0.75

If ad spend was, say, $10,000:
  CPI = $10,000 / 8,000 = $1.25
  CPM = ($10,000 / 500,000) × 1000 = $20.00
  D30 ROAS = $6,000 / $10,000 = 60%
```

**Analysis:**
- CTR of 5% is strong, indicating high engagement
- 40% D1 retention is excellent (above industry average of 35%)
- 5% D30 retention is solid
- $0.75 ARPU at D30 is reasonable for casual games
- 60% D30 ROAS means we need D60-D90 to break even, which is typical
- If LTV projection hits $1.50+ at D180, this is a profitable campaign

The overall picture shows a high-quality creative driving good user quality."

---

### Q3: "What is ROAS and why is it more important than CPI?"

**Strong Answer:**

"CPI tells you how much you paid per user. ROAS tells you whether that investment was profitable.

**Why CPI alone is misleading:**

A $0.50 CPI user who opens the app once and never returns generates $0 revenue. ROAS = 0%.
A $5.00 CPI user who plays daily for 6 months and spends $20 on IAP generates great returns. ROAS = 400%.

**ROAS accounts for the full picture:**
```
ROAS = Revenue from acquired users / Ad spend × 100%

It incorporates:
1. How much you paid (CPI, ad spend)
2. How well users retained (D1, D7, D30 retention)
3. How much they spent (IAP revenue)
4. How much ad revenue they generated (in-game ads)
```

**ROAS targets by timeline:**
```
D0:  5-10%   (install day revenue)
D7:  25-40%  (first week)
D30: 60-90%  (first month)
D90: 90-120% (quarter)
D180: 120%+  (breakeven + profit)
```

**In practice, studios use ROAS to:**
1. Decide which ad networks to scale (high ROAS networks get more budget)
2. Choose which creatives to keep running (best ROAS wins)
3. Set CPI bids (LTV prediction × target ROAS margin = max CPI bid)
4. Decide whether to keep acquiring users at all

The nuance is that you need enough data (typically 1000+ installs) and enough time (D30+) to reliably measure ROAS. Early decisions often use proxy metrics like D1 retention and early engagement as predictors."

---

### Q4: "Explain the difference between CPM, eCPM, and why a publisher would prefer playable ads."

**Strong Answer:**

"**CPM** is what the **advertiser pays** per 1,000 impressions. It's a cost metric.

**eCPM** is what the **publisher earns** per 1,000 impressions. It's a revenue metric.

They can differ because:
- Ad networks take a cut (typically 30-40%)
- Fill rates vary (not every ad request gets filled)
- Different ad formats in the same slot earn differently

**Formula comparison:**
```
CPM (advertiser) = Ad spend / Impressions × 1000
eCPM (publisher) = Publisher earnings / Impressions × 1000
```

**Why publishers prefer playable ads:**

1. **Higher eCPM**: Playable ads command $20-50 eCPM vs. $5-15 for standard interstitials. Publishers earn 2-4x more revenue.

2. **Better user experience**: Users engage rather than skip. This leads to less ad fatigue and lower churn from the publisher's own app.

3. **Higher fill rate**: Advertiser demand for playable ad inventory is growing, meaning more of the publisher's ad requests get filled.

4. **Session length preservation**: Users who enjoy an ad feel positive about the experience, and are more likely to continue using the publisher's app.

However, there's a tradeoff: playable ads take longer to load and consume more data. Smart publishers implement:
- Loading playable ads during natural pauses (between levels)
- WiFi-only for larger creatives
- Fallback to video if playable fails to load"

---

### Q5: "How do you decide whether a playable ad creative is performing well enough to keep running?"

**Strong Answer:**

"I evaluate creatives across three dimensions: efficiency, quality, and sustainability.

**1. Efficiency metrics (is it cost-effective?):**
```
- IPM > 15 (installs per mille)
- CPI within target for genre (e.g., < $2 for casual)
- CTR > 3% (shows engagement)
```

**2. Quality metrics (are we getting good users?):**
```
- D1 retention ≥ 35% (users stick around)
- D7 retention ≥ 15%
- D7 ROAS > 25% of target
- Cohort LTV trending toward CPI breakeven within expected window
```

**3. Sustainability metrics (how long will it last?):**
```
- Frequency < 3 per user per day
- CTR trend stable or declining <5% per week
- No significant creative fatigue signals
```

**Decision framework:**
```
                    Good User Quality    Poor User Quality
                    (D1 > 35%)          (D1 < 30%)
                    ┌────────────────┬──────────────────┐
 Low CPI            │ SCALE UP       │ INVESTIGATE      │
 (below target)     │ Increase spend │ Check targeting   │
                    │ Expand networks│ Fix game/creative │
                    ├────────────────┼──────────────────┤
 High CPI           │ OPTIMIZE       │ KILL             │
 (above target)     │ Test variants  │ Replace creative  │
                    │ Adjust bidding │ Start new concept  │
                    └────────────────┴──────────────────┘
```

I also compare against the portfolio: is this creative in the top 25% of all active creatives? If not, replace it with a new concept. The marginal cost of a new creative ($1-5K) is tiny compared to the campaign spend it influences ($50K-500K)."

---

### Q6: "A competitor's playable ad has a much higher CTR than yours. How do you analyze and respond?"

**Strong Answer:**

"First, I'd verify the data. Higher CTR doesn't necessarily mean better performance if the installs are low quality. But assuming it's genuinely better:

**Analysis (what I'd do):**

1. **Play their ad repeatedly** and note:
   - What's the hook? (First 3 seconds)
   - How long is the gameplay?
   - How difficult is it?
   - What's the CTA design and timing?
   - What emotional trigger are they using? (Satisfaction, curiosity, frustration)

2. **Deconstruct the design patterns:**
   - Is the game simpler? (Simplicity often wins)
   - Are they using fake gameplay? (Showing impossible/enhanced scenarios)
   - Is the end card more compelling?
   - Are they using urgency? (Timer, limited offer)

3. **Systematic response:**

   Week 1: Quick wins
   - Test their CTA style on our existing creative
   - Test their game length on our creative
   - A/B test 3 variants inspired by their approach

   Week 2: New concepts
   - Build a new creative using their best elements + our unique twist
   - Test different hooks (the first 3 seconds matter most)

   Week 3: Differentiate
   - Find an angle they're NOT doing
   - Test completely different emotional triggers
   - Try a different game genre that showcases our game better

**Key principle:** Don't just copy — understand WHY their approach works and apply the underlying principle in your own way. Direct copies usually underperform because the audience has already seen the competitor's version."

---

### Q7: "Explain creative fatigue and your strategy for managing it."

**Strong Answer:**

"Creative fatigue occurs when an ad's performance declines because the target audience has seen it too many times. It's the natural lifecycle of every ad creative.

**Detection signals:**
- CTR declining 5%+ week-over-week
- CPM rising (network detects lower engagement, charges more to serve it)
- Frequency (avg views per user) exceeding 3 per day
- IPM declining faster than seasonal/market trends

**My management strategy operates on three time horizons:**

**Daily: Monitor and react**
- Dashboard tracking CTR, CPI, ROAS by creative
- Automated alerts when any metric drops >15% from 7-day average
- Pause underperforming creatives before they waste budget

**Weekly: Iterate and test**
- Always have 3-5 active creatives per campaign
- Launch 1-2 new variants per week
- Variants test: colors, difficulty, CTA text, game length
- Kill bottom 20% performers, scale top 20%

**Monthly: Refresh and innovate**
- Completely new creative concepts every 3-4 weeks
- Different game genres, new hooks, fresh themes
- Seasonal updates (holidays, events, trending topics)
- Competitor analysis for new ideas

**Budget allocation:**
```
70% - Proven performers (scale what works)
20% - Variants of winners (iterate)
10% - New experimental concepts (innovate)
```

**The math:** If a creative's average lifespan is 3 weeks and you need 3 active at all times, you need to ship ~4 new creatives per month. At $2K each, that's $8K/month in creative costs — typically <2% of ad spend for a studio running $500K+ monthly campaigns."

---

### Q8: "What metrics would you present in a weekly performance review meeting?"

**Strong Answer:**

"I'd structure the report around three questions: How much did we spend? What did we get? Was it worth it?

```
WEEKLY PERFORMANCE REPORT
=========================

1. SPEND OVERVIEW
   ├── Total spend: $125,000 (+5% vs last week)
   ├── By network: Facebook 40%, Unity 30%, ironSource 20%, Other 10%
   └── By creative: Top 3 creatives account for 75% of spend

2. ACQUISITION METRICS
   ├── Total installs: 62,500
   ├── CPI: $2.00 (target: $2.50, under budget ✓)
   ├── IPM: 18.5 (up 12% from last week)
   ├── CTR: 4.2% (stable)
   └── CVR: 28% (down 3%, investigate)

3. QUALITY METRICS
   ├── D1 retention: 38% (target: 35% ✓)
   ├── D7 retention: 16% (target: 15% ✓)
   ├── D7 ROAS: 28% (on track for 100% at D90)
   └── Cohort LTV trending: $3.20 projected D90

4. CREATIVE PERFORMANCE
   ├── Active creatives: 5
   ├── Best performer: Match-3 Neon (CPI $1.60, D1 42%)
   ├── Worst performer: Runner Galaxy (CPI $3.10, D1 28%) → PAUSE
   ├── New this week: Puzzle Challenge (launched Wed, early data promising)
   └── In production: 2 new concepts for next week

5. ACTION ITEMS
   ├── Scale Match-3 Neon on Unity Ads (underspent on this network)
   ├── Pause Runner Galaxy, reallocate budget
   ├── Investigate CVR drop (end card? targeting?)
   └── Ship 2 variants of Match-3 Neon (test color + difficulty)
```

The key is making it actionable. Every slide/section should answer 'So what? What do we do about it?'"

---

### Q9: "How do you calculate LTV and why is it hard to measure accurately?"

**Strong Answer:**

"LTV (Lifetime Value) is the total revenue a user generates over their entire relationship with your game.

**Calculation methods:**

**1. Simple projection:**
```
LTV = ARPU_daily × Σ(retention_day_n) for n = 0 to N
```

**2. Cohort-based (more accurate):**
```
For each cohort (users acquired on the same day):
Track their cumulative revenue over 30, 60, 90, 180 days
LTV_D30 = Total cohort revenue at D30 / Cohort size
```

**3. Predictive (most useful, hardest):**
```
Use D7 retention + D7 revenue to predict D180 LTV
Models: logarithmic decay, power law, custom ML
```

**Why it's hard to measure accurately:**

1. **Time lag:** You don't know D180 LTV until 180 days have passed. By then, your creative and targeting may have changed completely.

2. **Organic overlap:** Did the user install because of your ad, or would they have installed anyway? Attribution is imperfect.

3. **Ad revenue complexity:** Users generate revenue from watching ads in your game, which depends on their session length, engagement, and the ad market conditions when they play.

4. **IAP whales:** A single whale can skew cohort LTV dramatically. One user spending $500 in a 1,000-person cohort adds $0.50 to average LTV.

5. **Market changes:** App Store algorithm changes, competitor launches, seasonal trends all affect retention curves in ways you can't predict.

6. **Attribution windows:** Post-install events (purchases) need to be attributed back to the original ad. Different networks use different attribution windows (7-day, 28-day).

**Practical approach:**
- Use D7 LTV as a proxy for early decisions (well-correlated with D180)
- Build a predictive model using historical cohort data
- Always compare cohort-to-cohort, not absolute numbers
- Update LTV projections weekly as more data comes in"

---

### Q10: "Your boss says 'We need to cut CPI by 30%. How?' What's your plan?"

**Strong Answer:**

"Cutting CPI by 30% is aggressive but achievable. I'd attack it from three angles simultaneously:

**1. Creative optimization (biggest lever):**
The #1 driver of CPI is creative quality. Higher IPM = lower CPI.

```
CPI = CPM / IPM
To cut CPI by 30%, I need IPM to increase by ~43% (or CPM to decrease by 30%).
```

Actions:
- Analyze top 10% performing creatives across ALL competitors in the genre (use creative intelligence tools like Sensor Tower, AppMagic)
- Build 5 new concepts testing radically different hooks
- A/B test aggressively: test 3-4 variables per week
- Focus on the first 3 seconds (hook determines CTR)
- Test shorter gameplay duration (15s vs 25s)

**2. Targeting and network optimization (medium lever):**
- Identify which GEOs have lowest CPI (often Southeast Asia, LATAM, Eastern Europe)
- Shift budget to high-IPM networks (some networks have 2x performance difference)
- Use lookalike audiences based on highest-LTV users (not just any installers)
- Test different ad placements within each network
- Increase bids during low-competition times (late night, weekday mornings)

**3. Funnel optimization (smaller but compounds):**
- Improve app store page (better screenshots, video, description) to boost CVR
- Test different CTA text and end card designs
- Reduce ad load time (faster first frame = lower abandonment)
- Ensure seamless App Store redirect

**Timeline:**
- Week 1: Launch 5 new creative concepts, start testing
- Week 2: Analyze results, cut losers, double down on winners
- Week 3: Targeting adjustments based on network data
- Week 4: Should see measurable CPI improvement
- Month 2: Continue iterating, target the full 30% reduction

**Realistic expectation:** 15-20% CPI reduction in month 1, full 30% by month 2-3 with sustained creative iteration."
