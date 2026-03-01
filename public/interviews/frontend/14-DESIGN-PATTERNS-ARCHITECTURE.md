# Design Patterns & Architecture

## Overview

Design patterns and architecture questions test your ability to think beyond individual components. Interviewers want to know if you can structure applications that scale -- both in codebase size and team size. This means understanding component composition, code organization strategies, and architectural decisions like micro-frontends or monorepos. These questions often have no single "correct" answer; what matters is your ability to reason about tradeoffs and articulate why you choose a pattern for a given situation.

---

## Core Concepts

### Component Composition Patterns

Composition is React's fundamental mechanism for code reuse. Instead of inheritance hierarchies, you build complex UIs by combining small, focused components.

**Basic Composition with Children**

```jsx
function Card({ children, className }) {
  return (
    <div className={`rounded-lg shadow-md p-6 ${className}`}>
      {children}
    </div>
  );
}

function App() {
  return (
    <Card className="bg-white">
      <h2>Title</h2>
      <p>Any content can go here.</p>
    </Card>
  );
}
```

**Slot Pattern (Named Children)**

```jsx
function Layout({ header, sidebar, children }) {
  return (
    <div className="grid grid-cols-[240px_1fr] grid-rows-[60px_1fr]">
      <header className="col-span-2">{header}</header>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  );
}

function App() {
  return (
    <Layout
      header={<Navbar />}
      sidebar={<SideMenu />}
    >
      <Dashboard />
    </Layout>
  );
}
```

### Compound Components

Compound components share implicit state through React Context. The parent manages state, and children consume it. The consumer has full control over rendering order and composition.

```jsx
import { createContext, useContext, useState } from 'react';

const TabsContext = createContext(null);

function Tabs({ defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div>{children}</div>
    </TabsContext.Provider>
  );
}

function TabList({ children }) {
  return <div role="tablist" className="flex gap-2">{children}</div>;
}

function Tab({ value, children }) {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={isActive ? 'border-b-2 border-blue-500' : ''}
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

// Attach sub-components
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage -- consumer controls structure and ordering
function App() {
  return (
    <Tabs defaultTab="overview">
      <Tabs.List>
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
        <Tabs.Tab value="billing">Billing</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview"><OverviewContent /></Tabs.Panel>
      <Tabs.Panel value="settings"><SettingsContent /></Tabs.Panel>
      <Tabs.Panel value="billing"><BillingContent /></Tabs.Panel>
    </Tabs>
  );
}
```

### Render Props

A component receives a function as a prop and calls it to determine what to render. This inverts control, letting the parent decide the UI while the child manages the logic.

```jsx
function MouseTracker({ render }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMove(e) {
      setPosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return render(position);
}

// Usage
function App() {
  return (
    <MouseTracker
      render={({ x, y }) => (
        <div>
          Mouse is at ({x}, {y})
        </div>
      )}
    />
  );
}
```

Modern alternative: custom hooks achieve the same code reuse with less nesting.

```jsx
function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMove(e) {
      setPosition({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return position;
}
```

### Higher-Order Components (HOC)

A function that takes a component and returns a new component with additional behavior. HOCs were the primary reuse mechanism before hooks.

```jsx
function withAuth(WrappedComponent) {
  return function AuthenticatedComponent(props) {
    const { user, isLoading } = useAuth();

    if (isLoading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" />;

    return <WrappedComponent {...props} user={user} />;
  };
}

const ProtectedDashboard = withAuth(Dashboard);
```

**When to still use HOCs**:
- Cross-cutting concerns that wrap many unrelated components (analytics, error boundaries).
- Library integration where you need to inject props from external sources.
- When you need to modify the component tree structure (wrapping in providers).

**Problems with HOCs**:
- Prop collision: the HOC might overwrite the wrapped component's props.
- Indirection: hard to trace where props come from ("wrapper hell").
- Static methods and refs are not forwarded automatically.

### Custom Hooks Pattern

Custom hooks are the modern replacement for both render props and HOCs. They extract reusable stateful logic into functions.

```jsx
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setStoredValue = useCallback((newValue) => {
    setValue((prev) => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch (error) {
        // localStorage might be full or disabled
      }
      return resolved;
    });
  }, [key]);

  return [value, setStoredValue];
}

// Usage
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
```

### Container / Presenter Pattern

Separates data-fetching and business logic (container) from pure rendering (presenter). Also called smart/dumb components or connected/presentational.

```jsx
// Presenter: pure rendering, receives everything via props
function UserProfile({ name, email, avatarUrl, onEditClick }) {
  return (
    <div className="flex items-center gap-4">
      <img src={avatarUrl} alt={name} className="w-16 h-16 rounded-full" />
      <div>
        <h2 className="text-xl font-bold">{name}</h2>
        <p className="text-gray-600">{email}</p>
      </div>
      <button onClick={onEditClick}>Edit</button>
    </div>
  );
}

// Container: handles data fetching and state
function UserProfileContainer({ userId }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });
  const navigate = useNavigate();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <UserProfile
      name={user.name}
      email={user.email}
      avatarUrl={user.avatarUrl}
      onEditClick={() => navigate(`/users/${userId}/edit`)}
    />
  );
}
```

Modern take: with hooks, you often do not need a separate container component. The hook itself is the "container" and the component renders directly. However, the pattern is still valuable for complex components where separating concerns improves testability.

### Atomic Design

A methodology for creating design systems, organizing components in five levels:

| Level | Description | Examples |
|-------|-------------|----------|
| Atoms | Smallest UI elements | Button, Input, Label, Icon |
| Molecules | Groups of atoms | SearchBar (Input + Button), FormField (Label + Input + Error) |
| Organisms | Complex UI sections | Header (Logo + Nav + SearchBar), ProductCard |
| Templates | Page-level layouts | DashboardTemplate (defines slots for organisms) |
| Pages | Concrete instances | DashboardPage (template filled with real data) |

```
components/
  atoms/
    Button.tsx
    Input.tsx
    Badge.tsx
  molecules/
    SearchBar.tsx
    FormField.tsx
    Dropdown.tsx
  organisms/
    Header.tsx
    ProductGrid.tsx
    CheckoutForm.tsx
  templates/
    DashboardLayout.tsx
    SettingsLayout.tsx
  pages/
    DashboardPage.tsx
    SettingsPage.tsx
```

### Feature-Based File Structure

Instead of organizing by type (all components together, all hooks together), organize by feature (everything related to a feature lives together).

**Type-based (problematic at scale)**:
```
src/
  components/
    UserList.tsx
    UserProfile.tsx
    ProductCard.tsx
    ProductGrid.tsx
    CartItem.tsx
    CartSummary.tsx
  hooks/
    useUser.ts
    useProducts.ts
    useCart.ts
  services/
    userService.ts
    productService.ts
    cartService.ts
```

**Feature-based (scales with team size)**:
```
src/
  features/
    users/
      components/
        UserList.tsx
        UserProfile.tsx
      hooks/
        useUser.ts
      services/
        userService.ts
      types.ts
      index.ts          # barrel export
    products/
      components/
        ProductCard.tsx
        ProductGrid.tsx
      hooks/
        useProducts.ts
      services/
        productService.ts
      types.ts
      index.ts
    cart/
      components/
        CartItem.tsx
        CartSummary.tsx
      hooks/
        useCart.ts
      services/
        cartService.ts
      types.ts
      index.ts
  shared/
    components/
      Button.tsx
      Input.tsx
    hooks/
      useDebounce.ts
    utils/
      formatDate.ts
```

Benefits: features can be worked on independently by different teams, dependencies between features are explicit (imports cross feature boundaries), and features can be extracted into separate packages or micro-frontends.

### Barrel Exports

A barrel file (`index.ts`) re-exports everything from a module, providing a clean public API.

```typescript
// features/users/index.ts
export { UserList } from './components/UserList';
export { UserProfile } from './components/UserProfile';
export { useUser } from './hooks/useUser';
export type { User, UserRole } from './types';

// Consumer
import { UserList, useUser } from '@/features/users';
```

**Tradeoffs**:
- Pro: clean imports, encapsulation (internal files are not part of the public API).
- Con: can cause bundle size issues if tree-shaking is not configured properly (bundler may import the entire barrel). Webpack and Vite handle this well with `sideEffects: false` in package.json.

### Dependency Injection in React

React Context is the primary DI mechanism. By providing implementations through context, components remain testable and decoupled from concrete dependencies.

```jsx
// Define the interface
const AnalyticsContext = createContext(null);

// Production implementation
const prodAnalytics = {
  track(event, properties) {
    window.analytics.track(event, properties);
  },
  identify(userId, traits) {
    window.analytics.identify(userId, traits);
  },
};

// Test implementation
const mockAnalytics = {
  track: jest.fn(),
  identify: jest.fn(),
};

// Provider wraps the app
function App() {
  return (
    <AnalyticsContext.Provider value={prodAnalytics}>
      <Dashboard />
    </AnalyticsContext.Provider>
  );
}

// Consumer hook
function useAnalytics() {
  const analytics = useContext(AnalyticsContext);
  if (!analytics) {
    throw new Error('useAnalytics must be used within AnalyticsProvider');
  }
  return analytics;
}

// Component uses the abstraction, not the implementation
function ProductPage({ product }) {
  const analytics = useAnalytics();

  useEffect(() => {
    analytics.track('product_viewed', { productId: product.id });
  }, [analytics, product.id]);

  return <div>{product.name}</div>;
}

// In tests
render(
  <AnalyticsContext.Provider value={mockAnalytics}>
    <ProductPage product={testProduct} />
  </AnalyticsContext.Provider>
);
expect(mockAnalytics.track).toHaveBeenCalledWith('product_viewed', { productId: '123' });
```

### Micro-Frontends

Micro-frontends apply microservices principles to the frontend: independently developed, deployed, and owned by different teams.

**Module Federation (Webpack 5)**

Host application dynamically loads remote modules at runtime:

```javascript
// remote-app webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'remoteApp',
      filename: 'remoteEntry.js',
      exposes: {
        './ProductList': './src/components/ProductList',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
};

// host-app webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'hostApp',
      remotes: {
        remoteApp: 'remoteApp@https://remote.example.com/remoteEntry.js',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
};

// host-app usage
const RemoteProductList = React.lazy(() => import('remoteApp/ProductList'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <RemoteProductList />
    </Suspense>
  );
}
```

**single-spa**

An orchestration framework that manages multiple frontend applications (potentially different frameworks) on the same page:

```javascript
// root-config.js
import { registerApplication, start } from 'single-spa';

registerApplication({
  name: '@myorg/navbar',
  app: () => System.import('@myorg/navbar'),
  activeWhen: '/',
});

registerApplication({
  name: '@myorg/dashboard',
  app: () => System.import('@myorg/dashboard'),
  activeWhen: '/dashboard',
});

registerApplication({
  name: '@myorg/settings',
  app: () => System.import('@myorg/settings'),
  activeWhen: '/settings',
});

start();
```

| Approach | Pros | Cons |
|----------|------|------|
| Module Federation | Runtime integration, shared deps | Webpack-specific, version conflicts |
| single-spa | Framework agnostic, mature | Complex setup, global state challenges |
| iframe | Complete isolation | No shared state, performance overhead |
| Web Components | Standard-based, framework agnostic | Limited styling, Shadow DOM complexity |

### Monorepo Architecture

A single repository containing multiple packages or applications. Popular tools: Turborepo, Nx, Lerna.

```
monorepo/
  apps/
    web/                 # Next.js application
      package.json
    mobile/              # React Native application
      package.json
    admin/               # Admin dashboard
      package.json
  packages/
    ui/                  # Shared component library
      package.json
    utils/               # Shared utilities
      package.json
    config/              # Shared ESLint, TypeScript, Prettier configs
      package.json
    types/               # Shared TypeScript types
      package.json
  turbo.json             # Turborepo pipeline configuration
  package.json           # Root workspace configuration
```

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Benefits:
- Shared code without publishing to npm.
- Atomic changes across packages.
- Consistent tooling configuration.
- Dependency graph awareness (build only what changed).

Tradeoffs:
- Larger repository size.
- CI/CD complexity.
- Requires tooling investment (Turborepo, Nx).
- Team boundaries need discipline.

---

## Common Interview Questions

### Q1: When would you use compound components vs custom hooks for shared logic?

**Answer**: Use compound components when you need shared state between parent and child components that the consumer arranges flexibly -- tabs, accordions, menus, dropdowns, and form fieldsets. The compound component pattern gives consumers control over structure and rendering while the parent manages internal state. Use custom hooks when you need to share stateful logic that is independent of rendering -- data fetching, form validation, animation state, or browser API access. The key distinction: compound components share state through the component tree (Context), while custom hooks share logic without dictating UI structure.

### Q2: What are the tradeoffs of feature-based vs type-based file organization?

**Answer**: Type-based organization (grouping all components together, all hooks together) works well for small projects where navigating by file type is fast. It breaks down at scale because a single feature's code is scattered across many directories, making it hard to understand, modify, or delete a feature holistically. Feature-based organization groups everything related to a feature in one directory. It scales better because features are self-contained, team ownership is clear, and features can be extracted or deleted atomically. The tradeoff: shared code needs a separate `shared/` directory, and newcomers need to know which feature owns which code. Most production applications benefit from switching to feature-based organization once they exceed 15-20 components.

### Q3: Explain the pros and cons of micro-frontends.

**Answer**: Pros: independent deployment (team A deploys without waiting for team B), technology diversity (different frameworks for different parts), team autonomy, and isolated failures. Cons: increased complexity (shared state, routing, styling conflicts), larger bundle sizes (duplicate dependencies unless carefully shared), performance overhead (loading multiple frameworks), and challenging user experience consistency. Micro-frontends make sense when you have 4+ teams working on distinct product areas that deploy independently. They are overkill for small teams or tightly integrated UIs. Module Federation mitigates bundle duplication by sharing common dependencies at runtime.

### Q4: How do you decide between a monorepo and multiple repositories?

**Answer**: Use a monorepo when teams share significant code (UI library, utilities, types), need atomic cross-package changes, and want consistent tooling. Use multiple repos when teams are truly independent, use different tech stacks, and have minimal shared code. Monorepos reduce the overhead of publishing and versioning shared packages but require investment in build tooling (Turborepo, Nx) and CI optimization (affected-only builds). Multiple repos have simpler CI per project but introduce dependency versioning challenges and make cross-cutting changes require synchronized PRs.

### Q5: What is the role of barrel exports and when do they cause problems?

**Answer**: Barrel exports (re-exporting from `index.ts`) provide a clean public API for a module, hiding internal implementation details. They enable refactoring internal file structure without changing consumer imports. Problems arise when tree-shaking fails: importing one function from a barrel can pull in the entire module if the bundler cannot determine side effects. This is especially problematic with CSS-in-JS libraries or modules with top-level side effects. Mitigate by setting `"sideEffects": false` in package.json, using direct imports in performance-critical paths, and keeping barrel files shallow (avoid re-exporting other barrels).

### Q6: How would you implement a plugin or extension system in a React application?

**Answer**: Use a combination of Context for registration and composition for rendering. Define a plugin interface, register plugins through a provider, and render plugin contributions at defined extension points.

```jsx
const PluginContext = createContext({ plugins: [] });

function PluginProvider({ plugins, children }) {
  return (
    <PluginContext.Provider value={{ plugins }}>
      {children}
    </PluginContext.Provider>
  );
}

function ExtensionPoint({ name }) {
  const { plugins } = useContext(PluginContext);
  const contributions = plugins
    .filter((p) => p.extensionPoints?.[name])
    .map((p) => p.extensionPoints[name]);

  return contributions.map((Component, i) => <Component key={i} />);
}

// Plugin definition
const analyticsPlugin = {
  name: 'analytics',
  extensionPoints: {
    'dashboard.sidebar': () => <AnalyticsWidget />,
    'settings.tabs': () => <AnalyticsSettings />,
  },
};

// Host application
function App() {
  return (
    <PluginProvider plugins={[analyticsPlugin]}>
      <Dashboard />
    </PluginProvider>
  );
}

function DashboardSidebar() {
  return (
    <aside>
      <Navigation />
      <ExtensionPoint name="dashboard.sidebar" />
    </aside>
  );
}
```

### Q7: When would you use the render props pattern today?

**Answer**: Render props are largely superseded by custom hooks, but they remain useful in specific scenarios: (1) Library components that need to expose internal state for flexible rendering (e.g., Downshift for accessible comboboxes, React Spring for animation values). (2) When you need to share logic that involves DOM elements the hook cannot access (the render prop receives refs or DOM measurements). (3) When the shared logic produces renderable output that the consumer wants to customize. In practice, prefer hooks for new code and reach for render props only when the hook alternative would require awkward ref-passing or when the library API is already render-prop based.

### Q8: How do you handle cross-cutting concerns (auth, logging, error tracking) in a large React application?

**Answer**: Layer these concerns using composition: (1) Providers at the top of the component tree supply services via Context (auth state, analytics client, error reporter). (2) Custom hooks access these services (`useAuth()`, `useAnalytics()`). (3) Error boundaries at strategic levels (root, route, feature) catch rendering errors. (4) HOCs or wrapper components for route-level concerns (protected routes, layout injection). (5) Middleware at the data layer (fetch interceptors for auth headers, response error handling). This avoids scattering cross-cutting logic across individual components while keeping each component focused on its domain.

---

## Code Examples

### Composable Form System

```jsx
const FormContext = createContext(null);

function Form({ initialValues, onSubmit, validate, children }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const setFieldValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setFieldTouched = useCallback((name) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const validationErrors = validate ? validate(values) : {};
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      onSubmit(values);
    }
  }, [values, validate, onSubmit]);

  const context = { values, errors, touched, setFieldValue, setFieldTouched };

  return (
    <FormContext.Provider value={context}>
      <form onSubmit={handleSubmit}>{children}</form>
    </FormContext.Provider>
  );
}

function Field({ name, label, type = 'text' }) {
  const { values, errors, touched, setFieldValue, setFieldTouched } =
    useContext(FormContext);

  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={type}
        value={values[name] || ''}
        onChange={(e) => setFieldValue(name, e.target.value)}
        onBlur={() => setFieldTouched(name)}
      />
      {touched[name] && errors[name] && (
        <span className="text-red-500">{errors[name]}</span>
      )}
    </div>
  );
}

// Usage
function SignupForm() {
  const validate = (values) => {
    const errors = {};
    if (!values.email) errors.email = 'Required';
    if (!values.password) errors.password = 'Required';
    if (values.password?.length < 8) errors.password = 'Min 8 characters';
    return errors;
  };

  return (
    <Form
      initialValues={{ email: '', password: '' }}
      validate={validate}
      onSubmit={(values) => signup(values)}
    >
      <Field name="email" label="Email" type="email" />
      <Field name="password" label="Password" type="password" />
      <button type="submit">Sign Up</button>
    </Form>
  );
}
```

### Error Boundary with Fallback UI

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
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback;
      return (
        <FallbackComponent
          error={this.state.error}
          reset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// Reusable fallback
function ErrorFallback({ error, reset }) {
  return (
    <div role="alert" className="p-4 border border-red-300 rounded">
      <h2>Something went wrong</h2>
      <pre className="text-sm text-red-600">{error.message}</pre>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// Usage at different levels
function App() {
  return (
    <ErrorBoundary fallback={ErrorFallback} onError={reportToSentry}>
      <Routes>
        <Route path="/dashboard" element={
          <ErrorBoundary fallback={ErrorFallback}>
            <Dashboard />
          </ErrorBoundary>
        } />
      </Routes>
    </ErrorBoundary>
  );
}
```

### Feature Flag System

```jsx
const FeatureFlagContext = createContext({});

function FeatureFlagProvider({ flags, children }) {
  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

function useFeatureFlag(flagName) {
  const flags = useContext(FeatureFlagContext);
  return flags[flagName] ?? false;
}

function Feature({ flag, children, fallback = null }) {
  const isEnabled = useFeatureFlag(flag);
  return isEnabled ? children : fallback;
}

// Usage
function App() {
  const flags = {
    newCheckout: true,
    darkMode: false,
    betaSearch: user.isBetaTester,
  };

  return (
    <FeatureFlagProvider flags={flags}>
      <Feature flag="newCheckout">
        <NewCheckoutFlow />
      </Feature>
      <Feature flag="newCheckout" fallback={<LegacyCheckout />}>
        <NewCheckoutFlow />
      </Feature>
    </FeatureFlagProvider>
  );
}
```

---

## Gotchas & Edge Cases

1. **Compound component context must handle missing providers**. If a Tab is rendered outside of Tabs, `useContext` returns null and the app crashes. Always add a check in the consuming hook: `if (!context) throw new Error('Tab must be used within Tabs')`.

2. **HOC displayName**. React DevTools shows the outer component name. Set `AuthenticatedComponent.displayName = `withAuth(${WrappedComponent.displayName})`` for debuggability.

3. **Barrel export circular dependencies**. If `features/users/index.ts` re-exports from a file that imports from `features/posts/index.ts`, which imports from `features/users/index.ts`, you get circular imports. Keep cross-feature imports pointing to specific files, not barrels.

4. **Module Federation version mismatches**. If the host and remote use different React versions and both are "shared", the remote might use the host's version, causing subtle bugs. Pin shared dependency versions explicitly and test combinations.

5. **Monorepo phantom dependencies**. A package might work because another package in the workspace installed a dependency, but it is not listed in its own `package.json`. Use strict package managers (pnpm with shamefully-hoist=false) or tools like `syncpack` to detect this.

6. **Context re-renders everything**. When a Context value changes, all consumers re-render even if they only use a slice of the value. Split contexts by update frequency or use libraries like `use-context-selector` or Zustand for selective subscriptions.

7. **Feature folders with shared state**. When feature A and feature B share state (e.g., user authentication), avoid importing one feature into another. Lift shared state to a shared module or use a global state manager.

8. **Atomic design can be too rigid**. Not every component fits neatly into atoms/molecules/organisms. Use the hierarchy as a guideline, not a strict rule. Practical boundaries matter more than theoretical purity.

---

## Quick Reference

| Pattern | Use When | Example |
|---------|----------|---------|
| Composition (children) | Flexible content injection | Card, Modal, Layout |
| Compound Components | Related components sharing implicit state | Tabs, Accordion, Select |
| Render Props | Logic reuse with rendering flexibility | Downshift, animation values |
| HOC | Cross-cutting concerns wrapping many components | withAuth, withErrorBoundary |
| Custom Hooks | Stateful logic reuse without UI | useDebounce, useFetch, useAuth |
| Container/Presenter | Separating data logic from rendering | UserProfileContainer / UserProfile |
| Atomic Design | Design system organization | Button (atom) -> SearchBar (molecule) |
| Feature-based Structure | Scaling to multiple teams | features/users/, features/cart/ |
| Barrel Exports | Clean public API for modules | index.ts re-exports |
| Dependency Injection | Testability and decoupling | Context + Provider pattern |
| Module Federation | Runtime micro-frontend integration | Remote app loaded into host |
| single-spa | Multi-framework micro-frontends | React + Angular on same page |
| Monorepo | Shared code across multiple apps | Turborepo with apps/ and packages/ |
