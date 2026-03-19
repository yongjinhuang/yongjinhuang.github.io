# Design an Expense Sharing App (Splitwise)

Splitwise is an excellent LLD interview question that tests your ability to model financial
transactions, implement multiple split strategies, and solve the classic debt simplification
problem. It combines Strategy, Observer, and graph algorithms in a practical domain.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Split Strategies](#4-split-strategies)
5. [Debt Simplification Algorithm](#5-debt-simplification-algorithm)
6. [Notification System](#6-notification-system)
7. [Interview Walkthrough](#7-interview-walkthrough)
8. [Common Follow-Up Questions](#8-common-follow-up-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement         | Details                                       |
| --- | ------------------- | --------------------------------------------- |
| F1  | User management     | Create users with name, email, unique ID      |
| F2  | Group management    | Create groups, add/remove members             |
| F3  | Add expenses        | Record who paid, how much, split among whom   |
| F4  | Split types         | Equal, exact amount, percentage, share-based  |
| F5  | Balance tracking    | Show how much each user owes/is owed          |
| F6  | Debt simplification | Minimize number of transactions to settle     |
| F7  | Settlement          | Record payments between users                 |
| F8  | Expense history     | View past expenses per group or between users |

### Non-Functional Requirements

| #   | Requirement                                              |
| --- | -------------------------------------------------------- |
| NF1 | Thread-safe balance updates                              |
| NF2 | Extensible for new split strategies without code changes |
| NF3 | Accurate to the cent (no floating-point drift)           |
| NF4 | Notifications when balances change                       |

### Clarifying Questions to Ask

- "Do we need to support multiple currencies?" (Yes, basic support)
- "Should we simplify debts within a group or globally?" (Within a group)
- "Can a non-group-member be part of an expense?" (No, only group members)
- "Do we need to track partial settlements?" (Yes)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   SplitType       |       |   Currency          |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| EQUAL             |       | USD                 |
| EXACT             |       | EUR                 |
| PERCENTAGE        |       | GBP                 |
| SHARES            |       +---------------------+
+-------------------+
                            +---------------------+
+-------------------+       |   User              |
| SplitStrategy     |       |---------------------|
|   (ABC)           |       | user_id             |
|-------------------|       | name                |
| validate(amount,  |       | email               |
|   splits)         |       +---------------------+
| calculate(amount, |
|   splits)         |       +---------------------+
+-------------------+       |   Group             |
  ^    ^    ^    ^          |---------------------|
  |    |    |    |          | group_id            |
Equal Exact Pct Share       | name                |
                            | members             |
+-------------------+       | expenses            |
|   Expense         |       |---------------------|
|-------------------|       | add_member()        |
| expense_id        |       | add_expense()       |
| description       |       | get_balances()      |
| amount            |       | simplify_debts()    |
| currency          |       +---------------------+
| paid_by           |
| splits            |       +---------------------+
| timestamp         |       | BalanceSheet        |
+-------------------+       |---------------------|
                            | balances            |
+-------------------+       |---------------------|
| Settlement        |       | record_expense()    |
|-------------------|       | record_settlement() |
| from_user         |       | get_balance()       |
| to_user           |       | get_net_balances()  |
| amount            |       | simplify()          |
| timestamp         |       +---------------------+
+-------------------+
                            +---------------------+
+-------------------+       | ExpenseService      |
| BalanceObserver   |       |---------------------|
|   (ABC)           |       | groups              |
|-------------------|       | users               |
| on_balance_change |       |---------------------|
+-------------------+       | create_group()      |
  ^           ^             | add_expense()       |
  |           |             | settle()            |
Email      PushNotify       | get_balances()      |
                            +---------------------+
```

---

## 3. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from abc import ABC, abstractmethod
from collections import defaultdict
import uuid
import threading
import heapq


class SplitType(Enum):
    EQUAL = "equal"
    EXACT = "exact"
    PERCENTAGE = "percentage"
    SHARES = "shares"


class Currency(Enum):
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


@dataclass(frozen=True)
class User:
    user_id: str
    name: str
    email: str

    @staticmethod
    def create(name: str, email: str) -> "User":
        return User(user_id=str(uuid.uuid4())[:8], name=name, email=email)


@dataclass(frozen=True)
class Split:
    """Represents one user's share in an expense."""
    user: User
    amount: float = 0.0        # For EXACT splits
    percentage: float = 0.0    # For PERCENTAGE splits
    shares: int = 1            # For SHARES splits
```

### Expense and Settlement

```python
@dataclass(frozen=True)
class Expense:
    expense_id: str
    description: str
    amount: float
    currency: Currency
    paid_by: User
    splits: tuple[Split, ...]
    split_type: SplitType
    timestamp: datetime

    @staticmethod
    def create(description: str, amount: float, currency: Currency,
               paid_by: User, splits: tuple[Split, ...],
               split_type: SplitType) -> "Expense":
        return Expense(
            expense_id=str(uuid.uuid4())[:8],
            description=description,
            amount=amount,
            currency=currency,
            paid_by=paid_by,
            splits=splits,
            split_type=split_type,
            timestamp=datetime.now(),
        )


@dataclass(frozen=True)
class Settlement:
    settlement_id: str
    from_user: User
    to_user: User
    amount: float
    currency: Currency
    timestamp: datetime

    @staticmethod
    def create(from_user: User, to_user: User, amount: float,
               currency: Currency) -> "Settlement":
        return Settlement(
            settlement_id=str(uuid.uuid4())[:8],
            from_user=from_user,
            to_user=to_user,
            amount=amount,
            currency=currency,
            timestamp=datetime.now(),
        )
```

---

## 4. Split Strategies

Using the Strategy pattern so each split type has its own validation and calculation logic.

```python
class SplitStrategy(ABC):
    @abstractmethod
    def validate(self, total_amount: float, splits: tuple[Split, ...]) -> bool:
        pass

    @abstractmethod
    def calculate(self, total_amount: float,
                  splits: tuple[Split, ...]) -> dict[str, float]:
        """Returns {user_id: amount_owed} for each participant."""
        pass


class EqualSplitStrategy(SplitStrategy):
    """Divide the amount equally among all participants."""

    def validate(self, total_amount: float, splits: tuple[Split, ...]) -> bool:
        return len(splits) > 0 and total_amount > 0

    def calculate(self, total_amount: float,
                  splits: tuple[Split, ...]) -> dict[str, float]:
        n = len(splits)
        per_person = round(total_amount / n, 2)
        # Handle rounding: give the remainder to the first person
        remainder = round(total_amount - (per_person * n), 2)
        result = {}
        for i, split in enumerate(splits):
            amount = per_person + (remainder if i == 0 else 0.0)
            result[split.user.user_id] = round(amount, 2)
        return result


class ExactSplitStrategy(SplitStrategy):
    """Each participant owes a specific amount."""

    def validate(self, total_amount: float, splits: tuple[Split, ...]) -> bool:
        split_total = sum(s.amount for s in splits)
        return abs(split_total - total_amount) < 0.01

    def calculate(self, total_amount: float,
                  splits: tuple[Split, ...]) -> dict[str, float]:
        return {s.user.user_id: round(s.amount, 2) for s in splits}


class PercentageSplitStrategy(SplitStrategy):
    """Each participant owes a percentage of the total."""

    def validate(self, total_amount: float, splits: tuple[Split, ...]) -> bool:
        pct_total = sum(s.percentage for s in splits)
        return abs(pct_total - 100.0) < 0.01

    def calculate(self, total_amount: float,
                  splits: tuple[Split, ...]) -> dict[str, float]:
        result = {}
        running_total = 0.0
        for i, split in enumerate(splits):
            if i == len(splits) - 1:
                # Last person gets the remainder to avoid rounding issues
                amount = round(total_amount - running_total, 2)
            else:
                amount = round(total_amount * split.percentage / 100.0, 2)
                running_total += amount
            result[split.user.user_id] = amount
        return result


class SharesSplitStrategy(SplitStrategy):
    """Split proportionally based on shares (e.g., 2:3:1)."""

    def validate(self, total_amount: float, splits: tuple[Split, ...]) -> bool:
        return all(s.shares > 0 for s in splits) and total_amount > 0

    def calculate(self, total_amount: float,
                  splits: tuple[Split, ...]) -> dict[str, float]:
        total_shares = sum(s.shares for s in splits)
        result = {}
        running_total = 0.0
        for i, split in enumerate(splits):
            if i == len(splits) - 1:
                amount = round(total_amount - running_total, 2)
            else:
                amount = round(total_amount * split.shares / total_shares, 2)
                running_total += amount
            result[split.user.user_id] = amount
        return result


# Registry to look up strategy by split type
SPLIT_STRATEGIES: dict[SplitType, SplitStrategy] = {
    SplitType.EQUAL: EqualSplitStrategy(),
    SplitType.EXACT: ExactSplitStrategy(),
    SplitType.PERCENTAGE: PercentageSplitStrategy(),
    SplitType.SHARES: SharesSplitStrategy(),
}
```

---

## 5. Debt Simplification Algorithm

This is the key algorithmic challenge. Given N users with various debts between them,
minimize the number of transactions to settle all debts.

### Balance Sheet

```python
class BalanceSheet:
    """Tracks pairwise balances between users.

    _balances[A][B] > 0 means A is owed money BY B (B owes A).
    _balances[A][B] < 0 means A owes money TO B.
    Invariant: _balances[A][B] == -_balances[B][A]
    """

    def __init__(self):
        self._balances: dict[str, dict[str, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        self._lock = threading.Lock()
        self._observers: list["BalanceObserver"] = []

    def add_observer(self, observer: "BalanceObserver") -> None:
        self._observers.append(observer)

    def record_expense(self, expense: Expense,
                       amounts_owed: dict[str, float]) -> None:
        """Update balances after an expense is added."""
        payer_id = expense.paid_by.user_id
        with self._lock:
            for user_id, amount in amounts_owed.items():
                if user_id == payer_id:
                    continue
                # Payer is owed `amount` by this user
                self._balances[payer_id][user_id] = round(
                    self._balances[payer_id][user_id] + amount, 2
                )
                self._balances[user_id][payer_id] = round(
                    self._balances[user_id][payer_id] - amount, 2
                )

        self._notify_observers(payer_id, amounts_owed)

    def record_settlement(self, settlement: Settlement) -> None:
        """Update balances when a user pays another."""
        from_id = settlement.from_user.user_id
        to_id = settlement.to_user.user_id
        amount = settlement.amount
        with self._lock:
            self._balances[to_id][from_id] = round(
                self._balances[to_id][from_id] - amount, 2
            )
            self._balances[from_id][to_id] = round(
                self._balances[from_id][to_id] + amount, 2
            )

    def get_balance(self, user_a_id: str, user_b_id: str) -> float:
        """Returns how much user_a is owed by user_b (positive) or owes (negative)."""
        return self._balances[user_a_id][user_b_id]

    def get_net_balances(self, user_ids: list[str]) -> dict[str, float]:
        """Net balance per user: positive = owed money, negative = owes money."""
        net = {}
        for uid in user_ids:
            net[uid] = round(sum(self._balances[uid].values()), 2)
        return net

    def _notify_observers(self, payer_id: str,
                          amounts_owed: dict[str, float]) -> None:
        for observer in self._observers:
            observer.on_balance_change(payer_id, amounts_owed)
```

### Naive Approach: O(n^2) Pairwise Settlement

```python
def simplify_debts_naive(
    balance_sheet: BalanceSheet, user_ids: list[str]
) -> list[tuple[str, str, float]]:
    """Return list of (from_user, to_user, amount) settlements.

    Naive approach: for every pair where A owes B, create a settlement.
    This may produce up to n*(n-1)/2 transactions.
    """
    settlements = []
    seen = set()
    for uid_a in user_ids:
        for uid_b in user_ids:
            if uid_a == uid_b or (uid_b, uid_a) in seen:
                continue
            seen.add((uid_a, uid_b))
            balance = balance_sheet.get_balance(uid_a, uid_b)
            if balance > 0.01:
                # uid_b owes uid_a
                settlements.append((uid_b, uid_a, round(balance, 2)))
            elif balance < -0.01:
                # uid_a owes uid_b
                settlements.append((uid_a, uid_b, round(abs(balance), 2)))
    return settlements
```

### Optimized Approach: Greedy Net-Balance Settlement

```python
def simplify_debts_greedy(
    balance_sheet: BalanceSheet, user_ids: list[str]
) -> list[tuple[str, str, float]]:
    """Minimize transactions using net balances + greedy matching.

    Algorithm:
    1. Compute net balance for each user.
    2. Split into creditors (positive) and debtors (negative).
    3. Use two heaps (max-heap for creditors, max-heap for debtors).
    4. Match largest creditor with largest debtor repeatedly.

    This produces at most (n - 1) transactions, which is optimal
    for the general case.
    """
    net = balance_sheet.get_net_balances(user_ids)

    # Filter out zero balances
    creditors = []  # (amount, user_id) — max-heap (negate for heapq)
    debtors = []    # (amount, user_id) — max-heap (negate for heapq)

    for uid, balance in net.items():
        if balance > 0.01:
            heapq.heappush(creditors, (-balance, uid))
        elif balance < -0.01:
            heapq.heappush(debtors, (balance, uid))  # already negative

    settlements = []

    while creditors and debtors:
        credit_amt, creditor_id = heapq.heappop(creditors)
        debt_amt, debtor_id = heapq.heappop(debtors)

        credit_amt = -credit_amt  # Restore to positive
        debt_amt = -debt_amt      # Restore to positive

        settle_amount = round(min(credit_amt, debt_amt), 2)
        settlements.append((debtor_id, creditor_id, settle_amount))

        remaining_credit = round(credit_amt - settle_amount, 2)
        remaining_debt = round(debt_amt - settle_amount, 2)

        if remaining_credit > 0.01:
            heapq.heappush(creditors, (-remaining_credit, creditor_id))
        if remaining_debt > 0.01:
            heapq.heappush(debtors, (-remaining_debt, debtor_id))

    return settlements
```

**Why this works:** Each settlement fully satisfies at least one party (either the
creditor is fully paid or the debtor fully pays off). With N non-zero balances, we need
at most N - 1 transactions.

---

## 6. Notification System

Using the Observer pattern so services react to balance changes.

```python
class BalanceObserver(ABC):
    @abstractmethod
    def on_balance_change(self, payer_id: str,
                          amounts: dict[str, float]) -> None:
        pass


class EmailNotifier(BalanceObserver):
    def on_balance_change(self, payer_id: str,
                          amounts: dict[str, float]) -> None:
        for user_id, amount in amounts.items():
            if user_id != payer_id and amount > 0:
                print(f"[EMAIL] User {user_id} now owes {amount:.2f} "
                      f"to {payer_id}")


class PushNotifier(BalanceObserver):
    def on_balance_change(self, payer_id: str,
                          amounts: dict[str, float]) -> None:
        for user_id, amount in amounts.items():
            if user_id != payer_id and amount > 0:
                print(f"[PUSH] User {user_id}: new expense — "
                      f"you owe {amount:.2f}")
```

---

## 7. Interview Walkthrough

### Group and ExpenseService

```python
class Group:
    def __init__(self, group_id: str, name: str, members: list[User]):
        self._group_id = group_id
        self._name = name
        self._members = {m.user_id: m for m in members}
        self._expenses: list[Expense] = []
        self._settlements: list[Settlement] = []
        self._balance_sheet = BalanceSheet()

    @property
    def group_id(self) -> str:
        return self._group_id

    @property
    def members(self) -> dict[str, User]:
        return dict(self._members)

    @property
    def balance_sheet(self) -> BalanceSheet:
        return self._balance_sheet

    def add_member(self, user: User) -> None:
        self._members[user.user_id] = user

    def add_expense(self, description: str, amount: float,
                    currency: Currency, paid_by: User,
                    splits: tuple[Split, ...],
                    split_type: SplitType) -> Expense:
        if paid_by.user_id not in self._members:
            raise ValueError(f"Payer {paid_by.name} is not a group member")
        for split in splits:
            if split.user.user_id not in self._members:
                raise ValueError(f"{split.user.name} is not a group member")

        strategy = SPLIT_STRATEGIES[split_type]
        if not strategy.validate(amount, splits):
            raise ValueError(f"Invalid split for {split_type.value}")

        amounts_owed = strategy.calculate(amount, splits)
        expense = Expense.create(
            description=description,
            amount=amount,
            currency=currency,
            paid_by=paid_by,
            splits=splits,
            split_type=split_type,
        )
        self._expenses.append(expense)
        self._balance_sheet.record_expense(expense, amounts_owed)
        return expense

    def settle(self, from_user: User, to_user: User,
               amount: float, currency: Currency) -> Settlement:
        settlement = Settlement.create(from_user, to_user, amount, currency)
        self._settlements.append(settlement)
        self._balance_sheet.record_settlement(settlement)
        return settlement

    def get_simplified_debts(self) -> list[tuple[str, str, float]]:
        member_ids = list(self._members.keys())
        return simplify_debts_greedy(self._balance_sheet, member_ids)

    def get_expense_history(self) -> list[Expense]:
        return list(self._expenses)
```

### Usage Demo

```python
# Create users
alice = User.create("Alice", "alice@example.com")
bob = User.create("Bob", "bob@example.com")
carol = User.create("Carol", "carol@example.com")

# Create group
group = Group("trip-1", "Weekend Trip", [alice, bob, carol])

# Add observer for notifications
group.balance_sheet.add_observer(EmailNotifier())

# Expense 1: Alice pays $120 dinner, split equally
group.add_expense(
    description="Dinner",
    amount=120.00,
    currency=Currency.USD,
    paid_by=alice,
    splits=(Split(alice), Split(bob), Split(carol)),
    split_type=SplitType.EQUAL,
)

# Expense 2: Bob pays $60 taxi, exact split
group.add_expense(
    description="Taxi",
    amount=60.00,
    currency=Currency.USD,
    paid_by=bob,
    splits=(
        Split(alice, amount=20.00),
        Split(bob, amount=20.00),
        Split(carol, amount=20.00),
    ),
    split_type=SplitType.EXACT,
)

# Expense 3: Carol pays $90 hotel, percentage split
group.add_expense(
    description="Hotel",
    amount=90.00,
    currency=Currency.USD,
    paid_by=carol,
    splits=(
        Split(alice, percentage=50.0),
        Split(bob, percentage=30.0),
        Split(carol, percentage=20.0),
    ),
    split_type=SplitType.PERCENTAGE,
)

# Show simplified debts
debts = group.get_simplified_debts()
for from_id, to_id, amount in debts:
    print(f"{from_id} pays {to_id}: ${amount:.2f}")

# Settle a debt
group.settle(bob, alice, 25.00, Currency.USD)
```

---

## 8. Common Follow-Up Questions

### "How would you handle multiple currencies?"

Add a `CurrencyConverter` service that converts all amounts to a base currency before
computing balances. Store the original currency on each expense for display, but use
the converted amount for balance calculations.

### "What if someone leaves a group with an outstanding balance?"

Block removal if their net balance is non-zero. Require them to settle first, or transfer
their debt to another group member with consent.

### "How would you handle recurring expenses?"

Add a `RecurringExpense` that stores a schedule (weekly, monthly). A background job
creates `Expense` instances at each interval. Use a template pattern to define the
recurring parameters.

### "How would you make the debt simplification truly optimal?"

The greedy approach gives at most n-1 transactions but may not always find the absolute
minimum. The truly optimal solution requires finding maximum subsets that sum to zero
(NP-hard in general). For small groups (<20), use subset-sum with bitmask DP. For
larger groups, the greedy approach is sufficient.

### "How would you handle disputes on an expense?"

Add an `ExpenseStatus` enum (PENDING, CONFIRMED, DISPUTED). When disputed, freeze
that expense's effect on balances until resolved. Store dispute notes and resolution.

---

## 9. Gotchas

- **Floating-point precision.** Never compare floats with `==`. Use a tolerance
  (`abs(a - b) < 0.01`). Better yet, use integers representing cents internally
  and convert to dollars only for display.

- **Rounding errors in equal splits.** $100 split 3 ways is $33.33 + $33.33 + $33.34.
  Always assign the remainder to one participant explicitly.

- **Self-payment in splits.** The payer is often included in the split list. Make sure
  to skip the payer when recording debts (they do not owe themselves).

- **Thread safety on balance updates.** Two expenses added concurrently could corrupt
  the balance map. The lock in `BalanceSheet` protects against this.

- **Net balance invariant.** The sum of all net balances in a group must always be zero.
  This is a good sanity check after every operation.

- **Settling more than owed.** Validate that a settlement amount does not exceed the
  actual debt between two users.

---

## 10. Quick Reference

```
+----------------------------+----------------------------------------+
| Entity                     | Key Responsibility                     |
+----------------------------+----------------------------------------+
| User                       | Immutable identity: id, name, email    |
| Split                      | One user's share in an expense         |
| Expense                    | Record: who paid, amount, split config |
| Settlement                 | Record: who paid whom, how much        |
| BalanceSheet               | Track pairwise and net balances        |
| Group                      | Container: members, expenses, balances |
| SplitStrategy (ABC)        | Calculate each user's share            |
+----------------------------+----------------------------------------+

Split Strategies:
+-------------+-----------------------------+---------------------------+
| Strategy    | Input                       | How It Works              |
+-------------+-----------------------------+---------------------------+
| Equal       | Just participants           | amount / n, handle remainder |
| Exact       | Exact amount per person     | Must sum to total         |
| Percentage  | Percentage per person       | Must sum to 100%          |
| Shares      | Share count per person      | Proportional to shares    |
+-------------+-----------------------------+---------------------------+

Debt Simplification:
+----------+---------------------------+----------------------------+
| Approach | Complexity                | Result                     |
+----------+---------------------------+----------------------------+
| Naive    | O(n^2) pairwise           | Up to n*(n-1)/2 txns       |
| Greedy   | O(n log n) with heaps     | At most n-1 txns           |
| Optimal  | O(2^n) subset-sum DP      | True minimum (NP-hard)     |
+----------+---------------------------+----------------------------+

Patterns used:
- Strategy    -> SplitStrategy (swappable split algorithms)
- Observer    -> BalanceObserver (notifications on change)
- Immutability-> User, Expense, Settlement are frozen dataclasses
- Thread safety-> Lock in BalanceSheet for concurrent access
- Factory     -> Static create() methods for ID generation
```
