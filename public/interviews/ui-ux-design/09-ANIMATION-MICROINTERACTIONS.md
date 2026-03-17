# Animation & Micro-interactions

## Overview

Animation is the difference between a website that feels like a document and one that
feels like an experience. Well-crafted motion guides attention, provides feedback,
maintains context during transitions, and adds personality. Poorly executed animation
feels sluggish, distracting, or nauseating.

This guide covers the purpose and principles of UI animation, timing and easing, CSS
versus JS animation approaches, Framer Motion, micro-interactions, scroll effects,
page transitions, performance, and accessibility.

---

## Core Concepts

### Purpose of Animation

Every UI animation should serve at least one purpose:

1. **Feedback** - Confirming an action was received (button press, toggle slide)
2. **Orientation** - Helping users understand spatial relationships (sidebar slides from left)
3. **Delight** - Adding personality (confetti on completion, playful loading)
4. **Continuity** - Maintaining context during state changes (shared element transitions)

If an animation serves none of these, remove it.

### The 12 Principles of Animation (Disney)

The most relevant principles for UI work:

- **Squash and Stretch** - Objects deform to convey weight (buttons that squish on press)
- **Anticipation** - Preparatory motion before main action (pull-back before launch)
- **Staging** - Direct attention to what matters (dim background for modal)
- **Follow Through** - Elements do not stop all at once (staggered menu items)
- **Slow In and Slow Out** - Natural acceleration and deceleration (easing)
- **Timing** - Speed conveys weight: fast = light/snappy, slow = heavy/important
- **Secondary Action** - Supporting motion enriching the primary (checkmark after modal)
- **Appeal** - Making motion feel pleasant (clean easing, consistent timing)

### Timing and Easing Functions

**Duration guidelines:**

| Animation Type         | Duration      |
|------------------------|---------------|
| Micro-interaction      | 100-200ms     |
| Hover / focus state    | 150-250ms     |
| Component entrance     | 200-400ms     |
| Modal / overlay        | 250-350ms     |
| Page transition        | 300-500ms     |

**Easing functions:**

```
ease-in:     Slow start, fast end     → Elements leaving the screen
ease-out:    Fast start, slow end     → Elements entering the screen
ease-in-out: Slow start and end       → Elements moving on screen
linear:      Constant speed           → Spinners, progress bars
spring:      Overshoots then settles  → Playful, natural interactions
```

**CSS cubic-bezier values:**

```css
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0.0, 1, 1);
--ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

### CSS Transitions vs CSS Animations vs JS Animations

**CSS Transitions** animate between two states on property change. Use for hover, focus,
simple toggles.

```css
.button {
  transform: scale(1);
  transition: transform 200ms ease-out;
}
.button:hover { transform: scale(1.05); }
.button:active { transform: scale(0.95); }
```

**CSS Animations** use `@keyframes` for multi-step sequences. Use for spinners,
entrances, continuous effects.

```css
@keyframes slideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.card { animation: slideIn 400ms ease-out forwards; }
```

**JS Animations** provide dynamic control: start, stop, reverse, chain, respond to
input. Use for gestures, complex orchestration, runtime-dependent values.

| Capability               | CSS Transition | CSS Animation | JS Animation |
|--------------------------|:--------------:|:-------------:|:------------:|
| Simple state changes     | Yes            |               |              |
| Multi-step sequences     |                | Yes           | Yes          |
| Dynamic/gesture-driven   |                |               | Yes          |
| Mount/unmount animations |                |               | Yes          |
| GPU performance          | Yes            | Yes           | Depends      |

### Framer Motion Basics

**Motion components** replace HTML elements with animated versions:

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: "easeOut" }}
  className="rounded-xl bg-white p-6 shadow-md"
>
  Content here
</motion.div>
```

**Variants** define named states and enable child orchestration:

```tsx
const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

<motion.ul variants={container} initial="hidden" animate="visible">
  {items.map((i) => <motion.li key={i} variants={item}>{i}</motion.li>)}
</motion.ul>
```

**AnimatePresence** enables exit animations on unmount:

```tsx
<AnimatePresence>
  {isVisible && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    />
  )}
</AnimatePresence>
```

**Layout animations** automatically animate position/size changes:

```tsx
<motion.div layout className="rounded-lg bg-blue-500 p-4">
  {isExpanded && <p>Additional content</p>}
</motion.div>
```

### Micro-interactions

Small, contained animations responding to user actions.

**Hover and press:**

```tsx
<motion.button
  whileHover={{ scale: 1.05, y: -2 }}
  whileTap={{ scale: 0.95 }}
  transition={{ type: "spring", stiffness: 400, damping: 17 }}
  className="rounded-lg bg-blue-600 px-6 py-3 text-white"
>
  Click me
</motion.button>
```

**Toggle switch:**

```tsx
function Toggle({ isOn, onToggle }: ToggleProps) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={isOn}
      className={cn("relative h-7 w-12 rounded-full transition-colors",
        isOn ? "bg-blue-600" : "bg-gray-300")}>
      <motion.div
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md"
        animate={{ x: isOn ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
```

### Scroll-based Animations

**Fade-in on scroll:**

```tsx
<motion.div
  initial={{ opacity: 0, y: 40 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-100px" }}
  transition={{ duration: 0.6, ease: "easeOut" }}
>
  {children}
</motion.div>
```

**Scroll progress indicator:**

```tsx
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      className="fixed left-0 right-0 top-0 z-50 h-1 origin-left bg-blue-600"
      style={{ scaleX: scrollYProgress }}
    />
  );
}
```

Use `viewport={{ once: true }}` so elements animate in only once. Keep translations
subtle (20-40px, not 100px).

### Page Transitions

```tsx
function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

| Pattern       | Effect                       | When to Use              |
|---------------|------------------------------|--------------------------|
| Fade          | Opacity 0 to 1               | Default, always works    |
| Slide         | Translate X or Y             | Linear navigation flows  |
| Scale         | Scale from 0.95 to 1         | Modal-like page reveals  |
| Shared layout | Element morphs between pages | Detail views, galleries  |

### Loading Animations

**Spinner (CSS):**

```css
.spinner {
  width: 24px; height: 24px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

**Skeleton shimmer (CSS):**

```css
.skeleton {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Performance Considerations

**GPU-accelerated (cheap):** `transform`, `opacity`
**CPU-bound (expensive):** `width`, `height`, `top`, `left`, `margin`, `padding`

```
Rendering Pipeline:
JavaScript -> Style -> Layout -> Paint -> Composite

transform/opacity:  Skip to ─────────────> Composite  (fast)
width/height:       Layout -> Paint -> Composite       (slow)
```

**Best practices:**

- Animate only `transform` and `opacity` when possible
- Use `will-change: transform` sparingly, remove after animation
- Use `requestAnimationFrame` for JS animations, not `setTimeout`
- Target 60fps (16.67ms per frame)
- Profile with Chrome DevTools Performance tab

### When NOT to Animate: Accessibility

The `prefers-reduced-motion` media query is not optional.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**In Framer Motion:**

```tsx
const shouldReduceMotion = useReducedMotion();

<motion.div
  initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4 }}
/>
```

- Reduce motion, do not remove state changes (opacity fades are fine)
- Avoid flashing content (max 3 flashes/second per WCAG)
- Large-scale motion (parallax, page transitions) should go first
- Test with reduced motion enabled in your OS

---

## Practical Examples

### Staggered List Entrance

```tsx
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 } },
};

function ExperienceTimeline({ experiences }: { experiences: readonly Experience[] }) {
  return (
    <motion.div variants={container} initial="hidden" whileInView="show"
      viewport={{ once: true }}>
      {experiences.map((exp) => (
        <motion.div key={exp.id} variants={item} className="mb-8 rounded-xl border p-6">
          <h3 className="text-lg font-semibold">{exp.title}</h3>
          <p className="text-gray-500">{exp.company}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

### Animated Theme Toggle

```tsx
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}>
      <AnimatePresence mode="wait">
        <motion.div key={isDark ? "moon" : "sun"}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}>
          {isDark ? <MoonIcon /> : <SunIcon />}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
```

### Hover Card with Depth

```tsx
<motion.div
  whileHover={{ y: -8, rotateX: 2, rotateY: -2,
    transition: { type: "spring", stiffness: 300, damping: 20 } }}
  className="cursor-pointer rounded-xl border bg-white p-6 shadow-sm"
  style={{ transformPerspective: 800 }}
>
  <h3 className="text-xl font-bold">{project.title}</h3>
  <p className="mt-2 text-gray-500">{project.description}</p>
</motion.div>
```

---

## Common Interview Questions

### 1. What is the purpose of animation in UI design?

Feedback (confirming actions), orientation (spatial understanding), delight (personality),
and continuity (context during transitions). Every animation should serve at least one.
If none, remove it. Feedback is the most important.

### 2. What properties should you animate for best performance?

`transform` and `opacity`. They are GPU-composited without triggering layout or paint.
Animating `width`, `height`, `top`, `left` triggers layout recalculation, causing jank.
Use `transform: scale()` for size and `translate()` for position instead.

### 3. How do you handle animation accessibility?

Check `prefers-reduced-motion` and respect it. In CSS, disable via media query. In
Framer Motion, use `useReducedMotion`. Replace animations with instant changes or
subtle fades. Never flash more than 3 times per second. Test with reduced motion on.

### 4. CSS transitions vs CSS animations?

Transitions animate between two states on property change (hover, focus, class toggle).
Animations use `@keyframes` for multi-step sequences that can loop and run automatically.
Use transitions for interactive states, animations for autonomous effects.

### 5. What is AnimatePresence and why is it important?

It enables exit animations for unmounting React components. Without it, elements vanish
instantly. AnimatePresence keeps components in the DOM until their `exit` animation
completes. Essential for modals, notifications, page transitions.

### 6. How do you decide on duration and easing?

Micro-interactions: 100-200ms. Entrances: 200-400ms. Page transitions: 300-500ms.
Use ease-out for entering elements, ease-in for leaving, ease-in-out for on-screen
movement. Spring for playful interactions. Linear only for spinners/progress bars.

### 7. When should you NOT animate?

When user requests reduced motion. When animation serves no purpose (feedback,
orientation, continuity). When it delays content appearance. When it makes interactions
feel slower than instant. A 50ms operation needs no 300ms animation wrapper.

---

## Applying to Your Portfolio

### Section Entrance Animations

Wrap sections in scroll-triggered fade-ins with staggered children:

```tsx
<motion.section
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-50px" }}
  transition={{ duration: 0.5, ease: "easeOut" }}
>
  {/* Section content */}
</motion.section>
```

### Interactive Skill Tags

Add spring-based hover/tap micro-interactions to your `SkillTag` component with
`whileHover={{ scale: 1.08, y: -2 }}` and `whileTap={{ scale: 0.95 }}`.

### Animated Background Accessibility

Your `AnimatedBackground` should respect `prefers-reduced-motion` by pausing or
reducing animation intensity, demonstrating accessibility awareness.

### Experience Timeline Stagger

Use staggered entrance for timeline items, creating a natural reading flow that draws
the eye through your career history.

---

## Quick Reference

| Concept                  | Key Point                                           |
|--------------------------|-----------------------------------------------------|
| Animation purpose        | Feedback, orientation, delight, continuity          |
| Cheap properties         | `transform`, `opacity` (GPU composited)             |
| Expensive properties     | `width`, `height`, `top`, `left` (trigger layout)   |
| Micro-interaction timing | 100-200ms                                           |
| Entrance timing          | 200-400ms                                           |
| Page transition timing   | 300-500ms                                           |
| Ease-out                 | Elements entering (decelerate in)                   |
| Ease-in                  | Elements leaving (accelerate out)                   |
| Spring                   | Natural, playful, overshoots then settles           |
| AnimatePresence          | Exit animations for unmounting components           |
| Layout animations        | Auto-animate position/size changes                  |
| Reduced motion           | Always check and respect `prefers-reduced-motion`   |
| Framer Motion variants   | Named states with staggerChildren orchestration     |

**The golden rule of UI animation:** If the user notices the animation itself rather
than the content it reveals, the animation is too much. Motion should be felt, not seen.
