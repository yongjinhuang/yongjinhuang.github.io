# Design a Parking Lot System

The parking lot is the most frequently asked LLD interview question. It tests your ability to
identify entities, define relationships, apply inheritance and strategy patterns, and handle
real-world edge cases like payment calculation and capacity tracking.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Payment System](#4-payment-system)
5. [Full Interview Walkthrough](#5-full-interview-walkthrough)
6. [Common Follow-Up Questions](#6-common-follow-up-questions)
7. [Gotchas](#7-gotchas)
8. [Quick Reference](#8-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement            | Details                                              |
| --- | ---------------------- | ---------------------------------------------------- |
| F1  | Multiple vehicle types | Motorcycle, Car, Bus/Truck                           |
| F2  | Multiple floors        | Each floor has spots of different sizes              |
| F3  | Entry/exit points      | Multiple entrances, track which gate was used        |
| F4  | Spot assignment        | Assign nearest available spot matching vehicle size  |
| F5  | Payment                | Calculate fee based on duration and vehicle type     |
| F6  | Capacity tracking      | Know available spots per floor per type in real-time |
| F7  | Ticket system          | Issue ticket on entry, collect on exit               |

### Non-Functional Requirements

| #   | Requirement                                           |
| --- | ----------------------------------------------------- |
| NF1 | Thread-safe (concurrent entry/exit)                   |
| NF2 | O(1) spot lookup for availability check               |
| NF3 | Extensible for new vehicle types without code changes |

### Clarifying Questions to Ask

- "Is the parking lot single or multi-floor?" (Multi-floor)
- "Can a motorcycle park in a car spot?" (Yes, smaller vehicles can use larger spots)
- "Is there a different rate per vehicle type?" (Yes)
- "Do we need a display board showing availability?" (Yes)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   VehicleType     |       |    SpotSize         |
|   (Enum)          |       |    (Enum)           |
|-------------------|       |---------------------|
| MOTORCYCLE        |       | SMALL               |
| CAR               |       | MEDIUM              |
| BUS               |       | LARGE               |
+-------------------+       +---------------------+

+-------------------+       +---------------------+
|   Vehicle         |       |   ParkingSpot       |
|-------------------|       |---------------------|
| license_plate     |       | spot_id             |
| vehicle_type      |       | floor               |
|                   |       | size                |
+-------------------+       | is_available        |
        ^                   | vehicle             |
        |                   |---------------------|
   +---------+-----+        | park(vehicle)       |
   |         |     |        | remove_vehicle()    |
   Motor   Car   Bus        +---------------------+
                                     |
+-------------------+                |
|   ParkingTicket   |       +---------------------+
|-------------------|       |   ParkingFloor      |
| ticket_id         |       |---------------------|
| vehicle           |       | floor_number        |
| spot              |       | spots               |
| entry_time        |       |---------------------|
| exit_time         |       | get_available_spots()|
| amount_paid       |       | park_vehicle()      |
+-------------------+       +---------------------+
                                     |
+-------------------+       +---------------------+
| PaymentStrategy   |       |   ParkingLot        |
|   (ABC)           |       |---------------------|
|-------------------|       | floors              |
| calculate(ticket) |       | entry_gates         |
+-------------------+       | exit_gates          |
   ^         ^              |---------------------|
   |         |              | enter(vehicle)      |
  Hourly   FlatRate         | exit(ticket_id)     |
                            | get_availability()  |
                            +---------------------+
```

---

## 3. Core Implementation

### Enums and Base Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
import uuid
import threading


class VehicleType(Enum):
    MOTORCYCLE = "motorcycle"
    CAR = "car"
    BUS = "bus"


class SpotSize(Enum):
    SMALL = 1     # Fits motorcycle
    MEDIUM = 2    # Fits car
    LARGE = 3     # Fits bus


# Map vehicle types to the minimum spot size they need
VEHICLE_TO_MIN_SPOT: dict[VehicleType, SpotSize] = {
    VehicleType.MOTORCYCLE: SpotSize.SMALL,
    VehicleType.CAR: SpotSize.MEDIUM,
    VehicleType.BUS: SpotSize.LARGE,
}
```

### Vehicle

```python
@dataclass(frozen=True)
class Vehicle:
    license_plate: str
    vehicle_type: VehicleType

    def required_spot_size(self) -> SpotSize:
        return VEHICLE_TO_MIN_SPOT[self.vehicle_type]
```

### Parking Spot

```python
class ParkingSpot:
    def __init__(self, spot_id: str, floor: int, size: SpotSize):
        self._spot_id = spot_id
        self._floor = floor
        self._size = size
        self._vehicle: Vehicle | None = None

    @property
    def spot_id(self) -> str:
        return self._spot_id

    @property
    def floor(self) -> int:
        return self._floor

    @property
    def size(self) -> SpotSize:
        return self._size

    @property
    def is_available(self) -> bool:
        return self._vehicle is None

    @property
    def vehicle(self) -> Vehicle | None:
        return self._vehicle

    def can_fit(self, vehicle: Vehicle) -> bool:
        return self.is_available and self._size.value >= vehicle.required_spot_size().value

    def park(self, vehicle: Vehicle) -> None:
        if not self.can_fit(vehicle):
            raise ValueError(f"Spot {self._spot_id} cannot fit {vehicle.vehicle_type.value}")
        self._vehicle = vehicle

    def remove_vehicle(self) -> Vehicle:
        if self._vehicle is None:
            raise ValueError(f"Spot {self._spot_id} is already empty")
        vehicle = self._vehicle
        self._vehicle = None
        return vehicle

    def __repr__(self) -> str:
        status = "OPEN" if self.is_available else f"OCCUPIED({self._vehicle.license_plate})"
        return f"Spot({self._spot_id}, {self._size.name}, {status})"
```

### Parking Ticket

```python
@dataclass
class ParkingTicket:
    ticket_id: str
    vehicle: Vehicle
    spot: ParkingSpot
    entry_time: datetime
    exit_time: datetime | None = None
    amount_paid: float = 0.0

    @staticmethod
    def create(vehicle: Vehicle, spot: ParkingSpot) -> "ParkingTicket":
        return ParkingTicket(
            ticket_id=str(uuid.uuid4())[:8],
            vehicle=vehicle,
            spot=spot,
            entry_time=datetime.now(),
        )
```

### Parking Floor

```python
class ParkingFloor:
    def __init__(self, floor_number: int, spots: list[ParkingSpot]):
        self._floor_number = floor_number
        self._spots = spots

    @property
    def floor_number(self) -> int:
        return self._floor_number

    def get_available_spots(self, vehicle_type: VehicleType | None = None) -> list[ParkingSpot]:
        if vehicle_type is None:
            return [s for s in self._spots if s.is_available]

        min_size = VEHICLE_TO_MIN_SPOT[vehicle_type]
        return [
            s for s in self._spots
            if s.is_available and s.size.value >= min_size.value
        ]

    def availability_summary(self) -> dict[SpotSize, dict[str, int]]:
        summary = {}
        for size in SpotSize:
            spots_of_size = [s for s in self._spots if s.size == size]
            summary[size] = {
                "total": len(spots_of_size),
                "available": len([s for s in spots_of_size if s.is_available]),
            }
        return summary

    def find_spot_for_vehicle(self, vehicle: Vehicle) -> ParkingSpot | None:
        """Find the best available spot (exact size match first, then larger)."""
        available = self.get_available_spots(vehicle.vehicle_type)
        if not available:
            return None
        # Prefer exact size match, then smallest available
        return min(available, key=lambda s: s.size.value)
```

### Parking Lot (Main Orchestrator)

```python
class ParkingLot:
    def __init__(self, name: str, floors: list[ParkingFloor]):
        self._name = name
        self._floors = floors
        self._active_tickets: dict[str, ParkingTicket] = {}
        self._vehicle_to_ticket: dict[str, str] = {}  # license_plate -> ticket_id
        self._lock = threading.Lock()

    def enter(self, vehicle: Vehicle) -> ParkingTicket:
        with self._lock:
            if vehicle.license_plate in self._vehicle_to_ticket:
                raise ValueError(f"Vehicle {vehicle.license_plate} is already parked")

            spot = self._find_spot(vehicle)
            if spot is None:
                raise ValueError(f"No available spot for {vehicle.vehicle_type.value}")

            spot.park(vehicle)
            ticket = ParkingTicket.create(vehicle, spot)
            self._active_tickets[ticket.ticket_id] = ticket
            self._vehicle_to_ticket[vehicle.license_plate] = ticket.ticket_id
            return ticket

    def exit(self, ticket_id: str, payment_strategy: "PaymentStrategy") -> ParkingTicket:
        with self._lock:
            if ticket_id not in self._active_tickets:
                raise ValueError(f"Ticket {ticket_id} not found")

            ticket = self._active_tickets[ticket_id]
            ticket.exit_time = datetime.now()
            ticket.amount_paid = payment_strategy.calculate(ticket)

            ticket.spot.remove_vehicle()
            del self._active_tickets[ticket_id]
            del self._vehicle_to_ticket[ticket.vehicle.license_plate]
            return ticket

    def get_availability(self) -> dict[int, dict[SpotSize, dict[str, int]]]:
        result = {}
        for floor in self._floors:
            result[floor.floor_number] = floor.availability_summary()
        return result

    def _find_spot(self, vehicle: Vehicle) -> ParkingSpot | None:
        for floor in self._floors:
            spot = floor.find_spot_for_vehicle(vehicle)
            if spot is not None:
                return spot
        return None
```

---

## 4. Payment System

Using the Strategy pattern so we can swap pricing algorithms without modifying the ParkingLot.

```python
from abc import ABC, abstractmethod
import math


class PaymentStrategy(ABC):
    @abstractmethod
    def calculate(self, ticket: ParkingTicket) -> float:
        pass


class HourlyRateStrategy(PaymentStrategy):
    """Different hourly rates per vehicle type."""

    RATES: dict[VehicleType, float] = {
        VehicleType.MOTORCYCLE: 1.0,
        VehicleType.CAR: 2.0,
        VehicleType.BUS: 5.0,
    }

    def calculate(self, ticket: ParkingTicket) -> float:
        if ticket.exit_time is None:
            raise ValueError("Exit time not set")

        duration = ticket.exit_time - ticket.entry_time
        hours = math.ceil(duration.total_seconds() / 3600)
        hours = max(hours, 1)  # Minimum 1 hour
        rate = self.RATES[ticket.vehicle.vehicle_type]
        return hours * rate


class FlatRateStrategy(PaymentStrategy):
    """Flat daily rate regardless of duration."""

    RATES: dict[VehicleType, float] = {
        VehicleType.MOTORCYCLE: 5.0,
        VehicleType.CAR: 10.0,
        VehicleType.BUS: 20.0,
    }

    def calculate(self, ticket: ParkingTicket) -> float:
        return self.RATES[ticket.vehicle.vehicle_type]


class ProgressiveRateStrategy(PaymentStrategy):
    """First 2 hours at base rate, then 1.5x after that."""

    BASE_RATES: dict[VehicleType, float] = {
        VehicleType.MOTORCYCLE: 1.0,
        VehicleType.CAR: 2.0,
        VehicleType.BUS: 5.0,
    }

    def calculate(self, ticket: ParkingTicket) -> float:
        if ticket.exit_time is None:
            raise ValueError("Exit time not set")

        duration = ticket.exit_time - ticket.entry_time
        hours = math.ceil(duration.total_seconds() / 3600)
        hours = max(hours, 1)
        rate = self.BASE_RATES[ticket.vehicle.vehicle_type]

        if hours <= 2:
            return hours * rate
        return (2 * rate) + ((hours - 2) * rate * 1.5)
```

---

## 5. Full Interview Walkthrough

### Step 1: Build the Lot

```python
def create_sample_parking_lot() -> ParkingLot:
    """Build a 3-floor parking lot for demonstration."""
    floors = []
    for floor_num in range(1, 4):
        spots = []
        # 10 small spots, 20 medium spots, 5 large spots per floor
        for i in range(10):
            spots.append(ParkingSpot(f"F{floor_num}-S{i}", floor_num, SpotSize.SMALL))
        for i in range(20):
            spots.append(ParkingSpot(f"F{floor_num}-M{i}", floor_num, SpotSize.MEDIUM))
        for i in range(5):
            spots.append(ParkingSpot(f"F{floor_num}-L{i}", floor_num, SpotSize.LARGE))
        floors.append(ParkingFloor(floor_num, spots))

    return ParkingLot("Downtown Garage", floors)
```

### Step 2: Usage Demo

```python
lot = create_sample_parking_lot()

# Vehicles arrive
car = Vehicle("ABC-123", VehicleType.CAR)
motorcycle = Vehicle("MOTO-1", VehicleType.MOTORCYCLE)
bus = Vehicle("BUS-99", VehicleType.BUS)

ticket_car = lot.enter(car)
ticket_moto = lot.enter(motorcycle)
ticket_bus = lot.enter(bus)

# Check availability
availability = lot.get_availability()
for floor_num, sizes in availability.items():
    for size, counts in sizes.items():
        print(f"Floor {floor_num} {size.name}: {counts['available']}/{counts['total']}")

# Vehicle exits
pricing = HourlyRateStrategy()
result = lot.exit(ticket_car.ticket_id, pricing)
print(f"Car paid: ${result.amount_paid:.2f}")
```

---

## 6. Common Follow-Up Questions

### "How would you add an electric vehicle charging spot?"

Add a `SpotFeature` enum (REGULAR, EV_CHARGING) to `ParkingSpot`. The `find_spot_for_vehicle`
method accepts an optional feature filter. This follows OCP -- no existing code changes.

### "How would you handle reservations?"

Add a `ReservationService` that pre-assigns spots with a time window. Mark spots as
`RESERVED` (not `AVAILABLE`, not `OCCUPIED`). Expire reservations after a grace period.

### "How would you add a display board?"

Use the Observer pattern. `ParkingLot` publishes events (VEHICLE_PARKED, VEHICLE_LEFT) and
`DisplayBoard` subscribes to update its counts.

### "What if two cars arrive at the same time?"

The `threading.Lock()` in `ParkingLot.enter()` ensures only one thread assigns a spot at a time.
For a distributed system, use a distributed lock (Redis, ZooKeeper).

### "How would you find the nearest available spot to the entrance?"

Add a `distance_from_entrance` attribute to each `ParkingSpot` (or compute it from floor number
and spot position). Sort available spots by distance before returning.

---

## 7. Gotchas

- **Motorcycle in car spot:** Smaller vehicles should be able to park in larger spots. The
  `can_fit` method handles this with `size.value >= required_size.value`.

- **Concurrent access:** Without the lock, two threads could assign the same spot to different
  vehicles. Always mention thread safety in interviews.

- **Payment before exit:** In real systems, payment happens at a kiosk before the exit gate opens.
  Model this as a separate `PaymentService` that validates payment before `ParkingLot.exit()`.

- **Bus taking multiple spots:** Some designs require a bus to occupy multiple consecutive spots.
  This adds complexity -- discuss it as a follow-up, not in your initial design.

- **Re-entry with same plate:** The `vehicle_to_ticket` map prevents duplicate entries. Without
  it, a vehicle could park twice and orphan the first spot.

---

## 8. Quick Reference

```
+----------------------------+----------------------------------------+
| Entity                     | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Vehicle                    | Immutable data: plate + type           |
| ParkingSpot                | Single spot, knows if occupied         |
| ParkingFloor               | Collection of spots, availability      |
| ParkingLot                 | Orchestrator: enter, exit, find spot   |
| ParkingTicket              | Entry/exit timestamps, payment record  |
| PaymentStrategy (ABC)      | Calculate fee (hourly, flat, etc.)     |
+----------------------------+----------------------------------------+

Patterns used:
- Strategy     -> PaymentStrategy (swappable pricing)
- Factory      -> ParkingSpot creation per floor config
- Composition  -> ParkingLot has Floors, Floor has Spots
- Immutability -> Vehicle is frozen dataclass
- Thread safety-> Lock in ParkingLot for concurrent access
```
