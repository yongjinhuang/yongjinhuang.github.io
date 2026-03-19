# Clean Architecture for LLD Interviews

Clean architecture is about organizing code so that business logic is independent of frameworks,
databases, and UI. In LLD interviews, demonstrating clean architecture separates senior candidates
from junior ones. This guide covers the major architectural styles and includes a complete
refactoring example from messy code to clean code.

---

## Table of Contents

1. [Why Architecture Matters](#1-why-architecture-matters)
2. [Layered Architecture](#2-layered-architecture)
3. [Hexagonal / Ports-and-Adapters](#3-hexagonal--ports-and-adapters)
4. [Clean Architecture (Uncle Bob)](#4-clean-architecture-uncle-bob)
5. [Repository Pattern](#5-repository-pattern)
6. [Service Layer Pattern](#6-service-layer-pattern)
7. [Domain-Driven Design Basics](#7-domain-driven-design-basics)
8. [Complete Refactoring Example](#8-complete-refactoring-example)
9. [Interview Tips](#9-interview-tips)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Why Architecture Matters

```
+--------------------------------------------------------------------+
| "The goal of software architecture is to minimize the human        |
|  resources required to build and maintain the required system."     |
|                                              -- Robert C. Martin    |
+--------------------------------------------------------------------+
```

Good architecture enables:

| Benefit             | What It Means                                            |
| ------------------- | -------------------------------------------------------- |
| **Testability**     | Business logic tested without database or HTTP           |
| **Flexibility**     | Swap Postgres for MongoDB without changing business code |
| **Readability**     | New developers understand the system quickly             |
| **Maintainability** | Changes in one layer do not cascade to others            |

Bad architecture leads to:

- "I changed the database schema and 47 files broke"
- "I can't test this function without spinning up the entire server"
- "Nobody wants to touch this code because everything is connected to everything"

---

## 2. Layered Architecture

The simplest architectural pattern. Code is organized into horizontal layers where each
layer only talks to the layer directly below it.

```
+-------------------------------------------------------+
|                 PRESENTATION LAYER                     |
|  (Controllers, API routes, CLI, Views)                 |
+-------------------------------------------------------+
                         |
                         v
+-------------------------------------------------------+
|                 BUSINESS / SERVICE LAYER                |
|  (Use cases, business rules, validation)               |
+-------------------------------------------------------+
                         |
                         v
+-------------------------------------------------------+
|                 PERSISTENCE / DATA LAYER               |
|  (Repositories, ORM, database queries)                 |
+-------------------------------------------------------+
                         |
                         v
+-------------------------------------------------------+
|                 DATABASE                               |
+-------------------------------------------------------+
```

**Rules:**

1. Each layer only depends on the layer below it.
2. Never skip layers (presentation should not call the database directly).
3. Data flows down as requests, up as responses.

**Limitation:** The business layer depends on the persistence layer. If you change databases,
the business layer might need changes too. Hexagonal architecture fixes this.

---

## 3. Hexagonal / Ports-and-Adapters

The key insight: business logic defines _interfaces_ (ports) and the outside world provides
_implementations_ (adapters). Dependencies point inward.

```
          +------------------+
          | REST Controller  |   <-- Driving Adapter (input)
          +--------+---------+
                   |
                   v (implements)
          +--------+---------+
          | OrderService     |   <-- Port (interface)
          | (interface)      |
          +--------+---------+
                   |
                   v (uses)
          +--------+---------+
          | OrderServiceImpl |   <-- Application Core
          +--------+---------+
                   |
                   v (depends on interface)
          +--------+---------+
          | OrderRepository  |   <-- Port (interface)
          | (interface)      |
          +--------+---------+
                   ^
                   | (implements)
          +--------+---------+
          | PostgresRepo     |   <-- Driven Adapter (output)
          +------------------+
```

**Ports** = interfaces defined by the core
**Driving adapters** = things that call your code (HTTP, CLI, tests)
**Driven adapters** = things your code calls (database, email, external APIs)

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


# --- DOMAIN (innermost) ---
@dataclass(frozen=True)
class Order:
    order_id: str
    customer_id: str
    items: tuple[str, ...]
    total: float
    status: str = "pending"


# --- PORTS (interfaces) ---
class OrderRepository(ABC):
    """Driven port: the core defines what it needs from persistence."""

    @abstractmethod
    def save(self, order: Order) -> None:
        pass

    @abstractmethod
    def find_by_id(self, order_id: str) -> Order | None:
        pass

    @abstractmethod
    def find_by_customer(self, customer_id: str) -> list[Order]:
        pass


class NotificationPort(ABC):
    """Driven port: the core defines what it needs from notifications."""

    @abstractmethod
    def send(self, customer_id: str, message: str) -> None:
        pass


# --- APPLICATION SERVICE (use case) ---
class PlaceOrderService:
    """Driving port implementation: orchestrates the use case."""

    def __init__(self, repo: OrderRepository, notifier: NotificationPort):
        self._repo = repo
        self._notifier = notifier

    def execute(self, customer_id: str, items: list[str], total: float) -> Order:
        import uuid
        order = Order(
            order_id=str(uuid.uuid4())[:8],
            customer_id=customer_id,
            items=tuple(items),
            total=total,
        )
        self._repo.save(order)
        self._notifier.send(customer_id, f"Order {order.order_id} placed!")
        return order


# --- ADAPTERS (outermost) ---
class InMemoryOrderRepository(OrderRepository):
    def __init__(self):
        self._storage: dict[str, Order] = {}

    def save(self, order: Order) -> None:
        self._storage[order.order_id] = order

    def find_by_id(self, order_id: str) -> Order | None:
        return self._storage.get(order_id)

    def find_by_customer(self, customer_id: str) -> list[Order]:
        return [o for o in self._storage.values() if o.customer_id == customer_id]


class ConsoleNotifier(NotificationPort):
    def send(self, customer_id: str, message: str) -> None:
        print(f"[Notification to {customer_id}]: {message}")
```

---

## 4. Clean Architecture (Uncle Bob)

Clean Architecture is Robert Martin's formalization of hexagonal architecture. The dependency
rule is absolute: **source code dependencies must point inward**.

```
+---------------------------------------------------------------------+
|                                                                     |
|  +---------------------------------------------------------------+  |
|  |                                                               |  |
|  |  +-----------------------------------------------------------+|  |
|  |  |                                                           ||  |
|  |  |  +-----------------------------------------------+       ||  |
|  |  |  |              ENTITIES                         |       ||  |
|  |  |  |  (Enterprise business rules, domain objects)  |       ||  |
|  |  |  +-----------------------------------------------+       ||  |
|  |  |                                                           ||  |
|  |  |  USE CASES                                                ||  |
|  |  |  (Application business rules, orchestration)              ||  |
|  |  +-----------------------------------------------------------+|  |
|  |                                                               |  |
|  |  INTERFACE ADAPTERS                                           |  |
|  |  (Controllers, Presenters, Gateways, Repositories)           |  |
|  +---------------------------------------------------------------+  |
|                                                                     |
|  FRAMEWORKS & DRIVERS                                               |
|  (Web framework, database, UI, external services)                   |
+---------------------------------------------------------------------+
```

**The Four Layers:**

| Layer                  | Contains                         | Depends On          |
| ---------------------- | -------------------------------- | ------------------- |
| **Entities**           | Domain objects, business rules   | Nothing             |
| **Use Cases**          | Application logic, orchestration | Entities            |
| **Interface Adapters** | Controllers, repos, presenters   | Use Cases, Entities |
| **Frameworks**         | Flask/Django, PostgreSQL, React  | Interface Adapters  |

**The Dependency Rule:** Code in an inner circle must not know anything about code in an outer
circle. A use case can reference an entity, but an entity must never reference a use case.

---

## 5. Repository Pattern

The Repository pattern abstracts data access behind a collection-like interface. The domain
layer works with repositories without knowing whether data comes from a database, file, or API.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


class Repository(ABC, Generic[T]):
    """Generic repository interface."""

    @abstractmethod
    def find_all(self) -> list[T]:
        pass

    @abstractmethod
    def find_by_id(self, entity_id: str) -> T | None:
        pass

    @abstractmethod
    def save(self, entity: T) -> None:
        pass

    @abstractmethod
    def delete(self, entity_id: str) -> None:
        pass


# --- Domain Entity ---
@dataclass(frozen=True)
class User:
    user_id: str
    name: str
    email: str


# --- Concrete Repositories ---
class InMemoryUserRepository(Repository[User]):
    def __init__(self):
        self._users: dict[str, User] = {}

    def find_all(self) -> list[User]:
        return list(self._users.values())

    def find_by_id(self, entity_id: str) -> User | None:
        return self._users.get(entity_id)

    def save(self, entity: User) -> None:
        self._users[entity.user_id] = entity

    def delete(self, entity_id: str) -> None:
        self._users = {
            k: v for k, v in self._users.items() if k != entity_id
        }


class SQLUserRepository(Repository[User]):
    """Production repository using SQL database."""

    def __init__(self, db_connection):
        self._db = db_connection

    def find_all(self) -> list[User]:
        rows = self._db.execute("SELECT * FROM users")
        return [User(r["id"], r["name"], r["email"]) for r in rows]

    def find_by_id(self, entity_id: str) -> User | None:
        row = self._db.execute(
            "SELECT * FROM users WHERE id = ?", (entity_id,)
        )
        return User(row["id"], row["name"], row["email"]) if row else None

    def save(self, entity: User) -> None:
        self._db.execute(
            "INSERT INTO users (id, name, email) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name=?, email=?",
            (entity.user_id, entity.name, entity.email, entity.name, entity.email)
        )

    def delete(self, entity_id: str) -> None:
        self._db.execute("DELETE FROM users WHERE id = ?", (entity_id,))
```

**Key benefit:** Tests use `InMemoryUserRepository`, production uses `SQLUserRepository`.
The service layer does not change.

---

## 6. Service Layer Pattern

The service layer contains application logic (use cases) and coordinates between domain
objects and infrastructure.

```python
class UserService:
    """Application service: orchestrates user-related use cases."""

    def __init__(self, user_repo: Repository[User], notifier: NotificationPort):
        self._repo = user_repo
        self._notifier = notifier

    def register_user(self, name: str, email: str) -> User:
        # Validation
        if not email or "@" not in email:
            raise ValueError("Invalid email")

        # Check uniqueness
        existing = self._repo.find_all()
        if any(u.email == email for u in existing):
            raise ValueError("Email already registered")

        # Create entity
        import uuid
        user = User(user_id=str(uuid.uuid4())[:8], name=name, email=email)

        # Persist
        self._repo.save(user)

        # Side effects
        self._notifier.send(user.user_id, f"Welcome, {name}!")

        return user

    def get_user(self, user_id: str) -> User:
        user = self._repo.find_by_id(user_id)
        if user is None:
            raise ValueError(f"User {user_id} not found")
        return user

    def delete_user(self, user_id: str) -> None:
        user = self._repo.find_by_id(user_id)
        if user is None:
            raise ValueError(f"User {user_id} not found")
        self._repo.delete(user_id)
```

---

## 7. Domain-Driven Design Basics

DDD is a set of strategic and tactical patterns for modeling complex business domains.
In LLD interviews, know these core concepts:

### Value Objects

Immutable objects defined by their attributes, not by identity.

```python
@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

    def add(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("Cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)

    def multiply(self, factor: float) -> "Money":
        return Money(self.amount * factor, self.currency)


# Two Money objects with same amount and currency are equal
assert Money(10.0, "USD") == Money(10.0, "USD")
```

### Entities

Objects with a unique identity that persists over time.

```python
@dataclass
class Customer:
    customer_id: str    # Identity
    name: str
    email: str
    balance: Money

    def __eq__(self, other) -> bool:
        if not isinstance(other, Customer):
            return False
        return self.customer_id == other.customer_id  # Identity-based equality

    def __hash__(self) -> int:
        return hash(self.customer_id)
```

### Aggregates

A cluster of domain objects treated as a single unit. One entity is the "aggregate root"
that controls access to the others.

```python
class OrderAggregate:
    """Order is the aggregate root. LineItems are part of the aggregate."""

    def __init__(self, order_id: str, customer_id: str):
        self._order_id = order_id
        self._customer_id = customer_id
        self._items: list[LineItem] = []
        self._status = "draft"

    def add_item(self, product_id: str, quantity: int, price: Money) -> None:
        if self._status != "draft":
            raise ValueError("Cannot modify a placed order")
        item = LineItem(product_id, quantity, price)
        self._items = [*self._items, item]

    def place(self) -> None:
        if not self._items:
            raise ValueError("Cannot place an empty order")
        self._status = "placed"

    def total(self) -> Money:
        if not self._items:
            return Money(0, "USD")
        return Money(
            sum(item.subtotal().amount for item in self._items),
            self._items[0].price.currency,
        )


@dataclass(frozen=True)
class LineItem:
    product_id: str
    quantity: int
    price: Money

    def subtotal(self) -> Money:
        return self.price.multiply(self.quantity)
```

### Domain Events

Events that something important happened in the domain.

```python
@dataclass(frozen=True)
class DomainEvent:
    event_type: str
    aggregate_id: str
    timestamp: float
    data: dict

# Examples:
# OrderPlaced(order_id="123", customer_id="456", total=99.99)
# PaymentReceived(order_id="123", amount=99.99)
# OrderShipped(order_id="123", tracking="TRACK-789")
```

---

## 8. Complete Refactoring Example

### BEFORE: Messy Code (Everything in One File)

```python
# BAD: All concerns mixed together
import sqlite3

def create_order(customer_email, items, db_path="orders.db"):
    conn = sqlite3.connect(db_path)

    # Validation mixed with business logic
    if not customer_email or "@" not in customer_email:
        return {"error": "Invalid email"}

    # Business logic mixed with SQL
    total = 0
    for item in items:
        row = conn.execute(
            "SELECT price FROM products WHERE id = ?", (item["id"],)
        ).fetchone()
        if not row:
            return {"error": f"Product {item['id']} not found"}
        total += row[0] * item["qty"]

    # More SQL mixed with business rules
    if total > 1000:
        total *= 0.9  # Discount for large orders

    conn.execute(
        "INSERT INTO orders (email, total, status) VALUES (?, ?, ?)",
        (customer_email, total, "pending"),
    )
    conn.commit()

    # Notification logic mixed in
    import smtplib
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.sendmail("noreply@shop.com", customer_email, f"Order total: ${total}")

    return {"total": total, "status": "pending"}
```

### AFTER: Clean Architecture

```python
# ============================================
# LAYER 1: DOMAIN (innermost, no dependencies)
# ============================================

from dataclasses import dataclass, field
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class Product:
    product_id: str
    name: str
    price: float


@dataclass(frozen=True)
class OrderItem:
    product: Product
    quantity: int

    def subtotal(self) -> float:
        return self.product.price * self.quantity


@dataclass(frozen=True)
class OrderEntity:
    order_id: str
    customer_email: str
    items: tuple[OrderItem, ...]
    total: float
    status: str = "pending"


class DiscountPolicy:
    """Domain service: encapsulates discount business rules."""

    LARGE_ORDER_THRESHOLD = 1000
    LARGE_ORDER_DISCOUNT = 0.9

    def apply(self, subtotal: float) -> float:
        if subtotal > self.LARGE_ORDER_THRESHOLD:
            return subtotal * self.LARGE_ORDER_DISCOUNT
        return subtotal


# ============================================
# LAYER 2: PORTS (interfaces)
# ============================================

class ProductRepository(ABC):
    @abstractmethod
    def find_by_id(self, product_id: str) -> Product | None:
        pass


class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: OrderEntity) -> None:
        pass


class EmailService(ABC):
    @abstractmethod
    def send_order_confirmation(self, email: str, order: OrderEntity) -> None:
        pass


# ============================================
# LAYER 3: USE CASE (application logic)
# ============================================

class CreateOrderUseCase:
    def __init__(
        self,
        product_repo: ProductRepository,
        order_repo: OrderRepository,
        email_service: EmailService,
        discount_policy: DiscountPolicy | None = None,
    ):
        self._products = product_repo
        self._orders = order_repo
        self._email = email_service
        self._discount = discount_policy or DiscountPolicy()

    def execute(self, customer_email: str,
                items: list[dict[str, any]]) -> OrderEntity:
        # Validation
        if not customer_email or "@" not in customer_email:
            raise ValueError("Invalid email address")

        # Build order items
        order_items = []
        for item_req in items:
            product = self._products.find_by_id(item_req["id"])
            if product is None:
                raise ValueError(f"Product {item_req['id']} not found")
            order_items.append(OrderItem(product, item_req["qty"]))

        # Calculate total with discount
        subtotal = sum(oi.subtotal() for oi in order_items)
        total = self._discount.apply(subtotal)

        # Create order
        import uuid
        order = OrderEntity(
            order_id=str(uuid.uuid4())[:8],
            customer_email=customer_email,
            items=tuple(order_items),
            total=total,
        )

        # Persist and notify
        self._orders.save(order)
        self._email.send_order_confirmation(customer_email, order)

        return order


# ============================================
# LAYER 4: ADAPTERS (infrastructure)
# ============================================

class SQLiteProductRepository(ProductRepository):
    def __init__(self, db_path: str):
        import sqlite3
        self._conn = sqlite3.connect(db_path)

    def find_by_id(self, product_id: str) -> Product | None:
        row = self._conn.execute(
            "SELECT id, name, price FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()
        if row is None:
            return None
        return Product(product_id=row[0], name=row[1], price=row[2])


class SQLiteOrderRepository(OrderRepository):
    def __init__(self, db_path: str):
        import sqlite3
        self._conn = sqlite3.connect(db_path)

    def save(self, order: OrderEntity) -> None:
        self._conn.execute(
            "INSERT INTO orders (id, email, total, status) VALUES (?, ?, ?, ?)",
            (order.order_id, order.customer_email, order.total, order.status),
        )
        self._conn.commit()


class SMTPEmailService(EmailService):
    def send_order_confirmation(self, email: str, order: OrderEntity) -> None:
        # Real SMTP logic here
        pass


# ============================================
# TEST ADAPTERS (for unit testing)
# ============================================

class InMemoryProductRepository(ProductRepository):
    def __init__(self, products: list[Product]):
        self._products = {p.product_id: p for p in products}

    def find_by_id(self, product_id: str) -> Product | None:
        return self._products.get(product_id)


class InMemoryOrderRepository(OrderRepository):
    def __init__(self):
        self.saved_orders: list[OrderEntity] = []

    def save(self, order: OrderEntity) -> None:
        self.saved_orders.append(order)


class FakeEmailService(EmailService):
    def __init__(self):
        self.sent_emails: list[tuple[str, OrderEntity]] = []

    def send_order_confirmation(self, email: str, order: OrderEntity) -> None:
        self.sent_emails.append((email, order))


# ============================================
# WIRING (composition root)
# ============================================

def create_production_use_case() -> CreateOrderUseCase:
    return CreateOrderUseCase(
        product_repo=SQLiteProductRepository("shop.db"),
        order_repo=SQLiteOrderRepository("shop.db"),
        email_service=SMTPEmailService(),
    )

def create_test_use_case(products: list[Product]) -> tuple:
    product_repo = InMemoryProductRepository(products)
    order_repo = InMemoryOrderRepository()
    email_svc = FakeEmailService()
    use_case = CreateOrderUseCase(product_repo, order_repo, email_svc)
    return use_case, order_repo, email_svc
```

### What Changed?

| Before                                                         | After                                        |
| -------------------------------------------------------------- | -------------------------------------------- |
| SQL, SMTP, business logic in one function                      | 4 clean layers                               |
| Cannot test without database and email server                  | Test with in-memory adapters                 |
| Adding a new notification channel means modifying the function | Add a new adapter class                      |
| Discount logic buried in SQL query logic                       | Extracted to `DiscountPolicy` domain service |
| No error handling, raw dicts                                   | Typed dataclasses, explicit exceptions       |

---

## 9. Interview Tips

1. **Start with the domain model.** When the interviewer gives you a problem, identify the
   core entities and business rules first. Only then think about databases and APIs.

2. **Draw dependency arrows.** Show that dependencies point inward. "The service depends on
   the repository _interface_, not on PostgreSQL directly."

3. **Mention testability.** "By depending on interfaces, I can test the business logic with
   in-memory fakes in milliseconds, without a database."

4. **Do not over-architect simple problems.** If the interviewer asks for a simple function,
   do not create 4 layers. Apply clean architecture when the problem has multiple concerns.

5. **Name the pattern.** "I'm using the Repository pattern here to decouple persistence from
   domain logic."

---

## 10. Gotchas

- **Anemic domain model:** If your entities are just data containers and all logic lives in
  services, you have an anemic model. Move behavior closer to data.

- **Leaking database concerns:** If your domain entity has a `db_id` field or an `__init__`
  that takes a database row, your domain depends on infrastructure. Use mapping functions.

- **Over-abstraction:** Not every function needs an interface. Abstract at architectural
  boundaries (database, external APIs, notifications), not within a single module.

- **Where does validation go?** Input validation (format, required fields) goes in the
  interface adapter layer. Business validation (age must be >= 18 to sign up) goes in the
  domain or use case layer.

- **Circular dependencies between layers** means your architecture is broken. The dependency
  rule is one-way: always inward.

---

## 11. Quick Reference

```
+---------------------------+------------------------------------------+
| Pattern                   | When to Use                              |
+---------------------------+------------------------------------------+
| Layered Architecture      | Simple apps, CRUD-heavy                  |
| Hexagonal / Ports-Adapters| When you need to swap infrastructure     |
| Clean Architecture        | Complex domains, long-lived projects     |
| Repository Pattern        | Decouple persistence from domain         |
| Service Layer             | Orchestrate use cases across entities    |
| Value Objects             | Money, addresses, coordinates            |
| Entities                  | Objects with identity (users, orders)    |
| Aggregates                | Cluster of related entities              |
| Domain Events             | Decoupled cross-cutting reactions        |
+---------------------------+------------------------------------------+

Dependency Rule:
  Frameworks -> Adapters -> Use Cases -> Entities
  (outer)                               (inner)
  Dependencies ALWAYS point inward.
  Inner layers NEVER know about outer layers.

Testing Strategy:
  Layer            | Test Type   | Dependencies
  Entities         | Unit        | None
  Use Cases        | Unit        | Fake repos/services
  Adapters         | Integration | Real DB / API stubs
  Frameworks       | E2E         | Full stack
```
