# State Management

## Overview

State management is arguably the most critical architectural decision in any frontend application. It determines how data flows through your app, how components communicate, and how your application scales over time. In interviews, you will be expected to understand not just how to use state management tools, but when and why to choose one approach over another. Poor state management leads to prop drilling nightmares, unnecessary re-renders, stale data bugs, and unmaintainable code. Mastering this topic shows interviewers you can build applications that remain performant and maintainable as they grow.

## Core Concepts

### Local vs Global State

State can be categorized by its scope and purpose:

**Local State** - Owned by a single component and not needed elsewhere.

```jsx
function SearchBar() {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={isFocused ? 'focused' : ''}
    />
  );
}
```

**Global State** - Shared across multiple components or the entire application.

Examples: authenticated user, theme preferences, shopping cart contents, notification queue.

**Server State** - Data that originates from and is owned by a remote server.

Examples: API responses, paginated lists, cached resources.

**URL State** - State encoded in the URL (query params, path params).

Examples: search filters, pagination, selected tab.

### React Context

Context provides a way to pass data through the component tree without prop drilling.

```jsx
// 1. Create the context
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

// 2. Create a provider
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () =>
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [theme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// 3. Consume the context
function Header() {
  const { theme, toggleTheme } = useContext(ThemeContext);

  return (
    <header className={theme}>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </header>
  );
}
```

**When to use Context:**

- Theme, locale, auth status (infrequently changing data)
- Dependency injection (providing services to deep components)
- Avoiding prop drilling for 3+ levels

**When to avoid Context:**

- High-frequency updates (every keystroke, animations)
- Large state objects where consumers only need a slice
- When you need middleware, devtools, or time-travel debugging

**Why?** Every component consuming a context re-renders when any part of the context value changes. There is no built-in selector mechanism.

### Redux Toolkit (RTK)

Redux Toolkit is the official, opinionated way to write Redux logic. It drastically reduces boilerplate compared to classic Redux.

**Slices** - A slice combines reducer logic and actions for a single feature:

```js
import { createSlice } from '@reduxjs/toolkit';

const todosSlice = createSlice({
  name: 'todos',
  initialState: {
    items: [],
    filter: 'all',
  },
  reducers: {
    addTodo: (state, action) => {
      // RTK uses Immer under the hood, so "mutations" are safe
      state.items.push({
        id: crypto.randomUUID(),
        text: action.payload,
        completed: false,
      });
    },
    toggleTodo: (state, action) => {
      const todo = state.items.find((t) => t.id === action.payload);
      if (todo) {
        todo.completed = !todo.completed;
      }
    },
    setFilter: (state, action) => {
      state.filter = action.payload;
    },
  },
});

export const { addTodo, toggleTodo, setFilter } = todosSlice.actions;
export default todosSlice.reducer;
```

**Thunks** - Async logic with `createAsyncThunk`:

```js
import { createAsyncThunk } from '@reduxjs/toolkit';

export const fetchTodos = createAsyncThunk(
  'todos/fetchTodos',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/todos');
      if (!response.ok) {
        throw new Error('Failed to fetch todos');
      }
      return await response.json();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Handle in the slice with extraReducers
const todosSlice = createSlice({
  name: 'todos',
  initialState: { items: [], status: 'idle', error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTodos.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchTodos.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchTodos.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});
```

**Selectors** - Derive data from the store:

```js
import { createSelector } from '@reduxjs/toolkit';

const selectTodos = (state) => state.todos.items;
const selectFilter = (state) => state.todos.filter;

// Memoized selector - only recomputes when inputs change
export const selectFilteredTodos = createSelector(
  [selectTodos, selectFilter],
  (todos, filter) => {
    switch (filter) {
      case 'completed':
        return todos.filter((t) => t.completed);
      case 'active':
        return todos.filter((t) => !t.completed);
      default:
        return todos;
    }
  }
);
```

### Zustand

Zustand is a lightweight state management library with a minimal API. No providers, no boilerplate.

```js
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useCartStore = create(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        totalItems: 0,

        addItem: (product) =>
          set((state) => {
            const existing = state.items.find((i) => i.id === product.id);
            if (existing) {
              return {
                items: state.items.map((i) =>
                  i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
                ),
                totalItems: state.totalItems + 1,
              };
            }
            return {
              items: [...state.items, { ...product, quantity: 1 }],
              totalItems: state.totalItems + 1,
            };
          }),

        removeItem: (id) =>
          set((state) => {
            const item = state.items.find((i) => i.id === id);
            return {
              items: state.items.filter((i) => i.id !== id),
              totalItems: state.totalItems - (item?.quantity ?? 0),
            };
          }),

        getTotal: () => {
          const { items } = get();
          return items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          );
        },
      }),
      { name: 'cart-storage' }
    )
  )
);

// Usage - components only re-render when their selected state changes
function CartCount() {
  const totalItems = useCartStore((state) => state.totalItems);
  return <span>{totalItems}</span>;
}
```

### Jotai (Atomic State)

Jotai takes a bottom-up approach with atoms -- minimal units of state.

```js
import { atom, useAtom } from 'jotai';

// Primitive atoms
const countAtom = atom(0);
const doubleCountAtom = atom((get) => get(countAtom) * 2); // Derived atom

// Async atom
const userAtom = atom(async () => {
  const response = await fetch('/api/user');
  return response.json();
});

// Writable derived atom
const decrementCountAtom = atom(
  (get) => get(countAtom),
  (get, set) => set(countAtom, get(countAtom) - 1)
);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubleCount] = useAtom(doubleCountAtom);

  return (
    <div>
      <p>Count: {count}</p>
      <p>Double: {doubleCount}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

### Server State with TanStack Query (React Query)

TanStack Query treats server data as a separate concern from client state.

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function TodoList() {
  const queryClient = useQueryClient();

  const {
    data: todos,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 min
    gcTime: 10 * 60 * 1000, // Garbage collected after 10 min
  });

  const addTodo = useMutation({
    mutationFn: async (newTodo) => {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTodo),
      });
      return res.json();
    },
    // Optimistic update
    onMutate: async (newTodo) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueryData(['todos']);
      queryClient.setQueryData(['todos'], (old) => [
        ...old,
        { ...newTodo, id: 'temp-id' },
      ]);
      return { previous };
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['todos'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

### State Normalization

Normalization prevents data duplication and simplifies updates.

```js
// BAD: Nested, duplicated data
const state = {
  posts: [
    {
      id: '1',
      title: 'Post 1',
      author: { id: 'a1', name: 'Alice' },
      comments: [
        { id: 'c1', text: 'Great!', author: { id: 'a1', name: 'Alice' } },
      ],
    },
  ],
};

// GOOD: Normalized data
const state = {
  entities: {
    users: {
      a1: { id: 'a1', name: 'Alice' },
    },
    posts: {
      1: { id: '1', title: 'Post 1', authorId: 'a1', commentIds: ['c1'] },
    },
    comments: {
      c1: { id: 'c1', text: 'Great!', authorId: 'a1', postId: '1' },
    },
  },
  ids: {
    posts: ['1'],
    comments: ['c1'],
  },
};
```

RTK provides `createEntityAdapter` for this:

```js
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';

const usersAdapter = createEntityAdapter();

const usersSlice = createSlice({
  name: 'users',
  initialState: usersAdapter.getInitialState(),
  reducers: {
    addUser: usersAdapter.addOne,
    updateUser: usersAdapter.updateOne,
    removeUser: usersAdapter.removeOne,
    setUsers: usersAdapter.setAll,
  },
});

// Generated selectors
export const {
  selectAll: selectAllUsers,
  selectById: selectUserById,
  selectIds: selectUserIds,
} = usersAdapter.getSelectors((state) => state.users);
```

## Common Interview Questions

### 1. When would you use Context vs Redux vs Zustand?

**Context** is best for low-frequency, simple state like themes, auth status, or locale. It has no external dependencies and is built into React, but it causes all consumers to re-render on any change and has no devtools or middleware.

**Redux Toolkit** is suited for large applications with complex state logic, when you need strict unidirectional data flow, time-travel debugging, or middleware for side effects. The trade-off is more boilerplate and a steeper learning curve.

**Zustand** sits in the middle. It provides a simple API with built-in selectors for granular re-renders, supports middleware (persist, devtools, immer), and requires no provider wrapping. It is excellent for medium-sized applications or when you want Redux-like capabilities with less ceremony.

### 2. What is the problem with putting everything in global state?

Global state creates tight coupling between components, makes testing harder (every test needs the full store), causes unnecessary re-renders across the component tree, and makes it difficult to reason about where state changes originate. The principle of least privilege applies: state should live as close as possible to where it is used.

### 3. Explain optimistic updates and when you would use them.

Optimistic updates immediately reflect a change in the UI before the server confirms it. If the server request fails, you roll back to the previous state. This creates a snappier user experience. Use them for low-risk operations (toggling a like, adding a comment) where the success rate is high. Avoid them for critical operations (payments, deletions) where failure has significant consequences.

### 4. How does React Query differ from Redux for managing server data?

Redux treats server data like any other state -- you manually fetch, store, update, and invalidate it. React Query is purpose-built for server state: it handles caching, background refetching, stale-while-revalidate, pagination, retry logic, and garbage collection out of the box. With React Query, you typically do not need Redux for server data at all, reducing your Redux store to only true client-side state.

### 5. What is state normalization and why does it matter?

State normalization stores each entity type in a lookup table keyed by ID, with separate arrays of IDs for ordering. This eliminates data duplication (a user appearing in multiple places), makes updates O(1) instead of requiring deep traversal, and prevents stale data bugs where one copy is updated but another is not.

### 6. How do Jotai atoms differ from Redux selectors?

Jotai atoms are bottom-up: you compose small atoms into larger derived atoms. Each component subscribes only to the atoms it reads, so re-renders are automatically scoped. Redux selectors are top-down: you extract slices from a single large store. With Redux, you need `createSelector` and `useSelector` with care to avoid unnecessary re-renders. Jotai's model is simpler for fine-grained reactivity but lacks Redux's strict action/reducer pattern for debugging complex flows.

### 7. When should you use `useReducer` instead of `useState`?

Use `useReducer` when state transitions are complex (multiple related values that change together), when the next state depends on the previous state in non-trivial ways, or when you want to centralize state logic for testing. A form with validation, a multi-step wizard, or a state machine are good candidates.

```jsx
function formReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        [action.field]: action.value,
        errors: { ...state.errors, [action.field]: null },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.field]: action.message },
      };
    case 'RESET':
      return action.initialState;
    default:
      return state;
  }
}

function useForm(initialState) {
  const [state, dispatch] = useReducer(formReducer, initialState);
  return { state, dispatch };
}
```

### 8. How would you handle authentication state in a React app?

Authentication state is a good candidate for Context + a dedicated hook. Store the user object and token in context, persist the token to localStorage or httpOnly cookies, and provide login/logout functions. For token refresh, use an Axios interceptor or a React Query mutation. Keep the auth state minimal (user ID, role, token expiry) and fetch full user profile data separately with React Query.

## Code Examples

### Custom Store with Selectors (Zustand Pattern from Scratch)

```js
function createStore(initializer) {
  let state;
  const listeners = new Set();

  const getState = () => state;

  const setState = (partial) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (!Object.is(state, nextState)) {
      state = { ...state, ...nextState };
      listeners.forEach((listener) => listener(state));
    }
  };

  state = initializer(setState, getState);

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

// React hook with selector
function useStore(store, selector) {
  return useSyncExternalStore(store.subscribe, () =>
    selector(store.getState())
  );
}
```

### Combining Client and Server State

```jsx
// Server state with React Query
function useProducts(categoryId) {
  return useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => fetchProducts(categoryId),
  });
}

// Client state with Zustand
const useUIStore = create((set) => ({
  selectedProductId: null,
  isDetailOpen: false,
  selectProduct: (id) => set({ selectedProductId: id, isDetailOpen: true }),
  closeDetail: () => set({ isDetailOpen: false }),
}));

// Component combining both
function ProductPage({ categoryId }) {
  const { data: products, isLoading } = useProducts(categoryId);
  const { selectedProductId, selectProduct, isDetailOpen, closeDetail } =
    useUIStore();

  const selectedProduct = products?.find((p) => p.id === selectedProductId);

  if (isLoading) return <Skeleton />;

  return (
    <div>
      <ProductGrid products={products} onSelect={selectProduct} />
      {isDetailOpen && selectedProduct && (
        <ProductDetail product={selectedProduct} onClose={closeDetail} />
      )}
    </div>
  );
}
```

## Gotchas & Edge Cases

1. **Context re-render trap**: Passing an object literal as a context value causes re-renders on every parent render. Always memoize with `useMemo`.

2. **Stale closures in reducers**: When using `useReducer` with async effects, the dispatch is stable but state referenced in closures may be stale. Use the functional form of state updates.

3. **Zustand selector identity**: `useStore((s) => ({ a: s.a, b: s.b }))` creates a new object every time, defeating the selector. Use `shallow` from Zustand: `useStore((s) => ({ a: s.a, b: s.b }), shallow)`.

4. **Redux Toolkit Immer gotcha**: You can either mutate state OR return a new state in a reducer, never both. Doing both is silently ignored by Immer.

5. **React Query stale data**: If `staleTime` is 0 (default), every component mount triggers a refetch. Set `staleTime` based on how frequently your data actually changes.

6. **Hydration mismatch with persisted state**: If you use Zustand `persist` middleware with SSR, the server and client initial states differ. Use the `skipHydration` option or a `useEffect` to sync.

7. **Derived state anti-pattern**: Do not store derived state (like filtered lists) in a store. Compute it on the fly with selectors or memoization. Storing it creates synchronization bugs.

8. **Prop drilling is not always bad**: For 1-2 levels, props are explicit and easy to trace. Reaching for global state too early adds complexity without benefit.

## Quick Reference

| Solution            | Bundle Size | Learning Curve | Best For                  | Re-render Control     |
| ------------------- | ----------- | -------------- | ------------------------- | --------------------- |
| useState/useReducer | 0 KB        | Low            | Local component state     | N/A                   |
| React Context       | 0 KB        | Low            | Theme, auth, locale       | Poor (all consumers)  |
| Redux Toolkit       | ~11 KB      | Medium-High    | Large apps, complex logic | Good (useSelector)    |
| Zustand             | ~1.5 KB     | Low            | Medium apps, simple API   | Excellent (selectors) |
| Jotai               | ~3 KB       | Low-Medium     | Fine-grained reactivity   | Excellent (per-atom)  |
| Recoil              | ~15 KB      | Medium         | Meta-backed, graph state  | Excellent (per-atom)  |
| TanStack Query      | ~13 KB      | Medium         | Server/async state        | Built-in (query keys) |

| Decision                            | Choose                    |
| ----------------------------------- | ------------------------- |
| Form input state                    | useState                  |
| Complex form with validation        | useReducer                |
| Theme / Auth / Locale               | Context                   |
| Shopping cart, UI preferences       | Zustand                   |
| Enterprise app with strict patterns | Redux Toolkit             |
| Fine-grained updates, many atoms    | Jotai                     |
| API data, caching, pagination       | TanStack Query            |
| Shared state across micro-frontends | Redux or custom event bus |
