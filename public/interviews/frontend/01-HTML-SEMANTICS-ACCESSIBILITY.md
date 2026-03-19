# HTML Semantics & Accessibility

## Overview

HTML semantics and accessibility (a11y) are foundational topics that separate junior developers from experienced ones in interviews. Semantic HTML means using the right elements for the right purpose -- a `<nav>` for navigation, a `<button>` for actions, a `<table>` for tabular data. Accessibility means ensuring that everyone, including people using screen readers, keyboard-only navigation, or other assistive technologies, can use your application.

Interviewers test this because:

- It reveals whether you understand the web platform, not just your framework
- It shows empathy for users and awareness of legal requirements (WCAG, ADA)
- Semantic HTML directly impacts SEO, performance, and maintainability
- Many candidates skip accessibility entirely, so demonstrating competence here is a strong signal

---

## Core Concepts

### Semantic HTML Elements

Semantic elements communicate meaning to both the browser and assistive technologies. They replace generic `<div>` and `<span>` elements with purpose-built tags.

#### Document Structure Elements

```html
<header>
  <!-- Introductory content, navigation aids -->
  <nav>
    <!-- Navigation links -->
    <main>
      <!-- Dominant content of the document (only one per page) -->
      <article>
        <!-- Self-contained composition (blog post, comment, widget) -->
        <section>
          <!-- Thematic grouping of content -->
          <aside>
            <!-- Tangentially related content (sidebar, pull quote) -->
            <footer><!-- Footer for its nearest sectioning content --></footer>
          </aside>
        </section>
      </article>
    </main>
  </nav>
</header>
```

#### Text-Level Semantics

```html
<strong>
  <!-- Strong importance (not just bold) -->
  <em>
    <!-- Stress emphasis (not just italic) -->
    <mark>
      <!-- Highlighted/relevant text -->
      <time>
        <!-- Machine-readable date/time -->
        <abbr>
          <!-- Abbreviation with expansion -->
          <cite>
            <!-- Title of a creative work -->
            <code>
              <!-- Inline code -->
              <kbd>
                <!-- Keyboard input -->
                <samp> <!-- Sample output --></samp></kbd
              ></code
            ></cite
          ></abbr
        ></time
      ></mark
    ></em
  ></strong
>
```

#### Interactive Elements

```html
<details>
  <!-- Disclosure widget (expandable) -->
  <summary>
    <!-- Caption for <details> -->
    <dialog>
      <!-- Dialog box or modal -->
      <menu><!-- Toolbar or context menu --></menu>
    </dialog>
  </summary>
</details>
```

### The Heading Hierarchy

Headings (`<h1>` through `<h6>`) create an outline of the document. Screen readers use this outline for navigation.

```html
<!-- CORRECT: Logical hierarchy -->
<h1>Company Name</h1>
<h2>Products</h2>
<h3>Software</h3>
<h3>Hardware</h3>
<h2>About Us</h2>
<h3>Team</h3>
<h3>History</h3>

<!-- WRONG: Skipping levels -->
<h1>Company Name</h1>
<h4>Products</h4>
<!-- Skipped h2 and h3 -->
<h2>About Us</h2>
```

**Rule**: Never skip heading levels. Each page should have exactly one `<h1>`. Headings should nest logically, not be chosen for visual size (use CSS for that).

### Landmark Regions

Landmark regions allow screen reader users to jump directly to sections of a page. HTML5 semantic elements automatically create landmarks:

| HTML Element             | Implicit ARIA Role | Purpose          |
| ------------------------ | ------------------ | ---------------- |
| `<header>` (top-level)   | `banner`           | Site-wide header |
| `<nav>`                  | `navigation`       | Navigation links |
| `<main>`                 | `main`             | Primary content  |
| `<aside>`                | `complementary`    | Related content  |
| `<footer>` (top-level)   | `contentinfo`      | Site-wide footer |
| `<form>` (with name)     | `form`             | Form region      |
| `<section>` (with label) | `region`           | Generic landmark |

### ARIA (Accessible Rich Internet Applications)

ARIA provides attributes that supplement HTML semantics, especially for custom interactive widgets. The first rule of ARIA is: **do not use ARIA if a native HTML element can do the job**.

#### ARIA Roles

Roles define what an element _is_:

```html
<!-- Custom tab interface -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">Tab 1</button>
  <button role="tab" aria-selected="false" aria-controls="panel-2">
    Tab 2
  </button>
</div>
<div role="tabpanel" id="panel-1">Content 1</div>
<div role="tabpanel" id="panel-2" hidden>Content 2</div>
```

#### ARIA States and Properties

```html
<!-- States (change dynamically) -->
aria-expanded="true|false"
<!-- Expandable sections -->
aria-selected="true|false"
<!-- Selected item in a list -->
aria-checked="true|false"
<!-- Checkbox state -->
aria-disabled="true|false"
<!-- Disabled state -->
aria-hidden="true|false"
<!-- Hidden from assistive tech -->
aria-pressed="true|false"
<!-- Toggle button state -->
aria-invalid="true|false"
<!-- Form validation state -->

<!-- Properties (generally static) -->
aria-label="Close dialog"
<!-- Accessible name -->
aria-labelledby="heading-id"
<!-- References labeling element -->
aria-describedby="desc-id"
<!-- References describing element -->
aria-controls="panel-id"
<!-- References controlled element -->
aria-live="polite|assertive"
<!-- Live region announcements -->
aria-required="true"
<!-- Required form field -->
aria-haspopup="true"
<!-- Has popup menu -->
```

#### aria-live Regions

Live regions announce dynamic content changes to screen readers:

```html
<!-- Polite: waits until user is idle -->
<div aria-live="polite" aria-atomic="true">
  <!-- Content updates here are announced -->
  <p>3 items in your cart</p>
</div>

<!-- Assertive: interrupts immediately -->
<div role="alert">
  <!-- role="alert" implies aria-live="assertive" -->
  <p>Error: Payment failed. Please try again.</p>
</div>

<!-- Status: polite announcement for status updates -->
<div role="status">
  <p>Loading complete. 42 results found.</p>
</div>
```

### Keyboard Navigation

All interactive elements must be operable with a keyboard alone. The key interactions are:

| Key          | Expected Behavior                                   |
| ------------ | --------------------------------------------------- |
| `Tab`        | Move focus to next focusable element                |
| `Shift+Tab`  | Move focus to previous focusable element            |
| `Enter`      | Activate buttons, links, submit forms               |
| `Space`      | Activate buttons, toggle checkboxes                 |
| `Escape`     | Close modals, dismiss popups                        |
| `Arrow keys` | Navigate within widgets (tabs, menus, radio groups) |
| `Home/End`   | Jump to first/last item in a list                   |

#### Focus Management

```html
<!-- tabindex values -->
tabindex="0"
<!-- Element is focusable in natural tab order -->
tabindex="-1"
<!-- Focusable via JavaScript, but NOT in tab order -->
tabindex="1+"
<!-- AVOID: overrides natural order, creates confusion -->
```

```javascript
// Moving focus programmatically (e.g., after opening a modal)
const modal = document.getElementById('modal');
modal.focus();

// Trapping focus inside a modal
function trapFocus(element) {
  const focusableSelectors =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
  const focusableElements = element.querySelectorAll(focusableSelectors);
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });
}
```

### Form Accessibility

Forms are one of the most important areas for accessibility. Every input needs a label, errors must be announced, and the form must be navigable by keyboard.

```html
<!-- CORRECT: Explicit label association -->
<label for="email">Email Address</label>
<input
  type="email"
  id="email"
  name="email"
  aria-required="true"
  aria-describedby="email-hint email-error"
  aria-invalid="false"
/>
<p id="email-hint" class="hint">We will never share your email.</p>
<p id="email-error" class="error" role="alert" hidden>
  Please enter a valid email address.
</p>

<!-- CORRECT: Implicit label (wrapping) -->
<label>
  Email Address
  <input type="email" name="email" />
</label>

<!-- WRONG: No label association -->
<p>Email Address</p>
<input type="email" name="email" />

<!-- WRONG: Placeholder as only label -->
<input type="email" placeholder="Email Address" />
```

#### Fieldsets and Legends

Group related fields using `<fieldset>` and `<legend>`:

```html
<fieldset>
  <legend>Shipping Address</legend>
  <label for="street">Street</label>
  <input type="text" id="street" name="street" />
  <label for="city">City</label>
  <input type="text" id="city" name="city" />
</fieldset>

<!-- Especially important for radio buttons and checkboxes -->
<fieldset>
  <legend>Preferred Contact Method</legend>
  <label><input type="radio" name="contact" value="email" /> Email</label>
  <label><input type="radio" name="contact" value="phone" /> Phone</label>
  <label><input type="radio" name="contact" value="mail" /> Mail</label>
</fieldset>
```

### Image Accessibility

```html
<!-- Informative image: describe the content -->
<img src="chart.png" alt="Bar chart showing sales increased 40% in Q4 2024" />

<!-- Decorative image: empty alt (NOT missing alt) -->
<img src="decorative-border.png" alt="" />

<!-- Complex image: use longer description -->
<figure>
  <img
    src="architecture.png"
    alt="System architecture diagram"
    aria-describedby="arch-desc"
  />
  <figcaption id="arch-desc">
    The system consists of three layers: a React frontend communicating with a
    Node.js API server, which connects to a PostgreSQL database. A Redis cache
    sits between the API and database layers.
  </figcaption>
</figure>

<!-- SVG accessibility -->
<svg role="img" aria-labelledby="svg-title svg-desc">
  <title id="svg-title">Monthly Revenue</title>
  <desc id="svg-desc">
    Line chart showing revenue growth from January to December
  </desc>
  <!-- SVG content -->
</svg>

<!-- Icon buttons: need accessible name -->
<button aria-label="Close dialog">
  <svg aria-hidden="true"><!-- X icon --></svg>
</button>
```

---

## Common Interview Questions

### 1. "What is the difference between `<div>` and `<section>`?"

**Answer**: A `<div>` is a generic container with no semantic meaning. A `<section>` represents a thematic grouping of content and typically has a heading. Screen readers announce `<section>` elements as regions (when labeled), allowing users to navigate by section. Use `<section>` when the content has a clear theme or purpose; use `<div>` for purely structural/styling purposes.

```html
<!-- Use <section> for thematic content -->
<section aria-labelledby="features-heading">
  <h2 id="features-heading">Features</h2>
  <p>Our product offers...</p>
</section>

<!-- Use <div> for styling wrappers -->
<div class="card-grid">
  <div class="card">...</div>
  <div class="card">...</div>
</div>
```

### 2. "What is the difference between `aria-label`, `aria-labelledby`, and `aria-describedby`?"

**Answer**:

- **`aria-label`**: Provides a string directly as the accessible name. Used when there is no visible text label.
- **`aria-labelledby`**: Points to the `id` of another element whose text content becomes the accessible name. Takes precedence over `aria-label` and native labels.
- **`aria-describedby`**: Points to the `id` of an element that provides a supplementary description. This is announced _after_ the name, giving additional context.

```html
<button aria-label="Close">X</button>

<h2 id="dialog-title">Confirm Deletion</h2>
<div
  role="dialog"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-desc"
>
  <p id="dialog-desc">This action cannot be undone. Are you sure?</p>
</div>
```

### 3. "How do you make a custom dropdown accessible?"

**Answer**: A custom dropdown needs to replicate the behavior of a native `<select>` for assistive technologies:

```html
<div class="custom-select">
  <button
    role="combobox"
    aria-expanded="false"
    aria-haspopup="listbox"
    aria-controls="options-list"
    aria-activedescendant=""
    id="select-button"
  >
    Select a fruit
  </button>
  <ul role="listbox" id="options-list" hidden>
    <li role="option" id="opt-apple" aria-selected="false">Apple</li>
    <li role="option" id="opt-banana" aria-selected="false">Banana</li>
    <li role="option" id="opt-cherry" aria-selected="false">Cherry</li>
  </ul>
</div>
```

Key requirements:

- `role="combobox"` on the trigger, `role="listbox"` on the list, `role="option"` on items
- `aria-expanded` toggles with open/close state
- `aria-activedescendant` tracks the currently highlighted option
- Arrow keys navigate options, Enter selects, Escape closes
- Focus stays on the button; visual highlight moves with `aria-activedescendant`

### 4. "Why should you not use `tabindex` values greater than 0?"

**Answer**: Positive `tabindex` values override the natural DOM order, creating an unpredictable tab sequence. This is confusing for both screen reader users and sighted keyboard users. If focus order needs to change, restructure the DOM instead. The only values you should use are `tabindex="0"` (add to tab order) and `tabindex="-1"` (programmatically focusable but not in tab order).

### 5. "What is the purpose of `role="presentation"` and `aria-hidden="true"`?"

**Answer**:

- **`role="presentation"`** (or `role="none"`): Removes the semantic meaning of an element, but its content and children remain visible and accessible. Used when an element is used purely for layout.
- **`aria-hidden="true"`**: Completely hides the element and all its children from assistive technologies. The element remains visually visible. Used for decorative content.

**Critical warning**: Never use `aria-hidden="true"` on focusable elements. If a screen reader user tabs to a hidden element, it creates a confusing experience.

```html
<!-- Table used for layout (not data) -->
<table role="presentation">
  <tr>
    <td>Column 1</td>
    <td>Column 2</td>
  </tr>
</table>

<!-- Decorative icon next to text -->
<button>
  <svg aria-hidden="true"><!-- icon --></svg>
  Save Document
</button>
```

### 6. "How do you test for accessibility?"

**Answer**: A comprehensive a11y testing strategy includes multiple layers:

1. **Automated tools**: axe-core, Lighthouse, WAVE, eslint-plugin-jsx-a11y. These catch ~30-40% of issues.
2. **Manual keyboard testing**: Tab through the entire page. Can you reach and operate every interactive element?
3. **Screen reader testing**: Test with VoiceOver (macOS), NVDA (Windows), or JAWS. Listen to how content is announced.
4. **Color contrast checking**: Use browser DevTools or tools like Colour Contrast Analyser. WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
5. **Zoom testing**: Content should be usable at 200% zoom without horizontal scrolling.
6. **Reduced motion**: Test with `prefers-reduced-motion` enabled.

### 7. "What are the WCAG conformance levels?"

**Answer**:

- **Level A**: Minimum accessibility. Basic requirements that must be met.
- **Level AA**: The standard most organizations target. Addresses the most common barriers. Required by many laws (ADA, Section 508, EAA).
- **Level AAA**: Highest level. Not required as a general policy because it is not possible to satisfy all AAA criteria for some content.

Key WCAG principles (POUR):

- **Perceivable**: Content must be presentable in ways users can perceive (alt text, captions, contrast)
- **Operable**: UI must be operable (keyboard access, enough time, no seizure triggers)
- **Understandable**: Content must be understandable (readable, predictable, input assistance)
- **Robust**: Content must be robust enough for diverse user agents (valid HTML, ARIA)

### 8. "What is a skip navigation link and why is it important?"

**Answer**: A skip navigation link is a hidden link at the very top of the page that becomes visible on focus, allowing keyboard users to skip past repetitive navigation and jump directly to the main content.

```html
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <nav><!-- 20+ navigation links --></nav>
  <main id="main-content" tabindex="-1">
    <!-- Page content -->
  </main>
</body>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 0.5rem 1rem;
  background: #000;
  color: #fff;
  z-index: 9999;
}

.skip-link:focus {
  top: 0;
}
```

Without this, a keyboard user must press Tab through every navigation link on every page load before reaching the content.

---

## Code Examples

### Accessible Modal Dialog

```html
<button id="open-modal" aria-haspopup="dialog">Delete Account</button>

<div id="modal-overlay" class="modal-overlay" hidden>
  <div
    id="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    aria-describedby="modal-description"
  >
    <h2 id="modal-title">Confirm Account Deletion</h2>
    <p id="modal-description">
      This will permanently delete your account and all associated data. This
      action cannot be undone.
    </p>
    <div class="modal-actions">
      <button id="confirm-delete" class="btn-danger">Delete My Account</button>
      <button id="cancel-delete" class="btn-secondary">Cancel</button>
    </div>
  </div>
</div>
```

```javascript
const openButton = document.getElementById('open-modal');
const overlay = document.getElementById('modal-overlay');
const modal = document.getElementById('modal');
const cancelButton = document.getElementById('cancel-delete');
let previouslyFocused = null;

function openModal() {
  previouslyFocused = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  // Focus the first focusable element inside the modal
  const firstFocusable = modal.querySelector(
    'button, [href], input, select, textarea'
  );
  if (firstFocusable) {
    firstFocusable.focus();
  }
  trapFocus(modal);
}

function closeModal() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  // Return focus to the element that opened the modal
  if (previouslyFocused) {
    previouslyFocused.focus();
  }
}

openButton.addEventListener('click', openModal);
cancelButton.addEventListener('click', closeModal);

// Close on Escape
overlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

// Close on overlay click (but not modal click)
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    closeModal();
  }
});
```

### Accessible Data Table

```html
<table>
  <caption>
    Quarterly Revenue by Region (in millions USD)
    <span class="sr-only">
      Table has 4 columns: Region, Q1, Q2, Q3, and Q4. Data is sorted by Q4
      revenue descending.
    </span>
  </caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col" aria-sort="none">Q1</th>
      <th scope="col" aria-sort="none">Q2</th>
      <th scope="col" aria-sort="none">Q3</th>
      <th scope="col" aria-sort="descending">
        Q4
        <span aria-hidden="true"> &#9660;</span>
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">North America</th>
      <td>$12.4</td>
      <td>$13.1</td>
      <td>$14.7</td>
      <td>$18.2</td>
    </tr>
    <tr>
      <th scope="row">Europe</th>
      <td>$8.9</td>
      <td>$9.4</td>
      <td>$10.2</td>
      <td>$12.8</td>
    </tr>
  </tbody>
</table>
```

Key points:

- `<caption>` provides the table's accessible name
- `scope="col"` and `scope="row"` connect headers to data cells
- `aria-sort` indicates sorting state for sortable columns
- Screen-reader-only text (`.sr-only`) provides additional context

### Screen-Reader-Only CSS Class

```css
/* Visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Allow element to become visible on focus (for skip links) */
.sr-only-focusable:focus,
.sr-only-focusable:active {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

**Important**: Do not use `display: none` or `visibility: hidden` to hide text for screen readers. Those properties hide content from everyone, including assistive technologies.

### Accessible Notification System

```javascript
// Create a live region for dynamic announcements
function createAnnouncer() {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.classList.add('sr-only');
  document.body.appendChild(announcer);
  return announcer;
}

const announcer = createAnnouncer();

function announce(message, priority = 'polite') {
  announcer.setAttribute('aria-live', priority);
  // Clear and re-set to trigger announcement
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

// Usage
announce('Item added to cart. Cart total: 3 items.');
announce('Error: Invalid credit card number.', 'assertive');
```

---

## Gotchas & Edge Cases

### 1. Implicit vs. Explicit Roles

Some semantic elements have implicit roles that are conditional:

- `<header>` is `banner` only when it is a direct child of `<body>`. Nested in `<article>`, it has no implicit role.
- `<footer>` is `contentinfo` only at the top level.
- `<section>` is `region` only when it has an accessible name (via `aria-label` or `aria-labelledby`).

### 2. The `<a>` vs. `<button>` Distinction

- **`<a>`**: Navigation to a URL (same page or different page). Screen readers announce it as "link."
- **`<button>`**: Triggers an action (submit form, toggle, open modal). Screen readers announce it as "button."

Using the wrong element confuses assistive technology users, even if it "looks right" visually.

```html
<!-- WRONG: Using a link as a button -->
<a href="#" onclick="deleteItem()">Delete</a>

<!-- CORRECT: Using a button for actions -->
<button type="button" onclick="deleteItem()">Delete</button>

<!-- WRONG: Using a div as a button -->
<div class="btn" onclick="save()">Save</div>

<!-- CORRECT: If you must use a div (avoid this) -->
<div
  class="btn"
  role="button"
  tabindex="0"
  onclick="save()"
  onkeydown="if(event.key==='Enter')save()"
>
  Save
</div>
```

### 3. Color Is Not Enough

Never convey information through color alone. Users with color vision deficiencies cannot distinguish colors reliably.

```html
<!-- WRONG: Only color indicates error -->
<input type="text" style="border-color: red;" />

<!-- CORRECT: Color + icon + text -->
<input type="text" aria-invalid="true" aria-describedby="name-error" />
<p id="name-error" role="alert">
  <svg aria-hidden="true"><!-- error icon --></svg>
  Name is required.
</p>
```

### 4. Focus Visibility

Never remove the focus outline without providing an alternative:

```css
/* WRONG: removes all focus indication */
*:focus {
  outline: none;
}

/* CORRECT: custom focus styles */
*:focus-visible {
  outline: 2px solid #4a90d9;
  outline-offset: 2px;
}

/* Note: :focus-visible only shows for keyboard navigation,
   not mouse clicks, giving you the best of both worlds */
```

### 5. Dynamic Content and Screen Readers

When content changes dynamically (AJAX loading, SPA navigation), screen readers do not automatically announce the change. You must:

- Use `aria-live` regions for content updates
- Manage focus when navigating between "pages" in an SPA
- Announce loading states and completion

### 6. Touch Target Size

WCAG 2.2 requires touch targets to be at least 24x24 CSS pixels (Level AA) with sufficient spacing. Apple recommends 44x44 points. Small click targets are a common accessibility failure.

---

## Quick Reference

### Semantic Element Cheat Sheet

| Element     | Use For               | Instead Of                    |
| ----------- | --------------------- | ----------------------------- |
| `<nav>`     | Navigation links      | `<div class="nav">`           |
| `<main>`    | Primary content       | `<div id="main">`             |
| `<article>` | Independent content   | `<div class="post">`          |
| `<section>` | Thematic grouping     | `<div class="section">`       |
| `<aside>`   | Sidebar/supplementary | `<div class="sidebar">`       |
| `<header>`  | Introductory content  | `<div class="header">`        |
| `<footer>`  | Footer content        | `<div class="footer">`        |
| `<figure>`  | Image with caption    | `<div class="image-wrapper">` |
| `<time>`    | Dates/times           | `<span class="date">`         |
| `<address>` | Contact information   | `<div class="contact">`       |
| `<button>`  | Interactive actions   | `<div onclick="...">`         |
| `<details>` | Expandable content    | Custom accordion div          |

### ARIA Quick Reference

| Attribute          | Purpose                     | Example                      |
| ------------------ | --------------------------- | ---------------------------- |
| `role`             | Define element type         | `role="dialog"`              |
| `aria-label`       | Accessible name (string)    | `aria-label="Close"`         |
| `aria-labelledby`  | Accessible name (reference) | `aria-labelledby="title-id"` |
| `aria-describedby` | Additional description      | `aria-describedby="hint-id"` |
| `aria-expanded`    | Expandable state            | `aria-expanded="true"`       |
| `aria-hidden`      | Hide from AT                | `aria-hidden="true"`         |
| `aria-live`        | Announce changes            | `aria-live="polite"`         |
| `aria-required`    | Required field              | `aria-required="true"`       |
| `aria-invalid`     | Validation state            | `aria-invalid="true"`        |
| `aria-current`     | Current item                | `aria-current="page"`        |
| `aria-controls`    | Controlled element          | `aria-controls="panel-1"`    |
| `aria-modal`       | Modal dialog                | `aria-modal="true"`          |

### Keyboard Testing Checklist

- [ ] All interactive elements are reachable via Tab
- [ ] Tab order follows visual/logical order
- [ ] Focus indicator is clearly visible
- [ ] Modals trap focus and return it on close
- [ ] Escape closes modals, popups, and dropdowns
- [ ] Enter and Space activate buttons
- [ ] Arrow keys navigate within composite widgets
- [ ] No keyboard traps (can always Tab away from an element)
- [ ] Skip navigation link is present and functional

### Common WCAG 2.2 Success Criteria

| Criterion                    | Level | Requirement                                |
| ---------------------------- | ----- | ------------------------------------------ |
| 1.1.1 Non-text Content       | A     | All images have text alternatives          |
| 1.3.1 Info and Relationships | A     | Structure conveyed through markup          |
| 1.4.3 Contrast (Minimum)     | AA    | 4.5:1 for text, 3:1 for large text         |
| 1.4.11 Non-text Contrast     | AA    | 3:1 for UI components and graphics         |
| 2.1.1 Keyboard               | A     | All functionality via keyboard             |
| 2.1.2 No Keyboard Trap       | A     | Focus can always be moved away             |
| 2.4.1 Bypass Blocks          | A     | Skip navigation mechanism                  |
| 2.4.3 Focus Order            | A     | Logical and meaningful                     |
| 2.4.7 Focus Visible          | AA    | Focus indicator is visible                 |
| 2.5.8 Target Size            | AA    | Minimum 24x24 CSS pixels                   |
| 3.3.1 Error Identification   | A     | Errors described in text                   |
| 3.3.2 Labels or Instructions | A     | Labels for user input                      |
| 4.1.2 Name, Role, Value      | A     | Custom widgets have accessible names/roles |
