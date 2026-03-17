# Common UI Patterns

## Overview

UI patterns are recurring solutions to common interface design problems. They matter because
users carry expectations from every app they have ever used. When you follow established
patterns, users feel at home immediately. When you deviate without good reason, you create
friction, confusion, and abandonment.

This guide covers the patterns you will encounter most often in frontend interviews and
real-world product work: cards, modals, toasts, empty states, loading states, navigation,
pagination, dropdowns, tooltips, and search. For each pattern, you will learn when to use
it, how to implement it well, and the common mistakes that trip people up.

---

## Core Concepts

### Card Patterns

Cards are self-contained units of content. They group related information behind a single
interactive surface.

**Content cards** present an item (article, product, post) with an image, title, excerpt,
and action. They work best in grids or lists where users browse many items.

**Profile cards** show a user's avatar, name, role, and key stats. They are common in
team pages, dashboards, and social apps.

**Pricing cards** compare plan tiers side by side. They rely on visual hierarchy to guide
users toward a recommended plan.

```
+---------------------------+
|        [  Image  ]        |   Content Card
|---------------------------|
|  Title                    |
|  Short description text   |
|  that spans two lines...  |
|                           |
|  [Tag]  [Tag]     [CTA]  |
+---------------------------+
```

**Design principles for cards:**

- Keep content scannable: title, supporting text, action
- One primary action per card; secondary actions go in overflow menus
- Maintain consistent card height in grids (use `min-h` or clamp content)
- Use subtle elevation (shadow) to separate cards from the background
- Make the entire card surface clickable when it links to a detail page

### Modal and Dialog Patterns

Modals interrupt the user's flow by overlaying content on top of the page. They demand
attention and block interaction with the page behind them.

**Confirmation dialogs** ask the user to confirm a destructive or irreversible action.
They should clearly state what will happen and provide a way to cancel.

```
+------------------------------------+
|  Delete project?                   |
|                                    |
|  This will permanently remove      |
|  "Portfolio v2" and all its data.  |
|  This action cannot be undone.     |
|                                    |
|         [Cancel]  [Delete]         |
+------------------------------------+
```

**Form modals** collect input without navigating away. Keep them short; if the form
exceeds five fields, consider a full page instead.

**Alert modals** communicate critical information that the user must acknowledge.

**Best practices:**

- Always provide a way to close (X button, Escape key, clicking backdrop)
- Trap focus inside the modal for keyboard users
- Return focus to the trigger element when the modal closes
- Prevent body scroll while modal is open
- Use `role="dialog"` and `aria-modal="true"`
- Avoid nested modals; they confuse everyone

### Toast and Notification Patterns

Toasts are lightweight, non-blocking messages that appear temporarily.

```
Page Content
                              +----------------------------+
                              |  ✓  Changes saved          |
                              |     successfully.    [X]   |
                              +----------------------------+
                                        ↑ bottom-right
```

**Position:** Bottom-right is the most common. Top-center works for important alerts.
Avoid bottom-left on desktop (too far from primary content areas).

**Auto-dismiss:** Success toasts should disappear after 3-5 seconds. Error toasts
should persist until the user dismisses them manually, because the user may need time
to read and act on the error.

**Stacking:** When multiple toasts appear, stack them vertically with the newest on top
or bottom (be consistent). Limit visible toasts to 3-5; queue the rest.

**Accessibility:** Use `role="status"` for informational toasts and `role="alert"` for
errors so screen readers announce them. Provide a dismiss button for keyboard users.

### Empty States

An empty state appears when there is no data to display. This is a critical design
moment because it is often the user's first impression of a feature.

```
+---------------------------------------------+
|                                              |
|            ┌─────────────┐                   |
|            │  Illustration│                   |
|            │   or Icon    │                   |
|            └─────────────┘                   |
|                                              |
|        No projects yet                       |
|                                              |
|   Create your first project to get           |
|   started with organizing your work.         |
|                                              |
|         [ + Create Project ]                 |
|                                              |
+---------------------------------------------+
```

**Effective empty states include:**

1. **Illustration or icon** - Makes the state feel intentional, not broken
2. **Clear message** - Explains why the area is empty
3. **Guidance** - Tells the user what to do next
4. **Call to action** - A button to create/add/import the first item

Avoid generic "No data" messages. Every empty state is a chance to onboard and
motivate the user.

### Loading States

Loading states communicate that the system is working. The right pattern depends
on how long the wait will be and what the user needs during that wait.

**Skeleton screens** replace content with gray placeholder shapes that mimic the
layout of the incoming data. They reduce perceived load time because users see
the structure immediately.

```
+---------------------------+
|  ████████████             |   Skeleton Card
|  ████████                 |
|---------------------------|
|  ████████████████████     |
|  █████████████            |
|  ████████████████         |
|                           |
|  ████      ████    ████   |
+---------------------------+
```

**Spinners** work for short waits (under 2 seconds) when there is no content
structure to preview. Avoid full-page spinners; prefer inline spinners near the
action that triggered the load.

**Shimmer effect** is an animated gradient sweep over skeleton shapes. It signals
that loading is in progress rather than stuck.

**Progressive loading** shows content as it becomes available rather than waiting
for everything. Images load with blur-up, lists render incrementally.

**Guidelines:**

| Wait Time    | Pattern                              |
|--------------|--------------------------------------|
| < 300ms      | No indicator (feels instant)         |
| 300ms - 2s   | Inline spinner or progress bar       |
| 2s - 10s     | Skeleton screen with shimmer         |
| > 10s        | Progress bar with percentage/status  |

### Navigation Patterns

**Top navigation** is the most common pattern for marketing sites and apps with
fewer than 7 primary destinations. It scales poorly on mobile.

```
+-------------------------------------------------------+
|  Logo    Home   About   Work   Blog   Contact   [🌙]  |
+-------------------------------------------------------+
```

**Side navigation** works well for dashboards and apps with many sections. It
provides room for nested navigation and stays visible during interaction.

```
+----------+----------------------------------+
| Logo     |                                  |
|----------|         Main Content             |
| Dashboard|                                  |
| Projects |                                  |
| > Active |                                  |
| > Archive|                                  |
| Settings |                                  |
| Help     |                                  |
+----------+----------------------------------+
```

**Tabs** switch between related views within the same context. Use them when the
views share a parent and the user might switch frequently.

**Breadcrumbs** show the user's location in a hierarchy. They are essential for
deep content structures like e-commerce categories.

```
Home > Products > Electronics > Headphones
```

**Hamburger menu** hides navigation behind a toggle icon. It saves space on mobile
but reduces discoverability. On desktop, prefer visible navigation when possible.

**Mobile navigation strategies:**

- Bottom tab bar (5 items max) for frequent destinations
- Hamburger menu for secondary or infrequent pages
- Full-screen overlay menu for content-heavy sites

### Pagination vs Infinite Scroll

**Pagination** breaks content into discrete pages with explicit navigation.

```
  [< Prev]  1  2  [3]  4  5  ...  20  [Next >]
```

Advantages: predictable position, shareable URLs, works with SEO, finite feeling.
Disadvantages: interrupts browsing flow, requires explicit action.

**Infinite scroll** loads more content as the user scrolls near the bottom.

Advantages: seamless browsing, great for social feeds.
Disadvantages: no sense of progress, hard to reach footer, accessibility challenges,
can hurt performance if not virtualized.

**When to choose which:**

| Use Case           | Recommendation    |
|--------------------|-------------------|
| Search results     | Pagination        |
| Social feed        | Infinite scroll   |
| Product catalog    | Pagination        |
| Image gallery      | Infinite scroll   |
| Data tables        | Pagination        |
| News feed          | Infinite scroll   |

Consider "Load more" buttons as a middle ground: explicit action without page changes.

### Dropdown and Select Patterns

**Native select** (`<select>`) is simple and accessible out of the box, but hard
to style. Use for straightforward lists with few options.

**Custom dropdown** gives full styling control but requires careful accessibility
work: keyboard navigation, screen reader labels, focus management.

**Key behaviors:**

- Open on click (not hover, which causes accidental triggers)
- Highlight options on hover and arrow keys
- Select on Enter or click
- Close on Escape, blur, or selection
- Support type-ahead search for long lists
- Position dynamically to stay within viewport

**Combobox (searchable select)** is essential when the list exceeds ~15 items.
Users can type to filter options.

### Tooltip and Popover Patterns

**Tooltips** provide brief explanatory text when the user hovers or focuses on an
element. They should contain only text, never interactive content.

```
         ┌──────────────────┐
         │ Copy to clipboard │
         └────────┬─────────┘
                  ▼
              [ 📋 ]
```

**Popovers** are richer overlays that can contain interactive content: links,
buttons, forms. They open on click and close on click-outside or Escape.

**Guidelines:**

- Tooltips: show on hover after 300-500ms delay, hide on mouse leave
- Tooltips should not duplicate visible text
- Use `aria-describedby` to associate tooltips with their triggers
- Popovers need focus trapping if they contain interactive elements
- Position intelligently to avoid clipping at viewport edges

### Search Patterns

**Anatomy of a search UI:**

```
+-----------------------------------------------+
|  🔍  Search articles...              [Ctrl+K] |
+-----------------------------------------------+
|  Recent searches                               |
|  • React performance                           |
|  • Tailwind grid                               |
|                                                |
|  Suggested                                     |
|  • Getting Started with Next.js                |
|  • Tailwind CSS Cheat Sheet                    |
+-----------------------------------------------+
```

**Key features:**

- Prominent search input with placeholder text
- Keyboard shortcut (Ctrl+K or /) for power users
- Debounced queries (300ms) to avoid excessive API calls
- Recent searches for returning users
- Autocomplete suggestions as the user types
- Highlighted matching text in results
- Clear button when input has content
- Empty state when no results found (with suggestions)
- Loading indicator during search

---

## Practical Examples

### Skeleton Screen Component

```tsx
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 p-4">
      <div className="mb-4 h-40 rounded-lg bg-gray-200" />
      <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
      <div className="mb-2 h-4 w-full rounded bg-gray-200" />
      <div className="h-4 w-1/2 rounded bg-gray-200" />
    </div>
  );
}
```

### Toast Container with Stacking

```tsx
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="rounded-lg bg-white px-4 py-3 shadow-lg"
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.message}
        </motion.div>
      ))}
    </div>
  );
}
```

### Empty State Component

```tsx
function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-6xl text-gray-300">{icon}</div>
      <h3 className="mb-2 text-xl font-semibold text-gray-900">{title}</h3>
      <p className="mb-6 max-w-sm text-gray-500">{description}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

### Modal with Focus Trap

```tsx
function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="modal-title" className="mb-4 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
```

---

## Common Interview Questions

### 1. When would you use a modal versus navigating to a new page?

Use a modal when the task is short (under 5 fields), directly related to the current
context, and the user needs to return to the same spot afterward. Use a new page when
the task is complex, requires significant input, or benefits from a dedicated URL.
Modals work well for confirmations, quick edits, and previews. Full pages work better
for multi-step forms, detailed creation flows, and content that users might bookmark.

### 2. How do you handle loading states for different wait times?

Under 300ms, show nothing (the delay is imperceptible). Between 300ms and 2 seconds,
show an inline spinner near the trigger. Between 2 and 10 seconds, use skeleton screens
to give the user a preview of the content layout. Over 10 seconds, show a progress bar
with percentage or status messages. The key insight is that perceived performance matters
more than actual performance. Skeleton screens make 2-second loads feel shorter than a
spinner would.

### 3. Why are empty states important and what makes a good one?

Empty states are often a user's first encounter with a feature. A blank screen with
"No data" communicates that the product is unfinished or broken. A well-designed empty
state includes an illustration or icon, a clear explanation of what belongs here, guidance
on what to do next, and a prominent call to action. Good empty states reduce support
tickets and increase feature adoption.

### 4. What are the trade-offs between pagination and infinite scroll?

Pagination gives users a sense of position and progress, works well with SEO, enables
direct URL linking to specific pages, and makes it easy to reach the footer. Infinite
scroll provides a seamless browsing experience, reduces interaction cost, and works
well for content feeds. However, infinite scroll makes it hard to find previously seen
items, can cause performance issues without virtualization, and hides the footer. The
choice depends on whether users are searching (pagination) or browsing (infinite scroll).

### 5. How do you make tooltips accessible?

Associate the tooltip with its trigger using `aria-describedby`. Ensure the tooltip
appears on both hover and keyboard focus. Add a slight delay (300-500ms) before showing
to prevent accidental triggers. Make sure the tooltip text does not duplicate the
visible label. For touch devices, consider an alternative like inline help text, since
hover is not available. Never put essential information only in a tooltip.

### 6. What is the difference between a toast and a notification?

Toasts are transient, in-app messages that appear briefly and disappear automatically.
They communicate the result of an action the user just took (save success, copy
confirmation, error alert). Notifications are persistent messages that may arrive
asynchronously (new message, system update, reminder). Notifications typically live in
a notification center or inbox, while toasts overlay the current page temporarily.

### 7. How do you decide between a dropdown select and radio buttons?

Use radio buttons when there are 2-5 options that the user should see at a glance.
Radio buttons make comparison easy and reduce interaction cost. Use a dropdown select
when there are more than 5 options or screen space is limited. Dropdowns hide options
behind a click, which increases cognitive load but saves space. For very long lists
(15+ items), use a searchable combobox.

### 8. Describe the card pattern and when it might not be appropriate.

Cards group related content into a scannable, contained unit. They work well for grids
of similar items (products, articles, team members). Cards are less appropriate when
content varies significantly in length (causes jagged grids), when items are better
compared in a table format (features, pricing details), or when the density of items
is so high that card chrome (borders, shadows, padding) wastes too much space. Lists
or tables may be better alternatives in those cases.

---

## Applying to Your Portfolio

### Card Pattern for Projects

Use the card pattern for project showcases: thumbnail at top, title and one-line
description, technology tags via `SkillTag`, and a Framer Motion hover lift effect
(`whileHover={{ y: -4 }}`). Make the entire card clickable.

### Loading and Empty States

If you add dynamic features (CMS blog, GitHub activity), implement skeleton screens
matching your card layout with Tailwind's `animate-pulse`. For sections that might be
empty during development, design intentional empty states with CTAs.

### Navigation Enhancement

Add an active state indicator for the current section, smooth scroll for single-page
navigation, and a mobile hamburger menu with Framer Motion transitions.

### Toast for Contact Form

Implement toast notifications for contact form success/failure rather than redirects.

---

## Quick Reference

| Pattern          | When to Use                        | Key Consideration                |
|------------------|------------------------------------|----------------------------------|
| Content Card     | Browsable collections              | Consistent height in grids       |
| Modal            | Short, focused tasks               | Trap focus, allow Escape         |
| Toast            | Action feedback                    | Auto-dismiss success, persist errors |
| Empty State      | No data available                  | Always include a CTA             |
| Skeleton Screen  | Content loading (2-10s)            | Match the layout of real content |
| Spinner          | Short wait (< 2s)                  | Inline, not full-page            |
| Top Nav          | < 7 primary destinations           | Collapses on mobile              |
| Side Nav         | Dashboards, many sections          | Collapsible for more space       |
| Tabs             | Related views, same context        | Max 5-7 tabs                     |
| Breadcrumbs      | Deep hierarchies                   | Not for flat site structures     |
| Pagination       | Search results, data tables        | Shareable URLs per page          |
| Infinite Scroll  | Feeds, galleries                   | Virtualize for performance       |
| Dropdown         | > 5 options, limited space         | Keyboard nav required            |
| Combobox         | > 15 options                       | Type-ahead search                |
| Tooltip          | Brief supplementary info           | Never for essential info         |
| Popover          | Rich interactive overlay           | Close on outside click           |
| Search           | Content-heavy apps                 | Debounce, recent searches        |

**The golden rule of UI patterns:** Use established patterns unless you have a
specific, user-validated reason to deviate. Novelty in UI is a cost, not a feature.
