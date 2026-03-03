# Classic Concurrency Problems

These problems are the "fizzbuzz" of concurrency interviews. You must be able to implement
them from scratch, explain the invariants, and discuss trade-offs between different solutions.

---

## Table of Contents

1. [Dining Philosophers](#1-dining-philosophers)
2. [Sleeping Barber](#2-sleeping-barber)
3. [Cigarette Smokers](#3-cigarette-smokers)
4. [Print in Order (LeetCode 1114)](#4-print-in-order-leetcode-1114)
5. [Print FooBar Alternately (LeetCode 1115)](#5-print-foobar-alternately-leetcode-1115)
6. [Building H2O (LeetCode 1117)](#6-building-h2o-leetcode-1117)
7. [Fizz Buzz Multithreaded (LeetCode 1195)](#7-fizz-buzz-multithreaded-leetcode-1195)
8. [Common Interview Questions](#8-common-interview-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Dining Philosophers

### Problem Statement

Five philosophers sit around a circular table. Each philosopher alternates between thinking
and eating. To eat, a philosopher needs BOTH the fork on their left AND the fork on their
right. There are exactly five forks, one between each pair of adjacent philosophers.

```
        [P0]
       /    \
     F4      F0
     /        \
   [P4]      [P1]
     \        /
     F3      F1
       \    /
        [P3]--F2--[P2]
```

Design a solution where no philosopher starves and no deadlock occurs.

### Naive Solution (DEADLOCK)

```python
import threading
import time


def dining_philosophers_deadlock():
    """BUG: All philosophers pick up left fork, then wait for right fork forever."""
    forks = [threading.Lock() for _ in range(5)]

    def philosopher(pid: int) -> None:
        left = forks[pid]
        right = forks[(pid + 1) % 5]
        for _ in range(3):
            # Think
            time.sleep(0.01)
            # Pick up left fork
            left.acquire()
            # Pick up right fork -- DEADLOCK if all hold left fork!
            right.acquire()
            # Eat
            time.sleep(0.01)
            right.release()
            left.release()

    threads = [threading.Thread(target=philosopher, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()  # May hang forever!
```

### Solution 1: Resource Ordering

Break the circular wait by having one philosopher pick up forks in reverse order.

```python
import threading
import time


def dining_philosophers_ordering():
    """FIX: Philosopher 4 picks up right fork first, breaking circular wait."""
    forks = [threading.Lock() for _ in range(5)]

    def philosopher(pid: int) -> None:
        left = forks[pid]
        right = forks[(pid + 1) % 5]

        # Always acquire lower-numbered fork first
        first = min(pid, (pid + 1) % 5)
        second = max(pid, (pid + 1) % 5)
        fork_first = forks[first]
        fork_second = forks[second]

        for _ in range(3):
            time.sleep(0.01)
            with fork_first:
                with fork_second:
                    time.sleep(0.01)  # Eat

    threads = [threading.Thread(target=philosopher, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
```

### Solution 2: Arbitrator (Waiter)

A waiter (semaphore) limits how many philosophers can try to eat at once. With only 4
allowed, at least one can always get both forks.

```python
import threading
import time


def dining_philosophers_arbitrator():
    """FIX: At most 4 philosophers can attempt to eat simultaneously."""
    forks = [threading.Lock() for _ in range(5)]
    waiter = threading.Semaphore(4)  # At most 4 can try

    def philosopher(pid: int) -> None:
        left = forks[pid]
        right = forks[(pid + 1) % 5]

        for _ in range(3):
            time.sleep(0.01)
            waiter.acquire()  # Ask waiter for permission
            with left:
                with right:
                    time.sleep(0.01)  # Eat
            waiter.release()  # Tell waiter we are done

    threads = [threading.Thread(target=philosopher, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
```

### Solution 3: Chandy-Misra

Each fork starts "dirty." A philosopher must request forks from neighbors. A neighbor
gives up a dirty fork (cleaning it first) but keeps a clean fork. This ensures fairness
and prevents starvation.

```python
import threading
import time
from enum import Enum


class ForkState(Enum):
    DIRTY = "dirty"
    CLEAN = "clean"


def dining_philosophers_chandy_misra():
    """Chandy-Misra solution: forks are dirty/clean, passed between neighbors."""

    class Fork:
        def __init__(self, owner: int):
            self.owner = owner
            self.state = ForkState.DIRTY
            self.lock = threading.Lock()
            self.requested_by: int | None = None
            self.request_event = threading.Event()

    # Fork i starts with philosopher min(i, (i+1)%5)
    forks = [Fork(owner=min(i, (i + 1) % 5)) for i in range(5)]

    def philosopher(pid: int) -> None:
        left_fork_idx = pid
        right_fork_idx = (pid + 1) % 5

        for _ in range(3):
            time.sleep(0.01)  # Think

            # Request both forks
            for fork_idx in [left_fork_idx, right_fork_idx]:
                fork = forks[fork_idx]
                while True:
                    with fork.lock:
                        if fork.owner == pid:
                            break
                        fork.requested_by = pid
                        fork.request_event.set()
                    time.sleep(0.001)
                    with fork.lock:
                        if fork.owner == pid:
                            break

            # Eat
            time.sleep(0.01)

            # After eating, forks become dirty
            # Give away dirty forks if requested
            for fork_idx in [left_fork_idx, right_fork_idx]:
                fork = forks[fork_idx]
                with fork.lock:
                    fork.state = ForkState.DIRTY
                    if fork.requested_by is not None:
                        fork.state = ForkState.CLEAN
                        fork.owner = fork.requested_by
                        fork.requested_by = None

    threads = [threading.Thread(target=philosopher, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
```

---

## 2. Sleeping Barber

### Problem Statement

A barber shop has one barber, one barber chair, and N waiting chairs. If there are no
customers, the barber sleeps. When a customer arrives: if all waiting chairs are full, the
customer leaves; if the barber is sleeping, the customer wakes the barber; otherwise, the
customer sits in a waiting chair.

```
+------------------------------------+
|          Barber Shop               |
|                                    |
|  [Barber Chair]  [Wait][Wait][Wait]|
|   (barber here)   1     2     3   |
|                                    |
| Door: customers enter/leave here   |
+------------------------------------+
```

### Solution

```python
import threading
import time
import random


class BarberShop:
    """Sleeping Barber problem solution using semaphores."""

    def __init__(self, num_waiting_chairs: int):
        self._num_waiting_chairs = num_waiting_chairs
        self._waiting_customers = 0
        self._lock = threading.Lock()

        # Semaphores for signaling
        self._customers_waiting = threading.Semaphore(0)  # Barber waits on this
        self._barber_ready = threading.Semaphore(0)       # Customers wait on this
        self._done_cutting = threading.Semaphore(0)       # Customer waits for cut

    def barber(self) -> None:
        """Barber thread: sleeps until customer arrives, then cuts hair."""
        while True:
            # Sleep until a customer arrives
            self._customers_waiting.acquire()  # Blocks if no customers

            # Signal that barber is ready
            self._barber_ready.release()

            # Cut hair
            time.sleep(random.uniform(0.05, 0.15))

            # Signal haircut is done
            self._done_cutting.release()

    def customer(self, customer_id: int) -> str:
        """Customer thread: either gets haircut or leaves if shop is full."""
        with self._lock:
            if self._waiting_customers >= self._num_waiting_chairs:
                return f"Customer {customer_id}: shop full, leaving"

            self._waiting_customers += 1

        # Wake up barber (or join waiting queue)
        self._customers_waiting.release()

        # Wait for barber to be ready
        self._barber_ready.acquire()

        with self._lock:
            self._waiting_customers -= 1

        # Wait for haircut to finish
        self._done_cutting.acquire()

        return f"Customer {customer_id}: got haircut"


def run_sleeping_barber():
    shop = BarberShop(num_waiting_chairs=3)

    # Start barber thread (daemon so it stops when main exits)
    barber_thread = threading.Thread(target=shop.barber, daemon=True)
    barber_thread.start()

    # Customers arrive at random intervals
    results = []
    threads = []

    for i in range(10):
        def visit(cid=i):
            result = shop.customer(cid)
            results.append(result)

        t = threading.Thread(target=visit)
        threads.append(t)
        t.start()
        time.sleep(random.uniform(0.01, 0.05))

    for t in threads:
        t.join()

    return results
```

---

## 3. Cigarette Smokers

### Problem Statement

Three smokers sit at a table. Each has an infinite supply of one ingredient: one has
tobacco, one has paper, one has matches. An agent places two random ingredients on the
table. The smoker who has the third ingredient picks them up, rolls a cigarette, and smokes.

The challenge: solve this WITHOUT the smokers knowing which ingredients are on the table
(they only know what they have).

### Solution

```python
import threading
import random
import time


class CigaretteSmokers:
    """Cigarette Smokers problem with pusher threads."""

    def __init__(self):
        self._lock = threading.Lock()

        # Agent places ingredients
        self._tobacco = threading.Semaphore(0)
        self._paper = threading.Semaphore(0)
        self._matches = threading.Semaphore(0)

        # Smoker signals
        self._tobacco_smoker = threading.Semaphore(0)
        self._paper_smoker = threading.Semaphore(0)
        self._matches_smoker = threading.Semaphore(0)

        # Pusher state
        self._has_tobacco = False
        self._has_paper = False
        self._has_matches = False

        self._agent_sem = threading.Semaphore(1)

    def agent(self, rounds: int) -> None:
        """Agent places two random ingredients on the table."""
        ingredients = [
            (self._tobacco, self._paper),      # Missing matches
            (self._tobacco, self._matches),    # Missing paper
            (self._paper, self._matches),      # Missing tobacco
        ]

        for _ in range(rounds):
            self._agent_sem.acquire()
            choice = random.choice(ingredients)
            choice[0].release()
            choice[1].release()

    def pusher_tobacco(self) -> None:
        """Intermediary: detects which smoker should go when tobacco appears."""
        while True:
            self._tobacco.acquire()
            with self._lock:
                if self._has_paper:
                    self._has_paper = False
                    self._matches_smoker.release()  # Matches smoker can go
                elif self._has_matches:
                    self._has_matches = False
                    self._paper_smoker.release()    # Paper smoker can go
                else:
                    self._has_tobacco = True

    def pusher_paper(self) -> None:
        """Intermediary for paper ingredient."""
        while True:
            self._paper.acquire()
            with self._lock:
                if self._has_tobacco:
                    self._has_tobacco = False
                    self._matches_smoker.release()
                elif self._has_matches:
                    self._has_matches = False
                    self._tobacco_smoker.release()
                else:
                    self._has_paper = True

    def pusher_matches(self) -> None:
        """Intermediary for matches ingredient."""
        while True:
            self._matches.acquire()
            with self._lock:
                if self._has_tobacco:
                    self._has_tobacco = False
                    self._paper_smoker.release()
                elif self._has_paper:
                    self._has_paper = False
                    self._tobacco_smoker.release()
                else:
                    self._has_matches = True

    def smoker(self, name: str, sem: threading.Semaphore, rounds: int) -> None:
        """Smoker waits for their signal, then smokes."""
        for _ in range(rounds):
            sem.acquire()
            time.sleep(0.01)  # Smoke
            self._agent_sem.release()  # Signal agent to place more


def run_cigarette_smokers():
    cs = CigaretteSmokers()

    threads = [
        threading.Thread(target=cs.agent, args=(9,)),
        threading.Thread(target=cs.pusher_tobacco, daemon=True),
        threading.Thread(target=cs.pusher_paper, daemon=True),
        threading.Thread(target=cs.pusher_matches, daemon=True),
        threading.Thread(target=cs.smoker, args=("Tobacco", cs._tobacco_smoker, 3)),
        threading.Thread(target=cs.smoker, args=("Paper", cs._paper_smoker, 3)),
        threading.Thread(target=cs.smoker, args=("Matches", cs._matches_smoker, 3)),
    ]

    for t in threads:
        t.start()
    for t in threads:
        if not t.daemon:
            t.join()
```

---

## 4. Print in Order (LeetCode 1114)

### Problem Statement

Three threads call `first()`, `second()`, and `third()` respectively. Ensure they always
execute in the order: first, second, third -- regardless of OS scheduling.

### Naive Approach (BUG)

```python
# BUG: No synchronization. Output order depends on OS scheduling.
class FooBroken:
    def first(self):
        print("first")

    def second(self):
        print("second")

    def third(self):
        print("third")
```

### Correct Solution: Events

```python
import threading


class PrintInOrder:
    """LeetCode 1114: Guarantee first -> second -> third execution order."""

    def __init__(self):
        self._first_done = threading.Event()
        self._second_done = threading.Event()

    def first(self, print_first) -> None:
        print_first()
        self._first_done.set()

    def second(self, print_second) -> None:
        self._first_done.wait()  # Block until first() completes
        print_second()
        self._second_done.set()

    def third(self, print_third) -> None:
        self._second_done.wait()  # Block until second() completes
        print_third()
```

### Alternative: Condition Variables

```python
import threading


class PrintInOrderCondition:
    """Alternative solution using Condition variables."""

    def __init__(self):
        self._order = 0
        self._condition = threading.Condition()

    def first(self, print_first) -> None:
        with self._condition:
            print_first()
            self._order = 1
            self._condition.notify_all()

    def second(self, print_second) -> None:
        with self._condition:
            while self._order < 1:
                self._condition.wait()
            print_second()
            self._order = 2
            self._condition.notify_all()

    def third(self, print_third) -> None:
        with self._condition:
            while self._order < 2:
                self._condition.wait()
            print_third()
```

---

## 5. Print FooBar Alternately (LeetCode 1115)

### Problem Statement

Two threads call `foo()` and `bar()` respectively. Ensure the output is always
"foobarfoobarfoobar..." for n iterations.

### Naive Approach (BUG)

```python
# BUG: No coordination. Could print "foofoobarbar" or any interleaving.
class FooBarBroken:
    def __init__(self, n):
        self.n = n

    def foo(self, print_foo):
        for _ in range(self.n):
            print_foo()  # No guarantee bar() runs between iterations

    def bar(self, print_bar):
        for _ in range(self.n):
            print_bar()
```

### Correct Solution: Events

```python
import threading


class FooBar:
    """LeetCode 1115: Alternate between foo and bar."""

    def __init__(self, n: int):
        self._n = n
        self._foo_event = threading.Event()
        self._bar_event = threading.Event()
        self._foo_event.set()  # foo goes first

    def foo(self, print_foo) -> None:
        for _ in range(self._n):
            self._foo_event.wait()  # Wait for our turn
            self._foo_event.clear()
            print_foo()
            self._bar_event.set()   # Signal bar's turn

    def bar(self, print_bar) -> None:
        for _ in range(self._n):
            self._bar_event.wait()  # Wait for our turn
            self._bar_event.clear()
            print_bar()
            self._foo_event.set()   # Signal foo's turn
```

### Alternative: Lock-Based

```python
import threading


class FooBarLock:
    """Alternative using two locks (like a two-phase toggle)."""

    def __init__(self, n: int):
        self._n = n
        self._foo_lock = threading.Lock()
        self._bar_lock = threading.Lock()
        self._bar_lock.acquire()  # bar starts locked

    def foo(self, print_foo) -> None:
        for _ in range(self._n):
            self._foo_lock.acquire()
            print_foo()
            self._bar_lock.release()

    def bar(self, print_bar) -> None:
        for _ in range(self._n):
            self._bar_lock.acquire()
            print_bar()
            self._foo_lock.release()
```

---

## 6. Building H2O (LeetCode 1117)

### Problem Statement

Multiple threads call either `hydrogen()` or `oxygen()`. A barrier must ensure that water
molecules are formed correctly: every group of 3 threads released must contain exactly
2 hydrogen threads and 1 oxygen thread.

### Naive Approach (BUG)

```python
# BUG: No grouping. Might release OOH or HHH instead of HHO.
class H2OBroken:
    def hydrogen(self, release_hydrogen):
        release_hydrogen()

    def oxygen(self, release_oxygen):
        release_oxygen()
```

### Correct Solution: Barrier + Semaphores

```python
import threading


class H2O:
    """LeetCode 1117: Group threads into water molecules (2H + 1O)."""

    def __init__(self):
        self._barrier = threading.Barrier(3)  # 3 threads per molecule
        self._hydrogen_sem = threading.Semaphore(2)  # Max 2 H per molecule
        self._oxygen_sem = threading.Semaphore(1)    # Max 1 O per molecule

    def hydrogen(self, release_hydrogen) -> None:
        self._hydrogen_sem.acquire()  # Only 2 H can proceed
        self._barrier.wait()          # Wait for 2H + 1O
        release_hydrogen()
        self._hydrogen_sem.release()  # Allow next molecule's H

    def oxygen(self, release_oxygen) -> None:
        self._oxygen_sem.acquire()    # Only 1 O can proceed
        self._barrier.wait()          # Wait for 2H + 1O
        release_oxygen()
        self._oxygen_sem.release()    # Allow next molecule's O


def test_h2o():
    """Test: given OOHHHH, output should be groups of HHO."""
    h2o = H2O()
    output = []
    output_lock = threading.Lock()

    def release_h():
        with output_lock:
            output.append("H")

    def release_o():
        with output_lock:
            output.append("O")

    threads = []
    # 4 hydrogen, 2 oxygen = 2 water molecules
    for _ in range(4):
        threads.append(threading.Thread(target=h2o.hydrogen, args=(release_h,)))
    for _ in range(2):
        threads.append(threading.Thread(target=h2o.oxygen, args=(release_o,)))

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Output will be some permutation of HHOHHO
    # Each group of 3 has exactly 2 H and 1 O
    assert len(output) == 6
    assert output.count("H") == 4
    assert output.count("O") == 2
```

---

## 7. Fizz Buzz Multithreaded (LeetCode 1195)

### Problem Statement

Four threads print numbers 1 to n. Thread A prints "fizz" for multiples of 3 (not 15).
Thread B prints "buzz" for multiples of 5 (not 15). Thread C prints "fizzbuzz" for
multiples of 15. Thread D prints the number for all other cases.

### Correct Solution: Condition Variable

```python
import threading


class FizzBuzz:
    """LeetCode 1195: Four threads coordinate to print fizzbuzz sequence."""

    def __init__(self, n: int):
        self._n = n
        self._current = 1
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)

    def fizz(self, print_fizz) -> None:
        """Print 'fizz' for multiples of 3 that are not multiples of 5."""
        while True:
            with self._condition:
                while self._current <= self._n and not (
                    self._current % 3 == 0 and self._current % 5 != 0
                ):
                    self._condition.wait()

                if self._current > self._n:
                    return

                print_fizz()
                self._current += 1
                self._condition.notify_all()

    def buzz(self, print_buzz) -> None:
        """Print 'buzz' for multiples of 5 that are not multiples of 3."""
        while True:
            with self._condition:
                while self._current <= self._n and not (
                    self._current % 5 == 0 and self._current % 3 != 0
                ):
                    self._condition.wait()

                if self._current > self._n:
                    return

                print_buzz()
                self._current += 1
                self._condition.notify_all()

    def fizzbuzz(self, print_fizzbuzz) -> None:
        """Print 'fizzbuzz' for multiples of 15."""
        while True:
            with self._condition:
                while self._current <= self._n and not (
                    self._current % 15 == 0
                ):
                    self._condition.wait()

                if self._current > self._n:
                    return

                print_fizzbuzz()
                self._current += 1
                self._condition.notify_all()

    def number(self, print_number) -> None:
        """Print the number if not divisible by 3 or 5."""
        while True:
            with self._condition:
                while self._current <= self._n and (
                    self._current % 3 == 0 or self._current % 5 == 0
                ):
                    self._condition.wait()

                if self._current > self._n:
                    return

                print_number(self._current)
                self._current += 1
                self._condition.notify_all()


def test_fizzbuzz():
    """Test: FizzBuzz from 1 to 15."""
    output = []
    output_lock = threading.Lock()

    def print_fizz():
        with output_lock:
            output.append("fizz")

    def print_buzz():
        with output_lock:
            output.append("buzz")

    def print_fizzbuzz():
        with output_lock:
            output.append("fizzbuzz")

    def print_number(n):
        with output_lock:
            output.append(str(n))

    fb = FizzBuzz(15)
    threads = [
        threading.Thread(target=fb.fizz, args=(print_fizz,)),
        threading.Thread(target=fb.buzz, args=(print_buzz,)),
        threading.Thread(target=fb.fizzbuzz, args=(print_fizzbuzz,)),
        threading.Thread(target=fb.number, args=(print_number,)),
    ]

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    expected = [
        "1", "2", "fizz", "4", "buzz", "fizz", "7", "8",
        "fizz", "buzz", "11", "fizz", "13", "14", "fizzbuzz"
    ]
    assert output == expected
```

### Alternative: Event-Based (More Efficient)

```python
import threading


class FizzBuzzEvents:
    """Alternative using targeted events instead of notify_all."""

    def __init__(self, n: int):
        self._n = n
        self._current = 1
        self._events = {
            "fizz": threading.Event(),
            "buzz": threading.Event(),
            "fizzbuzz": threading.Event(),
            "number": threading.Event(),
        }
        self._done = threading.Event()
        # Signal the first appropriate thread
        self._signal_next()

    def _signal_next(self) -> None:
        if self._current > self._n:
            self._done.set()
            for e in self._events.values():
                e.set()  # Wake all threads so they can exit
            return

        if self._current % 15 == 0:
            self._events["fizzbuzz"].set()
        elif self._current % 3 == 0:
            self._events["fizz"].set()
        elif self._current % 5 == 0:
            self._events["buzz"].set()
        else:
            self._events["number"].set()

    def _worker(self, name: str, action) -> None:
        while True:
            self._events[name].wait()
            self._events[name].clear()
            if self._done.is_set():
                return
            action()
            self._current += 1
            self._signal_next()

    def fizz(self, print_fizz) -> None:
        self._worker("fizz", print_fizz)

    def buzz(self, print_buzz) -> None:
        self._worker("buzz", print_buzz)

    def fizzbuzz(self, print_fizzbuzz) -> None:
        self._worker("fizzbuzz", print_fizzbuzz)

    def number(self, print_number) -> None:
        self._worker("number", lambda: print_number(self._current))
```

---

## 8. Common Interview Questions

1. **Why does the naive Dining Philosophers solution deadlock?**
   All philosophers grab left fork simultaneously, then all wait for right fork. This forms
   a circular wait (Coffman condition 4).

2. **What are three different ways to solve Dining Philosophers?**
   (a) Resource ordering: always pick up lower-numbered fork first.
   (b) Arbitrator: semaphore limits to N-1 philosophers trying at once.
   (c) Chandy-Misra: dirty/clean fork passing protocol.

3. **In the Sleeping Barber, why do we need both a customer semaphore and a barber semaphore?**
   Customer semaphore wakes the barber (signals customer arrival). Barber semaphore signals
   the customer that the barber is ready. Two-way handshake prevents race conditions.

4. **How do you ensure exactly 2H + 1O grouping in the H2O problem?**
   Semaphores limit hydrogen to 2 and oxygen to 1 per barrier cycle. The barrier (parties=3)
   ensures all three arrive before any are released.

5. **Why use notify_all() instead of notify() in FizzBuzz?**
   With notify(), we might wake the wrong thread (e.g., wake fizz when it is buzz's turn).
   notify_all() wakes all threads, and the while-loop predicate ensures only the correct
   one proceeds.

6. **Can you solve Print FooBar with a single condition variable?**
   Yes. Use a boolean flag `is_foo_turn`. Both threads wait on the same condition, check
   the flag, and toggle it after printing.

---

## 9. Gotchas

- **Dining Philosophers: timeout is not a complete solution.** If all philosophers timeout
  and retry simultaneously, they can livelock (repeatedly grab and release in sync). Add
  random jitter to timeouts.

- **Barrier reuse.** Python's `threading.Barrier` automatically resets after all parties
  arrive. But if a thread crashes before reaching the barrier, all other threads hang
  forever. Use `barrier.abort()` for cleanup.

- **FizzBuzz: the exit condition.** When `current > n`, ALL threads must exit. If only the
  active thread exits, the others remain blocked on `wait()`. Always signal all threads
  when the work is done.

- **H2O: semaphore ordering.** If you release the semaphore before the barrier, the next
  molecule's threads might enter before the current molecule's threads have printed. Release
  semaphores AFTER the barrier.

- **Cigarette Smokers: the agent cannot be modified.** The classic constraint is that the
  agent code is fixed. The solution requires "pusher" intermediary threads that detect which
  pair was placed and signal the correct smoker.

- **Spurious wakeups in all condition-based solutions.** Always use `while` loops, never
  `if` checks, around `condition.wait()`.

---

## 10. Quick Reference

```
+----------------------------+-------------------+------------------------------+
| Problem                    | Key Primitive     | Core Insight                 |
+----------------------------+-------------------+------------------------------+
| Dining Philosophers        | Lock + ordering   | Break circular wait          |
|                            | OR Semaphore      | Limit concurrency to N-1     |
+----------------------------+-------------------+------------------------------+
| Sleeping Barber            | 3 Semaphores      | Two-way handshake between    |
|                            |                   | barber and customer          |
+----------------------------+-------------------+------------------------------+
| Cigarette Smokers          | Semaphores +      | Pusher threads detect which  |
|                            | intermediaries    | smoker should proceed        |
+----------------------------+-------------------+------------------------------+
| Print in Order (1114)      | Event or          | Sequential gating: each step |
|                            | Condition         | enables the next             |
+----------------------------+-------------------+------------------------------+
| FooBar Alternately (1115)  | 2 Events or       | Ping-pong toggle between     |
|                            | 2 Locks           | two threads                  |
+----------------------------+-------------------+------------------------------+
| Building H2O (1117)        | Barrier +         | Semaphores limit ratio,      |
|                            | Semaphores        | barrier enforces grouping    |
+----------------------------+-------------------+------------------------------+
| FizzBuzz MT (1195)         | Condition with    | notify_all + while-loop      |
|                            | predicate         | ensures correct thread acts  |
+----------------------------+-------------------+------------------------------+

Solution Strategy Checklist:
  1. Identify what must be mutually exclusive
  2. Identify ordering constraints (A before B)
  3. Identify grouping constraints (2H + 1O)
  4. Choose primitive: Event (signal), Condition (state), Barrier (sync), Semaphore (limit)
  5. Verify: no deadlock, no starvation, no race condition
  6. Test with adversarial scheduling (all threads arrive simultaneously)
```
