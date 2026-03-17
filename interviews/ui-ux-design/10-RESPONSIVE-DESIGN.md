# Responsive & Adaptive Design

## Overview

Responsive design is the practice of building interfaces that adapt fluidly to any screen size, orientation, and input method. In a world where users access the web from phones, tablets, laptops, desktops, TVs, and even watches, a fixed-width layout is a dead end.

This topic matters because:

- **Over 60% of web traffic** comes from mobile devices globally
- Google uses **mobile-first indexing**, meaning your mobile experience directly impacts SEO
- Users expect a seamless experience regardless of device
- Poor responsive design leads to high bounce rates and lost conversions

This guide covers the full spectrum of responsive design: philosophy, breakpoints, fluid techniques, responsive media, navigation patterns, and testing strategies.

---

## Core Concepts

### Mobile-First vs Desktop-First

**Mobile-first** means you start designing and coding for the smallest screen, then progressively enhance for larger viewports. **Desktop-first** means you start with the full experience and strip things away for smaller screens.

```
Mobile-First Approach:
┌─────────┐
│ Base    │  <- Default styles (mobile)
│ Styles  │
└────┬────┘
     │ @media (min-width: 768px)
     ▼
┌──────────────┐
│ Tablet       │  <- Enhanced layout
│ Enhancements │
└────┬─────────┘
     │ @media (min-width: 1024px)
     ▼
┌───────────────────┐
│ Desktop           │  <- Full experience
│ Enhancements      │
└───────────────────┘

Desktop-First Approach:
┌───────────────────┐
│ Base Styles       │  <- Default (desktop)
│ Full Experience   │
└────┬──────────────┘
     │ @media (max-width: 1023px)
     ▼
┌──────────────┐
│ Tablet       │  <- Reduced layout
│ Overrides    │
└────┬─────────┘
     │ @media (max-width: 767px)
     ▼
┌─────────┐
│ Mobile  │  <- Stripped down
│ Overrides│
└─────────┘
```

**Why mobile-first wins:**

1. Forces you to prioritize content and features
2. Progressive enhancement is more robust than graceful degradation
3. Smaller base CSS payload for mobile users on slower networks
4. Aligns with how CSS cascade works (later rules override earlier ones)

### Breakpoint Strategy

#### Common Breakpoints

These are widely used breakpoints based on device categories:

```
Device              Width Range        Common Breakpoint
─────────────────────────────────────────────────────────
Small phone         320px - 374px      -
Phone               375px - 767px      640px (sm)
Tablet portrait     768px - 1023px     768px (md)
Tablet landscape    1024px - 1279px    1024px (lg)
Laptop              1280px - 1535px    1280px (xl)
Desktop             1536px+            1536px (2xl)
```

Tailwind CSS default breakpoints:

```css
/* sm */  @media (min-width: 640px)  { ... }
/* md */  @media (min-width: 768px)  { ... }
/* lg */  @media (min-width: 1024px) { ... }
/* xl */  @media (min-width: 1280px) { ... }
/* 2xl */ @media (min-width: 1536px) { ... }
```

#### Content-Driven Breakpoints

The best practice is to set breakpoints where your **content breaks**, not at device widths. Resize your browser and add a breakpoint wherever the layout looks awkward.

```
"Start with the small screen first, then expand until it looks like crap.
 Time for a breakpoint!"
  — Stephen Hay
```

### Fluid Design Techniques

#### Percentage-Based Layouts

```css
.container {
  width: 90%;
  max-width: 1200px;
  margin: 0 auto;
}

.sidebar { width: 30%; }
.main    { width: 70%; }
```

#### Viewport Units

| Unit | Description                        |
|------|------------------------------------|
| vw   | 1% of viewport width               |
| vh   | 1% of viewport height              |
| vmin | 1% of the smaller dimension        |
| vmax | 1% of the larger dimension         |
| dvh  | Dynamic viewport height (mobile)   |
| svh  | Small viewport height              |
| lvh  | Large viewport height              |

**Important:** On mobile, `vh` includes the browser chrome (address bar). Use `dvh` for layouts that should fill the visible area.

#### The clamp() Function

`clamp()` creates fluid values that scale between a minimum and maximum:

```css
/* clamp(minimum, preferred, maximum) */

.title {
  font-size: clamp(1.5rem, 4vw, 3rem);
  /* At narrow viewports: 1.5rem
     Scales with viewport: 4vw
     At wide viewports: caps at 3rem */
}

.container {
  width: clamp(320px, 90%, 1200px);
  padding: clamp(1rem, 3vw, 3rem);
}
```

The formula for a fluid value between two breakpoints:

```
preferred = minimum + (maximum - minimum) *
            (100vw - minViewport) / (maxViewport - minViewport)
```

### CSS Container Queries

Container queries let components respond to their **parent container's size** rather than the viewport. This is a game-changer for reusable components.

```css
.card-wrapper {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}

@container card (max-width: 399px) {
  .card {
    display: flex;
    flex-direction: column;
  }
}
```

```
Container < 400px:         Container >= 400px:
┌──────────────┐           ┌──────────────────────┐
│   [Image]    │           │ [Image] │ Title      │
│              │           │         │ Description│
│ Title        │           │         │ Link ->    │
│ Description  │           └──────────────────────┘
│ Link ->      │
└──────────────┘
```

### Responsive Images

#### srcset and sizes

```html
<img
  src="photo-800.jpg"
  srcset="
    photo-400.jpg   400w,
    photo-800.jpg   800w,
    photo-1200.jpg 1200w,
    photo-1600.jpg 1600w
  "
  sizes="
    (max-width: 640px) 100vw,
    (max-width: 1024px) 50vw,
    33vw
  "
  alt="Descriptive alt text"
/>
```

- `srcset` tells the browser which image files are available and their widths
- `sizes` tells the browser how wide the image will be displayed at each breakpoint
- The browser picks the optimal image based on device pixel ratio and viewport

#### The picture Element and Art Direction

```html
<picture>
  <!-- Cropped portrait version for mobile -->
  <source
    media="(max-width: 767px)"
    srcset="hero-mobile.jpg"
  />
  <!-- Wide landscape version for desktop -->
  <source
    media="(min-width: 768px)"
    srcset="hero-desktop.jpg"
  />
  <img src="hero-desktop.jpg" alt="Hero image" />
</picture>
```

Art direction means serving **different image compositions** (not just different sizes) for different viewports.

### Touch Targets

Minimum touch target sizes per platform guidelines:

```
┌──────────────────────────────────────────┐
│ Platform      Minimum Size   Recommended │
├──────────────────────────────────────────┤
│ WCAG 2.1     44 x 44 px     -           │
│ Apple (iOS)  44 x 44 pt     -           │
│ Material     48 x 48 dp     -           │
│ Windows      40 x 40 px     -           │
└──────────────────────────────────────────┘
```

Key rules:

- Buttons, links, and interactive elements must be at least **44x44px**
- Spacing between touch targets should be at least **8px**
- Thumb-friendly zones on mobile (bottom of screen is easiest to reach)

```
Phone Thumb Reachability:
┌─────────────────┐
│  Hard to reach  │  <- Top of screen
│                 │
│  Okay           │  <- Middle
│                 │
│  Easy to reach  │  <- Bottom (thumb zone)
│ [  Nav  Bar   ] │
└─────────────────┘
```

### Responsive Typography

Use a fluid type scale that adapts to viewport width:

```css
:root {
  --text-xs:   clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
  --text-sm:   clamp(0.875rem, 0.8rem  + 0.35vw, 1rem);
  --text-base: clamp(1rem,     0.9rem  + 0.5vw,  1.125rem);
  --text-lg:   clamp(1.125rem, 1rem    + 0.6vw,  1.25rem);
  --text-xl:   clamp(1.25rem,  1rem    + 1.2vw,  1.75rem);
  --text-2xl:  clamp(1.5rem,   1rem    + 2vw,    2.5rem);
  --text-3xl:  clamp(1.875rem, 1rem    + 3vw,    3.5rem);
}
```

Best practices:

- Use `rem` for font sizes (respects user browser settings)
- Line length should be **45-75 characters** for readability
- Increase line-height at smaller sizes (1.5-1.7 for body text)
- Reduce heading sizes on mobile; keep hierarchy intact

### Responsive Navigation Patterns

#### Hamburger Menu

The most common mobile pattern. Full navigation is hidden behind a menu icon.

```
Desktop:                    Mobile:
┌──────────────────────┐    ┌──────────────┐
│ Logo  Home About ... │    │ Logo    [☰]  │
└──────────────────────┘    └──────────────┘
                                   │ tap
                            ┌──────────────┐
                            │ Home         │
                            │ About        │
                            │ Projects     │
                            │ Contact      │
                            └──────────────┘
```

#### Priority+ Navigation

Shows as many items as fit, puts the rest in a "More" dropdown:

```
Wide:    [Home] [About] [Projects] [Blog] [Contact]
Medium:  [Home] [About] [Projects] [More ▾]
Narrow:  [Home] [About] [More ▾]
```

#### Bottom Navigation (Mobile)

Fixed navigation at the bottom of the screen, within thumb reach:

```
┌─────────────────────┐
│                     │
│    Page Content     │
│                     │
├─────────────────────┤
│ 🏠  📁  ➕  💬  👤  │  <- Bottom nav
└─────────────────────┘
```

Best for apps with 3-5 primary destinations.

### Responsive Tables and Data-Heavy Content

Tables are notoriously hard to make responsive. Common patterns:

#### Horizontal Scroll

```css
.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

#### Card Pattern (Stacked)

On mobile, each row becomes a card with label-value pairs:

```
Desktop:                         Mobile:
┌──────┬────────┬───────┐        ┌─────────────────┐
│ Name │ Role   │ Email │        │ Name: Alice     │
├──────┼────────┼───────┤        │ Role: Engineer  │
│Alice │Engineer│a@b.co │        │ Email: a@b.co   │
│Bob   │Designer│b@b.co │        ├─────────────────┤
└──────┴────────┴───────┘        │ Name: Bob       │
                                 │ Role: Designer  │
                                 │ Email: b@b.co   │
                                 └─────────────────┘
```

```css
@media (max-width: 640px) {
  table, thead, tbody, th, td, tr {
    display: block;
  }
  thead { display: none; }
  td::before {
    content: attr(data-label);
    font-weight: bold;
    display: block;
  }
}
```

### Testing Across Devices

**Tools for responsive testing:**

| Tool                    | Purpose                              |
|-------------------------|--------------------------------------|
| Chrome DevTools         | Device emulation, throttling         |
| Firefox Responsive Mode | Built-in responsive testing          |
| BrowserStack            | Real device testing in the cloud     |
| Responsively            | View multiple viewports at once      |
| Lighthouse              | Performance + mobile audit           |

**Testing checklist:**

- [ ] Test at every breakpoint and in between
- [ ] Test on actual physical devices (not just emulators)
- [ ] Test both portrait and landscape orientations
- [ ] Test with zoom levels (200%, 400%)
- [ ] Test with large/small default font sizes
- [ ] Test touch interactions on real touch devices
- [ ] Test with slow network (3G throttling)

---

## Practical Examples

### Fluid Grid with Tailwind CSS

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
  {projects.map((project) => (
    <div
      key={project.id}
      className="rounded-lg border p-6 hover:shadow-lg transition-shadow"
    >
      <h3 className="text-lg font-semibold">{project.title}</h3>
      <p className="mt-2 text-sm text-gray-600">{project.description}</p>
    </div>
  ))}
</div>
```

```
Mobile (1 col):    Tablet (2 col):       Desktop (3 col):
┌──────────┐      ┌──────┬──────┐       ┌────┬────┬────┐
│  Card 1  │      │Card 1│Card 2│       │ C1 │ C2 │ C3 │
├──────────┤      ├──────┼──────┤       ├────┼────┼────┤
│  Card 2  │      │Card 3│Card 4│       │ C4 │ C5 │ C6 │
├──────────┤      └──────┴──────┘       └────┴────┴────┘
│  Card 3  │
└──────────┘
```

### Responsive Hero Section

```jsx
function Hero({ title, subtitle }) {
  return (
    <section className="min-h-[80dvh] flex items-center px-4 sm:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto text-center lg:text-left">
        <h1
          className="
            text-3xl sm:text-4xl lg:text-6xl
            font-bold leading-tight
          "
          style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
        >
          {title}
        </h1>
        <p className="mt-4 text-base sm:text-lg lg:text-xl text-gray-600 max-w-[65ch]">
          {subtitle}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
          <button className="px-8 py-3 min-h-[44px] bg-black text-white rounded-lg">
            View Projects
          </button>
          <button className="px-8 py-3 min-h-[44px] border border-black rounded-lg">
            Contact Me
          </button>
        </div>
      </div>
    </section>
  );
}
```

### Responsive Navigation with Framer Motion

```jsx
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

function MobileNav({ links }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="lg:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 min-w-[44px] min-h-[44px]"
        aria-expanded={isOpen}
        aria-label="Toggle navigation menu"
      >
        <span className="sr-only">Menu</span>
        {/* Hamburger icon */}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 bg-white shadow-lg"
          >
            <ul className="flex flex-col p-4">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="block py-3 px-4 min-h-[44px] text-lg"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
```

---

## Common Interview Questions

### Q1: What is the difference between responsive and adaptive design?

**Responsive design** uses fluid grids, flexible images, and CSS media queries to create a layout that continuously adapts to the viewport. The layout is fluid -- it stretches and reflows at every pixel width.

**Adaptive design** uses predefined layouts for specific screen sizes (e.g., 320px, 768px, 1024px). The page "snaps" between these fixed layouts. It can feel less smooth but gives designers precise control at each breakpoint.

In practice, most modern sites use a **hybrid** approach: fluid layouts with strategic breakpoints where the layout shifts significantly.

### Q2: Why is mobile-first recommended over desktop-first?

1. **Performance**: Mobile users get only the CSS they need; desktop enhancements are loaded progressively
2. **Content priority**: Forces you to decide what is essential, leading to cleaner designs
3. **Progressive enhancement**: Adding features is more reliable than removing them
4. **CSS cascade**: `min-width` queries naturally layer on top of base styles without conflicts
5. **SEO**: Google's mobile-first indexing favors sites optimized for mobile

### Q3: How does clamp() work and when would you use it?

`clamp(min, preferred, max)` returns the preferred value, clamped between the min and max. It is evaluated as `max(min, min(preferred, max))`.

Use cases:
- **Fluid typography**: `font-size: clamp(1rem, 2.5vw, 2rem)` scales text smoothly
- **Fluid spacing**: `padding: clamp(1rem, 5vw, 4rem)` adjusts padding fluidly
- **Fluid widths**: `width: clamp(300px, 50%, 600px)` constrains element width

It replaces the need for multiple media queries for gradual size changes.

### Q4: What are container queries and how do they differ from media queries?

**Media queries** respond to the **viewport** (browser window) size. **Container queries** respond to the **parent container** size.

Container queries are superior for reusable components because the same component can adapt differently depending on where it is placed in the layout -- a card in a sidebar behaves differently than the same card in a full-width area, without any viewport-level logic.

```css
.wrapper { container-type: inline-size; }

@container (min-width: 500px) {
  .card { flex-direction: row; }
}
```

### Q5: How do you handle responsive images for performance?

1. **Use `srcset` with width descriptors** to provide multiple resolutions
2. **Use `sizes` attribute** to tell the browser how wide the image will be displayed
3. **Use the `<picture>` element** for art direction (different crops per breakpoint)
4. **Use modern formats** (WebP, AVIF) with `<source>` fallbacks
5. **Lazy load** images below the fold with `loading="lazy"`
6. **Set explicit width and height** to prevent Cumulative Layout Shift (CLS)
7. For Next.js, use the `next/image` component which handles optimization automatically

### Q6: What is the minimum touch target size and why?

The minimum is **44x44 CSS pixels** per WCAG 2.1 (Success Criterion 2.5.5). Apple recommends 44x44 points, and Material Design recommends 48x48 dp.

This matters because:
- Fingers are imprecise input devices (average fingertip is ~10mm or ~40px)
- Small targets cause accidental taps, frustration, and accessibility barriers
- Users with motor impairments need even larger targets
- Adequate spacing between targets prevents mis-taps

### Q7: How do you test responsive designs effectively?

1. **Browser DevTools** -- Quick viewport resizing and device emulation
2. **Real devices** -- Emulators miss touch nuances, real scroll behavior, and browser quirks
3. **BrowserStack/Sauce Labs** -- Cloud-based real device testing
4. **Lighthouse audit** -- Checks mobile friendliness, performance, and accessibility
5. **Resize testing** -- Slowly drag the browser edge; look for content that overflows, overlaps, or breaks
6. **Zoom testing** -- WCAG requires content to work at 200% and 400% zoom
7. **Network throttling** -- Test on simulated 3G to catch heavy assets

### Q8: What are common responsive design mistakes?

- Using `px` for font sizes instead of `rem`
- Hiding important content on mobile instead of reorganizing it
- Not testing between breakpoints (only testing at exact breakpoint widths)
- Fixed-width elements that overflow on small screens
- Ignoring landscape orientation on mobile
- Touch targets smaller than 44px
- Not accounting for dynamic viewport height on mobile (browser chrome)
- Loading desktop-sized images on mobile

---

## Applying to Your Portfolio

### For a Next.js + Tailwind + Framer Motion Portfolio

1. **Use Tailwind's responsive prefixes consistently**
   - Design your sections mobile-first: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
   - Use `clamp()` for hero text instead of multiple breakpoint overrides

2. **Implement a responsive navbar**
   - Desktop: horizontal links with theme toggle and language selector
   - Mobile: hamburger menu with Framer Motion slide animation
   - Ensure all nav links and toggles are at least 44x44px

3. **Optimize your experience timeline**
   - Desktop: two-column layout with timeline in the center
   - Mobile: single-column stacked cards
   - Use container queries if cards appear in different contexts

4. **Responsive skill tags**
   - Use `flex-wrap` so tags flow naturally on narrow screens
   - Keep touch targets adequate on mobile

5. **Test your portfolio on real phones**
   - Check that the animated background performs well on mobile
   - Verify the custom cursor is hidden on touch devices
   - Test the language selector on small screens

6. **Use `dvh` for full-height hero sections**
   - Replace `100vh` with `100dvh` to account for mobile browser chrome

7. **Add responsive images**
   - If you have project screenshots, use `next/image` with proper sizing
   - Consider art direction for project thumbnails (different crops)

---

## Quick Reference

```
BREAKPOINTS (Tailwind defaults):
  sm: 640px | md: 768px | lg: 1024px | xl: 1280px | 2xl: 1536px

MOBILE-FIRST:
  Base styles = mobile → Add min-width queries for larger screens

FLUID VALUES:
  clamp(min, preferred, max)
  font-size: clamp(1rem, 2.5vw, 2rem)
  width: clamp(300px, 90%, 1200px)

VIEWPORT UNITS:
  vw, vh      → relative to viewport
  dvh, svh    → dynamic/small viewport height (mobile-safe)

CONTAINER QUERIES:
  container-type: inline-size;
  @container (min-width: 400px) { ... }

TOUCH TARGETS:
  Minimum: 44x44px (WCAG) | 48x48dp (Material)
  Spacing between targets: >= 8px

RESPONSIVE IMAGES:
  srcset → multiple resolutions
  sizes  → display width hints
  <picture> → art direction

TYPOGRAPHY:
  Use rem, not px
  Line length: 45-75 characters
  Fluid scale with clamp()

TESTING:
  DevTools | Real devices | BrowserStack
  Lighthouse | Zoom (200%) | 3G throttling

NAVIGATION PATTERNS:
  Hamburger | Priority+ | Bottom nav (mobile)
```
