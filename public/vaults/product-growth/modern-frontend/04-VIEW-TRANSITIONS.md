# View Transitions & Modern CSS APIs

## Overview

For years, smooth page transitions on the web required JavaScript animation libraries -- Framer Motion, GSAP, Barba.js. In 2023-2024, browsers shipped the View Transitions API, giving developers native, zero-dependency page transition animations. Combined with other modern CSS APIs like scroll-driven animations, `@starting-style`, and the Popover API, the platform now handles many animation patterns that previously required significant JavaScript.

Senior frontend interviews increasingly test your knowledge of native browser APIs over library APIs. Knowing that the View Transitions API exists -- and when it is preferable to Framer Motion -- demonstrates platform awareness that separates senior from mid-level candidates.

---

## Core Concepts

### The View Transitions API

The View Transitions API enables smooth animated transitions between DOM states. It works by capturing a screenshot of the current state, updating the DOM, capturing the new state, and animating between the two snapshots.

**Same-document (SPA) transitions:**

```javascript
// Basic view transition
function navigateToPage(newContent) {
  // Check for browser support
  if (!document.startViewTransition) {
    updateDOM(newContent);
    return;
  }

  const transition = document.startViewTransition(() => {
    // This callback updates the DOM
    // The browser snapshots before and after
    updateDOM(newContent);
  });

  // Optional: wait for the transition to finish
  transition.finished.then(() => {
    console.log('Transition complete');
  });
}

function updateDOM(content) {
  document.getElementById('main-content').innerHTML = content;
}
```

**What happens under the hood:**

1. Browser captures the current visual state as a bitmap ("old" snapshot)
2. Your callback runs, updating the DOM
3. Browser captures the new visual state as a bitmap ("new" snapshot)
4. Browser creates a pseudo-element overlay with both snapshots
5. Default animation: old state fades out, new state fades in
6. Pseudo-elements are removed after animation completes

### CSS Pseudo-Elements for View Transitions

The API creates a pseudo-element tree that you can style with CSS:

```
::view-transition
  ::view-transition-group(root)
    ::view-transition-image-pair(root)
      ::view-transition-old(root)       /* Screenshot of old state */
      ::view-transition-new(root)       /* Screenshot of new state */
```

```css
/* Customize the default fade transition */
::view-transition-old(root) {
  animation: fade-out 0.3s ease-in;
}

::view-transition-new(root) {
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

### Named View Transitions

The real power comes from naming specific elements so they animate independently:

```css
/* Give elements a view-transition-name */
.hero-image {
  view-transition-name: hero;
}

.page-title {
  view-transition-name: title;
}

/* Animate the hero image with a shared element transition */
::view-transition-group(hero) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

::view-transition-old(hero) {
  animation: none; /* Don't fade -- just morph */
}

::view-transition-new(hero) {
  animation: none;
}
```

```html
<!-- Page 1: Product listing -->
<div class="product-card">
  <img src="shoe.jpg" style="view-transition-name: hero" />
  <h2 style="view-transition-name: title">Running Shoe</h2>
</div>

<!-- Page 2: Product detail (after navigation) -->
<div class="product-detail">
  <img src="shoe-large.jpg" style="view-transition-name: hero" />
  <h1 style="view-transition-name: title">Running Shoe</h1>
</div>
```

When the transition runs, the browser automatically morphs the hero image from its position/size on page 1 to its position/size on page 2. This creates a "shared element transition" effect without any JavaScript animation code.

### Cross-Document View Transitions (MPA)

The most exciting development: view transitions that work across full page navigations in multi-page applications, with no JavaScript required.

```css
/* Enable cross-document view transitions with CSS only */
@view-transition {
  navigation: auto;
}

/* Name elements that should animate between pages */
.product-image {
  view-transition-name: product-hero;
}

.page-header {
  view-transition-name: header;
}

/* Customize the transition animation */
::view-transition-group(product-hero) {
  animation-duration: 0.35s;
}
```

**Requirements for cross-document transitions:**

- Both pages must be same-origin
- Both pages must opt in with `@view-transition { navigation: auto; }`
- Elements must share the same `view-transition-name`
- Each `view-transition-name` must be unique per page (no duplicates)

### Integration with React and Next.js

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

// Custom hook for view transition navigation
function useViewTransitionRouter() {
  const router = useRouter();

  const push = useCallback(
    (href: string) => {
      if (!document.startViewTransition) {
        router.push(href);
        return;
      }

      document.startViewTransition(() => {
        router.push(href);
      });
    },
    [router]
  );

  return { push };
}

// Usage in a component
function ProductCard({ product }) {
  const { push } = useViewTransitionRouter();

  return (
    <div
      onClick={() => push(`/products/${product.id}`)}
      className="product-card"
    >
      <img
        src={product.image}
        alt={product.name}
        style={{ viewTransitionName: `product-${product.id}` }}
      />
      <h2 style={{ viewTransitionName: `title-${product.id}` }}>
        {product.name}
      </h2>
    </div>
  );
}
```

```tsx
// Product detail page
function ProductDetail({ product }) {
  return (
    <div>
      <img
        src={product.image}
        alt={product.name}
        style={{ viewTransitionName: `product-${product.id}` }}
      />
      <h1 style={{ viewTransitionName: `title-${product.id}` }}>
        {product.name}
      </h1>
      <p>{product.description}</p>
    </div>
  );
}
```

### View Transitions vs Framer Motion / CSS Animations

| Feature                  | View Transitions API            | Framer Motion                     | CSS Animations |
| ------------------------ | ------------------------------- | --------------------------------- | -------------- |
| **Cross-page animation** | Native support                  | Requires AnimatePresence + layout | Not possible   |
| **Shared element morph** | Automatic with naming           | `layoutId` prop                   | Not possible   |
| **Bundle size**          | 0 KB (native)                   | ~30 KB gzipped                    | 0 KB           |
| **Configuration**        | CSS + minimal JS                | JSX props                         | CSS keyframes  |
| **Spring physics**       | No (CSS easing only)            | Yes                               | No             |
| **Gesture-driven**       | No                              | Yes (drag, pan, etc.)             | No             |
| **Exit animations**      | Automatic                       | Requires AnimatePresence          | Difficult      |
| **Browser support**      | Chrome, Edge, Safari 18+        | All browsers                      | All browsers   |
| **SSR compatible**       | Yes                             | Yes (with care)                   | Yes            |
| **Accessibility**        | Respects prefers-reduced-motion | Manual                            | Manual         |

**When to use View Transitions:** Page transitions, shared element animations between routes, simple fade/slide transitions between states. Use when you want zero-dependency page navigation animations.

**When to use Framer Motion:** Complex gesture-driven animations, spring physics, staggered list animations, drag interactions, and when you need consistent cross-browser support including older browsers.

### Progressive Enhancement

```css
/* Always start with reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}

/* Feature detection in CSS */
@supports (view-transition-name: none) {
  .card {
    view-transition-name: card;
  }
}
```

```javascript
// Feature detection in JavaScript
function navigate(url) {
  if (document.startViewTransition) {
    document.startViewTransition(() => loadPage(url));
  } else {
    loadPage(url);
  }
}
```

---

## Scroll-Driven Animations

The Scroll-Driven Animations API (CSS `animation-timeline`) lets you tie CSS animations to scroll progress without JavaScript. No Intersection Observer, no scroll event listeners, no requestAnimationFrame.

```css
/* Animate element based on scroll progress */
.progress-bar {
  animation: grow-width linear;
  animation-timeline: scroll(); /* Bind to scroll progress */
}

@keyframes grow-width {
  from {
    width: 0%;
  }
  to {
    width: 100%;
  }
}

/* Parallax effect driven by scroll */
.hero-background {
  animation: parallax linear;
  animation-timeline: scroll();
  animation-range: 0% 50%; /* Only animate for first half of scroll */
}

@keyframes parallax {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-100px);
  }
}
```

### View Timeline (element-based)

```css
/* Animate when element enters/exits viewport */
.reveal-on-scroll {
  animation: fade-in-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

```html
<!-- Elements animate as they scroll into view -->
<section class="reveal-on-scroll">
  <h2>Features</h2>
  <p>This section fades in as you scroll to it.</p>
</section>

<section class="reveal-on-scroll">
  <h2>Pricing</h2>
  <p>This section also fades in independently.</p>
</section>
```

### Named Scroll Timelines

```css
/* Create a named scroll timeline on a scrollable container */
.scroller {
  overflow-y: scroll;
  scroll-timeline-name: --my-scroller;
  scroll-timeline-axis: y;
}

/* Child elements use the named timeline */
.scroller .item {
  animation: slide-in linear both;
  animation-timeline: --my-scroller;
  animation-range: entry 0% entry 100%;
}

@keyframes slide-in {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

---

## The `@starting-style` Rule

`@starting-style` defines the initial style for elements when they first appear in the DOM, enabling entry animations with pure CSS. No JavaScript, no animation libraries.

```css
/* Dialog entry animation */
dialog[open] {
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 0.3s,
    transform 0.3s;

  /* Starting style when dialog first opens */
  @starting-style {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* Also handle exit animation */
dialog {
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.3s,
    transform 0.3s,
    display 0.3s allow-discrete;
}
```

```css
/* Card entry animation when added to DOM */
.card {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;

  @starting-style {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Works with dynamically added elements */
/* JavaScript: container.appendChild(newCard) triggers the animation */
```

**Key insight:** `@starting-style` solves the problem of animating from `display: none` to `display: block`. Previously, this required JavaScript to add a class after a frame. Now the browser handles the initial state natively.

```css
/* Animating display changes */
.tooltip {
  display: none;
  opacity: 0;
  transition:
    opacity 0.3s,
    display 0.3s allow-discrete;

  &.visible {
    display: block;
    opacity: 1;

    @starting-style {
      opacity: 0;
    }
  }
}
```

---

## The Popover API

The Popover API provides built-in popover behavior: toggle visibility, light dismiss (clicking outside), top-layer rendering (no z-index battles), and focus management.

```html
<!-- Declarative popover -- no JavaScript needed -->
<button popovertarget="my-popover">Open Menu</button>

<div id="my-popover" popover>
  <p>This is a popover!</p>
  <ul>
    <li>Option 1</li>
    <li>Option 2</li>
    <li>Option 3</li>
  </ul>
</div>
```

```css
/* Style the popover */
[popover] {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  /* Entry animation */
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 0.2s,
    transform 0.2s,
    display 0.2s allow-discrete;

  @starting-style {
    opacity: 0;
    transform: translateY(-10px);
  }
}

/* Exit animation */
[popover]:not(:popover-open) {
  opacity: 0;
  transform: translateY(-10px);
}

/* Style the backdrop */
[popover]::backdrop {
  background: rgba(0, 0, 0, 0.3);
  transition: opacity 0.2s;
}
```

### Popover Types

```html
<!-- Auto popover: light dismiss (click outside closes it) -->
<!-- Only one auto popover can be open at a time -->
<div id="menu" popover="auto">...</div>

<!-- Manual popover: explicit close required -->
<!-- Multiple manual popovers can coexist -->
<div id="toast" popover="manual">...</div>

<!-- Popover with explicit show/hide targets -->
<button popovertarget="menu" popovertargetaction="show">Open</button>
<button popovertarget="menu" popovertargetaction="hide">Close</button>
<button popovertarget="menu" popovertargetaction="toggle">Toggle</button>
```

### Programmatic Control

```javascript
const popover = document.getElementById('my-popover');

// Show/hide programmatically
popover.showPopover();
popover.hidePopover();
popover.togglePopover();

// Listen for toggle events
popover.addEventListener('toggle', (event) => {
  if (event.newState === 'open') {
    console.log('Popover opened');
  } else {
    console.log('Popover closed');
  }
});
```

### Anchor Positioning (CSS Anchor API)

The CSS Anchor Positioning API positions elements relative to an anchor element -- perfect for tooltips, dropdowns, and popovers.

```css
/* Define an anchor */
.trigger {
  anchor-name: --trigger;
}

/* Position relative to the anchor */
.tooltip {
  position: fixed;
  position-anchor: --trigger;

  /* Position below the trigger, centered */
  top: anchor(--trigger bottom);
  left: anchor(--trigger center);
  transform: translateX(-50%);

  /* Automatic fallback positioning */
  position-try-fallbacks: flip-block, flip-inline;
}
```

---

## Common Interview Questions

### Q1: Explain the View Transitions API and when you would use it.

**Answer:** The View Transitions API is a native browser API that enables smooth animated transitions between DOM states. It works by capturing before and after snapshots of the page, then animating between them using CSS.

For same-document (SPA) transitions, you call `document.startViewTransition(callback)` where the callback updates the DOM. For cross-document (MPA) transitions, you add `@view-transition { navigation: auto; }` to your CSS and the browser handles transitions automatically on navigation.

I would use it for page-to-page navigation transitions (replacing Framer Motion AnimatePresence for route changes), shared element animations between list and detail views (like a product image morphing from a card to a full-size hero), and simple state transitions where a cross-fade or slide is sufficient.

I would not use it when I need spring physics, gesture-driven animations, or complex orchestrated sequences -- those still require Framer Motion or GSAP. I also would not rely on it as the only animation mechanism when targeting browsers that do not support it yet -- progressive enhancement is essential.

### Q2: How do scroll-driven animations work and what do they replace?

**Answer:** Scroll-driven animations bind CSS animation progress to scroll position instead of time. You use `animation-timeline: scroll()` to bind to the overall page scroll, or `animation-timeline: view()` to bind to an element's visibility in the viewport.

They replace three common JavaScript patterns: Intersection Observer for reveal-on-scroll animations (now pure CSS with `animation-timeline: view()`), scroll event listeners with `requestAnimationFrame` for parallax effects (now `animation-timeline: scroll()`), and JavaScript scroll progress libraries (now a CSS one-liner for scroll progress bars).

The performance benefit is significant. JavaScript scroll handlers run on the main thread and can cause jank. Scroll-driven animations are handled by the compositor thread, running at 60fps even when the main thread is busy. They are also more declarative -- you define the animation in CSS and the browser handles the synchronization.

### Q3: What is `@starting-style` and what problem does it solve?

**Answer:** `@starting-style` defines the initial CSS values for an element when it first renders or transitions from `display: none` to a visible display value. It solves the long-standing problem of animating element entry without JavaScript.

Previously, if you set `display: none` on an element and then changed it to `display: block`, you could not animate the transition because the browser did not have a "from" state. Developers worked around this with JavaScript (add a class after a requestAnimationFrame) or by using `visibility`/`opacity` instead of `display`.

With `@starting-style`, you declare the initial values in CSS. When the element appears, the browser starts from the `@starting-style` values and transitions to the normal values. Combined with `transition: display allow-discrete`, you can now fully animate elements entering and leaving the DOM with pure CSS.

### Q4: Compare the Popover API to building a custom dropdown with JavaScript.

**Answer:** A custom JavaScript dropdown requires: toggling visibility (click handler), closing on outside click (document listener), closing on Escape key (keydown listener), z-index management (CSS stacking context), focus trapping (tabindex and focus management), and screen reader announcements (ARIA attributes).

The Popover API provides all of this natively: the `popovertarget` attribute handles toggling, `popover="auto"` provides light dismiss (outside click and Escape), the top layer eliminates z-index issues (popovers render above everything), focus management is built in, and semantics are handled automatically.

The result is less JavaScript, fewer bugs (especially around stacking context and focus management), and better accessibility out of the box. The main limitation is styling flexibility -- you need CSS to customize appearance, and browser support for features like anchor positioning is still rolling out. For complex dropdown menus with animations, nested menus, and keyboard navigation, a library like Radix or Headless UI still provides more control.

### Q5: How would you progressively enhance a page with View Transitions?

**Answer:** Progressive enhancement with View Transitions follows a three-tier approach:

Base tier (no JS, no View Transitions): Pages work as standard server-rendered HTML with normal navigation. Content is fully accessible and functional.

Middle tier (JS, no View Transitions): For browsers without View Transitions support, JavaScript enhances the experience with client-side navigation but no transition animations. Feature detection: `if (!document.startViewTransition)`.

Full tier (JS + View Transitions): Browsers that support the API get smooth animated transitions. The same client-side navigation is wrapped in `document.startViewTransition()`.

In CSS, I use `@supports (view-transition-name: none)` to apply view-transition-specific styles only when supported. I always include `@media (prefers-reduced-motion: reduce)` to disable animations for users who prefer reduced motion. The key principle is that the absence of animations should never break functionality.

---

## Gotchas & Edge Cases

1. **`view-transition-name` must be unique per page.** If two elements on the same page have the same `view-transition-name`, the transition fails silently. For list items, use unique names like `view-transition-name: product-${id}`.

2. **View transitions and scroll position.** During a view transition, the page scroll position may jump. Use `scroll-behavior: auto` during transitions or explicitly manage scroll restoration.

3. **Cross-document transitions require same origin.** View transitions between pages only work if both pages are on the same origin. Cross-origin navigation cannot have view transitions for security reasons.

4. **Scroll-driven animations and `position: fixed`.** Fixed-position elements do not scroll with the page, so `animation-timeline: scroll()` has no visible effect on them. Use `animation-timeline: scroll(root)` explicitly or reconsider the layout.

5. **`@starting-style` and specificity.** Styles inside `@starting-style` have the same specificity as their surrounding rule. If other styles override the `@starting-style` values, the animation will not work as expected.

6. **Popover and `dialog` overlap.** Both `<dialog>` and `[popover]` use the top layer, but they serve different purposes. `<dialog>` is for modal content requiring user action. Popovers are for supplementary content (tooltips, menus, notifications). Using the wrong one causes accessibility issues.

7. **Anchor positioning fallbacks.** The CSS Anchor Positioning API uses `position-try-fallbacks` for repositioning when the preferred position overflows. Without fallbacks, tooltips and dropdowns may be clipped by the viewport edge.

8. **Animation-timeline performance.** While scroll-driven animations run on the compositor, complex keyframes that trigger layout (changing `width`, `height`, `margin`) will not benefit from compositor optimization. Stick to `transform` and `opacity` for smooth performance.

9. **View Transitions and React state.** If a View Transition runs while React is updating state, the snapshot may capture an intermediate DOM state. Ensure state updates complete inside the `startViewTransition` callback.

10. **Browser support is still uneven.** As of early 2026, View Transitions (SPA) work in Chrome, Edge, and Safari 18+. Cross-document transitions have more limited support. Scroll-driven animations work in Chrome and Edge. Always provide fallbacks.

---

## Quick Reference

| API                                     | Purpose                           | Browser Support (2026)     |
| --------------------------------------- | --------------------------------- | -------------------------- |
| `document.startViewTransition()`        | SPA page transitions              | Chrome, Edge, Safari 18+   |
| `@view-transition { navigation: auto }` | MPA page transitions              | Chrome 126+, Edge          |
| `view-transition-name`                  | Named element transitions         | Chrome, Edge, Safari 18+   |
| `animation-timeline: scroll()`          | Scroll-progress animations        | Chrome, Edge               |
| `animation-timeline: view()`            | Viewport-entry animations         | Chrome, Edge               |
| `@starting-style`                       | Entry animations for new elements | Chrome, Edge, Safari 17.5+ |
| `popover` attribute                     | Native popover behavior           | All modern browsers        |
| `anchor-name` / `position-anchor`       | Anchor positioning                | Chrome 125+, Edge          |
| `transition: display allow-discrete`    | Animate display changes           | Chrome, Edge, Safari       |

| Pattern              | Old Approach                  | New Native Approach                  |
| -------------------- | ----------------------------- | ------------------------------------ |
| Page transitions     | Framer Motion AnimatePresence | View Transitions API                 |
| Shared element morph | Framer Motion layoutId        | `view-transition-name` matching      |
| Reveal on scroll     | Intersection Observer + JS    | `animation-timeline: view()`         |
| Scroll progress bar  | Scroll event + rAF            | `animation-timeline: scroll()`       |
| Parallax scrolling   | JS scroll listener            | `animation-timeline: scroll()`       |
| Entry animations     | JS class toggle after rAF     | `@starting-style`                    |
| Tooltips/dropdowns   | Custom JS + z-index           | Popover API + Anchor Positioning     |
| Modal dialogs        | Custom JS + focus trap        | `<dialog>` element                   |
| Display transitions  | `visibility` hack             | `transition: display allow-discrete` |

| View Transition Pseudo-Element       | Purpose                          |
| ------------------------------------ | -------------------------------- |
| `::view-transition`                  | Root overlay for all transitions |
| `::view-transition-group(name)`      | Container for a named transition |
| `::view-transition-image-pair(name)` | Holds old and new snapshots      |
| `::view-transition-old(name)`        | Snapshot of the old state        |
| `::view-transition-new(name)`        | Snapshot of the new state        |
