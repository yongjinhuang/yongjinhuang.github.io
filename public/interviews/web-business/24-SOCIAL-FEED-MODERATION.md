# Social Feed & Content Moderation

## What Is It?

A social feed is the scrollable stream of content users see when they open an app -- posts, photos, videos, stories, retweets, shares. Behind that deceptively simple UI is one of the most complex systems in web engineering: deciding what to show, in what order, to which users, and how fast. Feed generation involves ingesting millions of content events per second, ranking them by relevance, and delivering a personalized timeline to each user within milliseconds.

Content moderation is the other half of the equation. The moment you let users post anything, you inherit the responsibility of keeping your platform safe. Moderation covers everything from removing spam and hate speech to detecting NSFW images, enforcing community guidelines, handling user reports, and navigating the legal minefields of different jurisdictions. Get the feed right and users stay. Get moderation wrong and you're on the front page of every news outlet for the wrong reasons.

## Why Should You Care?

If you work on any product with user-generated content -- social networks, forums, marketplaces with reviews, comment sections, community platforms -- you will encounter feed and moderation problems. These aren't niche concerns. Every dating app, e-commerce review system, messaging platform, and content-sharing product deals with some variation of "what to show" and "what to block." Understanding fan-out strategies, ranking signals, and moderation pipelines makes you effective in a huge swath of the industry. And from a business perspective, feed quality drives engagement (and revenue), while moderation failures drive lawsuits, advertiser flight, and regulatory action.

## How It Works (The Business Flow)

### Content Creation and Ingestion

A user creates a post (text, image, video, link). The system validates the content, runs it through an initial moderation check (automated filters for spam, known banned content, NSFW detection), assigns metadata (timestamp, author, content type, language, location), and writes it to the content store. If the content passes initial checks, it enters the distribution pipeline.

### Feed Generation: Fan-Out on Write vs Fan-Out on Read

This is the central architectural decision for any feed system.

**Fan-out on write (push model).** When a user publishes a post, the system immediately writes that post ID into every follower's feed inbox. When a follower opens the app, their feed is already precomputed -- just read from the inbox. This is fast at read time but expensive at write time. If a celebrity with 50 million followers posts, you're doing 50 million write operations.

**Fan-out on read (pull model).** Nothing happens at post time. When a user opens the app, the system looks up everyone they follow, fetches recent posts from each, merges and ranks them on the fly. This is cheap at write time but expensive at read time, especially for users who follow thousands of accounts.

**Hybrid approach (what most large platforms use).** Fan-out on write for normal users (pre-compute their followers' feeds). Fan-out on read for high-follower accounts (celebrities, brands). This avoids the "celebrity problem" while keeping read latency low for the majority of requests.

```
User Posts → Validation → Moderation Check → Content Store
                                                  ↓
                              Fan-Out Service → Follower Feed Inboxes (push)
                                    OR
                              On-Demand Merge at Read Time (pull)
                                                  ↓
                              Ranking & Filtering → Personalized Feed
```

### Content Ranking

Raw chronological feeds are mostly dead. Modern feeds rank content by predicted engagement. A ranking algorithm considers signals like: relationship closeness (do you interact with this person?), content type preference (do you watch more videos than read text?), recency, post engagement velocity (is this post getting lots of likes quickly?), and diversity (avoid showing 10 posts from the same person in a row). The output is a relevance score for each candidate post, and the feed is sorted by that score.

The ranking pipeline typically has two stages. **Candidate generation** narrows millions of possible posts down to a few hundred using cheap heuristics (recency, follow relationship). **Ranking** scores those candidates with a heavier ML model that predicts the probability of each engagement type (like, comment, share, long dwell). The final score is a weighted combination of those predictions, tuned by product goals -- if the business wants more comments, increase the comment-probability weight.

### Followers/Following System

At its core, a graph of directional relationships. User A follows User B. This is stored in a social graph database or an adjacency list. Key operations: follow, unfollow, get followers, get following, check if A follows B. At scale, this graph contains billions of edges and must support fast lookups in both directions. Systems like TAO (Facebook) or FlockDB (Twitter) were purpose-built for this.

The follow relationship also drives notifications, suggestions ("People you may know"), and mutual-follow detection. A common optimization is maintaining a follow count and follower count as denormalized counters so you don't need to query the full edge list just to display "1.2M followers" on a profile.

### Engagement: Likes, Comments, Shares, Reactions

Each engagement action is an event that updates counters, triggers notifications, and feeds back into the ranking algorithm. Likes are the simplest -- an append to a set and a counter increment. Comments are mini-content items that need their own moderation pipeline. Shares and retweets amplify content by injecting it into the sharer's followers' feeds, which is where viral spread happens.

Reaction systems (Facebook's love/haha/angry, Slack's emoji reactions) add nuance. They're implemented as typed associations between users and content, and they give the ranking algorithm richer engagement signals.

### Moderation Pipeline

```
Content Created → Automated Filters (Layer 1)
                      ↓
               AI/ML Classification (Layer 2)
                      ↓
              Borderline Queue → Human Review (Layer 3)
                      ↓
              Decision: Approve / Remove / Restrict / Escalate
                      ↓
              Appeals Process → Secondary Human Review
```

**Layer 1 -- Automated filters.** Hash matching against known bad content databases (PhotoDNA for child exploitation imagery, shared industry databases for terrorism content). Keyword filters for obvious spam. URL blocklists. These catch the easy cases instantly.

**Layer 2 -- AI/ML classification.** Computer vision models for NSFW detection, violence, and graphic content. NLP models for hate speech, harassment, misinformation, and self-harm content. These models output confidence scores. High-confidence violations are auto-removed. Low-confidence items pass through. Medium-confidence items go to human review.

**Layer 3 -- Human review.** Trained moderators review flagged content against community guidelines. They make judgment calls on context-dependent cases (satire vs hate speech, news reporting vs graphic violence). This is expensive, slow, and emotionally taxing for reviewers.

### Reporting and Appeals

Users can report content they find violating. Reports feed into the moderation queue with priority based on severity (imminent danger > hate speech > spam). Each report gets a resolution (removed, not removed, restricted). Users who filed the report receive an outcome notification.

Appeals let content creators challenge moderation decisions. The appeal goes to a different reviewer (or review panel) for a fresh look. Some platforms have an independent oversight board for high-profile cases. A good appeals system tracks overturn rates by moderator and content category -- if a specific policy is getting overturned 40% of the time on appeal, the policy itself probably needs refinement.

### Viral Content Detection

When a post's engagement velocity spikes (likes per minute, share rate), the system flags it for accelerated moderation review. Viral content reaches millions of users in hours, so moderation decisions on viral posts are time-critical. Some platforms proactively slow distribution of unreviewed viral content until moderators can assess it.

Detection typically works by tracking engagement rate over rolling time windows (e.g., likes per minute over the last 15 minutes). When the rate crosses a threshold relative to the account's baseline, the post enters a "virality watch" state. At that point the system can throttle distribution (show it to a sample of followers first), escalate to priority human review, or both.

### Age-Gating and Content Restrictions

Certain content is legal but restricted -- alcohol advertising, gambling, mature-rated games, or suggestive content that doesn't cross into NSFW territory. Age-gating requires verifying a user's age (usually via self-reported date of birth, though some jurisdictions now require ID verification) and restricting access to age-appropriate content. This intersects with local law: what's acceptable for a 16-year-old in one country may require 18+ gating in another. The system needs per-market content classification rules and user age data that's reliable enough to enforce them.

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Fan-out on write** | Pre-computing feeds by pushing new posts into all followers' inboxes at publish time |
| **Fan-out on read** | Building feeds on demand by pulling and merging posts from followed accounts at read time |
| **Social graph** | The network of follow/friend relationships between users, stored as a directed or undirected graph |
| **Engagement signal** | Any user interaction (like, comment, share, dwell time) used as input to the ranking algorithm |
| **Content ranking** | Ordering feed items by predicted relevance rather than pure chronology |
| **UGC (User-Generated Content)** | Any content created by users rather than the platform itself |
| **NSFW detection** | Automated classification of sexually explicit or graphic content, typically using computer vision models |
| **Shadow banning** | Reducing a user's content visibility without notifying them. Their posts appear normal to them but are hidden from others |
| **Age-gating** | Restricting content access based on the user's stated age, required by law in many jurisdictions for adult content |
| **PhotoDNA / perceptual hashing** | Technology that creates a fingerprint of an image to match against databases of known illegal content |
| **Community guidelines** | The platform's published rules defining what content is and isn't allowed |
| **Content velocity** | The rate at which a piece of content accumulates engagement, used to detect viral spread |
| **Trust and Safety (T&S)** | The team and systems responsible for keeping a platform safe from abuse, illegal content, and harmful behavior |
| **Creator/Influencer tier** | Special account classifications with different distribution rules, monetization access, and moderation priority |
| **Dwell time** | How long a user looks at a piece of content before scrolling past, used as an implicit engagement signal |
| **Candidate generation** | The first stage of ranking that narrows millions of possible posts to a manageable set using cheap heuristics |
| **Coordinated inauthentic behavior** | Networks of fake accounts acting together to amplify content, manipulate trends, or harass targets |
| **Content appeal** | A formal request by a user to have a moderation decision reviewed by a different reviewer or panel |

## Common Patterns

### Pattern 1: Hybrid Fan-Out with Celebrity Handling

Use fan-out on write for the 99% of users who have a manageable follower count (under 10K). For high-follower accounts, skip the fan-out and merge their posts at read time. This keeps write costs predictable while delivering fast reads. Twitter (now X) pioneered this approach and most platforms have adopted some variation of it.

### Pattern 2: Multi-Layer Moderation with Confidence Thresholds

Never rely on a single moderation method. Stack automated hash matching, ML classifiers, and human review. Set confidence thresholds: auto-remove at 95%+ confidence, auto-approve at below 20%, and send everything in between to the human queue. Regularly retrain models using human review decisions as labeled training data. This creates a feedback loop where your automated systems get better over time.

### Pattern 3: Pre-Publish vs Post-Publish Moderation

**Pre-publish (proactive):** Content is reviewed before it's visible to anyone. Guarantees nothing bad goes live but adds latency to the posting experience. Used for high-risk content types (live video, first-time posters, flagged accounts).

**Post-publish (reactive):** Content goes live immediately and is reviewed afterward, either by automated systems or when users report it. Better user experience but means harmful content is briefly visible. Used for most text and image posts on large platforms because pre-screening everything at scale is impractical.

Most platforms blend both: pre-publish screening for known-bad content (hash matching is instant), post-publish ML classification running asynchronously, and reactive human review triggered by reports.

### Pattern 4: Engagement-Weighted Ranking with Diversity Controls

Rank by predicted engagement but add constraints: no more than 2 consecutive posts from the same author, mix content types (text, image, video), inject some "explore" content from accounts the user doesn't follow, and boost recent posts to keep the feed feeling fresh. Without diversity controls, ranking algorithms create echo chambers and feed monotony.

### Pattern 5: Creator and Influencer Systems

Verified or high-follower accounts get differentiated treatment: priority moderation review (their content reaches more people so mistakes are costlier), access to analytics dashboards, monetization features (ad revenue sharing, tipping, subscriptions), and sometimes different content distribution rules. The creator program is both a product feature and a business strategy -- keeping top creators on your platform keeps their audiences there too.

### Pattern 6: Graduated Trust for New Accounts

New accounts are the highest risk for spam and abuse. Apply stricter moderation to accounts less than 7 days old or with fewer than N posts: rate-limit their posting frequency, pre-screen their content before publishing, restrict their ability to DM strangers, and limit how many people they can follow per day. As accounts age and build positive engagement history, gradually relax these restrictions. This "trust score" approach lets legitimate new users ramp up naturally while making it expensive for bad actors to create throwaway accounts.

## Common Pitfalls

1. **Treating moderation as an afterthought.** Building the feed first and adding moderation later leads to a period where your platform is flooded with spam and abuse. Design the moderation pipeline alongside the feed from day one. It's harder and more expensive to retrofit.

2. **Over-relying on automated moderation.** ML models have blind spots -- sarcasm, cultural context, coded language, and novel forms of abuse slip through. Platforms that cut human review budgets to save money see quality plummet. Automation handles volume; humans handle nuance. You need both.

3. **Ignoring the mental health of human moderators.** Content moderators review the worst content on the internet -- violence, exploitation, abuse -- for hours every day. Burnout and PTSD rates are extremely high. Provide mental health support, limit exposure time, rotate assignments, and invest in better automated pre-filtering to reduce the volume of traumatic content humans must review.

4. **Shadow banning without transparency.** Shadow banning seems clever -- bad actors don't know they're restricted -- but when regular users get accidentally shadow-banned, they can't diagnose why their engagement dropped. Lack of transparency erodes trust. Prefer explicit action notices ("Your post was removed because...") with clear appeal paths.

5. **Building a ranking algorithm that optimizes only for engagement.** Engagement optimization without guardrails amplifies outrage, misinformation, and polarizing content because that's what gets clicks. Add "quality" signals alongside engagement: downvotes, report rates, source credibility, and content informativeness. Optimize for "time well spent," not just time spent.

6. **Not planning for the celebrity problem in fan-out.** If you use pure fan-out on write and a user with millions of followers posts, you'll spike writes by orders of magnitude and potentially take down your system. Always architect with the assumption that follower counts follow a power law distribution.

7. **Inconsistent enforcement of community guidelines.** If similar content gets removed for one user but stays up for another, users lose faith in the system. Document clear, specific moderation policies. Train reviewers with calibration exercises. Use decision trees rather than gut feelings.

8. **Skipping the appeals process.** False positives are inevitable -- legitimate content will be incorrectly removed. Without an appeals process, you alienate users and risk legal challenges in jurisdictions that require due process for content takedowns (like the EU's Digital Services Act).

9. **Failing to localize moderation.** Hate speech in German looks different than hate speech in Hindi. Slang, cultural references, and coded language vary by region and evolve fast. A single English-trained moderation model will miss most non-English violations. Invest in multilingual models and region-specific review teams.

10. **Not rate-limiting engagement actions.** Without rate limits, bots can mass-like, mass-follow, and mass-comment to inflate metrics or harass users. Implement per-user rate limits on all engagement actions (e.g., max 100 likes per hour, max 50 follows per day) and flag accounts that consistently hit those limits.

## Quick Reference

| Decision | Recommendation |
|----------|---------------|
| Feed architecture for a new product | Start with fan-out on write (simpler), add read-path merging when you hit scale |
| First moderation system | Hash matching + off-the-shelf NSFW API + user reporting queue with manual review |
| Ranking algorithm starting point | Chronological with engagement-based re-ranking (likes + comments + recency) |
| Shadow banning | Avoid it. Use explicit restrictions with notifications and appeal paths |
| Viral content risk | Slow distribution of unreviewed fast-spreading content until moderation clears it |
| Creator/influencer program | Build analytics and monetization only after core feed and moderation are solid |
| Moderation staffing | Budget for human reviewers from day one, not as a future expense |
| Legal compliance | Consult legal for DMCA, DSA, age-gating, and local content laws before launch |

| Scale Milestone | What Changes |
|----------------|-------------|
| 0 - 10K users | Chronological feed, basic spam filters, manual moderation by founders |
| 10K - 1M users | Add ranking algorithm, ML-based moderation, hire dedicated T&S team |
| 1M - 100M users | Hybrid fan-out, multi-layer moderation pipeline, creator programs, regional compliance |
| 100M+ users | Custom infrastructure (social graph DB, real-time ML serving), independent oversight, global legal teams |

| Moderation Metric | What It Tells You |
|-------------------|-------------------|
| Precision (false positive rate) | How often you wrongly remove legitimate content |
| Recall (false negative rate) | How often harmful content slips through |
| Median review time | How fast your moderation pipeline processes flagged content |
| Appeal overturn rate | How often human reviewers reverse automated decisions |
| User report volume | Whether community trust in self-policing is healthy |
| Viral content response time | How quickly you catch and review fast-spreading harmful content |
