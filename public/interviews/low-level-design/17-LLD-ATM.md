# Design an ATM Machine

The ATM machine is a classic LLD interview question that tests your ability to model state
machines, implement the Command pattern for transactions, handle cash denomination selection,
and design robust error handling. The State pattern is the central design element, making
this problem a favorite for testing pattern knowledge in practice.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [State Machine](#3-state-machine)
4. [Core Implementation](#4-core-implementation)
5. [Transaction Commands](#5-transaction-commands)
6. [Cash Dispenser Algorithm](#6-cash-dispenser-algorithm)
7. [Transaction Processing Chain](#7-transaction-processing-chain)
8. [Interview Walkthrough](#8-interview-walkthrough)
9. [Common Follow-Up Questions](#9-common-follow-up-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Requirements

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| F1 | Card validation | Read card, verify with bank |
| F2 | PIN authentication | 3 attempts, then lock card |
| F3 | Withdrawal | Select amount, dispense cash |
| F4 | Deposit | Accept cash/check |
| F5 | Balance inquiry | Display current balance |
| F6 | Transfer | Between accounts |
| F7 | Cash denomination | Dispense optimal mix of bills |
| F8 | Daily limit | Track and enforce withdrawal limits |
| F9 | Receipt | Generate transaction receipt |
| F10 | Audit logging | Log every action for compliance |

### Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NF1 | State machine for ATM flow (no invalid transitions) |
| NF2 | Thread-safe cash inventory |
| NF3 | Extensible for new transaction types |
| NF4 | Comprehensive error handling and recovery |

### Clarifying Questions to Ask

- "How many denominations does the ATM hold?" ($100, $50, $20, $10, $5)
- "Is there a per-transaction limit or just daily?" (Both)
- "Should we integrate with a real bank API?" (Mock it with an interface)
- "Do we need to handle power failure mid-transaction?" (Discuss, not implement)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   ATMState        |       |   TransactionType   |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| IDLE              |       | WITHDRAWAL          |
| CARD_INSERTED     |       | DEPOSIT             |
| PIN_VALIDATED     |       | BALANCE_INQUIRY     |
| TRANSACTION_SEL   |       | TRANSFER            |
+-------------------+       +---------------------+

+-------------------+       +---------------------+
|   State (ABC)     |       |   Card              |
|-------------------|       |---------------------|
| insert_card()     |       | card_number         |
| enter_pin()       |       | account_id          |
| select_txn()      |       | is_locked           |
| execute_txn()     |       +---------------------+
| cancel()          |
+-------------------+       +---------------------+
  ^   ^   ^   ^             |   BankService       |
  |   |   |   |             |   (ABC)             |
Idle Card PIN  TxnSel       |---------------------|
                            | validate_card()     |
+-------------------+       | verify_pin()        |
| Transaction       |       | get_balance()       |
|   (ABC/Command)   |       | debit()             |
|-------------------|       | credit()            |
| execute(context)  |       +---------------------+
| rollback(context) |
+-------------------+       +---------------------+
  ^   ^   ^   ^             |   CashDispenser     |
  |   |   |   |             |---------------------|
With Dep Bal Xfer           | inventory           |
                            |---------------------|
+-------------------+       | dispense(amount)    |
| TransactionHandler|       | add_cash()          |
|   (ABC / CoR)     |       | get_total()         |
|-------------------|       +---------------------+
| next_handler      |
| handle(context)   |       +---------------------+
+-------------------+       |   ATM               |
  ^   ^   ^   ^             |---------------------|
  |   |   |   |             | state               |
Valid Auth Exec Log         | cash_dispenser      |
                            | bank_service        |
+-------------------+       |---------------------|
| AuditLogger       |       | insert_card()       |
|-------------------|       | enter_pin()         |
| log(entry)        |       | select_transaction()|
| get_logs()        |       | execute()           |
+-------------------+       | cancel()            |
                            +---------------------+
```

---

## 3. State Machine

```
              +------------------+
   +-------->|      IDLE        |<-----------+
   |         +------------------+            |
   |                |                        |
   |          insert_card()                  |
   |                |                        |
   |                v                        |
   |         +------------------+            |
   |  cancel | CARD_INSERTED    |---(3 fails)---> CARD_LOCKED -> IDLE
   |         +------------------+            |
   |                |                        |
   |           enter_pin()                   |
   |                |                        |
   |                v                        |
   |         +------------------+            |
   |  cancel | PIN_VALIDATED    |            |
   |         +------------------+            |
   |                |                        |
   |         select_transaction()            |
   |                |                        |
   |                v                        |
   |         +------------------+            |
   +---------| TXN_SELECTED     |------------+
     cancel  +------------------+   complete
                    |
              execute_transaction()
                    |
              (dispense / display / etc.)
```

**Transitions:**

| From | Event | To | Action |
|------|-------|----|--------|
| IDLE | insert_card() | CARD_INSERTED | Validate card with bank |
| CARD_INSERTED | enter_pin() OK | PIN_VALIDATED | Reset PIN counter |
| CARD_INSERTED | enter_pin() FAIL x3 | IDLE | Lock card, eject |
| PIN_VALIDATED | select_transaction() | TXN_SELECTED | Store transaction type |
| TXN_SELECTED | execute() | IDLE | Process, dispense, eject card |
| Any (non-IDLE) | cancel() | IDLE | Eject card, abort |

---

## 4. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, date
from abc import ABC, abstractmethod
from collections import defaultdict
import uuid
import threading


class ATMState(Enum):
    IDLE = "idle"
    CARD_INSERTED = "card_inserted"
    PIN_VALIDATED = "pin_validated"
    TRANSACTION_SELECTED = "transaction_selected"


class TransactionType(Enum):
    WITHDRAWAL = "withdrawal"
    DEPOSIT = "deposit"
    BALANCE_INQUIRY = "balance_inquiry"
    TRANSFER = "transfer"


@dataclass(frozen=True)
class Card:
    card_number: str
    account_id: str


@dataclass(frozen=True)
class AuditEntry:
    entry_id: str
    timestamp: datetime
    card_number: str
    action: str
    details: str
    success: bool
```

### Bank Service Interface

```python
class BankService(ABC):
    """Interface for bank communication. Mocked for interviews."""

    @abstractmethod
    def validate_card(self, card_number: str) -> bool:
        pass

    @abstractmethod
    def verify_pin(self, card_number: str, pin: str) -> bool:
        pass

    @abstractmethod
    def get_balance(self, account_id: str) -> float:
        pass

    @abstractmethod
    def debit(self, account_id: str, amount: float) -> bool:
        pass

    @abstractmethod
    def credit(self, account_id: str, amount: float) -> bool:
        pass


class MockBankService(BankService):
    """In-memory bank for demonstration."""

    def __init__(self):
        self._accounts: dict[str, float] = {}
        self._cards: dict[str, str] = {}  # card_number -> account_id
        self._pins: dict[str, str] = {}   # card_number -> pin
        self._locked_cards: set[str] = set()

    def register(self, card_number: str, account_id: str,
                 pin: str, balance: float) -> None:
        self._cards[card_number] = account_id
        self._pins[card_number] = pin
        self._accounts[account_id] = balance

    def validate_card(self, card_number: str) -> bool:
        return (card_number in self._cards
                and card_number not in self._locked_cards)

    def verify_pin(self, card_number: str, pin: str) -> bool:
        return self._pins.get(card_number) == pin

    def get_balance(self, account_id: str) -> float:
        return self._accounts.get(account_id, 0.0)

    def debit(self, account_id: str, amount: float) -> bool:
        if self._accounts.get(account_id, 0.0) < amount:
            return False
        self._accounts[account_id] = round(
            self._accounts[account_id] - amount, 2
        )
        return True

    def credit(self, account_id: str, amount: float) -> bool:
        self._accounts[account_id] = round(
            self._accounts.get(account_id, 0.0) + amount, 2
        )
        return True

    def lock_card(self, card_number: str) -> None:
        self._locked_cards.add(card_number)
```

### Audit Logger

```python
class AuditLogger:
    def __init__(self):
        self._logs: list[AuditEntry] = []
        self._lock = threading.Lock()

    def log(self, card_number: str, action: str,
            details: str, success: bool) -> None:
        entry = AuditEntry(
            entry_id=str(uuid.uuid4())[:8],
            timestamp=datetime.now(),
            card_number=card_number,
            action=action,
            details=details,
            success=success,
        )
        with self._lock:
            self._logs.append(entry)

    def get_logs(self, card_number: str | None = None) -> list[AuditEntry]:
        if card_number is None:
            return list(self._logs)
        return [e for e in self._logs if e.card_number == card_number]
```

---

## 5. Transaction Commands

Each transaction type is a Command that can be executed and rolled back.

```python
@dataclass
class TransactionContext:
    """Shared context passed through the transaction pipeline."""
    card: Card
    transaction_type: TransactionType
    amount: float = 0.0
    target_account: str = ""  # For transfers
    balance: float = 0.0
    success: bool = False
    message: str = ""
    receipt_lines: list[str] = field(default_factory=list)


class Transaction(ABC):
    @abstractmethod
    def execute(self, context: TransactionContext,
                bank: BankService,
                dispenser: "CashDispenser") -> TransactionContext:
        pass

    @abstractmethod
    def rollback(self, context: TransactionContext,
                 bank: BankService,
                 dispenser: "CashDispenser") -> None:
        pass


class WithdrawalTransaction(Transaction):
    def execute(self, context: TransactionContext,
                bank: BankService,
                dispenser: "CashDispenser") -> TransactionContext:
        if context.amount <= 0:
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Invalid withdrawal amount",
            )

        # Check dispenser has enough cash
        if dispenser.get_total() < context.amount:
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="ATM has insufficient cash",
            )

        # Check bank account
        if not bank.debit(context.card.account_id, context.amount):
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Insufficient funds in account",
            )

        # Dispense cash
        bills = dispenser.dispense(context.amount)
        if bills is None:
            # Rollback bank debit
            bank.credit(context.card.account_id, context.amount)
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Cannot dispense exact amount",
            )

        receipt = [
            f"WITHDRAWAL: ${context.amount:.2f}",
            f"Bills: {bills}",
            f"Balance: ${bank.get_balance(context.card.account_id):.2f}",
        ]
        return TransactionContext(
            card=context.card,
            transaction_type=context.transaction_type,
            amount=context.amount,
            balance=bank.get_balance(context.card.account_id),
            success=True,
            message="Withdrawal successful",
            receipt_lines=receipt,
        )

    def rollback(self, context: TransactionContext,
                 bank: BankService,
                 dispenser: "CashDispenser") -> None:
        bank.credit(context.card.account_id, context.amount)


class DepositTransaction(Transaction):
    def execute(self, context: TransactionContext,
                bank: BankService,
                dispenser: "CashDispenser") -> TransactionContext:
        if context.amount <= 0:
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Invalid deposit amount",
            )

        bank.credit(context.card.account_id, context.amount)
        receipt = [
            f"DEPOSIT: ${context.amount:.2f}",
            f"Balance: ${bank.get_balance(context.card.account_id):.2f}",
        ]
        return TransactionContext(
            card=context.card,
            transaction_type=context.transaction_type,
            amount=context.amount,
            balance=bank.get_balance(context.card.account_id),
            success=True,
            message="Deposit successful",
            receipt_lines=receipt,
        )

    def rollback(self, context: TransactionContext,
                 bank: BankService,
                 dispenser: "CashDispenser") -> None:
        bank.debit(context.card.account_id, context.amount)


class BalanceInquiryTransaction(Transaction):
    def execute(self, context: TransactionContext,
                bank: BankService,
                dispenser: "CashDispenser") -> TransactionContext:
        balance = bank.get_balance(context.card.account_id)
        receipt = [f"BALANCE: ${balance:.2f}"]
        return TransactionContext(
            card=context.card,
            transaction_type=context.transaction_type,
            balance=balance,
            success=True,
            message=f"Current balance: ${balance:.2f}",
            receipt_lines=receipt,
        )

    def rollback(self, context: TransactionContext,
                 bank: BankService,
                 dispenser: "CashDispenser") -> None:
        pass  # Read-only, nothing to rollback


class TransferTransaction(Transaction):
    def execute(self, context: TransactionContext,
                bank: BankService,
                dispenser: "CashDispenser") -> TransactionContext:
        if context.amount <= 0 or not context.target_account:
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Invalid transfer parameters",
            )

        if not bank.debit(context.card.account_id, context.amount):
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message="Insufficient funds for transfer",
            )

        bank.credit(context.target_account, context.amount)
        receipt = [
            f"TRANSFER: ${context.amount:.2f}",
            f"To account: {context.target_account}",
            f"Balance: ${bank.get_balance(context.card.account_id):.2f}",
        ]
        return TransactionContext(
            card=context.card,
            transaction_type=context.transaction_type,
            amount=context.amount,
            target_account=context.target_account,
            balance=bank.get_balance(context.card.account_id),
            success=True,
            message="Transfer successful",
            receipt_lines=receipt,
        )

    def rollback(self, context: TransactionContext,
                 bank: BankService,
                 dispenser: "CashDispenser") -> None:
        bank.debit(context.target_account, context.amount)
        bank.credit(context.card.account_id, context.amount)


TRANSACTION_REGISTRY: dict[TransactionType, Transaction] = {
    TransactionType.WITHDRAWAL: WithdrawalTransaction(),
    TransactionType.DEPOSIT: DepositTransaction(),
    TransactionType.BALANCE_INQUIRY: BalanceInquiryTransaction(),
    TransactionType.TRANSFER: TransferTransaction(),
}
```

---

## 6. Cash Dispenser Algorithm

The dispenser must select the optimal combination of bills. We use a greedy approach
(largest bills first) with backtracking fallback for exact amounts.

```python
class CashDispenser:
    DENOMINATIONS = [100, 50, 20, 10, 5]

    def __init__(self):
        self._inventory: dict[int, int] = {d: 0 for d in self.DENOMINATIONS}
        self._lock = threading.Lock()

    def add_cash(self, denomination: int, count: int) -> None:
        if denomination not in self._inventory:
            raise ValueError(f"Invalid denomination: {denomination}")
        with self._lock:
            self._inventory[denomination] = (
                self._inventory[denomination] + count
            )

    def get_total(self) -> float:
        return sum(d * c for d, c in self._inventory.items())

    def get_inventory(self) -> dict[int, int]:
        return dict(self._inventory)

    def dispense(self, amount: float) -> dict[int, int] | None:
        """Dispense exact amount using available bills.

        Uses greedy approach first, falls back to backtracking.
        Returns {denomination: count} or None if impossible.
        """
        cents = int(round(amount * 100))
        if cents % 500 != 0:
            return None  # Cannot dispense non-$5 amounts

        target = int(amount)
        with self._lock:
            # Try greedy first (fastest for common cases)
            result = self._greedy_dispense(target)
            if result is not None:
                self._deduct(result)
                return result

            # Fall back to backtracking for exact amount
            result = self._backtrack_dispense(target)
            if result is not None:
                self._deduct(result)
                return result

            return None

    def _greedy_dispense(self, amount: int) -> dict[int, int] | None:
        """Greedy: use largest bills first."""
        remaining = amount
        result: dict[int, int] = {}

        for denom in self.DENOMINATIONS:
            if remaining <= 0:
                break
            available = self._inventory[denom]
            needed = remaining // denom
            used = min(needed, available)
            if used > 0:
                result[denom] = used
                remaining -= denom * used

        if remaining == 0:
            return result
        return None

    def _backtrack_dispense(self, amount: int) -> dict[int, int] | None:
        """Backtracking: find any valid combination."""
        result: dict[int, int] = {}

        def backtrack(remaining: int, denom_idx: int) -> bool:
            if remaining == 0:
                return True
            if remaining < 0 or denom_idx >= len(self.DENOMINATIONS):
                return False

            denom = self.DENOMINATIONS[denom_idx]
            available = self._inventory[denom]
            max_use = min(remaining // denom, available)

            # Try using this denomination from max down to 0
            for count in range(max_use, -1, -1):
                if count > 0:
                    result[denom] = count
                if backtrack(remaining - denom * count, denom_idx + 1):
                    return True
                if count > 0:
                    del result[denom]

            return False

        if backtrack(amount, 0):
            return result
        return None

    def _deduct(self, bills: dict[int, int]) -> None:
        """Remove dispensed bills from inventory."""
        for denom, count in bills.items():
            self._inventory[denom] = self._inventory[denom] - count
```

---

## 7. Transaction Processing Chain

Using Chain of Responsibility: validate -> authorize -> execute -> log.

```python
class TransactionHandler(ABC):
    def __init__(self):
        self._next: TransactionHandler | None = None

    def set_next(self, handler: "TransactionHandler") -> "TransactionHandler":
        self._next = handler
        return handler

    @abstractmethod
    def handle(self, context: TransactionContext,
               atm: "ATM") -> TransactionContext:
        pass

    def pass_to_next(self, context: TransactionContext,
                     atm: "ATM") -> TransactionContext:
        if self._next is not None:
            return self._next.handle(context, atm)
        return context


class ValidationHandler(TransactionHandler):
    """Validate the transaction parameters."""

    def handle(self, context: TransactionContext,
               atm: "ATM") -> TransactionContext:
        if context.transaction_type == TransactionType.WITHDRAWAL:
            if context.amount <= 0:
                return TransactionContext(
                    card=context.card,
                    transaction_type=context.transaction_type,
                    success=False,
                    message="Amount must be positive",
                )
            if context.amount % 5 != 0:
                return TransactionContext(
                    card=context.card,
                    transaction_type=context.transaction_type,
                    success=False,
                    message="Amount must be a multiple of $5",
                )
        return self.pass_to_next(context, atm)


class DailyLimitHandler(TransactionHandler):
    """Enforce daily withdrawal limits."""

    DAILY_LIMIT = 1000.0

    def __init__(self):
        super().__init__()
        # card_number -> {date -> total_withdrawn}
        self._daily_totals: dict[str, dict[str, float]] = defaultdict(
            lambda: defaultdict(float)
        )

    def handle(self, context: TransactionContext,
               atm: "ATM") -> TransactionContext:
        if context.transaction_type != TransactionType.WITHDRAWAL:
            return self.pass_to_next(context, atm)

        today = date.today().isoformat()
        card_num = context.card.card_number
        withdrawn_today = self._daily_totals[card_num][today]

        if withdrawn_today + context.amount > self.DAILY_LIMIT:
            remaining = self.DAILY_LIMIT - withdrawn_today
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                amount=context.amount,
                success=False,
                message=f"Daily limit exceeded. Remaining: ${remaining:.2f}",
            )

        result = self.pass_to_next(context, atm)

        if result.success:
            self._daily_totals[card_num][today] = round(
                withdrawn_today + context.amount, 2
            )

        return result


class ExecutionHandler(TransactionHandler):
    """Execute the actual transaction command."""

    def handle(self, context: TransactionContext,
               atm: "ATM") -> TransactionContext:
        transaction = TRANSACTION_REGISTRY.get(context.transaction_type)
        if transaction is None:
            return TransactionContext(
                card=context.card,
                transaction_type=context.transaction_type,
                success=False,
                message="Unknown transaction type",
            )
        return transaction.execute(context, atm.bank_service, atm.dispenser)


class AuditHandler(TransactionHandler):
    """Log the transaction result."""

    def handle(self, context: TransactionContext,
               atm: "ATM") -> TransactionContext:
        result = self.pass_to_next(context, atm)
        atm.audit_logger.log(
            card_number=context.card.card_number,
            action=context.transaction_type.value,
            details=result.message,
            success=result.success,
        )
        return result
```

### ATM (Main Orchestrator)

```python
class ATM:
    MAX_PIN_ATTEMPTS = 3

    def __init__(self, atm_id: str, bank_service: BankService):
        self._atm_id = atm_id
        self._bank_service = bank_service
        self._dispenser = CashDispenser()
        self._audit_logger = AuditLogger()
        self._state = ATMState.IDLE
        self._current_card: Card | None = None
        self._pin_attempts = 0
        self._selected_type: TransactionType | None = None
        self._lock = threading.Lock()

        # Build the processing chain
        self._chain = self._build_chain()

    @property
    def bank_service(self) -> BankService:
        return self._bank_service

    @property
    def dispenser(self) -> CashDispenser:
        return self._dispenser

    @property
    def audit_logger(self) -> AuditLogger:
        return self._audit_logger

    def _build_chain(self) -> TransactionHandler:
        audit = AuditHandler()
        validation = ValidationHandler()
        daily_limit = DailyLimitHandler()
        execution = ExecutionHandler()

        # Chain: audit -> validation -> daily_limit -> execution
        audit.set_next(validation)
        validation.set_next(daily_limit)
        daily_limit.set_next(execution)
        return audit

    def insert_card(self, card: Card) -> str:
        with self._lock:
            if self._state != ATMState.IDLE:
                return "ATM is busy. Please wait."

            if not self._bank_service.validate_card(card.card_number):
                self._audit_logger.log(
                    card.card_number, "card_insert",
                    "Card validation failed", False,
                )
                return "Card is invalid or locked."

            self._current_card = card
            self._pin_attempts = 0
            self._state = ATMState.CARD_INSERTED
            self._audit_logger.log(
                card.card_number, "card_insert",
                "Card accepted", True,
            )
            return "Card accepted. Please enter your PIN."

    def enter_pin(self, pin: str) -> str:
        with self._lock:
            if self._state != ATMState.CARD_INSERTED:
                return "Please insert your card first."

            if self._current_card is None:
                return "No card inserted."

            card_num = self._current_card.card_number

            if self._bank_service.verify_pin(card_num, pin):
                self._state = ATMState.PIN_VALIDATED
                self._pin_attempts = 0
                self._audit_logger.log(
                    card_num, "pin_verify", "PIN accepted", True,
                )
                return "PIN accepted. Select a transaction."

            self._pin_attempts += 1
            remaining = self.MAX_PIN_ATTEMPTS - self._pin_attempts

            if self._pin_attempts >= self.MAX_PIN_ATTEMPTS:
                if isinstance(self._bank_service, MockBankService):
                    self._bank_service.lock_card(card_num)
                self._audit_logger.log(
                    card_num, "pin_verify",
                    "Card locked after 3 failed attempts", False,
                )
                self._reset()
                return "Card locked. Too many incorrect PIN attempts."

            self._audit_logger.log(
                card_num, "pin_verify",
                f"Incorrect PIN. {remaining} attempts left", False,
            )
            return f"Incorrect PIN. {remaining} attempts remaining."

    def select_transaction(self,
                           txn_type: TransactionType) -> str:
        with self._lock:
            if self._state != ATMState.PIN_VALIDATED:
                return "Please authenticate first."

            self._selected_type = txn_type
            self._state = ATMState.TRANSACTION_SELECTED
            return f"Selected: {txn_type.value}. Provide details."

    def execute(self, amount: float = 0.0,
                target_account: str = "") -> TransactionContext:
        with self._lock:
            if self._state != ATMState.TRANSACTION_SELECTED:
                return TransactionContext(
                    card=Card("", ""),
                    transaction_type=TransactionType.BALANCE_INQUIRY,
                    success=False,
                    message="No transaction selected.",
                )

            context = TransactionContext(
                card=self._current_card,
                transaction_type=self._selected_type,
                amount=amount,
                target_account=target_account,
            )

            result = self._chain.handle(context, self)
            self._reset()
            return result

    def cancel(self) -> str:
        with self._lock:
            if self._state == ATMState.IDLE:
                return "No active session."
            card_num = (self._current_card.card_number
                        if self._current_card else "unknown")
            self._audit_logger.log(
                card_num, "cancel", "Session cancelled", True,
            )
            self._reset()
            return "Session cancelled. Card ejected."

    def _reset(self) -> None:
        self._state = ATMState.IDLE
        self._current_card = None
        self._pin_attempts = 0
        self._selected_type = None
```

---

## 8. Interview Walkthrough

### Usage Demo

```python
# Setup
bank = MockBankService()
bank.register("4111-1111", "ACC-001", "1234", 5000.00)
bank.register("4222-2222", "ACC-002", "5678", 3000.00)

atm = ATM("ATM-001", bank)
atm.dispenser.add_cash(100, 20)  # 20 x $100
atm.dispenser.add_cash(50, 30)   # 30 x $50
atm.dispenser.add_cash(20, 50)   # 50 x $20
atm.dispenser.add_cash(10, 40)   # 40 x $10
atm.dispenser.add_cash(5, 50)    # 50 x $5

card = Card("4111-1111", "ACC-001")

# Full workflow
print(atm.insert_card(card))
print(atm.enter_pin("1234"))
print(atm.select_transaction(TransactionType.WITHDRAWAL))
result = atm.execute(amount=275.00)
print(result.message)
for line in result.receipt_lines:
    print(f"  {line}")

# Balance inquiry
print(atm.insert_card(card))
print(atm.enter_pin("1234"))
print(atm.select_transaction(TransactionType.BALANCE_INQUIRY))
result = atm.execute()
print(result.message)

# Wrong PIN scenario
print(atm.insert_card(card))
print(atm.enter_pin("0000"))  # Wrong
print(atm.enter_pin("0000"))  # Wrong
print(atm.enter_pin("0000"))  # Locked

# Transfer
card2 = Card("4222-2222", "ACC-002")
print(atm.insert_card(card2))
print(atm.enter_pin("5678"))
print(atm.select_transaction(TransactionType.TRANSFER))
result = atm.execute(amount=500.00, target_account="ACC-001")
print(result.message)
```

---

## 9. Common Follow-Up Questions

### "How would you handle power failure mid-dispensing?"

Use a transaction log (write-ahead log). Before dispensing, write the intent to disk.
On restart, check the log: if debit happened but dispensing did not, credit the account
back. This is the same principle as database crash recovery.

### "How would you handle the ATM running low on certain denominations?"

Add a threshold alert to `CashDispenser`. When any denomination drops below a configured
minimum, trigger a notification to the cash management team. Temporarily restrict
withdrawal amounts to what can be dispensed.

### "How would you support multiple languages?"

Use the Strategy pattern for display messages. Create a `DisplayStrategy` interface with
`get_message(key)` method. Implement `EnglishDisplay`, `SpanishDisplay`, etc. Select
the strategy based on user preference stored on the card or selected at start.

### "How would you prevent card skimming?"

This is more hardware/security than LLD, but discuss: card reader encryption,
jitter detection, session timeouts, and anomaly detection on transaction patterns.

### "How would you handle check deposits?"

Add a `CheckDeposit` transaction type. The check amount is held (not available for
withdrawal) until verified. Add a `hold_amount` field to the account that clears
after bank verification.

---

## 10. Gotchas

- **PIN attempts must persist across re-insertion.** If a user inserts the card, fails
  twice, removes the card, and re-inserts, the counter should still show 1 remaining.
  In this design, the counter resets on removal for simplicity, but in real systems
  the bank tracks failed attempts.

- **Cash dispenser atomicity.** The debit-then-dispense sequence is dangerous. If
  dispensing fails after debit, the customer loses money. Always attempt dispensing
  first (or use a two-phase commit with the bank).

- **Denomination selection is not always greedy-solvable.** If the ATM has only $50 and
  $20 bills and the user requests $30, greedy fails. The backtracking algorithm handles
  this edge case.

- **Daily limit is per-card, not per-account.** A user with two cards on the same
  account could withdraw 2x the daily limit. In real systems, enforce limits at the
  account level via the bank.

- **Concurrent access.** A physical ATM is single-user, but the system design may manage
  multiple ATMs. The bank service must handle concurrent debits from different ATMs on
  the same account.

- **Receipt generation must happen after successful dispensing.** Never print a receipt
  for a failed transaction, as it confuses the customer and creates audit issues.

---

## 11. Quick Reference

```
+----------------------------+----------------------------------------+
| Entity                     | Key Responsibility                     |
+----------------------------+----------------------------------------+
| ATM                        | State machine orchestrator             |
| Card                       | Immutable card/account reference       |
| BankService (ABC)          | Interface to bank backend              |
| CashDispenser              | Bill inventory + dispensing algorithm  |
| Transaction (ABC/Command)  | Execute/rollback transaction types     |
| TransactionHandler (CoR)   | Pipeline: validate -> limit -> execute |
| AuditLogger                | Compliance logging                     |
+----------------------------+----------------------------------------+

State Machine:
  IDLE -> CARD_INSERTED -> PIN_VALIDATED -> TXN_SELECTED -> IDLE

Cash Dispenser:
+----------+---------------------------+----------------------------+
| Approach | When Used                 | Trade-off                  |
+----------+---------------------------+----------------------------+
| Greedy   | Most withdrawals          | Fast, may miss solutions   |
| Backtrack| Greedy fails              | Slower, always exact       |
+----------+---------------------------+----------------------------+

Patterns used:
- State Machine       -> ATMState transitions
- Command             -> Transaction execute/rollback
- Chain of Responsibility -> TransactionHandler pipeline
- Strategy            -> BankService (swappable backend)
- Factory             -> TRANSACTION_REGISTRY
- Thread safety       -> Locks on ATM, CashDispenser, AuditLogger
```
