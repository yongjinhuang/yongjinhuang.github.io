# Design a Vending Machine

The vending machine is a classic LLD interview question that tests your ability to implement the
State pattern, handle monetary transactions, and manage inventory. It is a great problem because
it has clear state transitions that can be drawn on a whiteboard and a natural fit for several
design patterns.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [State Machine](#3-state-machine)
4. [Core Implementation](#4-core-implementation)
5. [Payment and Change Calculation](#5-payment-and-change-calculation)
6. [Admin Operations](#6-admin-operations)
7. [Interview Walkthrough](#7-interview-walkthrough)
8. [Common Follow-Up Questions](#8-common-follow-up-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement      | Details                                                    |
| --- | ---------------- | ---------------------------------------------------------- |
| F1  | Product slots    | Multiple products stored in slots with quantity tracking   |
| F2  | Insert money     | Accept coins and bills, track running balance              |
| F3  | Select product   | User selects by slot code (e.g., A1, B2)                   |
| F4  | Dispense product | Deliver product if balance is sufficient and item in stock |
| F5  | Return change    | Calculate and return change using greedy coin algorithm    |
| F6  | Refund           | User can cancel and get full refund at any point           |
| F7  | Admin restock    | Admin can restock products and collect money               |
| F8  | Display          | Show available products, prices, and current balance       |

### Non-Functional Requirements

| #   | Requirement                                              |
| --- | -------------------------------------------------------- |
| NF1 | Thread-safe (concurrent users at multi-unit deployments) |
| NF2 | Extensible for new payment types (card, mobile)          |
| NF3 | Clear state transitions with no invalid states           |

### Clarifying Questions to Ask

- "What denominations are accepted?" (Coins: 5c, 10c, 25c, 50c, $1. Bills: $1, $5)
- "Can the machine run out of change?" (Yes, handle this gracefully)
- "Is there an admin interface for restocking?" (Yes, separate from customer flow)
- "Can multiple users interact simultaneously?" (One at a time per machine, but thread-safe)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   Denomination    |       |   VendingState      |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| NICKEL (5)        |       | IDLE                |
| DIME (10)         |       | HAS_MONEY           |
| QUARTER (25)      |       | DISPENSING           |
| HALF_DOLLAR (50)  |       | OUT_OF_SERVICE       |
| DOLLAR_COIN (100) |       +---------------------+
| BILL_1 (100)      |
| BILL_5 (500)      |       +---------------------+
+-------------------+       |   Product           |
                            |---------------------|
+-------------------+       | name                |
|   Slot            |       | price_cents         |
|-------------------|       +---------------------+
| code              |              |
| product           |       +---------------------+
| quantity           |       |   ChangeCalculator  |
| price_cents        |       |---------------------|
|-------------------|       | available_coins     |
| is_available()    |       |---------------------|
| dispense()        |       | make_change(amount) |
+-------------------+       +---------------------+
        |
+-------------------+       +---------------------+
|   StateHandler    |       |   VendingMachine    |
|   (ABC)           |       |---------------------|
|-------------------|       | slots               |
| insert_money()    |       | balance_cents       |
| select_product()  |       | state               |
| dispense()        |       | change_calculator   |
| refund()          |       |---------------------|
+-------------------+       | insert_money(denom) |
   ^    ^    ^              | select_product(code)|
   |    |    |              | refund()            |
 Idle HasMoney Dispensing   | get_display()       |
                            +---------------------+
```

---

## 3. State Machine

```
                +------------------+
      +-------->|      IDLE        |<-----------+
      |         +------------------+            |
      |           |                             |
      |     insert money                        |
      |           |                             |
      |           v                             |
      |   +------------------+                  |
      +---| HAS_MONEY        |--+               |
  refund  +------------------+  |               |
          | |                   |               |
          | +-- insert more     |               |
          |     money (loop)    |               |
          |                     |               |
          | select product      |               |
          | (sufficient funds   |               |
          |  + in stock)        |               |
          v                     |               |
    +------------------+        |               |
    | DISPENSING        |-------+               |
    +------------------+  (insufficient funds   |
          |               or out of stock ->    |
          |                stay HAS_MONEY)      |
     dispense complete                          |
     + return change                            |
          |                                     |
          +-------------------------------------+

    +------------------+
    | OUT_OF_SERVICE    |  (admin maintenance / all slots empty)
    +------------------+
```

**Transitions:**

| From           | Event             | To             | Action                   |
| -------------- | ----------------- | -------------- | ------------------------ |
| IDLE           | Insert money      | HAS_MONEY      | Add to balance           |
| HAS_MONEY      | Insert money      | HAS_MONEY      | Add to balance           |
| HAS_MONEY      | Select (valid)    | DISPENSING     | Begin dispensing         |
| HAS_MONEY      | Select (invalid)  | HAS_MONEY      | Show error, keep balance |
| HAS_MONEY      | Refund            | IDLE           | Return all money         |
| DISPENSING     | Dispense complete | IDLE           | Give product + change    |
| Any            | Admin maintenance | OUT_OF_SERVICE | Lock machine             |
| OUT_OF_SERVICE | Admin unlock      | IDLE           | Resume operation         |

---

## 4. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass
from abc import ABC, abstractmethod
import threading


class Denomination(Enum):
    NICKEL = 5
    DIME = 10
    QUARTER = 25
    HALF_DOLLAR = 50
    DOLLAR_COIN = 100
    BILL_1 = 100
    BILL_5 = 500


class VendingState(Enum):
    IDLE = "idle"
    HAS_MONEY = "has_money"
    DISPENSING = "dispensing"
    OUT_OF_SERVICE = "out_of_service"


@dataclass(frozen=True)
class Product:
    name: str
    price_cents: int

    def __str__(self) -> str:
        return f"{self.name} (${self.price_cents / 100:.2f})"
```

### Slot

```python
class Slot:
    def __init__(self, code: str, product: Product, quantity: int, price_cents: int):
        self._code = code
        self._product = product
        self._quantity = quantity
        self._price_cents = price_cents

    @property
    def code(self) -> str:
        return self._code

    @property
    def product(self) -> Product:
        return self._product

    @property
    def quantity(self) -> int:
        return self._quantity

    @property
    def price_cents(self) -> int:
        return self._price_cents

    @price_cents.setter
    def price_cents(self, value: int) -> None:
        if value <= 0:
            raise ValueError("Price must be positive")
        self._price_cents = value

    def is_available(self) -> bool:
        return self._quantity > 0

    def dispense(self) -> Product:
        if not self.is_available():
            raise ValueError(f"Slot {self._code} is empty")
        self._quantity -= 1
        return self._product

    def restock(self, amount: int) -> None:
        if amount < 0:
            raise ValueError("Restock amount must be non-negative")
        self._quantity += amount

    def __repr__(self) -> str:
        status = f"x{self._quantity}" if self.is_available() else "EMPTY"
        return f"[{self._code}] {self._product.name} ${self._price_cents / 100:.2f} ({status})"
```

### Change Calculator

```python
class ChangeCalculator:
    """Calculates change using a greedy algorithm.

    Maintains a pool of available coins. When making change, it returns
    the fewest coins possible by trying the largest denominations first.
    """

    # Only coins can be returned as change (not bills)
    COIN_VALUES = [100, 50, 25, 10, 5]

    def __init__(self) -> None:
        self._coin_pool: dict[int, int] = {v: 0 for v in self.COIN_VALUES}

    @property
    def coin_pool(self) -> dict[int, int]:
        return dict(self._coin_pool)

    def add_coins(self, value: int, count: int = 1) -> None:
        if value in self._coin_pool:
            self._coin_pool[value] += count

    def make_change(self, amount_cents: int) -> list[int] | None:
        """Return a list of coin values summing to amount_cents, or None if impossible.

        Uses greedy: try largest coins first. This works correctly for
        standard US denominations (5, 10, 25, 50, 100).
        """
        if amount_cents == 0:
            return []

        if amount_cents < 0:
            return None

        change: list[int] = []
        remaining = amount_cents
        # Work on a copy so we can roll back on failure
        pool_copy = dict(self._coin_pool)

        for coin_value in self.COIN_VALUES:
            while remaining >= coin_value and pool_copy[coin_value] > 0:
                change.append(coin_value)
                remaining -= coin_value
                pool_copy[coin_value] -= 1

        if remaining != 0:
            return None  # Cannot make exact change

        # Commit: update the real pool
        self._coin_pool = pool_copy
        return change

    def load_coins(self, value: int, count: int) -> None:
        """Admin loads coins into the machine for making change."""
        if value not in self._coin_pool:
            raise ValueError(f"Invalid coin value: {value}")
        self._coin_pool[value] += count
```

### State Handlers

```python
class StateHandler(ABC):
    """Base class for state-specific behavior."""

    @abstractmethod
    def insert_money(self, machine: "VendingMachine", denomination: Denomination) -> str:
        pass

    @abstractmethod
    def select_product(self, machine: "VendingMachine", slot_code: str) -> str:
        pass

    @abstractmethod
    def refund(self, machine: "VendingMachine") -> str:
        pass


class IdleStateHandler(StateHandler):
    def insert_money(self, machine: "VendingMachine", denomination: Denomination) -> str:
        machine.add_to_balance(denomination.value)
        machine.set_state(VendingState.HAS_MONEY)
        return f"Inserted {denomination.name}. Balance: ${machine.balance_cents / 100:.2f}"

    def select_product(self, machine: "VendingMachine", slot_code: str) -> str:
        return "Please insert money first."

    def refund(self, machine: "VendingMachine") -> str:
        return "No money to refund."


class HasMoneyStateHandler(StateHandler):
    def insert_money(self, machine: "VendingMachine", denomination: Denomination) -> str:
        machine.add_to_balance(denomination.value)
        return f"Inserted {denomination.name}. Balance: ${machine.balance_cents / 100:.2f}"

    def select_product(self, machine: "VendingMachine", slot_code: str) -> str:
        slot = machine.get_slot(slot_code)
        if slot is None:
            return f"Invalid slot: {slot_code}"

        if not slot.is_available():
            return f"{slot.product.name} is out of stock."

        if machine.balance_cents < slot.price_cents:
            deficit = slot.price_cents - machine.balance_cents
            return (f"Insufficient funds. {slot.product.name} costs "
                    f"${slot.price_cents / 100:.2f}. Insert ${deficit / 100:.2f} more.")

        # Attempt to make change before dispensing
        change_amount = machine.balance_cents - slot.price_cents
        change_coins = machine.change_calculator.make_change(change_amount)
        if change_coins is None and change_amount > 0:
            return f"Machine cannot make change for ${change_amount / 100:.2f}. Try exact amount."

        # Dispense
        machine.set_state(VendingState.DISPENSING)
        product = slot.dispense()
        machine.add_revenue(slot.price_cents)
        machine.reset_balance()
        machine.set_state(VendingState.IDLE)

        if change_coins:
            change_str = ", ".join(f"{c}c" for c in change_coins)
            return (f"Dispensed: {product.name}. "
                    f"Change: ${change_amount / 100:.2f} ({change_str})")
        return f"Dispensed: {product.name}. No change due."

    def refund(self, machine: "VendingMachine") -> str:
        amount = machine.balance_cents
        machine.reset_balance()
        machine.set_state(VendingState.IDLE)
        return f"Refunded: ${amount / 100:.2f}"


class DispensingStateHandler(StateHandler):
    def insert_money(self, machine: "VendingMachine", denomination: Denomination) -> str:
        return "Please wait, dispensing in progress."

    def select_product(self, machine: "VendingMachine", slot_code: str) -> str:
        return "Please wait, dispensing in progress."

    def refund(self, machine: "VendingMachine") -> str:
        return "Cannot refund while dispensing."


class OutOfServiceHandler(StateHandler):
    def insert_money(self, machine: "VendingMachine", denomination: Denomination) -> str:
        return "Machine is out of service."

    def select_product(self, machine: "VendingMachine", slot_code: str) -> str:
        return "Machine is out of service."

    def refund(self, machine: "VendingMachine") -> str:
        return "Machine is out of service."
```

### Vending Machine (Main Orchestrator)

```python
class VendingMachine:
    STATE_HANDLERS: dict[VendingState, StateHandler] = {
        VendingState.IDLE: IdleStateHandler(),
        VendingState.HAS_MONEY: HasMoneyStateHandler(),
        VendingState.DISPENSING: DispensingStateHandler(),
        VendingState.OUT_OF_SERVICE: OutOfServiceHandler(),
    }

    def __init__(self, slots: list[Slot]) -> None:
        self._slots: dict[str, Slot] = {s.code: s for s in slots}
        self._state = VendingState.IDLE
        self._balance_cents = 0
        self._total_revenue_cents = 0
        self._change_calculator = ChangeCalculator()
        self._lock = threading.Lock()

    @property
    def balance_cents(self) -> int:
        return self._balance_cents

    @property
    def state(self) -> VendingState:
        return self._state

    @property
    def change_calculator(self) -> ChangeCalculator:
        return self._change_calculator

    def set_state(self, state: VendingState) -> None:
        self._state = state

    def add_to_balance(self, cents: int) -> None:
        self._balance_cents += cents

    def reset_balance(self) -> None:
        self._balance_cents = 0

    def add_revenue(self, cents: int) -> None:
        self._total_revenue_cents += cents

    def get_slot(self, code: str) -> Slot | None:
        return self._slots.get(code)

    def insert_money(self, denomination: Denomination) -> str:
        with self._lock:
            handler = self.STATE_HANDLERS[self._state]
            return handler.insert_money(self, denomination)

    def select_product(self, slot_code: str) -> str:
        with self._lock:
            handler = self.STATE_HANDLERS[self._state]
            return handler.select_product(self, slot_code)

    def refund(self) -> str:
        with self._lock:
            handler = self.STATE_HANDLERS[self._state]
            return handler.refund(self)

    def get_display(self) -> str:
        lines = [f"=== Vending Machine (State: {self._state.value}) ==="]
        lines.append(f"Balance: ${self._balance_cents / 100:.2f}")
        lines.append("---")
        for slot in self._slots.values():
            lines.append(repr(slot))
        return "\n".join(lines)
```

---

## 5. Payment and Change Calculation

The greedy algorithm for change works correctly with standard US denominations because each
denomination is at least double the previous one. Here is how it processes a request:

```
Example: Make change for $1.35 (135 cents)

Available coins: {100: 5, 50: 3, 25: 10, 10: 10, 5: 10}

Step 1: Try 100c coins -> use 1 coin (remaining: 35c)
Step 2: Try 50c coins  -> skip (50 > 35)
Step 3: Try 25c coins  -> use 1 coin (remaining: 10c)
Step 4: Try 10c coins  -> use 1 coin (remaining: 0c)
Step 5: Done. Change = [100, 25, 10] -> $1.00 + $0.25 + $0.10

If the machine cannot make exact change, it returns None and the
purchase is blocked until the user adjusts their payment.
```

**Why greedy works here:** For the US coin system {5, 10, 25, 50, 100}, the greedy approach
always produces the optimal (fewest coins) solution. This is because each coin value is at
least twice the next smaller one. For arbitrary denomination systems (e.g., {1, 3, 4}), greedy
can fail and you would need dynamic programming.

---

## 6. Admin Operations

```python
class VendingMachineAdmin:
    """Separate admin interface to keep customer and admin concerns apart."""

    def __init__(self, machine: VendingMachine, admin_pin: str = "1234") -> None:
        self._machine = machine
        self._admin_pin = admin_pin

    def authenticate(self, pin: str) -> bool:
        return pin == self._admin_pin

    def restock(self, pin: str, slot_code: str, quantity: int) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        slot = self._machine.get_slot(slot_code)
        if slot is None:
            return f"Invalid slot: {slot_code}"

        slot.restock(quantity)
        return f"Restocked {slot_code} with {quantity} items. New quantity: {slot.quantity}"

    def change_price(self, pin: str, slot_code: str, new_price_cents: int) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        slot = self._machine.get_slot(slot_code)
        if slot is None:
            return f"Invalid slot: {slot_code}"

        slot.price_cents = new_price_cents
        return f"Updated {slot_code} price to ${new_price_cents / 100:.2f}"

    def load_change(self, pin: str, coin_value: int, count: int) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        self._machine.change_calculator.load_coins(coin_value, count)
        return f"Loaded {count} x {coin_value}c coins."

    def collect_revenue(self, pin: str) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        revenue = self._machine._total_revenue_cents
        self._machine._total_revenue_cents = 0
        return f"Collected revenue: ${revenue / 100:.2f}"

    def set_out_of_service(self, pin: str) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        self._machine.set_state(VendingState.OUT_OF_SERVICE)
        return "Machine set to OUT_OF_SERVICE."

    def resume_service(self, pin: str) -> str:
        if not self.authenticate(pin):
            return "Authentication failed."

        self._machine.set_state(VendingState.IDLE)
        return "Machine resumed to IDLE."
```

---

## 7. Interview Walkthrough

### Step 1: Build the Machine

```python
def create_sample_machine() -> VendingMachine:
    slots = [
        Slot("A1", Product("Cola", 150), quantity=10, price_cents=150),
        Slot("A2", Product("Sprite", 150), quantity=8, price_cents=150),
        Slot("B1", Product("Chips", 125), quantity=5, price_cents=125),
        Slot("B2", Product("Candy Bar", 100), quantity=12, price_cents=100),
        Slot("C1", Product("Water", 100), quantity=15, price_cents=100),
        Slot("C2", Product("Juice", 200), quantity=6, price_cents=200),
    ]
    machine = VendingMachine(slots)

    # Pre-load change coins
    for coin_value in [5, 10, 25]:
        machine.change_calculator.load_coins(coin_value, 20)

    return machine
```

### Step 2: Usage Demo

```python
machine = create_sample_machine()

# Display available products
print(machine.get_display())

# Customer inserts money
print(machine.insert_money(Denomination.DOLLAR_COIN))   # Balance: $1.00
print(machine.insert_money(Denomination.QUARTER))        # Balance: $1.25
print(machine.insert_money(Denomination.QUARTER))        # Balance: $1.50

# Select a product
print(machine.select_product("A1"))  # Dispensed: Cola. No change due.

# Another customer - needs change
print(machine.insert_money(Denomination.BILL_1))         # Balance: $1.00
print(machine.select_product("B2"))  # Dispensed: Candy Bar. Change: $0.00
# Actually $1.00 - $1.00 = no change

# Customer wants refund
print(machine.insert_money(Denomination.QUARTER))
print(machine.refund())              # Refunded: $0.25

# Admin operations
admin = VendingMachineAdmin(machine)
print(admin.restock("1234", "A1", 5))
print(admin.collect_revenue("1234"))
```

---

## 8. Common Follow-Up Questions

### "How would you add credit card support?"

Extract a `PaymentMethod` interface with `charge(amount)` and `refund(amount)`. Cash and
card become two implementations. The vending machine delegates to the active payment method.
This follows OCP -- no changes to existing code.

### "How would you handle the machine running completely out of change?"

Track whether the machine can make change for any realistic overpayment. If the change pool
is critically low, display a "EXACT CHANGE ONLY" message and only allow purchases where
`balance == price`. This is a real-world feature on most vending machines.

### "How would you handle multiple products at the same price but different slots?"

The slot-based model already handles this. Each slot is independent. The product is just
descriptive data; the slot holds the price and quantity.

### "How would you add a touchscreen display?"

Use the Observer pattern. The `VendingMachine` publishes state change events, and a
`DisplayController` subscribes to render the UI. The core logic remains unchanged.

### "How would you handle power failures?"

Persist machine state (balances, inventory, change pool) to non-volatile storage after each
transaction. On startup, restore from the last saved state. If a transaction was in progress,
refund the balance.

---

## 9. Gotchas

- **Change before dispense.** Always verify that change can be made _before_ dispensing the
  product. Once the product is out, you cannot put it back. The implementation checks
  `make_change` first, then dispenses.

- **Thread safety on balance.** Without the lock, two rapid inserts could create a race
  condition on `_balance_cents`. The lock in `VendingMachine` serializes all operations.

- **Bill vs coin denomination overlap.** A $1 bill and a $1 coin have the same value (100
  cents) but are different physical objects. The enum distinguishes them, which matters for
  change-making (you cannot return a bill as change).

- **Greedy change failure.** If the denomination system is non-standard, greedy may not work.
  Mention to the interviewer that for US coins, greedy is optimal, but for arbitrary systems
  you would use dynamic programming.

- **State pattern vs if-else.** The interviewer may ask why you used the State pattern instead
  of a simple if-else chain. The answer: with 4 states and 3 operations, you have 12 cases.
  State objects keep each case isolated and make adding new states trivial.

- **Refund race condition.** If a user presses refund while a product is being dispensed, the
  DISPENSING state handler blocks the refund. This prevents double-spending.

---

## 10. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Product (frozen)           | Immutable product data: name + price   |
| Slot                       | Inventory unit: product + quantity      |
| ChangeCalculator           | Greedy change-making from coin pool    |
| StateHandler (ABC)         | State-specific behavior for operations |
| VendingMachine             | Orchestrator: balance, slots, state    |
| VendingMachineAdmin        | Admin ops: restock, pricing, revenue   |
+----------------------------+----------------------------------------+

State Machine Summary:
+------------------+------------------+------------------+
| State            | Valid Operations | Transitions To   |
+------------------+------------------+------------------+
| IDLE             | insert_money     | HAS_MONEY        |
| HAS_MONEY        | insert, select,  | DISPENSING, IDLE |
|                  | refund           |                  |
| DISPENSING       | (none from user) | IDLE             |
| OUT_OF_SERVICE   | (admin only)     | IDLE             |
+------------------+------------------+------------------+

Patterns used:
- State          -> VendingState handlers (Idle, HasMoney, Dispensing)
- Strategy       -> ChangeCalculator (swappable change algorithm)
- Composition    -> Machine has Slots, Slot has Product
- Immutability   -> Product is frozen dataclass
- Thread safety  -> Lock in VendingMachine for concurrent access
- Separation     -> VendingMachineAdmin separates admin from customer
```
