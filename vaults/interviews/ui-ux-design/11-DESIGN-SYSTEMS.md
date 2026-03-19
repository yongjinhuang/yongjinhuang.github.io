# Design Systems & Tokens

## Overview

A design system is a collection of reusable components, standards, and documentation that allows teams to build consistent, high-quality user interfaces at scale. It is the single source of truth that bridges design and development.

Why this matters:

- **Consistency**: Users experience the same patterns across every page and feature
- **Velocity**: Developers stop reinventing buttons and focus on product logic
- **Quality**: Tested, accessible components reduce bugs and regressions
- **Scalability**: New team members ship faster with documented patterns
- **Communication**: Designers and developers share a common vocabulary

This guide covers what makes up a design system, how design tokens work, component architecture patterns, governance, and the most influential systems to study.

---

## Core Concepts

### What Is a Design System?

A design system is more than a component library. It includes multiple layers:

```
┌─────────────────────────────────────────────┐
│              Design System                  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Principles                         │    │
│  │  "Clarity over cleverness"          │    │
│  │  "Accessible by default"            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Design Tokens                      │    │
│  │  Colors, spacing, typography,       │    │
│  │  shadows, motion, breakpoints       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Components                         │    │
│  │  Buttons, Cards, Modals, Forms,     │    │
│  │  Navigation, Data Display           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Patterns                           │    │
│  │  Form validation, error handling,   │    │
│  │  empty states, loading states       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Documentation                      │    │
│  │  Usage guidelines, do/don't,        │    │
│  │  API reference, accessibility notes │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Principles** are the guiding values (e.g., "Progressive disclosure," "Content first"). They help teams make decisions when components do not cover a specific case.

**Tokens** are the atomic visual values -- the DNA of the system.

**Components** are the reusable building blocks.

**Patterns** are solutions to recurring UX problems using those components.

**Documentation** is the glue that makes everything usable.

### Design Tokens

Design tokens are the **named, platform-agnostic values** that represent design decisions. They replace hardcoded values with meaningful names.

#### Types of Tokens

```
Token Category    Examples
─────────────────────────────────────────────────
Color             primary-500, surface-bg, text-muted
Spacing           space-xs (4px), space-sm (8px), space-md (16px)
Typography        font-size-body, font-weight-bold, line-height-tight
Shadow            shadow-sm, shadow-md, shadow-lg
Border Radius     radius-sm (4px), radius-md (8px), radius-full
Motion            duration-fast (150ms), easing-standard
Breakpoints       breakpoint-sm (640px), breakpoint-md (768px)
Z-index           z-dropdown (1000), z-modal (1400)
```

#### Token Implementation

```css
/* CSS Custom Properties */
:root {
  /* Primitive tokens (raw values) */
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --gray-50: #f9fafb;
  --gray-900: #111827;

  /* Semantic tokens (intent-based) */
  --color-primary: var(--blue-500);
  --color-primary-hover: var(--blue-600);
  --color-bg: var(--gray-50);
  --color-text: var(--gray-900);

  /* Spacing scale */
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-12: 3rem; /* 48px */
  --space-16: 4rem; /* 64px */

  /* Typography */
  --font-sans: 'Poppins', system-ui, sans-serif;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
}

/* Dark mode overrides (only semantic tokens change) */
[data-theme='dark'] {
  --color-bg: var(--gray-900);
  --color-text: var(--gray-50);
}
```

### Token Naming Conventions

#### Primitive vs Semantic Tokens

```
PRIMITIVE TOKENS (describe the value):
  --blue-500
  --gray-100
  --font-size-16

SEMANTIC TOKENS (describe the purpose):
  --color-primary
  --color-surface
  --font-size-body

COMPONENT TOKENS (describe the component context):
  --button-bg
  --button-text
  --card-border-radius
```

The layered approach:

```
Primitive          Semantic             Component
──────────        ──────────           ──────────
blue-500    →     color-primary    →   button-bg-primary
gray-100    →     color-surface    →   card-bg
gray-900    →     color-text       →   heading-color
```

**Why this matters:** When you rebrand, you only change the primitive-to-semantic mapping. All components update automatically.

#### Naming Best Practices

```
GOOD:
  --color-primary
  --color-text-muted
  --space-section-gap
  --shadow-card

BAD:
  --blue              (what if the brand changes?)
  --color1            (meaningless)
  --big-shadow        (subjective)
  --margin-23px       (hardcoded value in name)
```

### Figma Component Libraries

In Figma, design systems are implemented through:

1. **Styles** -- Reusable color, text, effect, and grid styles (analogous to tokens)
2. **Components** -- Reusable UI elements with variants and properties
3. **Variants** -- Different states/types within a component (size, state, type)
4. **Auto Layout** -- Responsive component behavior (like flexbox)

```
Figma Component Structure:
┌──────────────────────────────────────┐
│ Button Component                     │
│                                      │
│ Properties:                          │
│   Size:    sm | md | lg              │
│   Variant: primary | secondary       │
│   State:   default | hover | disabled│
│   Icon:    none | left | right       │
│                                      │
│ Variants Grid:                       │
│ ┌─────────┬──────────┬──────────┐    │
│ │ sm/prim │ sm/sec   │ sm/dis   │    │
│ ├─────────┼──────────┼──────────┤    │
│ │ md/prim │ md/sec   │ md/dis   │    │
│ ├─────────┼──────────┼──────────┤    │
│ │ lg/prim │ lg/sec   │ lg/dis   │    │
│ └─────────┴──────────┴──────────┘    │
└──────────────────────────────────────┘
```

### Atomic Design: Building a Component Library

Brad Frost's Atomic Design methodology organizes components into five levels:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ATOMS          The smallest building blocks    │
│  ─────          Button, Input, Label, Icon,     │
│                 Badge, Avatar, Divider           │
│                                                 │
│  MOLECULES      Groups of atoms                 │
│  ─────────      Search bar (input + button),    │
│                 Form field (label + input +      │
│                 error message), Nav item         │
│                                                 │
│  ORGANISMS      Groups of molecules             │
│  ─────────      Navigation bar, Hero section,   │
│                 Card grid, Comment thread,       │
│                 Footer                           │
│                                                 │
│  TEMPLATES      Page-level layouts              │
│  ─────────      Blog post template,             │
│                 Dashboard layout,                │
│                 Profile page wireframe           │
│                                                 │
│  PAGES          Specific instances              │
│  ─────          "About Me" page with real data, │
│                 "Blog Post #42" with content     │
│                                                 │
└─────────────────────────────────────────────────┘
```

Example decomposition:

```
Page: Portfolio Project Page
├── Template: Project Detail Layout
│   ├── Organism: Navbar
│   │   ├── Molecule: Logo + Brand name
│   │   ├── Molecule: Nav links group
│   │   └── Atom: Theme toggle button
│   ├── Organism: Project Hero
│   │   ├── Atom: Project image
│   │   ├── Atom: Heading
│   │   └── Molecule: Tag list (multiple tag atoms)
│   ├── Organism: Project Details
│   │   ├── Molecule: Section header
│   │   └── Atom: Paragraph text
│   └── Organism: Footer
│       ├── Molecule: Social links (icon button atoms)
│       └── Atom: Copyright text
```

### Storybook for Documentation

Storybook is the industry-standard tool for developing, documenting, and testing UI components in isolation.

```
┌────────────────────────────────────────────┐
│ Storybook                           [🔍]  │
├──────────┬─────────────────────────────────┤
│ Sidebar  │  Canvas                         │
│          │                                 │
│ Atoms    │  ┌─────────────────────────┐    │
│  Button  │  │                         │    │
│  Input   │  │   [ Primary Button ]    │    │
│  Badge   │  │                         │    │
│          │  └─────────────────────────┘    │
│ Molecules│                                 │
│  SearchBar│  Controls:                     │
│  FormField│  ┌─────────┬─────────────┐    │
│          │  │ label    │ Click me    │    │
│ Organisms│  │ variant  │ ● primary   │    │
│  Navbar  │  │          │ ○ secondary │    │
│  Footer  │  │ size     │ sm / md / lg│    │
│          │  │ disabled │ □           │    │
│          │  └─────────┴─────────────┘    │
└──────────┴─────────────────────────────────┘
```

A Storybook story for a Button component:

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'radio',
      options: ['primary', 'secondary', 'ghost'],
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    children: 'Click me',
    variant: 'primary',
    size: 'md',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Click me',
    variant: 'secondary',
    size: 'md',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    variant: 'primary',
    disabled: true,
  },
};
```

### Design System Governance

Governance defines how the system evolves:

```
Contribution Flow:
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Proposal │ --> │ Review   │ --> │ Build    │ --> │ Release  │
│          │     │          │     │          │     │          │
│ RFC or   │     │ Design   │     │ Code +   │     │ Version  │
│ issue    │     │ review + │     │ tests +  │     │ bump +   │
│ filed    │     │ team     │     │ docs +   │     │ changelog│
│          │     │ feedback │     │ Storybook│     │ + announce│
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

Key governance decisions:

- **Who can add components?** (Centralized team vs federated contributions)
- **What is the bar for inclusion?** (Used in 3+ places? Accessible? Documented?)
- **How are breaking changes handled?** (Semantic versioning, deprecation warnings)
- **How is adoption measured?** (Import tracking, component analytics)

### Popular Design Systems to Study

| System          | By          | Strengths                                      |
| --------------- | ----------- | ---------------------------------------------- |
| Material Design | Google      | Comprehensive, motion-focused, well-documented |
| Ant Design      | Alibaba     | Enterprise-grade, extensive component set      |
| Radix UI        | WorkOS      | Unstyled primitives, accessibility-first       |
| shadcn/ui       | shadcn      | Copy-paste components, Tailwind-native         |
| Carbon          | IBM         | Enterprise, accessibility, data visualization  |
| Polaris         | Shopify     | Great content guidelines, commerce-focused     |
| Chakra UI       | Open source | Composable, accessible, developer-friendly     |
| Spectrum        | Adobe       | Cross-platform, design token architecture      |

#### shadcn/ui: The Modern Approach

shadcn/ui is notable because it is **not a package you install**. You copy the component source code into your project and own it. This approach:

- Gives you full control over component code
- Avoids dependency bloat
- Uses Radix primitives under the hood
- Styled with Tailwind CSS
- Components are accessible by default

```bash
npx shadcn@latest add button
# Copies Button component into your project at components/ui/button.tsx
```

### When to Build vs Adopt

```
BUILD your own system when:
  ✓ You need a unique brand identity
  ✓ You have a dedicated team to maintain it
  ✓ Existing systems don't fit your use cases
  ✓ You need deep customization

ADOPT an existing system when:
  ✓ You are a small team or solo developer
  ✓ Speed to market is critical
  ✓ Your design needs are standard
  ✓ You lack resources to maintain a custom system

HYBRID approach (most common):
  ✓ Use an existing system as a foundation
  ✓ Customize tokens to match your brand
  ✓ Extend with custom components as needed
  ✓ Example: Radix primitives + custom Tailwind theme
```

### Design-Development Sync

Keeping design and code in sync is one of the hardest problems in design systems.

**Strategies:**

1. **Design tokens as the source of truth**

   - Export tokens from Figma using tools like Tokens Studio
   - Generate CSS variables, Tailwind config, and platform-specific files from tokens
   - Automate with CI/CD pipelines

2. **Component parity**

   - Every Figma component should have a code counterpart
   - Maintain a parity tracker (spreadsheet or tool)
   - Regularly audit for drift

3. **Naming alignment**

   - Use identical names in Figma and code
   - `Button/Primary/Medium` in Figma = `<Button variant="primary" size="md" />`

4. **Visual regression testing**
   - Use Chromatic or Percy to catch visual differences
   - Screenshot tests prevent unintentional style changes

```
Design-Dev Sync Pipeline:
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Figma    │     │ Token        │     │ Code         │
│ Tokens   │ --> │ Transform    │ --> │ Generation   │
│ Plugin   │     │ (Style       │     │ (CSS vars,   │
│          │     │  Dictionary) │     │  Tailwind)   │
└──────────┘     └──────────────┘     └──────────────┘
                                            │
                                            ▼
                                      ┌──────────────┐
                                      │ Visual       │
                                      │ Regression   │
                                      │ Tests        │
                                      └──────────────┘
```

---

## Practical Examples

### Design Tokens in Tailwind Config

```js
// tailwind.config.js
const designTokens = {
  colors: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      900: '#1e3a5a',
    },
    surface: {
      light: '#ffffff',
      dark: '#1a1a2e',
    },
    text: {
      primary: '#111827',
      secondary: '#6b7280',
      inverse: '#f9fafb',
    },
  },
  spacing: {
    section: '5rem',
    'card-padding': '1.5rem',
  },
  borderRadius: {
    card: '0.75rem',
    button: '0.5rem',
    pill: '9999px',
  },
  boxShadow: {
    card: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
};

module.exports = {
  theme: {
    extend: designTokens,
  },
};
```

### Atomic Component Example

```tsx
// Atom: SkillTag
interface SkillTagProps {
  readonly label: string;
  readonly variant?: 'default' | 'highlighted';
}

function SkillTag({ label, variant = 'default' }: SkillTagProps) {
  return (
    <span
      className={cn(
        'inline-block px-3 py-1 text-sm rounded-pill font-medium',
        'transition-all duration-200',
        variant === 'highlighted'
          ? 'bg-primary-500 text-white'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      )}
    >
      {label}
    </span>
  );
}

// Molecule: SkillGroup
interface SkillGroupProps {
  readonly title: string;
  readonly skills: ReadonlyArray<string>;
}

function SkillGroup({ title, skills }: SkillGroupProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <SkillTag key={skill} label={skill} />
        ))}
      </div>
    </div>
  );
}

// Organism: SkillsSection
interface SkillsSectionProps {
  readonly groups: ReadonlyArray<SkillGroupProps>;
}

function SkillsSection({ groups }: SkillsSectionProps) {
  return (
    <section className="py-section">
      <SectionHeader tagline="Expertise" title="Technical Skills" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {groups.map((group) => (
          <SkillGroup key={group.title} {...group} />
        ))}
      </div>
    </section>
  );
}
```

### Token-Driven Theme Switching

```tsx
// design-tokens.ts
const tokens = {
  light: {
    '--color-bg': '#ffffff',
    '--color-surface': '#f9fafb',
    '--color-text': '#111827',
    '--color-text-muted': '#6b7280',
    '--color-primary': '#3b82f6',
    '--color-border': '#e5e7eb',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.1)',
  },
  dark: {
    '--color-bg': '#0f172a',
    '--color-surface': '#1e293b',
    '--color-text': '#f1f5f9',
    '--color-text-muted': '#94a3b8',
    '--color-primary': '#60a5fa',
    '--color-border': '#334155',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.4)',
  },
} as const;
```

---

## Common Interview Questions

### Q1: What is a design system and how does it differ from a component library?

A **component library** is a collection of reusable UI components (buttons, inputs, modals). A **design system** is much broader -- it includes the component library plus design tokens, design principles, usage guidelines, accessibility standards, interaction patterns, and governance processes.

Think of it this way: a component library answers "what components exist?" A design system answers "what should we build, how should it look, how should it behave, and why?"

### Q2: What are design tokens and why are they important?

Design tokens are named values that represent design decisions -- colors, spacing, typography, shadows, etc. They create an abstraction layer between design intent and implementation.

Why they matter:

- **Consistency**: One source of truth for all visual values
- **Theming**: Change tokens to switch themes (light/dark, brand A/brand B)
- **Platform agnostic**: Same tokens can generate CSS, iOS, Android values
- **Maintainability**: Update one token, update everywhere
- **Communication**: Designers and developers use the same vocabulary

### Q3: Explain the difference between primitive and semantic tokens.

**Primitive tokens** describe the raw value: `blue-500`, `gray-100`, `space-16`. They are the color palette and value scales.

**Semantic tokens** describe the intent: `color-primary`, `color-surface`, `space-section-gap`. They reference primitive tokens.

This two-layer system means you can rebrand (change blue to purple) by updating only the primitive-to-semantic mapping. All components that use `color-primary` automatically update without any component-level changes.

### Q4: What is atomic design and how does it organize components?

Atomic design (by Brad Frost) organizes components into five levels:

1. **Atoms**: Smallest elements (button, input, icon, label)
2. **Molecules**: Groups of atoms (search bar = input + button)
3. **Organisms**: Groups of molecules (navbar = logo + nav links + search)
4. **Templates**: Page-level layouts with placeholder content
5. **Pages**: Templates filled with real content

This hierarchy helps teams think systematically about component composition and reuse.

### Q5: When would you build a custom design system vs adopting an existing one?

**Build custom** when you have a strong brand identity, a team to maintain it, unique use cases not covered by existing systems, or need deep customization.

**Adopt existing** when you are a small team, need speed, have standard UI needs, or lack maintenance resources.

**The hybrid approach** is most common: adopt a foundation (like Radix primitives or shadcn/ui), customize tokens to match your brand, and extend with custom components as needed. This gives you a head start while preserving brand identity.

### Q6: How do you keep design and code in sync?

1. **Token pipeline**: Export tokens from Figma, transform with Style Dictionary, generate code
2. **Naming alignment**: Same names in Figma and code (`Button/Primary/Medium` = `<Button variant="primary" size="md">`)
3. **Visual regression tests**: Chromatic or Percy catch visual drift
4. **Component parity audits**: Regularly check that every Figma component has a code counterpart
5. **Shared documentation**: Storybook as the living reference for both designers and developers

### Q7: What is the role of Storybook in a design system?

Storybook serves as:

- **Development environment**: Build components in isolation without running the full app
- **Documentation**: Interactive API docs with controls for every prop
- **Testing**: Visual regression, accessibility, and interaction testing
- **Design review**: Designers can verify implementation matches specs
- **Onboarding**: New team members explore available components

### Q8: How do you handle design system versioning and breaking changes?

- Use **semantic versioning** (major.minor.patch)
- Major versions for breaking changes (removed props, changed APIs)
- Provide **migration guides** for major versions
- **Deprecation warnings** before removing features (at least one minor version)
- **Codemods** to automate migration when possible
- **Changelog** documenting every change
- **Canary releases** for testing before stable release

---

## Applying to Your Portfolio

### For a Next.js + Tailwind + Framer Motion Portfolio

1. **Centralize your design tokens**

   - Your `lib/design-system.ts` already defines colors, shadows, and animations
   - Extend it with a complete spacing scale and typography scale
   - Use these tokens in your Tailwind config for a single source of truth

2. **Apply atomic design to your component structure**

   - Your `components/ui/` folder already contains atoms (Button, Card, SkillTag)
   - Your `components/sections/` contains organisms (Intro, Experience, Skills)
   - Document this hierarchy for portfolio visitors to see your architectural thinking

3. **Add a design system page to your portfolio**

   - Showcase your token system (colors, spacing, typography)
   - Show component variants (buttons, cards in different states)
   - This demonstrates system thinking to potential employers

4. **Implement consistent theming**

   - Your dark/light mode should be driven by semantic tokens
   - Switching themes should only change token values, not component logic

5. **Use shadcn/ui patterns as inspiration**

   - Your `cn()` utility already follows the shadcn pattern
   - Consider adopting their variant pattern using `class-variance-authority`

6. **Document your component props**
   - Add JSDoc or TypeScript descriptions to component props
   - This is your mini design system documentation

---

## Quick Reference

```
DESIGN SYSTEM LAYERS:
  Principles → Tokens → Components → Patterns → Documentation

TOKEN TYPES:
  Primitive:  blue-500, gray-100, space-16   (raw values)
  Semantic:   color-primary, color-surface    (intent)
  Component:  button-bg, card-radius          (scoped)

ATOMIC DESIGN:
  Atoms → Molecules → Organisms → Templates → Pages
  (small)                              (large)

TOKEN NAMING:
  ✓ color-primary, space-section-gap, shadow-card
  ✗ blue, color1, big-shadow, margin-23px

POPULAR SYSTEMS:
  Material Design | Ant Design | Radix UI | shadcn/ui
  Carbon | Polaris | Chakra UI | Spectrum

BUILD vs ADOPT:
  Build: unique brand, dedicated team, deep customization
  Adopt: small team, speed needed, standard UI
  Hybrid: adopt foundation + customize tokens + extend

DESIGN-DEV SYNC:
  Figma tokens → Style Dictionary → CSS/Tailwind generation
  Same naming in design and code
  Visual regression testing (Chromatic/Percy)

STORYBOOK:
  Develop in isolation | Document props | Visual testing
  Design review | Onboarding tool

GOVERNANCE:
  Proposal → Review → Build → Release
  Semantic versioning | Migration guides | Deprecation warnings
```
