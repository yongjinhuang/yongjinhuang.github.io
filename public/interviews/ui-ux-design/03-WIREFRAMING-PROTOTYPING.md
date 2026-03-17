# Wireframing & Prototyping

## Overview

Wireframing and prototyping are the processes of translating ideas into tangible, testable artifacts before investing in full development. They bridge the gap between abstract concepts (research findings, IA decisions) and the final built product. For developers, these skills are doubly valuable: you understand both the design intent and the implementation constraints, making you uniquely effective at creating prototypes that are realistic and buildable.

This guide covers the full fidelity spectrum from paper sketches to interactive prototypes, the tools of the trade, best practices for testing with wireframes, and developer-friendly workflows that leverage your coding skills as a prototyping superpower. Whether you are working with a design team or building your own portfolio, understanding wireframing and prototyping will make you faster, more deliberate, and less likely to build the wrong thing.

---

## Core Concepts

### The Fidelity Spectrum

Wireframes and prototypes exist on a spectrum from low to high fidelity. Each level serves a different purpose and is appropriate at different stages.

```
FIDELITY SPECTRUM

  LOW-FI            MID-FI             HI-FI
  (Sketch)          (Structured)       (Polished)
    |                  |                  |
    v                  v                  v
+----------+     +----------+      +----------+
| ________ |     | [Logo]   |      | [Logo]   |
| ________ |     |          |      | Beautiful |
| [  btn ] |     | Heading  |      | Hero w/   |
| ________ |     |          |      | gradient  |
|   ____   |     | [  CTA ] |      |          |
+----------+     +----------+      | [Get     |
                                   |  Started]|
                                   +----------+
  Paper/            Grayscale         Real colors,
  whiteboard        digital boxes     typography,
                    with labels       imagery

  WHEN:             WHEN:             WHEN:
  Early ideas       Layout            Stakeholder
  Brainstorming     decisions         approval
  Team alignment    User testing      Usability test
  Quick iteration   Dev handoff       Final review

  TIME:             TIME:             TIME:
  Minutes           Hours             Days
```

### Low-Fidelity Wireframes

Lo-fi wireframes are rough sketches that communicate layout and content priority without any visual design detail. They use boxes, lines, and labels.

**Characteristics:**
- Black and white (or pencil on paper)
- No real content -- placeholder text and boxes
- No typography, colors, or imagery decisions
- Focus entirely on layout and hierarchy
- Fast to create, easy to discard

**When to use lo-fi:**
- You are exploring multiple layout approaches
- You need to align with a team or stakeholder quickly
- You are working through a complex interaction before committing
- You want user feedback on structure, not aesthetics

**Paper prototyping:** The simplest form of lo-fi wireframing. Draw screens on paper, cut them out, and simulate interactions by swapping papers in front of a user. This is surprisingly effective for testing navigation and flow.

```
PAPER PROTOTYPE EXAMPLE: Portfolio Homepage

+------------------------------------------+
|  [Logo]            [Nav] [Nav] [Nav] [X]  |
|                                           |
|  ~~~~~~~~~~~~~~~~~~~~~~~~                 |
|  ~~~~~~~~~~~~~~~~~~~~~~~~                 |
|  ~~~~~~~~                                 |
|                                           |
|           [  Button  ]                    |
|                                           |
|  ---  ---  ---                            |
|  | |  | |  | |   <-- Project cards        |
|  | |  | |  | |                            |
|  ---  ---  ---                            |
|                                           |
|  ---  ---  ---                            |
|  | |  | |  | |                            |
|  | |  | |  | |                            |
|  ---  ---  ---                            |
|                                           |
|  [Footer links]        [Social icons]     |
+------------------------------------------+
```

### Mid-Fidelity Wireframes

Mid-fi wireframes add structure and specificity to lo-fi sketches. They are typically created digitally and include real (or realistic) labels, defined spacing, and clearer component boundaries.

**Characteristics:**
- Grayscale or minimal color (sometimes a single accent color)
- Real navigation labels and section headings
- Defined grid and spacing
- Placeholder images shown as gray boxes with dimensions
- Component boundaries are clear (cards, buttons, inputs)
- No final typography or colors

**When to use mid-fi:**
- Layout decisions are settling and you need to formalize them
- You are creating developer handoff documentation
- You are testing with users to validate layout and content priority
- You need to communicate with stakeholders who struggle with lo-fi abstraction

```
MID-FI WIREFRAME: Portfolio Homepage

+--------------------------------------------------+
|  YJ Huang     Home  Projects  About  Contact  EN |
+--------------------------------------------------+
|                                                    |
|  Yongjin Huang                                    |
|  Full-Stack Developer                              |
|                                                    |
|  I build performant web applications with          |
|  modern JavaScript and a focus on user             |
|  experience.                                       |
|                                                    |
|  [ View Projects ]    [ Contact Me ]               |
|                                                    |
+--------------------------------------------------+
|                                                    |
|  Featured Projects                                 |
|                                                    |
|  +----------------+  +----------------+            |
|  | [240x160 img]  |  | [240x160 img]  |           |
|  | Project Title  |  | Project Title  |            |
|  | React, Node.js |  | Next.js, TS    |            |
|  | Brief desc...  |  | Brief desc...  |            |
|  +----------------+  +----------------+            |
|                                                    |
|  +----------------+  +----------------+            |
|  | [240x160 img]  |  | [240x160 img]  |           |
|  | Project Title  |  | Project Title  |            |
|  | Python, AWS    |  | React Native   |            |
|  | Brief desc...  |  | Brief desc...  |            |
|  +----------------+  +----------------+            |
|                                                    |
+--------------------------------------------------+
|                                                    |
|  Skills & Technologies                             |
|                                                    |
|  [React] [TypeScript] [Node.js] [Next.js]         |
|  [PostgreSQL] [Docker] [AWS] [Tailwind]            |
|                                                    |
+--------------------------------------------------+
```

### High-Fidelity Wireframes

Hi-fi wireframes (often called mockups at this stage) include final visual design: real colors, typography, imagery, and pixel-accurate spacing.

**Characteristics:**
- Full color palette applied
- Final typography (font families, sizes, weights)
- Real or representative imagery
- Accurate spacing and sizing
- Interactive states defined (hover, active, disabled)
- Closely resembles the final product

**When to use hi-fi:**
- Visual design decisions need stakeholder approval
- You are conducting usability tests where aesthetics might influence behavior
- You are creating detailed developer handoff specifications
- You are building a design system or component library

### Interactive Prototypes

Interactive prototypes add behavior to static wireframes. Users can click, scroll, and navigate as if using a real product.

**Levels of interactivity:**

```
STATIC            CLICKABLE          FUNCTIONAL
MOCKUP            PROTOTYPE          PROTOTYPE
  |                  |                  |
  v                  v                  v
  Images only        Linked screens     Real data,
  No clicking        Click hotspots     real logic,
  Presentation       Simulated flow     coded behavior
  only               Fixed paths        Dynamic

  Figma export       Figma prototype    Next.js +
  PDF                InVision           Tailwind
  Screenshot         Marvel             Framer Motion
```

### Digital Wireframing Tools

| Tool        | Fidelity | Collaboration | Learning Curve | Best For                     |
|-------------|----------|---------------|----------------|------------------------------|
| Paper       | Lo-fi    | In-person     | None           | Initial brainstorming        |
| Balsamiq    | Lo-fi    | Moderate      | Low            | Quick wireframes             |
| Whimsical   | Lo-fi    | High          | Low            | Flowcharts + wireframes      |
| Figma       | All      | Excellent     | Medium         | Full design workflow         |
| Sketch      | Mid-Hi   | Moderate      | Medium         | Mac-only design              |
| Adobe XD    | Mid-Hi   | Moderate      | Medium         | Adobe ecosystem              |
| Framer      | Hi-fi    | High          | High           | Interactive prototypes       |
| Code (HTML) | All      | Git-based     | High (varies)  | Developer prototyping        |

**Figma** has become the industry standard for several reasons:
- Browser-based, works on any OS
- Real-time multiplayer collaboration
- Free tier sufficient for most individual work
- Prototyping built in (click-through flows, animations)
- Developer handoff with inspect mode
- Component library and design system support
- Plugin ecosystem (content generators, accessibility checks)

### Prototype Fidelity: Choosing the Right Level

```
DECISION MATRIX: What fidelity should I use?

Question                                    Lo  Mid  Hi
-------------------------------------------------
"Which layout approach works better?"       X
"Does this navigation structure make        X    X
 sense to users?"
"Can users find the contact page?"          X    X
"Does the visual hierarchy guide the             X    X
 user's eye correctly?"
"Do users trust this site enough to                   X
 submit their information?"
"Is the interaction micro-animation                   X
 delightful or distracting?"
"Can we ship this to production?"                     X
```

**Rule of thumb:** Use the lowest fidelity that answers your current question. Higher fidelity takes longer to create and harder to throw away.

---

## Practical Examples

### Example 1: Paper Prototyping a Portfolio Redesign

**Materials needed:** Paper, pen, scissors, a willing participant.

**Process:**

1. **Draw screens on paper** (one per sheet):
   - Homepage
   - Projects page
   - Individual project page
   - About page
   - Contact page

2. **Create a task script:**
   - "You received a link to this developer's portfolio. Find their most impressive project."
   - "You want to hire this person. Find a way to contact them."
   - "You want to know what technologies they work with."

3. **Simulate the interface:**
   - Lay the homepage in front of the participant
   - When they "tap" a navigation item, swap the paper to that screen
   - Observe where they hesitate, what they tap first, what confuses them

4. **Record observations** (not outcomes):
   - "User looked at nav for 3 seconds before clicking Projects"
   - "User tried to click the project image but nothing happened"
   - "User scrolled past skills section without reading it"

**This takes 30 minutes and costs nothing.** It will reveal major structural problems before you write a single line of code.

### Example 2: Developer-Friendly Prototyping with Code

As a developer, you have a superpower: you can prototype directly in code. This is faster than learning Figma for many developers, and it produces artifacts that can evolve into the real product.

**Rapid Tailwind prototype approach:**

```tsx
// Prototype a portfolio homepage in 30 minutes
// Focus on layout and content hierarchy, not polish

export default function PrototypeHome() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* NAV: Fixed, minimal */}
      <nav className="fixed top-0 z-50 flex w-full items-center
                      justify-between border-b bg-white/80 px-8 py-4
                      backdrop-blur dark:border-gray-800
                      dark:bg-gray-950/80">
        <span className="text-lg font-bold">YJ</span>
        <div className="flex gap-6 text-sm">
          <a href="#projects">Projects</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      {/* HERO: Name, title, one-liner, CTA */}
      <section className="flex min-h-screen flex-col items-center
                          justify-center px-8 text-center">
        <h1 className="text-6xl font-bold tracking-tight">
          Yongjin Huang
        </h1>
        <p className="mt-4 text-xl text-gray-500">
          Full-Stack Developer
        </p>
        <p className="mt-2 max-w-md text-gray-400">
          Building performant web applications with modern
          JavaScript and a focus on user experience.
        </p>
        <div className="mt-8 flex gap-4">
          <a href="#projects"
             className="rounded-full bg-blue-600 px-6 py-3
                        text-white">
            View Projects
          </a>
          <a href="#contact"
             className="rounded-full border border-gray-300 px-6
                        py-3">
            Contact Me
          </a>
        </div>
      </section>

      {/* PROJECTS: Grid of cards */}
      <section id="projects" className="px-8 py-20">
        <h2 className="mb-12 text-3xl font-bold">
          Featured Projects
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}
                 className="overflow-hidden rounded-xl border
                            dark:border-gray-800">
              {/* Placeholder image */}
              <div className="h-48 bg-gray-200 dark:bg-gray-800" />
              <div className="p-6">
                <h3 className="text-lg font-semibold">
                  Project {i}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  React, TypeScript, Node.js
                </p>
                <p className="mt-3 text-sm text-gray-400">
                  Brief description of what this project does and
                  what problem it solves.
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT: Brief bio + skills */}
      <section id="about" className="bg-gray-50 px-8 py-20
                                     dark:bg-gray-900">
        <h2 className="mb-8 text-3xl font-bold">About</h2>
        <p className="max-w-2xl text-gray-600 dark:text-gray-400">
          Two to three sentences about yourself, your background,
          and what drives your work.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {['React', 'TypeScript', 'Node.js', 'Next.js',
            'Tailwind', 'PostgreSQL'].map((skill) => (
            <span key={skill}
                  className="rounded-full bg-gray-200 px-3 py-1
                             text-sm dark:bg-gray-800">
              {skill}
            </span>
          ))}
        </div>
      </section>

      {/* CONTACT: Simple and direct */}
      <section id="contact" className="px-8 py-20">
        <h2 className="mb-8 text-3xl font-bold">Get in Touch</h2>
        <p className="text-gray-500">
          Email me at{' '}
          <a href="mailto:you@example.com"
             className="text-blue-600 underline">
            you@example.com
          </a>
        </p>
      </section>
    </div>
  )
}
```

**Why this works for developers:**
- You already know Tailwind and JSX -- zero tool-learning overhead
- The prototype runs in a browser -- stakeholders can interact with it
- Hot module reload gives you instant feedback
- The code can evolve into the real product (no throwaway work)
- Version control tracks your design iterations

### Example 3: Framer Motion for Prototype Interactions

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

// Prototype a project card with hover interaction
function ProjectCard({
  title,
  description,
  tags,
}: {
  title: string
  description: string
  tags: readonly string[]
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border
                 dark:border-gray-800"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Image area */}
      <div className="relative h-48 bg-gray-200 dark:bg-gray-800">
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center
                         justify-center bg-black/50"
            >
              <span className="rounded-full bg-white px-4 py-2
                               text-sm font-medium">
                View Project
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="p-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-blue-50 px-2 py-0.5
                         text-xs text-blue-600 dark:bg-blue-950
                         dark:text-blue-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
```

### Example 4: Responsive Wireframe Annotations

When creating wireframes, document how layouts change across breakpoints.

```
RESPONSIVE WIREFRAME: Project Grid

MOBILE (< 640px):                 TABLET (640-1024px):
+---------------------+          +----------+----------+
| +---+               |          | +------+ | +------+ |
| |img|  Title        |          | | img  | | | img  | |
| +---+  Description  |          | | Title| | | Title| |
|        [tags]       |          | +------+ | +------+ |
+---------------------+          +----------+----------+
| +---+               |          | +------+ | +------+ |
| |img|  Title        |          | | img  | | | img  | |
| +---+  Description  |          | | Title| | | Title| |
|        [tags]       |          | +------+ | +------+ |
+---------------------+          +----------+----------+

DESKTOP (> 1024px):
+----------+----------+----------+
| +------+ | +------+ | +------+ |
| | img  | | | img  | | | img  | |
| |      | | |      | | |      | |
| | Title| | | Title| | | Title| |
| | desc | | | desc | | | desc | |
| | tags | | | tags | | | tags | |
| +------+ | +------+ | +------+ |
+----------+----------+----------+
```

**Corresponding Tailwind implementation:**

```tsx
// The grid automatically handles all three breakpoints
<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {projects.map((project) => (
    <ProjectCard key={project.slug} {...project} />
  ))}
</div>
```

### Example 5: Wireframe Component Library

Build a minimal set of wireframe components for rapid prototyping:

```tsx
// Wireframe primitives for rapid prototyping
// Use these to quickly sketch layouts in code

function WireBox({
  label,
  className = '',
}: {
  label: string
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-center border-2
                  border-dashed border-gray-300 bg-gray-50
                  p-4 text-sm text-gray-400
                  dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      {label}
    </div>
  )
}

function WirePlaceholder({
  width,
  height,
  label,
}: {
  width: string
  height: string
  label?: string
}) {
  return (
    <div
      className="flex items-center justify-center bg-gray-200
                 text-xs text-gray-400 dark:bg-gray-800"
      style={{ width, height }}
    >
      {label ?? `${width} x ${height}`}
    </div>
  )
}

function WireText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-gray-200 dark:bg-gray-700"
          style={{
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  )
}

function WireButton({ label }: { label: string }) {
  return (
    <div className="inline-block rounded border-2 border-gray-400
                    px-4 py-2 text-sm text-gray-500">
      {label}
    </div>
  )
}

// Usage: quickly sketch a page layout
function WireframeHomepage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 p-8">
      <WireBox label="Navigation Bar" className="h-16" />

      <div className="space-y-4 text-center">
        <WireBox label="Hero Heading" className="mx-auto h-12 w-96" />
        <WireBox label="Subtitle" className="mx-auto h-8 w-64" />
        <div className="flex justify-center gap-4">
          <WireButton label="Primary CTA" />
          <WireButton label="Secondary CTA" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <WirePlaceholder width="100%" height="160px" label={`Project ${i}`} />
            <WireText lines={2} />
          </div>
        ))}
      </div>

      <WireBox label="Footer" className="h-24" />
    </div>
  )
}
```

---

## Common Interview Questions

### Q1: What is the difference between a wireframe and a prototype?

**Answer:** A wireframe is a static visual representation of a page's layout, content hierarchy, and structure. It shows *what* will be on the screen and *where*. A prototype adds interactivity -- it simulates *how* the interface behaves when users interact with it. Think of wireframes as blueprints and prototypes as scale models. Wireframes can exist at any fidelity (lo-fi sketches to hi-fi mockups), and prototypes can range from simple click-through sequences to fully functional coded experiences. In practice, the terms often blur: a Figma file with linked screens is both a hi-fi wireframe and a clickable prototype.

### Q2: When would you skip wireframing and go straight to code?

**Answer:** I would skip traditional wireframing and prototype in code when: (1) The design pattern is well-established and I am implementing a common layout (like a standard portfolio page). (2) I am the only designer and developer, so there is no handoff concern. (3) The technology stack makes code-based prototyping fast -- for example, with Tailwind CSS and a component library, I can sketch a layout in code as fast as in Figma. (4) The prototype needs to demonstrate responsive behavior or real interactions that are hard to simulate in static tools. However, I would still sketch on paper first for 5-10 minutes to explore layout options before committing to code. The danger of skipping wireframes entirely is premature commitment to the first idea.

### Q3: How do you decide what fidelity level to use?

**Answer:** I choose fidelity based on what question I am trying to answer. If I am exploring "should this be a single-page layout or multi-page?", lo-fi paper sketches are sufficient. If I am asking "does this layout guide the user's eye to the right content?", mid-fi grayscale wireframes work. If the question is "does this visual design build trust and feel professional?", I need hi-fi. The principle is: use the lowest fidelity that answers your current question, because higher fidelity takes longer to create and creates psychological attachment (people are reluctant to discard polished work). I also consider my audience -- stakeholders who struggle with abstraction may need mid-fi or higher to give useful feedback.

### Q4: What are the key elements every wireframe should include?

**Answer:** Every wireframe, regardless of fidelity, should communicate five things: (1) **Content priority** -- what is most important on the page, shown through size and position. (2) **Navigation** -- how the user moves between pages or sections. (3) **Content blocks** -- what types of content exist (headings, paragraphs, images, lists, forms). (4) **Calls to action** -- what the user is supposed to do on this page. (5) **Responsive considerations** -- at minimum, annotations about how the layout changes on mobile. What wireframes should NOT include (at lo-fi and mid-fi): final colors, real images, exact typography, or pixel-perfect spacing. These decisions come later and distract from structural feedback.

### Q5: How do you test with wireframes?

**Answer:** Testing with wireframes follows the same principles as usability testing, with some adaptations. First, I set expectations with participants: "This is an early sketch. It will not look like a finished product. I am testing the structure, not the appearance." Then I give task-based scenarios: "You are looking to hire a frontend developer. Find their most relevant project." I use the think-aloud protocol, asking participants to narrate their thought process. With paper prototypes, I act as the "computer" -- swapping screens when users tap. With digital wireframes in Figma, I use prototype mode for click-through testing. The key difference from testing a finished product: participants may get confused by placeholder content, so I frame each test clearly and remind them to focus on structure, not content.

### Q6: What is the role of wireframing in an Agile development process?

**Answer:** In Agile, wireframing happens in a compressed, iterative cycle rather than as a long upfront phase. Typically, wireframes are created one or two sprints ahead of development, just enough to validate the approach without over-investing. Lo-fi wireframes might be sketched during sprint planning to align the team. Mid-fi wireframes accompany user stories to give developers visual context. The key principle is "just enough design" -- create wireframes detailed enough to start development, then refine during implementation. This contrasts with Waterfall approaches where complete wireframes for every screen were delivered before any coding began. In Agile, the wireframe is a communication tool, not a contract.

### Q7: How do you handle wireframing for responsive design?

**Answer:** I wireframe for three breakpoints: mobile (320-640px), tablet (641-1024px), and desktop (1025px+). I start with mobile because it forces prioritization -- when you have limited space, you must decide what matters most. For each screen, I create three wireframe variations showing how the layout reflows. I annotate key changes: "This 3-column grid becomes a single column on mobile," "This sidebar moves below the main content on tablet." In code-based prototyping, I use Tailwind's responsive prefixes (sm:, md:, lg:) to implement this directly, which is faster than creating three separate wireframe documents. The critical thing is that responsive wireframing is not just about making things smaller -- it is about re-prioritizing content for each context.

### Q8: Compare Figma prototyping with code-based prototyping. When would you use each?

**Answer:** Figma prototyping excels when: you are collaborating with non-technical stakeholders, you need to iterate on visual design rapidly, you want to test multiple design directions quickly, or you need to hand off to other developers with design specifications. Code-based prototyping excels when: you are the developer who will build it (no handoff waste), you need to test real interactions (scroll behavior, animations, API data), the design follows established patterns and the challenge is in implementation, or you need to demonstrate responsive behavior accurately. In my workflow, I sketch on paper first, move to Figma if I need to explore visual design or collaborate with designers, and move to code when I am confident in the direction and want to test real interactions. For personal projects like a portfolio, I usually go from paper sketches directly to code prototyping with Tailwind and Framer Motion.

---

## Applying to Your Portfolio

### Developer Prototyping Workflow

Here is a practical workflow for prototyping your portfolio site:

```
1. PAPER SKETCH (15 min)
   - Draw 3 different homepage layouts
   - Show to 2 people, pick the best direction

2. CODE PROTOTYPE (1-2 hours)
   - Build the chosen layout with Tailwind
   - Use placeholder content
   - Focus on layout, not polish

3. CONTENT PASS (30 min)
   - Replace placeholders with real content
   - Adjust layout based on real content lengths

4. INTERACTION PASS (1 hour)
   - Add Framer Motion animations
   - Implement hover states, transitions
   - Test on mobile and desktop

5. USABILITY TEST (30 min)
   - Show to 3-5 people
   - Give them 2-3 tasks
   - Note issues, iterate

6. POLISH PASS (2-4 hours)
   - Apply final design tokens
   - Refine typography, spacing, colors
   - Add dark mode support
   - Performance optimization
```

### Common Wireframe Patterns for Portfolio Sites

**Pattern 1: The Full-Bleed Hero**

```
+--------------------------------------------------+
|                                                    |
|              Your Name                             |
|              Your Title                            |
|                                                    |
|         [Primary CTA]  [Secondary CTA]            |
|                                                    |
+--------------------------------------------------+
|  Section heading                                   |
|  Card  Card  Card                                  |
+--------------------------------------------------+
```

Best for: Developers who want to make a bold first impression.

**Pattern 2: The Split Hero**

```
+------------------------+-------------------------+
|                        |                          |
|  Your Name             |   [Photo or             |
|  Your Title            |    3D element or        |
|                        |    code snippet]        |
|  Short bio paragraph   |                          |
|                        |                          |
|  [CTA Button]         |                          |
+------------------------+-------------------------+
```

Best for: Developers who want to show personality alongside information.

**Pattern 3: The Minimal Card**

```
+--------------------------------------------------+
|  Name    Nav Nav Nav                          DK  |
+--------------------------------------------------+
|                                                    |
|  +----------------------------------------------+ |
|  |                                              | |
|  |   Hello, I'm [Name]                         | |
|  |   [Title] based in [Location]               | |
|  |                                              | |
|  |   [Skill] [Skill] [Skill] [Skill]          | |
|  |                                              | |
|  |   [Email]  [GitHub]  [LinkedIn]             | |
|  |                                              | |
|  +----------------------------------------------+ |
|                                                    |
+--------------------------------------------------+
```

Best for: Developers who want maximum clarity and minimalism.

### Quick Prototype Starter with Next.js

```tsx
// Create a rapid prototype page at app/prototype/page.tsx
// Use this to test layouts before integrating into your real site

import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
}

export default function Prototype() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      {/* Test different hero layouts here */}
      <motion.section
        className="flex min-h-[80vh] flex-col items-center
                   justify-center px-8 text-center"
        {...fadeUp}
      >
        <h1 className="text-5xl font-bold tracking-tight
                       sm:text-7xl">
          Your Name
        </h1>
        <p className="mt-4 text-lg text-gray-500 sm:text-xl">
          Full-Stack Developer
        </p>
        <motion.div
          className="mt-8 flex gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button className="rounded-full bg-gray-900 px-6 py-3
                             text-sm text-white dark:bg-white
                             dark:text-gray-900">
            View Work
          </button>
          <button className="rounded-full border px-6 py-3 text-sm">
            About Me
          </button>
        </motion.div>
      </motion.section>

      {/* Test project grid layouts here */}
      <section className="mx-auto max-w-6xl px-8 py-20">
        <h2 className="mb-12 text-2xl font-bold">Projects</h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="group cursor-pointer overflow-hidden
                         rounded-xl border dark:border-gray-800"
              whileHover={{ y: -4 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="h-48 bg-gradient-to-br from-gray-100
                              to-gray-200 transition-transform
                              group-hover:scale-105
                              dark:from-gray-800 dark:to-gray-900" />
              <div className="p-5">
                <h3 className="font-semibold">Project {i + 1}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Brief description goes here
                </p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5
                                   text-xs dark:bg-gray-800">
                    React
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5
                                   text-xs dark:bg-gray-800">
                    TypeScript
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  )
}
```

---

## Quick Reference

```
WIREFRAMING & PROTOTYPING CHEAT SHEET
========================================

FIDELITY LEVELS:
  Lo-fi   --> Paper, sketches, boxes and lines
              Use for: exploring ideas, early feedback
              Time: minutes

  Mid-fi  --> Grayscale digital, real labels, defined layout
              Use for: user testing, layout decisions, dev handoff
              Time: hours

  Hi-fi   --> Full visual design, real content, pixel-accurate
              Use for: stakeholder approval, visual usability tests
              Time: days

PROTOTYPE TYPES:
  Static     --> Images only (screenshots, PDFs)
  Clickable  --> Linked screens (Figma prototype, InVision)
  Functional --> Real code, real interactions (Next.js + Tailwind)

KEY TOOLS:
  Paper       --> Free, fastest, zero learning curve
  Balsamiq    --> Quick lo-fi digital wireframes
  Figma       --> Industry standard, all fidelity levels
  Code        --> Developer superpower, evolves into product

WIREFRAME CHECKLIST:
  [ ] Content priority is clear (size = importance)
  [ ] Navigation is visible and labeled
  [ ] CTAs are obvious
  [ ] Content blocks are defined
  [ ] Responsive breakpoints annotated
  [ ] No visual design decisions (at lo/mid-fi)

TESTING WITH WIREFRAMES:
  1. Set expectations ("this is an early sketch")
  2. Give task-based scenarios (not instructions)
  3. Use think-aloud protocol
  4. Test with 5 users
  5. Focus on structure, not aesthetics

DEVELOPER PROTOTYPING WORKFLOW:
  1. Paper sketch (15 min)    --> Explore 3+ layouts
  2. Code prototype (1-2 hr)  --> Build chosen layout
  3. Content pass (30 min)    --> Real text and images
  4. Interaction pass (1 hr)  --> Animations and states
  5. Usability test (30 min)  --> 5 people, 3 tasks
  6. Polish pass (2-4 hr)     --> Final design tokens

COMMON MISTAKES:
  - Starting at too high a fidelity (hard to discard)
  - Skipping paper sketches (first idea bias)
  - Testing visual design with lo-fi wireframes
  - Not testing at all ("it looks good to me")
  - Pixel-perfecting wireframes (defeats the purpose)
  - Ignoring mobile layouts until development

GOLDEN RULE:
  Use the LOWEST fidelity that answers your
  CURRENT question. Save polish for later.
```
