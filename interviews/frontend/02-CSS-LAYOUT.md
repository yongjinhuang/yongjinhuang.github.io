# CSS Layout & Responsive Design

## Overview

CSS layout is a core frontend interview topic because it tests your ability to translate visual designs into working interfaces. Interviewers want to see that you understand the underlying layout models (not just trial-and-error with properties), that you can build responsive designs that work across devices, and that you understand the cascade and specificity rules that govern how styles are applied.

The most commonly tested areas are:
- The box model (content, padding, border, margin)
- Flexbox (one-dimensional layout)
- CSS Grid (two-dimensional layout)
- Positioning and stacking contexts
- Responsive design with media queries
- CSS specificity and the cascade
- Modern CSS units and functions

---

## Core Concepts

### The Box Model

Every element in CSS generates a rectangular box. The box model defines how the dimensions of that box are calculated.

```
+------------------------------------------+
|              margin                       |
|  +------------------------------------+  |
|  |            border                  |  |
|  |  +------------------------------+  |  |
|  |  |          padding             |  |  |
|  |  |  +------------------------+  |  |  |
|  |  |  |       content          |  |  |  |
|  |  |  |   width x height      |  |  |  |
|  |  |  +------------------------+  |  |  |
|  |  +------------------------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

#### box-sizing

```css
/* DEFAULT (content-box): width/height = content only */
.content-box {
  box-sizing: content-box;
  width: 200px;
  padding: 20px;
  border: 2px solid black;
  /* Actual rendered width: 200 + 40 + 4 = 244px */
}

/* PREFERRED (border-box): width/height = content + padding + border */
.border-box {
  box-sizing: border-box;
  width: 200px;
  padding: 20px;
  border: 2px solid black;
  /* Actual rendered width: 200px (content shrinks to 156px) */
}

/* Best practice: apply border-box globally */
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

#### Margin Collapsing

Vertical margins between adjacent block elements collapse -- the larger margin wins instead of adding together.

```css
.box-a { margin-bottom: 30px; }
.box-b { margin-top: 20px; }
/* Gap between them: 30px (not 50px) */
```

Margin collapsing does NOT occur when:
- Elements are floated or absolutely positioned
- Parent has `overflow` other than `visible`
- Parent is a flex or grid container
- Parent has padding or border separating the margins

### Flexbox

Flexbox is a one-dimensional layout model for distributing space along a single axis (row or column).

#### Container Properties

```css
.flex-container {
  display: flex;            /* or inline-flex */

  /* Main axis direction */
  flex-direction: row;      /* row | row-reverse | column | column-reverse */

  /* Wrapping behavior */
  flex-wrap: nowrap;        /* nowrap | wrap | wrap-reverse */

  /* Shorthand for direction + wrap */
  flex-flow: row wrap;

  /* Alignment along main axis */
  justify-content: flex-start;
  /* flex-start | flex-end | center | space-between | space-around | space-evenly */

  /* Alignment along cross axis */
  align-items: stretch;
  /* stretch | flex-start | flex-end | center | baseline */

  /* Alignment of wrapped lines */
  align-content: stretch;
  /* stretch | flex-start | flex-end | center | space-between | space-around */

  /* Gap between items */
  gap: 16px;               /* row-gap and column-gap shorthand */
}
```

#### Item Properties

```css
.flex-item {
  /* Growth factor (default: 0) */
  flex-grow: 1;

  /* Shrink factor (default: 1) */
  flex-shrink: 0;

  /* Initial size before growing/shrinking (default: auto) */
  flex-basis: 200px;

  /* Shorthand: grow shrink basis */
  flex: 1 0 200px;

  /* Common shorthand values */
  flex: 1;      /* flex: 1 1 0%   - grow equally, can shrink */
  flex: auto;   /* flex: 1 1 auto - grow equally, respect content size */
  flex: none;   /* flex: 0 0 auto - fixed size, no grow/shrink */

  /* Override container's align-items for this item */
  align-self: center;

  /* Order (default: 0, lower = first) */
  order: -1;
}
```

#### Common Flexbox Patterns

```css
/* Center an element both horizontally and vertically */
.center-both {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

/* Push last item to the far end (e.g., navbar with logo left, menu right) */
.navbar {
  display: flex;
  align-items: center;
}
.navbar .menu {
  margin-left: auto;    /* pushes to the right */
}

/* Equal-width columns */
.equal-columns {
  display: flex;
}
.equal-columns > * {
  flex: 1;
}

/* Sticky footer */
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.page main {
  flex: 1;    /* main grows to fill available space */
}
```

### CSS Grid

Grid is a two-dimensional layout system for controlling both rows and columns simultaneously.

#### Container Properties

```css
.grid-container {
  display: grid;              /* or inline-grid */

  /* Define columns and rows */
  grid-template-columns: 200px 1fr 200px;   /* 3 columns */
  grid-template-rows: auto 1fr auto;        /* 3 rows */

  /* Repeat notation */
  grid-template-columns: repeat(3, 1fr);                /* 3 equal columns */
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); /* responsive */
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));  /* responsive, stretch */

  /* Gap between tracks */
  gap: 16px;                  /* row-gap and column-gap */
  row-gap: 16px;
  column-gap: 24px;

  /* Named areas */
  grid-template-areas:
    "header  header  header"
    "sidebar content aside"
    "footer  footer  footer";

  /* Alignment of all items within their cells */
  justify-items: stretch;     /* start | end | center | stretch */
  align-items: stretch;       /* start | end | center | stretch */

  /* Alignment of the grid within the container */
  justify-content: start;     /* start | end | center | space-between | space-around | space-evenly */
  align-content: start;

  /* Implicit track sizing (for auto-generated rows/columns) */
  grid-auto-rows: minmax(100px, auto);
  grid-auto-columns: 1fr;
  grid-auto-flow: row;        /* row | column | dense */
}
```

#### Item Properties

```css
.grid-item {
  /* Placement by line numbers */
  grid-column: 1 / 3;        /* start line / end line */
  grid-row: 1 / 2;

  /* Shorthand */
  grid-column: 1 / span 2;   /* start at 1, span 2 columns */
  grid-row: 2 / -1;          /* start at row 2, end at last line */

  /* Placement by named area */
  grid-area: header;

  /* Self-alignment within cell */
  justify-self: center;
  align-self: end;
}
```

#### auto-fill vs. auto-fit

```css
/* auto-fill: keeps empty tracks */
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
/* If container is 1000px and items are 200px, creates 5 columns.
   Empty columns remain, items do NOT stretch to fill. */

/* auto-fit: collapses empty tracks */
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
/* If container is 1000px and only 3 items exist,
   items stretch to fill the entire width. */
```

### Positioning

```css
/* static (default): normal document flow */
.static { position: static; }

/* relative: offset from normal position, keeps space in flow */
.relative {
  position: relative;
  top: 10px;
  left: 20px;
  /* Element still occupies its original space */
}

/* absolute: removed from flow, positioned relative to nearest positioned ancestor */
.absolute {
  position: absolute;
  top: 0;
  right: 0;
  /* If no positioned ancestor, uses viewport */
}

/* fixed: removed from flow, positioned relative to viewport */
.fixed {
  position: fixed;
  bottom: 20px;
  right: 20px;
  /* Stays in place during scroll */
}

/* sticky: hybrid of relative and fixed */
.sticky {
  position: sticky;
  top: 0;
  /* Acts relative until scroll position reaches offset, then acts fixed */
  /* Requires a scrolling ancestor and explicit top/bottom value */
}
```

### Z-Index and Stacking Contexts

`z-index` only works on positioned elements (not `static`). A stacking context is a three-dimensional conceptualization of HTML elements along the z-axis.

#### What Creates a Stacking Context

```css
/* Any of these create a new stacking context: */
.stacking-context {
  position: relative; z-index: 1;  /* positioned + z-index != auto */
  opacity: 0.99;                   /* opacity < 1 */
  transform: translateZ(0);        /* any transform */
  filter: blur(0);                 /* any filter */
  isolation: isolate;              /* explicit isolation */
  will-change: transform;          /* will-change */
  /* Also: flex/grid children with z-index != auto */
}
```

#### Stacking Order (bottom to top)

1. Background and borders of the stacking context
2. Child stacking contexts with negative `z-index`
3. In-flow, non-positioned block elements
4. Non-positioned floats
5. In-flow, non-positioned inline elements
6. Child stacking contexts with `z-index: 0` (or `auto`)
7. Child stacking contexts with positive `z-index`

**Key rule**: `z-index` values are only compared within the same stacking context. A `z-index: 9999` inside a low stacking context will still appear behind a `z-index: 1` in a higher stacking context.

### CSS Specificity

Specificity determines which CSS rule wins when multiple rules target the same element.

#### Specificity Calculation

Specificity is calculated as a tuple: **(Inline, ID, Class, Element)**

| Selector | Specificity | Score |
|----------|-------------|-------|
| `*` | 0,0,0,0 | 0 |
| `div` | 0,0,0,1 | 1 |
| `div p` | 0,0,0,2 | 2 |
| `.class` | 0,0,1,0 | 10 |
| `div.class` | 0,0,1,1 | 11 |
| `#id` | 0,1,0,0 | 100 |
| `#id .class` | 0,1,1,0 | 110 |
| `style=""` | 1,0,0,0 | 1000 |
| `!important` | Overrides all specificity | - |

```css
/* Specificity: 0,0,1,0 */
.button { color: blue; }

/* Specificity: 0,0,2,0 (wins over .button) */
.nav .button { color: red; }

/* Specificity: 0,1,0,0 (wins over classes) */
#submit { color: green; }

/* Specificity: 0,0,1,1 */
p.intro { color: purple; }
```

#### Modern Specificity Tools

```css
/* :where() has ZERO specificity */
:where(.button) { color: blue; }          /* 0,0,0,0 */

/* :is() takes the highest specificity of its arguments */
:is(#id, .class) { color: red; }          /* 0,1,0,0 */

/* :has() takes the specificity of its argument */
.card:has(> img) { border: 1px solid; }   /* 0,0,2,1 */

/* @layer controls cascade ordering */
@layer base, components, utilities;

@layer base {
  a { color: blue; }
}
@layer utilities {
  .text-red { color: red; }  /* wins: later layer */
}
```

### CSS Units

| Unit | Type | Relative To | Use Case |
|------|------|-------------|----------|
| `px` | Absolute | - | Borders, shadows, precise sizing |
| `rem` | Relative | Root font-size | Font sizes, spacing, consistent scaling |
| `em` | Relative | Parent font-size | Component-scoped sizing |
| `%` | Relative | Parent dimension | Fluid layouts |
| `vw` | Relative | Viewport width | Full-width elements |
| `vh` | Relative | Viewport height | Full-height sections |
| `dvh` | Relative | Dynamic viewport height | Mobile-safe full height |
| `svh` | Relative | Smallest viewport height | Conservative full height |
| `lvh` | Relative | Largest viewport height | Maximum full height |
| `ch` | Relative | Width of "0" character | Text-width constraints |
| `fr` | Relative | Free space in grid | Grid track sizing |
| `clamp()` | Function | min, preferred, max | Fluid typography |
| `min()` | Function | Smallest value | Responsive constraints |
| `max()` | Function | Largest value | Minimum sizing |

```css
/* Fluid typography with clamp */
h1 {
  font-size: clamp(1.5rem, 4vw + 0.5rem, 3rem);
  /* Minimum: 1.5rem, Maximum: 3rem, Scales with viewport */
}

/* Container query units */
.card {
  container-type: inline-size;
}
.card h2 {
  font-size: clamp(1rem, 5cqi, 2rem);  /* cqi = container query inline */
}
```

### Media Queries and Responsive Design

```css
/* Breakpoint approach (mobile-first) */
.container { padding: 16px; }

@media (min-width: 640px) {   /* sm */
  .container { padding: 24px; }
}
@media (min-width: 768px) {   /* md */
  .container { padding: 32px; max-width: 768px; }
}
@media (min-width: 1024px) {  /* lg */
  .container { max-width: 1024px; }
}
@media (min-width: 1280px) {  /* xl */
  .container { max-width: 1280px; }
}

/* Feature queries */
@supports (display: grid) {
  .layout { display: grid; }
}

/* Preference queries */
@media (prefers-color-scheme: dark) {
  :root { --bg: #1a1a1a; --text: #e0e0e0; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
@media (hover: none) {
  /* Touch device: no hover effects */
  .tooltip { display: none; }
}

/* Container queries */
.card-container {
  container-type: inline-size;
  container-name: card;
}
@container card (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### BEM Methodology

BEM (Block, Element, Modifier) is a CSS naming convention that creates clear, predictable class structures.

```css
/* Block: standalone component */
.card { }

/* Element: part of a block (double underscore) */
.card__header { }
.card__body { }
.card__footer { }
.card__title { }

/* Modifier: variation of a block or element (double hyphen) */
.card--featured { }
.card--compact { }
.card__title--large { }
.card__footer--sticky { }
```

```html
<article class="card card--featured">
  <header class="card__header">
    <h2 class="card__title card__title--large">Title</h2>
  </header>
  <div class="card__body">
    <p>Content here</p>
  </div>
  <footer class="card__footer">
    <button class="card__button">Read More</button>
  </footer>
</article>
```

---

## Common Interview Questions

### 1. "Explain the difference between Flexbox and Grid. When would you use each?"

**Answer**: Flexbox is one-dimensional (row OR column), while Grid is two-dimensional (rows AND columns simultaneously).

Use **Flexbox** when:
- You need to align items along a single axis
- The content determines the layout (content-first)
- You are building navigation bars, toolbars, or centering elements
- Items should share available space dynamically

Use **Grid** when:
- You need to control both rows and columns
- The layout determines the content placement (layout-first)
- You are building page-level layouts, dashboards, or card grids
- You need overlapping elements or complex alignment

They work well together: Grid for page layout, Flexbox for component-level alignment within grid cells.

### 2. "How does `z-index` work? Why is my element not appearing on top?"

**Answer**: `z-index` only works on positioned elements (`position` value other than `static`). The most common reason an element does not appear on top despite a high `z-index` is that it exists in a lower stacking context. Each stacking context is an independent layer; `z-index` values are only compared within the same context.

Debug steps:
1. Verify the element has `position: relative/absolute/fixed/sticky`
2. Check if any ancestor creates a stacking context (transform, opacity, filter, etc.)
3. Use DevTools to inspect the stacking context hierarchy
4. Consider using `isolation: isolate` on parent containers to create explicit stacking contexts

### 3. "What is the difference between `display: none`, `visibility: hidden`, and `opacity: 0`?"

**Answer**:

| Property | Visible | Takes Space | Accessible | Events | Transition |
|----------|---------|-------------|------------|--------|------------|
| `display: none` | No | No | No | No | No |
| `visibility: hidden` | No | Yes | No | No | Yes |
| `opacity: 0` | No | Yes | Yes | Yes | Yes |

- `display: none` removes the element from the layout entirely. Cannot be transitioned.
- `visibility: hidden` hides the element but it still takes up space. Children can override with `visibility: visible`.
- `opacity: 0` makes the element transparent but it remains interactive (clicks still register). Creates a stacking context.

### 4. "How would you implement a responsive card grid where cards are at least 250px wide?"

**Answer**: Use CSS Grid with `auto-fit` and `minmax`:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}
```

This automatically creates as many columns as fit, with each column being at least 250px. If fewer cards exist, they stretch to fill available space. No media queries needed.

For equal-height cards with bottom-aligned content:

```css
.card {
  display: flex;
  flex-direction: column;
}
.card__body {
  flex: 1;                /* pushes footer down */
}
```

### 5. "Explain CSS specificity and how to avoid specificity wars."

**Answer**: Specificity is calculated as a tuple: (inline, id, class, element). Higher specificity wins when multiple rules target the same property on the same element.

Strategies to avoid specificity wars:
- Use a consistent methodology (BEM, CSS Modules, or utility-first like Tailwind)
- Avoid IDs in selectors (too specific)
- Avoid `!important` (makes debugging difficult)
- Keep selectors flat (max 2-3 levels of nesting)
- Use CSS custom properties (cascade naturally)
- Use `@layer` to control cascade order
- Use `:where()` for zero-specificity defaults

### 6. "What is the difference between `em` and `rem`?"

**Answer**: Both are relative units, but they differ in what they are relative to:
- **`rem`** is relative to the root element (`<html>`) font size (usually 16px)
- **`em`** is relative to the parent element's font size

```css
html { font-size: 16px; }

.parent {
  font-size: 20px;
}
.child {
  font-size: 1.5em;   /* 20px * 1.5 = 30px */
  padding: 1.5rem;    /* 16px * 1.5 = 24px */
}
```

**Best practice**: Use `rem` for font sizes and spacing (predictable, scales with user preferences). Use `em` for component-internal sizing that should scale with the component's own font size (e.g., padding on a button that should grow with its text size).

### 7. "How does `position: sticky` work and what are its gotchas?"

**Answer**: `position: sticky` makes an element act as `relative` until the scroll position crosses a threshold (defined by `top`, `bottom`, etc.), then it acts as `fixed` within its containing block.

Common gotchas:
- **Must have a threshold**: At least one of `top`, `bottom`, `left`, `right` must be set
- **Contained by parent**: The sticky element only sticks within its parent. Once the parent scrolls out of view, the sticky element goes with it
- **Overflow kills it**: If any ancestor has `overflow: hidden`, `overflow: scroll`, or `overflow: auto`, sticky positioning may not work
- **No height on parent**: If the parent has no explicit height or content beyond the sticky element, there is nowhere to scroll, so sticky has no effect

```css
/* Table with sticky header */
table {
  overflow: visible;       /* required */
}
thead th {
  position: sticky;
  top: 0;
  background: white;      /* needs background to cover content */
  z-index: 1;             /* stack above body cells */
}
```

### 8. "Explain the CSS cascade and how `@layer` works."

**Answer**: The cascade determines which CSS declarations win when multiple rules apply. The order of priority (highest to lowest):

1. `!important` declarations (in reverse layer order)
2. Inline styles
3. Layers (later layers win)
4. Specificity
5. Source order (later wins)

`@layer` allows explicit control of cascade ordering:

```css
/* Declare layer order upfront */
@layer reset, base, components, utilities;

@layer reset {
  * { margin: 0; padding: 0; }
}

@layer base {
  a { color: blue; }           /* Lower priority */
}

@layer utilities {
  .text-red { color: red; }   /* Higher priority (later layer) */
}

/* Un-layered styles have the HIGHEST priority */
a { color: green; }           /* Wins over all layers */
```

---

## Code Examples

### Holy Grail Layout

```css
/* Classic layout: header, sidebar, content, aside, footer */
.layout {
  display: grid;
  grid-template-areas:
    "header  header  header"
    "sidebar content aside"
    "footer  footer  footer";
  grid-template-columns: 200px 1fr 200px;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}

.header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
.content { grid-area: content; }
.aside   { grid-area: aside; }
.footer  { grid-area: footer; }

/* Collapse to single column on mobile */
@media (max-width: 768px) {
  .layout {
    grid-template-areas:
      "header"
      "content"
      "sidebar"
      "aside"
      "footer";
    grid-template-columns: 1fr;
  }
}
```

### Responsive Navigation

```css
.nav {
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 64px;
}

.nav__logo {
  margin-right: auto;
}

.nav__links {
  display: flex;
  gap: 24px;
  list-style: none;
}

.nav__toggle {
  display: none;
}

@media (max-width: 768px) {
  .nav__links {
    display: none;
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    flex-direction: column;
    background: white;
    padding: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .nav__links--open {
    display: flex;
  }

  .nav__toggle {
    display: block;
  }
}
```

### Aspect Ratio Card

```css
/* Modern approach */
.card-image {
  aspect-ratio: 16 / 9;
  object-fit: cover;
  width: 100%;
}

/* Fallback for older browsers (padding-top hack) */
.card-image-wrapper {
  position: relative;
  padding-top: 56.25%;    /* 9 / 16 = 0.5625 = 56.25% */
}
.card-image-wrapper img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

### Fluid Typography System

```css
:root {
  /* Base: 16px at 320px viewport, 20px at 1200px viewport */
  --font-base: clamp(1rem, 0.5rem + 1.25vw, 1.25rem);

  /* Scale ratio */
  --font-sm: clamp(0.875rem, 0.75rem + 0.5vw, 0.9375rem);
  --font-lg: clamp(1.25rem, 0.75rem + 2vw, 1.75rem);
  --font-xl: clamp(1.5rem, 0.5rem + 3.5vw, 2.5rem);
  --font-2xl: clamp(2rem, 0.5rem + 5vw, 3.5rem);

  /* Spacing scale based on font size */
  --space-xs: calc(var(--font-base) * 0.25);
  --space-sm: calc(var(--font-base) * 0.5);
  --space-md: calc(var(--font-base) * 1);
  --space-lg: calc(var(--font-base) * 2);
  --space-xl: calc(var(--font-base) * 4);
}

body { font-size: var(--font-base); }
h1   { font-size: var(--font-2xl); }
h2   { font-size: var(--font-xl); }
h3   { font-size: var(--font-lg); }
small { font-size: var(--font-sm); }
```

### Centering Techniques

```css
/* 1. Flexbox centering */
.center-flex {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 2. Grid centering (shortest) */
.center-grid {
  display: grid;
  place-items: center;
}

/* 3. Absolute + transform */
.center-absolute {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 4. Margin auto (block element with known width) */
.center-margin {
  margin-inline: auto;     /* or margin: 0 auto; */
  width: fit-content;
}

/* 5. Absolute + inset + margin */
.center-inset {
  position: absolute;
  inset: 0;
  margin: auto;
  width: fit-content;
  height: fit-content;
}
```

---

## Gotchas & Edge Cases

### 1. Percentage Heights Require Parent Height

```css
/* BROKEN: parent has no explicit height */
.parent { /* no height defined */ }
.child { height: 50%; }    /* 50% of what? Ignored. */

/* FIXED: chain of explicit heights */
html, body { height: 100%; }
.parent { height: 100%; }
.child { height: 50%; }    /* 50% of parent: works */

/* BETTER: use min-height with flex */
.parent {
  display: flex;
  min-height: 100vh;
}
.child {
  flex: 1;
}
```

### 2. Flexbox min-width Default

Flex items have `min-width: auto` by default, which prevents them from shrinking below their content size. This causes overflow.

```css
/* Text overflows the flex container */
.flex-container { display: flex; width: 300px; }
.long-text { /* default min-width: auto prevents shrinking */ }

/* Fix: override min-width */
.long-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 3. The 100vh Problem on Mobile

On mobile browsers, `100vh` includes the area behind the address bar, causing content to be cut off.

```css
/* Problem */
.hero { height: 100vh; }   /* Too tall on mobile */

/* Fix: use dvh (dynamic viewport height) */
.hero { height: 100dvh; }

/* Fallback for older browsers */
.hero {
  height: 100vh;
  height: 100dvh;
}
```

### 4. Grid Item Overflow

Grid items expand to fit their content by default, potentially breaking the grid layout.

```css
/* Long content breaks grid */
.grid { display: grid; grid-template-columns: 1fr 1fr; }
.grid-item { /* long URL or unbreakable text overflows */ }

/* Fix */
.grid-item {
  min-width: 0;
  overflow-wrap: break-word;
}
```

### 5. Collapsing Margins on First/Last Child

The first child's top margin and parent's top margin collapse. The last child's bottom margin and parent's bottom margin collapse.

```css
/* Parent appears to have no top padding despite child's margin */
.parent { background: gray; }
.child { margin-top: 20px; }   /* Collapses with parent */

/* Fixes */
.parent {
  /* Any of these prevents collapsing: */
  overflow: hidden;
  /* or */ padding-top: 1px;
  /* or */ border-top: 1px solid transparent;
  /* or */ display: flex;
}
```

### 6. Inline Elements Ignore Vertical Properties

Inline elements (`<span>`, `<a>`, `<em>`) ignore `width`, `height`, `margin-top`, and `margin-bottom`.

```css
/* These have NO effect on inline elements */
span {
  width: 200px;       /* ignored */
  height: 100px;      /* ignored */
  margin-top: 20px;   /* ignored */
}

/* Fix: change display */
span {
  display: inline-block;   /* now respects width/height/margin */
}
```

---

## Quick Reference

### Flexbox Cheat Sheet

| Property | Values | Default | Applies To |
|----------|--------|---------|------------|
| `flex-direction` | row, column, row-reverse, column-reverse | row | Container |
| `flex-wrap` | nowrap, wrap, wrap-reverse | nowrap | Container |
| `justify-content` | flex-start, center, flex-end, space-between, space-around, space-evenly | flex-start | Container |
| `align-items` | stretch, flex-start, center, flex-end, baseline | stretch | Container |
| `align-content` | stretch, flex-start, center, flex-end, space-between, space-around | stretch | Container |
| `gap` | length | 0 | Container |
| `flex-grow` | number | 0 | Item |
| `flex-shrink` | number | 1 | Item |
| `flex-basis` | length, auto | auto | Item |
| `align-self` | auto, flex-start, center, flex-end, stretch | auto | Item |
| `order` | integer | 0 | Item |

### Grid Cheat Sheet

| Property | Values | Default | Applies To |
|----------|--------|---------|------------|
| `grid-template-columns` | lengths, fr, repeat(), minmax() | none | Container |
| `grid-template-rows` | lengths, fr, repeat(), minmax() | none | Container |
| `grid-template-areas` | named areas | none | Container |
| `gap` | length | 0 | Container |
| `justify-items` | start, end, center, stretch | stretch | Container |
| `align-items` | start, end, center, stretch | stretch | Container |
| `grid-column` | start / end, span | auto | Item |
| `grid-row` | start / end, span | auto | Item |
| `grid-area` | named area | auto | Item |
| `justify-self` | start, end, center, stretch | stretch | Item |
| `align-self` | start, end, center, stretch | stretch | Item |

### Common Breakpoints

| Name | Width | Target |
|------|-------|--------|
| xs | < 640px | Phones (portrait) |
| sm | >= 640px | Phones (landscape) |
| md | >= 768px | Tablets |
| lg | >= 1024px | Laptops |
| xl | >= 1280px | Desktops |
| 2xl | >= 1536px | Large desktops |

### Display Property Reference

| Value | Flow | Sizing | Use Case |
|-------|------|--------|----------|
| `block` | New line | Full width | Sections, divs |
| `inline` | Same line | Content width | Text, spans |
| `inline-block` | Same line | Respects width/height | Buttons, badges |
| `flex` | Block-level flex | Container width | Component layout |
| `inline-flex` | Inline-level flex | Content width | Inline groups |
| `grid` | Block-level grid | Container width | Page layout |
| `inline-grid` | Inline-level grid | Content width | Inline grids |
| `none` | Removed | None | Hidden elements |
| `contents` | Ghost parent | None | Wrapper removal |
