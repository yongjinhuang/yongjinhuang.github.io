# Go Concurrency Model

Go's concurrency model is fundamentally different from Python's and is frequently asked
about in interviews, even at companies that do not use Go. The "share by communicating"
philosophy, goroutines, and channels represent a distinct approach to concurrent programming
that every senior engineer should understand.

---

## Table of Contents

1. [Goroutines](#1-goroutines)
2. [Channels](#2-channels)
3. [Select Statement](#3-select-statement)
4. [sync Package](#4-sync-package)
5. [Common Concurrency Patterns](#5-common-concurrency-patterns)
6. [Context Package](#6-context-package)
7. [Data Race Detection](#7-data-race-detection)
8. [Goroutine Leaks](#8-goroutine-leaks)
9. [Go vs Python Concurrency](#9-go-vs-python-concurrency)
10. [Complete Examples](#10-complete-examples)
11. [Common Interview Questions](#11-common-interview-questions)
12. [Gotchas](#12-gotchas)
13. [Quick Reference](#13-quick-reference)

---

## 1. Goroutines

Goroutines are Go's lightweight threads. They are multiplexed onto OS threads by Go's
runtime scheduler (M:N scheduling model).

### Key Properties

```
Goroutine vs OS Thread:
+-------------------+-------------------+-------------------+
| Property          | Goroutine         | OS Thread         |
+-------------------+-------------------+-------------------+
| Stack size        | 2 KB (growable)   | 1-8 MB (fixed)    |
| Creation cost     | ~0.3 us           | ~1000 us          |
| Context switch    | ~0.2 us           | ~5-50 us          |
| Scheduling        | Go runtime (M:N)  | OS kernel (1:1)   |
| Max practical     | 100K - 1M+        | ~10K               |
+-------------------+-------------------+-------------------+
```

### Basic Goroutine

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

func worker(id int, wg *sync.WaitGroup) {
    defer wg.Done() // Signal completion when function returns
    fmt.Printf("Worker %d starting\n", id)
    time.Sleep(100 * time.Millisecond) // Simulate work
    fmt.Printf("Worker %d done\n", id)
}

func main() {
    var wg sync.WaitGroup

    for i := 0; i < 5; i++ {
        wg.Add(1)
        go worker(i, &wg) // Launch goroutine
    }

    wg.Wait() // Block until all goroutines complete
    fmt.Println("All workers done")
}
```

### GMP Scheduler Model

```
G = Goroutine (user-space thread)
M = Machine  (OS thread)
P = Processor (execution context, holds run queue)

+--------+    +--------+    +--------+
|   P0   |    |   P1   |    |   P2   |
|        |    |        |    |        |
| Local  |    | Local  |    | Local  |
| Queue: |    | Queue: |    | Queue: |
| G1,G2  |    | G4,G5  |    | G7     |
| G3     |    | G6     |    |        |
+---+----+    +---+----+    +---+----+
    |             |             |
+---+----+    +---+----+    +---+----+
|   M0   |    |   M1   |    |   M2   |
|(OS thd)|    |(OS thd)|    |(OS thd)|
+--------+    +--------+    +--------+

                +------------+
                | Global     |
                | Run Queue: |
                | G8, G9     |
                +------------+

When P's local queue is empty:
1. Check global queue
2. Steal from another P's local queue (work stealing)

When a goroutine blocks on syscall:
1. M releases P
2. Another M picks up P
3. Blocked M waits for syscall, then G returns to a P's queue
```

---

## 2. Channels

Channels are Go's primary mechanism for communication between goroutines. They enforce
the principle: "Don't communicate by sharing memory; share memory by communicating."

### Unbuffered Channels

```go
// Unbuffered channel: sender blocks until receiver is ready (synchronous)
func unbufferedExample() {
    ch := make(chan int) // Unbuffered

    go func() {
        ch <- 42 // Blocks until someone receives
    }()

    value := <-ch // Blocks until someone sends
    fmt.Println(value) // 42
}
```

### Buffered Channels

```go
// Buffered channel: sender blocks only when buffer is full (async up to buffer size)
func bufferedExample() {
    ch := make(chan int, 3) // Buffer size 3

    ch <- 1 // Does not block (buffer has space)
    ch <- 2 // Does not block
    ch <- 3 // Does not block
    // ch <- 4 // Would block! Buffer is full.

    fmt.Println(<-ch) // 1
    fmt.Println(<-ch) // 2
    fmt.Println(<-ch) // 3
}
```

### Directional Channels

```go
// Send-only channel: chan<- T
// Receive-only channel: <-chan T
// Bidirectional: chan T

func producer(out chan<- int) {
    for i := 0; i < 10; i++ {
        out <- i
    }
    close(out) // Signal no more values
}

func consumer(in <-chan int) {
    for val := range in { // Iterates until channel is closed
        fmt.Println(val)
    }
}

func main() {
    ch := make(chan int, 5)
    go producer(ch)
    consumer(ch)
}
```

### Comparison with Python

```
Go Channel                          Python Equivalent
-----------                         -----------------
ch := make(chan int)                 q = queue.Queue(maxsize=0)  (unbounded)
ch := make(chan int, 5)             q = queue.Queue(maxsize=5)
ch <- value                         q.put(value)
value := <-ch                       value = q.get()
close(ch)                           q.put(None)  (sentinel)
for v := range ch                   while (v := q.get()) is not None
```

---

## 3. Select Statement

The `select` statement multiplexes communication operations on multiple channels. It is
analogous to a `switch` statement but for channel operations.

### Basic Select

```go
func selectExample() {
    ch1 := make(chan string)
    ch2 := make(chan string)

    go func() {
        time.Sleep(100 * time.Millisecond)
        ch1 <- "from ch1"
    }()

    go func() {
        time.Sleep(200 * time.Millisecond)
        ch2 <- "from ch2"
    }()

    // select blocks until ONE case is ready
    select {
    case msg1 := <-ch1:
        fmt.Println(msg1)
    case msg2 := <-ch2:
        fmt.Println(msg2)
    }
}
```

### Timeout with Select

```go
func withTimeout() {
    ch := make(chan string)

    go func() {
        time.Sleep(5 * time.Second)
        ch <- "result"
    }()

    select {
    case result := <-ch:
        fmt.Println("Got:", result)
    case <-time.After(2 * time.Second):
        fmt.Println("Timeout!")
    }
}
```

### Non-Blocking with Default

```go
func nonBlocking() {
    ch := make(chan int, 1)

    // Non-blocking send
    select {
    case ch <- 42:
        fmt.Println("Sent")
    default:
        fmt.Println("Channel full, skipping")
    }

    // Non-blocking receive
    select {
    case val := <-ch:
        fmt.Println("Received:", val)
    default:
        fmt.Println("No data available")
    }
}
```

---

## 4. sync Package

Go's `sync` package provides traditional synchronization primitives alongside channels.

### Mutex and RWMutex

```go
type SafeCounter struct {
    mu    sync.Mutex
    count int
}

func (c *SafeCounter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}

func (c *SafeCounter) Get() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.count
}

// RWMutex: multiple readers OR single writer
type Config struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *Config) Get(key string) string {
    c.mu.RLock()         // Multiple goroutines can read simultaneously
    defer c.mu.RUnlock()
    return c.data[key]
}

func (c *Config) Set(key, value string) {
    c.mu.Lock()          // Exclusive access for writes
    defer c.mu.Unlock()
    c.data[key] = value
}
```

### WaitGroup

```go
func waitGroupExample() {
    var wg sync.WaitGroup

    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            fmt.Printf("Task %d complete\n", id)
        }(i)
    }

    wg.Wait() // Block until counter reaches 0
}
```

### Once (Thread-Safe Initialization)

```go
type Database struct {
    once sync.Once
    conn *sql.DB
}

func (db *Database) GetConnection() *sql.DB {
    db.once.Do(func() {
        // This function runs EXACTLY once, even with concurrent calls
        db.conn, _ = sql.Open("postgres", "connection-string")
    })
    return db.conn
}
```

### Pool (Object Reuse)

```go
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 1024) // Create new buffer if pool is empty
    },
}

func processRequest() {
    buf := bufferPool.Get().([]byte) // Get buffer from pool (or create new)
    defer bufferPool.Put(buf)        // Return to pool when done

    // Use buffer...
}
```

### sync.Map (Concurrent Map)

```go
func syncMapExample() {
    var m sync.Map

    // Store
    m.Store("key1", "value1")
    m.Store("key2", "value2")

    // Load
    if val, ok := m.Load("key1"); ok {
        fmt.Println(val)
    }

    // LoadOrStore (get existing or store new)
    actual, loaded := m.LoadOrStore("key3", "value3")
    // loaded=false means we stored a new value

    // Range (iterate)
    m.Range(func(key, value interface{}) bool {
        fmt.Printf("%s: %s\n", key, value)
        return true // return false to stop iteration
    })
}
```

---

## 5. Common Concurrency Patterns

### Fan-Out, Fan-In

```go
// Fan-out: one channel distributes work to multiple goroutines
// Fan-in: multiple channels merge into one

func fanOutFanIn() {
    jobs := make(chan int, 100)
    results := make(chan int, 100)

    // Fan-out: 3 workers read from the same jobs channel
    var wg sync.WaitGroup
    for w := 0; w < 3; w++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            for job := range jobs {
                results <- job * job // Process and send result
            }
        }(w)
    }

    // Send jobs
    go func() {
        for i := 0; i < 20; i++ {
            jobs <- i
        }
        close(jobs) // Signal no more jobs
    }()

    // Close results when all workers are done
    go func() {
        wg.Wait()
        close(results)
    }()

    // Fan-in: collect all results
    for result := range results {
        fmt.Println(result)
    }
}
```

### Pipeline

```go
func pipeline() {
    // Stage 1: Generate numbers
    gen := func(nums ...int) <-chan int {
        out := make(chan int)
        go func() {
            for _, n := range nums {
                out <- n
            }
            close(out)
        }()
        return out
    }

    // Stage 2: Square numbers
    square := func(in <-chan int) <-chan int {
        out := make(chan int)
        go func() {
            for n := range in {
                out <- n * n
            }
            close(out)
        }()
        return out
    }

    // Stage 3: Double numbers
    double := func(in <-chan int) <-chan int {
        out := make(chan int)
        go func() {
            for n := range in {
                out <- n * 2
            }
            close(out)
        }()
        return out
    }

    // Connect pipeline: gen -> square -> double
    ch := double(square(gen(1, 2, 3, 4, 5)))
    for result := range ch {
        fmt.Println(result) // 2, 8, 18, 32, 50
    }
}
```

### Worker Pool

```go
func workerPool() {
    const numWorkers = 5
    jobs := make(chan int, 100)
    results := make(chan string, 100)

    // Start workers
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            for job := range jobs {
                time.Sleep(50 * time.Millisecond) // Simulate work
                results <- fmt.Sprintf("Worker %d processed job %d", workerID, job)
            }
        }(i)
    }

    // Send jobs
    go func() {
        for i := 0; i < 20; i++ {
            jobs <- i
        }
        close(jobs)
    }()

    // Collect results
    go func() {
        wg.Wait()
        close(results)
    }()

    for result := range results {
        fmt.Println(result)
    }
}
```

### Rate Limiter

```go
func rateLimiter() {
    // Token bucket rate limiter using a ticker
    limiter := time.NewTicker(100 * time.Millisecond) // 10 requests per second
    defer limiter.Stop()

    requests := make(chan int, 5)
    go func() {
        for i := 0; i < 10; i++ {
            requests <- i
        }
        close(requests)
    }()

    for req := range requests {
        <-limiter.C // Wait for next tick (rate limit)
        fmt.Printf("Processing request %d at %s\n", req, time.Now().Format("15:04:05.000"))
    }
}
```

---

## 6. Context Package

Go's `context` package provides cancellation propagation, deadlines, and request-scoped
values. It is essential for writing well-behaved concurrent Go programs.

### Cancellation

```go
func contextCancellation() {
    ctx, cancel := context.WithCancel(context.Background())

    go func() {
        for {
            select {
            case <-ctx.Done():
                fmt.Println("Worker: cancelled, cleaning up")
                return
            default:
                fmt.Println("Worker: doing work")
                time.Sleep(500 * time.Millisecond)
            }
        }
    }()

    time.Sleep(2 * time.Second)
    cancel() // Signal all goroutines using this context to stop
    time.Sleep(100 * time.Millisecond) // Wait for cleanup
}
```

### Timeout

```go
func contextTimeout() {
    // Context automatically cancels after 3 seconds
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()

    select {
    case result := <-longOperation(ctx):
        fmt.Println("Got result:", result)
    case <-ctx.Done():
        fmt.Println("Operation timed out:", ctx.Err())
    }
}

func longOperation(ctx context.Context) <-chan string {
    ch := make(chan string)
    go func() {
        // Check context periodically during long operations
        for i := 0; i < 10; i++ {
            select {
            case <-ctx.Done():
                return // Stop if context is cancelled
            default:
                time.Sleep(1 * time.Second)
            }
        }
        ch <- "completed"
    }()
    return ch
}
```

### Context Propagation in HTTP Servers

```go
func httpHandler(w http.ResponseWriter, r *http.Request) {
    // r.Context() is cancelled when the client disconnects
    ctx := r.Context()

    result, err := queryDatabase(ctx, "SELECT * FROM users")
    if err != nil {
        if ctx.Err() == context.Canceled {
            // Client disconnected, no need to send response
            return
        }
        http.Error(w, err.Error(), 500)
        return
    }

    json.NewEncoder(w).Encode(result)
}

func queryDatabase(ctx context.Context, query string) (interface{}, error) {
    // Pass context to database driver -- query is cancelled if context expires
    rows, err := db.QueryContext(ctx, query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    // Process rows...
    return nil, nil
}
```

---

## 7. Data Race Detection

Go has a built-in race detector that finds data races at runtime.

```bash
# Run with race detector
go run -race main.go
go test -race ./...
```

### Example: Data Race

```go
// BUG: Data race -- two goroutines access 'count' without synchronization
func dataRace() {
    count := 0

    var wg sync.WaitGroup
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            count++ // DATA RACE: unsynchronized read-modify-write
        }()
    }

    wg.Wait()
    fmt.Println(count) // Undefined! Could be anything from 1 to 1000
}

// FIX 1: Use mutex
func fixedWithMutex() {
    var mu sync.Mutex
    count := 0

    var wg sync.WaitGroup
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            mu.Lock()
            count++
            mu.Unlock()
        }()
    }
    wg.Wait()
    fmt.Println(count) // Always 1000
}

// FIX 2: Use atomic operations
func fixedWithAtomic() {
    var count int64

    var wg sync.WaitGroup
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            atomic.AddInt64(&count, 1)
        }()
    }
    wg.Wait()
    fmt.Println(count) // Always 1000
}

// FIX 3: Use channel (share by communicating)
func fixedWithChannel() {
    ch := make(chan int)

    go func() {
        count := 0
        for delta := range ch {
            count += delta
        }
        fmt.Println(count) // Always 1000
    }()

    for i := 0; i < 1000; i++ {
        ch <- 1
    }
    close(ch)
}
```

---

## 8. Goroutine Leaks

A goroutine leak occurs when a goroutine is started but never finishes because it is blocked
on a channel operation or waiting for something that never comes.

### Common Leak Patterns

```go
// LEAK 1: Sending to unbuffered channel with no receiver
func leak1() {
    ch := make(chan int)
    go func() {
        ch <- 42 // Blocks forever! No one receives.
    }()
    // Goroutine is leaked
}

// LEAK 2: Receiving from channel that is never closed
func leak2() {
    ch := make(chan int)
    go func() {
        for val := range ch { // Blocks forever! Channel never closed.
            fmt.Println(val)
        }
    }()
    // Goroutine is leaked
}

// LEAK 3: Worker goroutine without cancellation
func leak3() {
    go func() {
        for {
            // Infinite loop with no way to stop
            time.Sleep(time.Second)
        }
    }()
    // Goroutine is leaked
}
```

### Prevention: Always Use Context for Cancellation

```go
func noLeak() {
    ctx, cancel := context.WithCancel(context.Background())

    ch := make(chan int)
    go func() {
        defer close(ch)
        for {
            select {
            case <-ctx.Done():
                return // Clean exit
            case ch <- produceValue():
                // Sent value
            }
        }
    }()

    // Use channel...
    cancel() // Signal goroutine to stop
}

func produceValue() int {
    return 42
}
```

---

## 9. Go vs Python Concurrency

```
+----------------------------+----------------------------+----------------------------+
| Aspect                     | Go                         | Python                     |
+----------------------------+----------------------------+----------------------------+
| Concurrency model          | CSP (goroutines + channels)| Shared memory + locks      |
|                            |                            | OR asyncio event loop      |
+----------------------------+----------------------------+----------------------------+
| Lightweight threads        | Goroutines (2KB, M:N)      | Coroutines (~KB, N:1)      |
|                            |                            | Threads (~MB, 1:1)         |
+----------------------------+----------------------------+----------------------------+
| True parallelism           | Yes (GOMAXPROCS cores)     | No for threads (GIL)       |
|                            |                            | Yes for multiprocessing    |
+----------------------------+----------------------------+----------------------------+
| Primary communication      | Channels                   | Queues, shared variables   |
+----------------------------+----------------------------+----------------------------+
| Cancellation               | context.Context            | asyncio.Task.cancel()      |
|                            |                            | threading.Event            |
+----------------------------+----------------------------+----------------------------+
| Race detection             | go run -race (built-in)    | No built-in tool           |
+----------------------------+----------------------------+----------------------------+
| Error handling             | Return error values        | Exceptions                 |
+----------------------------+----------------------------+----------------------------+
| Typical max goroutines/    | 100K - 1M goroutines       | 10K threads, 100K async    |
| coroutines                 |                            | coroutines                 |
+----------------------------+----------------------------+----------------------------+
| CPU-bound concurrency      | goroutines (true parallel) | multiprocessing (separate  |
|                            |                            | processes, bypass GIL)     |
+----------------------------+----------------------------+----------------------------+

Philosophy comparison:
  Go:     "Don't communicate by sharing memory;
           share memory by communicating." (channels)
  Python: "Communicate by sharing memory." (locks on shared state)
           OR "Use asyncio for I/O concurrency." (event loop)
```

---

## 10. Complete Examples

### Concurrent Web Crawler

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

type CrawlResult struct {
    URL   string
    Links []string
    Error error
}

func crawl(ctx context.Context, startURL string, maxDepth int, maxConcurrent int) []CrawlResult {
    var (
        mu      sync.Mutex
        results []CrawlResult
        visited = make(map[string]bool)
        wg      sync.WaitGroup
        sem     = make(chan struct{}, maxConcurrent)
    )

    var crawlURL func(url string, depth int)
    crawlURL = func(url string, depth int) {
        defer wg.Done()

        if depth > maxDepth {
            return
        }

        select {
        case <-ctx.Done():
            return
        case sem <- struct{}{}: // Acquire semaphore
            defer func() { <-sem }() // Release semaphore
        }

        mu.Lock()
        if visited[url] {
            mu.Unlock()
            return
        }
        visited[url] = true
        mu.Unlock()

        // Simulate fetching URL
        time.Sleep(50 * time.Millisecond)
        links := []string{
            url + "/page1",
            url + "/page2",
        }

        result := CrawlResult{URL: url, Links: links}
        mu.Lock()
        results = append(results, result)
        mu.Unlock()

        // Crawl discovered links
        for _, link := range links {
            wg.Add(1)
            go crawlURL(link, depth+1)
        }
    }

    wg.Add(1)
    go crawlURL(startURL, 0)
    wg.Wait()

    return results
}
```

### Rate-Limited API Client

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

type APIClient struct {
    rateLimiter <-chan time.Time
    maxRetries  int
}

func NewAPIClient(requestsPerSecond int, maxRetries int) *APIClient {
    return &APIClient{
        rateLimiter: time.Tick(time.Second / time.Duration(requestsPerSecond)),
        maxRetries:  maxRetries,
    }
}

func (c *APIClient) Request(ctx context.Context, endpoint string) (string, error) {
    for attempt := 0; attempt <= c.maxRetries; attempt++ {
        select {
        case <-ctx.Done():
            return "", ctx.Err()
        case <-c.rateLimiter:
            // Rate limit: wait for next slot
        }

        // Simulate API call
        time.Sleep(50 * time.Millisecond)
        return fmt.Sprintf("Response from %s", endpoint), nil
    }
    return "", fmt.Errorf("max retries exceeded for %s", endpoint)
}

func (c *APIClient) BatchRequest(ctx context.Context, endpoints []string) []string {
    results := make([]string, len(endpoints))
    var wg sync.WaitGroup

    for i, endpoint := range endpoints {
        wg.Add(1)
        go func(idx int, ep string) {
            defer wg.Done()
            result, err := c.Request(ctx, ep)
            if err != nil {
                results[idx] = fmt.Sprintf("ERROR: %s", err)
            } else {
                results[idx] = result
            }
        }(i, endpoint)
    }

    wg.Wait()
    return results
}
```

---

## 11. Common Interview Questions

1. **What are goroutines and how do they differ from threads?**
   Goroutines are lightweight user-space threads managed by Go's runtime. They use 2KB
   stack (growable), are M:N scheduled onto OS threads, cost ~0.3us to create (vs ~1ms
   for threads), and you can run millions of them.

2. **Explain buffered vs unbuffered channels.**
   Unbuffered: sender blocks until receiver is ready (synchronous handshake). Buffered:
   sender blocks only when buffer is full. Unbuffered for synchronization, buffered for
   decoupling speed differences.

3. **What is the select statement used for?**
   Multiplexes channel operations. Blocks until one case is ready. Used for timeouts,
   non-blocking operations (with default), and listening on multiple channels simultaneously.

4. **How does context.Context work?**
   Provides cancellation propagation, deadlines, and request-scoped values. When a parent
   context is cancelled, all derived contexts are also cancelled. Used in HTTP servers to
   handle client disconnections.

5. **What is a goroutine leak and how do you prevent it?**
   A goroutine that blocks forever on a channel or loop. Prevent with: context cancellation,
   buffered channels, close() on channels, and always having a way for goroutines to exit.

6. **When should you use channels vs mutexes?**
   Channels for passing data ownership between goroutines (pipeline, fan-out/fan-in).
   Mutexes for protecting shared state accessed by multiple goroutines. Channels are for
   communication, mutexes are for synchronization.

7. **How does the Go race detector work?**
   Instruments memory accesses at compile time. Detects when two goroutines access the same
   variable concurrently without synchronization and at least one is a write. Run with
   `go run -race` or `go test -race`.

---

## 12. Gotchas

- **Goroutine closure over loop variable.** Before Go 1.22, `go func() { use(i) }()` in a
  loop captured the SAME variable `i`, not its value. Fix: pass as parameter or use Go 1.22+
  which fixes this.

- **Sending on a closed channel panics.** Only the sender should close a channel. Never
  close a channel from the receiver side. If multiple senders exist, use a WaitGroup to
  coordinate closing.

- **Reading from a closed channel returns zero value.** `val := <-closedCh` returns the
  zero value of the channel's type. Use `val, ok := <-ch` to check if the channel is closed.

- **sync.WaitGroup Add() must be called before goroutine starts.** If you call `wg.Add(1)`
  inside the goroutine, there is a race between `wg.Wait()` and `wg.Add()`.

- **sync.Mutex is not reentrant.** Unlike Python's RLock, Go's Mutex deadlocks if the same
  goroutine tries to lock it twice. Restructure code to avoid nested locking.

- **Channel direction restrictions catch bugs at compile time.** Use `chan<-` (send-only) and
  `<-chan` (receive-only) in function signatures to prevent misuse.

---

## 13. Quick Reference

```
Go Concurrency Primitives:
+-------------------+----------------------------+----------------------------+
| Primitive         | Use Case                   | Key Point                  |
+-------------------+----------------------------+----------------------------+
| goroutine         | Concurrent execution       | 2KB stack, M:N scheduled   |
| chan T             | Communication between      | Unbuf=sync, Buf=async      |
|                   | goroutines                 |                            |
| select            | Multiplex channel ops      | Timeout, non-blocking      |
| sync.Mutex        | Protect shared state       | Not reentrant!             |
| sync.RWMutex      | Read-heavy shared state    | Multiple readers OR writer |
| sync.WaitGroup    | Wait for N goroutines      | Add before go, Done defer  |
| sync.Once         | One-time initialization    | Thread-safe singleton      |
| sync.Pool         | Object reuse               | Reduce GC pressure         |
| sync.Map          | Concurrent map             | No generics, use sparingly |
| context.Context   | Cancellation + timeout     | Propagate through call tree|
| atomic.*          | Lock-free counter ops      | AddInt64, LoadInt64, etc   |
+-------------------+----------------------------+----------------------------+

Pattern Cheat Sheet:
  Fan-out:    Multiple goroutines read from one channel
  Fan-in:     Multiple channels write to one channel
  Pipeline:   chain of stages connected by channels
  Worker Pool: N goroutines + jobs channel + results channel
  Rate Limit: time.Ticker + select
  Timeout:    context.WithTimeout or time.After in select
  Graceful:   context.WithCancel + select on ctx.Done()

Channel Decision:
  Need sync handshake?     --> Unbuffered channel
  Need to decouple speeds? --> Buffered channel
  Need to signal done?     --> close(ch)
  Need timeout?            --> select + time.After
  Need non-blocking?       --> select + default
```
