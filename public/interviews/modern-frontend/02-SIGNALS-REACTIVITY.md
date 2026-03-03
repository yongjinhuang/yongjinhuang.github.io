# Signals & Fine-Grained Reactivity

## Overview

The frontend world is going through a reactivity paradigm shift. React popularized the virtual DOM and top-down re-rendering model, but a growing number of frameworks -- Solid.js, Angular (v17+), Preact, Vue, and Svelte -- have adopted signals as their core reactivity primitive. The TC39 committee has a Stage 1 proposal to add signals to JavaScript itself. Understanding signals is no longer optional for senior frontend interviews.

This guide explains what signals are, why they exist, how they compare to React's model, and what the TC39 proposal means for the future. You do not need to be a Solid.js expert to ace these questions -- but you need to understand the tradeoffs between virtual DOM diffing and fine-grained reactivity.

---

## Core Concepts

### What Are Signals?

A signal is a reactive primitive that holds a value and automatically notifies its dependents when that value changes. Unlike React state, which triggers a component re-render, a signal triggers only the specific computations and DOM updates that depend on it.

```typescript
// Conceptual signal implementation (simplified)
function createSignal<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<() => void>();

  function get(): T {
    // Track who is reading this signal
    if (currentObserver) {
      subscribers.add(currentObserver);
    }
    return value;
  }

  function set(newValue: T): void {
    if (!Object.is(value, newValue)) {
      value = newValue;
      // Notify only the specific subscribers
      for (const subscriber of subscribers) {
        subscriber();
      }
    }
  }

  return [get, set] as const;
}
```

The key insight: signals track dependencies automatically at read time. When you read a signal inside a computation, the signal remembers that computation as a subscriber. When the signal's value changes, it notifies exactly those subscribers -- nothing more.

### Why Signals Exist: The Re-Render Problem

React's model is elegant but wasteful for certain patterns. When state changes in React:

1. The component function re-executes entirely
2. All child components re-execute (unless memoized)
3. React diffs the old and new virtual DOM trees
4. React applies the minimal set of DOM changes

The problem: steps 1-3 can be expensive. A single counter incrementing in a component with 1000 items causes the entire component to re-render and diff, even though only one number in the DOM changed.

```jsx
// React: Entire component re-renders when count changes
function Dashboard() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Count: {count}</h1>          {/* Only this needs updating */}
      <ExpensiveList items={items} />   {/* Re-renders unnecessarily */}
      <Chart data={chartData} />        {/* Re-renders unnecessarily */}
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}

// Workarounds: React.memo, useMemo, useCallback
// These are opt-in optimizations that add complexity
```

With signals, only the specific DOM text node showing the count updates. Nothing else re-executes.

### The Same Component: React vs Solid.js vs Signals-Based Approach

**React (Virtual DOM, top-down re-rendering):**

```jsx
import { useState, useMemo, useCallback, memo } from "react";

const TodoItem = memo(function TodoItem({ todo, onToggle }) {
  return (
    <li>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      {todo.text}
    </li>
  );
});

function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case "active": return todos.filter(t => !t.completed);
      case "completed": return todos.filter(t => t.completed);
      default: return todos;
    }
  }, [todos, filter]);

  const toggleTodo = useCallback((id) => {
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  }, []);

  const addTodo = useCallback((text) => {
    setTodos(prev => [...prev, { id: Date.now(), text, completed: false }]);
  }, []);

  return (
    <div>
      <input onKeyDown={(e) => {
        if (e.key === "Enter") {
          addTodo(e.currentTarget.value);
          e.currentTarget.value = "";
        }
      }} />
      <div>
        <button onClick={() => setFilter("all")}>All</button>
        <button onClick={() => setFilter("active")}>Active</button>
        <button onClick={() => setFilter("completed")}>Completed</button>
      </div>
      <ul>
        {filteredTodos.map(todo => (
          <TodoItem key={todo.id} todo={todo} onToggle={toggleTodo} />
        ))}
      </ul>
      <p>{todos.filter(t => !t.completed).length} remaining</p>
    </div>
  );
}
```

**Solid.js (Signals, fine-grained reactivity, no virtual DOM):**

```jsx
import { createSignal, createMemo, For } from "solid-js";

function TodoApp() {
  const [todos, setTodos] = createSignal([]);
  const [filter, setFilter] = createSignal("all");

  const filteredTodos = createMemo(() => {
    switch (filter()) {          // Note: signals are called as functions
      case "active": return todos().filter(t => !t.completed);
      case "completed": return todos().filter(t => t.completed);
      default: return todos();
    }
  });

  const remaining = createMemo(() =>
    todos().filter(t => !t.completed).length
  );

  function toggleTodo(id) {
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  }

  function addTodo(text) {
    setTodos(prev => [...prev, { id: Date.now(), text, completed: false }]);
  }

  // This function body runs ONCE. Only the signal reads update the DOM.
  return (
    <div>
      <input onKeyDown={(e) => {
        if (e.key === "Enter") {
          addTodo(e.currentTarget.value);
          e.currentTarget.value = "";
        }
      }} />
      <div>
        <button onClick={() => setFilter("all")}>All</button>
        <button onClick={() => setFilter("active")}>Active</button>
        <button onClick={() => setFilter("completed")}>Completed</button>
      </div>
      <ul>
        <For each={filteredTodos()}>
          {(todo) => (
            <li>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
              />
              {todo.text}
            </li>
          )}
        </For>
      </ul>
      <p>{remaining()} remaining</p>
    </div>
  );
}
```

**Key difference:** In React, `TodoApp` re-executes on every state change, and you use `memo`/`useMemo`/`useCallback` to prevent unnecessary work. In Solid, `TodoApp` executes once, and only the specific DOM nodes bound to signals update.

### Signals in Angular (v17+)

Angular adopted signals as a core reactivity primitive starting in v17, replacing the zone.js-based change detection:

```typescript
import { Component, signal, computed, effect } from "@angular/core";

@Component({
  selector: "app-counter",
  template: `
    <h1>Count: {{ count() }}</h1>
    <p>Double: {{ doubled() }}</p>
    <button (click)="increment()">+</button>
  `,
})
export class CounterComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);

  constructor() {
    // Effects run automatically when their dependencies change
    effect(() => {
      console.log(`Count changed to: ${this.count()}`);
    });
  }

  increment() {
    this.count.update(c => c + 1);
    // Or: this.count.set(this.count() + 1);
  }
}
```

Angular signals are interesting because they retrofit fine-grained reactivity onto an existing framework. They replace the need for `OnPush` change detection strategy and `markForCheck()` calls, making performance optimization automatic rather than opt-in.

### Signals in Preact

Preact added signals as a first-class addon, demonstrating that signals can coexist with a virtual DOM:

```jsx
import { signal, computed, effect } from "@preact/signals";

// Signals can be declared outside components (global state)
const count = signal(0);
const doubled = computed(() => count.value * 2);

function Counter() {
  // No hooks needed -- signals integrate directly with JSX
  return (
    <div>
      <h1>Count: {count}</h1>         {/* Signal used directly in JSX */}
      <p>Double: {doubled}</p>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
}
```

Preact signals can bypass the virtual DOM entirely when a signal is used directly in JSX. The signal subscribes to the DOM text node and updates it directly, without triggering a component re-render.

### Vue's Reactivity System (ref/reactive)

Vue's Composition API uses a reactivity system conceptually similar to signals:

```vue
<script setup>
import { ref, reactive, computed, watch } from "vue";

const count = ref(0);
const user = reactive({ name: "Alice", age: 30 });

const doubled = computed(() => count.value * 2);

watch(count, (newVal, oldVal) => {
  console.log(`Count: ${oldVal} -> ${newVal}`);
});

function increment() {
  count.value++;
}
</script>

<template>
  <h1>Count: {{ count }}</h1>
  <p>Double: {{ doubled }}</p>
  <p>User: {{ user.name }}</p>
  <button @click="increment">+</button>
</template>
```

Vue's `ref()` is essentially a signal. `reactive()` wraps objects in a Proxy to track nested property access. The mental model is very similar to Solid signals, but Vue still uses a virtual DOM for rendering.

### TC39 Signals Proposal

The TC39 Signals Proposal (Stage 1 as of early 2025) aims to standardize signals at the JavaScript language level. The motivation: every framework has reimplemented signals with slightly different APIs, and a standard primitive would enable interoperability.

```typescript
// TC39 Signals Proposal (draft API -- subject to change)

// State signal (writable)
const counter = new Signal.State(0);

// Computed signal (derived, read-only)
const isEven = new Signal.Computed(() => counter.get() % 2 === 0);

// Reading values
console.log(counter.get());   // 0
console.log(isEven.get());    // true

// Writing values
counter.set(1);
console.log(isEven.get());    // false

// The proposal focuses on the core reactive graph.
// DOM integration and effects are left to frameworks and userland.
```

**What the proposal covers:**
- `Signal.State` -- writable signal with `.get()` and `.set()`
- `Signal.Computed` -- derived signal that lazily recomputes
- Automatic dependency tracking
- Glitch-free synchronous updates (no intermediate states)

**What the proposal does NOT cover:**
- Effects (running side effects when signals change)
- DOM bindings
- Batching strategies
- Component lifecycle integration

The idea is that the language provides the reactive graph primitive, and frameworks build their rendering and effect systems on top.

### Virtual DOM vs Fine-Grained Reactivity: The Tradeoffs

| Aspect | Virtual DOM (React) | Fine-Grained (Signals) |
|--------|-------------------|----------------------|
| **Update granularity** | Component-level | DOM-node-level |
| **Update mechanism** | Diff old/new VDOM trees | Direct subscriber notification |
| **Optimization model** | Opt-in (memo, useMemo) | Automatic |
| **Mental model** | Function of state: `UI = f(state)` | Reactive graph: signals -> DOM |
| **Component execution** | Re-runs on every state change | Runs once, sets up subscriptions |
| **Memory overhead** | Two VDOM trees in memory | Reactive subscription graph |
| **CPU overhead** | Diffing cost on every update | Near-zero for targeted updates |
| **Worst case** | Large tree with frequent small updates | Many signals with interconnected dependencies |
| **Best case** | Infrequent, large-batch updates | Frequent, isolated small updates |
| **Debugging** | DevTools show re-render counts | DevTools show dependency graph |
| **Ecosystem maturity** | Massive (React) | Growing (Solid, Angular) |

### When Virtual DOM Wins

- **Batch updates:** When many pieces of state change at once, computing a single diff can be more efficient than notifying hundreds of individual subscribers
- **Server rendering:** The VDOM model maps naturally to server rendering (render to string). Signals-based frameworks need different SSR strategies
- **Ecosystem and hiring:** React's ecosystem is vastly larger. Most developers know the VDOM model
- **Predictable rendering:** The entire component re-renders, making it easier to reason about what the user sees at any point

### When Signals Win

- **Frequent small updates:** Animations, real-time data, drag-and-drop -- scenarios where a single value changes many times per second
- **Large component trees:** A signal update in a deeply nested component does not propagate upward or sideways
- **No memoization ceremony:** You never need `memo`, `useMemo`, or `useCallback` -- granular reactivity is the default
- **Bundle size:** No VDOM runtime needed. Solid.js is ~7KB gzipped vs React's ~40KB

### React's Response: The React Compiler

React is not adopting signals, but the React Compiler (formerly React Forget) addresses the same problem from the React side. It automatically adds memoization during compilation:

```jsx
// What you write (no manual memoization)
function TodoApp({ todos, filter }) {
  const filteredTodos = todos.filter(t => matchesFilter(t, filter));

  return (
    <div>
      <FilterBar filter={filter} />
      <TodoList todos={filteredTodos} />
    </div>
  );
}

// What the compiler produces (conceptually)
function TodoApp({ todos, filter }) {
  const filteredTodos = useMemo(
    () => todos.filter(t => matchesFilter(t, filter)),
    [todos, filter]
  );

  const todoListElement = useMemo(
    () => <TodoList todos={filteredTodos} />,
    [filteredTodos]
  );

  return (
    <div>
      <FilterBar filter={filter} />
      {todoListElement}
    </div>
  );
}
```

The compiler analyzes your code and automatically memoizes values and components where it can prove the inputs haven't changed. This does not make React as granular as signals, but it eliminates the manual optimization tax.

---

## Common Interview Questions

### Q1: What are signals and why are they gaining traction?

**Answer:** Signals are reactive primitives that hold a value and automatically track their dependents. When a signal's value changes, only the specific computations and DOM nodes that read that signal are updated -- nothing else.

They are gaining traction because they solve the "re-render problem" that virtual DOM frameworks face. In React, when state changes, the entire component tree re-renders and React diffs the old and new virtual DOM. For most apps this is fine, but for complex UIs with frequent updates, the diffing cost becomes significant. Developers have to manually optimize with `React.memo`, `useMemo`, and `useCallback`.

Signals make optimization automatic. There is no diffing step, no memoization ceremony. The reactive graph directly connects state changes to DOM updates. Solid.js demonstrated this at scale, Angular adopted signals in v17, and now there is a TC39 proposal to standardize them in the language itself.

### Q2: What are the trade-offs between virtual DOM and fine-grained reactivity?

**Answer:** Virtual DOM's strength is its simplicity: you describe what the UI should look like for any given state, and React figures out the minimal DOM changes. The cost is re-executing component functions and diffing on every update. This is fine for most apps but can become a bottleneck for UIs with frequent, small updates (real-time dashboards, animations, collaborative editors).

Fine-grained reactivity's strength is surgical precision: only the exact DOM nodes that depend on a changed value are updated. No diffing, no unnecessary computation. The cost is a more complex mental model (the component function runs once and sets up a reactive graph) and a different debugging experience (you trace signal dependencies instead of re-render counts).

In practice, the React Compiler bridges much of the gap by auto-memoizing. Signals win on raw update performance. React wins on ecosystem, developer familiarity, and server component architecture. The future may converge -- the TC39 signals proposal could give React a path to fine-grained reactivity without abandoning its programming model.

### Q3: How does Solid.js achieve better performance than React?

**Answer:** Solid.js compiles JSX into direct DOM creation and signal subscriptions, bypassing the virtual DOM entirely. When you write `<h1>{count()}</h1>`, Solid compiles this into code that creates an `h1` element once and sets up a subscription so the text node updates directly when `count` changes.

Three specific things make Solid faster: First, component functions run once instead of on every update, eliminating the cost of re-executing component logic. Second, there is no virtual DOM diffing -- updates go directly from signal change to DOM mutation. Third, the `<For>` component tracks list changes at the item level, updating only the specific list items that changed rather than diffing the entire list.

The tradeoff is that Solid's model requires different mental habits. You cannot destructure props (it breaks reactivity tracking), conditional rendering works differently (using `<Show>` and `<Switch>` components), and closures capture the initial signal value unless you explicitly call the signal function.

### Q4: Explain the TC39 Signals proposal. Why does it matter?

**Answer:** The TC39 Signals proposal aims to add a standard reactive primitive to JavaScript. Currently, every framework implements its own signal system (Solid's `createSignal`, Angular's `signal()`, Vue's `ref()`, Preact's `signal()`). They all do essentially the same thing but with incompatible APIs.

A standard `Signal.State` and `Signal.Computed` in the language would enable: shared reactive state between frameworks (a signal created in a Solid component could be read by an Angular component), framework-agnostic reactive libraries, and browser-level optimizations for the reactive graph.

The proposal deliberately leaves out effects and DOM integration -- those remain framework concerns. It focuses on the core reactive graph: creating writable signals, deriving computed values, and ensuring glitch-free updates (no subscriber sees an intermediate, inconsistent state).

It matters because it signals (no pun intended) a consensus in the JavaScript community that fine-grained reactivity is a fundamental paradigm, not just a framework feature. If adopted, it would be the most significant addition to JavaScript's reactive capabilities since Promises.

### Q5: Can React adopt signals? Why or why not?

**Answer:** React *could* adopt signals internally, but it would require a fundamental change to React's programming model. React's core design principle is that components are pure functions of their props and state -- you call the function, it returns JSX, and React figures out the DOM changes. Signals replace this with a model where the function runs once and sets up a reactive graph.

React's team has chosen a different path: the React Compiler. Instead of changing the programming model, the compiler automatically adds the memoization that developers would otherwise write manually. This preserves React's existing mental model while eliminating much of the performance overhead.

That said, React has moved toward reactivity in other ways: `useSyncExternalStore` bridges external reactive stores (like signals) into React, and the `use()` hook allows React to suspend on promises, which is conceptually reactive. React may eventually adopt signals internally while keeping the same component API, but it is not on the near-term roadmap.

### Q6: If you were starting a new project today, when would you choose Solid.js over React?

**Answer:** I would choose Solid.js for applications with heavy real-time requirements: financial dashboards with streaming data, collaborative editing tools, complex data visualization with animations, or highly interactive design tools. These are cases where React's re-render overhead is measurable and the manual memoization tax is significant.

I would still choose React for most applications: content-heavy sites (RSC is a game changer), applications where SEO matters (Next.js ecosystem), projects where hiring is a concern (React developers are far more abundant), and applications using extensive third-party component libraries (React's ecosystem is unmatched).

The honest answer is that for 80% of web applications, the performance difference between React and Solid is imperceptible to users. The choice often comes down to ecosystem, hiring, and team familiarity rather than raw performance.

---

## Gotchas & Edge Cases

1. **Solid.js props destructuring breaks reactivity.** In Solid, `function Counter({ count })` extracts the value once and loses reactivity. You must use `props.count` or the `splitProps`/`mergeProps` helpers to maintain the reactive connection.

2. **Signals are synchronous by default.** Unlike React's batched state updates, signal changes propagate immediately. This can cause "glitches" where a computed value reads an inconsistent combination of signals mid-update. The TC39 proposal and most frameworks handle this with synchronous glitch-free algorithms, but it is a subtle design constraint.

3. **Memory leaks with effects.** Signal effects that are not properly disposed can create memory leaks. In Solid, effects created inside a component are automatically cleaned up when the component is removed. But effects created at the module level or in manual subscriptions need explicit disposal.

4. **Debugging signals is different.** React DevTools show component re-renders and props/state changes. Signal debugging requires tracing the dependency graph: which signal triggered which computation. Solid DevTools and Angular DevTools have different inspection models than React DevTools.

5. **Vue's `ref` vs `reactive` confusion.** `ref()` wraps primitives and requires `.value` access in script (but auto-unwraps in templates). `reactive()` wraps objects with a Proxy and does not need `.value`. Mixing them can lead to lost reactivity if you destructure a reactive object.

6. **Angular signals and RxJS coexistence.** Angular now has both signals (synchronous, pull-based) and RxJS Observables (asynchronous, push-based). Knowing when to use which is a common interview question. Signals are for synchronous UI state; Observables are for async streams (HTTP requests, WebSocket events, complex event handling).

7. **Preact signals in React.** The `@preact/signals-react` package attempts to bring signals into React, but it relies on internal React APIs and can break between React versions. It demonstrates that signals and virtual DOM can coexist, but it is not production-ready for large React applications.

8. **The React Compiler is not magic.** It can only memoize pure computations. If your component has side effects in the render path, the compiler cannot safely skip re-execution. It also does not handle all patterns -- complex closures and dynamic property access can defeat the compiler's analysis.

---

## Quick Reference

| Framework | Reactivity Model | Signal Primitive | VDOM | Bundle Size |
|-----------|-----------------|-----------------|------|-------------|
| React 19 | Virtual DOM + compiler | None (use external) | Yes | ~40KB |
| Solid.js 1.9 | Fine-grained signals | `createSignal` | No | ~7KB |
| Angular 19 | Signals + zone.js (legacy) | `signal()` | No (incremental DOM) | ~90KB |
| Vue 3.5 | Proxy-based reactivity | `ref()` / `reactive()` | Yes | ~33KB |
| Preact 10 | VDOM + optional signals | `signal()` via addon | Yes | ~4KB |
| Svelte 5 | Runes (signal-like) | `$state` / `$derived` | No (compile-time) | ~2KB |
| Qwik 2 | Fine-grained + resumability | `useSignal` | No | ~1KB initial |

| Signal Concept | React Equivalent | Description |
|---------------|-----------------|-------------|
| `signal(value)` | `useState(value)` | Writable reactive value |
| `computed(fn)` | `useMemo(fn, deps)` | Derived value, auto-tracks deps |
| `effect(fn)` | `useEffect(fn, deps)` | Side effect, auto-tracks deps |
| `batch(fn)` | Automatic in React 18+ | Group updates to prevent glitches |
| `untrack(fn)` | N/A | Read a signal without subscribing |

| TC39 Proposal API | Purpose |
|-------------------|---------|
| `Signal.State(value)` | Create a writable signal |
| `signal.get()` | Read the current value |
| `signal.set(value)` | Write a new value |
| `Signal.Computed(fn)` | Create a derived signal |
| `Signal.subtle.Watcher` | Low-level effect primitive |
| `Signal.subtle.currentComputed()` | Introspect the current computation |
