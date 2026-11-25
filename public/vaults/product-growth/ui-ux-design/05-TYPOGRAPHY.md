# Typography

## Overview

Typography is the art and technique of arranging type to make written language
legible, readable, and visually appealing. In web design, typography carries
roughly 95% of all information -- if your type is poorly set, it does not matter
how beautiful your layout or illustrations are.

Good typography is invisible. Users read content effortlessly without noticing
the font, the spacing, or the size. Bad typography is immediately felt: squinting,
losing your place, feeling fatigued after two paragraphs.

**What this file covers:**

- Type anatomy (baseline, x-height, ascender, descender)
- Font categories (serif, sans-serif, monospace, display)
- Font pairing rules
- Type scales (major third, perfect fourth, golden ratio)
- Line height and line length
- Responsive typography (clamp(), fluid type)
- Web font loading strategies (font-display, FOUT/FOIT)
- Font weight and emphasis
- Hierarchy through typography
- Self-hosting vs CDN fonts

---

## Core Concepts

### Type Anatomy

Understanding type anatomy helps you communicate precisely about fonts and
make informed pairing decisions.

```
                  ┌─ Ascender line
                  │
          d       │    b
         d│       │   b│
  x-height│       │   │    Cap height
    ┌─────┤  ┌────┤   │  ┌──────────
    │     │  │    │   │  │
    x     n  a    │   B  A
    │     │  │    │   │  │
    └─────┘  └────┘   │  └──────────
  ──────── baseline ──────────────────
    │
    p     g
    │p    │g
    └─────┴─── Descender line
```

Key terms:

- **Baseline**: The invisible line where letters sit
- **X-height**: Height of lowercase letters (specifically "x")
- **Ascender**: Part of a letter extending above the x-height (b, d, h, k, l)
- **Descender**: Part of a letter dropping below the baseline (g, p, q, y)
- **Cap height**: Height of uppercase letters
- **Tracking**: Uniform spacing across all letters (CSS: `letter-spacing`)
- **Kerning**: Spacing between specific letter pairs
- **Leading**: Vertical space between lines of text (CSS: `line-height`)

**Why x-height matters:** Fonts with a taller x-height (like Roboto, Inter) appear
larger and more readable at small sizes. Fonts with a shorter x-height (like
Garamond) feel more elegant but need larger sizes to remain legible.

### Font Categories

#### Serif

Serifs have small decorative strokes at the ends of letters. They convey
tradition, authority, and reliability.

```
  T   T
  |   |
  |   |        <- Serif fonts have "feet"
 ─┴─ ─┴─

  Examples: Times New Roman, Georgia, Playfair Display, Merriweather
  Use for: Long-form reading (articles, books), editorial, luxury brands
```

#### Sans-Serif

Sans-serif fonts lack decorative strokes. They feel modern, clean, and neutral.

```
  T   T
  |   |
  |   |        <- No decorative strokes
  |   |

  Examples: Inter, Roboto, Helvetica, Open Sans, Poppins
  Use for: UI text, headings, body copy on screens, tech products
```

#### Monospace

Every character occupies the same horizontal space. Essential for code display
and tabular data alignment.

```
  Normal:    William    <- W is wide, i is narrow
  Monospace: William    <- Every character same width

  Examples: JetBrains Mono, Fira Code, SF Mono, Inconsolata
  Use for: Code blocks, terminal output, tabular data
```

#### Display / Decorative

Designed for large sizes (headings, logos). Poor readability at small sizes.

```
  Examples: Lobster, Pacifico, Bebas Neue, Playfair Display (at display sizes)
  Use for: Hero headings, logos, branding
  Never for: Body text, form labels, navigation
```

### Font Pairing Rules

Effective font pairing creates contrast while maintaining harmony.

**Rule 1: Pair fonts with contrasting categories**

```
  GOOD PAIRS                    REASON
  ──────────────────────────────────────────────
  Playfair Display + Source     Serif heading +
  Sans Pro                      sans-serif body

  Poppins + Merriweather        Sans heading +
                                serif body

  Bebas Neue + Inter            Display heading +
                                neutral body
```

**Rule 2: Pair fonts from the same superfamily**

```
  Roboto + Roboto Slab
  Source Sans Pro + Source Serif Pro
  IBM Plex Sans + IBM Plex Serif + IBM Plex Mono
```

**Rule 3: Limit to 2-3 fonts maximum**

```
  GOOD:  Heading font + Body font + Code font (3 total)
  BAD:   5 different fonts on one page (visual chaos)
```

**Rule 4: Match the mood**

A playful heading font paired with a formal body font creates cognitive
dissonance. Keep the personality consistent.

**Rule 5: Contrast x-heights carefully**

If two fonts have very different x-heights, they look mismatched at the same
size. Test at body size side by side.

### Type Scales

A type scale is a set of harmoniously related font sizes derived from a
mathematical ratio. It brings consistency and rhythm to your typography.

```
  RATIO NAME          VALUE    SIZES (base 16px)
  ──────────────────────────────────────────────
  Minor Second        1.067    15, 16, 17, 18, 19...
  Major Second        1.125    14, 16, 18, 20, 23...
  Minor Third         1.200    13, 16, 19, 23, 28...
  Major Third         1.250    13, 16, 20, 25, 31...
  Perfect Fourth      1.333    12, 16, 21, 28, 38...
  Augmented Fourth    1.414    11, 16, 23, 32, 45...
  Golden Ratio        1.618    10, 16, 26, 42, 67...
```

#### Choosing a Ratio

- **Tight ratios** (minor/major second): Better for body-heavy content, mobile
  screens, or dense UIs where you need many subtle size steps.
- **Wide ratios** (perfect fourth, golden ratio): Better for marketing pages,
  editorial, and hero sections with dramatic size contrast.

#### Implementing a Type Scale

```css
:root {
  --step--2: clamp(0.69rem, 0.66rem + 0.18vw, 0.8rem);
  --step--1: clamp(0.83rem, 0.78rem + 0.29vw, 1rem);
  --step-0: clamp(1rem, 0.91rem + 0.43vw, 1.25rem);
  --step-1: clamp(1.2rem, 1.07rem + 0.63vw, 1.56rem);
  --step-2: clamp(1.44rem, 1.26rem + 0.89vw, 1.95rem);
  --step-3: clamp(1.73rem, 1.48rem + 1.24vw, 2.44rem);
  --step-4: clamp(2.07rem, 1.73rem + 1.7vw, 3.05rem);
  --step-5: clamp(2.49rem, 2.03rem + 2.31vw, 3.82rem);
}
```

### Line Height (Leading)

Line height controls vertical space between lines. It directly affects
readability.

```
  TOO TIGHT (1.0)              JUST RIGHT (1.5)             TOO LOOSE (2.5)

  The quick brown fox          The quick brown fox           The quick brown fox
  jumps over the lazy          jumps over the lazy
  dog and runs away.           dog and runs away.            jumps over the lazy
  The quick brown fox          The quick brown fox
  jumps over the lazy          jumps over the lazy           dog and runs away.
  dog again.                   dog again.
                                                             The quick brown fox
```

**Guidelines:**

| Context          | Line Height |
| ---------------- | ----------- |
| Body text        | 1.5 - 1.75  |
| Headings         | 1.1 - 1.3   |
| Large display    | 1.0 - 1.1   |
| Buttons / labels | 1.0 - 1.2   |
| Captions         | 1.4 - 1.5   |

### Line Length (Measure)

The optimal line length for body text is **45-75 characters** per line, with
**66 characters** considered ideal.

```
  TOO NARROW (30ch)           OPTIMAL (66ch)                     TOO WIDE (120ch)

  The quick brown fox         The quick brown fox jumps           The quick brown fox jumps over the lazy dog. The quick brown fox jumps over
  jumps over the lazy         over the lazy dog. The quick        the lazy dog. The quick brown fox jumps over the lazy dog again and again.
  dog. The quick              brown fox jumps over the lazy
  brown fox jumps             dog again and again.
  over the lazy dog
  again and again.
```

In Tailwind, use `max-w-prose` (65ch) or explicit `max-w-[65ch]`.

### Responsive Typography

#### The clamp() Function

`clamp()` creates fluid typography that scales smoothly between breakpoints
without media queries.

```css
/* Syntax: clamp(minimum, preferred, maximum) */

h1 {
  /* Minimum 2rem, scales with viewport, maximum 4rem */
  font-size: clamp(2rem, 5vw + 1rem, 4rem);
}

p {
  /* Minimum 1rem, fluid scaling, maximum 1.25rem */
  font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem);
}
```

#### Fluid Type in Tailwind (v3.3+)

```jsx
{
  /* Using arbitrary values with clamp */
}
<h1 className="text-[clamp(2rem,5vw+1rem,4rem)]">Responsive Heading</h1>;

{
  /* Or define in tailwind.config.js */
}
// fontSize: {
//   'fluid-lg': 'clamp(1.5rem, 3vw + 0.5rem, 2.5rem)',
//   'fluid-xl': 'clamp(2rem, 5vw + 1rem, 4rem)',
// }
```

### Web Font Loading Strategies

#### The Problem: FOUT and FOIT

- **FOUT** (Flash of Unstyled Text): Browser shows fallback font, then swaps
  to the web font when loaded. Text is always visible but "jumps."
- **FOIT** (Flash of Invisible Text): Browser hides text until the web font
  loads. Text may be invisible for seconds on slow connections.

#### font-display Property

```css
@font-face {
  font-family: 'Poppins';
  src: url('/fonts/Poppins-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap; /* <- Controls loading behavior */
}
```

| Value      | Behavior                                                   |
| ---------- | ---------------------------------------------------------- |
| `auto`     | Browser decides (usually FOIT)                             |
| `block`    | Short invisible period, then swap (FOIT with timeout)      |
| `swap`     | Immediate fallback, swap when ready (FOUT -- recommended)  |
| `fallback` | Very short invisible period, may not swap if too slow      |
| `optional` | Very short invisible period, browser may skip the web font |

**Recommendation:** Use `font-display: swap` for body text (content must be
readable immediately). Use `font-display: optional` for display fonts where
layout shift is more disruptive than missing the custom font.

#### Preloading Fonts

```html
<link
  rel="preload"
  href="/fonts/Poppins-Regular.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

Preloading tells the browser to fetch the font early, before CSS is parsed.
This reduces the time to first render with the correct font.

### Font Weight and Emphasis

Use weight strategically to create hierarchy and emphasis.

```
  WEIGHT SCALE
  ──────────────────────────────────
  100  Thin         (decorative use only)
  200  Extra Light  (large headings)
  300  Light        (subheadings)
  400  Regular      (body text)
  500  Medium       (subtle emphasis)
  600  Semi Bold    (labels, nav items)
  700  Bold         (headings, CTAs)
  800  Extra Bold   (hero headings)
  900  Black        (display text)
```

**Best practice:** Load only the weights you actually use. Each weight adds to
the font file size. Most projects need 3-4 weights: 400 (body), 500 (medium
emphasis), 600 (labels), 700 (headings).

### Hierarchy Through Typography

Typography alone can establish a complete visual hierarchy without relying on
color or icons.

```
  ┌─────────────────────────────────────┐
  │                                     │
  │  OVERLINE LABEL           12px 600  │  <- Category / context
  │                                     │
  │  Page Title               32px 700  │  <- Primary focus
  │                                     │
  │  Supporting subtitle      18px 400  │  <- Secondary info
  │  in a lighter weight                │
  │                                     │
  │  Body text at the base    16px 400  │  <- Content
  │  size with comfortable              │
  │  line height.                       │
  │                                     │
  │  Caption or metadata      14px 400  │  <- Tertiary info
  │                                     │
  └─────────────────────────────────────┘
```

Five levels of hierarchy using only size and weight -- no color needed.

### Self-Hosting vs CDN Fonts

| Factor      | Self-Hosted                 | CDN (Google Fonts)         |
| ----------- | --------------------------- | -------------------------- |
| Performance | Fewer DNS lookups, faster   | Extra DNS + connection     |
| Privacy     | No third-party tracking     | Google collects user data  |
| Reliability | Works offline / on intranet | Depends on CDN uptime      |
| Caching     | Your CDN / host cache rules | Shared cache (less useful) |
| Setup       | More initial work           | One link tag               |
| Updates     | Manual                      | Automatic                  |

**Recommendation:** Self-host fonts for production sites. The performance and
privacy benefits outweigh the extra setup effort. Use a tool like
`google-webfonts-helper` or `fontsource` to download font files.

---

## Practical Examples

### Setting Up Self-Hosted Fonts in Next.js

```css
/* app/globals.css */

@font-face {
  font-family: 'Poppins';
  src: url('/fonts/Poppins-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Poppins';
  src: url('/fonts/Poppins-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Poppins';
  src: url('/fonts/Poppins-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Poppins';
  src: url('/fonts/Poppins-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

body {
  font-family:
    'Poppins',
    system-ui,
    -apple-system,
    sans-serif;
}
```

### Implementing a Type Scale in Tailwind

```js
// tailwind.config.js
module.exports = {
  theme: {
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.75rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.563rem', { lineHeight: '2rem' }],
      '3xl': ['1.953rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.441rem', { lineHeight: '2.5rem' }],
      '5xl': ['3.052rem', { lineHeight: '1.1' }],
      // Major Third ratio (1.250) from base 16px
    },
  },
};
```

### Responsive Heading Component

```jsx
function SectionHeading({ tagline, title, description }) {
  return (
    <div className="space-y-3 max-w-2xl">
      {tagline && (
        <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">
          {tagline}
        </span>
      )}
      <h2 className="text-[clamp(1.75rem,3vw+0.5rem,2.5rem)] font-bold leading-tight">
        {title}
      </h2>
      {description && (
        <p className="text-base text-gray-600 leading-relaxed max-w-prose">
          {description}
        </p>
      )}
    </div>
  );
}
```

### Font Loading with Next.js next/font

```jsx
// app/layout.tsx
import { Poppins, JetBrains_Mono } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export default function RootLayout({ children }) {
  return (
    <html className={`${poppins.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

```js
// tailwind.config.js
module.exports = {
  theme: {
    fontFamily: {
      sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-mono)', 'monospace'],
    },
  },
};
```

---

## Common Interview Questions

### Q1: What is a type scale and why should you use one?

A type scale is a set of font sizes derived from a mathematical ratio (like
1.250 for Major Third or 1.333 for Perfect Fourth). Starting from a base size
(typically 16px), you multiply up for headings and divide down for small text.

You use a type scale to create **visual harmony** -- the sizes relate to each
other proportionally, which feels cohesive. It also **speeds up decisions**
(no debating whether a heading should be 28px or 30px) and ensures **consistency**
across the entire design system. Different ratios serve different needs: tighter
ratios for dense UIs, wider ratios for editorial/marketing pages.

### Q2: Explain the difference between FOUT and FOIT. Which is preferable?

**FOUT** (Flash of Unstyled Text) shows the fallback font immediately, then swaps
to the custom font when it loads. The text "jumps" as metrics change.
**FOIT** (Flash of Invisible Text) hides text entirely until the custom font loads,
risking several seconds of blank content on slow connections.

FOUT is almost always preferable because **content accessibility trumps visual
polish**. Users can read content immediately with FOUT. With FOIT, users see
nothing. Use `font-display: swap` to get FOUT behavior. If layout shift from the
swap is unacceptable (rare), use `font-display: optional` which may skip the
custom font entirely rather than cause a layout shift.

### Q3: What is the ideal line length for body text and why?

The ideal line length is **45-75 characters per line**, with 66 characters being
the sweet spot. This range comes from readability research: shorter lines cause
excessive line-breaks that disrupt reading rhythm, while longer lines make it
hard to track back to the start of the next line.

In CSS, you can enforce this with `max-width: 65ch` (the `ch` unit is based on
the width of the "0" character). Tailwind provides `max-w-prose` which sets
`max-width: 65ch`.

### Q4: How do you choose a font pairing?

Start with the body font since it carries the most text. Choose one that is highly
readable at 16px with good x-height (Inter, Source Sans Pro, Roboto). Then pick a
heading font that **contrasts** in category: if the body is sans-serif, consider a
serif heading, or vice versa. Use fonts from the same superfamily for guaranteed
harmony (Roboto + Roboto Slab). Limit to 2-3 fonts total. Test the pairing at
multiple sizes and weights. Ensure both fonts support the character sets you need.

### Q5: Why self-host fonts instead of using Google Fonts CDN?

Self-hosting eliminates the extra DNS lookup and TCP connection to Google's servers,
improving load time. It avoids sending user data (IP addresses) to Google, which
matters for GDPR compliance. It ensures fonts work on intranets and offline. And
the "shared cache" advantage of CDNs is largely irrelevant now that browsers
partition caches by origin. The trade-off is slightly more setup work.

### Q6: How does responsive typography work with clamp()?

`clamp(min, preferred, max)` lets font size scale fluidly with the viewport.
For example, `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` starts at 1rem
on small screens, grows proportionally with viewport width, and caps at 1.25rem
on large screens. This eliminates the need for breakpoint-based font size changes
and creates smooth scaling. The preferred value typically combines a rem base with
a vw unit to create the fluid behavior.

### Q7: What line-height values should you use for different text types?

Body text: **1.5-1.75** (generous leading for comfortable reading). Headings:
**1.1-1.3** (tighter because large text needs less leading). Large display text:
**1.0-1.1** (very tight, almost touching). Buttons and labels: **1.0-1.2**
(single line, vertically centered). These are ratios, not pixel values -- they
multiply against the font size. Adjust based on the specific font's metrics:
fonts with taller x-heights may need slightly more line-height.

### Q8: How do you handle font loading performance?

Four strategies in order of impact: (1) **Subset fonts** to include only needed
characters (Latin vs full Unicode). (2) **Use WOFF2 format** which compresses
30-50% better than WOFF. (3) **Preload critical fonts** with
`<link rel="preload">` in the HTML head. (4) **Limit weights and styles** -- load
only the 3-4 weights you actually use. Combined, these can reduce total font
payload from 500KB+ to under 100KB.

---

## Applying to Your Portfolio

### Current Font Setup

Your portfolio uses Poppins, self-hosted in `/public/fonts/`. This is already
a strong choice: Poppins is a geometric sans-serif with a tall x-height, making
it legible at all sizes.

### Recommended Improvements

1. **Add a monospace font** for any code snippets or technical content:

```jsx
// Add to your font setup
const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-mono',
  display: 'swap',
});
```

2. **Implement fluid type** for your headings to eliminate font-size breakpoints:

```css
/* In globals.css or design-system.ts */
.fluid-heading {
  font-size: clamp(1.75rem, 3vw + 0.5rem, 3rem);
  line-height: 1.1;
}

.fluid-subheading {
  font-size: clamp(1.25rem, 2vw + 0.25rem, 1.75rem);
  line-height: 1.3;
}
```

3. **Audit line lengths.** Add `max-w-prose` to body text containers to prevent
   overly wide paragraphs on large screens.

4. **Preload your primary font weight** in the HTML head for faster rendering:

```html
<link
  rel="preload"
  href="/fonts/Poppins-Regular.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

5. **Limit font weights.** Check which Poppins weights are actually used. Remove
   any unused weights from both the font-face declarations and the downloaded
   files to reduce payload.

### Typography Hierarchy for Portfolio

```
  Role               Size              Weight    Color
  ──────────────────────────────────────────────────────
  Section label      text-sm (14px)    600       accent color
  Section title      text-3xl (30px)   700       primary text
  Company name       text-xl (20px)    600       primary text
  Job title          text-lg (18px)    500       primary text
  Date range         text-sm (14px)    400       muted text
  Body / description text-base (16px)  400       secondary text
  Skill tag          text-xs (12px)    500       accent color
```

---

## Quick Reference

```
TYPE ANATOMY
─────────────────────────────────────────────
Baseline       Where letters sit
X-height       Height of lowercase "x"
Ascender       Above x-height (b, d, h)
Descender      Below baseline (g, p, y)
Cap height     Height of uppercase letters
Tracking       Overall letter spacing
Kerning        Spacing between specific pairs
Leading        Line spacing (line-height)

FONT CATEGORIES
─────────────────────────────────────────────
Serif          Traditional, authoritative
Sans-serif     Modern, clean, screen-friendly
Monospace      Code, tabular data
Display        Headlines only, large sizes

TYPE SCALES (base 16px)
─────────────────────────────────────────────
Major Second   1.125  (subtle steps)
Minor Third    1.200  (balanced)
Major Third    1.250  (clear hierarchy)
Perfect Fourth 1.333  (strong contrast)
Golden Ratio   1.618  (dramatic contrast)

LINE HEIGHT
─────────────────────────────────────────────
Body text      1.5 - 1.75
Headings       1.1 - 1.3
Display        1.0 - 1.1
Buttons        1.0 - 1.2

LINE LENGTH
─────────────────────────────────────────────
Ideal          45-75 characters (66 optimal)
CSS            max-width: 65ch
Tailwind       max-w-prose

FONT LOADING
─────────────────────────────────────────────
font-display: swap       Show fallback, swap later (FOUT)
font-display: optional   May skip custom font entirely
Preload critical fonts   <link rel="preload">
Use WOFF2 format         30-50% smaller than WOFF
Limit to 3-4 weights     Reduce total payload

SELF-HOST CHECKLIST
─────────────────────────────────────────────
[x] Download WOFF2 files
[x] Define @font-face declarations
[x] Set font-display: swap
[x] Preload primary weight
[x] Remove unused weights
[x] Test fallback font pairing
```
