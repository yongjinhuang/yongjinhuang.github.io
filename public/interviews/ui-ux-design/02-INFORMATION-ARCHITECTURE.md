# Information Architecture

## Overview

Information Architecture (IA) is the structural design of shared information environments. It determines how content is organized, labeled, and connected so that users can find what they need and understand where they are. If user research tells you *who* your users are, IA tells you *how to arrange things* so those users succeed.

For developers, IA is directly relevant every time you create a navigation system, organize a file structure, design an API, or structure a database schema. For frontend developers specifically, IA decisions show up in your route structure, navigation components, breadcrumbs, and content hierarchy. A well-architected portfolio site feels effortless to browse; a poorly architected one leaves visitors lost and frustrated.

This guide covers the foundational concepts of IA -- from content hierarchy and sitemaps to card sorting, navigation models, and mental models -- with practical examples focused on web development and portfolio sites.

---

## Core Concepts

### What Is Information Architecture?

IA sits at the intersection of three circles:

```
           USERS
          /     \
         /       \
        /   IA    \
       /   lives   \
      /    here     \
     /               \
  CONTENT --------- CONTEXT
```

- **Users**: Their needs, behaviors, information-seeking habits
- **Content**: The information you have -- its volume, structure, and relationships
- **Context**: Business goals, constraints, technology, culture

IA is the practice of making these three things work together through organization, labeling, navigation, and search systems.

### The Four Systems of IA

Information architecture is composed of four interconnected systems:

```
+---------------------------+---------------------------+
|   1. ORGANIZATION         |   2. LABELING             |
|   SYSTEMS                 |   SYSTEMS                 |
|                           |                           |
|   How you categorize      |   How you name            |
|   and structure content   |   categories and links    |
|                           |                           |
|   - Alphabetical          |   - Headings              |
|   - Chronological         |   - Navigation labels     |
|   - Topical               |   - Link text             |
|   - Task-based            |   - Icon labels           |
|   - Audience-based        |   - Button text           |
+---------------------------+---------------------------+
|   3. NAVIGATION           |   4. SEARCH               |
|   SYSTEMS                 |   SYSTEMS                 |
|                           |                           |
|   How users move          |   How users find          |
|   through content         |   specific content        |
|                           |                           |
|   - Global nav            |   - Search bar            |
|   - Local nav             |   - Filters               |
|   - Breadcrumbs           |   - Autocomplete          |
|   - Sitemaps              |   - Faceted search        |
|   - Footer nav            |   - Search results page   |
+---------------------------+---------------------------+
```

### Content Hierarchy

Content hierarchy establishes parent-child relationships between pieces of information. It answers the question: "What contains what?"

**Principles of effective hierarchy:**

1. **Mutual exclusivity**: Categories should not overlap. A piece of content should have one clear home.
2. **Balanced breadth and depth**: Too broad (20 top-level items) overwhelms; too deep (5 clicks to reach content) frustrates.
3. **Progressive disclosure**: Show the minimum needed at each level, with the ability to drill deeper.

```
HIERARCHY DEPTH vs. BREADTH

Too Broad (flat):                    Too Deep (narrow):
+-+-+-+-+-+-+-+-+-+-+                +--+
| | | | | | | | | | |               |  |
+-+-+-+-+-+-+-+-+-+-+                +--+
 10 items at top level                  |
 Users cannot scan                   +--+
                                     |  |
                                     +--+
                                        |
                                     +--+
                                     |  |
                                     +--+
                                        |
                                     +--+
                                     |  |  5 clicks deep
                                     +--+  Users give up

Balanced:
+---+---+---+---+---+
| 1 | 2 | 3 | 4 | 5 |     5 top-level categories
+---+---+---+---+---+
 |       |       |
+--+   +--+   +--+
|  |   |  |   |  |         2-4 items per category
+--+   +--+   +--+
```

**The 7 plus-or-minus 2 rule**: Miller's Law suggests humans can hold about 5-9 items in working memory. Keep top-level navigation to roughly this range.

### Sitemaps

A sitemap is a visual representation of a site's structure. It shows the hierarchy of pages and how they relate to each other.

**Portfolio site sitemap example:**

```
                        [Homepage /]
                             |
          +------------------+------------------+
          |                  |                  |
     [About /about]   [Projects /projects]  [Contact /contact]
                             |
                   +---------+---------+
                   |         |         |
              [Project 1] [Project 2] [Project 3]
                   |
            [Case Study]
```

**With i18n routing (like your Next.js setup):**

```
                          [/ redirect]
                               |
                    +----------+----------+
                    |                     |
               [/en/]                [/zh/]
                    |                     |
         +----+----+----+      +----+----+----+
         |    |    |    |      |    |    |    |
       About Proj Skill Contact  About Proj Skill Contact
              |                        |
         [/en/projects/1]        [/zh/projects/1]
```

**Tips for sitemaps:**
- Start with content inventory (list everything that exists or will exist)
- Group related content using card sorting (covered below)
- Validate with users before building
- Keep living -- update as content changes

### Card Sorting

Card sorting is a research method where users organize content into groups that make sense to them. It directly informs your site's navigation and categorization.

**Open Card Sorting:**
- Users are given cards (content items) with no predefined categories
- They create their own groups and name them
- Best for: Discovering how users naturally think about your content

**Closed Card Sorting:**
- Users are given cards AND predefined categories
- They place cards into the existing categories
- Best for: Validating an existing or proposed structure

**Hybrid Card Sorting:**
- Users have predefined categories but can also create new ones
- Best for: Refining a structure while remaining open to surprises

```
OPEN SORT EXAMPLE:

Cards given:              User's groups:
+----------------+       GROUP A: "Work"         GROUP B: "About"
| React project  |       - React project         - Bio
| Node API       |       - Node API              - Education
| Bio            |       - Design system         - Skills
| Education      |
| Skills         |       GROUP C: "Connect"
| Design system  |       - Contact form
| Blog post      |       - Social links
| Contact form   |       - Blog post
| Social links   |
+----------------+
```

**Running a card sort as a developer:**
- Use free tools like OptimalSort or UXMetrics
- 15-30 participants is ideal for meaningful patterns
- Analyze results using a similarity matrix (which cards are frequently grouped together)

### Navigation Models

Navigation is how users move through your information architecture. Different structures suit different types of content.

#### Hierarchical Navigation

The most common model. Users drill down through levels.

```
  Home
   |
   +-- About
   |
   +-- Projects
   |     +-- Project A
   |     +-- Project B
   |
   +-- Contact
```

**Best for:** Sites with clear parent-child relationships. Most portfolio sites use this model.

#### Sequential Navigation

Users move through content in a defined order (like a wizard or onboarding flow).

```
  Step 1 --> Step 2 --> Step 3 --> Step 4 --> Done
  [Info]    [Skills]   [Upload]   [Review]   [Submit]
```

**Best for:** Multi-step processes, tutorials, onboarding flows.

#### Matrix Navigation

Users can move in multiple dimensions -- filtering by different attributes.

```
        Language
        |  JS  |  TS  | Python |
  ------+------+------+--------+
  Web   |  X   |  X   |        |
  ------+------+------+--------+
  API   |      |  X   |   X    |
  ------+------+------+--------+
  CLI   |      |      |   X    |
  ------+------+------+--------+
```

**Best for:** Content that can be meaningfully filtered along multiple dimensions (e-commerce, portfolios with diverse project types).

#### Hub-and-Spoke Navigation

Users always return to a central hub before navigating elsewhere. Common in mobile apps.

```
            +------+
     +----> | HOME | <----+
     |      +------+      |
     |      ^ |  ^ |      |
     v      | v  | v      v
  [About]   [Proj] [Contact]
```

**Best for:** Mobile apps, dashboards, sites where tasks are independent.

### Mental Models

A mental model is how a user *expects* something to work, based on their prior experience. Good IA aligns with users' existing mental models rather than forcing them to learn a new one.

**Example:** Users expect a portfolio site to have:
- A hero/intro section at the top
- Navigation in a top bar or hamburger menu
- Projects/work in a grid or card layout
- Contact information near the bottom or in navigation
- Social links in the header or footer

If you deviate from these expectations, you need a very good reason. Innovation in IA is risky because it forces cognitive load.

**Matching mental models in navigation labels:**

```
GOOD (matches expectations):     BAD (clever but confusing):
  - About                          - The Story
  - Projects                       - My Universe
  - Skills                         - Superpowers
  - Contact                        - Let's Vibe
```

### Labeling Systems

Labels are the words you use to represent content in navigation, headings, links, and buttons. Good labels are:

1. **Clear**: Users instantly understand what they will find
2. **Concise**: As few words as possible
3. **Consistent**: Same naming patterns throughout
4. **Familiar**: Use language your users use, not your internal jargon

**Testing labels**: The simplest test is to ask 5 people: "If you clicked this label, what would you expect to see?" If their answers match your content, the label works.

**Label consistency patterns:**

```
CONSISTENT:                    INCONSISTENT:
  - About Me                     - About Me
  - My Projects                  - Portfolio
  - My Skills                    - What I Know
  - Contact Me                   - Get In Touch

  (Pattern: "My/Me" prefix)      (No pattern, harder to scan)
```

### Taxonomies

A taxonomy is a classification system for your content. It defines the vocabulary and relationships between categories.

**Flat taxonomy** (tags):
```
Project A: [React, TypeScript, Frontend, SaaS]
Project B: [Node.js, PostgreSQL, Backend, API]
Project C: [React, Node.js, Full-stack, E-commerce]
```

**Hierarchical taxonomy:**
```
Technology
  +-- Frontend
  |     +-- React
  |     +-- Vue
  |     +-- CSS
  +-- Backend
  |     +-- Node.js
  |     +-- Python
  +-- Database
        +-- PostgreSQL
        +-- MongoDB
```

**Faceted taxonomy** (multiple independent dimensions):
```
Project can be classified by:
  TYPE:       [Web App, API, Library, CLI Tool]
  TECHNOLOGY: [React, Node.js, Python, Go]
  ROLE:       [Solo, Team Lead, Contributor]
  YEAR:       [2023, 2024, 2025]
```

Faceted taxonomies are powerful for portfolio sites because they let visitors filter projects by what matters to them.

### IA for Websites vs. Apps

| Aspect           | Websites                        | Apps                            |
|------------------|---------------------------------|---------------------------------|
| Navigation       | Global nav, links, breadcrumbs  | Tab bars, drawers, bottom nav   |
| Hierarchy        | Usually deeper (3-4 levels)     | Usually flatter (1-2 levels)    |
| Content model    | Pages and sections              | Screens and states              |
| User behavior    | Browse, scan, read              | Task-oriented, action-focused   |
| Search           | Often critical                  | Sometimes optional              |
| Entry points     | Multiple (SEO, deep links)      | Usually single (home screen)    |
| Back navigation  | Browser back button, links      | System back, explicit buttons   |

---

## Practical Examples

### Example 1: Portfolio Site IA Audit

Here is a common portfolio IA with problems, followed by an improved version.

**Before (problematic):**

```
Home
  +-- About
  |     +-- Bio
  |     +-- Resume
  |     +-- Hobbies
  |     +-- My Cat
  +-- Work
  |     +-- Freelance
  |     |     +-- Client A
  |     |     +-- Client B
  |     +-- Personal
  |     |     +-- Side Project 1
  |     |     +-- Side Project 2
  |     +-- Open Source
  |           +-- Contribution 1
  +-- Blog
  |     +-- Tech
  |     +-- Life
  |     +-- Reviews
  +-- Contact

PROBLEMS:
- Too many categories at second level (Freelance/Personal/Open Source)
- Visitor does not care HOW you worked on it, they care WHAT you built
- "My Cat" and "Hobbies" are noise for professional visitors
- Blog has 3 subcategories -- overkill for most portfolio blogs
- 4 clicks to reach any project
```

**After (improved):**

```
Home (hero + featured projects)
  +-- Projects (filterable grid)
  |     +-- Project Detail (case study format)
  +-- About (bio + skills + experience)
  +-- Contact (form + email + social)

IMPROVEMENTS:
- 3 top-level items (scannable, memorable)
- Projects are flat with filters, not nested by type
- About consolidates bio, skills, resume
- Featured projects on homepage reduce clicks to 1
- Maximum 2 clicks to any content
```

### Example 2: Implementing IA in Next.js Routes

Your IA directly maps to your file/route structure in Next.js:

```
app/
  [lang]/
    page.tsx              # Homepage with hero + featured projects
    layout.tsx            # Shared navigation, footer
    projects/
      page.tsx            # Filterable project grid
      [slug]/
        page.tsx          # Individual project / case study
    about/
      page.tsx            # Bio, skills, experience, resume
    contact/
      page.tsx            # Contact form + direct links
```

**Navigation component reflecting IA:**

```tsx
const navItems = [
  { label: 'Home', href: `/${lang}` },
  { label: 'Projects', href: `/${lang}/projects` },
  { label: 'About', href: `/${lang}/about` },
  { label: 'Contact', href: `/${lang}/contact` },
] as const

function Navbar({ lang }: { lang: string }) {
  return (
    <nav className="fixed top-0 z-50 w-full backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href={`/${lang}`} className="text-lg font-bold">
          YJ
        </a>
        <ul className="flex gap-8">
          {navItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-sm font-medium text-gray-600
                           transition-colors hover:text-gray-900
                           dark:text-gray-400 dark:hover:text-white"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
```

### Example 3: Faceted Filtering for Projects

```tsx
// Project taxonomy as TypeScript types
type ProjectCategory = 'web-app' | 'api' | 'library' | 'cli'
type Technology = 'react' | 'nextjs' | 'node' | 'typescript' | 'python'

interface Project {
  readonly slug: string
  readonly title: string
  readonly category: ProjectCategory
  readonly technologies: readonly Technology[]
  readonly year: number
  readonly featured: boolean
}

// Filter component using faceted taxonomy
function ProjectFilters({
  activeFilters,
  onFilterChange,
}: {
  activeFilters: { category?: ProjectCategory; tech?: Technology }
  onFilterChange: (filters: typeof activeFilters) => void
}) {
  const categories: readonly ProjectCategory[] = [
    'web-app', 'api', 'library', 'cli',
  ]
  const technologies: readonly Technology[] = [
    'react', 'nextjs', 'node', 'typescript', 'python',
  ]

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() =>
              onFilterChange({
                ...activeFilters,
                category: activeFilters.category === cat ? undefined : cat,
              })
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              activeFilters.category === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {technologies.map((tech) => (
          <button
            key={tech}
            onClick={() =>
              onFilterChange({
                ...activeFilters,
                tech: activeFilters.tech === tech ? undefined : tech,
              })
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              activeFilters.tech === tech
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {tech}
          </button>
        ))}
      </div>
    </div>
  )
}
```

### Example 4: Breadcrumbs for Deep Content

```tsx
interface BreadcrumbItem {
  readonly label: string
  readonly href: string
}

function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
      <ol className="flex items-center gap-2">
        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {index === items.length - 1 ? (
              <span className="text-gray-900 dark:text-white">
                {item.label}
              </span>
            ) : (
              <a
                href={item.href}
                className="transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

// Usage on a project detail page:
// <Breadcrumbs items={[
//   { label: 'Home', href: '/en' },
//   { label: 'Projects', href: '/en/projects' },
//   { label: 'E-commerce Dashboard', href: '/en/projects/ecommerce-dashboard' },
// ]} />
```

---

## Common Interview Questions

### Q1: What is information architecture, and why does it matter?

**Answer:** Information architecture is the practice of organizing, structuring, and labeling content so that users can find information and complete tasks effectively. It matters because even the most beautifully designed interface fails if users cannot find what they are looking for. IA bridges the gap between content and users by creating logical structures, clear labels, and intuitive navigation paths. In practice, poor IA manifests as users saying "I cannot find the thing I am looking for" even though it exists on the site.

### Q2: Explain the difference between open and closed card sorting.

**Answer:** In open card sorting, participants are given content items (cards) and asked to organize them into groups they create and name themselves. This is exploratory -- it reveals how users naturally categorize your content. In closed card sorting, the groups are predefined by the researcher, and participants place cards into those existing categories. This validates whether your proposed structure matches users' expectations. There is also hybrid card sorting, where predefined categories exist but participants can create new ones. I would use open sorts early in a project to discover patterns, and closed sorts later to validate a proposed navigation structure.

### Q3: How do you decide between a flat and a deep navigation structure?

**Answer:** The decision depends on content volume, user behavior, and task complexity. Flat structures (many items at the top level, few levels deep) work well when users know what they want and need to scan options quickly -- like a utility dashboard or a small portfolio. Deep structures (fewer top-level items, more nesting) work when content is naturally hierarchical and users are exploring -- like documentation or an e-commerce site with many categories. The general guideline is to aim for no more than 7 top-level items and no more than 3 levels of depth. If you exceed both, your IA likely needs restructuring. I always validate with users through tree testing or card sorting rather than guessing.

### Q4: What is a mental model, and how does it influence IA decisions?

**Answer:** A mental model is a user's internal representation of how something works, formed by their prior experiences. For example, most people have a mental model that a shopping cart icon means "view my selected items" because that convention is established across thousands of e-commerce sites. IA decisions should align with existing mental models whenever possible, because fighting them creates cognitive friction. When you must break a mental model (perhaps for genuine innovation), you need clear signposting and progressive disclosure to guide users. I assess mental models through user interviews, competitive analysis, and tree testing -- asking users where they would expect to find specific content.

### Q5: How would you structure the IA for a developer portfolio site?

**Answer:** I would start with user research to identify the primary visitors: likely hiring managers, technical leads, and recruiters. Based on their needs, I would create a flat, scannable structure with 3-4 top-level sections: Home (hero with featured projects), Projects (filterable grid of all work), About (combined bio, skills, and experience), and Contact (multiple contact methods). Projects would be the most architecturally important section, using a faceted taxonomy allowing filtering by technology, project type, and year. Each project would have a detail page in case study format. I would avoid deep nesting -- every piece of content should be reachable in 2 clicks maximum. The homepage would serve as a curated entry point showing the strongest 2-3 projects to satisfy visitors who will not explore further.

### Q6: What is tree testing and how does it differ from card sorting?

**Answer:** Tree testing (also called reverse card sorting) evaluates an existing or proposed navigation structure by asking users to find specific items within a text-only hierarchy. Unlike card sorting, which helps you *create* a structure, tree testing helps you *validate* one. Participants see only the navigation labels (no visual design) and are given tasks like "Where would you find information about pricing?" Their click paths reveal whether labels are clear and content is where users expect it. Tree testing is particularly valuable because it isolates IA from visual design, ensuring your structure works independently of how it looks.

### Q7: How do you handle IA for a bilingual or multilingual site?

**Answer:** Multilingual IA requires careful decisions at multiple levels. First, the URL structure: language-prefixed paths (like `/en/about`, `/zh/about`) are the most common and SEO-friendly approach. Second, navigation labels must be professionally translated, not just machine-translated, because navigation is the highest-stakes text on a site. Third, consider that content volume may differ across languages -- a section that makes sense in English might not exist in Chinese, or vice versa. The IA structure should remain consistent across languages to avoid confusing bilingual users who switch, but individual sections can be adapted. Finally, the language switcher itself is an IA decision -- it should be persistent, easy to find, and use native language names (e.g., "English" and "中文" rather than flags, which conflate language with nationality).

### Q8: What are the most common IA mistakes you see on websites?

**Answer:** The five most common IA mistakes are: (1) Organizing by internal structure rather than user needs -- departments or teams as navigation categories instead of user tasks. (2) Using jargon or clever labels instead of clear, conventional ones. (3) Too many top-level navigation items, overwhelming users with choices. (4) Inconsistent depth -- some sections are one page, others are five levels deep. (5) No clear hierarchy of importance -- treating all content as equally prominent when users need to be guided to the most important content first. The fix for all of these is the same: involve users through card sorting, tree testing, and usability testing rather than designing IA based on internal assumptions.

---

## Applying to Your Portfolio

### IA Audit Checklist for Your Portfolio

Run through these questions:

- [ ] Can a visitor identify the purpose of your site within 5 seconds?
- [ ] Are there 5 or fewer top-level navigation items?
- [ ] Can any content be reached in 2 clicks or fewer?
- [ ] Do navigation labels match what users expect?
- [ ] Is the project taxonomy clear (by technology, type, or both)?
- [ ] Is the i18n structure consistent across languages?
- [ ] Does the homepage surface your most important content?
- [ ] Is contact information accessible from every page?

### Recommended IA for a Developer Portfolio

```
Route Structure (Next.js with i18n):

/                          --> Redirect to /en
/[lang]                    --> Homepage: hero, featured projects, CTA
/[lang]/#projects          --> Anchor link to project section
/[lang]/#about             --> Anchor link to about section
/[lang]/#contact           --> Anchor link to contact section

If using separate pages instead of single-page:
/[lang]/projects           --> Filterable grid of all projects
/[lang]/projects/[slug]    --> Project case study detail
/[lang]/about              --> Full bio, skills, experience, resume
/[lang]/contact            --> Contact form + direct links
```

### Implementing Smooth Navigation for Single-Page IA

```tsx
import { motion } from 'framer-motion'

// For a single-page portfolio, use section-based navigation
// This keeps the IA flat while maintaining clear sections

const sections = [
  { id: 'hero', label: 'Home' },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
] as const

function SectionNav({ activeSection }: { activeSection: string }) {
  return (
    <nav className="fixed right-6 top-1/2 z-50 -translate-y-1/2">
      <ul className="flex flex-col gap-3">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="group flex items-center gap-2"
              aria-label={section.label}
            >
              <span
                className="text-xs opacity-0 transition-opacity
                           group-hover:opacity-100"
              >
                {section.label}
              </span>
              <motion.span
                className={`block h-3 w-3 rounded-full transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-600'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                whileHover={{ scale: 1.5 }}
              />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

---

## Quick Reference

```
INFORMATION ARCHITECTURE CHEAT SHEET
======================================

FOUR IA SYSTEMS:
  1. Organization  --> How content is categorized
  2. Labeling      --> How things are named
  3. Navigation    --> How users move around
  4. Search        --> How users find specific items

CONTENT HIERARCHY RULES:
  - 5-7 top-level items maximum
  - 3 levels of depth maximum
  - Mutual exclusivity between categories
  - Progressive disclosure (show less, reveal more)

NAVIGATION MODELS:
  Hierarchical  --> Drill-down tree (most sites)
  Sequential    --> Step-by-step flow (wizards)
  Matrix        --> Multi-dimensional filtering (e-commerce)
  Hub-and-spoke --> Central hub, independent sections (apps)

CARD SORTING:
  Open   --> Users create and name their own groups (discovery)
  Closed --> Users sort into predefined groups (validation)
  Hybrid --> Predefined groups + create new ones (refinement)

LABELING PRINCIPLES:
  - Clear over clever
  - Consistent patterns
  - User language, not internal jargon
  - Test with 5 people: "What would you expect behind this label?"

MENTAL MODEL ALIGNMENT:
  - Research what users expect before designing
  - Use conventional patterns (nav at top, contact in footer)
  - If you innovate, provide clear signposting
  - Validate with tree testing

PORTFOLIO IA BEST PRACTICES:
  - 3-4 top-level sections: Home, Projects, About, Contact
  - Maximum 2 clicks to any content
  - Featured projects on homepage
  - Faceted filters on project listing
  - Consistent IA across language versions
  - Contact accessible from every page

VALIDATION METHODS:
  - Card sorting (create structure)
  - Tree testing (validate structure)
  - First-click testing (validate entry points)
  - Usability testing (validate everything)
```
