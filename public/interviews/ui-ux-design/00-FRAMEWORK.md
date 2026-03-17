# UI/UX Design Framework

## Overview

This series covers UI/UX design from a **developer's working perspective**. It is not a design school curriculum. It is a practical guide for frontend and fullstack engineers who want to make better UI decisions, communicate effectively with designers, and hold their own in design-related interview questions.

The content serves two purposes:

1. **Interview preparation** -- understand design thinking well enough to discuss it with confidence in product-focused or frontend interviews.
2. **Practical application** -- apply these concepts directly to your own projects, portfolio sites, and day-to-day work.

Topics are ordered to follow the natural design workflow:

**Research --> Structure --> Visual Foundations --> Patterns --> Interaction --> Systems --> Delivery --> Evaluation**

This ordering is intentional. Each stage builds on the previous one. You research before you structure, you establish visual foundations before you define patterns, and you evaluate at the end to close the loop. Each file stands alone as a topic reference, but reading them in order gives you the full picture of how design actually works.

---

## Table of Contents

This series covers 15 essential UI/UX design topics. Each guide follows a consistent structure: Overview, Core Concepts, Common Interview Questions, Applying to Your Portfolio, Gotchas, and a Quick Reference cheat sheet.

| # | Topic | File | Key Areas |
|---|-------|------|-----------|
| 01 | [User Research & Discovery](./01-USER-RESEARCH.md) | `01-USER-RESEARCH.md` | Personas, interviews, competitive analysis, empathy maps |
| 02 | [Information Architecture](./02-INFORMATION-ARCHITECTURE.md) | `02-INFORMATION-ARCHITECTURE.md` | Content hierarchy, sitemaps, card sorting, navigation models |
| 03 | [Wireframing & Prototyping](./03-WIREFRAMING-PROTOTYPING.md) | `03-WIREFRAMING-PROTOTYPING.md` | Lo-fi to hi-fi, tools, testing with wireframes |
| 04 | [Visual Hierarchy & Layout](./04-VISUAL-HIERARCHY-LAYOUT.md) | `04-VISUAL-HIERARCHY-LAYOUT.md` | Gestalt principles, grids, spacing, alignment, whitespace |
| 05 | [Typography](./05-TYPOGRAPHY.md) | `05-TYPOGRAPHY.md` | Font selection, type scales, pairing, readability, web fonts |
| 06 | [Color Systems](./06-COLOR-SYSTEMS.md) | `06-COLOR-SYSTEMS.md` | Palettes, contrast, accessibility, color psychology |
| 07 | [Common UI Patterns](./07-UI-PATTERNS.md) | `07-UI-PATTERNS.md` | Cards, modals, toasts, empty states, loading, navigation |
| 08 | [Forms & Input Design](./08-FORMS-INPUT-DESIGN.md) | `08-FORMS-INPUT-DESIGN.md` | Validation UX, error states, progressive disclosure |
| 09 | [Animation & Micro-interactions](./09-ANIMATION-MICROINTERACTIONS.md) | `09-ANIMATION-MICROINTERACTIONS.md` | Purpose-driven motion, timing, easing, Framer Motion |
| 10 | [Responsive & Adaptive Design](./10-RESPONSIVE-DESIGN.md) | `10-RESPONSIVE-DESIGN.md` | Mobile-first, breakpoints, fluid design, touch targets |
| 11 | [Design Systems & Tokens](./11-DESIGN-SYSTEMS.md) | `11-DESIGN-SYSTEMS.md` | Design tokens, component libraries, Figma, Storybook |
| 12 | [Accessibility (Design Perspective)](./12-ACCESSIBILITY-DESIGN.md) | `12-ACCESSIBILITY-DESIGN.md` | WCAG, inclusive design, testing, screen reader considerations |
| 13 | [Dark Mode & Theming](./13-DARK-MODE-THEMING.md) | `13-DARK-MODE-THEMING.md` | Theme architecture, color tokens, contrast across themes |
| 14 | [Design Tools & Dev Handoff](./14-DESIGN-TOOLS-HANDOFF.md) | `14-DESIGN-TOOLS-HANDOFF.md` | Figma workflow, design-to-code, collaboration |
| 15 | [Design Critique & Heuristic Evaluation](./15-DESIGN-CRITIQUE.md) | `15-DESIGN-CRITIQUE.md` | Nielsen's heuristics, evaluation methods, improving designs |

---

## Core Concepts

### The Design Thinking Process

Design Thinking is the most widely used framework for approaching design problems. It has five stages, and they are not strictly linear -- you will loop back frequently.

**1. Empathize**
Understand the people you are designing for. Talk to users. Observe how they use existing solutions. Identify pain points. This is where personas, interviews, and empathy maps live (covered in Topic 01).

**2. Define**
Synthesize your research into a clear problem statement. "Users need a way to [goal] because [insight]." A well-defined problem is half-solved. This stage produces information architecture and content strategy (Topics 01-02).

**3. Ideate**
Generate many possible solutions. Sketch, brainstorm, explore alternatives. Do not commit to the first idea. Wireframing lives here (Topic 03). The goal is breadth before depth.

**4. Prototype**
Build something tangible to test. This ranges from paper sketches to interactive Figma prototypes. The key is speed -- build just enough to validate an idea, not a polished product (Topics 03, 14).

**5. Test**
Put the prototype in front of real users. Watch what they do, not what they say. Gather feedback. Iterate. Go back to any previous stage as needed (Topic 15).

The most important thing to internalize: **design is iterative**. You do not finish one stage and move to the next forever. You loop. You discover in testing that your information architecture was wrong, so you go back and restructure. This is normal and expected.

### Why Developers Should Understand Design

You do not need to become a designer. But understanding design makes you significantly more effective as an engineer.

**Better communication with designers.** When a designer hands you a mockup with 8px spacing between elements and 16px below sections, you understand why. You can ask the right questions: "Should this follow the 8-point grid?" instead of "Why is this 8 and not 10?" You speak their language.

**Better UI decisions when there is no designer.** Startups, side projects, open source work, personal portfolios -- most of the code you write does not have a designer attached. Knowing the basics means the difference between "it works but looks off" and "it works and feels right."

**Fewer back-and-forth cycles.** When you understand spacing systems, color tokens, and component patterns, you implement designs correctly the first time. You catch inconsistencies before they ship. Designers trust you more.

**Career growth.** Senior frontend engineers are expected to have opinions about UX. Staff engineers participate in design reviews. Understanding design thinking is not optional at higher levels -- it is a core competency.

**Interview performance.** Product-focused companies ask design questions in frontend interviews. "How would you design the UI for X?" is a common prompt. Having a vocabulary and framework for answering these questions sets you apart.

### The Design Workflow

The 15 topics in this series map to a natural workflow. Here is how they connect:

```
RESEARCH PHASE
  01 User Research & Discovery
      |
      v
STRUCTURE PHASE
  02 Information Architecture
  03 Wireframing & Prototyping
      |
      v
VISUAL FOUNDATIONS PHASE
  04 Visual Hierarchy & Layout
  05 Typography
  06 Color Systems
      |
      v
PATTERNS PHASE
  07 Common UI Patterns
  08 Forms & Input Design
      |
      v
INTERACTION PHASE
  09 Animation & Micro-interactions
  10 Responsive & Adaptive Design
      |
      v
SYSTEMS PHASE
  11 Design Systems & Tokens
  12 Accessibility (Design Perspective)
  13 Dark Mode & Theming
      |
      v
DELIVERY PHASE
  14 Design Tools & Dev Handoff
      |
      v
EVALUATION PHASE
  15 Design Critique & Heuristic Evaluation
      |
      v
  (Loop back to any phase as needed)
```

This is not a rigid waterfall. In practice, you jump between phases constantly. But understanding the flow helps you see where each topic fits in the bigger picture.

---

## How to Use This Series

### For Interview Prep

If you have limited time and need to prepare for design-related interview questions:

1. **Start here** -- read the Core Concepts section above to build your vocabulary.
2. **Focus on the "Common Interview Questions" sections** in each topic file. These cover the questions you are most likely to encounter.
3. **Prioritize these topics for interviews:**
   - Topic 04 (Visual Hierarchy) -- the most universally tested
   - Topic 06 (Color Systems) -- comes up in every accessibility discussion
   - Topic 07 (UI Patterns) -- practical knowledge interviewers love
   - Topic 12 (Accessibility) -- increasingly a hard requirement
   - Topic 15 (Design Critique) -- the meta-skill that ties everything together
4. **Practice articulating tradeoffs.** Design questions rarely have a single correct answer. Interviewers want to hear you reason through options.

### For Portfolio / Project Improvement

If you want to make your personal site or side project look and feel more polished:

1. **Start with Topics 04-06** (Visual Hierarchy, Typography, Color). These three alone will transform a mediocre UI into a clean one.
2. **Apply Topic 07** (UI Patterns) to standardize your components.
3. **Use Topic 11** (Design Systems) to set up tokens and ensure consistency.
4. **Implement Topic 13** (Dark Mode) for a polished, modern feel.
5. **Evaluate with Topic 15** (Design Critique) to identify remaining rough edges.
6. **Focus on the "Applying to Your Portfolio" sections** in each topic file. These provide concrete, actionable steps.

### Suggested Study Order

**Week 1: Foundations**
- 00 Framework (this file)
- 04 Visual Hierarchy & Layout
- 05 Typography
- 06 Color Systems

**Week 2: Structure & Patterns**
- 02 Information Architecture
- 07 Common UI Patterns
- 08 Forms & Input Design

**Week 3: Interaction & Systems**
- 09 Animation & Micro-interactions
- 10 Responsive & Adaptive Design
- 11 Design Systems & Tokens

**Week 4: Research, Access, & Polish**
- 01 User Research & Discovery
- 03 Wireframing & Prototyping
- 12 Accessibility (Design Perspective)
- 13 Dark Mode & Theming
- 14 Design Tools & Dev Handoff
- 15 Design Critique & Heuristic Evaluation

The study order differs from the topic numbering because it starts with the visual foundations that give you the fastest practical improvement, then layers in the structural and systemic knowledge.

---

## Key Principles

These principles come up again and again across all 15 topics. Internalize them.

### 1. Design is problem-solving, not decoration

Good design is not about making things pretty. It is about making things work. Every visual choice -- spacing, color, typography, animation -- should solve a user problem or support a user goal. If you cannot explain *why* a design decision was made, it is probably wrong.

### 2. Every design decision should have a reason

"I liked how it looked" is not a reason. "I used a larger font size for the heading to establish visual hierarchy and guide the user's eye to the most important content" is a reason. Practice articulating the intent behind your choices.

### 3. Consistency over novelty

Users learn patterns. When your navigation works differently on different pages, users waste cognitive energy figuring out your UI instead of accomplishing their goal. Consistency in spacing, color, typography, and interaction patterns reduces friction. Design systems exist to enforce this.

### 4. Accessibility is not optional

Roughly 15-20% of the global population has some form of disability. Accessibility is not a nice-to-have checkbox -- it is a core design requirement. If your text has insufficient contrast, your buttons are too small to tap, or your content is invisible to screen readers, your design is broken for real users.

### 5. Less is more (whitespace is your friend)

The most common mistake developers make in design is cramming too much into too little space. Whitespace is not wasted space. It is a design element that provides breathing room, establishes groupings, and directs attention. When in doubt, add more space, not more content.

### 6. Users do not read, they scan

Jakob Nielsen's research shows that users read about 20% of text on a page. Design for scanning: use clear headings, short paragraphs, bullet points, and visual hierarchy. Front-load important information. Do not bury the lead.

### 7. Design for the worst case, not the best case

Your design should work when:
- The user's name is 40 characters long
- There are zero items in a list (empty state)
- The image fails to load
- The network is slow
- The user is on a 320px-wide screen
- The user has disabled JavaScript

The happy path is easy. Handling edge cases is what separates good design from bad design.

### 8. Proximity implies relationship

Things that are close together are perceived as related. Things that are far apart are perceived as unrelated. This is one of the Gestalt principles, and it is the single most powerful layout tool you have. Group related items. Separate unrelated items. Use spacing intentionally.

---

## Quick Reference

A cheat sheet of the most important design concepts across all topics.

### The 8-Point Grid

Use multiples of 8 for all spacing and sizing: 8px, 16px, 24px, 32px, 40px, 48px. This creates consistent rhythm and alignment. Some systems use a 4-point sub-grid for smaller adjustments (4px, 8px, 12px, 16px).

### Type Scale

Use a modular scale for font sizes. A common ratio is 1.25 (Major Third):
- xs: 12px
- sm: 14px
- base: 16px
- lg: 20px
- xl: 24px
- 2xl: 30px
- 3xl: 38px

### Color Contrast Minimums (WCAG 2.1)

| Element | AA | AAA |
|---------|-----|-----|
| Normal text (< 18px) | 4.5:1 | 7:1 |
| Large text (>= 18px bold or >= 24px) | 3:1 | 4.5:1 |
| UI components & graphical objects | 3:1 | -- |

### Gestalt Principles (Top 5 for UI)

1. **Proximity** -- close items are perceived as grouped
2. **Similarity** -- items that look alike are perceived as related
3. **Continuity** -- the eye follows smooth lines and curves
4. **Closure** -- the brain fills in missing parts to see complete shapes
5. **Figure/Ground** -- the eye separates foreground from background

### Responsive Breakpoints (Common)

| Name | Width | Target |
|------|-------|--------|
| sm | 640px | Large phones |
| md | 768px | Tablets |
| lg | 1024px | Small laptops |
| xl | 1280px | Desktops |
| 2xl | 1536px | Large screens |

### Touch Target Minimums

- **iOS**: 44x44 points
- **Android (Material)**: 48x48 dp
- **WCAG 2.5.8**: 24x24 CSS pixels (AA)

### Animation Timing Guidelines

| Type | Duration | Use |
|------|----------|-----|
| Micro-interaction | 100-200ms | Button press, toggle |
| Transition | 200-300ms | Page elements, modals |
| Complex animation | 300-500ms | Page transitions, reveals |
| Attention-grab | 500-1000ms | Onboarding, celebrations |

Use ease-out for entrances (decelerating). Use ease-in for exits (accelerating). Use ease-in-out for elements that move from point A to point B.

### Nielsen's 10 Usability Heuristics

1. **Visibility of system status** -- keep users informed about what is happening
2. **Match between system and real world** -- use familiar language and concepts
3. **User control and freedom** -- provide undo, redo, and clear exit paths
4. **Consistency and standards** -- follow platform conventions
5. **Error prevention** -- prevent errors before they happen
6. **Recognition over recall** -- show options rather than requiring memory
7. **Flexibility and efficiency** -- support both novice and expert users
8. **Aesthetic and minimalist design** -- remove unnecessary information
9. **Help users recover from errors** -- clear, constructive error messages
10. **Help and documentation** -- provide searchable, task-focused help

### Design Decision Checklist

Before shipping any UI, ask yourself:

- [ ] Is the visual hierarchy clear? Can I tell what is most important at a glance?
- [ ] Is text readable? Sufficient size, contrast, and line height?
- [ ] Is spacing consistent? Am I following a spacing system?
- [ ] Does it work on mobile? Have I tested at 320px width?
- [ ] Are interactive elements obvious? Can I tell what is clickable?
- [ ] Does it handle empty states? What does the user see with no data?
- [ ] Does it handle loading states? What does the user see while waiting?
- [ ] Does it handle error states? What does the user see when something fails?
- [ ] Is it accessible? Sufficient contrast, keyboard navigable, screen reader friendly?
- [ ] Is it consistent with the rest of the application?

---

## What This Series Does Not Cover

This is a design series for developers, not a comprehensive design education. It deliberately skips:

- **Brand strategy and marketing design** -- logos, brand identity, campaign design
- **Print and physical design** -- DPI, CMYK, bleed, trim
- **Advanced UX research methods** -- diary studies, longitudinal research, statistical analysis
- **Design management** -- running a design team, design ops, design culture
- **Illustration and iconography creation** -- drawing, vector art, icon design from scratch

These are all valid and important disciplines, but they fall outside the scope of what a developer needs to know to build good UIs and work effectively with design teams.

---

*Next: [01 - User Research & Discovery](./01-USER-RESEARCH.md)*
