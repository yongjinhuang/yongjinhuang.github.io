# Concurrency Fundamentals

The mental models you build here determine how well you reason about every other concurrency
topic. This file covers the foundational concepts that interviewers expect you to explain
clearly and precisely.

---

## Table of Contents

1. [Process vs Thread vs Coroutine](#1-process-vs-thread-vs-coroutine)
2. [Concurrency vs Parallelism](#2-concurrency-vs-parallelism)
3. [CPU-Bound vs I/O-Bound Workloads](#3-cpu-bound-vs-io-bound-workloads)
4. [Amdahl's Law](#4-amdahls-law)
5. [Thread Lifecycle States](#5-thread-lifecycle-states)
6. [Context Switching](#6-context-switching)
7. [User-Space vs Kernel-Space Threads](#7-user-space-vs-kernel-space-threads)
8. [Green Threads and Coroutines](#8-green-threads-and-coroutines)
9. [Memory Models: Shared Memory vs Message Passing](#9-memory-models-shared-memory-vs-message-passing)
10. [How the OS Schedules Threads](#10-how-the-os-schedules-threads)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Gotchas](#12-gotchas)
13. [Quick Reference](#13-quick-reference)

---

## 1. Process vs Thread vs Coroutine

### Process

A process is an **independent execution unit** with its own memory space, file descriptors,
and OS-level resources. Processes are isolated from each other by the operating system.

```
Process A                          Process B
+---------------------------+      +---------------------------+
| Code  | Data  | Heap      |      | Code  | Data  | Heap      |
|       |       |           |      |       |       |           |
| Stack | Files | Signals   |      | Stack | Files | Signals   |
+---------------------------+      +---------------------------+
| Virtual Memory Space      |      | Virtual Memory Space      |
| (completely separate)     |      | (completely separate)     |
+---------------------------+      +---------------------------+
```

**Key properties:**
- Own address space (memory isolation)
- Own file descriptor table
- Created via `fork()` (Unix) or `CreateProcess()` (Windows)
- Communication via IPC: pipes, sockets, shared memory, message queues
- Heavyweight: creation costs ~10ms, memory overhead ~MB

### Thread

A thread is a **lightweight execution unit** within a process. All threads in a process
share the same memory space but have their own stack and program counter.

```
Process
+--------------------------------------------------+
| Shared: Code | Data | Heap | Files               |
+--------------------------------------------------+
| Thread 1       | Thread 2       | Thread 3       |
| +------------+ | +------------+ | +------------+ |
| | Stack      | | | Stack      | | | Stack      | |
| | PC         | | | PC         | | | PC         | |
| | Registers  | | | Registers  | | | Registers  | |
| +------------+ | +------------+ | +------------+ |
+--------------------------------------------------+
```

**Key properties:**
- Share heap, code, data, and file descriptors with other threads
- Own stack, program counter, and register set
- Created via `pthread_create()` or `threading.Thread()` in Python
- Communication via shared memory (need synchronization)
- Lighter than processes: creation ~1ms, stack ~1-8MB

### Coroutine

A coroutine is a **user-space cooperative multitasking** unit. It is not managed by the OS
but by a runtime (event loop in Python, scheduler in Go).

```
Single OS Thread
+--------------------------------------------------+
| Event Loop / Scheduler                           |
|                                                  |
| Coroutine A    Coroutine B    Coroutine C        |
| [running]      [suspended]    [suspended]        |
|                                                  |
| A yields at await point...                       |
|                                                  |
| Coroutine A    Coroutine B    Coroutine C        |
| [suspended]    [running]      [suspended]        |
+--------------------------------------------------+
```

**Key properties:**
- Cooperative: must explicitly yield control (`await`, `yield`)
- No OS involvement in switching (no syscall overhead)
- Very lightweight: ~KB of memory per coroutine
- Cannot run in parallel on a single thread (but Go maps them to multiple threads)
- Python: `async def` coroutines; Go: goroutines (hybrid, M:N scheduled)

### Comparison Table

```
+---------------+----------+----------+-----------+
| Property      | Process  | Thread   | Coroutine |
+---------------+----------+----------+-----------+
| Memory        | Separate | Shared   | Shared    |
| Creation cost | ~10ms    | ~1ms     | ~1us      |
| Memory per    | ~MB      | ~1-8MB   | ~KB       |
| Scheduling    | OS       | OS       | User-space|
| Parallelism   | Yes      | Yes*     | No**      |
| Isolation     | Full     | None     | None      |
| Communication | IPC      | Shared   | Shared    |
|               |          | memory   | memory    |
+---------------+----------+----------+-----------+
* In Python, GIL prevents true parallel execution of threads
** Go goroutines CAN run in parallel (M:N scheduling)
```

### Python Example: All Three

```python
import multiprocessing
import threading
import asyncio
import os


def process_worker():
    """Runs in a separate process with its own memory space."""
    print(f"Process PID: {os.getpid()}")


def thread_worker():
    """Runs in a separate thread, shares memory with main thread."""
    print(f"Thread: {threading.current_thread().name}, PID: {os.getpid()}")


async def coroutine_worker():
    """Runs as a coroutine on the event loop, same thread."""
    print(f"Coroutine on thread: {threading.current_thread().name}")
    await asyncio.sleep(0)  # Yield control to event loop


def demonstrate_all():
    # Process: separate memory space
    proc = multiprocessing.Process(target=process_worker)
    proc.start()
    proc.join()

    # Thread: shared memory, OS-scheduled
    thread = threading.Thread(target=thread_worker, name="Worker-1")
    thread.start()
    thread.join()

    # Coroutine: cooperative, same thread
    asyncio.run(coroutine_worker())
```

---

## 2. Concurrency vs Parallelism

This is one of the most commonly confused concepts and a frequent interview question.

### Concurrency: Dealing with Multiple Things at Once

Concurrency is about **structure**. It means your program is designed to handle multiple
tasks that can make progress independently. Tasks may not actually run at the same time.

```
Concurrency (single core):
Time -->
Core 1: [A1][B1][A2][C1][B2][A3][C2][B3]

The CPU rapidly switches between tasks A, B, and C.
At any given instant, only ONE task is executing.
But all three make progress over time.
```

### Parallelism: Doing Multiple Things at Once

Parallelism is about **execution**. Multiple tasks literally execute simultaneously on
different processing units.

```
Parallelism (multi-core):
Time -->
Core 1: [A1][A2][A3][A4][A5]
Core 2: [B1][B2][B3][B4][B5]
Core 3: [C1][C2][C3][C4][C5]

Three tasks run literally at the same time on different cores.
```

### The Key Insight

```
+-------------------------------------------+
| Concurrency is about STRUCTURE            |
| Parallelism is about EXECUTION            |
|                                           |
| You can have concurrency without          |
| parallelism (single-core CPU)             |
|                                           |
| You can have parallelism without          |
| concurrency (SIMD instructions)           |
|                                           |
| Best programs have both: concurrent       |
| structure that executes in parallel       |
+-------------------------------------------+
```

Rob Pike's famous quote: "Concurrency is not parallelism. Concurrency is about dealing with
lots of things at once. Parallelism is about doing lots of things at once."

### Go Comparison

```go
// Go: concurrency with potential parallelism
// Goroutines are concurrent; GOMAXPROCS determines parallelism
func main() {
    runtime.GOMAXPROCS(4) // Use 4 OS threads

    // These goroutines are concurrent AND potentially parallel
    go taskA()
    go taskB()
    go taskC()
}
```

---

## 3. CPU-Bound vs I/O-Bound Workloads

Understanding this distinction determines which concurrency tool to use.

### CPU-Bound

The task spends most of its time doing computation. The CPU is the bottleneck.

```
CPU-Bound Task:
[COMPUTE][COMPUTE][COMPUTE][COMPUTE][COMPUTE]
^--- CPU is always busy, no waiting

Examples:
- Image processing, video encoding
- Cryptographic hashing
- Scientific simulation
- Machine learning training
- Compression/decompression
```

### I/O-Bound

The task spends most of its time waiting for external operations. The CPU is idle.

```
I/O-Bound Task:
[request]---------[response][process][request]---------[response]
          ^ WAITING                           ^ WAITING

Examples:
- HTTP API calls
- Database queries
- File system reads/writes
- Network socket communication
- User input waiting
```

### Why This Matters for Python

```
CPU-Bound + Python Threading:
Thread 1: [COMPUTE]--[GIL wait]--[COMPUTE]--[GIL wait]
Thread 2: --[GIL wait]--[COMPUTE]--[GIL wait]--[COMPUTE]
Result:   NO speedup! Threads take turns due to GIL.

CPU-Bound + Python multiprocessing:
Process 1: [COMPUTE][COMPUTE][COMPUTE]   (own GIL)
Process 2: [COMPUTE][COMPUTE][COMPUTE]   (own GIL)
Result:    True parallelism! Each process has its own GIL.

I/O-Bound + Python Threading:
Thread 1: [req]---[waiting, GIL released]---[resp]
Thread 2: ---[req]---[waiting, GIL released]---[resp]
Result:   Speedup! GIL is released during I/O wait.

I/O-Bound + Python asyncio:
Coroutine 1: [req]---[await, suspended]---[resp]
Coroutine 2: ---[req]---[await, suspended]---[resp]
Result:       Speedup! Even more efficient than threads (no OS overhead).
```

```python
import time
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor


def cpu_bound_task(n: int) -> int:
    """Simulate CPU-bound work: compute sum of squares."""
    total = 0
    for i in range(n):
        total += i * i
    return total


def io_bound_task(seconds: float) -> str:
    """Simulate I/O-bound work: wait for external resource."""
    time.sleep(seconds)
    return "done"


def benchmark_cpu_bound():
    tasks = [10_000_000] * 4

    # Sequential
    start = time.time()
    results = [cpu_bound_task(t) for t in tasks]
    sequential_time = time.time() - start

    # Threads (no speedup due to GIL)
    start = time.time()
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(cpu_bound_task, tasks))
    thread_time = time.time() - start

    # Processes (true parallelism)
    start = time.time()
    with ProcessPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(cpu_bound_task, tasks))
    process_time = time.time() - start

    print(f"CPU-bound: Sequential={sequential_time:.2f}s, "
          f"Threads={thread_time:.2f}s, Processes={process_time:.2f}s")
    # Typical output: Sequential=4.2s, Threads=4.5s, Processes=1.3s


def benchmark_io_bound():
    tasks = [0.5] * 8

    # Sequential
    start = time.time()
    results = [io_bound_task(t) for t in tasks]
    sequential_time = time.time() - start

    # Threads (big speedup)
    start = time.time()
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(io_bound_task, tasks))
    thread_time = time.time() - start

    print(f"I/O-bound: Sequential={sequential_time:.2f}s, "
          f"Threads={thread_time:.2f}s")
    # Typical output: Sequential=4.0s, Threads=0.5s
```

---

## 4. Amdahl's Law

Amdahl's Law quantifies the theoretical maximum speedup from parallelizing a program.

### The Formula

```
                    1
Speedup = ---------------------
          (1 - P) + (P / N)

Where:
  P = fraction of program that can be parallelized (0 to 1)
  N = number of processors/cores
  (1 - P) = fraction that must remain sequential
```

### Visual Intuition

```
Program with P = 0.75 (75% parallelizable):

Sequential:  [SERIAL 25%][------PARALLEL 75%------]  = 100% time

2 cores:     [SERIAL 25%][--PAR 37.5%--]              = 62.5% time  (1.6x)
                          [--PAR 37.5%--]

4 cores:     [SERIAL 25%][-PAR 18.75%-]               = 43.75% time (2.3x)
                          [-PAR 18.75%-]
                          [-PAR 18.75%-]
                          [-PAR 18.75%-]

inf cores:   [SERIAL 25%]                             = 25% time    (4x MAX)

The serial portion is the BOTTLENECK. No matter how many cores,
you cannot go faster than the sequential part.
```

### Practical Implications

```
+-------------------+-------+-------+-------+-------+--------+
| Parallelizable    | N=2   | N=4   | N=8   | N=16  | N=inf  |
| Fraction (P)      |       |       |       |       |        |
+-------------------+-------+-------+-------+-------+--------+
| 50%               | 1.33x | 1.60x | 1.78x | 1.88x | 2.00x  |
| 75%               | 1.60x | 2.29x | 2.91x | 3.37x | 4.00x  |
| 90%               | 1.82x | 3.08x | 4.71x | 6.40x | 10.00x |
| 95%               | 1.90x | 3.48x | 5.93x | 9.14x | 20.00x |
| 99%               | 1.98x | 3.88x | 7.48x |13.91x |100.00x |
+-------------------+-------+-------+-------+-------+--------+

Key takeaway: Even with infinite cores, if 5% of your code is
sequential, the maximum speedup is only 20x.
```

### Interview Application

When asked "How much faster will this be with N threads?", do not just say "N times faster."
Apply Amdahl's Law:

1. Identify the sequential portions (initialization, aggregation, I/O serialization)
2. Estimate P (the parallelizable fraction)
3. Calculate the theoretical max speedup
4. Mention overhead (thread creation, synchronization) reduces actual speedup further

---

## 5. Thread Lifecycle States

Every thread transitions through a well-defined set of states. Interviewers often ask you
to draw or describe this state machine.

```
                    +-------------------+
                    |      NEW          |
                    | (Thread created,  |
                    |  not yet started) |
                    +--------+----------+
                             |
                        start()
                             |
                             v
               +-------------+-------------+
               |         RUNNABLE          |
               | (Ready to run, waiting    |
               |  for CPU to schedule it)  |
               +---+-------------------+---+
                   |                   |
             OS schedules         OS preempts or
              this thread          yield()/sleep()
                   |                   |
                   v                   |
          +--------+--------+          |
          |     RUNNING     |----------+
          | (Actively        |
          |  executing on    |
          |  a CPU core)     |
          +---+----+----+---+
              |    |    |
              |    |    +-- I/O request or lock.acquire()
              |    |                    |
              |    |                    v
              |    |        +-----------+-----------+
              |    |        |       BLOCKED /       |
              |    |        |       WAITING         |
              |    |        | (Waiting for I/O,     |
              |    |        |  lock, condition,     |
              |    |        |  sleep, join)         |
              |    |        +-----------+-----------+
              |    |                    |
              |    |              I/O complete or
              |    |              lock acquired or
              |    |              notify() received
              |    |                    |
              |    |                    v
              |    |            Back to RUNNABLE
              |    |
              |    +-- run() completes
              |                |
              v                v
          +--------------------+
          |     TERMINATED     |
          | (Thread finished,  |
          |  cannot restart)   |
          +--------------------+
```

### Python Thread States

```python
import threading
import time


def demonstrate_thread_states():
    def worker():
        # Thread is RUNNING here
        time.sleep(1)  # Thread moves to BLOCKED/WAITING
        # Thread is RUNNING again when sleep completes

    thread = threading.Thread(target=worker)
    # Thread is in NEW state

    thread.start()
    # Thread moves to RUNNABLE, then RUNNING

    print(f"Thread alive: {thread.is_alive()}")  # True (RUNNING or RUNNABLE)

    thread.join()
    # Thread is now TERMINATED

    print(f"Thread alive: {thread.is_alive()}")  # False (TERMINATED)
```

---

## 6. Context Switching

A context switch occurs when the OS saves the state of one thread and loads the state of
another. Understanding the cost is critical for performance reasoning.

### What Gets Saved/Restored

```
Thread Context (saved on switch):
+----------------------------------+
| Program Counter (PC)             |  Where was I in the code?
| Stack Pointer (SP)               |  Where is my stack?
| CPU Registers (general purpose)  |  What values was I working with?
| Floating-point registers         |  FP computation state
| Status flags (EFLAGS)            |  Comparison results, etc.
| Thread-local storage pointer     |  Per-thread data
+----------------------------------+

What also gets disrupted:
+----------------------------------+
| CPU cache (L1, L2, L3)          |  Cache lines likely evicted
| TLB (Translation Lookaside Buf) |  Virtual memory mappings flushed
| Branch predictor state           |  Prediction history lost
+----------------------------------+
```

### Cost Breakdown

```
Direct cost (saving/restoring registers):     ~1-5 microseconds
Indirect cost (cache pollution):              ~5-50 microseconds
Total effective cost per context switch:      ~5-50 microseconds

For comparison:
  L1 cache hit:       ~1 nanosecond
  L2 cache hit:       ~5 nanoseconds
  Main memory access: ~100 nanoseconds
  Context switch:     ~5,000-50,000 nanoseconds (5-50 us)
  SSD read:           ~100,000 nanoseconds (100 us)
```

### Why Coroutines Are Cheaper

```
Thread Context Switch (OS-level):
1. Trap to kernel mode          (expensive)
2. Save all CPU registers       (moderate)
3. Update scheduler data        (moderate)
4. Select next thread           (moderate)
5. Restore registers            (moderate)
6. Return to user mode          (expensive)
7. Cache warming                (very expensive)
Total: ~5-50 microseconds

Coroutine Switch (user-space):
1. Save instruction pointer     (cheap)
2. Save local variables         (cheap, only a few)
3. Resume next coroutine        (cheap)
Total: ~0.1-1 microseconds (10-100x cheaper)
```

### Implications for Design

```python
# BAD: Creating a thread per request (10,000 concurrent requests)
# Each thread: ~8MB stack + context switch overhead
# Total: ~80GB memory, massive context switching

# BETTER: Thread pool with limited threads
from concurrent.futures import ThreadPoolExecutor

pool = ThreadPoolExecutor(max_workers=100)
# 100 threads, manageable context switching

# BEST: Coroutines for I/O-bound work
import asyncio

async def handle_request(request):
    result = await fetch_from_db(request)
    return result

# 10,000 coroutines: ~10MB memory, near-zero switching cost
```

---

## 7. User-Space vs Kernel-Space Threads

### Kernel-Space Threads (1:1 Model)

Each user thread maps to exactly one kernel thread. The OS kernel is aware of and schedules
every thread.

```
User Space:    Thread A    Thread B    Thread C
                  |           |           |
               (1:1 mapping)
                  |           |           |
Kernel Space:  KThread A   KThread B   KThread C
                  |           |           |
CPU Cores:     [Core 0]    [Core 1]    [Core 0]
```

**Used by:** Python `threading`, Java `Thread`, C `pthread`

**Pros:** True parallelism, OS handles scheduling, preemptive
**Cons:** Expensive creation (~1ms), heavy (MB of stack), context switch requires syscall

### User-Space Threads (N:1 Model)

Multiple user threads map to a single kernel thread. A user-space scheduler manages them.

```
User Space:    Thread A   Thread B   Thread C   Thread D
                  \         |          |         /
                   (N:1 mapping, user scheduler)
                          |
Kernel Space:          KThread X
                          |
CPU Cores:            [Core 0]
```

**Used by:** Early Java green threads, some coroutine libraries

**Pros:** Very fast creation/switching, no syscall needed
**Cons:** No true parallelism, one blocking call blocks ALL threads

### Hybrid Model (M:N)

M user-space threads map to N kernel threads. A runtime scheduler distributes work.

```
User Space:    G1  G2  G3  G4  G5  G6  G7  G8
                \  |   |  / \  |   |  /
                 (M:N scheduling)
                /       |       \
Kernel Space: KThread1  KThread2  KThread3
                |         |         |
CPU Cores:   [Core 0]  [Core 1]  [Core 2]
```

**Used by:** Go goroutines (this is the GMP model), Erlang processes, Rust tokio

**Pros:** Best of both: lightweight AND truly parallel
**Cons:** Complex runtime, harder to debug, potential scheduling issues

---

## 8. Green Threads and Coroutines

### Green Threads

Green threads are threads managed entirely in user space, not by the OS. The term comes
from the original Java green thread implementation.

```
+--------------------------------------------+
| Runtime / Virtual Machine                  |
|                                            |
| Green     Green     Green     Green        |
| Thread 1  Thread 2  Thread 3  Thread 4     |
|   |          |          |          |       |
|   +-----+----+----+-----+----+----+       |
|         |         |         |              |
|    OS Thread A  OS Thread B  (if M:N)     |
+--------------------------------------------+
```

### Coroutines vs Green Threads

```
+--------------------+-------------------------+-------------------------+
| Property           | Coroutines              | Green Threads           |
+--------------------+-------------------------+-------------------------+
| Scheduling         | Cooperative (explicit   | Can be preemptive       |
|                    | yield/await)            | (runtime decides)       |
| Parallelism        | Usually no (single OS   | Possible (M:N model)    |
|                    | thread)                 |                         |
| Syntax             | async/await keywords    | Looks like regular      |
|                    |                         | threading code          |
| Examples           | Python asyncio, JS      | Go goroutines, Erlang   |
|                    | async/await             | processes               |
+--------------------+-------------------------+-------------------------+
```

### Python asyncio Coroutines

```python
import asyncio


async def coroutine_example():
    """This is a coroutine. It runs on a single OS thread."""
    print("Start")
    await asyncio.sleep(1)  # Cooperative yield point
    print("End")


async def main():
    # These coroutines run concurrently on ONE thread
    # They interleave at await points
    await asyncio.gather(
        coroutine_example(),
        coroutine_example(),
        coroutine_example(),
    )

# Only one OS thread is used for all three coroutines
asyncio.run(main())
```

### Go Goroutines (M:N Green Threads)

```go
package main

import (
    "fmt"
    "runtime"
    "sync"
)

func main() {
    runtime.GOMAXPROCS(4) // Use 4 OS threads

    var wg sync.WaitGroup

    // Launch 1000 goroutines, distributed across 4 OS threads
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            fmt.Printf("Goroutine %d on OS thread\n", id)
        }(i)
    }

    wg.Wait()
}
// 1000 goroutines, only 4 OS threads, true parallelism
```

---

## 9. Memory Models: Shared Memory vs Message Passing

The two fundamental approaches to concurrent communication.

### Shared Memory

Threads communicate by reading and writing to shared variables. Requires synchronization
(locks, atomics) to prevent data races.

```
Shared Memory Model:
+------------------+
| Shared State     |
| (heap memory)    |
|                  |
| counter = 42     |
| data = [...]     |
+--------+---------+
   |     |     |
   v     v     v
Thread  Thread Thread
  A       B      C

All threads can read/write the shared state.
Must use locks to prevent corruption.
```

```python
import threading


class SharedCounter:
    """Shared memory model: threads share a counter variable."""

    def __init__(self):
        self._count = 0
        self._lock = threading.Lock()

    def increment(self) -> None:
        with self._lock:
            self._count += 1

    def get(self) -> int:
        with self._lock:
            return self._count


def shared_memory_example():
    counter = SharedCounter()
    threads = []

    for _ in range(10):
        t = threading.Thread(target=lambda: [counter.increment() for _ in range(1000)])
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print(f"Counter: {counter.get()}")  # Always 10000
```

### Message Passing

Threads (or processes) communicate by sending messages through channels or queues. No shared
state. Each thread owns its data exclusively.

```
Message Passing Model:
Thread A           Channel/Queue          Thread B
+--------+        +------------+         +--------+
| owns   |--send->|  message   |--recv-->| owns   |
| data_a |        |  queue     |         | data_b |
+--------+        +------------+         +--------+

No shared state. Data is TRANSFERRED, not shared.
"Don't communicate by sharing memory; share memory by communicating." - Go proverb
```

```python
import queue
import threading


def message_passing_example():
    """Message passing model: threads communicate via queues."""
    channel: queue.Queue[int] = queue.Queue()

    def producer(ch: queue.Queue[int]) -> None:
        for i in range(10):
            ch.put(i)  # Send message
        ch.put(-1)  # Sentinel

    def consumer(ch: queue.Queue[int]) -> None:
        total = 0
        while True:
            msg = ch.get()  # Receive message
            if msg == -1:
                break
            total += msg
        print(f"Sum: {total}")  # 45

    t1 = threading.Thread(target=producer, args=(channel,))
    t2 = threading.Thread(target=consumer, args=(channel,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
```

### Comparison

```
+------------------+-----------------------------+-----------------------------+
| Aspect           | Shared Memory               | Message Passing             |
+------------------+-----------------------------+-----------------------------+
| Communication    | Read/write shared variables  | Send/receive messages       |
| Synchronization  | Locks, atomics, barriers     | Channels, queues            |
| Data races       | Possible (need careful sync) | Impossible (no shared data) |
| Performance      | Fast (no copy)               | Copy overhead               |
| Debugging        | Hard (non-deterministic)     | Easier (deterministic flow) |
| Scalability      | Limited (lock contention)    | Better (no contention)      |
| Languages        | Python, Java, C/C++          | Go, Erlang, Rust            |
+------------------+-----------------------------+-----------------------------+
```

---

## 10. How the OS Schedules Threads

### The Scheduler's Job

The OS scheduler decides which thread runs on which core and for how long. Modern operating
systems use **preemptive, priority-based scheduling**.

```
OS Scheduler Overview:

Ready Queue (priority ordered):
+---------+---------+---------+---------+---------+
| Thread  | Thread  | Thread  | Thread  | Thread  |
| P=high  | P=high  | P=med   | P=med   | P=low   |
+---------+---------+---------+---------+---------+
     |
     v
+----------+    +----------+    +----------+
| Core 0   |    | Core 1   |    | Core 2   |
| [running |    | [running |    | [idle]   |
|  T_high] |    |  T_high] |    |          |
+----------+    +----------+    +----------+

The scheduler:
1. Picks highest-priority runnable thread
2. Assigns it to an available core
3. Sets a time quantum (time slice)
4. When quantum expires, preempts and picks next thread
```

### Time Slicing (Round Robin)

```
4 threads, 2 cores, 10ms time quantum:

Time:  0   10  20  30  40  50  60  70  80ms
Core0: [T1][T3][T1][T3][T1][T3][T1]
Core1: [T2][T4][T2][T4][T2][T4][T2]

Each thread gets 10ms, then is preempted.
Threads "rotate" through the cores.
```

### Common Scheduling Algorithms

```
+---------------------------+-------------------------------------------+
| Algorithm                 | Description                               |
+---------------------------+-------------------------------------------+
| Round Robin (RR)          | Each thread gets fixed time slice, then   |
|                           | goes to back of queue. Fair but overhead.  |
+---------------------------+-------------------------------------------+
| Completely Fair Scheduler | Linux default. Tracks virtual runtime.    |
| (CFS)                    | Thread with least runtime runs next.      |
+---------------------------+-------------------------------------------+
| Multilevel Feedback Queue | Multiple priority queues. Threads move    |
| (MLFQ)                   | between queues based on behavior.         |
+---------------------------+-------------------------------------------+
| Priority Scheduling       | Highest-priority thread always runs.      |
|                           | Risk of starvation for low-priority.      |
+---------------------------+-------------------------------------------+
| Work Stealing             | Idle cores "steal" tasks from busy cores. |
|                           | Used by Go runtime, Java ForkJoinPool.    |
+---------------------------+-------------------------------------------+
```

### Go's GMP Scheduler Model

```
Go's M:N Scheduler (GMP Model):

G = Goroutine (user-level task)
M = Machine (OS thread)
P = Processor (logical CPU, holds run queue)

+------+  +------+  +------+
| P0   |  | P1   |  | P2   |
| +--+ |  | +--+ |  | +--+ |
| |G1| |  | |G4| |  | |G7| |
| |G2| |  | |G5| |  | |G8| |
| |G3| |  | |G6| |  |      |
| +--+ |  | +--+ |  | +--+ |
+--+---+  +--+---+  +--+---+
   |         |         |
+--+---+  +--+---+  +--+---+
| M0   |  | M1   |  | M2   |
| (OS  |  | (OS  |  | (OS  |
| thrd)|  | thrd)|  | thrd)|
+------+  +------+  +------+

- Each P has a local run queue of goroutines
- Each M is bound to a P and executes goroutines from P's queue
- When P's queue is empty, M steals goroutines from another P (work stealing)
- When a goroutine blocks (syscall), M releases P so another M can use it
```

---

## 11. Common Interview Questions

1. **What is the difference between concurrency and parallelism?**
   Concurrency is structural (handling multiple things), parallelism is execution (doing
   multiple things simultaneously). You can have concurrency without parallelism.

2. **When would you use processes vs threads vs coroutines?**
   Processes for CPU-bound isolation, threads for I/O-bound with shared state, coroutines
   for high-concurrency I/O-bound with minimal overhead.

3. **What is Amdahl's Law and why does it matter?**
   It limits maximum speedup based on the sequential fraction. Even 5% sequential code
   caps speedup at 20x regardless of core count.

4. **What is a context switch and why is it expensive?**
   Saving/restoring thread state plus cache invalidation. Direct cost ~5us, but cache
   warming can add 10-50us. Coroutines avoid kernel involvement.

5. **Explain shared memory vs message passing. Which is better?**
   Neither is universally better. Shared memory is faster (no copy) but harder to reason
   about. Message passing eliminates data races but has copy overhead. Choose based on
   your coordination needs.

6. **How does Go's scheduler differ from Python's threading?**
   Go uses M:N scheduling (many goroutines on few OS threads) with work stealing. Python
   uses 1:1 kernel threads with the GIL serializing CPU-bound work.

---

## 12. Gotchas

- **Python threads DO run in parallel for I/O.** The GIL is released during I/O operations.
  Do not say "Python threads are useless" in an interview. They are useful for I/O-bound work.

- **More threads does not mean more speed.** Beyond the number of cores, adding threads for
  CPU-bound work only adds context-switch overhead. For I/O-bound work, the limit is usually
  the number of concurrent connections the target can handle.

- **Amdahl's Law assumes fixed problem size.** Gustafson's Law (not covered here) argues that
  as you add cores, you also increase problem size, giving better scaling.

- **Coroutines are NOT threads.** A coroutine that does CPU-bound work without yielding will
  block the entire event loop. Always use `run_in_executor` for CPU work in async code.

- **Process creation is expensive but memory is copy-on-write.** On Linux, `fork()` does not
  immediately copy all memory. Pages are shared until one process writes, then that page is
  copied. This makes `fork()` cheaper than you might expect.

- **Thread stacks are allocated virtually, not physically.** A thread with an 8MB stack does
  not use 8MB of RAM immediately. Physical pages are allocated on demand as the stack grows.

---

## 13. Quick Reference

```
+---------------------+----------------------------+----------------------------+
| Concept             | Key Point                  | Interview Tip              |
+---------------------+----------------------------+----------------------------+
| Process             | Separate memory space,     | Use for CPU-bound work     |
|                     | heavy, isolated             | in Python (bypass GIL)     |
+---------------------+----------------------------+----------------------------+
| Thread              | Shared memory, OS-sched,   | Use for I/O-bound work     |
|                     | preemptive, ~1MB stack      | in Python                  |
+---------------------+----------------------------+----------------------------+
| Coroutine           | User-space, cooperative,   | Use for high-concurrency   |
|                     | ~KB memory, single thread   | I/O (asyncio, goroutines)  |
+---------------------+----------------------------+----------------------------+
| Concurrency         | Structural: dealing with   | Not the same as            |
|                     | multiple things at once     | parallelism                |
+---------------------+----------------------------+----------------------------+
| Parallelism         | Execution: doing multiple  | Requires multiple cores    |
|                     | things at once              | or processors              |
+---------------------+----------------------------+----------------------------+
| Amdahl's Law        | Speedup = 1/((1-P)+P/N)   | Serial fraction is the     |
|                     |                            | bottleneck                 |
+---------------------+----------------------------+----------------------------+
| Context Switch      | Save/restore thread state  | ~5-50us including cache    |
|                     | + cache invalidation        | warming                    |
+---------------------+----------------------------+----------------------------+
| 1:1 Model           | Each user thread = 1 OS    | Python, Java, C pthreads   |
|                     | thread                      |                            |
+---------------------+----------------------------+----------------------------+
| M:N Model           | M user threads on N OS     | Go goroutines, Erlang      |
|                     | threads                     | processes                  |
+---------------------+----------------------------+----------------------------+
| Shared Memory       | Communicate by sharing     | Fast but needs locks       |
|                     | variables                   |                            |
+---------------------+----------------------------+----------------------------+
| Message Passing     | Share by communicating     | No data races, copy cost   |
|                     | (channels/queues)           |                            |
+---------------------+----------------------------+----------------------------+

Decision Matrix:
+------------------+----------------+----------------+
| Workload         | Python         | Go             |
+------------------+----------------+----------------+
| CPU-bound        | multiprocessing| goroutines     |
| I/O-bound (few)  | threading      | goroutines     |
| I/O-bound (many) | asyncio        | goroutines     |
| Mixed            | ProcessPool +  | goroutines     |
|                  | async per proc |                |
+------------------+----------------+----------------+
```
