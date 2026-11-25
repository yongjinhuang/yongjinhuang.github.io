# Frontend Coding Challenges

## Overview

Frontend coding challenges test your ability to implement common utilities, data structures, and UI components from scratch. Interviewers use these to evaluate your JavaScript fundamentals, problem-solving process, and awareness of edge cases. Unlike algorithm questions, these are practical -- you would encounter each of these in real codebases. The implementations below are production-aware: they handle edge cases, follow best practices, and include the reasoning behind design decisions.

---

## Core Concepts

Before diving into implementations, understand the patterns that appear repeatedly:

- **Closures**: debounce, throttle, memoize, and curry all rely on closures to preserve state between calls.
- **Recursion**: deep clone, flat array, and virtual DOM diff require traversing nested structures.
- **Event-driven architecture**: the event emitter and reactive system use the observer pattern.
- **Timing control**: debounce and throttle manage when functions execute relative to events.
- **Promise mechanics**: Promise.all and Promise.race require understanding of promise resolution and rejection.

---

## Code Examples

### 1. Debounce

Delays function execution until a pause in calls. Used for search inputs, resize handlers, and auto-save.

```javascript
function debounce(fn, delay) {
  let timeoutId = null;

  function debounced(...args) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  }

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      fn.apply(this);
      timeoutId = null;
    }
  };

  return debounced;
}

// Usage
const handleSearch = debounce((query) => {
  fetchResults(query);
}, 300);

input.addEventListener('input', (e) => handleSearch(e.target.value));

// Cleanup
handleSearch.cancel();
```

**Key points**: preserve `this` context with `.apply()`, support cancellation, clear previous timeout on each call.

---

### 2. Throttle

Ensures a function executes at most once per interval. Used for scroll handlers, mousemove, and rate-limited API calls.

```javascript
function throttle(fn, interval) {
  let lastCallTime = 0;
  let timeoutId = null;

  function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= interval) {
      lastCallTime = now;
      fn.apply(this, args);
    } else if (timeoutId === null) {
      // Schedule trailing call
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        fn.apply(this, args);
      }, interval - timeSinceLastCall);
    }
  }

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

// Usage
const handleScroll = throttle(() => {
  updateScrollPosition(window.scrollY);
}, 100);

window.addEventListener('scroll', handleScroll);
```

**Key distinction from debounce**: throttle guarantees execution at regular intervals during continuous events. Debounce only fires after events stop.

---

### 3. Deep Clone

Creates a completely independent copy of a nested object. Handles objects, arrays, dates, regex, maps, sets, and circular references.

```javascript
function deepClone(value, seen = new WeakMap()) {
  // Primitives and null
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Circular reference detection
  if (seen.has(value)) {
    return seen.get(value);
  }

  // Date
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  // RegExp
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  // Map
  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(value, clonedMap);
    value.forEach((v, k) => {
      clonedMap.set(deepClone(k, seen), deepClone(v, seen));
    });
    return clonedMap;
  }

  // Set
  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(value, clonedSet);
    value.forEach((v) => {
      clonedSet.add(deepClone(v, seen));
    });
    return clonedSet;
  }

  // Array
  if (Array.isArray(value)) {
    const clonedArr = [];
    seen.set(value, clonedArr);
    value.forEach((item, index) => {
      clonedArr[index] = deepClone(item, seen);
    });
    return clonedArr;
  }

  // Plain object
  const clonedObj = Object.create(Object.getPrototypeOf(value));
  seen.set(value, clonedObj);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.value !== undefined) {
      clonedObj[key] = deepClone(descriptor.value, seen);
    } else {
      Object.defineProperty(clonedObj, key, descriptor);
    }
  }

  return clonedObj;
}

// Test with circular reference
const obj = { a: 1, b: { c: 2 } };
obj.self = obj;
const cloned = deepClone(obj);
// cloned.self === cloned (not obj)
```

**Edge cases handled**: circular references (WeakMap), Date, RegExp, Map, Set, Symbol keys (Reflect.ownKeys), prototype chain.

**Note**: `structuredClone()` is the native alternative (supported in all modern browsers), but interviewers typically want you to implement it.

---

### 4. Flat Array

Flattens a nested array to a specified depth.

```javascript
function flat(arr, depth = 1) {
  if (depth <= 0) return arr.slice();

  return arr.reduce((result, item) => {
    if (Array.isArray(item)) {
      return result.concat(flat(item, depth - 1));
    }
    return result.concat(item);
  }, []);
}

// Iterative version (avoids stack overflow for deep nesting)
function flatIterative(arr, depth = 1) {
  const stack = arr.map((item) => ({ value: item, depth }));
  const result = [];

  while (stack.length > 0) {
    const { value, depth: d } = stack.shift();

    if (Array.isArray(value) && d > 0) {
      const items = value.map((item) => ({ value: item, depth: d - 1 }));
      stack.unshift(...items);
    } else {
      result.push(value);
    }
  }

  return result;
}

// Infinite depth
function flatDeep(arr) {
  return arr.reduce((result, item) => {
    if (Array.isArray(item)) {
      return result.concat(flatDeep(item));
    }
    return result.concat(item);
  }, []);
}

// Tests
flat([1, [2, [3, [4]]]], 1); // [1, 2, [3, [4]]]
flat([1, [2, [3, [4]]]], 2); // [1, 2, 3, [4]]
flatDeep([1, [2, [3, [4]]]]); // [1, 2, 3, 4]
```

---

### 5. Event Emitter

A pub/sub system for decoupled communication. Foundation of Node.js EventEmitter and many frontend state management libraries.

```javascript
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push({ listener, once: false });
    return this;
  }

  once(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push({ listener, once: true });
    return this;
  }

  emit(event, ...args) {
    const listeners = this.events.get(event);
    if (!listeners) return false;

    // Create a copy to avoid issues if listeners modify the array
    const snapshot = [...listeners];
    const toRemove = [];

    snapshot.forEach((entry) => {
      entry.listener.apply(this, args);
      if (entry.once) {
        toRemove.push(entry);
      }
    });

    // Remove once-listeners
    toRemove.forEach((entry) => {
      const current = this.events.get(event);
      const index = current.indexOf(entry);
      if (index !== -1) {
        current.splice(index, 1);
      }
    });

    return true;
  }

  off(event, listener) {
    const listeners = this.events.get(event);
    if (!listeners) return this;

    const filtered = listeners.filter((entry) => entry.listener !== listener);
    if (filtered.length === 0) {
      this.events.delete(event);
    } else {
      this.events.set(event, filtered);
    }
    return this;
  }

  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listenerCount(event) {
    const listeners = this.events.get(event);
    return listeners ? listeners.length : 0;
  }
}

// Usage
const emitter = new EventEmitter();

function onMessage(data) {
  // handle data
}

emitter.on('message', onMessage);
emitter.once('connect', () => {
  /* runs once */
});
emitter.emit('message', { text: 'hello' });
emitter.off('message', onMessage);
```

---

### 6. Promise.all

Resolves when all promises resolve, rejects on the first rejection.

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const inputs = Array.from(promises);

    if (inputs.length === 0) {
      resolve([]);
      return;
    }

    const results = new Array(inputs.length);
    let resolvedCount = 0;

    inputs.forEach((promise, index) => {
      Promise.resolve(promise).then(
        (value) => {
          results[index] = value;
          resolvedCount += 1;

          if (resolvedCount === inputs.length) {
            resolve(results);
          }
        },
        (reason) => {
          reject(reason);
        }
      );
    });
  });
}

// Tests
promiseAll([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]).then(
  (results) => {
    // [1, 2, 3]
  }
);

promiseAll([
  Promise.resolve(1),
  Promise.reject('error'),
  Promise.resolve(3),
]).catch((reason) => {
  // 'error'
});

// Handles non-promise values
promiseAll([1, 'hello', Promise.resolve(3)]).then((results) => {
  // [1, 'hello', 3]
});
```

**Key details**: `Promise.resolve(promise)` wraps non-promise values. Results array preserves input order even though promises may resolve out of order. Empty input resolves immediately with `[]`.

---

### 7. Promise.race

Settles with the first promise that settles (resolves or rejects).

```javascript
function promiseRace(promises) {
  return new Promise((resolve, reject) => {
    const inputs = Array.from(promises);

    if (inputs.length === 0) {
      // Never settles (matches native behavior)
      return;
    }

    inputs.forEach((promise) => {
      Promise.resolve(promise).then(resolve, reject);
    });
  });
}

// Usage: timeout pattern
function fetchWithTimeout(url, timeoutMs) {
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
  });

  return promiseRace([fetchPromise, timeoutPromise]);
}
```

---

### 8. Curry Function

Transforms a function so it can be called with arguments one at a time.

```javascript
function curry(fn) {
  const arity = fn.length;

  function curried(...args) {
    if (args.length >= arity) {
      return fn.apply(this, args);
    }

    return function (...moreArgs) {
      return curried.apply(this, args.concat(moreArgs));
    };
  }

  return curried;
}

// Usage
function add(a, b, c) {
  return a + b + c;
}

const curriedAdd = curry(add);
curriedAdd(1)(2)(3); // 6
curriedAdd(1, 2)(3); // 6
curriedAdd(1)(2, 3); // 6
curriedAdd(1, 2, 3); // 6

// Practical: reusable utilities
const multiply = curry((a, b) => a * b);
const double = multiply(2);
const triple = multiply(3);
double(5); // 10
triple(5); // 15
```

**Variant with placeholder support**:

```javascript
function curryWithPlaceholder(fn) {
  const PLACEHOLDER = curryWithPlaceholder._;

  function curried(...args) {
    const hasPlaceholder = args.some((a) => a === PLACEHOLDER);
    if (args.length >= fn.length && !hasPlaceholder) {
      return fn.apply(this, args);
    }

    return function (...moreArgs) {
      const merged = args.map((a) =>
        a === PLACEHOLDER && moreArgs.length > 0 ? moreArgs.shift() : a
      );
      return curried.apply(this, merged.concat(moreArgs));
    };
  }

  return curried;
}

curryWithPlaceholder._ = Symbol('placeholder');
```

---

### 9. Memoize Function

Caches function results based on arguments. Essential for expensive computations.

```javascript
function memoize(fn, keyResolver) {
  const cache = new Map();

  function memoized(...args) {
    const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  }

  memoized.cache = cache;

  memoized.clear = () => {
    cache.clear();
  };

  return memoized;
}

// Usage
const expensiveCalc = memoize((n) => {
  let result = 0;
  for (let i = 0; i < n * 1000000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

expensiveCalc(100); // slow (computes)
expensiveCalc(100); // instant (cached)

// With custom key resolver for object arguments
const fetchUser = memoize(
  async (params) => {
    const res = await fetch(`/api/users?${new URLSearchParams(params)}`);
    return res.json();
  },
  (params) => `${params.role}-${params.page}`
);
```

**With LRU eviction** (bounded memory):

```javascript
function memoizeLRU(fn, maxSize = 100) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      const value = cache.get(key);
      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    const result = fn.apply(this, args);

    if (cache.size >= maxSize) {
      // Delete oldest (first) entry
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    cache.set(key, result);
    return result;
  };
}
```

---

### 10. Virtual DOM Diff Algorithm

Computes the minimal set of changes between two virtual DOM trees.

```javascript
// Virtual DOM node structure
function createElement(type, props, ...children) {
  return {
    type,
    props: props || {},
    children: children.flat(),
  };
}

// Diff algorithm: returns a list of patches
function diff(oldTree, newTree) {
  const patches = [];

  function walk(oldNode, newNode, path) {
    // New node does not exist: remove
    if (newNode === undefined || newNode === null) {
      patches.push({ type: 'REMOVE', path });
      return;
    }

    // Old node does not exist: add
    if (oldNode === undefined || oldNode === null) {
      patches.push({ type: 'ADD', path, node: newNode });
      return;
    }

    // Text nodes
    if (typeof oldNode === 'string' || typeof newNode === 'string') {
      if (oldNode !== newNode) {
        patches.push({ type: 'REPLACE', path, node: newNode });
      }
      return;
    }

    // Different element types: replace entirely
    if (oldNode.type !== newNode.type) {
      patches.push({ type: 'REPLACE', path, node: newNode });
      return;
    }

    // Same type: diff props
    const propPatches = diffProps(oldNode.props, newNode.props);
    if (propPatches.length > 0) {
      patches.push({ type: 'UPDATE_PROPS', path, changes: propPatches });
    }

    // Diff children
    const maxLen = Math.max(oldNode.children.length, newNode.children.length);

    for (let i = 0; i < maxLen; i++) {
      walk(oldNode.children[i], newNode.children[i], `${path}.children[${i}]`);
    }
  }

  function diffProps(oldProps, newProps) {
    const changes = [];
    const allKeys = new Set([
      ...Object.keys(oldProps),
      ...Object.keys(newProps),
    ]);

    allKeys.forEach((key) => {
      if (oldProps[key] !== newProps[key]) {
        changes.push({
          key,
          oldValue: oldProps[key],
          newValue: newProps[key],
        });
      }
    });

    return changes;
  }

  walk(oldTree, newTree, 'root');
  return patches;
}

// Apply patches to real DOM
function applyPatches(element, patches) {
  patches.forEach((patch) => {
    switch (patch.type) {
      case 'REMOVE':
        element.remove();
        break;
      case 'REPLACE':
        const newEl = renderToDOM(patch.node);
        element.replaceWith(newEl);
        break;
      case 'UPDATE_PROPS':
        patch.changes.forEach(({ key, newValue }) => {
          if (newValue === undefined) {
            element.removeAttribute(key);
          } else {
            element.setAttribute(key, newValue);
          }
        });
        break;
      case 'ADD':
        const child = renderToDOM(patch.node);
        element.appendChild(child);
        break;
    }
  });
}

function renderToDOM(vnode) {
  if (typeof vnode === 'string') {
    return document.createTextNode(vnode);
  }

  const el = document.createElement(vnode.type);

  Object.entries(vnode.props).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });

  vnode.children.forEach((child) => {
    el.appendChild(renderToDOM(child));
  });

  return el;
}

// Test
const oldTree = createElement(
  'div',
  { class: 'app' },
  createElement('h1', {}, 'Hello'),
  createElement('p', {}, 'World')
);

const newTree = createElement(
  'div',
  { class: 'app updated' },
  createElement('h1', {}, 'Hello!'),
  createElement('span', {}, 'New element')
);

const patches = diff(oldTree, newTree);
// [
//   { type: 'UPDATE_PROPS', path: 'root', changes: [{key: 'class', ...}] },
//   { type: 'REPLACE', path: 'root.children[0].children[0]', node: 'Hello!' },
//   { type: 'REPLACE', path: 'root.children[1]', node: {type: 'span', ...} }
// ]
```

---

### 11. Simple Reactive System

A minimal reactivity engine inspired by Vue's dependency tracking.

```javascript
let activeEffect = null;

class Dep {
  constructor() {
    this.subscribers = new Set();
  }

  depend() {
    if (activeEffect) {
      this.subscribers.add(activeEffect);
    }
  }

  notify() {
    this.subscribers.forEach((effect) => effect());
  }
}

function reactive(obj) {
  const deps = new Map();

  function getDep(key) {
    if (!deps.has(key)) {
      deps.set(key, new Dep());
    }
    return deps.get(key);
  }

  return new Proxy(obj, {
    get(target, key, receiver) {
      const dep = getDep(key);
      dep.depend();
      return Reflect.get(target, key, receiver);
    },

    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);
      if (oldValue !== value) {
        const dep = getDep(key);
        dep.notify();
      }
      return result;
    },
  });
}

function watchEffect(fn) {
  activeEffect = fn;
  fn(); // Run immediately to collect dependencies
  activeEffect = null;
}

function computed(getter) {
  const ref = { value: undefined };
  watchEffect(() => {
    ref.value = getter();
  });
  return ref;
}

// Usage
const state = reactive({ count: 0, name: 'Alice' });

// This effect auto-tracks that it depends on state.count
watchEffect(() => {
  document.getElementById('counter').textContent = `Count: ${state.count}`;
});

// This effect depends on state.name
watchEffect(() => {
  document.getElementById('greeting').textContent = `Hello, ${state.name}`;
});

const doubled = computed(() => state.count * 2);

state.count = 5; // Triggers only the counter effect, doubled updates
state.name = 'Bob'; // Triggers only the greeting effect
```

---

### 12. Infinite Scroll

Loads more content as the user scrolls near the bottom. Uses IntersectionObserver for performance.

```javascript
function createInfiniteScroll({ loadMore, threshold = 200 }) {
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';

  let isLoading = false;
  let hasMore = true;

  const observer = new IntersectionObserver(
    async (entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting || isLoading || !hasMore) return;

      isLoading = true;

      try {
        const result = await loadMore();
        hasMore = result.hasMore;
      } catch (error) {
        // Surface error to consumer
      } finally {
        isLoading = false;
      }
    },
    { rootMargin: `${threshold}px` }
  );

  return {
    mount(container) {
      container.appendChild(sentinel);
      observer.observe(sentinel);
    },

    unmount() {
      observer.disconnect();
      sentinel.remove();
    },

    reset() {
      hasMore = true;
      isLoading = false;
    },
  };
}

// React hook version
function useInfiniteScroll(fetchPage) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchPage(page).then((result) => {
      if (cancelled) return;
      setItems((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [page, fetchPage]);

  return { items, isLoading, hasMore, sentinelRef };
}

// Usage
function ItemList() {
  const { items, isLoading, sentinelRef } = useInfiniteScroll(async (page) => {
    const res = await fetch(`/api/items?page=${page}`);
    const data = await res.json();
    return { items: data.items, hasMore: data.hasNext };
  });

  return (
    <div>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
      <div ref={sentinelRef} />
      {isLoading && <Spinner />}
    </div>
  );
}
```

---

### 13. Drag and Drop

Vanilla implementation with mouse events and visual feedback.

```javascript
function createDraggable(element, options = {}) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  const { onDragStart, onDrag, onDragEnd, handle, bounds } = options;

  const dragHandle = handle ? element.querySelector(handle) : element;

  function handleMouseDown(e) {
    if (e.button !== 0) return; // left click only

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    element.style.position = 'fixed';
    element.style.left = `${initialLeft}px`;
    element.style.top = `${initialTop}px`;
    element.style.zIndex = '1000';
    element.style.cursor = 'grabbing';
    element.style.userSelect = 'none';

    onDragStart?.({ x: initialLeft, y: initialTop });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!isDragging) return;

    let newLeft = initialLeft + (e.clientX - startX);
    let newTop = initialTop + (e.clientY - startY);

    // Apply bounds
    if (bounds) {
      const boundRect = bounds.getBoundingClientRect();
      const elRect = element.getBoundingClientRect();
      newLeft = Math.max(
        boundRect.left,
        Math.min(newLeft, boundRect.right - elRect.width)
      );
      newTop = Math.max(
        boundRect.top,
        Math.min(newTop, boundRect.bottom - elRect.height)
      );
    }

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;

    onDrag?.({ x: newLeft, y: newTop });
  }

  function handleMouseUp() {
    isDragging = false;
    element.style.cursor = 'grab';
    element.style.userSelect = '';
    element.style.zIndex = '';

    const finalRect = element.getBoundingClientRect();
    onDragEnd?.({ x: finalRect.left, y: finalRect.top });

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  dragHandle.style.cursor = 'grab';
  dragHandle.addEventListener('mousedown', handleMouseDown);

  return {
    destroy() {
      dragHandle.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    },
  };
}

// List reorder with drag and drop
function createSortableList(container) {
  let draggedItem = null;
  let placeholder = null;

  container.addEventListener('mousedown', (e) => {
    const item = e.target.closest('[data-sortable]');
    if (!item) return;

    draggedItem = item;
    placeholder = document.createElement('div');
    placeholder.className = 'sortable-placeholder';
    placeholder.style.height = `${item.offsetHeight}px`;

    item.style.opacity = '0.5';

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  });

  function handleMove(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const item = target?.closest('[data-sortable]');

    if (item && item !== draggedItem && item !== placeholder) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        item.parentNode.insertBefore(placeholder, item);
      } else {
        item.parentNode.insertBefore(placeholder, item.nextSibling);
      }
    }
  }

  function handleUp() {
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedItem, placeholder);
      placeholder.remove();
    }

    draggedItem.style.opacity = '';
    draggedItem = null;

    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleUp);
  }
}
```

---

### 14. Autocomplete Component

Full-featured autocomplete with keyboard navigation, debounced search, and accessibility.

```jsx
function Autocomplete({
  fetchSuggestions,
  onSelect,
  placeholder,
  debounceMs = 300,
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Debounced fetch
  const debouncedFetch = useRef(null);

  useEffect(() => {
    return () => {
      if (debouncedFetch.current) {
        clearTimeout(debouncedFetch.current);
      }
    };
  }, []);

  function handleInputChange(e) {
    const value = e.target.value;
    setQuery(value);
    setActiveIndex(-1);

    if (debouncedFetch.current) {
      clearTimeout(debouncedFetch.current);
    }

    if (!value.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debouncedFetch.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchSuggestions(value);
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }

  function handleKeyDown(e) {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) {
          selectItem(suggestions[activeIndex]);
        }
        break;

      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function selectItem(item) {
    setQuery(item.label);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(item);
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[activeIndex];
      activeElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        !inputRef.current?.contains(e.target) &&
        !listRef.current?.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const listboxId = 'autocomplete-listbox';

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
      />

      {isLoading && <span className="spinner" aria-hidden="true" />}

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflow: 'auto',
            border: '1px solid #ccc',
            background: '#fff',
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          {suggestions.map((item, index) => (
            <li
              key={item.id}
              id={`option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: index === activeIndex ? '#e3f2fd' : 'transparent',
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectItem(item)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Usage
function SearchPage() {
  async function fetchSuggestions(query) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data.results.map((r) => ({ id: r.id, label: r.name }));
  }

  return (
    <Autocomplete
      fetchSuggestions={fetchSuggestions}
      onSelect={(item) => navigateTo(`/items/${item.id}`)}
      placeholder="Search items..."
    />
  );
}
```

---

### 15. Modal with Focus Trap

Accessible modal that traps focus inside while open, restores focus on close, and closes on Escape.

```jsx
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Store the element that triggered the modal
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Focus the modal when opened
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const firstFocusable = getFocusableElements(modalRef.current)[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        modalRef.current.focus();
      }
    }

    return () => {
      // Restore focus when modal closes
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        trapFocus(e, modalRef.current);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 id="modal-title">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </header>
        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
}

// Focus trap utilities
function getFocusableElements(container) {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(selectors)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

function trapFocus(event, container) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];

  if (event.shiftKey) {
    // Shift+Tab: if on first element, wrap to last
    if (document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    }
  } else {
    // Tab: if on last element, wrap to first
    if (document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }
}

// Usage
function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Confirm Action"
      >
        <p>Are you sure you want to proceed?</p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={() => setIsOpen(false)}>Cancel</button>
          <button
            onClick={() => {
              handleConfirm();
              setIsOpen(false);
            }}
          >
            Confirm
          </button>
        </div>
      </Modal>
    </>
  );
}
```

---

## Common Interview Questions

### Q1: What is the difference between debounce and throttle? When would you use each?

**Answer**: Debounce delays execution until a period of inactivity. If the function keeps being called, execution is deferred. Throttle limits execution to once per interval, guaranteeing regular execution during continuous events. Use debounce for search inputs (wait until user stops typing), form auto-save, and window resize calculations. Use throttle for scroll event handlers, mousemove tracking, and rate-limited API calls. The key mental model: debounce waits for silence, throttle enforces rhythm.

### Q2: How does your deep clone handle circular references?

**Answer**: I use a WeakMap that maps original objects to their clones. Before cloning any object, I check if it already exists in the WeakMap. If it does, I return the existing clone instead of recursing infinitely. WeakMap is ideal here because it allows garbage collection of the original objects after cloning completes, and it uses object identity (reference equality) as keys. This approach adds O(1) lookup per object and handles arbitrary circular structures, including self-references and cross-references between nested objects.

### Q3: Why does your Promise.all use Promise.resolve() to wrap each input?

**Answer**: `Promise.all` accepts an iterable of values, not just promises. Non-promise values like numbers and strings should be treated as already-resolved promises. `Promise.resolve(value)` handles both cases: if the value is already a promise, it returns it unchanged; if it is a plain value, it wraps it in a resolved promise. This matches the native `Promise.all` behavior. Without this wrapping, passing `[1, 2, 3]` would fail because you cannot call `.then()` on a number.

### Q4: What accessibility considerations does your autocomplete component address?

**Answer**: The component uses ARIA combobox pattern: `role="combobox"` on the input, `aria-expanded` to indicate dropdown state, `aria-controls` linking to the listbox, `aria-activedescendant` pointing to the currently highlighted option, and `aria-autocomplete="list"` to indicate the autocomplete behavior. The dropdown uses `role="listbox"` with `role="option"` on each item and `aria-selected` on the active item. Keyboard support includes ArrowUp/Down for navigation, Enter for selection, and Escape to close. The active item scrolls into view automatically.

### Q5: How does your focus trap in the modal work?

**Answer**: The focus trap works by intercepting Tab and Shift+Tab keyboard events. It queries all focusable elements inside the modal (links, buttons, inputs, textareas, selects, and elements with tabindex). When Tab is pressed on the last focusable element, focus wraps to the first element. When Shift+Tab is pressed on the first element, focus wraps to the last. On open, focus moves to the first focusable element inside the modal. On close, focus returns to the element that triggered the modal (stored in a ref). The modal also prevents body scroll and closes on Escape or backdrop click.

---

## Gotchas & Edge Cases

1. **Debounce with leading edge**. The basic implementation only fires on the trailing edge. Some use cases (like a save button) need immediate execution on the first click, then debounce subsequent clicks. Add a `leading` option that fires immediately on the first call.

2. **Deep clone loses functions**. The implementation above does not clone functions (they pass through by reference). This is intentional -- cloning a closure's scope is impossible. `JSON.parse(JSON.stringify())` drops functions entirely, which is worse.

3. **Promise.all short-circuits on first rejection**. The remaining promises continue executing (promises cannot be cancelled). If you need all results regardless of failures, use `Promise.allSettled()`.

4. **IntersectionObserver rootMargin quirk**. The `rootMargin` only works when the root is a scrollable container or the viewport. If you pass a non-scrollable element as root, the margin is ignored.

5. **Event emitter memory leaks**. If listeners are added but never removed (e.g., in React components that do not clean up effects), the emitter accumulates stale references. Implement a `maxListeners` warning like Node.js does.

6. **Memoize with object arguments**. `JSON.stringify` key generation fails for objects with circular references and treats `{a:1, b:2}` and `{b:2, a:1}` as different keys even though they are semantically equal. Use a stable serialization or `WeakMap` for object arguments.

7. **Drag and drop touch support**. The mousedown/mousemove implementation does not work on mobile. Use `touchstart`, `touchmove`, `touchend` events or the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`) for cross-device support.

8. **Modal scroll restoration**. The `position: fixed` trick for preventing body scroll resets scroll position. The implementation saves and restores `window.scrollY`, but nested modals need careful tracking to avoid restoring to the wrong position.

---

## Quick Reference

| Implementation   | Key Technique                       | Common Pitfall                        |
| ---------------- | ----------------------------------- | ------------------------------------- |
| Debounce         | clearTimeout + setTimeout           | Not preserving `this` context         |
| Throttle         | Date.now comparison + trailing call | Missing trailing execution            |
| Deep Clone       | WeakMap for circular refs           | Missing Date, RegExp, Map, Set        |
| Flat Array       | Recursive reduce with depth         | Stack overflow on deep nesting        |
| Event Emitter    | Map of event -> listener arrays     | Memory leaks from unremoved listeners |
| Promise.all      | Counter + results array by index    | Not wrapping non-promise values       |
| Promise.race     | First .then wins                    | Empty array never settles             |
| Curry            | Recursive closure checking arity    | Not supporting partial application    |
| Memoize          | Map with serialized key             | Object key serialization failures     |
| Virtual DOM Diff | Recursive tree walk + patches       | Not handling keyed lists              |
| Reactive System  | Proxy get/set + dependency tracking | Nested object reactivity              |
| Infinite Scroll  | IntersectionObserver + sentinel     | Race conditions on rapid scroll       |
| Drag and Drop    | mousedown/move/up lifecycle         | Missing touch/pointer events          |
| Autocomplete     | Debounced fetch + keyboard nav      | Missing ARIA attributes               |
| Modal Focus Trap | Tab/Shift+Tab interception          | Not restoring focus on close          |
