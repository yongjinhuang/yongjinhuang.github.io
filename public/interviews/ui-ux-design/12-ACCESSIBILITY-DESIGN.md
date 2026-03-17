# Accessibility (Design Perspective)

## Overview

Accessibility (often abbreviated a11y) is the practice of designing and building digital products that can be used by everyone, including people with visual, auditory, motor, cognitive, and neurological disabilities. From a design perspective, accessibility is not an afterthought or a checkbox -- it is a fundamental quality of good design.

Why this matters:

- **Over 1 billion people** worldwide live with some form of disability
- **Temporary and situational disabilities** affect everyone (broken arm, bright sunlight, loud environment)
- **Legal requirements** exist in most countries (ADA, Section 508, EAA)
- **SEO benefits**: Accessible HTML is better-structured HTML, which search engines prefer
- **Better UX for all**: Accessible designs are clearer, more usable, and more robust

This guide covers WCAG principles, contrast requirements, keyboard navigation, screen reader design, cognitive accessibility, testing tools, legal landscape, and accessible component patterns.

---

## Core Concepts

### WCAG 2.1 Overview

The Web Content Accessibility Guidelines (WCAG) are organized around four principles, remembered by the acronym **POUR**:

```
┌─────────────────────────────────────────────────────────┐
│                    POUR Principles                      │
│                                                         │
│  P - PERCEIVABLE                                        │
│      Can users perceive the content?                    │
│      Text alternatives, captions, contrast,             │
│      adaptable content, distinguishable elements        │
│                                                         │
│  O - OPERABLE                                           │
│      Can users operate the interface?                   │
│      Keyboard accessible, enough time,                  │
│      no seizure-inducing content, navigable,            │
│      input modalities                                   │
│                                                         │
│  U - UNDERSTANDABLE                                     │
│      Can users understand the content?                  │
│      Readable text, predictable behavior,               │
│      input assistance, error prevention                 │
│                                                         │
│  R - ROBUST                                             │
│      Does it work with assistive technologies?          │
│      Valid HTML, ARIA roles, compatible with            │
│      screen readers and other tools                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### WCAG Conformance Levels

```
Level A    (Minimum)
  ├── Alt text for images
  ├── Keyboard accessible
  ├── Page has a title
  ├── Link purpose is clear
  └── No keyboard traps

Level AA   (Standard / Industry Target)
  ├── Everything in A, plus:
  ├── Color contrast 4.5:1 (normal text)
  ├── Color contrast 3:1 (large text)
  ├── Text resizable to 200%
  ├── Focus visible
  ├── Consistent navigation
  ├── Error identification
  └── Labels on form inputs

Level AAA  (Enhanced)
  ├── Everything in AA, plus:
  ├── Color contrast 7:1 (normal text)
  ├── Color contrast 4.5:1 (large text)
  ├── Sign language for media
  ├── Extended audio descriptions
  └── Reading level: lower secondary education
```

**Most organizations target Level AA.** It is the standard referenced by most accessibility laws.

### Designing for Screen Readers

Screen readers convert visual content into spoken text or braille output. Designing for screen readers means providing structure and meaning, not just visual styling.

#### Heading Hierarchy

Headings create an **outline** that screen reader users navigate. They must follow a logical order.

```
CORRECT:                      WRONG:
<h1> Page Title               <h1> Page Title
  <h2> Section A                <h3> Section A    ← skipped h2
    <h3> Subsection               <h2> Section B
  <h2> Section B                  <h5> Detail    ← skipped h3, h4
    <h3> Subsection
    <h3> Subsection
```

**Rules:**
- One `<h1>` per page
- Never skip heading levels (h1 to h3 without h2)
- Headings should describe content, not be used for visual sizing

#### Landmark Regions

Landmarks let screen reader users jump between major page sections:

```html
<header>         <!-- Banner landmark -->
  <nav>          <!-- Navigation landmark -->
</header>
<main>           <!-- Main landmark -->
  <section aria-label="About">    <!-- Region landmark -->
  <section aria-label="Projects"> <!-- Region landmark -->
</main>
<aside>          <!-- Complementary landmark -->
<footer>         <!-- Contentinfo landmark -->
```

```
Page Landmark Structure:
┌──────────────────────────────┐
│ <header> (banner)            │
│   <nav> (navigation)         │
├──────────────────────────────┤
│ <main> (main)                │
│   ┌────────────────────────┐ │
│   │ <section> About        │ │
│   ├────────────────────────┤ │
│   │ <section> Experience   │ │
│   ├────────────────────────┤ │
│   │ <section> Skills       │ │
│   └────────────────────────┘ │
├──────────────────────────────┤
│ <footer> (contentinfo)       │
└──────────────────────────────┘
```

#### Alt Text for Images

```html
<!-- Informative image: describe the content -->
<img src="chart.png" alt="Bar chart showing 40% increase in revenue from Q1 to Q4 2025" />

<!-- Decorative image: empty alt -->
<img src="divider.svg" alt="" />

<!-- Linked image: describe the destination -->
<a href="/projects">
  <img src="thumbnail.jpg" alt="View my portfolio projects" />
</a>

<!-- Complex image: use longer description -->
<figure>
  <img src="architecture.png" alt="System architecture diagram" aria-describedby="arch-desc" />
  <figcaption id="arch-desc">
    The system uses a microservices architecture with three main services:
    authentication, data processing, and notification...
  </figcaption>
</figure>
```

### Color Contrast Requirements

WCAG defines minimum contrast ratios between text and its background:

```
Level AA:
  Normal text (< 18pt / < 14pt bold):    4.5:1
  Large text  (>= 18pt / >= 14pt bold):  3:1
  UI components and graphical objects:     3:1

Level AAA:
  Normal text:  7:1
  Large text:   4.5:1
```

```
Contrast Examples:
┌────────────────────────────────────────────────┐
│                                                │
│  ██████  #000 on #FFF  →  21:1   ✓ AAA        │
│  ██████  #333 on #FFF  →  12.6:1 ✓ AAA        │
│  ██████  #767676 on #FFF → 4.5:1 ✓ AA         │
│  ██████  #959595 on #FFF → 2.8:1 ✗ FAIL       │
│                                                │
│  Common pitfall:                               │
│  Light gray text on white background           │
│  Placeholder text (#aaa on #fff = 2.3:1) FAIL  │
│                                                │
└────────────────────────────────────────────────┘
```

**Important:** Never use color as the **only** way to convey information.

```
BAD:  Red = error, Green = success (colorblind users cannot distinguish)
GOOD: Red + ✗ icon + "Error: ..." text, Green + ✓ icon + "Success: ..." text
```

### Focus Indicators and Keyboard Navigation

Every interactive element must have a **visible focus indicator** when navigated via keyboard.

```css
/* Default browser focus (often removed by reset stylesheets -- DON'T) */
:focus {
  outline: 2px solid #4A90D9;
  outline-offset: 2px;
}

/* Better: use :focus-visible for keyboard-only focus */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Remove outline only for mouse clicks, keep for keyboard */
:focus:not(:focus-visible) {
  outline: none;
}
```

**Keyboard navigation requirements:**

| Key          | Expected Behavior                    |
|--------------|--------------------------------------|
| Tab          | Move to next interactive element     |
| Shift+Tab    | Move to previous interactive element |
| Enter        | Activate buttons, links              |
| Space        | Activate buttons, toggle checkboxes  |
| Escape       | Close modals, dropdowns, menus       |
| Arrow keys   | Navigate within components (tabs, menus) |

**Focus management rules:**

- Focus order must follow the **visual order** (logical DOM order)
- Modals must **trap focus** (Tab should cycle within the modal)
- When a modal closes, focus must return to the **trigger element**
- Skip links allow keyboard users to bypass navigation

```html
<!-- Skip link (first element in body) -->
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-white">
  Skip to main content
</a>
```

### Touch Target Sizing

Touch targets must be large enough for users with motor impairments:

```
WCAG 2.5.5 (Level AAA): 44 x 44 CSS pixels
WCAG 2.5.8 (Level AA):  24 x 24 CSS pixels minimum

Recommended:
  Buttons:    min-height 44px, min-width 44px
  Links:      adequate padding to reach 44px hit area
  Checkboxes: 44x44px tap area (even if visual is smaller)
  Spacing:    at least 8px between adjacent targets
```

```css
/* Ensuring touch targets even for small visual elements */
.icon-button {
  position: relative;
  width: 24px;
  height: 24px;
}

.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px; /* Extends tap area by 10px in all directions */
}
```

### Cognitive Accessibility

Cognitive accessibility addresses users with dyslexia, ADHD, autism, intellectual disabilities, and anyone under cognitive load (stress, multitasking, unfamiliar language).

#### Plain Language

```
BAD:  "An error has occurred during the authentication process.
       Please verify your credentials and attempt re-submission."

GOOD: "Wrong email or password. Please try again."
```

#### Consistent Layouts

```
Every page should have:
┌──────────────────────────────┐
│ Navigation (same position)   │  <- Always here
├──────────────────────────────┤
│                              │
│ Content (predictable area)   │  <- Always here
│                              │
├──────────────────────────────┤
│ Footer (same position)       │  <- Always here
└──────────────────────────────┘
```

- Navigation in the same place on every page
- Consistent naming (do not call it "Projects" on one page and "Work" on another)
- Predictable interactions (buttons look like buttons, links look like links)

#### Error Prevention

```
Before destructive action:          After error:
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ Delete this project?        │    │ ⚠ Could not save.           │
│                             │    │                             │
│ This will permanently       │    │ Your internet connection    │
│ remove "My App" and all     │    │ was lost. Your changes are  │
│ associated data.            │    │ saved locally.              │
│                             │    │                             │
│ Type "My App" to confirm:   │    │ [Try Again]  [Save Offline] │
│ ┌─────────────────────────┐ │    └─────────────────────────────┘
│ │                         │ │
│ └─────────────────────────┘ │
│ [Cancel]     [Delete]       │
└─────────────────────────────┘
```

Key principles:
- Confirm before destructive actions
- Allow undo when possible
- Save work automatically
- Show clear, specific error messages
- Offer suggestions for recovery

### Inclusive Design vs Universal Design

```
UNIVERSAL DESIGN:
  One solution that works for everyone.
  Example: A ramp that serves wheelchair users,
  parents with strollers, and delivery workers.
  ┌─────────────┐
  │ One Design  │ → Works for all users
  └─────────────┘

INCLUSIVE DESIGN:
  Designing WITH diverse users to create multiple
  solutions or flexible adaptations.
  Example: Offering keyboard, mouse, touch, AND
  voice input for the same interface.
  ┌─────────────┐
  │ Flexible    │ → Adapts to different users
  │ Design      │    and contexts
  └─────────────┘

Key difference: Universal design aims for a single
solution. Inclusive design acknowledges that one
solution may not fit all, and provides options.
```

Both approaches are valuable. In practice, web design often uses a combination: build one accessible interface with progressive enhancement and customization options (font size, contrast, motion preferences).

### Accessibility Testing Tools

| Tool                | Type           | Purpose                                    |
|---------------------|----------------|--------------------------------------------|
| axe DevTools        | Browser ext.   | Automated accessibility auditing           |
| Lighthouse          | Chrome DevTools| Performance + accessibility scoring        |
| WAVE                | Browser ext.   | Visual accessibility evaluation            |
| VoiceOver           | macOS/iOS      | Built-in screen reader                     |
| NVDA                | Windows        | Free screen reader                         |
| JAWS                | Windows        | Enterprise screen reader                   |
| Contrast Checker    | Web tool       | Check color contrast ratios                |
| Stark               | Figma plugin   | Contrast + vision simulation in Figma      |
| pa11y               | CLI/CI         | Automated testing in CI pipeline           |
| eslint-plugin-jsx-a11y | ESLint      | Catch a11y issues in JSX at lint time      |

**Testing methodology:**

```
1. AUTOMATED (catches ~30% of issues)
   └─ Run axe, Lighthouse, pa11y
   └─ Fix all reported issues

2. KEYBOARD (catches ~20% more)
   └─ Tab through entire page
   └─ Verify focus order and visibility
   └─ Test all interactions without mouse

3. SCREEN READER (catches ~20% more)
   └─ VoiceOver on Mac, NVDA on Windows
   └─ Navigate by headings, landmarks
   └─ Verify all content is announced

4. MANUAL REVIEW (catches remaining ~30%)
   └─ Check heading hierarchy
   └─ Verify alt text quality
   └─ Test zoom to 200% and 400%
   └─ Check with reduced motion preference
   └─ Test with high contrast mode
```

### Legal Requirements

```
┌────────────────────────────────────────────────────────────┐
│ Law / Regulation       Region      Standard    Applies To  │
├────────────────────────────────────────────────────────────┤
│ ADA (Americans with    USA         WCAG 2.1    Businesses  │
│ Disabilities Act)                  AA          open to     │
│                                                public      │
│                                                            │
│ Section 508            USA         WCAG 2.0    Federal     │
│                                    AA          agencies    │
│                                                            │
│ EAA (European          EU          EN 301 549  Products &  │
│ Accessibility Act)                 (WCAG 2.1)  services    │
│                                                            │
│ AODA                   Ontario,    WCAG 2.0    Orgs with   │
│                        Canada      AA          50+ staff   │
│                                                            │
│ Equality Act 2010      UK          WCAG 2.1    All service │
│                                    AA          providers   │
└────────────────────────────────────────────────────────────┘
```

**Key takeaway:** If your website is public-facing, you should target WCAG 2.1 Level AA. Accessibility lawsuits have increased dramatically -- over 4,000 ADA digital lawsuits were filed in the US in 2023 alone.

### Accessible Component Patterns

#### Accessible Button

```tsx
// Good: semantic button element
<button
  onClick={handleAction}
  aria-label="Close dialog"
  className="min-w-[44px] min-h-[44px] focus-visible:ring-2"
>
  <XIcon aria-hidden="true" />
</button>

// Bad: div pretending to be a button
<div onClick={handleAction} className="cursor-pointer">
  Close
</div>
// Missing: keyboard support, role, focus management
```

#### Accessible Modal

```tsx
function Modal({ isOpen, onClose, title, children }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <h2 id="modal-title" className="text-xl font-bold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px]"
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
```

#### Accessible Form

```tsx
<form onSubmit={handleSubmit} noValidate>
  <div className="space-y-4">
    {/* Label explicitly associated with input */}
    <div>
      <label htmlFor="email" className="block text-sm font-medium">
        Email Address <span aria-hidden="true">*</span>
      </label>
      <input
        id="email"
        type="email"
        required
        aria-required="true"
        aria-invalid={errors.email ? 'true' : 'false'}
        aria-describedby={errors.email ? 'email-error' : 'email-hint'}
        className="mt-1 block w-full rounded-md border px-3 py-2
                   focus-visible:ring-2 focus-visible:ring-primary-500"
      />
      <p id="email-hint" className="mt-1 text-sm text-gray-500">
        We will never share your email.
      </p>
      {errors.email && (
        <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
          <span aria-hidden="true">&#9888;</span> {errors.email}
        </p>
      )}
    </div>

    <button
      type="submit"
      className="px-6 py-3 min-h-[44px] bg-primary-500 text-white rounded-md
                 focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      Submit
    </button>
  </div>
</form>
```

#### Respecting Motion Preferences

```css
/* Reduce motion for users who prefer it */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```tsx
// In React with Framer Motion
import { useReducedMotion } from 'framer-motion';

function AnimatedCard({ children }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}
```

#### Skip Navigation Link

```tsx
function SkipLink() {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4 focus:z-[100]
        focus:px-4 focus:py-2 focus:bg-white focus:text-black
        focus:rounded-md focus:shadow-lg focus:outline-2
      "
    >
      Skip to main content
    </a>
  );
}

// In layout:
<body>
  <SkipLink />
  <header>...</header>
  <main id="main-content" tabIndex={-1}>
    ...
  </main>
</body>
```

---

## Practical Examples

### Accessible Card Component

```tsx
interface CardProps {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly tags: ReadonlyArray<string>;
}

function ProjectCard({ title, description, href, tags }: CardProps) {
  return (
    <article className="rounded-lg border p-6 hover:shadow-lg transition-shadow">
      <h3 className="text-lg font-semibold">
        <a
          href={href}
          className="
            after:absolute after:inset-0
            focus-visible:outline-2 focus-visible:outline-primary-500
            focus-visible:outline-offset-4 focus-visible:rounded-lg
          "
        >
          {title}
        </a>
      </h3>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label={`Technologies: ${tags.join(', ')}`}>
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
```

### Color System with Accessibility Built In

```
Designing an accessible color palette:

Step 1: Choose base colors
  Primary:   #2563EB (blue-600)
  Surface:   #FFFFFF
  Text:      #111827

Step 2: Verify contrast ratios
  Text on Surface:    #111827 on #FFFFFF = 17.4:1  ✓ AAA
  Primary on Surface: #2563EB on #FFFFFF = 4.6:1   ✓ AA
  White on Primary:   #FFFFFF on #2563EB = 4.6:1   ✓ AA

Step 3: Create dark mode equivalents
  Primary:   #60A5FA (blue-400)
  Surface:   #0F172A
  Text:      #F1F5F9

Step 4: Verify dark mode contrast
  Text on Surface:    #F1F5F9 on #0F172A = 14.5:1  ✓ AAA
  Primary on Surface: #60A5FA on #0F172A = 6.3:1   ✓ AA
```

### Accessible Theme Toggle

```tsx
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="
        relative inline-flex items-center justify-center
        min-w-[44px] min-h-[44px] rounded-lg
        hover:bg-gray-100 dark:hover:bg-gray-800
        focus-visible:ring-2 focus-visible:ring-primary-500
        focus-visible:ring-offset-2
        transition-colors
      "
    >
      {isDark ? (
        <SunIcon className="w-5 h-5" aria-hidden="true" />
      ) : (
        <MoonIcon className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
```

---

## Common Interview Questions

### Q1: What are the four WCAG principles and what does each mean?

**Perceivable**: Information must be presentable in ways users can perceive. This includes alt text for images, captions for video, sufficient color contrast, and content that can be presented in different ways (e.g., screen reader compatible).

**Operable**: Users must be able to operate the interface. All functionality must be available via keyboard, users get enough time to interact, content does not cause seizures, and navigation is clear.

**Understandable**: Content and operation must be understandable. Text is readable, pages behave predictably, and users get help with errors.

**Robust**: Content must be robust enough to work with current and future assistive technologies. This means valid HTML, proper ARIA usage, and semantic markup.

### Q2: What is the difference between Level A, AA, and AAA?

**Level A** is the bare minimum. Without meeting Level A, many users with disabilities cannot use the site at all. Examples: alt text for images, keyboard accessibility, no keyboard traps.

**Level AA** is the industry standard and legal requirement in most jurisdictions. It adds color contrast requirements (4.5:1), visible focus indicators, consistent navigation, and error identification.

**Level AAA** is the highest level and often impractical for all content (e.g., requires 7:1 contrast, sign language for all media). Organizations target AAA for specific features rather than entire sites.

### Q3: How do you ensure sufficient color contrast?

1. Use a contrast checker tool (WebAIM, Stark, Chrome DevTools) during design
2. Meet minimum ratios: 4.5:1 for normal text, 3:1 for large text (AA level)
3. Test both light and dark themes independently
4. Never use color alone to convey meaning -- always pair with text, icons, or patterns
5. Test with color blindness simulators (protanopia, deuteranopia, tritanopia)
6. Ensure placeholder text also meets contrast requirements

### Q4: How should focus indicators be designed?

Focus indicators must be:
- **Visible**: High contrast against surrounding elements (at least 3:1)
- **Distinct**: Clearly different from hover states
- **Consistent**: Same style across all interactive elements
- **Non-removable**: Never use `outline: none` without a replacement

Best practice is to use `:focus-visible` (which only shows focus for keyboard navigation) with a 2px solid outline in a contrasting color, offset by 2px. This avoids showing focus rings on mouse clicks while keeping them for keyboard users.

### Q5: What is the difference between inclusive design and universal design?

**Universal design** creates one solution that works for the widest possible audience. It comes from architecture (ramps, automatic doors). In digital design, this might mean one layout that works for all screen readers, keyboards, and mice.

**Inclusive design** goes further by designing *with* people who have diverse abilities, not just *for* them. It acknowledges that a single solution may not fit all and provides flexibility -- multiple input methods, customizable font sizes, adjustable motion, high contrast modes.

In practice, web accessibility combines both: a single accessible baseline (universal) with user preferences and options (inclusive).

### Q6: How do you make a modal accessible?

1. **Focus management**: Move focus into the modal when it opens; return focus to the trigger when it closes
2. **Focus trap**: Tab should cycle within the modal, not escape to background content
3. **ARIA attributes**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title
4. **Escape key**: Pressing Escape closes the modal
5. **Background inert**: Content behind the modal should not be interactive (use `inert` attribute or `aria-hidden`)
6. **Backdrop click**: Clicking the backdrop should close the modal
7. **Reduced motion**: Animate open/close only if user has not set `prefers-reduced-motion`

### Q7: What tools do you use for accessibility testing?

I use a layered approach:
1. **Linting**: `eslint-plugin-jsx-a11y` catches issues at development time
2. **Automated scanning**: axe DevTools and Lighthouse for automated WCAG checks
3. **Keyboard testing**: Tab through every interactive element manually
4. **Screen reader testing**: VoiceOver (Mac) and NVDA (Windows) for real user experience
5. **Contrast checking**: WebAIM Contrast Checker or Stark plugin
6. **CI integration**: pa11y or axe-core in the CI pipeline to prevent regressions

Automated tools catch about 30% of accessibility issues. The remaining 70% requires manual testing, especially keyboard navigation, screen reader behavior, and content quality (alt text accuracy, heading hierarchy, plain language).

### Q8: What are ARIA roles and when should you use them?

ARIA (Accessible Rich Internet Applications) provides attributes that add meaning to elements for assistive technologies. Common roles include `button`, `dialog`, `alert`, `tab`, `tabpanel`, `navigation`, and `menu`.

**The first rule of ARIA: do not use ARIA if a native HTML element provides the behavior.** For example, use `<button>` instead of `<div role="button">`. Native elements come with keyboard support and screen reader compatibility built in.

Use ARIA when:
- Building custom widgets that have no native HTML equivalent (tabs, accordions, carousels)
- Providing additional context (aria-label, aria-describedby)
- Managing dynamic content (aria-live for announcements)
- Connecting related elements (aria-controls, aria-owns)

---

## Applying to Your Portfolio

### For a Next.js + Tailwind + Framer Motion Portfolio

1. **Add a skip link**
   - Add a "Skip to main content" link as the first focusable element
   - Use Tailwind's `sr-only` and `focus:not-sr-only` classes

2. **Audit heading hierarchy**
   - Ensure each page has exactly one `<h1>`
   - Section headers (Experience, Skills, Education) should be `<h2>`
   - Sub-items within sections should be `<h3>`

3. **Add landmark regions**
   - Use `<header>`, `<nav>`, `<main>`, `<footer>` semantic elements
   - Add `aria-label` to `<section>` elements for screen reader navigation

4. **Check color contrast**
   - Run your light and dark themes through a contrast checker
   - Pay attention to muted text colors and border colors
   - Ensure the theme toggle icon has sufficient contrast in both themes

5. **Respect motion preferences**
   - Use Framer Motion's `useReducedMotion` hook
   - Disable or reduce the animated background for users who prefer reduced motion
   - Disable the custom cursor animation for reduced motion preference

6. **Make interactive elements accessible**
   - Ensure all buttons and links are at least 44x44px
   - Add `aria-label` to icon-only buttons (theme toggle, language selector, social links)
   - Ensure visible focus indicators on all interactive elements

7. **Test with keyboard and VoiceOver**
   - Tab through your entire portfolio
   - Verify every section is reachable and content is announced properly
   - Test the language selector and theme toggle with keyboard only

8. **Add `lang` attribute**
   - Your i18n setup should set `<html lang="en">` or `<html lang="zh">` based on the active locale
   - This helps screen readers use the correct pronunciation

---

## Quick Reference

```
WCAG PRINCIPLES (POUR):
  Perceivable | Operable | Understandable | Robust

CONFORMANCE LEVELS:
  A (minimum) → AA (standard target) → AAA (enhanced)

CONTRAST RATIOS (AA):
  Normal text:  4.5:1
  Large text:   3:1
  UI elements:  3:1

HEADING RULES:
  One <h1> per page | Never skip levels | Describe content

LANDMARKS:
  <header> <nav> <main> <section> <aside> <footer>

KEYBOARD:
  Tab / Shift+Tab: navigate
  Enter/Space: activate
  Escape: close/dismiss
  Arrow keys: within components

FOCUS INDICATORS:
  :focus-visible { outline: 2px solid color; outline-offset: 2px; }
  NEVER remove without replacement

TOUCH TARGETS:
  Minimum: 44x44px (WCAG)
  Spacing: >= 8px between targets

ARIA FIRST RULE:
  Use native HTML elements before ARIA
  <button> not <div role="button">

COLOR:
  Never use color alone to convey meaning
  Always pair with text, icons, or patterns

MOTION:
  Respect prefers-reduced-motion
  useReducedMotion() in Framer Motion

TESTING LAYERS:
  1. Automated (axe, Lighthouse)      ~30%
  2. Keyboard navigation              ~20%
  3. Screen reader                    ~20%
  4. Manual review                    ~30%

LEGAL:
  ADA (US) | Section 508 (US Gov) | EAA (EU) | AODA (Canada)
  Target: WCAG 2.1 Level AA

ALT TEXT:
  Informative: describe content
  Decorative: alt=""
  Linked: describe destination
  Complex: use aria-describedby
```
