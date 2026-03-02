# HR & Behavioral Interview Checklist

## 1. Self-Introduction (1-2 min)

> Hey, I'm Yongjin. I studied Software Engineering at Sun Yat-sen University. I've been doing full-stack development for about 8 years — mostly Go, Python, Java, and TypeScript. I've worked at Huawei, Shopee, Tarro, and lately WildData where I came in as a technical partner. I really enjoy building backend systems and making things run faster and smoother.

---

## 2. Why Did You Leave Each Company?

### Huawei (Jul 2017 - Aug 2019)

**Real reason:** Tedious — just writing docs, sitting in meetings, reviewing code. No real coding anymore.

**Say this:**

> Huawei was a great start for me. I learned a lot about how big companies work. But over time, my job turned into mostly writing documents and sitting in meetings. I wasn't really coding anymore. I missed building things, so I decided to move on.

### Shopee (Aug 2019 - Mar 2023)

**Real reason:** Multiple layoffs made the vibe toxic. Left with a severance package.

**Say this:**

> I was at Shopee for almost 4 years, went from engineer to senior engineer. Then the company had a few rounds of layoffs, and things got pretty uncertain. They offered a separation package, and I thought it was a good time to try something new.

**If they dig deeper:**

> Yeah, the whole e-commerce space was slowing down at that time. It felt like a natural point to move on instead of just waiting around.

### Tarro (Apr 2023 - Apr 2024)

**Real reason:** Company shut down China operations. Whole team was let go.

**Say this:**

> Tarro decided to shut down their China office — it was a business decision. The whole local team was let go. Nothing to do with my performance.

### WildData (Apr 2024 - Present)

**Real reason:** No money coming in. Stuck in hometown too long.

**Say this:**

> I joined WildData as a technical partner with 5% equity. I built a lot of things from scratch — CI/CD, backend, payments. But honestly, the company hasn't found product-market fit yet, and there's no real revenue. I want to work somewhere more stable where I can keep growing as an engineer.

**If they ask "why leave something you own?":**

> I learned a ton from the startup — wearing many hats, owning everything end to end. But I've realized I want to work on bigger systems with a real team. I want to take what I learned and bring it to a larger company.

---

## 3. Common HR Questions

### Why this role / company?

- Do your homework on the company first!
- Mention something specific — their product, tech, or culture

> I've been looking at [company] for a while. I really like [something specific — their scale, tech stack, product]. I think my background in [skill] is a good fit for what you guys are doing.

### What are your strengths?

Pick 2-3 and give a quick example:

- **I'm good at fixing performance issues:** "At Shopee, our billing API was slow — 4k DB connections, only 2k QPS. I dug into it and got it down to 1k connections with 5k QPS."
- **I take ownership:** "At WildData, I handled everything — CI/CD, payments, infrastructure. Nobody told me to, I just did it."
- **I pick things up fast:** "At Tarro, I was new to Go and POS systems. Within a month I was shipping core APIs."

### What's your weakness?

> Sometimes I spend too long making code perfect before I ship it. I've gotten better at this — now I try to ship something that works first, then improve it later.

### Where do you see yourself in 3-5 years?

> I want to grow into a tech lead — someone who can design systems and also help junior devs get better. I'm looking for a place where I can do that.

### Salary expectations?

- Look up market rates before the call
- Give a range, not one number

> Based on my experience and what I've seen in the market, I'm looking at something in the [X to Y] range. But I'm flexible — it depends on the whole package.

### Questions for them?

Always ask 2-3:

1. "What does a normal day look like for this role?"
2. "How does your team do code reviews and deployments?"
3. "What's the biggest technical challenge you guys are dealing with right now?"

---

## 4. Behavioral Questions (STAR Format)

Use **Situation → Task → Action → Result**. Keep each answer under 2 minutes. Lead with "I", not "we".

---

### Q: Tell me about a time you solved a hard technical problem.

> At Shopee, our billing API was struggling — 4k database connections and only 2k QPS. During flash sales it would timeout and block shipment processing.
>
> I added distributed tracing and found three root causes: an N+1 query pattern in invoice generation, a misconfigured connection pool, and a synchronous call to an external tax service that held connections open.
>
> I fixed them in order of impact — batched the N+1 queries, tuned the pool settings, and made the tax call async with a task queue. I also rewrote the hottest path in Go because Python's GIL was a bottleneck for concurrent connections.
>
> Connections dropped from 4k to 1k, QPS went from 2k to 5k. Zero outages during the next three flash sales. Two other teams adopted the tracing setup I built.

---

### Q: Tell me about a time you showed leadership without being the manager.

> At Shopee, code reviews were basically rubber stamps — everyone just said "LGTM" in two minutes. We had 2-3 deployment bugs per month.
>
> I started by writing really detailed PR descriptions on my own code — context, approach, alternatives, what to look at. I tagged my review comments as "blocking", "suggestion", or "nit" so people knew what mattered. Then I made a review checklist for billing-specific stuff: decimal precision, SQL rollback plans, concurrency edge cases.
>
> I also started a weekly "review spotlight" in Slack where I'd highlight a great review interaction. For junior devs who were nervous reviewing senior code, I paired with them on reviews until they felt confident.
>
> Deployment defects dropped 30%. The checklist got adopted by two other teams. My manager called it one of the most impactful things I did that year.

---

### Q: Tell me about a time you had to learn something new quickly.

> When I joined Tarro, I'd never worked with Go in production or POS systems. The codebase was all Go/Gin, and I needed to ship features fast.
>
> I spent the first week reading the existing code instead of trying to write anything. I traced a few API requests end-to-end to understand the patterns. I also asked a lot of questions — I wasn't shy about saying "I don't know how this works yet."
>
> Within a month I was building RESTful APIs for POS ordering with seamless frontend integration. I also optimized the receipt printing logic and cut errors by 50%. By month three I was migrating legacy menu data to the new system and reduced retrieval time by 30%.

---

### Q: Tell me about a time you dealt with a disagreement at work.

> At Shopee, our team was debating whether to rewrite a slow billing module in Go or just optimize the existing Python code. The tech lead wanted a full rewrite. I thought we should optimize first and only rewrite the pieces that were actually bottlenecks.
>
> Instead of just arguing in a meeting, I profiled the existing code over the weekend and found that only one specific path — the concurrent connection handling — was actually blocked by Python's GIL. The rest was fine with query optimization.
>
> I showed the profiling data to the team. We agreed to optimize the Python code first and only rewrite that one hot path in Go. It took half the time of a full rewrite and got us the same performance gains.
>
> I learned that "show the data" beats "have the argument" every time.

---

### Q: Tell me about a time you failed or made a mistake.

> At WildData, early on I tried to build everything perfectly from the start — over-engineered the architecture for a product that didn't even have users yet. I spent weeks on a microservices setup when a monolith would have been fine.
>
> I realized we were burning time on infrastructure instead of shipping features. So I simplified — collapsed it back into a simpler structure, focused on getting the core product out.
>
> The lesson was: don't architect for scale you don't have yet. Ship first, optimize later. I still think about that every time I start a new project now.

---

### Q: Tell me about a time you built something from scratch.

> At WildData I built the entire Suppr platform from zero. It's an AI-powered research tool — literature search, file translation, deep research report generation.
>
> I designed the architecture with an API/Consumer split on K8s so they could scale independently. Used Kafka for async processing of the heavy AI tasks, and SSE plus Redis pub/sub for real-time streaming of results back to users.
>
> I also built the payment system from scratch — a three-stage point system with freeze, consume, and rollback, plus idempotent callbacks for WeChat Pay and Alipay. And I set up all the infrastructure on Tencent Cloud: TKE cluster, WAF, CDN, load balancer, plus the CI/CD pipeline with Jenkins and Helm.
>
> It taught me what it really means to own something end to end. There's no one to hand things off to at a startup.

---

### Q: Tell me about a time you improved a process or workflow.

> At WildData, deployments were manual — SSH in, pull code, restart. It was slow and error-prone.
>
> I built a full CI/CD pipeline: Jenkins triggers on merge, Docker multi-stage builds, Helm charts for K8s, and Orbit CD for rolling updates. I also added health checks so bad deployments would auto-rollback.
>
> Deployment went from a 30-minute manual process to a one-click 5-minute pipeline. It doubled our deployment frequency. When a new app needed to be integrated, I packaged the payment module so it could be dropped in — cut new app integration time by 200%.

---

### Q: How do you handle working with unclear or changing requirements?

> At WildData, requirements changed constantly because we were still finding product-market fit. One week we'd focus on literature search, next week the priority would shift to translation.
>
> I dealt with it by keeping the architecture modular. Each AI service — search, translation, report generation — was its own service behind a clean API. So when priorities shifted, I could pause work on one service without breaking the others.
>
> I also started having short weekly syncs with my co-founder to align on what mattered most that week. It wasn't perfect, but it stopped me from building the wrong thing for two weeks before finding out.

---

### Q: Tell me about a time you mentored or helped someone grow.

> At Shopee, we had a couple of junior engineers who were afraid to review senior engineers' code. They'd just approve everything without really looking.
>
> I started pairing with them on reviews. We'd look at a PR together — I'd ask them what they noticed first, then we'd compare notes. I pointed out things like "see this query? It's doing N+1 — how would you fix it?" Over time they started catching real issues on their own.
>
> One of them eventually pushed back on a design I proposed during a review. She was right, too. That was the moment I knew the approach was working.

---

### Q: Tell me about a time you shared knowledge with your team.

> At Shopee, I gave 5 tech talks over about two years. The first one was about the billing API optimization — connection pooling, async patterns, the Go migration. I made sure to include concrete numbers and code snippets so people could actually use the ideas.
>
> The talks got 30-60 people each. After mine on connection pooling, two other teams adopted the same patterns and improved their own services. I also helped other engineers prep their talks — a lot of people wanted to present but were nervous, so I'd do dry runs with them.
>
> The series became self-sustaining. Eventually 15 engineers from 6 teams had presented. It was one of the things I'm most proud of from my time there.

---

### Q: Why should we hire you?

> Three things. First, I've worked across the full stack at real scale — Shopee handles massive traffic, and I've optimized systems that process thousands of requests per second. Second, I don't just write code — I improve the team around me through code reviews, tech talks, and mentoring. Third, the startup experience at WildData taught me to own things end to end, from architecture decisions to infrastructure to payments. I bring all of that together.

---

## 5. Tricky Questions

### You've changed jobs a lot. Why?

> If you look at it, most of the moves weren't really my choice. Tarro shut down their China office. Shopee had big layoffs. I actually stayed at Shopee for almost 4 years. I'm really looking for something long-term this time.

### What did you get out of the startup?

> I got to do everything — design the architecture, write the code, set up CI/CD, manage servers, build the payment system. You don't get that kind of experience at a big company. It really taught me how to own things end to end.

### How do you deal with disagreements at work?

> I try to focus on the problem, not the person. Like, "what's the best way to solve this?" not "who's right." At Shopee I ran code reviews every week, so I got a lot of practice giving and taking feedback.

### Tell me about a hard project.

> At Shopee, our billing API was struggling — 4k database connections and only handling 2k requests per second. I looked into it, found the bottlenecks, fixed the connection pooling and cleaned up the queries. Got it down to 1k connections and 5k QPS. The tricky part was doing it with zero downtime because billing can't go down.

### What if you disagree with your manager's technical decision?

> I'd bring data. I wouldn't just say "I think X is better" — I'd profile it, prototype it, or find a relevant case study. If the data supports my view, I'd present it. If my manager still disagrees after seeing the data, I'd commit to their decision and execute it fully. I've been wrong before too.

### How do you handle a situation where you're stuck and can't figure something out?

> First, I timebox it — if I've been stuck for more than an hour, I change my approach. I'll re-read the docs, search for similar issues, or add more logging/tracing. If that doesn't work, I ask someone. I've learned there's no prize for struggling alone for a whole day when a 10-minute conversation could unblock you.

### Tell me about a time you had to work under pressure.

> During flash sales at Shopee, billing couldn't go down — it would block the entire shipment pipeline. When I was doing the API optimization, I had to roll out changes with zero downtime during one of the busiest weeks. I used feature flags to gradually shift traffic to the new code path, monitored every metric in real-time, and had a rollback plan ready. It went smoothly, but those few hours were intense.

---

## 6. Quick Reminders

- [ ] Slow down — it's OK to pause and think
- [ ] Keep answers short — under 2 minutes
- [ ] It's fine to say "Let me think about that for a second"
- [ ] Never talk bad about old companies
- [ ] Always spin it positive — talk about what you want next, not what was bad
- [ ] Have your numbers ready (4k→1k connections, 2k→5k QPS, 30% less defects, 50% fewer receipt errors)
- [ ] Prepare 2-3 questions to ask them
- [ ] Google the company before the call
- [ ] Lead with "I", not "we" — show YOUR contribution
- [ ] Every answer should have a concrete example, not just a general statement

## 7. Filler Phrases (when your brain goes blank)

Use these to buy time:

- "That's a great question. Let me think..."
- "So basically what happened was..."
- "The way I see it is..."
- "To put it simply..."
- "What I mean is..."
- "Let me give you an example..."

## 8. Key Numbers Cheat Sheet

Keep these on a sticky note during calls:

| Metric | Details |
|--------|---------|
| DB connections | 4k → 1k (Shopee billing API) |
| QPS | 2k → 5k (Shopee billing API) |
| Deployment defects | Down 30% (Shopee code reviews) |
| Receipt errors | Down 50% (Tarro POS) |
| Data retrieval time | Down 30% (Tarro menu migration) |
| New app integration | 200% faster (WildData payment module) |
| Tech talks | 5 talks, 30-60 attendees each (Shopee) |
| Years of experience | ~8 years full-stack |
| Languages | Go, Python, Java, TypeScript, SQL |
