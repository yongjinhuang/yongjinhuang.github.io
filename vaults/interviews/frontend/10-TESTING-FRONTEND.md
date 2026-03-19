# Frontend Testing

## Overview

Testing is how you prove your code works and keep it working as your application evolves. In frontend interviews, testing questions reveal whether you understand the trade-offs between different testing strategies, whether you write tests that catch real bugs (not just inflate coverage numbers), and whether you can test complex async UI behavior. The modern frontend testing stack centers on Jest or Vitest for unit/integration tests, React Testing Library for component tests, and Playwright for end-to-end tests, with MSW for API mocking.

## Core Concepts

### The Testing Pyramid

The testing pyramid guides how many tests of each type to write:

```
        /  E2E  \          Few, slow, expensive, high confidence
       /----------\
      / Integration \      Moderate number, medium speed
     /----------------\
    /    Unit Tests     \  Many, fast, cheap, focused
   /--------------------\
```

**Unit Tests** - Test individual functions, utilities, hooks, and pure logic in isolation. They are fast, cheap, and should form the bulk of your test suite.

**Integration Tests** - Test multiple units working together. For React, this often means rendering a component tree and verifying behavior through user interactions.

**End-to-End (E2E) Tests** - Test complete user flows through the real application in a browser. They are slow and brittle but provide the highest confidence that everything works together.

**The Testing Trophy** (Kent C. Dodds' variant): emphasizes integration tests over unit tests, arguing that testing components as users interact with them catches more real bugs.

### Jest Setup

Jest is the most widely used JavaScript testing framework.

```js
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// jest.setup.js
import '@testing-library/jest-dom';
```

### React Testing Library

RTL encourages testing components the way users interact with them -- by finding elements through accessible roles, labels, and text rather than implementation details like class names or component internals.

```jsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodoApp } from './TodoApp';

describe('TodoApp', () => {
  it('adds a new todo when the form is submitted', async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    const input = screen.getByPlaceholderText('Add a todo...');
    const submitButton = screen.getByRole('button', { name: /add/i });

    await user.type(input, 'Buy groceries');
    await user.click(submitButton);

    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('marks a todo as completed when clicked', async () => {
    const user = userEvent.setup();
    render(
      <TodoApp
        initialTodos={[{ id: '1', text: 'Test todo', completed: false }]}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /test todo/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it('filters todos by completion status', async () => {
    const user = userEvent.setup();
    render(
      <TodoApp
        initialTodos={[
          { id: '1', text: 'Done task', completed: true },
          { id: '2', text: 'Pending task', completed: false },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: /active/i }));

    expect(screen.queryByText('Done task')).not.toBeInTheDocument();
    expect(screen.getByText('Pending task')).toBeInTheDocument();
  });
});
```

### Query Priority

RTL queries should follow this priority (most to least preferred):

1. `getByRole` - Accessible role (button, heading, textbox, checkbox)
2. `getByLabelText` - Form elements with associated labels
3. `getByPlaceholderText` - Input placeholders
4. `getByText` - Visible text content
5. `getByDisplayValue` - Current value of form elements
6. `getByAltText` - Image alt text
7. `getByTitle` - Title attribute
8. `getByTestId` - Last resort, `data-testid` attribute

### user-event vs fireEvent

`fireEvent` dispatches DOM events directly. `userEvent` simulates full user interactions, including focus, keyboard events, and browser-level behavior.

```jsx
import userEvent from '@testing-library/user-event';

// PREFER: userEvent (simulates real user behavior)
const user = userEvent.setup();
await user.type(input, 'hello'); // Types character by character
await user.click(button); // Focuses, then clicks
await user.keyboard('{Enter}'); // Presses Enter key
await user.selectOptions(select, ['option1']);
await user.tab(); // Moves focus to next element
await user.hover(element); // Triggers hover events
await user.clear(input); // Clears input field

// AVOID: fireEvent (skips intermediate events)
fireEvent.change(input, { target: { value: 'hello' } }); // Jumps to final value
fireEvent.click(button); // No focus events
```

### Mocking

**Module Mocking**:

```js
// Mock an entire module
jest.mock('./api', () => ({
  fetchUser: jest.fn(),
}));

import { fetchUser } from './api';

beforeEach(() => {
  jest.clearAllMocks();
});

it('displays user data after loading', async () => {
  fetchUser.mockResolvedValue({ name: 'Alice', email: 'alice@test.com' });

  render(<UserProfile userId="1" />);

  expect(screen.getByText('Loading...')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  expect(fetchUser).toHaveBeenCalledWith('1');
  expect(fetchUser).toHaveBeenCalledTimes(1);
});
```

**Timer Mocking**:

```js
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('debounces search input', async () => {
  const onSearch = jest.fn();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<SearchBar onSearch={onSearch} debounceMs={300} />);

  const input = screen.getByRole('textbox');
  await user.type(input, 'react');

  // Search should not have fired yet (within debounce window)
  expect(onSearch).not.toHaveBeenCalled();

  // Advance past debounce delay
  jest.advanceTimersByTime(300);

  expect(onSearch).toHaveBeenCalledWith('react');
  expect(onSearch).toHaveBeenCalledTimes(1);
});
```

**API Mocking with MSW (Mock Service Worker)**:

```js
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Alice',
      email: 'alice@test.com',
    });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: '123', ...body }, { status: 201 });
  }),

  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('handles server error gracefully', async () => {
  // Override handler for this specific test
  server.use(
    http.get('/api/users/:id', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  render(<UserProfile userId="1" />);

  await waitFor(() => {
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

### Testing Custom Hooks

Use `renderHook` from React Testing Library:

```jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('initializes with the given value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('increments the count', () => {
    const { result } = renderHook(() => useCounter(0));

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.increment();
      result.current.increment();
    });

    expect(result.current.count).toBe(7);

    act(() => {
      result.current.reset();
    });

    expect(result.current.count).toBe(5);
  });
});
```

### Testing Async Code

```jsx
import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';

it('loads and displays data', async () => {
  render(<DataTable endpoint="/api/data" />);

  // Wait for loading state to disappear
  await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

  // Verify data is displayed
  expect(screen.getByText('Row 1')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(11); // header + 10 data rows
});

it('retries on failure then succeeds', async () => {
  let callCount = 0;

  server.use(
    http.get('/api/data', () => {
      callCount++;
      if (callCount < 3) {
        return new HttpResponse(null, { status: 503 });
      }
      return HttpResponse.json({ items: [{ id: '1', name: 'Item 1' }] });
    })
  );

  render(<DataTable endpoint="/api/data" retries={3} />);

  await waitFor(
    () => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    },
    { timeout: 5000 }
  );
});
```

### E2E Testing with Playwright

```js
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('user can sign up, log in, and access dashboard', async ({ page }) => {
    // Sign up
    await page.goto('/signup');
    await page.getByLabel('Email').fill('newuser@test.com');
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByLabel('Confirm Password').fill('SecureP@ss123');
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page.getByText('Account created')).toBeVisible();

    // Log in
    await page.goto('/login');
    await page.getByLabel('Email').fill('newuser@test.com');
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByRole('button', { name: 'Log In' }).click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible();
  });

  test('shows validation errors for invalid input', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('handles network errors gracefully', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => {
      route.abort('connectionrefused');
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('user@test.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByText(/network error/i)).toBeVisible();
  });
});
```

Playwright configuration:

```js
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Snapshot Testing

Snapshot tests capture the rendered output and compare it against a saved reference.

```jsx
it('renders the card component correctly', () => {
  const { container } = render(
    <Card title="Test Card" description="A test description" />
  );
  expect(container.firstChild).toMatchSnapshot();
});

// Inline snapshots (stored in the test file)
it('formats currency correctly', () => {
  expect(formatCurrency(1234.56)).toMatchInlineSnapshot(`"$1,234.56"`);
  expect(formatCurrency(0)).toMatchInlineSnapshot(`"$0.00"`);
  expect(formatCurrency(-99.9)).toMatchInlineSnapshot(`"-$99.90"`);
});
```

**Pros of snapshot testing:**

- Quick to write, catches unexpected UI changes
- Good for utility function output verification

**Cons of snapshot testing:**

- Large snapshots are unreadable and get rubber-stamped in reviews
- Brittle -- any change triggers a failure, even intentional ones
- Tests pass trivially with `--updateSnapshot`
- Do not test behavior, only structure

**Best practice:** Use inline snapshots for small, focused output (formatted strings, simple structures). Avoid large component snapshots.

### Test Coverage

```bash
# Generate coverage report
jest --coverage

# With Vitest
vitest --coverage
```

Coverage metrics:

- **Statements** - Percentage of code statements executed
- **Branches** - Percentage of conditional branches taken (if/else, ternary, switch)
- **Functions** - Percentage of functions called
- **Lines** - Percentage of lines executed

High coverage does not mean good tests. You can hit 100% coverage with tests that assert nothing. Focus on:

- Testing critical paths and edge cases
- Testing behavior, not implementation
- Meaningful assertions (not just "it renders")

## Common Interview Questions

### 1. What is the difference between unit, integration, and end-to-end tests?

Unit tests verify a single function or module in isolation, mocking all dependencies. They are fast, reliable, and pinpoint exact failures. Integration tests verify that multiple units work together correctly -- for React, this means rendering a component tree with real (or MSW-mocked) API calls and verifying the user can complete a workflow. E2E tests drive a real browser against the running application, testing the full stack including servers, databases, and third-party services. They are the slowest but provide the highest confidence.

### 2. Why does React Testing Library discourage testing implementation details?

Implementation details are things users and other code do not observe: internal state variables, component instance methods, class names, and DOM structure. Tests coupled to implementation details break when you refactor (false negatives) and pass when behavior is wrong (false positives). RTL encourages querying by role, label, and text -- the same things a user or screen reader sees -- so tests remain valid through refactors and actually catch behavioral regressions.

### 3. When would you use MSW instead of mocking fetch directly?

MSW intercepts requests at the network level, meaning your code's fetch, axios, or GraphQL client works exactly as in production. This tests the full data flow including request construction, headers, and error handling. Mocking fetch directly (`jest.spyOn(global, 'fetch')`) only tests that your code calls fetch with the right arguments; it does not exercise the actual HTTP client. MSW also allows the same mocks to be used in development, tests, and Storybook.

### 4. How do you test a component that uses React Context?

Wrap the component in the context provider during rendering:

```jsx
function renderWithProviders(ui, { theme = 'light', user = null } = {}) {
  return render(
    <ThemeContext.Provider value={{ theme }}>
      <AuthContext.Provider value={{ user }}>{ui}</AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

it('shows admin controls for admin users', () => {
  renderWithProviders(<Dashboard />, {
    user: { id: '1', role: 'admin' },
  });

  expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
});
```

### 5. What is the purpose of `act` in React testing?

`act` ensures all state updates and effects are flushed before you make assertions. RTL's `render`, `userEvent`, and `waitFor` already wrap their operations in `act`, so you rarely need to call it directly. The main case is when testing hooks with `renderHook` -- you wrap state-changing calls in `act` to ensure React processes the update synchronously.

### 6. How would you test a component with complex async behavior?

Use `waitFor` for assertions that need to wait for async operations, `waitForElementToBeRemoved` for loading states, and `findBy` queries (which combine `getBy` with `waitFor`). Mock timers with `jest.useFakeTimers()` for debounced or delayed behavior. Use MSW to control API response timing and simulate slow responses or errors.

### 7. What makes a good test?

A good test is fast, deterministic, and isolated (no shared state between tests). It tests behavior from the user's perspective, not implementation details. It has a clear name that describes the expected behavior. It follows the Arrange-Act-Assert pattern. It breaks for the right reasons (actual bugs) and not for the wrong reasons (refactors that preserve behavior). It is maintainable -- if the test is harder to understand than the code it tests, it needs simplification.

### 8. How do you decide what to test and what not to test?

Focus testing effort on: business-critical logic (checkout, authentication, data transformations), complex conditional behavior, error handling paths, and accessibility. Skip testing: third-party library internals, trivial components with no logic (a div with a class name), and generated code. Use the risk/cost matrix: high-risk code (auth, payments) deserves thorough testing; low-risk, low-complexity code (a static footer) does not.

## Code Examples

### Custom Render with All Providers

```jsx
// test-utils.jsx
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeProvider';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

export function renderWithProviders(ui, options = {}) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>{children}</ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

// Re-export everything from RTL
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
```

### Testing Error Boundaries

```jsx
import { render, screen } from '@testing-library/react';

function ProblemChild() {
  throw new Error('Test error');
}

it('renders fallback UI when a child throws', () => {
  // Suppress console.error for this test
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <ErrorBoundary fallback={<p>Something went wrong</p>}>
      <ProblemChild />
    </ErrorBoundary>
  );

  expect(screen.getByText('Something went wrong')).toBeInTheDocument();

  consoleSpy.mockRestore();
});
```

### Testing Accessibility

```jsx
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Gotchas & Edge Cases

1. **Forgetting to await userEvent**: `userEvent.setup()` methods are async. Missing `await` leads to tests that pass but do not actually simulate the interaction.

2. **Testing state instead of behavior**: Do not assert `component.state.count === 5`. Assert what the user sees: `screen.getByText('5')`. Internal state is an implementation detail.

3. **Shared state between tests**: Global mocks, module-level variables, and localStorage can leak between tests. Use `beforeEach`/`afterEach` to clean up, and `jest.isolateModules` for module-level state.

4. **waitFor with side effects**: Do not put side effects inside `waitFor` callbacks. `waitFor` re-runs the callback multiple times until it passes. Side effects (clicking a button, firing events) will execute multiple times.

5. **Snapshot test fatigue**: Large snapshots get auto-updated without review. Keep snapshots small or use inline snapshots. Better yet, write explicit assertions about the specific elements you care about.

6. **Timer mocking with userEvent**: When using `jest.useFakeTimers()` with `userEvent`, pass `advanceTimers` to `userEvent.setup()` so that internal setTimeout calls in userEvent advance properly.

7. **Async cleanup**: If your component starts async operations (fetches, timers), make sure they complete or are cleaned up before the test ends. Otherwise you get "act" warnings and flaky tests.

8. **Testing loading states**: A common mistake is asserting loading state synchronously. The loading state may appear and disappear before your assertion runs. Use `findByText` or `waitFor` to handle timing.

## Quick Reference

| Tool                  | Purpose                               | Speed  | Confidence            |
| --------------------- | ------------------------------------- | ------ | --------------------- |
| Jest / Vitest         | Test runner, assertions, mocking      | Fast   | Foundation            |
| React Testing Library | Component testing via user behavior   | Fast   | High                  |
| userEvent             | Realistic user interaction simulation | Fast   | Higher than fireEvent |
| MSW                   | Network-level API mocking             | Fast   | High                  |
| Playwright            | Cross-browser E2E testing             | Slow   | Highest               |
| jest-axe              | Automated accessibility testing       | Fast   | Medium                |
| Storybook             | Visual component testing              | Medium | Medium                |

| Query                  | Use When                                            |
| ---------------------- | --------------------------------------------------- |
| `getByRole`            | Element has an ARIA role (button, textbox, heading) |
| `getByLabelText`       | Form element with a label                           |
| `getByPlaceholderText` | Input has placeholder text                          |
| `getByText`            | Non-interactive element with visible text           |
| `getByTestId`          | No better query available (last resort)             |
| `queryBy*`             | Asserting element does NOT exist                    |
| `findBy*`              | Element appears asynchronously                      |
| `getAllBy*`            | Multiple matching elements expected                 |

| Pattern       | Description                                          |
| ------------- | ---------------------------------------------------- |
| AAA           | Arrange (setup) -> Act (interact) -> Assert (verify) |
| Custom render | Wrap with providers for consistent test setup        |
| MSW handlers  | Define default handlers, override per test           |
| Screen debug  | `screen.debug()` to print current DOM state          |
| Cleanup       | Automatic in RTL; manual for global mocks            |
