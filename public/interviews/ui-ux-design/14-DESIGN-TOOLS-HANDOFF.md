# Design Tools & Dev Handoff

## Overview

The gap between design and development is where countless projects lose time, quality, and team morale. A frontend developer who understands design tools, can read design files fluently, and communicates effectively with designers is exponentially more valuable than one who cannot.

This guide covers the practical skills developers need for working with design tools — primarily Figma, which dominates the industry — and the processes that make design-to-code handoff smooth and accurate.

### What You Will Learn

- How to navigate and inspect Figma files as a developer
- Extracting precise design specifications
- Understanding auto layout, components, and variants
- Design-to-code workflows and mental models
- Design token export and synchronization
- Communication strategies between designers and developers
- Handoff tools and their role in the workflow

---

## Core Concepts

### Figma for Developers

Figma is the industry-standard design tool. As a developer, you do not need to create designs in Figma, but you must be fluent in reading them.

**Inspect Mode (Free)**
Available to anyone with view access to a Figma file. Click any element to see:
- Dimensions (width, height)
- Position (x, y coordinates)
- Colors (hex, RGB, HSL)
- Typography (font family, size, weight, line height, letter spacing)
- Border radius, opacity, blend mode
- Auto-generated CSS (use as reference, not as copy-paste code)

**Dev Mode (Paid Feature)**
Figma's dedicated developer view provides:
- Measurements between elements (click one, hover another)
- Code generation in CSS, iOS, and Android formats
- Component property inspection
- Ready-for-dev status markers set by designers
- Plugin integrations (Storybook, GitHub, VS Code)

### Understanding Figma's Structure

```
Figma File Hierarchy:

  File (project)
    |
    +-- Page 1 (e.g., "Homepage")
    |     |
    |     +-- Frame (e.g., "Desktop - 1440px")
    |     |     |
    |     |     +-- Frame (e.g., "Hero Section")
    |     |     |     |
    |     |     |     +-- Text Layer
    |     |     |     +-- Rectangle (button bg)
    |     |     |     +-- Image
    |     |     |
    |     |     +-- Frame (e.g., "Features Grid")
    |     |           |
    |     |           +-- Component Instance
    |     |           +-- Component Instance
    |     |
    |     +-- Frame (e.g., "Mobile - 375px")
    |
    +-- Page 2 (e.g., "Components")
          |
          +-- Component definitions
          +-- Variant sets
```

**Key Terminology:**
- **Frame** — The primary container in Figma. Equivalent to a `<div>`. Frames can be nested, have auto layout, and clip content.
- **Group** — A loose collection of layers. Unlike frames, groups have no layout properties. Think of it as visual grouping only.
- **Component** — A reusable element (like a React component). Has a purple diamond icon.
- **Instance** — A copy of a component that inherits its properties. Overrides can be applied.
- **Variant** — Different states of a component (e.g., button: default, hover, disabled, small, large).
- **Auto Layout** — Figma's flexbox equivalent. Defines direction, gap, padding, and alignment.

### Auto Layout = Flexbox

Figma's auto layout maps almost directly to CSS flexbox:

```
Figma Auto Layout          CSS Flexbox
================          ===========
Direction: Horizontal  ->  flex-direction: row
Direction: Vertical    ->  flex-direction: column
Gap: 16                ->  gap: 16px
Padding: 24            ->  padding: 24px
Alignment: Center      ->  align-items: center
Distribution: Between  ->  justify-content: space-between

Resizing:
  Fixed width          ->  width: 200px
  Hug contents         ->  width: fit-content (or auto)
  Fill container       ->  flex: 1 (or width: 100%)
```

Understanding this mapping is the single most important Figma-to-code skill. When you see auto layout properties in Figma, you should immediately think in flexbox terms.

### Components and Variants

Figma components mirror frontend component architecture:

```
+------------------------------------------+
|  Button Component (Main)                 |
|                                          |
|  Properties:                             |
|    variant: primary | secondary | ghost  |
|    size: sm | md | lg                    |
|    state: default | hover | disabled     |
|    icon: leading | trailing | none       |
|    label: "Button Text"                  |
|                                          |
|  Variants Grid:                          |
|  +--------+--------+--------+           |
|  | pri/sm | pri/md | pri/lg |           |
|  +--------+--------+--------+           |
|  | sec/sm | sec/md | sec/lg |           |
|  +--------+--------+--------+           |
|  | gho/sm | gho/md | gho/lg |           |
|  +--------+--------+--------+           |
+------------------------------------------+
```

This maps to a React component with props:

```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
  iconPosition?: 'leading' | 'trailing' | 'none'
  children: React.ReactNode
}
```

### Extracting Design Specifications

When reviewing a design, extract these properties systematically:

**Spacing**
- Padding within containers (inner spacing)
- Margin/gap between elements (outer spacing)
- Section spacing (vertical rhythm)
- Look for a spacing scale (4, 8, 12, 16, 24, 32, 48, 64)

**Colors**
- Background colors per surface level
- Text colors (primary, secondary, muted)
- Accent/brand colors
- Border colors
- State colors (error, warning, success, info)
- Opacity values

**Typography**
- Font family and fallbacks
- Font sizes (look for a type scale)
- Font weights used
- Line heights
- Letter spacing
- Text transforms (uppercase, capitalize)

**Layout**
- Max content width
- Grid column count and gutters
- Breakpoints (check if multiple frames exist for different screen sizes)
- Container padding per breakpoint

**Assets**
- Icons (are they from an icon library? which one?)
- Images (dimensions, aspect ratios, object-fit behavior)
- Illustrations (SVG? PNG? theme-aware?)

### Design-to-Code Workflow

A reliable workflow for translating designs to code:

```
Step 1: Study the Full Design
+----------------------------------+
|  Review all pages and states     |
|  Identify patterns and reuse     |
|  Note responsive variations      |
|  List questions for designer     |
+----------------------------------+
         |
         v
Step 2: Identify the Component Tree
+----------------------------------+
|  Map Figma frames to components  |
|  Identify shared components      |
|  Define component interfaces     |
|  Note variant/prop requirements  |
+----------------------------------+
         |
         v
Step 3: Extract Design Tokens
+----------------------------------+
|  Colors, spacing, typography     |
|  Shadows, border radii           |
|  Breakpoints, transitions        |
|  Document in a tokens file       |
+----------------------------------+
         |
         v
Step 4: Build Bottom-Up
+----------------------------------+
|  Primitive components first      |
|  Compose into larger sections    |
|  Wire up layout and spacing      |
|  Add responsive behavior         |
+----------------------------------+
         |
         v
Step 5: Review with Designer
+----------------------------------+
|  Side-by-side comparison         |
|  Check spacing, alignment        |
|  Verify responsive behavior      |
|  Address interaction details     |
+----------------------------------+
```

### Design Tokens Export

Design tokens bridge design tools and code. They are the single source of truth for visual properties.

**Tokens Studio (Figma Plugin)**
A popular Figma plugin that lets designers define tokens in Figma and export them as JSON. The JSON can then be consumed by Style Dictionary or directly by Tailwind.

```json
{
  "colors": {
    "primary": {
      "value": "#6C63FF",
      "type": "color"
    },
    "background": {
      "value": "#FFFFFF",
      "type": "color"
    }
  },
  "spacing": {
    "sm": { "value": "8px", "type": "spacing" },
    "md": { "value": "16px", "type": "spacing" },
    "lg": { "value": "24px", "type": "spacing" }
  },
  "typography": {
    "heading": {
      "fontFamily": { "value": "Poppins", "type": "fontFamilies" },
      "fontSize": { "value": "32px", "type": "fontSizes" },
      "fontWeight": { "value": "700", "type": "fontWeights" },
      "lineHeight": { "value": "1.2", "type": "lineHeights" }
    }
  }
}
```

**Style Dictionary**
Amazon's open-source tool that transforms design tokens into platform-specific formats:

```
tokens.json  -->  Style Dictionary  -->  CSS variables
                                    -->  Tailwind config
                                    -->  iOS Swift constants
                                    -->  Android XML resources
```

### Communication Between Designers and Developers

Effective communication prevents rework and frustration.

**What Developers Should Ask Designers:**
1. What happens at different breakpoints? (if not shown)
2. What are the hover/focus/active states? (if not annotated)
3. What are the loading/empty/error states?
4. Is there an animation or transition? How fast, what easing?
5. What is the interaction when this list has 0 items? 1 item? 100 items?
6. Are these exact pixel values or is flexible spacing acceptable?
7. Which elements are components vs. one-off designs?

**How to Provide Design Feedback as a Developer:**
- Reference specific frames and layers by name
- Explain technical constraints clearly ("sticky positioning causes z-index stacking issues with this layout")
- Suggest alternatives rather than just saying "can't do that"
- Use screenshots of your implementation alongside the design for comparison
- Raise concerns early, not after building

### Figma Plugins for Developers

Useful plugins that bridge design and development:

| Plugin | Purpose |
|--------|---------|
| Tokens Studio | Define and export design tokens |
| Locofy | AI-powered design-to-code conversion |
| Figma to Code (HTML) | Generates HTML/CSS from selections |
| Iconify | Access thousands of icon sets directly |
| Content Reel | Populate designs with realistic data |
| Stark | Accessibility checker (contrast, vision sim) |
| Measure | Add detailed measurements and annotations |

### Other Design Tools (Brief Overview)

**Sketch** (macOS only)
- Was the industry standard before Figma. Still used at some companies.
- `.sketch` files can be opened in Figma (import).
- Uses "Symbols" instead of "Components" and "Overrides" instead of "Variants."
- Handoff via plugins like Zeplin or Avocode.

**Adobe XD**
- Adobe's attempt to compete with Figma. Officially discontinued in 2024.
- You may encounter legacy XD files in older projects.
- Can be imported into Figma.

**Penpot**
- Open-source alternative to Figma.
- Growing in popularity, especially in open-source communities.
- Similar concepts (frames, components, auto layout) but different terminology in places.

### Handoff Tools

**Zeplin**
A dedicated handoff tool that sits between design and development:
- Designers publish screens from Figma/Sketch
- Developers get accurate measurements, colors, fonts, and assets
- Supports style guide generation
- Integration with Jira, Slack, and other project tools

**Figma Dev Mode**
Figma's built-in answer to Zeplin. Becoming the preferred approach because it eliminates the need for a separate tool and keeps everything in one place.

**Storybook**
While not a handoff tool per se, Storybook bridges the gap by providing a living component library that designers can reference:

```
Design System Workflow:

  Figma Components  <-->  Storybook Stories  <-->  Production Code
       |                       |                        |
    Source of               Living                  Shipped
     truth                 reference               product
```

---

## Practical Examples

### Reading a Figma Card Design

Given this Figma inspection panel:

```
Frame: "Project Card"
  Auto Layout: Vertical
  Padding: 24px
  Gap: 16px
  Width: Fill (min 280px, max 400px)
  Corner Radius: 12px
  Fill: #FFFFFF
  Stroke: #E5E7EB, 1px
  Shadow: 0px 4px 12px rgba(0, 0, 0, 0.08)

  Children:
    Image Frame: 100% width, 200px height, radius 8px
    Text "Project Title": Poppins Semi-Bold 20px, #1A1A2E
    Text "Description...": Poppins Regular 14px, #6B7280, 2 lines max
    Frame "Tags": Horizontal, gap 8px, wrap
      Tag "React": bg #EEF2FF, text #6C63FF, padding 4px 12px, radius 999px
```

Translates to:

```tsx
function ProjectCard({ title, description, image, tags }) {
  return (
    <div className="flex flex-col gap-4 p-6 min-w-[280px] max-w-[400px]
                    rounded-xl bg-white border border-gray-200
                    shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
      <img
        src={image}
        alt={title}
        className="w-full h-[200px] object-cover rounded-lg"
      />
      <h3 className="font-semibold text-xl text-gray-900">
        {title}
      </h3>
      <p className="text-sm text-gray-500 line-clamp-2">
        {description}
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 text-sm rounded-full
                       bg-indigo-50 text-indigo-600"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
```

### Spacing Audit Workflow

```
1. Select a frame in Figma
2. Note the padding values (top, right, bottom, left)
3. Click between child elements to see gap/margin
4. Compare against the design system spacing scale:

   Figma Value    Tailwind Class    Token
   =========================================
   4px            p-1, gap-1        spacing-xs
   8px            p-2, gap-2        spacing-sm
   12px           p-3, gap-3        spacing-md
   16px           p-4, gap-4        spacing-lg
   24px           p-6, gap-6        spacing-xl
   32px           p-8, gap-8        spacing-2xl
   48px           p-12, gap-12      spacing-3xl
   64px           p-16, gap-16      spacing-4xl

5. If value does NOT match the scale, ask the designer
   if it is intentional or a mistake.
```

---

## Common Interview Questions

### 1. How do you approach converting a Figma design to code?

I follow a systematic process: First, I review the entire design to understand the full scope, identify repeated patterns, and note responsive variations. Second, I map Figma frames to a component tree, identifying shared components and their prop interfaces. Third, I extract design tokens (colors, spacing, typography) and document them. Fourth, I build bottom-up — primitives first, then compose into sections. Finally, I do a side-by-side review with the designer, checking spacing, alignment, and interaction details. I pay special attention to auto layout properties in Figma since they map directly to CSS flexbox.

### 2. What do you do when the design is incomplete or ambiguous?

I document specific questions with frame/layer references and bring them to the designer. Common gaps include: missing responsive breakpoints, hover/focus/active states, empty/loading/error states, and edge cases (very long text, zero items, many items). Rather than guessing, I ask. If the designer is unavailable, I make a reasonable assumption, document it clearly in the code or a comment, and flag it for review. I never silently deviate from the design.

### 3. How does Figma's auto layout relate to CSS?

Auto layout is essentially Figma's visual implementation of flexbox. Horizontal direction maps to `flex-direction: row`, vertical to `column`. The gap property is identical. Padding maps directly. Alignment and distribution map to `align-items` and `justify-content`. The resizing options map to sizing strategies: "Fixed" is an explicit width, "Hug contents" is `width: fit-content` or auto, and "Fill container" is `flex: 1` or `width: 100%`.

### 4. What are design tokens and why do they matter?

Design tokens are the atomic values of a design system — colors, spacing, typography, shadows, border radii — expressed as named, platform-agnostic variables. They matter because they create a single source of truth shared between design and code. When a brand color changes, you update one token, and it propagates everywhere. Tools like Tokens Studio let designers define tokens in Figma, export them as JSON, and tools like Style Dictionary transform them into CSS variables, Tailwind config, or platform-native formats.

### 5. How would you handle a pixel-perfect implementation request?

I would use browser DevTools overlay tools to compare my implementation against the design screenshot. I check spacing with DevTools rulers, verify typography properties match exactly, and compare colors using a color picker. I use tools like Overlay (browser extension) to superimpose the design on the live page. That said, I also communicate that pixel-perfect across all browsers and devices is unrealistic — I aim for "design-faithful" implementations that respect the design intent while adapting gracefully to real-world rendering differences.

### 6. How do you communicate technical constraints to a designer?

I explain the constraint clearly with context (why it exists), show examples if possible, and propose alternatives. For example: "This fixed sidebar layout works on desktop, but on mobile it would consume 40% of the screen. Could we collapse it to an off-canvas menu below 768px?" I use screenshots, quick prototypes, or CodePen examples to illustrate my point. I frame feedback as collaborative problem-solving, not pushback.

### 7. What is a design system and how does it relate to a component library?

A design system is the complete set of standards, principles, and tools that guide product design — including brand guidelines, design tokens, component specifications, usage documentation, and accessibility standards. A component library is the code implementation of the system's components. The design system is the "what and why"; the component library is the "how." Figma components represent the design side; React components represent the code side. They should stay synchronized through design tokens and regular audits.

### 8. How do you handle responsive design when the Figma file only shows desktop?

I ask the designer for mobile and tablet breakpoints first. If those are not available yet, I use the design's existing patterns to infer responsive behavior: check if auto layout is used (it usually scales well), identify which elements should stack vertically on mobile, determine if the grid should collapse from multi-column to single-column, and decide what the mobile navigation pattern should be. I implement my best interpretation and flag it for design review, providing screenshots of the responsive behavior for feedback.

---

## Applying to Your Portfolio

### Mapping Your Portfolio to a Design System Mindset

Even without a Figma file, think about your portfolio through the lens of design tokens:

```typescript
// lib/design-system.ts
export const tokens = {
  colors: {
    bg: { primary: '...', secondary: '...', elevated: '...' },
    text: { primary: '...', secondary: '...', accent: '...' },
    border: { subtle: '...', strong: '...' },
  },
  spacing: {
    section: '64px',    // Between major sections
    component: '24px',  // Between components within a section
    element: '16px',    // Between elements within a component
    inline: '8px',      // Between inline elements
  },
  typography: {
    h1: { size: '48px', weight: 700, lineHeight: 1.1 },
    h2: { size: '32px', weight: 600, lineHeight: 1.2 },
    body: { size: '16px', weight: 400, lineHeight: 1.6 },
    small: { size: '14px', weight: 400, lineHeight: 1.5 },
  },
  radii: {
    sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '999px',
  },
}
```

### Component Audit

Review your existing components against design system principles:
1. **Card.tsx** — Does it use consistent padding and border radius tokens?
2. **Button.tsx** — Are all variants (primary, secondary, ghost) clearly defined with consistent sizing?
3. **SectionHeader.tsx** — Is the typography consistent with a type scale?
4. **SkillTag.tsx** — Do tags use consistent padding, font size, and border radius?

### Developer-Designer Collaboration Showcase

If you want to demonstrate design awareness in your portfolio:
- Include a "Design Process" section or case study that shows before/after iterations
- Show awareness of spacing systems by using consistent spacing throughout
- Demonstrate responsive design across breakpoints
- Use proper elevation hierarchy (cards, modals, navigation)

---

## Quick Reference

```
FIGMA DEVELOPER ESSENTIALS
============================

Navigate:
  Ctrl/Cmd + Click    Select nested layer
  Alt + hover          Show distances
  Ctrl/Cmd + G         Group selection
  Shift + 1            Zoom to fit all

Inspect Panel:
  Click any element -> right panel shows CSS properties
  Colors, dimensions, typography, spacing all visible
  Auto-generated code is a REFERENCE, not production code

AUTO LAYOUT -> FLEXBOX MAPPING
===============================

  Figma              CSS
  -----              ---
  Horizontal         flex-direction: row
  Vertical           flex-direction: column
  Gap: N             gap: Npx
  Padding            padding
  Hug contents       width: fit-content
  Fill container     flex: 1
  Space between      justify-content: space-between

DESIGN SPEC EXTRACTION CHECKLIST
==================================

[ ] Spacing scale (padding, gap, margins)
[ ] Color palette (backgrounds, text, accents, states)
[ ] Typography scale (sizes, weights, line heights)
[ ] Border radii
[ ] Shadow values
[ ] Breakpoints / responsive frames
[ ] Component variants and states
[ ] Icons (library source, sizes)
[ ] Images (aspect ratios, object-fit)
[ ] Animations (duration, easing, triggers)

COMMUNICATION TEMPLATE
========================

"Hi [Designer], reviewing the [Page] designs:
1. What is the behavior at [breakpoint]?
2. Are there hover/active states for [component]?
3. What happens when [edge case]?
4. Is [specific value] intentional or should it follow
   the spacing scale?
I have started implementation and will share a preview
by [date] for your review."
```
