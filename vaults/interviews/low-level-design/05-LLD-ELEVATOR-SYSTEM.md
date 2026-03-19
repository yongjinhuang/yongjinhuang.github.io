# Design an Elevator System

The elevator system is a challenging LLD problem that tests your ability to model state machines,
implement scheduling algorithms, and manage concurrent requests. It is frequently asked at senior
levels because it has real complexity in coordinating multiple elevators efficiently.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [State Machine](#3-state-machine)
4. [Scheduling Algorithms](#4-scheduling-algorithms)
5. [Core Implementation](#5-core-implementation)
6. [Request Queue and Dispatcher](#6-request-queue-and-dispatcher)
7. [Interview Walkthrough](#7-interview-walkthrough)
8. [Common Follow-Up Questions](#8-common-follow-up-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement        | Details                                                         |
| --- | ------------------ | --------------------------------------------------------------- |
| F1  | Multiple elevators | N elevators serving M floors                                    |
| F2  | Request types      | External (hall button up/down), Internal (floor button in car)  |
| F3  | Scheduling         | Efficiently assign requests to elevators                        |
| F4  | Direction handling | Elevator continues in one direction, picks up en-route requests |
| F5  | Door control       | Open/close doors, handle door obstruction                       |
| F6  | Priority requests  | Emergency, VIP, maintenance override                            |
| F7  | Display            | Show current floor and direction on each elevator               |

### Non-Functional Requirements

| #   | Requirement                       |
| --- | --------------------------------- |
| NF1 | Minimize average wait time        |
| NF2 | Minimize average travel time      |
| NF3 | Handle concurrent requests safely |
| NF4 | Extensible scheduling algorithm   |

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   Direction       |       |   ElevatorState     |
|   (Enum)          |       |   (Enum)            |
|-------------------|       |---------------------|
| UP                |       | IDLE                |
| DOWN              |       | MOVING_UP           |
| IDLE              |       | MOVING_DOWN         |
+-------------------+       | DOOR_OPEN           |
                            | MAINTENANCE         |
+-------------------+       +---------------------+
|   RequestType     |
|   (Enum)          |       +---------------------+
|-------------------|       |   Request           |
| EXTERNAL          |       |---------------------|
| INTERNAL          |       | floor               |
| EMERGENCY         |       | direction           |
+-------------------+       | request_type        |
                            | timestamp           |
                            | priority            |
+-------------------+       +---------------------+
| ScheduleStrategy  |
|   (ABC)           |       +---------------------+
|-------------------|       |   Elevator          |
| assign(request,   |       |---------------------|
|   elevators)      |       | id                  |
+-------------------+       | current_floor       |
   ^       ^       ^        | state               |
   |       |       |        | direction           |
  SCAN   LOOK   SSF        | request_queue       |
                            |---------------------|
+-------------------+       | move()              |
| ElevatorController|       | add_request(floor)  |
|-------------------|       | open_door()         |
| elevators         |       | close_door()        |
| strategy          |       +---------------------+
|-------------------|
| request(floor,dir)|
| step()            |
+-------------------+
```

---

## 3. State Machine

Each elevator operates as a finite state machine:

```
                    +------------------+
         +-------->|      IDLE        |<--------+
         |         +------------------+         |
         |           |              |           |
         |     request UP     request DOWN      |
         |           |              |           |
         |           v              v           |
         |   +-------------+  +-------------+  |
         |   | MOVING_UP   |  | MOVING_DOWN |  |
         |   +-------------+  +-------------+  |
         |     |       |        |       |       |
         |  arrived  continue arrived continue  |
         |     |       |        |       |       |
         |     v       +--------+       v       |
         |   +------------------+               |
         +---| DOOR_OPEN        |---------------+
             +------------------+
                  |
              emergency
                  |
                  v
             +------------------+
             | MAINTENANCE      |
             +------------------+
```

**Transitions:**

| From        | Event                      | To                  | Action                 |
| ----------- | -------------------------- | ------------------- | ---------------------- |
| IDLE        | Request UP                 | MOVING_UP           | Start moving up        |
| IDLE        | Request DOWN               | MOVING_DOWN         | Start moving down      |
| IDLE        | Request same floor         | DOOR_OPEN           | Open doors immediately |
| MOVING_UP   | Arrived at requested floor | DOOR_OPEN           | Stop, open doors       |
| MOVING_UP   | More requests above        | MOVING_UP           | Continue up            |
| MOVING_UP   | No more requests above     | IDLE or MOVING_DOWN | Reverse or idle        |
| MOVING_DOWN | Arrived at requested floor | DOOR_OPEN           | Stop, open doors       |
| DOOR_OPEN   | Timer expired              | IDLE / MOVING\_\*   | Close doors, continue  |
| Any         | Emergency                  | MAINTENANCE         | Stop immediately       |

---

## 4. Scheduling Algorithms

### SCAN (Elevator Algorithm)

The elevator moves in one direction, serving all requests, then reverses. Like a disk head.

```
Floor 10: ....
Floor  9: ....
Floor  8: [REQ] ................. <-- served on way up
Floor  7: ....
Floor  6: ....       ELEVATOR ---> moving UP
Floor  5: [REQ] ................. <-- served on way up
Floor  4: ....
Floor  3: [REQ] ................. <-- served on way DOWN (after reversal)
Floor  2: ....
Floor  1: [REQ] ................. <-- served on way DOWN
```

### LOOK

Like SCAN, but the elevator only goes as far as the farthest request in the current direction
(does not travel to the end of the shaft unnecessarily).

### Shortest Seek First (SSF)

Always go to the nearest requested floor. Simple but can cause starvation for distant floors.

---

## 5. Core Implementation

### Enums and Data Classes

```python
from enum import Enum
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import time
import heapq
import threading


class Direction(Enum):
    UP = 1
    DOWN = -1
    IDLE = 0


class ElevatorState(Enum):
    IDLE = "idle"
    MOVING_UP = "moving_up"
    MOVING_DOWN = "moving_down"
    DOOR_OPEN = "door_open"
    MAINTENANCE = "maintenance"


class RequestType(Enum):
    EXTERNAL = "external"   # Hall button
    INTERNAL = "internal"   # Inside elevator
    EMERGENCY = "emergency"


class Priority(Enum):
    NORMAL = 0
    VIP = 1
    EMERGENCY = 2


@dataclass(frozen=True)
class Request:
    floor: int
    direction: Direction
    request_type: RequestType
    priority: Priority = Priority.NORMAL
    timestamp: float = field(default_factory=time.time)

    def __lt__(self, other: "Request") -> bool:
        """Higher priority first, then earlier timestamp."""
        if self.priority != other.priority:
            return self.priority.value > other.priority.value
        return self.timestamp < other.timestamp
```

### Elevator Class

```python
class Elevator:
    def __init__(self, elevator_id: int, min_floor: int = 1, max_floor: int = 10):
        self._id = elevator_id
        self._min_floor = min_floor
        self._max_floor = max_floor
        self._current_floor = 1
        self._state = ElevatorState.IDLE
        self._direction = Direction.IDLE
        self._destinations: set[int] = set()
        self._lock = threading.Lock()

    @property
    def id(self) -> int:
        return self._id

    @property
    def current_floor(self) -> int:
        return self._current_floor

    @property
    def state(self) -> ElevatorState:
        return self._state

    @property
    def direction(self) -> Direction:
        return self._direction

    @property
    def destination_count(self) -> int:
        return len(self._destinations)

    def is_idle(self) -> bool:
        return self._state == ElevatorState.IDLE

    def is_moving_towards(self, floor: int) -> bool:
        """Check if elevator is moving towards the given floor."""
        if self._direction == Direction.UP:
            return floor >= self._current_floor
        if self._direction == Direction.DOWN:
            return floor <= self._current_floor
        return True  # IDLE can go either way

    def add_destination(self, floor: int) -> None:
        with self._lock:
            if floor < self._min_floor or floor > self._max_floor:
                raise ValueError(f"Floor {floor} out of range")
            self._destinations.add(floor)
            if self._state == ElevatorState.IDLE:
                self._update_direction()

    def step(self) -> str:
        """Advance the elevator by one step. Returns a status message."""
        with self._lock:
            if self._state == ElevatorState.MAINTENANCE:
                return f"Elevator {self._id}: MAINTENANCE mode"

            if self._state == ElevatorState.DOOR_OPEN:
                self._state = ElevatorState.IDLE
                self._update_direction()
                return f"Elevator {self._id}: Doors closed at floor {self._current_floor}"

            if not self._destinations:
                self._state = ElevatorState.IDLE
                self._direction = Direction.IDLE
                return f"Elevator {self._id}: Idle at floor {self._current_floor}"

            # Move one floor in current direction
            self._current_floor += self._direction.value

            if self._current_floor in self._destinations:
                self._destinations.discard(self._current_floor)
                self._state = ElevatorState.DOOR_OPEN
                return f"Elevator {self._id}: Arrived at floor {self._current_floor}, doors open"

            self._state = (
                ElevatorState.MOVING_UP if self._direction == Direction.UP
                else ElevatorState.MOVING_DOWN
            )
            return f"Elevator {self._id}: Moving to floor {self._current_floor}"

    def _update_direction(self) -> None:
        """Determine direction based on remaining destinations."""
        if not self._destinations:
            self._direction = Direction.IDLE
            return

        above = [f for f in self._destinations if f > self._current_floor]
        below = [f for f in self._destinations if f < self._current_floor]

        if self._current_floor in self._destinations:
            self._state = ElevatorState.DOOR_OPEN
            self._destinations.discard(self._current_floor)
            return

        if self._direction == Direction.UP and above:
            return  # Keep going up
        if self._direction == Direction.DOWN and below:
            return  # Keep going down

        # Reverse or pick direction
        if above:
            self._direction = Direction.UP
            self._state = ElevatorState.MOVING_UP
        elif below:
            self._direction = Direction.DOWN
            self._state = ElevatorState.MOVING_DOWN

    def distance_to(self, floor: int) -> int:
        """Calculate effective distance considering current direction."""
        if self.is_idle():
            return abs(self._current_floor - floor)

        if self.is_moving_towards(floor):
            return abs(self._current_floor - floor)

        # Must finish current direction first, then come back
        if self._direction == Direction.UP:
            max_dest = max(self._destinations) if self._destinations else self._current_floor
            return (max_dest - self._current_floor) + (max_dest - floor)
        else:
            min_dest = min(self._destinations) if self._destinations else self._current_floor
            return (self._current_floor - min_dest) + (floor - min_dest)

    def __repr__(self) -> str:
        return (f"Elevator({self._id}, floor={self._current_floor}, "
                f"state={self._state.value}, dest={sorted(self._destinations)})")
```

---

## 6. Request Queue and Dispatcher

### Scheduling Strategies

```python
class SchedulingStrategy(ABC):
    @abstractmethod
    def select_elevator(self, request: Request,
                        elevators: list[Elevator]) -> Elevator | None:
        pass


class LOOKStrategy(SchedulingStrategy):
    """
    Prefer an elevator that is:
    1. Moving towards the requested floor in the right direction
    2. Closest to the requested floor
    3. Idle (as fallback)
    """

    def select_elevator(self, request: Request,
                        elevators: list[Elevator]) -> Elevator | None:
        available = [e for e in elevators if e.state != ElevatorState.MAINTENANCE]
        if not available:
            return None

        best = None
        best_score = float("inf")

        for elevator in available:
            score = self._calculate_score(elevator, request)
            if score < best_score:
                best_score = score
                best = elevator

        return best

    def _calculate_score(self, elevator: Elevator, request: Request) -> float:
        distance = elevator.distance_to(request.floor)

        # Bonus for idle elevators (small penalty to break ties)
        if elevator.is_idle():
            return distance + 0.5

        # Bonus for elevators moving towards the request
        if elevator.is_moving_towards(request.floor):
            # Check direction match for external requests
            if request.request_type == RequestType.EXTERNAL:
                if elevator.direction == request.direction:
                    return distance  # Best case: same direction
            return distance + 1  # Moving towards but maybe wrong direction

        # Penalty for elevators moving away
        return distance + 100


class ShortestSeekFirstStrategy(SchedulingStrategy):
    """Always assign to the nearest idle or closest elevator."""

    def select_elevator(self, request: Request,
                        elevators: list[Elevator]) -> Elevator | None:
        available = [e for e in elevators if e.state != ElevatorState.MAINTENANCE]
        if not available:
            return None

        return min(available, key=lambda e: e.distance_to(request.floor))
```

### Elevator Controller

```python
class ElevatorController:
    def __init__(self, num_elevators: int, num_floors: int,
                 strategy: SchedulingStrategy | None = None):
        self._elevators = [
            Elevator(i, min_floor=1, max_floor=num_floors)
            for i in range(num_elevators)
        ]
        self._strategy = strategy or LOOKStrategy()
        self._pending_requests: list[Request] = []
        self._lock = threading.Lock()

    @property
    def elevators(self) -> list[Elevator]:
        return list(self._elevators)

    def request(self, floor: int, direction: Direction,
                request_type: RequestType = RequestType.EXTERNAL,
                priority: Priority = Priority.NORMAL) -> str:
        """Handle a new elevator request."""
        req = Request(
            floor=floor,
            direction=direction,
            request_type=request_type,
            priority=priority,
        )

        with self._lock:
            if priority == Priority.EMERGENCY:
                return self._handle_emergency(req)

            elevator = self._strategy.select_elevator(req, self._elevators)
            if elevator is None:
                self._pending_requests.append(req)
                return "All elevators unavailable. Request queued."

            elevator.add_destination(floor)
            return f"Request assigned to Elevator {elevator.id}"

    def step(self) -> list[str]:
        """Advance all elevators by one step."""
        messages = []
        for elevator in self._elevators:
            msg = elevator.step()
            messages.append(msg)

        # Try to assign pending requests
        with self._lock:
            remaining = []
            for req in self._pending_requests:
                elevator = self._strategy.select_elevator(req, self._elevators)
                if elevator is not None:
                    elevator.add_destination(req.floor)
                else:
                    remaining.append(req)
            self._pending_requests = remaining

        return messages

    def _handle_emergency(self, request: Request) -> str:
        """Send nearest elevator to emergency floor, override normal operation."""
        available = [
            e for e in self._elevators
            if e.state != ElevatorState.MAINTENANCE
        ]
        if not available:
            return "EMERGENCY: No elevators available!"

        nearest = min(available, key=lambda e: abs(e.current_floor - request.floor))
        nearest.add_destination(request.floor)
        return f"EMERGENCY: Elevator {nearest.id} dispatched to floor {request.floor}"

    def get_status(self) -> list[str]:
        return [repr(e) for e in self._elevators]
```

### Usage Demo

```python
controller = ElevatorController(num_elevators=3, num_floors=10)

# Requests come in
controller.request(5, Direction.UP)
controller.request(3, Direction.DOWN)
controller.request(8, Direction.UP)

# Simulate time steps
for _ in range(15):
    messages = controller.step()
    for msg in messages:
        print(msg)
    print("---")
```

---

## 7. Interview Walkthrough

### Step 1: Clarify Requirements (3 min)

- "How many elevators and floors?" (Variable -- design for N elevators, M floors)
- "What scheduling algorithm?" (Start with LOOK, mention SCAN and SSF as alternatives)
- "Do we need to handle emergency stops?" (Yes, priority system)
- "Real-time simulation or just the data model?" (Data model with step-based simulation)

### Step 2: Identify Entities (5 min)

Draw the class diagram. Key insight: separate the Elevator (physical thing) from the
ElevatorController (brain that dispatches). Use Strategy pattern for scheduling.

### Step 3: Model the State Machine (5 min)

Draw the state transitions. This shows the interviewer you think about edge cases.

### Step 4: Implement Core Classes (20 min)

Elevator, Request, ElevatorController. Keep the scheduling strategy simple initially.

### Step 5: Discuss Extensions (5 min)

Emergency handling, VIP floors, weight limits, energy efficiency.

---

## 8. Common Follow-Up Questions

### "How would you handle a fire alarm?"

All elevators go to ground floor, doors open, and enter MAINTENANCE state.
Override all existing requests. This is the EMERGENCY priority path.

### "How would you optimize for energy efficiency?"

Batch requests in the same direction. Prefer elevators already in motion
(momentum) over idle ones. Park idle elevators at floors with highest
historical demand.

### "What if an elevator breaks down mid-journey?"

Transition to MAINTENANCE state. Redistribute all its pending destinations
to other elevators. Notify the controller to avoid assigning new requests.

### "How would you handle peak hours (morning rush)?"

Pre-position elevators at lobby during morning rush. Use demand prediction
based on historical data. Dedicate some elevators to express (only certain floors).

---

## 9. Gotchas

- **Direction matters for external requests.** If someone on floor 5 presses "DOWN", do not
  send an elevator that is passing floor 5 on its way UP. It would stop, open doors, and
  the passenger would get confused.

- **Starvation with SSF.** If floor 1 gets constant requests and someone is waiting at floor 10,
  they could wait forever. LOOK/SCAN algorithms prevent this.

- **Door timing.** In real systems, doors stay open for ~3 seconds. Model this as a DOOR_OPEN
  state that transitions automatically after a delay.

- **Concurrent access.** Multiple people press buttons simultaneously. The controller must
  be thread-safe. Use locks on the request queue and elevator state.

- **Same-floor request.** If someone on floor 3 requests floor 3, immediately open the doors
  instead of moving.

---

## 10. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Key Responsibility                     |
+----------------------------+----------------------------------------+
| Elevator                   | Physical state: floor, direction, door |
| ElevatorController         | Dispatch: assign requests to elevators |
| SchedulingStrategy (ABC)   | Algorithm: LOOK, SCAN, SSF             |
| Request                    | Data: floor, direction, priority       |
+----------------------------+----------------------------------------+

Scheduling Algorithms:
+----------+---------------------------+----------------------------+
| Algorithm| How It Works              | Trade-off                  |
+----------+---------------------------+----------------------------+
| SCAN     | Go end-to-end, reverse    | Fair but wasteful travel   |
| LOOK     | Go to farthest request    | Efficient, fair            |
| SSF      | Always nearest floor      | Fast avg, starvation risk  |
+----------+---------------------------+----------------------------+

Patterns used:
- State Machine  -> Elevator states and transitions
- Strategy       -> SchedulingStrategy (swappable algorithm)
- Observer       -> Controller monitors elevator states (extendable)
- Command        -> Request objects encapsulate user intent
```
