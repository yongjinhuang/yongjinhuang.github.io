# User Research & Discovery

## Overview

User research is the foundation of every good design decision. Without understanding who you are building for, you are guessing -- and guesses are expensive. This topic matters because companies increasingly expect frontend developers and designers to participate in (or at least understand) the research process. Whether you are building a SaaS dashboard or a personal portfolio, the same principles apply: understand your audience, validate your assumptions, and let evidence drive your design.

This guide covers the full spectrum of user research methods, from lightweight techniques a solo developer can run in an afternoon to formal frameworks used by dedicated UX research teams. By the end, you will know how to create personas, run interviews, map user journeys, and apply the Jobs-to-be-Done framework -- all with a practical, developer-friendly lens.

---

## Core Concepts

### What Is User Research?

User research is the systematic study of the people who use (or will use) a product. It answers three fundamental questions:

1. **Who** are the users?
2. **What** do they need?
3. **Why** do they behave the way they do?

Research is not a phase you complete once. It is a continuous practice that informs every stage of product development.

### Quantitative vs. Qualitative Research

These are two complementary lenses for understanding users.

```
+---------------------------+---------------------------+
|       QUANTITATIVE        |        QUALITATIVE        |
+---------------------------+---------------------------+
| Answers "how many/much"   | Answers "why/how"         |
| Numbers and metrics       | Stories and observations  |
| Large sample sizes        | Small sample sizes        |
| Surveys, analytics, A/B   | Interviews, observation   |
| Statistical confidence    | Rich context and nuance   |
| Identifies WHAT happens   | Explains WHY it happens   |
+---------------------------+---------------------------+
```

**Rule of thumb**: Use quantitative data to find _what_ is happening, then qualitative data to understand _why_.

### Surveys vs. Interviews

| Dimension       | Surveys                        | Interviews                     |
| --------------- | ------------------------------ | ------------------------------ |
| Scale           | Hundreds to thousands          | 5-15 participants              |
| Depth           | Shallow, structured            | Deep, exploratory              |
| Data type       | Mostly quantitative            | Mostly qualitative             |
| Time per person | 2-10 minutes                   | 30-60 minutes                  |
| Bias risk       | Leading questions, self-report | Interviewer bias, small sample |
| Best for        | Validating hypotheses          | Discovering unknowns           |

### User Personas

A persona is a fictional but research-based representation of a user segment. It synthesizes interview and survey data into a memorable archetype.

**Anatomy of a good persona:**

```
+-----------------------------------------------------+
|  PERSONA: "Portfolio Visitor Pat"                    |
+-----------------------------------------------------+
|  Demographics:                                       |
|    - Hiring manager, 35-45, tech company             |
|    - Reviews 20+ portfolios per hiring round         |
|                                                      |
|  Goals:                                              |
|    - Quickly assess technical competence             |
|    - See real project work, not just descriptions    |
|    - Gauge communication skills                      |
|                                                      |
|  Frustrations:                                       |
|    - Slow-loading portfolio sites                    |
|    - Generic template designs with no personality    |
|    - Missing contact information or broken links     |
|                                                      |
|  Quote:                                              |
|    "I spend about 30 seconds on each portfolio       |
|     before deciding whether to look deeper."         |
+-----------------------------------------------------+
```

**Common mistakes with personas:**

- Making them up without research (fictional personas are harmful)
- Creating too many (3-5 is usually sufficient)
- Including irrelevant demographic details
- Never updating them as the product evolves

### Empathy Maps

An empathy map captures what a user **says**, **thinks**, **does**, and **feels** during a specific experience. It forces you to step outside your own perspective.

```
+---------------------------+---------------------------+
|          SAYS             |          THINKS           |
|                           |                           |
| "I just want to find     | "Is this person actually  |
|  their best projects      |  good, or just good at    |
|  quickly."                |  making websites?"        |
|                           |                           |
+---------------------------+---------------------------+
|          DOES             |          FEELS            |
|                           |                           |
| - Scrolls quickly         | - Impatient               |
| - Opens project links     | - Skeptical initially     |
| - Checks GitHub profile   | - Impressed by polish     |
| - Looks at tech stack     | - Annoyed by slow loads   |
|                           |                           |
+---------------------------+---------------------------+
```

### User Journey Maps

A journey map visualizes the end-to-end experience a user has with your product, including their emotional state at each stage.

```
STAGE:    Discover  -->  Land  -->  Browse  -->  Evaluate  -->  Contact
          ~~~~~~~~      ~~~~~      ~~~~~~       ~~~~~~~~      ~~~~~~~

ACTION:   Google/       Read       Scan         Read case     Fill out
          LinkedIn      hero       sections     studies       form

THINKING: "Who is       "Does      "What have   "This is      "How do I
           this?"       this look   they done?"  impressive"   reach them?"
                        legit?"

EMOTION:   Neutral       Curious    Scanning     Engaged       Motivated
             |             |          |             |             |
             o             o          o             O             O
           __|_____________|__________|_____________|_____________|__
                                                                    --> Time

PAIN       No context    Slow       Too much     No live       No email,
POINTS:    from search   load       text, hard   demos or      only a
                         time       to scan      screenshots   form
```

### Jobs-to-be-Done (JTBD) Framework

JTBD shifts focus from _who_ the user is to _what they are trying to accomplish_. The central idea: people do not buy products, they "hire" them to do a job.

**JTBD Statement Format:**

```
When I [situation],
I want to [motivation],
so I can [expected outcome].
```

**Examples for a portfolio site:**

1. When I am **hiring for a frontend role**, I want to **see a candidate's real project work**, so I can **assess their technical ability quickly**.

2. When I am **a fellow developer browsing portfolios**, I want to **see what tech stack they use**, so I can **learn from their approach**.

3. When I am **a recruiter with 50 tabs open**, I want to **find contact info fast**, so I can **send a message before I forget**.

**Why JTBD matters for developers:** It prevents you from building features nobody asked for. Instead of "should I add a blog?", ask: "what job would a blog do for my visitors?"

### Competitive Analysis

Competitive analysis studies similar products to identify patterns, gaps, and opportunities.

**Lightweight competitive analysis framework:**

```
+------------------+----------+----------+----------+----------+
|    FEATURE       | Your     | Comp A   | Comp B   | Comp C   |
|                  | Site     |          |          |          |
+------------------+----------+----------+----------+----------+
| Hero section     | Animated | Static   | Video    | Minimal  |
| Project showcase | Cards    | Grid     | Carousel | List     |
| Case studies     | None     | Detailed | Brief    | None     |
| Contact method   | Form     | Email    | Cal link | Form     |
| Load time (s)    | 1.2      | 3.4      | 2.1      | 0.8      |
| Dark mode        | Yes      | No       | Yes      | No       |
| Mobile-first     | Yes      | No       | Yes      | Yes      |
+------------------+----------+----------+----------+----------+
```

**Steps for competitive analysis:**

1. Identify 5-10 competitors or comparable products
2. Define evaluation criteria relevant to your goals
3. Audit each product systematically
4. Note patterns (what everyone does) and gaps (what nobody does)
5. Prioritize opportunities where you can differentiate

### Usability Testing Basics

Usability testing observes real users attempting real tasks with your product. It is the single most effective way to find design problems.

**The 5-user rule:** Jakob Nielsen demonstrated that testing with just 5 users uncovers approximately 85% of usability issues. You do not need a lab or a budget.

**Running a lightweight usability test:**

1. **Define tasks** (not instructions): "Find the contact page" not "Click the menu, then click Contact"
2. **Recruit 5 participants** who match your target audience
3. **Think-aloud protocol**: Ask users to narrate their thought process
4. **Record observations**, not just outcomes
5. **Debrief** and identify patterns across participants

**Severity rating for issues found:**

| Severity | Description                     | Action             |
| -------- | ------------------------------- | ------------------ |
| Critical | Users cannot complete the task  | Fix immediately    |
| Major    | Users struggle significantly    | Fix before launch  |
| Minor    | Users notice but work around it | Fix when possible  |
| Cosmetic | Aesthetic only, no impact       | Fix if time allows |

### How Developers Can Do Lightweight Research

You do not need to be a trained researcher to gather useful insights. Here are methods that take minimal time:

**5-Second Test**: Show your homepage to someone for 5 seconds. Ask: "What does this site do? What do you remember?" This tests first impressions and visual hierarchy.

**Hallway Testing**: Grab a colleague, friend, or family member. Give them a task ("Find my most recent project"). Watch them silently. Note where they hesitate or click wrong.

**Analytics Review**: If your site is live, check:

- Bounce rate (>70% on landing page = problem)
- Time on page (very short = content not engaging)
- Navigation paths (where do users go after the homepage?)
- Exit pages (where do users leave?)

**Feedback Collection**: Add a simple mechanism:

```jsx
// Lightweight feedback widget
function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4">
      {isOpen ? (
        <form
          className="bg-white p-4 rounded-lg shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            // Send feedback to your preferred backend
            setIsOpen(false);
          }}
        >
          <textarea
            placeholder="How can I improve this site?"
            className="w-full border rounded p-2"
            rows={3}
          />
          <button
            type="submit"
            className="mt-2 bg-blue-600 text-white px-4 py-1 rounded"
          >
            Send
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-full shadow"
        >
          Feedback
        </button>
      )}
    </div>
  );
}
```

---

## Practical Examples

### Example 1: Building a Persona from Scratch

Suppose you are building a portfolio site and want to understand your audience.

**Step 1: Gather data**

- Interview 5 hiring managers, 3 recruiters, 2 fellow developers
- Send a short survey to your professional network (20-50 responses)

**Step 2: Identify patterns**

- Cluster responses by goals and behaviors
- Look for segments that behave differently

**Step 3: Draft personas**

```
PERSONA: "Technical Lead Tara"
+---------------------------------------------------------+
| CONTEXT                                                  |
| - Senior engineer at mid-size startup                    |
| - Evaluates candidates for her team                      |
| - Values clean code and system thinking                  |
|                                                          |
| GOALS                                                    |
| 1. Verify the candidate can write production code        |
| 2. Assess architectural thinking through project work    |
| 3. Check for attention to detail (code quality, UX)      |
|                                                          |
| BEHAVIORS                                                |
| - Spends 1-2 minutes on first visit                      |
| - Clicks directly into project case studies              |
| - Opens GitHub links in new tabs                         |
| - Judges code quality before reading descriptions        |
|                                                          |
| PAIN POINTS                                              |
| - Portfolios that look good but have no substance        |
| - No GitHub or live demo links                           |
| - Cannot tell what the candidate actually built vs team  |
+---------------------------------------------------------+

PERSONA: "Recruiter Raj"
+---------------------------------------------------------+
| CONTEXT                                                  |
| - Agency recruiter filling 10+ roles simultaneously      |
| - Non-technical, relies on keywords and visual polish    |
|                                                          |
| GOALS                                                    |
| 1. Quickly determine if candidate matches a role         |
| 2. Find contact information immediately                  |
| 3. Grab a summary to paste into client emails            |
|                                                          |
| BEHAVIORS                                                |
| - Spends 15-30 seconds maximum on first visit            |
| - Scans for job titles, company names, tech keywords     |
| - Looks for a clear "About" section and email/phone      |
|                                                          |
| PAIN POINTS                                              |
| - No clear summary or headline                           |
| - Contact form instead of direct email                   |
| - Too much text, not enough scannable structure          |
+---------------------------------------------------------+
```

### Example 2: Quick Journey Map for Portfolio Visitors

```
RECRUITER RAJ'S JOURNEY:

1. DISCOVERY          2. LANDING           3. SCANNING
   LinkedIn link         Sees hero            Scrolls for
   in candidate's        section with         skills and
   profile               name + title         experience

   Feeling: Neutral      Feeling: Judging     Feeling: Impatient
                          first impression

4. EVALUATING         5. ACTING            6. LEAVING
   Checks relevant       Copies email or      Moves to next
   experience            clicks contact       candidate
   and skills            link

   Feeling: Interested   Feeling: Satisfied   Feeling: Done
   or Dismissive         or Frustrated
                         (no email found)
```

### Example 3: JTBD for Portfolio Features

| Feature         | Job It Does                                   | Priority |
| --------------- | --------------------------------------------- | -------- |
| Hero section    | Communicates who you are in 5 seconds         | High     |
| Project cards   | Proves you can ship real work                 | High     |
| Case studies    | Shows your problem-solving process            | Medium   |
| Blog            | Demonstrates communication skills and depth   | Low      |
| Contact form    | Lets visitors reach you with minimal friction | High     |
| Resume download | Gives recruiters a shareable document         | Medium   |
| Testimonials    | Provides social proof from colleagues         | Low      |

---

## Common Interview Questions

### Q1: What is the difference between user research and market research?

**Answer:** Market research focuses on the viability of a product in a market -- market size, pricing, competition, and business opportunity. User research focuses on understanding the behaviors, needs, and motivations of individual users. Market research asks "Is there a market for this?" User research asks "Will people actually use this, and how?" In practice, they overlap: user interviews can reveal market insights, and market data can inform who you should research. However, the methods and goals differ. A UX designer primarily conducts user research, while a product manager often owns market research.

### Q2: How many users do you need for a usability test?

**Answer:** For qualitative usability testing, 5 users per distinct user segment is the gold standard, based on Jakob Nielsen's research showing that 5 users uncover ~85% of usability problems. If you have 2 distinct personas, test with 5 from each group (10 total). For quantitative studies where you need statistical significance (like A/B testing), you need much larger sample sizes, often hundreds or thousands depending on effect size. The key insight: you get diminishing returns after 5 users because the same usability problems keep surfacing.

### Q3: What makes a good user persona?

**Answer:** A good persona is (1) based on real research data, not assumptions; (2) focused on goals and behaviors rather than demographics; (3) specific enough to guide design decisions; and (4) kept to a manageable number (3-5 per product). A bad persona reads like a dating profile -- "Sarah likes yoga, has a dog, and drinks oat milk." These details are irrelevant unless they directly influence product behavior. A good persona answers: What are they trying to accomplish? What frustrates them? What does their workflow look like? How do they make decisions?

### Q4: Explain the Jobs-to-be-Done framework and when you would use it.

**Answer:** JTBD reframes product design around the "job" a user hires a product to do. Instead of defining users by demographics, you define them by the progress they are trying to make in a specific circumstance. The format is: "When [situation], I want to [motivation], so I can [outcome]." I would use JTBD when prioritizing features, because it forces you to evaluate each feature against a real user need. For example, a portfolio site visitor does not want "an animated hero section" -- they want to "quickly understand who this developer is and whether they are worth considering." The animation is only valuable if it serves that job.

### Q5: How do you handle conflicting research findings?

**Answer:** Conflicting findings are common and usually signal one of three things: (1) You have multiple distinct user segments with different needs -- segment your data and create separate personas. (2) What users say differs from what they do -- behavioral data (what they do) almost always trumps attitudinal data (what they say). (3) Your sample is too small or biased -- collect more data or diversify your participant pool. The resolution process is: acknowledge the conflict, dig deeper into context, check for segmentation, and when in doubt, default to behavioral evidence over stated preferences.

### Q6: What is an empathy map and how does it differ from a persona?

**Answer:** An empathy map is a collaborative visualization tool that captures what a user says, thinks, does, and feels during a specific experience. A persona is a broader archival document representing an entire user segment. Think of it this way: a persona describes _who_ the user is across many situations, while an empathy map captures their experience in _one specific context_. You might have a persona for "Hiring Manager Hannah" and then create multiple empathy maps: one for her experience reviewing portfolios, another for conducting interviews. Empathy maps are faster to create and best used in workshops to build team alignment.

### Q7: How would you conduct user research with zero budget?

**Answer:** Zero-budget research is absolutely possible. Methods include: (1) Guerrilla testing -- approach people in coffee shops or coworking spaces for 5-minute feedback sessions. (2) Remote unmoderated testing with free tools like Maze (limited free tier) or simply screen-sharing over Zoom. (3) Analyzing public reviews and forums for competitor products to understand user frustrations. (4) Google Analytics or Vercel Analytics for behavioral data on your own site. (5) Social media polls on LinkedIn or Twitter for quick quantitative signals. (6) The "mom test" approach -- asking questions about behavior rather than opinions (e.g., "When was the last time you looked at a developer portfolio?" rather than "Would you use a portfolio site?").

---

## Applying to Your Portfolio

### Immediate Actions

1. **Run a 5-second test** on your portfolio homepage. Show it to 5 people, hide it, and ask them what they remember. If they cannot recall your name and what you do, your hero section needs work.

2. **Build two lightweight personas** -- a technical evaluator (team lead) and a non-technical evaluator (recruiter). Design decisions should satisfy both.

3. **Map the recruiter's journey** through your site. They have 30 seconds. Can they find your name, title, top skills, and contact info in that time?

4. **Apply JTBD to every section** of your portfolio:

```
Hero:     "Help me understand who you are in 5 seconds"
Projects: "Show me proof you can build real things"
Skills:   "Let me quickly match you to my open role"
Contact:  "Let me reach you with zero friction"
```

### Next.js + Tailwind Implementation Ideas

**Analytics-driven research with Vercel Analytics:**

```tsx
// In your Next.js layout, add Vercel Analytics for behavioral data
// This gives you page views, referrers, and visitor geography
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

**Designing for your personas with Tailwind:**

```tsx
// Recruiter Raj needs scannable content -- use clear visual hierarchy
function HeroSection({ name, title, summary }: HeroProps) {
  return (
    <section className="flex flex-col items-center gap-4 py-20">
      {/* Large, bold name -- visible in 2 seconds */}
      <h1 className="text-5xl font-bold tracking-tight">{name}</h1>

      {/* Clear role/title -- keyword-rich for recruiters */}
      <p className="text-xl text-gray-600 dark:text-gray-400">{title}</p>

      {/* Short summary -- one line that captures your value */}
      <p className="max-w-lg text-center text-gray-500">{summary}</p>

      {/* Prominent contact CTA -- zero friction */}
      <a
        href="mailto:you@example.com"
        className="mt-4 rounded-full bg-blue-600 px-6 py-3 text-white
                   transition-transform hover:scale-105"
      >
        Get in Touch
      </a>
    </section>
  );
}
```

**Framer Motion for journey-optimized transitions:**

```tsx
import { motion } from 'framer-motion';

// Stagger content to guide the visitor's eye through your story
function SectionReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
    >
      {children}
    </motion.div>
  );
}
```

---

## Quick Reference

```
USER RESEARCH CHEAT SHEET
==========================

RESEARCH TYPES:
  Quantitative  --> "How many?" (surveys, analytics, A/B tests)
  Qualitative   --> "Why?"      (interviews, observation, usability tests)

CORE METHODS (by effort):
  Low effort:   5-second tests, hallway testing, analytics review
  Medium effort: Surveys, competitive analysis, card sorting
  High effort:  User interviews, usability studies, diary studies

PERSONA CHECKLIST:
  [ ] Based on real data (not assumptions)
  [ ] Focused on goals and behaviors
  [ ] Includes frustrations and pain points
  [ ] Has a memorable name and quote
  [ ] Limited to 3-5 per product

EMPATHY MAP QUADRANTS:
  Says | Thinks | Does | Feels

JTBD FORMULA:
  When I [situation], I want to [motivation], so I can [outcome].

JOURNEY MAP LAYERS:
  Stage --> Action --> Thinking --> Emotion --> Pain Points

USABILITY TEST RULES:
  - 5 users per segment
  - Define tasks, not instructions
  - Ask users to think aloud
  - Record observations, not just pass/fail
  - Rate issues by severity (Critical > Major > Minor > Cosmetic)

DEVELOPER QUICK WINS:
  1. Run a 5-second test on your homepage
  2. Check analytics for bounce rate and exit pages
  3. Map the 30-second recruiter journey
  4. Apply JTBD to prioritize every feature
  5. Test with 5 real people before launching
```
