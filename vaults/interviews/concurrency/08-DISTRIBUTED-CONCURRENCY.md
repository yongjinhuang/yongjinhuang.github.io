# Distributed Concurrency

This file bridges concurrency concepts to distributed systems. In interviews, system design
questions frequently involve concurrent access across multiple machines. The primitives here
are the distributed equivalents of the locks, queues, and atomic operations from earlier files.

---

## Table of Contents

1. [Distributed Locks](#1-distributed-locks)
2. [Optimistic Concurrency Control](#2-optimistic-concurrency-control)
3. [Pessimistic Concurrency Control](#3-pessimistic-concurrency-control)
4. [Distributed Transactions](#4-distributed-transactions)
5. [Eventual Consistency Patterns](#5-eventual-consistency-patterns)
6. [Leader Election](#6-leader-election)
7. [Idempotency and Exactly-Once Semantics](#7-idempotency-and-exactly-once-semantics)
8. [Common Interview Questions](#8-common-interview-questions)
9. [Gotchas](#9-gotchas)
10. [Quick Reference](#10-quick-reference)

---

## 1. Distributed Locks

When multiple services need to coordinate access to a shared resource, a distributed lock
ensures mutual exclusion across machine boundaries.

### Why Not Just Use a Regular Lock?

```
Single Machine:
  Thread A --|
             |--> threading.Lock() --> Shared Resource
  Thread B --|

Distributed System:
  Service A (Machine 1) --|
                          |--> ??? --> Shared Resource (Database/S3/API)
  Service B (Machine 2) --|

  threading.Lock() only works within one process.
  We need a lock that spans machines.
```

### Redis SETNX Lock (Simple)

```python
import time
import uuid


class RedisDistributedLock:
    """Simple distributed lock using Redis SETNX.

    SETNX (SET if Not eXists) is an atomic operation that sets a key
    only if it does not already exist.
    """

    def __init__(self, redis_client, lock_name: str, ttl_seconds: int = 30):
        self._redis = redis_client
        self._lock_name = f"lock:{lock_name}"
        self._ttl = ttl_seconds
        self._token = str(uuid.uuid4())  # Unique token to prevent wrong release

    def acquire(self, timeout: float = 10.0) -> bool:
        """Try to acquire the lock within timeout seconds."""
        deadline = time.time() + timeout

        while time.time() < deadline:
            # SET key value NX EX ttl
            # NX = only set if not exists
            # EX = expire after ttl seconds (prevents deadlock if holder crashes)
            acquired = self._redis.set(
                self._lock_name,
                self._token,
                nx=True,
                ex=self._ttl,
            )
            if acquired:
                return True

            time.sleep(0.05)  # Brief backoff before retry

        return False

    def release(self) -> bool:
        """Release the lock. Only succeeds if we are the current holder.

        Uses Lua script for atomic check-and-delete.
        """
        # Lua script ensures atomic compare-and-delete
        lua_script = """
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
        """
        result = self._redis.eval(lua_script, 1, self._lock_name, self._token)
        return result == 1

    def extend(self, additional_seconds: int) -> bool:
        """Extend lock TTL if we still hold it."""
        lua_script = """
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("EXPIRE", KEYS[1], ARGV[2])
        else
            return 0
        end
        """
        result = self._redis.eval(
            lua_script, 1, self._lock_name, self._token, additional_seconds
        )
        return result == 1


def use_distributed_lock(redis_client):
    """Example usage of distributed lock."""
    lock = RedisDistributedLock(redis_client, "payment-processing", ttl_seconds=30)

    if lock.acquire(timeout=5.0):
        try:
            # Critical section: process payment
            process_payment()
        finally:
            lock.release()
    else:
        raise TimeoutError("Could not acquire lock")


def process_payment():
    """Placeholder for actual payment logic."""
    pass
```

### Redlock Algorithm (Multi-Node)

The simple SETNX lock has a single point of failure. Redlock uses N independent Redis nodes
(typically 5) to achieve consensus.

```
Redlock Algorithm:
1. Get current time T1
2. Try to acquire the lock on ALL N Redis nodes (sequentially)
   with a short per-node timeout
3. Get current time T2
4. Lock is acquired if:
   a. Majority of nodes (N/2 + 1) granted the lock
   b. Total elapsed time (T2 - T1) < lock TTL
5. If lock is acquired, effective TTL = original TTL - (T2 - T1)
6. If lock is NOT acquired, release on ALL nodes (even partial)
```

```python
import time
import uuid


class Redlock:
    """Redlock: distributed lock across multiple Redis nodes.

    Requires majority agreement (quorum) for safety.
    """

    def __init__(self, redis_clients: list, lock_name: str, ttl_ms: int = 30000):
        self._clients = redis_clients
        self._lock_name = f"lock:{lock_name}"
        self._ttl_ms = ttl_ms
        self._quorum = len(redis_clients) // 2 + 1
        self._token = str(uuid.uuid4())
        # Clock drift factor (small margin for clock differences)
        self._drift_factor = 0.01

    def acquire(self) -> bool:
        """Try to acquire lock on majority of nodes."""
        start_time = time.time() * 1000  # milliseconds

        acquired_count = 0
        for client in self._clients:
            try:
                if self._try_lock_node(client):
                    acquired_count += 1
            except Exception:
                pass  # Node unreachable

        elapsed = time.time() * 1000 - start_time
        drift = self._ttl_ms * self._drift_factor + 2  # Clock drift margin

        # Check if we have quorum and enough time remaining
        validity_time = self._ttl_ms - elapsed - drift
        if acquired_count >= self._quorum and validity_time > 0:
            return True

        # Failed: release on all nodes
        self.release()
        return False

    def release(self) -> None:
        """Release lock on ALL nodes (even if we didn't acquire all)."""
        for client in self._clients:
            try:
                self._unlock_node(client)
            except Exception:
                pass

    def _try_lock_node(self, client) -> bool:
        """Attempt lock on a single Redis node."""
        return client.set(
            self._lock_name, self._token, nx=True, px=self._ttl_ms
        )

    def _unlock_node(self, client) -> None:
        """Release lock on a single Redis node (only if we hold it)."""
        lua_script = """
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
        """
        client.eval(lua_script, 1, self._lock_name, self._token)
```

### ZooKeeper Distributed Lock (Concept)

```
ZooKeeper Lock Recipe:
1. Create an ephemeral sequential node under /locks/resource-name/
   Node name: /locks/resource-name/lock-00000001
2. Get all children of /locks/resource-name/
3. If your node has the LOWEST sequence number, you have the lock
4. Otherwise, watch the node with the next-lower sequence number
5. When that node is deleted, re-check if you are now the lowest
6. Release: delete your node (or it auto-deletes on session close)

Advantages over Redis:
  - Ephemeral nodes auto-cleanup on client crash (no TTL guessing)
  - Watch mechanism avoids polling (efficient)
  - Strong ordering guarantees via ZAB consensus
```

---

## 2. Optimistic Concurrency Control

Optimistic concurrency assumes conflicts are rare. Read data, process it, then check
that no one else modified it before committing.

### Version Numbers

```python
class OptimisticRepository:
    """Database repository with optimistic concurrency control.

    Each record has a version number. Updates only succeed if the version
    matches what was read.
    """

    def __init__(self, db_connection):
        self._db = db_connection

    def get_user(self, user_id: str) -> dict:
        """Read user with version number."""
        row = self._db.execute(
            "SELECT id, name, email, version FROM users WHERE id = %s",
            (user_id,)
        )
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "version": row["version"],
        }

    def update_user(self, user_id: str, data: dict, expected_version: int) -> bool:
        """Update user only if version matches (optimistic lock).

        The WHERE clause includes the version check. If another process
        updated the row since we read it, version won't match and
        affected_rows will be 0.
        """
        result = self._db.execute(
            """UPDATE users
               SET name = %s, email = %s, version = version + 1
               WHERE id = %s AND version = %s""",
            (data["name"], data["email"], user_id, expected_version)
        )
        return result.affected_rows > 0  # False = conflict detected


def update_with_retry(repo, user_id: str, update_fn, max_retries: int = 3):
    """Retry loop for optimistic concurrency."""
    for attempt in range(max_retries):
        user = repo.get_user(user_id)

        # Apply updates (caller's logic)
        updated_data = update_fn(user)

        if repo.update_user(user_id, updated_data, user["version"]):
            return updated_data  # Success

        # Conflict: another process updated the user. Retry with fresh data.
        if attempt < max_retries - 1:
            import time
            time.sleep(0.01 * (attempt + 1))

    raise RuntimeError(f"Failed to update user {user_id} after {max_retries} retries")
```

### ETags for HTTP APIs

```
HTTP Optimistic Concurrency:

GET /api/users/123
Response:
  ETag: "v5"
  {"id": 123, "name": "Alice", "email": "alice@example.com"}

PUT /api/users/123
  If-Match: "v5"        <-- "Only update if current version is v5"
  {"name": "Alice B.", "email": "alice@example.com"}

Response (success):
  200 OK
  ETag: "v6"

Response (conflict):
  409 Conflict           <-- Someone else updated since we read
  {"error": "Resource was modified. Re-fetch and retry."}
```

---

## 3. Pessimistic Concurrency Control

Pessimistic concurrency assumes conflicts are likely. Lock the data BEFORE reading.

### SELECT FOR UPDATE

```python
class PessimisticRepository:
    """Database repository with pessimistic locking via SELECT FOR UPDATE."""

    def __init__(self, db_connection):
        self._db = db_connection

    def transfer(self, from_id: str, to_id: str, amount: float) -> bool:
        """Transfer money using database-level pessimistic locking.

        SELECT FOR UPDATE acquires a row-level lock that persists until
        the transaction commits or rolls back. Other transactions that
        try to SELECT FOR UPDATE the same rows will block.
        """
        try:
            self._db.begin_transaction()

            # Lock both rows (order by ID to prevent deadlock)
            ids = sorted([from_id, to_id])
            accounts = {}
            for account_id in ids:
                row = self._db.execute(
                    "SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE",
                    (account_id,)
                )
                accounts[account_id] = row

            # Check sufficient funds
            if accounts[from_id]["balance"] < amount:
                self._db.rollback()
                return False

            # Perform transfer
            self._db.execute(
                "UPDATE accounts SET balance = balance - %s WHERE id = %s",
                (amount, from_id)
            )
            self._db.execute(
                "UPDATE accounts SET balance = balance + %s WHERE id = %s",
                (amount, to_id)
            )

            self._db.commit()
            return True

        except Exception:
            self._db.rollback()
            raise
```

### Advisory Locks

```python
class AdvisoryLockManager:
    """PostgreSQL advisory locks: application-level locking via database.

    Advisory locks are not tied to any table. They are arbitrary
    application-defined locks coordinated through the database.
    """

    def __init__(self, db_connection):
        self._db = db_connection

    def acquire(self, lock_id: int) -> bool:
        """Acquire advisory lock. Blocks until available."""
        self._db.execute("SELECT pg_advisory_lock(%s)", (lock_id,))
        return True

    def try_acquire(self, lock_id: int) -> bool:
        """Try to acquire advisory lock. Non-blocking."""
        result = self._db.execute(
            "SELECT pg_try_advisory_lock(%s)", (lock_id,)
        )
        return result[0][0]  # Returns True/False

    def release(self, lock_id: int) -> None:
        """Release advisory lock."""
        self._db.execute("SELECT pg_advisory_unlock(%s)", (lock_id,))
```

---

## 4. Distributed Transactions

### Two-Phase Commit (2PC)

```
Two-Phase Commit Protocol:

Phase 1: PREPARE (Voting)
  Coordinator --> Participant A: "Can you commit?"
  Coordinator --> Participant B: "Can you commit?"
  Participant A --> Coordinator: "Yes, prepared"
  Participant B --> Coordinator: "Yes, prepared"

Phase 2: COMMIT (Decision)
  Coordinator --> Participant A: "COMMIT"
  Coordinator --> Participant B: "COMMIT"
  Participant A --> Coordinator: "ACK"
  Participant B --> Coordinator: "ACK"

If ANY participant votes "No" in Phase 1:
  Coordinator --> All: "ABORT"
```

```python
from enum import Enum
from dataclasses import dataclass


class TwoPhaseCommitState(Enum):
    INIT = "init"
    PREPARED = "prepared"
    COMMITTED = "committed"
    ABORTED = "aborted"


@dataclass
class TransactionParticipant:
    name: str
    state: TwoPhaseCommitState = TwoPhaseCommitState.INIT

    def prepare(self) -> bool:
        """Phase 1: Can this participant commit?"""
        # Check constraints, acquire locks, write to WAL
        # Return True if ready to commit, False otherwise
        self.state = TwoPhaseCommitState.PREPARED
        return True

    def commit(self) -> None:
        """Phase 2: Make changes permanent."""
        self.state = TwoPhaseCommitState.COMMITTED

    def abort(self) -> None:
        """Phase 2 (failure): Roll back changes."""
        self.state = TwoPhaseCommitState.ABORTED


class TwoPhaseCommitCoordinator:
    """Coordinates distributed transaction across multiple participants."""

    def __init__(self, participants: list[TransactionParticipant]):
        self._participants = participants

    def execute(self) -> bool:
        """Execute the two-phase commit protocol."""
        # Phase 1: Prepare
        prepared = []
        for participant in self._participants:
            try:
                if participant.prepare():
                    prepared.append(participant)
                else:
                    # One participant voted no -- abort all
                    self._abort_all(prepared)
                    return False
            except Exception:
                self._abort_all(prepared)
                return False

        # Phase 2: Commit (all voted yes)
        for participant in self._participants:
            try:
                participant.commit()
            except Exception:
                # Commit failure is a serious problem
                # In practice: log, retry, or manual intervention
                pass

        return True

    def _abort_all(self, prepared: list[TransactionParticipant]) -> None:
        for participant in prepared:
            try:
                participant.abort()
            except Exception:
                pass  # Best effort cleanup
```

### Saga Pattern

Sagas replace distributed transactions with a sequence of local transactions, each with a
compensating action to undo its effects if a later step fails.

```
Saga: Book a Trip (Order -> Flight -> Hotel -> Car)

Happy Path:
  [Book Flight] --> [Book Hotel] --> [Book Car] --> DONE!

Failure at Hotel:
  [Book Flight] --> [Book Hotel: FAIL!]
  Compensate: [Cancel Flight] --> FAIL reported to user

Each step has a compensating action:
  Step              | Compensation
  ------------------|------------------
  Book Flight       | Cancel Flight
  Book Hotel        | Cancel Hotel
  Charge Payment    | Refund Payment
```

```python
from dataclasses import dataclass
from typing import Callable


@dataclass
class SagaStep:
    name: str
    action: Callable[[], bool]
    compensation: Callable[[], None]


class SagaOrchestrator:
    """Orchestrator-based saga pattern.

    Executes steps in order. If any step fails, runs compensations
    for all completed steps in reverse order.
    """

    def __init__(self, steps: list[SagaStep]):
        self._steps = steps

    def execute(self) -> bool:
        """Execute the saga. Returns True if all steps succeeded."""
        completed: list[SagaStep] = []

        for step in self._steps:
            try:
                success = step.action()
                if not success:
                    self._compensate(completed)
                    return False
                completed.append(step)
            except Exception:
                self._compensate(completed)
                return False

        return True

    def _compensate(self, completed: list[SagaStep]) -> None:
        """Run compensations in reverse order."""
        for step in reversed(completed):
            try:
                step.compensation()
            except Exception:
                # Log compensation failure for manual intervention
                pass


def book_trip_saga():
    """Example: book a trip using saga pattern."""
    steps = [
        SagaStep(
            name="book_flight",
            action=lambda: book_flight("NYC", "LAX"),
            compensation=lambda: cancel_flight("FLIGHT-123"),
        ),
        SagaStep(
            name="book_hotel",
            action=lambda: book_hotel("LAX", "2026-03-15"),
            compensation=lambda: cancel_hotel("HOTEL-456"),
        ),
        SagaStep(
            name="charge_payment",
            action=lambda: charge_card("card_xxx", 500.00),
            compensation=lambda: refund_card("card_xxx", 500.00),
        ),
    ]

    saga = SagaOrchestrator(steps)
    success = saga.execute()
    return success


def book_flight(origin, dest):
    return True

def cancel_flight(flight_id):
    pass

def book_hotel(city, date):
    return True

def cancel_hotel(hotel_id):
    pass

def charge_card(card, amount):
    return True

def refund_card(card, amount):
    pass
```

---

## 5. Eventual Consistency Patterns

### CRDT Concepts (Conflict-Free Replicated Data Types)

CRDTs are data structures that can be replicated across machines, updated independently,
and merged without conflicts. They guarantee eventual consistency.

```
CRDT Types:

G-Counter (Grow-Only Counter):
  Each node has its own counter.
  To increment: increment your node's counter.
  To read total: sum all nodes' counters.
  Merge: take max of each node's counter.

  Node A: [A:3, B:0, C:0]    Total: 3
  Node B: [A:0, B:5, C:0]    Total: 5
  Node C: [A:0, B:0, C:2]    Total: 2

  After merge: [A:3, B:5, C:2]  Total: 10

PN-Counter (Positive-Negative Counter):
  Two G-Counters: one for increments, one for decrements.
  Value = sum(P) - sum(N)

LWW-Register (Last-Writer-Wins Register):
  Each write includes a timestamp.
  On conflict, highest timestamp wins.
  Simple but may lose writes.

OR-Set (Observed-Remove Set):
  Each element has a unique tag.
  Add: insert element with new tag.
  Remove: remove all observed tags for element.
  Elements with any remaining tag are in the set.
```

### G-Counter Implementation

```python
class GCounter:
    """Grow-only counter CRDT.

    Each node increments its own entry. Merge takes max of each entry.
    Guarantees eventual consistency without coordination.
    """

    def __init__(self, node_id: str):
        self._node_id = node_id
        self._counts: dict[str, int] = {node_id: 0}

    def increment(self, amount: int = 1) -> None:
        """Increment this node's counter."""
        self._counts = {
            **self._counts,
            self._node_id: self._counts.get(self._node_id, 0) + amount,
        }

    def value(self) -> int:
        """Read the total count across all nodes."""
        return sum(self._counts.values())

    def merge(self, other: "GCounter") -> "GCounter":
        """Merge with another replica. Takes max of each node's count."""
        all_nodes = set(self._counts.keys()) | set(other._counts.keys())
        merged = GCounter(self._node_id)
        merged._counts = {
            node: max(
                self._counts.get(node, 0),
                other._counts.get(node, 0),
            )
            for node in all_nodes
        }
        return merged


def test_g_counter():
    # Three nodes incrementing independently
    counter_a = GCounter("A")
    counter_b = GCounter("B")
    counter_c = GCounter("C")

    counter_a.increment(3)
    counter_b.increment(5)
    counter_c.increment(2)

    # Each node sees only its own increments
    assert counter_a.value() == 3
    assert counter_b.value() == 5

    # After merging, all see the total
    merged = counter_a.merge(counter_b).merge(counter_c)
    assert merged.value() == 10
```

### Last-Write-Wins Register

```python
import time


class LWWRegister:
    """Last-Writer-Wins Register CRDT.

    On conflict, the write with the highest timestamp wins.
    Simple but may lose concurrent writes.
    """

    def __init__(self):
        self._value = None
        self._timestamp = 0.0

    def set(self, value, timestamp: float | None = None) -> None:
        ts = timestamp if timestamp is not None else time.time()
        if ts > self._timestamp:
            self._value = value
            self._timestamp = ts

    def get(self):
        return self._value

    def merge(self, other: "LWWRegister") -> "LWWRegister":
        """Merge: higher timestamp wins."""
        result = LWWRegister()
        if self._timestamp >= other._timestamp:
            result._value = self._value
            result._timestamp = self._timestamp
        else:
            result._value = other._value
            result._timestamp = other._timestamp
        return result
```

---

## 6. Leader Election

Leader election ensures that exactly one node acts as the coordinator among a group of
distributed nodes.

### Raft Leader Election (Simplified Concept)

```
Raft Leader Election:

Node States: Follower, Candidate, Leader

1. All nodes start as Followers
2. Each Follower has a random election timeout (e.g., 150-300ms)
3. If a Follower does not hear from the Leader before timeout:
   a. Becomes a Candidate
   b. Increments its term number
   c. Votes for itself
   d. Sends RequestVote RPCs to all other nodes
4. A Candidate becomes Leader if it receives votes from a MAJORITY
5. The Leader sends periodic heartbeats to maintain authority
6. If a Leader fails, followers time out and trigger a new election

Key Invariant: At most ONE leader per term

Term 1:  [A: Leader]  [B: Follower]  [C: Follower]
              |
          A crashes
              |
Term 2:  [A: down]    [B: Candidate --> Leader]  [C: voted for B]
```

### Simple Leader Election with Database

```python
import time
import uuid


class DatabaseLeaderElection:
    """Leader election using a database row with heartbeats.

    Simple approach suitable for small clusters.
    """

    def __init__(self, db, service_name: str, node_id: str | None = None):
        self._db = db
        self._service_name = service_name
        self._node_id = node_id or str(uuid.uuid4())
        self._heartbeat_interval = 5  # seconds
        self._lease_duration = 15     # seconds

    def try_become_leader(self) -> bool:
        """Try to become leader using optimistic locking."""
        now = time.time()

        # Try to claim leadership if no leader or lease expired
        result = self._db.execute(
            """INSERT INTO leaders (service, node_id, last_heartbeat)
               VALUES (%s, %s, %s)
               ON CONFLICT (service) DO UPDATE
               SET node_id = %s, last_heartbeat = %s
               WHERE leaders.last_heartbeat < %s
                  OR leaders.node_id = %s""",
            (
                self._service_name,
                self._node_id,
                now,
                self._node_id,
                now,
                now - self._lease_duration,  # Expired lease
                self._node_id,               # Already leader (renew)
            )
        )
        return result.affected_rows > 0

    def send_heartbeat(self) -> bool:
        """Renew leadership by updating heartbeat timestamp."""
        result = self._db.execute(
            """UPDATE leaders SET last_heartbeat = %s
               WHERE service = %s AND node_id = %s""",
            (time.time(), self._service_name, self._node_id)
        )
        return result.affected_rows > 0

    def is_leader(self) -> bool:
        """Check if this node is currently the leader."""
        row = self._db.execute(
            """SELECT node_id, last_heartbeat FROM leaders
               WHERE service = %s""",
            (self._service_name,)
        )
        if not row:
            return False
        return (
            row["node_id"] == self._node_id
            and time.time() - row["last_heartbeat"] < self._lease_duration
        )
```

---

## 7. Idempotency and Exactly-Once Semantics

In distributed systems, messages can be duplicated (retries after timeout). Idempotency
ensures that processing the same message multiple times produces the same result.

### Idempotency Key Pattern

```python
import time
import uuid


class IdempotentProcessor:
    """Process each request exactly once using idempotency keys.

    Each request includes a unique idempotency key (client-generated UUID).
    Before processing, check if this key was already processed.
    After processing, store the key and result.
    """

    def __init__(self, db, cache):
        self._db = db
        self._cache = cache
        self._key_ttl = 86400  # 24 hours

    def process_payment(self, idempotency_key: str, payment: dict) -> dict:
        """Process a payment idempotently."""
        # Step 1: Check if already processed
        cached_result = self._cache.get(f"idem:{idempotency_key}")
        if cached_result is not None:
            return cached_result  # Return previous result (idempotent)

        # Step 2: Check database (cache may have expired)
        db_result = self._db.execute(
            "SELECT result FROM idempotency_keys WHERE key = %s",
            (idempotency_key,)
        )
        if db_result:
            result = db_result["result"]
            self._cache.set(f"idem:{idempotency_key}", result, ex=self._key_ttl)
            return result

        # Step 3: Process (first time for this key)
        try:
            result = self._execute_payment(payment)

            # Step 4: Store result with idempotency key (atomically)
            self._db.execute(
                """INSERT INTO idempotency_keys (key, result, created_at)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (key) DO NOTHING""",
                (idempotency_key, result, time.time())
            )

            self._cache.set(f"idem:{idempotency_key}", result, ex=self._key_ttl)
            return result

        except Exception as e:
            # Do NOT store the error -- allow retry
            raise

    def _execute_payment(self, payment: dict) -> dict:
        """Actual payment processing logic."""
        return {
            "payment_id": str(uuid.uuid4()),
            "amount": payment["amount"],
            "status": "completed",
        }
```

### Exactly-Once with Transactional Outbox

```
Transactional Outbox Pattern:
Instead of sending a message directly (which can fail after DB commit),
write the message to an outbox table in the SAME database transaction.

1. BEGIN TRANSACTION
2. Update business data (e.g., order status)
3. INSERT message into outbox table
4. COMMIT

A separate process polls the outbox table and publishes messages.
This guarantees: if the DB transaction committed, the message WILL be sent.

+------------------+     +------------------+     +------------------+
| Service          |     | Database         |     | Message Queue    |
|                  |     |                  |     |                  |
| 1. Process order |---->| 2. Update order  |     |                  |
|                  |     | 3. Write outbox  |     |                  |
|                  |     | 4. COMMIT        |     |                  |
|                  |     |                  |     |                  |
| Outbox Relay     |---->| 5. Read outbox   |---->| 6. Publish msg   |
| (background)     |     | 7. Mark sent     |     |                  |
+------------------+     +------------------+     +------------------+
```

---

## 8. Common Interview Questions

1. **How would you implement a distributed lock?**
   Redis SETNX with TTL for simplicity. Redlock for fault tolerance (5 nodes, quorum).
   ZooKeeper ephemeral sequential nodes for strong guarantees.

2. **What is the difference between optimistic and pessimistic concurrency?**
   Optimistic: read, modify, check version at commit. Retry on conflict. Best for read-heavy.
   Pessimistic: lock before reading. Block on contention. Best for write-heavy.

3. **Explain the saga pattern and when to use it.**
   A sequence of local transactions with compensating actions. Used when you cannot use
   distributed transactions (microservices). Each step has an undo. Failures trigger
   compensations in reverse order.

4. **What are CRDTs?**
   Conflict-Free Replicated Data Types. Can be updated independently and merged without
   conflicts. Guarantee eventual consistency. Examples: G-Counter, LWW-Register, OR-Set.

5. **How do you achieve exactly-once processing in a distributed system?**
   Idempotency keys: client sends a unique key, server checks if already processed before
   executing. Transactional outbox: write message and business data in one DB transaction.

6. **What is two-phase commit and what are its problems?**
   Coordinator asks all participants to prepare, then commit. Problems: blocking (if
   coordinator crashes, participants are stuck), single point of failure, performance overhead.
   This is why sagas are preferred in microservices.

---

## 9. Gotchas

- **Redis distributed locks need TTL.** Without TTL, if the lock holder crashes, the lock
  is held forever. But TTL introduces the risk of lock expiration during processing. Use
  lock extension (fencing) for long operations.

- **Clock skew breaks LWW and Redlock.** Last-Writer-Wins relies on timestamp ordering. If
  clocks differ between nodes, a "later" write might have an earlier timestamp. Use logical
  clocks (Lamport timestamps, vector clocks) for correctness.

- **Saga compensations can fail.** If a compensation action fails (e.g., refund API is down),
  you need retry logic for compensations too. This requires its own persistence and retry.

- **2PC is blocking.** If the coordinator crashes after sending PREPARE but before COMMIT,
  participants are stuck in a prepared state. They cannot commit or abort independently.
  This is why 2PC is avoided in microservices.

- **Idempotency keys must be client-generated.** If the server generates the key, the client
  cannot retry (it does not know the key). The client must generate a UUID before the first
  attempt and reuse it on retries.

- **Distributed locks do not guarantee mutual exclusion under network partitions.** A client
  holding a Redis lock might get partitioned from Redis. Redis expires the TTL. Another
  client acquires the lock. Now two clients think they hold the lock. Use fencing tokens
  (monotonic counter from the lock) to detect stale holders.

---

## 10. Quick Reference

```
+----------------------------+----------------------------+----------------------------+
| Pattern                    | Use Case                   | Trade-off                  |
+----------------------------+----------------------------+----------------------------+
| Redis SETNX Lock           | Simple distributed mutex   | Single point of failure    |
| Redlock                    | Fault-tolerant dist. lock  | Complex, clock dependency  |
| ZooKeeper Lock             | Strong ordering guarantees | Operational overhead       |
+----------------------------+----------------------------+----------------------------+
| Optimistic (versioning)    | Read-heavy, rare conflicts | Retries under contention   |
| Pessimistic (SELECT FOR UP)| Write-heavy, frequent conf | Lower throughput           |
| Advisory Locks             | Application-level locking  | Database dependency        |
+----------------------------+----------------------------+----------------------------+
| Two-Phase Commit           | Strong consistency needed  | Blocking, coordinator SPOF |
| Saga Pattern               | Microservices transactions | Eventual consistency only  |
+----------------------------+----------------------------+----------------------------+
| CRDTs                      | Multi-master replication   | Limited data types         |
| LWW-Register               | Simple conflict resolution | May lose concurrent writes |
+----------------------------+----------------------------+----------------------------+
| Idempotency Keys           | Exactly-once processing    | Storage for processed keys |
| Transactional Outbox       | Reliable message publishing| Outbox relay complexity    |
+----------------------------+----------------------------+----------------------------+

Decision Tree:
  Do you need strong consistency across services?
    YES --> 2PC (if latency is OK) or distributed lock
    NO  --> Saga pattern with eventual consistency

  How frequent are conflicts?
    Rare   --> Optimistic concurrency (version numbers)
    Common --> Pessimistic locking (SELECT FOR UPDATE)

  Do you need a distributed lock?
    Simple + fast --> Redis SETNX with TTL
    Fault-tolerant --> Redlock (5 nodes)
    Strong guarantees --> ZooKeeper
```
