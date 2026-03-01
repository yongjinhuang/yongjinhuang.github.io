# React Fundamentals

## Overview

React is the most widely used frontend library, and virtually every frontend interview will test your understanding of its core mental model. Interviewers want to see that you understand *why* React works the way it does -- not just the API surface. This guide covers JSX compilation, the component model, hooks, rendering behavior, and patterns that separate junior developers from senior ones.

This guide focuses on React 18+ fundamentals. For advanced patterns like Server Components, concurrent features, and React 19 specifics, see the React Advanced Patterns guide.

---

## Core Concepts

### JSX

JSX is syntactic sugar for `React.createElement()` calls (or the new JSX transform in React 17+).

```jsx
// JSX
const element = <h1 className="title">Hello, {name}</h1>;

// Compiles to (classic transform)
const element = React.createElement('h1', { className: 'title' }, 'Hello, ', name);

// Compiles to (new transform -- no React import needed)
import { jsx as _jsx } from 'react/jsx-runtime';
const element = _jsx('h1', { className: 'title', children: ['Hello, ', name] });
```

**Key rules:**
- JSX expressions must have a single root element (use `<>...</>` fragments)
- Use `className` instead of `class`, `htmlFor` instead of `for`
- JavaScript expressions go inside `{}`
- `false`, `null`, `undefined`, and `true` are valid children that render nothing
- Beware: `0` is falsy but **does** render. `{count && <Items />}` renders `0` when count is 0

```jsx
// Bug: renders "0" when items is empty
{items.length && <ItemList items={items} />}

// Fix: explicit boolean check
{items.length > 0 && <ItemList items={items} />}
```

### Function Components vs Class Components

Modern React development uses function components almost exclusively. Class components remain in legacy codebases and error boundaries.

```jsx
// Function component (modern)
function Greeting({ name }) {
  const [count, setCount] = useState(0);
  return <h1 onClick={() => setCount(c => c + 1)}>Hello, {name} ({count})</h1>;
}

// Class component (legacy)
class Greeting extends React.Component {
  state = { count: 0 };

  render() {
    return (
      <h1 onClick={() => this.setState(s => ({ count: s.count + 1 }))}>
        Hello, {this.props.name} ({this.state.count})
      </h1>
    );
  }
}
```

**Why function components won:**
- Hooks enable reusable stateful logic (no HOC/render prop wrappers)
- No `this` binding issues
- Easier to test, smaller bundle size
- Better alignment with React's mental model (components as functions of state)

### Props and State

**Props** flow down from parent to child. They are read-only -- a component must never modify its own props.

**State** is internal data managed by the component. Updating state triggers a re-render.

```jsx
function Counter({ initialCount, label }) {
  // Props: initialCount, label (read-only, from parent)
  // State: count (internal, managed by this component)
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <span>{label}: {count}</span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

**State update rules:**
1. State updates are asynchronous (batched in React 18+)
2. Use the updater function form when new state depends on previous state
3. State is immutable -- always create new objects/arrays

```jsx
// WRONG: Mutating state
const handleAdd = (item) => {
  items.push(item);        // Mutation!
  setItems(items);          // Same reference -- React won't re-render
};

// CORRECT: Immutable update
const handleAdd = (item) => {
  setItems(prev => [...prev, item]);
};

// CORRECT: Immutable object update
const handleUpdate = (field, value) => {
  setUser(prev => ({ ...prev, [field]: value }));
};
```

### useState

```jsx
// Basic usage
const [count, setCount] = useState(0);

// Lazy initialization (runs only on first render)
const [data, setData] = useState(() => {
  return JSON.parse(localStorage.getItem('data'));
});

// Updater function (when new state depends on previous)
setCount(prev => prev + 1);

// Direct value (when new state is independent)
setCount(42);
```

### useEffect

Synchronizes a component with an external system (API calls, subscriptions, DOM manipulation).

```jsx
useEffect(() => {
  // Setup: runs after render
  const subscription = api.subscribe(channel, handleMessage);

  // Cleanup: runs before next effect and on unmount
  return () => {
    subscription.unsubscribe();
  };
}, [channel, handleMessage]); // Dependency array
```

**Dependency array behavior:**

| Pattern | Runs when |
|---------|-----------|
| `useEffect(fn)` | After every render |
| `useEffect(fn, [])` | Only after first render (mount) |
| `useEffect(fn, [a, b])` | After render if `a` or `b` changed |

**Common mistakes:**
- Missing dependencies (stale closures)
- Unnecessary dependencies that cause infinite loops
- Using `useEffect` for derived state (use `useMemo` instead)
- Data fetching without cleanup (race conditions)

```jsx
// Race condition: what if userId changes before fetch completes?
useEffect(() => {
  let cancelled = false;

  async function fetchUser() {
    const response = await fetch(`/api/users/${userId}`);
    const data = await response.json();
    if (!cancelled) {
      setUser(data);
    }
  }

  fetchUser();
  return () => { cancelled = true; };
}, [userId]);
```

### useRef

Holds a mutable value that persists across renders **without** causing re-renders when changed.

```jsx
// DOM reference
function TextInput() {
  const inputRef = useRef(null);

  const focusInput = () => {
    inputRef.current.focus();
  };

  return <input ref={inputRef} />;
}

// Mutable value that doesn't trigger re-render
function Timer() {
  const intervalRef = useRef(null);

  const startTimer = () => {
    intervalRef.current = setInterval(() => {
      // tick
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(intervalRef.current);
  };

  return (/* ... */);
}

// Tracking previous value
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
```

### useMemo and useCallback

**`useMemo`** -- memoizes a computed value:

```jsx
const sortedItems = useMemo(() => {
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}, [items]);
```

**`useCallback`** -- memoizes a function reference:

```jsx
const handleClick = useCallback((id) => {
  setItems(prev => prev.filter(item => item.id !== id));
}, []);
```

**When to use them:**
- `useMemo`: Expensive computations, referential equality for objects/arrays passed as props
- `useCallback`: Functions passed to memoized children (`React.memo`), functions in dependency arrays

**When NOT to use them:**
- Simple calculations (the overhead of memoization exceeds the savings)
- Values/functions not passed to children or used in dependency arrays
- Premature optimization without measured performance issues

### Custom Hooks

Extract reusable stateful logic into functions prefixed with `use`:

```jsx
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    setStoredValue(prev => {
      const valueToStore = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue];
}

// Usage
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>;
}
```

**Rules of hooks:**
1. Only call hooks at the top level (no conditionals, loops, nested functions)
2. Only call hooks from React function components or custom hooks
3. Custom hooks must start with `use`

### Controlled vs Uncontrolled Components

**Controlled:** React state drives the form element's value.

```jsx
function ControlledInput() {
  const [value, setValue] = useState('');

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
```

**Uncontrolled:** The DOM holds the state; React reads it when needed.

```jsx
function UncontrolledInput() {
  const inputRef = useRef(null);

  const handleSubmit = () => {
    console.log(inputRef.current.value);
  };

  return <input ref={inputRef} defaultValue="initial" />;
}
```

| Aspect | Controlled | Uncontrolled |
|--------|-----------|-------------|
| State location | React state | DOM |
| Value access | `value` state variable | `ref.current.value` |
| Validation | On every change | On submit |
| Dynamic inputs | Easy | Harder |
| Performance | More re-renders | Fewer re-renders |
| Use case | Most forms | File inputs, simple forms |

### Keys and Reconciliation

React uses keys to match children across renders. Keys tell React which elements are the same, added, or removed.

```jsx
// GOOD: Stable, unique key
{items.map(item => (
  <ListItem key={item.id} data={item} />
))}

// BAD: Array index as key (breaks on reorder, insert, delete)
{items.map((item, index) => (
  <ListItem key={index} data={item} />
))}
```

**When index keys cause bugs:**
- User types into an input field in the second item
- First item is deleted
- React thinks the second item (now at index 0) is the first item
- The input state from the old second item sticks to the wrong element

**Key as a reset mechanism:**

```jsx
// Changing the key forces React to destroy and recreate the component
<UserProfile key={userId} userId={userId} />
```

### React.memo

Prevents re-rendering when props haven't changed (shallow comparison):

```jsx
const ExpensiveList = React.memo(function ExpensiveList({ items, onItemClick }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} onClick={() => onItemClick(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  );
});

// Custom comparison function
const MemoizedComponent = React.memo(Component, (prevProps, nextProps) => {
  // Return true if props are equal (skip re-render)
  // Return false to re-render
  return prevProps.id === nextProps.id;
});
```

**Important:** `React.memo` only prevents re-renders from parent. If the component uses `useState`, `useContext`, or other hooks that change, it will still re-render.

### Context API

Share data through the component tree without prop drilling:

```jsx
const ThemeContext = React.createContext('light');

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  const value = useMemo(() => ({
    theme,
    toggleTheme: () => setTheme(t => t === 'light' ? 'dark' : 'light'),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

function ThemedButton() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}
```

**Performance caveat:** All consumers re-render when the context value changes. Split contexts by update frequency. Use `useMemo` on the provider value to prevent unnecessary updates.

### Error Boundaries

Catch JavaScript errors in the component tree and display a fallback UI. Currently only available as class components:

```jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
    // Report to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<ErrorPage />}>
  <App />
</ErrorBoundary>
```

**Limitations:** Error boundaries do NOT catch errors in:
- Event handlers (use try/catch)
- Asynchronous code (promises, setTimeout)
- Server-side rendering
- Errors thrown in the error boundary itself

### Portals

Render children into a different DOM node, outside the parent component's DOM hierarchy:

```jsx
import { createPortal } from 'react-dom';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.getElementById('modal-root')
  );
}
```

**Key behavior:** Even though the DOM node is outside the parent, React events still bubble through the React tree (not the DOM tree). A click inside a portal will bubble to the portal's React parent.

---

## Common Interview Questions

### Q1: Explain the React rendering process.

**Answer:** React rendering has two phases:

1. **Render phase** -- React calls your component functions to produce a virtual DOM tree. It then diffs the new tree against the previous tree (reconciliation) to determine the minimum set of DOM changes needed. This phase is pure and has no side effects.

2. **Commit phase** -- React applies the calculated changes to the actual DOM. After DOM updates, it runs layout effects (`useLayoutEffect`), then regular effects (`useEffect`). This phase can have side effects.

A re-render is triggered by: `setState`, parent re-render, context value change, or `forceUpdate` (class components). React 18 automatically batches multiple state updates into a single render, even inside promises and timeouts.

### Q2: Why shouldn't you call hooks inside conditions or loops?

**Answer:** React tracks hooks by their call order. On each render, React expects the same hooks to be called in the same order. If you put a hook inside a condition, the call order changes between renders, causing React to associate the wrong state with the wrong hook.

```jsx
// BROKEN: Hook order changes between renders
function Component({ showExtra }) {
  const [name, setName] = useState('');
  if (showExtra) {
    const [extra, setExtra] = useState('');  // Sometimes 2nd, sometimes missing
  }
  const [count, setCount] = useState(0);     // Sometimes 2nd, sometimes 3rd
}
```

React maintains an internal array of hook values, accessed by index. Changing the order corrupts state associations.

### Q3: How does the dependency array in useEffect work?

**Answer:** React compares each value in the current dependency array with the corresponding value from the previous render using `Object.is` (similar to `===` but handles `NaN` and `-0`). If any value has changed, the effect runs again.

For primitive values (strings, numbers, booleans), this works intuitively. For objects, arrays, and functions, it compares by reference. A new object `{}` is not equal to a previous `{}` even if contents are identical. This is why you should:

- Use primitives in dependency arrays when possible
- Memoize objects/arrays with `useMemo` if they need to be dependencies
- Memoize functions with `useCallback`
- Extract values from objects: `[user.id]` instead of `[user]`

### Q4: What is the difference between `useEffect` and `useLayoutEffect`?

**Answer:** Both run after render, but at different times:

- **`useEffect`** runs asynchronously *after* the browser has painted. The user sees the updated UI, then the effect runs. This is the correct choice for data fetching, subscriptions, and most side effects.

- **`useLayoutEffect`** runs synchronously *after* DOM mutations but *before* the browser paints. The user never sees the intermediate state. Use this for DOM measurements or when you need to adjust the DOM before the user sees it (e.g., tooltip positioning, scroll restoration).

Using `useLayoutEffect` for non-DOM-measurement effects blocks the paint and can cause visible jank.

### Q5: How would you optimize a component that re-renders too often?

**Answer:** Follow this diagnostic approach:

1. **Identify the cause** using React DevTools Profiler to see what triggered each render
2. **Check if the parent is re-rendering unnecessarily** -- fix the parent first
3. **Memoize the component** with `React.memo` if it receives the same props often
4. **Stabilize prop references** with `useMemo`/`useCallback` for objects and functions passed as props
5. **Split context** so that components only subscribe to the data they need
6. **Move state down** closer to where it's used (colocate state)
7. **Lift content up** with the children pattern to avoid re-rendering static subtrees

```jsx
// Before: App re-renders everything on theme change
function App() {
  const [theme, setTheme] = useState('light');
  return (
    <div className={theme}>
      <Header />        {/* Re-renders unnecessarily */}
      <ExpensiveTree />  {/* Re-renders unnecessarily */}
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        Toggle
      </button>
    </div>
  );
}

// After: Lift content up -- children don't re-render
function ThemeWrapper({ children }) {
  const [theme, setTheme] = useState('light');
  return (
    <div className={theme}>
      {children}         {/* Same reference, no re-render */}
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        Toggle
      </button>
    </div>
  );
}

function App() {
  return (
    <ThemeWrapper>
      <Header />
      <ExpensiveTree />
    </ThemeWrapper>
  );
}
```

### Q6: Explain controlled vs uncontrolled components. When would you use each?

**Answer:** In controlled components, React state is the single source of truth for form values. Every keystroke calls `onChange`, updates state, and the input reflects the state. This gives you full control: instant validation, conditional disabling, formatted input, and synchronized state.

In uncontrolled components, the DOM manages the value internally. You read the value via `ref` when needed (usually on submit). This is simpler but gives less control.

Use controlled components for most forms. Use uncontrolled components for file inputs (which must be uncontrolled), integrating with non-React code, and very simple forms where you only need the value on submit.

### Q7: What problems does the Context API solve, and what are its limitations?

**Answer:** Context solves prop drilling -- passing data through many intermediate components that don't use it. Common use cases: theme, locale, authentication state, and feature flags.

Limitations:
- **Every consumer re-renders** when the context value changes, regardless of which part of the value they use
- **Not a state management solution** -- it provides dependency injection, not optimized state distribution
- **Performance at scale** -- for frequently changing values (mouse position, scroll), context causes excessive re-renders. Use a state management library (Zustand, Jotai) or `useSyncExternalStore` instead
- **No selector support** -- you cannot subscribe to a subset of context (unlike Redux selectors)

Mitigation: Split context by update frequency. Put static data (config) in one context and dynamic data (user actions) in another.

---

## Code Examples

### Custom Hook: useDebounce

```jsx
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function SearchBar() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      fetchResults(debouncedQuery);
    }
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

### Custom Hook: useFetch

```jsx
function useFetch(url) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });

    return () => { cancelled = true; };
  }, [url]);

  return state;
}
```

### Compound Pattern: Accordion

```jsx
const AccordionContext = React.createContext(null);

function Accordion({ children, allowMultiple = false }) {
  const [openItems, setOpenItems] = useState(new Set());

  const toggle = useCallback((id) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  }, [allowMultiple]);

  const value = useMemo(() => ({ openItems, toggle }), [openItems, toggle]);

  return (
    <AccordionContext.Provider value={value}>
      <div role="region">{children}</div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ id, title, children }) {
  const { openItems, toggle } = useContext(AccordionContext);
  const isOpen = openItems.has(id);

  return (
    <div>
      <button onClick={() => toggle(id)} aria-expanded={isOpen}>
        {title}
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

Accordion.Item = AccordionItem;
```

---

## Gotchas & Edge Cases

1. **State updates are batched.** In React 18+, all state updates are batched (including those inside promises, timeouts, and native event handlers). If you call `setA(1)` and `setB(2)`, React renders once, not twice.

2. **`useState` initial value is only used on mount.** Changing the `initialCount` prop does not reset the state. Use the `key` prop to force remounting.

3. **Stale closures.** Event handlers and effects capture the state at the time they were created. If you use a stale closure, you see old values. Use the updater form `setState(prev => ...)` or refs.

4. **`useEffect` runs after paint.** If you need to measure DOM before paint, use `useLayoutEffect`. But don't overuse it -- it blocks the browser.

5. **Object/array state must be replaced, not mutated.** `setItems(items.push(x))` mutates the array and sets state to the return value of push (a number). Always create new references.

6. **`React.memo` uses shallow comparison.** Passing `style={{ color: 'red' }}` inline creates a new object every render, defeating memoization.

7. **Context re-renders all consumers.** Wrap the provider value in `useMemo` to avoid unnecessary re-renders caused by parent re-rendering.

8. **Effects run twice in StrictMode (development only).** React intentionally double-invokes effects to help you find missing cleanup functions. This does not happen in production.

9. **`e.target` vs `e.currentTarget` in event handlers.** `e.target` is the actual clicked element. `e.currentTarget` is the element the handler is attached to. In delegation patterns, always use `e.target` with `.closest()`.

10. **Portals preserve React tree context.** Events from a portal bubble through the React component tree, not the DOM tree. Context and event handlers from ancestors of the portal component work as expected.

---

## Quick Reference

| Hook | Purpose | Triggers Re-render |
|------|---------|-------------------|
| `useState` | Local component state | Yes |
| `useEffect` | Side effects after render | No (but may call setState) |
| `useLayoutEffect` | Side effects before paint | No (but may call setState) |
| `useRef` | Mutable value / DOM reference | No |
| `useMemo` | Memoize computed value | No |
| `useCallback` | Memoize function reference | No |
| `useContext` | Read context value | Yes (when context changes) |
| `useReducer` | Complex state logic | Yes |
| `useId` | Generate unique IDs for SSR | No |

| Pattern | When to Use |
|---------|-------------|
| Controlled component | Forms needing real-time validation or formatting |
| Uncontrolled component | File inputs, simple forms, integrating non-React code |
| Custom hook | Reusable stateful logic across components |
| Context | Theme, auth, locale -- data many components need |
| React.memo | Expensive children that receive stable props |
| Key prop reset | Force component to remount and reset state |
| Children prop | Avoid re-rendering static content when parent state changes |
| Error boundary | Graceful error handling in component subtrees |
| Portal | Modals, tooltips, toasts that need to escape parent overflow/z-index |

| Optimization | Technique |
|-------------|-----------|
| Avoid unnecessary renders | `React.memo`, `useMemo`, `useCallback` |
| Colocate state | Move state closer to where it's used |
| Split context | Separate fast-changing and slow-changing data |
| Virtualize lists | Use `react-window` or `@tanstack/virtual` |
| Lazy load components | `React.lazy` + `Suspense` |
| Debounce inputs | `useDebounce` custom hook |
| Avoid inline objects | Define outside render or memoize |
