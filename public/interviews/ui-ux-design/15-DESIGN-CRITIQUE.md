# Design Critique & Heuristic Evaluation

## Overview

The ability to systematically evaluate and critique design is what separates a developer who implements specifications from one who improves products. Whether you are reviewing a colleague's design, evaluating a competitor's product, or auditing your own portfolio, structured evaluation frameworks give you the vocabulary and methodology to identify problems and propose solutions.

This guide covers the foundational evaluation methods — Nielsen's heuristics, cognitive walkthroughs, usability testing — along with the interpersonal skills of giving and receiving design feedback effectively.

### What You Will Learn

- Nielsen's 10 usability heuristics with concrete examples
- How to conduct a heuristic evaluation
- Cognitive walkthrough methodology
- Structured critique frameworks for design feedback
- A/B testing fundamentals for design decisions
- Usability testing methods and when to use each
- Using analytics to inform design decisions
- Common design anti-patterns
- Self-evaluating your own portfolio

---

## Core Concepts

### Nielsen's 10 Usability Heuristics

Jakob Nielsen's heuristics are the most widely used framework for evaluating user interface design. Published in 1994, they remain relevant because they describe fundamental principles of human-computer interaction.

#### 1. Visibility of System Status

The system should always keep users informed about what is going on, through appropriate feedback within reasonable time.

**Good Examples:**
- Progress bars during file uploads
- Loading spinners with context ("Loading your projects...")
- Real-time form validation (green checkmark as you type a valid email)
- "Saving..." indicator in document editors
- Read receipts in messaging apps

**Bad Examples:**
- A button that does nothing visually when clicked
- No indication that a form was submitted
- A page that takes 5 seconds to load with no spinner

```
GOOD:                          BAD:
+-----------------------+      +-----------------------+
| Uploading photo...    |      |                       |
| [==========>    ] 73% |      |  (nothing happening)  |
| 2.4 MB of 3.3 MB     |      |                       |
+-----------------------+      +-----------------------+
```

#### 2. Match Between System and the Real World

The system should speak the users' language, with words, phrases, and concepts familiar to the user, rather than system-oriented terms.

**Good Examples:**
- "Shopping Cart" instead of "Item Buffer"
- Trash can icon for delete (physical metaphor)
- Calendar widgets that look like calendars
- "Your order is on its way" instead of "Status: IN_TRANSIT"

**Bad Examples:**
- "Error: ECONNREFUSED" shown to end users
- "Null reference exception" in a user-facing dialog
- Technical jargon in a consumer app ("Sync your OAuth token")

#### 3. User Control and Freedom

Users often perform actions by mistake. They need a clearly marked "emergency exit" to leave the unwanted state without having to go through an extended process.

**Good Examples:**
- Undo/redo functionality
- "Cancel" buttons on all dialogs
- Gmail's "Undo Send" feature
- Browser back button works as expected
- Confirmation dialogs before destructive actions

**Bad Examples:**
- No way to cancel a multi-step form
- Permanent deletion without confirmation
- Forced onboarding with no skip option

#### 4. Consistency and Standards

Users should not have to wonder whether different words, situations, or actions mean the same thing. Follow platform conventions.

**Good Examples:**
- Links are always underlined or colored
- Primary action is always on the right (in LTR layouts)
- Icons mean the same thing across the app (gear = settings everywhere)
- Form labels are always above inputs (consistent placement)

**Bad Examples:**
- "Save" button is blue on one page, green on another
- Sometimes clicking a card navigates, sometimes it opens a modal
- Different date formats on different pages

#### 5. Error Prevention

Even better than good error messages is a careful design which prevents a problem from occurring in the first place.

**Good Examples:**
- Disabled submit button until required fields are filled
- Search suggestions that prevent typos
- Confirmation dialog: "Delete 23 files permanently?"
- Calendar date picker instead of free-text date input
- Autocomplete for known values (country, city)

```
ERROR PREVENTION EXAMPLE:

Instead of:                    Use:
+------------------+           +------------------+
| Date: [________] |           | Date:            |
| (mm/dd/yyyy)     |           | [March  v] [17]  |
+------------------+           | [2026   v]       |
                               +------------------+
Free text = errors             Constrained = no errors
```

#### 6. Recognition Rather Than Recall

Minimize the user's memory load by making objects, actions, and options visible. The user should not have to remember information from one part of the interface to another.

**Good Examples:**
- Recent files list in document editors
- Autocomplete in search fields
- Breadcrumb navigation showing current location
- Tooltips on icons
- Dropdown menus showing all options rather than requiring typed input

**Bad Examples:**
- Error codes the user must look up in documentation
- Form fields that require memorized account numbers
- Navigation that requires remembering the site structure

#### 7. Flexibility and Efficiency of Use

Accelerators — unseen by the novice user — may speed up interaction for the expert. Allow users to tailor frequent actions.

**Examples:** Keyboard shortcuts (Ctrl+S, Ctrl+K command palette), double-click to edit inline, drag-and-drop alongside button alternatives, customizable dashboards.

#### 8. Aesthetic and Minimalist Design

Every extra unit of information competes with relevant units and diminishes their visibility.

**Good:** Google's homepage, progressive disclosure, whitespace used to group content.
**Bad:** Cluttered navigation with 20+ items, pop-ups and banners stacking, dense tables with no hierarchy.

#### 9. Help Users Recognize, Diagnose, and Recover from Errors

Error messages should be in plain language, precisely indicate the problem, and suggest a solution.

```
BAD:                           GOOD:
+-----------------------+      +-----------------------------+
| Email: [user@gmal.co]|      | Email: [user@gmal.co]      |
|                       |      | ! Did you mean gmail.com?  |
| [x] Invalid email     |      | [Yes, fix it] [No, keep it]|
+-----------------------+      +-----------------------------+
```

#### 10. Help and Documentation

Provide help that is easy to search, focused on the user's task, lists concrete steps, and is concise. Examples: contextual tooltips (? icon), searchable help center, onboarding tours, inline documentation in complex forms.

### Heuristic Evaluation Method

A heuristic evaluation is a structured inspection where evaluators examine an interface against the 10 heuristics.

**How to Conduct One:**

```
Step 1: Define Scope
+----------------------------------+
|  What are you evaluating?        |
|  - Full app or specific flow?    |
|  - Which user persona?           |
|  - What tasks?                   |
+----------------------------------+
         |
         v
Step 2: Individual Evaluation (3-5 evaluators)
+----------------------------------+
|  Each evaluator independently:   |
|  - Walks through the interface   |
|  - Notes issues per heuristic    |
|  - Rates severity (0-4 scale)   |
+----------------------------------+
         |
         v
Step 3: Consolidate Findings
+----------------------------------+
|  Merge all evaluator findings    |
|  Remove duplicates               |
|  Discuss disagreements           |
|  Prioritize by severity          |
+----------------------------------+
         |
         v
Step 4: Report and Recommend
+----------------------------------+
|  For each issue:                 |
|  - Heuristic violated            |
|  - Severity rating               |
|  - Location in interface         |
|  - Recommendation to fix         |
+----------------------------------+
```

**Severity Scale:**
- **0** — Not a usability problem
- **1** — Cosmetic problem only; fix if time permits
- **2** — Minor usability problem; low priority
- **3** — Major usability problem; important to fix
- **4** — Usability catastrophe; must fix before release

### Cognitive Walkthrough Method

A cognitive walkthrough evaluates how easy an interface is for new users by stepping through a task and asking four questions at each step:

1. **Will the user try to achieve the right effect?** (Do they know what to do next?)
2. **Will the user notice the correct action is available?** (Is it visible?)
3. **Will the user associate the correct action with the desired effect?** (Is the label/icon clear?)
4. **If the correct action is performed, will the user see progress toward the goal?** (Is there feedback?)

**Example: "Sign up for an account" walkthrough**

```
Task: Create a new account

Step 1: Click "Sign Up" button
  Q1: Yes - user wants to create an account
  Q2: Yes - button is in the top navigation, clearly labeled
  Q3: Yes - "Sign Up" is standard terminology
  Q4: Yes - navigates to a registration form
  Result: PASS

Step 2: Fill in email field
  Q1: Yes - email is expected for registration
  Q2: Yes - field is labeled and has placeholder
  Q3: Yes - label says "Email Address"
  Q4: Partial - no real-time validation
  Result: MINOR ISSUE (add inline validation)

Step 3: Choose a password
  Q1: Yes - password is expected
  Q2: Yes - field is present
  Q3: Yes - label says "Password"
  Q4: No - requirements not shown until after submission
  Result: ISSUE (show password requirements proactively)
```

### Design Critique Frameworks

#### I Like / I Wish / What If

A simple, non-confrontational framework for design feedback:

- **I like...** — Positive observations (what is working well)
- **I wish...** — Constructive suggestions (what could improve)
- **What if...** — Exploratory ideas (blue-sky thinking)

```
Example feedback on a portfolio site:

"I like the smooth page transitions and the way the experience
timeline uses a clear visual hierarchy.

I wish the mobile navigation had a clearer close affordance —
the X button is small and close to other interactive elements.

What if the skills section used an interactive visualization
instead of a static grid? Users could explore skill
relationships."
```

This framework works because it starts with positivity (building trust), moves to specific suggestions (actionable), and ends with possibilities (inspiring rather than prescriptive).

#### The "Yes, and..." Approach

Borrowed from improv theater, this method builds on existing ideas rather than tearing them down:

- Instead of: "This layout doesn't work on mobile."
- Try: "This layout works great on desktop. And on mobile, we could stack these cards vertically and add a swipe gesture to maintain the browsing experience."

#### Critique vs. Criticism

```
CRITICISM (unproductive):       CRITIQUE (productive):
"This looks bad"                "The contrast ratio between the
                                heading and background is 2.8:1,
                                which fails WCAG AA. Increasing
                                the heading color to #1A1A2E
                                would bring it to 7.2:1."

"I don't like the colors"      "The orange CTA button on the red
                                background creates visual tension.
                                A complementary color like blue
                                would create clearer hierarchy."

"It's confusing"               "New users may not know what this
                                icon means without a label. Adding
                                a text label below the icon would
                                improve recognition (Heuristic 6)."
```

### A/B Testing Basics

A/B testing compares two design variants to determine which performs better against a defined metric.

**Core Concepts:**
- **Control (A):** The existing design
- **Variant (B):** The proposed change
- **Metric:** What you are measuring (click rate, conversion, time on task)
- **Statistical significance:** Confidence that the result is not due to chance (typically p < 0.05)
- **Sample size:** Enough users to detect meaningful differences

**When to A/B Test:**
- Headline or copy changes
- CTA button color, size, or placement
- Layout variations (one column vs. two column)
- Form field ordering
- Pricing page structures

**When NOT to A/B Test:**
- Accessibility improvements (just fix them)
- Obvious usability bugs (just fix them)
- Brand guidelines (not negotiable)
- Low-traffic pages (not enough data for significance)

```
A/B TEST EXAMPLE:

Variant A (Control):           Variant B:
+---------------------+        +---------------------+
| Sign Up Free        |        | Start Your Free     |
| [Create Account]    |        | Trial Today         |
|                     |        | [Get Started ->]    |
+---------------------+        +---------------------+

Metric: Sign-up conversion rate
Result: Variant B +12% conversion (p = 0.03)
Winner: Variant B
```

### Usability Testing Methods

#### Moderated Testing
A facilitator guides the participant through tasks in real-time.

**Best for:** Complex flows, early prototypes, exploring "why" behind behavior.
**Format:** 1-on-1 sessions, 30-60 minutes, 5-8 participants.
**Strength:** Can ask follow-up questions, observe body language.

#### Unmoderated Testing
Participants complete tasks independently, recorded for later analysis.

**Best for:** Validating specific tasks, larger sample sizes, geographically distributed users.
**Tools:** UserTesting, Maze, Lookback.
**Strength:** Faster, cheaper, eliminates facilitator bias.

#### 5-Second Test
Show a design for 5 seconds, then ask what they remember.

**Best for:** Testing first impressions, visual hierarchy, brand perception.
**Questions after exposure:**
- What is this page about?
- What do you remember seeing?
- What would you click first?
- What is the main action this page wants you to take?

#### Card Sorting
Participants organize content into groups that make sense to them.

**Best for:** Information architecture, navigation structure, category naming.
**Types:** Open sort (users create categories), closed sort (predefined categories), hybrid (mix of both).

### Analytics-Informed Design Decisions

Quantitative data complements qualitative usability insights.

**Key Metrics for Design Evaluation:**
- **Bounce rate** — High bounce on a landing page suggests the content or design does not match user expectations
- **Time on page** — Very short suggests lack of engagement; very long may suggest confusion
- **Click-through rate (CTR)** — Measures effectiveness of CTAs and links
- **Scroll depth** — How far users scroll; content below the fold may go unseen
- **Task completion rate** — Percentage of users who complete a defined flow
- **Error rate** — How often users encounter form errors or dead ends
- **Heatmaps** — Visual representation of where users click, move, and scroll

**Example:** High bounce rate suggests content-expectation mismatch. Low scroll depth means key content needs to move up. High form abandonment at step 3 signals too many fields or confusing inputs.

### Common Design Anti-Patterns

**1. Mystery Meat Navigation**
Icons without labels. Users cannot tell what buttons do without hovering (which does not work on mobile).

**2. Infinite Scroll Without Context**
No way to know how much content remains, no way to return to a specific position, and footer content becomes unreachable.

**3. Modal Overload**
Opening modals on page load, stacking modals, or using modals for content that should be a page.

**4. Dark Patterns**
Manipulative design that tricks users: pre-checked newsletter signups, difficult unsubscribe flows, "confirmshaming" ("No thanks, I don't like saving money").

**5. Carousel Blindness**
Auto-rotating carousels that users ignore. Studies consistently show that only the first slide gets significant engagement.

**6. Hamburger Menu on Desktop**
Hiding primary navigation behind a hamburger icon on desktop where there is ample space for visible navigation.

**7. Zombie Scroll**
Extremely long pages with no clear sections, visual breaks, or navigation aids. Users lose context and disengage.

**8. Click Here Syndrome**
Links that say "Click here" or "Learn more" without context. Bad for accessibility (screen readers read links out of context) and bad for scannability.

**9. CAPTCHA Overuse**
Adding CAPTCHA to every form when invisible reCAPTCHA or honeypot techniques would suffice.

**10. Notification Fatigue**
Requesting push notification permission on first visit or showing too many in-app alerts.

---

## Practical Examples

### Heuristic Evaluation Template

Use this table format when conducting evaluations:

```
| # | Heuristic        | Issue Description               | Severity | Location       | Recommendation           |
|---|------------------|---------------------------------|----------|----------------|--------------------------|
| 1 | System Status    | No loading indicator on         | 3        | Projects page  | Add skeleton loader      |
|   |                  | project list fetch              |          |                | with shimmer animation   |
| 2 | Error Prevention | Contact form submits with       | 2        | Contact page   | Add required attribute   |
|   |                  | empty required fields           |          |                | and inline validation    |
| 3 | Consistency      | Some section headers use        | 1        | Multiple pages | Standardize to           |
|   |                  | different font weights          |          |                | SectionHeader component  |
| 4 | Recognition      | Social icons have no            | 2        | Footer         | Add aria-labels and      |
|   |                  | labels or tooltips              |          |                | visible tooltips         |
```

### Self-Evaluation Walkthrough for a Portfolio

Walk through your own site as a hiring manager. At each step, check:

```
Step 1: Land on homepage     -> Clear who you are? (H2) Next step obvious? (H6)
Step 2: Find experience      -> Navigation clear? (H4) Found in <3 sec? (H7)
Step 3: Assess skills        -> Scannable? (H8) Evidence linked? (H6)
Step 4: View a project       -> Path from skills to proof? Impact described?
Step 5: Contact              -> Easy to find? Multiple methods? Form works?
```

---

## Common Interview Questions

### 1. What are Nielsen's 10 usability heuristics?

They are: (1) Visibility of system status, (2) Match between system and real world, (3) User control and freedom, (4) Consistency and standards, (5) Error prevention, (6) Recognition rather than recall, (7) Flexibility and efficiency of use, (8) Aesthetic and minimalist design, (9) Help users recognize, diagnose, and recover from errors, (10) Help and documentation. Each describes a principle for usable interfaces. I would apply them by conducting a heuristic evaluation — systematically walking through an interface and noting where each principle is violated, rating severity, and recommending fixes.

### 2. How would you conduct a usability test?

I would define the goals (what questions to answer), recruit 5-8 representative users, prepare 3-5 realistic tasks, and choose a format (moderated for early exploration, unmoderated for validation at scale). During the session, I observe without leading — I ask users to think aloud but avoid hinting at solutions. Afterward, I analyze patterns across participants, focusing on where multiple users struggled with the same task. I present findings with severity ratings, video clips of key moments, and specific recommendations.

### 3. What is the difference between a heuristic evaluation and a usability test?

A heuristic evaluation is an expert inspection — trained evaluators examine the interface against established principles. It is fast, cheap, and catches many issues but can miss problems that only real users encounter. A usability test observes actual users performing real tasks. It reveals unexpected behaviors, emotional reactions, and workflow issues that experts might not predict. The ideal approach uses both: heuristic evaluation first (to catch obvious issues cheaply), then usability testing (to validate with real users).

### 4. How do you give design feedback constructively?

I use the "I like / I wish / What if" framework. I start with what is working well (building trust), then offer specific suggestions with reasoning (not vague opinions), and finally propose creative alternatives. I always reference specific UI elements, cite heuristics or accessibility guidelines when relevant, and suggest solutions alongside problems. I avoid subjective statements like "I don't like it" and instead say "The contrast ratio is below WCAG AA standards" or "Users may not find this CTA because it sits below the fold."

### 5. When would you use A/B testing vs. usability testing?

A/B testing answers "which design performs better" quantitatively — it is best for optimizing specific metrics (conversion rate, click-through) when you have enough traffic for statistical significance. Usability testing answers "why users behave this way" qualitatively — it is best for understanding user mental models, uncovering confusion, and testing early concepts. Use usability testing during design exploration and A/B testing during optimization. They complement each other: usability testing generates hypotheses, A/B testing validates them.

### 6. What are common design anti-patterns you look for?

Mystery meat navigation (icons without labels), dark patterns (manipulative UI), modal overload (too many dialogs), carousel blindness (auto-rotating ignored content), hamburger menus on desktop (hiding visible space), zombie scroll (endless pages without structure), and notification fatigue (too many interruptions). I look for violations of user control (no undo, no cancel), inconsistency (different patterns for the same action), and poor error handling (cryptic messages, no recovery path).

### 7. How would you evaluate whether a redesign is successful?

Define success metrics before launching: task completion rate, time on task, error rate, satisfaction scores (SUS or NPS), and business metrics (conversion, retention). Measure the baseline on the old design, then measure the same metrics on the new design with comparable user groups. Use both quantitative data (analytics, A/B tests) and qualitative data (usability tests, surveys). A redesign is successful when it measurably improves the target metrics without degrading others. Allow enough time — redesigns often see a temporary dip due to change aversion before improvements stabilize.

### 8. What is progressive disclosure and when should you use it?

Progressive disclosure is the practice of showing only the essential information initially and revealing details on demand. It reduces cognitive load by not overwhelming users with all options at once. Use it for complex settings pages (basic vs. advanced), long forms (multi-step wizards), dashboard data (summary with drill-down), and help content (tooltips that expand into full documentation). The key is ensuring users can easily discover and access the hidden information — it should feel like a natural depth, not like hidden features.

---

## Applying to Your Portfolio

### Self-Heuristic Evaluation

Conduct a heuristic evaluation of your own portfolio site against each of Nielsen's 10 heuristics:

1. **System Status** — Does your site show loading states? Do animations provide feedback? When the language changes, is there a visible indicator?
2. **Real World Match** — Is your navigation labeled in terms your audience understands? Are icons intuitive?
3. **User Control** — Can visitors easily navigate back? Does the language selector work in both directions?
4. **Consistency** — Are all buttons styled consistently? Do all section headers follow the same pattern?
5. **Error Prevention** — If you have a contact form, does it validate before submission?
6. **Recognition** — Is your navigation visible at all times? Can users see where they are on the page?
7. **Flexibility** — Do keyboard users have access to all functionality? Is there a way to jump to sections?
8. **Minimalism** — Is every element earning its place? Could anything be removed without losing meaning?
9. **Error Recovery** — If someone navigates to a non-existent page, is the 404 helpful?
10. **Documentation** — Do complex interactions have contextual help?

### Applying Critique Frameworks

Use the "I like / I wish / What if" framework on your own site monthly:

- **I like** that the page transitions are smooth and the theme toggle is accessible.
- **I wish** the mobile experience had better tap targets on the navigation items.
- **What if** there were a mini case study for each project card showing impact metrics?

### 5-Second Test Your Own Homepage

Show your portfolio homepage to a friend for 5 seconds, then ask:
- What does this person do?
- What stood out most?
- What would you click first?
- How would you describe the vibe or brand?

If the answers do not match your intent, adjust the visual hierarchy.

### Analytics Integration

If you add analytics to your portfolio (Plausible, Umami, or similar privacy-respecting tools):
- Track which sections get the most scroll depth
- Monitor which project cards get clicked most
- Check if the language toggle is used
- Identify your most common entry pages
- Measure time on page to gauge engagement

Use these insights to refine layout decisions: move high-value content higher, reduce friction on popular paths, and simplify underperforming sections.

---

## Quick Reference

```
NIELSEN'S 10 HEURISTICS (SHORTHAND)
=====================================
 1. Visibility      - Show system status
 2. Real World      - Speak the user's language
 3. Control         - Undo, cancel, escape
 4. Consistency     - Same patterns everywhere
 5. Prevention      - Prevent errors before they happen
 6. Recognition     - Show, don't make users remember
 7. Flexibility     - Shortcuts for experts
 8. Minimalism      - Only essential information
 9. Error Recovery  - Clear, helpful error messages
10. Help            - Contextual documentation

SEVERITY SCALE
===============
0 = Not a problem
1 = Cosmetic
2 = Minor
3 = Major
4 = Catastrophe

CRITIQUE FRAMEWORK
====================
"I like..."     -> What works well
"I wish..."     -> What could improve
"What if..."    -> Creative possibilities

USABILITY TEST QUICK GUIDE
============================
Participants:    5-8 users
Tasks:           3-5 realistic scenarios
Duration:        30-60 min (moderated)
Key rule:        Observe, don't lead
Analysis:        Patterns across users, not individual quirks

A/B TEST REQUIREMENTS
======================
[ ] Clear hypothesis
[ ] Single variable changed
[ ] Defined success metric
[ ] Sufficient sample size
[ ] Statistical significance (p < 0.05)
[ ] Run for full business cycle (min 1-2 weeks)

ANTI-PATTERNS TO WATCH FOR
============================
x  Mystery meat navigation (icons without labels)
x  Dark patterns (manipulative UI)
x  Modal overload
x  Carousel blindness
x  Hamburger menu on desktop
x  "Click here" link text
x  No loading/empty/error states
x  Notification fatigue
```
