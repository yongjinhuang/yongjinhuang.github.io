# Color Systems

## Overview

Color is one of the most powerful tools in a designer's arsenal. It communicates
meaning before a user reads a single word. It guides attention, conveys brand
identity, signals interactivity, and -- when done wrong -- makes interfaces
unusable for millions of people with color vision deficiencies.

A color *system* goes beyond picking pretty colors. It defines a structured,
scalable palette with semantic meaning, accessibility guarantees, and theme
adaptability. This is what separates professional UI work from guesswork.

**What this file covers:**

- Color theory basics (HSL model, complementary, analogous, triadic)
- Building color palettes
- Color contrast ratios (WCAG AA: 4.5:1, AAA: 7:1)
- Semantic colors (success, warning, error, info)
- Color psychology and meaning
- Accessible color design
- Tools for color (Coolors, Adobe Color)
- Color in dark vs light themes
- Brand colors and accent colors
- Color tokens in design systems

---

## Core Concepts

### Color Theory Basics

#### The HSL Model

HSL (Hue, Saturation, Lightness) is the most intuitive color model for UI work
because each axis maps to a perceptual quality.

```
  H (Hue):        0-360 degrees on the color wheel
  S (Saturation):  0% (gray) to 100% (vivid)
  L (Lightness):   0% (black) to 100% (white)

  Color Wheel (Hue values):
       0/360
    Red ●
        |
  330   |   30
  Pink  |   Orange
        |
  300 --+-- 60
  Purple|   Yellow
        |
  270   |   90
  Violet|   Yellow-Green
        |
  240   |   120
  Blue  |   Green
        |
  210   |   150
  Azure |   Teal
        |
      180
      Cyan

  Example: hsl(220, 90%, 56%) = Vibrant blue
           hsl(220, 90%, 95%) = Very light blue (background)
           hsl(220, 90%, 15%) = Very dark blue (text on dark)
```

**Why HSL beats HEX for design systems:** To create a lighter or darker shade,
you only change the L value. To desaturate, only change S. With HEX, you have
to manipulate three interdependent channels.

#### Color Harmonies

Color harmonies are mathematically derived combinations that naturally look
pleasing together.

```
  COMPLEMENTARY (180 degrees apart)
  ─────────────────────────────────
       ● Blue (220)
       |
       |  (180 degrees)
       |
       ● Orange (40)

  High contrast, energetic. Use one as primary,
  the other as accent. Never use 50/50 split.


  ANALOGOUS (adjacent on wheel, 30 degrees apart)
  ─────────────────────────────────
       ● Blue (220)
      / \
     /   \
    ●     ●
  Purple  Teal
  (250)   (190)

  Harmonious, low contrast. Good for calm,
  cohesive palettes. Needs a neutral to anchor.


  TRIADIC (120 degrees apart)
  ─────────────────────────────────
       ● Blue (220)
      / \
     /   \
    ●─────●
  Red    Green
  (340)  (100)

  Vibrant and balanced. Use one dominant,
  two as accents with reduced saturation.


  SPLIT-COMPLEMENTARY
  ─────────────────────────────────
       ● Blue (220)
      / \
     /   \
    ●     ●
  Yellow- Red-
  Orange  Orange
  (10)    (70)

  Like complementary but less harsh.
  Easier to balance in a UI.
```

### Building Color Palettes

A production-ready palette includes shades (50-950) for each hue, giving
you a full range from backgrounds to text.

```
  BLUE PALETTE (hsl 220)
  ──────────────────────────────────────────
  50    hsl(220, 90%, 97%)  ░░░░  Background
  100   hsl(220, 85%, 93%)  ░░░░  Hover bg
  200   hsl(220, 80%, 85%)  ▒▒▒▒  Borders (light)
  300   hsl(220, 75%, 72%)  ▒▒▒▒  Disabled
  400   hsl(220, 70%, 60%)  ▓▓▓▓  Placeholder
  500   hsl(220, 90%, 56%)  ████  Primary (default)
  600   hsl(220, 85%, 46%)  ████  Primary hover
  700   hsl(220, 80%, 36%)  ████  Primary active
  800   hsl(220, 70%, 26%)  ████  Text on light
  900   hsl(220, 60%, 18%)  ████  Heading text
  950   hsl(220, 50%, 10%)  ████  Near black
```

**The pattern:** Keep hue roughly constant. Decrease saturation slightly at
extremes. Sweep lightness from 97% (near white) to 10% (near black).

#### Neutral Palette

Every color system needs a neutral scale for text, backgrounds, borders, and
disabled states.

```
  NEUTRAL (Slate -- slightly blue-tinted gray)
  ──────────────────────────────────────────
  50    hsl(220, 15%, 97%)   Page background
  100   hsl(220, 12%, 93%)   Card background
  200   hsl(220, 10%, 85%)   Borders
  300   hsl(220, 8%,  72%)   Disabled text
  400   hsl(220, 6%,  55%)   Placeholder text
  500   hsl(220, 5%,  42%)   Secondary text
  600   hsl(220, 5%,  35%)   Body text
  700   hsl(220, 6%,  25%)   Heading text
  800   hsl(220, 8%,  15%)   Strong text
  900   hsl(220, 10%, 8%)    Near black
```

**Pro tip:** Avoid pure gray (`hsl(0, 0%, x%)`). Tint your neutrals slightly
toward your brand hue for a more cohesive feel.

### Color Contrast Ratios

WCAG defines minimum contrast ratios between foreground text and background.

```
  WCAG LEVELS
  ──────────────────────────────────────────
  AA Normal text (< 18px)     4.5 : 1 minimum
  AA Large text (>= 18px bold
     or >= 24px regular)      3.0 : 1 minimum
  AAA Normal text             7.0 : 1 minimum
  AAA Large text              4.5 : 1 minimum
  Non-text elements (icons,
  borders, form controls)     3.0 : 1 minimum
```

#### How Contrast Ratios Work

```
  White (#fff) on Blue (#2563eb):
  Contrast = 4.56 : 1  -> Passes AA for normal text (barely)

  White (#fff) on Blue (#1d4ed8):
  Contrast = 5.92 : 1  -> Passes AA comfortably

  White (#fff) on Blue (#1e40af):
  Contrast = 7.11 : 1  -> Passes AAA

  VISUAL CHECK:

  [  White on light blue  ]  <- FAIL: ~2.5:1 (unreadable)
  [  White on medium blue  ]  <- PASS AA: ~4.5:1 (readable)
  [  White on dark blue    ]  <- PASS AAA: ~7.0:1 (excellent)
```

### Semantic Colors

Semantic colors carry universal meaning that transcends language. They should
be consistent throughout the entire application.

```
  COLOR       MEANING           USE CASES
  ──────────────────────────────────────────────────
  Green       Success           Form validation passed,
              Positive          completed status, growth

  Red         Error             Validation errors, delete
              Destructive       confirmations, alerts

  Yellow /    Warning           Non-critical alerts,
  Amber       Caution           pending states, degraded

  Blue        Info              Informational messages,
              Neutral action    links, help text

  Gray        Neutral           Disabled states, borders,
              Inactive          placeholder content
```

#### Implementing Semantic Colors

```jsx
const semanticColors = {
  success: {
    light: 'hsl(142, 72%, 95%)',   // background
    base:  'hsl(142, 72%, 40%)',   // icon, border
    dark:  'hsl(142, 72%, 20%)',   // text
  },
  error: {
    light: 'hsl(0, 84%, 95%)',
    base:  'hsl(0, 84%, 55%)',
    dark:  'hsl(0, 84%, 25%)',
  },
  warning: {
    light: 'hsl(38, 92%, 95%)',
    base:  'hsl(38, 92%, 50%)',
    dark:  'hsl(38, 92%, 25%)',
  },
  info: {
    light: 'hsl(220, 90%, 95%)',
    base:  'hsl(220, 90%, 56%)',
    dark:  'hsl(220, 90%, 25%)',
  },
};
```

### Color Psychology and Meaning

Color associations vary by culture, but some patterns are broadly consistent
in Western digital interfaces.

```
  COLOR       ASSOCIATIONS              BRAND EXAMPLES
  ──────────────────────────────────────────────────────
  Blue        Trust, stability,         Facebook, LinkedIn,
              professionalism           IBM, Intel

  Red         Energy, urgency,          YouTube, Netflix,
              passion, danger           Coca-Cola

  Green       Growth, nature,           Spotify, WhatsApp,
              health, money             Robinhood

  Purple      Luxury, creativity,       Twitch, Cadbury,
              wisdom                    Hallmark

  Orange      Friendly, energetic,      Amazon, Fanta,
              affordable                Etsy

  Yellow      Optimism, warmth,         Snapchat, IKEA,
              attention                 McDonald's

  Black       Sophistication, luxury,   Apple, Nike,
              power                     Chanel

  White       Clean, minimal,           Apple, Google,
              spacious                  Modern startups
```

**Caution:** These are cultural generalizations. Red means luck and prosperity
in Chinese culture. White is associated with mourning in some Asian cultures.
Always consider your target audience.

### Accessible Color Design

#### Beyond Contrast Ratios

Accessibility is more than meeting contrast ratios.

1. **Never rely on color alone** to convey information. Add icons, text labels,
   or patterns.

```
  BAD:  Status indicators using only color
  ┌──────┐  ┌──────┐  ┌──────┐
  │ ●    │  │ ●    │  │ ●    │
  │ (red)│  │(yel) │  │(grn) │
  └──────┘  └──────┘  └──────┘

  GOOD: Color + icon + text
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ ✕ Error  │  │ ! Warning│  │ ✓ Success│
  │ (red)    │  │ (yellow) │  │ (green)  │
  └──────────┘  └──────────┘  └──────────┘
```

2. **Simulate color blindness** during design review. About 8% of men and 0.5%
   of women have some form of color vision deficiency.

```
  Common types:
  - Deuteranopia (red-green, most common)
  - Protanopia (red-green)
  - Tritanopia (blue-yellow, rare)

  Red and green are the most problematic pair.
  Avoid red/green as the only differentiator.
```

3. **Use sufficient contrast for interactive states.** Focus rings, hover states,
   and selected states must be visually distinct.

4. **Test with real tools:**
   - Chrome DevTools -> Rendering -> Emulate vision deficiencies
   - Stark (Figma plugin)
   - WebAIM contrast checker

### Tools for Color

| Tool             | What It Does                                    | URL                        |
|------------------|-------------------------------------------------|----------------------------|
| Coolors          | Generate and explore palettes                   | coolors.co                 |
| Adobe Color      | Color wheel with harmony rules                  | color.adobe.com            |
| Realtime Colors  | Preview palette on a real page layout            | realtimecolors.com         |
| Contrast Checker | Test WCAG contrast ratios                       | webaim.org/resources       |
| Huetone          | Build palettes by controlling HSL curves         | huetone.ardov.me           |
| Tailwind Colors  | Reference Tailwind's built-in palette            | tailwindcss.com/docs/colors|
| ColorBox         | Algorithmic palette generation by Lyft           | colorbox.io                |

### Color in Dark vs Light Themes

Dark mode is not simply inverting colors. It requires a fundamentally different
approach to elevation, saturation, and contrast.

```
  LIGHT THEME                    DARK THEME
  ──────────────────────────────────────────────
  Background:  White/Light gray   Dark gray (NOT pure black)
  Surface:     White              Slightly lighter dark
  Text:        Dark (gray-900)    Light (gray-100)
  Primary:     Saturated          Slightly desaturated
  Borders:     Light gray         Subtle lighter gray
  Shadows:     Dark with opacity  Minimal or none
  Elevation:   Shadow-based       Lightness-based
```

#### Key Dark Theme Rules

1. **Avoid pure black (#000000)** backgrounds. Use dark gray (hsl(220, 15%, 10%))
   to reduce eye strain and allow subtle elevation changes.

2. **Reduce saturation** for primary/accent colors. Vivid colors on dark
   backgrounds cause visual vibration.

```css
  /* Light theme */
  --primary: hsl(220, 90%, 56%);

  /* Dark theme -- reduce saturation, increase lightness */
  --primary: hsl(220, 70%, 65%);
```

3. **Flip the elevation model.** In light themes, deeper shadows = higher
   elevation. In dark themes, lighter surfaces = higher elevation.

```
  LIGHT THEME ELEVATION         DARK THEME ELEVATION
  ┌─────────────────────┐       ┌─────────────────────┐
  │ ░ shadow=sm (low)   │       │ ▓ lighter   (low)   │
  │ ▒ shadow=md (mid)   │       │ ▒ lighter+  (mid)   │
  │ ▓ shadow=lg (high)  │       │ ░ lightest  (high)  │
  └─────────────────────┘       └─────────────────────┘
```

4. **Test contrast ratios in both themes.** A color that passes AA on white
   may fail on dark gray.

#### Implementing Theme Colors in CSS

```css
:root {
  /* Light theme (default) */
  --color-bg:       hsl(0, 0%, 100%);
  --color-surface:  hsl(0, 0%, 98%);
  --color-text:     hsl(220, 15%, 15%);
  --color-muted:    hsl(220, 10%, 45%);
  --color-border:   hsl(220, 10%, 88%);
  --color-primary:  hsl(220, 90%, 56%);
  --color-accent:   hsl(280, 70%, 55%);
}

[data-theme='dark'] {
  --color-bg:       hsl(220, 15%, 8%);
  --color-surface:  hsl(220, 15%, 12%);
  --color-text:     hsl(220, 10%, 90%);
  --color-muted:    hsl(220, 8%, 55%);
  --color-border:   hsl(220, 10%, 20%);
  --color-primary:  hsl(220, 70%, 65%);
  --color-accent:   hsl(280, 55%, 68%);
}
```

### Brand Colors and Accent Colors

#### Brand Color

Your primary brand color is the single most recognizable color in your interface.
It appears on primary CTAs, active navigation items, links, and key UI elements.

```
  BRAND COLOR USAGE RATIO (60-30-10 rule)
  ──────────────────────────────────────────
  60%  Neutral colors     (backgrounds, text, borders)
  30%  Secondary colors   (cards, sections, supporting UI)
  10%  Brand/accent color (CTAs, active states, highlights)

  ┌────────────────────────────────────────┐
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  60% Neutral
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │ ░░░░ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░ │  30% Secondary
  │ ░░░░ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░ │
  │ ░░░░ ▒▒▒▒▒▒▒▒ [████████] ▒▒ ░░░░░░ │  10% Brand
  │ ░░░░ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░ │
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  └────────────────────────────────────────┘
```

#### Accent Color

An accent color adds personality and draws attention to specific elements.
It should contrast with the brand color and is used even more sparingly.

### Color Tokens in Design Systems

Color tokens abstract raw color values into semantic names, making themes
swappable and intent clear.

```
  RAW VALUES (don't use directly)
  ──────────────────────────────────
  blue-500:  hsl(220, 90%, 56%)
  red-500:   hsl(0, 84%, 55%)
  green-500: hsl(142, 72%, 40%)

         ↓ abstracted into ↓

  SEMANTIC TOKENS (use these)
  ──────────────────────────────────
  --color-primary:    var(--blue-500)
  --color-error:      var(--red-500)
  --color-success:    var(--green-500)

         ↓ further abstracted into ↓

  COMPONENT TOKENS (most specific)
  ──────────────────────────────────
  --button-bg:        var(--color-primary)
  --button-text:      var(--color-on-primary)
  --alert-error-bg:   var(--color-error-light)
  --alert-error-text: var(--color-error-dark)
```

This three-tier system (raw -> semantic -> component) enables:
- **Theme switching** by changing only semantic tokens
- **Consistency** by forcing all components to reference shared tokens
- **Maintainability** by updating a color in one place

#### Implementing Tokens in Tailwind

```js
// tailwind.config.js
module.exports = {
  theme: {
    colors: {
      // Raw palette
      blue: {
        50:  'hsl(220, 90%, 97%)',
        100: 'hsl(220, 85%, 93%)',
        500: 'hsl(220, 90%, 56%)',
        600: 'hsl(220, 85%, 46%)',
        700: 'hsl(220, 80%, 36%)',
        900: 'hsl(220, 60%, 18%)',
      },
      // Semantic tokens via CSS variables
      primary:    'var(--color-primary)',
      secondary:  'var(--color-secondary)',
      success:    'var(--color-success)',
      error:      'var(--color-error)',
      warning:    'var(--color-warning)',
      background: 'var(--color-bg)',
      surface:    'var(--color-surface)',
      foreground: 'var(--color-text)',
      muted:      'var(--color-muted)',
      border:     'var(--color-border)',
    },
  },
}
```

---

## Practical Examples

### Complete Theme Setup in CSS + Tailwind

```css
/* app/globals.css */

@layer base {
  :root {
    --color-bg:         0 0% 100%;
    --color-surface:    220 15% 97%;
    --color-text:       220 15% 15%;
    --color-muted:      220 10% 45%;
    --color-border:     220 10% 88%;
    --color-primary:    220 90% 56%;
    --color-primary-fg: 0 0% 100%;
    --color-accent:     280 70% 55%;
    --color-success:    142 72% 40%;
    --color-warning:    38 92% 50%;
    --color-error:      0 84% 55%;
  }

  .dark {
    --color-bg:         220 15% 8%;
    --color-surface:    220 15% 12%;
    --color-text:       220 10% 90%;
    --color-muted:      220 8% 55%;
    --color-border:     220 10% 20%;
    --color-primary:    220 70% 65%;
    --color-primary-fg: 220 15% 8%;
    --color-accent:     280 55% 68%;
    --color-success:    142 60% 55%;
    --color-warning:    38 80% 60%;
    --color-error:      0 70% 65%;
  }
}
```

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--color-bg))',
        surface:    'hsl(var(--color-surface))',
        foreground: 'hsl(var(--color-text))',
        muted:      'hsl(var(--color-muted))',
        border:     'hsl(var(--color-border))',
        primary: {
          DEFAULT:    'hsl(var(--color-primary))',
          foreground: 'hsl(var(--color-primary-fg))',
        },
        accent:     'hsl(var(--color-accent))',
        success:    'hsl(var(--color-success))',
        warning:    'hsl(var(--color-warning))',
        error:      'hsl(var(--color-error))',
      },
    },
  },
}
```

### Semantic Alert Component

```jsx
function Alert({ variant, title, children }) {
  const styles = {
    success: 'bg-green-50 border-green-500 text-green-900 dark:bg-green-950 dark:text-green-100',
    error:   'bg-red-50 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-100',
    warning: 'bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    info:    'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  };

  const icons = {
    success: '✓',
    error:   '✕',
    warning: '!',
    info:    'i',
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-lg ${styles[variant]}`} role="alert">
      <div className="flex items-start gap-3">
        <span className="font-bold text-lg" aria-hidden="true">
          {icons[variant]}
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm opacity-90">{children}</p>
        </div>
      </div>
    </div>
  );
}
```

### Accessible Color Contrast Checker (React)

```jsx
function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getRelativeLuminance(...rgb1);
  const l2 = getRelativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ContrastBadge({ foreground, background }) {
  const ratio = getContrastRatio(foreground, background);
  const rounded = Math.round(ratio * 100) / 100;

  const passAA = ratio >= 4.5;
  const passAAA = ratio >= 7.0;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{rounded}:1</span>
      <span className={passAAA ? 'text-green-600' : passAA ? 'text-yellow-600' : 'text-red-600'}>
        {passAAA ? 'AAA' : passAA ? 'AA' : 'FAIL'}
      </span>
    </div>
  );
}
```

### Dark Mode Toggle with next-themes

```jsx
'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg bg-surface hover:bg-muted/20 transition-colors"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀' : '●'}
    </button>
  );
}
```

---

## Common Interview Questions

### Q1: Explain the difference between WCAG AA and AAA contrast requirements.

WCAG AA requires a minimum contrast ratio of **4.5:1 for normal text** (under
18px or under 14px bold) and **3:1 for large text** (18px+ or 14px+ bold). WCAG
AAA raises those to **7:1 for normal text** and **4.5:1 for large text**.

AA is the standard requirement for most web accessibility compliance. AAA is
the enhanced level -- harder to achieve with colorful palettes but ideal for
users with low vision. Most design systems target AA as the minimum and
recommend AAA where possible, especially for body text on primary backgrounds.

Non-text UI elements (icons, form borders, focus indicators) need at least
3:1 contrast against adjacent colors.

### Q2: How do you build a color palette for a new design system?

Start with the brand color as your primary hue. Generate a full shade scale
(50-950) by varying lightness while keeping hue constant and slightly adjusting
saturation at extremes. Add a neutral scale with a subtle tint of the primary hue.
Define semantic colors (success/green, error/red, warning/amber, info/blue) each
with their own shade scale. Then create semantic tokens mapping these raw values
to roles: `--color-text`, `--color-bg`, `--color-primary`, etc. Test all
foreground/background combinations for WCAG AA contrast. Build light and dark
theme variants by remapping semantic tokens. Validate with color blindness
simulation.

### Q3: Why should you never rely on color alone to convey information?

Approximately 8% of men and 0.5% of women have color vision deficiency. If
you use only red/green to indicate error/success, those users cannot distinguish
the states. WCAG 1.4.1 explicitly requires that color is not the sole means of
conveying information. Always supplement color with text labels, icons, patterns,
or position changes. For example, an error state should use red AND an error
icon AND descriptive text.

### Q4: What is the 60-30-10 rule in color?

The 60-30-10 rule suggests allocating your palette as: **60% dominant color**
(usually neutral -- backgrounds, large surfaces), **30% secondary color**
(cards, sections, supporting elements), and **10% accent color** (CTAs, active
states, highlights). This creates visual balance and prevents any single color
from overwhelming the interface. It also ensures your accent color retains its
attention-drawing power because it is used sparingly.

### Q5: How do you handle colors in dark mode?

Do not simply invert your light theme. Dark mode requires: (1) Dark gray
backgrounds instead of pure black to allow elevation via lightness. (2) Reduced
saturation on accent colors because vivid hues vibrate on dark backgrounds.
(3) Increased lightness on text to maintain contrast. (4) Elevation expressed
through surface lightness rather than shadows. (5) Re-tested contrast ratios for
all text/background combinations. (6) Reduced opacity on surface overlays.
Ideally, your color tokens support both themes through CSS custom properties
swapped at the root level.

### Q6: What are color tokens and why use a three-tier token system?

Color tokens are named references to color values, abstracted from raw hex/HSL.
The three tiers are: **raw tokens** (blue-500, red-600 -- the actual HSL values),
**semantic tokens** (--color-primary, --color-error -- what the color means),
and **component tokens** (--button-bg, --alert-border -- where it is used).

This layering enables theme switching by remapping only semantic tokens, ensures
consistency by preventing ad-hoc color picks, and improves maintainability by
giving you one place to update a brand color change.

### Q7: How do cultural differences affect color choices?

Color associations are culturally dependent. Red means danger/stop in Western
cultures but luck/prosperity in Chinese culture. White is associated with purity
in Western contexts and mourning in some South and East Asian cultures. Green can
mean nature/go in the West but can have religious significance in Muslim cultures.
Purple is associated with royalty in Western culture and mourning in Thailand.
When designing for international audiences, rely on semantic patterns (icons +
text) rather than color associations, and conduct user research in target markets.

### Q8: How do you choose between HSL, RGB, and HEX for a project?

**HSL** is best for design systems because adjusting shade/tint is a single-axis
change (lightness), making it easy to generate consistent palettes. **HEX** is
the most compact format and widely used in legacy code and design tools. **RGB**
is useful when you need alpha transparency (rgba) though HSL now supports it too
(hsla). For modern CSS, HSL with CSS custom properties is the best choice because
it makes theme generation and manipulation intuitive. Tailwind v4 uses OKLCH
internally, which is even more perceptually uniform than HSL.

---

## Applying to Your Portfolio

### Current Theme Setup

Your portfolio uses `next-themes` for dark/light mode switching with CSS
variables. Here are improvements to make the color system more systematic.

### Recommendations

1. **Adopt the HSL token approach** in your globals.css. Define raw palette values
   and semantic tokens separately so theme switching is a single root-level swap.

2. **Audit contrast ratios.** Run your muted text colors (dates, subtitles)
   through a contrast checker against both light and dark backgrounds. Gray text
   on gray backgrounds is the most common accessibility failure.

3. **Apply the 60-30-10 rule:**
   - 60%: Your background and neutral surface colors
   - 30%: Card backgrounds, section differentiation
   - 10%: Your accent color on CTAs, active nav items, skill tags, links

4. **Desaturate accent colors in dark mode.** If your light theme accent is
   `hsl(220, 90%, 56%)`, your dark theme variant should be closer to
   `hsl(220, 70%, 65%)`.

5. **Add semantic color tokens** for status indicators in your experience
   timeline (current role vs past roles, education status).

### Implementation Example

```css
/* In globals.css, extend your existing theme variables */

:root {
  /* Existing variables... */
  --color-primary: 220 90% 56%;
  --color-primary-hover: 220 85% 46%;
  --color-accent: 280 70% 55%;
  --color-success: 142 72% 40%;
  --color-muted-text: 220 10% 45%;
}

.dark {
  /* Existing dark variables... */
  --color-primary: 220 70% 65%;
  --color-primary-hover: 220 65% 72%;
  --color-accent: 280 55% 68%;
  --color-success: 142 60% 55%;
  --color-muted-text: 220 8% 60%;
}
```

### Framer Motion Color Transitions

```jsx
import { motion } from 'framer-motion';

function SkillTag({ label }) {
  return (
    <motion.span
      className="px-3 py-1 rounded-full text-xs font-medium
                 bg-primary/10 text-primary border border-primary/20"
      whileHover={{
        backgroundColor: 'hsl(var(--color-primary) / 0.2)',
        borderColor: 'hsl(var(--color-primary) / 0.4)',
        scale: 1.05,
      }}
      transition={{ duration: 0.2 }}
    >
      {label}
    </motion.span>
  );
}
```

---

## Quick Reference

```
COLOR MODELS
─────────────────────────────────────────────
HSL    Hue (0-360), Saturation (0-100%), Lightness (0-100%)
       Best for design systems -- single-axis shade generation
RGB    Red, Green, Blue (0-255 each)
       Hardware-oriented, hard to manipulate mentally
HEX    Compact RGB notation (#RRGGBB)
       Legacy standard, widely supported

COLOR HARMONIES
─────────────────────────────────────────────
Complementary        180 degrees apart (high contrast)
Analogous            Adjacent hues (harmonious)
Triadic              120 degrees apart (vibrant)
Split-complementary  Complement + neighbors (balanced)

WCAG CONTRAST REQUIREMENTS
─────────────────────────────────────────────
AA Normal text       4.5 : 1
AA Large text        3.0 : 1
AAA Normal text      7.0 : 1
AAA Large text       4.5 : 1
Non-text elements    3.0 : 1

SEMANTIC COLORS
─────────────────────────────────────────────
Success   Green    Positive outcome, completion
Error     Red      Failure, destructive action
Warning   Amber    Caution, non-critical alert
Info      Blue     Informational, neutral

60-30-10 RULE
─────────────────────────────────────────────
60%  Neutral        Background, text, borders
30%  Secondary      Cards, sections, supporting UI
10%  Accent/Brand   CTAs, active states, highlights

DARK MODE RULES
─────────────────────────────────────────────
[x] No pure black -- use dark gray
[x] Reduce accent saturation
[x] Elevation via lightness (not shadow)
[x] Re-test all contrast ratios
[x] Increase text lightness for readability

TOKEN TIERS
─────────────────────────────────────────────
Tier 1: Raw         blue-500, red-600 (HSL values)
Tier 2: Semantic    --color-primary, --color-error
Tier 3: Component   --button-bg, --alert-border
```
