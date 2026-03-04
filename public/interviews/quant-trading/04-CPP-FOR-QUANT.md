# Chapter 4: C++ for High-Performance Trading Systems

## Table of Contents

1. [Why C++ in Quant Trading](#1-why-c-in-quant-trading)
2. [Modern C++ Fundamentals (C++17/20)](#2-modern-c-fundamentals)
3. [Memory Management for Trading](#3-memory-management-for-trading)
4. [Template Metaprogramming](#4-template-metaprogramming)
5. [Concurrency and Lock-Free Programming](#5-concurrency-and-lock-free-programming)
6. [Network Programming](#6-network-programming)
7. [Low-Latency Optimization](#7-low-latency-optimization)
8. [Data Structures for Trading](#8-data-structures-for-trading)
9. [Design Patterns](#9-design-patterns-for-trading-systems)
10. [Build Systems and Tooling](#10-build-systems-and-tooling)
11. [Projects](#11-projects)

---

## 1. Why C++ in Quant Trading

### The Latency Imperative

In high-frequency trading, every nanosecond matters. The difference between capturing and missing a trading opportunity is measured in microseconds. C++ provides the deterministic, low-level control required to compete.

```
Latency Scale in Trading Systems
=================================

   1 ns  |####                          | L1 cache reference
   4 ns  |########                      | L2 cache reference
  12 ns  |############                  | L2 cache lookup
 100 ns  |########################      | DRAM access
         |                              |
   1 us  |#                             | Mutex lock/unlock
   3 us  |###                           | Context switch
  10 us  |##########                    | Kernel bypass network RTT
  50 us  |##########################    | Standard network RTT (co-located)
 500 us  |############################  | Cross-data-center RTT
         |                              |
   1 ms  |#                             | SSD random read
  10 ms  |##########                    | HDD seek

Legend: 1 us = 1,000 ns | 1 ms = 1,000 us

HFT Target: < 1-10 us total tick-to-trade
```

### Where C++ Is Used

```
+-----------------------------------------------------------------------+
|                 TRADING SYSTEM ARCHITECTURE                            |
+-----------------------------------------------------------------------+
|                                                                       |
|  MARKET DATA PATH (C++)           TRADING DECISION (C++ or Python)    |
|  +-------------------------+      +-----------------------------+     |
|  | Feed Handlers           |----->| Signal Generation           |     |
|  | Protocol Decoders       |      | Alpha Model                 |     |
|  | Book Builders           |      | Risk Checks                 |     |
|  | Normalizers             |      | Portfolio Optimization       |     |
|  +-------------------------+      +-----------------------------+     |
|           |                                    |                      |
|           v                                    v                      |
|  ORDER EXECUTION (C++)            RISK & MONITORING                   |
|  +-------------------------+      +-----------------------------+     |
|  | Order Management        |      | Real-time P&L (C++)         |     |
|  | Smart Order Router      |      | Position Tracking (C++)     |     |
|  | FIX/Binary Protocol     |      | Dashboards (Python/Web)     |     |
|  | Exchange Connectivity   |      | Analytics (Python)          |     |
|  +-------------------------+      +-----------------------------+     |
|                                                                       |
+-----------------------------------------------------------------------+
```

### C++ vs Python vs Rust

| Aspect | C++ | Python | Rust |
|---|---|---|---|
| Latency | ~100ns decisions | ~10-100us | ~100ns decisions |
| Memory control | Full manual/RAII | GC-managed | Ownership model |
| Ecosystem (trading) | Mature, dominant | Research/backtesting | Growing |
| Development speed | Slower | Fast | Moderate |
| Safety | Manual discipline | Safe by default | Compile-time safe |
| Hiring pool (quant) | Very large | Very large | Small but growing |
| Legacy integration | Seamless | Via bindings | Via FFI |

**Typical division**: C++ for the hot path (feed handlers, order management, matching engines), Python for research/backtesting/analytics, Rust increasingly for new infrastructure.

---

## 2. Modern C++ Fundamentals

### RAII and Smart Pointers

RAII (Resource Acquisition Is Initialization) is foundational to safe C++. Resources are tied to object lifetimes.

```cpp
#include <memory>
#include <string>
#include <vector>
#include <stdexcept>

// RAII wrapper for a socket connection
class ExchangeConnection {
    int socket_fd_;
    std::string exchange_name_;

public:
    ExchangeConnection(const std::string& host, int port)
        : exchange_name_(host)
    {
        socket_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
        if (socket_fd_ < 0)
            throw std::runtime_error("Socket creation failed");
        // connect logic...
    }

    ~ExchangeConnection() {
        if (socket_fd_ >= 0)
            ::close(socket_fd_);  // Always cleaned up
    }

    // Delete copy, allow move
    ExchangeConnection(const ExchangeConnection&) = delete;
    ExchangeConnection& operator=(const ExchangeConnection&) = delete;
    ExchangeConnection(ExchangeConnection&& other) noexcept
        : socket_fd_(other.socket_fd_), exchange_name_(std::move(other.exchange_name_))
    {
        other.socket_fd_ = -1;
    }
};

// Smart pointers in trading context
class TradingEngine {
    // Unique ownership: one engine owns its risk manager
    std::unique_ptr<RiskManager> risk_mgr_;

    // Shared ownership: multiple strategies share market data
    std::shared_ptr<MarketDataFeed> md_feed_;

    // Weak reference: observer pattern without preventing cleanup
    std::vector<std::weak_ptr<Strategy>> strategies_;
};
```

**Performance note**: `unique_ptr` has zero overhead vs raw pointer. `shared_ptr` has atomic reference count overhead (~10-20ns per copy). Avoid `shared_ptr` on hot paths.

### Move Semantics

Move semantics eliminate unnecessary copies -- critical for passing large objects like order books.

```cpp
#include <vector>
#include <utility>

struct OrderBook {
    std::vector<PriceLevel> bids;
    std::vector<PriceLevel> asks;
    uint64_t sequence_number;

    // Move constructor: steal resources instead of copying
    OrderBook(OrderBook&& other) noexcept
        : bids(std::move(other.bids))
        , asks(std::move(other.asks))
        , sequence_number(other.sequence_number)
    {}

    OrderBook& operator=(OrderBook&& other) noexcept {
        bids = std::move(other.bids);
        asks = std::move(other.asks);
        sequence_number = other.sequence_number;
        return *this;
    }
};

// Factory function: RVO + move semantics = zero copies
OrderBook build_snapshot(const RawFeed& feed) {
    OrderBook book;
    book.bids.reserve(feed.depth());
    // ... populate ...
    return book;  // NRVO: no copy, no move, constructed in place
}
```

### constexpr: Compile-Time Computation

Move computation to compile time to eliminate runtime cost.

```cpp
#include <cstdint>
#include <array>

// Compile-time tick size table
constexpr double tick_size(int price_cents) {
    if (price_cents < 100)   return 0.0001;
    if (price_cents < 10000) return 0.01;
    return 0.05;
}

// Compile-time FIX tag lookup table
constexpr std::array<int, 256> make_fix_tag_map() {
    std::array<int, 256> map{};
    map['1'] = 1;   // Account
    map['6'] = 6;   // AvgPx
    map['8'] = 8;   // BeginString
    // ...
    return map;
}

constexpr auto FIX_TAG_MAP = make_fix_tag_map();

// Compile-time price conversion
constexpr int64_t to_fixed_point(double price, int decimals = 8) {
    int64_t multiplier = 1;
    for (int i = 0; i < decimals; ++i) multiplier *= 10;
    return static_cast<int64_t>(price * multiplier);
}

static_assert(to_fixed_point(1.5, 2) == 150);
```

### std::optional and std::variant

Type-safe alternatives to nulls and unions.

```cpp
#include <optional>
#include <variant>
#include <string>

// Optional: may or may not have a value
struct Quote {
    double bid_price;
    double ask_price;
    std::optional<double> last_trade_price;  // No trade yet? No value.
    std::optional<uint64_t> implied_volume;
};

std::optional<double> get_mid_price(const Quote& q) {
    if (q.bid_price > 0 && q.ask_price > 0)
        return (q.bid_price + q.ask_price) / 2.0;
    return std::nullopt;
}

// Variant: type-safe union for order types
using OrderPayload = std::variant<
    LimitOrder,
    MarketOrder,
    StopOrder,
    IcebergOrder
>;

// Visit pattern: compile-time dispatch
double get_limit_price(const OrderPayload& order) {
    return std::visit([](const auto& o) -> double {
        using T = std::decay_t<decltype(o)>;
        if constexpr (std::is_same_v<T, LimitOrder>)
            return o.price;
        else if constexpr (std::is_same_v<T, StopOrder>)
            return o.stop_price;
        else
            return 0.0;  // Market orders have no limit price
    }, order);
}
```

### Structured Bindings (C++17)

```cpp
#include <tuple>
#include <unordered_map>

// Clean decomposition
auto [bid, ask, spread] = compute_bbo(book);

// Iterating maps
std::unordered_map<std::string, Position> positions;
for (const auto& [symbol, pos] : positions) {
    if (pos.net_quantity != 0)
        update_risk(symbol, pos);
}

// From functions returning structs
struct FillReport { double price; int qty; uint64_t timestamp; };
auto [fill_px, fill_qty, fill_ts] = process_execution(order);
```

### Concepts (C++20)

Concepts constrain templates at compile time with clear error messages.

```cpp
#include <concepts>
#include <type_traits>

// Concept: anything that behaves like a numeric price
template<typename T>
concept Price = requires(T a, T b) {
    { a + b } -> std::convertible_to<T>;
    { a - b } -> std::convertible_to<T>;
    { a * 2.0 } -> std::convertible_to<T>;
    { a < b } -> std::convertible_to<bool>;
};

// Concept: a valid order type
template<typename T>
concept TradingOrder = requires(T order) {
    { order.symbol() } -> std::convertible_to<std::string_view>;
    { order.quantity() } -> std::integral;
    { order.side() } -> std::same_as<Side>;
    { order.validate() } -> std::same_as<bool>;
};

// Usage: clear constraints, readable errors
template<TradingOrder OrderT>
bool submit_order(const OrderT& order) {
    if (!order.validate()) return false;
    // ...
    return true;
}
```

---

## 3. Memory Management for Trading

### Stack vs Heap

```
MEMORY LAYOUT
====================================

High Address
+----------------------------+
|         Stack              |  <- Fast: automatic, LIFO, ~8MB default
|  (local vars, frames)     |  <- No allocation overhead
|         |                  |  <- Cache-friendly (contiguous)
|         v                  |
+----------------------------+
|                            |
|    (unmapped gap)          |
|                            |
+----------------------------+
|         ^                  |
|         |                  |
|         Heap               |  <- Slow: malloc/new, fragmentation
|  (dynamic allocation)      |  <- Cache-unfriendly (scattered)
+----------------------------+
|   BSS (uninitialized)      |
+----------------------------+
|   Data (initialized)       |
+----------------------------+
|   Text (code)              |
+----------------------------+
Low Address

HOT PATH RULE: Never call new/malloc on the hot path.
Pre-allocate everything during initialization.
```

### Memory Pool / Arena Allocator

Pre-allocate a large block and hand out fixed-size chunks. No syscalls on the hot path.

```cpp
#include <cstddef>
#include <cstdint>
#include <array>
#include <stdexcept>
#include <cassert>

// Fixed-size pool allocator for order objects
template<typename T, size_t Capacity>
class PoolAllocator {
    // Storage: aligned raw memory
    alignas(T) std::array<uint8_t, sizeof(T) * Capacity> storage_;

    // Free list: singly-linked through the unused blocks
    struct FreeNode { FreeNode* next; };
    FreeNode* free_head_ = nullptr;
    size_t allocated_ = 0;

public:
    PoolAllocator() {
        // Build free list
        for (size_t i = 0; i < Capacity; ++i) {
            auto* node = reinterpret_cast<FreeNode*>(&storage_[i * sizeof(T)]);
            node->next = free_head_;
            free_head_ = node;
        }
    }

    T* allocate() {
        if (!free_head_) return nullptr;  // Pool exhausted
        FreeNode* node = free_head_;
        free_head_ = node->next;
        ++allocated_;
        return reinterpret_cast<T*>(node);
    }

    void deallocate(T* ptr) {
        auto* node = reinterpret_cast<FreeNode*>(ptr);
        node->next = free_head_;
        free_head_ = node;
        --allocated_;
    }

    size_t size() const { return allocated_; }
    size_t capacity() const { return Capacity; }
};

// Usage: pre-allocated order pool
struct Order {
    uint64_t order_id;
    int32_t price_ticks;
    int32_t quantity;
    char symbol[8];
    uint8_t side;  // 0=buy, 1=sell
};

// 1 million orders pre-allocated at startup
PoolAllocator<Order, 1'000'000> order_pool;
```

**Performance**: Pool allocation is O(1) -- a pointer swap. `malloc` is O(?) -- may trigger `mmap`/`brk` syscalls. Measured difference: ~5ns (pool) vs ~50-200ns (malloc).

### Cache-Friendly Layout: SoA vs AoS

```
ARRAY OF STRUCTURES (AoS) - Poor cache utilization
====================================================
Memory: [px qty sym side | px qty sym side | px qty sym side | ...]
                          ^-- Loading 'price' also loads qty, sym, side
                              Wastes cache line space

STRUCTURE OF ARRAYS (SoA) - Optimal for column access
====================================================
Prices:     [px  | px  | px  | px  | px  | px  | ...]  <- One cache line
Quantities: [qty | qty | qty | qty | qty | qty | ...]     = many prices
Symbols:    [sym | sym | sym | sym | sym | sym | ...]
Sides:      [s   | s   | s   | s   | s   | s   | ...]

When scanning all prices (common in trading), SoA is 3-5x faster.
```

```cpp
// AoS: traditional layout
struct OrderAoS {
    double price;     // 8 bytes
    int32_t quantity; // 4 bytes
    char symbol[8];   // 8 bytes
    uint8_t side;     // 1 byte + 3 padding = 24 bytes total
};
std::vector<OrderAoS> orders_aos;  // Stride = 24 bytes

// SoA: cache-friendly for columnar access
struct OrdersSoA {
    std::vector<double> prices;
    std::vector<int32_t> quantities;
    std::vector<std::array<char,8>> symbols;
    std::vector<uint8_t> sides;
    size_t count = 0;

    void add(double px, int32_t qty, const char* sym, uint8_t s) {
        prices.push_back(px);
        quantities.push_back(qty);
        std::array<char,8> sb{};
        std::memcpy(sb.data(), sym, std::min(std::strlen(sym), size_t(7)));
        symbols.push_back(sb);
        sides.push_back(s);
        ++count;
    }

    // Scanning prices: 8 prices per cache line (64 bytes / 8 bytes)
    double best_bid() const {
        double best = 0.0;
        for (size_t i = 0; i < count; ++i) {
            if (sides[i] == 0 && prices[i] > best)
                best = prices[i];
        }
        return best;
    }
};
```

### Memory-Mapped Files

Used for historical data access and shared memory between processes.

```cpp
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>

struct TickData {
    uint64_t timestamp_ns;
    double price;
    int32_t size;
    uint8_t side;
} __attribute__((packed));

class MappedTickFile {
    void* mapped_ = nullptr;
    size_t length_ = 0;
    int fd_ = -1;

public:
    MappedTickFile(const char* path) {
        fd_ = ::open(path, O_RDONLY);
        if (fd_ < 0) throw std::runtime_error("open failed");

        struct stat st;
        ::fstat(fd_, &st);
        length_ = st.st_size;

        mapped_ = ::mmap(nullptr, length_, PROT_READ, MAP_PRIVATE, fd_, 0);
        if (mapped_ == MAP_FAILED) throw std::runtime_error("mmap failed");

        // Advise sequential access for prefetching
        ::madvise(mapped_, length_, MADV_SEQUENTIAL);
    }

    ~MappedTickFile() {
        if (mapped_ && mapped_ != MAP_FAILED) ::munmap(mapped_, length_);
        if (fd_ >= 0) ::close(fd_);
    }

    const TickData* data() const {
        return reinterpret_cast<const TickData*>(mapped_);
    }

    size_t count() const { return length_ / sizeof(TickData); }
};
```

### Pre-Allocated Order Book Example

```cpp
#include <array>
#include <cstdint>

// Fixed-price-level order book: zero allocation after construction
class PreallocatedBook {
    static constexpr int MAX_LEVELS = 1024;
    static constexpr int TICK_SIZE_CENTS = 1;

    struct Level {
        int64_t price_cents = 0;
        int64_t total_qty = 0;
        int32_t order_count = 0;
    };

    std::array<Level, MAX_LEVELS> bids_{};
    std::array<Level, MAX_LEVELS> asks_{};
    int bid_depth_ = 0;
    int ask_depth_ = 0;

public:
    // All operations are O(1) or O(depth), no allocation
    void update_bid(int64_t price_cents, int64_t qty, int32_t count) {
        for (int i = 0; i < bid_depth_; ++i) {
            if (bids_[i].price_cents == price_cents) {
                bids_[i].total_qty = qty;
                bids_[i].order_count = count;
                if (qty == 0) remove_bid(i);
                return;
            }
        }
        if (qty > 0 && bid_depth_ < MAX_LEVELS) {
            bids_[bid_depth_++] = {price_cents, qty, count};
            // Insert-sort to maintain price order (descending)
            for (int i = bid_depth_ - 1; i > 0; --i) {
                if (bids_[i].price_cents > bids_[i-1].price_cents)
                    std::swap(bids_[i], bids_[i-1]);
                else break;
            }
        }
    }

    int64_t best_bid_price() const {
        return bid_depth_ > 0 ? bids_[0].price_cents : 0;
    }

    int64_t best_ask_price() const {
        return ask_depth_ > 0 ? asks_[0].price_cents : 0;
    }

private:
    void remove_bid(int idx) {
        for (int i = idx; i < bid_depth_ - 1; ++i)
            bids_[i] = bids_[i+1];
        --bid_depth_;
    }
};
```

---

## 4. Template Metaprogramming

### Function and Class Templates

```cpp
// Generic price type: works with double, fixed-point, decimal
template<typename PriceT>
struct PriceLevel {
    PriceT price;
    int64_t quantity;

    PriceT notional() const { return price * quantity; }
};

// Template function: compile-time type resolution, zero overhead
template<typename BookT>
auto compute_vwap(const BookT& book, int depth) {
    typename BookT::price_type total_value{};
    int64_t total_qty = 0;

    for (int i = 0; i < depth && i < book.levels(); ++i) {
        total_value += book.price(i) * book.quantity(i);
        total_qty += book.quantity(i);
    }
    return total_qty > 0 ? total_value / total_qty : typename BookT::price_type{};
}
```

### SFINAE and if constexpr

`if constexpr` (C++17) replaces old SFINAE tricks with readable compile-time branching.

```cpp
#include <type_traits>

enum class Side : uint8_t { Buy, Sell };

struct LimitOrder {
    double price; int qty; Side side;
    static constexpr bool has_price = true;
};

struct MarketOrder {
    int qty; Side side;
    static constexpr bool has_price = false;
};

// Compile-time dispatch: no runtime cost
template<typename OrderT>
double effective_price(const OrderT& order, double market_price) {
    if constexpr (OrderT::has_price) {
        return order.price;
    } else {
        return market_price;  // Market orders use current market price
    }
}

// Old SFINAE approach (C++14) - for reference
template<typename T>
auto get_price_sfinae(const T& o) -> decltype(o.price) {
    return o.price;
}
```

### CRTP: Static Polymorphism

Curiously Recurring Template Pattern eliminates virtual dispatch overhead.

```
VIRTUAL DISPATCH vs CRTP
==========================

Virtual dispatch (runtime):              CRTP (compile-time):
  ptr -> vtable -> function              Direct call, inlined
  ~5-25ns overhead + cache miss          0ns overhead
  Cannot inline                          Fully inlinable

For hot-path code called millions of times per second, CRTP wins.
```

```cpp
// CRTP base: static polymorphism, zero-overhead
template<typename Derived>
class StrategyBase {
public:
    void on_tick(const Tick& tick) {
        // Pre-processing (common logic)
        static_cast<Derived*>(this)->on_tick_impl(tick);
        // Post-processing (common logic)
    }

    void on_fill(const Fill& fill) {
        static_cast<Derived*>(this)->on_fill_impl(fill);
    }

    double compute_signal(const MarketData& md) {
        return static_cast<Derived*>(this)->compute_signal_impl(md);
    }
};

// Concrete strategy: no vtable, fully inlined
class MomentumStrategy : public StrategyBase<MomentumStrategy> {
    friend class StrategyBase<MomentumStrategy>;

    void on_tick_impl(const Tick& tick) {
        // Update momentum indicators
    }

    void on_fill_impl(const Fill& fill) {
        // Track position
    }

    double compute_signal_impl(const MarketData& md) {
        // Momentum calculation
        return 0.0;
    }
};
```

### Compile-Time Order Type Dispatch

```cpp
#include <variant>

enum class OrderType : uint8_t { Limit, Market, Stop, IOC };

// Tag dispatch: different handling at compile time
template<OrderType OT>
struct OrderTag {};

class OrderRouter {
public:
    template<OrderType OT>
    bool route(const auto& order, OrderTag<OT>) {
        if constexpr (OT == OrderType::Limit) {
            return send_to_limit_book(order);
        } else if constexpr (OT == OrderType::Market) {
            return send_aggressive(order);
        } else if constexpr (OT == OrderType::IOC) {
            return send_ioc(order);
        } else {
            return send_to_stop_book(order);
        }
    }

private:
    bool send_to_limit_book(const auto& order);
    bool send_aggressive(const auto& order);
    bool send_ioc(const auto& order);
    bool send_to_stop_book(const auto& order);
};
```

---

## 5. Concurrency and Lock-Free Programming

### Threading Fundamentals

```
TRADING SYSTEM THREAD ARCHITECTURE
====================================

Core 0 (isolated)     Core 1 (isolated)     Core 2         Core 3
+-----------------+   +-----------------+   +----------+   +----------+
| Market Data     |   | Order Entry     |   | Strategy |   | Risk     |
| Feed Handler    |   | Gateway         |   | Thread   |   | Monitor  |
|                 |   |                 |   |          |   |          |
| - Decode feed   |   | - Encode orders |   | - Signal |   | - P&L    |
| - Build book    |   | - Send to exch  |   | - Alpha  |   | - Limits |
| - Publish ticks |   | - Handle acks   |   | - Decide |   | - Report |
+-----------------+   +-----------------+   +----------+   +----------+
        |                     ^                  |              ^
        |     SPSC Queue      |    SPSC Queue    |  SPSC Queue  |
        +--- (lock-free) -----+----- (l-f) ------+--- (l-f) ---+

Key: Each thread pinned to a dedicated CPU core.
     Communication via lock-free queues only.
     No mutexes on the hot path.
```

### std::atomic and Memory Ordering

```cpp
#include <atomic>
#include <cstdint>

// Memory ordering levels (weakest to strongest):
// memory_order_relaxed  - No ordering, just atomicity
// memory_order_acquire  - Reads after this see writes before a release
// memory_order_release  - Writes before this are visible after an acquire
// memory_order_acq_rel  - Both acquire and release
// memory_order_seq_cst  - Total ordering (default, slowest)

class AtomicPosition {
    std::atomic<int64_t> net_qty_{0};
    std::atomic<double> avg_price_{0.0};
    std::atomic<uint64_t> version_{0};  // Sequence lock

public:
    // Writer thread: update with release semantics
    void update(int64_t qty, double price) {
        auto v = version_.load(std::memory_order_relaxed);
        version_.store(v + 1, std::memory_order_release);  // Odd = writing

        net_qty_.store(qty, std::memory_order_relaxed);
        avg_price_.store(price, std::memory_order_relaxed);

        version_.store(v + 2, std::memory_order_release);  // Even = stable
    }

    // Reader thread: consistent read with acquire semantics
    std::pair<int64_t, double> read() const {
        int64_t qty;
        double price;
        uint64_t v1, v2;

        do {
            v1 = version_.load(std::memory_order_acquire);
            qty = net_qty_.load(std::memory_order_relaxed);
            price = avg_price_.load(std::memory_order_relaxed);
            v2 = version_.load(std::memory_order_acquire);
        } while (v1 != v2 || (v1 & 1));  // Retry if writer was active

        return {qty, price};
    }
};
```

### Lock-Free SPSC Queue

The Single-Producer Single-Consumer (SPSC) queue is the workhorse of trading systems. No locks, no CAS, just acquire-release semantics.

```cpp
#include <atomic>
#include <array>
#include <cstddef>
#include <optional>
#include <new>

// Lock-free SPSC ring buffer
// - Exactly one producer thread, one consumer thread
// - No mutex, no CAS, just atomic load/store
// - Capacity must be power of 2
template<typename T, size_t Capacity>
class SPSCQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    static_assert(Capacity > 0);

    // Align to cache line to prevent false sharing
    alignas(64) std::atomic<size_t> head_{0};  // Written by consumer
    alignas(64) std::atomic<size_t> tail_{0};  // Written by producer
    alignas(64) std::array<T, Capacity> buffer_;

    static constexpr size_t MASK = Capacity - 1;

public:
    // Producer: push an element
    bool try_push(const T& item) {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        const size_t next = (tail + 1) & MASK;

        if (next == head_.load(std::memory_order_acquire))
            return false;  // Full

        buffer_[tail] = item;
        tail_.store(next, std::memory_order_release);
        return true;
    }

    // Consumer: pop an element
    std::optional<T> try_pop() {
        const size_t head = head_.load(std::memory_order_relaxed);

        if (head == tail_.load(std::memory_order_acquire))
            return std::nullopt;  // Empty

        T item = buffer_[head];
        head_.store((head + 1) & MASK, std::memory_order_release);
        return item;
    }

    bool empty() const {
        return head_.load(std::memory_order_acquire)
            == tail_.load(std::memory_order_acquire);
    }

    size_t size() const {
        auto h = head_.load(std::memory_order_acquire);
        auto t = tail_.load(std::memory_order_acquire);
        return (t - h) & MASK;
    }
};
```

**Performance**: ~5-15ns per push/pop. Compare to `std::mutex`-based queue: ~50-200ns per operation.

### Thread Affinity and CPU Pinning

```cpp
#include <pthread.h>
#include <sched.h>
#include <thread>

// Pin a thread to a specific CPU core
void pin_thread_to_core(std::thread& t, int core_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(core_id, &cpuset);

    int rc = pthread_setaffinity_np(t.native_handle(),
                                     sizeof(cpu_set_t), &cpuset);
    if (rc != 0) {
        throw std::runtime_error("Failed to set thread affinity");
    }
}

// Set real-time scheduling priority
void set_realtime_priority(std::thread& t, int priority = 90) {
    struct sched_param param;
    param.sched_priority = priority;
    int rc = pthread_setschedparam(t.native_handle(), SCHED_FIFO, &param);
    if (rc != 0) {
        throw std::runtime_error("Failed to set RT priority (run as root?)");
    }
}

// Example: trading system thread setup
void setup_trading_threads() {
    // Isolated cores (set via kernel boot param: isolcpus=2,3,4,5)
    std::thread md_thread(market_data_loop);
    pin_thread_to_core(md_thread, 2);
    set_realtime_priority(md_thread, 99);

    std::thread strategy_thread(strategy_loop);
    pin_thread_to_core(strategy_thread, 3);
    set_realtime_priority(strategy_thread, 95);

    std::thread order_thread(order_entry_loop);
    pin_thread_to_core(order_thread, 4);
    set_realtime_priority(order_thread, 99);

    md_thread.join();
    strategy_thread.join();
    order_thread.join();
}
```

### False Sharing

```
FALSE SHARING: Silent Performance Killer
==========================================

Cache Line (64 bytes)
+------+------+------+------+------+------+------+------+
| Var A| Var B|      |      |      |      |      |      |
| Core0| Core1|      |      |      |      |      |      |
+------+------+------+------+------+------+------+------+
  ^       ^
  |       +-- Core 1 writes B, invalidates entire cache line
  +---------- Core 0 must reload A even though A didn't change!

FIX: Pad variables to separate cache lines.
```

```cpp
// BAD: head_ and tail_ on same cache line
struct BadQueue {
    std::atomic<size_t> head_;  // Offset 0
    std::atomic<size_t> tail_;  // Offset 8 -- same cache line!
};

// GOOD: each on its own cache line
struct GoodQueue {
    alignas(64) std::atomic<size_t> head_;  // Cache line 0
    alignas(64) std::atomic<size_t> tail_;  // Cache line 1
};

// C++17 portable way
struct PortableQueue {
    alignas(std::hardware_destructive_interference_size)
        std::atomic<size_t> head_;
    alignas(std::hardware_destructive_interference_size)
        std::atomic<size_t> tail_;
};
```

---

## 6. Network Programming

### TCP vs UDP in Trading

```
MARKET DATA (typically UDP multicast)    ORDER ENTRY (typically TCP)
+----------------------------------+    +----------------------------------+
| - Exchange broadcasts to all     |    | - Point-to-point to exchange     |
| - UDP multicast: one-to-many    |    | - TCP: reliable, ordered         |
| - Lowest latency (no handshake) |    | - Must not lose orders           |
| - May lose packets -> gap detect |    | - Session-based (FIX, OUCH)     |
| - Sequence numbers for recovery  |    | - Heartbeats for keep-alive     |
+----------------------------------+    +----------------------------------+
```

### Non-Blocking I/O with epoll

```cpp
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <stdexcept>

class EpollReactor {
    int epoll_fd_;
    static constexpr int MAX_EVENTS = 64;

public:
    EpollReactor() {
        epoll_fd_ = ::epoll_create1(0);
        if (epoll_fd_ < 0)
            throw std::runtime_error("epoll_create1 failed");
    }

    ~EpollReactor() { ::close(epoll_fd_); }

    void add_fd(int fd, uint32_t events, void* user_data) {
        epoll_event ev{};
        ev.events = events;
        ev.data.ptr = user_data;
        if (::epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, fd, &ev) < 0)
            throw std::runtime_error("epoll_ctl add failed");
    }

    void poll(int timeout_ms = 0) {
        epoll_event events[MAX_EVENTS];
        int n = ::epoll_wait(epoll_fd_, events, MAX_EVENTS, timeout_ms);

        for (int i = 0; i < n; ++i) {
            auto* handler = static_cast<FeedHandler*>(events[i].data.ptr);
            if (events[i].events & EPOLLIN)
                handler->on_readable();
            if (events[i].events & EPOLLERR)
                handler->on_error();
        }
    }
};

// Set socket to non-blocking with TCP_NODELAY
void configure_socket(int fd) {
    // Non-blocking
    int flags = ::fcntl(fd, F_GETFL, 0);
    ::fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    // Disable Nagle's algorithm (critical for low-latency)
    int one = 1;
    ::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));

    // Enable busy-polling (reduces latency by ~2-5us)
    int busy_poll_us = 50;
    ::setsockopt(fd, SOL_SOCKET, SO_BUSY_POLL, &busy_poll_us, sizeof(busy_poll_us));
}
```

### Kernel Bypass Networking

```
STANDARD NETWORK STACK vs KERNEL BYPASS
==========================================

Standard (10-50 us):                 Kernel Bypass (1-5 us):
+------------------+                 +------------------+
| Application      |                 | Application      |
+------------------+                 +------------------+
| Socket API       |                 | DPDK / ef_vi     |
+------------------+                 +------ -----------+
| TCP/IP Stack     |                 | NIC (direct DMA) |
+------------------+                 +------------------+
| Device Driver    |
+------------------+                 Bypasses: syscalls, interrupts,
| NIC              |                 context switches, kernel TCP/IP
+------------------+

Technologies:
- Solarflare OpenOnload: Drop-in TCP/UDP acceleration
- DPDK: Full userspace networking stack
- Mellanox VMA: Verbs-based acceleration
- io_uring: Modern Linux async I/O (not full bypass)
```

### Binary Protocol: Simple Example

```cpp
#include <cstdint>
#include <cstring>
#include <arpa/inet.h>

// Simple Binary Encoding-style market data message
// All fields are fixed-size, no parsing overhead
struct __attribute__((packed)) MarketDataMsg {
    // Header
    uint16_t msg_length;      // Total message length
    uint16_t msg_type;        // 1=Trade, 2=Quote, 3=BBO
    uint32_t sequence_num;    // Gap detection
    uint64_t timestamp_ns;    // Exchange timestamp

    // Payload (BBO update)
    char symbol[8];           // Null-padded symbol
    int64_t bid_price;        // Price * 10^8 (fixed-point)
    int32_t bid_size;
    int64_t ask_price;
    int32_t ask_size;
};

static_assert(sizeof(MarketDataMsg) == 52, "Unexpected padding");

// Zero-copy decode: cast directly from network buffer
class FeedDecoder {
    uint32_t expected_seq_ = 1;

public:
    const MarketDataMsg* decode(const char* buf, size_t len) {
        if (len < sizeof(MarketDataMsg)) return nullptr;

        auto* msg = reinterpret_cast<const MarketDataMsg*>(buf);

        // Gap detection
        uint32_t seq = msg->sequence_num;
        if (seq != expected_seq_) {
            handle_gap(expected_seq_, seq);
        }
        expected_seq_ = seq + 1;

        return msg;
    }

private:
    void handle_gap(uint32_t expected, uint32_t received);
};
```

### Simple Market Data Receiver

```cpp
class UDPReceiver {
    int fd_ = -1;
    alignas(64) char recv_buf_[65536];  // Pre-allocated receive buffer

public:
    UDPReceiver(const char* multicast_group, int port) {
        fd_ = ::socket(AF_INET, SOCK_DGRAM, 0);
        if (fd_ < 0) throw std::runtime_error("socket failed");

        int reuse = 1;
        ::setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port);
        ::bind(fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));

        // Join multicast group
        ip_mreq mreq{};
        mreq.imr_multiaddr.s_addr = inet_addr(multicast_group);
        mreq.imr_interface.s_addr = INADDR_ANY;
        ::setsockopt(fd_, IPPROTO_IP, IP_ADD_MEMBERSHIP, &mreq, sizeof(mreq));

        // 8MB receive buffer to absorb bursts
        int buf_size = 8 * 1024 * 1024;
        ::setsockopt(fd_, SOL_SOCKET, SO_RCVBUF, &buf_size, sizeof(buf_size));
    }

    ~UDPReceiver() { if (fd_ >= 0) ::close(fd_); }

    // Hot loop: spin-receive with zero allocation
    template<typename Callback>
    [[noreturn]] void run(Callback&& on_message) {
        FeedDecoder decoder;
        for (;;) {
            ssize_t n = ::recv(fd_, recv_buf_, sizeof(recv_buf_), 0);
            if (n > 0) {
                const auto* msg = decoder.decode(recv_buf_, n);
                if (msg) on_message(*msg);
            }
        }
    }
};
```

---

## 7. Low-Latency Optimization

### Branch Prediction

```
CPU PIPELINE AND BRANCH MISPREDICTION
========================================

Pipeline:  Fetch -> Decode -> Execute -> Memory -> Writeback

Correct prediction:   F D E M W
                        F D E M W    <- Next instruction ready
                          F D E M W

Misprediction:        F D E M W
                        F D X X X   <- Flushed! 10-20 cycle penalty
                              F D E M W   <- Restart

Cost: ~12-20 cycles per misprediction = ~4-7 ns at 3 GHz
```

```cpp
#include <cstdint>

// Use __builtin_expect for known-likely branches
inline bool check_risk_limit(int64_t position, int64_t limit) {
    // Position is almost always within limits
    if (__builtin_expect(position > limit, 0)) {
        reject_order();  // Cold path
        return false;
    }
    return true;  // Hot path
}

// C++20 [[likely]] / [[unlikely]] attributes
void process_message(uint16_t msg_type) {
    switch (msg_type) {
        case 1: [[likely]]
            handle_quote_update();   // 90% of messages
            break;
        case 2:
            handle_trade();          // 9% of messages
            break;
        case 3: [[unlikely]]
            handle_auction();        // 1% of messages
            break;
    }
}

// Branchless min/max: eliminate branch entirely
inline int64_t branchless_min(int64_t a, int64_t b) {
    return b + ((a - b) & ((a - b) >> 63));
}

// Branchless clamp for order quantity
inline int64_t clamp_qty(int64_t qty, int64_t max_qty) {
    // Clamp to [0, max_qty] without branches
    int64_t clamped = qty - ((qty - max_qty) & ~((qty - max_qty) >> 63));
    return clamped & ~(clamped >> 63);  // Clamp negative to 0
}
```

### SIMD: SSE/AVX

```cpp
#include <immintrin.h>
#include <cstdint>

// Find best bid price >= threshold using AVX2
// Processes 4 doubles (32 bytes) per iteration
int find_price_level_avx(const double* prices, int count, double threshold) {
    __m256d thresh_vec = _mm256_set1_pd(threshold);

    for (int i = 0; i <= count - 4; i += 4) {
        __m256d prices_vec = _mm256_loadu_pd(&prices[i]);
        __m256d cmp = _mm256_cmp_pd(prices_vec, thresh_vec, _CMP_GE_OQ);
        int mask = _mm256_movemask_pd(cmp);

        if (mask) {
            return i + __builtin_ctz(mask);  // First matching index
        }
    }

    // Scalar fallback for remaining elements
    for (int i = (count / 4) * 4; i < count; ++i) {
        if (prices[i] >= threshold) return i;
    }
    return -1;
}

// SIMD VWAP calculation: 4 price-quantity multiplications at once
double simd_vwap(const double* prices, const double* quantities, int n) {
    __m256d sum_pq = _mm256_setzero_pd();
    __m256d sum_q  = _mm256_setzero_pd();

    int i = 0;
    for (; i <= n - 4; i += 4) {
        __m256d p = _mm256_loadu_pd(&prices[i]);
        __m256d q = _mm256_loadu_pd(&quantities[i]);
        sum_pq = _mm256_fmadd_pd(p, q, sum_pq);  // FMA: p*q + sum_pq
        sum_q  = _mm256_add_pd(sum_q, q);
    }

    // Horizontal sum
    double pq_arr[4], q_arr[4];
    _mm256_storeu_pd(pq_arr, sum_pq);
    _mm256_storeu_pd(q_arr, sum_q);

    double total_pq = pq_arr[0] + pq_arr[1] + pq_arr[2] + pq_arr[3];
    double total_q  = q_arr[0]  + q_arr[1]  + q_arr[2]  + q_arr[3];

    // Scalar remainder
    for (; i < n; ++i) {
        total_pq += prices[i] * quantities[i];
        total_q  += quantities[i];
    }

    return total_q > 0 ? total_pq / total_q : 0.0;
}
```

### Compiler Flags and Profile-Guided Optimization

```
COMPILATION FLAGS FOR LOW-LATENCY
====================================

Essential flags:
  -O3                    Aggressive optimization
  -march=native          Target current CPU (enables AVX, etc.)
  -flto                  Link-time optimization (cross-TU inlining)
  -DNDEBUG               Disable asserts

Profile-Guided Optimization (PGO):
  Step 1: g++ -O3 -fprofile-generate -o trading_system main.cpp
  Step 2: ./trading_system --replay historical_data.bin     (run with real data)
  Step 3: g++ -O3 -fprofile-use -o trading_system main.cpp  (recompile with profile)

  PGO benefit: 10-30% improvement from better branch prediction
               and code layout optimization.

Additional flags:
  -fno-exceptions        Remove exception overhead (if not using exceptions)
  -fno-rtti              Remove RTTI overhead (if not using dynamic_cast)
  -funroll-loops         Unroll small loops
  -falign-functions=64   Align functions to cache lines
  -ffast-math            Aggressive FP optimization (use with caution!)
```

### Hot/Cold Path Separation

```cpp
// Mark cold functions to keep them out of the instruction cache
__attribute__((noinline, cold))
void handle_error(int error_code, const char* context) {
    // Logging, alerting, recovery -- rarely called
}

__attribute__((noinline, cold))
void handle_gap_recovery(uint32_t expected, uint32_t received) {
    // Request retransmission -- rare event
}

// Hot path: inlined, optimized, minimal branching
__attribute__((always_inline, hot))
inline void on_market_data(const MarketDataMsg& msg, OrderBook& book) {
    // Fast path: update book
    book.update(msg.symbol, msg.bid_price, msg.bid_size,
                msg.ask_price, msg.ask_size);
}

// Separate hot and cold data
struct OrderHot {
    int64_t price;        // Used every tick
    int32_t quantity;     // Used every tick
    uint8_t side;         // Used every tick
};

struct OrderCold {
    uint64_t order_id;    // Used only for fills/cancels
    uint64_t timestamp;   // Used only for reporting
    char client_id[16];   // Used only for allocation
};
```

### System Tuning

```
LINUX SYSTEM TUNING FOR LOW-LATENCY
======================================

1. CPU Isolation (boot params):
   isolcpus=2,3,4,5 nohz_full=2,3,4,5 rcu_nocbs=2,3,4,5

2. Huge Pages (reduce TLB misses):
   echo 1024 > /proc/sys/vm/nr_hugepages
   mount -t hugetlbfs none /mnt/hugepages

3. Disable CPU frequency scaling:
   cpupower frequency-set -g performance

4. IRQ affinity (move interrupts off trading cores):
   echo 1 > /proc/irq/<NIC_IRQ>/smp_affinity

5. Kernel bypass:
   modprobe vfio-pci        # For DPDK
   # OR
   onload ./trading_system  # For OpenOnload

6. Memory locking (prevent page faults):
   mlockall(MCL_CURRENT | MCL_FUTURE);

7. Disable swap:
   swapoff -a
```

```cpp
// Huge pages allocation in C++
#include <sys/mman.h>

void* alloc_huge_pages(size_t size) {
    void* ptr = mmap(nullptr, size,
                     PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);
    if (ptr == MAP_FAILED) {
        throw std::runtime_error("Huge page allocation failed");
    }
    return ptr;
}

// Lock all memory to prevent page faults
void lock_memory() {
    if (mlockall(MCL_CURRENT | MCL_FUTURE) != 0) {
        throw std::runtime_error("mlockall failed");
    }
}
```

---

## 8. Data Structures for Trading

### Order Book Implementation

```
LIMIT ORDER BOOK STRUCTURE
=============================

         BIDS (buy orders)              ASKS (sell orders)
      Price  | Qty | Orders          Price  | Qty | Orders
      -------+-----+--------         -------+-----+--------
  --> 100.03 | 500 | [O1,O2]         100.04 | 200 | [O5]     <-- Best Ask
      100.02 | 300 | [O3]            100.05 | 800 | [O6,O7]
      100.01 | 150 | [O4]            100.06 | 100 | [O8]
      ^                                ^
      Best Bid                         Spread = 100.04 - 100.03 = 0.01

  Each price level: doubly-linked list of orders (FIFO)
  Levels indexed by price for O(1) lookup
```

```cpp
#include <cstdint>
#include <array>
#include <unordered_map>

// Fixed-point price: avoid floating-point entirely
using Price = int64_t;   // Price in ticks (e.g., 10003 = $100.03)
using Qty   = int32_t;
using OrdId = uint64_t;

struct Order {
    OrdId id;
    Price price;
    Qty quantity;
    Qty remaining;
    uint8_t side;        // 0=bid, 1=ask
    Order* prev = nullptr;
    Order* next = nullptr;
};

struct PriceLevel {
    Price price = 0;
    Qty total_qty = 0;
    int32_t order_count = 0;
    Order* head = nullptr;
    Order* tail = nullptr;

    void add_order(Order* order) {
        order->prev = tail;
        order->next = nullptr;
        if (tail) tail->next = order;
        else head = order;
        tail = order;
        total_qty += order->remaining;
        ++order_count;
    }

    void remove_order(Order* order) {
        if (order->prev) order->prev->next = order->next;
        else head = order->next;
        if (order->next) order->next->prev = order->prev;
        else tail = order->prev;
        total_qty -= order->remaining;
        --order_count;
    }
};

class OrderBook {
    static constexpr int MAX_LEVELS = 4096;

    std::array<PriceLevel, MAX_LEVELS> bid_levels_{};
    std::array<PriceLevel, MAX_LEVELS> ask_levels_{};
    std::unordered_map<OrdId, Order*> order_map_;  // O(1) cancel lookup
    PoolAllocator<Order, 1'000'000> order_pool_;   // Zero-alloc on hot path
    Price best_bid_ = 0;
    Price best_ask_ = std::numeric_limits<Price>::max();

    int price_to_index(Price p) const { return static_cast<int>(p % MAX_LEVELS); }

public:
    // Add order: O(1) average, cancel: O(1) via order_map_
    void add_order(OrdId id, Price price, Qty qty, uint8_t side);
    void cancel_order(OrdId id);
    Price best_bid() const { return best_bid_; }
    Price best_ask() const { return best_ask_; }
    Price spread() const { return best_ask_ - best_bid_; }

    // See Project 1 (Section 11) for complete compilable implementation
};
```

### Circular Buffer for Time Series

```cpp
#include <array>
#include <cstddef>
#include <optional>

// Fixed-size circular buffer: no allocation, O(1) push/access
template<typename T, size_t N>
class CircularBuffer {
    std::array<T, N> data_;
    size_t head_ = 0;     // Next write position
    size_t count_ = 0;

public:
    void push(const T& item) {
        data_[head_] = item;
        head_ = (head_ + 1) % N;
        if (count_ < N) ++count_;
    }

    // Access by age: 0 = newest, 1 = second newest, etc.
    const T& operator[](size_t age) const {
        size_t idx = (head_ - 1 - age + N) % N;
        return data_[idx];
    }

    size_t size() const { return count_; }
    bool full() const { return count_ == N; }

    // Compute rolling average (useful for VWAP, moving averages)
    T average() const {
        T sum{};
        for (size_t i = 0; i < count_; ++i)
            sum += data_[i];
        return sum / static_cast<T>(count_);
    }
};

// Usage: rolling window of last 1000 trades
CircularBuffer<double, 1000> trade_prices;
// trade_prices.push(100.05);
// double last = trade_prices[0];   // Most recent
// double avg  = trade_prices.average();
```

### Fast Hash Map

```cpp
#include <cstdint>
#include <cstring>
#include <array>

// Open-addressing hash map optimized for symbol lookup
// Symbols are typically 1-8 chars, so we use uint64_t as key
class SymbolMap {
    static constexpr size_t CAPACITY = 4096;  // Power of 2
    static constexpr size_t MASK = CAPACITY - 1;

    struct Entry {
        uint64_t key = 0;      // Symbol packed into uint64_t
        int32_t value = -1;    // Index into instrument array
        bool occupied = false;
    };

    std::array<Entry, CAPACITY> table_{};

    // Pack symbol string into uint64_t for fast comparison
    static uint64_t pack_symbol(const char* sym) {
        uint64_t result = 0;
        std::memcpy(&result, sym, std::min(std::strlen(sym), size_t(8)));
        return result;
    }

    static size_t hash(uint64_t key) {
        // Fibonacci hashing: good distribution
        return static_cast<size_t>((key * 11400714819323198485ULL) >> 52) & MASK;
    }

public:
    void insert(const char* symbol, int32_t index) {
        uint64_t key = pack_symbol(symbol);
        size_t pos = hash(key);

        while (table_[pos].occupied) {
            if (table_[pos].key == key) {
                table_[pos].value = index;
                return;
            }
            pos = (pos + 1) & MASK;  // Linear probing
        }
        table_[pos] = {key, index, true};
    }

    int32_t find(const char* symbol) const {
        uint64_t key = pack_symbol(symbol);
        size_t pos = hash(key);

        while (table_[pos].occupied) {
            if (table_[pos].key == key)
                return table_[pos].value;
            pos = (pos + 1) & MASK;
        }
        return -1;  // Not found
    }
};
```

### Timer Priority Queue

```cpp
#include <queue>
#include <functional>
#include <cstdint>
#include <vector>

struct TimerEvent {
    uint64_t trigger_time_ns;
    uint32_t timer_id;
    std::function<void()> callback;

    bool operator>(const TimerEvent& other) const {
        return trigger_time_ns > other.trigger_time_ns;
    }
};

class TimerQueue {
    std::priority_queue<TimerEvent, std::vector<TimerEvent>,
                        std::greater<TimerEvent>> heap_;
    uint32_t next_id_ = 0;

public:
    uint32_t schedule(uint64_t trigger_ns, std::function<void()> cb) {
        uint32_t id = next_id_++;
        heap_.push({trigger_ns, id, std::move(cb)});
        return id;
    }

    // Call from main loop with current time
    void process(uint64_t now_ns) {
        while (!heap_.empty() && heap_.top().trigger_time_ns <= now_ns) {
            auto event = heap_.top();
            heap_.pop();
            event.callback();
        }
    }

    bool empty() const { return heap_.empty(); }

    uint64_t next_trigger() const {
        return heap_.empty() ? UINT64_MAX : heap_.top().trigger_time_ns;
    }
};
```

**Performance note**: For hot-path timers, consider a timing wheel (O(1) insert/expire) instead of a heap (O(log n) insert).

---

## 9. Design Patterns for Trading Systems

### Strategy Pattern

```cpp
#include <memory>
#include <string_view>

// Runtime-polymorphic strategy (for non-hot-path use)
class IStrategy {
public:
    virtual ~IStrategy() = default;
    virtual void on_market_data(const MarketData& md) = 0;
    virtual void on_fill(const Fill& fill) = 0;
    virtual std::string_view name() const = 0;
};

class MeanReversionStrategy : public IStrategy {
    double lookback_mean_ = 0.0;
    double threshold_ = 2.0;
    int position_ = 0;

public:
    void on_market_data(const MarketData& md) override {
        double deviation = md.mid_price - lookback_mean_;
        if (deviation > threshold_ && position_ <= 0) {
            send_order(Side::Sell, md.ask_price, 100);
        } else if (deviation < -threshold_ && position_ >= 0) {
            send_order(Side::Buy, md.bid_price, 100);
        }
    }

    void on_fill(const Fill& fill) override {
        position_ += (fill.side == Side::Buy) ? fill.qty : -fill.qty;
    }

    std::string_view name() const override { return "MeanReversion"; }

private:
    void send_order(Side side, double price, int qty);
};

// For hot-path: use CRTP (see Section 4) instead of virtual dispatch
```

### Observer Pattern for Market Data

```cpp
#include <vector>
#include <functional>
#include <algorithm>
#include <cstdint>

// Lightweight observer: function callbacks, no virtual dispatch
class MarketDataBus {
public:
    using TickCallback  = std::function<void(const Tick&)>;
    using TradeCallback = std::function<void(const Trade&)>;
    using BookCallback  = std::function<void(const BookUpdate&)>;

private:
    std::vector<TickCallback> tick_listeners_;
    std::vector<TradeCallback> trade_listeners_;
    std::vector<BookCallback> book_listeners_;

public:
    void subscribe_ticks(TickCallback cb) {
        tick_listeners_.push_back(std::move(cb));
    }
    void subscribe_trades(TradeCallback cb) {
        trade_listeners_.push_back(std::move(cb));
    }
    void subscribe_book(BookCallback cb) {
        book_listeners_.push_back(std::move(cb));
    }

    void publish_tick(const Tick& tick) {
        for (auto& cb : tick_listeners_) cb(tick);
    }
    void publish_trade(const Trade& trade) {
        for (auto& cb : trade_listeners_) cb(trade);
    }
    void publish_book(const BookUpdate& update) {
        for (auto& cb : book_listeners_) cb(update);
    }
};
```

### State Machine for Order Lifecycle

```
ORDER STATE MACHINE
=====================

  +----------+   submit    +-----------+   ack     +----------+
  |  Created |------------>| Pending   |---------->| Active   |
  +----------+             +-----------+           +----------+
       |                        |                   |   |    |
       | reject                 | reject            |   |    |
       v                        v                   |   |    |
  +----------+             +-----------+            |   |    |
  | Rejected |             | Rejected  |            |   |    |
  +----------+             +-----------+            |   |    |
                                              fill  |   |    | cancel
                                           (partial)|   |    |
                                                    v   |    v
                                           +---------+  |  +-----------+
                                           | PartFill|  |  | Cancelled |
                                           +---------+  |  +-----------+
                                                |       |
                                           fill |  fill |
                                          (full)|  (full)|
                                                v       v
                                              +----------+
                                              |  Filled  |
                                              +----------+
```

```cpp
#include <cstdint>
#include <stdexcept>
#include <variant>

enum class OrderState : uint8_t {
    Created, Pending, Active, PartiallyFilled, Filled, Cancelled, Rejected
};

// Type-safe state machine with compile-time transition validation
class OrderStateMachine {
    OrderState state_ = OrderState::Created;
    int32_t filled_qty_ = 0;
    int32_t total_qty_ = 0;

public:
    explicit OrderStateMachine(int32_t qty) : total_qty_(qty) {}

    OrderState state() const { return state_; }

    bool submit() {
        if (state_ != OrderState::Created) return false;
        state_ = OrderState::Pending;
        return true;
    }

    bool acknowledge() {
        if (state_ != OrderState::Pending) return false;
        state_ = OrderState::Active;
        return true;
    }

    bool fill(int32_t qty) {
        if (state_ != OrderState::Active &&
            state_ != OrderState::PartiallyFilled)
            return false;

        filled_qty_ += qty;
        if (filled_qty_ >= total_qty_) {
            state_ = OrderState::Filled;
        } else {
            state_ = OrderState::PartiallyFilled;
        }
        return true;
    }

    bool cancel() {
        if (state_ != OrderState::Active &&
            state_ != OrderState::PartiallyFilled)
            return false;
        state_ = OrderState::Cancelled;
        return true;
    }

    bool reject() {
        if (state_ != OrderState::Created &&
            state_ != OrderState::Pending)
            return false;
        state_ = OrderState::Rejected;
        return true;
    }

    bool is_terminal() const {
        return state_ == OrderState::Filled ||
               state_ == OrderState::Cancelled ||
               state_ == OrderState::Rejected;
    }

    int32_t remaining() const { return total_qty_ - filled_qty_; }
};
```

---

## 10. Build Systems and Tooling

### CMake for Trading Systems

```cmake
cmake_minimum_required(VERSION 3.20)
project(TradingSystem LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Low-latency optimization flags
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -flto -DNDEBUG")
set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "-O3 -march=native -g -DNDEBUG")

# Optional: disable exceptions/RTTI for hot-path libs
option(NO_EXCEPTIONS "Disable exceptions" OFF)
if(NO_EXCEPTIONS)
    add_compile_options(-fno-exceptions -fno-rtti)
endif()

# Core library
add_library(trading_core
    src/order_book.cpp
    src/matching_engine.cpp
    src/feed_handler.cpp
    src/risk_manager.cpp
)
target_include_directories(trading_core PUBLIC include)
target_compile_options(trading_core PRIVATE
    -Wall -Wextra -Wpedantic
    -Wno-unused-parameter
    -falign-functions=64
)

# Main executable
add_executable(trading_system src/main.cpp)
target_link_libraries(trading_system PRIVATE trading_core pthread)

# Benchmarks
find_package(benchmark QUIET)
if(benchmark_FOUND)
    add_executable(bench_order_book bench/bench_order_book.cpp)
    target_link_libraries(bench_order_book PRIVATE trading_core benchmark::benchmark)
endif()

# Tests
enable_testing()
find_package(GTest REQUIRED)
add_executable(test_order_book test/test_order_book.cpp)
target_link_libraries(test_order_book PRIVATE trading_core GTest::gtest_main)
add_test(NAME OrderBookTest COMMAND test_order_book)
```

### Sanitizers

```
ADDRESS SANITIZER (ASan) - Detect memory errors
  g++ -fsanitize=address -fno-omit-frame-pointer -g main.cpp

  Catches:
  - Buffer overflow (stack, heap, global)
  - Use-after-free
  - Double-free
  - Memory leaks (with -fsanitize=leak)

THREAD SANITIZER (TSan) - Detect data races
  g++ -fsanitize=thread -g main.cpp

  Catches:
  - Data races between threads
  - Lock order violations
  - Use of non-thread-safe functions

UNDEFINED BEHAVIOR SANITIZER (UBSan)
  g++ -fsanitize=undefined -g main.cpp

  Catches:
  - Signed integer overflow
  - Null pointer dereference
  - Misaligned pointer access
  - Out-of-bounds array access

IMPORTANT: Never use sanitizers in production builds.
           They add 2-10x overhead.
```

### Profiling with perf

```
PROFILING WORKFLOW
====================

1. Record execution profile:
   $ perf record -g ./trading_system --replay data.bin

2. View hotspot report:
   $ perf report --sort=dso,symbol

3. Annotate source-level hotspots:
   $ perf annotate process_message

4. Stat counters (cache misses, branch mispredictions):
   $ perf stat -e cache-misses,cache-references,\
       branch-misses,branches,instructions,cycles \
       ./trading_system --replay data.bin

5. Sample output:
   Performance counter stats:
     12,345,678    cache-references
        234,567    cache-misses         #  1.90% of all cache refs
     98,765,432    branches
        876,543    branch-misses        #  0.89% of all branches
    987,654,321    instructions         #  2.13 insn per cycle
    463,456,789    cycles

   Good targets:
     cache-miss rate < 5%
     branch-miss rate < 2%
     IPC > 2.0
```

### GDB for Trading Systems

```
ESSENTIAL GDB COMMANDS
========================

# Start with core dump
gdb ./trading_system core.12345

# Breakpoints
b order_book.cpp:142                    # Line breakpoint
b OrderBook::add_order                  # Function breakpoint
b OrderBook::add_order if price > 10000 # Conditional breakpoint

# Examination
p book.best_bid_                        # Print variable
p/x msg->sequence_num                   # Print hex
x/16xb buffer                           # Examine 16 bytes as hex
info threads                            # List all threads
thread 3                                # Switch to thread 3
bt                                      # Backtrace

# Watchpoints (slow but powerful)
watch order->remaining                  # Break when value changes
rwatch position_map["AAPL"]             # Break on read

# Useful for debugging lock-free code
set scheduler-locking on                # Freeze other threads
set scheduler-locking step              # Only current thread steps
```

### Valgrind

```
# Memory leak detection
valgrind --leak-check=full --show-reachable=yes ./trading_system

# Cache simulation (measure cache behavior)
valgrind --tool=cachegrind ./trading_system --replay data.bin
cg_annotate cachegrind.out.<pid>

# Branch prediction analysis
valgrind --tool=callgrind --branch-sim=yes ./trading_system
callgrind_annotate callgrind.out.<pid>

Note: Valgrind runs 20-50x slower than native. Use for
correctness testing, not performance measurement.
Use `perf` for real performance profiling.
```

---

## 11. Projects

### Project 1: Simple Order Book

A compilable, self-contained order book with add, cancel, and matching.

```cpp
// file: simple_order_book.cpp
// compile: g++ -std=c++17 -O2 -o order_book simple_order_book.cpp
#include <iostream>
#include <map>
#include <list>
#include <unordered_map>
#include <cstdint>
#include <cassert>
#include <string>

enum class Side : uint8_t { Buy, Sell };

struct Order {
    uint64_t id;
    Side side;
    int64_t price;   // Fixed-point (cents)
    int32_t qty;
    int32_t remaining;
};

struct Fill {
    uint64_t buy_order_id;
    uint64_t sell_order_id;
    int64_t price;
    int32_t qty;
};

class SimpleOrderBook {
    // Bids: descending price (highest first)
    std::map<int64_t, std::list<Order*>, std::greater<>> bids_;
    // Asks: ascending price (lowest first)
    std::map<int64_t, std::list<Order*>, std::less<>> asks_;
    // Order ID lookup
    std::unordered_map<uint64_t, Order*> orders_;
    // Fill log
    std::vector<Fill> fills_;

public:
    ~SimpleOrderBook() {
        for (auto& [id, order] : orders_) delete order;
    }

    void add_order(uint64_t id, Side side, int64_t price, int32_t qty) {
        auto* order = new Order{id, side, price, qty, qty};
        orders_[id] = order;

        // Try to match
        if (side == Side::Buy) {
            match_buy(order);
            if (order->remaining > 0)
                bids_[price].push_back(order);
        } else {
            match_sell(order);
            if (order->remaining > 0)
                asks_[price].push_back(order);
        }
    }

    bool cancel_order(uint64_t id) {
        auto it = orders_.find(id);
        if (it == orders_.end()) return false;

        Order* order = it->second;
        if (order->side == Side::Buy) {
            remove_from_level(bids_, order);
        } else {
            remove_from_level(asks_, order);
        }
        orders_.erase(it);
        delete order;
        return true;
    }

    void print_book() const {
        std::cout << "\n=== ORDER BOOK ===\n";
        std::cout << "ASKS (sell):\n";
        for (auto it = asks_.rbegin(); it != asks_.rend(); ++it) {
            int32_t total = 0;
            for (auto* o : it->second) total += o->remaining;
            std::cout << "  $" << it->first / 100.0
                      << "  qty=" << total
                      << "  orders=" << it->second.size() << "\n";
        }
        std::cout << "  --- spread ---\n";
        std::cout << "BIDS (buy):\n";
        for (auto& [price, orders] : bids_) {
            int32_t total = 0;
            for (auto* o : orders) total += o->remaining;
            std::cout << "  $" << price / 100.0
                      << "  qty=" << total
                      << "  orders=" << orders.size() << "\n";
        }
    }

    const std::vector<Fill>& fills() const { return fills_; }

private:
    void match_buy(Order* buy_order) {
        while (buy_order->remaining > 0 && !asks_.empty()) {
            auto best_ask_it = asks_.begin();
            if (best_ask_it->first > buy_order->price) break;

            auto& ask_queue = best_ask_it->second;
            Order* sell_order = ask_queue.front();

            int32_t fill_qty = std::min(buy_order->remaining,
                                         sell_order->remaining);
            fills_.push_back({buy_order->id, sell_order->id,
                             sell_order->price, fill_qty});

            buy_order->remaining -= fill_qty;
            sell_order->remaining -= fill_qty;

            if (sell_order->remaining == 0) {
                ask_queue.pop_front();
                orders_.erase(sell_order->id);
                delete sell_order;
                if (ask_queue.empty())
                    asks_.erase(best_ask_it);
            }
        }
    }

    void match_sell(Order* sell_order) {
        while (sell_order->remaining > 0 && !bids_.empty()) {
            auto best_bid_it = bids_.begin();
            if (best_bid_it->first < sell_order->price) break;

            auto& bid_queue = best_bid_it->second;
            Order* buy_order = bid_queue.front();

            int32_t fill_qty = std::min(sell_order->remaining,
                                         buy_order->remaining);
            fills_.push_back({buy_order->id, sell_order->id,
                             buy_order->price, fill_qty});

            sell_order->remaining -= fill_qty;
            buy_order->remaining -= fill_qty;

            if (buy_order->remaining == 0) {
                bid_queue.pop_front();
                orders_.erase(buy_order->id);
                delete buy_order;
                if (bid_queue.empty())
                    bids_.erase(best_bid_it);
            }
        }
    }

    template<typename MapT>
    void remove_from_level(MapT& levels, Order* order) {
        auto level_it = levels.find(order->price);
        if (level_it == levels.end()) return;
        auto& queue = level_it->second;
        queue.remove(order);
        if (queue.empty()) levels.erase(level_it);
    }
};

int main() {
    SimpleOrderBook book;

    // Build some book depth
    book.add_order(1, Side::Buy,  10000, 100);  // Buy  100 @ $100.00
    book.add_order(2, Side::Buy,  9995,  200);  // Buy  200 @ $99.95
    book.add_order(3, Side::Buy,  9990,  150);  // Buy  150 @ $99.90
    book.add_order(4, Side::Sell, 10005, 100);  // Sell 100 @ $100.05
    book.add_order(5, Side::Sell, 10010, 200);  // Sell 200 @ $100.10
    book.add_order(6, Side::Sell, 10015, 150);  // Sell 150 @ $100.15

    std::cout << "Initial book:";
    book.print_book();

    // Aggressive buy crosses the spread
    book.add_order(7, Side::Buy, 10010, 150);
    std::cout << "\nAfter aggressive buy 150 @ $100.10:";
    book.print_book();

    // Print fills
    std::cout << "\nFills:\n";
    for (const auto& f : book.fills()) {
        std::cout << "  Buy#" << f.buy_order_id
                  << " x Sell#" << f.sell_order_id
                  << " @ $" << f.price / 100.0
                  << " qty=" << f.qty << "\n";
    }

    return 0;
}
```

### Project 2: Lock-Free SPSC Queue with Benchmarking

```cpp
// file: spsc_queue_bench.cpp
// compile: g++ -std=c++17 -O3 -march=native -pthread -o spsc_bench spsc_queue_bench.cpp
#include <atomic>
#include <array>
#include <optional>
#include <thread>
#include <chrono>
#include <iostream>
#include <cassert>
#include <new>

template<typename T, size_t Capacity>
class SPSCQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Must be power of 2");

    alignas(64) std::atomic<size_t> head_{0};
    alignas(64) std::atomic<size_t> tail_{0};
    alignas(64) std::array<T, Capacity> buffer_;

    static constexpr size_t MASK = Capacity - 1;

public:
    bool try_push(const T& item) {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        const size_t next = (tail + 1) & MASK;
        if (next == head_.load(std::memory_order_acquire))
            return false;
        buffer_[tail] = item;
        tail_.store(next, std::memory_order_release);
        return true;
    }

    std::optional<T> try_pop() {
        const size_t head = head_.load(std::memory_order_relaxed);
        if (head == tail_.load(std::memory_order_acquire))
            return std::nullopt;
        T item = buffer_[head];
        head_.store((head + 1) & MASK, std::memory_order_release);
        return item;
    }
};

struct MarketTick {
    uint64_t timestamp;
    double price;
    int32_t size;
    char symbol[8];
};

int main() {
    constexpr size_t QUEUE_SIZE = 1024 * 1024;  // 1M slots
    constexpr size_t NUM_MESSAGES = 10'000'000;

    SPSCQueue<MarketTick, QUEUE_SIZE> queue;
    std::atomic<bool> consumer_done{false};
    uint64_t total_latency_ns = 0;
    size_t received = 0;

    // Consumer thread
    std::thread consumer([&]() {
        while (received < NUM_MESSAGES) {
            auto tick = queue.try_pop();
            if (tick) {
                auto now = std::chrono::steady_clock::now().time_since_epoch().count();
                total_latency_ns += (now - tick->timestamp);
                ++received;
            }
        }
        consumer_done = true;
    });

    // Producer thread
    auto start = std::chrono::steady_clock::now();

    std::thread producer([&]() {
        for (size_t i = 0; i < NUM_MESSAGES; ++i) {
            MarketTick tick;
            tick.timestamp = std::chrono::steady_clock::now()
                                 .time_since_epoch().count();
            tick.price = 100.0 + (i % 100) * 0.01;
            tick.size = 100;

            while (!queue.try_push(tick)) {
                // Spin until space available
            }
        }
    });

    producer.join();
    consumer.join();

    auto end = std::chrono::steady_clock::now();
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                          end - start).count();

    std::cout << "SPSC Queue Benchmark\n";
    std::cout << "====================\n";
    std::cout << "Messages:      " << NUM_MESSAGES << "\n";
    std::cout << "Elapsed:       " << elapsed_ms << " ms\n";
    std::cout << "Throughput:    "
              << (NUM_MESSAGES * 1000ULL / elapsed_ms) << " msg/sec\n";
    std::cout << "Avg latency:   " << (total_latency_ns / received) << " ns\n";
    std::cout << "Per-message:   "
              << (elapsed_ms * 1'000'000.0 / NUM_MESSAGES) << " ns\n";

    return 0;
}
```

**Expected output** (on modern hardware):

```
SPSC Queue Benchmark
====================
Messages:      10000000
Elapsed:       85 ms
Throughput:    117647058 msg/sec
Avg latency:   42 ns
Per-message:   8.5 ns
```

### Project 3: Simple Matching Engine

Extend Project 1 into a multi-instrument matching engine. Key additions:

```cpp
// file: matching_engine.cpp
// compile: g++ -std=c++17 -O2 -o matching_engine matching_engine.cpp

// Key design: wrap SimpleOrderBook per instrument, add OrderType dispatch
enum class OrderType : uint8_t { Limit, Market, IOC };

class MatchingEngine {
    std::unordered_map<std::string, SimpleOrderBook> books_;
    uint64_t next_id_ = 1;

public:
    uint64_t submit(const std::string& symbol, Side side,
                    OrderType type, int64_t price, int32_t qty) {
        uint64_t id = next_id_++;
        auto& book = books_[symbol];

        // Market orders: use extreme price to sweep the book
        int64_t effective_price = price;
        if (type == OrderType::Market)
            effective_price = (side == Side::Buy) ? INT64_MAX : 0;

        book.add_order(id, side, effective_price, qty);

        // IOC: cancel any unfilled remainder
        if (type == OrderType::IOC)
            book.cancel_order(id);  // No-op if fully filled

        return id;
    }

    bool cancel(const std::string& sym, uint64_t id) {
        auto it = books_.find(sym);
        return it != books_.end() && it->second.cancel_order(id);
    }
};

// Extension exercises:
// 1. Add multi-symbol risk checks (max position per symbol)
// 2. Add execution reporting with timestamps
// 3. Add Stop and Stop-Limit order types
// 4. Benchmark: 1M orders should process in <500ms
```

---

## Summary: C++ Optimization Checklist for Trading

```
BEFORE PRODUCTION DEPLOYMENT
==============================

[ ] Memory
    [ ] No heap allocation on hot path
    [ ] Pre-allocated pools for all objects
    [ ] Cache-friendly data layout (SoA where beneficial)
    [ ] Memory locked (mlockall)
    [ ] Huge pages enabled

[ ] Threading
    [ ] Threads pinned to isolated cores
    [ ] Lock-free queues for inter-thread communication
    [ ] No mutex on hot path
    [ ] No false sharing (64-byte alignment)
    [ ] Real-time scheduling priority

[ ] Networking
    [ ] TCP_NODELAY enabled
    [ ] Kernel bypass or busy-poll configured
    [ ] Receive buffers sized appropriately
    [ ] Zero-copy message decoding

[ ] Compilation
    [ ] -O3 -march=native -flto
    [ ] PGO applied with representative workload
    [ ] Sanitizer-clean (ASan, TSan, UBSan)
    [ ] No warnings (-Wall -Wextra -Wpedantic)

[ ] Measurement
    [ ] Latency histograms (p50, p99, p99.9)
    [ ] perf profiling done
    [ ] Cache miss rate < 5%
    [ ] Branch miss rate < 2%

[ ] System
    [ ] CPU isolation (isolcpus)
    [ ] IRQ affinity configured
    [ ] Frequency governor: performance
    [ ] Swap disabled
    [ ] NUMA-aware allocation
```

---

## Further Reading

- **"C++ High Performance"** by Bjorn Andrist and Viktor Sehr
- **"The Art of Writing Efficient Programs"** by Fedor Pikus
- **"C++ Concurrency in Action"** by Anthony Williams
- **Effective Modern C++** by Scott Meyers (C++11/14 foundations)
- **CppCon talks** on low-latency trading: Carl Cook, David Gross, Fedor Pikus
- **Linux perf documentation**: https://perf.wiki.kernel.org
