# Testing Strategy

## Overview

Testing is the backbone of reliable software. For full-stack engineers, testing knowledge spans the entire stack: from unit-testing a utility function, to integration-testing an API endpoint with a real database, to running end-to-end tests that simulate actual user flows in a browser. Understanding the testing pyramid, knowing when to apply each testing strategy, and being fluent in TDD are skills that interviewers use to distinguish senior engineers from junior ones.

Testing is not just about catching bugs. It is about enabling confident refactoring, documenting system behavior, facilitating code review, and serving as a safety net for rapid iteration. Engineers who test well ship faster because they spend less time debugging in production.

---

## Core Concepts

### The Testing Pyramid

The testing pyramid is a model for balancing test types:

```
        /  E2E  \          Few, slow, expensive
       /----------\
      / Integration \      Moderate number
     /----------------\
    /    Unit Tests     \  Many, fast, cheap
   /____________________\
```

**Unit tests (base):**
- Test individual functions, methods, or components in isolation
- Fast to run (milliseconds each)
- No external dependencies (databases, APIs, file system)
- Should make up ~70% of your test suite

**Integration tests (middle):**
- Test how components work together
- May involve databases, message queues, or external services
- Slower than unit tests (seconds each)
- Should make up ~20% of your test suite

**E2E tests (top):**
- Test complete user workflows through the real UI
- Slowest and most brittle
- Highest confidence that the system works as a whole
- Should make up ~10% of your test suite

### Unit Testing

Unit tests verify the smallest testable parts of an application in isolation.

**Characteristics:**
- Test one thing at a time
- No network calls, database queries, or file I/O
- Mock or stub external dependencies
- Run in milliseconds
- Deterministic (same input, same output, every time)

**Popular frameworks:**
- **JavaScript/TypeScript**: Jest, Vitest
- **Python**: pytest, unittest
- **Go**: testing (built-in), testify
- **Java**: JUnit, TestNG

### Integration Testing

Integration tests verify that multiple components work correctly together.

**What to test:**
- API endpoints with real database connections
- Service-to-service communication
- Message queue producer/consumer interactions
- Third-party API integrations (with contract tests)
- Authentication and authorization flows

**Best practices:**
- Use a dedicated test database (Docker containers work well)
- Reset state between tests (truncate tables, not drop/recreate)
- Test both happy paths and error scenarios
- Use realistic but synthetic test data

### End-to-End Testing

E2E tests simulate real user behavior in a browser or API client.

**Playwright** (recommended for modern projects):
- Cross-browser support (Chromium, Firefox, WebKit)
- Auto-wait mechanism reduces flakiness
- Built-in test generators and trace viewers
- Supports multiple languages (JS/TS, Python, Java, .NET)

**Cypress:**
- Excellent developer experience with time-travel debugging
- Real-time reloads during development
- Limited to Chromium-based browsers and Firefox
- Runs inside the browser (different architecture from Playwright)

**When to write E2E tests:**
- Critical user flows (login, checkout, payment)
- Flows that cross multiple services
- Regression tests for high-severity bugs
- Smoke tests after deployment

### Test Data Management

Managing test data is one of the hardest parts of testing.

**Factories:**
- Functions that generate test data with sensible defaults
- Allow overriding specific fields for different test scenarios
- Example: `createUser({ email: 'test@example.com' })` fills in all other fields

**Fixtures:**
- Pre-defined static data loaded before tests
- Good for reference data that rarely changes
- Can become brittle if tightly coupled to tests

**Seeding:**
- Populating a database with initial data for testing
- Use migration-based seeding for consistency
- Seed once, use database transactions for isolation within tests

**Database strategies:**
- **Transaction rollback**: Wrap each test in a transaction, roll back after
- **Truncate and reseed**: Clear tables between test suites
- **Unique databases**: Each test run gets its own database (expensive but isolated)

### Mocking Strategies

Mocking replaces real dependencies with controlled substitutes.

**Types of test doubles:**
- **Stub**: Returns predefined responses (no verification)
- **Mock**: Records calls and allows assertions on interactions
- **Spy**: Wraps real implementation, records calls
- **Fake**: Simplified working implementation (e.g., in-memory database)

**When to mock:**
- External APIs and services
- Time-dependent operations (dates, timers)
- Random number generation
- File system and network operations

**When NOT to mock:**
- The code under test itself
- Simple pure functions
- Database queries in integration tests (use a real database)
- Excessively (over-mocking leads to tests that pass but miss real bugs)

### Test-Driven Development (TDD)

TDD is a development workflow where you write tests before implementation.

**The TDD cycle:**
1. **RED**: Write a failing test that describes the desired behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Improve the code while keeping tests green

**Benefits:**
- Forces you to think about the interface before implementation
- Produces testable code by design
- Creates comprehensive test coverage naturally
- Documents expected behavior as executable specifications

**When TDD works best:**
- Well-understood requirements
- Pure functions and business logic
- API endpoint design
- Bug fixes (write a test that reproduces the bug first)

### Testing Microservices

Microservices introduce unique testing challenges.

**Contract testing:**
- Verify that service interfaces match consumer expectations
- Tools: Pact, Spring Cloud Contract
- Consumer-driven contracts: the consumer defines what it expects, the provider verifies it meets those expectations
- Prevents breaking changes across service boundaries

**Service virtualization:**
- Simulate dependent services that are expensive or unavailable
- Use tools like WireMock or MockServer
- Record real interactions and replay them

**Testing strategies for microservices:**
1. Test each service independently with unit and integration tests
2. Use contract tests for inter-service communication
3. Run E2E tests sparingly against a full environment
4. Use consumer-driven contracts to catch breaking API changes early

### Load Testing

Load testing verifies that your system handles expected and peak traffic.

**Tools:**
- **k6** (JavaScript scripting, good for developers)
- **Locust** (Python scripting)
- **Apache JMeter** (GUI-based, enterprise)
- **Artillery** (YAML-based, Node.js)

**Types of load tests:**
- **Smoke test**: Minimal load to verify the system works
- **Load test**: Expected traffic levels
- **Stress test**: Beyond expected capacity to find breaking points
- **Soak test**: Sustained load over time to find memory leaks

---

## Practical Scenarios

### Scenario 1: Setting Up a Testing Strategy for a New Project

You are starting a new full-stack project with a React frontend and Node.js backend.

**Approach:**
1. Set up Vitest for frontend unit tests and Jest for backend unit tests
2. Configure a test database with Docker Compose
3. Write integration tests for API endpoints using supertest
4. Set up Playwright for critical E2E flows
5. Create test data factories for common entities
6. Add coverage thresholds (80% minimum) to CI pipeline
7. Run unit and integration tests on every PR, E2E tests on merge to main

### Scenario 2: Reducing Flaky E2E Tests

Your test suite has a 15% flakiness rate, causing developers to ignore failures.

**Approach:**
1. Identify the most flaky tests using test analytics
2. Replace arbitrary waits (`sleep(5000)`) with proper assertions and auto-wait
3. Isolate test data so tests do not depend on shared state
4. Use Playwright's auto-waiting and locator-based selectors
5. Add retry mechanisms for genuinely non-deterministic operations
6. Quarantine consistently flaky tests while fixing root causes
7. Set up alerts when flakiness rate exceeds a threshold

### Scenario 3: Adding Tests to a Legacy Codebase

You inherit a codebase with zero test coverage and need to add tests.

**Approach:**
1. Start with characterization tests: tests that document existing behavior
2. Add integration tests for the most critical API endpoints first
3. Extract pure functions from complex methods and unit-test them
4. Add E2E tests for the top 3 user flows
5. Set up coverage reporting to track progress
6. Require tests for all new code (ratchet coverage upward)
7. Refactor toward testability incrementally

### Scenario 4: Testing a Payment Flow

You need to test a checkout and payment processing flow.

**Approach:**
1. Unit test the price calculation, tax, and discount logic
2. Mock the payment provider API for integration tests
3. Use the payment provider's sandbox environment for staging E2E tests
4. Test edge cases: expired cards, insufficient funds, network timeouts, duplicate submissions
5. Verify idempotency: charging twice with the same idempotency key should not double-charge
6. Test webhook handling for async payment confirmations
7. Load test the payment flow to ensure it handles peak traffic

---

## Interview Questions

### Q1: Explain the testing pyramid and why it matters.

**Answer:**

The testing pyramid suggests having many fast unit tests at the base, fewer integration tests in the middle, and a small number of E2E tests at the top.

**Why this structure matters:**

Unit tests run in milliseconds, provide fast feedback, and are cheap to write and maintain. They form the foundation because they catch most logic bugs early.

Integration tests are slower but verify that components work together correctly. They catch issues that unit tests miss, like incorrect database queries, serialization bugs, or misconfigured middleware.

E2E tests provide the highest confidence but are the slowest, most expensive, and most brittle. A test that clicks through a browser is susceptible to timing issues, network latency, and UI changes.

**The anti-pattern is an inverted pyramid** (also called the "ice cream cone"): mostly E2E tests, few unit tests. This leads to slow CI pipelines, flaky test suites, and developers who stop trusting or running tests.

**Practical balance:**
- 70% unit tests: business logic, utilities, component rendering
- 20% integration tests: API endpoints, database operations
- 10% E2E tests: login, checkout, critical user journeys

### Q2: What is TDD and when would you use it?

**Answer:**

TDD (Test-Driven Development) is a workflow where you write a failing test first, then write the minimum code to make it pass, then refactor.

**The cycle:** RED (failing test) -> GREEN (make it pass) -> REFACTOR (clean up)

**When I use TDD:**
- Implementing business logic with clear requirements
- Writing utility functions and parsers
- Building API endpoints (write the request/response test first)
- Fixing bugs (write a test that reproduces the bug, then fix it)
- Designing interfaces (the test forces you to think about the API)

**When I might skip strict TDD:**
- Exploratory prototyping where requirements are unclear
- UI layout and styling work
- Configuration-heavy tasks (setting up build tools)
- One-off scripts

**Benefits of TDD:**
- Every line of code has a test because the test came first
- Forces small, focused functions that are easy to test
- Acts as living documentation of expected behavior
- Enables confident refactoring because you know if you broke something immediately

### Q3: How do you decide what to mock and what to use real dependencies for?

**Answer:**

**Mock when:**
- The dependency is external and unreliable (third-party APIs)
- The dependency is slow (network calls, file I/O in unit tests)
- You need to test specific scenarios that are hard to reproduce (network errors, rate limiting, timeout)
- The dependency has side effects you want to avoid (sending emails, charging credit cards)

**Use real dependencies when:**
- Testing database queries (use a test database with Docker)
- The integration itself is what you are testing
- Mocking would hide real bugs (e.g., SQL syntax errors)
- The dependency is fast and deterministic

**Dangers of over-mocking:**
- Tests pass but the real system fails because the mock does not match reality
- Tests become tightly coupled to implementation details
- Refactoring becomes harder because every internal change breaks mock setups
- False confidence in test coverage

**My rule of thumb:** Mock at the boundary of your system (external APIs, email services, payment providers). Use real dependencies for everything inside your system boundary (your own database, your own services in integration tests).

### Q4: How would you test a microservices-based system?

**Answer:**

**Layer 1 - Unit tests per service:**
Each service has its own unit test suite that runs independently. These test business logic, validation, and data transformation.

**Layer 2 - Integration tests per service:**
Each service runs integration tests against its own database and any direct dependencies, using Docker Compose to spin up required infrastructure.

**Layer 3 - Contract tests between services:**
Consumer-driven contract tests (using Pact or similar) verify that service APIs match consumer expectations. The consumer team writes contract specifications. The provider team verifies their service meets those specifications. This catches breaking changes before they reach production.

**Layer 4 - E2E tests in a staging environment:**
A small suite of tests runs against the full system in a staging environment. These test the most critical cross-service flows only.

**Key principles:**
- Each service is independently testable
- Contract tests replace the need for extensive cross-service integration tests
- E2E tests are kept to a minimum (they are the most expensive and brittle)
- Each team owns their service's tests

### Q5: How do you handle test data management?

**Answer:**

**Factories (my preferred approach):**
```
createUser({ email: 'test@example.com' })
// Returns a complete user object with all required fields filled with defaults
```

Factories generate test data with sensible defaults. You override only the fields relevant to your test. This keeps tests readable and maintainable because you are not distracted by irrelevant data setup.

**Database isolation strategies:**
- **Transaction rollback**: Wrap each test in a transaction, roll back at the end. Fast but does not work for tests that involve multiple database connections.
- **Truncate between tests**: Clear all tables between test suites. Slower but simpler.
- **Unique databases per test run**: Maximum isolation but expensive in CI.

**Best practices:**
- Never rely on data created by another test (tests must be independent)
- Use factories instead of fixtures for data that varies between tests
- Keep seed data minimal and focused on reference data
- Clean up after tests to prevent state leakage
- Use deterministic IDs or sequences to make debugging easier

### Q6: What makes E2E tests flaky, and how do you fix it?

**Answer:**

**Common causes of flakiness:**

1. **Race conditions**: Tests run faster than the UI updates. Fix by using auto-wait mechanisms (Playwright handles this well) and asserting on visible elements rather than using arbitrary sleeps.

2. **Shared state**: Tests depend on data created by other tests. Fix by isolating test data and cleaning up before each test.

3. **Timing issues**: Animations, debounced inputs, lazy loading. Fix by disabling animations in tests and waiting for specific conditions.

4. **External dependencies**: Tests call real APIs that are unreliable. Fix by mocking external services or using stable test environments.

5. **Non-deterministic data**: Tests depend on the current time, random values, or dynamic content. Fix by controlling time and using deterministic test data.

**Prevention strategies:**
- Use Playwright's auto-waiting and web-first assertions
- Use data-testid attributes for reliable element selection
- Run tests in isolated browser contexts
- Use test fixtures that create and clean up their own data
- Retry flaky tests automatically but track flakiness metrics
- Quarantine consistently flaky tests and fix them as a priority

### Q7: Explain contract testing and when you would use it.

**Answer:**

Contract testing verifies that the interface between two services (the "contract") is honored by both sides. It is especially valuable in microservices architectures.

**Consumer-driven contracts:**
1. The consumer (client) writes a contract that describes the requests it makes and the responses it expects
2. The provider (server) runs these contracts against its real implementation
3. If the provider changes its API in a way that breaks the contract, the test fails

**Tools:** Pact is the most popular. The workflow is:
- Consumer generates a "pact file" describing its expectations
- Pact file is shared (via a Pact Broker or CI artifact)
- Provider verifies the pact against its actual API

**When to use contract testing:**
- Multiple teams own different services
- Services evolve independently with different release cycles
- You want to catch breaking API changes before deployment
- E2E tests across services are too slow or flaky

**When NOT to use contract testing:**
- Monolithic applications
- Services owned by the same team (communication is easier)
- Simple CRUD APIs that rarely change

### Q8: How do you approach load testing?

**Answer:**

**Process:**
1. Define performance requirements (response time P99, throughput, concurrent users)
2. Identify critical endpoints and flows to test
3. Write load test scripts that simulate realistic user behavior
4. Run baseline tests to establish current performance
5. Gradually increase load to find the breaking point
6. Analyze bottlenecks (CPU, memory, database, network)
7. Optimize and retest
8. Set up performance regression tests in CI

**Test types:**
- **Smoke test**: 1-5 users, verify the system works under minimal load
- **Load test**: Expected peak traffic, verify acceptable response times
- **Stress test**: 2-3x expected traffic, find breaking points and degradation patterns
- **Soak test**: Sustained load for hours, find memory leaks and resource exhaustion

**Key metrics to monitor:**
- Response time (P50, P95, P99)
- Throughput (requests per second)
- Error rate
- CPU and memory utilization
- Database query time and connection pool usage

---

## Code Examples

### Jest Unit Tests (TypeScript)

```typescript
// utils/pricing.ts
interface PricingInput {
  readonly basePrice: number;
  readonly quantity: number;
  readonly discountPercent: number;
  readonly taxRate: number;
}

interface PricingResult {
  readonly subtotal: number;
  readonly discount: number;
  readonly tax: number;
  readonly total: number;
}

export const calculatePricing = (input: PricingInput): PricingResult => {
  const subtotal = input.basePrice * input.quantity;
  const discount = subtotal * (input.discountPercent / 100);
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * (input.taxRate / 100);
  const total = taxableAmount + tax;

  return { subtotal, discount, tax, total };
};
```

```typescript
// utils/pricing.test.ts
import { calculatePricing } from './pricing';

describe('calculatePricing', () => {
  it('calculates pricing with no discount', () => {
    const result = calculatePricing({
      basePrice: 100,
      quantity: 2,
      discountPercent: 0,
      taxRate: 10,
    });

    expect(result).toEqual({
      subtotal: 200,
      discount: 0,
      tax: 20,
      total: 220,
    });
  });

  it('applies percentage discount before tax', () => {
    const result = calculatePricing({
      basePrice: 100,
      quantity: 1,
      discountPercent: 20,
      taxRate: 10,
    });

    expect(result).toEqual({
      subtotal: 100,
      discount: 20,
      tax: 8,
      total: 88,
    });
  });

  it('handles zero quantity', () => {
    const result = calculatePricing({
      basePrice: 100,
      quantity: 0,
      discountPercent: 10,
      taxRate: 10,
    });

    expect(result.total).toBe(0);
  });

  it('handles 100% discount', () => {
    const result = calculatePricing({
      basePrice: 50,
      quantity: 3,
      discountPercent: 100,
      taxRate: 10,
    });

    expect(result.total).toBe(0);
  });
});
```

### Go Table-Driven Tests

```go
// pricing/pricing.go
package pricing

type PricingInput struct {
    BasePrice       float64
    Quantity        int
    DiscountPercent float64
    TaxRate         float64
}

type PricingResult struct {
    Subtotal float64
    Discount float64
    Tax      float64
    Total    float64
}

func Calculate(input PricingInput) PricingResult {
    subtotal := input.BasePrice * float64(input.Quantity)
    discount := subtotal * (input.DiscountPercent / 100)
    taxable := subtotal - discount
    tax := taxable * (input.TaxRate / 100)
    total := taxable + tax

    return PricingResult{
        Subtotal: subtotal,
        Discount: discount,
        Tax:      tax,
        Total:    total,
    }
}
```

```go
// pricing/pricing_test.go
package pricing

import (
    "testing"
)

func TestCalculate(t *testing.T) {
    tests := []struct {
        name     string
        input    PricingInput
        expected PricingResult
    }{
        {
            name: "no discount",
            input: PricingInput{
                BasePrice: 100, Quantity: 2,
                DiscountPercent: 0, TaxRate: 10,
            },
            expected: PricingResult{
                Subtotal: 200, Discount: 0,
                Tax: 20, Total: 220,
            },
        },
        {
            name: "with discount",
            input: PricingInput{
                BasePrice: 100, Quantity: 1,
                DiscountPercent: 20, TaxRate: 10,
            },
            expected: PricingResult{
                Subtotal: 100, Discount: 20,
                Tax: 8, Total: 88,
            },
        },
        {
            name: "zero quantity",
            input: PricingInput{
                BasePrice: 100, Quantity: 0,
                DiscountPercent: 10, TaxRate: 10,
            },
            expected: PricingResult{
                Subtotal: 0, Discount: 0,
                Tax: 0, Total: 0,
            },
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Calculate(tt.input)
            if result != tt.expected {
                t.Errorf("Calculate(%v) = %v, want %v",
                    tt.input, result, tt.expected)
            }
        })
    }
}
```

### Python pytest with Fixtures

```python
# tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base
from app.factories import UserFactory, OrderFactory


@pytest.fixture(scope="session")
def engine():
    engine = create_engine("postgresql://test:test@localhost:5432/testdb")
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection)()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def user_factory(db_session):
    def create_user(**overrides):
        defaults = {
            "email": "user@example.com",
            "name": "Test User",
            "is_active": True,
        }
        merged = {**defaults, **overrides}
        user = UserFactory.build(**merged)
        db_session.add(user)
        db_session.flush()
        return user

    return create_user
```

```python
# tests/test_order_service.py
import pytest
from app.services.order_service import OrderService
from app.exceptions import InsufficientStockError


class TestOrderService:
    def test_create_order_with_valid_items(self, db_session, user_factory):
        user = user_factory(email="buyer@example.com")
        service = OrderService(db_session)

        order = service.create_order(
            user_id=user.id,
            items=[
                {"product_id": "prod-1", "quantity": 2},
                {"product_id": "prod-2", "quantity": 1},
            ],
        )

        assert order.user_id == user.id
        assert len(order.items) == 2
        assert order.status == "pending"

    def test_create_order_fails_with_insufficient_stock(
        self, db_session, user_factory
    ):
        user = user_factory()
        service = OrderService(db_session)

        with pytest.raises(InsufficientStockError):
            service.create_order(
                user_id=user.id,
                items=[{"product_id": "prod-1", "quantity": 9999}],
            )

    def test_cancel_order_refunds_stock(self, db_session, user_factory):
        user = user_factory()
        service = OrderService(db_session)

        order = service.create_order(
            user_id=user.id,
            items=[{"product_id": "prod-1", "quantity": 1}],
        )

        cancelled = service.cancel_order(order.id)

        assert cancelled.status == "cancelled"
```

### API Integration Tests (Node.js with supertest)

```typescript
// tests/integration/users.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { db } from '../../src/database';
import { createTestUser } from '../factories/user';

describe('Users API', () => {
  beforeEach(async () => {
    await db.migrate.latest();
    await db.seed.run();
  });

  afterEach(async () => {
    await db('users').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('GET /api/users/:id', () => {
    it('returns a user by ID', async () => {
      const user = await createTestUser({
        email: 'test@example.com',
        name: 'Test User',
      });

      const response = await request(app)
        .get(`/api/users/${user.id}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: user.id,
          email: 'test@example.com',
          name: 'Test User',
          createdAt: expect.any(String),
        },
      });
    });

    it('returns 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/non-existent-id')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'User not found',
      });
    });
  });

  describe('POST /api/users', () => {
    it('creates a new user', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'new@example.com',
          name: 'New User',
          password: 'securePassword123!',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('new@example.com');

      const dbUser = await db('users')
        .where({ email: 'new@example.com' })
        .first();
      expect(dbUser).toBeDefined();
    });

    it('rejects duplicate email', async () => {
      await createTestUser({ email: 'existing@example.com' });

      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'existing@example.com',
          name: 'Duplicate User',
          password: 'securePassword123!',
        })
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });

    it('validates required fields', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'incomplete@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
```

### Playwright E2E Tests

```typescript
// e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Seed test data via API
    await page.request.post('/api/test/seed', {
      data: { scenario: 'checkout' },
    });
  });

  test('completes checkout with valid payment', async ({ page }) => {
    // Navigate to product page
    await page.goto('/products/test-product');

    // Add to cart
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Go to cart
    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page).toHaveURL('/cart');

    // Proceed to checkout
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Fill shipping info
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Address').fill('123 Test St');
    await page.getByLabel('City').fill('Test City');
    await page.getByLabel('Zip Code').fill('12345');

    // Fill payment info (test card)
    await page.getByLabel('Card Number').fill('4242424242424242');
    await page.getByLabel('Expiry').fill('12/30');
    await page.getByLabel('CVC').fill('123');

    // Place order
    await page.getByRole('button', { name: 'Place Order' }).click();

    // Verify confirmation
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await expect(page.getByText('Order confirmed')).toBeVisible();
    await expect(page.getByTestId('order-number')).toContainText(/ORD-/);
  });

  test('shows validation errors for invalid payment', async ({ page }) => {
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Submit without filling required fields
    await page.getByRole('button', { name: 'Place Order' }).click();

    // Verify validation messages
    await expect(page.getByText('Full name is required')).toBeVisible();
    await expect(page.getByText('Card number is required')).toBeVisible();
  });
});
```

### Load Testing with k6

```javascript
// load-tests/checkout-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Sustain 50 users
    { duration: '2m', target: 100 },  // Peak at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
  },
};

export default function () {
  const baseUrl = 'https://staging-api.example.com';

  // Browse products
  const products = http.get(`${baseUrl}/api/products`);
  check(products, {
    'products status 200': (r) => r.status === 200,
  });

  sleep(1);

  // Add to cart
  const addToCart = http.post(
    `${baseUrl}/api/cart/items`,
    JSON.stringify({ productId: 'prod-1', quantity: 1 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(addToCart, {
    'add to cart status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // Checkout
  const start = Date.now();
  const checkout = http.post(
    `${baseUrl}/api/orders`,
    JSON.stringify({
      shippingAddress: { city: 'Test City', zip: '12345' },
      paymentMethod: 'test-card',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  checkoutDuration.add(Date.now() - start);
  errorRate.add(checkout.status !== 201);

  check(checkout, {
    'checkout status 201': (r) => r.status === 201,
    'checkout has order ID': (r) => JSON.parse(r.body).data.orderId !== undefined,
  });

  sleep(2);
}
```

### Test Factory Pattern (TypeScript)

```typescript
// tests/factories/user.ts
import { faker } from '@faker-js/faker';
import { db } from '../../src/database';

interface UserOverrides {
  readonly email?: string;
  readonly name?: string;
  readonly role?: 'admin' | 'user';
  readonly isActive?: boolean;
}

interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'user';
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export const buildUser = (overrides: UserOverrides = {}): Omit<TestUser, 'id' | 'createdAt'> => ({
  email: overrides.email ?? faker.internet.email(),
  name: overrides.name ?? faker.person.fullName(),
  role: overrides.role ?? 'user',
  isActive: overrides.isActive ?? true,
});

export const createTestUser = async (
  overrides: UserOverrides = {}
): Promise<TestUser> => {
  const userData = buildUser(overrides);
  const [user] = await db('users').insert(userData).returning('*');
  return user;
};

export const createTestUsers = async (
  count: number,
  overrides: UserOverrides = {}
): Promise<readonly TestUser[]> => {
  const users = Array.from({ length: count }, (_, i) =>
    buildUser({
      ...overrides,
      email: overrides.email ?? `user-${i}@example.com`,
    })
  );
  return db('users').insert(users).returning('*');
};
```

---

## Quick Reference

### Testing Pyramid Ratios

| Level | Proportion | Speed | Confidence | Cost |
|-------|-----------|-------|------------|------|
| Unit | ~70% | ms | Low-Med | Low |
| Integration | ~20% | seconds | Medium | Medium |
| E2E | ~10% | minutes | High | High |

### TDD Cycle

```
1. RED    -> Write a failing test
2. GREEN  -> Write minimum code to pass
3. REFACTOR -> Clean up while tests remain green
4. REPEAT
```

### Test Double Types

| Type | Purpose | Verifies Calls? |
|------|---------|----------------|
| Stub | Returns predetermined data | No |
| Mock | Returns data + records calls | Yes |
| Spy | Wraps real implementation | Yes |
| Fake | Simplified implementation | No |

### Common Test Patterns

```
Arrange -> Act -> Assert (AAA)
Given   -> When -> Then   (BDD)
```

### What to Test at Each Level

**Unit tests:**
- Pure functions and business logic
- Input validation and parsing
- Data transformations
- Error handling paths
- Edge cases (empty arrays, null, boundary values)

**Integration tests:**
- API request/response cycles
- Database CRUD operations
- Authentication and authorization
- Error responses and status codes
- Query filtering, pagination, sorting

**E2E tests:**
- Login and registration
- Core business flows (checkout, booking, submission)
- Cross-page navigation
- Critical error handling visible to users

### Coverage Thresholds

```json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### Testing Commands Cheat Sheet

```bash
# JavaScript/TypeScript
npx jest --coverage                     # Run with coverage
npx jest --watch                        # Watch mode
npx jest --testPathPattern=users        # Run specific tests
npx playwright test                     # Run E2E tests
npx playwright test --headed            # Run with browser visible
npx playwright show-report              # View test report

# Python
pytest -v                               # Verbose output
pytest --cov=app                        # With coverage
pytest -k "test_create_order"           # Run specific tests
pytest --tb=short                       # Short tracebacks
pytest -x                               # Stop on first failure

# Go
go test ./...                           # Run all tests
go test -v ./pricing/...                # Verbose, specific package
go test -cover ./...                    # With coverage
go test -run TestCalculate              # Run specific test
go test -bench=. ./...                  # Run benchmarks

# k6 load testing
k6 run load-tests/checkout-load.js      # Run load test
k6 run --vus 50 --duration 5m script.js # Quick ad-hoc test
```
