# DOM & Browser APIs

## Overview

The Document Object Model (DOM) and Browser APIs form the foundation of frontend development. Every framework -- React, Vue, Angular -- ultimately manipulates the DOM. In interviews, demonstrating deep understanding of these primitives signals that you can debug complex issues, optimize performance, and work effectively beyond the abstractions of any particular framework.

This guide covers DOM traversal and manipulation, event handling patterns, modern observer APIs, client-side storage, background processing with workers, animation APIs, and the Clipboard API.

---

## Core Concepts

### The DOM Tree

The browser parses HTML into a tree of nodes. Each node is an object with properties, methods, and event handlers.

```
document
  └── html
       ├── head
       │    ├── title
       │    └── meta
       └── body
            ├── div#app
            │    ├── h1
            │    └── p
            └── script
```

**Node types:**

| Type             | nodeType | Example                             |
| ---------------- | -------- | ----------------------------------- |
| Element          | 1        | `<div>`, `<p>`                      |
| Text             | 3        | Text inside elements                |
| Comment          | 8        | `<!-- comment -->`                  |
| Document         | 9        | `document`                          |
| DocumentFragment | 11       | `document.createDocumentFragment()` |

### Selecting Elements

```javascript
// By ID -- returns single element or null
const el = document.getElementById('app');

// CSS selector -- returns first match or null
const el = document.querySelector('.card:first-child');

// CSS selector -- returns static NodeList of all matches
const cards = document.querySelectorAll('.card');

// Live HTMLCollection -- updates automatically when DOM changes
const divs = document.getElementsByTagName('div');

// querySelector on a subtree
const container = document.getElementById('list');
const items = container.querySelectorAll('li');
```

**Key distinction:** `querySelectorAll` returns a **static** `NodeList`. `getElementsByTagName` and `getElementsByClassName` return **live** `HTMLCollection` objects that reflect DOM changes in real time.

### Creating and Modifying Elements

```javascript
// Create elements
const div = document.createElement('div');
div.className = 'card';
div.textContent = 'Hello';
div.setAttribute('data-id', '42');

// Append to DOM
document.body.appendChild(div);

// Insert before a reference node
const ref = document.getElementById('reference');
ref.parentNode.insertBefore(div, ref);

// Modern insertion methods
ref.before(div); // Insert before ref
ref.after(div); // Insert after ref
ref.prepend(div); // Insert as first child of ref
ref.append(div); // Insert as last child of ref
ref.replaceWith(div); // Replace ref with div

// Remove element
div.remove();

// Clone
const clone = div.cloneNode(true); // true = deep clone
```

### DocumentFragment for Batch Insertion

```javascript
const fragment = document.createDocumentFragment();

for (let i = 0; i < 1000; i++) {
  const li = document.createElement('li');
  li.textContent = `Item ${i}`;
  fragment.appendChild(li);
}

// Single reflow -- much faster than 1000 individual appends
document.getElementById('list').appendChild(fragment);
```

### Event Bubbling and Capturing

Events propagate through three phases:

1. **Capturing phase** -- Event travels from `window` down to the target
2. **Target phase** -- Event reaches the target element
3. **Bubbling phase** -- Event bubbles back up to `window`

```javascript
// Bubbling (default)
element.addEventListener('click', handler);

// Capturing
element.addEventListener('click', handler, true);
// or
element.addEventListener('click', handler, { capture: true });

// Stop propagation
function handler(e) {
  e.stopPropagation(); // Stops further propagation
  e.stopImmediatePropagation(); // Also stops other handlers on same element
}

// Prevent default browser behavior
function handler(e) {
  e.preventDefault();
}
```

### Event Delegation

Instead of attaching listeners to many child elements, attach one listener to a parent:

```javascript
// BAD: One listener per button
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('click', handleClick);
});

// GOOD: One listener on the parent
document.getElementById('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === 'save') save();
  if (action === 'delete') remove();
});
```

**Benefits:**

- Fewer event listeners (better memory usage)
- Dynamically added elements are automatically handled
- Simpler cleanup

### MutationObserver

Watches for changes to the DOM tree:

```javascript
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      console.log(
        'Children changed:',
        mutation.addedNodes,
        mutation.removedNodes
      );
    }
    if (mutation.type === 'attributes') {
      console.log('Attribute changed:', mutation.attributeName);
    }
  }
});

observer.observe(document.getElementById('app'), {
  childList: true, // Watch for added/removed children
  attributes: true, // Watch for attribute changes
  subtree: true, // Watch entire subtree
  characterData: true, // Watch text content changes
});

// Stop observing
observer.disconnect();
```

### IntersectionObserver

Detects when an element enters or leaves the viewport (or a parent container):

```javascript
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Lazy load image
        const img = entry.target;
        img.src = img.dataset.src;
        observer.unobserve(img); // Stop watching after load
      }
    });
  },
  {
    root: null, // null = viewport
    rootMargin: '50px', // Trigger 50px before element enters
    threshold: 0.1, // 10% of element must be visible
  }
);

document.querySelectorAll('.lazy-img').forEach((img) => {
  observer.observe(img);
});
```

**Use cases:** Lazy loading images, infinite scroll, analytics (tracking element visibility), animation triggers.

### ResizeObserver

Watches for element size changes:

```javascript
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    console.log(`Element resized: ${width}x${height}`);

    if (width < 600) {
      entry.target.classList.add('compact');
    } else {
      entry.target.classList.remove('compact');
    }
  }
});

observer.observe(document.getElementById('sidebar'));
```

**Use cases:** Responsive components (independent of viewport), chart resizing, dynamic layouts.

### Client-Side Storage

```javascript
// localStorage -- persists across sessions, ~5-10MB
localStorage.setItem('theme', 'dark');
const theme = localStorage.getItem('theme');
localStorage.removeItem('theme');
localStorage.clear();

// sessionStorage -- cleared when tab closes, ~5-10MB
sessionStorage.setItem('scrollPos', '250');

// Both are synchronous and store strings only
localStorage.setItem('user', JSON.stringify({ name: 'Alice' }));
const user = JSON.parse(localStorage.getItem('user'));
```

**IndexedDB** -- asynchronous, supports large structured data, transactions:

```javascript
const request = indexedDB.open('myDB', 1);

request.onupgradeneeded = (event) => {
  const db = event.target.result;
  const store = db.createObjectStore('users', { keyPath: 'id' });
  store.createIndex('email', 'email', { unique: true });
};

request.onsuccess = (event) => {
  const db = event.target.result;

  // Write
  const tx = db.transaction('users', 'readwrite');
  tx.objectStore('users').add({
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
  });

  // Read
  const readTx = db.transaction('users', 'readonly');
  const getReq = readTx.objectStore('users').get(1);
  getReq.onsuccess = () => console.log(getReq.result);
};
```

| Feature      | localStorage | sessionStorage | IndexedDB                   |
| ------------ | ------------ | -------------- | --------------------------- |
| Capacity     | ~5-10MB      | ~5-10MB        | Large (GB+)                 |
| Persistence  | Permanent    | Tab session    | Permanent                   |
| API          | Sync         | Sync           | Async                       |
| Data types   | Strings      | Strings        | Structured (objects, blobs) |
| Transactions | No           | No             | Yes                         |

### Web Workers

Run JavaScript in a background thread, keeping the main thread responsive:

```javascript
// main.js
const worker = new Worker('worker.js');

worker.postMessage({ data: largeArray });

worker.onmessage = (event) => {
  console.log('Result:', event.data);
};

worker.onerror = (error) => {
  console.error('Worker error:', error.message);
};

worker.terminate();
```

```javascript
// worker.js
self.onmessage = (event) => {
  const result = heavyComputation(event.data);
  self.postMessage(result);
};

function heavyComputation(data) {
  // CPU-intensive work that won't block the UI
  return data.data.sort((a, b) => a - b);
}
```

**Limitations:** No DOM access, no `window` object, communication via `postMessage` (structured clone algorithm).

### Service Workers

A proxy between the browser and network, enabling offline support and caching:

```javascript
// Register
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => console.log('SW registered:', reg.scope))
    .catch((err) => console.error('SW registration failed:', err));
}

// sw.js
const CACHE_NAME = 'v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

**Service Worker lifecycle:** Install -> Activate -> Fetch (idle between events)

### requestAnimationFrame

Synchronizes animations with the browser's refresh rate (~60fps):

```javascript
function animate(element) {
  let position = 0;
  let animationId;

  function step(timestamp) {
    position += 2;
    element.style.transform = `translateX(${position}px)`;

    if (position < 500) {
      animationId = requestAnimationFrame(step);
    }
  }

  animationId = requestAnimationFrame(step);

  // Cancel if needed
  // cancelAnimationFrame(animationId);
}
```

**Why not `setInterval`?**

- `requestAnimationFrame` pauses when the tab is hidden (saves battery)
- Syncs with display refresh rate (no tearing or jank)
- Browser can batch and optimize paint operations

### Clipboard API

```javascript
// Modern async Clipboard API
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    console.log('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

async function readFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    throw err;
  }
}

// Copy rich content (images, HTML)
async function copyImage(blob) {
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}
```

**Note:** The Clipboard API requires a secure context (HTTPS) and user gesture (click, keypress) for `readText`.

---

## Common Interview Questions

### Q1: What is the difference between event bubbling and event capturing?

**Answer:** When an event occurs on a DOM element, it goes through three phases. During the **capturing phase**, the event travels from the root (`window`) down through ancestors to the target element. During the **target phase**, the event fires on the actual target. During the **bubbling phase**, the event travels back up from the target to the root.

By default, `addEventListener` registers handlers for the bubbling phase. You can listen during the capturing phase by passing `true` or `{ capture: true }` as the third argument. Most real-world patterns use bubbling (event delegation relies on it), but capturing is useful when you need to intercept events before they reach child elements.

### Q2: Explain event delegation and give a practical example.

**Answer:** Event delegation leverages event bubbling to handle events for many child elements with a single listener on a parent. Instead of attaching `n` listeners to `n` items in a list, you attach one listener to the list container.

```javascript
document.getElementById('todo-list').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    const item = deleteBtn.closest('.todo-item');
    item.remove();
    return;
  }

  const checkbox = e.target.closest('[data-action="toggle"]');
  if (checkbox) {
    const item = checkbox.closest('.todo-item');
    item.classList.toggle('completed');
  }
});
```

This pattern reduces memory footprint, automatically handles dynamically added elements, and simplifies cleanup.

### Q3: How does IntersectionObserver differ from scroll event listeners for lazy loading?

**Answer:** Scroll event listeners fire on every scroll tick, which can be 60+ times per second. Even with throttling or debouncing, you must call `getBoundingClientRect()` which triggers layout recalculation (forced reflow).

`IntersectionObserver` is asynchronous and runs off the main thread. The browser optimizes intersection checks internally and only calls your callback when visibility actually changes. This results in significantly better scroll performance -- no jank, no forced reflows, and no need for manual throttling.

### Q4: What are the key differences between Web Workers and Service Workers?

**Answer:**

| Aspect               | Web Worker                  | Service Worker                  |
| -------------------- | --------------------------- | ------------------------------- |
| Purpose              | Offload CPU-intensive tasks | Network proxy, offline caching  |
| Lifecycle            | Lives as long as the page   | Persists independently of pages |
| DOM access           | No                          | No                              |
| Network interception | No                          | Yes (`fetch` event)             |
| Scope                | Per-page                    | Per-origin/scope                |
| HTTPS required       | No                          | Yes                             |
| Communication        | `postMessage`               | `postMessage` + events          |

Web Workers are for computation. Service Workers are for network control and offline experiences.

### Q5: When would you use `requestAnimationFrame` instead of `setTimeout` or CSS animations?

**Answer:** Use `requestAnimationFrame` when you need to animate something frame-by-frame with JavaScript logic -- for example, canvas animations, physics simulations, or animations that depend on runtime calculations. It syncs with the browser's paint cycle (~60fps), automatically pauses in background tabs, and avoids the timing issues of `setTimeout`/`setInterval` which can fire at suboptimal times.

Use CSS animations/transitions for simple declarative animations (opacity, transform) since the browser can optimize these on the compositor thread without touching the main thread. `requestAnimationFrame` is the right choice when CSS cannot express the animation logic.

### Q6: What happens when you store a non-string value in localStorage?

**Answer:** `localStorage` stores everything as strings. If you set `localStorage.setItem('count', 42)`, the number `42` is coerced to the string `"42"`. When you read it back with `getItem`, you get the string `"42"`, not the number. For objects, calling `localStorage.setItem('user', { name: 'Alice' })` stores `"[object Object]"` -- the object's `toString()` result -- which is almost certainly not what you want.

You must serialize with `JSON.stringify()` and deserialize with `JSON.parse()`. Be careful with values that `JSON.stringify` cannot handle: `undefined`, functions, `Symbol`, circular references, `Date` objects (they become strings), and `Map`/`Set` (they become empty objects `{}`).

### Q7: Explain the MutationObserver API and when you would use it.

**Answer:** `MutationObserver` watches a DOM subtree for changes -- added/removed nodes, attribute modifications, and text content changes. You configure what to observe via options (`childList`, `attributes`, `characterData`, `subtree`).

Practical use cases include:

- Detecting when a third-party script injects unwanted elements
- Building a "live preview" that reacts to DOM changes
- Implementing undo/redo by tracking mutations
- Accessibility tooling that monitors dynamic content updates
- Polyfilling features that need to know when new elements appear

It replaces the deprecated Mutation Events (`DOMSubtreeModified`, etc.) which had severe performance issues.

---

## Code Examples

### Infinite Scroll with IntersectionObserver

```javascript
function createInfiniteScroll(container, loadMore) {
  const sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  container.appendChild(sentinel);

  let loading = false;

  const observer = new IntersectionObserver(
    async (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !loading) {
        loading = true;
        try {
          const hasMore = await loadMore();
          if (!hasMore) {
            observer.unobserve(sentinel);
            sentinel.remove();
          }
        } catch (err) {
          console.error('Failed to load more:', err);
        } finally {
          loading = false;
        }
      }
    },
    { rootMargin: '200px' }
  );

  observer.observe(sentinel);

  return () => {
    observer.disconnect();
    sentinel.remove();
  };
}
```

### Debounced Resize Handler with ResizeObserver

```javascript
function observeResize(element, callback, debounceMs = 150) {
  let timeoutId;

  const observer = new ResizeObserver((entries) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        callback({ width, height });
      }
    }, debounceMs);
  });

  observer.observe(element);

  return () => {
    clearTimeout(timeoutId);
    observer.disconnect();
  };
}

// Usage
const cleanup = observeResize(
  document.getElementById('chart'),
  ({ width, height }) => {
    renderChart(width, height);
  }
);
```

### Smooth Animation with requestAnimationFrame

```javascript
function animateValue(element, start, end, duration) {
  let startTime = null;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;

    element.textContent = Math.round(current).toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// Animate a counter from 0 to 10000 over 2 seconds
animateValue(document.getElementById('counter'), 0, 10000, 2000);
```

### Web Worker for Heavy Computation

```javascript
// main.js
function processDataInWorker(data) {
  return new Promise((resolve, reject) => {
    const blob = new Blob(
      [
        `
      self.onmessage = function(e) {
        const data = e.data;
        // Simulate heavy computation
        const result = data
          .filter(item => item.active)
          .map(item => ({ ...item, score: item.value * 2.5 }))
          .sort((a, b) => b.score - a.score);
        self.postMessage(result);
      };
    `,
      ],
      { type: 'application/javascript' }
    );

    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
      URL.revokeObjectURL(blob);
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    worker.postMessage(data);
  });
}
```

---

## Gotchas & Edge Cases

1. **`querySelectorAll` returns a static NodeList.** If you add elements after the query, the NodeList does not update. Use `getElementsByClassName` for a live collection, or re-query when needed.

2. **`innerHTML` destroys event listeners.** Setting `element.innerHTML += '<p>new</p>'` re-parses the entire contents, removing all event listeners on existing children. Use `insertAdjacentHTML` or `appendChild` instead.

3. **`localStorage` triggers events across tabs.** The `storage` event fires in _other_ tabs/windows of the same origin, not in the tab that made the change. This enables cross-tab communication.

4. **`stopPropagation` vs `preventDefault`.** `stopPropagation` stops the event from reaching other handlers. `preventDefault` stops the browser's default action (e.g., navigating on link click, submitting a form). They are independent -- you can call one without the other.

5. **Passive event listeners.** Touch and wheel events default to non-passive, meaning the browser must wait for your handler to call `preventDefault()` before scrolling. Adding `{ passive: true }` tells the browser it can scroll immediately. Chrome now defaults touch/wheel listeners to passive.

6. **IndexedDB is origin-scoped.** `http://example.com` and `https://example.com` have separate databases. Be careful in development when switching between HTTP and HTTPS.

7. **Service Workers require HTTPS** (except `localhost`). They also have a scope -- a SW registered at `/app/sw.js` can only intercept requests under `/app/`.

8. **`document.getElementById` does not need a `#` prefix.** But `querySelector('#id')` does. Mixing these up is a common mistake.

9. **`NodeList` is not an Array.** While modern browsers support `forEach` on NodeList, methods like `map`, `filter`, and `reduce` are not available. Convert with `Array.from(nodeList)` or `[...nodeList]`.

10. **`getBoundingClientRect()` triggers layout.** Calling it in a tight loop (e.g., scroll handler) forces the browser to recalculate layout synchronously. Prefer `IntersectionObserver` for visibility checks.

---

## Quick Reference

| API                                  | Purpose                         | Async          | Browser Support    |
| ------------------------------------ | ------------------------------- | -------------- | ------------------ |
| `querySelector` / `querySelectorAll` | Select elements by CSS selector | No             | All modern         |
| `addEventListener`                   | Attach event handlers           | No             | All modern         |
| `MutationObserver`                   | Watch DOM changes               | Callback-based | All modern         |
| `IntersectionObserver`               | Detect element visibility       | Callback-based | All modern         |
| `ResizeObserver`                     | Detect element size changes     | Callback-based | All modern         |
| `localStorage`                       | Persistent key-value storage    | No             | All modern         |
| `sessionStorage`                     | Session key-value storage       | No             | All modern         |
| `IndexedDB`                          | Large structured data store     | Yes            | All modern         |
| `Web Worker`                         | Background thread computation   | Message-based  | All modern         |
| `Service Worker`                     | Network proxy / offline cache   | Event-based    | All modern (HTTPS) |
| `requestAnimationFrame`              | Frame-synced animation          | Callback-based | All modern         |
| `Clipboard API`                      | Read/write clipboard            | Promise-based  | All modern (HTTPS) |

| Event Method                   | Effect                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `e.stopPropagation()`          | Stop event from reaching other elements                 |
| `e.stopImmediatePropagation()` | Stop event from reaching other handlers on same element |
| `e.preventDefault()`           | Cancel browser default action                           |
| `e.target`                     | Element that originally triggered the event             |
| `e.currentTarget`              | Element the handler is attached to                      |
| `e.target.closest(selector)`   | Find nearest ancestor matching selector                 |

| Storage Comparison | localStorage | sessionStorage    | IndexedDB   | Cookies                |
| ------------------ | ------------ | ----------------- | ----------- | ---------------------- |
| Max size           | ~5-10MB      | ~5-10MB           | GB+         | ~4KB                   |
| Sent to server     | No           | No                | No          | Yes (every request)    |
| Accessible from    | Same origin  | Same origin + tab | Same origin | Configurable           |
| Expiration         | Manual       | Tab close         | Manual      | Configurable           |
| API style          | Sync         | Sync              | Async       | Sync (document.cookie) |
