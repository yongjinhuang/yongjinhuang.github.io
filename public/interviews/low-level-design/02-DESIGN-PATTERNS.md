# Design Patterns for LLD Interviews

Design patterns are reusable solutions to common software design problems. In LLD interviews,
knowing when and _why_ to apply a pattern matters more than memorizing the implementation.
This guide covers the 17 most interview-relevant patterns with Python code and real-world use cases.

---

## Table of Contents

1. [Creational Patterns](#creational-patterns)
   - [Factory Method](#factory-method)
   - [Abstract Factory](#abstract-factory)
   - [Builder](#builder)
   - [Singleton](#singleton)
   - [Prototype](#prototype)
2. [Structural Patterns](#structural-patterns)
   - [Adapter](#adapter)
   - [Decorator](#decorator)
   - [Facade](#facade)
   - [Proxy](#proxy)
   - [Composite](#composite)
3. [Behavioral Patterns](#behavioral-patterns)
   - [Strategy](#strategy)
   - [Observer](#observer)
   - [Command](#command)
   - [State](#state)
   - [Template Method](#template-method)
   - [Iterator](#iterator)
   - [Chain of Responsibility](#chain-of-responsibility)
4. [Pattern Selection Guide](#pattern-selection-guide)
5. [Interview Tips](#interview-tips)
6. [Quick Reference](#quick-reference)

---

## Creational Patterns

### Factory Method

**When to use:** When you need to create objects without specifying the exact class, and the
creation logic may vary.

**Real-world use case:** A notification system that creates Email, SMS, or Push notifications
based on user preference.

```python
from abc import ABC, abstractmethod


class Notification(ABC):
    @abstractmethod
    def send(self, message: str) -> None:
        pass


class EmailNotification(Notification):
    def __init__(self, email: str):
        self._email = email

    def send(self, message: str) -> None:
        print(f"Email to {self._email}: {message}")


class SMSNotification(Notification):
    def __init__(self, phone: str):
        self._phone = phone

    def send(self, message: str) -> None:
        print(f"SMS to {self._phone}: {message}")


class PushNotification(Notification):
    def __init__(self, device_token: str):
        self._device_token = device_token

    def send(self, message: str) -> None:
        print(f"Push to {self._device_token}: {message}")


class NotificationFactory:
    @staticmethod
    def create(channel: str, target: str) -> Notification:
        factories = {
            "email": EmailNotification,
            "sms": SMSNotification,
            "push": PushNotification,
        }
        factory = factories.get(channel)
        if factory is None:
            raise ValueError(f"Unknown channel: {channel}")
        return factory(target)


# Usage
notif = NotificationFactory.create("email", "user@example.com")
notif.send("Your order shipped!")
```

---

### Abstract Factory

**When to use:** When you need to create families of related objects that must be used together.

**Real-world use case:** A UI toolkit that creates buttons, text fields, and checkboxes in either
a Material or iOS style -- you never mix Material buttons with iOS text fields.

```python
from abc import ABC, abstractmethod


class Button(ABC):
    @abstractmethod
    def render(self) -> str:
        pass

class TextField(ABC):
    @abstractmethod
    def render(self) -> str:
        pass


class MaterialButton(Button):
    def render(self) -> str:
        return "<MaterialButton />"

class MaterialTextField(TextField):
    def render(self) -> str:
        return "<MaterialTextField />"


class IOSButton(Button):
    def render(self) -> str:
        return "<IOSButton />"

class IOSTextField(TextField):
    def render(self) -> str:
        return "<IOSTextField />"


class UIFactory(ABC):
    @abstractmethod
    def create_button(self) -> Button:
        pass

    @abstractmethod
    def create_text_field(self) -> TextField:
        pass


class MaterialFactory(UIFactory):
    def create_button(self) -> Button:
        return MaterialButton()

    def create_text_field(self) -> TextField:
        return MaterialTextField()


class IOSFactory(UIFactory):
    def create_button(self) -> Button:
        return IOSButton()

    def create_text_field(self) -> TextField:
        return IOSTextField()


def build_ui(factory: UIFactory) -> None:
    button = factory.create_button()
    text_field = factory.create_text_field()
    print(button.render(), text_field.render())
```

---

### Builder

**When to use:** When constructing a complex object step by step, especially when the object
has many optional parameters.

**Real-world use case:** Building HTTP requests, SQL queries, or configuration objects.

```python
class HttpRequest:
    def __init__(self):
        self.method = "GET"
        self.url = ""
        self.headers: dict[str, str] = {}
        self.body: str | None = None
        self.timeout: int = 30

    def __repr__(self) -> str:
        return f"{self.method} {self.url} headers={self.headers}"


class HttpRequestBuilder:
    def __init__(self):
        self._request = HttpRequest()

    def method(self, method: str) -> "HttpRequestBuilder":
        self._request.method = method
        return self

    def url(self, url: str) -> "HttpRequestBuilder":
        self._request.url = url
        return self

    def header(self, key: str, value: str) -> "HttpRequestBuilder":
        self._request.headers = {**self._request.headers, key: value}
        return self

    def body(self, body: str) -> "HttpRequestBuilder":
        self._request.body = body
        return self

    def timeout(self, seconds: int) -> "HttpRequestBuilder":
        self._request.timeout = seconds
        return self

    def build(self) -> HttpRequest:
        if not self._request.url:
            raise ValueError("URL is required")
        return self._request


# Fluent API usage
request = (
    HttpRequestBuilder()
    .method("POST")
    .url("https://api.example.com/users")
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer token123")
    .body('{"name": "Alice"}')
    .timeout(10)
    .build()
)
```

---

### Singleton

**When to use:** When exactly one instance of a class is needed (database connection pool,
logger, configuration manager). Use sparingly -- it is often an anti-pattern in testable code.

```python
import threading


class DatabasePool:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:  # Double-checked locking
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._connections: list = []
        self._max_size = 10

    def get_connection(self):
        # Return a connection from the pool
        pass


# Both variables reference the same instance
pool1 = DatabasePool()
pool2 = DatabasePool()
assert pool1 is pool2
```

**Interview tip:** Always mention that Singleton makes unit testing harder because you cannot
easily substitute a mock. Prefer dependency injection when possible.

---

### Prototype

**When to use:** When creating a new object is expensive and you can clone an existing one.

```python
import copy
from abc import ABC, abstractmethod


class Prototype(ABC):
    @abstractmethod
    def clone(self) -> "Prototype":
        pass


class GameUnit(Prototype):
    def __init__(self, name: str, health: int, attack: int, abilities: list[str]):
        self.name = name
        self.health = health
        self.attack = attack
        self.abilities = abilities

    def clone(self) -> "GameUnit":
        return copy.deepcopy(self)

    def __repr__(self) -> str:
        return f"GameUnit({self.name}, hp={self.health}, atk={self.attack})"


# Create a template unit
warrior_template = GameUnit("Warrior", 100, 15, ["slash", "block"])

# Clone instead of rebuilding from scratch
warrior1 = warrior_template.clone()
warrior1.name = "Warrior-1"

warrior2 = warrior_template.clone()
warrior2.name = "Warrior-2"
warrior2.abilities = [*warrior2.abilities, "charge"]
```

---

## Structural Patterns

### Adapter

**When to use:** When you need to make an existing class work with an interface it does not implement.

**Real-world use case:** Integrating a third-party payment library that has a different API
than your system expects.

```python
from abc import ABC, abstractmethod


# Your system's interface
class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, amount: float, currency: str) -> bool:
        pass


# Third-party library with incompatible interface
class StripeSDK:
    def create_charge(self, amount_cents: int, cur: str) -> dict:
        return {"status": "succeeded", "amount": amount_cents}


# Adapter bridges the gap
class StripeAdapter(PaymentProcessor):
    def __init__(self, stripe: StripeSDK):
        self._stripe = stripe

    def pay(self, amount: float, currency: str) -> bool:
        amount_cents = int(amount * 100)
        result = self._stripe.create_charge(amount_cents, currency)
        return result["status"] == "succeeded"


# Your code works with PaymentProcessor, unaware of Stripe's API
processor: PaymentProcessor = StripeAdapter(StripeSDK())
processor.pay(29.99, "USD")
```

---

### Decorator

**When to use:** When you want to add behavior to an object dynamically without modifying
its class. Different from Python's `@decorator` syntax (though related in spirit).

**Real-world use case:** Adding logging, caching, or retry logic to a service.

```python
from abc import ABC, abstractmethod
import time


class DataService(ABC):
    @abstractmethod
    def get_data(self, key: str) -> str:
        pass


class DatabaseService(DataService):
    def get_data(self, key: str) -> str:
        time.sleep(0.1)  # Simulate DB call
        return f"data-for-{key}"


class CachingDecorator(DataService):
    def __init__(self, wrapped: DataService):
        self._wrapped = wrapped
        self._cache: dict[str, str] = {}

    def get_data(self, key: str) -> str:
        if key not in self._cache:
            self._cache[key] = self._wrapped.get_data(key)
        return self._cache[key]


class LoggingDecorator(DataService):
    def __init__(self, wrapped: DataService):
        self._wrapped = wrapped

    def get_data(self, key: str) -> str:
        print(f"[LOG] get_data called with key={key}")
        result = self._wrapped.get_data(key)
        print(f"[LOG] get_data returned {result}")
        return result


# Stack decorators: logging -> caching -> database
service = LoggingDecorator(CachingDecorator(DatabaseService()))
service.get_data("user:123")  # Logs + cache miss + DB call
service.get_data("user:123")  # Logs + cache hit (no DB call)
```

---

### Facade

**When to use:** When you want to provide a simplified interface to a complex subsystem.

**Real-world use case:** A single `OrderFacade.place_order()` that coordinates inventory,
payment, shipping, and notification subsystems.

```python
class InventoryService:
    def check_stock(self, item_id: str) -> bool:
        return True

    def reserve(self, item_id: str, qty: int) -> None:
        pass


class PaymentService:
    def charge(self, user_id: str, amount: float) -> str:
        return "txn_12345"


class ShippingService:
    def create_shipment(self, item_id: str, address: str) -> str:
        return "ship_67890"


class NotificationService:
    def send(self, user_id: str, message: str) -> None:
        pass


class OrderFacade:
    """Simplified interface to the ordering subsystem."""

    def __init__(
        self,
        inventory: InventoryService,
        payment: PaymentService,
        shipping: ShippingService,
        notifications: NotificationService,
    ):
        self._inventory = inventory
        self._payment = payment
        self._shipping = shipping
        self._notifications = notifications

    def place_order(self, user_id: str, item_id: str, qty: int,
                    amount: float, address: str) -> str:
        if not self._inventory.check_stock(item_id):
            raise ValueError("Item out of stock")

        self._inventory.reserve(item_id, qty)
        txn_id = self._payment.charge(user_id, amount)
        ship_id = self._shipping.create_shipment(item_id, address)
        self._notifications.send(user_id, f"Order placed! Tracking: {ship_id}")
        return ship_id
```

---

### Proxy

**When to use:** When you need to control access to an object (lazy loading, access control,
logging, remote proxy).

```python
from abc import ABC, abstractmethod


class Image(ABC):
    @abstractmethod
    def display(self) -> str:
        pass


class HighResImage(Image):
    def __init__(self, filename: str):
        self._filename = filename
        self._data = self._load_from_disk()  # Expensive!

    def _load_from_disk(self) -> bytes:
        print(f"Loading {self._filename} from disk...")
        return b"image_data"

    def display(self) -> str:
        return f"Displaying {self._filename}"


class LazyImageProxy(Image):
    """Defers loading until the image is actually displayed."""

    def __init__(self, filename: str):
        self._filename = filename
        self._real_image: HighResImage | None = None

    def display(self) -> str:
        if self._real_image is None:
            self._real_image = HighResImage(self._filename)
        return self._real_image.display()


# Image is not loaded until display() is called
proxy = LazyImageProxy("photo.jpg")
# ... later, when actually needed:
proxy.display()  # NOW it loads from disk
```

---

### Composite

**When to use:** When you want to treat individual objects and groups of objects uniformly.
Classic example: file system (files and directories), UI components (leaves and containers).

```python
from abc import ABC, abstractmethod


class FileSystemNode(ABC):
    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def get_size(self) -> int:
        pass

    @abstractmethod
    def display(self, indent: int = 0) -> str:
        pass


class File(FileSystemNode):
    def __init__(self, name: str, size: int):
        super().__init__(name)
        self._size = size

    def get_size(self) -> int:
        return self._size

    def display(self, indent: int = 0) -> str:
        return f"{'  ' * indent}{self.name} ({self._size}B)"


class Directory(FileSystemNode):
    def __init__(self, name: str):
        super().__init__(name)
        self._children: list[FileSystemNode] = []

    def add(self, node: FileSystemNode) -> None:
        self._children = [*self._children, node]

    def remove(self, name: str) -> None:
        self._children = [c for c in self._children if c.name != name]

    def get_size(self) -> int:
        return sum(child.get_size() for child in self._children)

    def display(self, indent: int = 0) -> str:
        lines = [f"{'  ' * indent}{self.name}/"]
        for child in self._children:
            lines.append(child.display(indent + 1))
        return "\n".join(lines)


# Build a tree
root = Directory("root")
src = Directory("src")
src.add(File("main.py", 1200))
src.add(File("utils.py", 800))
root.add(src)
root.add(File("README.md", 300))

print(root.display())
print(f"Total size: {root.get_size()}B")
```

---

## Behavioral Patterns

### Strategy

**When to use:** When you have multiple algorithms for a task and want to swap them at runtime.

**Real-world use case:** Payment processing with different gateways.

```python
from abc import ABC, abstractmethod


class PricingStrategy(ABC):
    @abstractmethod
    def calculate(self, base_price: float) -> float:
        pass


class RegularPricing(PricingStrategy):
    def calculate(self, base_price: float) -> float:
        return base_price


class HappyHourPricing(PricingStrategy):
    def calculate(self, base_price: float) -> float:
        return base_price * 0.5


class MemberPricing(PricingStrategy):
    def __init__(self, discount_pct: float):
        self._discount = discount_pct

    def calculate(self, base_price: float) -> float:
        return base_price * (1 - self._discount)


class Order:
    def __init__(self, items: list[float], strategy: PricingStrategy):
        self._items = items
        self._strategy = strategy

    def total(self) -> float:
        return sum(self._strategy.calculate(price) for price in self._items)


# Switch strategies at runtime
order = Order([10.0, 20.0, 30.0], HappyHourPricing())
print(f"Happy hour total: ${order.total():.2f}")  # $30.00
```

---

### Observer

**When to use:** When one object changes state and multiple other objects need to react,
without tight coupling between them.

**Real-world use case:** Event systems, pub/sub, UI data binding.

```python
from abc import ABC, abstractmethod
from typing import Any


class EventBus:
    """A simple publish/subscribe event system."""

    def __init__(self):
        self._subscribers: dict[str, list["Subscriber"]] = {}

    def subscribe(self, event_type: str, subscriber: "Subscriber") -> None:
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type] = [
            *self._subscribers[event_type], subscriber
        ]

    def unsubscribe(self, event_type: str, subscriber: "Subscriber") -> None:
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                s for s in self._subscribers[event_type] if s is not subscriber
            ]

    def publish(self, event_type: str, data: Any) -> None:
        for subscriber in self._subscribers.get(event_type, []):
            subscriber.on_event(event_type, data)


class Subscriber(ABC):
    @abstractmethod
    def on_event(self, event_type: str, data: Any) -> None:
        pass


class EmailNotifier(Subscriber):
    def on_event(self, event_type: str, data: Any) -> None:
        print(f"[Email] Event '{event_type}': {data}")


class AuditLogger(Subscriber):
    def on_event(self, event_type: str, data: Any) -> None:
        print(f"[Audit] Logged event '{event_type}': {data}")


class AnalyticsTracker(Subscriber):
    def on_event(self, event_type: str, data: Any) -> None:
        print(f"[Analytics] Tracked '{event_type}'")


# Usage
bus = EventBus()
bus.subscribe("order.placed", EmailNotifier())
bus.subscribe("order.placed", AuditLogger())
bus.subscribe("order.placed", AnalyticsTracker())

bus.publish("order.placed", {"order_id": "ORD-123", "total": 99.99})
```

---

### Command

**When to use:** When you want to encapsulate a request as an object, enabling undo/redo,
queuing, or logging of operations.

**Real-world use case:** Text editor undo/redo, transaction systems.

```python
from abc import ABC, abstractmethod


class Command(ABC):
    @abstractmethod
    def execute(self) -> None:
        pass

    @abstractmethod
    def undo(self) -> None:
        pass


class TextEditor:
    def __init__(self):
        self.content = ""

    def insert(self, text: str, position: int) -> None:
        self.content = self.content[:position] + text + self.content[position:]

    def delete(self, position: int, length: int) -> str:
        deleted = self.content[position:position + length]
        self.content = self.content[:position] + self.content[position + length:]
        return deleted


class InsertCommand(Command):
    def __init__(self, editor: TextEditor, text: str, position: int):
        self._editor = editor
        self._text = text
        self._position = position

    def execute(self) -> None:
        self._editor.insert(self._text, self._position)

    def undo(self) -> None:
        self._editor.delete(self._position, len(self._text))


class DeleteCommand(Command):
    def __init__(self, editor: TextEditor, position: int, length: int):
        self._editor = editor
        self._position = position
        self._length = length
        self._deleted_text = ""

    def execute(self) -> None:
        self._deleted_text = self._editor.delete(self._position, self._length)

    def undo(self) -> None:
        self._editor.insert(self._deleted_text, self._position)


class CommandHistory:
    def __init__(self):
        self._undo_stack: list[Command] = []
        self._redo_stack: list[Command] = []

    def execute(self, command: Command) -> None:
        command.execute()
        self._undo_stack = [*self._undo_stack, command]
        self._redo_stack = []  # Clear redo stack on new action

    def undo(self) -> None:
        if not self._undo_stack:
            return
        command = self._undo_stack[-1]
        self._undo_stack = self._undo_stack[:-1]
        command.undo()
        self._redo_stack = [*self._redo_stack, command]

    def redo(self) -> None:
        if not self._redo_stack:
            return
        command = self._redo_stack[-1]
        self._redo_stack = self._redo_stack[:-1]
        command.execute()
        self._undo_stack = [*self._undo_stack, command]
```

---

### State

**When to use:** When an object's behavior changes based on its internal state, and you want
to avoid large if/elif chains.

**Real-world use case:** Vending machine, order lifecycle, traffic light.

```python
from abc import ABC, abstractmethod


class VendingState(ABC):
    @abstractmethod
    def insert_coin(self, machine: "VendingMachine") -> str:
        pass

    @abstractmethod
    def select_product(self, machine: "VendingMachine") -> str:
        pass

    @abstractmethod
    def dispense(self, machine: "VendingMachine") -> str:
        pass


class IdleState(VendingState):
    def insert_coin(self, machine: "VendingMachine") -> str:
        machine.set_state(HasCoinState())
        return "Coin accepted. Select a product."

    def select_product(self, machine: "VendingMachine") -> str:
        return "Please insert a coin first."

    def dispense(self, machine: "VendingMachine") -> str:
        return "Please insert a coin and select a product."


class HasCoinState(VendingState):
    def insert_coin(self, machine: "VendingMachine") -> str:
        return "Coin already inserted."

    def select_product(self, machine: "VendingMachine") -> str:
        machine.set_state(DispensingState())
        return "Product selected. Dispensing..."

    def dispense(self, machine: "VendingMachine") -> str:
        return "Please select a product first."


class DispensingState(VendingState):
    def insert_coin(self, machine: "VendingMachine") -> str:
        return "Please wait, dispensing in progress."

    def select_product(self, machine: "VendingMachine") -> str:
        return "Already dispensing."

    def dispense(self, machine: "VendingMachine") -> str:
        machine.set_state(IdleState())
        return "Product dispensed. Thank you!"


class VendingMachine:
    def __init__(self):
        self._state: VendingState = IdleState()

    def set_state(self, state: VendingState) -> None:
        self._state = state

    def insert_coin(self) -> str:
        return self._state.insert_coin(self)

    def select_product(self) -> str:
        return self._state.select_product(self)

    def dispense(self) -> str:
        return self._state.dispense(self)
```

---

### Template Method

**When to use:** When you have an algorithm with fixed steps but some steps vary by subclass.

**Real-world use case:** Data parsers (CSV, JSON, XML) that all follow read -> parse -> validate -> transform.

```python
from abc import ABC, abstractmethod


class DataProcessor(ABC):
    """Template method: the process() method defines the skeleton."""

    def process(self, source: str) -> list[dict]:
        raw = self._read(source)
        parsed = self._parse(raw)
        validated = self._validate(parsed)
        return self._transform(validated)

    @abstractmethod
    def _read(self, source: str) -> str:
        pass

    @abstractmethod
    def _parse(self, raw: str) -> list[dict]:
        pass

    def _validate(self, records: list[dict]) -> list[dict]:
        """Default validation -- subclasses can override."""
        return [r for r in records if r]

    def _transform(self, records: list[dict]) -> list[dict]:
        """Default transform -- no-op. Subclasses can override."""
        return records


class CSVProcessor(DataProcessor):
    def _read(self, source: str) -> str:
        # Read CSV file
        return "name,age\nAlice,30\nBob,25"

    def _parse(self, raw: str) -> list[dict]:
        lines = raw.strip().split("\n")
        headers = lines[0].split(",")
        return [
            dict(zip(headers, line.split(",")))
            for line in lines[1:]
        ]


class JSONProcessor(DataProcessor):
    def _read(self, source: str) -> str:
        return '[{"name": "Alice", "age": 30}]'

    def _parse(self, raw: str) -> list[dict]:
        import json
        return json.loads(raw)
```

---

### Iterator

**When to use:** When you want to provide a way to access elements of a collection sequentially
without exposing its underlying representation.

```python
from typing import Iterator, Generic, TypeVar

T = TypeVar("T")


class PaginatedResult(Generic[T]):
    """Iterates over paginated API results transparently."""

    def __init__(self, fetch_page, page_size: int = 10):
        self._fetch_page = fetch_page
        self._page_size = page_size

    def __iter__(self) -> Iterator[T]:
        page = 0
        while True:
            items = self._fetch_page(page, self._page_size)
            if not items:
                break
            for item in items:
                yield item
            if len(items) < self._page_size:
                break
            page += 1


# Usage -- consumer doesn't know about pagination
def fetch_users(page: int, size: int) -> list[dict]:
    # Simulate paginated API
    all_users = [{"id": i, "name": f"User-{i}"} for i in range(25)]
    start = page * size
    return all_users[start:start + size]

for user in PaginatedResult(fetch_users, page_size=10):
    print(user["name"])
```

---

### Chain of Responsibility

**When to use:** When a request should be processed by one of several handlers, and the
handler is determined at runtime.

**Real-world use case:** Middleware pipelines, logging level filters, approval workflows.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PurchaseRequest:
    amount: float
    description: str


class Approver(ABC):
    def __init__(self):
        self._next: Approver | None = None

    def set_next(self, approver: "Approver") -> "Approver":
        self._next = approver
        return approver

    def handle(self, request: PurchaseRequest) -> str:
        if self._can_approve(request):
            return self._approve(request)
        if self._next:
            return self._next.handle(request)
        return f"No one can approve ${request.amount:.2f}"

    @abstractmethod
    def _can_approve(self, request: PurchaseRequest) -> bool:
        pass

    @abstractmethod
    def _approve(self, request: PurchaseRequest) -> str:
        pass


class TeamLead(Approver):
    def _can_approve(self, request: PurchaseRequest) -> bool:
        return request.amount <= 1000

    def _approve(self, request: PurchaseRequest) -> str:
        return f"Team Lead approved ${request.amount:.2f}"


class Manager(Approver):
    def _can_approve(self, request: PurchaseRequest) -> bool:
        return request.amount <= 10000

    def _approve(self, request: PurchaseRequest) -> str:
        return f"Manager approved ${request.amount:.2f}"


class VP(Approver):
    def _can_approve(self, request: PurchaseRequest) -> bool:
        return request.amount <= 100000

    def _approve(self, request: PurchaseRequest) -> str:
        return f"VP approved ${request.amount:.2f}"


# Build the chain
lead = TeamLead()
manager = Manager()
vp = VP()
lead.set_next(manager).set_next(vp)

print(lead.handle(PurchaseRequest(500, "Keyboard")))     # Team Lead
print(lead.handle(PurchaseRequest(5000, "Server")))      # Manager
print(lead.handle(PurchaseRequest(50000, "Data Center"))) # VP
```

---

## Pattern Selection Guide

```
+-----------------------------------+--------------------------------------+
| Problem                           | Pattern                              |
+-----------------------------------+--------------------------------------+
| Create objects without specifying  | Factory Method / Abstract Factory    |
| exact class                        |                                      |
+-----------------------------------+--------------------------------------+
| Build complex objects step by step | Builder                              |
+-----------------------------------+--------------------------------------+
| Ensure only one instance exists    | Singleton (use sparingly!)           |
+-----------------------------------+--------------------------------------+
| Make incompatible interfaces work  | Adapter                              |
| together                          |                                      |
+-----------------------------------+--------------------------------------+
| Add behavior without modifying     | Decorator                            |
| existing classes                   |                                      |
+-----------------------------------+--------------------------------------+
| Simplify a complex subsystem       | Facade                               |
+-----------------------------------+--------------------------------------+
| Control/defer access to an object  | Proxy                                |
+-----------------------------------+--------------------------------------+
| Treat single and composite objects | Composite                            |
| uniformly                          |                                      |
+-----------------------------------+--------------------------------------+
| Swap algorithms at runtime         | Strategy                             |
+-----------------------------------+--------------------------------------+
| Notify multiple objects of changes | Observer                             |
+-----------------------------------+--------------------------------------+
| Encapsulate actions for undo/redo  | Command                              |
+-----------------------------------+--------------------------------------+
| Object behavior depends on state   | State                                |
+-----------------------------------+--------------------------------------+
| Algorithm skeleton with varying    | Template Method                      |
| steps                              |                                      |
+-----------------------------------+--------------------------------------+
| Pass request along a chain of      | Chain of Responsibility              |
| handlers                           |                                      |
+-----------------------------------+--------------------------------------+
```

---

## Interview Tips

1. **Don't force patterns.** If the interviewer asks "design a parking lot" and you start with
   Abstract Factory before understanding the requirements, it looks like you are pattern-shopping.

2. **Name the pattern when you use it.** "I'll use the Strategy pattern here for pricing so we
   can swap algorithms without changing the Order class." This shows intentionality.

3. **Know Strategy vs State.** They look similar (both use composition to delegate behavior).
   Strategy: client chooses which algorithm to use. State: the object itself transitions between states.

4. **Command pattern is extremely versatile.** Undo/redo, macro recording, job queues, event
   sourcing -- if the interview involves any of these, reach for Command.

5. **Composite appears in almost every LLD problem.** File systems, org charts, UI hierarchies,
   menu systems -- any tree structure is a Composite.

---

## Gotchas

- **Singleton is a code smell in most cases.** If the interviewer asks for one, implement it
  but mention that DI is usually preferable for testability.

- **Decorator chains can get confusing.** Keep the chain short (2-3 decorators max) in interviews.

- **Observer can cause memory leaks** if subscribers are not unsubscribed. Always mention cleanup.

- **Abstract Factory creates coupling between factory and products.** Adding a new product type
  requires changing the factory interface and ALL concrete factories.

---

## Quick Reference

```
+-----------------+-------------+--------------------------------------------+
| Category        | Pattern     | Key Signal in Interview                    |
+-----------------+-------------+--------------------------------------------+
| Creational      | Factory     | "create X without knowing exact type"      |
|                 | Builder     | "complex object with many optional parts"  |
|                 | Singleton   | "exactly one instance system-wide"         |
|                 | Prototype   | "clone existing object, expensive to create"|
+-----------------+-------------+--------------------------------------------+
| Structural      | Adapter     | "make third-party lib fit our interface"   |
|                 | Decorator   | "add logging/caching/retry to existing"    |
|                 | Facade      | "simplify complex subsystem interaction"   |
|                 | Proxy       | "lazy load / access control / remote"      |
|                 | Composite   | "tree structure, uniform leaf/branch API"  |
+-----------------+-------------+--------------------------------------------+
| Behavioral      | Strategy    | "swap algorithm/behavior at runtime"       |
|                 | Observer    | "one changes, many react"                  |
|                 | Command     | "undo/redo, queue actions, event sourcing"  |
|                 | State       | "behavior changes with internal state"     |
|                 | Template    | "same steps, different implementations"    |
|                 | Iterator    | "traverse collection without exposing impl" |
|                 | Chain       | "pass request through handler pipeline"    |
+-----------------+-------------+--------------------------------------------+
```
