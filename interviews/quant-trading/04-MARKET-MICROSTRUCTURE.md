# Market Microstructure & Trading

## Why This Matters

Market microstructure is the study of how markets actually work -- how orders become trades, how prices are formed, and why bid-ask spreads exist. For quant traders and developers at firms like Jane Street, HRT, Citadel Securities, Virtu Financial, and Jump Trading, microstructure knowledge is not optional. It is the foundation of everything they do. Understanding order book dynamics, market making economics, and execution algorithms separates people who build models from people who make money.

---

## 1. Order Book Mechanics

### The Central Limit Order Book (CLOB)

Most modern electronic markets use a central limit order book as the matching mechanism. Buyers and sellers submit orders that are matched by the exchange.

```
+-----------------------------------------------------------------------+
|                     LIMIT ORDER BOOK (LOB)                            |
+-----------------------------------------------------------------------+
|                                                                       |
|  ASK SIDE (sellers)                                                   |
|  Price    | Quantity  | Orders       (lowest ask = best ask)          |
|  ---------|-----------|--------                                       |
|  $100.05  | 500       | 3 orders    ← Best Ask (inside ask)         |
|  $100.06  | 1200      | 7 orders                                     |
|  $100.07  | 800       | 4 orders                                     |
|  $100.10  | 3000      | 12 orders                                    |
|                                                                       |
|  ============= SPREAD = $0.02 ($100.05 - $100.03) =============      |
|                                                                       |
|  BID SIDE (buyers)                                                    |
|  Price    | Quantity  | Orders       (highest bid = best bid)         |
|  ---------|-----------|--------                                       |
|  $100.03  | 700       | 5 orders    ← Best Bid (inside bid)         |
|  $100.02  | 900       | 6 orders                                     |
|  $100.01  | 1500      | 8 orders                                     |
|  $100.00  | 5000      | 20 orders                                    |
|                                                                       |
|  Mid Price = ($100.03 + $100.05) / 2 = $100.04                       |
|  Spread = $100.05 - $100.03 = $0.02                                  |
|  NBBO = National Best Bid and Offer (across all exchanges)           |
+-----------------------------------------------------------------------+
```

### Order Types

| Order Type | Description | Risk | Use Case |
|-----------|-------------|------|----------|
| **Market Order** | Execute immediately at best available price | Slippage | Need immediate execution |
| **Limit Order** | Execute at specified price or better | May not fill | Want price certainty |
| **IOC** (Immediate or Cancel) | Fill what you can immediately, cancel rest | Partial fill | Sweep liquidity |
| **FOK** (Fill or Kill) | Fill entire order or nothing | Total miss | All-or-nothing |
| **GTC** (Good Till Cancel) | Stays on book until filled or canceled | Adverse selection | Patient execution |
| **Stop Order** | Becomes market order when price hits trigger | Gap risk | Stop-loss protection |
| **Stop-Limit** | Becomes limit order when price hits trigger | May not fill after trigger | Controlled stop-loss |
| **Pegged Order** | Price tracks a reference (e.g., midpoint) | Complexity | Passive midpoint execution |
| **Iceberg/Reserve** | Shows only a portion of total quantity | Detection risk | Hide large orders |
| **Midpoint Peg** | Pegged to midpoint of NBBO | Wider spread execution | Dark pool strategies |

### Matching Algorithms

**Price-Time Priority (FIFO)**: Most common. At each price level, orders are filled in the order they arrived.

```
Example: Buy limit orders at $100.03
  Order A: 200 shares (arrived 09:30:01.001)
  Order B: 300 shares (arrived 09:30:01.005)
  Order C: 200 shares (arrived 09:30:01.010)

Incoming sell market order for 400 shares:
  → Fills 200 from A (A fully filled)
  → Fills 200 from B (B partially filled, 100 remaining)
  → C gets nothing yet
```

**Pro-Rata Matching**: Used in some futures markets (e.g., CME Eurodollars). Orders at the same price are filled proportionally to their size.

```
Same scenario with pro-rata:
  Total size at $100.03: 200 + 300 + 200 = 700
  Incoming sell for 400:
  → A gets: 400 * (200/700) = 114 shares
  → B gets: 400 * (300/700) = 171 shares
  → C gets: 400 * (200/700) = 114 shares
  (Rounding handled by exchange rules)
```

**Implications for market making**: Under FIFO, speed matters enormously (race to be first in queue). Under pro-rata, size at a price level matters more. This drives completely different trading strategies.

---

## 2. Bid-Ask Spread

### Why the Spread Exists

The bid-ask spread is the market maker's compensation for providing liquidity. It exists because of three components:

```
+---------------------------------------------------------------+
|              COMPONENTS OF THE BID-ASK SPREAD                 |
+---------------------------------------------------------------+
|                                                               |
|  1. ADVERSE SELECTION COST (~50-80% of spread)               |
|     Some traders have better information than the market      |
|     maker. When informed traders buy, the "true" price is     |
|     likely above the ask. The market maker loses to them.     |
|     The spread compensates for these losses.                  |
|                                                               |
|  2. INVENTORY RISK (~10-30% of spread)                        |
|     Market makers accumulate unwanted inventory. Holding      |
|     inventory exposes them to price risk. The spread          |
|     compensates for this risk.                                |
|                                                               |
|  3. ORDER PROCESSING COST (~5-15% of spread)                  |
|     Fixed costs: technology, exchange fees, clearing,         |
|     compliance. These are relatively small for electronic     |
|     markets.                                                  |
|                                                               |
+---------------------------------------------------------------+
```

### Glosten-Milgrom Model (1985)

A sequential trade model where a market maker faces informed and uninformed traders.

**Setup**:
- True value V is either V_H (high) or V_L (low), each with probability 1/2
- Fraction μ of traders are informed (know V), fraction (1-μ) are uninformed
- Uninformed traders buy/sell with equal probability

**The bid and ask**:

```
Ask = E[V | someone wants to buy]
    = V_H * P(V=V_H | buy) + V_L * P(V=V_L | buy)

P(buy | V=V_H) = μ * 1 + (1-μ) * 1/2 = (1+μ)/2
P(buy | V=V_L) = μ * 0 + (1-μ) * 1/2 = (1-μ)/2

By Bayes:
P(V=V_H | buy) = [(1+μ)/2 * 1/2] / [(1+μ)/2 * 1/2 + (1-μ)/2 * 1/2]
               = (1+μ) / 2

Ask = V_H * (1+μ)/2 + V_L * (1-μ)/2
Bid = V_H * (1-μ)/2 + V_L * (1+μ)/2

Spread = Ask - Bid = μ * (V_H - V_L)
```

**Key insight**: The spread is proportional to:
1. μ: fraction of informed traders (more informed traders = wider spread)
2. V_H - V_L: size of information asymmetry (bigger news = wider spread)

### Kyle's Lambda (1985)

In Kyle's model, a single informed trader, noise traders, and a market maker interact in a batch auction.

**Key result**: The price impact of a trade of size Q is:

```
ΔP = λ * Q

where λ = σ_V / (2 * σ_U)

σ_V: standard deviation of the asset's fundamental value
σ_U: standard deviation of noise trading
```

Lambda measures the "permanent price impact per unit traded" -- a fundamental quantity in market microstructure.

**Implications**:
- Higher information asymmetry (σ_V) → higher λ → more price impact
- More noise trading (σ_U) → lower λ → less price impact (noise provides cover)
- The informed trader trades optimally: not too aggressively (to hide), not too slowly (to exploit information before it becomes stale)

---

## 3. Market Making

### How Market Makers Work

```
+-----------------------------------------------------------------------+
|                     MARKET MAKING CYCLE                               |
+-----------------------------------------------------------------------+
|                                                                       |
|  1. QUOTE: Post bid and ask orders on both sides of the book         |
|     Buy at $100.03, Sell at $100.05                                   |
|                                                                       |
|  2. FILL: Trades execute against your quotes                          |
|     Someone sells to you → you buy at $100.03                         |
|     Someone buys from you → you sell at $100.05                       |
|                                                                       |
|  3. EARN SPREAD: Profit = ask - bid = $0.02 per round trip           |
|                                                                       |
|  4. MANAGE INVENTORY: Skew quotes to manage position                  |
|     Long inventory → lower bid & ask to encourage selling to you      |
|     Short inventory → raise bid & ask to encourage buying from you    |
|                                                                       |
|  5. MANAGE RISK: Hedge residual exposure                              |
|     Delta-hedge option positions                                      |
|     Cross-asset hedging                                               |
|     Flatten end of day                                                |
|                                                                       |
|  REPEAT continuously, thousands of times per day                      |
|                                                                       |
+-----------------------------------------------------------------------+
```

### Avellaneda-Stoikov Model (2008)

The foundational quantitative model for optimal market making.

**Setup**: A market maker quotes bid price b and ask price a around a reference price S, maximizing utility of terminal wealth with risk aversion parameter gamma.

**Key result**: The optimal bid and ask quotes are:

```
Reservation price: r(s, q, t) = s - q * γ * σ^2 * (T - t)
  (Adjusted midpoint based on inventory q)

Optimal spread: δ* = γ * σ^2 * (T - t) + (2/γ) * ln(1 + γ/κ)
  (Spread around the reservation price)

Bid = r - δ*/2
Ask = r + δ*/2

Where:
  s:     current mid price
  q:     current inventory (positive = long)
  γ:     risk aversion parameter
  σ:     volatility of the asset
  T-t:   time remaining
  κ:     order arrival rate parameter
```

**Intuitions**:
1. **Inventory skew**: When q > 0 (long), the reservation price is below mid → bid and ask shift down → more likely to sell, reducing inventory
2. **Wider spread when**:
   - Higher volatility σ (more risky to provide liquidity)
   - Higher risk aversion γ
   - More time remaining T-t (longer exposure)
   - Lower order arrival rate κ (fewer opportunities to earn spread)

```python
import numpy as np

def avellaneda_stoikov_quotes(S, q, gamma, sigma, T_minus_t, kappa):
    """Compute optimal bid/ask quotes using Avellaneda-Stoikov model."""
    reservation_price = S - q * gamma * sigma**2 * T_minus_t
    optimal_spread = (gamma * sigma**2 * T_minus_t
                      + (2 / gamma) * np.log(1 + gamma / kappa))

    bid = reservation_price - optimal_spread / 2
    ask = reservation_price + optimal_spread / 2

    return {
        'reservation_price': reservation_price,
        'optimal_spread': optimal_spread,
        'bid': bid,
        'ask': ask
    }

# Example: stock at $100, long 50 shares, moderate risk aversion
params = {
    'S': 100.0,
    'q': 50,
    'gamma': 0.01,
    'sigma': 0.02,    # 2% per time unit
    'T_minus_t': 1.0,
    'kappa': 10.0
}

quotes = avellaneda_stoikov_quotes(**params)
for k, v in quotes.items():
    print(f"{k:>20s}: {v:.4f}")

# reservation_price: 99.9800  (below mid because we're long)
# optimal_spread:    0.0204
# bid:               99.9698
# ask:               99.9902
```

### Market Making P&L Components

```
+-----------------------------------------------------------------------+
|                  MARKET MAKING P&L ATTRIBUTION                        |
+-----------------------------------------------------------------------+
|                                                                       |
|  Gross Revenue:                                                       |
|    + Spread capture (bid/ask difference on round trips)               |
|    + Rebates from exchanges (maker-taker venues)                      |
|                                                                       |
|  Costs:                                                               |
|    - Adverse selection losses (trading against informed flow)          |
|    - Inventory carrying costs (mark-to-market losses on positions)    |
|    - Exchange fees (especially on taker venues)                       |
|    - Technology costs (co-location, hardware, bandwidth)              |
|    - Clearing and settlement fees                                     |
|    - Regulatory costs (capital requirements, compliance)              |
|                                                                       |
|  Net P&L = Spread capture + Rebates - Adverse selection               |
|            - Inventory costs - Fees                                    |
|                                                                       |
|  A successful market maker earns the spread MORE OFTEN than they      |
|  lose to informed flow. The spread must be wide enough to cover       |
|  adverse selection, but narrow enough to attract order flow.          |
+-----------------------------------------------------------------------+
```

---

## 4. Price Impact and Optimal Execution

### Temporary vs Permanent Price Impact

```
Price
  |
  |          *
  |        * | * *        permanent impact
  |      *   |     * * * * * * * * * * *
  |    *     |  ↑ temporary impact (decays)
  |  *       |
  | *        |
  +*---------+-----------------------------> Time
  ^          ^
  start of   end of
  execution  execution
```

**Temporary impact**: The immediate price displacement caused by trading, which decays over time as the order book refills. Models include:
- Linear: ΔP_temp = η * (dQ/dt)
- Square-root: ΔP_temp = η * sign(Q) * √|dQ/dt|

**Permanent impact**: The lasting shift in price due to the information content of the trade:
- Linear: ΔP_perm = γ * Q (total quantity traded)
- This is Kyle's lambda from the microstructure literature

### The Square-Root Law of Price Impact

Empirically, the price impact of executing a large order of size Q in a stock with daily volume V follows:

```
Price Impact ≈ σ * √(Q / V)

Where:
  σ: daily volatility
  Q: order size (shares)
  V: average daily volume (shares)
```

This has been observed across thousands of stocks, different time periods, and different markets. It is one of the most robust empirical facts in finance.

**Example**: A stock with σ = 2% and V = 1M shares/day. You want to trade 100,000 shares (10% of daily volume).
```
Impact ≈ 2% * √(0.1) ≈ 2% * 0.316 ≈ 0.63%
```

### Almgren-Chriss Optimal Execution (2000)

**Problem**: You must liquidate Q shares over time horizon T. How do you trade optimally to minimize the combination of market impact cost and timing risk?

**Model**:
- Permanent impact: linear in trade rate (g(v) = γ*v)
- Temporary impact: linear in trade rate (h(v) = η*v)
- Risk aversion: λ

**Optimal trading trajectory**:

```
x(t) = Q * sinh(κ(T-t)) / sinh(κT)

where κ = √(λσ^2 / η)

Trade rate:
n(t) = dx/dt = -Q * κ * cosh(κ(T-t)) / sinh(κT)
```

**Two extreme cases**:

```
λ → 0 (risk-neutral): TWAP execution
  Trade uniformly over [0, T]: n(t) = Q/T

λ → ∞ (extremely risk-averse): Immediate execution
  Trade everything at t=0: bear all market impact, no timing risk

Optimal: trade more aggressively at the start (front-loaded)
to reduce exposure to price uncertainty, but not so fast that
market impact costs dominate.
```

```
Trading Trajectory (x(t) = remaining shares)
Q |*
  | *
  |  *
  |   *
  |    *
  |     **
  |       **
  |         ***
  |            ****
  |                ******
0 +--------------------------> Time
  0                         T

Front-loaded: trade faster at start, slower at end
```

```python
import numpy as np

def almgren_chriss_trajectory(Q, T, sigma, eta, lambd, n_steps=100):
    """Compute optimal Almgren-Chriss execution trajectory."""
    kappa = np.sqrt(lambd * sigma**2 / eta)
    t = np.linspace(0, T, n_steps + 1)

    # Remaining inventory
    x = Q * np.sinh(kappa * (T - t)) / np.sinh(kappa * T)

    # Trade rate (shares per unit time)
    trade_rate = Q * kappa * np.cosh(kappa * (T - t)) / np.sinh(kappa * T)

    return t, x, trade_rate

# Example: liquidate 100,000 shares over 1 day
t, x, rate = almgren_chriss_trajectory(
    Q=100000, T=1.0, sigma=0.02, eta=0.0001, lambd=1e-6
)

print(f"Remaining at t=0.0: {x[0]:,.0f}")
print(f"Remaining at t=0.5: {x[50]:,.0f}")
print(f"Remaining at t=1.0: {x[-1]:,.0f}")
```

---

## 5. Market Data

### Data Hierarchy

```
+-----------------------------------------------------------------------+
|                      MARKET DATA LEVELS                               |
+-----------------------------------------------------------------------+
|                                                                       |
|  LEVEL 1 (Top of Book)                                                |
|  +-----------------------------------------------------------+       |
|  | Best Bid: $100.03 x 700  |  Best Ask: $100.05 x 500      |       |
|  | Last Trade: $100.04 x 100 at 09:31:02.547                 |       |
|  +-----------------------------------------------------------+       |
|  Sufficient for: basic trading, retail investors, simple algos        |
|                                                                       |
|  LEVEL 2 (Depth of Book)                                              |
|  +-----------------------------------------------------------+       |
|  | Bid Side          |  Ask Side                              |       |
|  | $100.03  700  (5) |  $100.05  500  (3)                    |       |
|  | $100.02  900  (6) |  $100.06  1200 (7)                    |       |
|  | $100.01  1500 (8) |  $100.07  800  (4)                    |       |
|  | $100.00  5000 (20)|  $100.10  3000 (12)                   |       |
|  +-----------------------------------------------------------+       |
|  Shows: price, aggregate size, number of orders at each level         |
|  Sufficient for: market making, execution algos, order flow analysis  |
|                                                                       |
|  LEVEL 3 (Full Order Book / Order-by-Order)                           |
|  +-----------------------------------------------------------+       |
|  | Every individual order: ID, side, price, size, timestamp   |       |
|  | Full add/modify/cancel message feed                        |       |
|  | Includes hidden/reserve order implications                 |       |
|  +-----------------------------------------------------------+       |
|  Only available to: exchange members, some proprietary feeds          |
|  Used for: HFT, queue position modeling, order flow toxicity          |
|                                                                       |
+-----------------------------------------------------------------------+
```

### NBBO (National Best Bid and Offer)

In US equity markets, the NBBO is the best bid and offer across ALL exchanges:

```
Exchange      Best Bid    Best Ask
NYSE          $100.02     $100.06
NASDAQ        $100.03     $100.05    ← Best ask
BATS/Cboe     $100.03     $100.05    ← Best ask
IEX           $100.01     $100.07
ARCA          $100.03     $100.04    ← Best ask

NBBO = Best Bid across all: $100.03 (NASDAQ, BATS, ARCA)
       Best Ask across all: $100.04 (ARCA)
```

The **SIP** (Securities Information Processor) consolidates quotes from all exchanges to produce the NBBO. Direct feeds from individual exchanges are faster but more expensive to process.

### Order Book Imbalance

A key predictive signal for short-term price movement:

```
Imbalance = (Bid_size - Ask_size) / (Bid_size + Ask_size)

Range: [-1, +1]
+1 = all bid (strong buy pressure → price likely to increase)
-1 = all ask (strong sell pressure → price likely to decrease)
 0 = balanced
```

**Weighted imbalance** across multiple levels:

```python
def weighted_book_imbalance(bids, asks, levels=5, decay=0.5):
    """
    Compute exponentially-weighted order book imbalance.

    bids: list of (price, size) tuples, best first
    asks: list of (price, size) tuples, best first
    """
    bid_weight = sum(
        size * (decay ** i) for i, (price, size) in enumerate(bids[:levels])
    )
    ask_weight = sum(
        size * (decay ** i) for i, (price, size) in enumerate(asks[:levels])
    )

    if bid_weight + ask_weight == 0:
        return 0.0

    return (bid_weight - ask_weight) / (bid_weight + ask_weight)
```

### Trade Classification: Lee-Ready Algorithm

Classify each trade as buyer-initiated or seller-initiated:

1. **Quote rule**: If trade price > midpoint → buyer-initiated. If < midpoint → seller-initiated.
2. **Tick rule** (when at midpoint): If price > last different price → buyer. If < → seller.

```python
def classify_trade_lee_ready(trade_price, bid, ask, prev_trade_price):
    """Classify trade as buy (+1) or sell (-1) using Lee-Ready."""
    mid = (bid + ask) / 2

    if trade_price > mid:
        return 1   # buyer-initiated
    elif trade_price < mid:
        return -1  # seller-initiated
    else:
        # At midpoint: use tick test
        if trade_price > prev_trade_price:
            return 1
        elif trade_price < prev_trade_price:
            return -1
        else:
            return 0  # indeterminate
```

---

## 6. Execution Algorithms

### TWAP (Time-Weighted Average Price)

Trade equal quantities at regular intervals over a time horizon.

```
Total quantity: Q shares over T time
Trade Q/n shares every T/n time interval

Example: Sell 100,000 shares over 2 hours (120 minutes)
  Trade 100,000/120 ≈ 833 shares every minute
  (In practice, add some randomization to avoid predictability)
```

**Pros**: Simple, low information leakage, easy to benchmark
**Cons**: Ignores volume patterns, suboptimal if volume is concentrated

### VWAP (Volume-Weighted Average Price)

Trade proportionally to historical volume profile.

```
Volume Profile (typical US equity):

% of daily vol
  |
15|    **
  |   *  *
  |  *    *
10| *      *
  |*        *                   *
  |          *                 * *
 5|           *      * *     *   *
  |            *   *    * *       *
  |             * *        *       *
  +----+----+----+----+----+----+-----> Time
  9:30 10:00 11:00 12:00 1:00 2:00 4:00

U-shaped: high at open/close, low around lunch
```

```python
def vwap_schedule(total_qty, volume_profile):
    """
    Generate VWAP execution schedule.

    volume_profile: list of expected volume in each bucket
    """
    total_volume = sum(volume_profile)
    schedule = [
        total_qty * (bucket_vol / total_volume)
        for bucket_vol in volume_profile
    ]
    return schedule

# Example: 5-minute buckets, simplified profile
profile = [15, 12, 10, 8, 6, 5, 5, 5, 6, 8, 10, 12, 15]  # 13 buckets
schedule = vwap_schedule(100000, profile)
for i, qty in enumerate(schedule):
    print(f"Bucket {i+1}: {qty:>8.0f} shares")
```

**Benchmark**: Performance is measured against the actual VWAP:
```
VWAP_actual = Σ(P_i * V_i) / Σ(V_i)

Execution shortfall = (Avg execution price - VWAP_actual) / VWAP_actual
```

### Implementation Shortfall (Arrival Price)

Minimize the difference between the decision price (when you decided to trade) and the actual average execution price.

```
IS = (Execution Price - Decision Price) / Decision Price

Decomposition:
IS = Delay Cost + Market Impact + Timing Cost + Opportunity Cost

Where:
  Delay cost:      Price drift between decision and first execution
  Market impact:   Price displacement caused by your trading
  Timing cost:     Price drift during execution (favorable or adverse)
  Opportunity cost: Cost of shares not executed (if you don't complete)
```

The Almgren-Chriss model (Section 4) directly optimizes implementation shortfall.

### POV (Percentage of Volume)

Trade as a fixed percentage of observed market volume.

```
Target participation rate: 10%
If market trades 5,000 shares in a minute, you trade 500 shares

Advantages:
  - Naturally adapts to market activity
  - Low market impact (you're a small fraction of volume)
  - Simple to explain to clients

Disadvantages:
  - Completion time is uncertain (depends on market volume)
  - Can take very long in illiquid markets
  - May miss favorable price levels
```

---

## 7. High-Frequency Trading

### What Is HFT?

```
+-----------------------------------------------------------------------+
|                      HFT CHARACTERISTICS                              |
+-----------------------------------------------------------------------+
|                                                                       |
|  1. SPEED: Sub-millisecond decision-making                            |
|     - Tick-to-trade: < 10 microseconds for top firms                  |
|     - Involves: co-location, FPGA/ASIC hardware, kernel bypass        |
|                                                                       |
|  2. VOLUME: Large number of orders, small profit per trade            |
|     - Typical: millions of orders per day                             |
|     - Profit: fractions of a cent per share                           |
|     - Win rate: 51-55% (thin edge, high volume)                       |
|                                                                       |
|  3. INVENTORY: Very short holding periods                              |
|     - Position held for seconds to minutes                            |
|     - End-of-day: flat or near-flat                                   |
|     - Intraday max position: carefully controlled                     |
|                                                                       |
|  4. TECHNOLOGY: The competitive moat                                   |
|     - Co-location at exchange data centers                            |
|     - Custom networking hardware (FPGA, kernel bypass)                |
|     - Proprietary exchange connectivity                               |
|     - Cross-connect to multiple venues                                |
|                                                                       |
+-----------------------------------------------------------------------+
```

### HFT Strategies

**1. Market Making (Electronic)**: Quote on both sides of the book, earn the spread, manage inventory aggressively. This is the bread-and-butter of firms like Citadel Securities, Virtu, and Jane Street.

**2. Statistical Arbitrage at Ultra-Short Horizons**: Identify mispricings across correlated instruments (ETF vs basket, ADR vs local, futures vs cash) and trade the convergence.

**3. Latency Arbitrage**: When prices update on one venue before another, the fastest trader can trade on the stale quotes. This is controversial and is what the IEX "speed bump" was designed to address.

```
Latency Arbitrage Example:

Time    NYSE Price   NASDAQ Price   True Price
t=0     $100.00      $100.00        $100.00
t=1μs   $100.00      $100.00        $100.02  (news arrives)
t=5μs   $100.02      $100.00        $100.02  (NYSE updates)
t=5μs   BUY ON NASDAQ at $100.00    ← Latency arbitrageur
t=10μs  $100.02      $100.02        $100.02  (NASDAQ updates)
t=10μs  SELL ON NASDAQ at $100.02   ← Profit: $0.02

Window of opportunity: ~5 microseconds
```

**4. Event-driven HFT**: Trade on macroeconomic data releases, earnings announcements, or central bank decisions. Requires ultra-fast parsing of news feeds and pre-computed response functions.

### Technology Stack

```
+-----------------------------------------------------------------------+
|                    HFT TECHNOLOGY STACK                                |
+-----------------------------------------------------------------------+
|                                                                       |
|  APPLICATION LAYER                                                    |
|  +----------------------------+                                       |
|  | Trading Strategy Logic     |  C++ / FPGA                          |
|  | Risk Management            |  Custom memory allocators             |
|  | Order Management System    |  Lock-free data structures            |
|  +----------------------------+                                       |
|              |                                                        |
|  NETWORKING LAYER                                                     |
|  +----------------------------+                                       |
|  | Kernel Bypass (DPDK/RDMA)  |  Avoid OS network stack              |
|  | Custom NIC drivers         |  Solarflare OpenOnload               |
|  | Hardware timestamping      |  Nanosecond precision                |
|  +----------------------------+                                       |
|              |                                                        |
|  HARDWARE LAYER                                                       |
|  +----------------------------+                                       |
|  | FPGA (for fastest path)    |  Xilinx Alveo, Intel Stratix        |
|  | Co-located servers         |  In exchange data center             |
|  | Cross-connects             |  Direct fiber to matching engine     |
|  | Microwave/laser links      |  Inter-exchange communication        |
|  +----------------------------+                                       |
|                                                                       |
|  Latency Budget:                                                      |
|    Network (co-lo → exchange):    ~1 μs                               |
|    Feed handler (parse market data): ~1-5 μs                          |
|    Strategy logic:                ~1-5 μs                             |
|    Order generation:              ~1 μs                               |
|    Network (order → exchange):    ~1 μs                               |
|    TOTAL tick-to-trade:           ~5-15 μs                            |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## 8. Regulation and Market Structure

### Reg NMS (Regulation National Market System) - US

Key provisions:
- **Order Protection Rule (Rule 611)**: Trades must be executed at the NBBO. You cannot "trade through" a better price displayed on another exchange.
- **Access Rule (Rule 610)**: Limits access fees to $0.003/share. This creates the "rebate" system.
- **Sub-Penny Rule (Rule 612)**: Quotes cannot be in increments less than $0.01 for stocks priced above $1.00.

### Maker-Taker vs Inverted Fee Schedules

```
MAKER-TAKER (most exchanges: NYSE, NASDAQ):
  You ADD liquidity (limit order) → receive REBATE (~$0.002/share)
  You TAKE liquidity (market order) → pay FEE (~$0.003/share)

  Exchange profit: fee - rebate = ~$0.001/share

INVERTED (e.g., BATS BYX, EDGA):
  You ADD liquidity → pay FEE (~$0.001/share)
  You TAKE liquidity → receive REBATE (~$0.0002/share)

  Attracts aggressive flow from firms that want cheap taker fees.
```

**Impact on market making**: Market makers on maker-taker exchanges earn the spread PLUS the rebate. On inverted venues, they earn the spread minus the fee. This means the effective spread can differ by ~$0.003/share across venues.

### Payment for Order Flow (PFOF)

Wholesale market makers (Citadel Securities, Virtu) pay retail brokers (Robinhood, Schwab) for the right to execute their customers' orders.

```
Retail Customer → Robinhood → Citadel Securities
                    ↑                    |
                    |  PFOF payment       |  Execute at NBBO or better
                    +----$0.002/share----+  (price improvement)

Why this works:
  - Retail flow is uninformed (no adverse selection)
  - Citadel can safely earn the spread with minimal risk
  - They pass some savings back as PFOF
  - Retail customers often get better prices than on exchanges
```

### MiFID II (EU - Markets in Financial Instruments Directive)

Key provisions relevant to quant trading:
- **Best execution** requirements (more stringent than US)
- **Market making obligations** (systematic internalizers must quote)
- **Dark pool caps** (limits on dark trading volumes)
- **Transaction reporting** to regulators
- **Unbundling of research** from execution (no free research from brokers)

---

## 9. Exchange Architecture

### Trade Lifecycle

```
+-----------------------------------------------------------------------+
|                       TRADE LIFECYCLE                                 |
+-----------------------------------------------------------------------+
|                                                                       |
|  1. ORDER CREATION                                                    |
|     Trader decides to buy → OMS creates order message                 |
|                    |                                                  |
|  2. ORDER ROUTING                                                     |
|     Smart Order Router selects venue(s) based on:                     |
|     - NBBO (must respect Reg NMS)                                     |
|     - Fee schedule (maker/taker considerations)                       |
|     - Latency to each venue                                          |
|     - Historical fill rates                                           |
|                    |                                                  |
|  3. ORDER SUBMISSION                                                  |
|     Order sent via FIX protocol or binary protocol to exchange        |
|                    |                                                  |
|  4. ORDER ACKNOWLEDGMENT                                              |
|     Exchange confirms receipt (order is now "live" in the book)       |
|                    |                                                  |
|  5. MATCHING                                                          |
|     Exchange matching engine matches incoming orders against          |
|     resting orders using price-time priority                          |
|                    |                                                  |
|  6. EXECUTION REPORT                                                  |
|     Both parties receive fill confirmations                           |
|                    |                                                  |
|  7. CLEARING                                                          |
|     NSCC (National Securities Clearing Corporation) becomes           |
|     counterparty to both sides (novation)                             |
|                    |                                                  |
|  8. SETTLEMENT (T+1 in US since 2024)                                 |
|     DTC (Depository Trust Company) transfers                          |
|     securities and cash between accounts                              |
|                                                                       |
+-----------------------------------------------------------------------+
```

### FIX Protocol

The Financial Information eXchange (FIX) protocol is the standard for electronic trading communication.

```
FIX Message Example (New Order Single):
8=FIX.4.4|9=176|35=D|49=TRADER1|56=EXCHANGE|
34=12|52=20260304-14:30:00.000|
11=ORDER123|          (ClOrdID - unique order identifier)
21=1|                 (HandlInst - automated)
55=AAPL|              (Symbol)
54=1|                 (Side: 1=Buy)
38=1000|              (OrderQty: 1000 shares)
40=2|                 (OrdType: 2=Limit)
44=175.50|            (Price)
59=0|                 (TimeInForce: 0=Day)
10=089|

Key FIX Tags:
  35 = MsgType (D=New Order, G=Replace, F=Cancel, 8=Execution Report)
  55 = Symbol
  54 = Side (1=Buy, 2=Sell, 5=Sell Short)
  38 = OrderQty
  40 = OrdType (1=Market, 2=Limit, 3=Stop)
  44 = Price
  59 = TimeInForce (0=Day, 1=GTC, 3=IOC, 4=FOK)
```

For HFT, binary protocols (e.g., OUCH, ITCH, PILLAR) replace FIX for lower latency (FIX is text-based and requires parsing).

### Matching Engine Architecture

```
+-------------------------------------------------------+
|              EXCHANGE MATCHING ENGINE                  |
+-------------------------------------------------------+
|                                                       |
|  MARKET DATA        ORDER GATEWAY        DROP COPY    |
|  (multicast out)    (TCP in)             (TCP out)    |
|       ↑                  |                    ↑       |
|       |                  v                    |       |
|  +------------------------------------------+        |
|  |          SEQUENCER / ARBITER              |        |
|  |  (Serializes all incoming messages into   |        |
|  |   a single deterministic sequence)         |        |
|  +------------------------------------------+        |
|                      |                                |
|                      v                                |
|  +------------------------------------------+        |
|  |          MATCHING CORE                    |        |
|  |  For each symbol:                         |        |
|  |    - Maintain bid/ask price levels        |        |
|  |    - FIFO queue at each price level       |        |
|  |    - Match incoming orders against book   |        |
|  |    - Generate execution reports           |        |
|  |    - Generate market data updates         |        |
|  +------------------------------------------+        |
|                                                       |
|  Performance:                                         |
|    - Matching latency: < 10 microseconds              |
|    - Throughput: millions of messages/second           |
|    - Deterministic: same input → same output          |
|    - Fault-tolerant: hot standby replicas             |
|                                                       |
+-------------------------------------------------------+
```

---

## 10. Interview Problems

### Problem 1: Market Making Game

**Question**: I am going to sell you an object. Its true value V is uniformly distributed on [0, 100]. I know V, you do not. You can offer me a price P. If P >= V, I accept and you receive the object (worth V to you, but you paid P, so your profit is V - P). If P < V, I reject and you get nothing. What price should you offer to maximize expected profit?

**Solution**:

If you offer P, the seller accepts when V <= P. Given acceptance:
```
E[profit | accept] = E[V - P | V <= P]
                   = E[V | V <= P] - P
                   = P/2 - P
                   = -P/2
```

Your expected profit is:
```
E[profit] = P(accept) * E[profit | accept] + P(reject) * 0
          = (P/100) * (-P/2)
          = -P^2 / 200
```

This is ALWAYS negative (or zero at P = 0). The optimal strategy is to offer P = 0 (or not play).

**This is the "Lemons Problem" / adverse selection**: When you win, you systematically overpay because you only get accepted when the object is worth less than your offer. This is exactly why market makers face adverse selection.

### Problem 2: Spread Setting

**Question**: You are market making a stock. You believe the true value is $50 with standard deviation $2. 70% of trades come from noise traders (buy/sell with equal probability), 30% from informed traders who know the true value and trade in the correct direction. What spread should you set to break even?

**Solution**:

Let the bid = 50 - s/2 and ask = 50 + s/2 where s is the spread.

When a buy order arrives:
```
P(informed | buy) = 0.3 * P(buy | informed) / P(buy)
```

For an informed buyer, the true value > ask = 50 + s/2.
Expected loss against informed buyer: E[V - ask | V > ask] = ...

Simpler approach -- expected P&L per trade:

```
Against noise buyer:  Profit = s/2 (buy at mid + s/2, true value is mid)
Against noise seller: Profit = s/2
Against informed buyer:  Loss = E[V | V > ask] - ask ≈ σ - s/2 for small s
Against informed seller: Loss = bid - E[V | V < bid] ≈ σ - s/2

E[P&L per trade] = 0.7 * s/2 + 0.3 * (s/2 - E[|V - 50| | informed trades])

For normal V with σ = 2:
E[|V - 50|] = σ * √(2/π) ≈ 2 * 0.798 = 1.596

E[P&L] = 0.7 * s/2 - 0.3 * (1.596 - s/2) = 0

0.35s - 0.479 + 0.15s = 0
0.5s = 0.479
s ≈ $0.96
```

The break-even spread is approximately $0.96, which is about half the standard deviation scaled by the fraction of informed traders.

### Problem 3: Queue Position Value

**Question**: You are 5th in queue at the best bid ($100.00) with 100 shares. The total bid size is 1000 shares (including yours). The stock has a 50% probability of the next trade being at the bid (fill) and 50% at the ask (no fill for you). If filled, the fair value moves to $99.98. If the trade is at the ask, fair value moves to $100.02. What is the expected value of your queue position?

**Solution**:

```
Case 1: Trade at bid (50%)
  Probability you get filled depends on your queue position.
  You are 5th out of 10 orders (1000 shares, assume equal 100-share orders).
  If the trade is 100 shares, only the first order gets filled.
  If the trade is 500+ shares, you get filled.

  Let's simplify: assume the trade size is uniformly distributed
  from 100 to 1000. Your position fills if trade size >= 500.
  P(fill | trade at bid) = 600/1000 = 0.6 (... this depends on assumptions)

  Simpler: assume you get filled if a trade happens at bid.
  (which is the typical interview simplification)

  If filled at $100.00, fair value goes to $99.98.
  Your profit: $100.00 - $99.98 = $0.02 per share = $2.00

Case 2: Trade at ask (50%)
  No fill. Fair value moves to $100.02.
  Your bid is now $0.02 below fair value.
  If you cancel, no additional P&L.
  If you stay, you'll eventually get filled at $100.00 when fair value
  might be even higher (adverse selection).
  Value ≈ $0 (you'll likely cancel and resubmit)

E[value] = 0.5 * $2.00 + 0.5 * $0.00 = $1.00

For 100 shares: $1.00 total, or $0.01 per share edge.
```

This type of calculation is at the heart of market making P&L estimation.

### Problem 4: VWAP Strategy

**Question**: You need to buy 100,000 shares of a stock that trades an average of 500,000 shares per day. The historical volume profile is: 20% in first hour, 15% in second hour, 10% in each of the next three hours, 15% in sixth hour, 20% in last hour. Design a VWAP strategy and estimate your market impact.

**Solution**:

```
VWAP Schedule:
  Hour 1 (9:30-10:30):  100,000 * 0.20 = 20,000 shares
  Hour 2 (10:30-11:30): 100,000 * 0.15 = 15,000 shares
  Hour 3 (11:30-12:30): 100,000 * 0.10 = 10,000 shares
  Hour 4 (12:30-1:30):  100,000 * 0.10 = 10,000 shares
  Hour 5 (1:30-2:30):   100,000 * 0.10 = 10,000 shares
  Hour 6 (2:30-3:30):   100,000 * 0.15 = 15,000 shares
  Hour 7 (3:30-4:00):   100,000 * 0.20 = 20,000 shares

Participation rate: 100,000 / 500,000 = 20%

This is a high participation rate. Expected market impact:
  Using square-root law with σ_daily = 2%:
  Impact ≈ σ * √(Q/V) = 2% * √(0.2) = 2% * 0.447 ≈ 0.89%

  For a $50 stock: impact ≈ $0.45 per share

Refinements:
  - Randomize order sizes within each bucket (+/- 20%)
  - Use limit orders, not market orders
  - Add minimum/maximum participation rate constraints
  - Monitor real-time volume vs historical to adapt
  - Place passive orders (earn rebate) and cross spread only when behind
```

### Problem 5: Order Book Reconstruction

**Question**: Given the following sequence of order book events, reconstruct the book state after each event and identify all trades.

```
Event 1: ADD BUY  100 shares @ $50.00 (Order A)
Event 2: ADD SELL 200 shares @ $50.05 (Order B)
Event 3: ADD BUY  150 shares @ $50.02 (Order C)
Event 4: ADD SELL 100 shares @ $49.98 (Order D)  ← crosses the book!
Event 5: ADD BUY  300 shares @ $50.06 (Order E)  ← crosses the book!
```

**Solution**:

```
After Event 1:
  Bids: $50.00 x 100 (A)     Asks: (empty)

After Event 2:
  Bids: $50.00 x 100 (A)     Asks: $50.05 x 200 (B)

After Event 3:
  Bids: $50.02 x 150 (C)     Asks: $50.05 x 200 (B)
        $50.00 x 100 (A)

After Event 4: TRADE! Sell @ $49.98 crosses best bid of $50.02
  Order D sells to Order C at $50.02 (price improvement for seller)
  Trade: 100 shares @ $50.02
  Order C has 50 shares remaining

  Bids: $50.02 x 50 (C, partial)   Asks: $50.05 x 200 (B)
        $50.00 x 100 (A)

After Event 5: TRADE! Buy @ $50.06 crosses best ask of $50.05
  Order E buys from Order B at $50.05
  Trade: 200 shares @ $50.05
  Order E has 100 shares remaining at $50.06

  Bids: $50.06 x 100 (E, remainder) Asks: (empty, B fully filled)
        $50.02 x 50 (C)
        $50.00 x 100 (A)

  Wait -- since no asks remain, E's remaining 100 shares rest as a bid.
  But E was a buy limit at $50.06, so it joins the bid side.
```

### Problem 6: Information Leakage

**Question**: You are executing a large buy order over the course of a day. You notice the stock price is rising faster than expected. What might be happening and how would you respond?

**Solution**:

```
Possible causes:
1. Information leakage: Your order flow is being detected by other market
   participants (HFTs, other algorithms) who are front-running you.
   Evidence: abnormal volume, unusual order book changes ahead of your trades.

2. Momentum/trend: The stock is rising for fundamental reasons unrelated
   to your order.
   Evidence: sector/market also rising, news catalyst.

3. Co-incidence: Multiple buyers happen to be active simultaneously.

Response strategies:
1. REDUCE participation rate: Trade less aggressively to reduce footprint.
2. VARY venues: Spread across dark pools and lit exchanges.
3. RANDOMIZE: Add noise to order sizes and timing.
4. USE DARK POOLS: Midpoint pegs on dark venues reveal less information.
5. PAUSE: If impact is severe, pause and resume later.
6. ACCELERATE: If you believe the price will continue rising (momentum),
   it may be better to complete quickly and accept the impact.
7. ANALYZE: Compare your execution against arrival price and volume.
   If shortfall is excessive, switch algorithms.

The tradeoff: slower execution reduces impact but increases timing risk.
Faster execution increases impact but captures current price level.
```

### Problem 7: Latency and P&L

**Question**: You are a market maker with a 10-microsecond tick-to-trade latency. A competitor has 5 microseconds. On average, how much P&L do you lose per day to this latency disadvantage, assuming you both attempt to trade on the same signals 1000 times per day, the average profit per opportunity is $50, and whoever is faster captures the entire opportunity?

**Solution**:

```
If the competitor is always 5μs faster, they capture every
contested opportunity. But not all opportunities are contested.

Assume:
  - 1000 opportunities per day
  - Both of you identify the same opportunity: X% of the time
  - When contested, faster firm wins 100%

If 30% of opportunities are contested:
  Opportunities lost = 1000 * 0.30 = 300
  Revenue lost = 300 * $50 = $15,000 per day

If 50% contested:
  Revenue lost = 500 * $50 = $25,000 per day

Annual impact (250 days): $3.75M - $6.25M

This justifies spending millions on FPGA development,
microwave links, and co-location upgrades.

Note: In practice, the relationship is not binary.
The slower firm may still win some races due to jitter,
different signal timing, or processing variance.
```

### Problem 8: Dark Pool Strategy

**Question**: You have a 500,000-share order to execute in a stock that trades 2M shares per day. You want to minimize information leakage. Design a multi-venue execution strategy.

**Solution**:

```
Strategy: Split across lit and dark venues

Total: 500,000 shares (25% of daily volume -- very large)
Time horizon: Full day

Allocation:
  Dark Pools (40% = 200,000 shares):
    - Midpoint pegs on major dark pools (Crossfinder, Sigma X, POSIT)
    - No price footprint (trade at midpoint)
    - Risk: slow fill rate, information leakage via dark pool analytics

  Lit Exchanges (40% = 200,000 shares):
    - VWAP algorithm across NYSE, NASDAQ, BATS
    - Participation rate: ~5% (200K / 2M * 0.6 lit volume / 6.5 hours)
    - Use passive limit orders with rebate capture
    - Cancel and re-price frequently

  Block Crossing (20% = 100,000 shares):
    - Advertise (anonymously) on block crossing networks
    - Seek natural counterparties
    - Periodic block trades at VWAP or negotiated price

Anti-gaming measures:
  1. Never show full order size on any single venue
  2. Randomize order sizes: 100-500 share clips
  3. Use anti-gaming dark pools (IEX, IntelligentCross)
  4. Monitor for unusual activity (stepping ahead, spoofing patterns)
  5. Vary the time between orders (avoid predictable patterns)
  6. Use multiple broker algorithms to diversify execution fingerprint

Expected impact: σ * √(Q/V) = 2% * √(0.25) = 1.0%
Target: execute within 0.5-0.7% of arrival price through careful execution
```

---

## Appendix: Key Formulas and Concepts

```
ORDER BOOK
  Spread = Best Ask - Best Bid
  Mid Price = (Best Bid + Best Ask) / 2
  Imbalance = (Bid Size - Ask Size) / (Bid Size + Ask Size)

MARKET MAKING
  Avellaneda-Stoikov:
    Reservation price = S - q*γ*σ^2*(T-t)
    Optimal spread = γ*σ^2*(T-t) + (2/γ)*ln(1+γ/κ)

PRICE IMPACT
  Kyle's Lambda: ΔP = λ * Q
  Square-Root Law: Impact ≈ σ * √(Q/V)
  Almgren-Chriss: x(t) = Q * sinh(κ(T-t)) / sinh(κT)

SPREAD DECOMPOSITION
  Spread = Adverse Selection + Inventory Risk + Order Processing

EXECUTION BENCHMARKS
  VWAP = Σ(P_i * V_i) / Σ(V_i)
  Implementation Shortfall = Execution Price - Decision Price
  Participation Rate = Your Volume / Market Volume

INFORMATION CONTENT
  Glosten-Milgrom: Spread = μ * (V_H - V_L)
  Trade Sign: +1 (buyer-initiated), -1 (seller-initiated)

FEES
  Maker-Taker: Add liquidity → rebate; Take liquidity → fee
  Net fee ≈ $0.001/share for maker-taker exchanges
  All-in cost = spread/2 + market impact + fees
```
