# React Advanced Patterns

## Overview

Senior frontend interviews go beyond hooks and state management. You are expected to understand React's architecture -- how concurrent rendering works, why Server Components exist, and when to reach for advanced composition patterns. This guide covers React 18 and 19 features, the Server Component model, streaming SSR, the React Compiler, and design patterns that scale for complex applications.

---

## Core Concepts

### Concurrent Rendering (React 18+)

Before React 18, rendering was synchronous: once React started rendering, nothing could interrupt it. Long renders blocked the main thread, causing unresponsive UIs.

Concurrent rendering lets React **pause, abort, and resume** rendering work. It can prepare multiple versions of the UI simultaneously and commit the best one. This is not a feature you "turn on" -- it is an internal capability that specific APIs leverage.

**Key mental model:** In concurrent React, rendering is not the same as committing. React may render a component but decide not to commit the result (e.g., if newer data arrives).

### useTransition

Marks a state update as non-urgent, allowing React to keep the current UI responsive while rendering the new state in the background:

```jsx
function SearchResults() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e) => {
    // Urgent: update the input immediately
    setQuery(e.target.value);

    // Non-urgent: update results in the background
    startTransition(() => {
      setResults(filterLargeDataset(e.target.value));
    });
  };

  return (
    <div>
      <input value={query} onChange={handleChange} />
      {isPending && <Spinner />}
      <ResultList results={results} />
    </div>
  );
}
```

**How it works:** React renders the transition update at lower priority. If the user types again before the transition completes, React abandons the stale render and starts a new one. The UI stays responsive because the input update is never blocked.

### useDeferredValue

Defers updating a value until the browser has time. Similar to `useTransition` but works on values rather than state setters:

```jsx
function SearchPage({ query }) {
  // deferredQuery lags behind query during heavy renders
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      <ExpensiveResults query={deferredQuery} />
    </div>
  );
}
```

**When to use which:**

- `useTransition`: When you control the state update (e.g., inside an event handler)
- `useDeferredValue`: When you receive a value from above (props) and want to defer its downstream effects

### Suspense

Declaratively handles loading states for asynchronous operations:

```jsx
function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UserProfile />
    </Suspense>
  );
}

// UserProfile suspends while data is loading
function UserProfile() {
  const user = use(fetchUser()); // React 19 `use` API
  return <h1>{user.name}</h1>;
}
```

**Suspense capabilities by React version:**

| Feature                     | React 16 | React 18       | React 19        |
| --------------------------- | -------- | -------------- | --------------- |
| `React.lazy` code splitting | Yes      | Yes            | Yes             |
| Data fetching               | No       | Framework-only | Yes (`use` API) |
| Streaming SSR               | No       | Yes            | Yes             |
| Nested Suspense boundaries  | Partial  | Yes            | Yes             |
| SuspenseList                | No       | Experimental   | In progress     |

**Suspense boundaries** can be nested. Each boundary catches the nearest suspended child. This enables granular loading states:

```jsx
<Suspense fallback={<PageSkeleton />}>
  <Header />
  <Suspense fallback={<SidebarSkeleton />}>
    <Sidebar />
  </Suspense>
  <Suspense fallback={<ContentSkeleton />}>
    <MainContent />
  </Suspense>
</Suspense>
```

### React.lazy and Code Splitting

```jsx
const AdminPanel = React.lazy(() => import('./AdminPanel'));

function App({ isAdmin }) {
  return (
    <div>
      <MainContent />
      {isAdmin && (
        <Suspense fallback={<Loading />}>
          <AdminPanel />
        </Suspense>
      )}
    </div>
  );
}
```

**Route-based splitting (most common):**

```jsx
const Home = React.lazy(() => import('./pages/Home'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Server Components (RSC)

React Server Components render on the server and send a serialized component tree to the client. They never hydrate or re-render on the client.

```jsx
// ServerComponent.jsx -- runs on the server only
// Can directly access databases, file systems, secrets
async function ProductPage({ id }) {
  const product = await db.products.findById(id);
  const reviews = await db.reviews.findByProductId(id);

  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <AddToCartButton productId={id} /> {/* Client Component */}
      <ReviewList reviews={reviews} /> {/* Server Component */}
    </div>
  );
}
```

```jsx
// AddToCartButton.jsx -- Client Component
'use client';

import { useState } from 'react';

export default function AddToCartButton({ productId }) {
  const [added, setAdded] = useState(false);

  return (
    <button onClick={() => setAdded(true)}>
      {added ? 'Added' : 'Add to Cart'}
    </button>
  );
}
```

**Server vs Client Components:**

| Aspect         | Server Component                 | Client Component          |
| -------------- | -------------------------------- | ------------------------- |
| Directive      | Default (no directive)           | `'use client'` at top     |
| Runs on        | Server only                      | Server (SSR) + Client     |
| Bundle impact  | Zero JS sent to client           | Included in client bundle |
| State/hooks    | No `useState`, `useEffect`, etc. | Full hook support         |
| Event handlers | No `onClick`, etc.               | Full interactivity        |
| Data access    | Direct DB, file system, APIs     | Fetch from client         |
| Re-rendering   | Never                            | On state/prop changes     |

**Composition rules:**

- Server Components can import Client Components
- Client Components cannot import Server Components directly
- Client Components can receive Server Components as `children` props

```jsx
// VALID: Server Component renders Client Component
function ServerParent() {
  return <ClientChild data={serverData} />;
}

// VALID: Client Component receives Server Component as children
('use client');
function ClientLayout({ children }) {
  const [theme, setTheme] = useState('light');
  return <div className={theme}>{children}</div>;
}

// Server usage:
<ClientLayout>
  <ServerComponent /> {/* Passed as children prop */}
</ClientLayout>;
```

### Streaming SSR

React 18 introduced streaming server-side rendering with `renderToPipeableStream`:

```javascript
// server.js
import { renderToPipeableStream } from 'react-dom/server';

app.get('*', (req, res) => {
  const { pipe } = renderToPipeableStream(<App />, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      // Shell (everything outside Suspense) is ready
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
    onShellError(error) {
      res.statusCode = 500;
      res.send('<h1>Server Error</h1>');
    },
  });
});
```

**How streaming works:**

1. Server renders the shell (non-suspended content) immediately
2. Browser starts parsing and displaying the shell
3. Server continues rendering Suspense boundaries in parallel
4. As each boundary resolves, server streams the HTML + an inline script
5. The script replaces the fallback with the real content
6. Hydration proceeds incrementally

**Benefits:** Faster Time to First Byte (TTFB), progressive rendering, no waterfalls.

### React Server Actions (React 19)

Server Actions allow Client Components to call server-side functions directly:

```jsx
// actions.js
'use server';

export async function addToCart(productId) {
  const session = await getSession();
  await db.cart.add({ userId: session.userId, productId });
  revalidatePath('/cart');
}

export async function updateProfile(formData) {
  const name = formData.get('name');
  const email = formData.get('email');
  await db.users.update(session.userId, { name, email });
  redirect('/profile');
}
```

```jsx
// ClientForm.jsx
'use client';

import { updateProfile } from './actions';
import { useActionState } from 'react';

export default function ProfileForm() {
  const [state, formAction, isPending] = useActionState(updateProfile, null);

  return (
    <form action={formAction}>
      <input name="name" />
      <input name="email" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

**Server Actions can be:**

- Passed as `action` prop to `<form>`
- Called directly from event handlers
- Used with `useActionState` for pending/error states
- Composed with `useOptimisticState` for instant UI feedback

### React Compiler (React Forget)

The React Compiler automatically memoizes components and hooks, eliminating the need for manual `useMemo`, `useCallback`, and `React.memo`:

```jsx
// Before: Manual memoization
function TodoList({ todos, filter }) {
  const filteredTodos = useMemo(
    () => todos.filter((t) => t.status === filter),
    [todos, filter]
  );

  const handleToggle = useCallback(
    (id) => {
      dispatch({ type: 'toggle', id });
    },
    [dispatch]
  );

  return filteredTodos.map((todo) => (
    <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
  ));
}

// After: React Compiler handles memoization automatically
function TodoList({ todos, filter }) {
  const filteredTodos = todos.filter((t) => t.status === filter);

  const handleToggle = (id) => {
    dispatch({ type: 'toggle', id });
  };

  return filteredTodos.map((todo) => (
    <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
  ));
}
```

**Requirements for the compiler:**

- Code must follow the Rules of React (pure rendering, no mutation during render)
- Hooks must follow the rules of hooks
- Side effects must be in `useEffect` or event handlers

**What the compiler does:**

- Analyzes data flow at build time
- Inserts memoization only where it provides benefit
- Handles the dependency tracking automatically
- Eliminates stale closure bugs caused by incorrect dependency arrays

### Compound Components Pattern

Components share implicit state through context, providing a flexible API:

```jsx
const SelectContext = React.createContext(null);

function Select({ value, onChange, children }) {
  const contextValue = useMemo(
    () => ({
      value,
      onChange,
    }),
    [value, onChange]
  );

  return (
    <SelectContext.Provider value={contextValue}>
      <div role="listbox">{children}</div>
    </SelectContext.Provider>
  );
}

function Option({ value: optionValue, children }) {
  const { value, onChange } = useContext(SelectContext);
  const isSelected = value === optionValue;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => onChange(optionValue)}
      className={isSelected ? 'selected' : ''}
    >
      {children}
    </div>
  );
}

Select.Option = Option;

// Usage -- flexible composition
<Select value={color} onChange={setColor}>
  <Select.Option value="red">Red</Select.Option>
  <Select.Option value="blue">Blue</Select.Option>
  <Select.Option value="green">Green</Select.Option>
</Select>;
```

### Render Props Pattern

A component receives a function that returns JSX, giving the consumer control over rendering:

```jsx
function MouseTracker({ render }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMove = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return render(position);
}

// Usage
<MouseTracker
  render={({ x, y }) => (
    <div>
      Cursor: {x}, {y}
    </div>
  )}
/>;
```

**Modern alternative:** Custom hooks have largely replaced render props for logic sharing. Use render props when you need to invert control of rendering (the parent decides what to render with the data).

### Higher-Order Component (HOC) Pattern

A function that takes a component and returns an enhanced component:

```jsx
function withAuth(WrappedComponent) {
  return function AuthenticatedComponent(props) {
    const { user, isLoading } = useAuth();

    if (isLoading) return <Spinner />;
    if (!user) return <Navigate to="/login" />;

    return <WrappedComponent {...props} user={user} />;
  };
}

const ProtectedDashboard = withAuth(Dashboard);
```

**Modern alternative:** Custom hooks are preferred over HOCs. HOCs add wrapper elements, make debugging harder (wrapper hell), and have prop collision issues. Use HOCs primarily for cross-cutting concerns in legacy codebases.

---

## Common Interview Questions

### Q1: Explain the difference between Server Components and SSR.

**Answer:** SSR and Server Components solve different problems.

**SSR** renders the full component tree to HTML on the server, then sends it to the client. The client downloads all the JavaScript, parses it, and hydrates the HTML to make it interactive. The JavaScript bundle contains every component. SSR improves initial load time (you see content faster), but the Time to Interactive depends on the full bundle download.

**Server Components** render on the server and send a serialized description (not HTML) to the client. Their JavaScript is _never_ sent to the client. Only Client Components (marked with `'use client'`) are included in the bundle. This fundamentally reduces bundle size. Server Components can also access server-side resources directly (databases, file systems).

They complement each other: a Server Component tree is SSR'd on initial page load, and subsequent navigations send the serialized RSC payload for client-side rendering.

### Q2: When would you use `useTransition` vs `useDeferredValue`?

**Answer:** Both enable concurrent rendering for non-urgent updates, but they differ in where you apply them.

Use **`useTransition`** when you own the state update. You wrap the state setter in `startTransition()` to tell React this update is non-urgent. You also get an `isPending` flag to show loading indicators.

Use **`useDeferredValue`** when you receive a value from outside (via props or a parent component) and cannot control how it's updated. React will return a deferred version that lags behind during heavy renders. You compare the deferred value with the original to detect staleness.

Practical example: For a search input that filters a large list, use `useTransition` if the filter state is local. Use `useDeferredValue` if the search query comes from a URL parameter or parent component.

### Q3: How does Suspense work with data fetching?

**Answer:** Suspense for data fetching relies on components "throwing" a promise during render. When React encounters a thrown promise:

1. React catches the promise and looks for the nearest `Suspense` boundary
2. The boundary displays its `fallback` UI
3. When the promise resolves, React re-renders the suspended component
4. The resolved data is available, and the real UI replaces the fallback

In React 19, the `use` API provides a first-class way to consume promises in components:

```jsx
function UserProfile({ userPromise }) {
  const user = use(userPromise); // Suspends if promise is pending
  return <h1>{user.name}</h1>;
}
```

Important nuances:

- You should not create promises during render (this causes infinite loops). Pass them from a parent, route loader, or cache.
- Frameworks like Next.js integrate Suspense with their data fetching mechanisms.
- Error handling works via Error Boundaries wrapping the Suspense boundary.

### Q4: What is the React Compiler and how does it change development?

**Answer:** The React Compiler (formerly React Forget) is a build-time tool that automatically adds memoization to your components. It analyzes the data flow of your components and inserts the equivalent of `useMemo`, `useCallback`, and `React.memo` where beneficial.

For developers, this means:

- No more manually writing `useMemo`/`useCallback`
- No more stale closure bugs from incorrect dependency arrays
- Simpler, more readable code
- Automatic optimization of re-renders

The compiler requires that your code follows the Rules of React: components must be pure during render, no mutation of external values during render, and hooks must follow the rules of hooks. Code that breaks these rules will not compile correctly.

It ships as a Babel/SWC plugin and can be adopted incrementally (per file or per directory). Instagram has been running it in production since 2023.

### Q5: Compare compound components, render props, and HOC patterns.

**Answer:**

**Compound components** provide a flexible API through implicit shared state (context). They work well for UI primitives like tabs, selects, and accordions where the consumer controls the layout but the component manages the state. Pro: clean JSX, flexible composition. Con: requires context setup, harder to type in TypeScript.

**Render props** invert control by letting the consumer decide what to render with the provided data. They are explicit about data flow and compose well. Pro: explicit, composable. Con: callback nesting ("callback hell"), harder to read. Largely replaced by custom hooks.

**HOCs** wrap components to add behavior. They work for cross-cutting concerns (auth, logging, theming). Pro: reusable, transparent to the wrapped component. Con: prop collisions, wrapper hell, unclear data origin, hard to debug. Largely replaced by custom hooks.

**Modern preference:** Custom hooks for logic sharing, compound components for flexible UI APIs. Use render props when a consumer needs to control rendering. Avoid HOCs in new code.

### Q6: How does streaming SSR improve performance?

**Answer:** Traditional SSR blocks on the slowest data source. If one API call takes 3 seconds, the entire page waits 3 seconds. The user sees nothing until everything is ready.

Streaming SSR with React 18 breaks this bottleneck:

1. **Shell-first rendering:** The server sends the HTML shell (header, layout, navigation) immediately. The user sees a meaningful page within milliseconds.
2. **Progressive content:** Each Suspense boundary resolves independently. Fast data appears instantly; slow data shows a fallback that fills in later.
3. **Selective hydration:** React hydrates components as their JavaScript loads, prioritizing components the user interacts with.
4. **No waterfall:** Data fetching for different Suspense boundaries runs in parallel on the server.

This improves TTFB, First Contentful Paint, and perceived performance without sacrificing interactivity.

### Q7: What are the rules for mixing Server and Client Components?

**Answer:** The core rule is the **serialization boundary**: Server Components can pass data to Client Components, but only serializable data (strings, numbers, booleans, arrays, plain objects, Dates, Maps, Sets, and JSX elements/Server Components as children).

You cannot pass:

- Functions (except Server Actions)
- Class instances
- DOM nodes
- Symbols (except well-known ones)

**Composition rules:**

1. Server Components can render Client Components (import and use them normally)
2. Client Components cannot import Server Components directly
3. Client Components can accept Server Components as `children` or other JSX props
4. The `'use client'` directive creates a boundary -- everything imported by a Client Component becomes part of the client bundle
5. Server Actions (`'use server'`) can be passed from Server Components to Client Components as props

```jsx
// Pattern: Server Component passes Server-rendered content to Client layout
async function Page() {
  const data = await fetchData();
  return (
    <ClientTabs>
      {/* These Server Components are serialized and passed as children */}
      <TabPanel label="Overview">
        <Overview data={data} />
      </TabPanel>
      <TabPanel label="Details">
        <Details data={data} />
      </TabPanel>
    </ClientTabs>
  );
}
```

---

## Code Examples

### Optimistic UI with Server Actions

```jsx
'use client';

import { useOptimistic } from 'react';
import { addComment } from './actions';

function CommentList({ comments }) {
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (state, newComment) => [...state, { ...newComment, pending: true }]
  );

  async function handleSubmit(formData) {
    const text = formData.get('text');
    const optimistic = {
      id: crypto.randomUUID(),
      text,
      author: 'You',
      pending: true,
    };
    addOptimisticComment(optimistic);
    await addComment(formData);
  }

  return (
    <div>
      <ul>
        {optimisticComments.map((comment) => (
          <li key={comment.id} style={{ opacity: comment.pending ? 0.6 : 1 }}>
            <strong>{comment.author}</strong>: {comment.text}
          </li>
        ))}
      </ul>
      <form action={handleSubmit}>
        <input name="text" required />
        <button type="submit">Add Comment</button>
      </form>
    </div>
  );
}
```

### Suspense with Error Handling

```jsx
import { Suspense } from 'react';

function DataSection({ dataPromise }) {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}

function DataDisplay({ dataPromise }) {
  const data = use(dataPromise);

  return (
    <ul>
      {data.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

### Transition with Search

```jsx
function FilterableList({ items }) {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const [filteredItems, setFilteredItems] = useState(items);

  const handleSearch = (e) => {
    const value = e.target.value;
    setQuery(value);

    startTransition(() => {
      const result = items.filter(
        (item) =>
          item.name.toLowerCase().includes(value.toLowerCase()) ||
          item.description.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredItems(result);
    });
  };

  return (
    <div>
      <input value={query} onChange={handleSearch} placeholder="Search..." />
      <div style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s' }}>
        {filteredItems.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
```

### Compound Tabs Component

```jsx
const TabsContext = React.createContext(null);

function Tabs({ defaultValue, children }) {
  const [activeTab, setActiveTab] = useState(defaultValue);

  const contextValue = useMemo(
    () => ({
      activeTab,
      setActiveTab,
    }),
    [activeTab]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div>{children}</div>
    </TabsContext.Provider>
  );
}

function TabList({ children }) {
  return <div role="tablist">{children}</div>;
}

function Tab({ value, children }) {
  const { activeTab, setActiveTab } = useContext(TabsContext);

  return (
    <button
      role="tab"
      aria-selected={activeTab === value}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }) {
  const { activeTab } = useContext(TabsContext);
  if (activeTab !== value) return null;

  return <div role="tabpanel">{children}</div>;
}

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Tab value="overview">Overview</Tabs.Tab>
    <Tabs.Tab value="details">Details</Tabs.Tab>
    <Tabs.Tab value="reviews">Reviews</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="overview">
    <Overview />
  </Tabs.Panel>
  <Tabs.Panel value="details">
    <Details />
  </Tabs.Panel>
  <Tabs.Panel value="reviews">
    <Reviews />
  </Tabs.Panel>
</Tabs>;
```

---

## Gotchas & Edge Cases

1. **`startTransition` does not delay the update.** It marks the update as non-urgent, allowing React to interrupt it. If there is no other work, the transition renders immediately.

2. **Server Components cannot use hooks or browser APIs.** No `useState`, `useEffect`, `window`, `document`. If you need interactivity, extract a Client Component.

3. **`'use client'` is a boundary, not a location directive.** It does not mean "only runs on the client." Client Components still SSR. The directive means "this and its imports are included in the client bundle."

4. **Suspense fallbacks flash on fast networks.** Use `startTransition` or minimum display times to prevent jarring flicker.

5. **Server Actions are not the same as API routes.** Server Actions are tightly integrated with React's rendering model -- they can trigger revalidation and work with `useActionState`. API routes are standalone endpoints.

6. **The React Compiler cannot fix impure code.** If your component reads from a mutable global variable during render, the compiler will produce incorrect memoization. Follow the Rules of React strictly.

7. **Lazy components must be wrapped in Suspense.** `React.lazy` without a `Suspense` boundary will throw an error.

8. **Streaming SSR requires a Suspense boundary.** Without Suspense, streaming has nothing to defer -- the server blocks on the full tree.

9. **Context in Server Components.** React context (`createContext`/`useContext`) does not work in Server Components. For server-side data sharing, use module scope, function parameters, or framework-specific patterns (Next.js caching).

10. **HOCs don't forward refs by default.** Use `React.forwardRef` inside the HOC, or use the `ref` prop directly in React 19 (refs as regular props).

---

## Quick Reference

| React 18 Feature    | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| Automatic batching  | Batch state updates everywhere (promises, timeouts)   |
| `useTransition`     | Mark state updates as non-urgent                      |
| `useDeferredValue`  | Defer a value during heavy renders                    |
| `Suspense` for SSR  | Streaming server rendering                            |
| Selective hydration | Hydrate components based on user interaction priority |
| `useId`             | Generate stable unique IDs for SSR                    |

| React 19 Feature  | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `use` API         | Read promises and context in render                     |
| Server Actions    | Call server functions from Client Components            |
| `useActionState`  | Track form action state (pending, error)                |
| `useOptimistic`   | Optimistic UI updates during async actions              |
| React Compiler    | Automatic memoization at build time                     |
| `ref` as prop     | No more `forwardRef` wrapper needed                     |
| Document metadata | `<title>`, `<meta>` in components (hoisted to `<head>`) |

| Pattern             | Use Case                               | Modern Alternative       |
| ------------------- | -------------------------------------- | ------------------------ |
| Compound components | Flexible UI primitives (tabs, selects) | Still preferred          |
| Render props        | Consumer-controlled rendering          | Custom hooks (for logic) |
| HOC                 | Cross-cutting concerns                 | Custom hooks             |
| Provider pattern    | Dependency injection                   | Context + custom hook    |
| State reducer       | Customizable component logic           | `useReducer` + context   |
| Controlled props    | Parent-managed component state         | Still preferred          |

| Server vs Client     | Server Component   | Client Component          |
| -------------------- | ------------------ | ------------------------- |
| `useState`           | No                 | Yes                       |
| `useEffect`          | No                 | Yes                       |
| `onClick`            | No                 | Yes                       |
| `async/await`        | Yes (in component) | Yes (in effects/handlers) |
| Database access      | Yes                | No (use API/action)       |
| Bundle size          | 0 KB               | Included                  |
| Re-renders           | Never              | On state/prop change      |
| Children from server | N/A                | Yes (via props)           |
