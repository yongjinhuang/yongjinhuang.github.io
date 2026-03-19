# Chapter 10: Trade Execution and Order Management Systems

## Introduction

You have built a brilliant alpha model. Your backtest shows 15% annual returns with a Sharpe ratio of 2.5. You deploy it live and... you lose money. What happened? **Execution happened** -- or more precisely, bad execution happened. The gap between a theoretical signal and realized profit is filled entirely by the execution layer. This chapter teaches you how to build, optimize, and analyze the systems that turn trading signals into actual positions.

---

## 10.1 Why Execution Matters

### The Implementation Shortfall Problem

Implementation shortfall is the difference between the return of a theoretical paper portfolio and the return of the actual portfolio after all execution costs.

```
Paper Portfolio Return:  +8.2%
  - Commissions:         -0.3%
  - Spread Costs:        -0.8%
  - Market Impact:       -1.4%
  - Timing Delay:        -0.5%
  - Opportunity Cost:    -0.6%
  -------------------------
Actual Portfolio Return: +4.6%

Implementation Shortfall = 8.2% - 4.6% = 3.6%
```

Nearly half the alpha was consumed by execution costs. For many strategies, especially those trading frequently or in less liquid instruments, execution costs can exceed alpha entirely.

### Transaction Cost Breakdown

```
+------------------------------------------------------------------+
|              TOTAL TRANSACTION COSTS                              |
+------------------------------------------------------------------+
|                                                                  |
|  EXPLICIT COSTS              IMPLICIT COSTS                     |
|  (Visible, predictable)      (Hidden, variable)                 |
|                                                                  |
|  +--------------------+      +-----------------------------+    |
|  | Commissions        |      | Bid-Ask Spread              |    |
|  | Exchange Fees      |      | Market Impact               |    |
|  | Clearing Fees      |      |   - Temporary impact        |    |
|  | Regulatory Fees    |      |   - Permanent impact        |    |
|  | Taxes (stamp duty) |      | Timing Delay Cost           |    |
|  +--------------------+      | Opportunity Cost            |    |
|                              | Information Leakage          |    |
|  Typically: 1-5 bps          +-----------------------------+    |
|                                                                  |
|                              Typically: 10-200 bps              |
|                              (varies enormously by asset)       |
|                                                                  |
+------------------------------------------------------------------+
```

### Example: Alpha Destroyed by Execution

Consider a statistical arbitrage strategy:

```python
# Strategy characteristics
annual_alpha = 0.02          # 2% annual alpha (decent for stat arb)
annual_turnover = 50.0       # 50x annual turnover (trades frequently)
cost_per_trade_bps = 5       # 5 basis points per trade (round trip)

# Total annual execution cost
annual_cost = annual_turnover * (cost_per_trade_bps / 10000) * 2  # buy + sell
# annual_cost = 50 * 0.0005 * 2 = 0.05 = 5%

net_return = annual_alpha - annual_cost
# net_return = 2% - 5% = -3%

# The strategy LOSES 3% per year despite having positive alpha!
```

This is not hypothetical. Many quantitative strategies fail in production precisely because execution costs were underestimated during backtesting.

### The Execution Quality Spectrum

```
        WORST                                              BEST
        EXECUTION                                          EXECUTION
        |                                                  |
        v                                                  v

  Market orders      Limit orders      Algo execution     Optimal execution
  No timing          Basic timing      TWAP/VWAP          Adaptive algorithms
  Full spread        Partial spread    Reduced impact     Minimized shortfall
  Maximum impact     Some impact       Managed impact     Optimized trajectory
  No venue logic     Single venue      Multi-venue SOR    Dark pool + lit

  Cost: 50-200 bps   Cost: 20-80 bps   Cost: 5-30 bps    Cost: 2-15 bps
```

---

## 10.2 Order Management Systems (OMS)

### Architecture of an OMS

An Order Management System is the central nervous system of any trading operation. It tracks every order from creation to completion.

```
+------------------------------------------------------------------+
|                    ORDER MANAGEMENT SYSTEM                        |
+------------------------------------------------------------------+
|                                                                  |
|  +-------------+     +----------------+     +-----------------+ |
|  |  Strategy   |     |   Order        |     |   Execution     | |
|  |  Engine     |---->|   Manager      |---->|   Management    | |
|  |             |     |                |     |   System (EMS)  | |
|  +-------------+     +----------------+     +-----------------+ |
|        |                    |                       |           |
|        |              +----------+            +----------+     |
|        |              | Order DB |            |  Smart   |     |
|        |              | (State)  |            |  Order   |     |
|        |              +----------+            |  Router  |     |
|        |                    |                 +----------+     |
|        v                    v                       |           |
|  +-------------+     +----------------+             |           |
|  | Risk        |     |  Compliance    |             v           |
|  | Manager     |     |  Engine        |     +-----------------+ |
|  +-------------+     +----------------+     |  Venues         | |
|                                             |  NYSE, NASDAQ   | |
|        +-------------------+                |  Dark Pools     | |
|        | Post-Trade        |                |  ECNs           | |
|        | Analytics / TCA   |                +-----------------+ |
|        +-------------------+                                    |
|                                                                  |
+------------------------------------------------------------------+
```

### Order Lifecycle

Every order goes through a well-defined lifecycle:

```
+-------+    submit    +-----------+    ack     +------------+
|  NEW  |------------>| PENDING   |---------->| ACKNOWLEDGED|
+-------+             | SUBMIT    |           +------------+
                      +-----------+                |
                           |                       |
                      reject|                 fill |  partial
                           v                  |    |  fill
                      +-----------+           v    v
                      | REJECTED  |    +------------+     +----------+
                      +-----------+    | PARTIALLY  |---->|  FILLED  |
                                       | FILLED     |     +----------+
                                       +------------+
                                            |
                                       cancel|
                                            v
                                   +-----------------+
                                   | PENDING CANCEL  |
                                   +-----------------+
                                            |
                                       +----+----+
                                       |         |
                                       v         v
                              +----------+  +-----------+
                              | CANCELLED|  | CANCEL    |
                              +----------+  | REJECTED  |
                                            +-----------+
```

### Order State Machine Implementation

```python
from enum import Enum, auto
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import uuid


class OrderStatus(Enum):
    NEW = auto()
    PENDING_SUBMIT = auto()
    ACKNOWLEDGED = auto()
    PARTIALLY_FILLED = auto()
    FILLED = auto()
    PENDING_CANCEL = auto()
    CANCELLED = auto()
    REJECTED = auto()
    CANCEL_REJECTED = auto()


class OrderSide(Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"
    STOP_LIMIT = "STOP_LIMIT"
    IOC = "IOC"           # Immediate or Cancel
    FOK = "FOK"           # Fill or Kill
    GTC = "GTC"           # Good Till Cancel


# Valid state transitions
VALID_TRANSITIONS = {
    OrderStatus.NEW: {OrderStatus.PENDING_SUBMIT},
    OrderStatus.PENDING_SUBMIT: {
        OrderStatus.ACKNOWLEDGED,
        OrderStatus.REJECTED,
    },
    OrderStatus.ACKNOWLEDGED: {
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.PENDING_CANCEL,
    },
    OrderStatus.PARTIALLY_FILLED: {
        OrderStatus.PARTIALLY_FILLED,  # more partial fills
        OrderStatus.FILLED,
        OrderStatus.PENDING_CANCEL,
    },
    OrderStatus.PENDING_CANCEL: {
        OrderStatus.CANCELLED,
        OrderStatus.CANCEL_REJECTED,
        OrderStatus.FILLED,            # filled before cancel arrived
    },
    OrderStatus.FILLED: set(),         # terminal state
    OrderStatus.CANCELLED: set(),      # terminal state
    OrderStatus.REJECTED: set(),       # terminal state
    OrderStatus.CANCEL_REJECTED: {
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.PENDING_CANCEL,    # try cancelling again
    },
}


@dataclass(frozen=False)
class Order:
    symbol: str
    side: OrderSide
    quantity: float
    order_type: OrderType
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    order_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: OrderStatus = OrderStatus.NEW
    filled_quantity: float = 0.0
    average_fill_price: float = 0.0
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    parent_order_id: Optional[str] = None
    venue: Optional[str] = None

    def transition_to(self, new_status: OrderStatus) -> 'Order':
        """Transition order to a new status with validation."""
        if new_status not in VALID_TRANSITIONS.get(self.status, set()):
            raise ValueError(
                f"Invalid transition: {self.status.name} -> {new_status.name}"
            )
        return Order(
            symbol=self.symbol,
            side=self.side,
            quantity=self.quantity,
            order_type=self.order_type,
            limit_price=self.limit_price,
            stop_price=self.stop_price,
            order_id=self.order_id,
            status=new_status,
            filled_quantity=self.filled_quantity,
            average_fill_price=self.average_fill_price,
            created_at=self.created_at,
            updated_at=datetime.utcnow(),
            parent_order_id=self.parent_order_id,
            venue=self.venue,
        )

    def apply_fill(self, fill_qty: float, fill_price: float) -> 'Order':
        """Apply a fill to the order, returning a new Order."""
        new_filled = self.filled_quantity + fill_qty
        new_avg_price = (
            (self.average_fill_price * self.filled_quantity
             + fill_price * fill_qty) / new_filled
            if new_filled > 0 else 0.0
        )
        new_status = (
            OrderStatus.FILLED
            if new_filled >= self.quantity
            else OrderStatus.PARTIALLY_FILLED
        )
        if new_status not in VALID_TRANSITIONS.get(self.status, set()):
            raise ValueError(
                f"Cannot fill order in status {self.status.name}"
            )
        return Order(
            symbol=self.symbol,
            side=self.side,
            quantity=self.quantity,
            order_type=self.order_type,
            limit_price=self.limit_price,
            stop_price=self.stop_price,
            order_id=self.order_id,
            status=new_status,
            filled_quantity=new_filled,
            average_fill_price=new_avg_price,
            created_at=self.created_at,
            updated_at=datetime.utcnow(),
            parent_order_id=self.parent_order_id,
            venue=self.venue,
        )

    @property
    def remaining_quantity(self) -> float:
        return self.quantity - self.filled_quantity

    @property
    def is_terminal(self) -> bool:
        return self.status in {
            OrderStatus.FILLED,
            OrderStatus.CANCELLED,
            OrderStatus.REJECTED,
        }
```

### Parent Orders vs Child Orders

Large institutional orders are split into smaller child orders for execution:

```
Parent Order: BUY 100,000 shares AAPL
|
|-- Child Order 1: BUY 5,000 AAPL @ NYSE        (FILLED)
|-- Child Order 2: BUY 3,000 AAPL @ NASDAQ      (FILLED)
|-- Child Order 3: BUY 4,000 AAPL @ BATS        (FILLED)
|-- Child Order 4: BUY 2,000 AAPL @ IEX         (PARTIALLY FILLED: 1,500)
|-- Child Order 5: BUY 5,000 AAPL @ Dark Pool   (PENDING)
|-- ...
|-- Child Order N: (remaining quantity)

Total Filled: 13,500 / 100,000 (13.5%)
```

```python
@dataclass(frozen=True)
class ParentOrder:
    order_id: str
    symbol: str
    side: OrderSide
    total_quantity: float
    algo_type: str           # "TWAP", "VWAP", "IS", etc.
    urgency: str             # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    start_time: datetime
    end_time: datetime
    limit_price: Optional[float] = None
    child_orders: tuple = ()  # immutable tuple of child order IDs

    @property
    def filled_quantity(self) -> float:
        """Must be computed from child order states externally."""
        return 0.0  # placeholder -- real impl queries child orders

    def with_child(self, child_id: str) -> 'ParentOrder':
        """Return new ParentOrder with an additional child."""
        return ParentOrder(
            order_id=self.order_id,
            symbol=self.symbol,
            side=self.side,
            total_quantity=self.total_quantity,
            algo_type=self.algo_type,
            urgency=self.urgency,
            start_time=self.start_time,
            end_time=self.end_time,
            limit_price=self.limit_price,
            child_orders=self.child_orders + (child_id,),
        )
```

---

## 10.3 Execution Algorithms

Execution algorithms break large orders into smaller pieces and time them to minimize market impact.

### Algorithm Taxonomy

```
+------------------------------------------------------------------+
|                  EXECUTION ALGORITHMS                            |
+------------------------------------------------------------------+
|                                                                  |
|  SCHEDULE-BASED            OPPORTUNISTIC                        |
|  (Predictable pace)       (React to market)                    |
|                                                                  |
|  +------------------+     +---------------------------+         |
|  | TWAP             |     | Implementation Shortfall  |         |
|  | VWAP             |     | Sniper / Liquidity Seeker |         |
|  | POV              |     | Dark Pool Sweeper         |         |
|  +------------------+     +---------------------------+         |
|                                                                  |
|  PASSIVE                   AGGRESSIVE                           |
|  (Minimize cost)           (Maximize fill rate)                 |
|                                                                  |
|  +------------------+     +---------------------------+         |
|  | Iceberg           |     | Market-on-Close           |         |
|  | Peg orders        |     | Immediate-or-Cancel       |         |
|  | Reserve           |     | Fill-or-Kill              |         |
|  +------------------+     +---------------------------+         |
|                                                                  |
+------------------------------------------------------------------+
```

### TWAP (Time-Weighted Average Price)

TWAP splits the order into equal slices over a time horizon. It is the simplest benchmark algorithm.

```
Total order: 10,000 shares over 100 minutes
Slice size: 10,000 / 20 slices = 500 shares every 5 minutes

Time:    |-----|-----|-----|-----|-----|-----|--- ... ---|
         0     5    10    15    20    25    30          100
Shares:  500   500   500   500   500   500   500       500

Each slice can be:
  - Market order (aggressive, guaranteed fill)
  - Limit order at mid-price (passive, may not fill)
  - Limit order at best bid/ask (moderate)
```

```python
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class TWAPSlice:
    scheduled_time: datetime
    quantity: float
    executed: bool = False
    fill_price: float = 0.0


def create_twap_schedule(
    total_quantity: float,
    start_time: datetime,
    end_time: datetime,
    num_slices: int = 20,
    randomize: bool = True,
    random_seed: int = 42,
) -> List[TWAPSlice]:
    """
    Create a TWAP execution schedule.

    Args:
        total_quantity: Total shares to execute.
        start_time: When to begin execution.
        end_time: When to finish execution.
        num_slices: Number of child orders.
        randomize: Add timing jitter to avoid detection.
        random_seed: Seed for reproducibility.

    Returns:
        List of TWAPSlice objects defining the schedule.
    """
    rng = np.random.default_rng(random_seed)
    duration = (end_time - start_time).total_seconds()
    interval = duration / num_slices
    base_qty = total_quantity / num_slices

    slices = []
    for i in range(num_slices):
        scheduled = start_time + timedelta(seconds=interval * i)

        # Add random jitter: +/- 20% of interval
        if randomize and i > 0:
            jitter = rng.uniform(-0.2, 0.2) * interval
            scheduled = scheduled + timedelta(seconds=jitter)

        # Slight quantity randomization to avoid pattern detection
        if randomize:
            qty_noise = rng.uniform(0.9, 1.1)
        else:
            qty_noise = 1.0

        qty = base_qty * qty_noise
        slices.append(TWAPSlice(scheduled_time=scheduled, quantity=round(qty)))

    # Adjust last slice to ensure total quantity is exact
    filled_so_far = sum(s.quantity for s in slices[:-1])
    remainder = total_quantity - filled_so_far
    adjusted_last = TWAPSlice(
        scheduled_time=slices[-1].scheduled_time,
        quantity=round(remainder),
    )
    return slices[:-1] + [adjusted_last]


# Example usage
schedule = create_twap_schedule(
    total_quantity=10000,
    start_time=datetime(2025, 1, 15, 9, 30),
    end_time=datetime(2025, 1, 15, 16, 0),
    num_slices=20,
)
for s in schedule[:5]:
    print(f"  {s.scheduled_time.strftime('%H:%M:%S')}  ->  {s.quantity} shares")
```

### VWAP (Volume-Weighted Average Price)

VWAP weights execution by expected volume throughout the day. It sends more shares during high-volume periods.

```
Volume Profile (typical U-shaped pattern):

Volume
  |
  |**                                                    **
  | **                                                 **
  |  **                                              **
  |   ***                                         ***
  |     ****                                   ****
  |        ******                         ******
  |             ***************************
  +---------------------------------------------------> Time
  9:30  10:00  11:00  12:00  13:00  14:00  15:00  16:00

VWAP slicing follows this profile:
  - More shares at open (high volume)
  - Fewer shares at midday (low volume)
  - More shares near close (high volume)
```

```python
from typing import Tuple


def create_vwap_schedule(
    total_quantity: float,
    start_time: datetime,
    end_time: datetime,
    volume_profile: np.ndarray,
    num_slices: int = 20,
) -> List[TWAPSlice]:
    """
    Create a VWAP execution schedule using a historical volume profile.

    Args:
        total_quantity: Total shares to execute.
        start_time: Execution start time.
        end_time: Execution end time.
        volume_profile: Array of expected volume proportions per bucket.
        num_slices: Number of child orders to create.

    Returns:
        List of TWAPSlice objects weighted by volume.
    """
    duration = (end_time - start_time).total_seconds()
    interval = duration / num_slices

    # Resample volume profile to match num_slices
    profile_resampled = np.interp(
        np.linspace(0, len(volume_profile) - 1, num_slices),
        np.arange(len(volume_profile)),
        volume_profile,
    )

    # Normalize so weights sum to 1.0
    weights = profile_resampled / profile_resampled.sum()

    slices = []
    cumulative_qty = 0.0
    for i in range(num_slices):
        scheduled = start_time + timedelta(seconds=interval * i)
        qty = round(total_quantity * weights[i])
        cumulative_qty += qty
        slices.append(TWAPSlice(scheduled_time=scheduled, quantity=qty))

    # Fix rounding error on last slice
    rounding_error = total_quantity - cumulative_qty
    if slices:
        adjusted_last = TWAPSlice(
            scheduled_time=slices[-1].scheduled_time,
            quantity=slices[-1].quantity + round(rounding_error),
        )
        slices = slices[:-1] + [adjusted_last]

    return slices


def build_typical_volume_profile() -> np.ndarray:
    """
    Build a typical U-shaped intraday volume profile.
    Returns 78 buckets (one per 5 minutes of a 6.5-hour trading day).
    """
    minutes = np.arange(78)
    # U-shaped: high at open and close, low at midday
    open_decay = 3.0 * np.exp(-0.08 * minutes)
    close_surge = 2.5 * np.exp(-0.08 * (77 - minutes))
    base = np.ones(78) * 0.5
    profile = base + open_decay + close_surge
    return profile / profile.sum()


# Example
volume_profile = build_typical_volume_profile()
vwap_schedule = create_vwap_schedule(
    total_quantity=50000,
    start_time=datetime(2025, 1, 15, 9, 30),
    end_time=datetime(2025, 1, 15, 16, 0),
    volume_profile=volume_profile,
    num_slices=26,  # every 15 minutes
)
```

### Implementation Shortfall / Arrival Price Algorithm

Unlike TWAP and VWAP which target benchmarks, Implementation Shortfall (IS) algorithms minimize the gap between the arrival price (decision price) and the final execution price. They trade off urgency against market impact.

```
Urgency Spectrum:

LOW URGENCY                                    HIGH URGENCY
(Minimize impact)                              (Minimize risk)
|                                              |
v                                              v
Spread execution                               Front-load execution
over long period                               into early slices

  Qty                                           Qty
   |                                             |
   |* * * * * * * * *                            |*
   |                                             | *
   |                                             |  *
   |                                             |   **
   |                                             |     ****
   |                                             |         *****
   +-------------------> t                       +-------------------> t
   Patient / passive                             Aggressive / urgent
```

### Percentage of Volume (POV)

POV matches a target participation rate -- for example, "be 10% of volume."

```python
@dataclass(frozen=True)
class POVState:
    target_rate: float       # e.g., 0.10 for 10%
    total_quantity: float    # total order size
    filled_quantity: float = 0.0

    @property
    def remaining(self) -> float:
        return self.total_quantity - self.filled_quantity

    def compute_slice(self, observed_market_volume: float) -> Tuple[float, 'POVState']:
        """
        Given observed market volume in the last interval,
        compute how many shares to send.
        Returns (slice_quantity, new_state).
        """
        target_qty = observed_market_volume * self.target_rate
        slice_qty = min(target_qty, self.remaining)
        new_state = POVState(
            target_rate=self.target_rate,
            total_quantity=self.total_quantity,
            filled_quantity=self.filled_quantity + slice_qty,
        )
        return round(slice_qty), new_state
```

### Iceberg / Reserve Orders

Iceberg orders show only a small "visible" portion to the market while hiding the rest.

```
Total Order: 50,000 shares

Visible in order book:    [  2,000 shares  ]
Hidden (reserve):         [ 48,000 shares  ]

When 2,000 fills -> automatically replenish:
Visible in order book:    [  2,000 shares  ]  (refreshed)
Hidden (reserve):         [ 46,000 shares  ]

Repeat until fully filled.

WARNING: Sophisticated participants detect icebergs by watching
for consistent replenishment at the same price level.
```

---

## 10.4 Smart Order Routing (SOR)

### Why SOR Exists

Modern equity markets are fragmented across many venues:

```
+------------------------------------------------------------------+
|              US EQUITY MARKET FRAGMENTATION                      |
+------------------------------------------------------------------+
|                                                                  |
|  LIT EXCHANGES              DARK POOLS         OTHER            |
|  +-----------------+        +---------------+  +-------------+  |
|  | NYSE       ~22% |        | Crossfinder   |  | ATS venues  |  |
|  | NASDAQ     ~18% |        | SIGMA X       |  | Retail       |  |
|  | CBOE/BATS  ~16% |        | Instinet      |  | wholesalers |  |
|  | IEX         ~3% |        | MS Pool       |  | (Citadel,   |  |
|  | MEMX        ~3% |        | UBS ATS       |  |  Virtu)     |  |
|  | LTSE, MIAX  <1% |        | Level ATS     |  +-------------+  |
|  +-----------------+        +---------------+                    |
|                                                                  |
|  ~60% lit exchanges          ~12% dark pools   ~28% off-exchange |
|                                                                  |
|  Each venue has different:                                       |
|    - Fees / rebates                                              |
|    - Queue priority rules                                        |
|    - Latency characteristics                                     |
|    - Available liquidity                                         |
|    - Order types                                                 |
+------------------------------------------------------------------+
```

### SOR Decision Logic

```
                     +-------------------+
                     |  Incoming Order   |
                     | BUY 5,000 AAPL   |
                     +-------------------+
                              |
                              v
                     +-------------------+
                     |  SOR Engine       |
                     |                   |
                     |  1. Check NBBO    |
                     |  2. Check depth   |
                     |  3. Evaluate fees |
                     |  4. Estimate fill |
                     |     probability   |
                     |  5. Check latency |
                     +-------------------+
                       /    |    |    \
                      /     |    |     \
                     v      v    v      v
              +------+ +----+ +----+ +--------+
              | NYSE | |NASD| |BATS| | Dark   |
              |      | |  AQ| |    | | Pool   |
              | 2000 | |1500| |1000| | 500    |
              | @150 | |@150| |@150| | @149.99|
              +------+ +----+ +----+ +--------+
```

### Routing Strategies

```python
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class VenueQuote:
    venue: str
    price: float
    size: float
    fee_per_share: float    # negative = rebate
    latency_ms: float
    fill_probability: float  # estimated 0.0 to 1.0


@dataclass(frozen=True)
class RoutingDecision:
    venue: str
    quantity: float
    expected_cost: float


def sequential_routing(
    order_qty: float,
    side: str,
    venue_quotes: List[VenueQuote],
) -> List[RoutingDecision]:
    """
    Sequential routing: fill at best venue first, then next best, etc.
    """
    if side == "BUY":
        sorted_venues = sorted(venue_quotes, key=lambda v: v.price)
    else:
        sorted_venues = sorted(venue_quotes, key=lambda v: -v.price)

    decisions = []
    remaining = order_qty

    for venue in sorted_venues:
        if remaining <= 0:
            break
        fill_qty = min(remaining, venue.size)
        cost = fill_qty * (venue.price + venue.fee_per_share)
        decisions.append(RoutingDecision(
            venue=venue.venue,
            quantity=fill_qty,
            expected_cost=cost,
        ))
        remaining -= fill_qty

    return decisions


def spray_routing(
    order_qty: float,
    side: str,
    venue_quotes: List[VenueQuote],
) -> List[RoutingDecision]:
    """
    Spray routing: send to all venues at the best price simultaneously.
    Faster but risks over-filling.
    """
    if side == "BUY":
        best_price = min(v.price for v in venue_quotes)
        at_best = [v for v in venue_quotes if v.price <= best_price + 0.01]
    else:
        best_price = max(v.price for v in venue_quotes)
        at_best = [v for v in venue_quotes if v.price >= best_price - 0.01]

    total_available = sum(v.size for v in at_best)

    decisions = []
    remaining = order_qty

    for venue in at_best:
        if remaining <= 0:
            break
        # Proportional allocation
        proportion = venue.size / total_available if total_available > 0 else 0
        fill_qty = min(round(order_qty * proportion), remaining, venue.size)
        cost = fill_qty * (venue.price + venue.fee_per_share)
        decisions.append(RoutingDecision(
            venue=venue.venue,
            quantity=fill_qty,
            expected_cost=cost,
        ))
        remaining -= fill_qty

    return decisions
```

### Maker-Taker Economics

```
+------------------------------------------------------------------+
|                   MAKER-TAKER FEE MODEL                          |
+------------------------------------------------------------------+
|                                                                  |
|  "MAKER" = Adds liquidity (limit orders that rest in book)       |
|  "TAKER" = Removes liquidity (market orders or crossing limits)  |
|                                                                  |
|  Typical fees per share:                                         |
|                                                                  |
|  Venue          Maker Rebate    Taker Fee     Net (taker)       |
|  -------        ------------    ---------     -----------       |
|  NYSE Arca      -$0.0020        +$0.0030      +$0.0030          |
|  NASDAQ         -$0.0020        +$0.0030      +$0.0030          |
|  BATS BZX       -$0.0020        +$0.0030      +$0.0030          |
|  BATS EDGX      -$0.0020        +$0.0030      +$0.0030          |
|  IEX            $0.0000         +$0.0009      +$0.0009          |
|                                                                  |
|  INVERTED VENUES (taker-maker):                                  |
|  BATS EDGA      +$0.0004        -$0.0006      -$0.0006          |
|  NASDAQ BX      +$0.0005        -$0.0010      -$0.0010          |
|                                                                  |
|  For passive strategies, routing to maker-rebate venues          |
|  effectively pays you to provide liquidity.                      |
|                                                                  |
+------------------------------------------------------------------+
```

### Reg NMS and Best Execution

Regulation NMS (National Market System) requires brokers to route orders to the venue displaying the best price (NBBO -- National Best Bid and Offer). SOR must respect this.

```
NBBO Calculation:

  NYSE:    Bid $150.10 x 500    Ask $150.15 x 300
  NASDAQ:  Bid $150.08 x 200    Ask $150.12 x 800   <-- Best Ask
  BATS:    Bid $150.11 x 1000   Ask $150.14 x 400
  IEX:     Bid $150.12 x 150    Ask $150.13 x 200

  NBBO = Best Bid $150.12 (IEX) x Best Ask $150.12 (NASDAQ)
  NBBO Spread = $0.00 (locked market) or
  NBBO = Best Bid $150.11 (BATS) x Best Ask $150.12 (NASDAQ)
  NBBO Spread = $0.01

  SOR MUST NOT buy at $150.15 when $150.12 is available.
  This is a "trade-through" violation under Reg NMS.
```

---

## 10.5 Market Impact

### Temporary vs Permanent Impact

When you trade, you move the price. This comes in two forms:

```
Price
  |
  |                    Permanent Impact
  |              ........................................
  |            .
  |          .     <-- Price recovers partially
  |        .         but not fully
  |      .  Temporary
  |    .    Impact
  |  .
  |. <-- Trade begins
  |
  +---------------------------------------------------> Time
       Execution            Recovery         New Equilibrium
       Window               Period
```

```
Temporary Impact:
  - Caused by short-term supply/demand imbalance
  - Decays after execution completes
  - Proportional to execution speed (faster = more impact)

Permanent Impact:
  - Caused by information content of the trade
  - Does not decay -- represents new fair value
  - Proportional to total order size
```

### Impact Models

**Linear Impact Model** (simplest):

```
Impact = gamma * (Q / V)

Where:
  gamma = impact coefficient (calibrated from data)
  Q     = order size (shares)
  V     = average daily volume
```

**Square-Root Impact Model** (most widely used):

```
Impact = sigma * gamma * sqrt(Q / V)

Where:
  sigma = daily volatility
  gamma = impact coefficient (typically 0.1 to 1.0)
  Q     = order size (shares)
  V     = average daily volume
```

The square-root model is empirically observed across most asset classes. Doubling order size does not double impact -- it only increases it by about 41%.

```
Impact vs Order Size (Square-Root Model):

Impact
(bps)
  80 |                                              *
     |                                         *
  60 |                                    *
     |                              *
  40 |                        *
     |                  *
  20 |            *
     |      *
   0 |*
     +-------------------------------------------->
     0%    1%    2%    3%    4%    5%    6%    7%
                   Order Size (% of ADV)
```

### Almgren-Chriss Optimal Execution

The Almgren-Chriss framework finds the optimal trading trajectory that minimizes the sum of market impact cost and timing risk.

```
Problem:
  - You must sell X shares over time horizon T
  - Trading faster  -> more impact cost, less risk
  - Trading slower  -> less impact cost, more risk
  - Find the trajectory that minimizes:
      E[cost] + lambda * Var[cost]
    where lambda is risk aversion

Solution (continuous-time):

  Optimal trajectory: x(t) = X * sinh(kappa * (T - t)) / sinh(kappa * T)

  Where kappa = sqrt(lambda * sigma^2 / eta)
    lambda = risk aversion parameter
    sigma  = volatility
    eta    = temporary impact coefficient
```

```
Optimal Trajectories for Different Risk Aversions:

Remaining
Shares
  X |*
    | *\
    |  *  \                    lambda = 0 (risk-neutral, linear / TWAP)
    |   *    \____
    |    *         ------___
    |     *                  ------___
    |      *                           ---   lambda = low
    |       **
    |         **                             lambda = high
    |           ***                           (front-loaded)
    |              *****
    |                   ********
  0 |                           **********
    +-------------------------------------------->
    0                    T/2                    T
                        Time
```

```python
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple


@dataclass(frozen=True)
class AlmgrenChrissParams:
    total_shares: float       # X: total shares to execute
    time_horizon: float       # T: time horizon in hours
    num_steps: int            # N: number of trading intervals
    daily_volume: float       # V: average daily volume
    volatility: float         # sigma: daily volatility (e.g., 0.02)
    temp_impact: float        # eta: temporary impact coefficient
    perm_impact: float        # gamma: permanent impact coefficient
    risk_aversion: float      # lambda: risk aversion parameter


def compute_optimal_trajectory(
    params: AlmgrenChrissParams,
) -> Tuple[np.ndarray, np.ndarray, dict]:
    """
    Compute the Almgren-Chriss optimal execution trajectory.

    Returns:
        times: Array of time points.
        holdings: Array of remaining shares at each time.
        stats: Dictionary with cost and risk estimates.
    """
    X = params.total_shares
    T = params.time_horizon
    N = params.num_steps
    sigma = params.volatility
    eta = params.temp_impact
    gamma = params.perm_impact
    lam = params.risk_aversion

    tau = T / N  # time step size
    times = np.linspace(0, T, N + 1)

    # Kappa determines the shape of the trajectory
    # Higher kappa = more front-loaded (aggressive)
    kappa_sq = lam * sigma**2 / (eta / tau)
    kappa = np.sqrt(max(kappa_sq, 1e-10))

    # Optimal trajectory: remaining holdings at each time
    holdings = np.array([
        X * np.sinh(kappa * (T - t)) / np.sinh(kappa * T)
        if np.sinh(kappa * T) > 1e-10 else X * (1 - t / T)
        for t in times
    ])

    # Trading rate at each step
    trade_sizes = -np.diff(holdings)  # shares sold in each interval

    # Cost estimates
    # Expected permanent impact cost
    perm_cost = 0.5 * gamma * X**2

    # Expected temporary impact cost
    temp_cost = eta * np.sum(trade_sizes**2 / tau)

    # Execution risk (variance)
    exec_risk = sigma**2 * tau * np.sum(holdings[:-1]**2)

    # Total expected cost + risk penalty
    total_objective = perm_cost + temp_cost + lam * exec_risk

    stats = {
        "permanent_impact_cost": perm_cost,
        "temporary_impact_cost": temp_cost,
        "execution_risk_variance": exec_risk,
        "total_objective": total_objective,
        "trade_sizes": trade_sizes,
        "average_trade_size": np.mean(trade_sizes),
        "participation_rate": np.mean(
            trade_sizes / (params.daily_volume / (6.5 / tau))
        ),
    }

    return times, holdings, stats


# Example: Sell 100,000 shares over 2 hours
params = AlmgrenChrissParams(
    total_shares=100000,
    time_horizon=2.0,         # 2 hours
    num_steps=24,             # every 5 minutes
    daily_volume=5_000_000,
    volatility=0.02,          # 2% daily vol
    temp_impact=0.001,
    perm_impact=0.0001,
    risk_aversion=1e-6,       # moderate risk aversion
)

times, holdings, stats = compute_optimal_trajectory(params)

print(f"Permanent impact cost: ${stats['permanent_impact_cost']:.2f}")
print(f"Temporary impact cost: ${stats['temporary_impact_cost']:.2f}")
print(f"Execution risk (std):  ${np.sqrt(stats['execution_risk_variance']):.2f}")
print(f"Avg participation:     {stats['participation_rate']:.1%}")
```

---

## 10.6 Slippage Analysis

### What is Slippage?

Slippage is the difference between the expected price of a trade and the actual price at which it was executed.

```
+------------------------------------------------------------------+
|                    SLIPPAGE DECOMPOSITION                         |
+------------------------------------------------------------------+
|                                                                  |
|  Decision Price (when signal fired):  $150.00                    |
|                                                                  |
|  + Delay Cost (signal to order):      +$0.02                    |
|    (Price moved while you prepared the order)                    |
|                                                                  |
|  + Spread Cost:                       +$0.01                    |
|    (Half the bid-ask spread)                                     |
|                                                                  |
|  + Impact Cost:                       +$0.05                    |
|    (Your own order moved the price)                              |
|                                                                  |
|  + Fee Cost:                          +$0.003                   |
|    (Exchange and broker fees)                                    |
|                                                                  |
|  = Actual Fill Price:                 $150.083                   |
|                                                                  |
|  Total Slippage = $150.083 - $150.00 = $0.083 (5.5 bps)        |
|                                                                  |
+------------------------------------------------------------------+
```

### Measuring Slippage

```python
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Fill:
    timestamp: datetime
    quantity: float
    price: float
    venue: str
    side: str


@dataclass(frozen=True)
class SlippageMetrics:
    arrival_slippage_bps: float
    vwap_slippage_bps: float
    spread_cost_bps: float
    impact_cost_bps: float
    timing_cost_bps: float
    total_cost_bps: float


def compute_slippage(
    fills: List[Fill],
    arrival_price: float,
    market_vwap: float,
    arrival_mid: float,
    arrival_spread: float,
    side: str,
) -> SlippageMetrics:
    """
    Compute comprehensive slippage metrics for an executed order.
    """
    if not fills:
        raise ValueError("No fills to analyze")

    total_qty = sum(f.quantity for f in fills)
    exec_vwap = sum(f.quantity * f.price for f in fills) / total_qty

    # Direction multiplier: buys want lower prices, sells want higher
    direction = 1.0 if side == "BUY" else -1.0

    # Arrival price slippage
    arrival_slip = direction * (exec_vwap - arrival_price) / arrival_price * 10000

    # VWAP slippage
    vwap_slip = direction * (exec_vwap - market_vwap) / market_vwap * 10000

    # Spread cost estimate (half-spread)
    spread_cost = (arrival_spread / 2) / arrival_mid * 10000

    # Impact = execution price vs mid adjusted for spread
    expected_fill = arrival_mid + direction * (arrival_spread / 2)
    impact = direction * (exec_vwap - expected_fill) / arrival_mid * 10000

    # Timing = arrival mid vs decision price (already in arrival_slippage)
    timing = max(0, arrival_slip - spread_cost - impact)

    return SlippageMetrics(
        arrival_slippage_bps=round(arrival_slip, 2),
        vwap_slippage_bps=round(vwap_slip, 2),
        spread_cost_bps=round(spread_cost, 2),
        impact_cost_bps=round(max(0, impact), 2),
        timing_cost_bps=round(timing, 2),
        total_cost_bps=round(arrival_slip, 2),
    )
```

### Transaction Cost Analysis (TCA)

TCA is the systematic measurement and analysis of execution quality. It answers: "How well did we execute?"

```
+------------------------------------------------------------------+
|                TRANSACTION COST ANALYSIS                         |
+------------------------------------------------------------------+
|                                                                  |
|  BENCHMARKS                                                      |
|  +------------------------------------------------------------+ |
|  | Arrival Price  | Mid-price when order entered              | |
|  | VWAP           | Volume-weighted average during execution  | |
|  | Close Price    | Closing price of the day                  | |
|  | Interval VWAP  | VWAP over execution window only          | |
|  | Previous Close | Prior day's closing price                 | |
|  | Open Price     | Opening price of the day                  | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  DIMENSIONS                                                      |
|  +------------------------------------------------------------+ |
|  | By Time     | Intraday cost patterns                       | |
|  | By Size     | Cost vs order size                           | |
|  | By Venue    | Fill quality per venue                       | |
|  | By Algo     | TWAP vs VWAP vs IS performance              | |
|  | By Sector   | Liquidity differences across sectors        | |
|  | By Trader   | Individual trader performance               | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

```python
@dataclass(frozen=True)
class TCAReport:
    order_id: str
    symbol: str
    side: str
    total_quantity: float
    exec_vwap: float
    arrival_price: float
    market_vwap: float
    close_price: float
    num_fills: int
    num_venues: int
    execution_duration_seconds: float
    participation_rate: float
    slippage: SlippageMetrics


def generate_tca_report(
    order_id: str,
    fills: List[Fill],
    arrival_price: float,
    market_vwap: float,
    close_price: float,
    market_volume: float,
    arrival_mid: float,
    arrival_spread: float,
    side: str,
    symbol: str,
) -> TCAReport:
    """Generate a TCA report for a completed order."""
    total_qty = sum(f.quantity for f in fills)
    exec_vwap = sum(f.quantity * f.price for f in fills) / total_qty

    venues = set(f.venue for f in fills)

    timestamps = [f.timestamp for f in fills]
    duration = (max(timestamps) - min(timestamps)).total_seconds()

    participation = total_qty / market_volume if market_volume > 0 else 0

    slippage = compute_slippage(
        fills=fills,
        arrival_price=arrival_price,
        market_vwap=market_vwap,
        arrival_mid=arrival_mid,
        arrival_spread=arrival_spread,
        side=side,
    )

    return TCAReport(
        order_id=order_id,
        symbol=symbol,
        side=side,
        total_quantity=total_qty,
        exec_vwap=exec_vwap,
        arrival_price=arrival_price,
        market_vwap=market_vwap,
        close_price=close_price,
        num_fills=len(fills),
        num_venues=len(venues),
        execution_duration_seconds=duration,
        participation_rate=participation,
        slippage=slippage,
    )
```

---

## 10.7 The FIX Protocol

### Overview

The Financial Information eXchange (FIX) protocol is the standard for electronic trading communication. Nearly all institutional trading flows through FIX.

```
+------------------------------------------------------------------+
|                    FIX PROTOCOL STACK                             |
+------------------------------------------------------------------+
|                                                                  |
|  APPLICATION LAYER                                               |
|  +------------------------------------------------------------+ |
|  | Business Messages:                                          | |
|  |   NewOrderSingle (D)      ExecutionReport (8)               | |
|  |   OrderCancelRequest (F)  OrderCancelReject (9)             | |
|  |   OrderReplaceRequest (G) MarketDataRequest (V)             | |
|  |   MarketDataSnapshot (W)  SecurityListRequest (x)           | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  SESSION LAYER                                                   |
|  +------------------------------------------------------------+ |
|  | Session Messages:                                           | |
|  |   Logon (A)               Logout (5)                       | |
|  |   Heartbeat (0)           TestRequest (1)                   | |
|  |   ResendRequest (2)       SequenceReset (4)                 | |
|  |   Reject (3)                                                | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  TRANSPORT LAYER                                                 |
|  +------------------------------------------------------------+ |
|  | TCP/IP (FIX 4.x)                                           | |
|  | TCP/IP or WebSocket (FIX 5.0 / FIXT 1.1)                   | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### FIX Message Format

FIX messages use tag=value pairs separated by SOH (ASCII 0x01, shown as `|` below):

```
Raw FIX Message (NewOrderSingle):

8=FIX.4.4|9=176|35=D|49=SENDER|56=TARGET|34=12|52=20250115-14:30:00.000|
11=ORD-001|21=1|55=AAPL|54=1|60=20250115-14:30:00.000|38=5000|40=2|
44=150.25|59=0|47=A|10=123|

Decoded:
  Tag   Field Name            Value         Meaning
  ---   ----------            -----         -------
  8     BeginString           FIX.4.4       Protocol version
  9     BodyLength            176           Message body length
  35    MsgType               D             NewOrderSingle
  49    SenderCompID          SENDER        Who sent it
  56    TargetCompID          TARGET        Who receives it
  34    MsgSeqNum             12            Sequence number
  52    SendingTime           20250115...   When sent (UTC)
  11    ClOrdID               ORD-001       Client order ID
  21    HandlInst             1             Automated (no manual)
  55    Symbol                AAPL          Instrument
  54    Side                  1             Buy (2=Sell)
  60    TransactTime          20250115...   Transaction time
  38    OrderQty              5000          Quantity
  40    OrdType               2             Limit (1=Market)
  44    Price                 150.25        Limit price
  59    TimeInForce           0             Day order
  47    Rule80A               A             Agency order
  10    CheckSum              123           Checksum
```

### Complete Order Lifecycle in FIX

```
CLIENT                                              EXCHANGE
  |                                                    |
  |  1. NewOrderSingle (35=D)                          |
  |  11=ORD-001|55=AAPL|54=1|38=5000|40=2|44=150.25   |
  |--------------------------------------------------->|
  |                                                    |
  |  2. ExecutionReport (35=8) - Acknowledgment        |
  |  37=EX-001|17=EXEC-001|150=0|39=0|                 |
  |  (OrdStatus=New, ExecType=New)                     |
  |<---------------------------------------------------|
  |                                                    |
  |  3. ExecutionReport (35=8) - Partial Fill           |
  |  37=EX-001|17=EXEC-002|150=1|39=1|                 |
  |  31=150.22|32=2000|14=2000|151=3000|               |
  |  (OrdStatus=PartiallyFilled, LastPx=150.22,        |
  |   LastQty=2000, CumQty=2000, LeavesQty=3000)      |
  |<---------------------------------------------------|
  |                                                    |
  |  4. OrderCancelRequest (35=F)                       |
  |  41=ORD-001|11=ORD-002|                             |
  |--------------------------------------------------->|
  |                                                    |
  |  5. ExecutionReport (35=8) - Cancelled              |
  |  37=EX-001|17=EXEC-003|150=4|39=4|                 |
  |  14=2000|151=0|                                     |
  |  (OrdStatus=Cancelled, CumQty=2000, LeavesQty=0)  |
  |<---------------------------------------------------|
  |                                                    |
```

### Key FIX Message Types

```
+------------------------------------------------------------------+
|  MsgType   Name                    Direction     Purpose          |
+------------------------------------------------------------------+
|  A         Logon                   Both          Start session    |
|  5         Logout                  Both          End session      |
|  0         Heartbeat               Both          Keep alive       |
|  1         TestRequest             Both          Check connection |
|  D         NewOrderSingle          Client->Exch  Submit order     |
|  F         OrderCancelRequest      Client->Exch  Cancel order     |
|  G         OrderCancelReplace      Client->Exch  Modify order     |
|  8         ExecutionReport         Exch->Client  Order update     |
|  9         OrderCancelReject       Exch->Client  Cancel failed    |
|  V         MarketDataRequest       Client->Exch  Subscribe data   |
|  W         MarketDataSnapshot      Exch->Client  Full book snap   |
|  X         MarketDataIncRefresh    Exch->Client  Book update      |
+------------------------------------------------------------------+
```

### FIX Versions

```
FIX 4.0 (1996)  ->  FIX 4.2 (2001)  ->  FIX 4.4 (2003)  ->  FIX 5.0 (2006)
                     Most widely          Added algo         Separated session
                     used in              order fields,      and application
                     production           parties block      layers (FIXT 1.1)

Most firms still use FIX 4.2 or 4.4.
FIX 5.0 / FIXT 1.1 is newer but adoption is slower.
```

### QuickFIX Example

```python
"""
Example using the QuickFIX library to send a NewOrderSingle.
QuickFIX is the standard open-source FIX engine.
Install: pip install quickfix
"""

# NOTE: This is illustrative. A real implementation requires
# a running FIX session with proper configuration.

import quickfix as fix
import quickfix44 as fix44
import time
import uuid


class TradingApplication(fix.Application):
    """FIX application handler."""

    def __init__(self):
        super().__init__()
        self._session_id = None

    def onCreate(self, session_id):
        self._session_id = session_id

    def onLogon(self, session_id):
        print(f"Logon: {session_id}")

    def onLogout(self, session_id):
        print(f"Logout: {session_id}")

    def toAdmin(self, message, session_id):
        pass  # outgoing admin messages

    def fromAdmin(self, message, session_id):
        pass  # incoming admin messages

    def toApp(self, message, session_id):
        pass  # outgoing application messages

    def fromApp(self, message, session_id):
        """Handle incoming application messages (execution reports, etc.)."""
        msg_type = fix.MsgType()
        message.getHeader().getField(msg_type)

        if msg_type.getValue() == fix.MsgType_ExecutionReport:
            self._handle_execution_report(message)

    def _handle_execution_report(self, message):
        """Process an execution report."""
        cl_ord_id = fix.ClOrdID()
        exec_type = fix.ExecType()
        ord_status = fix.OrdStatus()

        message.getField(cl_ord_id)
        message.getField(exec_type)
        message.getField(ord_status)

        print(f"ExecReport: ClOrdID={cl_ord_id.getValue()}, "
              f"ExecType={exec_type.getValue()}, "
              f"OrdStatus={ord_status.getValue()}")

        if ord_status.getValue() in (
            fix.OrdStatus_PARTIALLY_FILLED,
            fix.OrdStatus_FILLED,
        ):
            last_px = fix.LastPx()
            last_qty = fix.LastQty()
            message.getField(last_px)
            message.getField(last_qty)
            print(f"  Fill: {last_qty.getValue()} @ {last_px.getValue()}")

    def send_new_order(
        self,
        symbol: str,
        side: str,
        quantity: int,
        price: float,
        order_type: str = "LIMIT",
    ):
        """Send a NewOrderSingle message."""
        order = fix44.NewOrderSingle()

        order.setField(fix.ClOrdID(str(uuid.uuid4())))
        order.setField(fix.HandlInst(fix.HandlInst_AUTOMATED_EXECUTION_ORDER_PRIVATE))
        order.setField(fix.Symbol(symbol))
        order.setField(
            fix.Side(fix.Side_BUY if side == "BUY" else fix.Side_SELL)
        )
        order.setField(fix.TransactTime())
        order.setField(fix.OrderQty(quantity))

        if order_type == "LIMIT":
            order.setField(fix.OrdType(fix.OrdType_LIMIT))
            order.setField(fix.Price(price))
        else:
            order.setField(fix.OrdType(fix.OrdType_MARKET))

        order.setField(fix.TimeInForce(fix.TimeInForce_DAY))

        fix.Session.sendToTarget(order, self._session_id)
```

---

## 10.8 Execution Infrastructure

### The Full Stack

```
+------------------------------------------------------------------+
|               EXECUTION INFRASTRUCTURE STACK                     |
+------------------------------------------------------------------+
|                                                                  |
|  STRATEGY LAYER                                                  |
|  +------------------------------------------------------------+ |
|  | Alpha Model -> Position Target -> Execution Signal          | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  PRE-TRADE RISK CHECKS                                           |
|  +------------------------------------------------------------+ |
|  | Position limits | Order size limits | Notional limits       | |
|  | Fat finger checks | Restricted list | Credit checks        | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  ORDER MANAGEMENT / ALGO ENGINE                                  |
|  +------------------------------------------------------------+ |
|  | Parent order slicing | TWAP/VWAP/IS scheduling              | |
|  | Adaptive algo logic  | Dark pool interaction                | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  SMART ORDER ROUTER                                              |
|  +------------------------------------------------------------+ |
|  | Venue selection | Fee optimization | Latency routing        | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  GATEWAY / FIX ENGINE                                            |
|  +------------------------------------------------------------+ |
|  | FIX session management | Message serialization               | |
|  | Sequence number tracking | Heartbeat / reconnect            | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  NETWORK LAYER                                                   |
|  +------------------------------------------------------------+ |
|  | Co-location | Cross-connects | Kernel bypass (DPDK/RDMA)   | |
|  +------------------------------------------------------------+ |
|       |                                                          |
|       v                                                          |
|  EXCHANGE MATCHING ENGINE                                        |
|  +------------------------------------------------------------+ |
|  | Price-time priority | Order book | Trade reporting          | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### Direct Market Access (DMA)

```
Traditional Routing:
  Client -> Broker OMS -> Broker Algo -> Broker SOR -> Exchange
  Latency: 5-50 ms

DMA (Direct Market Access):
  Client -> Broker Risk Gateway -> Exchange
  Latency: 0.5-5 ms (bypass broker algo layer)

Sponsored Access:
  Client -> Exchange  (broker risk checks are pre-configured)
  Latency: 0.05-0.5 ms (lowest possible without being the exchange)

Naked Access (BANNED by SEC Rule 15c3-5):
  Client -> Exchange  (no risk checks -- prohibited since 2010)
```

### Co-location

```
+------------------------------------------------------------------+
|                    EXCHANGE DATA CENTER                           |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------+     +------------------+                   |
|  | Exchange Matching |     | Market Data      |                   |
|  | Engine           |<--->| Dissemination    |                   |
|  +------------------+     +------------------+                   |
|         ^  |                      |                              |
|         |  |  < 1 microsecond     |                              |
|         |  v                      v                              |
|  +------------------+     +------------------+                   |
|  | Co-located       |     | Co-located       |                   |
|  | Trading Server   |     | Market Data      |                   |
|  | (YOUR server)    |<----| Feed Handler     |                   |
|  +------------------+     +------------------+                   |
|                                                                  |
|  Distance: ~10 meters of fiber                                   |
|  Latency:  ~1-10 microseconds                                    |
|  Cost:     $5,000-$25,000/month per rack                        |
|                                                                  |
+------------------------------------------------------------------+
|                                                                  |
|  vs. Remote Connection:                                          |
|  Distance: 10-100 km                                             |
|  Latency:  100-5,000 microseconds (100x-5000x slower)           |
|                                                                  |
+------------------------------------------------------------------+
```

### Risk Checks

```
+------------------------------------------------------------------+
|                    RISK CHECK LAYERS                              |
+------------------------------------------------------------------+
|                                                                  |
|  PRE-TRADE (before order sent)                                   |
|  +------------------------------------------------------------+ |
|  | Max order size:        Reject if qty > 50,000 shares       | |
|  | Max order value:       Reject if notional > $5,000,000     | |
|  | Price collar:          Reject if price > 5% from NBBO      | |
|  | Position limit:        Reject if would exceed max position | |
|  | Restricted list:       Reject if symbol is restricted      | |
|  | Fat finger:            Reject if qty > 10x normal          | |
|  | Rate limit:            Reject if > 100 orders/second       | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  REAL-TIME (during execution)                                    |
|  +------------------------------------------------------------+ |
|  | P&L limit:             Kill switch if daily loss > $X      | |
|  | Gross exposure:        Alert if gross > threshold          | |
|  | Net exposure:          Alert if net > threshold            | |
|  | Sector concentration:  Alert if > 30% in one sector       | |
|  | Correlation risk:      Alert if positions highly correlated| |
|  +------------------------------------------------------------+ |
|                                                                  |
|  POST-TRADE (after execution)                                    |
|  +------------------------------------------------------------+ |
|  | Fill reconciliation:   Match fills to orders               | |
|  | Position reconciliation: Match to custodian records        | |
|  | Trade reporting:       Report to regulators (TRF, ATS)    | |
|  | Cost analysis:         Measure execution quality (TCA)    | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

```python
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RiskLimits:
    max_order_qty: float = 50_000
    max_order_notional: float = 5_000_000
    max_price_deviation_pct: float = 5.0
    max_position_qty: float = 500_000
    max_daily_loss: float = 1_000_000
    max_orders_per_second: int = 100


@dataclass(frozen=True)
class RiskCheckResult:
    passed: bool
    rejection_reason: Optional[str] = None


def pre_trade_risk_check(
    order: Order,
    current_price: float,
    current_position: float,
    limits: RiskLimits,
) -> RiskCheckResult:
    """
    Run pre-trade risk checks on an order.
    Returns RiskCheckResult with pass/fail and reason.
    """
    # Max order quantity
    if order.quantity > limits.max_order_qty:
        return RiskCheckResult(
            passed=False,
            rejection_reason=(
                f"Order qty {order.quantity} exceeds max {limits.max_order_qty}"
            ),
        )

    # Max notional
    price = order.limit_price if order.limit_price else current_price
    notional = order.quantity * price
    if notional > limits.max_order_notional:
        return RiskCheckResult(
            passed=False,
            rejection_reason=(
                f"Notional ${notional:,.0f} exceeds max "
                f"${limits.max_order_notional:,.0f}"
            ),
        )

    # Price collar
    if order.limit_price:
        deviation = abs(order.limit_price - current_price) / current_price * 100
        if deviation > limits.max_price_deviation_pct:
            return RiskCheckResult(
                passed=False,
                rejection_reason=(
                    f"Price deviation {deviation:.1f}% exceeds max "
                    f"{limits.max_price_deviation_pct}%"
                ),
            )

    # Position limit
    new_position = current_position + (
        order.quantity if order.side == OrderSide.BUY else -order.quantity
    )
    if abs(new_position) > limits.max_position_qty:
        return RiskCheckResult(
            passed=False,
            rejection_reason=(
                f"New position {new_position} exceeds max "
                f"{limits.max_position_qty}"
            ),
        )

    return RiskCheckResult(passed=True)
```

---

## 10.9 Broker API Integration

### API Comparison

```
+------------------------------------------------------------------+
|                   BROKER API COMPARISON                           |
+------------------------------------------------------------------+
|                                                                  |
|  Feature           IB TWS API    Alpaca       Exchange Direct    |
|  -------           ----------    ------       ---------------    |
|  Asset classes     All           US Equity    Single exchange    |
|  Latency           10-50ms       50-200ms     < 1ms              |
|  Commission        Low           Zero         Per-trade fee      |
|  Data quality      Good          Basic        Best               |
|  Algo support      Limited       None         Full               |
|  Min account       $0-$25K       $0           $100K+             |
|  API complexity    High          Low          Very high          |
|  Paper trading     Yes           Yes          Sometimes          |
|  Rate limits       50 msg/s      200 req/min  Varies             |
|                                                                  |
+------------------------------------------------------------------+
```

### Interactive Brokers TWS API Example

```python
"""
Interactive Brokers TWS API integration example.
Requires: pip install ibapi
The IB Gateway or TWS must be running locally.
"""

from ibapi.client import EClient
from ibapi.wrapper import EWrapper
from ibapi.contract import Contract
from ibapi.order import Order as IBOrder
import threading
import time
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class IBFill:
    order_id: int
    symbol: str
    quantity: float
    price: float
    timestamp: str


class IBTradingClient(EWrapper, EClient):
    """Interactive Brokers trading client."""

    def __init__(self):
        EClient.__init__(self, self)
        self._next_order_id = 0
        self._fills: list = []
        self._connected = False

    def nextValidId(self, order_id: int):
        """Called on connection with next valid order ID."""
        self._next_order_id = order_id
        self._connected = True

    def orderStatus(
        self, order_id, status, filled, remaining,
        avg_fill_price, perm_id, parent_id, last_fill_price,
        client_id, why_held, mkt_cap_price,
    ):
        """Called when order status changes."""
        print(
            f"Order {order_id}: status={status}, "
            f"filled={filled}, remaining={remaining}, "
            f"avg_price={avg_fill_price}"
        )

    def execDetails(self, req_id, contract, execution):
        """Called when an execution occurs."""
        fill = IBFill(
            order_id=execution.orderId,
            symbol=contract.symbol,
            quantity=execution.shares,
            price=execution.price,
            timestamp=execution.time,
        )
        self._fills.append(fill)
        print(
            f"Fill: {fill.symbol} {fill.quantity} @ {fill.price}"
        )

    def error(self, req_id, error_code, error_string, advanced_order_reject=""):
        """Handle errors from TWS."""
        if error_code not in (2104, 2106, 2158):  # informational msgs
            print(f"Error {error_code}: {error_string}")

    def connect_and_run(
        self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 1,
    ):
        """Connect to TWS and start message processing thread."""
        self.connect(host, port, client_id)
        thread = threading.Thread(target=self.run, daemon=True)
        thread.start()
        # Wait for connection
        timeout = 10
        start = time.time()
        while not self._connected and time.time() - start < timeout:
            time.sleep(0.1)
        if not self._connected:
            raise ConnectionError("Failed to connect to TWS")

    def create_stock_contract(self, symbol: str) -> Contract:
        """Create an IB Contract object for a US stock."""
        contract = Contract()
        contract.symbol = symbol
        contract.secType = "STK"
        contract.exchange = "SMART"
        contract.currency = "USD"
        return contract

    def place_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
    ) -> int:
        """Place a limit order and return the order ID."""
        contract = self.create_stock_contract(symbol)

        order = IBOrder()
        order.action = side.upper()
        order.totalQuantity = quantity
        order.orderType = "LMT"
        order.lmtPrice = price
        order.tif = "DAY"

        order_id = self._next_order_id
        self._next_order_id += 1

        self.placeOrder(order_id, contract, order)
        return order_id

    def place_vwap_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        start_time: str,
        end_time: str,
        max_participation: float = 0.1,
    ) -> int:
        """
        Place an IB VWAP algo order.
        IB supports native algo orders through their API.
        """
        contract = self.create_stock_contract(symbol)

        order = IBOrder()
        order.action = side.upper()
        order.totalQuantity = quantity
        order.orderType = "LMT"
        order.lmtPrice = 0  # market
        order.algoStrategy = "Vwap"
        order.algoParams = [
            ("maxPctVol", str(max_participation)),
            ("startTime", start_time),
            ("endTime", end_time),
            ("allowPastEndTime", "1"),
            ("noTakeLiq", "0"),
        ]

        order_id = self._next_order_id
        self._next_order_id += 1

        self.placeOrder(order_id, contract, order)
        return order_id
```

### Alpaca API Example

```python
"""
Alpaca API integration example.
Requires: pip install alpaca-trade-api
"""

from dataclasses import dataclass
from typing import List, Optional
import os


@dataclass(frozen=True)
class AlpacaConfig:
    api_key: str
    secret_key: str
    base_url: str = "https://paper-api.alpaca.markets"  # paper trading


@dataclass(frozen=True)
class AlpacaOrder:
    order_id: str
    symbol: str
    side: str
    quantity: float
    order_type: str
    status: str
    filled_qty: float
    filled_avg_price: Optional[float]


def create_alpaca_config() -> AlpacaConfig:
    """Create Alpaca config from environment variables."""
    api_key = os.environ.get("ALPACA_API_KEY")
    secret_key = os.environ.get("ALPACA_SECRET_KEY")

    if not api_key or not secret_key:
        raise ValueError(
            "ALPACA_API_KEY and ALPACA_SECRET_KEY must be set"
        )

    return AlpacaConfig(api_key=api_key, secret_key=secret_key)


class AlpacaTradingClient:
    """Wrapper around Alpaca's trading API."""

    def __init__(self, config: AlpacaConfig):
        import alpaca_trade_api as tradeapi

        self._api = tradeapi.REST(
            key_id=config.api_key,
            secret_key=config.secret_key,
            base_url=config.base_url,
        )

    def submit_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        order_type: str = "market",
        limit_price: Optional[float] = None,
        time_in_force: str = "day",
    ) -> AlpacaOrder:
        """Submit an order to Alpaca."""
        try:
            params = {
                "symbol": symbol,
                "qty": qty,
                "side": side.lower(),
                "type": order_type,
                "time_in_force": time_in_force,
            }
            if limit_price is not None:
                params["limit_price"] = str(limit_price)

            result = self._api.submit_order(**params)

            return AlpacaOrder(
                order_id=result.id,
                symbol=result.symbol,
                side=result.side,
                quantity=float(result.qty),
                order_type=result.type,
                status=result.status,
                filled_qty=float(result.filled_qty or 0),
                filled_avg_price=(
                    float(result.filled_avg_price)
                    if result.filled_avg_price else None
                ),
            )
        except Exception as error:
            raise RuntimeError(f"Order submission failed: {error}") from error

    def get_order(self, order_id: str) -> AlpacaOrder:
        """Retrieve order status."""
        try:
            result = self._api.get_order(order_id)
            return AlpacaOrder(
                order_id=result.id,
                symbol=result.symbol,
                side=result.side,
                quantity=float(result.qty),
                order_type=result.type,
                status=result.status,
                filled_qty=float(result.filled_qty or 0),
                filled_avg_price=(
                    float(result.filled_avg_price)
                    if result.filled_avg_price else None
                ),
            )
        except Exception as error:
            raise RuntimeError(f"Failed to get order: {error}") from error

    def cancel_order(self, order_id: str) -> None:
        """Cancel an open order."""
        try:
            self._api.cancel_order(order_id)
        except Exception as error:
            raise RuntimeError(f"Cancel failed: {error}") from error

    def get_positions(self) -> List[dict]:
        """Get all open positions."""
        try:
            positions = self._api.list_positions()
            return [
                {
                    "symbol": p.symbol,
                    "qty": float(p.qty),
                    "side": p.side,
                    "avg_entry": float(p.avg_entry_price),
                    "market_value": float(p.market_value),
                    "unrealized_pl": float(p.unrealized_pl),
                }
                for p in positions
            ]
        except Exception as error:
            raise RuntimeError(f"Failed to get positions: {error}") from error
```

### Error Handling and Reconnection

```python
import time
import logging
from dataclasses import dataclass
from typing import Optional, Callable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReconnectConfig:
    max_retries: int = 10
    initial_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    backoff_multiplier: float = 2.0


def connect_with_retry(
    connect_fn: Callable[[], None],
    config: ReconnectConfig = ReconnectConfig(),
) -> bool:
    """
    Attempt to connect with exponential backoff.

    Args:
        connect_fn: Callable that establishes the connection.
                    Should raise an exception on failure.
        config: Reconnection configuration.

    Returns:
        True if connection succeeded.

    Raises:
        ConnectionError if all retries exhausted.
    """
    delay = config.initial_delay_seconds

    for attempt in range(1, config.max_retries + 1):
        try:
            connect_fn()
            logger.info(f"Connected on attempt {attempt}")
            return True
        except Exception as error:
            logger.warning(
                f"Connection attempt {attempt}/{config.max_retries} "
                f"failed: {error}"
            )
            if attempt == config.max_retries:
                raise ConnectionError(
                    f"Failed to connect after {config.max_retries} attempts"
                ) from error
            time.sleep(delay)
            delay = min(delay * config.backoff_multiplier, config.max_delay_seconds)

    return False
```

---

## 10.10 Post-Trade Analysis

### The Continuous Improvement Loop

```
+------------------------------------------------------------------+
|              POST-TRADE ANALYSIS LOOP                            |
+------------------------------------------------------------------+
|                                                                  |
|         +----------+                                             |
|         | Execute  |                                             |
|         | Trades   |                                             |
|         +----+-----+                                             |
|              |                                                   |
|              v                                                   |
|         +----------+      +------------+                         |
|         | Collect  |----->| Fill Data  |                         |
|         | Fills    |      | Database   |                         |
|         +----------+      +------+-----+                         |
|                                  |                               |
|                                  v                               |
|                           +------+------+                        |
|                           | TCA Engine  |                        |
|                           +------+------+                        |
|                                  |                               |
|              +-------------------+-------------------+           |
|              |                   |                   |           |
|              v                   v                   v           |
|       +------+------+    +------+------+    +-------+-----+     |
|       | Fill Quality|    | Venue       |    | Timing      |     |
|       | Analysis    |    | Analysis    |    | Analysis    |     |
|       +------+------+    +------+------+    +-------+-----+     |
|              |                   |                   |           |
|              +-------------------+-------------------+           |
|                                  |                               |
|                                  v                               |
|                           +------+------+                        |
|                           | Insights &  |                        |
|                           | Adjustments |                        |
|                           +------+------+                        |
|                                  |                               |
|                                  v                               |
|                           +------+------+                        |
|                           | Update Algo |                        |
|                           | Parameters  |-----> Back to Execute  |
|                           +-------------+                        |
|                                                                  |
+------------------------------------------------------------------+
```

### Fill Quality Analysis

```python
from dataclasses import dataclass
from typing import List, Dict
import numpy as np


@dataclass(frozen=True)
class FillQualityReport:
    order_id: str
    symbol: str
    side: str
    total_qty: float
    num_fills: int
    exec_vwap: float
    arrival_price: float
    market_vwap: float
    arrival_slippage_bps: float
    vwap_slippage_bps: float
    fill_rate: float             # what % of order was filled
    avg_fill_time_seconds: float
    venue_breakdown: Dict[str, float]


def analyze_fill_quality(
    fills: List[Fill],
    arrival_price: float,
    market_vwap: float,
    total_ordered_qty: float,
    side: str,
    order_id: str,
    symbol: str,
) -> FillQualityReport:
    """Analyze fill quality for a completed or partially filled order."""
    if not fills:
        raise ValueError("No fills to analyze")

    total_qty = sum(f.quantity for f in fills)
    exec_vwap = sum(f.quantity * f.price for f in fills) / total_qty

    direction = 1.0 if side == "BUY" else -1.0

    arrival_slip = (
        direction * (exec_vwap - arrival_price) / arrival_price * 10000
    )
    vwap_slip = (
        direction * (exec_vwap - market_vwap) / market_vwap * 10000
    )

    fill_rate = total_qty / total_ordered_qty if total_ordered_qty > 0 else 0

    timestamps = sorted(f.timestamp for f in fills)
    if len(timestamps) > 1:
        total_duration = (timestamps[-1] - timestamps[0]).total_seconds()
        avg_fill_time = total_duration / len(fills)
    else:
        avg_fill_time = 0.0

    # Venue breakdown
    venue_qty: Dict[str, float] = {}
    for f in fills:
        venue_qty[f.venue] = venue_qty.get(f.venue, 0) + f.quantity
    venue_pct = {
        venue: qty / total_qty for venue, qty in venue_qty.items()
    }

    return FillQualityReport(
        order_id=order_id,
        symbol=symbol,
        side=side,
        total_qty=total_qty,
        num_fills=len(fills),
        exec_vwap=exec_vwap,
        arrival_price=arrival_price,
        market_vwap=market_vwap,
        arrival_slippage_bps=round(arrival_slip, 2),
        vwap_slippage_bps=round(vwap_slip, 2),
        fill_rate=round(fill_rate, 4),
        avg_fill_time_seconds=round(avg_fill_time, 2),
        venue_breakdown=venue_pct,
    )
```

### Venue Analysis

```python
@dataclass(frozen=True)
class VenueStats:
    venue: str
    total_fills: int
    total_quantity: float
    avg_fill_size: float
    avg_slippage_bps: float
    fill_rate: float
    avg_latency_ms: float


def analyze_venues(
    all_fills: List[Fill],
    arrival_prices: Dict[str, float],  # order_id -> arrival_price
    order_sides: Dict[str, str],       # order_id -> side
) -> List[VenueStats]:
    """
    Aggregate fill quality statistics by venue.
    Useful for identifying which venues provide the best execution.
    """
    venue_fills: Dict[str, List[Fill]] = {}
    for f in all_fills:
        if f.venue not in venue_fills:
            venue_fills[f.venue] = []
        venue_fills[f.venue].append(f)

    results = []
    for venue, fills in venue_fills.items():
        total_qty = sum(f.quantity for f in fills)
        avg_size = total_qty / len(fills)

        # Compute average slippage for this venue
        # (simplified -- assumes we can look up arrival price)
        slippages = []
        for f in fills:
            if hasattr(f, 'order_id') and f.order_id in arrival_prices:
                arr_px = arrival_prices[f.order_id]
                side = order_sides.get(f.order_id, "BUY")
                direction = 1.0 if side == "BUY" else -1.0
                slip = direction * (f.price - arr_px) / arr_px * 10000
                slippages.append(slip)

        avg_slip = float(np.mean(slippages)) if slippages else 0.0

        results.append(VenueStats(
            venue=venue,
            total_fills=len(fills),
            total_quantity=total_qty,
            avg_fill_size=round(avg_size, 0),
            avg_slippage_bps=round(avg_slip, 2),
            fill_rate=1.0,  # placeholder
            avg_latency_ms=0.0,  # requires timestamp data
        ))

    return sorted(results, key=lambda v: v.avg_slippage_bps)
```

### Cost Attribution

```
+------------------------------------------------------------------+
|                 COST ATTRIBUTION EXAMPLE                         |
+------------------------------------------------------------------+
|                                                                  |
|  Order: BUY 50,000 AAPL using VWAP algo over 2 hours            |
|                                                                  |
|  Decision Price (arrival mid):     $150.000                      |
|  Final Execution VWAP:             $150.125                      |
|  Total Implementation Shortfall:   12.5 bps ($6,250)             |
|                                                                  |
|  Attribution:                                                    |
|  +----------------------------------------------------------+   |
|  | Component         | bps    | $        | % of total       |   |
|  |-------------------+--------+----------+------------------|   |
|  | Spread cost       |  3.3   | $1,650   |  26.4%           |   |
|  | Market impact     |  5.1   | $2,550   |  40.8%           |   |
|  | Timing / delay    |  2.0   | $1,000   |  16.0%           |   |
|  | Commissions       |  0.7   | $350     |   5.6%           |   |
|  | Venue fees        |  1.4   | $700     |  11.2%           |   |
|  |-------------------+--------+----------+------------------|   |
|  | TOTAL             | 12.5   | $6,250   | 100.0%           |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  Insights:                                                       |
|  - Market impact is the largest cost (41%) -- consider           |
|    extending execution horizon or reducing participation rate    |
|  - Timing cost (16%) suggests signal may be leaking or          |
|    the market is moving against us before we finish              |
|  - Venue fees could be reduced by routing more to               |
|    maker-rebate venues for passive child orders                  |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 10.11 Putting It All Together

### End-to-End Execution Pipeline

Here is the complete flow from signal to post-trade analysis:

```
+------------------------------------------------------------------+
|                  COMPLETE EXECUTION PIPELINE                     |
+------------------------------------------------------------------+
|                                                                  |
|  1. SIGNAL GENERATION                                            |
|     Alpha model says: "Buy 50,000 AAPL, urgency = MEDIUM"       |
|                          |                                       |
|  2. PRE-TRADE ANALYSIS   v                                       |
|     - Estimate market impact: sqrt model -> ~15 bps              |
|     - Expected spread cost: ~3 bps                               |
|     - Select algo: VWAP (matches medium urgency)                 |
|     - Set params: 2-hour horizon, 10% max participation          |
|                          |                                       |
|  3. RISK CHECK            v                                       |
|     - Position limit? OK (under $50M)                            |
|     - Order size? OK (under 50K shares)                          |
|     - Restricted? No                                             |
|     - Credit? OK                                                 |
|                          |                                       |
|  4. ALGO EXECUTION        v                                       |
|     - Parent order created in OMS                                |
|     - VWAP algo slices into 24 child orders (every 5 min)       |
|     - Each child routed via SOR                                  |
|     - SOR checks NYSE, NASDAQ, BATS, dark pools                 |
|     - Child orders sent via FIX protocol                        |
|                          |                                       |
|  5. FILL MANAGEMENT      v                                       |
|     - Monitor partial fills                                      |
|     - Adjust remaining schedule if falling behind                |
|     - Handle rejects and resend                                  |
|     - Real-time slippage monitoring                              |
|                          |                                       |
|  6. POST-TRADE            v                                       |
|     - Compute TCA: arrival slippage = 8.5 bps                   |
|     - Venue analysis: 40% NYSE, 30% NASDAQ, 20% BATS, 10% dark |
|     - Impact attribution: 5 bps impact, 3 bps spread, 0.5 fees  |
|     - Feed back to algo parameter optimization                   |
|                                                                  |
+------------------------------------------------------------------+
```

### Key Takeaways

```
+------------------------------------------------------------------+
|                   CHAPTER 10 SUMMARY                             |
+------------------------------------------------------------------+
|                                                                  |
|  1. Execution is NOT an afterthought -- it determines whether   |
|     your strategy makes or loses money in production.            |
|                                                                  |
|  2. Transaction costs have multiple components: explicit fees,   |
|     spread, impact, timing delay, and opportunity cost.          |
|                                                                  |
|  3. The OMS is the central system tracking all order state.      |
|     Every order follows a state machine from new to terminal.    |
|                                                                  |
|  4. Execution algorithms (TWAP, VWAP, IS) break large orders    |
|     into small pieces to manage market impact.                   |
|                                                                  |
|  5. Smart order routing navigates fragmented markets,            |
|     optimizing for price, fees, fill probability, and latency.  |
|                                                                  |
|  6. Market impact follows a square-root law: doubling order      |
|     size increases impact by ~41%, not 100%.                     |
|                                                                  |
|  7. The Almgren-Chriss framework provides the mathematical       |
|     foundation for optimal execution trajectories.               |
|                                                                  |
|  8. FIX protocol is the lingua franca of electronic trading.     |
|     Understanding its message format is essential.               |
|                                                                  |
|  9. Infrastructure matters: co-location, DMA, and risk checks   |
|     form the physical layer of execution.                        |
|                                                                  |
| 10. Post-trade TCA closes the loop: measure execution quality,  |
|     attribute costs, and continuously improve.                   |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Practice Problems

**Problem 1**: A fund needs to sell 200,000 shares of a stock with 2 million shares of average daily volume and 1.5% daily volatility. Using the square-root impact model with gamma = 0.5, estimate the expected market impact in basis points.

**Problem 2**: Design a TWAP algorithm that handles the following edge cases: (a) the market closes before the schedule ends, (b) a child order is rejected by the exchange, (c) the price moves more than 2% against you during execution.

**Problem 3**: You have the following venue quotes for a BUY order of 10,000 shares:

- NYSE: Ask $100.05, Size 3,000, Fee $0.003/share
- NASDAQ: Ask $100.04, Size 5,000, Fee $0.003/share
- BATS: Ask $100.05, Size 4,000, Rebate -$0.002/share
- Dark Pool: Ask $100.02, Size 2,000, Fee $0.001/share

Design the optimal routing strategy considering Reg NMS requirements, fees, and fill probability. How would spray routing differ from sequential routing here?

**Problem 4**: Implement the Almgren-Chriss model for selling 500,000 shares over 4 hours with the following parameters: daily volume = 10M shares, daily volatility = 2.5%, temporary impact = 0.0005, permanent impact = 0.00005. Compare trajectories for risk aversion lambda = {0, 1e-7, 1e-6, 1e-5}.

**Problem 5**: Decode the following FIX message and describe the order it represents:

```
8=FIX.4.4|9=148|35=D|49=ALGO_ENGINE|56=NYSE|34=1042|
52=20250115-15:45:00.123|11=VWAP-0042-17|55=MSFT|54=2|
38=3000|40=2|44=420.50|59=0|18=G|10=087|
```

---

## Further Reading

- **"Optimal Trading Strategies"** by Robert Kissell -- The standard reference on transaction cost analysis and optimal execution.
- **"Algorithmic Trading and DMA"** by Barry Johnson -- Comprehensive coverage of execution algorithms and market microstructure.
- **"Market Microstructure in Practice"** by Lehalle and Laruelle -- Modern treatment of execution and market structure.
- **"Optimal Execution of Portfolio Transactions"** by Almgren and Chriss (2000) -- The foundational paper on optimal execution.
- **FIX Protocol Specification** (fixtrading.org) -- Official FIX protocol documentation.
- **"The Market Microstructure Approach to Foreign Exchange"** by Lyons -- Impact models applied to FX markets.

---

_Next Chapter: [11-RISK-MANAGEMENT](11-RISK-MANAGEMENT.md) -- Portfolio risk measurement, VaR, stress testing, and risk budgeting._
