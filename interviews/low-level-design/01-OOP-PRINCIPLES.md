# OOP Principles for LLD Interviews

Object-oriented principles are the foundation of every low-level design interview. Interviewers do
not want textbook recitation -- they want to see you *apply* these principles to decompose problems
into clean, extensible code. This guide covers each principle with before/after refactoring examples.

---

## Table of Contents

1. [SOLID Principles](#solid-principles)
2. [DRY, KISS, YAGNI](#dry-kiss-yagni)
3. [Composition Over Inheritance](#composition-over-inheritance)
4. [Dependency Injection](#dependency-injection)
5. [Law of Demeter](#law-of-demeter)
6. [Common Anti-Patterns](#common-anti-patterns)
7. [Interview Tips](#interview-tips)
8. [Quick Reference](#quick-reference)

---

## SOLID Principles

### S -- Single Responsibility Principle (SRP)

> A class should have one, and only one, reason to change.

**BEFORE (violates SRP):**

```python
class Employee:
    def __init__(self, name: str, salary: float):
        self.name = name
        self.salary = salary

    def calculate_pay(self) -> float:
        # Tax logic, overtime logic, deductions...
        return self.salary * 0.8

    def save_to_database(self):
        # SQL insert logic
        print(f"INSERT INTO employees VALUES ('{self.name}', {self.salary})")

    def generate_report(self) -> str:
        # PDF generation logic
        return f"Report for {self.name}: ${self.salary}"
```

This class has THREE reasons to change: pay calculation rules, database schema, or report format.

**AFTER (follows SRP):**

```python
class Employee:
    def __init__(self, name: str, salary: float):
        self.name = name
        self.salary = salary


class PayCalculator:
    def calculate_pay(self, employee: Employee) -> float:
        return employee.salary * 0.8


class EmployeeRepository:
    def save(self, employee: Employee) -> None:
        # Database logic isolated here
        pass


class EmployeeReportGenerator:
    def generate(self, employee: Employee) -> str:
        return f"Report for {employee.name}: ${employee.salary}"
```

**Interview tip:** When you see a class with more than 3-4 public methods that do unrelated things,
it probably violates SRP. Split it.

---

### O -- Open/Closed Principle (OCP)

> Software entities should be open for extension but closed for modification.

**BEFORE (violates OCP):**

```python
class DiscountCalculator:
    def calculate(self, customer_type: str, amount: float) -> float:
        if customer_type == "regular":
            return amount * 0.95
        elif customer_type == "premium":
            return amount * 0.85
        elif customer_type == "vip":
            return amount * 0.75
        # Every new customer type requires modifying this method!
        else:
            return amount
```

Adding a new customer type means editing existing, tested code.

**AFTER (follows OCP):**

```python
from abc import ABC, abstractmethod


class DiscountStrategy(ABC):
    @abstractmethod
    def apply(self, amount: float) -> float:
        pass


class RegularDiscount(DiscountStrategy):
    def apply(self, amount: float) -> float:
        return amount * 0.95


class PremiumDiscount(DiscountStrategy):
    def apply(self, amount: float) -> float:
        return amount * 0.85


class VIPDiscount(DiscountStrategy):
    def apply(self, amount: float) -> float:
        return amount * 0.75


class DiscountCalculator:
    def __init__(self, strategy: DiscountStrategy):
        self._strategy = strategy

    def calculate(self, amount: float) -> float:
        return self._strategy.apply(amount)
```

Now adding a new discount type means adding a new class, not modifying existing ones.

---

### L -- Liskov Substitution Principle (LSP)

> Subtypes must be substitutable for their base types without altering program correctness.

**BEFORE (violates LSP) -- the classic Rectangle/Square problem:**

```python
class Rectangle:
    def __init__(self, width: float, height: float):
        self._width = width
        self._height = height

    def set_width(self, w: float) -> None:
        self._width = w

    def set_height(self, h: float) -> None:
        self._height = h

    def area(self) -> float:
        return self._width * self._height


class Square(Rectangle):
    def set_width(self, w: float) -> None:
        self._width = w
        self._height = w  # Surprise! Setting width also changes height

    def set_height(self, h: float) -> None:
        self._width = h
        self._height = h


def test_area(rect: Rectangle):
    rect.set_width(5)
    rect.set_height(4)
    assert rect.area() == 20  # Fails for Square! area() returns 16
```

**AFTER (follows LSP):**

```python
from abc import ABC, abstractmethod


class Shape(ABC):
    @abstractmethod
    def area(self) -> float:
        pass


class Rectangle(Shape):
    def __init__(self, width: float, height: float):
        self._width = width
        self._height = height

    def area(self) -> float:
        return self._width * self._height


class Square(Shape):
    def __init__(self, side: float):
        self._side = side

    def area(self) -> float:
        return self._side * self._side
```

Square is no longer a subtype of Rectangle. Both implement the Shape interface independently.

---

### I -- Interface Segregation Principle (ISP)

> Clients should not be forced to depend on interfaces they do not use.

**BEFORE (violates ISP):**

```python
from abc import ABC, abstractmethod


class Worker(ABC):
    @abstractmethod
    def work(self) -> None:
        pass

    @abstractmethod
    def eat(self) -> None:
        pass

    @abstractmethod
    def sleep(self) -> None:
        pass


class Robot(Worker):
    def work(self) -> None:
        print("Working...")

    def eat(self) -> None:
        raise NotImplementedError("Robots don't eat!")  # Forced to implement!

    def sleep(self) -> None:
        raise NotImplementedError("Robots don't sleep!")
```

**AFTER (follows ISP):**

```python
from abc import ABC, abstractmethod


class Workable(ABC):
    @abstractmethod
    def work(self) -> None:
        pass


class Eatable(ABC):
    @abstractmethod
    def eat(self) -> None:
        pass


class Sleepable(ABC):
    @abstractmethod
    def sleep(self) -> None:
        pass


class Human(Workable, Eatable, Sleepable):
    def work(self) -> None:
        print("Working...")

    def eat(self) -> None:
        print("Eating...")

    def sleep(self) -> None:
        print("Sleeping...")


class Robot(Workable):
    def work(self) -> None:
        print("Working...")
```

**TypeScript equivalent:**

```typescript
interface Workable {
  work(): void;
}

interface Eatable {
  eat(): void;
}

class Robot implements Workable {
  work(): void {
    console.log("Working...");
  }
  // No need to implement eat()!
}
```

---

### D -- Dependency Inversion Principle (DIP)

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

**BEFORE (violates DIP):**

```python
class MySQLDatabase:
    def query(self, sql: str) -> list:
        # MySQL-specific logic
        return []


class UserService:
    def __init__(self):
        self.db = MySQLDatabase()  # Hardcoded dependency!

    def get_users(self) -> list:
        return self.db.query("SELECT * FROM users")
```

Switching from MySQL to PostgreSQL requires changing UserService.

**AFTER (follows DIP):**

```python
from abc import ABC, abstractmethod


class Database(ABC):
    @abstractmethod
    def query(self, sql: str) -> list:
        pass


class MySQLDatabase(Database):
    def query(self, sql: str) -> list:
        return []  # MySQL implementation


class PostgresDatabase(Database):
    def query(self, sql: str) -> list:
        return []  # Postgres implementation


class UserService:
    def __init__(self, db: Database):
        self._db = db  # Depends on abstraction, not concrete class

    def get_users(self) -> list:
        return self._db.query("SELECT * FROM users")


# Usage -- swap databases without changing UserService
service = UserService(PostgresDatabase())
```

---

## DRY, KISS, YAGNI

### DRY -- Don't Repeat Yourself

**BEFORE:**

```python
class OrderProcessor:
    def process_online_order(self, order):
        tax = order.amount * 0.08
        total = order.amount + tax
        if total > 100:
            total *= 0.95  # 5% discount
        # ... process payment

    def process_store_order(self, order):
        tax = order.amount * 0.08  # Duplicated!
        total = order.amount + tax  # Duplicated!
        if total > 100:  # Duplicated!
            total *= 0.95  # Duplicated!
        # ... process payment
```

**AFTER:**

```python
class OrderProcessor:
    TAX_RATE = 0.08
    DISCOUNT_THRESHOLD = 100
    DISCOUNT_RATE = 0.95

    def _calculate_total(self, amount: float) -> float:
        total = amount * (1 + self.TAX_RATE)
        if total > self.DISCOUNT_THRESHOLD:
            total *= self.DISCOUNT_RATE
        return total

    def process_online_order(self, order):
        total = self._calculate_total(order.amount)
        # ... process online payment

    def process_store_order(self, order):
        total = self._calculate_total(order.amount)
        # ... process store payment
```

### KISS -- Keep It Simple, Stupid

**BEFORE (over-engineered):**

```python
class StringReverserFactory:
    @staticmethod
    def create_reverser(strategy="default"):
        if strategy == "default":
            return DefaultStringReverser()
        elif strategy == "recursive":
            return RecursiveStringReverser()

class DefaultStringReverser:
    def reverse(self, s: str) -> str:
        return s[::-1]
```

**AFTER (KISS):**

```python
def reverse_string(s: str) -> str:
    return s[::-1]
```

Do not create a factory, strategy, and two classes for something a one-line function handles.

### YAGNI -- You Aren't Gonna Need It

Do not build features or abstractions until you actually need them.

```python
# BAD: Building for hypothetical future requirements
class User:
    def __init__(self, name, email, phone, fax, pager,  # Who uses pagers?
                 secondary_email, twitter, instagram,
                 tiktok, threads, bluesky):
        ...

# GOOD: Build for current requirements
class User:
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email
```

**The balance:** In interviews, design for *reasonable* extensibility (use interfaces, follow OCP),
but do not implement features the interviewer did not ask for.

---

## Composition Over Inheritance

Inheritance creates tight coupling. Composition gives you flexibility.

**BEFORE (inheritance hierarchy hell):**

```python
class Animal:
    def eat(self): ...

class FlyingAnimal(Animal):
    def fly(self): ...

class SwimmingAnimal(Animal):
    def swim(self): ...

class FlyingSwimmingAnimal(FlyingAnimal, SwimmingAnimal):  # Diamond problem!
    pass  # What if we need a running-flying-swimming animal?
```

**AFTER (composition):**

```python
from abc import ABC, abstractmethod


class FlyBehavior(ABC):
    @abstractmethod
    def fly(self) -> str:
        pass

class CanFly(FlyBehavior):
    def fly(self) -> str:
        return "Flying!"

class CannotFly(FlyBehavior):
    def fly(self) -> str:
        return "Can't fly."


class SwimBehavior(ABC):
    @abstractmethod
    def swim(self) -> str:
        pass

class CanSwim(SwimBehavior):
    def swim(self) -> str:
        return "Swimming!"


class Animal:
    def __init__(self, name: str, fly_behavior: FlyBehavior, swim_behavior: SwimBehavior):
        self.name = name
        self._fly = fly_behavior
        self._swim = swim_behavior

    def perform_fly(self) -> str:
        return self._fly.fly()

    def perform_swim(self) -> str:
        return self._swim.swim()


# A duck can fly and swim
duck = Animal("Duck", CanFly(), CanSwim())
```

**When to use inheritance:** When there is a true "is-a" relationship AND the subclass genuinely
extends behavior (not just reuses code). Use it for 1-2 levels max.

**When to use composition:** Almost always. When objects "have-a" capability. When you need to
mix and match behaviors. When the hierarchy would exceed 2 levels.

---

## Dependency Injection

Dependency Injection (DI) is the practical application of the Dependency Inversion Principle.
Instead of a class creating its own dependencies, they are provided from the outside.

### Three Types of DI

```python
# 1. Constructor Injection (preferred)
class OrderService:
    def __init__(self, repo: OrderRepository, notifier: Notifier):
        self._repo = repo
        self._notifier = notifier


# 2. Method Injection (when dependency varies per call)
class ReportGenerator:
    def generate(self, formatter: Formatter, data: list) -> str:
        return formatter.format(data)


# 3. Property Injection (least preferred -- leaves object in invalid state)
class OrderService:
    def __init__(self):
        self.repo = None  # Must be set before use -- fragile!
```

### Real-World DI Example

```python
from abc import ABC, abstractmethod


class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, amount: float) -> bool:
        pass


class StripeGateway(PaymentGateway):
    def charge(self, amount: float) -> bool:
        # Stripe API call
        return True


class PayPalGateway(PaymentGateway):
    def charge(self, amount: float) -> bool:
        # PayPal API call
        return True


class CheckoutService:
    def __init__(self, gateway: PaymentGateway):
        self._gateway = gateway

    def process(self, amount: float) -> bool:
        return self._gateway.charge(amount)


# In production
service = CheckoutService(StripeGateway())

# In tests
service = CheckoutService(MockGateway())
```

---

## Law of Demeter

> "Only talk to your immediate friends." A method should only call methods on:
> 1. Its own object (`self`)
> 2. Its parameters
> 3. Objects it creates
> 4. Its direct component objects

**BEFORE (violates Law of Demeter -- "train wreck" code):**

```python
# Reaching through multiple objects
city = order.get_customer().get_address().get_city()
```

If the Address structure changes, this code breaks even though it has nothing to do with addresses.

**AFTER (follows Law of Demeter):**

```python
class Order:
    def __init__(self, customer: Customer):
        self._customer = customer

    def get_shipping_city(self) -> str:
        return self._customer.get_city()


class Customer:
    def __init__(self, address: Address):
        self._address = address

    def get_city(self) -> str:
        return self._address.city
```

Each object only talks to its direct collaborator.

---

## Common Anti-Patterns

### 1. God Object

A single class that knows everything and does everything.

```python
# BAD: God object
class Application:
    def authenticate_user(self): ...
    def process_payment(self): ...
    def send_email(self): ...
    def generate_report(self): ...
    def manage_inventory(self): ...
    def calculate_shipping(self): ...
    # 50 more methods...
```

**Fix:** Break into focused services (AuthService, PaymentService, EmailService, etc.).

### 2. Anemic Domain Model

Objects that are just data bags with no behavior.

```python
# BAD: Anemic -- just getters/setters, logic lives elsewhere
class BankAccount:
    def __init__(self):
        self.balance = 0.0


class AccountService:
    def withdraw(self, account: BankAccount, amount: float):
        if account.balance >= amount:
            account.balance -= amount


# GOOD: Rich domain model -- behavior lives with data
class BankAccount:
    def __init__(self, balance: float = 0.0):
        self._balance = balance

    def withdraw(self, amount: float) -> None:
        if amount > self._balance:
            raise ValueError("Insufficient funds")
        self._balance -= amount

    @property
    def balance(self) -> float:
        return self._balance
```

### 3. Premature Optimization

```python
# BAD: Complex caching before profiling shows it's needed
class UserService:
    def __init__(self):
        self._cache = LRUCache(maxsize=10000)
        self._bloom_filter = BloomFilter(capacity=100000)
        self._connection_pool = ConnectionPool(min=10, max=100)
        # ... do you even have 100 users yet?

# GOOD: Start simple, optimize when data shows you need it
class UserService:
    def __init__(self, repo: UserRepository):
        self._repo = repo

    def get_user(self, user_id: str) -> User:
        return self._repo.find_by_id(user_id)
```

### 4. Feature Envy

A method that uses more features of another class than its own.

```python
# BAD: Feature envy -- this method belongs on Order, not here
class InvoiceGenerator:
    def generate(self, order):
        total = order.quantity * order.price
        tax = total * order.tax_rate
        discount = total * order.discount_rate
        return total + tax - discount

# GOOD: Let Order compute its own total
class Order:
    def compute_total(self) -> float:
        subtotal = self.quantity * self.price
        tax = subtotal * self.tax_rate
        discount = subtotal * self.discount_rate
        return subtotal + tax - discount

class InvoiceGenerator:
    def generate(self, order: Order) -> str:
        return f"Total: ${order.compute_total():.2f}"
```

### 5. Inappropriate Intimacy

Classes that know too much about each other's internals.

```python
# BAD: Directly accessing private attributes of another class
class Engine:
    def __init__(self):
        self._rpm = 0
        self._temperature = 20

class Car:
    def drive(self):
        self.engine._rpm = 3000  # Reaching into Engine's internals!
        if self.engine._temperature > 100:
            self.engine._rpm = 1000

# GOOD: Interact through public methods
class Engine:
    def __init__(self):
        self._rpm = 0

    def accelerate(self, target_rpm: int) -> None:
        self._rpm = min(target_rpm, self._safe_max_rpm())

    def _safe_max_rpm(self) -> int:
        return 6000

class Car:
    def __init__(self, engine: Engine):
        self._engine = engine

    def drive(self):
        self._engine.accelerate(3000)
```

---

## Interview Tips

1. **Name the principle you are applying.** Saying "I'm applying the Open/Closed Principle here
   so we can add new payment types without modifying existing code" shows depth.

2. **Don't over-apply SOLID.** If you create 15 interfaces for a simple problem, the interviewer
   will think you are cargo-culting. Apply principles where they solve real problems.

3. **Start concrete, then abstract.** Write 2-3 concrete implementations first, then extract the
   common interface. This shows the interviewer you think pragmatically.

4. **Composition is almost always the right answer.** When in doubt, favor composition over
   inheritance. The interviewer rarely wants deep inheritance hierarchies.

5. **Know the anti-patterns by name.** Saying "this looks like a God Object, let me refactor"
   shows you recognize code smells.

---

## Gotchas

- **Python's duck typing** can make ISP seem unnecessary. In interviews, use ABCs (Abstract Base
  Classes) to make interfaces explicit. This shows you understand the principle even in a dynamic language.

- **SRP does not mean one method per class.** It means one *reason to change*. A `UserValidator`
  with 5 validation methods still has one responsibility: validating users.

- **LSP violations are subtle.** Any time a subclass throws an exception the parent does not, or
  returns a different type, or has a precondition the parent does not, it violates LSP.

- **DIP does not mean every class needs an interface.** Apply it at architectural boundaries
  (service layer to data layer) and for things you might want to swap (payment gateways, notification
  channels, data stores).

---

## Quick Reference

```
+---------------------+----------------------------------------+------------------------------+
| Principle           | One-Liner                              | Violation Signal             |
+---------------------+----------------------------------------+------------------------------+
| SRP                 | One class, one reason to change        | Class has 5+ unrelated methods|
| OCP                 | Extend by adding, not modifying        | if/elif chains for types     |
| LSP                 | Subtypes must be substitutable         | Subclass raises new exceptions|
| ISP                 | Small, focused interfaces              | Implementing unused methods  |
| DIP                 | Depend on abstractions                 | Constructing deps internally |
| DRY                 | Don't duplicate logic                  | Copy-paste across methods    |
| KISS                | Simplest solution that works           | Factory for one implementation|
| YAGNI               | Build only what you need now           | Unused parameters/methods    |
| Composition > Inh.  | Prefer "has-a" over "is-a"             | Inheritance depth > 2        |
| Law of Demeter      | Talk only to friends                   | Long method chains (a.b.c.d) |
+---------------------+----------------------------------------+------------------------------+
```
