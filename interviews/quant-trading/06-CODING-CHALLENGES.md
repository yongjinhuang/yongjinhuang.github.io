# Chapter 6: Coding Challenges for Quant Interviews

## Why Coding Matters in Quant

Every quant firm requires strong programming skills. Jane Street and Two Sigma test algorithmic thinking; Citadel and DE Shaw test system design and numerical computing; HRT and Jump Trading test low-latency C++. Python is the lingua franca for quant research, while C++/Rust dominate production trading systems.

This chapter covers the full spectrum of coding problems you will encounter in quant interviews: data structures for trading systems, algorithms for market problems, numerical computing, and system design.

```
+------------------------------------------------------------------------+
|              QUANT CODING INTERVIEW MAP                                  |
+------------------------------------------------------------------------+
|                                                                        |
|  DATA STRUCTURES          ALGORITHMS           NUMERICAL COMPUTING     |
|  +------------------+    +------------------+  +------------------+    |
|  | Order Book        |    | DP: Buy/Sell     |  | Linear Algebra   |    |
|  | Ring Buffers      |    | Graph: Arbitrage |  | Monte Carlo      |    |
|  | Segment Trees     |    | Binary Search    |  | Root Finding     |    |
|  | LRU Cache         |    | String Matching  |  | Regression       |    |
|  | Priority Queues   |    | Sorting/Ranking  |  | Optimization     |    |
|  +------------------+    +------------------+  +------------------+    |
|           |                       |                     |              |
|           v                       v                     v              |
|  +--------------------------------------------------------------+     |
|  |             SYSTEM DESIGN FOR TRADING                         |     |
|  | Market Data Pipeline | OMS | Risk Engine | Backtester         |     |
|  +--------------------------------------------------------------+     |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 1. Data Structure Problems

### 1.1 Order Book Implementation

The limit order book is the central data structure in electronic trading. It maintains buy (bid) and sell (ask) orders organized by price level.

```
ORDER BOOK STRUCTURE
=====================

        BIDS (buy orders)              ASKS (sell orders)
        Sorted DESCENDING              Sorted ASCENDING

    Price    | Quantity              Price    | Quantity
    ---------+----------            ---------+----------
    100.03   |  500       <-- Best  100.04   |  300      <-- Best
    100.02   |  1200          Bid   100.05   |  800          Ask
    100.01   |  750                 100.06   |  450
    100.00   |  2000                100.07   |  1100
    99.99    |  400                 100.08   |  200

    Spread = Best Ask - Best Bid = 100.04 - 100.03 = 0.01
    Mid Price = (Best Bid + Best Ask) / 2 = 100.035
```

```python
from collections import defaultdict
from sortedcontainers import SortedDict
from dataclasses import dataclass
from typing import Optional
import time


@dataclass(frozen=True)
class Order:
    order_id: int
    side: str          # 'buy' or 'sell'
    price: float
    quantity: int
    timestamp: float


class OrderBook:
    """
    Limit order book with O(log N) insert/delete/best price.
    Uses SortedDict for price levels and dict for order lookup.
    """

    def __init__(self):
        # SortedDict: price -> list of orders at that level
        self._bids = SortedDict()  # Sorted ascending, use neg index for best
        self._asks = SortedDict()  # Sorted ascending, use [0] for best
        self._orders = {}          # order_id -> Order (for fast cancel)
        self._next_id = 0

    def add_order(self, side: str, price: float,
                  quantity: int) -> int:
        """Add a limit order. Returns order_id."""
        self._next_id += 1
        order = Order(
            order_id=self._next_id,
            side=side,
            price=price,
            quantity=quantity,
            timestamp=time.time()
        )

        book = self._bids if side == 'buy' else self._asks

        if price not in book:
            book[price] = []
        book[price].append(order)
        self._orders[order.order_id] = order

        return order.order_id

    def cancel_order(self, order_id: int) -> bool:
        """Cancel an order by ID. Returns True if found."""
        if order_id not in self._orders:
            return False

        order = self._orders[order_id]
        book = self._bids if order.side == 'buy' else self._asks

        if order.price in book:
            book[order.price] = [
                o for o in book[order.price]
                if o.order_id != order_id
            ]
            if not book[order.price]:
                del book[order.price]

        del self._orders[order_id]
        return True

    def best_bid(self) -> Optional[float]:
        """Best (highest) bid price. O(log N)."""
        if not self._bids:
            return None
        return self._bids.keys()[-1]

    def best_ask(self) -> Optional[float]:
        """Best (lowest) ask price. O(log N)."""
        if not self._asks:
            return None
        return self._asks.keys()[0]

    def spread(self) -> Optional[float]:
        """Bid-ask spread."""
        bid, ask = self.best_bid(), self.best_ask()
        if bid is None or ask is None:
            return None
        return ask - bid

    def mid_price(self) -> Optional[float]:
        """Mid price."""
        bid, ask = self.best_bid(), self.best_ask()
        if bid is None or ask is None:
            return None
        return (bid + ask) / 2.0

    def volume_at_price(self, price: float, side: str) -> int:
        """Total volume at a given price level."""
        book = self._bids if side == 'buy' else self._asks
        if price not in book:
            return 0
        return sum(o.quantity for o in book[price])

    def match_market_order(self, side: str,
                           quantity: int) -> list[tuple[float, int]]:
        """
        Match a market order against the book.
        Returns list of (price, filled_qty) tuples.
        """
        fills = []
        remaining = quantity

        if side == 'buy':
            # Match against asks (lowest first)
            book = self._asks
            prices = list(book.keys())  # ascending
        else:
            # Match against bids (highest first)
            book = self._bids
            prices = list(reversed(book.keys()))  # descending

        for price in prices:
            if remaining <= 0:
                break

            level_orders = list(book[price])
            for order in level_orders:
                if remaining <= 0:
                    break

                fill_qty = min(remaining, order.quantity)
                fills.append((price, fill_qty))
                remaining -= fill_qty

                if fill_qty == order.quantity:
                    self.cancel_order(order.order_id)
                else:
                    # Partial fill: remove old, add reduced order
                    self.cancel_order(order.order_id)
                    self.add_order(
                        order.side, order.price,
                        order.quantity - fill_qty
                    )

        return fills

    def get_depth(self, levels: int = 5) -> dict:
        """Get top N levels of book depth."""
        bid_levels = []
        for price in reversed(self._bids.keys()):
            if len(bid_levels) >= levels:
                break
            qty = sum(o.quantity for o in self._bids[price])
            bid_levels.append({'price': price, 'quantity': qty})

        ask_levels = []
        for price in self._asks.keys():
            if len(ask_levels) >= levels:
                break
            qty = sum(o.quantity for o in self._asks[price])
            ask_levels.append({'price': price, 'quantity': qty})

        return {'bids': bid_levels, 'asks': ask_levels}


# Usage example
book = OrderBook()
book.add_order('buy', 100.00, 500)
book.add_order('buy', 100.01, 300)
book.add_order('buy', 100.02, 200)
book.add_order('sell', 100.05, 400)
book.add_order('sell', 100.06, 600)

print(f"Best bid: {book.best_bid()}")   # 100.02
print(f"Best ask: {book.best_ask()}")   # 100.05
print(f"Spread: {book.spread()}")       # 0.03

fills = book.match_market_order('buy', 500)
print(f"Market buy fills: {fills}")     # [(100.05, 400), (100.06, 100)]
```

### 1.2 Ring Buffer for Time-Series Data

A ring buffer (circular buffer) is perfect for maintaining a fixed-size sliding window over streaming data, such as the last N ticks or the last N minutes of OHLCV bars.

```
RING BUFFER CONCEPT
====================

Capacity = 5, after inserting A, B, C, D, E, F:

  Index:  0   1   2   3   4
Before: [A] [B] [C] [D] [E]
                             ^-- head (next write position)

After inserting F:
  Index:  0   1   2   3   4
After:  [F] [B] [C] [D] [E]
              ^-- head

Oldest element is at head, newest is at head-1 (mod capacity)
```

```python
import numpy as np


class RingBuffer:
    """
    Fixed-size ring buffer with O(1) append and O(1) statistics.
    Ideal for streaming time series data.
    """

    def __init__(self, capacity: int):
        self._data = np.zeros(capacity)
        self._capacity = capacity
        self._head = 0
        self._size = 0
        self._sum = 0.0
        self._sum_sq = 0.0

    def append(self, value: float) -> None:
        """Add value, overwriting oldest if full."""
        if self._size == self._capacity:
            old_value = self._data[self._head]
            self._sum -= old_value
            self._sum_sq -= old_value * old_value
        else:
            self._size += 1

        self._data[self._head] = value
        self._sum += value
        self._sum_sq += value * value
        self._head = (self._head + 1) % self._capacity

    @property
    def mean(self) -> float:
        """O(1) running mean."""
        if self._size == 0:
            return 0.0
        return self._sum / self._size

    @property
    def variance(self) -> float:
        """O(1) running variance (Welford-style)."""
        if self._size < 2:
            return 0.0
        mean = self.mean
        return (self._sum_sq / self._size) - mean * mean

    @property
    def std(self) -> float:
        """O(1) running standard deviation."""
        return np.sqrt(max(0.0, self.variance))

    def zscore(self, value: float) -> float:
        """Z-score of a value relative to buffer statistics."""
        s = self.std
        if s == 0:
            return 0.0
        return (value - self.mean) / s

    def to_array(self) -> np.ndarray:
        """Return ordered array from oldest to newest."""
        if self._size < self._capacity:
            return self._data[:self._size].copy()
        return np.roll(self._data, -self._head)[:self._size].copy()

    def __len__(self) -> int:
        return self._size


# Usage: streaming z-score calculation
buf = RingBuffer(100)
prices = np.cumsum(np.random.randn(200)) + 100

for i, price in enumerate(prices):
    buf.append(price)
    if i >= 100:
        z = buf.zscore(price)
        if abs(z) > 2.0:
            signal = "SELL" if z > 0 else "BUY"
            print(f"t={i}: price={price:.2f}, z={z:.2f} -> {signal}")
```

### 1.3 Segment Tree for Range Queries

Segment trees answer range queries (min, max, sum) over a mutable array in O(log N) time. Useful for computing rolling statistics over arbitrary windows.

```python
class SegmentTree:
    """
    Segment tree for range min/max/sum queries.
    O(log N) update, O(log N) query.
    """

    def __init__(self, data: list[float]):
        self._n = len(data)
        self._tree_min = [0.0] * (4 * self._n)
        self._tree_max = [0.0] * (4 * self._n)
        self._tree_sum = [0.0] * (4 * self._n)
        if self._n > 0:
            self._build(data, 1, 0, self._n - 1)

    def _build(self, data, node, start, end):
        if start == end:
            self._tree_min[node] = data[start]
            self._tree_max[node] = data[start]
            self._tree_sum[node] = data[start]
            return

        mid = (start + end) // 2
        self._build(data, 2 * node, start, mid)
        self._build(data, 2 * node + 1, mid + 1, end)
        self._merge(node)

    def _merge(self, node):
        self._tree_min[node] = min(
            self._tree_min[2 * node],
            self._tree_min[2 * node + 1]
        )
        self._tree_max[node] = max(
            self._tree_max[2 * node],
            self._tree_max[2 * node + 1]
        )
        self._tree_sum[node] = (
            self._tree_sum[2 * node] +
            self._tree_sum[2 * node + 1]
        )

    def update(self, idx: int, value: float):
        """Update value at index. O(log N)."""
        self._update(1, 0, self._n - 1, idx, value)

    def _update(self, node, start, end, idx, value):
        if start == end:
            self._tree_min[node] = value
            self._tree_max[node] = value
            self._tree_sum[node] = value
            return

        mid = (start + end) // 2
        if idx <= mid:
            self._update(2 * node, start, mid, idx, value)
        else:
            self._update(2 * node + 1, mid + 1, end, idx, value)
        self._merge(node)

    def query_min(self, left: int, right: int) -> float:
        """Range minimum query. O(log N)."""
        return self._query_min(1, 0, self._n - 1, left, right)

    def _query_min(self, node, start, end, left, right):
        if right < start or end < left:
            return float('inf')
        if left <= start and end <= right:
            return self._tree_min[node]
        mid = (start + end) // 2
        return min(
            self._query_min(2 * node, start, mid, left, right),
            self._query_min(2 * node + 1, mid + 1, end, left, right)
        )

    def query_max(self, left: int, right: int) -> float:
        """Range maximum query. O(log N)."""
        return self._query_max(1, 0, self._n - 1, left, right)

    def _query_max(self, node, start, end, left, right):
        if right < start or end < left:
            return float('-inf')
        if left <= start and end <= right:
            return self._tree_max[node]
        mid = (start + end) // 2
        return max(
            self._query_max(2 * node, start, mid, left, right),
            self._query_max(2 * node + 1, mid + 1, end, left, right)
        )


# Usage: find max drawdown in any window
prices_list = [100, 102, 98, 95, 101, 99, 103, 97, 105]
st = SegmentTree(prices_list)

# What was the price range in window [2, 6]?
window_min = st.query_min(2, 6)
window_max = st.query_max(2, 6)
print(f"Window [2,6]: min={window_min}, max={window_max}")
# min=95, max=103
```

### 1.4 LRU Cache for Market Data

```python
from collections import OrderedDict
from typing import Optional


class LRUCache:
    """
    LRU Cache with O(1) get and put.
    Useful for caching market data snapshots, computed Greeks, etc.
    """

    def __init__(self, capacity: int):
        self._capacity = capacity
        self._cache: OrderedDict = OrderedDict()

    def get(self, key: str) -> Optional[object]:
        """Get value and mark as recently used."""
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def put(self, key: str, value: object) -> None:
        """Insert or update. Evict LRU if at capacity."""
        if key in self._cache:
            self._cache.move_to_end(key)
            self._cache[key] = value
            return

        if len(self._cache) >= self._capacity:
            self._cache.popitem(last=False)  # Remove oldest

        self._cache[key] = value

    def __len__(self) -> int:
        return len(self._cache)


# Usage: cache option prices
cache = LRUCache(capacity=10000)

def get_option_price(underlying: str, strike: float,
                     expiry: str, vol: float) -> float:
    key = f"{underlying}:{strike}:{expiry}:{vol:.4f}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    # Expensive computation (Black-Scholes)
    price = black_scholes_call(100, strike, 0.05, vol, 0.25)
    cache.put(key, price)
    return price
```

---

## 2. Algorithm Problems

### 2.1 Best Time to Buy and Sell Stock (Variants)

These are classic DP problems that appear frequently in quant interviews.

```python
def max_profit_one_trade(prices: list[float]) -> float:
    """
    Problem: Buy once, sell once. Maximize profit.
    O(N) time, O(1) space.
    """
    if len(prices) < 2:
        return 0.0

    min_price = prices[0]
    max_profit = 0.0

    for price in prices[1:]:
        max_profit = max(max_profit, price - min_price)
        min_price = min(min_price, price)

    return max_profit


def max_profit_unlimited_trades(prices: list[float]) -> float:
    """
    Problem: Unlimited buy/sell transactions. No holding multiple.
    Greedy: capture every upward move.
    """
    total = 0.0
    for i in range(1, len(prices)):
        gain = prices[i] - prices[i - 1]
        if gain > 0:
            total += gain
    return total


def max_profit_k_trades(prices: list[float], k: int) -> float:
    """
    Problem: At most k buy/sell transactions.
    DP: O(N*k) time, O(N*k) space.

    State: dp[j][i] = max profit using at most j trades up to day i.
    Transition:
      dp[j][i] = max(
        dp[j][i-1],                          # no trade on day i
        max over m < i: prices[i] - prices[m] + dp[j-1][m]  # sell on day i
      )

    Optimization: track running max of (dp[j-1][m] - prices[m]).
    """
    n = len(prices)
    if n < 2 or k == 0:
        return 0.0

    # If k >= n/2, unlimited trades
    if k >= n // 2:
        return max_profit_unlimited_trades(prices)

    # dp[j][i] = max profit with at most j trades through day i
    dp = [[0.0] * n for _ in range(k + 1)]

    for j in range(1, k + 1):
        # max_diff tracks max(dp[j-1][m] - prices[m]) for m < i
        max_diff = -prices[0]
        for i in range(1, n):
            dp[j][i] = max(
                dp[j][i - 1],           # Skip day i
                prices[i] + max_diff     # Sell on day i
            )
            max_diff = max(max_diff, dp[j - 1][i] - prices[i])

    return dp[k][n - 1]


def max_profit_with_cooldown(prices: list[float]) -> float:
    """
    Problem: After selling, must wait 1 day before buying again.
    State machine DP.

    States:
      held    = max profit while holding a stock
      sold    = max profit on day we just sold
      rest    = max profit while resting (cooldown or waiting)
    """
    if len(prices) < 2:
        return 0.0

    held = -prices[0]
    sold = 0.0
    rest = 0.0

    for i in range(1, len(prices)):
        new_held = max(held, rest - prices[i])
        new_sold = held + prices[i]
        new_rest = max(rest, sold)

        held, sold, rest = new_held, new_sold, new_rest

    return max(sold, rest)


# Test
prices = [100, 102, 98, 95, 101, 107, 99, 103, 110, 105]
print(f"One trade: {max_profit_one_trade(prices)}")       # 15 (buy@95, sell@110)
print(f"Unlimited: {max_profit_unlimited_trades(prices)}") # 24
print(f"2 trades: {max_profit_k_trades(prices, 2)}")       # 22
print(f"Cooldown: {max_profit_with_cooldown(prices)}")     # 19
```

### 2.2 Arbitrage Detection via Bellman-Ford

Currency arbitrage exists when a cycle of exchanges yields a profit. This reduces to negative cycle detection in a graph.

```
TRIANGULAR ARBITRAGE
=====================

Exchange rates:
  USD -> EUR: 0.85
  EUR -> GBP: 0.88
  GBP -> USD: 1.35

Path: USD -> EUR -> GBP -> USD
  1.00 * 0.85 * 0.88 * 1.35 = 1.0098

  Profit = 0.98% per cycle (before costs)

Graph formulation:
  Edge weight = -log(exchange_rate)
  Negative cycle in this graph = arbitrage opportunity

  -log(0.85) + -log(0.88) + -log(1.35)
  = 0.1625 + 0.1278 + (-0.3001)
  = -0.0098 < 0  --> ARBITRAGE!
```

```python
import math
from dataclasses import dataclass


@dataclass
class Edge:
    source: str
    target: str
    weight: float  # -log(exchange_rate)


def detect_arbitrage(currencies: list[str],
                     rates: dict[tuple[str, str], float]
                     ) -> list[str]:
    """
    Detect currency arbitrage using Bellman-Ford algorithm.
    Returns the arbitrage cycle, or empty list if none exists.

    Time: O(V * E), Space: O(V)
    """
    edges = []
    for (src, tgt), rate in rates.items():
        edges.append(Edge(src, tgt, -math.log(rate)))

    # Initialize distances
    dist = {c: float('inf') for c in currencies}
    predecessor = {c: None for c in currencies}
    dist[currencies[0]] = 0.0

    n = len(currencies)

    # Relax edges V-1 times
    for _ in range(n - 1):
        for edge in edges:
            if dist[edge.source] + edge.weight < dist[edge.target]:
                dist[edge.target] = dist[edge.source] + edge.weight
                predecessor[edge.target] = edge.source

    # Check for negative cycles (one more relaxation)
    cycle_node = None
    for edge in edges:
        if dist[edge.source] + edge.weight < dist[edge.target]:
            cycle_node = edge.target
            break

    if cycle_node is None:
        return []  # No arbitrage

    # Trace back the cycle
    visited = set()
    node = cycle_node
    for _ in range(n):
        node = predecessor[node]
    cycle_start = node

    cycle = [cycle_start]
    node = predecessor[cycle_start]
    while node != cycle_start:
        cycle.append(node)
        node = predecessor[node]
    cycle.append(cycle_start)

    return list(reversed(cycle))


# Example
currencies = ['USD', 'EUR', 'GBP', 'JPY']
rates = {
    ('USD', 'EUR'): 0.85,
    ('EUR', 'USD'): 1.18,
    ('EUR', 'GBP'): 0.88,
    ('GBP', 'EUR'): 1.14,
    ('GBP', 'USD'): 1.35,
    ('USD', 'GBP'): 0.74,
    ('USD', 'JPY'): 110.0,
    ('JPY', 'USD'): 0.0091,
    ('EUR', 'JPY'): 129.0,
    ('JPY', 'EUR'): 0.0078,
}

cycle = detect_arbitrage(currencies, rates)
if cycle:
    print(f"Arbitrage cycle: {' -> '.join(cycle)}")
    product = 1.0
    for i in range(len(cycle) - 1):
        rate = rates[(cycle[i], cycle[i + 1])]
        product *= rate
        print(f"  {cycle[i]} -> {cycle[i+1]}: rate={rate}")
    print(f"  Product: {product:.6f} (profit: {(product-1)*100:.4f}%)")
```

### 2.3 Optimal Execution with DP

```python
def optimal_execution_twap_vwap(
    total_shares: int,
    n_periods: int,
    expected_volumes: list[int],
    impact_coeff: float = 0.001,
    urgency: float = 0.5
) -> list[int]:
    """
    Optimal execution schedule balancing market impact and timing risk.

    TWAP: Execute equal amounts each period
    VWAP: Execute proportional to expected volume
    Optimal: Blend based on urgency parameter

    urgency = 0 -> Pure VWAP (minimize impact)
    urgency = 1 -> Pure TWAP (minimize timing risk)
    """
    total_volume = sum(expected_volumes)

    schedule = []
    remaining = total_shares

    for i in range(n_periods):
        # TWAP component
        twap_share = total_shares / n_periods

        # VWAP component
        vwap_share = total_shares * (expected_volumes[i] / total_volume)

        # Blend
        target = urgency * twap_share + (1 - urgency) * vwap_share

        # Round and clip
        if i == n_periods - 1:
            shares = remaining  # Execute remainder in last period
        else:
            shares = min(int(round(target)), remaining)
            shares = max(0, shares)

        schedule.append(shares)
        remaining -= shares

    return schedule


# Example
volumes = [1000, 3000, 5000, 4000, 2000, 1500, 3500, 2000]
schedule = optimal_execution_twap_vwap(
    total_shares=10000,
    n_periods=8,
    expected_volumes=volumes,
    urgency=0.3
)
print("Execution schedule:", schedule)
print("Total:", sum(schedule))
```

### 2.4 Moving Median with Two Heaps

Computing the running median of a stream efficiently is essential for robust signal generation.

```python
import heapq


class RunningMedian:
    """
    Running median using two heaps.
    O(log N) insert, O(1) median query.

    max_heap (negated) | min_heap
    Stores lower half   | Stores upper half

    Invariant: len(max_heap) == len(min_heap) or len(max_heap) == len(min_heap) + 1
    """

    def __init__(self):
        self._max_heap = []  # negated values (lower half)
        self._min_heap = []  # upper half

    def add(self, value: float) -> None:
        """Add a value to the stream."""
        if not self._max_heap or value <= -self._max_heap[0]:
            heapq.heappush(self._max_heap, -value)
        else:
            heapq.heappush(self._min_heap, value)

        # Rebalance
        if len(self._max_heap) > len(self._min_heap) + 1:
            val = -heapq.heappop(self._max_heap)
            heapq.heappush(self._min_heap, val)
        elif len(self._min_heap) > len(self._max_heap):
            val = heapq.heappop(self._min_heap)
            heapq.heappush(self._max_heap, -val)

    @property
    def median(self) -> float:
        """Current median value."""
        if len(self._max_heap) > len(self._min_heap):
            return -self._max_heap[0]
        return (-self._max_heap[0] + self._min_heap[0]) / 2.0


# Test
rm = RunningMedian()
for val in [5, 3, 8, 1, 9, 2, 7]:
    rm.add(val)
    print(f"Added {val}, median = {rm.median}")
```

---

## 3. Numerical Computing

### 3.1 Linear Regression from Scratch

```python
import numpy as np


def linear_regression(X: np.ndarray, y: np.ndarray
                      ) -> tuple[np.ndarray, dict]:
    """
    OLS linear regression using the normal equation.
    X: (n, p) feature matrix (should include intercept column)
    y: (n,) target vector

    Returns coefficients and diagnostic statistics.

    Normal equation: beta = (X'X)^{-1} X'y
    """
    n, p = X.shape

    # Solve normal equation (more numerically stable than inverse)
    XtX = X.T @ X
    Xty = X.T @ y
    beta = np.linalg.solve(XtX, Xty)

    # Predictions and residuals
    y_hat = X @ beta
    residuals = y - y_hat

    # Residual standard error
    rss = residuals @ residuals
    sigma_sq = rss / (n - p)

    # Coefficient covariance matrix
    cov_beta = sigma_sq * np.linalg.inv(XtX)
    se_beta = np.sqrt(np.diag(cov_beta))

    # t-statistics
    t_stats = beta / se_beta

    # R-squared
    tss = np.sum((y - np.mean(y)) ** 2)
    r_squared = 1 - rss / tss
    adj_r_squared = 1 - (1 - r_squared) * (n - 1) / (n - p)

    diagnostics = {
        'coefficients': beta,
        'std_errors': se_beta,
        't_statistics': t_stats,
        'r_squared': r_squared,
        'adj_r_squared': adj_r_squared,
        'residual_std_error': np.sqrt(sigma_sq),
        'residuals': residuals,
    }

    return beta, diagnostics


# Example: regress returns on factor
np.random.seed(42)
n = 252

market_return = np.random.randn(n) * 0.01
factor_return = np.random.randn(n) * 0.008

# Stock return with known alpha=0.0002, beta_mkt=1.2, beta_factor=0.5
stock_return = (
    0.0002 + 1.2 * market_return
    + 0.5 * factor_return
    + np.random.randn(n) * 0.005
)

X = np.column_stack([
    np.ones(n),      # intercept
    market_return,
    factor_return
])

beta, diag = linear_regression(X, stock_return)
print(f"Alpha (daily): {beta[0]:.6f}")
print(f"Market beta: {beta[1]:.4f}")
print(f"Factor beta: {beta[2]:.4f}")
print(f"R-squared: {diag['r_squared']:.4f}")
print(f"t-stats: {diag['t_statistics']}")
```

### 3.2 Newton's Method for Implied Volatility

```python
import numpy as np
from scipy.stats import norm


def black_scholes_call(S: float, K: float, r: float,
                       sigma: float, T: float) -> float:
    """Black-Scholes call option price."""
    if T <= 0 or sigma <= 0:
        return max(0.0, S - K * np.exp(-r * T))

    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


def black_scholes_vega(S: float, K: float, r: float,
                       sigma: float, T: float) -> float:
    """Vega: dPrice/dSigma."""
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    return S * np.sqrt(T) * norm.pdf(d1)


def implied_volatility_newton(
    market_price: float,
    S: float,
    K: float,
    r: float,
    T: float,
    initial_guess: float = 0.20,
    tolerance: float = 1e-8,
    max_iterations: int = 100
) -> float:
    """
    Compute implied volatility using Newton-Raphson method.

    f(sigma) = BS(sigma) - market_price = 0
    f'(sigma) = vega

    sigma_{n+1} = sigma_n - f(sigma_n) / f'(sigma_n)
                = sigma_n - (BS(sigma_n) - market_price) / vega(sigma_n)

    Converges quadratically (error squares each iteration).
    """
    sigma = initial_guess

    for i in range(max_iterations):
        price = black_scholes_call(S, K, r, sigma, T)
        vega = black_scholes_vega(S, K, r, sigma, T)

        if abs(vega) < 1e-12:
            raise ValueError("Vega too small; Newton's method unstable")

        diff = price - market_price

        if abs(diff) < tolerance:
            return sigma

        sigma = sigma - diff / vega

        # Guard against negative vol
        sigma = max(sigma, 1e-6)

    raise ValueError(
        f"Newton's method did not converge after {max_iterations} iterations"
    )


# Example
S, K, r, T = 100.0, 105.0, 0.05, 0.25
true_vol = 0.30
market_price = black_scholes_call(S, K, r, true_vol, T)

iv = implied_volatility_newton(market_price, S, K, r, T)
print(f"Market price: {market_price:.4f}")
print(f"True vol: {true_vol:.4f}")
print(f"Implied vol: {iv:.4f}")
print(f"Error: {abs(iv - true_vol):.2e}")
```

### 3.3 Monte Carlo with Variance Reduction

```python
import numpy as np


def monte_carlo_european_call(
    S0: float, K: float, r: float, sigma: float, T: float,
    n_paths: int = 100000
) -> dict:
    """
    Monte Carlo pricing of European call with variance reduction.
    GBM: S(T) = S(0) * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z)
    """
    sqrt_T = np.sqrt(T)
    drift = (r - 0.5 * sigma**2) * T

    # Standard Monte Carlo
    Z = np.random.randn(n_paths)
    S_T = S0 * np.exp(drift + sigma * sqrt_T * Z)
    payoffs = np.maximum(S_T - K, 0) * np.exp(-r * T)
    price_standard = np.mean(payoffs)
    se_standard = np.std(payoffs) / np.sqrt(n_paths)

    # Antithetic variates: use both Z and -Z
    S_T_pos = S0 * np.exp(drift + sigma * sqrt_T * Z)
    S_T_neg = S0 * np.exp(drift + sigma * sqrt_T * (-Z))
    payoffs_anti = 0.5 * (
        np.maximum(S_T_pos - K, 0) + np.maximum(S_T_neg - K, 0)
    ) * np.exp(-r * T)
    price_antithetic = np.mean(payoffs_anti)
    se_antithetic = np.std(payoffs_anti) / np.sqrt(n_paths)

    # Control variate: use forward price as control
    # E[S(T)] = S(0) * exp(r*T) under risk-neutral measure
    control = S_T  # from standard MC
    expected_control = S0 * np.exp(r * T)

    # Optimal coefficient
    cov_pc = np.cov(payoffs, control)[0, 1]
    var_c = np.var(control)
    c_star = -cov_pc / var_c if var_c > 0 else 0.0

    payoffs_cv = payoffs + c_star * (control - expected_control)
    price_cv = np.mean(payoffs_cv)
    se_cv = np.std(payoffs_cv) / np.sqrt(n_paths)

    return {
        'standard': {'price': price_standard, 'se': se_standard},
        'antithetic': {'price': price_antithetic, 'se': se_antithetic},
        'control_variate': {'price': price_cv, 'se': se_cv},
        'variance_reduction_antithetic': 1 - (se_antithetic / se_standard)**2,
        'variance_reduction_cv': 1 - (se_cv / se_standard)**2,
    }


# Example
result = monte_carlo_european_call(
    S0=100, K=105, r=0.05, sigma=0.30, T=0.25, n_paths=500000
)

for method, data in result.items():
    if isinstance(data, dict):
        print(f"{method:20s}: price={data['price']:.4f}, se={data['se']:.6f}")
    else:
        print(f"{method:20s}: {data:.4f}")
```

---

## 4. System Design for Trading

### 4.1 Real-Time Market Data Pipeline

```
MARKET DATA PIPELINE ARCHITECTURE
===================================

  Exchange       Exchange       Exchange
  (NYSE)         (NASDAQ)       (BATS)
     |              |              |
     v              v              v
  +------------------------------------------+
  |         FEED HANDLER LAYER                |
  |  - Protocol adapters (FIX, ITCH, PITCH)  |
  |  - Sequence gap detection                |
  |  - Wire-level parsing                    |
  +------------------------------------------+
              |
              v
  +------------------------------------------+
  |         TICKER PLANT                      |
  |  - Normalization (unified format)         |
  |  - Conflation (throttle to consumers)     |
  |  - Book building (maintain full LOB)      |
  |  - Derived data (VWAP, TWAP, spreads)    |
  +------------------------------------------+
         |           |           |
         v           v           v
   +---------+  +---------+  +---------+
   | Strategy|  | Risk    |  | GUI     |
   | Engine  |  | Engine  |  | Display |
   +---------+  +---------+  +---------+

Key Design Decisions:
- Multicast vs TCP for distribution
- Snapshot + incremental updates for book state
- Conflation policy: last-value vs time-based vs change-based
- Persistence: write-ahead log for replay capability
```

### 4.2 Order Management System (OMS) Design

```
OMS ARCHITECTURE
=================

  Strategy Engine
       |
       v
  +-------------------------------------------------+
  |              ORDER MANAGEMENT SYSTEM              |
  |                                                   |
  |  +-------------+    +------------------+          |
  |  | Order        |    | Position Keeper  |          |
  |  | Validator    |    | (real-time P&L)  |          |
  |  | - Limit chk  |    |                  |          |
  |  | - Risk chk   |    | Qty, AvgPx, UPL |          |
  |  | - Duplicate  |    | RPL, Margin      |          |
  |  +------+------+    +--------+---------+          |
  |         |                     |                    |
  |  +------v------+    +--------v---------+          |
  |  | Order State  |    | Execution        |          |
  |  | Machine      |    | Report Handler  |          |
  |  |              |    |                  |          |
  |  | NEW -> SENT  |    | Fill routing     |          |
  |  | SENT -> ACK  |    | Partial fills    |          |
  |  | ACK -> FILL  |    | Corrections      |          |
  |  | ACK -> CXL   |    | Busts            |          |
  |  +------+------+    +------------------+          |
  |         |                                          |
  +---------v------------------------------------------+
            |
  +---------v------------------------------------------+
  |         SMART ORDER ROUTER (SOR)                   |
  |  - Venue selection (best price, liquidity)         |
  |  - Order splitting (iceberg, TWAP, VWAP)           |
  |  - Dark pool routing                               |
  +---------+------------------------------------------+
            |
     +------+------+------+
     v      v      v      v
   NYSE  NASDAQ  BATS   Dark
                         Pool

Order State Machine:
  CREATED -> PENDING_NEW -> NEW -> PARTIALLY_FILLED -> FILLED
                                -> PENDING_CANCEL -> CANCELLED
                                -> REJECTED
```

### 4.3 Backtesting Framework Architecture

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class MarketEvent:
    timestamp: pd.Timestamp
    symbol: str
    price: float
    volume: int
    bid: float
    ask: float


@dataclass(frozen=True)
class TradeOrder:
    symbol: str
    side: str        # 'buy' or 'sell'
    quantity: int
    order_type: str  # 'market' or 'limit'
    limit_price: Optional[float] = None


@dataclass
class Fill:
    symbol: str
    side: str
    quantity: int
    price: float
    commission: float
    timestamp: pd.Timestamp


@dataclass
class Position:
    symbol: str
    quantity: int = 0
    avg_price: float = 0.0
    realized_pnl: float = 0.0

    def update(self, fill: Fill) -> 'Position':
        """Return new Position after applying fill (immutable pattern)."""
        if fill.side == 'buy':
            new_qty = self.quantity + fill.quantity
            if new_qty != 0:
                new_avg = (
                    (self.quantity * self.avg_price +
                     fill.quantity * fill.price) / new_qty
                )
            else:
                new_avg = 0.0
            new_rpnl = self.realized_pnl
        else:
            new_qty = self.quantity - fill.quantity
            # Realize PnL on closed portion
            closed_qty = min(fill.quantity, self.quantity)
            new_rpnl = (
                self.realized_pnl +
                closed_qty * (fill.price - self.avg_price)
            )
            new_avg = self.avg_price if new_qty > 0 else 0.0

        return Position(
            symbol=self.symbol,
            quantity=new_qty,
            avg_price=new_avg,
            realized_pnl=new_rpnl - fill.commission
        )


class Strategy(ABC):
    """Base class for backtestable strategies."""

    @abstractmethod
    def on_market_data(self, event: MarketEvent) -> list[TradeOrder]:
        """Process market event, return orders."""
        pass

    @abstractmethod
    def on_fill(self, fill: Fill) -> None:
        """Process fill notification."""
        pass


class FillSimulator:
    """Simulate order fills with slippage and market impact."""

    def __init__(self, slippage_bps: float = 1.0,
                 commission_per_share: float = 0.005):
        self._slippage_bps = slippage_bps
        self._commission_per_share = commission_per_share

    def simulate_fill(self, order: TradeOrder,
                      event: MarketEvent) -> Optional[Fill]:
        """Simulate fill with realistic costs."""
        if order.order_type == 'market':
            if order.side == 'buy':
                fill_price = event.ask * (1 + self._slippage_bps / 10000)
            else:
                fill_price = event.bid * (1 - self._slippage_bps / 10000)
        elif order.order_type == 'limit':
            if order.side == 'buy' and event.ask <= order.limit_price:
                fill_price = order.limit_price
            elif order.side == 'sell' and event.bid >= order.limit_price:
                fill_price = order.limit_price
            else:
                return None  # No fill
        else:
            return None

        commission = order.quantity * self._commission_per_share

        return Fill(
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=fill_price,
            commission=commission,
            timestamp=event.timestamp,
        )


class BacktestEngine:
    """Event-driven backtesting engine."""

    def __init__(self, strategy: Strategy,
                 fill_simulator: Optional[FillSimulator] = None):
        self._strategy = strategy
        self._fill_sim = fill_simulator or FillSimulator()
        self._positions: dict[str, Position] = {}
        self._fills: list[Fill] = []
        self._equity_curve: list[tuple[pd.Timestamp, float]] = []

    def run(self, events: list[MarketEvent],
            initial_capital: float = 1_000_000) -> pd.DataFrame:
        """Run the backtest."""
        capital = initial_capital

        for event in events:
            orders = self._strategy.on_market_data(event)

            for order in orders:
                fill = self._fill_sim.simulate_fill(order, event)
                if fill is not None:
                    self._fills.append(fill)
                    self._strategy.on_fill(fill)

                    if fill.symbol not in self._positions:
                        self._positions[fill.symbol] = Position(
                            symbol=fill.symbol
                        )
                    self._positions[fill.symbol] = (
                        self._positions[fill.symbol].update(fill)
                    )

            # Mark-to-market
            mtm = capital
            for sym, pos in self._positions.items():
                mtm += pos.realized_pnl
                mtm += pos.quantity * (event.price - pos.avg_price)

            self._equity_curve.append((event.timestamp, mtm))

        return pd.DataFrame(
            self._equity_curve,
            columns=['timestamp', 'equity']
        ).set_index('timestamp')
```

---

## 5. Python-Specific Quant Patterns

### 5.1 Vectorized Rolling Operations

```python
import numpy as np
import pandas as pd


def rolling_sharpe_vectorized(returns: pd.Series,
                              window: int = 252,
                              annualization: float = 252
                              ) -> pd.Series:
    """
    Vectorized rolling Sharpe ratio.
    Much faster than .apply() with lambda.
    """
    rolling_mean = returns.rolling(window).mean()
    rolling_std = returns.rolling(window).std()
    return (rolling_mean / rolling_std) * np.sqrt(annualization)


def exponentially_weighted_covariance(
    returns: pd.DataFrame,
    halflife: int = 60
) -> np.ndarray:
    """
    Compute exponentially weighted covariance matrix.
    More responsive to recent data than simple rolling.
    """
    ewm = returns.ewm(halflife=halflife)
    return ewm.cov().iloc[-len(returns.columns):]


def vectorized_crossover_signal(
    fast_ma: pd.Series,
    slow_ma: pd.Series
) -> pd.Series:
    """
    Detect MA crossover without loops.
    Returns: +1 on golden cross, -1 on death cross, 0 otherwise.
    """
    above = (fast_ma > slow_ma).astype(int)
    crossover = above.diff()
    return crossover.fillna(0).astype(int)


# Efficient pairwise correlation matrix for large universes
def fast_rolling_correlation(
    returns: pd.DataFrame,
    window: int = 60
) -> pd.DataFrame:
    """
    Compute rolling pairwise correlations efficiently
    using matrix operations instead of nested loops.
    """
    return returns.rolling(window).corr()
```

### 5.2 Streaming Data Processing

```python
from collections import deque
from typing import Callable


class StreamingAggregator:
    """
    Aggregate streaming ticks into time bars.
    Supports time bars, tick bars, volume bars, and dollar bars.
    """

    def __init__(self, bar_type: str = 'time',
                 threshold: float = 60.0,
                 on_bar: Callable = None):
        self._bar_type = bar_type
        self._threshold = threshold
        self._on_bar = on_bar or (lambda x: None)

        self._ticks = []
        self._accumulator = 0.0
        self._bar_start = None

    def on_tick(self, timestamp: float, price: float,
                volume: int) -> None:
        """Process incoming tick."""
        if self._bar_start is None:
            self._bar_start = timestamp

        self._ticks.append({
            'timestamp': timestamp,
            'price': price,
            'volume': volume,
        })

        should_close = False

        if self._bar_type == 'time':
            should_close = (timestamp - self._bar_start) >= self._threshold
        elif self._bar_type == 'tick':
            should_close = len(self._ticks) >= self._threshold
        elif self._bar_type == 'volume':
            self._accumulator += volume
            should_close = self._accumulator >= self._threshold
        elif self._bar_type == 'dollar':
            self._accumulator += price * volume
            should_close = self._accumulator >= self._threshold

        if should_close:
            self._close_bar()

    def _close_bar(self) -> None:
        """Emit completed bar and reset."""
        if not self._ticks:
            return

        prices = [t['price'] for t in self._ticks]
        volumes = [t['volume'] for t in self._ticks]

        bar = {
            'open': prices[0],
            'high': max(prices),
            'low': min(prices),
            'close': prices[-1],
            'volume': sum(volumes),
            'n_ticks': len(self._ticks),
            'timestamp': self._ticks[-1]['timestamp'],
        }

        self._on_bar(bar)
        self._ticks = []
        self._accumulator = 0.0
        self._bar_start = None
```

---

## 6. More Coding Problems with Solutions

### Problem 1: Maximum Subarray (Kadane's for Best Trading Window)

```python
def max_subarray_with_indices(arr: list[float]
                              ) -> tuple[float, int, int]:
    """
    Find contiguous subarray with maximum sum.
    Returns (max_sum, start_index, end_index).
    This is equivalent to finding the best period to be in the market.
    O(N) time, O(1) space.
    """
    max_sum = arr[0]
    current_sum = arr[0]
    start = 0
    temp_start = 0
    end = 0

    for i in range(1, len(arr)):
        if current_sum + arr[i] < arr[i]:
            current_sum = arr[i]
            temp_start = i
        else:
            current_sum += arr[i]

        if current_sum > max_sum:
            max_sum = current_sum
            start = temp_start
            end = i

    return max_sum, start, end


# Daily returns: find the best period to be invested
returns = [0.01, -0.02, 0.03, 0.02, -0.01, 0.04, -0.03, 0.01, 0.02]
total, start, end = max_subarray_with_indices(returns)
print(f"Best period: day {start} to {end}, cumulative return: {total:.4f}")
```

### Problem 2: Median of Two Sorted Price Arrays

```python
def find_median_sorted_arrays(nums1: list[float],
                              nums2: list[float]) -> float:
    """
    Find median of two sorted arrays in O(log(min(m,n))).
    Useful for merging price data from two exchanges.
    """
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1

    m, n = len(nums1), len(nums2)
    low, high = 0, m

    while low <= high:
        partition1 = (low + high) // 2
        partition2 = (m + n + 1) // 2 - partition1

        left1 = nums1[partition1 - 1] if partition1 > 0 else float('-inf')
        right1 = nums1[partition1] if partition1 < m else float('inf')
        left2 = nums2[partition2 - 1] if partition2 > 0 else float('-inf')
        right2 = nums2[partition2] if partition2 < n else float('inf')

        if left1 <= right2 and left2 <= right1:
            if (m + n) % 2 == 0:
                return (max(left1, left2) + min(right1, right2)) / 2.0
            return float(max(left1, left2))
        elif left1 > right2:
            high = partition1 - 1
        else:
            low = partition1 + 1

    raise ValueError("Input arrays are not sorted")
```

### Problem 3: Meeting Rooms / Trading Session Overlap

```python
def max_concurrent_sessions(intervals: list[tuple[int, int]]) -> int:
    """
    Find maximum number of overlapping trading sessions.
    Uses sweep line algorithm. O(N log N).
    """
    events = []
    for start, end in intervals:
        events.append((start, 1))   # session starts
        events.append((end, -1))    # session ends

    events.sort()

    max_concurrent = 0
    current = 0
    for _, delta in events:
        current += delta
        max_concurrent = max(max_concurrent, current)

    return max_concurrent


# Trading sessions across global exchanges
sessions = [
    (0, 8),     # Tokyo: midnight - 8am UTC
    (7, 16),    # London: 7am - 4pm UTC
    (13, 21),   # New York: 1pm - 9pm UTC
    (1, 10),    # Hong Kong: 1am - 10am UTC
]
print(f"Max concurrent sessions: {max_concurrent_sessions(sessions)}")
```

### Problem 4: Trapping Rain Water (Bid-Ask Liquidity Analysis)

```python
def trapped_water(heights: list[int]) -> int:
    """
    Classic two-pointer solution. O(N) time, O(1) space.
    Analogy: "trapped" liquidity between price levels.
    """
    if len(heights) < 3:
        return 0

    left, right = 0, len(heights) - 1
    left_max, right_max = heights[left], heights[right]
    water = 0

    while left < right:
        if left_max <= right_max:
            left += 1
            left_max = max(left_max, heights[left])
            water += left_max - heights[left]
        else:
            right -= 1
            right_max = max(right_max, heights[right])
            water += right_max - heights[right]

    return water
```

### Problem 5: Longest Increasing Subsequence (Trend Detection)

```python
import bisect


def longest_increasing_subsequence(prices: list[float]) -> int:
    """
    Find length of longest strictly increasing subsequence.
    O(N log N) using patience sorting.
    Useful for detecting the longest trend in a price series.
    """
    if not prices:
        return 0

    tails = []  # tails[i] = smallest ending element of IS of length i+1

    for price in prices:
        pos = bisect.bisect_left(tails, price)
        if pos == len(tails):
            tails.append(price)
        else:
            tails[pos] = price

    return len(tails)


prices = [100, 102, 98, 101, 103, 99, 105, 107, 104, 110]
print(f"Longest uptrend length: {longest_increasing_subsequence(prices)}")
# 6: [100, 101, 103, 105, 107, 110]
```

### Problem 6: Top K Frequent Elements (Most Active Stocks)

```python
import heapq
from collections import Counter


def top_k_frequent(events: list[str], k: int) -> list[tuple[str, int]]:
    """
    Find k most frequently traded symbols.
    O(N + M log k) where M = unique symbols.
    """
    counts = Counter(events)
    return heapq.nlargest(k, counts.items(), key=lambda x: x[1])


# Find most actively traded symbols
trades = ['AAPL', 'MSFT', 'AAPL', 'GOOG', 'AAPL', 'MSFT',
          'AMZN', 'GOOG', 'AAPL', 'META', 'MSFT', 'AAPL']
print(f"Top 3 active: {top_k_frequent(trades, 3)}")
```

### Problem 7: Matrix Spiral Order (Grid Data Processing)

```python
def spiral_order(matrix: list[list[float]]) -> list[float]:
    """
    Read matrix in spiral order. O(M*N).
    Useful for processing heatmap/correlation matrix data.
    """
    if not matrix:
        return []

    result = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1

    while top <= bottom and left <= right:
        for col in range(left, right + 1):
            result.append(matrix[top][col])
        top += 1

        for row in range(top, bottom + 1):
            result.append(matrix[row][right])
        right -= 1

        if top <= bottom:
            for col in range(right, left - 1, -1):
                result.append(matrix[bottom][col])
            bottom -= 1

        if left <= right:
            for row in range(bottom, top - 1, -1):
                result.append(matrix[row][left])
            left += 1

    return result
```

### Problem 8: Implement a Rate Limiter

```python
from collections import deque
import time


class RateLimiter:
    """
    Sliding window rate limiter for order submission.
    Enforces max N requests per window of T seconds.
    O(1) amortized per call.
    """

    def __init__(self, max_requests: int, window_seconds: float):
        self._max_requests = max_requests
        self._window = window_seconds
        self._timestamps: deque = deque()

    def allow_request(self) -> bool:
        """Check if request is allowed under rate limit."""
        now = time.time()
        cutoff = now - self._window

        # Remove expired timestamps
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

        if len(self._timestamps) < self._max_requests:
            self._timestamps.append(now)
            return True

        return False

    @property
    def remaining(self) -> int:
        """Number of requests remaining in current window."""
        now = time.time()
        cutoff = now - self._window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
        return max(0, self._max_requests - len(self._timestamps))
```

### Problem 9: Knapsack for Portfolio Selection

```python
def portfolio_knapsack(
    expected_returns: list[float],
    risks: list[float],
    max_risk_budget: float
) -> tuple[float, list[int]]:
    """
    0/1 Knapsack: select assets to maximize return
    subject to total risk budget constraint.

    This is a simplified portfolio selection problem.
    O(N * B) where B = discretized risk budget.
    """
    n = len(expected_returns)
    # Discretize risk to integer units (multiply by 100)
    scale = 100
    budget = int(max_risk_budget * scale)
    int_risks = [int(r * scale) for r in risks]

    dp = [0.0] * (budget + 1)
    selected = [[False] * n for _ in range(budget + 1)]

    for i in range(n):
        for b in range(budget, int_risks[i] - 1, -1):
            if dp[b - int_risks[i]] + expected_returns[i] > dp[b]:
                dp[b] = dp[b - int_risks[i]] + expected_returns[i]
                selected[b] = list(selected[b - int_risks[i]])
                selected[b][i] = True

    chosen = [i for i in range(n) if selected[budget][i]]
    return dp[budget], chosen


# Example
returns_list = [0.12, 0.08, 0.15, 0.10, 0.20, 0.06]
risks_list = [0.18, 0.10, 0.25, 0.12, 0.30, 0.08]

max_return, chosen_assets = portfolio_knapsack(
    returns_list, risks_list, max_risk_budget=0.50
)
print(f"Max expected return: {max_return:.4f}")
print(f"Selected assets: {chosen_assets}")
```

---

## 7. Key Complexity Reference

```
+----------------------------------------------+-------------------+
| Problem                                       | Time    | Space   |
+----------------------------------------------+-------------------+
| Order book add/cancel                        | O(logN) | O(N)    |
| Ring buffer append/stats                     | O(1)    | O(N)    |
| Segment tree update/query                    | O(logN) | O(N)    |
| LRU cache get/put                            | O(1)    | O(N)    |
| Buy/sell stock (1 trade)                     | O(N)    | O(1)    |
| Buy/sell stock (k trades)                    | O(Nk)   | O(Nk)   |
| Arbitrage detection (Bellman-Ford)           | O(VE)   | O(V)    |
| Running median (two heaps)                   | O(logN) | O(N)    |
| Longest increasing subsequence               | O(NlogN)| O(N)    |
| Binary search (price lookup)                | O(logN) | O(1)    |
| Newton's method (implied vol)                | O(k)    | O(1)    |
| Monte Carlo pricing                          | O(N)    | O(N)    |
| Linear regression (normal equation)          | O(Np^2) | O(p^2)  |
| Matrix multiplication (covariance)           | O(N^3)  | O(N^2)  |
+----------------------------------------------+-------------------+
```

---

*Next Chapter: [Chapter 7 - Options & Derivatives](07-OPTIONS-AND-DERIVATIVES.md)*
