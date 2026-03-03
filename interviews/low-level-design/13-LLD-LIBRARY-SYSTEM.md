# Design a Library Management System

The library management system is a classic LLD interview question that covers a broad range of
OOP concepts: entity relationships, lifecycle management, search composition, observer notifications,
and strategy-based policies. It is often categorized as "easy" in difficulty but interviewers
expect a clean, extensible design with proper handling of due dates, fines, and reservation queues.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Borrow and Return Flow](#4-borrow-and-return-flow)
5. [Fine Calculation](#5-fine-calculation)
6. [Search System](#6-search-system)
7. [Reservation Queue](#7-reservation-queue)
8. [Notification System](#8-notification-system)
9. [Interview Walkthrough](#9-interview-walkthrough)
10. [Common Follow-Up Questions](#10-common-follow-up-questions)
11. [Gotchas](#11-gotchas)
12. [Quick Reference](#12-quick-reference)

---

## 1. Requirements

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| F1 | Book catalog | Book metadata (title, author, ISBN, subject) with multiple copies |
| F2 | Member types | Student and Faculty with different borrowing limits |
| F3 | Borrow/return | Check out a book copy, return it, track due dates |
| F4 | Fines | Calculate fines for overdue books based on policy |
| F5 | Reservations | Members can place holds; queue per book, FIFO |
| F6 | Search | Search by title, author, subject, ISBN with composable criteria |
| F7 | Notifications | Notify on overdue, reservation available, due soon |
| F8 | Rack location | Track physical location (rack, shelf) of each copy |

### Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NF1 | Thread-safe borrow/return (no double-lending) |
| NF2 | Extensible search without modifying existing criteria |
| NF3 | Pluggable fine policies (flat, progressive, capped) |

### Clarifying Questions to Ask

- "How many copies per book?" (Variable, each copy tracked individually)
- "What are the borrowing limits?" (Students: 5 books / 14 days, Faculty: 10 books / 30 days)
- "Can a member reserve a book that is currently available?" (No, only if all copies are borrowed)
- "How are fines calculated?" (Per day overdue, different rates possible)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   BookStatus      |       |   MemberType (Enum) |
|   (Enum)          |       |---------------------|
|-------------------|       | STUDENT             |
| AVAILABLE         |       | FACULTY             |
| BORROWED          |       +---------------------+
| RESERVED          |
| LOST              |       +---------------------+
+-------------------+       |   Author            |
                            |---------------------|
+-------------------+       | name                |
|   Book            |       | biography           |
|-------------------|       +---------------------+
| isbn              |              |
| title             |       +---------------------+
| authors           |       |   Subject (Enum)    |
| subject           |       |---------------------|
| copies: BookItem[]|       | FICTION, SCIENCE,   |
+-------------------+       | HISTORY, TECH, ...  |
        |                   +---------------------+
        v
+-------------------+       +---------------------+
|   BookItem (Copy) |       |   RackLocation      |
|-------------------|       |---------------------|
| barcode           |       | rack_id             |
| book (ref)        |       | shelf               |
| status            |       | position            |
| location          |       +---------------------+
| due_date          |
| borrowed_by       |       +---------------------+
+-------------------+       |   BorrowRecord      |
                            |---------------------|
+-------------------+       | member              |
|   Member          |       | book_item           |
|-------------------|       | borrow_date         |
| member_id         |       | due_date            |
| name              |       | return_date         |
| member_type       |       | fine_cents          |
| borrowed_items    |       +---------------------+
| active_fines      |
|-------------------|       +---------------------+
| can_borrow()      |       |   FineStrategy(ABC) |
| borrow_limit      |       |---------------------|
+-------------------+       | calculate(days_late)|
   ^           ^            +---------------------+
   |           |               ^       ^       ^
 Student    Faculty          Flat  Progressive Capped

+-------------------+       +---------------------+
| SearchCriteria    |       |   Library           |
|   (ABC)           |       |---------------------|
|-------------------|       | catalog             |
| matches(book)     |       | members             |
+-------------------+       | reservations        |
  ^   ^   ^   ^             |---------------------|
  |   |   |   |             | search()            |
Title Author Subject ISBN   | borrow()            |
                            | return_book()       |
+-------------------+       | place_hold()        |
| EventBus          |       | get_fines()         |
|   (Observer)      |       +---------------------+
|-------------------|
| subscribe(event,  |
|   listener)       |
| publish(event)    |
+-------------------+
```

---

## 3. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import date, timedelta
from abc import ABC, abstractmethod
from collections import defaultdict, deque
import uuid
import threading


class BookStatus(Enum):
    AVAILABLE = "available"
    BORROWED = "borrowed"
    RESERVED = "reserved"
    LOST = "lost"


class MemberType(Enum):
    STUDENT = "student"
    FACULTY = "faculty"


class Subject(Enum):
    FICTION = "fiction"
    SCIENCE = "science"
    HISTORY = "history"
    TECHNOLOGY = "technology"
    PHILOSOPHY = "philosophy"
    ARTS = "arts"


BORROW_LIMITS: dict[MemberType, int] = {
    MemberType.STUDENT: 5,
    MemberType.FACULTY: 10,
}

LOAN_PERIOD_DAYS: dict[MemberType, int] = {
    MemberType.STUDENT: 14,
    MemberType.FACULTY: 30,
}


@dataclass(frozen=True)
class Author:
    name: str
    biography: str = ""

    def __str__(self) -> str:
        return self.name


@dataclass(frozen=True)
class RackLocation:
    rack_id: str
    shelf: int
    position: int

    def __str__(self) -> str:
        return f"Rack {self.rack_id}, Shelf {self.shelf}, Pos {self.position}"
```

### Book and BookItem

```python
@dataclass(frozen=True)
class Book:
    isbn: str
    title: str
    authors: tuple[Author, ...]
    subject: Subject
    publication_year: int = 0

    def __str__(self) -> str:
        author_names = ", ".join(a.name for a in self.authors)
        return f'"{self.title}" by {author_names} (ISBN: {self.isbn})'


class BookItem:
    """A physical copy of a book."""

    def __init__(self, book: Book, barcode: str, location: RackLocation):
        self._book = book
        self._barcode = barcode
        self._location = location
        self._status = BookStatus.AVAILABLE
        self._due_date: date | None = None
        self._borrowed_by: "Member | None" = None

    @property
    def book(self) -> Book:
        return self._book

    @property
    def barcode(self) -> str:
        return self._barcode

    @property
    def location(self) -> RackLocation:
        return self._location

    @property
    def status(self) -> BookStatus:
        return self._status

    @property
    def due_date(self) -> date | None:
        return self._due_date

    @property
    def borrowed_by(self) -> "Member | None":
        return self._borrowed_by

    def checkout(self, member: "Member", loan_days: int) -> None:
        if self._status != BookStatus.AVAILABLE:
            raise ValueError(f"Book item {self._barcode} is not available (status: {self._status.value})")
        self._status = BookStatus.BORROWED
        self._borrowed_by = member
        self._due_date = date.today() + timedelta(days=loan_days)

    def return_item(self) -> int:
        """Return the book. Returns days overdue (0 if on time)."""
        if self._status != BookStatus.BORROWED:
            raise ValueError(f"Book item {self._barcode} is not borrowed")
        days_overdue = 0
        if self._due_date and date.today() > self._due_date:
            days_overdue = (date.today() - self._due_date).days
        self._status = BookStatus.AVAILABLE
        self._borrowed_by = None
        self._due_date = None
        return days_overdue

    def mark_reserved(self) -> None:
        self._status = BookStatus.RESERVED

    def mark_available(self) -> None:
        self._status = BookStatus.AVAILABLE

    def mark_lost(self) -> None:
        self._status = BookStatus.LOST

    def is_overdue(self) -> bool:
        if self._status != BookStatus.BORROWED or self._due_date is None:
            return False
        return date.today() > self._due_date

    def __repr__(self) -> str:
        return (f"BookItem({self._barcode}, '{self._book.title}', "
                f"{self._status.value}, {self._location})")
```

### Member

```python
class Member:
    def __init__(self, name: str, email: str, member_type: MemberType):
        self._member_id = str(uuid.uuid4())[:8]
        self._name = name
        self._email = email
        self._member_type = member_type
        self._borrowed_items: list[BookItem] = []
        self._total_fines_cents = 0

    @property
    def member_id(self) -> str:
        return self._member_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def email(self) -> str:
        return self._email

    @property
    def member_type(self) -> MemberType:
        return self._member_type

    @property
    def borrowed_items(self) -> list[BookItem]:
        return list(self._borrowed_items)

    @property
    def borrow_limit(self) -> int:
        return BORROW_LIMITS[self._member_type]

    @property
    def loan_period_days(self) -> int:
        return LOAN_PERIOD_DAYS[self._member_type]

    @property
    def total_fines_cents(self) -> int:
        return self._total_fines_cents

    def can_borrow(self) -> bool:
        return len(self._borrowed_items) < self.borrow_limit and self._total_fines_cents == 0

    def add_borrowed_item(self, item: BookItem) -> None:
        self._borrowed_items = [*self._borrowed_items, item]

    def remove_borrowed_item(self, item: BookItem) -> None:
        self._borrowed_items = [i for i in self._borrowed_items if i.barcode != item.barcode]

    def add_fine(self, amount_cents: int) -> None:
        self._total_fines_cents += amount_cents

    def pay_fine(self, amount_cents: int) -> int:
        paid = min(amount_cents, self._total_fines_cents)
        self._total_fines_cents -= paid
        return paid

    def __repr__(self) -> str:
        return (f"Member({self._member_id}, {self._name}, "
                f"{self._member_type.value}, borrowed={len(self._borrowed_items)})")
```

---

## 4. Borrow and Return Flow

```python
@dataclass
class BorrowRecord:
    member: Member
    book_item: BookItem
    borrow_date: date
    due_date: date
    return_date: date | None = None
    fine_cents: int = 0
```

---

## 5. Fine Calculation

```python
class FineStrategy(ABC):
    @abstractmethod
    def calculate(self, days_overdue: int) -> int:
        """Return fine amount in cents."""
        pass


class FlatFineStrategy(FineStrategy):
    """Fixed rate per day overdue."""

    def __init__(self, cents_per_day: int = 25):
        self._cents_per_day = cents_per_day

    def calculate(self, days_overdue: int) -> int:
        if days_overdue <= 0:
            return 0
        return days_overdue * self._cents_per_day


class ProgressiveFineStrategy(FineStrategy):
    """Rate increases the longer the book is overdue.

    - Days 1-7: base rate
    - Days 8-14: 2x base rate
    - Days 15+: 3x base rate
    """

    def __init__(self, base_cents_per_day: int = 25):
        self._base = base_cents_per_day

    def calculate(self, days_overdue: int) -> int:
        if days_overdue <= 0:
            return 0

        total = 0
        for day in range(1, days_overdue + 1):
            if day <= 7:
                total += self._base
            elif day <= 14:
                total += self._base * 2
            else:
                total += self._base * 3
        return total


class CappedFineStrategy(FineStrategy):
    """Fine per day but capped at a maximum amount."""

    def __init__(self, cents_per_day: int = 50, max_fine_cents: int = 2000):
        self._cents_per_day = cents_per_day
        self._max_fine_cents = max_fine_cents

    def calculate(self, days_overdue: int) -> int:
        if days_overdue <= 0:
            return 0
        return min(days_overdue * self._cents_per_day, self._max_fine_cents)
```

---

## 6. Search System

```python
class SearchCriteria(ABC):
    """Composable search criterion. Each criterion matches against a Book."""

    @abstractmethod
    def matches(self, book: Book) -> bool:
        pass


class TitleSearch(SearchCriteria):
    def __init__(self, keyword: str):
        self._keyword = keyword.lower()

    def matches(self, book: Book) -> bool:
        return self._keyword in book.title.lower()


class AuthorSearch(SearchCriteria):
    def __init__(self, author_name: str):
        self._name = author_name.lower()

    def matches(self, book: Book) -> bool:
        return any(self._name in a.name.lower() for a in book.authors)


class SubjectSearch(SearchCriteria):
    def __init__(self, subject: Subject):
        self._subject = subject

    def matches(self, book: Book) -> bool:
        return book.subject == self._subject


class ISBNSearch(SearchCriteria):
    def __init__(self, isbn: str):
        self._isbn = isbn

    def matches(self, book: Book) -> bool:
        return book.isbn == self._isbn


class AndSearch(SearchCriteria):
    """Matches if ALL criteria match."""

    def __init__(self, criteria: list[SearchCriteria]):
        self._criteria = criteria

    def matches(self, book: Book) -> bool:
        return all(c.matches(book) for c in self._criteria)


class OrSearch(SearchCriteria):
    """Matches if ANY criterion matches."""

    def __init__(self, criteria: list[SearchCriteria]):
        self._criteria = criteria

    def matches(self, book: Book) -> bool:
        return any(c.matches(book) for c in self._criteria)
```

---

## 7. Reservation Queue

```python
class ReservationQueue:
    """Per-book FIFO reservation queue.

    When all copies of a book are borrowed, members can place a hold.
    When a copy is returned, the first member in the queue is notified.
    """

    def __init__(self) -> None:
        self._queues: dict[str, deque[Member]] = defaultdict(deque)

    def place_hold(self, isbn: str, member: Member) -> int:
        """Place a hold. Returns queue position (1-based)."""
        queue = self._queues[isbn]
        if any(m.member_id == member.member_id for m in queue):
            raise ValueError(f"{member.name} already has a hold on ISBN {isbn}")
        queue.append(member)
        return len(queue)

    def cancel_hold(self, isbn: str, member: Member) -> None:
        queue = self._queues[isbn]
        self._queues[isbn] = deque(
            m for m in queue if m.member_id != member.member_id
        )

    def next_in_line(self, isbn: str) -> Member | None:
        queue = self._queues[isbn]
        if not queue:
            return None
        return queue.popleft()

    def queue_length(self, isbn: str) -> int:
        return len(self._queues[isbn])

    def get_position(self, isbn: str, member: Member) -> int | None:
        queue = self._queues[isbn]
        for i, m in enumerate(queue):
            if m.member_id == member.member_id:
                return i + 1
        return None
```

---

## 8. Notification System

```python
class LibraryEvent(Enum):
    BOOK_OVERDUE = "book_overdue"
    RESERVATION_AVAILABLE = "reservation_available"
    DUE_SOON = "due_soon"
    FINE_ADDED = "fine_added"


@dataclass(frozen=True)
class Notification:
    event: LibraryEvent
    member: Member
    message: str


class EventBus:
    """Simple observer pattern for library events."""

    def __init__(self) -> None:
        self._listeners: dict[LibraryEvent, list] = defaultdict(list)
        self._notification_log: list[Notification] = []

    def subscribe(self, event: LibraryEvent,
                  listener: "callable") -> None:
        self._listeners[event].append(listener)

    def publish(self, notification: Notification) -> None:
        self._notification_log = [*self._notification_log, notification]
        for listener in self._listeners.get(notification.event, []):
            listener(notification)

    @property
    def notification_log(self) -> list[Notification]:
        return list(self._notification_log)
```

### Library (Main Orchestrator)

```python
class Library:
    def __init__(self, name: str, fine_strategy: FineStrategy | None = None):
        self._name = name
        self._catalog: dict[str, Book] = {}           # isbn -> Book
        self._items: dict[str, BookItem] = {}          # barcode -> BookItem
        self._items_by_isbn: dict[str, list[BookItem]] = defaultdict(list)
        self._members: dict[str, Member] = {}
        self._borrow_records: list[BorrowRecord] = []
        self._reservations = ReservationQueue()
        self._event_bus = EventBus()
        self._fine_strategy = fine_strategy or FlatFineStrategy()
        self._lock = threading.Lock()

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus

    # --- Catalog Management ---

    def add_book(self, book: Book) -> None:
        self._catalog[book.isbn] = book

    def add_book_item(self, book_item: BookItem) -> None:
        self._items[book_item.barcode] = book_item
        self._items_by_isbn[book_item.book.isbn].append(book_item)

    def register_member(self, name: str, email: str,
                        member_type: MemberType) -> Member:
        member = Member(name, email, member_type)
        self._members[member.member_id] = member
        return member

    # --- Search ---

    def search(self, criteria: SearchCriteria) -> list[Book]:
        return [book for book in self._catalog.values() if criteria.matches(book)]

    def get_available_copies(self, isbn: str) -> list[BookItem]:
        return [
            item for item in self._items_by_isbn.get(isbn, [])
            if item.status == BookStatus.AVAILABLE
        ]

    # --- Borrow / Return ---

    def borrow_book(self, member_id: str, barcode: str) -> BorrowRecord:
        with self._lock:
            member = self._members.get(member_id)
            if member is None:
                raise ValueError(f"Member {member_id} not found")

            if not member.can_borrow():
                if member.total_fines_cents > 0:
                    raise ValueError(
                        f"{member.name} has unpaid fines: ${member.total_fines_cents / 100:.2f}")
                raise ValueError(f"{member.name} has reached the borrow limit")

            item = self._items.get(barcode)
            if item is None:
                raise ValueError(f"Book item {barcode} not found")

            item.checkout(member, member.loan_period_days)
            member.add_borrowed_item(item)

            record = BorrowRecord(
                member=member,
                book_item=item,
                borrow_date=date.today(),
                due_date=item.due_date,
            )
            self._borrow_records = [*self._borrow_records, record]
            return record

    def return_book(self, barcode: str) -> BorrowRecord:
        with self._lock:
            item = self._items.get(barcode)
            if item is None:
                raise ValueError(f"Book item {barcode} not found")

            member = item.borrowed_by
            if member is None:
                raise ValueError(f"Book item {barcode} is not borrowed")

            days_overdue = item.return_item()
            member.remove_borrowed_item(item)

            # Calculate fine
            fine_cents = self._fine_strategy.calculate(days_overdue)
            if fine_cents > 0:
                member.add_fine(fine_cents)
                self._event_bus.publish(Notification(
                    event=LibraryEvent.FINE_ADDED,
                    member=member,
                    message=f"Fine of ${fine_cents / 100:.2f} for returning "
                            f"'{item.book.title}' {days_overdue} days late.",
                ))

            # Check reservation queue
            next_member = self._reservations.next_in_line(item.book.isbn)
            if next_member is not None:
                item.mark_reserved()
                self._event_bus.publish(Notification(
                    event=LibraryEvent.RESERVATION_AVAILABLE,
                    member=next_member,
                    message=f"'{item.book.title}' is now available for pickup.",
                ))

            # Update borrow record
            record = self._find_active_record(barcode)
            if record is not None:
                record.return_date = date.today()
                record.fine_cents = fine_cents

            return record

    # --- Reservations ---

    def place_hold(self, member_id: str, isbn: str) -> str:
        member = self._members.get(member_id)
        if member is None:
            raise ValueError(f"Member {member_id} not found")

        available = self.get_available_copies(isbn)
        if available:
            raise ValueError(
                f"'{self._catalog[isbn].title}' has available copies. "
                f"No need to place a hold -- borrow directly.")

        position = self._reservations.place_hold(isbn, member)
        return (f"Hold placed for '{self._catalog[isbn].title}'. "
                f"Queue position: {position}")

    def cancel_hold(self, member_id: str, isbn: str) -> str:
        member = self._members.get(member_id)
        if member is None:
            raise ValueError(f"Member {member_id} not found")
        self._reservations.cancel_hold(isbn, member)
        return f"Hold cancelled for ISBN {isbn}."

    # --- Overdue Check ---

    def check_overdue_items(self) -> list[Notification]:
        notifications = []
        for item in self._items.values():
            if item.is_overdue() and item.borrowed_by is not None:
                notification = Notification(
                    event=LibraryEvent.BOOK_OVERDUE,
                    member=item.borrowed_by,
                    message=(f"'{item.book.title}' was due on {item.due_date}. "
                             f"Please return it to avoid additional fines."),
                )
                self._event_bus.publish(notification)
                notifications.append(notification)
        return notifications

    # --- Helpers ---

    def _find_active_record(self, barcode: str) -> BorrowRecord | None:
        for record in reversed(self._borrow_records):
            if record.book_item.barcode == barcode and record.return_date is None:
                return record
        return None
```

---

## 9. Interview Walkthrough

### Step 1: Build the Library

```python
def create_sample_library() -> Library:
    library = Library("City Public Library", fine_strategy=ProgressiveFineStrategy())

    # Add books
    author_orwell = Author("George Orwell")
    author_tolkien = Author("J.R.R. Tolkien")

    book_1984 = Book("978-0451524935", "1984", (author_orwell,), Subject.FICTION, 1949)
    book_lotr = Book("978-0618640157", "The Lord of the Rings",
                     (author_tolkien,), Subject.FICTION, 1954)

    library.add_book(book_1984)
    library.add_book(book_lotr)

    # Add physical copies
    for i in range(3):
        library.add_book_item(BookItem(
            book_1984, f"1984-{i:03d}",
            RackLocation("A", shelf=1, position=i),
        ))
    for i in range(2):
        library.add_book_item(BookItem(
            book_lotr, f"LOTR-{i:03d}",
            RackLocation("A", shelf=2, position=i),
        ))

    return library
```

### Step 2: Usage Demo

```python
library = create_sample_library()

# Register members
student = library.register_member("Alice", "alice@school.edu", MemberType.STUDENT)
professor = library.register_member("Dr. Brown", "brown@uni.edu", MemberType.FACULTY)

# Search
results = library.search(AuthorSearch("Orwell"))
print(f"Found: {[str(b) for b in results]}")

# Composable search
criteria = AndSearch([TitleSearch("lord"), SubjectSearch(Subject.FICTION)])
results = library.search(criteria)
print(f"Found: {[str(b) for b in results]}")

# Borrow
record = library.borrow_book(student.member_id, "1984-000")
print(f"Borrowed: {record.book_item.book.title}, Due: {record.due_date}")

# Return (assume on time)
returned = library.return_book("1984-000")
print(f"Returned: {returned.book_item.book.title}, Fine: ${returned.fine_cents / 100:.2f}")

# Place a hold (borrow all copies first)
library.borrow_book(professor.member_id, "LOTR-000")
library.borrow_book(professor.member_id, "LOTR-001")
print(library.place_hold(student.member_id, "978-0618640157"))

# Subscribe to events
library.event_bus.subscribe(
    LibraryEvent.RESERVATION_AVAILABLE,
    lambda n: print(f"NOTIFY {n.member.name}: {n.message}"),
)

# Return triggers notification
library.return_book("LOTR-000")
```

---

## 10. Common Follow-Up Questions

### "How would you handle renewals?"

Add a `renew(barcode, member_id)` method to `Library`. Check that no one has a hold on the
book, then extend the `due_date` by the member's loan period. Limit renewals (e.g., max 2).

### "How would you implement a recommendation system?"

Track borrow history per member and per book. Use collaborative filtering: "Members who
borrowed X also borrowed Y." This is a separate `RecommendationService` that queries
`BorrowRecord` data.

### "How would you handle lost books?"

Mark the `BookItem` as `LOST`. Charge the member a replacement fee. If found later, mark it
`AVAILABLE` again and credit the member.

### "How would you support multiple branches?"

Each `Library` instance represents a branch. A `LibraryNetwork` aggregator searches across
branches and supports inter-branch holds (transfer a book from one branch to another).

### "How would you add e-books?"

Create an `EBookItem` subclass with no physical location. Override `checkout` to grant a
digital license instead of marking the physical copy. Implement a concurrent access limit
(e.g., 3 simultaneous digital borrows per e-book).

---

## 11. Gotchas

- **Book vs BookItem.** The `Book` is metadata (title, author, ISBN). The `BookItem` is a
  physical copy with its own barcode and location. Conflating these is the most common design
  mistake. One `Book` has many `BookItem` copies.

- **Fine blocks borrowing.** A member with unpaid fines should not be allowed to borrow more
  books. The `can_borrow()` check enforces this. Forgetting it leads to abuse.

- **Reservation on available book.** If a copy is available, the member should borrow directly
  instead of placing a hold. The `place_hold` method enforces this to prevent unnecessary
  queue buildup.

- **Thread safety on borrow.** Without the lock, two members could borrow the same copy
  simultaneously. The `threading.Lock` in `borrow_book` and `return_book` prevents this.

- **Return triggers reservation.** When a book is returned, the system must check the
  reservation queue and notify the next member. If this step is skipped, holds never resolve.

- **Overdue check is not automatic.** The `check_overdue_items` method must be called
  periodically (e.g., by a daily cron job). It does not run automatically. Mention this
  to the interviewer.

---

## 12. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Book (frozen)              | Immutable metadata: title, author, ISBN|
| BookItem                   | Physical copy: barcode, status, due    |
| Author (frozen)            | Author identity                        |
| Member                     | Borrower: limits, fines, borrowed list |
| BorrowRecord               | Transaction log: dates, fines          |
| FineStrategy (ABC)         | Calculate fine (flat, progressive, cap)|
| SearchCriteria (ABC)       | Composable search (title, author, etc.)|
| ReservationQueue           | Per-book FIFO hold queue               |
| EventBus                   | Observer for notifications             |
| Library                    | Orchestrator: borrow, return, search   |
+----------------------------+----------------------------------------+

Member Limits:
+-----------+----------------+------------------+
| Type      | Borrow Limit   | Loan Period      |
+-----------+----------------+------------------+
| Student   | 5 books        | 14 days          |
| Faculty   | 10 books       | 30 days          |
+-----------+----------------+------------------+

Patterns used:
- Strategy       -> FineStrategy (swappable fine policies)
- Composite      -> AndSearch, OrSearch (composable criteria)
- Observer       -> EventBus publishes library events
- Composition    -> Book has BookItems, Library has Members
- Immutability   -> Book, Author, RackLocation are frozen
- Thread safety  -> Lock in Library for borrow/return
- Queue          -> ReservationQueue (FIFO per book)
```
