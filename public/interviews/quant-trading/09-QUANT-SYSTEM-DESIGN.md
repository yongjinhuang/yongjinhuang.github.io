# Chapter 9: Quantitative System Design

## Building Trading Systems That Work

System design interviews at quant firms test your understanding of the full technology stack that powers modern electronic trading. Unlike generic system design (designing Twitter, designing a URL shortener), quant system design focuses on latency, correctness, determinism, and the unique constraints of financial markets.

This chapter covers the architecture of real trading systems, from nanosecond-sensitive market data handlers to backtesting frameworks that simulate months of trading in minutes. Firms like HRT, Jump, Citadel Securities, and Tower Research test this material extensively.

```
+------------------------------------------------------------------------+
|              TRADING SYSTEM ARCHITECTURE - FULL STACK                    |
+------------------------------------------------------------------------+
|                                                                        |
|  MARKET DATA LAYER                                                     |
|  +------------------+    +------------------+    +------------------+  |
|  | Feed Handlers     |    | Ticker Plant      |    | Book Builder     |  |
|  | (wire protocol)   |--->| (normalization)   |--->| (L2/L3 book)    |  |
|  +------------------+    +------------------+    +------------------+  |
|                                     |                                  |
|                                     v                                  |
|  STRATEGY LAYER                                                        |
|  +------------------+    +------------------+    +------------------+  |
|  | Signal Generator  |    | Alpha Model       |    | Portfolio Opt    |  |
|  | (features)        |--->| (prediction)      |--->| (construction)  |  |
|  +------------------+    +------------------+    +------------------+  |
|                                     |                                  |
|                                     v                                  |
|  EXECUTION LAYER                                                       |
|  +------------------+    +------------------+    +------------------+  |
|  | Risk Engine       |    | Order Manager     |    | Smart Router     |  |
|  | (pre-trade)       |--->| (state machine)   |--->| (venue select)  |  |
|  +------------------+    +------------------+    +------------------+  |
|                                     |                                  |
|                                     v                                  |
|  INFRASTRUCTURE                                                        |
|  +------------------+    +------------------+    +------------------+  |
|  | Monitoring        |    | Data Pipeline     |    | Backtesting      |  |
|  | (PnL, latency)   |    | (tick store)      |    | (simulation)     |  |
|  +------------------+    +------------------+    +------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Trading System Architecture

### 1.1 Component Overview

```
TRADING SYSTEM COMPONENTS AND DATA FLOW
=========================================

                    EXCHANGES
                   /    |    \
                  /     |     \
            NYSE     NASDAQ    BATS
              |        |        |
              v        v        v
        +---------------------------+
        |      FEED HANDLERS         |       <- Wire protocol parsing
        |  FIX | ITCH | OUCH | PITCH |       <- Sequence number tracking
        +---------------------------+        <- Gap detection & recovery
                    |
                    v
        +---------------------------+
        |      TICKER PLANT          |       <- Normalization
        |  Conflation | Book Build   |       <- Derived data computation
        |  Last sale | NBBO          |       <- Distribution (pub/sub)
        +---------------------------+
              |          |
              v          v
     +------------+  +----------+
     | STRATEGY   |  |   RISK   |      Strategy: signal computation
     | ENGINE     |  |  ENGINE  |      Risk: position limits, Greeks
     +-----+------+  +----+-----+
           |               |
           v               v
     +---------------------------+
     |    ORDER MANAGEMENT        |      <- Order lifecycle
     |    SYSTEM (OMS)            |      <- Fill reconciliation
     +---------------------------+      <- Position keeping
                |
                v
     +---------------------------+
     |   SMART ORDER ROUTER      |      <- Venue selection
     |   (SOR)                   |      <- Order splitting
     +---------------------------+      <- Latency optimization
              |     |      |
              v     v      v
           NYSE  NASDAQ   DARK
                          POOLS
```

### 1.2 Event-Driven Architecture

```
EVENT-DRIVEN TRADING SYSTEM
=============================

All components communicate via events (messages).
No polling, no shared state, no tight coupling.

Event types:
+---------------------+------------------------------------------+
| Event               | Data                                      |
+---------------------+------------------------------------------+
| MarketDataUpdate    | symbol, bid, ask, last, volume, timestamp |
| Signal              | symbol, alpha, confidence, timestamp      |
| OrderRequest        | symbol, side, qty, price, type            |
| OrderAck            | order_id, status, exchange_timestamp      |
| Fill                | order_id, fill_price, fill_qty, fee       |
| PositionUpdate      | symbol, qty, avg_price, pnl              |
| RiskAlert           | type, level, message                      |
+---------------------+------------------------------------------+

Event Bus Architecture:

  +----------+    +----------+    +----------+
  | Producer |    | Producer |    | Producer |
  | (Feed)   |    | (Strategy)|   | (OMS)    |
  +----+-----+    +-----+----+    +-----+----+
       |               |               |
       v               v               v
  +------------------------------------------+
  |            EVENT BUS / RING BUFFER         |
  |  (Disruptor pattern, lock-free, SPSC)     |
  +------------------------------------------+
       |               |               |
       v               v               v
  +----------+    +----------+    +----------+
  | Consumer |    | Consumer |    | Consumer |
  | (Strategy)|   | (Risk)   |    | (Logger) |
  +----------+    +----------+    +----------+

Key design principle:
  Single-writer, multiple-reader (SWMR)
  Each event is written once, read by many consumers
  No locks, no contention, predictable latency
```

---

## 2. Low-Latency Engineering

### 2.1 The Latency Stack

```
LATENCY BREAKDOWN (typical HFT system)
========================================

Component                    | Latency
-----------------------------|------------------
Network (exchange to colo)   | 0-50 nanoseconds (same building)
NIC to userspace (kernel)    | 1-10 microseconds
NIC to userspace (bypass)    | 200-500 nanoseconds
Feed handler parsing         | 100-500 nanoseconds
Book update                  | 50-200 nanoseconds
Signal computation           | 100 ns - 5 microseconds
Risk check                   | 50-200 nanoseconds
Order serialization          | 100-500 nanoseconds
NIC transmission             | 200-500 nanoseconds
                             |
Total (kernel networking):   | 5-50 microseconds
Total (kernel bypass):       | 1-5 microseconds
Total (FPGA):                | 100-500 nanoseconds

"Tick-to-trade" = time from receiving market data to sending order
```

### 2.2 Kernel Bypass Networking

```
TRADITIONAL NETWORKING (via kernel)
====================================

  NIC -> Kernel (interrupt) -> Socket buffer -> copy to userspace
                                                     |
  Latency: 5-15 microseconds                        v
                                              Application

KERNEL BYPASS (DPDK / Solarflare OpenOnload)
=============================================

  NIC -> Userspace (poll / busy-wait)
           |
  Latency: 200-500 nanoseconds
           |
           v
      Application

How it works:
  - Map NIC's packet buffers directly into userspace memory
  - Application polls the NIC directly (no system calls)
  - No context switches, no interrupts, no kernel overhead
  - Requires dedicating CPU cores to polling (busy-wait)

Technologies:
  +-------------------+----------------------------------------+
  | Technology        | Description                             |
  +-------------------+----------------------------------------+
  | DPDK              | Intel's Data Plane Development Kit       |
  |                   | Polls NIC directly from userspace        |
  +-------------------+----------------------------------------+
  | Solarflare        | SmartNIC with OpenOnload                 |
  | OpenOnload        | Kernel bypass via LD_PRELOAD             |
  +-------------------+----------------------------------------+
  | Mellanox VMA      | Verbs-based acceleration                 |
  +-------------------+----------------------------------------+
  | io_uring          | Async I/O (Linux 5.1+), not zero-copy   |
  |                   | but lower overhead than epoll            |
  +-------------------+----------------------------------------+
```

### 2.3 Lock-Free Data Structures

```
LOCK-FREE RING BUFFER (SPSC - Single Producer Single Consumer)
================================================================

This is the fundamental data structure for inter-thread
communication in low-latency systems.

  +---+---+---+---+---+---+---+---+
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |  capacity = 8
  +---+---+---+---+---+---+---+---+
        ^               ^
        |               |
      read_idx        write_idx
      (consumer)      (producer)

Rules:
  - Producer writes at write_idx, then increments
  - Consumer reads at read_idx, then increments
  - Buffer full when (write_idx + 1) % cap == read_idx
  - Buffer empty when write_idx == read_idx
  - No locks needed! Atomic operations on indices suffice.

Critical: Prevent compiler/CPU reordering with memory barriers
  - Store-release on write_idx update (producer)
  - Load-acquire on read_idx check (producer) and write_idx check (consumer)
```

```python
import multiprocessing as mp
import ctypes


class SPSCRingBuffer:
    """
    Lock-free single-producer single-consumer ring buffer.
    Uses shared memory for inter-process communication.
    For demonstration; production code would use C/C++ with atomics.
    """

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._buffer = mp.Array(ctypes.c_double, capacity)
        self._write_idx = mp.Value(ctypes.c_long, 0)
        self._read_idx = mp.Value(ctypes.c_long, 0)

    def push(self, value: float) -> bool:
        """Producer: write value. Returns False if full."""
        next_write = (self._write_idx.value + 1) % self._capacity
        if next_write == self._read_idx.value:
            return False  # Full

        self._buffer[self._write_idx.value] = value
        self._write_idx.value = next_write
        return True

    def pop(self) -> float:
        """Consumer: read value. Returns None if empty."""
        if self._read_idx.value == self._write_idx.value:
            return None  # Empty

        value = self._buffer[self._read_idx.value]
        self._read_idx.value = (
            (self._read_idx.value + 1) % self._capacity
        )
        return value
```

### 2.4 CPU and Memory Optimization

```
CPU OPTIMIZATION TECHNIQUES
=============================

1. CPU PINNING (Affinity)
   - Pin critical threads to specific CPU cores
   - Prevents OS from migrating threads (cache thrashing)
   - Use isolcpus kernel parameter to reserve cores

   taskset -c 4 ./trading_engine
   # OR in code: pthread_setaffinity_np()

2. NUMA AWARENESS
   - Modern servers have multiple CPU sockets
   - Each socket has its own memory bank (NUMA node)
   - Accessing remote NUMA memory is 2-3x slower
   - Allocate memory on the same NUMA node as the CPU

   numactl --cpunodebind=0 --membind=0 ./trading_engine

3. CACHE LINE OPTIMIZATION
   - Cache line = 64 bytes on x86
   - Align data structures to cache line boundaries
   - Avoid false sharing: pad shared variables to 64 bytes
   - Keep hot data contiguous in memory

   struct __attribute__((aligned(64))) PriceLevel {
       double price;
       int64_t quantity;
       // Padding to fill 64 bytes
       char _pad[48];
   };

4. BUSY-WAIT vs. SLEEP
   - Busy-wait: spin on a condition (lowest latency, burns CPU)
   - Sleep: yield CPU and wait for wakeup (higher latency, saves CPU)
   - In HFT: ALWAYS busy-wait on critical path
   - Acceptable to dedicate entire CPU cores to spinning

   // Busy-wait loop
   while (!has_data()) {
       _mm_pause();  // Reduce power consumption while spinning
   }

5. BRANCH PREDICTION
   - Use __builtin_expect() for likely/unlikely branches
   - Sort conditional checks by probability
   - Use branchless code where possible (cmov)
   - Profile with perf stat to find mispredictions

6. PREFETCHING
   - Hint CPU to load data into cache before it's needed
   - __builtin_prefetch(addr, 0, 3);  // read, high locality
   - Useful when iterating over arrays with known access patterns
```

---

## 3. Market Data Systems

### 3.1 Ticker Plant Design

```
TICKER PLANT ARCHITECTURE
===========================

  Raw Feed (binary)
       |
       v
  +------------------------------------------+
  |  PARSER                                   |
  |  - Protocol-specific (ITCH, PITCH, etc.)  |
  |  - Zero-copy parsing where possible       |
  |  - Validates sequence numbers             |
  +------------------------------------------+
       |
       v
  +------------------------------------------+
  |  NORMALIZER                               |
  |  - Convert to internal format             |
  |  - Unified symbol mapping                 |
  |  - Timestamp normalization (exchange ->   |
  |    local clock)                           |
  +------------------------------------------+
       |
       v
  +------------------------------------------+
  |  BOOK BUILDER                             |
  |  - Maintain full L2/L3 order book         |
  |  - Apply add/modify/delete/trade events   |
  |  - Compute derived data (VWAP, imbalance) |
  +------------------------------------------+
       |
       v
  +------------------------------------------+
  |  PUBLISHER                                |
  |  - Multicast to consumers                 |
  |  - Conflation (optional)                  |
  |  - Snapshot service (for late joiners)    |
  +------------------------------------------+

SNAPSHOT + INCREMENTAL PATTERN
================================

Problem: How does a new consumer get the current state?

Solution:
1. Consumer subscribes to incremental feed (real-time updates)
2. Consumer requests a SNAPSHOT (current state of all books)
3. Consumer buffers incremental updates while waiting for snapshot
4. When snapshot arrives, apply all buffered updates with
   sequence number > snapshot's sequence number
5. Now in sync; process incremental updates normally

  Time --->
  |--buffer increments--|--apply snapshot--|--live processing--|
                        ^
                  snapshot arrives

This is the standard pattern used by all exchanges (e.g., CME MDP 3.0).
```

### 3.2 Conflation

```
CONFLATION STRATEGIES
======================

When the market data rate exceeds the consumer's processing rate,
conflation reduces the update frequency while preserving information.

1. LAST-VALUE CONFLATION
   Keep only the most recent update for each symbol.
   Simple, but loses intermediate tick information.

   Updates: A=10, B=20, A=11, A=12, B=21
   After conflation: A=12, B=21

2. TIME-BASED CONFLATION
   Aggregate updates within a fixed time window.
   E.g., publish at most once per millisecond per symbol.

3. CHANGE-BASED CONFLATION
   Only publish when value changes by more than threshold.
   E.g., publish when mid-price moves > 0.01%.

4. PRIORITY-BASED CONFLATION
   Trades and BBO changes always published immediately.
   Deep book updates may be conflated.

Implementation (lock-free):
  +---------+     +---------+     +---------+
  | Producer| --> | Conflation| --> | Consumer|
  | (Feed)  |     | Buffer   |     | (Strat) |
  +---------+     +---------+     +---------+

  Buffer: one slot per symbol.
  Producer overwrites slot (atomic write).
  Consumer polls and reads (atomic read).
  Natural last-value conflation with zero overhead.
```

---

## 4. Backtesting Infrastructure

### 4.1 Event-Driven vs. Vectorized Backtesting

```
BACKTESTING ARCHITECTURES
===========================

1. VECTORIZED (fast, less realistic)
   - Process entire time series at once using NumPy/pandas
   - Signal = function of entire price matrix
   - No event-by-event simulation
   - Fast: can backtest years of data in seconds
   - Limitations: Cannot model order-by-order fills,
     latency, partial fills, or complex order types

   # Vectorized example
   signals = compute_signals(prices)  # All at once
   returns = signals.shift(1) * daily_returns  # Assumes perfect fill
   sharpe = returns.mean() / returns.std() * sqrt(252)

2. EVENT-DRIVEN (slower, more realistic)
   - Process one event at a time (tick, bar, fill)
   - Maintains state (positions, orders, P&L)
   - Can model realistic fills, slippage, latency
   - Slower: may take hours for large backtests
   - Production-grade: same code can run live

   # Event-driven example
   for event in events:
       if isinstance(event, MarketDataEvent):
           signals = strategy.on_data(event)
           for signal in signals:
               risk_check(signal)
               submit_order(signal)
       elif isinstance(event, FillEvent):
           update_positions(event)
           update_pnl(event)

3. HYBRID (best of both worlds)
   - Use vectorized for initial research (fast iteration)
   - Validate promising strategies with event-driven
   - Production code is event-driven
   - Keep signal generation logic the same in both modes

COMPARISON
===========

Metric              | Vectorized | Event-Driven
--------------------|------------|-------------
Speed (1yr equity)  | 2 seconds  | 30 minutes
Fill modeling       | Simplistic | Realistic
Latency modeling    | None       | Yes
Partial fills       | No         | Yes
Order types         | Market only| All
Code reuse (live)   | None       | High
Development time    | Fast       | Slow
```

### 4.2 Simulation Clock and Fill Modeling

```
SIMULATION CLOCK
=================

A backtesting engine needs a deterministic clock that advances
only when the next event is processed.

  SimClock.now() returns the timestamp of the CURRENT event
  NOT the wall-clock time

Event queue (priority queue sorted by timestamp):

  Time     | Type           | Data
  ---------|----------------|----------------------------------
  09:30:01 | MarketData     | AAPL bid=150.00, ask=150.02
  09:30:01 | MarketData     | MSFT bid=310.50, ask=310.55
  09:30:02 | MarketData     | AAPL bid=150.01, ask=150.03
  09:30:02 | OrderAck       | Order#1 acknowledged
  09:30:03 | Fill           | Order#1 filled at 150.02

FILL MODELING
==============

1. IMMEDIATE FILL (simplistic)
   Market orders fill at current bid/ask
   Limit orders fill if price crosses

2. VOLUME-BASED FILL (better)
   Your fill cannot exceed X% of bar volume
   Remaining unfilled portion carries to next bar

3. QUEUE POSITION (realistic)
   Model your position in the queue at a price level
   Fill only after enough volume trades through

4. MARKET IMPACT (best)
   Large orders move the price against you
   Use Almgren-Chriss or similar model

   Fill price = arrival_price + impact(trade_size, ADV, sigma)
   Temporary impact: reverts after your trade
   Permanent impact: information content of your trade
```

### 4.3 Backtesting Framework Design

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from enum import Enum
import heapq
import numpy as np
import pandas as pd


class EventType(Enum):
    MARKET_DATA = 1
    ORDER_ACK = 2
    FILL = 3
    TIMER = 4


@dataclass(frozen=True)
class Event:
    timestamp: float
    event_type: EventType
    data: dict

    def __lt__(self, other):
        return self.timestamp < other.timestamp


class SimulationClock:
    """Deterministic simulation clock."""

    def __init__(self):
        self._time = 0.0

    def advance(self, timestamp: float) -> None:
        if timestamp < self._time:
            raise ValueError("Cannot go backwards in time")
        self._time = timestamp

    @property
    def now(self) -> float:
        return self._time


class EventQueue:
    """Priority queue of events sorted by timestamp."""

    def __init__(self):
        self._queue: list[Event] = []

    def push(self, event: Event) -> None:
        heapq.heappush(self._queue, event)

    def pop(self) -> Optional[Event]:
        if not self._queue:
            return None
        return heapq.heappop(self._queue)

    def __len__(self) -> int:
        return len(self._queue)


class FillModel(ABC):
    """Abstract fill model."""

    @abstractmethod
    def simulate(self, order: dict, market_data: dict) -> Optional[dict]:
        pass


class SimpleFillModel(FillModel):
    """
    Simple fill model: market orders fill at bid/ask with slippage.
    Limit orders fill if price crosses.
    """

    def __init__(self, slippage_bps: float = 1.0):
        self._slippage_bps = slippage_bps

    def simulate(self, order: dict, market_data: dict) -> Optional[dict]:
        if order['type'] == 'market':
            if order['side'] == 'buy':
                fill_price = market_data['ask'] * (
                    1 + self._slippage_bps / 10000
                )
            else:
                fill_price = market_data['bid'] * (
                    1 - self._slippage_bps / 10000
                )
            return {
                'order_id': order['id'],
                'fill_price': fill_price,
                'fill_qty': order['qty'],
            }

        if order['type'] == 'limit':
            if (order['side'] == 'buy'
                    and market_data['ask'] <= order['price']):
                return {
                    'order_id': order['id'],
                    'fill_price': order['price'],
                    'fill_qty': order['qty'],
                }
            if (order['side'] == 'sell'
                    and market_data['bid'] >= order['price']):
                return {
                    'order_id': order['id'],
                    'fill_price': order['price'],
                    'fill_qty': order['qty'],
                }

        return None


class PositionTracker:
    """Track positions and P&L."""

    def __init__(self, initial_capital: float):
        self._capital = initial_capital
        self._positions: dict[str, dict] = {}
        self._equity_curve: list[tuple[float, float]] = []

    def on_fill(self, symbol: str, side: str,
                qty: int, price: float) -> None:
        if symbol not in self._positions:
            self._positions[symbol] = {
                'qty': 0, 'avg_price': 0.0, 'rpnl': 0.0,
            }

        pos = self._positions[symbol]
        if side == 'buy':
            new_qty = pos['qty'] + qty
            if new_qty != 0:
                new_avg = (
                    pos['qty'] * pos['avg_price'] + qty * price
                ) / new_qty
            else:
                new_avg = 0.0
            self._positions[symbol] = {
                'qty': new_qty,
                'avg_price': new_avg,
                'rpnl': pos['rpnl'],
            }
        else:  # sell
            closed = min(qty, pos['qty'])
            rpnl = closed * (price - pos['avg_price'])
            new_qty = pos['qty'] - qty
            self._positions[symbol] = {
                'qty': new_qty,
                'avg_price': pos['avg_price'] if new_qty > 0 else 0.0,
                'rpnl': pos['rpnl'] + rpnl,
            }

    def mark_to_market(self, prices: dict[str, float],
                       timestamp: float) -> float:
        equity = self._capital
        for sym, pos in self._positions.items():
            equity += pos['rpnl']
            if sym in prices and pos['qty'] != 0:
                equity += pos['qty'] * (prices[sym] - pos['avg_price'])
        self._equity_curve.append((timestamp, equity))
        return equity

    def get_equity_curve(self) -> pd.DataFrame:
        return pd.DataFrame(
            self._equity_curve, columns=['timestamp', 'equity']
        )
```

---

## 5. Risk Systems

### 5.1 Real-Time Risk Architecture

```
REAL-TIME RISK ENGINE
======================

  Market Data ----+
                  |
  Positions ------+--> RISK ENGINE --+--> Dashboard
                  |                   |
  Orders ---------+                   +--> Alerts
                                      |
                                      +--> Kill Switch

Risk checks (in order of execution speed):

PRE-TRADE CHECKS (< 1 microsecond):
  1. Order size limit (single order cannot exceed X shares)
  2. Price reasonability (order price within Y% of market)
  3. Position limit (total position cannot exceed Z)
  4. Rate limit (max N orders per second)
  5. Fat finger check (notional value within bounds)

REAL-TIME MONITORING (continuous):
  1. Portfolio delta / beta exposure
  2. Sector concentration
  3. Single-name concentration
  4. Greeks exposure (for options: delta, gamma, vega)
  5. Mark-to-market P&L
  6. Drawdown from peak

KILL SWITCH TRIGGERS:
  1. Portfolio drawdown exceeds limit (e.g., > 5% daily)
  2. Single position loss exceeds limit
  3. Abnormal fill patterns (runaway algorithm)
  4. Connectivity loss to exchange
  5. Market data staleness (no updates in X seconds)

  Kill switch action:
  - Cancel ALL open orders immediately
  - Flatten ALL positions (market orders to close)
  - Disable all strategy engines
  - Alert operations team
```

### 5.2 Pre-Trade Risk Checks

```python
from dataclasses import dataclass
from enum import Enum


class RiskCheckResult(Enum):
    PASS = "pass"
    REJECT = "reject"
    WARN = "warn"


@dataclass(frozen=True)
class RiskLimits:
    max_order_size: int
    max_position_size: int
    max_notional_per_order: float
    max_daily_loss: float
    max_orders_per_second: int
    price_band_pct: float  # e.g., 0.05 for 5%


class PreTradeRiskEngine:
    """
    Pre-trade risk checks. Must execute in < 1 microsecond.
    All checks are simple comparisons (no network calls).
    """

    def __init__(self, limits: RiskLimits):
        self._limits = limits
        self._order_timestamps: list[float] = []
        self._daily_pnl = 0.0

    def check_order(self, order: dict, position: dict,
                    market_data: dict, timestamp: float
                    ) -> tuple[RiskCheckResult, str]:
        """
        Run all pre-trade risk checks.
        Returns (result, reason).
        """
        # 1. Order size check
        if abs(order['qty']) > self._limits.max_order_size:
            return (
                RiskCheckResult.REJECT,
                f"Order size {order['qty']} exceeds limit "
                f"{self._limits.max_order_size}"
            )

        # 2. Position limit check
        new_position = position.get('qty', 0)
        if order['side'] == 'buy':
            new_position += order['qty']
        else:
            new_position -= order['qty']

        if abs(new_position) > self._limits.max_position_size:
            return (
                RiskCheckResult.REJECT,
                f"Resulting position {new_position} exceeds limit "
                f"{self._limits.max_position_size}"
            )

        # 3. Price reasonability (fat finger check)
        mid = (market_data['bid'] + market_data['ask']) / 2
        if order.get('price'):
            deviation = abs(order['price'] - mid) / mid
            if deviation > self._limits.price_band_pct:
                return (
                    RiskCheckResult.REJECT,
                    f"Price {order['price']} deviates {deviation:.1%} "
                    f"from mid {mid}"
                )

        # 4. Notional check
        price = order.get('price', mid)
        notional = abs(order['qty'] * price)
        if notional > self._limits.max_notional_per_order:
            return (
                RiskCheckResult.REJECT,
                f"Notional ${notional:,.0f} exceeds limit "
                f"${self._limits.max_notional_per_order:,.0f}"
            )

        # 5. Rate limit check
        cutoff = timestamp - 1.0  # 1-second window
        self._order_timestamps = [
            t for t in self._order_timestamps if t > cutoff
        ]
        if len(self._order_timestamps) >= self._limits.max_orders_per_second:
            return (
                RiskCheckResult.REJECT,
                f"Rate limit: {len(self._order_timestamps)} orders/sec"
            )
        self._order_timestamps.append(timestamp)

        # 6. Daily loss limit
        if self._daily_pnl < -self._limits.max_daily_loss:
            return (
                RiskCheckResult.REJECT,
                f"Daily loss ${-self._daily_pnl:,.0f} exceeds limit "
                f"${self._limits.max_daily_loss:,.0f}"
            )

        return (RiskCheckResult.PASS, "All checks passed")

    def update_pnl(self, pnl_change: float) -> None:
        self._daily_pnl += pnl_change


# Example
limits = RiskLimits(
    max_order_size=10000,
    max_position_size=50000,
    max_notional_per_order=5_000_000,
    max_daily_loss=500_000,
    max_orders_per_second=100,
    price_band_pct=0.05,
)

risk = PreTradeRiskEngine(limits)

result, reason = risk.check_order(
    order={'side': 'buy', 'qty': 500, 'price': 150.0, 'type': 'limit'},
    position={'qty': 1000},
    market_data={'bid': 149.90, 'ask': 150.10},
    timestamp=1000.0,
)
print(f"Risk check: {result.value} - {reason}")
```

---

## 6. Data Pipeline

### 6.1 Tick Data Storage

```
TICK DATA STORAGE OPTIONS
===========================

+-------------------+------------------+------------------+------------------+
| Technology        | Write Speed       | Read Speed        | Storage          |
+-------------------+------------------+------------------+------------------+
| CSV files         | Slow              | Slow              | Large            |
| HDF5 (PyTables)   | Medium            | Fast              | Medium           |
| Parquet           | Fast (columnar)   | Very Fast         | Small (compressed)|
| InfluxDB          | Fast              | Fast (time-range) | Medium           |
| Arctic (MongoDB)  | Fast              | Fast              | Medium           |
| kdb+/q            | Very Fast         | Very Fast         | Small            |
| QuestDB           | Very Fast         | Fast (SQL)        | Medium           |
+-------------------+------------------+------------------+------------------+

PARQUET is the modern standard for quant research:
  - Columnar format (read only columns you need)
  - Excellent compression (snappy, zstd)
  - Predicate pushdown (filter before reading)
  - Partitioning by date/symbol for fast access
  - Native support in pandas, PyArrow, DuckDB

Directory structure:
  data/
    ticks/
      symbol=AAPL/
        date=2024-01-02/part-000.parquet
        date=2024-01-03/part-000.parquet
      symbol=MSFT/
        date=2024-01-02/part-000.parquet

  This partitioning allows:
    - Read only AAPL data: skip MSFT partitions entirely
    - Read only Jan 3: skip Jan 2 partitions
    - Very efficient for typical access patterns
```

### 6.2 Data Quality Pipeline

```
DATA QUALITY CHECKS
=====================

  Raw Data --> Validation --> Cleaning --> Enrichment --> Storage
                  |               |             |
                  v               v             v
              Error Log       Audit Trail    Metadata

Validation checks:
  1. Schema validation (correct columns, types)
  2. Timestamp monotonicity (no backwards time)
  3. Price reasonability (within X% of previous close)
  4. Volume non-negativity
  5. Bid < Ask constraint
  6. No duplicate records (by timestamp + symbol)

Cleaning rules:
  1. Remove trades during exchange halts
  2. Filter clearly erroneous prints (> 10% from NBBO)
  3. Handle stock splits (adjust historical prices)
  4. Handle dividends (adjust for total return)
  5. Merge venue data to consolidated tape

Corporate actions:
  +------------------+-------------------------------------------+
  | Action           | Adjustment                                 |
  +------------------+-------------------------------------------+
  | Stock split      | Divide historical prices by split ratio    |
  | Reverse split    | Multiply historical prices                 |
  | Cash dividend    | Subtract from historical prices (optional) |
  | Stock dividend   | Apply adjustment factor                    |
  | Spinoff          | Allocate value between parent and child    |
  | Merger           | Map to acquiring company                   |
  +------------------+-------------------------------------------+
```

---

## 7. Monitoring and Observability

### 7.1 PnL Attribution

```
PNL ATTRIBUTION
================

Total P&L = Market P&L + Trading P&L + Funding P&L

Market P&L decomposition:
  dPnL = sum_i [delta_i * dS_i]                 (first order)
       + 0.5 * sum_i [gamma_i * (dS_i)^2]       (convexity)
       + sum_i [theta_i * dt]                     (time decay)
       + sum_i [vega_i * d(sigma_i)]             (vol change)
       + cross terms (vanna, volga)
       + residual (unexplained)

Trading P&L:
  - Realized spread (difference between fill and mid at time of trade)
  - Market impact cost
  - Commission cost

Key metrics to monitor:
  +----------------------------+----------------------------------+
  | Metric                     | Alert Threshold                   |
  +----------------------------+----------------------------------+
  | Daily P&L                  | > 2 * avg daily P&L               |
  | Sharpe (rolling 20-day)    | < 0.5 annualized                  |
  | Max drawdown               | > 5% from peak                    |
  | Position concentration     | > 20% in single name              |
  | Turnover                   | > 3x daily average                |
  | Fill rate                  | < 80% of historical avg           |
  | Slippage vs estimate       | > 2x modeled slippage             |
  | Correlation to benchmark   | |rho| > 0.8 (unintended beta)    |
  +----------------------------+----------------------------------+
```

### 7.2 Execution Quality Metrics

```
EXECUTION QUALITY ANALYSIS
============================

1. IMPLEMENTATION SHORTFALL (IS)
   IS = (Decision Price - Execution Price) * Quantity / Notional

   Decision price = mid-price at time of signal
   Execution price = actual average fill price
   IS captures ALL costs: spread, impact, delay, missed trades

2. ARRIVAL PRICE BENCHMARK
   Compare fill price to mid-price at order arrival
   Measures execution quality of the router/algo

3. VWAP BENCHMARK
   Compare fill price to market VWAP over execution window
   VWAP = sum(price_i * volume_i) / sum(volume_i)

4. FILL RATE
   Percentage of orders that receive fills
   Fill rate too low -> missing opportunities
   Fill rate too high -> possible adverse selection

5. LATENCY METRICS
   Tick-to-trade: market data receipt to order submission
   Order-to-ack: submission to exchange acknowledgment
   Order-to-fill: submission to fill
   99th percentile matters more than median (tail latency)
```

---

## 8. Technology Choices

### 8.1 Language Selection by Use Case

```
LANGUAGE SELECTION FOR QUANT SYSTEMS
======================================

+-------------------+---------------------------+---------------------------+
| Use Case          | Primary Language            | Why                        |
+-------------------+---------------------------+---------------------------+
| Research/Alpha    | Python                     | Fast iteration, libraries   |
|                   | (NumPy, pandas, sklearn)   | Easy prototyping            |
+-------------------+---------------------------+---------------------------+
| Production        | C++ (or Rust)              | Deterministic latency       |
| Trading Engine    |                            | Zero GC pauses              |
|                   |                            | Direct hardware access      |
+-------------------+---------------------------+---------------------------+
| Infrastructure    | Java/Kotlin                | Good for OMS, risk          |
|                   |                            | Large ecosystem, GC ok      |
+-------------------+---------------------------+---------------------------+
| Ultra-low         | FPGA (Verilog/VHDL)        | Sub-microsecond             |
| latency           |                            | Deterministic execution     |
+-------------------+---------------------------+---------------------------+
| Data pipeline     | Python + Spark/Flink       | Batch + streaming           |
|                   |                            | Mature ecosystem            |
+-------------------+---------------------------+---------------------------+
| GUI/Dashboard     | TypeScript (React)         | Modern web stack            |
|                   | or Python (Dash/Streamlit) |                            |
+-------------------+---------------------------+---------------------------+

C++ vs. Rust vs. Java for latency-critical:

  C++:  Most mature in finance. Vast codebase. Manual memory.
        Template metaprogramming for compile-time optimization.
        Risk: memory bugs (use-after-free, buffer overflow).

  Rust: Memory safety without GC. Growing in finance.
        Ownership model prevents data races.
        Smaller ecosystem, steeper learning curve.

  Java: GC pauses are the killer. Zing (Azul) reduces but
        doesn't eliminate. Good for non-latency-critical
        components (risk engine, OMS).
        Advantage: easier to hire developers.

FPGA:
  - Used by firms like Jump Trading, Virtu, Tower
  - Processes market data in hardware (no software stack)
  - Typical latency: 100-500 nanoseconds tick-to-trade
  - Challenges: long development cycle, difficult debugging,
    limited flexibility (need new bitstream for strategy changes)
  - Usually for simple strategies (market making, simple arb)
```

---

## 9. Architecture Diagrams

### 9.1 Full Trading System

```
COMPLETE TRADING SYSTEM ARCHITECTURE
======================================

  +===============================================================+
  |                     EXCHANGE CONNECTIVITY                      |
  |  +----------+  +----------+  +----------+  +----------+       |
  |  | NYSE     |  | NASDAQ   |  | CME      |  | Dark     |       |
  |  | Gateway  |  | Gateway  |  | Gateway  |  | Pools    |       |
  |  +----+-----+  +----+-----+  +----+-----+  +----+-----+       |
  |       |              |              |              |            |
  +===============================================================+
          |              |              |              |
          v              v              v              v
  +===============================================================+
  |              MARKET DATA INFRASTRUCTURE                        |
  |  +----------------------------------------------------------+ |
  |  | Feed Handler | Ticker Plant | Book Builder | NBBO Engine  | |
  |  +----------------------------------------------------------+ |
  |  | Snapshot Server | Gap Recovery | Latency Monitor          | |
  |  +----------------------------------------------------------+ |
  +===============================================================+
                         |
           +-------------+-------------+
           |                           |
           v                           v
  +==================+        +==================+
  |  RESEARCH ENV    |        |  PRODUCTION ENV  |
  |                  |        |                  |
  | +-------------+  |        | +-------------+  |
  | | Jupyter      |  |        | | Strategy    |  |
  | | Notebooks   |  |        | | Engine      |  |
  | +-------------+  |        | +------+------+  |
  | +-------------+  |        |        |          |
  | | Backtest    |  |        | +------v------+  |
  | | Framework   |  |        | | Risk Engine |  |
  | +-------------+  |        | +------+------+  |
  | +-------------+  |        |        |          |
  | | Data        |  |        | +------v------+  |
  | | Analysis    |  |        | | OMS / SOR   |  |
  | +-------------+  |        | +-------------+  |
  +==================+        +==================+
                                       |
  +===============================================================+
  |              MONITORING & OPERATIONS                            |
  |  +----------------------------------------------------------+ |
  |  | PnL Dashboard | Latency Monitor | Position Viewer        | |
  |  | Alert System  | Kill Switch     | Compliance Logs        | |
  |  +----------------------------------------------------------+ |
  +===============================================================+
```

### 9.2 Market Data Pipeline

```
MARKET DATA PIPELINE (DETAILED)
=================================

  Exchange Feed (binary, multicast UDP)
       |
       v
  +------------------------------------------+
  |  NIC (Network Interface Card)             |
  |  - Receive multicast packets              |
  |  - Hardware timestamping                  |
  |  - Kernel bypass (Solarflare/DPDK)        |
  +------------------------------------------+
       |
       v
  +------------------------------------------+
  |  PACKET HANDLER (Core 1, pinned)          |
  |  - Parse Ethernet/IP/UDP headers          |
  |  - Extract sequence numbers               |
  |  - Detect gaps (request retransmit)       |
  |  - Write to ring buffer                   |
  +------------------------------------------+
       |
       v (SPSC ring buffer)
  +------------------------------------------+
  |  MESSAGE PARSER (Core 2, pinned)          |
  |  - Parse exchange-specific protocol       |
  |  - Normalize to internal format           |
  |  - Enrich with reference data             |
  |  - Write to book builder ring buffer      |
  +------------------------------------------+
       |
       v (SPSC ring buffer)
  +------------------------------------------+
  |  BOOK BUILDER (Core 3, pinned)            |
  |  - Maintain order book per symbol         |
  |  - Compute BBO, spread, imbalance         |
  |  - Publish updates to strategy ring buffer|
  |  - Persist to tick database               |
  +------------------------------------------+
       |
       v (SPMC ring buffer - one per consumer)
  +---+---+---+
  | S | R | L |
  | t | i | o |
  | r | s | g |
  | a | k | g |
  | t |   | e |
  +---+---+---+

Total latency budget: < 2 microseconds (kernel bypass)
```

---

## 10. Interview Questions

### Question 1: Design a Backtesting Framework

**Q: Design a backtesting system that can simulate strategies across thousands of instruments over 10 years of tick data.**

**A:**
```
Key requirements:
- 10 years x 1000 instruments x ~50,000 ticks/day = 180 billion events
- Must complete in reasonable time (< 1 hour for vectorized, < 8 hours event-driven)
- Must be deterministic (same inputs -> same outputs)

Architecture:
1. DATA LAYER:
   - Tick data in Parquet format, partitioned by date and symbol
   - Use PyArrow for columnar reads (only load needed columns)
   - Data stored on SSD (NVMe for speed)
   - Precompute daily bars for initial screening

2. VECTORIZED FAST PATH (for initial screening):
   - Load daily bars into pandas DataFrame (manageable size)
   - Compute signals using vectorized operations
   - Filter to promising parameter combinations
   - Run in < 5 minutes

3. EVENT-DRIVEN VALIDATION (for final validation):
   - Replay tick data through event engine
   - Realistic fill model (spread + impact + queue position)
   - Full position and P&L tracking
   - Run on cloud (parallelize across date ranges)

4. PARALLELIZATION:
   - By symbol: each symbol processed independently
   - By date: merge results at day boundaries
   - By parameter: sweep parameters in parallel
   - Use multiprocessing (not threading - GIL)

5. DETERMINISM:
   - Fixed random seeds for any stochastic elements
   - Process events in strict timestamp order
   - Tie-breaking rule for simultaneous events
   - Reproducible results across runs

6. OUTPUT:
   - Equity curve (timestamped)
   - Trade log (every fill with details)
   - Risk metrics (Sharpe, drawdown, turnover)
   - Factor exposure over time
   - Transaction cost analysis
```

### Question 2: Design a Real-Time Risk System

**Q: Design a risk system for an options market making desk that manages positions in 5,000 listed options.**

**A:**
```
Requirements:
- Compute Greeks for 5,000 positions in real-time
- Update as market moves (vol surface changes, spot moves)
- Pre-trade checks in < 10 microseconds
- Full portfolio recalculation in < 100 milliseconds

Architecture:

1. POSITION STORE:
   - In-memory position table (symbol -> Position object)
   - Updated on every fill (from OMS events)
   - Immutable snapshots for audit trail

2. GREEKS ENGINE:
   - Precompute Greeks for each position
   - On market data update: delta/gamma update via Taylor expansion
   - Full recalculation triggered by:
     - Vol surface change
     - Periodically (every 5 seconds)
     - Risk manager request

   Fast approximation:
     new_delta ~= old_delta + gamma * dS + vanna * d_sigma
     new_gamma ~= old_gamma + speed * dS + zomma * d_sigma

   Full recalculation:
     - Black-Scholes for each option (vectorized NumPy)
     - 5000 options * 5 Greeks = 25,000 values
     - ~5ms with vectorized NumPy

3. AGGREGATION:
   - Portfolio-level: sum of all position Greeks
   - Per-underlying: group options by underlying
   - Per-expiry: group by expiration date
   - Per-sector: group by underlying sector

4. PRE-TRADE RISK:
   - Compute how proposed order would change portfolio Greeks
   - Check against limits:
     - Max portfolio delta (in SPY-equivalent units)
     - Max single-name gamma
     - Max portfolio vega
     - Max daily loss
   - Must be < 10 microseconds (pre-computed lookup tables)

5. KILL SWITCH:
   - Hardware kill switch (physical button in the office)
   - Software kill switch (API endpoint)
   - Automatic trigger on:
     - Portfolio loss > $X
     - Single position loss > $Y
     - Market data staleness > 5 seconds
     - Exchange connectivity loss

6. SCENARIO ANALYSIS:
   - Pre-computed scenarios: +/- 1%, 2%, 5%, 10% spot move
   - Vol scenarios: +/- 5%, 10%, 20% parallel vol shift
   - Combined: spot + vol jointly
   - Update every 30 seconds in background thread
```

### Question 3: Market Data Feed Handler

**Q: Design a market data feed handler that processes NASDAQ ITCH 5.0 messages at peak rates of 10 million messages per second.**

**A:**
```
10M messages/sec = 100 nanoseconds per message budget.

This is firmly in the kernel-bypass / FPGA territory.

SOFTWARE APPROACH:
1. NIC: Solarflare with OpenOnload or Mellanox with VMA
2. Dedicated server: CPU pinned, isolated cores, NUMA-local
3. Single-threaded parser on dedicated core (no context switches)
4. Ring buffer to downstream consumers

Processing pipeline (all on one core):
  a. Read packet from NIC (poll loop, ~50ns)
  b. Validate sequence number (~10ns)
  c. Parse ITCH message type (~20-50ns depending on type)
  d. Write normalized event to ring buffer (~20ns)
  Total: ~100-130ns per message

Key optimizations:
  - Compile-time protocol parsing (templates in C++)
  - Branch-free message type dispatch (jump table)
  - Cache-friendly message layout (pack structs)
  - Prefetch next packet while processing current
  - Avoid memory allocation (pre-allocated buffers)

ITCH 5.0 message types (most common):
  A = Add Order       (most frequent, ~40% of messages)
  D = Delete Order    (~30%)
  U = Replace Order   (~15%)
  E = Executed Order  (~10%)
  P = Trade           (~5%)

Gap handling:
  - Track sequence numbers per stream
  - If gap detected: request retransmit from exchange
  - Buffer incoming messages during gap recovery
  - Apply recovered messages in sequence order

FPGA APPROACH (for ultra-low-latency firms):
  - Parse ITCH directly in hardware
  - Fixed pipeline: parse -> update book -> signal -> order
  - Total latency: < 500 nanoseconds end-to-end
  - Reconfigurable for different protocols
  - Challenge: limited strategy complexity
```

### Question 4: Tick Data Storage

**Q: You need to store and query 5 years of tick data for 10,000 US equities. Design the storage system.**

**A:**
```
Data volume estimate:
  10,000 symbols x 50,000 ticks/day x 252 days/year x 5 years
  = 630 billion ticks
  Each tick: ~50 bytes (timestamp, price, volume, flags)
  Raw size: ~31.5 TB
  Compressed (Parquet with zstd): ~5-8 TB

Storage design:

1. FILE FORMAT: Apache Parquet
   - Columnar (read only columns you need)
   - Excellent compression (3-6x)
   - Predicate pushdown (filter before scan)
   - Ecosystem: pandas, DuckDB, Spark, Polars

2. PARTITIONING:
   /data/ticks/
     year=2024/
       month=01/
         day=02/
           AAPL.parquet
           MSFT.parquet
           ...

   - Partition by date (primary access pattern)
   - One file per symbol per day
   - Each file: ~50K rows, ~2.5MB compressed

3. QUERY ENGINE: DuckDB (for research)
   - In-process analytical database
   - SQL interface to Parquet files
   - Vectorized execution engine
   - Reads Parquet natively

   SELECT
     symbol,
     date_trunc('minute', timestamp) as minute,
     first(price) as open,
     max(price) as high,
     min(price) as low,
     last(price) as close,
     sum(volume) as volume
   FROM read_parquet('data/ticks/year=2024/month=01/day=02/*.parquet')
   WHERE symbol = 'AAPL'
   GROUP BY 1, 2
   ORDER BY 2;

4. METADATA CATALOG:
   - Track available symbols, date ranges
   - Corporate actions adjustment factors
   - Data quality flags per file
   - Store in SQLite or PostgreSQL

5. CACHING LAYER:
   - LRU cache for frequently accessed date/symbol combos
   - In-memory: recent 30 days for active symbols
   - Redis: shared cache for team access

6. DATA INTEGRITY:
   - Checksums per file
   - Row counts verified against exchange totals
   - Cross-reference with daily bars from vendor
   - Automated daily quality report
```

---

## 11. Key Design Principles

```
+------------------------------------------------------------+
| QUANT SYSTEM DESIGN PRINCIPLES                              |
+------------------------------------------------------------+
| 1. Latency: Measure, don't guess. 99th percentile matters. |
| 2. Determinism: Same inputs must produce same outputs.      |
| 3. Correctness: A fast wrong answer is worse than no answer.|
| 4. Simplicity: Fewer moving parts = fewer failure modes.    |
| 5. Observability: If you can't measure it, you can't fix it.|
| 6. Fail-safe: Fail closed (cancel orders, flatten positions).|
| 7. Immutability: Audit trail requires immutable event logs. |
| 8. Separation: Research and production share signal logic,  |
|    not infrastructure.                                      |
| 9. Testing: Backtest with production code paths.            |
|10. Capacity: Design for 10x expected peak load.             |
+------------------------------------------------------------+
```

---

*Previous Chapter: [Chapter 8 - Game Theory, Auctions & Strategic Thinking](08-GAME-THEORY-AND-AUCTIONS.md)*
