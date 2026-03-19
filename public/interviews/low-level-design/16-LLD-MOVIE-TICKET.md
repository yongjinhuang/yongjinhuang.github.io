# Design a Movie Ticket Booking System (BookMyShow)

The movie ticket booking system is a popular LLD interview question that tests your ability
to model hierarchical entities (Movie > Theater > Screen > Show > Seat), handle concurrent
seat selection, implement booking workflows with rollback, and design pricing strategies.
The core challenge is preventing double booking when multiple users try to select the same seat.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Seat Locking Mechanism](#4-seat-locking-mechanism)
5. [Booking Workflow](#5-booking-workflow)
6. [Search and Pricing](#6-search-and-pricing)
7. [Interview Walkthrough](#7-interview-walkthrough)
8. [Common Follow-Up Questions](#8-common-follow-up-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement               | Details                                          |
| --- | ------------------------- | ------------------------------------------------ |
| F1  | Movie catalog             | Movies with title, description, duration, genre  |
| F2  | Theater/Screen management | Theaters have multiple screens with seat layouts |
| F3  | Show scheduling           | Assign movies to screens at specific times       |
| F4  | Seat selection            | View available seats, select specific seats      |
| F5  | Seat types                | Regular, Premium, VIP with different pricing     |
| F6  | Booking workflow          | Select -> Lock -> Pay -> Confirm (with timeout)  |
| F7  | Concurrency               | Two users cannot book the same seat              |
| F8  | Cancellation              | Cancel booking with refund rules                 |
| F9  | Search                    | By movie, theater, city, time                    |
| F10 | Discounts                 | Coupon and promotional pricing                   |

### Non-Functional Requirements

| #   | Requirement                                           |
| --- | ----------------------------------------------------- |
| NF1 | Thread-safe seat booking (no double booking)          |
| NF2 | Seat locks expire after timeout (prevent ghost holds) |
| NF3 | Extensible pricing without modifying booking logic    |
| NF4 | Support for multiple cities and theaters              |

### Clarifying Questions to Ask

- "Do we need to support seat maps with specific row/column layouts?" (Yes)
- "How long should a seat lock last before expiring?" (10 minutes)
- "Can a user book multiple seats in one transaction?" (Yes)
- "Do we support partial refunds for cancellation?" (Yes, time-based)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   SeatType        |       |   BookingStatus     |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| REGULAR           |       | PENDING             |
| PREMIUM           |       | CONFIRMED           |
| VIP               |       | CANCELLED           |
+-------------------+       | EXPIRED             |
                            +---------------------+
+-------------------+
|   SeatStatus      |       +---------------------+
|   (Enum)          |       |   Movie             |
|-------------------|       |---------------------|
| AVAILABLE         |       | movie_id            |
| LOCKED            |       | title               |
| BOOKED            |       | duration_min        |
+-------------------+       | genre               |
                            +---------------------+
+-------------------+
|   Seat            |       +---------------------+
|-------------------|       |   Screen            |
| seat_id           |       |---------------------|
| row               |       | screen_id           |
| column            |       | name                |
| seat_type         |       | seats               |
+-------------------+       +---------------------+
                                    |
+-------------------+       +---------------------+
|   ShowSeat        |       |   Show              |
|-------------------|       |---------------------|
| show              |       | show_id             |
| seat              |       | movie               |
| status            |       | screen              |
| locked_by         |       | start_time          |
| lock_expiry       |       | price_map           |
| price             |       |---------------------|
|-------------------|       | get_available_seats()|
| lock(user_id)     |       | lock_seats()        |
| unlock()          |       +---------------------+
| book()            |               |
+-------------------+       +---------------------+
                            |   Theater           |
+-------------------+       |---------------------|
| PricingStrategy   |       | theater_id          |
|   (ABC)           |       | name                |
|-------------------|       | city                |
| calculate(base,   |       | screens             |
|   seats, coupon)  |       +---------------------+
+-------------------+
  ^        ^                +---------------------+
  |        |                |   Booking           |
Standard  Discount          |---------------------|
                            | booking_id          |
+-------------------+       | user_id             |
|   Coupon          |       | show                |
|-------------------|       | seats               |
| code              |       | total_amount        |
| discount_pct      |       | status              |
| max_discount      |       | created_at          |
| valid_until       |       |---------------------|
| min_seats         |       | confirm()           |
+-------------------+       | cancel()            |
                            +---------------------+
```

---

## 3. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
import uuid
import threading
import time


class SeatType(Enum):
    REGULAR = "regular"
    PREMIUM = "premium"
    VIP = "vip"


class SeatStatus(Enum):
    AVAILABLE = "available"
    LOCKED = "locked"
    BOOKED = "booked"


class BookingStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


@dataclass(frozen=True)
class Movie:
    movie_id: str
    title: str
    duration_min: int
    genre: str
    description: str = ""

    @staticmethod
    def create(title: str, duration_min: int, genre: str,
               description: str = "") -> "Movie":
        return Movie(
            movie_id=str(uuid.uuid4())[:8],
            title=title,
            duration_min=duration_min,
            genre=genre,
            description=description,
        )


@dataclass(frozen=True)
class Seat:
    seat_id: str
    row: str
    column: int
    seat_type: SeatType

    @property
    def label(self) -> str:
        return f"{self.row}{self.column}"


@dataclass(frozen=True)
class Coupon:
    code: str
    discount_pct: float      # e.g. 10.0 for 10%
    max_discount: float       # Cap on discount amount
    valid_until: datetime
    min_seats: int = 1        # Minimum seats to apply

    def is_valid(self, num_seats: int) -> bool:
        return (datetime.now() < self.valid_until
                and num_seats >= self.min_seats)
```

### Screen and Show

```python
class Screen:
    def __init__(self, screen_id: str, name: str, seats: list[Seat]):
        self._screen_id = screen_id
        self._name = name
        self._seats = {s.seat_id: s for s in seats}

    @property
    def screen_id(self) -> str:
        return self._screen_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def seats(self) -> list[Seat]:
        return list(self._seats.values())

    @staticmethod
    def create_standard(screen_id: str, name: str,
                        rows: int, cols: int) -> "Screen":
        """Create a screen with standard layout: first 2 rows VIP,
        next 3 Premium, rest Regular."""
        seats = []
        for r in range(rows):
            row_label = chr(ord("A") + r)
            if r < 2:
                seat_type = SeatType.VIP
            elif r < 5:
                seat_type = SeatType.PREMIUM
            else:
                seat_type = SeatType.REGULAR
            for c in range(1, cols + 1):
                seat = Seat(
                    seat_id=f"{screen_id}-{row_label}{c}",
                    row=row_label,
                    column=c,
                    seat_type=seat_type,
                )
                seats.append(seat)
        return Screen(screen_id, name, seats)
```

---

## 4. Seat Locking Mechanism

The `ShowSeat` class tracks per-show seat state with temporary locking to prevent
double booking. Locks expire after a configurable timeout.

```python
LOCK_TIMEOUT_SECONDS = 600  # 10 minutes


class ShowSeat:
    """Represents a specific seat for a specific show.
    Handles locking, booking, and expiry."""

    def __init__(self, show_id: str, seat: Seat, price: float):
        self._show_id = show_id
        self._seat = seat
        self._price = price
        self._status = SeatStatus.AVAILABLE
        self._locked_by: str | None = None
        self._lock_expiry: datetime | None = None
        self._booked_by: str | None = None

    @property
    def seat(self) -> Seat:
        return self._seat

    @property
    def price(self) -> float:
        return self._price

    @property
    def status(self) -> SeatStatus:
        self._check_lock_expiry()
        return self._status

    @property
    def locked_by(self) -> str | None:
        self._check_lock_expiry()
        return self._locked_by

    def is_available(self) -> bool:
        self._check_lock_expiry()
        return self._status == SeatStatus.AVAILABLE

    def lock(self, user_id: str) -> bool:
        """Attempt to lock this seat for a user. Returns True on success."""
        self._check_lock_expiry()
        if self._status != SeatStatus.AVAILABLE:
            return False
        self._status = SeatStatus.LOCKED
        self._locked_by = user_id
        self._lock_expiry = datetime.now() + timedelta(
            seconds=LOCK_TIMEOUT_SECONDS
        )
        return True

    def unlock(self, user_id: str) -> bool:
        """Release a lock. Only the lock holder can unlock."""
        if self._status != SeatStatus.LOCKED:
            return False
        if self._locked_by != user_id:
            return False
        self._status = SeatStatus.AVAILABLE
        self._locked_by = None
        self._lock_expiry = None
        return True

    def book(self, user_id: str) -> bool:
        """Confirm booking. Seat must be locked by this user."""
        if self._status != SeatStatus.LOCKED:
            return False
        if self._locked_by != user_id:
            return False
        self._status = SeatStatus.BOOKED
        self._booked_by = user_id
        self._lock_expiry = None
        return True

    def cancel(self) -> bool:
        """Cancel a booking, making the seat available again."""
        if self._status != SeatStatus.BOOKED:
            return False
        self._status = SeatStatus.AVAILABLE
        self._booked_by = None
        return True

    def _check_lock_expiry(self) -> None:
        """Auto-release expired locks."""
        if (self._status == SeatStatus.LOCKED
                and self._lock_expiry is not None
                and datetime.now() > self._lock_expiry):
            self._status = SeatStatus.AVAILABLE
            self._locked_by = None
            self._lock_expiry = None
```

### Show Class

```python
class Show:
    PRICE_MAP: dict[SeatType, float] = {
        SeatType.REGULAR: 10.00,
        SeatType.PREMIUM: 15.00,
        SeatType.VIP: 25.00,
    }

    def __init__(self, show_id: str, movie: Movie, screen: Screen,
                 start_time: datetime,
                 price_map: dict[SeatType, float] | None = None):
        self._show_id = show_id
        self._movie = movie
        self._screen = screen
        self._start_time = start_time
        self._price_map = price_map or self.PRICE_MAP
        self._lock = threading.Lock()

        # Create ShowSeat for every seat in the screen
        self._show_seats: dict[str, ShowSeat] = {}
        for seat in screen.seats:
            price = self._price_map.get(seat.seat_type, 10.00)
            self._show_seats[seat.seat_id] = ShowSeat(show_id, seat, price)

    @property
    def show_id(self) -> str:
        return self._show_id

    @property
    def movie(self) -> Movie:
        return self._movie

    @property
    def start_time(self) -> datetime:
        return self._start_time

    def get_available_seats(self) -> list[ShowSeat]:
        return [ss for ss in self._show_seats.values() if ss.is_available()]

    def get_seats_by_type(self, seat_type: SeatType) -> list[ShowSeat]:
        return [
            ss for ss in self._show_seats.values()
            if ss.seat.seat_type == seat_type and ss.is_available()
        ]

    def lock_seats(self, seat_ids: list[str],
                   user_id: str) -> list[ShowSeat]:
        """Atomically lock multiple seats. All-or-nothing."""
        with self._lock:
            # Verify all seats are available first
            show_seats = []
            for seat_id in seat_ids:
                if seat_id not in self._show_seats:
                    raise ValueError(f"Seat {seat_id} not found")
                ss = self._show_seats[seat_id]
                if not ss.is_available():
                    raise ValueError(
                        f"Seat {ss.seat.label} is not available"
                    )
                show_seats.append(ss)

            # Lock all seats atomically
            locked = []
            for ss in show_seats:
                if ss.lock(user_id):
                    locked.append(ss)
                else:
                    # Rollback: unlock everything we locked so far
                    for prev in locked:
                        prev.unlock(user_id)
                    raise ValueError(
                        f"Failed to lock seat {ss.seat.label}"
                    )
            return locked

    def book_seats(self, seat_ids: list[str], user_id: str) -> bool:
        """Confirm booking on previously locked seats."""
        with self._lock:
            for seat_id in seat_ids:
                ss = self._show_seats[seat_id]
                if not ss.book(user_id):
                    return False
            return True

    def cancel_seats(self, seat_ids: list[str]) -> None:
        """Cancel booked seats (for refund/cancellation)."""
        with self._lock:
            for seat_id in seat_ids:
                self._show_seats[seat_id].cancel()
```

---

## 5. Booking Workflow

### Pricing Strategy

```python
class PricingStrategy(ABC):
    @abstractmethod
    def calculate(self, base_prices: list[float],
                  coupon: Coupon | None = None) -> float:
        pass


class StandardPricing(PricingStrategy):
    """Sum of seat prices, apply coupon if valid."""

    def calculate(self, base_prices: list[float],
                  coupon: Coupon | None = None) -> float:
        total = sum(base_prices)
        if coupon is not None and coupon.is_valid(len(base_prices)):
            discount = min(
                total * coupon.discount_pct / 100.0,
                coupon.max_discount,
            )
            total = round(total - discount, 2)
        return round(total, 2)


class WeekendPricing(PricingStrategy):
    """20% surcharge on weekends, then apply coupon."""

    SURCHARGE = 1.20

    def calculate(self, base_prices: list[float],
                  coupon: Coupon | None = None) -> float:
        total = sum(p * self.SURCHARGE for p in base_prices)
        if coupon is not None and coupon.is_valid(len(base_prices)):
            discount = min(
                total * coupon.discount_pct / 100.0,
                coupon.max_discount,
            )
            total = round(total - discount, 2)
        return round(total, 2)
```

### Booking Manager

```python
@dataclass
class Booking:
    booking_id: str
    user_id: str
    show: Show
    seat_ids: list[str]
    total_amount: float
    status: BookingStatus
    created_at: datetime

    @staticmethod
    def create(user_id: str, show: Show, seat_ids: list[str],
               total_amount: float) -> "Booking":
        return Booking(
            booking_id=str(uuid.uuid4())[:8],
            user_id=user_id,
            show=show,
            seat_ids=list(seat_ids),
            total_amount=total_amount,
            status=BookingStatus.PENDING,
            created_at=datetime.now(),
        )


class BookingService:
    def __init__(self, pricing: PricingStrategy | None = None):
        self._bookings: dict[str, Booking] = {}
        self._pricing = pricing or StandardPricing()
        self._lock = threading.Lock()

    def start_booking(self, user_id: str, show: Show,
                      seat_ids: list[str],
                      coupon: Coupon | None = None) -> Booking:
        """Step 1: Lock seats and create pending booking."""
        # Lock seats (raises ValueError if unavailable)
        locked_seats = show.lock_seats(seat_ids, user_id)

        # Calculate price
        base_prices = [ss.price for ss in locked_seats]
        total = self._pricing.calculate(base_prices, coupon)

        booking = Booking.create(user_id, show, seat_ids, total)

        with self._lock:
            self._bookings[booking.booking_id] = booking

        return booking

    def confirm_booking(self, booking_id: str) -> Booking:
        """Step 2: After payment, confirm the booking."""
        with self._lock:
            if booking_id not in self._bookings:
                raise ValueError(f"Booking {booking_id} not found")
            booking = self._bookings[booking_id]

            if booking.status != BookingStatus.PENDING:
                raise ValueError(
                    f"Booking {booking_id} is {booking.status.value}"
                )

            success = booking.show.book_seats(
                booking.seat_ids, booking.user_id
            )
            if not success:
                booking.status = BookingStatus.EXPIRED
                raise ValueError("Seat lock expired, booking failed")

            booking.status = BookingStatus.CONFIRMED
            return booking

    def cancel_booking(self, booking_id: str) -> tuple[Booking, float]:
        """Cancel a confirmed booking. Returns booking and refund amount."""
        with self._lock:
            if booking_id not in self._bookings:
                raise ValueError(f"Booking {booking_id} not found")
            booking = self._bookings[booking_id]

            if booking.status != BookingStatus.CONFIRMED:
                raise ValueError("Can only cancel confirmed bookings")

            booking.show.cancel_seats(booking.seat_ids)
            booking.status = BookingStatus.CANCELLED

            refund = self._calculate_refund(booking)
            return booking, refund

    def _calculate_refund(self, booking: Booking) -> float:
        """Refund rules: >24h before show = 100%, >2h = 50%, else 0%."""
        time_to_show = (
            booking.show.start_time - datetime.now()
        ).total_seconds() / 3600

        if time_to_show > 24:
            return booking.total_amount
        if time_to_show > 2:
            return round(booking.total_amount * 0.5, 2)
        return 0.0
```

---

## 6. Search and Pricing

### Theater and Search

```python
class Theater:
    def __init__(self, theater_id: str, name: str, city: str,
                 screens: list[Screen]):
        self._theater_id = theater_id
        self._name = name
        self._city = city
        self._screens = {s.screen_id: s for s in screens}
        self._shows: list[Show] = []

    @property
    def theater_id(self) -> str:
        return self._theater_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def city(self) -> str:
        return self._city

    def add_show(self, show: Show) -> None:
        self._shows.append(show)

    def get_shows_for_movie(self, movie_id: str) -> list[Show]:
        return [s for s in self._shows if s.movie.movie_id == movie_id]

    def get_shows_on_date(self, date: datetime) -> list[Show]:
        return [
            s for s in self._shows
            if s.start_time.date() == date.date()
        ]


class MovieSearchService:
    def __init__(self):
        self._theaters: dict[str, Theater] = {}
        self._movies: dict[str, Movie] = {}

    def add_theater(self, theater: Theater) -> None:
        self._theaters[theater.theater_id] = theater

    def add_movie(self, movie: Movie) -> None:
        self._movies[movie.movie_id] = movie

    def search_by_movie(self, title: str) -> list[Movie]:
        title_lower = title.lower()
        return [
            m for m in self._movies.values()
            if title_lower in m.title.lower()
        ]

    def search_by_city(self, city: str) -> list[Theater]:
        city_lower = city.lower()
        return [
            t for t in self._theaters.values()
            if t.city.lower() == city_lower
        ]

    def search_shows(self, movie_id: str, city: str,
                     date: datetime | None = None) -> list[Show]:
        theaters = self.search_by_city(city)
        shows = []
        for theater in theaters:
            theater_shows = theater.get_shows_for_movie(movie_id)
            if date is not None:
                theater_shows = [
                    s for s in theater_shows
                    if s.start_time.date() == date.date()
                ]
            shows.extend(theater_shows)
        return sorted(shows, key=lambda s: s.start_time)
```

---

## 7. Interview Walkthrough

### Usage Demo

```python
# Setup
movie = Movie.create("Inception", 148, "Sci-Fi")
screen = Screen.create_standard("SCR-1", "Screen 1", rows=8, cols=10)
show = Show(
    "SHOW-1", movie, screen,
    start_time=datetime.now() + timedelta(hours=48),
)

theater = Theater("TH-1", "CinePlex", "New York", [screen])
theater.add_show(show)

service = BookingService()

# User 1 books seats A1, A2 (VIP)
booking = service.start_booking(
    user_id="user-1",
    show=show,
    seat_ids=["SCR-1-A1", "SCR-1-A2"],
)
print(f"Pending booking: ${booking.total_amount:.2f}")

# Simulate payment success
confirmed = service.confirm_booking(booking.booking_id)
print(f"Confirmed: {confirmed.booking_id}")

# User 2 tries the same seats -- fails
try:
    service.start_booking(
        user_id="user-2",
        show=show,
        seat_ids=["SCR-1-A1"],
    )
except ValueError as e:
    print(f"Expected failure: {e}")

# User 2 books different seats with a coupon
coupon = Coupon(
    code="SAVE10",
    discount_pct=10.0,
    max_discount=5.00,
    valid_until=datetime.now() + timedelta(days=30),
)

booking2 = service.start_booking(
    user_id="user-2",
    show=show,
    seat_ids=["SCR-1-C3", "SCR-1-C4"],
    coupon=coupon,
)
service.confirm_booking(booking2.booking_id)
print(f"User 2 paid: ${booking2.total_amount:.2f}")

# Cancellation
cancelled, refund = service.cancel_booking(confirmed.booking_id)
print(f"Refund: ${refund:.2f}")
```

---

## 8. Common Follow-Up Questions

### "What happens if two users click the same seat at the same time?"

The `Show.lock_seats()` method uses a `threading.Lock()` so only one thread can lock
seats at a time. The second user gets a `ValueError` and must pick different seats.
In a distributed system, use Redis `SETNX` or a database row-level lock.

### "How would you handle seat maps with irregular layouts?"

Replace the simple row/column model with a `SeatLayout` class that stores a 2D grid
with null entries for gaps (aisles, pillars). Render the layout as a matrix for the
frontend.

### "How would you scale this for high-demand shows?"

Use a queue-based approach: users enter a virtual waiting room, are assigned a time slot,
and only allowed to select seats during their slot. This prevents thundering herd on
the seat lock mechanism.

### "How would you add food/beverage ordering during booking?"

Add an `AddOn` class with name, price, and category. The `Booking` holds a list of
add-ons. The `PricingStrategy` includes add-on totals in the final price.

### "How would you implement a recommendation system?"

Track user booking history (genres, theaters, times). Use collaborative filtering
or simple frequency-based recommendations. This is a system design question, not LLD.

---

## 9. Gotchas

- **Seat lock timeout is critical.** Without it, abandoned bookings permanently block
  seats. The `_check_lock_expiry()` method in `ShowSeat` auto-releases stale locks on
  every status check.

- **Atomic multi-seat locking.** If you lock seats one by one, a failure midway leaves
  some seats locked. The all-or-nothing approach in `lock_seats` with rollback prevents
  partial locks.

- **Coupon validation timing.** Validate the coupon at booking time, not at payment time.
  A coupon could expire between seat selection and payment. Store the applied discount
  on the booking.

- **Refund race condition.** A user could try to cancel while the payment processor is
  still confirming. Use the `BookingStatus` state machine to prevent illegal transitions.

- **Show time overlap.** When scheduling shows, verify that the screen is free for the
  movie duration plus cleanup time. Without this check, you can double-book a screen.

- **Price consistency.** Lock the price at booking creation time. If prices change between
  locking and confirming, the user should pay the price they saw during selection.

---

## 10. Quick Reference

```
+----------------------------+----------------------------------------+
| Entity                     | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Movie                      | Immutable catalog data                 |
| Seat                       | Physical seat: row, column, type       |
| Screen                     | Collection of seats with layout        |
| ShowSeat                   | Per-show seat: status, lock, price     |
| Show                       | Movie + Screen + time, atomic locking  |
| Theater                    | Screens + shows in a city              |
| Booking                    | User's reservation: seats + amount     |
| BookingService             | Workflow: lock -> pay -> confirm       |
| PricingStrategy (ABC)      | Calculate total with discounts         |
+----------------------------+----------------------------------------+

Booking State Machine:
  PENDING ----(payment)----> CONFIRMED
  PENDING ----(timeout)----> EXPIRED
  CONFIRMED --(cancel)-----> CANCELLED

Seat State Machine:
  AVAILABLE ---(lock)------> LOCKED
  LOCKED -----(book)-------> BOOKED
  LOCKED -----(timeout)----> AVAILABLE
  LOCKED -----(unlock)-----> AVAILABLE
  BOOKED -----(cancel)-----> AVAILABLE

Patterns used:
- Strategy       -> PricingStrategy (swappable pricing)
- State Machine  -> SeatStatus and BookingStatus transitions
- Factory        -> Static create() methods
- Composition    -> Theater has Screens, Screen has Seats
- Immutability   -> Movie, Seat, Coupon are frozen dataclasses
- Thread safety  -> Lock in Show for atomic seat operations
```
