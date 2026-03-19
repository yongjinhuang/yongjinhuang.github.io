# Dark Mode & Theming

## Overview

Dark mode has evolved from a niche developer preference to a mainstream expectation. Over 80% of users report using dark mode on at least one device. For frontend developers, implementing a robust theming system is no longer optional — it is a core competency.

This guide covers the **why** and **how** of dark mode and theming: the rationale behind dark interfaces, the architecture of scalable theme systems, contrast and accessibility in dark contexts, and the practical tooling (CSS custom properties, Tailwind CSS, next-themes) that makes it all work.

### What You Will Learn

- Why dark mode matters beyond aesthetics
- How to architect a theme system using design tokens
- Contrast and color considerations specific to dark mode
- Elevation, depth, and surface hierarchy in dark themes
- Typography, images, and media adaptation
- Smooth theme transitions without flash-of-incorrect-theme (FOIT)
- Testing strategies for multi-theme applications
- Common mistakes and how to avoid them

---

## Core Concepts

### Why Dark Mode Matters

**User Preference & Comfort**
Many users prefer dark interfaces in low-light environments. A dark UI reduces overall screen luminance, which can reduce eye strain during extended use. Studies show that users who choose dark mode tend to keep it enabled across all applications.

**OLED Battery Savings**
On OLED and AMOLED displays, black pixels are literally turned off. A truly dark interface (using `#000000` or near-black backgrounds) can reduce battery consumption by 30-60% compared to a white UI. This is a tangible performance benefit on mobile devices.

**Accessibility**
Some users with photosensitivity, migraines, or certain visual impairments find dark interfaces more comfortable. Dark mode can also reduce the "glow" effect that bright screens produce in dark rooms, which affects users with astigmatism.

**Brand & Aesthetic**
Dark interfaces convey a premium, focused aesthetic. Media-heavy applications (photo galleries, video platforms, design tools) benefit from dark surrounds that let content stand out.

### Theme Architecture

A well-architected theme system separates **design decisions** from **implementation details**. The standard approach uses three layers:

```
+--------------------------------------------------+
|  Layer 1: Design Tokens (semantic names)         |
|  --color-bg-primary, --color-text-primary        |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  Layer 2: Theme Definitions (token assignments)  |
|  light: --color-bg-primary = #FFFFFF             |
|  dark:  --color-bg-primary = #1A1A2E             |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  Layer 3: Component Styles (consume tokens)      |
|  background: var(--color-bg-primary)             |
+--------------------------------------------------+
```

**Layer 1: Design Tokens**
Semantic names that describe the role of a color, not its value. Use names like `bg-primary`, `text-secondary`, `border-subtle` — never `gray-900` or `white`.

**Layer 2: Theme Definitions**
Each theme maps semantic tokens to concrete values. A light theme maps `bg-primary` to white; a dark theme maps it to a dark surface color.

**Layer 3: Component Consumption**
Components reference only semantic tokens. They never hardcode color values and never reference raw palette colors directly.

### CSS Custom Properties for Theming

CSS custom properties (variables) are the foundation of modern theming:

```css
/* Define tokens at the root level */
:root {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-bg-elevated: #ffffff;
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #6b7280;
  --color-border: #e5e7eb;
  --color-accent: #6c63ff;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Override tokens for dark theme */
[data-theme='dark'] {
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-elevated: #222244;
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #9ca3af;
  --color-border: #2d2d5e;
  --color-accent: #8b83ff;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
}
```

### Building a Color Token System

A production-ready token system has multiple tiers:

```
Palette (raw colors)
  gray-50: #F9FAFB
  gray-900: #111827
  purple-500: #6C63FF

Semantic Tokens (role-based)
  bg-primary       -> light: gray-50,   dark: gray-900
  text-primary     -> light: gray-900,  dark: gray-100
  accent           -> light: purple-500, dark: purple-400

Component Tokens (scoped)
  card-bg          -> bg-elevated
  card-border      -> border-subtle
  button-primary   -> accent
```

This three-tier approach means you can:

- Change your entire palette without touching semantic tokens
- Add new themes (high contrast, sepia) by adding new semantic mappings
- Keep components completely theme-agnostic

### Tailwind CSS Dark Mode

Tailwind provides a `dark:` variant prefix that applies styles when dark mode is active:

```jsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h1 className="text-2xl font-bold">Hello</h1>
  <p className="text-gray-600 dark:text-gray-400">This adapts to the theme.</p>
</div>
```

Tailwind supports two dark mode strategies in `tailwind.config.ts`:

```typescript
// Strategy 1: Media query (follows OS preference)
module.exports = {
  darkMode: 'media',
};

// Strategy 2: Class-based (manual toggle, recommended)
module.exports = {
  darkMode: 'class',
};
```

Class-based is recommended because it allows user override of OS preference and works with next-themes.

### next-themes Integration

`next-themes` handles theme persistence, SSR hydration, and flash prevention:

```tsx
// app/layout.tsx (or providers wrapper)
import { ThemeProvider } from 'next-themes';

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Key `ThemeProvider` props:

- `attribute="class"` — adds `dark` class to `<html>`, works with Tailwind
- `defaultTheme="system"` — respects OS preference initially
- `enableSystem` — enables OS preference detection (default true)
- `storageKey` — localStorage key for persistence

### Contrast Considerations — Don't Just Invert

The most common dark mode mistake is inverting all colors. Dark mode is **not** light mode with swapped foreground and background. Key differences:

**Reduced Contrast for Body Text**
In light mode, pure black text on white (`#000 on #FFF`, ratio 21:1) is comfortable. In dark mode, pure white text on black is harsh and causes halation (glow around text). Reduce contrast to around 15:1 by using off-white text (`#E0E0E0`) on dark surfaces (`#1A1A2E`).

**Accent Color Adjustments**
Colors that work on light backgrounds often need lightening for dark backgrounds. A blue that passes WCAG on white may fail on dark gray. Always verify contrast ratios per theme.

```
Light mode:    Dark mode:
#6C63FF        #8B83FF  (lighter variant)
on #FFFFFF     on #1A1A2E
Ratio: 5.2:1   Ratio: 5.8:1
  PASS            PASS
```

**Desaturation for Comfort**
Highly saturated colors on dark backgrounds cause visual vibration. Slightly desaturate accent colors in dark mode for a more comfortable reading experience.

### Elevation and Depth in Dark Mode

In Material Design's dark theme specification, **lighter surfaces are higher in elevation**. This is the opposite of light mode, where shadows indicate elevation.

```
Dark Mode Surface Hierarchy:

  +---------------------------------------+  Highest (dp 24)
  |  Surface: #3A3A5C                     |  Dialog/Modal
  |  +-------------------------------+    |
  |  |  Surface: #2D2D52             |    |  Card (dp 8)
  |  |  +------------------------+   |    |
  |  |  |  Surface: #222244      |   |    |  App bar (dp 4)
  |  |  +------------------------+   |    |
  |  +-------------------------------+    |
  +---------------------------------------+
  Background: #1A1A2E                        Base (dp 0)
```

Each elevation level adds a semi-transparent white overlay:

```css
/* Dark mode elevation surfaces */
.surface-0 {
  background: #1a1a2e;
} /* dp 0  */
.surface-1 {
  background: color-mix(in srgb, #1a1a2e, white 5%);
} /* dp 1  */
.surface-2 {
  background: color-mix(in srgb, #1a1a2e, white 7%);
} /* dp 3  */
.surface-3 {
  background: color-mix(in srgb, #1a1a2e, white 8%);
} /* dp 6  */
.surface-4 {
  background: color-mix(in srgb, #1a1a2e, white 9%);
} /* dp 8  */
.surface-5 {
  background: color-mix(in srgb, #1a1a2e, white 11%);
} /* dp 12 */
```

### Dark Mode Typography

- **Font Weight**: Consider slightly increasing font weight (or using `font-smoothing: antialiased`) in dark mode. Light text on dark backgrounds can appear thinner than the same weight on light backgrounds.
- **Line Height**: Maintain the same line height. No changes needed.
- **Letter Spacing**: Very thin fonts may benefit from slightly increased letter spacing in dark mode.

```css
@media (prefers-color-scheme: dark) {
  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

### Images and Illustrations in Dark Mode

Images need consideration in dark mode:

- **Photos**: Generally fine as-is. Optionally reduce brightness slightly.
- **Screenshots with white backgrounds**: Can be jarring. Add a subtle border or rounded corners with a dark surround.
- **SVG illustrations**: Swap fill colors using CSS custom properties or provide alternate versions.
- **Logos**: Provide light and dark variants.

```tsx
// Conditional image rendering
function Logo({ theme }) {
  return (
    <img
      src={theme === 'dark' ? '/logo-light.svg' : '/logo-dark.svg'}
      alt="Logo"
    />
  );
}

// CSS approach for SVGs
// .icon { fill: var(--color-text-primary); }
```

### Smooth Theme Transitions

Prevent the jarring instant switch with a CSS transition:

```css
/* Apply to all themed properties */
html.theme-transition,
html.theme-transition *,
html.theme-transition *::before,
html.theme-transition *::after {
  transition:
    background-color 0.3s ease,
    color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease !important;
}
```

Apply the class during theme change and remove it after the transition:

```typescript
function toggleTheme() {
  document.documentElement.classList.add('theme-transition');
  // ... change theme
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transition');
  }, 300);
}
```

### Flash of Incorrect Theme (FOIT)

The dreaded white flash when loading a dark-themed page happens because the HTML renders before JavaScript sets the theme. Solutions:

1. **Blocking script in `<head>`** — `next-themes` injects a script that reads localStorage and sets the theme attribute before paint.
2. **`suppressHydrationWarning`** — Required on `<html>` because the server-rendered theme may differ from the client-resolved theme.
3. **CSS `color-scheme`** — Set `color-scheme: dark` in CSS to hint the browser about scrollbars and form controls.

---

## Practical Examples

### Complete Theme Toggle Component (Next.js + Tailwind)

```tsx
'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />; // Placeholder to prevent layout shift
  }

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700
                 hover:bg-gray-300 dark:hover:bg-gray-600
                 transition-colors duration-200"
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolvedTheme === 'dark' ? (
        <FiSun className="w-5 h-5 text-yellow-400" />
      ) : (
        <FiMoon className="w-5 h-5 text-gray-700" />
      )}
    </button>
  );
}
```

### Design Token System with Tailwind

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          elevated: 'var(--color-bg-elevated)',
        },
        content: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
        },
      },
    },
  },
};

export default config;
```

### Elevation Card in Dark Mode

```
Light Mode Card:                Dark Mode Card:
+---------------------------+   +---------------------------+
|                           |   |                           |
|  Card content here        |   |  Card content here        |
|                           |   |                           |
+---------------------------+   +---------------------------+
  Shadow below (darker)          Lighter surface (no shadow)
  bg: #FFFFFF                    bg: #222244
  shadow: 0 4px 12px            border: 1px solid #2D2D5E
         rgba(0,0,0,0.1)
```

---

## Common Interview Questions

### 1. How would you implement dark mode in a Next.js application?

Use `next-themes` with Tailwind's class-based dark mode. Wrap the application in a `ThemeProvider` with `attribute="class"` so it adds/removes the `dark` class on `<html>`. Use `suppressHydrationWarning` on the `<html>` element to prevent hydration mismatches. In components, use Tailwind's `dark:` prefix for conditional styles. For the toggle, use `useTheme()` hook but gate rendering behind a `mounted` state to avoid SSR mismatches.

### 2. What is the "flash of incorrect theme" and how do you prevent it?

FOIT occurs when the page renders with the wrong theme before JavaScript hydrates and applies the correct one. It happens because the server does not know the user's preference. `next-themes` prevents this by injecting a blocking `<script>` in `<head>` that reads localStorage and sets the `data-theme` or `class` attribute before the first paint. Additionally, setting `color-scheme: dark` in CSS ensures browser-native elements (scrollbars, form controls) match immediately.

### 3. Why should you not just invert colors for dark mode?

Inversion creates several problems: (a) pure white text on pure black causes halation — a glow effect that reduces readability, (b) saturated colors vibrate against dark backgrounds, (c) images and media become inverted or jarring, (d) semantic meaning of colors can break (red for errors becomes cyan). Instead, use a carefully designed dark palette with reduced contrast (off-white on dark gray), desaturated accents, and a surface elevation system.

### 4. How does elevation work differently in dark mode vs light mode?

In light mode, elevation is conveyed through shadows — higher elements cast larger, more diffuse shadows. In dark mode, shadows are less visible against dark backgrounds, so elevation is conveyed through surface lightness. Higher surfaces are lighter (more white overlay on the base color). Material Design recommends specific overlay percentages per elevation level (5% for dp1 up to 16% for dp24).

### 5. How would you handle images in dark mode?

Several strategies: (a) reduce brightness/increase contrast slightly with CSS filters (`filter: brightness(0.9) contrast(1.1)`), (b) provide alternate image variants for logos and illustrations, (c) add dark borders around screenshots with white backgrounds, (d) use SVGs with CSS custom properties for fill colors so they adapt automatically, (e) use `<picture>` with `prefers-color-scheme` media queries for different sources.

### 6. What are CSS custom properties and why are they ideal for theming?

CSS custom properties (variables) are inherited, dynamic values defined with `--name` syntax and accessed via `var(--name)`. They are ideal for theming because: (a) they cascade and inherit through the DOM, (b) they can be reassigned at any selector level (`:root` for light, `[data-theme="dark"]` for dark), (c) they update in real-time without JavaScript re-rendering, (d) they work with any CSS property, not just colors. Unlike Sass variables which compile to static values, CSS variables are live in the browser.

### 7. How do you ensure accessibility across both themes?

Check WCAG contrast ratios (minimum 4.5:1 for normal text, 3:1 for large text) in **both** themes independently. Use tools like the WebAIM contrast checker or browser DevTools. Ensure focus indicators are visible in both themes. Test with screen readers in both modes. Verify that color is not the only means of conveying information (use icons, labels, patterns as well). Run automated audits (axe, Lighthouse) in both themes.

---

## Applying to Your Portfolio

### Theme Token Architecture

Define a comprehensive token system in your `globals.css` that covers all UI elements:

```css
:root {
  --portfolio-bg: #f5f5f5;
  --portfolio-surface: #ffffff;
  --portfolio-text: #1a1a2e;
  --portfolio-text-muted: #6b7280;
  --portfolio-accent: #6c63ff;
  --portfolio-border: #e5e7eb;
}

.dark {
  --portfolio-bg: #0f0f23;
  --portfolio-surface: #1a1a2e;
  --portfolio-text: #e0e0e0;
  --portfolio-text-muted: #9ca3af;
  --portfolio-accent: #8b83ff;
  --portfolio-border: #2d2d5e;
}
```

### AnimatedBackground Adaptation

Your animated background should respond to theme changes. Adjust particle colors, gradient stops, and opacity based on the current theme. In dark mode, use subtle light particles on dark backgrounds. In light mode, use subtle dark particles on light backgrounds.

### Card Glass Effect per Theme

Your glass card component can use different glass properties:

```tsx
<div
  className="
  bg-white/70 dark:bg-gray-900/50
  backdrop-blur-md
  border border-gray-200/50 dark:border-gray-700/30
  shadow-lg dark:shadow-none
"
>
  {/* Card content */}
</div>
```

### Portfolio-Specific Recommendations

1. **Theme toggle placement** — Include in the navbar alongside the language selector. Use an icon toggle (sun/moon) with a smooth rotation animation using Framer Motion.
2. **Experience timeline** — In dark mode, use lighter line colors and subtle glow effects for timeline markers instead of shadows.
3. **Skills section** — Skill tags can use slightly different background opacities per theme.
4. **Transition animation** — Add a brief (200-300ms) transition on theme switch using the global transition class approach described above.
5. **Custom cursor** — Adjust cursor color/blend mode per theme so it remains visible on both light and dark backgrounds.

---

## Quick Reference

```
THEME ARCHITECTURE CHECKLIST
=============================

[ ] Use semantic token names (bg-primary, not white)
[ ] Define tokens in CSS custom properties
[ ] Map tokens to values per theme
[ ] Components consume only tokens, never raw colors

DARK MODE PRINCIPLES
=====================
- Off-white text (#E0E0E0), not pure white (#FFFFFF)
- Dark gray backgrounds (#1A1A2E), not pure black (#000000)
- Lighter surfaces = higher elevation
- Desaturate accent colors slightly
- Verify WCAG contrast in both themes
- Use antialiased font smoothing

TAILWIND DARK MODE SETUP
=========================
tailwind.config.ts:  darkMode: 'class'
ThemeProvider:       attribute="class"
Components:          dark: prefix on utilities
HTML:                suppressHydrationWarning

COMMON MISTAKES
================
x  Inverting all colors
x  Pure white text on pure black
x  Forgetting to test contrast in dark theme
x  No FOIT prevention (white flash)
x  Hardcoding colors instead of using tokens
x  Ignoring images and illustrations
x  Same shadow values in both themes
x  Not providing a system preference option
```
