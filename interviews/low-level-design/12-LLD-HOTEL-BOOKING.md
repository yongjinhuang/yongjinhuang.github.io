# Design a Hotel Reservation System

The hotel reservation system is a popular LLD interview question that tests your ability to
model complex lifecycles, implement pricing strategies, and handle date-range queries. It
combines multiple design patterns and has real-world edge cases around overbooking,
cancellation policies, and dynamic pricing.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Reservation Lifecycle](#3-reservation-lifecycle)
4. [Core Implementation](#4-core-implementation)
5. [Pricing Strategy](#5-pricing-strategy)
6. [Room Allocation Algorithm](#6-room-allocation-algorithm)
7. [Cancellation and Payment](#7-cancellation-and-payment)
8. [Interview Walkthrough](#8-interview-walkthrough)
9. [Common Follow-Up Questions](#9-common-follow-up-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Requirements

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| F1 | Room types | Single, Double, Suite, Deluxe with different capacities |
| F2 | Search availability | Find available rooms for a date range and room type |
| F3 | Make reservation | Book a room with guest details and dates |
| F4 | Reservation lifecycle | Pending -> Confirmed -> CheckedIn -> CheckedOut / Cancelled |
| F5 | Pricing | Base rate, seasonal pricing, weekend surcharge, dynamic pricing |
| F6 | Cancellation | Free cancellation window, penalties after cutoff |
| F7 | Guest management | Store guest info, track booking history |
| F8 | Payment | Deposit on booking, full payment at checkout, refund on cancel |

### Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NF1 | Thread-safe room allocation (no double-booking) |
| NF2 | Extensible pricing without modifying existing strategies |
| NF3 | Efficient availability queries across date ranges |

### Clarifying Questions to Ask

- "How far in advance can guests book?" (Up to 365 days)
- "Is overbooking allowed?" (Yes, with a configurable ratio)
- "What is the cancellation policy?" (Free within 48 hours of booking, 50% penalty after)
- "Are there different rates for weekdays vs weekends?" (Yes)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   RoomType (Enum) |       | ReservationStatus   |
|-------------------|       |   (Enum)            |
| SINGLE            |       |---------------------|
| DOUBLE            |       | PENDING             |
| SUITE             |       | CONFIRMED           |
| DELUXE            |       | CHECKED_IN          |
+-------------------+       | CHECKED_OUT         |
                            | CANCELLED           |
+-------------------+       +---------------------+
|   Room            |
|-------------------|       +---------------------+
| room_number       |       |   Guest             |
| room_type         |       |---------------------|
| floor             |       | guest_id            |
| base_rate_cents   |       | name                |
| is_available(     |       | email               |
|   check_in,       |       | phone               |
|   check_out)      |       +---------------------+
+-------------------+
        |               +---------------------+
        |               |   Reservation       |
        |               |---------------------|
        +-------------->| reservation_id      |
                        | guest               |
+-------------------+   | room                |
| PricingStrategy   |   | check_in_date       |
|   (ABC)           |   | check_out_date      |
|-------------------|   | status              |
| calculate(room,   |   | total_price_cents   |
|   check_in,       |   | amount_paid_cents   |
|   check_out)      |   +---------------------+
+-------------------+
   ^    ^    ^          +---------------------+
   |    |    |          |   Hotel             |
 Base Season Weekend    |---------------------|
                        | rooms               |
+-------------------+   | reservations        |
| CancellationPolicy|   | pricing_strategy    |
|   (ABC)           |   |---------------------|
|-------------------|   | search_available()  |
| calculate_refund()|   | make_reservation()  |
+-------------------+   | check_in()          |
   ^         ^          | check_out()         |
   |         |          | cancel()            |
 Free    TimeBased      +---------------------+
```

---

## 3. Reservation Lifecycle

```
    +------------------+
    |    PENDING       |  (reservation created, awaiting deposit)
    +------------------+
          |         |
    deposit paid    |
          |     cancel (full refund)
          v         |
    +------------------+       +------------------+
    |   CONFIRMED      |------>|   CANCELLED      |
    +------------------+       +------------------+
          |                      (refund per policy)
     guest arrives
          |
          v
    +------------------+
    |   CHECKED_IN     |
    +------------------+
          |
     guest departs
     (full payment)
          |
          v
    +------------------+
    |   CHECKED_OUT    |
    +------------------+
```

**Transitions:**

| From | Event | To | Action |
|------|-------|----|--------|
| PENDING | Deposit paid | CONFIRMED | Record payment |
| PENDING | Cancel | CANCELLED | Full refund |
| CONFIRMED | Guest arrives | CHECKED_IN | Verify identity |
| CONFIRMED | Cancel | CANCELLED | Refund per cancellation policy |
| CHECKED_IN | Guest departs | CHECKED_OUT | Charge remaining balance |
| CHECKED_IN | Cancel | Not allowed | Must check out instead |

---

## 4. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import date, timedelta
from abc import ABC, abstractmethod
import uuid
import threading


class RoomType(Enum):
    SINGLE = "single"
    DOUBLE = "double"
    SUITE = "suite"
    DELUXE = "deluxe"


ROOM_CAPACITY: dict[RoomType, int] = {
    RoomType.SINGLE: 1,
    RoomType.DOUBLE: 2,
    RoomType.SUITE: 4,
    RoomType.DELUXE: 3,
}


class ReservationStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class Guest:
    guest_id: str
    name: str
    email: str
    phone: str

    @staticmethod
    def create(name: str, email: str, phone: str) -> "Guest":
        return Guest(
            guest_id=str(uuid.uuid4())[:8],
            name=name,
            email=email,
            phone=phone,
        )
```

### Room

```python
class Room:
    def __init__(self, room_number: str, room_type: RoomType,
                 floor: int, base_rate_cents: int):
        self._room_number = room_number
        self._room_type = room_type
        self._floor = floor
        self._base_rate_cents = base_rate_cents

    @property
    def room_number(self) -> str:
        return self._room_number

    @property
    def room_type(self) -> RoomType:
        return self._room_type

    @property
    def floor(self) -> int:
        return self._floor

    @property
    def base_rate_cents(self) -> int:
        return self._base_rate_cents

    @property
    def capacity(self) -> int:
        return ROOM_CAPACITY[self._room_type]

    def __repr__(self) -> str:
        return (f"Room({self._room_number}, {self._room_type.value}, "
                f"floor={self._floor}, ${self._base_rate_cents / 100:.2f}/night)")
```

### Reservation

```python
class Reservation:
    def __init__(self, guest: Guest, room: Room,
                 check_in_date: date, check_out_date: date,
                 total_price_cents: int):
        self._reservation_id = str(uuid.uuid4())[:8]
        self._guest = guest
        self._room = room
        self._check_in_date = check_in_date
        self._check_out_date = check_out_date
        self._status = ReservationStatus.PENDING
        self._total_price_cents = total_price_cents
        self._amount_paid_cents = 0
        self._created_at = date.today()

    @property
    def reservation_id(self) -> str:
        return self._reservation_id

    @property
    def guest(self) -> Guest:
        return self._guest

    @property
    def room(self) -> Room:
        return self._room

    @property
    def check_in_date(self) -> date:
        return self._check_in_date

    @property
    def check_out_date(self) -> date:
        return self._check_out_date

    @property
    def status(self) -> ReservationStatus:
        return self._status

    @property
    def total_price_cents(self) -> int:
        return self._total_price_cents

    @property
    def amount_paid_cents(self) -> int:
        return self._amount_paid_cents

    @property
    def created_at(self) -> date:
        return self._created_at

    @property
    def nights(self) -> int:
        return (self._check_out_date - self._check_in_date).days

    def confirm(self, deposit_cents: int) -> None:
        if self._status != ReservationStatus.PENDING:
            raise ValueError(f"Cannot confirm reservation in state: {self._status.value}")
        self._amount_paid_cents += deposit_cents
        self._status = ReservationStatus.CONFIRMED

    def check_in(self) -> None:
        if self._status != ReservationStatus.CONFIRMED:
            raise ValueError(f"Cannot check in from state: {self._status.value}")
        self._status = ReservationStatus.CHECKED_IN

    def check_out(self) -> int:
        if self._status != ReservationStatus.CHECKED_IN:
            raise ValueError(f"Cannot check out from state: {self._status.value}")
        remaining = self._total_price_cents - self._amount_paid_cents
        self._amount_paid_cents = self._total_price_cents
        self._status = ReservationStatus.CHECKED_OUT
        return remaining

    def cancel(self, refund_cents: int) -> None:
        if self._status in (ReservationStatus.CHECKED_OUT, ReservationStatus.CANCELLED):
            raise ValueError(f"Cannot cancel reservation in state: {self._status.value}")
        if self._status == ReservationStatus.CHECKED_IN:
            raise ValueError("Cannot cancel after check-in. Please check out instead.")
        self._amount_paid_cents -= refund_cents
        self._status = ReservationStatus.CANCELLED

    def overlaps(self, start: date, end: date) -> bool:
        """Check if this reservation overlaps with a date range."""
        if self._status == ReservationStatus.CANCELLED:
            return False
        return self._check_in_date < end and self._check_out_date > start

    def __repr__(self) -> str:
        return (f"Reservation({self._reservation_id}, {self._guest.name}, "
                f"Room {self._room.room_number}, {self._check_in_date} to "
                f"{self._check_out_date}, {self._status.value})")
```

---

## 5. Pricing Strategy

```python
class PricingStrategy(ABC):
    @abstractmethod
    def calculate_total(self, room: Room, check_in: date, check_out: date) -> int:
        """Return total price in cents for the stay."""
        pass


class BaseRateStrategy(PricingStrategy):
    """Simple flat rate per night based on room's base rate."""

    def calculate_total(self, room: Room, check_in: date, check_out: date) -> int:
        nights = (check_out - check_in).days
        return room.base_rate_cents * nights


class SeasonalPricingStrategy(PricingStrategy):
    """Higher rates during peak seasons."""

    PEAK_MONTHS = {6, 7, 8, 12}  # Summer + December holidays
    PEAK_MULTIPLIER = 1.5

    def calculate_total(self, room: Room, check_in: date, check_out: date) -> int:
        total = 0
        current = check_in
        while current < check_out:
            rate = room.base_rate_cents
            if current.month in self.PEAK_MONTHS:
                rate = int(rate * self.PEAK_MULTIPLIER)
            total += rate
            current += timedelta(days=1)
        return total


class WeekendPricingStrategy(PricingStrategy):
    """Weekend surcharge on Friday and Saturday nights."""

    WEEKEND_DAYS = {4, 5}  # Friday=4, Saturday=5 (weekday() values)
    WEEKEND_MULTIPLIER = 1.25

    def calculate_total(self, room: Room, check_in: date, check_out: date) -> int:
        total = 0
        current = check_in
        while current < check_out:
            rate = room.base_rate_cents
            if current.weekday() in self.WEEKEND_DAYS:
                rate = int(rate * self.WEEKEND_MULTIPLIER)
            total += rate
            current += timedelta(days=1)
        return total


class CompositePricingStrategy(PricingStrategy):
    """Combines multiple pricing factors by layering multipliers per night.

    Instead of running each strategy independently, this calculates a
    per-night multiplier from all active modifiers and applies it once.
    """

    def __init__(self) -> None:
        self._peak_months: set[int] = {6, 7, 8, 12}
        self._peak_multiplier: float = 1.5
        self._weekend_days: set[int] = {4, 5}
        self._weekend_multiplier: float = 1.25

    def calculate_total(self, room: Room, check_in: date, check_out: date) -> int:
        total = 0
        current = check_in
        while current < check_out:
            multiplier = 1.0
            if current.month in self._peak_months:
                multiplier *= self._peak_multiplier
            if current.weekday() in self._weekend_days:
                multiplier *= self._weekend_multiplier
            total += int(room.base_rate_cents * multiplier)
            current += timedelta(days=1)
        return total
```

---

## 6. Room Allocation Algorithm

```python
class RoomAllocator:
    """Finds available rooms for a date range, considering existing reservations.

    The algorithm checks each room against all active (non-cancelled) reservations.
    A room is available if no active reservation overlaps the requested dates.
    """

    def __init__(self, rooms: list[Room], reservations: list[Reservation]):
        self._rooms = rooms
        self._reservations = reservations

    def find_available_rooms(self, check_in: date, check_out: date,
                             room_type: RoomType | None = None,
                             guest_count: int = 1) -> list[Room]:
        """Return rooms available for the entire date range."""
        if check_in >= check_out:
            raise ValueError("Check-in date must be before check-out date")

        available = []
        for room in self._rooms:
            if room_type is not None and room.room_type != room_type:
                continue
            if room.capacity < guest_count:
                continue
            if self._is_room_available(room, check_in, check_out):
                available.append(room)

        # Sort by floor (lower first), then by base rate (cheaper first)
        return sorted(available, key=lambda r: (r.floor, r.base_rate_cents))

    def _is_room_available(self, room: Room, check_in: date, check_out: date) -> bool:
        for reservation in self._reservations:
            if reservation.room.room_number == room.room_number:
                if reservation.overlaps(check_in, check_out):
                    return False
        return True

    def count_available(self, target_date: date,
                        room_type: RoomType | None = None) -> int:
        """Count available rooms for a single date."""
        check_out = target_date + timedelta(days=1)
        return len(self.find_available_rooms(target_date, check_out, room_type))
```

---

## 7. Cancellation and Payment

```python
class CancellationPolicy(ABC):
    @abstractmethod
    def calculate_refund(self, reservation: Reservation) -> int:
        """Return refund amount in cents."""
        pass


class FreeCancellationPolicy(CancellationPolicy):
    """Full refund regardless of when you cancel."""

    def calculate_refund(self, reservation: Reservation) -> int:
        return reservation.amount_paid_cents


class TimeBasedCancellationPolicy(CancellationPolicy):
    """Free cancellation within a window; penalty after.

    - Cancel within `free_window_days` of booking: full refund
    - Cancel after: keep `penalty_percent` of total price
    """

    def __init__(self, free_window_days: int = 2, penalty_percent: float = 50.0):
        self._free_window_days = free_window_days
        self._penalty_percent = penalty_percent

    def calculate_refund(self, reservation: Reservation) -> int:
        days_since_booking = (date.today() - reservation.created_at).days

        if days_since_booking <= self._free_window_days:
            return reservation.amount_paid_cents

        penalty = int(reservation.total_price_cents * self._penalty_percent / 100)
        refund = max(0, reservation.amount_paid_cents - penalty)
        return refund


class Hotel:
    def __init__(self, name: str, rooms: list[Room],
                 pricing: PricingStrategy | None = None,
                 cancellation: CancellationPolicy | None = None,
                 overbooking_ratio: float = 1.0):
        self._name = name
        self._rooms = rooms
        self._reservations: list[Reservation] = []
        self._guests: dict[str, Guest] = {}
        self._pricing = pricing or CompositePricingStrategy()
        self._cancellation = cancellation or TimeBasedCancellationPolicy()
        self._overbooking_ratio = overbooking_ratio
        self._lock = threading.Lock()

    def register_guest(self, name: str, email: str, phone: str) -> Guest:
        guest = Guest.create(name, email, phone)
        self._guests[guest.guest_id] = guest
        return guest

    def search_available(self, check_in: date, check_out: date,
                         room_type: RoomType | None = None,
                         guest_count: int = 1) -> list[Room]:
        allocator = RoomAllocator(self._rooms, self._reservations)
        return allocator.find_available_rooms(check_in, check_out,
                                              room_type, guest_count)

    def make_reservation(self, guest: Guest, room: Room,
                         check_in: date, check_out: date) -> Reservation:
        with self._lock:
            # Verify availability (with overbooking tolerance)
            allocator = RoomAllocator(self._rooms, self._reservations)
            available_count = allocator.count_available(check_in, room.room_type)
            total_of_type = sum(
                1 for r in self._rooms if r.room_type == room.room_type
            )
            max_bookings = int(total_of_type * self._overbooking_ratio)
            booked_count = total_of_type - available_count

            if booked_count >= max_bookings:
                raise ValueError(
                    f"No {room.room_type.value} rooms available for "
                    f"{check_in} to {check_out}"
                )

            total_price = self._pricing.calculate_total(room, check_in, check_out)
            reservation = Reservation(guest, room, check_in, check_out, total_price)
            self._reservations = [*self._reservations, reservation]
            return reservation

    def confirm_reservation(self, reservation_id: str, deposit_cents: int) -> str:
        reservation = self._find_reservation(reservation_id)
        reservation.confirm(deposit_cents)
        return (f"Reservation {reservation_id} confirmed. "
                f"Deposit: ${deposit_cents / 100:.2f}")

    def check_in(self, reservation_id: str) -> str:
        reservation = self._find_reservation(reservation_id)
        reservation.check_in()
        return (f"Checked in: {reservation.guest.name} -> "
                f"Room {reservation.room.room_number}")

    def check_out(self, reservation_id: str) -> str:
        reservation = self._find_reservation(reservation_id)
        remaining = reservation.check_out()
        return (f"Checked out: {reservation.guest.name}. "
                f"Remaining charge: ${remaining / 100:.2f}")

    def cancel_reservation(self, reservation_id: str) -> str:
        reservation = self._find_reservation(reservation_id)
        refund = self._cancellation.calculate_refund(reservation)
        reservation.cancel(refund)
        return (f"Reservation {reservation_id} cancelled. "
                f"Refund: ${refund / 100:.2f}")

    def _find_reservation(self, reservation_id: str) -> Reservation:
        for r in self._reservations:
            if r.reservation_id == reservation_id:
                return r
        raise ValueError(f"Reservation {reservation_id} not found")
```

---

## 8. Interview Walkthrough

### Step 1: Build the Hotel

```python
def create_sample_hotel() -> Hotel:
    rooms = []
    # Floor 1: 5 Single rooms
    for i in range(1, 6):
        rooms.append(Room(f"1{i:02d}", RoomType.SINGLE, floor=1, base_rate_cents=10000))
    # Floor 2: 5 Double rooms
    for i in range(1, 6):
        rooms.append(Room(f"2{i:02d}", RoomType.DOUBLE, floor=2, base_rate_cents=15000))
    # Floor 3: 3 Suite rooms
    for i in range(1, 4):
        rooms.append(Room(f"3{i:02d}", RoomType.SUITE, floor=3, base_rate_cents=30000))
    # Floor 4: 2 Deluxe rooms
    for i in range(1, 3):
        rooms.append(Room(f"4{i:02d}", RoomType.DELUXE, floor=4, base_rate_cents=25000))

    return Hotel(
        name="Grand Hotel",
        rooms=rooms,
        pricing=CompositePricingStrategy(),
        cancellation=TimeBasedCancellationPolicy(free_window_days=2, penalty_percent=50),
        overbooking_ratio=1.1,  # Allow 10% overbooking
    )
```

### Step 2: Usage Demo

```python
hotel = create_sample_hotel()

# Register a guest
guest = hotel.register_guest("Alice Smith", "alice@example.com", "555-0100")

# Search for available rooms
check_in = date(2025, 7, 15)
check_out = date(2025, 7, 18)
available = hotel.search_available(check_in, check_out, RoomType.DOUBLE)
print(f"Available double rooms: {len(available)}")
for room in available:
    print(f"  {room}")

# Make a reservation
reservation = hotel.make_reservation(guest, available[0], check_in, check_out)
print(f"Total price: ${reservation.total_price_cents / 100:.2f}")

# Confirm with deposit (50%)
deposit = reservation.total_price_cents // 2
print(hotel.confirm_reservation(reservation.reservation_id, deposit))

# Check in
print(hotel.check_in(reservation.reservation_id))

# Check out
print(hotel.check_out(reservation.reservation_id))
```

---

## 9. Common Follow-Up Questions

### "How would you handle overbooking?"

The `overbooking_ratio` allows booking more rooms than physically available (e.g., 1.1 means
10% overbooking). If all rooms are occupied at check-in, offer the guest an upgrade to a
higher room type or partner hotel accommodation. Track overbooking statistics to tune the ratio.

### "How would you add loyalty tiers (Gold, Platinum)?"

Add a `LoyaltyTier` enum to `Guest`. Create a `LoyaltyPricingDecorator` that wraps any
`PricingStrategy` and applies tier-based discounts. This follows OCP -- existing strategies
remain unchanged.

### "How would you handle group bookings?"

Create a `GroupReservation` that contains multiple `Reservation` objects linked by a group ID.
Apply group discounts at the `PricingStrategy` level. The lifecycle transitions apply to
each room individually.

### "How would you scale this for a hotel chain?"

Each `Hotel` instance manages its own rooms. A `HotelChain` aggregator searches across
multiple hotels. For a distributed system, use a centralized reservation service with
database-level locks to prevent double-booking across instances.

---

## 10. Gotchas

- **Date range overlap logic.** Two reservations overlap if `start_a < end_b AND start_b < end_a`.
  Getting this wrong causes double-booking or phantom availability. The `overlaps` method uses
  strict less-than because check-out day is not a booked night.

- **Overbooking race condition.** Two concurrent reservations could both pass the availability
  check. The `threading.Lock` in `make_reservation` serializes booking operations. In a real
  system, use database-level optimistic locking.

- **Check-in date is not a check-out date.** A guest checking in on July 15 and out on July 18
  books 3 nights (15, 16, 17). A room becoming free on the 18th is available for a new guest
  checking in on the 18th. The overlap check must handle this boundary correctly.

- **Cancelled reservations still exist.** The `overlaps` method must skip cancelled reservations
  when checking availability. Forgetting this makes cancelled rooms permanently unavailable.

- **Pricing per night vs per stay.** Seasonal and weekend pricing vary by night. The pricing
  strategy must iterate day-by-day, not multiply a flat rate by the number of nights.

- **Deposit vs full payment.** Confirm requires a deposit. Check-out charges the remainder.
  If the deposit exceeds the total (e.g., from a price adjustment), the check-out should
  handle negative remaining amounts as a refund.

---

## 11. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Guest (frozen)             | Immutable guest data: name, email      |
| Room                       | Physical room: type, floor, base rate  |
| Reservation                | Lifecycle: status, dates, payment      |
| PricingStrategy (ABC)      | Calculate total (base, seasonal, etc.) |
| CancellationPolicy (ABC)   | Calculate refund based on policy       |
| RoomAllocator              | Find available rooms for date range    |
| Hotel                      | Orchestrator: book, check-in/out       |
+----------------------------+----------------------------------------+

Reservation Lifecycle:
+------------------+------------------+------------------+
| Status           | Entry Action     | Exit To          |
+------------------+------------------+------------------+
| PENDING          | Created          | CONFIRMED,       |
|                  |                  | CANCELLED        |
| CONFIRMED        | Deposit paid     | CHECKED_IN,      |
|                  |                  | CANCELLED        |
| CHECKED_IN       | Guest arrived    | CHECKED_OUT      |
| CHECKED_OUT      | Final payment    | (terminal)       |
| CANCELLED        | Refund processed | (terminal)       |
+------------------+------------------+------------------+

Patterns used:
- Strategy       -> PricingStrategy, CancellationPolicy (swappable)
- Composite      -> CompositePricingStrategy layers multiple factors
- State          -> Reservation status transitions with guards
- Composition    -> Hotel has Rooms, Reservation links Guest + Room
- Immutability   -> Guest is frozen dataclass
- Thread safety  -> Lock in Hotel for concurrent booking
```
